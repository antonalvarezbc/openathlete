import { Logger } from '@nestjs/common';

import { ActivityFeedbackCompletedEvent } from 'src/events';
import { extractInjuryAgent, extractRpeAgent } from 'src/mastra/agents';
import { CalendarWebSocketService } from 'src/modules/calendar/services/calendar-websocket.service';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { FeatureAccessService } from 'src/modules/subscription/services/feature-access.service';

import { ActivityFeedbackExtractionListener } from './activity-feedback-extraction.listener';

const mockDoEmbed = jest.fn();
jest.mock('@ai-sdk/openai', () => ({
  openai: { embedding: () => ({ doEmbed: mockDoEmbed }) },
}));
jest.mock('src/mastra/agents', () => ({
  extractInjuryAgent: { generate: jest.fn() },
  extractRpeAgent: { generate: jest.fn() },
}));
jest.mock('src/modules/calendar/services/calendar-websocket.service', () => ({
  CalendarWebSocketService: class {},
}));
jest.mock('src/modules/prisma/services/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('src/modules/subscription/services/feature-access.service', () => ({
  FeatureAccessService: class {},
}));

describe('feedback extraction policy and persistence', () => {
  const event = new ActivityFeedbackCompletedEvent({
    eventActivityId: 32,
    eventId: 90,
    trigger: 'rpe_comment_updated',
  });
  const activity = {
    rpe: 0.6 as number | null,
    description: 'Test comment',
    event: { eventId: 90, athleteId: 4 },
    feedbackQuestions: [],
  };
  let tx: {
    athleteInjury: { create: jest.Mock };
    eventActivity: { updateMany: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let prisma: {
    eventActivity: { findUnique: jest.Mock };
    athleteSettings: { findUnique: jest.Mock };
    athleteInjury: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { canAccessFeatureForAthlete: jest.Mock };
  let calendar: { notifyActivityProcessed: jest.Mock };
  let listener: ActivityFeedbackExtractionListener;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    tx = {
      athleteInjury: { create: jest.fn() },
      eventActivity: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      eventActivity: {
        findUnique: jest.fn().mockResolvedValue({ ...activity }),
      },
      athleteSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ requireFeedbackQuestions: true }),
      },
      athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    access = { canAccessFeatureForAthlete: jest.fn().mockResolvedValue(true) };
    calendar = { notifyActivityProcessed: jest.fn() };
    (extractInjuryAgent.generate as jest.Mock).mockResolvedValue({
      text: '{"injuries":[]}',
    });
    (extractRpeAgent.generate as jest.Mock).mockResolvedValue({
      text: '{"extractedRpe":0.8}',
    });
    mockDoEmbed.mockResolvedValue({ embeddings: [Array(1536).fill(0.25)] });
    listener = new ActivityFeedbackExtractionListener(
      prisma as unknown as PrismaService,
      calendar as unknown as CalendarWebSocketService,
      access as unknown as FeatureAccessService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([null, { requireFeedbackQuestions: false }])(
    'does not invoke AI when feedback is disabled or settings missing',
    async (settings) => {
      prisma.athleteSettings.findUnique.mockResolvedValue(settings);
      await listener.handleActivityFeedbackCompleted(event);
      expect(access.canAccessFeatureForAthlete).not.toHaveBeenCalled();
      expect(extractInjuryAgent.generate).not.toHaveBeenCalled();
      expect(extractRpeAgent.generate).not.toHaveBeenCalled();
      expect(mockDoEmbed).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('does not invoke AI without feature access', async () => {
    access.canAccessFeatureForAthlete.mockResolvedValue(false);
    await listener.handleActivityFeedbackCompleted(event);
    expect(extractInjuryAgent.generate).not.toHaveBeenCalled();
    expect(mockDoEmbed).not.toHaveBeenCalled();
  });

  it.each([0, 0.6])('preserves manually entered RPE %s', async (rpe) => {
    prisma.eventActivity.findUnique.mockResolvedValue({ ...activity, rpe });
    await listener.handleActivityFeedbackCompleted(event);
    expect(extractRpeAgent.generate).not.toHaveBeenCalled();
    expect(tx.eventActivity.updateMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(calendar.notifyActivityProcessed).not.toHaveBeenCalled();
  });

  it('fills missing RPE conditionally and notifies after commit', async () => {
    prisma.eventActivity.findUnique.mockResolvedValue({
      ...activity,
      rpe: null,
    });
    prisma.$transaction.mockImplementation(async (fn) => {
      const result = await fn(tx);
      expect(calendar.notifyActivityProcessed).not.toHaveBeenCalled();
      return result;
    });
    await listener.handleActivityFeedbackCompleted(event);
    expect(tx.eventActivity.updateMany).toHaveBeenCalledWith({
      where: { eventActivityId: 32, rpe: null },
      data: { rpe: 0.8 },
    });
    expect(calendar.notifyActivityProcessed).toHaveBeenCalledWith(90, 4);
  });

  it('does not overwrite an RPE supplied while the model was running', async () => {
    prisma.eventActivity.findUnique.mockResolvedValue({
      ...activity,
      rpe: null,
    });
    tx.eventActivity.updateMany.mockResolvedValue({ count: 0 });
    await listener.handleActivityFeedbackCompleted(event);
    expect(calendar.notifyActivityProcessed).not.toHaveBeenCalled();
  });

  it('does not start writing malformed vectors', async () => {
    mockDoEmbed.mockResolvedValue({ embeddings: [[0.25]] });
    await listener.handleActivityFeedbackCompleted(event);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not notify when persistence fails', async () => {
    prisma.eventActivity.findUnique.mockResolvedValue({
      ...activity,
      rpe: null,
    });
    tx.$executeRaw.mockRejectedValue(new Error('Database failure'));
    await listener.handleActivityFeedbackCompleted(event);
    expect(calendar.notifyActivityProcessed).not.toHaveBeenCalled();
  });
});
