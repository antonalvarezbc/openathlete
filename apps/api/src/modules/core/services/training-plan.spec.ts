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
});
