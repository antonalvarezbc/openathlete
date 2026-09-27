import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { recalculateAllLoadsDtoSchema } from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { CaslAbilityFactory } from '../../auth/services/casl-ability.factory';
import { PrismaService } from '../../prisma/services/prisma.service';
import { compressActivityStream } from '../helpers/activity-stream';
import { TrainingLoadService } from './training-load.service';

const coach: AuthUser = {
  userId: 1,
  email: 'coach@example.test',
  athlete: null,
  roles: ['COACH'],
};
function setup(hrMax: number | null = null, hrRest: number | null = 55) {
  const db = {
    athlete: {
      findUnique: jest.fn().mockResolvedValue({ athleteId: 12, userId: 2 }),
      findFirst: jest.fn().mockResolvedValue({
        athleteId: 12,
        userId: 2,
        user: { gender: 'FEMALE' },
      }),
    },
    coachAthlete: {
      findFirst: jest.fn().mockResolvedValue({ athleteId: 12, userId: 1 }),
    },
    athleteMetric: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const value = where.type === 'HR_MAX' ? hrMax : hrRest;
        return Promise.resolve(value === null ? null : { value });
      }),
    },
    trainingZoneValue: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ min: 150, max: 180, sports: [] }]),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([{ eventId: 10 }, { eventId: 11 }]),
      findFirst: jest.fn().mockResolvedValue({
        eventId: 10,
        startDate: new Date('2026-09-20T10:00:00Z'),
        activity: {
          eventActivityId: 101,
          sport: 'RUNNING',
          movingTime: 120,
          stream: compressActivityStream({
            time: [0, 60, 120],
            heartrate: [120, 130, 140],
          }),
        },
      }),
    },
    trainingLoadCalculation: {
      upsert: jest.fn().mockResolvedValue({ trainingLoadCalculationId: 90 }),
    },
    trainingLoadEntry: {
      upsert: jest
        .fn()
        .mockImplementation(({ create }) => Promise.resolve(create)),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    },
  };
  return {
    db,
    service: new TrainingLoadService(
      db as unknown as PrismaService,
      {
        getFor: async () => ({ can: () => true }),
      } as unknown as CaslAbilityFactory,
    ),
  };
}

describe('TRIMP references and recalculation', () => {
  beforeAll(() =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
  );
  afterAll(() => jest.restoreAllMocks());
  it('reuses saved calculations on refresh and invalidates changed activity inputs', async () => {
    const { service, db } = setup();
    const event = await db.event.findFirst();

    let saved: unknown = null;
    db.event.findMany.mockImplementation(async () => [
      {
        ...event,
        activity: {
          ...event.activity,
          trainingLoadEntries: saved ? [{ metadata: saved }] : [],
        },
      },
    ]);
    db.trainingLoadEntry.upsert.mockImplementation(async ({ create }) => {
      saved = create.metadata;
      return create;
    });
    jest.spyOn(service, 'getTrainingLoadByPeriod').mockResolvedValue([]);
    const calculate = jest.spyOn(service, 'calculateActivityLoad');
    const first = await service.getTrainingLoadMetrics(
      coach,
      'TRIMP',
      new Date('2026-09-26'),
      12,
    );
    expect(first.trimpRefresh).toMatchObject({
      processed: 1,
      reused: 0,
      unavailable: 0,
    });
    const second = await service.getTrainingLoadMetrics(
      coach,
      'TRIMP',
      new Date('2026-09-26'),
      12,
    );
    expect(second.trimpRefresh).toMatchObject({
      processed: 0,
      reused: 1,
      unavailable: 0,
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    event.activity.stream = compressActivityStream({
      time: [0, 60, 120],
      heartrate: [140, 145, 150],
    });
    const third = await service.getTrainingLoadMetrics(
      coach,
      'TRIMP',
      new Date('2026-09-26'),
      12,
    );
    expect(third.trimpRefresh?.processed).toBe(1);
    expect(calculate).toHaveBeenCalledTimes(2);
    db.trainingZoneValue.findMany.mockResolvedValue([
      { min: 140, max: 185, sports: [] },
    ]);
    expect(
      (
        await service.getTrainingLoadMetrics(
          coach,
          'TRIMP',
          new Date('2026-09-26'),
          12,
        )
      ).trimpRefresh?.processed,
    ).toBe(1);
    expect(calculate).toHaveBeenCalledTimes(3);
  });

  it('does not refresh or read activity data for an unrelated coach', async () => {
    const { service, db } = setup();
    db.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      service.getTrainingLoadMetrics(coach, 'TRIMP', new Date(), 12),
    ).rejects.toThrow(ForbiddenException);
    expect(db.event.findMany).not.toHaveBeenCalled();
  });

  it('prioritizes the explicit metric without reading zones', async () => {
    const { service, db } = setup(190);
    expect(await service.resolveTrimpHeartRates(12, 'RUNNING')).toEqual({
      hrMax: 190,
      hrRest: 55,
      hrMaxSource: 'METRIC',
    });
    expect(db.trainingZoneValue.findMany).not.toHaveBeenCalled();
  });
  it('uses the highest upper bound and filters heart-rate zones by athlete and sport', async () => {
    const { service, db } = setup();
    db.trainingZoneValue.findMany.mockResolvedValue([
      { min: 130, max: 150, sports: [] },
      { min: 150, max: 180, sports: [] },
    ]);
    expect(await service.resolveTrimpHeartRates(12, 'RUNNING')).toEqual({
      hrMax: 180,
      hrRest: 55,
      hrMaxSource: 'TRAINING_ZONE',
    });
    expect(db.trainingZoneValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          trainingZone: { athleteId: 12, type: 'HEARTRATE' },
          OR: [{ sports: { has: 'RUNNING' } }, { sports: { isEmpty: true } }],
        },
      }),
    );
  });
  it('prioritizes specific sport zones over general zones', async () => {
    const { service, db } = setup();
    db.trainingZoneValue.findMany.mockResolvedValue([
      { min: 140, max: 200, sports: [] },
      { min: 140, max: 175, sports: ['RUNNING'] },
    ]);
    expect((await service.resolveTrimpHeartRates(12, 'RUNNING')).hrMax).toBe(
      175,
    );
  });
  it.each([
    [0, 55],
    [55, 55],
    [50, 55],
    [190, null],
    [190, 0],
    [Infinity, 55],
  ])(
    'rejects invalid references %s/%s instead of a silent fallback',
    async (max, rest) => {
      const { service, db } = setup(max, rest);
      await expect(
        service.resolveTrimpHeartRates(12, 'RUNNING'),
      ).rejects.toThrow(BadRequestException);
      expect(db.trainingZoneValue.findMany).not.toHaveBeenCalled();
    },
  );
  it('rejects missing zones and metric', async () => {
    const { service, db } = setup();
    db.trainingZoneValue.findMany.mockResolvedValue([]);
    await expect(service.resolveTrimpHeartRates(12, 'RUNNING')).rejects.toThrow(
      BadRequestException,
    );
  });
  it('persists a positive calculation with the actual source and parameters', async () => {
    const { service, db } = setup();
    const entry = await service.calculateActivityLoad(coach, 10, 'TRIMP', 12);
    expect(entry.value).toBeGreaterThan(0);
    expect(entry.metadata).toMatchObject({
      hrMax: 180,
      hrRest: 55,
      hrMaxSource: 'TRAINING_ZONE',
    });
    expect(db.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 10, athleteId: 12, type: 'ACTIVITY' },
      }),
    );
  });
  it.each([{ heartrate: [] }, { heartrate: [0, 0, 0] }])(
    'does not save an unusable pulse stream as zero load (%j)',
    async ({ heartrate }) => {
      const { service, db } = setup();
      const event = await db.event.findFirst();
      event.activity.stream = compressActivityStream({
        time: [0, 60, 120],
        heartrate,
      });
      db.event.findFirst.mockResolvedValue(event);
      await expect(
        service.calculateActivityLoad(coach, 10, 'TRIMP', 12),
      ).rejects.toThrow();
      expect(db.trainingLoadEntry.upsert).not.toHaveBeenCalled();
    },
  );
  it('uses the unique activity/calculation key to update or create atomically', async () => {
    const { service, db } = setup(190);
    await service.calculateActivityLoad(coach, 10, 'TRIMP', 12);
    expect(db.trainingLoadEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          calculationId_activityId: { calculationId: 90, activityId: 101 },
        },
        update: expect.objectContaining({ value: expect.any(Number) }),
      }),
    );
  });
  it('reports partial failures and deduplicates source references', async () => {
    const { service, db } = setup();
    db.event.findFirst.mockResolvedValueOnce(null);
    const result = await service.recalculateAllLoads(coach, 'TRIMP', 12);
    expect(result).toEqual({
      processed: 1,
      errors: 1,
      heartRateReferences: [
        { hrMax: 180, hrRest: 55, source: 'TRAINING_ZONE' },
      ],
    });
    expect(db.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { athleteId: 12, type: 'ACTIVITY', activity: { isNot: null } },
      }),
    );
  });
  it('denies an unrelated coach before reading activities', async () => {
    const { service, db } = setup();
    db.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      service.recalculateAllLoads(coach, 'TRIMP', 12),
    ).rejects.toThrow(ForbiddenException);
    expect(db.event.findMany).not.toHaveBeenCalled();
  });
  it('denies an athlete targeting another athlete', async () => {
    const { service, db } = setup();
    await expect(
      service.recalculateAllLoads(
        { ...coach, roles: ['ATHLETE'] },
        'TRIMP',
        12,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(db.event.findMany).not.toHaveBeenCalled();
  });
  it('preserves self recalculation and rechecks access for every activity', async () => {
    const { service, db } = setup();
    await service.recalculateAllLoads(
      { ...coach, userId: 2, roles: ['ATHLETE'] },
      'TRIMP',
    );
    expect(db.athlete.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 2 } }),
    );
    expect(db.coachAthlete.findFirst).not.toHaveBeenCalled();
    expect(db.athlete.findFirst).toHaveBeenCalledTimes(3);
  });
  it.each([
    {},
    { calculationType: 'WRONG' },
    { calculationType: 'TRIMP', athleteId: -1 },
    { calculationType: 'TRIMP', athleteId: '12' },
    { calculationType: 'TRIMP', userId: 2 },
  ])('rejects malformed request %j', (body) => {
    expect(recalculateAllLoadsDtoSchema.safeParse(body).success).toBe(false);
  });
});
