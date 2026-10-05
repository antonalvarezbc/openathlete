import { BadRequestException, ForbiddenException } from '@nestjs/common';

import {
  PlanAdaptationProposal,
  PlanAdaptationRequest,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
} from '@openathlete/shared';

import { disabledAiMemory } from '../../ai-memory/ai-memory.testing';
import { aiResolverStandIn, aiServiceStandIn } from '../../ai/ai.testing';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { adaptationWeek } from './adaptation-dates';
import { PlanAdaptationService } from './plan-adaptation.service';
import { validateAdaptation } from './plan-adaptation.validation';

jest.mock('../../../mastra/agents/plan-adaptation.agent', () => ({
  planAdaptationAgent: { id: 'plan-adaptation' },
}));
jest.mock('../../ai', () => ({
  AiModelResolverService: class {},
  AiService: class {},
}));

const user = { userId: 3, roles: ['COACH'] } as AuthUser;
const now = new Date('2030-10-21T12:00:00Z');
const request: PlanAdaptationRequest = {
  athleteId: 4,
  planId: 1,
  scope: 'WEEK',
  weekStart: '2030-10-21',
  timeZone: 'Europe/Madrid',
  readiness: 'READY',
  currentState: 'Rested',
  instructions: '',
  allowIncrease: false,
  maxIncreasePercent: 10,
};
const range = adaptationWeek(request.weekStart, request.timeZone);
const planWeek = {
  trainingWeekId: 70,
  startDate: new Date('2030-10-21T00:00:00Z'),
  endDate: new Date('2030-10-24T00:00:00Z'),
  cycle: {
    trainingPlanId: 1,
    trainingPlan: {
      startDate: new Date('2030-10-01T00:00:00Z'),
      endDate: new Date('2030-11-30T00:00:00Z'),
    },
  },
};
const session = (eventId: number, day: number, trainingWeek: unknown) => ({
  eventId,
  name: `Run ${eventId}`,
  type: 'TRAINING',
  startDate: new Date(`2030-10-${day}T07:00:00Z`),
  endDate: new Date(`2030-10-${day}T08:00:00Z`),
  trainingWeekId: trainingWeek ? planWeek.trainingWeekId : null,
  trainingWeek,
  training: {
    sport: SPORT_TYPE.RUNNING,
    description: '',
    goalDuration: 3600,
    goalDistance: null,
    goalElevationGain: null,
    goalRpe: 0.3,
    relatedActivityId: null,
    workout: null,
  },
});

function setup(
  sessions: unknown[] = [
    // Planned in a plan week, and one added by hand in the calendar.
    session(9, 22, planWeek),
    session(10, 25, null),
  ],
) {
  const db = {
    athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 4 }) },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ language: 'es' }),
    },
    trainingPlan: {
      findFirst: jest.fn().mockResolvedValue({
        trainingPlanId: 1,
        name: 'Trail plan',
        goal: 'Finish a trail race',
        description: null,
        startDate: new Date('2030-10-01T00:00:00Z'),
        endDate: new Date('2030-11-30T00:00:00Z'),
        status: 'ACTIVE',
      }),
    },
    trainingWeek: {
      findMany: jest.fn().mockResolvedValue([
        {
          trainingWeekId: 70,
          startDate: planWeek.startDate,
          endDate: planWeek.endDate,
        },
      ]),
    },
    event: {
      findMany: jest.fn(async ({ where }: { where: { type: unknown } }) =>
        where.type === 'TRAINING' ? sessions : [],
      ),
    },
    athleteMetric: { findMany: jest.fn().mockResolvedValue([]) },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    trainingZone: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new PlanAdaptationService(
    db as unknown as PrismaService,
    disabledAiMemory(),
    aiResolverStandIn() as never,
    aiServiceStandIn(jest.fn()),
  );
  const context = (input: Partial<PlanAdaptationRequest> = {}) =>
    service.context(
      user,
      { ...request, ...input },
      db as unknown as PrismaService,
      now,
    );
  return { db, context };
}

describe('Adapting the real calendar', () => {
  test('takes every upcoming session, linked to a plan week or not', async () => {
    const { db, context } = setup();
    const { data } = await context();
    const where = db.event.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('trainingWeek');
    expect(where).toMatchObject({ athleteId: 4, type: 'TRAINING' });
    expect(data.sessions.map((item) => item.original.eventId)).toEqual([9, 10]);
    // A planned session stays in its plan week; one added by hand can move
    // anywhere in the selected period.
    expect(data.sessions[0]).toMatchObject({
      rescheduleStart: now.toISOString(),
      rescheduleEnd: planWeek.endDate.toISOString(),
    });
    expect(data.sessions[1]).toMatchObject({
      rescheduleStart: now.toISOString(),
      rescheduleEnd: range.end.toISOString(),
    });
  });

  test('a session in another plan stays inside that plan', async () => {
    const otherPlan = {
      ...planWeek,
      endDate: new Date('2030-10-30T00:00:00Z'),
      cycle: {
        trainingPlanId: 2,
        trainingPlan: {
          startDate: new Date('2030-10-23T00:00:00Z'),
          endDate: new Date('2030-10-26T00:00:00Z'),
        },
      },
    };
    const { context } = setup([session(11, 24, otherPlan)]);
    const { data } = await context();
    expect(data.sessions[0]).toMatchObject({
      rescheduleStart: '2030-10-23T00:00:00.000Z',
      rescheduleEnd: '2030-10-26T00:00:00.000Z',
    });
  });

  test('works without a plan, with new sessions in the selected period', async () => {
    const { db, context } = setup();
    const { data } = await context({
      planId: undefined,
      allowNewSessions: true,
      maxNewSessions: 1,
      newSessionMinutes: 30,
      newSessionMaxRpe: 4,
    });
    expect(db.trainingPlan.findFirst).not.toHaveBeenCalled();
    expect(db.trainingWeek.findMany).not.toHaveBeenCalled();
    expect(data.plan).toBeNull();
    expect(data.sessions).toHaveLength(2);
    expect(data.availableWeeks).toEqual([
      {
        trainingWeekId: null,
        startDate: now.toISOString(),
        endDate: range.end.toISOString(),
      },
    ]);
  });

  test('with a plan, new sessions still go into its weeks', async () => {
    const { db, context } = setup();
    const { data } = await context({
      allowNewSessions: true,
      maxNewSessions: 1,
      newSessionMinutes: 30,
      newSessionMaxRpe: 4,
    });
    expect(db.trainingWeek.findMany.mock.calls[0][0].where.cycle).toEqual({
      trainingPlanId: 1,
    });
    expect(data.availableWeeks).toEqual([
      {
        trainingWeekId: 70,
        startDate: now.toISOString(),
        endDate: planWeek.endDate.toISOString(),
      },
    ]);
    db.trainingWeek.findMany.mockResolvedValue([]);
    await expect(
      context({
        allowNewSessions: true,
        maxNewSessions: 1,
        newSessionMinutes: 30,
        newSessionMaxRpe: 4,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  test('still refuses a plan of another athlete', async () => {
    const { db, context } = setup();
    db.trainingPlan.findFirst.mockResolvedValue(null);
    await expect(context({ planId: 99 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.trainingPlan.findFirst.mock.calls[0][0].where).toEqual({
      trainingPlanId: 99,
      athleteId: 4,
    });
  });
});

describe('New sessions without a plan', () => {
  const addition = (trainingWeekId: number | null): PlanAdaptationProposal => ({
    summary: 'Add an easy session',
    warnings: [],
    sessions: [],
    newSessions: [
      {
        trainingWeekId,
        startDate: '2030-10-23T07:00:00Z',
        reason: 'Recovered',
        name: 'Easy spin',
        sport: SPORT_TYPE.CYCLING,
        description: '',
        goalDuration: 1800,
        goalRpe: 3,
        workout: {
          steps: [
            {
              stepType: WORKOUT_STEP_TYPE.STEADY,
              name: null,
              notes: null,
              durationType: WORKOUT_DURATION_TYPE.TIME,
              durationValue: 1800,
              targets: [],
              repeatBlock: null,
            },
          ],
        },
      },
    ],
  });
  const allowed = {
    ...request,
    planId: undefined,
    allowNewSessions: true,
    maxNewSessions: 1,
    newSessionMinutes: 30,
    newSessionMaxRpe: 4,
  };
  const context = (trainingWeekId: number | null) =>
    ({
      sessions: [],
      injuries: [],
      zones: [],
      surroundingCalendar: [],
      availableWeeks: [
        {
          trainingWeekId,
          startDate: now.toISOString(),
          endDate: range.end.toISOString(),
        },
      ],
    }) as never;

  test('go into the calendar period', () => {
    expect(() =>
      validateAdaptation(allowed, context(null), addition(null)),
    ).not.toThrow();
  });

  test('cannot claim a plan week that is not offered', () => {
    expect(() =>
      validateAdaptation(allowed, context(null), addition(70)),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAdaptation(allowed, context(70), addition(null)),
    ).toThrow(BadRequestException);
  });
});
