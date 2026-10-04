import { ForbiddenException } from '@nestjs/common';

import { postActivityFeedbackAgent } from 'src/mastra/agents';
import { disabledAiMemory } from 'src/modules/ai-memory/ai-memory.testing';
import { AiModelResolverService } from 'src/modules/ai/services/ai-model-resolver.service';
import { AiService } from 'src/modules/ai/services/ai.service';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { ActivityFeedbackGenerationService } from './activity-feedback-generation.service';

// Jest cannot load Mastra's ESM providers: the agents and AI services are
// replaced, the service under test only sees their interfaces.
jest.mock('src/mastra/agents', () => ({
  postActivityFeedbackAgent: { id: 'post-activity-feedback' },
  feedbackQuestionsOutputSchema: {},
}));
jest.mock('src/modules/ai/services/ai.service', () => ({
  AiService: class {},
}));
jest.mock('src/modules/ai/services/ai-model-resolver.service', () => ({
  AiModelResolverService: class {},
}));
jest.mock('src/modules/prisma/services/prisma.service', () => ({
  PrismaService: class {},
}));

const model = { task: 'POST_ACTIVITY_QUESTIONS', source: 'hosted' };
const ai = { generateObject: jest.fn() };
const resolver = { tryResolveForAthlete: jest.fn() };

const owner = {
  userId: 1,
  athlete: { athleteId: 2 },
  roles: ['ATHLETE'],
} as AuthUser;
const coach = { userId: 3, athlete: null, roles: ['COACH'] } as AuthUser;
const questions = {
  questions: [
    { text: '¿Cómo te has sentido?' },
    {
      text: '¿Has sentido dolor?',
      qcmOptions: [{ label: 'No' }, { label: 'Sí' }],
    },
    { text: '¿Cómo has dormido?' },
  ],
};
function setup() {
  const activity = {
    feedbackQuestions: [] as unknown[],
    event: {
      athleteId: 2,
      name: 'Easy trail',
      athlete: { athleteId: 2, user: { language: 'ES' } },
    },
    relatedTraining: null,
    relatedCompetition: null,
    distance: 5000,
    movingTime: 1800,
    elevationGain: 100,
    sport: 'TRAIL_RUNNING',
    rpe: null,
    averageHeartrate: 140,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    eventActivity: { findUnique: jest.fn().mockResolvedValue(activity) },
    coachAthlete: {
      findFirst: jest.fn().mockResolvedValue({ userId: 3, athleteId: 2 }),
    },
    athleteSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ requireFeedbackQuestions: true }),
    },
    activityFeedbackQuestion: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };
  const db = {
    ...tx,
    eventActivity: { findUnique: jest.fn().mockResolvedValue(activity) },
    athleteMetric: { findMany: jest.fn().mockResolvedValue([]) },
    trainingZone: { findMany: jest.fn().mockResolvedValue([]) },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const service = new ActivityFeedbackGenerationService(
    db as unknown as PrismaService,
    resolver as unknown as AiModelResolverService,
    ai as unknown as AiService,
    disabledAiMemory(),
  );
  return { activity, tx, db, service };
}
beforeEach(() => {
  jest.clearAllMocks();
  resolver.tryResolveForAthlete.mockResolvedValue(model);
  ai.generateObject.mockResolvedValue(questions);
});
it.each([owner, coach])(
  'allows owner or linked coach and uses Spanish without invented heart rate',
  async (user) => {
    const { service, tx } = setup();
    await service.generateForUser(user, 10);
    // The athlete's chain decides the model: own key, a coach's, or hosted.
    expect(resolver.tryResolveForAthlete).toHaveBeenCalledWith(
      'POST_ACTIVITY_QUESTIONS',
      2,
    );
    expect(ai.generateObject).toHaveBeenCalledWith(
      postActivityFeedbackAgent,
      model,
      expect.stringContaining('Spanish (ES)'),
      expect.anything(),
    );
    const prompt = ai.generateObject.mock.calls[0][2];
    expect(prompt).not.toContain('HR_MAX: 195');
    expect(prompt).not.toContain('HR_REST: 60');
    expect(tx.activityFeedbackQuestion.createMany).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { ...coach, roles: ['ATHLETE'] },
  { ...owner, athlete: { athleteId: 99 } },
])('rejects unauthorized accounts before contacting AI', async (user) => {
  const { service } = setup();
  await expect(
    service.generateForUser(user as AuthUser, 10),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(ai.generateObject).not.toHaveBeenCalled();
});
it('rejects an unlinked coach', async () => {
  const { service, db } = setup();
  db.coachAthlete.findFirst.mockResolvedValue(null);
  await expect(service.generateForUser(coach, 10)).rejects.toThrow();
  expect(ai.generateObject).not.toHaveBeenCalled();
});
it('rechecks coach access after generation before writing', async () => {
  const { service, tx } = setup();
  ai.generateObject.mockImplementation(async () => {
    tx.coachAthlete.findFirst.mockResolvedValue(null);
    return questions;
  });
  await expect(service.generateForUser(coach, 10)).rejects.toThrow();
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
it.each([false, null])(
  'respects athlete opt-out and missing settings',
  async (setting) => {
    const { service, db } = setup();
    db.athleteSettings.findUnique.mockResolvedValue(
      setting === null ? null : { requireFeedbackQuestions: setting },
    );
    await expect(service.generateForUser(owner, 10)).rejects.toThrow(
      'FEEDBACK_DISABLED',
    );
    expect(ai.generateObject).not.toHaveBeenCalled();
  },
);
it('needs AI for the athlete or one of their coaches', async () => {
  const { service, tx } = setup();
  resolver.tryResolveForAthlete.mockResolvedValue(null);
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_MODEL_NOT_CONFIGURED',
  );
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
  expect(ai.generateObject).not.toHaveBeenCalled();
});
it('preserves existing questions and answers without a model call', async () => {
  const { service, activity, tx } = setup();
  activity.feedbackQuestions = [{ answerText: 'Saved response' }];
  await service.generateForUser(owner, 10);
  expect(ai.generateObject).not.toHaveBeenCalled();
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
it.each([
  null,
  {},
  { questions: [{ text: 'Only one' }] },
  { questions: [{ text: 'Same' }, { text: 'Same' }, { text: 'Same' }] },
  {
    questions: [
      { text: 'a' },
      { text: 'b' },
      { text: 'c', qcmOptions: [{ label: '' }] },
    ],
  },
])('rejects malformed questionnaires atomically: %j', async (answer) => {
  const { service, tx } = setup();
  ai.generateObject.mockResolvedValue(answer);
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_INVALID_QUESTIONS',
  );
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
it('releases failed in-flight requests so the user can retry', async () => {
  const { service } = setup();
  ai.generateObject.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_PROVIDER_ERROR',
  );
  await service.generateForUser(owner, 10);
  expect(ai.generateObject).toHaveBeenCalledTimes(2);
});
it('shares concurrent automatic and manual generation', async () => {
  const { service, tx } = setup();
  await Promise.all([
    service.generate(10),
    service.generateForUser(owner, 10),
    service.generateForUser(coach, 10),
  ]);
  expect(ai.generateObject).toHaveBeenCalledTimes(1);
  expect(tx.activityFeedbackQuestion.createMany).toHaveBeenCalledTimes(1);
});
it('does not replace questions inserted by another API process', async () => {
  const { service, tx } = setup();
  tx.activityFeedbackQuestion.count.mockResolvedValue(3);
  await service.generateForUser(owner, 10);
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
it('respects opt-out changed while AI was running', async () => {
  const { service, tx } = setup();
  ai.generateObject.mockImplementation(async () => {
    tx.athleteSettings.findUnique.mockResolvedValue({
      requireFeedbackQuestions: false,
    });
    return questions;
  });
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_DISABLED',
  );
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
