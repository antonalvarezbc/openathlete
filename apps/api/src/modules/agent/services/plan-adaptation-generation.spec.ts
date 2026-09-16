import { PlanAdaptationRequest, SPORT_TYPE } from '@openathlete/shared';

import { planAdaptationAgent } from '../../../mastra/agents/plan-adaptation.agent';
import { PrismaService } from '../../prisma/services/prisma.service';
import { PlanAdaptationService } from './plan-adaptation.service';

jest.mock('../../../mastra/agents/plan-adaptation.agent', () => ({
  planAdaptationAgent: { generate: jest.fn() },
}));

const user = {
  userId: 3,
  email: 'qa@openathlete.test',
  athlete: { athleteId: 3 },
};
const request: PlanAdaptationRequest = {
  athleteId: 4,
  planId: 1,
  scope: 'NEXT_SESSION',
  weekStart: '2030-10-21',
  timeZone: 'Europe/Madrid',
  readiness: 'READY',
  currentState: 'QA current state',
  instructions: '',
  allowIncrease: false,
  maxIncreasePercent: 10,
};
const original = {
  eventId: 9,
  action: 'KEEP' as const,
  reason: 'Original',
  name: 'QA',
  sport: SPORT_TYPE.RUNNING,
  description: '',
  goalDuration: 1800,
  goalDistance: 4000,
  goalElevationGain: 100,
  goalRpe: 3,
  workout: null,
};

describe('Proposal generation is read-only', () => {
  afterEach(() => jest.restoreAllMocks());
  test('passes athlete state and context to the model without opening a write transaction', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new PlanAdaptationService(
      prisma as unknown as PrismaService,
    );
    const context = {
      contextVersion: 'a'.repeat(64),
      data: {
        currentState: request.currentState,
        plan: { goal: 'QA trail goal' },
        activities: [{ rpe: 7 }],
        metrics: [
          { type: 'HRV_LAST_NIGHT_AVG', value: 42, date: '2030-10-20' },
        ],
        injuries: [],
        zones: [],
        surroundingCalendar: [],
        sessions: [
          {
            original,
            startDate: '2030-10-22T07:00:00Z',
            endDate: '2030-10-22T07:30:00Z',
            exported: false,
          },
        ],
      },
    };
    jest
      .spyOn(service, 'context')
      .mockResolvedValue(
        context as unknown as Awaited<ReturnType<typeof service.context>>,
      );
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValue({
      object: { summary: 'Keep unchanged', warnings: [], sessions: [original] },
    });
    const result = await service.propose(user, request);
    expect(result.proposal!.sessions[0].eventId).toBe(9);
    const prompt = JSON.parse(
      (planAdaptationAgent.generate as jest.Mock).mock.calls.at(-1)[0],
    );
    expect(prompt.currentState).toBe('QA current state');
    expect(prompt.plan.goal).toBe('QA trail goal');
    expect(prompt.activities[0].rpe).toBe(7);
    expect(prompt.metrics[0].type).toBe('HRV_LAST_NIGHT_AVG');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('rejects unauthorized context before contacting the model', async () => {
    const prisma = {
      athlete: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PlanAdaptationService(
      prisma as unknown as PrismaService,
    );
    (planAdaptationAgent.generate as jest.Mock).mockClear();
    await expect(service.propose(user, request)).rejects.toThrow(
      'cannot manage',
    );
    expect(planAdaptationAgent.generate).not.toHaveBeenCalled();
  });
});

describe('Interface language takes precedence over athlete language', () => {
  test.each(['es', undefined] as const)(
    'uses requested language or requesting user fallback: %s',
    async (language) => {
      const prisma = {
        athlete: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ athleteId: 4, user: { language: 'fr' } }),
        },
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ language: 'es' }),
        },
        trainingPlan: {
          findFirst: jest.fn().mockResolvedValue({
            startDate: new Date('2030-10-21'),
            endDate: new Date('2030-10-28'),
          }),
        },
        event: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              {
                eventId: 9,
                name: 'QA',
                startDate: new Date('2030-10-22T07:00:00Z'),
                endDate: new Date('2030-10-22T07:30:00Z'),
                trainingWeek: {
                  startDate: new Date('2030-10-21'),
                  endDate: new Date('2030-10-28'),
                },
                training: { ...original, goalRpe: 0.3, workout: null },
              },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                eventId: 88,
                name: 'Other planned session',
                type: 'TRAINING',
                startDate: new Date('2030-10-23T07:00:00Z'),
                endDate: new Date('2030-10-23T08:00:00Z'),
                trainingWeekId: 5,
                trainingWeek: { cycle: { trainingPlanId: 2 } },
                training: {
                  ...original,
                  description: 'Technical descents; easy effort',
                  goalRpe: 0.4,
                  workout: {
                    steps: [
                      {
                        stepType: 'STEADY',
                        name: 'Trail technique',
                        notes: 'Short strides',
                        durationType: 'TIME',
                        durationValue: 600,
                        targets: [],
                        repeatBlock: null,
                      },
                    ],
                  },
                },
              },
            ])
            .mockResolvedValue([]),
        },
        athleteMetric: { findMany: jest.fn().mockResolvedValue([]) },
        athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
        trainingZone: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new PlanAdaptationService(
        prisma as unknown as PrismaService,
      );
      const result = await service.context(
        user,
        { ...request, language },
        undefined,
        new Date('2030-10-21'),
      );
      expect(result.data.language).toBe('es');
      expect(result.data.surroundingCalendar[0]).toMatchObject({
        description: 'Technical descents; easy effort',
        planId: 2,
        editable: false,
        workout: {
          steps: [
            {
              name: 'Trail technique',
              notes: 'Short strides',
              durationValue: 600,
            },
          ],
        },
      });
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledTimes(
        language ? 0 : 1,
      );
    },
  );
});

describe('Applying reviewed dates', () => {
  test('persists the proposed start and recomputes the end inside the transaction', async () => {
    const tx = {
      eventTraining: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ eventTrainingId: 99 }),
      },
      workout: { deleteMany: jest.fn() },
      event: { update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(tx)) };
    const service = new PlanAdaptationService(
      prisma as unknown as PrismaService,
    );
    jest.spyOn(service, 'context').mockResolvedValue({
      contextVersion: 'a'.repeat(64),
      data: {
        sessions: [
          {
            original,
            startDate: '2030-10-22T07:00:00Z',
            endDate: '2030-10-22T07:30:00Z',
            exported: false,
            rescheduleStart: '2030-10-21T00:00:00Z',
            rescheduleEnd: '2030-10-28T00:00:00Z',
          },
        ],
        injuries: [],
        zones: [],
        surroundingCalendar: [],
      },
    } as unknown as Awaited<ReturnType<typeof service.context>>);
    await service.apply(user, {
      request: { ...request, allowRedistribution: true },
      contextVersion: 'a'.repeat(64),
      confirmed: true,
      proposal: {
        summary: 'Move for recovery',
        warnings: [],
        sessions: [
          {
            ...original,
            action: 'UPDATE',
            startDate: '2030-10-23T09:00:00+02:00',
          },
        ],
      },
    });
    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 9 },
        data: expect.objectContaining({
          startDate: new Date('2030-10-23T07:00:00Z'),
          endDate: new Date('2030-10-23T07:30:00Z'),
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Refining proposals without calendar writes', () => {
  beforeEach(() => jest.clearAllMocks());
  function setup() {
    const prisma = { $transaction: jest.fn() };
    const service = new PlanAdaptationService(
      prisma as unknown as PrismaService,
    );
    const context = {
      contextVersion: 'a'.repeat(64),
      data: {
        language: 'es',
        injuries: [],
        zones: [],
        surroundingCalendar: [],
        sessions: [
          {
            original,
            startDate: '2030-10-22T07:00:00Z',
            endDate: '2030-10-22T07:30:00Z',
            exported: false,
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof service.context>>;
    jest.spyOn(service, 'context').mockResolvedValue(context);
    const proposal = {
      summary: 'Original draft',
      warnings: [],
      sessions: [original],
    };
    const dto = {
      request,
      contextVersion: context.contextVersion,
      proposal,
      feedback: 'Explica el jueves',
      history: [
        { feedback: 'Mantén el domingo', summary: 'Domingo conservado' },
      ],
    };
    return { prisma, service, context, dto };
  }
  test('sends draft, feedback and history and returns a full validated revision without writes', async () => {
    const { prisma, service, dto } = setup();
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValue({
      object: { ...dto.proposal, summary: 'Explicación en español' },
    });
    const result = await service.refine(user, dto);
    const prompt = JSON.parse(
      (planAdaptationAgent.generate as jest.Mock).mock.calls[0][0],
    );
    expect(prompt.revision).toEqual({
      previousProposal: dto.proposal,
      feedback: dto.feedback,
      history: dto.history,
      validationIssue: null,
    });
    expect(prompt.language).toBe('es');
    expect(result.proposal!.summary).toBe('Explicación en español');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('returns a readable invalid draft and sends the violation back for correction', async () => {
    const { prisma, service, dto } = setup();
    const invalid = {
      ...dto.proposal,
      sessions: [{ ...original, description: 'Changed while KEEP' }],
    };
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValue({
      object: invalid,
    });
    const draft = await service.propose(user, request);
    expect(draft.validationIssue).toMatchObject({
      code: 'ADAPTATION_KEEP',
      sessionName: 'QA',
    });
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValue({
      object: dto.proposal,
    });
    const corrected = await service.refine(user, {
      ...dto,
      proposal: draft.proposal,
    });
    const prompt = JSON.parse(
      (planAdaptationAgent.generate as jest.Mock).mock.calls.at(-1)[0],
    );
    expect(prompt.revision.validationIssue.code).toBe('ADAPTATION_KEEP');
    expect(corrected.validationIssue).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('cannot apply a readable draft with a violation even with confirmation', async () => {
    const { prisma, service, dto } = setup();
    const write = jest.fn();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({ event: { update: write } }),
    );
    const invalid = {
      ...dto.proposal,
      sessions: [{ ...original, description: 'Changed while KEEP' }],
    };
    await expect(
      service.apply(user, {
        request,
        contextVersion: dto.contextVersion,
        proposal: invalid,
        confirmed: true,
      }),
    ).rejects.toThrow('KEEP');
    expect(write).not.toHaveBeenCalled();
  });
  test('rejects stale context before contacting the model', async () => {
    const { service, dto } = setup();
    dto.contextVersion = 'b'.repeat(64);
    await expect(service.refine(user, dto)).rejects.toThrow('changed');
    expect(planAdaptationAgent.generate).not.toHaveBeenCalled();
  });
  test('keeps the original baseline across rounds rather than compounding increases', async () => {
    const { prisma, service, dto } = setup();
    dto.request = { ...request, allowIncrease: true };
    const previous = {
      ...original,
      action: 'UPDATE' as const,
      goalDuration: 1980,
    };
    const submitted = {
      ...dto,
      proposal: { ...dto.proposal, sessions: [previous] },
    };
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValue({
      object: {
        ...dto.proposal,
        sessions: [{ ...previous, goalDuration: 2178 }],
      },
    });
    const result = await service.refine(user, submitted);
    expect(result.validationIssue).toMatchObject({
      code: 'ADAPTATION_INCREASE',
      sessionName: 'QA',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test.each([['Provider connection failure', 'ADAPTATION_PROVIDER']])(
    'maps SDK failure to a localized error code: %s',
    async (message, code) => {
      const { prisma, service, dto } = setup();
      (planAdaptationAgent.generate as jest.Mock).mockRejectedValue(
        new Error(message),
      );
      try {
        await service.refine(user, dto);
        throw new Error('Expected failure');
      } catch (error) {
        expect(
          (error as { getResponse: () => unknown }).getResponse(),
        ).toMatchObject({ code });
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  test('recovers SDK model output, supports repair, and never returns error metadata', async () => {
    const { service, dto, prisma } = setup();
    const error = Object.assign(
      new Error('Structured output validation failed SECRET'),
      {
        details: { value: '{"summary":"Incomplete draft"}', headers: 'SECRET' },
      },
    );
    (planAdaptationAgent.generate as jest.Mock).mockRejectedValueOnce(error);
    const draft = await service.propose(user, request);
    expect(draft.proposal).toBeNull();
    expect(draft.rawResponse).toBe('{"summary":"Incomplete draft"}');
    expect(JSON.stringify(draft)).not.toContain('SECRET');
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValueOnce({
      object: dto.proposal,
    });
    const repaired = await service.refine(user, {
      ...dto,
      proposal: null,
      rawResponse: draft.rawResponse,
    });
    expect(repaired.proposal).not.toBeNull();
    const prompt = JSON.parse(
      (planAdaptationAgent.generate as jest.Mock).mock.calls.at(-1)[0],
    );
    expect(prompt.revision.rawResponse).toBe(draft.rawResponse);
    expect(prompt.revision.validationIssue.code).toBe(
      'ADAPTATION_MODEL_INVALID',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('keeps the repair flow available if SDK output is unavailable', async () => {
    const { service } = setup();
    (planAdaptationAgent.generate as jest.Mock).mockRejectedValueOnce(
      new Error('Structured output validation failed'),
    );
    const result = await service.propose(user, request);
    expect(result.proposal).toBeNull();
    expect(result.rawResponse).toBe('');
  });
  test('invalid revised output is rejected without saving', async () => {
    const { prisma, service, dto } = setup();
    (planAdaptationAgent.generate as jest.Mock).mockResolvedValue({
      object: { summary: 'invalid' },
    });
    const result = await service.refine(user, dto);
    expect(result.proposal).toBeNull();
    expect(result.rawResponse).toContain('invalid');
    expect(result.validationIssue?.code).toBe('ADAPTATION_MODEL_INVALID');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
