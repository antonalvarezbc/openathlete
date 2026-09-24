import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue/queue.service';
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
class TestService extends ManualGarminService {
  fetch = jest.fn().mockResolvedValue(payload);
  parse = jest.fn();
  protected parseFit() {
    return this.parse();
  }
  protected fetchPayload(directory: string, completed: string[]) {
    return this.fetch(directory, completed);
  }
}

describe('manual Garmin import', () => {
  let directory: string;
  let service: TestService;
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
      findMany: jest.fn(),
      update: jest.fn(),
    },
    activitySegment: { createMany: jest.fn() },
    event: { findFirst: jest.fn(), create: jest.fn() },
    athleteMetric: { upsert: jest.fn() },
  };
  const prisma = {
    athlete: { findUnique: jest.fn() },
    coachAthlete: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const queue = { addActivityProcessingJob: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
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
    service = new TestService(
      prisma as unknown as PrismaService,
      new ConfigService({
        SELF_HOSTED: true,
        GARMIN_UNOFFICIAL_DIRECTORY: directory,
      }),
      queue as unknown as QueueService,
    );
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

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
      skipped: 0,
      metrics: 1,
      warnings: [],
    });
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
  it('skips existing imports and still upserts metrics', async () => {
    tx.eventActivity.findFirst.mockResolvedValue({ eventActivityId: 1 });
    const result = await service.sync(user);
    expect(result.result?.skipped).toBe(1);
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.athleteMetric.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects concurrent jobs before calling Garmin', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: false }]);
    await expect(service.sync(user)).rejects.toThrow('en curso');
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
    stream: null,
    segments: [],
  };
  function readyFit() {
    service.fetch.mockResolvedValue({
      ...payload,
      fits: [{ id: '456', ready: true }],
      fitsPending: 2,
    });
    service.parse.mockResolvedValue({
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
    });
    tx.eventActivity.findFirst.mockResolvedValue(detailed);
  }
  it('backfills an existing activity without duplicating it or changing its feedback', async () => {
    readyFit();
    const result = await service.sync(user);
    expect(result.result).toMatchObject({
      imported: 0,
      fitsImported: 1,
      fitsPending: 2,
    });
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.eventActivity.update).toHaveBeenCalledWith({
      where: { eventActivityId: 7 },
      data: { stream: { time: [0, 1], heartrate: [120, 121] } },
    });
    expect(tx.activitySegment.createMany).toHaveBeenCalledTimes(1);
    expect(queue.addActivityProcessingJob).toHaveBeenCalledWith(7, 8, false);
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
  it('imports details for a newly created summary', async () => {
    readyFit();
    tx.eventActivity.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(detailed);
    const result = await service.sync(user);
    expect(result.result).toMatchObject({ imported: 1, fitsImported: 1 });
    expect(tx.event.create).toHaveBeenCalledTimes(1);
  });
  it('preserves existing segments and workout links', async () => {
    readyFit();
    tx.eventActivity.findFirst.mockResolvedValue({
      ...detailed,
      segments: [{ activitySegmentId: 55 }],
    });
    await service.sync(user);
    expect(tx.activitySegment.createMany).not.toHaveBeenCalled();
  });
  it('does not download completed streams or overwrite them', async () => {
    readyFit();
    tx.eventActivity.findMany.mockResolvedValue([
      { externalId: 'garmin-manual:123:456', stream: { time: [0] } },
    ]);
    tx.eventActivity.findFirst.mockResolvedValue({
      ...detailed,
      stream: { time: [0] },
    });
    await service.sync(user);
    expect(service.fetch).toHaveBeenCalledWith(directory, ['456']);
    expect(service.parse).not.toHaveBeenCalled();
    expect(tx.eventActivity.update).not.toHaveBeenCalled();
  });
  it('keeps summary and metrics when a FIT cannot be parsed', async () => {
    readyFit();
    service.parse.mockRejectedValue(new Error('private raw data'));
    const result = await service.sync(user);
    expect(result.result).toMatchObject({
      fitsImported: 0,
      fitsFailed: ['456'],
      fitsPending: 3,
      metrics: 1,
    });
    expect(JSON.stringify(result)).not.toContain('private raw data');
    expect(tx.eventActivity.update).not.toHaveBeenCalled();
    expect(queue.addActivityProcessingJob).not.toHaveBeenCalled();
  });
  it('reports download failures without parsing or discarding summaries', async () => {
    service.fetch.mockResolvedValue({
      ...payload,
      fits: [{ id: '456', ready: false }],
    });
    const result = await service.sync(user);
    expect(result.result).toMatchObject({
      imported: 1,
      fitsFailed: ['456'],
      fitsPending: 1,
    });
    expect(service.parse).not.toHaveBeenCalled();
  });
  it('does not attach FITs to ambiguous cross-provider matches', async () => {
    readyFit();
    tx.eventActivity.findFirst.mockResolvedValue(null);
    tx.event.findFirst.mockResolvedValue({ eventId: 99 });
    await service.sync(user);
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(tx.eventActivity.update).not.toHaveBeenCalled();
  });
  it('retains failed queue submissions for the next manual sync', async () => {
    readyFit();
    queue.addActivityProcessingJob.mockRejectedValue(
      new Error('queue offline'),
    );
    const result = await service.sync(user);
    expect(result.processingPending).toEqual([
      { eventActivityId: 7, eventId: 8 },
    ]);
    expect(result.result?.warnings).toContain('FitProcessingPending');
    await writeFile(
      join(directory, '.private/sync-state.json'),
      JSON.stringify({ ...result, lastAttempt: '2020-01-01T00:00:00Z' }),
    );
    queue.addActivityProcessingJob.mockResolvedValue(undefined);
    service.fetch.mockResolvedValue(payload);
    const next = await service.sync(user);
    expect(next.processingPending).toEqual([]);
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
