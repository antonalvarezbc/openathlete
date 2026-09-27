import { ForbiddenException } from '@nestjs/common';

import * as models from 'src/common/constants/ai-models.constant';
import { postActivityFeedbackAgent } from 'src/mastra/agents/post-activity-feedback.agent';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { FeatureAccessService } from 'src/modules/subscription/services/feature-access.service';

import { ActivityFeedbackGenerationService } from './activity-feedback-generation.service';

jest.mock('src/mastra/agents/post-activity-feedback.agent', () => ({
  postActivityFeedbackAgent: { generate: jest.fn() },
}));
jest.mock('src/modules/prisma/services/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('src/modules/subscription/services/feature-access.service', () => ({
  FeatureAccessService: class {},
}));

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
  const access = {
    canAccessFeatureForAthlete: jest.fn().mockResolvedValue(true),
  };
  const service = new ActivityFeedbackGenerationService(
    db as unknown as PrismaService,
    access as unknown as FeatureAccessService,
  );
  return { activity, tx, db, access, service };
}
const previousKeys = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};
afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(previousKeys)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-provider-key';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-provider-key';
  jest.clearAllMocks();
  (postActivityFeedbackAgent.generate as jest.Mock).mockResolvedValue({
    text: JSON.stringify(questions),
  });
});
it.each([owner, coach])(
  'allows owner or linked coach and uses Spanish without invented heart rate',
  async (user) => {
    const { service, tx } = setup();
    await service.generateForUser(user, 10);
    expect(postActivityFeedbackAgent.generate).toHaveBeenCalledWith(
      expect.stringContaining('Spanish (ES)'),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    const prompt = (postActivityFeedbackAgent.generate as jest.Mock).mock
      .calls[0][0];
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
  expect(postActivityFeedbackAgent.generate).not.toHaveBeenCalled();
});
it('rejects an unlinked coach', async () => {
  const { service, db } = setup();
  db.coachAthlete.findFirst.mockResolvedValue(null);
  await expect(service.generateForUser(coach, 10)).rejects.toThrow();
  expect(postActivityFeedbackAgent.generate).not.toHaveBeenCalled();
});
it('rechecks coach access after generation before writing', async () => {
  const { service, tx } = setup();
  (postActivityFeedbackAgent.generate as jest.Mock).mockImplementation(
    async () => {
      tx.coachAthlete.findFirst.mockResolvedValue(null);
      return { text: JSON.stringify(questions) };
    },
  );
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
    expect(postActivityFeedbackAgent.generate).not.toHaveBeenCalled();
  },
);
it('requires AI feature access', async () => {
  const { service, access } = setup();
  access.canAccessFeatureForAthlete.mockResolvedValue(false);
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_AI_UNAVAILABLE',
  );
  expect(postActivityFeedbackAgent.generate).not.toHaveBeenCalled();
});
it('preserves existing questions and answers without a model call', async () => {
  const { service, activity, tx } = setup();
  activity.feedbackQuestions = [{ answerText: 'Saved response' }];
  await service.generateForUser(owner, 10);
  expect(postActivityFeedbackAgent.generate).not.toHaveBeenCalled();
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
it.each([
  'not json',
  '{}',
  JSON.stringify({ questions: [{ text: 'Only one' }] }),
  JSON.stringify({
    questions: [{ text: 'Same' }, { text: 'Same' }, { text: 'Same' }],
  }),
  JSON.stringify({
    questions: [
      { text: 'a' },
      { text: 'b' },
      { text: 'c', qcmOptions: [{ label: '' }] },
    ],
  }),
])('rejects malformed questionnaires atomically: %s', async (text) => {
  const { service, tx } = setup();
  (postActivityFeedbackAgent.generate as jest.Mock).mockResolvedValue({ text });
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_INVALID_QUESTIONS',
  );
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});
it('releases failed in-flight requests so the user can retry', async () => {
  const { service } = setup();
  (postActivityFeedbackAgent.generate as jest.Mock).mockRejectedValueOnce(
    new Error('Unavailable'),
  );
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_PROVIDER_ERROR',
  );
  await service.generateForUser(owner, 10);
  expect(postActivityFeedbackAgent.generate).toHaveBeenCalledTimes(2);
});
it('shares concurrent automatic and manual generation', async () => {
  const { service, tx } = setup();
  await Promise.all([
    service.generate(10),
    service.generateForUser(owner, 10),
    service.generateForUser(coach, 10),
  ]);
  expect(postActivityFeedbackAgent.generate).toHaveBeenCalledTimes(1);
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
  (postActivityFeedbackAgent.generate as jest.Mock).mockImplementation(
    async () => {
      tx.athleteSettings.findUnique.mockResolvedValue({
        requireFeedbackQuestions: false,
      });
      return { text: JSON.stringify(questions) };
    },
  );
  await expect(service.generateForUser(owner, 10)).rejects.toThrow(
    'FEEDBACK_DISABLED',
  );
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
});

it.each([
  ['openai/gpt-5.1', 'OPENAI_API_KEY'],
  ['google/gemini-3-pro-preview', 'GOOGLE_GENERATIVE_AI_API_KEY'],
])('requires the key for the selected provider %s', async (model, key) => {
  jest.replaceProperty(models, 'POST_ACTIVITY_FEEDBACK_MODEL', model);
  const { service, tx } = setup();
  for (const value of ['', 'your-provider-api-key']) {
    process.env[key] = value;
    await expect(service.generateForUser(owner, 10)).rejects.toThrow(
      'FEEDBACK_MODEL_NOT_CONFIGURED',
    );
  }
  expect(postActivityFeedbackAgent.generate).not.toHaveBeenCalled();
  expect(tx.activityFeedbackQuestion.createMany).not.toHaveBeenCalled();
  process.env[key] = 'test-provider-key';
  await service.generateForUser(owner, 10);
  expect(postActivityFeedbackAgent.generate).toHaveBeenCalledTimes(1);
});
