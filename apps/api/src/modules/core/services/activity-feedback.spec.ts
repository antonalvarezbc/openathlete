import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { ActivityFeedbackController } from '../controllers/activity-feedback.controller';
import { ActivityFeedbackService } from './activity-feedback.service';

const mockTranscribe = jest
  .fn()
  .mockResolvedValue({ text: 'Respuesta en español' });
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    audio = { transcriptions: { create: mockTranscribe } };
  },
}));
jest.mock('src/modules/prisma/services/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('src/modules/auth', () => ({
  CaslAbilityFactory: class {},
  UserTypeGuard: class {
    canActivate() {
      return true;
    }
  },
}));
jest.mock('src/modules/auth/services/casl-prisma', () => ({
  accessibleBy: () => ({ Event: {} }),
}));
const user = { userId: 1, athlete: { athleteId: 2 } } as AuthUser;
function setup() {
  const db = {
    eventActivity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ event: { eventId: 3, athleteId: 2 } }),
    },
    event: { findFirst: jest.fn().mockResolvedValue({ athleteId: 2 }) },
    activityFeedbackQuestion: {
      findFirst: jest.fn().mockResolvedValue({ answerText: null }),
      update: jest.fn().mockResolvedValue({
        activityFeedbackQuestionId: 4,
        answerText: 'Good',
        updatedAt: new Date(),
      }),
      findMany: jest.fn().mockResolvedValue([{ answerText: 'Good' }]),
    },
  };
  const abilities = { getFor: jest.fn().mockResolvedValue({}) };
  const emitter = { emit: jest.fn() };
  const service = new ActivityFeedbackService(
    db as unknown as PrismaService,
    abilities as unknown as CaslAbilityFactory,
    emitter as unknown as EventEmitter2,
    { get: () => 'test' } as unknown as ConfigService<ApiEnvSchemaType, true>,
  );
  return { db, service, emitter };
}
beforeEach(() => jest.clearAllMocks());
it.each(['', '   ', null, 7, 'a'.repeat(5001)])(
  'rejects invalid answers before writing',
  async (answer) => {
    const { db, service } = setup();
    await expect(
      service.submitQuestionAnswer(user, 1, 4, answer as string),
    ).rejects.toThrow('Invalid feedback answer');
    expect(db.activityFeedbackQuestion.update).not.toHaveBeenCalled();
  },
);
it('saves a trimmed answer and emits completion only after persistence', async () => {
  const { db, service, emitter } = setup();
  await service.submitQuestionAnswer(user, 1, 4, '  Good  ');
  expect(db.activityFeedbackQuestion.update).toHaveBeenCalledWith({
    where: { activityFeedbackQuestionId: 4 },
    data: { answerText: 'Good' },
  });
  expect(emitter.emit).toHaveBeenCalledWith(
    'activity.feedback.completed',
    expect.anything(),
  );
});
it('does not mark legacy blank answers as complete', async () => {
  const { db, service, emitter } = setup();
  db.activityFeedbackQuestion.findMany.mockResolvedValue([{ answerText: ' ' }]);
  await service.submitQuestionAnswer(user, 1, 4, 'Good');
  expect(emitter.emit).not.toHaveBeenCalledWith(
    'activity.feedback.completed',
    expect.anything(),
  );
});
it('does not emit completion when saving fails', async () => {
  const { db, service, emitter } = setup();
  db.activityFeedbackQuestion.update.mockRejectedValue(
    new Error('Database unavailable'),
  );
  await expect(
    service.submitQuestionAnswer(user, 1, 4, 'Good'),
  ).rejects.toThrow();
  expect(emitter.emit).not.toHaveBeenCalled();
});
it('denies answering on behalf of another athlete', async () => {
  const { db, service } = setup();
  await expect(
    service.submitQuestionAnswer({ ...user, athlete: null }, 1, 4, 'Good'),
  ).rejects.toThrow();
  expect(db.activityFeedbackQuestion.update).not.toHaveBeenCalled();
});
it.each(['es', 'en', 'fr', 'it', undefined] as const)(
  'transcribes using language %s, with automatic detection when omitted',
  async (language) => {
    const { service } = setup();
    await service.transcribeAudio(
      { buffer: Buffer.from('audio'), mimetype: 'audio/webm' },
      language,
    );
    const args = mockTranscribe.mock.calls[0][0];
    expect(args.model).toBe('whisper-1');
    if (language) expect(args.language).toBe(language);
    else expect(args).not.toHaveProperty('language');
  },
);
it('rejects unsupported transcription languages before calling the provider', async () => {
  const { service } = setup();
  const controller = new ActivityFeedbackController(service);
  await expect(
    controller.transcribeAudio(
      {
        buffer: Buffer.from('a'),
        mimetype: 'audio/webm',
        size: 1,
        fieldname: 'audio',
        originalname: 'a.webm',
        encoding: '7bit',
      },
      'unknown',
    ),
  ).rejects.toThrow('Invalid transcription language');
  expect(mockTranscribe).not.toHaveBeenCalled();
});
