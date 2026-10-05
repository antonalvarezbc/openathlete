import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  ActivityAnalysisResult,
  AiErrorCode,
  AiTask,
  activityAnalysisRequestSchema,
  activityAnalysisResultSchema,
} from '@openathlete/shared';

import {
  ACTIVITY_ANALYSIS_PROMPT_VERSION,
  activityAnalysisAgent,
} from '../../../mastra/agents/activity-analysis.agent';
import { disabledAiMemory } from '../../ai-memory/ai-memory.testing';
import { AiProviderException } from '../../ai/ai.errors';
import { aiResolverStandIn, aiServiceStandIn } from '../../ai/ai.testing';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { buildActivityAnalysisContext } from './activity-analysis-context';
import { ActivityAnalysisService } from './activity-analysis.service';

jest.mock('../../ai', () => ({
  AiModelResolverService: class {},
  AiService: class {},
}));
// The model, behind a stand-in AiService on the coach's own settings.
const generate = jest.fn();
// The coach's model the analysis is recorded with.
const MODEL = 'anthropic/claude-opus-5-5';
jest.mock('../../../mastra/agents/activity-analysis.agent', () => ({
  activityAnalysisAgent: { id: 'coach-activity-analysis' },
  ACTIVITY_ANALYSIS_PROMPT_VERSION: 'test-prompt-version',
}));
jest.mock('./activity-analysis-context', () => ({
  buildActivityAnalysisContext: jest.fn(),
}));

const coach: AuthUser = {
  userId: 3,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: null,
};
const input = activityAnalysisRequestSchema.parse({
  language: 'es',
  coachContext: 'Compare perceived effort with the prescribed easy session.',
});
const analysis: ActivityAnalysisResult = {
  summary: 'The easy run lasted 35 minutes.',
  planComparison: 'Five minutes longer than the prescribed 30 minutes.',
  highlights: ['The activity was completed.'],
  concerns: ['The reported RPE was higher than prescribed.'],
  nextSteps: ['Review recovery before prescribing the next session.'],
  dataGaps: ['Recovery metrics are unavailable.'],
  athleteFeedback: 'Thank you for logging your effort. How do your legs feel?',
};
const snapshot = {
  language: 'es',
  coachContext: input.coachContext,
  activity: { eventId: 42, duration: 2100, rpe: 6 },
  plannedSession: { duration: 1800, rpe: 3 },
};
const createdAt = new Date('2030-09-24T10:00:00Z');
const row = {
  activityAnalysisId: 81,
  eventActivityId: 17,
  coachUserId: coach.userId,
  coachContext: input.coachContext,
  language: input.language,
  analysis,
  feedbackDraft: analysis.athleteFeedback,
  contextSnapshot: snapshot,
  model: MODEL,
  promptVersion: ACTIVITY_ANALYSIS_PROMPT_VERSION,
  createdAt,
  updatedAt: createdAt,
};

function setup() {
  const linkedActivity = { athleteId: 7, activity: { eventActivityId: 17 } };
  const tx = {
    event: {
      findFirst: jest.fn().mockResolvedValue(linkedActivity),
      update: jest.fn(),
      create: jest.fn(),
    },
    coachActivityAnalysis: {
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ ...row, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        ...row,
        feedbackDraft: 'Coach-edited feedback.',
      }),
    },
  };
  const db = {
    event: {
      findFirst: jest.fn().mockResolvedValue(linkedActivity),
      update: jest.fn(),
      create: jest.fn(),
    },
    coachActivityAnalysis: { findMany: jest.fn().mockResolvedValue([row]) },
    $transaction: jest
      .fn()
      .mockImplementation(async (callback) => callback(tx)),
  };
  const memory = disabledAiMemory();
  const resolver = aiResolverStandIn();
  const ai = aiServiceStandIn(generate);
  return {
    db,
    tx,
    memory,
    resolver,
    ai,
    service: new ActivityAnalysisService(
      db as unknown as PrismaService,
      memory,
      resolver as never,
      ai,
    ),
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  (buildActivityAnalysisContext as jest.Mock).mockResolvedValue(snapshot);
  generate.mockResolvedValue({
    object: analysis,
  });
});

describe('activity analysis authorization and private history', () => {
  test.each(['list', 'context', 'generate', 'updateFeedback'] as const)(
    'rejects athlete-only %s before activity lookup or model access',
    async (operation) => {
      const { service, db, tx } = setup();
      const athlete = { ...coach, roles: ['ATHLETE'] as AuthUser['roles'] };
      const result =
        operation === 'list'
          ? service.list(athlete, 42)
          : operation === 'updateFeedback'
            ? service.updateFeedback(athlete, 42, 81, {
                feedbackDraft: 'Changed',
              })
            : service[operation](athlete, 42, input);
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.event.findFirst).not.toHaveBeenCalled();
      expect(tx.event.findFirst).not.toHaveBeenCalled();
      expect(buildActivityAnalysisContext).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(tx.coachActivityAnalysis.updateMany).not.toHaveBeenCalled();
    },
  );

  test('restricts coach access to a linked completed activity before building context', async () => {
    const { service, db } = setup();
    expect(await service.context(coach, 42, input)).toEqual({ data: snapshot });
    expect(db.event.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 42,
        type: 'ACTIVITY',
        athlete: { OR: [{ coachAthletes: { some: { userId: 3 } } }] },
      },
      select: {
        athleteId: true,
        activity: { select: { eventActivityId: true } },
      },
    });
    expect(buildActivityAnalysisContext).toHaveBeenCalledWith(
      db,
      42,
      input.coachContext,
      'es',
    );
    expect(generate).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('allows self-analysis only when the coach also has the athlete role', async () => {
    const { service, db } = setup();
    await service.list({ ...coach, roles: ['COACH', 'ATHLETE'] }, 42);
    expect(db.event.findFirst.mock.calls[0][0].where.athlete.OR).toEqual([
      { coachAthletes: { some: { userId: 3 } } },
      { userId: 3 },
    ]);
  });

  test.each([null, { activity: null }])(
    'rejects inaccessible or non-activity events before sending data to the model',
    async (event) => {
      const { service, db, tx } = setup();
      db.event.findFirst.mockResolvedValue(event);
      await expect(service.generate(coach, 42, input)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(buildActivityAnalysisContext).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(tx.coachActivityAnalysis.create).not.toHaveBeenCalled();
    },
  );

  test("lists only this coach's analyses of the authorized activity, newest first", async () => {
    const { service, db } = setup();
    const result = await service.list(coach, 42);
    expect(db.coachActivityAnalysis.findMany).toHaveBeenCalledWith({
      where: { eventActivityId: 17, coachUserId: 3 },
      orderBy: [{ createdAt: 'desc' }, { activityAnalysisId: 'desc' }],
      take: 20,
    });
    expect(result).toEqual([
      expect.objectContaining({
        eventId: 42,
        activityAnalysisId: 81,
        analysis,
        feedbackDraft: analysis.athleteFeedback,
        contextSnapshot: snapshot,
        createdAt: createdAt.toISOString(),
      }),
    ]);
    expect(result[0]).not.toHaveProperty('coachUserId');
    expect(result[0]).not.toHaveProperty('eventActivityId');
  });
});

describe('validated generation and failure isolation', () => {
  test('saves validated analysis, a context snapshot and a separate editable feedback draft', async () => {
    const { service, db, tx, ai, resolver } = setup();
    const result = await service.generate(coach, 42, input);
    // The analysis agent, through AiService, on the coach's own model.
    expect(resolver.resolveForUser).toHaveBeenCalledWith(
      AiTask.ACTIVITY_ANALYSIS,
      3,
    );
    expect(ai.generateObject).toHaveBeenCalledWith(
      activityAnalysisAgent,
      expect.objectContaining({ task: AiTask.ACTIVITY_ANALYSIS, userId: 3 }),
      JSON.stringify(snapshot),
      activityAnalysisResultSchema,
    );
    expect(tx.coachActivityAnalysis.create).toHaveBeenCalledWith({
      data: {
        eventActivityId: 17,
        coachUserId: 3,
        coachContext: input.coachContext,
        language: 'es',
        analysis,
        feedbackDraft: analysis.athleteFeedback,
        contextSnapshot: snapshot,
        model: MODEL,
        promptVersion: ACTIVITY_ANALYSIS_PROMPT_VERSION,
      },
    });
    const savedSnapshot =
      tx.coachActivityAnalysis.create.mock.calls[0][0].data.contextSnapshot;
    expect(savedSnapshot).not.toBe(snapshot);
    expect(savedSnapshot.activity).not.toBe(snapshot.activity);
    expect(result.analysis).toEqual(analysis);
    expect(result.feedbackDraft).toBe(analysis.athleteFeedback);
    expect(result.model).toBe(MODEL);
    expect(db.event.update).not.toHaveBeenCalled();
    expect(db.event.create).not.toHaveBeenCalled();
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(tx.event.create).not.toHaveBeenCalled();
  });

  test('adds coach memory to the prompt and snapshot, then records a note', async () => {
    const { service, memory, tx } = setup();
    const aiMemory = {
      mode: 'COMPACT',
      summary: '- Knee sensitive on descents',
      recentNotes: [],
      recentAthleteFeedback: [],
    };
    memory.getCoachMemory.mockResolvedValue(aiMemory);
    await service.generate(coach, 42, input);
    expect(memory.getCoachMemory).toHaveBeenCalledWith(3, 7, {
      excludeEventActivityId: 17,
    });
    const prompt = JSON.parse(generate.mock.calls[0][0]);
    expect(prompt.aiMemory).toEqual(aiMemory);
    expect(
      tx.coachActivityAnalysis.create.mock.calls[0][0].data.contextSnapshot
        .aiMemory,
    ).toEqual(aiMemory);
    expect(memory.addNote).toHaveBeenCalledWith(
      3,
      7,
      'ACTIVITY_ANALYSIS',
      expect.stringContaining(analysis.summary),
    );
  });

  test('records no memory note when generation fails', async () => {
    const { service, memory } = setup();
    generate.mockRejectedValueOnce(new Error('provider down'));
    await expect(service.generate(coach, 42, input)).rejects.toThrow();
    expect(memory.addNote).not.toHaveBeenCalled();
  });

  test.each([
    ['missing fields', { summary: 'Incomplete' }],
    ['blank summary', { ...analysis, summary: '   ' }],
    ['extra write instruction', { ...analysis, applyToCalendar: true }],
    [
      'too many observations',
      { ...analysis, concerns: Array(9).fill('Concern') },
    ],
    ['oversized feedback', { ...analysis, athleteFeedback: 'x'.repeat(5001) }],
    ['absent object', undefined],
  ])('does not persist output with %s', async (_label, object) => {
    const { service, db, tx } = setup();
    generate.mockResolvedValue({ object });
    await expect(service.generate(coach, 42, input)).rejects.toMatchObject({
      response: { code: 'ACTIVITY_ANALYSIS_INVALID' },
      status: 422,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.coachActivityAnalysis.create).not.toHaveBeenCalled();
  });

  test.each([
    ['AI_NoObjectGeneratedError', 'Provider output unavailable', undefined],
    ['ZodError', 'Invalid output', undefined],
    [
      'MastraError',
      'Structured output validation failed: secret-upstream-body',
      'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED',
    ],
  ])(
    'maps provider structured-output failure %s to a safe validation error',
    async (name, message, id) => {
      const { service, tx } = setup();
      const providerError = Object.assign(new Error(message), { id });
      providerError.name = name;
      generate.mockRejectedValue(providerError);
      const error = await service
        .generate(coach, 42, input)
        .catch((value) => value);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.getResponse()).toEqual({
        code: 'ACTIVITY_ANALYSIS_INVALID',
      });
      expect(tx.coachActivityAnalysis.create).not.toHaveBeenCalled();
    },
  );

  test('never leaks a provider error body or credentials and does not save it', async () => {
    const { service, db, tx } = setup();
    generate.mockRejectedValue(
      Object.assign(
        new Error('Authorization: Bearer private-synthetic-token'),
        {
          response: { data: 'private-athlete-payload' },
        },
      ),
    );
    const error = await service
      .generate(coach, 42, input)
      .catch((value) => value);
    // As AiService reports it: a code and a generic message.
    expect(error).toBeInstanceOf(AiProviderException);
    expect(error.getResponse()).toMatchObject({
      code: AiErrorCode.PROVIDER_ERROR,
    });
    expect(JSON.stringify(error)).not.toContain('private-');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.coachActivityAnalysis.create).not.toHaveBeenCalled();
  });

  test('rechecks the coaching relationship after generation and refuses to save when access was revoked', async () => {
    const { service, db, tx } = setup();
    tx.event.findFirst.mockResolvedValue(null);
    await expect(service.generate(coach, 42, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.event.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.event.findFirst).toHaveBeenCalledWith(
      db.event.findFirst.mock.calls[0][0],
    );
    expect(tx.coachActivityAnalysis.create).not.toHaveBeenCalled();
  });

  test('blocks duplicate concurrent generation and permits retry after provider failure', async () => {
    const { service, tx } = setup();
    let rejectProvider!: (error: Error) => void;
    const pending = new Promise((_resolve, reject) => {
      rejectProvider = reject;
    });
    generate.mockReturnValueOnce(pending);
    const first = service.generate(coach, 42, input).catch((error) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(service.generate(coach, 42, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    rejectProvider(new Error('temporary failure'));
    expect(await first).toBeInstanceOf(AiProviderException);
    expect(tx.coachActivityAnalysis.create).not.toHaveBeenCalled();
    await expect(service.generate(coach, 42, input)).resolves.toHaveProperty(
      'activityAnalysisId',
      81,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(tx.coachActivityAnalysis.create).toHaveBeenCalledTimes(1);
  });
});

describe('private feedback draft edits', () => {
  test("updates only the authorized coach's draft, preserving the original analysis and snapshot", async () => {
    const { service, tx } = setup();
    const result = await service.updateFeedback(coach, 42, 81, {
      feedbackDraft: 'Coach-edited feedback.',
    });
    const where = {
      activityAnalysisId: 81,
      eventActivityId: 17,
      coachUserId: 3,
    };
    expect(tx.coachActivityAnalysis.updateMany).toHaveBeenCalledWith({
      where,
      data: { feedbackDraft: 'Coach-edited feedback.' },
    });
    expect(tx.coachActivityAnalysis.findFirstOrThrow).toHaveBeenCalledWith({
      where,
    });
    expect(result.feedbackDraft).toBe('Coach-edited feedback.');
    expect(result.analysis.athleteFeedback).toBe(analysis.athleteFeedback);
    expect(result.contextSnapshot).toEqual(snapshot);
    expect(generate).not.toHaveBeenCalled();
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  test("cannot update another coach's analysis by guessing its identifier", async () => {
    const { service, tx } = setup();
    tx.coachActivityAnalysis.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateFeedback(coach, 42, 999, { feedbackDraft: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.coachActivityAnalysis.updateMany.mock.calls[0][0].where).toEqual({
      activityAnalysisId: 999,
      eventActivityId: 17,
      coachUserId: 3,
    });
    expect(tx.coachActivityAnalysis.findFirstOrThrow).not.toHaveBeenCalled();
  });

  test('rejects a draft edit when the activity is no longer accessible', async () => {
    const { service, tx } = setup();
    tx.event.findFirst.mockResolvedValue(null);
    await expect(
      service.updateFeedback(coach, 42, 81, { feedbackDraft: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.coachActivityAnalysis.updateMany).not.toHaveBeenCalled();
  });
});
