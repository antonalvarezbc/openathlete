import { EventEmitter2 } from '@nestjs/event-emitter';

import { CoachActivityNoticeEvent } from '../../../events/coach-activity-notice.event';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { MessageThreadService } from './message-thread.service';
import { MessageService } from './message.service';

const user: AuthUser = {
  userId: 8,
  email: 'test@example.invalid',
  athlete: { athleteId: 5 },
  roles: ['ATHLETE'],
};
function setup() {
  const row = {
    messageId: 7,
    messageThreadId: 2,
    senderId: 8,
    content: 'My legs feel tired',
    createdAt: new Date(),
    updatedAt: new Date(),
    editedAt: null,
    sender: {
      userId: 8,
      firstName: 'QA',
      lastName: 'Athlete',
      email: user.email,
    },
    readReceipts: [],
    activityNotice: null,
  };
  const db = {
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({
        eventActivityId: 4,
        eventActivity: { eventId: 9 },
      }),
      update: jest.fn(),
    },
    message: {
      create: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
      delete: jest.fn(),
    },
  };
  const threads = { getThreadById: jest.fn() };
  const emitter = { emit: jest.fn() };
  return {
    db,
    threads,
    emitter,
    row,
    service: new MessageService(
      db as unknown as PrismaService,
      threads as unknown as MessageThreadService,
      emitter as unknown as EventEmitter2,
    ),
  };
}
it('announces new activity comments only after authorizing and saving them', async () => {
  const { service, emitter, threads } = setup();
  await service.createMessage(user, {
    messageThreadId: 2,
    content: 'My legs feel tired',
  });
  expect(threads.getThreadById).toHaveBeenCalledWith(user, 2);
  expect(emitter.emit).toHaveBeenCalledWith(
    CoachActivityNoticeEvent.SLUG,
    expect.objectContaining({
      payload: expect.objectContaining({
        actorUserId: 8,
        eventId: 9,
        kind: 'COMMENT',
      }),
    }),
  );
});
it('does not turn direct chat messages into recursive activity alerts', async () => {
  const { service, emitter, db } = setup();
  db.messageThread.findUnique.mockResolvedValue({
    eventActivityId: null,
    eventActivity: null,
  });
  await service.createMessage(user, { messageThreadId: 2, content: 'Hi' });
  expect(emitter.emit).not.toHaveBeenCalled();
});
it('suppresses mirrored description comments to avoid a second notification', async () => {
  const { service, emitter } = setup();
  await service.createMessage(
    user,
    { messageThreadId: 2, content: 'My legs feel tired' },
    false,
  );
  expect(emitter.emit).not.toHaveBeenCalled();
});
it('does not emit when the original comment write is unauthorized or fails', async () => {
  const { service, emitter, threads, db } = setup();
  threads.getThreadById.mockRejectedValueOnce(new Error('Forbidden'));
  await expect(
    service.createMessage(user, { messageThreadId: 2, content: 'Hi' }),
  ).rejects.toThrow();
  db.message.create.mockRejectedValueOnce(new Error('Database failure'));
  await expect(
    service.createMessage(user, { messageThreadId: 2, content: 'Hi' }),
  ).rejects.toThrow();
  expect(emitter.emit).not.toHaveBeenCalled();
});
it('does not announce unchanged content on edit', async () => {
  const { service, emitter, row } = setup();
  jest.spyOn(service, 'getMessageById').mockResolvedValue(row);
  await service.updateMessage(user, 7, { content: row.content });
  expect(emitter.emit).not.toHaveBeenCalled();
});
it.each(['update', 'delete'])(
  'blocks %s of automated notices even for their nominal sender',
  async (operation) => {
    const { service, db, row } = setup();
    jest.spyOn(service, 'getMessageById').mockResolvedValue({
      ...row,
      activityNotice: { kind: 'RPE', eventId: 9, eventName: 'QA', rpe: 7 },
    });
    await expect(
      operation === 'update'
        ? service.updateMessage(user, 7, { content: 'fake' })
        : service.deleteMessage(user, 7),
    ).rejects.toThrow('Automatic notices');
    expect(db.message.update).not.toHaveBeenCalled();
    expect(db.message.delete).not.toHaveBeenCalled();
  },
);
