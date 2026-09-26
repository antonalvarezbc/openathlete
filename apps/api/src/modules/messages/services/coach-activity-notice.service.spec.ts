import { EventEmitter2 } from '@nestjs/event-emitter';

import { defaultCoachActivityAlertSettings } from '@openathlete/shared';

import { CoachActivityNoticeEvent } from '../../../events/coach-activity-notice.event';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { CoachActivityNoticeService } from './coach-activity-notice.service';

const coach: AuthUser = {
  userId: 3,
  email: 'coach@example.invalid',
  roles: ['COACH'],
  athlete: null,
};
const payload: CoachActivityNoticeEvent['payload'] = {
  eventId: 42,
  kind: 'RPE',
  actorUserId: 8,
  rpe: 7,
  deliveryKey: 'edit:42:1',
};
function fixture() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    coachAthlete: { findFirst: jest.fn().mockResolvedValue({ userId: 3 }) },
    event: {
      findFirst: jest.fn().mockResolvedValue({
        name: 'Trail',
        athlete: { user: { firstName: 'Test', lastName: 'Athlete' } },
      }),
    },
    coachActivityAlertSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(defaultCoachActivityAlertSettings),
    },
    activityChatNotice: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    messageThread: {
      findFirst: jest.fn().mockResolvedValue({ messageThreadId: 10 }),
      create: jest.fn().mockResolvedValue({ messageThreadId: 11 }),
      update: jest.fn(),
    },
    message: {
      create: jest.fn().mockResolvedValue({
        messageId: 6,
        messageThreadId: 10,
        createdAt: new Date(),
      }),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ language: 'ES' }),
    },
  };
  const db = {
    ...tx,
    event: {
      findUnique: jest.fn().mockResolvedValue({
        type: 'ACTIVITY',
        athleteId: 5,
        athlete: { userId: 8, coachAthletes: [{ userId: 3 }] },
      }),
    },
    $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
  };
  const emitter = { emit: jest.fn() };
  return {
    db,
    tx,
    emitter,
    service: new CoachActivityNoticeService(
      db as unknown as PrismaService,
      emitter as unknown as EventEmitter2,
    ),
  };
}

describe('coach activity chat notices', () => {
  it('delivers a typed automatic RPE notice in an existing private two-person conversation', async () => {
    const { service, tx, emitter } = fixture();
    await service.deliver(payload);
    expect(tx.messageThread.create).not.toHaveBeenCalled();
    expect(tx.messageThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventActivityId: null,
          eventTraining: null,
          AND: [
            { participants: { some: { userId: 3 } } },
            { participants: { some: { userId: 8 } } },
          ],
          participants: { every: { userId: { in: [3, 8] } } },
        },
      }),
    );
    expect(tx.activityChatNotice.create).toHaveBeenCalledWith({
      data: {
        coachUserId: 3,
        deliveryKey: 'RPE:edit:42:1',
        kind: 'RPE',
        eventId: 42,
        eventName: 'Trail',
        rpe: 7,
      },
    });
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: 8,
          messageThreadId: 10,
          activityNotice: { connect: { id: 1 } },
        }),
      }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      'activity.chat.delivered',
      expect.objectContaining({ userIds: [3, 8] }),
    );
  });
  it('creates a direct chat when only group/activity conversations exist', async () => {
    const { service, tx } = fixture();
    tx.messageThread.findFirst.mockResolvedValue(null);
    await service.deliver(payload);
    expect(tx.messageThread.create).toHaveBeenCalledWith({
      data: {
        title: 'Test Athlete',
        participants: { create: [{ userId: 3 }, { userId: 8 }] },
      },
    });
  });
  it.each(['COMMENT', 'RPE', 'ACTIVITY'] as const)(
    'respects disabled %s without replaying it later',
    async (kind) => {
      const { service, tx, emitter } = fixture();
      tx.coachActivityAlertSettings.findUnique.mockResolvedValue({
        notifyComments: false,
        notifyRpe: false,
        notifyNewActivities: false,
      });
      await service.deliver({ ...payload, kind });
      expect(tx.activityChatNotice.create).toHaveBeenCalledTimes(1);
      expect(tx.message.create).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    },
  );
  it('does not duplicate repeated or suppressed deliveries', async () => {
    const { service, tx } = fixture();
    tx.activityChatNotice.findUnique.mockResolvedValue({ id: 1 });
    await service.deliver(payload);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.activityChatNotice.create).not.toHaveBeenCalled();
  });
  it('rechecks the current coaching relationship before delivery', async () => {
    const { service, tx } = fixture();
    tx.event.findFirst.mockResolvedValue(null);
    await service.deliver(payload);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(
      tx.event.findFirst.mock.calls[0][0].where.athlete.coachAthletes.some,
    ).toEqual({ userId: 3, user: { roles: { has: 'COACH' } } });
  });
  it.each([3, 999, undefined])(
    'does not announce feedback written by someone other than the athlete (%s)',
    async (actorUserId) => {
      const { service, db } = fixture();
      await service.deliver({ ...payload, actorUserId });
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it('announces imported activities without impersonating a user-written chat message', async () => {
    const { service, tx } = fixture();
    await service.deliver({
      ...payload,
      kind: 'ACTIVITY',
      actorUserId: undefined,
    });
    expect(tx.activityChatNotice.create.mock.calls[0][0].data.rpe).toBeNull();
    expect(tx.message.create.mock.calls[0][0].data.content).toBe(
      'Nueva actividad: Trail',
    );
  });
  it('ignores unavailable events and avoids self-notifications', async () => {
    const { service, db } = fixture();
    db.event.findUnique.mockResolvedValue(null);
    await service.deliver(payload);
    db.event.findUnique.mockResolvedValue({
      type: 'ACTIVITY',
      athleteId: 5,
      athlete: { userId: 8, coachAthletes: [{ userId: 8 }] },
    });
    await service.deliver(payload);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('deduplicates duplicate coaching links and delivers separately to each coach', async () => {
    const { service, db, tx, emitter } = fixture();
    db.event.findUnique.mockResolvedValue({
      type: 'ACTIVITY',
      athleteId: 5,
      athlete: {
        userId: 8,
        coachAthletes: [{ userId: 3 }, { userId: 3 }, { userId: 4 }],
      },
    });
    await service.deliver(payload);
    expect(tx.message.create).toHaveBeenCalledTimes(2);
    expect(emitter.emit.mock.calls.map((c) => c[1].userIds)).toEqual([
      [3, 8],
      [4, 8],
    ]);
  });
  it('stores an RPE removal as null rather than zero', async () => {
    const { service, tx } = fixture();
    await service.deliver({ ...payload, rpe: null });
    expect(tx.activityChatNotice.create.mock.calls[0][0].data.rpe).toBeNull();
  });
});

describe('coach-specific preferences', () => {
  it('defaults to enabled only after checking the coaching link', async () => {
    const { service, db } = fixture();
    expect(await service.settings(coach, 5)).toEqual(
      defaultCoachActivityAlertSettings,
    );
    expect(db.coachAthlete.findFirst).toHaveBeenCalledWith({
      where: { userId: 3, athleteId: 5 },
    });
  });
  it('does not let an athlete or unrelated coach change preferences', async () => {
    const { service, tx } = fixture();
    await expect(
      service.updateSettings(
        { ...coach, roles: ['ATHLETE'] },
        5,
        defaultCoachActivityAlertSettings,
      ),
    ).rejects.toThrow();
    tx.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      service.updateSettings(coach, 5, defaultCoachActivityAlertSettings),
    ).rejects.toThrow();
    expect(tx.coachActivityAlertSettings.upsert).not.toHaveBeenCalled();
  });
  it('updates only the requesting coach and selected athlete', async () => {
    const { service, tx } = fixture();
    await service.updateSettings(coach, 5, {
      ...defaultCoachActivityAlertSettings,
      notifyRpe: false,
    });
    expect(tx.coachActivityAlertSettings.upsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: { coachUserId_athleteId: { coachUserId: 3, athleteId: 5 } },
        update: {
          notifyComments: true,
          notifyRpe: false,
          notifyNewActivities: true,
        },
      }),
    );
  });
});
