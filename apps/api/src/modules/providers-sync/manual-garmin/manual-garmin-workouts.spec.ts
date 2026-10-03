import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { SportType } from '@openathlete/database';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { mapSessionToGarminWorkout } from './manual-garmin-workout.mapper';
import {
  ManualGarminWorkoutsService,
  localDay,
} from './manual-garmin-workouts.service';
import { ManualGarminService } from './manual-garmin.service';

jest.mock('./manual-garmin.service', () => ({
  ManualGarminService: class {},
}));

const step = (
  stepType: string,
  durationType: string,
  durationValue: number | null,
  targets: object[] = [],
) => ({ stepType, durationType, durationValue, targets }) as never;

describe('mapSessionToGarminWorkout', () => {
  it('maps steps, repeats and absolute targets to the Connect format', () => {
    const workout = mapSessionToGarminWorkout({
      name: 'Series',
      description: 'Hills',
      sport: SportType.TRAIL_RUNNING,
      goalDuration: 3000,
      steps: [
        step('WARMUP', 'TIME', 600),
        {
          stepType: 'REPEAT',
          repeatBlock: {
            repetitions: 3,
            childSteps: [
              step('INTERVAL_ACTIVE', 'DISTANCE', 1000, [
                { targetType: 'PACE', targetMin: 3.6, targetMax: 3.3 },
              ]),
              step('INTERVAL_REST', 'TIME', 90, [
                { targetType: 'HEARTRATE', targetValue: 130 },
              ]),
            ],
          },
        },
        step('COOLDOWN', 'LAP_BUTTON', null),
      ],
    });
    expect(workout).toMatchObject({
      workoutName: 'Series',
      description: 'Hills',
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      estimatedDurationInSecs: 3000,
    });
    const [warmup, repeat, cooldown] = workout.workoutSegments[0].workoutSteps;
    expect(warmup).toMatchObject({
      stepOrder: 1,
      stepType: { stepTypeKey: 'warmup' },
      endCondition: { conditionTypeKey: 'time' },
      endConditionValue: 600,
      targetType: { workoutTargetTypeKey: 'no.target' },
    });
    expect(repeat).toMatchObject({
      type: 'RepeatGroupDTO',
      stepOrder: 2,
      numberOfIterations: 3,
      endConditionValue: 3,
    });
    const [work, rest] = repeat.workoutSteps as Record<string, unknown>[];
    expect(work).toMatchObject({
      stepOrder: 3,
      stepType: { stepTypeKey: 'interval' },
      endCondition: { conditionTypeKey: 'distance' },
      endConditionValue: 1000,
      targetType: { workoutTargetTypeKey: 'pace.zone' },
      targetValueOne: 3.3,
      targetValueTwo: 3.6,
    });
    expect(rest).toMatchObject({
      stepOrder: 4,
      stepType: { stepTypeKey: 'recovery' },
      targetType: { workoutTargetTypeKey: 'heart.rate.zone' },
      targetValueOne: 130,
      targetValueTwo: 130,
    });
    expect(cooldown).toMatchObject({
      stepOrder: 5,
      endCondition: { conditionTypeKey: 'lap.button' },
      endConditionValue: null,
    });
  });

  it('uses speed on the bike and sends unstructured sessions as one step', () => {
    const bike = mapSessionToGarminWorkout({
      name: 'Z2',
      sport: SportType.GRAVEL_RIDE,
      steps: [
        step('STEADY', 'TIME', 3600, [
          { targetType: 'PACE', targetMin: 7, targetMax: 8 },
          { targetType: 'POWER', targetMin: 150, targetMax: 190 },
        ]),
      ],
    });
    expect(bike.sportType.sportTypeKey).toBe('cycling');
    expect(bike.workoutSegments[0].workoutSteps[0]).toMatchObject({
      targetType: { workoutTargetTypeKey: 'speed.zone' },
    });

    const easy = mapSessionToGarminWorkout({
      name: 'Easy',
      sport: SportType.RUNNING,
      steps: [],
      goalDuration: 2700,
    });
    expect(easy.workoutSegments[0].workoutSteps).toEqual([
      expect.objectContaining({
        endCondition: expect.objectContaining({ conditionTypeKey: 'time' }),
        endConditionValue: 2700,
      }),
    ]);
  });

  it('drops targets on swims and unsupported sports fall back to other', () => {
    const swim = mapSessionToGarminWorkout({
      name: 'Swim',
      sport: SportType.SWIMMING,
      steps: [
        step('INTERVAL_REST', 'TIME', 30, [
          { targetType: 'HEARTRATE', targetValue: 120 },
        ]),
      ],
    });
    expect(swim.workoutSegments[0].workoutSteps[0]).toMatchObject({
      stepType: { stepTypeKey: 'rest' },
      targetType: { workoutTargetTypeKey: 'no.target' },
    });
    expect(
      mapSessionToGarminWorkout({ name: 'x', sport: SportType.GOLF, steps: [] })
        .sportType.sportTypeKey,
    ).toBe('other');
  });
});

describe('localDay', () => {
  it('uses the Garmin time zone, not UTC', () => {
    expect(localDay(new Date('2026-10-04T22:30:00Z'), 'Europe/Madrid')).toBe(
      '2026-10-05',
    );
  });
});

const user = { userId: 1, roles: ['COACH'] } as AuthUser;
const connection = {
  athleteId: 7,
  garminUserProfileId: '555',
  timezone: 'Europe/Madrid',
  directory: '/tmp/oa-garmin-test/accounts/7',
  canConfigure: false,
};

function session(eventId: number, startDate: string, exported?: object) {
  return {
    eventId,
    athleteId: 7,
    name: `Session ${eventId}`,
    startDate: new Date(startDate),
    training: {
      sport: SportType.RUNNING,
      description: '',
      goalDuration: 1800,
      goalDistance: null,
      workout: null,
    },
    manualGarminWorkoutExport: exported ?? null,
  };
}

class TestService extends ManualGarminWorkoutsService {
  worker = jest.fn();
  protected runWorker(directory: string, operations: unknown[]) {
    return this.worker(directory, operations);
  }
}

function setup(sessions: ReturnType<typeof session>[]) {
  const prisma = {
    event: { findMany: jest.fn().mockResolvedValue(sessions) },
    manualGarminWorkoutExport: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((task) =>
      task({ $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]) }),
    ),
  };
  const garmin = { connection: jest.fn().mockResolvedValue(connection) };
  const service = new TestService(
    prisma as unknown as PrismaService,
    {
      getOrThrow: () => '/tmp/oa-garmin-test',
    } as unknown as ConfigService,
    garmin as unknown as ManualGarminService,
  );
  return { prisma, garmin, service };
}

describe('ManualGarminWorkoutsService', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-03T10:00:00Z') });
  });
  afterAll(() => jest.useRealTimers());

  it('sends new sessions in one batch and stores the Garmin IDs', async () => {
    const { service, prisma } = setup([
      session(1, '2026-10-04T07:00:00Z'),
      session(2, '2026-10-05T07:00:00Z'),
    ]);
    service.worker.mockResolvedValue({
      ok: true,
      results: [
        { key: '1', ok: true, workoutId: '11', scheduleId: '21' },
        { key: '2', ok: false, code: 'Rejected' },
      ],
    });
    const results = await service.send(user, 7, [1, 2, 3]);
    expect(results).toEqual([
      { eventId: 1, ok: true },
      { eventId: 2, ok: false, code: 'GARMIN_WORKOUT_REJECTED' },
      { eventId: 3, ok: false, code: 'GARMIN_SESSION_NOT_FOUND' },
    ]);
    expect(service.worker).toHaveBeenCalledTimes(1);
    const operations = service.worker.mock.calls[0][1];
    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatchObject({
      key: '1',
      action: 'upsert',
      date: '2026-10-04',
    });
    expect(operations[0]).not.toHaveProperty('workoutId');
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ athleteId: 7 }),
      }),
    );
    expect(prisma.manualGarminWorkoutExport.upsert).toHaveBeenCalledTimes(1);
    expect(
      prisma.manualGarminWorkoutExport.upsert.mock.calls[0][0].create,
    ).toMatchObject({
      eventId: 1,
      garminUserProfileId: '555',
      garminWorkoutId: '11',
      garminScheduleId: '21',
      plannedDate: '2026-10-04',
    });
  });

  it('skips unchanged and past sessions and updates changed ones in place', async () => {
    const workout = mapSessionToGarminWorkout({
      name: 'Session 1',
      description: '',
      sport: SportType.RUNNING,
      steps: [],
      goalDuration: 1800,
      goalDistance: null,
    });
    const hash = createHash('sha256')
      .update(JSON.stringify({ date: '2026-10-04', workout }))
      .digest('hex');

    const sent = {
      garminUserProfileId: '555',
      garminWorkoutId: '11',
      garminScheduleId: '21',
      plannedDate: '2026-10-04',
    };
    const { service: second } = setup([
      session(1, '2026-10-04T07:00:00Z', { ...sent, contentHash: hash }),
      session(2, '2026-10-02T07:00:00Z'),
      session(3, '2026-10-06T07:00:00Z', { ...sent, contentHash: 'old' }),
      session(4, '2026-10-06T07:00:00Z', {
        ...sent,
        garminUserProfileId: '999',
        contentHash: 'old',
      }),
    ]);
    second.worker.mockResolvedValue({
      ok: true,
      results: [
        { key: '3', ok: true, workoutId: '11', scheduleId: '22' },
        { key: '4', ok: true, workoutId: '12', scheduleId: '23' },
      ],
    });
    const results = await second.send(user, 7, [1, 2, 3, 4]);
    expect(results).toEqual([
      { eventId: 1, ok: true },
      { eventId: 2, ok: false, code: 'GARMIN_PAST_SESSION' },
      { eventId: 3, ok: true },
      { eventId: 4, ok: true },
    ]);
    const operations = second.worker.mock.calls[0][1];
    expect(operations.map((op: { key: string }) => op.key)).toEqual(['3', '4']);
    expect(operations[0]).toMatchObject({
      workoutId: '11',
      scheduleId: '21',
      previousDate: '2026-10-04',
      date: '2026-10-06',
    });
    // A copy in another Garmin account is never updated or deleted.
    expect(operations[1]).not.toHaveProperty('workoutId');
  });

  it('turns worker stops into the existing Garmin error codes', async () => {
    const { service, prisma } = setup([session(1, '2026-10-04T07:00:00Z')]);
    service.worker.mockResolvedValue({
      ok: false,
      code: 'Cooldown',
      retryAfterSeconds: 80,
    });
    await expect(service.send(user, 7, [1])).rejects.toMatchObject({
      response: { code: 'GARMIN_REMOTE_COOLDOWN', retryAfterSeconds: 80 },
    });
    expect(prisma.manualGarminWorkoutExport.upsert).not.toHaveBeenCalled();
  });

  it('explains items left unsent by a throttled batch', async () => {
    const { service } = setup([
      session(1, '2026-10-04T07:00:00Z'),
      session(2, '2026-10-05T07:00:00Z'),
    ]);
    service.worker.mockResolvedValue({
      ok: true,
      stopCode: 'RateLimited',
      results: [
        { key: '1', ok: false, code: 'ProviderError' },
        { key: '2', ok: false, code: 'NotAttempted' },
      ],
    });
    const results = await service.send(user, 7, [1, 2]);
    expect(results.map((r) => r.code)).toEqual([
      'GARMIN_REMOTE_COOLDOWN',
      'GARMIN_REMOTE_COOLDOWN',
    ]);
  });

  it('refuses athletes without a manual Garmin connection', async () => {
    const { service, garmin } = setup([]);
    garmin.connection.mockResolvedValue(null);
    await expect(service.send(user, 7, [1])).rejects.toThrow('Forbidden');
    expect(await service.list(user, 7, [1])).toEqual([]);
  });

  it('removes only copies in the linked Garmin account', async () => {
    const { service, prisma } = setup([]);
    prisma.manualGarminWorkoutExport.findMany.mockResolvedValue([
      { eventId: 1, garminWorkoutId: '11', garminScheduleId: '21' },
      { eventId: 2, garminWorkoutId: '12', garminScheduleId: '22' },
    ]);
    service.worker.mockResolvedValue({
      ok: true,
      results: [
        { key: '1', ok: true },
        { key: '2', ok: false, code: 'ProviderError' },
      ],
    });
    const results = await service.remove(user, 7, [1, 2, 3]);
    expect(prisma.manualGarminWorkoutExport.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: [1, 2, 3] },
        athleteId: 7,
        garminUserProfileId: '555',
      },
    });
    expect(service.worker.mock.calls[0][1]).toEqual([
      { key: '1', action: 'delete', workoutId: '11', scheduleId: '21' },
      { key: '2', action: 'delete', workoutId: '12', scheduleId: '22' },
    ]);
    expect(prisma.manualGarminWorkoutExport.delete).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { eventId: 1, ok: true },
      { eventId: 2, ok: false, code: 'GARMIN_EXPORT_FAILED' },
      { eventId: 3, ok: true },
    ]);
  });
});
