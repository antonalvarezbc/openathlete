import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { manualGarminPayload } from './manual-garmin.schema';
import { ManualGarminService } from './manual-garmin.service';

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
  protected fetchPayload() {
    return this.fetch();
  }
}

describe('manual Garmin import', () => {
  let directory: string;
  let service: TestService;
  const user = {
    userId: 1,
    email: 'athlete@example.test',
    athlete: { athleteId: 2 },
  } as AuthUser;
  const tx = {
    $queryRaw: jest.fn(),
    eventActivity: { findFirst: jest.fn() },
    event: { findFirst: jest.fn(), create: jest.fn() },
    athleteMetric: { upsert: jest.fn() },
  };
  const prisma = {
    athlete: { findUnique: jest.fn() },
    coachAthlete: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
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
    service = new TestService(
      prisma as unknown as PrismaService,
      new ConfigService({
        SELF_HOSTED: true,
        GARMIN_UNOFFICIAL_DIRECTORY: directory,
      }),
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
  it('imports atomically into the bound athlete and enforces cooldown', async () => {
    const result = await service.sync(user);
    expect(result.result).toEqual({
      imported: 1,
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
