import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import {
  COACH_USER_ID,
  DELETED_ATHLETE_ID,
  DELETED_USER_ID,
  accountFixtureSql,
} from 'src/modules/auth/services/account-deletion.fixture';
import { AccountExportService } from 'src/modules/auth/services/account-export.service';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { CoachActivityNoticeService } from './coach-activity-notice.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

describe('activity notices in PostgreSQL', () => {
  let prisma: PrismaService;
  let service: CoachActivityNoticeService;
  const emitter = new EventEmitter2();
  const coach: AuthUser = {
    userId: COACH_USER_ID,
    email: 'coach@example.com',
    athlete: null,
  };
  const notice = {
    eventId: 3002,
    kind: 'RPE' as const,
    actorUserId: DELETED_USER_ID,
    deliveryKey: 'integration-feedback',
    rpe: 6,
  };
  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    service = new CoachActivityNoticeService(prisma, emitter);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.table_name}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    for (const sql of accountFixtureSql) await prisma.$executeRawUnsafe(sql);
    await prisma.user.update({
      where: { userId: COACH_USER_ID },
      data: { roles: ['COACH'] },
    });
  });
  it('deduplicates simultaneous deliveries and reuses the direct conversation', async () => {
    await Promise.all([service.deliver(notice), service.deliver(notice)]);
    expect(await prisma.activityChatNotice.count()).toBe(1);
    const message = await prisma.message.findFirstOrThrow({
      where: { activityNotice: { isNot: null } },
    });
    expect(message.messageThreadId).toBe(3802);
    expect(message.senderId).toBe(DELETED_USER_ID);
    expect(await prisma.messageThread.count()).toBe(2);
  });
  it('remembers suppression after enabling the switch, and exports coach preferences', async () => {
    await service.updateSettings(coach, DELETED_ATHLETE_ID, {
      notifyComments: true,
      notifyRpe: false,
      notifyNewActivities: true,
    });
    await service.deliver(notice);
    await service.updateSettings(coach, DELETED_ATHLETE_ID, {
      notifyComments: true,
      notifyRpe: true,
      notifyNewActivities: true,
    });
    await service.deliver(notice);
    expect(await prisma.activityChatNotice.count()).toBe(1);
    expect(
      await prisma.message.count({
        where: { activityNotice: { isNot: null } },
      }),
    ).toBe(0);
    let output = '';
    await new AccountExportService(prisma).export(
      COACH_USER_ID,
      {
        write: (chunk) => {
          output += chunk;
        },
        end: () => undefined,
      },
      { includeStreams: false },
    );
    expect(JSON.parse(output).activityAlertSettings).toEqual([
      {
        athleteId: DELETED_ATHLETE_ID,
        notifyComments: true,
        notifyRpe: true,
        notifyNewActivities: true,
      },
    ]);
  });
  it('preserves the delivery receipt after a conversation is deleted', async () => {
    await service.deliver(notice);
    await prisma.message.deleteMany({ where: { messageThreadId: 3802 } });
    await prisma.messageThreadParticipant.deleteMany({
      where: { messageThreadId: 3802 },
    });
    await prisma.messageThread.delete({ where: { messageThreadId: 3802 } });
    expect(
      (await prisma.activityChatNotice.findFirstOrThrow()).messageId,
    ).toBeNull();
    await service.deliver(notice);
    expect(
      await prisma.message.count({
        where: { activityNotice: { isNot: null } },
      }),
    ).toBe(0);
    expect(await prisma.messageThread.count()).toBe(1);
  });
  it('checks the current coach role even when a relationship still exists', async () => {
    await prisma.user.update({
      where: { userId: COACH_USER_ID },
      data: { roles: ['ATHLETE'] },
    });
    await expect(service.settings(coach, DELETED_ATHLETE_ID)).rejects.toThrow();
    await service.deliver(notice);
    expect(await prisma.activityChatNotice.count()).toBe(0);
  });
  it('does not deliver after the coaching relationship is removed', async () => {
    await prisma.coachAthlete.deleteMany({ where: { userId: COACH_USER_ID } });
    await service.deliver(notice);
    expect(await prisma.activityChatNotice.count()).toBe(0);
    await expect(service.settings(coach, DELETED_ATHLETE_ID)).rejects.toThrow();
  });
});
