import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuthUser } from '../../auth/decorators/user.decorator';
import {
  compressActivityStream,
  uncompressActivityStream,
} from '../../core/helpers/activity-stream';
import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue/queue.service';
import {
  cancelPath,
  readBackfill,
  saveBackfill,
} from './manual-garmin-backfill-state';
import {
  BackfillWorkerMessage,
  BackfillWorkerResult,
} from './manual-garmin-backfill-worker';
import { loginGarmin } from './manual-garmin-login';
import { manualGarminPayload } from './manual-garmin.schema';
import { ManualGarminService } from './manual-garmin.service';

// Load the installed ESM SDK through Node 22 rather than Jest's CJS transformer.
jest.mock('@garmin/fitsdk', () =>
  process.getBuiltinModule('module').createRequire(__filename)(
    '@garmin/fitsdk',
  ),
);

jest.mock('./manual-garmin-login', () => ({ loginGarmin: jest.fn() }));

const payload = {
  ok: true,
  warnings: [],
  activities: [
    {
      id: '456',
      name: 'Trail',
      startDate: '2026-09-15T08:00:00Z',
      endDate: '2026-09-15T09:00:00Z',
      sport: 'TRAIL_RUNNING',
      distance: 10000,
      elevationGain: 400,
      movingTime: 3600,
      averageSpeed: 2.7,
      maxSpeed: 4,
      averageHeartrate: 130,
      maxHeartrate: 155,
    },
  ],
  metrics: [{ date: '2026-09-15', type: 'HR_REST', value: 55 }],
};
describe('manual Garmin history payload limits', () => {
  it('accepts up to five pages of activity summaries', () => {
    const activities = Array.from({ length: 500 }, (_, id) => ({
      ...payload.activities[0],
      id: String(id),
    }));
    expect(
      manualGarminPayload.parse({ ...payload, activities }).activities,
    ).toHaveLength(500);
    expect(
      manualGarminPayload.safeParse({
        ...payload,
        activities: [...activities, activities[0]],
      }).success,
    ).toBe(false);
  });
});

class TestService extends ManualGarminService {
  fetch = jest.fn().mockResolvedValue(payload);
  parse = jest.fn();
  worker = jest.fn();
  completion = Promise.resolve();
  protected launchBackfill(task: () => Promise<void>) {
    this.completion = task();
  }
  protected runBackfillWorker(
    directory: string,
    ids: string[],
    runId: string,
    onMessage: (message: BackfillWorkerMessage) => Promise<boolean>,
    signal: AbortSignal,
  ): Promise<BackfillWorkerResult> {
    return this.worker(directory, ids, runId, onMessage, signal);
  }
  protected parseFit() {
    return this.parse();
  }
  protected fetchPayload(directory: string) {
    return this.fetch(directory);
  }
}

describe('manual Garmin import', () => {
  let directory: string;
  let service: TestService;
  let config: ConfigService;
  const user = {
    roles: ['ATHLETE' as const],
    userId: 1,
    email: 'athlete@example.test',
    athlete: { athleteId: 2 },
  } as AuthUser;
  const tx = {
    $queryRaw: jest.fn(),
    eventActivity: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    activitySegment: { createMany: jest.fn() },
    event: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ eventId: 88 }),
    },
    athleteMetric: { upsert: jest.fn() },
  };
  const prisma = {
    athlete: { findUnique: jest.fn() },
    coachAthlete: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const queue = { addActivityProcessingJob: jest.fn() };
  const emitter = { emit: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    tx.event.create.mockResolvedValue({ eventId: 88 });
    directory = await mkdtemp(join(tmpdir(), 'oa-garmin-test-'));
    await mkdir(join(directory, '.private'));
    await writeFile(
      join(directory, '.private/connection.json'),
      JSON.stringify({
        athleteId: 2,
        garminUserProfileId: '123',
        timezone: 'Europe/Madrid',
      }),
    );
    prisma.athlete.findUnique.mockResolvedValue({ athleteId: 2, userId: 1 });
    prisma.coachAthlete.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    tx.eventActivity.findMany.mockResolvedValue([]);
    config = new ConfigService({
      SELF_HOSTED: true,
      ENABLE_MANUAL_GARMIN_SYNC: true,
      GARMIN_UNOFFICIAL_DIRECTORY: directory,
    });
    service = new TestService(
      prisma as unknown as PrismaService,
      config,
      queue as unknown as QueueService,
      emitter as unknown as EventEmitter2,
    );
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([false, undefined])(
    'blocks every manual operation when the installation flag is %s',
    async (enabled) => {
      config.set('ENABLE_MANUAL_GARMIN_SYNC', enabled);
      expect(await service.status(user)).toEqual({ enabled: false });
      await expect(service.sync(user)).rejects.toThrow();
      await expect(service.backfill(user)).rejects.toThrow();
      await expect(service.stopBackfill(user)).rejects.toThrow();
      await expect(
        service.connect(user, {
          email: 'athlete@example.test',
          password: 'synthetic-password',
          timezone: 'Europe/Madrid',
        }),
      ).rejects.toThrow();
      expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
      expect(prisma.coachAthlete.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(service.fetch).not.toHaveBeenCalled();
      expect(service.worker).not.toHaveBeenCalled();
      expect(service.parse).not.toHaveBeenCalled();
      expect(loginGarmin).not.toHaveBeenCalled();
      expect(queue.addActivityProcessingJob).not.toHaveBeenCalled();
    },
  );

  it('status does not contact Garmin; unrelated users cannot sync', async () => {
    expect((await service.status(user)).enabled).toBe(true);
    expect(service.fetch).not.toHaveBeenCalled();
    await expect(service.sync({ ...user, userId: 99 })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('linked coach can sync but cannot configure athlete credentials', async () => {
    const coach: AuthUser = {
      ...user,
      userId: 9,
      roles: ['COACH'],
      athlete: { athleteId: 9 },
    };
    prisma.coachAthlete.findFirst.mockResolvedValue({
      athleteId: 2,
      userId: 9,
    });
    const status = await service.status(coach, 2);
    expect(status).toMatchObject({
      enabled: true,
      connected: true,
      canConfigure: false,
    });
    await service.sync(coach, 2);
    expect(service.fetch).toHaveBeenCalledTimes(1);
    await expect(
      service.connect(coach, {
        email: 'owner@example.test',
        password: 'not-real',
        timezone: 'Europe/Madrid',
      }),
    ).rejects.toThrow();
    expect(loginGarmin).not.toHaveBeenCalled();
  });
  it('only owner may authenticate; status exposes no credentials', async () => {
    (loginGarmin as jest.Mock).mockResolvedValue({ mfaRequired: true });
    expect(
      await service.connect(user, {
        email: 'owner@example.test',
        password: 'not-real',
        timezone: 'Europe/Madrid',
      }),
    ).toEqual({ mfaRequired: true });
    expect(loginGarmin).toHaveBeenCalledWith(
      1,
      directory,
      join(directory, 'accounts', '2', '.private'),
      expect.objectContaining({ athleteId: 2 }),
    );
    await expect(
      service.connect(
        { ...user, userId: 99 },
        { timezone: 'Europe/Madrid', code: '123456' },
      ),
    ).rejects.toThrow();
    expect(JSON.stringify(await service.status(user))).not.toContain(
      'not-real',
    );
  });
  it('imports atomically into the bound athlete and enforces cooldown', async () => {
    const result = await service.sync(user);
    expect(result.result).toEqual({
      imported: 1,
      fitsImported: 0,
      fitsFailed: [],
      fitsPending: 0,
      fitsChecked: 0,
      fitsIncompatible: [],
      updated: 0,
      skipped: 0,
      metrics: 1,
      warnings: [],
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      'coach.activity.notice',
      expect.objectContaining({
        payload: { eventId: 88, kind: 'ACTIVITY', deliveryKey: 'import:88' },
      }),
    );
    expect(tx.event.create.mock.calls[0][0].data.athleteId).toBe(2);
    expect(
      tx.event.create.mock.calls[0][0].data.activity.create.externalId,
    ).toBe('garmin-manual:123:456');
    expect(
      tx.athleteMetric.upsert.mock.calls[0][0].where.athleteId_type_date.date.toISOString(),
    ).toBe('2026-09-15T00:00:00.000Z');
    await expect(service.sync(user)).rejects.toThrow('dos minutos');
    expect(service.fetch).toHaveBeenCalledTimes(1);
  });
  it('skips activities another athlete already owns instead of failing', async () => {
    tx.eventActivity.findUnique.mockResolvedValue({ eventActivityId: 5 });
    const result = await service.sync(user);
    expect(result.result).toMatchObject({ imported: 0, skipped: 1 });
    expect(result.result?.warnings).toContain('ActivityOwnedByAnotherAthlete');
    expect(tx.event.create).not.toHaveBeenCalled();
  });
  it('skips existing imports and still upserts metrics', async () => {
    tx.eventActivity.findFirst.mockResolvedValue({
      eventActivityId: 1,
      averageHeartrate: 130,
      maxHeartrate: 155,
    });
    const result = await service.sync(user);
    expect(result.result?.skipped).toBe(1);
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.athleteMetric.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects concurrent jobs before calling Garmin', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: false }]);
    await expect(service.sync(user)).rejects.toMatchObject({
      response: { code: 'GARMIN_BACKFILL_BUSY' },
    });
    expect(service.fetch).not.toHaveBeenCalled();
  });
  it('does not write malformed data and records a redacted error', async () => {
    service.fetch.mockResolvedValue({ ok: false, code: 'secret' });
    await expect(service.sync(user)).rejects.toThrow();
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.athleteMetric.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(await service.status(user))).not.toContain('secret');
  });

  const detailed = {
    eventActivityId: 7,
    eventId: 8,
    externalId: 'garmin-manual:123:456',
    stream: null,
    averageHeartrate: 130,
    maxHeartrate: 155,
    segments: [],
    event: { startDate: new Date('2026-09-15T08:00:00Z') },
  };
  const parsed = {
    stream: { time: [0, 1], heartrate: [120, 121] },
    segments: [
      {
        segmentType: 'LAP',
        name: 'Lap 1',
        orderIndex: 0,
        startTimeSeconds: 0,
        endTimeSeconds: 1,
      },
    ],
    incomplete: false,
  };
  function readyFit() {
    tx.eventActivity.findMany.mockResolvedValue([detailed]);
    tx.eventActivity.findFirst.mockResolvedValue(detailed);
    service.parse.mockResolvedValue(parsed);
    service.worker.mockImplementation(async (_dir, ids, _runId, message) => {
      for (const id of ids)
        if (!(await message({ type: 'fit', id, ready: true, cached: true })))
          return { reason: 'CANCELLED' };
      return { reason: 'COMPLETE' };
    });
  }
  async function complete() {
    await service.backfill(user);
    await service.completion;
    return (await readBackfill(directory))!;
  }

  it('fills only missing summary fields and preserves athlete feedback and existing zero', async () => {
    service.fetch.mockResolvedValue({
      ...payload,
      activities: [
        {
          ...payload.activities[0],
          description: 'From Garmin',
          averageCadence: 174,
          averageWatts: 200,
          maxWatts: 300,
          weightedAverageWatts: 220,
        },
      ],
    });
    tx.eventActivity.findFirst.mockResolvedValue({
      ...detailed,
      averageCadence: null,
      averageWatts: 0,
      maxWatts: 280,
      weightedAverageWatts: null,
      description: 'Coach notes',
      rpe: 0.7,
    });
    const result = await service.sync(user);
    expect(tx.eventActivity.update).toHaveBeenCalledWith({
      where: { eventActivityId: 7 },
      data: { averageCadence: 174, weightedAverageWatts: 220 },
    });
    expect(result.result).toMatchObject({ updated: 1, skipped: 0 });
    expect(queue.addActivityProcessingJob).toHaveBeenCalledWith(7, 8, true);
    expect(service.worker).not.toHaveBeenCalled();
  });

  it.each([
    ['MOBILITY', 'PILATES', { sport: 'MOBILITY' }],
    ['PILATES', 'PILATES', undefined],
    ['MOBILITY', 'YOGA', undefined],
  ])(
    'Garmin %s stored as %s: re-labels only mobility imported as Pilates',
    async (garminType, stored, expected) => {
      service.fetch.mockResolvedValue({
        ...payload,
        activities: [{ ...payload.activities[0], sport: garminType }],
      });
      tx.eventActivity.findFirst.mockResolvedValue({
        ...detailed,
        sport: stored,
      });
      await service.sync(user);
      if (expected)
        expect(tx.eventActivity.update).toHaveBeenCalledWith({
          where: { eventActivityId: 7 },
          data: expected,
        });
      else expect(tx.eventActivity.update).not.toHaveBeenCalled();
    },
  );

  it('updates summaries and recovery without downloading or parsing any FIT', async () => {
    readyFit();
    service.fetch.mockResolvedValue({
      ...payload,
      fits: [{ id: '456', ready: true }],
    });
    const result = await service.sync(user);
    expect(result.result).toMatchObject({
      fitsImported: 0,
      fitsPending: 1,
      metrics: 1,
    });
    expect(service.worker).not.toHaveBeenCalled();
    expect(service.parse).not.toHaveBeenCalled();
    expect(service.fetch).toHaveBeenCalledWith(directory);
  });

  it('backfills an exact owned activity using local IDs and no summary/wellness queries', async () => {
    readyFit();
    const result = await complete();
    expect(result).toMatchObject({
      status: 'COMPLETED',
      reason: 'COMPLETE',
      checked: 1,
      updated: 1,
      cached: 1,
      downloaded: 0,
      remaining: 0,
    });
    expect(service.fetch).not.toHaveBeenCalled();
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.athleteMetric.upsert).not.toHaveBeenCalled();
    expect(tx.eventActivity.update).toHaveBeenCalledWith({
      where: { eventActivityId: 7 },
      data: { stream: parsed.stream },
    });
    expect(tx.activitySegment.createMany).toHaveBeenCalledTimes(1);
    expect(queue.addActivityProcessingJob).toHaveBeenCalledWith(7, 8, true);
    expect(tx.eventActivity.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          event: { athleteId: 2 },
          provider: 'GARMIN',
          externalId: { in: ['garmin-manual:123:456', '456'] },
        },
      }),
    );
  });

  it('restores missing GPS and retains recorded sensors, manual laps and feedback', async () => {
    readyFit();
    const stream = compressActivityStream({
      time: [0, 1],
      heartrate: [110, 111],
    });
    tx.eventActivity.findFirst.mockResolvedValue({
      ...detailed,
      stream,
      segments: [{ activitySegmentId: 55 }],
      rpe: 0.7,
      description: 'Coach notes',
    });
    service.parse.mockResolvedValue({
      ...parsed,
      stream: {
        ...parsed.stream,
        latlng: [
          [40, -3],
          [40.001, -3.001],
        ],
      },
    });
    await complete();
    const data = tx.eventActivity.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['stream']);
    expect(uncompressActivityStream(data.stream)).toEqual({
      time: [0, 1],
      heartrate: [110, 111],
      latlng: [
        [40, -3],
        [40.001, -3.001],
      ],
    });
    expect(tx.activitySegment.createMany).not.toHaveBeenCalled();
  });

  it('does not download reviewed indoor activities again', async () => {
    readyFit();
    await complete();
    tx.eventActivity.findMany.mockResolvedValue([
      { ...detailed, stream: parsed.stream },
    ]);
    service.worker.mockClear();
    const second = await service.backfill(user);
    expect(second).toMatchObject({ status: 'COMPLETED', total: 0 });
    expect(service.worker).not.toHaveBeenCalled();
  });

  it.each([
    { version: 0, eventActivityId: 7 },
    { version: 1, eventActivityId: 99 },
  ])('rechecks an old review or a reimported row: %j', async (review) => {
    readyFit();
    tx.eventActivity.findMany.mockResolvedValue([
      { ...detailed, stream: parsed.stream },
    ]);
    await writeFile(
      join(directory, '.private/sync-state.json'),
      JSON.stringify({ fitReviews: { 'garmin-manual:123:456': review } }),
    );
    expect((await complete()).checked).toBe(1);
  });

  it('only fills missing FIT summary measurements, including preserving existing zero', async () => {
    readyFit();
    tx.eventActivity.findFirst.mockResolvedValue({
      ...detailed,
      averageWatts: 0,
      maxWatts: 400,
      averageCadence: null,
      kilojoules: null,
    });
    service.parse.mockResolvedValue({
      ...parsed,
      summary: {
        averageCadence: 170,
        averageWatts: 200,
        maxWatts: 350,
        kilojoules: 100,
        averageHeartrate: 120,
      },
    });
    await complete();
    expect(tx.eventActivity.update).toHaveBeenCalledWith({
      where: { eventActivityId: 7 },
      data: { stream: parsed.stream, averageCadence: 170, kilojoules: 100 },
    });
  });

  it('reports incompatible timelines without changing sensors or attaching laps', async () => {
    readyFit();
    tx.eventActivity.findFirst.mockResolvedValue({
      ...detailed,
      stream: { time: [10, 20], heartrate: [130, 131] },
    });
    expect((await complete()).incompatible).toEqual(['456']);
    expect(tx.eventActivity.update).not.toHaveBeenCalled();
    expect(tx.activitySegment.createMany).not.toHaveBeenCalled();
  });

  it('retains pending queue submissions after commit for the next manual operation', async () => {
    readyFit();
    queue.addActivityProcessingJob.mockRejectedValue(new Error('offline'));
    await complete();
    const state = JSON.parse(
      await readFile(join(directory, '.private/sync-state.json'), 'utf8'),
    );
    expect(state.processingPending).toEqual([
      { eventActivityId: 7, eventId: 8, bulkImport: true },
    ]);
    queue.addActivityProcessingJob.mockResolvedValue(undefined);
    const next = await service.sync(user);
    expect(next.processingPending).toEqual([]);
  });

  it('stops after parse or persistence failure, without marking the FIT reviewed', async () => {
    readyFit();
    tx.eventActivity.update.mockRejectedValue(
      new Error('private raw exception'),
    );
    const result = await complete();
    expect(result).toMatchObject({
      status: 'FAILED',
      reason: 'ERROR',
      failed: ['456'],
      remaining: 1,
    });
    const state = JSON.parse(
      await readFile(join(directory, '.private/sync-state.json'), 'utf8'),
    );
    expect(state.fitReviews).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('private raw');
    expect(queue.addActivityProcessingJob).not.toHaveBeenCalled();
  });

  it('completes the most recent activities first, whatever their import order', async () => {
    readyFit();
    const activity = (eventActivityId: number, id: string, day: string) => ({
      ...detailed,
      eventActivityId,
      externalId: `garmin-manual:123:${id}`,
      event: { startDate: new Date(`${day}T08:00:00Z`) },
    });
    // First sync imported newest to oldest; a later sync added the newest.
    tx.eventActivity.findMany.mockResolvedValue([
      activity(1, '300', '2026-09-20'),
      activity(2, '200', '2026-09-10'),
      activity(3, '100', '2026-09-01'),
      activity(4, '500', '2026-10-01'),
      activity(5, '400', '2026-09-25'),
    ]);
    service.worker.mockResolvedValue({ reason: 'BUDGET' });
    await complete();
    expect(service.worker.mock.calls[0][1]).toEqual([
      '500',
      '400',
      '300',
      '200',
      '100',
    ]);
  });

  it('tries unattempted files before retrying an invalid FIT on the next click', async () => {
    readyFit();
    tx.eventActivity.findMany.mockResolvedValue([
      detailed,
      { ...detailed, eventActivityId: 9, externalId: '789' },
    ]);
    service.parse.mockRejectedValueOnce(new Error('invalid FIT'));
    expect(await complete()).toMatchObject({ failed: ['456'], remaining: 2 });
    service.worker.mockResolvedValue({ reason: 'BUDGET' });
    await complete();
    expect(service.worker.mock.calls[1][1]).toEqual(['789', '456']);
  });

  it('shows partial progress and stops on throttling without automatic retries', async () => {
    readyFit();
    tx.eventActivity.findMany.mockResolvedValue([
      detailed,
      { ...detailed, eventActivityId: 9, externalId: '789' },
    ]);
    service.worker.mockImplementation(async (_dir, _ids, _runId, message) => {
      await message({ type: 'fit', id: '456', ready: true, cached: false });
      return { reason: 'RATE_LIMIT', retryAfterSeconds: 3600 };
    });
    expect(await complete()).toMatchObject({
      status: 'PAUSED',
      reason: 'RATE_LIMIT',
      checked: 1,
      downloaded: 1,
      remaining: 1,
    });
    expect(service.worker).toHaveBeenCalledTimes(1);
  });

  it.each(['AUTH', 'COOLDOWN', 'BUSY', 'ERROR', 'BUDGET'] as const)(
    'records terminal worker state without retries: %s',
    async (reason) => {
      readyFit();
      service.worker.mockResolvedValue({ reason });
      expect(await complete()).toMatchObject({ reason, remaining: 1 });
      expect(service.worker).toHaveBeenCalledTimes(1);
      expect(service.parse).not.toHaveBeenCalled();
    },
  );

  it('rejects files outside the authorized snapshot before parsing', async () => {
    readyFit();
    service.worker.mockImplementation(async (_dir, _ids, _runId, message) => {
      await message({ type: 'fit', id: '999', ready: true, cached: true });
      return { reason: 'COMPLETE' };
    });
    expect((await complete()).status).toBe('FAILED');
    expect(service.parse).not.toHaveBeenCalled();
  });

  it('rechecks coach access before every imported file', async () => {
    readyFit();
    service.worker.mockImplementation(async (_dir, _ids, _runId, message) => {
      prisma.athlete.findUnique.mockResolvedValue(null);
      await message({ type: 'fit', id: '456', ready: true, cached: true });
      return { reason: 'COMPLETE' };
    });
    expect((await complete()).status).toBe('FAILED');
    expect(tx.eventActivity.update).not.toHaveBeenCalled();
  });

  it('allows linked coaches but refuses unrelated users for start and stop', async () => {
    readyFit();
    const outsider = { ...user, userId: 99 };
    await expect(service.backfill(outsider)).rejects.toThrow();
    await expect(service.stopBackfill(outsider)).rejects.toThrow();
    expect(service.worker).not.toHaveBeenCalled();
    prisma.coachAthlete.findFirst.mockResolvedValue({
      athleteId: 2,
      userId: 9,
    });
    await service.backfill({ ...user, userId: 9, roles: ['COACH'] }, 2);
    await service.completion;
    expect((await readBackfill(directory))?.status).toBe('COMPLETED');
  });

  it('start, sync and credential changes cannot overlap an active backfill', async () => {
    readyFit();
    let release!: (result: BackfillWorkerResult) => void;
    service.worker.mockImplementation(
      () =>
        new Promise<BackfillWorkerResult>((resolve) => {
          release = resolve;
        }),
    );
    await service.backfill(user);
    await expect(service.backfill(user)).rejects.toThrow();
    await expect(service.sync(user)).rejects.toThrow();
    await expect(
      service.connect(user, { timezone: 'Europe/Madrid' }),
    ).rejects.toThrow();
    expect(service.fetch).not.toHaveBeenCalled();
    release({ reason: 'COMPLETE' });
    await service.completion;
  });

  it('stops across workers using a private marker and requires an explicit new start', async () => {
    readyFit();
    let release!: (result: BackfillWorkerResult) => void;
    service.worker.mockImplementation(
      () =>
        new Promise<BackfillWorkerResult>((resolve) => {
          release = resolve;
        }),
    );
    const initial = await service.backfill(user);
    expect((await service.stopBackfill(user))?.status).toBe('STOPPING');
    expect(await readFile(cancelPath(directory, initial.runId), 'utf8')).toBe(
      '',
    );
    release({ reason: 'CANCELLED' });
    await service.completion;
    expect(await readBackfill(directory)).toMatchObject({
      status: 'PAUSED',
      reason: 'CANCELLED',
      remaining: 1,
    });
    await service.status(user);
    expect(service.worker).toHaveBeenCalledTimes(1);
  });

  it('status is local and reports interrupted work after heartbeat expiry', async () => {
    readyFit();
    const initial = await complete();
    await saveBackfill(directory, {
      ...initial,
      status: 'RUNNING',
      updatedAt: '2020-01-01T00:00:00Z',
    });
    service.fetch.mockClear();
    service.worker.mockClear();
    expect(await service.status(user)).toMatchObject({
      backfill: { status: 'PAUSED', reason: 'INTERRUPTED' },
    });
    expect(service.fetch).not.toHaveBeenCalled();
    expect(service.worker).not.toHaveBeenCalled();
  });

  it('bounds each snapshot to 100 IDs without losing the total pending count', async () => {
    readyFit();
    tx.eventActivity.findMany.mockResolvedValue(
      Array.from({ length: 105 }, (_, i) => ({
        ...detailed,
        eventActivityId: i + 1,
        externalId: String(i + 1),
      })),
    );
    service.worker.mockResolvedValue({ reason: 'BUDGET' });
    expect(await complete()).toMatchObject({
      total: 105,
      remaining: 105,
      reason: 'BUDGET',
    });
    expect(service.worker.mock.calls[0][1]).toHaveLength(100);
  });

  it('validates dates and numeric values before persistence', () => {
    expect(
      manualGarminPayload.safeParse({
        ...payload,
        metrics: [{ date: '2026-02-30', type: 'HR_REST', value: 50 }],
      }).success,
    ).toBe(false);
    expect(
      manualGarminPayload.safeParse({
        ...payload,
        metrics: [{ date: '2026-09-15', type: 'HR_REST', value: NaN }],
      }).success,
    ).toBe(false);
  });
});
