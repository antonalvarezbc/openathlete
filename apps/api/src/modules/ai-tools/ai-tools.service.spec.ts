import { SPORT_TYPE } from '@openathlete/shared';

import { AuthUser } from '../auth/decorators/user.decorator';
import { compressActivityStream } from '../core/helpers/activity-stream';
import type { TrainingLoadService } from '../core/services/training-load.service';
import type { WeekPlanningService } from '../core/services/week-planning.service';
import { PrismaService } from '../prisma/services/prisma.service';
import { AiToolsService } from './ai-tools.service';

jest.mock('../core/services/training-load.service', () => ({
  TrainingLoadService: class {},
}));
jest.mock('../core/services/week-planning.service', () => ({
  WeekPlanningService: class {},
}));

const coach = {
  userId: 3,
  roles: ['COACH'],
} as unknown as AuthUser;
// Switched to athlete-only by an administrator: the links to other athletes
// they coached are kept, but must no longer grant access.
const formerCoach = {
  userId: 3,
  roles: ['ATHLETE'],
  athlete: { athleteId: 1 },
  coachAthletes: [{ athleteId: 7 }],
} as unknown as AuthUser;
const selfCoach = {
  userId: 3,
  roles: ['ATHLETE', 'COACH'],
  athlete: { athleteId: 1 },
  coachAthletes: [{ athleteId: 1 }, { athleteId: 7 }],
} as unknown as AuthUser;
const ownAthlete = { userId: 3 };
const coachedAthletes = { coachAthletes: { some: { userId: 3 } } };

function setup() {
  const prisma = {
    athlete: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    athleteMetric: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    eventActivity: { groupBy: jest.fn().mockResolvedValue([]) },
    eventTraining: { findMany: jest.fn().mockResolvedValue([]) },
    record: { findMany: jest.fn().mockResolvedValue([]) },
    trainingLoadEntry: { findMany: jest.fn().mockResolvedValue([]) },
    trainingZone: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const trainingLoad = { getWeeklyTrimpSummary: jest.fn() };
  const weekPlanning = { overview: jest.fn() };
  const service = new AiToolsService(
    prisma as unknown as PrismaService,
    trainingLoad as unknown as TrainingLoadService,
    weekPlanning as unknown as WeekPlanningService,
  );
  return { prisma, service, trainingLoad };
}

describe('AiToolsService', () => {
  it('describes every tool with a JSON schema for MCP', () => {
    const tools = setup().service.describe();
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_athletes',
      'get_athlete_profile',
      'get_week',
      'search_activities',
      'get_activity',
      'get_training_load',
      'get_wellness',
      'get_injuries',
      'get_plans',
      'get_records',
    ]);
    const week = tools.find((tool) => tool.name === 'get_week')!;
    expect(week.inputSchema).toMatchObject({
      type: 'object',
      required: ['date'],
    });
  });

  it('rejects unknown tools and invalid input before touching data', async () => {
    const { service, prisma } = setup();
    await expect(service.run(coach, 'drop_tables', {})).rejects.toThrow(
      'Unknown tool',
    );
    await expect(
      service.run(coach, 'get_week', { date: 'next monday' }),
    ).rejects.toMatchObject({
      response: { code: 'AI_TOOL_INVALID_INPUT' },
    });
    await expect(
      service.run(coach, 'search_activities', { limit: 500 }),
    ).rejects.toMatchObject({
      response: { code: 'AI_TOOL_INVALID_INPUT' },
    });
    expect(prisma.athlete.findFirst).not.toHaveBeenCalled();
  });

  it('only reads coached athletes with the coach role', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue(null);
    await expect(
      service.run(coach, 'get_injuries', { athleteId: 99 }),
    ).rejects.toThrow('You cannot access this athlete');
    expect(prisma.athlete.findFirst).toHaveBeenCalledWith({
      where: { athleteId: 99, OR: [coachedAthletes] },
      select: { athleteId: true },
    });
    expect(prisma.athleteInjury.findMany).not.toHaveBeenCalled();

    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    await service.run(coach, 'get_injuries', { athleteId: 7 });
    expect(prisma.athleteInjury.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ athleteId: 7 }),
      }),
    );
  });

  it('refuses athletes coached before the coach role was removed', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue(null);
    await expect(
      service.run(formerCoach, 'get_wellness', { athleteId: 7 }),
    ).rejects.toThrow('You cannot access this athlete');
    // The coach link is not an alternative any more: only their own profile.
    expect(prisma.athlete.findFirst).toHaveBeenCalledWith({
      where: { athleteId: 7, OR: [ownAthlete] },
      select: { athleteId: true },
    });
    expect(prisma.athleteMetric.findMany).not.toHaveBeenCalled();
  });

  it('reads the own profile only with the athlete role', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 1 });

    await service.run(selfCoach, 'get_injuries', {});
    expect(prisma.athlete.findFirst).toHaveBeenLastCalledWith({
      where: { userId: 3 },
      select: { athleteId: true },
    });
    await service.run(selfCoach, 'get_injuries', { athleteId: 1 });
    expect(prisma.athlete.findFirst).toHaveBeenLastCalledWith({
      where: { athleteId: 1, OR: [ownAthlete, coachedAthletes] },
      select: { athleteId: true },
    });
    expect(prisma.athleteInjury.findMany).toHaveBeenCalledTimes(2);

    // A coach-only account has no personal athlete space to default to.
    prisma.athlete.findFirst.mockClear();
    await expect(service.run(coach, 'get_injuries', {})).rejects.toThrow(
      'No athlete profile',
    );
    const noRoles = { userId: 3, roles: [] } as unknown as AuthUser;
    await expect(
      service.run(noRoles, 'get_injuries', { athleteId: 1 }),
    ).rejects.toThrow('You cannot access this athlete');
    expect(prisma.athlete.findFirst).not.toHaveBeenCalled();
  });

  it('lists the own profile first, then coached athletes', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findMany.mockResolvedValue([
      {
        athleteId: 1,
        userId: 9,
        user: { firstName: 'Leo', lastName: 'Run' },
      },
      {
        athleteId: 4,
        userId: 3,
        user: { firstName: 'Ana', lastName: 'Coach' },
      },
    ]);
    expect(await service.run(selfCoach, 'list_athletes', {})).toEqual({
      athletes: [
        { athleteId: 4, name: 'Ana Coach', self: true },
        { athleteId: 1, name: 'Leo Run', self: false },
      ],
    });
    expect(prisma.athlete.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [ownAthlete, coachedAthletes] },
        take: 200,
      }),
    );
  });

  it('lists only the athletes the roles allow', async () => {
    const { service, prisma } = setup();
    await service.run(formerCoach, 'list_athletes', {});
    expect(prisma.athlete.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { OR: [ownAthlete] } }),
    );
    await service.run(coach, 'list_athletes', {});
    expect(prisma.athlete.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { OR: [coachedAthletes] } }),
    );

    prisma.athlete.findMany.mockClear();
    const noRoles = { userId: 3, roles: [] } as unknown as AuthUser;
    expect(await service.run(noRoles, 'list_athletes', {})).toEqual({
      athletes: [],
    });
    expect(prisma.athlete.findMany).not.toHaveBeenCalled();
  });

  it('reports injury pain out of 10 and hides resolved ones by default', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    prisma.athleteInjury.findMany.mockResolvedValue([
      {
        location: 'knee',
        painScore: 0.4,
        status: 'IMPROVING',
        context: 'After long descents',
        createdAt: new Date('2026-09-01'),
        updatedAt: new Date('2026-09-20'),
      },
    ]);
    const result = (await service.run(coach, 'get_injuries', {
      athleteId: 7,
    })) as { injuries: { painOutOf10: number }[] };
    expect(result.injuries[0].painOutOf10).toBe(4);
    expect(prisma.athleteInjury.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { athleteId: 7, status: { not: 'RESOLVED' } },
      }),
    );
  });

  it('bounds activity searches and converts units', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    prisma.event.findMany.mockResolvedValue([
      {
        eventId: 30,
        name: 'Long trail',
        startDate: new Date('2026-09-20T07:00:00Z'),
        activity: {
          eventActivityId: 300,
          sport: 'TRAIL_RUNNING',
          movingTime: 10800,
          distance: 25400,
          elevationGain: 1350.4,
          averageHeartrate: 142.6,
          maxHeartrate: 171,
          averageWatts: null,
          rpe: 7,
          description: 'Hard last climb',
        },
      },
    ]);
    prisma.trainingLoadEntry.findMany.mockResolvedValue([
      { activityId: 300, value: 210.4 },
    ]);
    const result = (await service.run(coach, 'search_activities', {
      athleteId: 7,
      minElevationM: 1000,
      to: '2026-09-30',
    })) as { activities: Record<string, unknown>[] };
    expect(result.activities[0]).toMatchObject({
      eventId: 30,
      distanceKm: 25.4,
      elevationGainM: 1350,
      averageHeartrate: 143,
      trimp: 210,
      comment: 'Hard last climb',
    });
    const query = prisma.event.findMany.mock.calls[0][0];
    expect(query.take).toBe(15);
    expect(query.where.activity).toEqual({ elevationGain: { gte: 1000 } });
    expect(query.where.startDate.lt).toEqual(new Date('2026-10-01T00:00:00Z'));
  });

  const week = (weekStart: string, extra: Record<string, unknown> = {}) => ({
    weekStart: new Date(`${weekStart}T00:00:00Z`),
    weekEnd: new Date(`${weekStart}T00:00:00Z`),
    actualLoad: 400.4,
    estimatedLoad: 0,
    totalLoad: 400.4,
    recommendedMin: 300,
    recommendedMax: 450,
    acwr: 2.5,
    acwrStatus: 'high_risk',
    ...extra,
  });

  it('counts planned sessions without a load estimate per week', async () => {
    const { service, prisma, trainingLoad } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    trainingLoad.getWeeklyTrimpSummary.mockResolvedValue([
      // Too little history for an ACWR
      week('2026-09-07', { acwr: undefined, acwrStatus: undefined }),
      week('2026-09-14', { acwr: 0.86, acwrStatus: 'optimal' }),
    ]);
    prisma.eventTraining.findMany.mockResolvedValue([
      {
        goalDuration: 3600,
        event: { startDate: new Date('2026-09-16T07:00:00Z') },
      },
      {
        goalDuration: null,
        event: { startDate: new Date('2026-09-17T07:00:00Z') },
      },
    ]);
    const result = (await service.run(coach, 'get_training_load', {
      athleteId: 7,
      weeks: 2,
      until: '2026-09-14',
    })) as { weeks: Record<string, unknown>[] };
    expect(result.weeks).toEqual([
      expect.objectContaining({
        weekStart: '2026-09-07',
        actual: 400,
        acwr: undefined,
        acwrStatus: undefined,
      }),
      expect.objectContaining({
        weekStart: '2026-09-14',
        acwr: 0.86,
        acwrStatus: 'optimal',
        plannedSessionsWithoutEstimate: 2,
        plannedSecondsWithoutEstimate: 3600,
      }),
    ]);
    expect(prisma.eventTraining.findMany.mock.calls[0][0].where).toMatchObject({
      estimatedLoad: null,
      relatedActivityId: null,
      event: { athleteId: 7, type: 'TRAINING' },
    });
  });

  it('groups wellness by day with baselines and lists the other metrics', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    const metric = (type: string, date: string, value: number) => ({
      type,
      date: new Date(`${date}T00:00:00Z`),
      value,
    });
    prisma.athleteMetric.findMany.mockResolvedValue([
      metric('HRV_LAST_NIGHT_AVG', '2026-10-06', 46),
      metric('HR_REST', '2026-10-06', 49),
      // An earlier reading of the same day is ignored
      metric('HR_REST', '2026-10-06', 55),
      metric('HRV_LAST_NIGHT_AVG', '2026-10-01', 54),
      metric('HRV_LAST_NIGHT_AVG', '2026-09-28', 66),
    ]);
    prisma.athleteMetric.groupBy.mockResolvedValue([
      { type: 'HR_REST' },
      { type: 'DAILY_STEPS' },
    ]);
    const result = (await service.run(coach, 'get_wellness', {
      athleteId: 7,
      days: 14,
    })) as Record<string, unknown>;
    expect(result.days).toEqual([
      { date: '2026-10-06', HRV_LAST_NIGHT_AVG: 46, HR_REST: 49 },
      { date: '2026-10-01', HRV_LAST_NIGHT_AVG: 54 },
      { date: '2026-09-28', HRV_LAST_NIGHT_AVG: 66 },
    ]);
    expect(result.baselines).toEqual({
      HRV_LAST_NIGHT_AVG: {
        last7DaysAvg: 50,
        periodAvg: 55.3,
        periodMin: 46,
        periodMax: 66,
        days: 3,
      },
      HR_REST: {
        last7DaysAvg: 49,
        periodAvg: 49,
        periodMin: 49,
        periodMax: 49,
        days: 1,
      },
    });
    expect(result.availableTypes).toEqual(['DAILY_STEPS', 'HR_REST']);
    expect(result.truncated).toBeUndefined();
    const query = prisma.athleteMetric.findMany.mock.calls[0][0];
    expect(query.where.type.in).toContain('HRV_LAST_NIGHT_AVG');
  });

  it('details an activity with splits, zones, weather and planned steps', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    const index = Array.from({ length: 501 }, (_, i) => i);
    prisma.event.findUnique.mockResolvedValue({
      eventId: 640,
      athleteId: 7,
      type: 'ACTIVITY',
      name: 'Easy run',
      startDate: new Date('2026-10-05T15:00:00Z'),
      endDate: new Date('2026-10-05T15:08:20Z'),
      activity: {
        eventActivityId: 900,
        sport: 'RUNNING',
        movingTime: 500,
        distance: 2000,
        elevationGain: 3,
        averageHeartrate: 150,
        maxHeartrate: 171,
        averageWatts: null,
        rpe: null,
        description: '',
        averageSpeed: 4,
        averageGapSpeed: null,
        averageCadence: 186,
        stream: compressActivityStream({
          time: index,
          distance: index.map((i) => i * 4),
          heartrate: index.map((i) => (i < 250 ? 140 : 160)),
        }),
        weather: {
          samples: [{ distM: 0, timeSec: 0, lat: 0, lon: 0, temperatureC: 12 }],
        },
        segments: [],
        feedbackQuestions: [],
        relatedTraining: {
          sport: 'RUNNING',
          goalDuration: 4500,
          goalDistance: null,
          goalElevationGain: 100,
          goalRpe: 0.3,
          description: 'Easy',
          event: { name: 'Long run' },
          workout: {
            steps: [
              {
                stepType: 'STEADY',
                name: null,
                notes: null,
                durationType: 'TIME',
                durationValue: 4500,
                targets: [
                  {
                    targetType: 'ZONE',
                    targetMin: null,
                    targetMax: null,
                    targetValue: null,
                    metricType: null,
                    zoneReference: { type: 'HEARTRATE', name: 'Zone 2' },
                  },
                ],
                repeatBlock: null,
              },
            ],
          },
        },
      },
    });
    prisma.trainingZone.findMany.mockResolvedValue([
      {
        trainingZoneId: 1,
        name: 'Zone 1',
        type: 'HEARTRATE',
        index: 0,
        values: [{ min: 100, max: 145, sports: [] }],
      },
      {
        trainingZoneId: 2,
        name: 'Zone 2',
        type: 'HEARTRATE',
        index: 1,
        values: [{ min: 146, max: 165, sports: [] }],
      },
    ]);
    const result = (await service.run(coach, 'get_activity', {
      eventId: 640,
    })) as {
      pace: string;
      laps?: unknown[];
      splits: unknown[];
      heartRateZones: { zones: unknown[] };
      weather: { temperatureC: unknown };
      plannedSession: unknown;
    };
    expect(result.pace).toBe('4:10/km');
    expect(result.laps).toBeUndefined();
    expect(result.splits).toHaveLength(2);
    expect(result.heartRateZones.zones).toEqual([
      { zone: 'Zone 1', bpm: '100-145', seconds: 249, percent: 50 },
      { zone: 'Zone 2', bpm: '146-165', seconds: 251, percent: 50 },
    ]);
    expect(result.weather.temperatureC).toEqual({ min: 12, max: 12, avg: 12 });
    expect(result.plannedSession).toMatchObject({
      goalRpe: 3,
      steps: [
        {
          type: 'STEADY',
          duration: '4500 s',
          targets: [
            { type: 'HEARTRATE', zone: 'Zone 2', target: '146-165 bpm' },
          ],
        },
      ],
    });
    // Only the steps' reference metrics are read, and none are needed here
    expect(prisma.athleteMetric.findMany).not.toHaveBeenCalled();
  });

  it('returns the best record per distance, shortest distance first', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    prisma.eventActivity.groupBy.mockResolvedValue([
      { sport: 'RUNNING', _count: { sport: 40 } },
      { sport: 'CYCLING', _count: { sport: 3 } },
    ]);
    const record = (distance: number, value: number, eventId: number) => ({
      type: 'SPEED',
      distance,
      duration: null,
      value,
      date: new Date('2026-09-11T08:00:00Z'),
      eventActivity: { event: { eventId, name: `Run ${eventId}` } },
    });
    prisma.record.findMany.mockResolvedValue([
      record(5000, 1350, 1),
      record(5000, 1290, 2),
      record(1000, 230, 2),
    ]);
    const result = (await service.run(coach, 'get_records', {
      athleteId: 7,
    })) as { sport: string; sportsWithRecords: string[]; records: unknown[] };
    expect(result.sport).toBe('RUNNING');
    expect(result.sportsWithRecords).toEqual(['RUNNING', 'CYCLING']);
    expect(result.records).toEqual([
      expect.objectContaining({ distanceKm: 1, time: '3:50', pace: '3:50/km' }),
      expect.objectContaining({
        distanceKm: 5,
        time: '21:30',
        pace: '4:18/km',
        eventId: 2,
      }),
    ]);
    expect(prisma.record.findMany.mock.calls[0][0].where).toMatchObject({
      athleteId: 7,
      type: { in: ['SPEED'] },
      eventActivity: { sport: 'RUNNING' },
    });
  });

  it('describes the athlete profile with readable zone ranges', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({ athleteId: 7 });
    prisma.athlete.findUnique.mockResolvedValue({
      user: { firstName: 'Leo', lastName: 'Run', gender: 'FEMALE' },
    });
    const everySport = Object.values(SPORT_TYPE) as string[];
    prisma.trainingZone.findMany.mockResolvedValue([
      {
        trainingZoneId: 9,
        name: 'Zone 2',
        type: 'PACE',
        index: 1,
        description: 'Marathon',
        values: [{ min: 4.5, max: 5, sports: ['RUNNING'] }],
      },
      {
        trainingZoneId: 10,
        name: 'Zone 1',
        type: 'HEARTRATE',
        index: 0,
        description: 'Recovery',
        values: [
          { min: 60, max: 137, sports: everySport },
          {
            min: 60,
            max: 130,
            sports: everySport.filter((sport) => sport !== 'MOBILITY'),
          },
        ],
      },
    ]);
    prisma.athleteMetric.findMany.mockResolvedValue([
      { type: 'HR_MAX', value: 194, date: new Date('2026-09-11T00:00:00Z') },
    ]);
    expect(
      await service.run(coach, 'get_athlete_profile', { athleteId: 7 }),
    ).toEqual({
      athleteId: 7,
      name: 'Leo Run',
      gender: 'FEMALE',
      metrics: [{ type: 'HR_MAX', value: 194, date: '2026-09-11' }],
      zones: [
        {
          type: 'PACE',
          name: 'Zone 2',
          description: 'Marathon',
          ranges: [{ range: '4:30-5:00/km', sports: ['RUNNING'] }],
        },
        {
          type: 'HEARTRATE',
          name: 'Zone 1',
          description: 'Recovery',
          // A zone set for every sport says so instead of listing them
          ranges: [
            { range: '60-137 bpm', sports: 'all' },
            { range: '60-130 bpm', sports: 'all except MOBILITY' },
          ],
        },
      ],
    });
  });
});
