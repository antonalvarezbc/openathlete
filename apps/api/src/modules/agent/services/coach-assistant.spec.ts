import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  METRIC_TYPE,
  coachAssistantChatSchema,
  coachAssistantContextSchema,
} from '@openathlete/shared';

import { coachAssistantAgent } from '../../../mastra/agents/coach-assistant.agent';
import { disabledAiMemory } from '../../ai-memory/ai-memory.testing';
import type { AiToolsService } from '../../ai-tools/ai-tools.service';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { CoachAssistantService } from './coach-assistant.service';
import { PlanAdaptationService } from './plan-adaptation.service';

jest.mock('../../../mastra/agents/coach-assistant.agent', () => ({
  coachAssistantAgent: { generate: jest.fn() },
}));
jest.mock('../../ai-tools/ai-tools.service', () => ({
  AiToolsService: class {},
}));
jest.mock('../../../mastra/tools/openathlete-data.tools', () => ({
  aiToolsRuntimeContext: jest.fn(() => 'runtime-context'),
}));
jest.mock('../../../mastra/agents/plan-adaptation.agent', () => ({
  planAdaptationAgent: { generate: jest.fn() },
}));

const user = { userId: 3, roles: ['COACH'] } as AuthUser;
const input = coachAssistantChatSchema.parse({
  athleteId: 4,
  planId: 1,
  weekStart: '2030-10-21',
  timeZone: 'Europe/Madrid',
  language: 'es',
  currentState: 'Legs tired',
  question: 'What is missing before planning?',
});
function setup() {
  const db = {
    athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 4 }) },
    trainingPlan: {
      findFirst: jest.fn().mockResolvedValue({
        trainingPlanId: 1,
        name: 'Trail plan',
        goal: 'Finish a trail race',
        startDate: new Date('2030-10-01'),
        endDate: new Date('2030-11-01'),
        status: 'ACTIVE',
      }),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    athleteMetric: {
      findMany: jest.fn().mockResolvedValue([
        {
          type: METRIC_TYPE.HR_REST,
          value: 60,
          date: new Date('2030-10-20'),
        },
      ]),
    },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    trainingZone: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  const memory = disabledAiMemory();
  const adaptation = new PlanAdaptationService(
    db as unknown as PrismaService,
    memory,
  );
  return {
    db,
    adaptation,
    memory,
    service: new CoachAssistantService(adaptation, memory, {
      run: jest.fn(),
    } as unknown as AiToolsService),
  };
}
beforeEach(() => jest.clearAllMocks());

test('consultation works without pending sessions while adaptation still rejects them', async () => {
  const { service, adaptation, db } = setup();
  const { question: _question, history: _history, ...selection } = input;
  const context = await service.context(user, selection);
  expect(context.data.sessions).toEqual([]);
  expect(context.data.plan.goal).toBe('Finish a trail race');
  expect(context.data.allowIncrease).toBe(false);
  expect(db.$transaction).not.toHaveBeenCalled();
  await expect(
    adaptation.context(user, {
      ...selection,
      scope: 'WEEK',
      readiness: 'UNKNOWN',
      instructions: '',
      allowIncrease: false,
      maxIncreasePercent: 0,
    }),
  ).rejects.toThrow();
  expect(coachAssistantAgent.generate).not.toHaveBeenCalled();
});
test('rejects athlete-only users and unlinked athletes before invoking AI', async () => {
  const { service, db } = setup();
  await expect(
    service.chat({ ...user, roles: ['ATHLETE'] }, input),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.athlete.findFirst).not.toHaveBeenCalled();
  db.athlete.findFirst.mockResolvedValue(null);
  await expect(service.chat(user, input)).rejects.toBeInstanceOf(
    ForbiddenException,
  );
  expect(db.athlete.findFirst.mock.calls[0][0].where).toEqual({
    athleteId: 4,
    OR: [{ coachAthletes: { some: { userId: 3 } } }],
  });
  expect(coachAssistantAgent.generate).not.toHaveBeenCalled();
});
test('rejects a plan that does not belong to the selected athlete', async () => {
  const { service, db } = setup();
  db.trainingPlan.findFirst.mockResolvedValue(null);
  await expect(service.chat(user, input)).rejects.toBeInstanceOf(
    ForbiddenException,
  );
  expect(db.trainingPlan.findFirst.mock.calls[0][0].where).toEqual({
    trainingPlanId: 1,
    athleteId: 4,
  });
  expect(coachAssistantAgent.generate).not.toHaveBeenCalled();
});
test('answers with fresh authorized context and bounded conversation, without writes', async () => {
  const { service, db } = setup();
  const generate = coachAssistantAgent.generate as jest.Mock;
  generate.mockResolvedValue({ text: 'Faltan las sensaciones de hoy.' });
  const result = await service.chat(user, input);
  expect(result.reply).toBe('Faltan las sensaciones de hoy.');
  // Data tools run as the requesting user, with a bounded number of steps.
  expect(generate.mock.calls[0][1]).toEqual({
    runtimeContext: 'runtime-context',
    maxSteps: 6,
  });
  expect(JSON.parse(generate.mock.calls[0][0])).toMatchObject({
    language: 'es',
    question: input.question,
    context: { currentState: 'Legs tired', metrics: [{ value: 60 }] },
  });
  db.athleteMetric.findMany.mockResolvedValue([
    { type: METRIC_TYPE.HR_REST, value: 62, date: new Date('2030-10-21') },
  ]);
  await service.chat(user, {
    ...input,
    question: 'Anything changed?',
    history: [{ question: input.question, answer: result.reply }],
  });
  expect(db.athlete.findFirst).toHaveBeenCalledTimes(2);
  expect(JSON.parse(generate.mock.calls[1][0]).context.metrics[0].value).toBe(
    62,
  );
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(db.event.create).not.toHaveBeenCalled();
  expect(db.event.update).not.toHaveBeenCalled();
});
test.each(['', 'x'.repeat(8001)])(
  'rejects unusable model replies',
  async (text) => {
    const { service } = setup();
    (coachAssistantAgent.generate as jest.Mock).mockResolvedValue({ text });
    await expect(service.chat(user, input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  },
);
test('does not expose provider error contents', async () => {
  const { service } = setup();
  (coachAssistantAgent.generate as jest.Mock).mockRejectedValue(
    new Error('secret upstream diagnostics'),
  );
  try {
    await service.chat(user, input);
    throw new Error('Expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      code: 'COACH_ASSISTANT_PROVIDER',
    });
  }
});
test('rejects excessive conversation, blank questions and injected permissions', () => {
  expect(
    coachAssistantChatSchema.safeParse({ ...input, question: ' ' }).success,
  ).toBe(false);
  expect(
    coachAssistantChatSchema.safeParse({
      ...input,
      history: Array(9).fill({ question: 'Q', answer: 'A' }),
    }).success,
  ).toBe(false);
  expect(
    coachAssistantChatSchema.safeParse({ ...input, allowIncrease: true })
      .success,
  ).toBe(false);
  expect(
    coachAssistantContextSchema.safeParse({
      athleteId: 4,
      planId: 1,
      weekStart: '2030-10-21',
      timeZone: 'Europe/Madrid',
    }).success,
  ).toBe(true);
});
