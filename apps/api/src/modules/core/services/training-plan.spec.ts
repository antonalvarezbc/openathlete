import { ForbiddenException } from '@nestjs/common';

import {
  CYCLE_PHASE,
  SEOPlanData,
  SPORT_TYPE,
  WORKOUT_STEP_TYPE,
  buildPlanSchedule,
  importPlanBodyDtoSchema,
  trainingPlanImportSchema,
} from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { TrainingPlanService } from './training-plan.service';

const fixture = (): SEOPlanData => ({
  plan: {
    name: 'QA plan',
    description: '',
    goal: 'QA',
    sportType: SPORT_TYPE.RUNNING,
    distance: 10000,
    duration: 2,
  },
  cycles: [
    {
      name: 'Base',
      description: '',
      phase: CYCLE_PHASE.BASE,
      weeks: [1, 2].map((weekNumber) => ({
        weekNumber,
        sessions: [
          {
            dayOfWeek: 0,
            name: 'Sunday',
            sport: SPORT_TYPE.RUNNING,
            description: '',
            goalDuration: 3600,
            goalRpe: 4,
          },
        ],
      })),
    },
  ],
});

describe('JSON plan validation and scheduling', () => {
  test('keeps Sunday inside its Monday-based week and handles Madrid DST', () => {
    const schedule = buildPlanSchedule(
      fixture(),
      '2030-10-21',
      'Europe/Madrid',
    );
    expect(schedule.cycles[0].weeks[0].sessions[0].date).toBe('2030-10-27');
    expect(
      schedule.cycles[0].weeks[0].sessions[0].startDate.toISOString(),
    ).toBe('2030-10-27T08:00:00.000Z');
    expect(schedule.cycles[0].weeks[1].sessions[0].date).toBe('2030-11-03');
    expect(schedule.endDate.toISOString()).toBe('2030-11-03T22:59:59.999Z');
  });
  test('supports a Sunday start and the spring DST transition', () => {
    const schedule = buildPlanSchedule(
      fixture(),
      '2030-03-24',
      'Europe/Madrid',
    );
    expect(
      schedule.cycles[0].weeks[0].sessions[0].startDate.toISOString(),
    ).toBe('2030-03-24T08:00:00.000Z');
    expect(
      schedule.cycles[0].weeks[1].sessions[0].startDate.toISOString(),
    ).toBe('2030-03-31T07:00:00.000Z');
  });
  test.each(['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland'])(
    'keeps civil dates in %s',
    (timeZone) => {
      const schedule = buildPlanSchedule(fixture(), '2030-10-21', timeZone);
      expect(
        new Intl.DateTimeFormat('en-GB', {
          timeZone,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(schedule.cycles[0].weeks[0].sessions[0].startDate),
      ).toBe('09');
    },
  );
  test.each([
    ['dayOfWeek', 1.5],
    ['dayOfWeek', 7],
    ['goalDuration', -1],
    ['goalDuration', 3.5],
    ['goalRpe', 11],
    ['goalDistance', Infinity],
  ])('rejects invalid %s=%s', (key, value) => {
    const plan = fixture();
    Object.assign(plan.cycles[0].weeks[0].sessions[0], { [key]: value });
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(false);
  });
  test('rejects extra fields, mismatched weeks and empty cycles', () => {
    expect(
      trainingPlanImportSchema.safeParse({
        ...fixture(),
        futureCapability: true,
      }).success,
    ).toBe(false);
    const plan = fixture();
    plan.plan.duration = 3;
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(false);
    plan.cycles = [];
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(false);
  });
  test('rejects invalid civil dates and time zones', () => {
    expect(
      importPlanBodyDtoSchema.safeParse({ startDate: '2030-02-30' }).success,
    ).toBe(false);
    expect(
      importPlanBodyDtoSchema.safeParse({
        startDate: '2030-01-01',
        timeZone: 'invalid',
      }).success,
    ).toBe(false);
  });
  test('preserves legacy repeat children through normalization', () => {
    const plan = fixture();
    plan.cycles[0].weeks[0].sessions[0].workout = {
      steps: [
        {
          stepType: WORKOUT_STEP_TYPE.REPEAT,
          repeatTimes: 3,
          childSteps: [{ stepType: WORKOUT_STEP_TYPE.STEADY }],
        },
      ],
    };
    const parsed = trainingPlanImportSchema.parse(plan);
    expect(
      parsed.cycles[0].weeks[0].sessions[0].workout?.steps[0].repeatBlock
        ?.repetitions,
    ).toBe(3);
    expect(trainingPlanImportSchema.safeParse(parsed).success).toBe(true);
  });
  test('rejects empty and nested repeats rather than discarding them', () => {
    const plan = fixture();
    plan.cycles[0].weeks[0].sessions[0].workout = {
      steps: [{ stepType: WORKOUT_STEP_TYPE.REPEAT }],
    };
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(false);
  });
});

describe('JSON import limits', () => {
  test('rejects oversized text before publication', () => {
    const plan = fixture();
    plan.plan.description = 'x'.repeat(90001);
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(false);
  });
  test('rejects a nested repeat in the legacy format', () => {
    const plan = fixture();
    plan.cycles[0].weeks[0].sessions[0].workout = {
      steps: [
        {
          stepType: WORKOUT_STEP_TYPE.REPEAT,
          childSteps: [
            {
              stepType: WORKOUT_STEP_TYPE.REPEAT,
              childSteps: [{ stepType: WORKOUT_STEP_TYPE.STEADY }],
            },
          ],
        },
      ],
    };
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(false);
  });
  test('retains support for ISO dates and defaults missing duration to one hour', () => {
    const plan = fixture();
    delete plan.cycles[0].weeks[0].sessions[0].goalDuration;
    const schedule = buildPlanSchedule(
      plan,
      '2030-10-20T22:00:00Z',
      'Europe/Madrid',
    );
    const session = schedule.cycles[0].weeks[0].sessions[0];
    expect(session.date).toBe('2030-10-27');
    expect(session.endDate.getTime() - session.startDate.getTime()).toBe(
      3600000,
    );
    expect(session.goalDuration).toBeUndefined();
  });
});

describe('JSON import transaction boundary', () => {
  const user = {
    roles: ['COACH' as const],
    userId: 3,
    email: 'qa@example.test',
    athlete: { athleteId: 3 },
  };
  test('validates the whole plan before opening a transaction', async () => {
    const prisma = { $transaction: jest.fn() };
    const plan = fixture();
    plan.plan.duration = 3;
    await expect(
      new TrainingPlanService(prisma as unknown as PrismaService).importSeoPlan(
        user,
        plan,
        '2030-10-21',
      ),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('checks the selected athlete inside the transaction before writing', async () => {
    const tx = {
      athlete: { findFirst: jest.fn().mockResolvedValue(null) },
      trainingPlan: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    await expect(
      new TrainingPlanService(prisma as unknown as PrismaService).importSeoPlan(
        user,
        fixture(),
        '2030-10-21',
        { athleteId: 5 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.trainingPlan.create).not.toHaveBeenCalled();
    expect(tx.athlete.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ athleteId: 5 }),
      }),
    );
  });
  test.each([
    [undefined, 'ACTIVE'],
    ['DRAFT' as const, 'DRAFT'],
  ])('creates the plan with status %s as %s', async (status, expected) => {
    const tx = {
      athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 3 }) },
      trainingPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ trainingPlanId: 9 }),
      },
      cycle: { create: jest.fn().mockResolvedValue({ cycleId: 1 }) },
      trainingWeek: {
        create: jest.fn().mockResolvedValue({ trainingWeekId: 1 }),
      },
      event: {
        create: jest.fn().mockResolvedValue({ training: null }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    await new TrainingPlanService(
      prisma as unknown as PrismaService,
    ).importSeoPlan(user, fixture(), '2030-10-21', { status });
    expect(tx.trainingPlan.create.mock.calls[0][0].data.status).toBe(expected);
  });
  describe('linking the goal race', () => {
    // The fixture's two weeks start on 2030-10-21 (UTC).
    const setupLink = (goal: unknown) => {
      const tx = {
        athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 3 }) },
        trainingPlan: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ trainingPlanId: 9 }),
        },
        trainingPlanRace: { upsert: jest.fn(), updateMany: jest.fn() },
        cycle: { create: jest.fn().mockResolvedValue({ cycleId: 1 }) },
        trainingWeek: {
          create: jest.fn().mockResolvedValue({ trainingWeekId: 1 }),
        },
        event: {
          findFirst: jest.fn().mockResolvedValue(goal),
          create: jest.fn().mockResolvedValue({ training: null }),
        },
      };
      const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
      const service = new TrainingPlanService(
        prisma as unknown as PrismaService,
      );
      return { tx, service };
    };
    const race = (day: string) => ({
      startDate: new Date(`${day}T08:00:00Z`),
      endDate: new Date(`${day}T10:00:00Z`),
      competition: { eventCompetitionId: 77 },
    });

    test('links it as the target race of the new plan', async () => {
      const { tx, service } = setupLink(race('2030-11-02'));
      await service.importSeoPlan(user, fixture(), '2030-10-21', {
        goalEventId: 40,
      });
      expect(tx.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 40, athleteId: 3, type: 'COMPETITION' },
        }),
      );
      expect(tx.trainingPlanRace.upsert).toHaveBeenCalledWith({
        where: {
          trainingPlanId_eventCompetitionId: {
            trainingPlanId: 9,
            eventCompetitionId: 77,
          },
        },
        create: {
          trainingPlanId: 9,
          eventCompetitionId: 77,
          priority: 'TARGET',
        },
        update: { priority: 'TARGET' },
      });
    });

    test('refuses a race of another athlete or outside the plan', async () => {
      const missing = setupLink(null);
      await expect(
        missing.service.importSeoPlan(user, fixture(), '2030-10-21', {
          goalEventId: 40,
        }),
      ).rejects.toThrow('Goal race not found');
      const late = setupLink(race('2030-11-05'));
      await expect(
        late.service.importSeoPlan(user, fixture(), '2030-10-21', {
          goalEventId: 40,
        }),
      ).rejects.toThrow('inside the plan dates');
      expect(late.tx.trainingPlanRace.upsert).not.toHaveBeenCalled();
      const early = setupLink(race('2030-10-20'));
      await expect(
        early.service.importSeoPlan(user, fixture(), '2030-10-21', {
          goalEventId: 40,
        }),
      ).rejects.toThrow('inside the plan dates');
    });

    test('links nothing without a goal race', async () => {
      const { tx, service } = setupLink(race('2030-11-02'));
      await service.importSeoPlan(user, fixture(), '2030-10-21');
      expect(tx.event.findFirst).not.toHaveBeenCalled();
      expect(tx.trainingPlanRace.upsert).not.toHaveBeenCalled();
    });
  });
  describe('replacing a plan with races', () => {
    // The old plan, still in the future, with two sessions in its weeks and
    // a competition and a note there too.
    const past = (day: string) => new Date(`${day}T08:00:00Z`);
    const session = (eventId: number) => ({
      eventId,
      type: 'TRAINING',
      startDate: past('2030-10-22'),
      templates: [],
      training: {
        relatedActivityId: null,
        messageThreadId: null as number | null,
        workout: null,
      },
    });
    const sessions = [session(101), session(102)];
    const inWeeks = [
      ...sessions,
      { eventId: 900, type: 'COMPETITION', startDate: past('2030-11-02') },
      { eventId: 901, type: 'NOTE', startDate: past('2030-10-25') },
    ];
    const link = (
      eventCompetitionId: number,
      day: string,
      priority = 'PREPARATORY',
    ) => ({
      eventCompetitionId,
      priority,
      competition: {
        event: {
          name: `Race ${eventCompetitionId}`,
          startDate: past(day),
          endDate: new Date(`${day}T10:00:00Z`),
        },
      },
    });
    const setupReplace = (links: unknown[], goal: unknown = null) => {
      const tx = {
        athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 3 }) },
        trainingPlan: {
          findFirst: jest.fn(
            async ({ where }: { where: { trainingPlanId?: number } }) =>
              where.trainingPlanId === 9
                ? {
                    trainingPlanId: 9,
                    athleteId: 3,
                    startDate: past('2030-10-14'),
                  }
                : null,
          ),
          update: jest.fn().mockResolvedValue({ trainingPlanId: 9 }),
          create: jest.fn(),
        },
        trainingPlanRace: {
          findMany: jest.fn().mockResolvedValue(links),
          deleteMany: jest.fn(),
          updateMany: jest.fn(),
          upsert: jest.fn(),
        },
        eventTraining: { deleteMany: jest.fn() },
        cycle: {
          deleteMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ cycleId: 1 }),
        },
        trainingWeek: {
          create: jest.fn().mockResolvedValue({ trainingWeekId: 1 }),
        },
        event: {
          // Like the database: the type filter is applied.
          findMany: jest.fn(async ({ where }: { where: { type?: string } }) =>
            inWeeks.filter((event) => !where.type || event.type === where.type),
          ),
          deleteMany: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(goal),
          create: jest.fn().mockResolvedValue({ training: null }),
        },
      };
      const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
      const service = new TrainingPlanService(
        prisma as unknown as PrismaService,
      );
      return { tx, service };
    };
    const replace = (service: TrainingPlanService, goalEventId?: number) =>
      service.importSeoPlan(user, fixture(), '2030-10-21', {
        replacePlanId: 9,
        ...(goalEventId ? { goalEventId } : {}),
      });

    test('replaces only the sessions: competitions and notes stay', async () => {
      const { tx, service } = setupReplace([link(77, '2030-11-02')]);
      await replace(service);
      expect(tx.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'TRAINING' }),
        }),
      );
      expect(tx.eventTraining.deleteMany).toHaveBeenCalledWith({
        where: { eventId: { in: [101, 102] } },
      });
      expect(tx.event.deleteMany).toHaveBeenCalledWith({
        where: { eventId: { in: [101, 102] } },
      });
      // The plan keeps its id, so its race links stay.
      expect(tx.trainingPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { trainingPlanId: 9 } }),
      );
      expect(tx.trainingPlan.create).not.toHaveBeenCalled();
      expect(tx.trainingPlanRace.deleteMany).not.toHaveBeenCalled();
    });

    test('unlinks races outside the new dates, without touching them', async () => {
      // The new plan runs from 2030-10-21 to 2030-11-03.
      const { tx, service } = setupReplace([
        link(77, '2030-11-02'),
        link(78, '2030-11-16', 'TARGET'),
        link(79, '2030-10-20'),
      ]);
      await replace(service);
      expect(tx.trainingPlanRace.deleteMany).toHaveBeenCalledWith({
        where: { trainingPlanId: 9, eventCompetitionId: { in: [78, 79] } },
      });
      const deleted = tx.event.deleteMany.mock.calls.flatMap(
        (call) => call[0].where.eventId.in,
      );
      expect(deleted).not.toContain(900);
    });

    test('links the goal race as the only target race', async () => {
      const { tx, service } = setupReplace([link(77, '2030-11-02', 'TARGET')], {
        startDate: past('2030-11-02'),
        endDate: new Date('2030-11-02T10:00:00Z'),
        competition: { eventCompetitionId: 80 },
      });
      await replace(service, 40);
      expect(tx.trainingPlanRace.updateMany).toHaveBeenCalledWith({
        where: {
          trainingPlanId: 9,
          priority: 'TARGET',
          eventCompetitionId: { not: 80 },
        },
        data: { priority: 'PREPARATORY' },
      });
      expect(tx.trainingPlanRace.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            eventCompetitionId: 80,
            priority: 'TARGET',
          }),
          update: { priority: 'TARGET' },
        }),
      );
    });

    test('still refuses a plan that has started or has history', async () => {
      const started = setupReplace([]);
      started.tx.trainingPlan.findFirst.mockImplementation(
        async ({ where }: { where: { trainingPlanId?: number } }) =>
          where.trainingPlanId === 9
            ? {
                trainingPlanId: 9,
                athleteId: 3,
                startDate: past('2020-01-01'),
              }
            : null,
      );
      await expect(replace(started.service)).rejects.toThrow(
        'Only future plans',
      );
      const commented = setupReplace([]);
      sessions[0].training.messageThreadId = 5;
      await expect(replace(commented.service)).rejects.toThrow(
        'Only future plans',
      );
      sessions[0].training.messageThreadId = null;
      expect(commented.tx.event.deleteMany).not.toHaveBeenCalled();
    });
  });
});
