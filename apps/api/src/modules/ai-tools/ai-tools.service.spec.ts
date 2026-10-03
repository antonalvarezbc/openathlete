import { AuthUser } from '../auth/decorators/user.decorator';
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

function setup() {
  const prisma = {
    athlete: { findFirst: jest.fn() },
    coachAthlete: { findMany: jest.fn().mockResolvedValue([]) },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
    trainingLoadEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const trainingLoad = { getWeeklyTrimpSummary: jest.fn() };
  const weekPlanning = { overview: jest.fn() };
  const service = new AiToolsService(
    prisma as unknown as PrismaService,
    trainingLoad as unknown as TrainingLoadService,
    weekPlanning as unknown as WeekPlanningService,
  );
  return { prisma, service };
}

describe('AiToolsService', () => {
  it('describes every tool with a JSON schema for MCP', () => {
    const tools = setup().service.describe();
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_athletes',
      'get_week',
      'search_activities',
      'get_activity',
      'get_training_load',
      'get_wellness',
      'get_injuries',
      'get_plans',
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

  it('only reads athletes the user owns or coaches', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue(null);
    await expect(
      service.run(coach, 'get_injuries', { athleteId: 99 }),
    ).rejects.toThrow('You cannot access this athlete');
    expect(prisma.athlete.findFirst).toHaveBeenCalledWith({
      where: {
        athleteId: 99,
        OR: [{ userId: 3 }, { coachAthletes: { some: { userId: 3 } } }],
      },
      select: { athleteId: true },
    });
    expect(prisma.athleteInjury.findMany).not.toHaveBeenCalled();
  });

  it('lists the own profile and coached athletes once', async () => {
    const { service, prisma } = setup();
    prisma.athlete.findFirst.mockResolvedValue({
      athleteId: 1,
      user: { firstName: 'Ana', lastName: 'Coach' },
    });
    prisma.coachAthlete.findMany.mockResolvedValue([
      {
        athlete: {
          athleteId: 1,
          user: { firstName: 'Ana', lastName: 'Coach' },
        },
      },
      {
        athlete: { athleteId: 7, user: { firstName: 'Leo', lastName: 'Run' } },
      },
    ]);
    expect(await service.run(coach, 'list_athletes', {})).toEqual({
      athletes: [
        { athleteId: 1, name: 'Ana Coach', self: true },
        { athleteId: 7, name: 'Leo Run', self: false },
      ],
    });
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
});
