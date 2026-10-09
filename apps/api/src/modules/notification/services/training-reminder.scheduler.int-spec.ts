import {
  COACH_USER_ID,
  DELETED_ATHLETE_ID,
  DELETED_USER_ID,
  accountFixtureSql,
} from 'src/modules/auth/services/account-deletion.fixture';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { PushNotificationService } from './push-notification.service';
import { TrainingReminderScheduler } from './training-reminder.scheduler';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

// 19:05 in Paris on Friday 9 October 2026
const EVENING = new Date('2026-10-09T17:05:00Z');

describe('training reminders (PostgreSQL)', () => {
  let prisma: PrismaService;
  let scheduler: TrainingReminderScheduler;
  const push = { sendPushNotification: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    scheduler = new TrainingReminderScheduler(
      prisma,
      push as unknown as PushNotificationService,
    );
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
    // The fixture's athlete, on the app in Paris, in English
    await prisma.user.update({
      where: { userId: DELETED_USER_ID },
      data: { pushToken: 'device', timeZone: 'Europe/Paris', language: 'EN' },
    });
    push.sendPushNotification.mockReset().mockResolvedValue(true);
  });

  const plan = (name: string, startDate: string, type = 'TRAINING') =>
    prisma.event.create({
      data: {
        name,
        type: type as 'TRAINING',
        startDate: new Date(startDate),
        endDate: new Date(new Date(startDate).getTime() + 3600_000),
        athleteId: DELETED_ATHLETE_ID,
      },
    });

  it("pushes the next day's sessions once, in the evening", async () => {
    // Saturday in Paris: 00:30 local is still Friday 22:30 UTC
    await plan('Long run', '2026-10-10T07:00:00Z');
    await plan('Strides', '2026-10-09T22:30:00Z');
    // Not tomorrow: tonight, Sunday, and a race
    await plan('Tonight', '2026-10-09T18:00:00Z');
    await plan('Sunday ride', '2026-10-10T22:30:00Z');
    await plan('Race', '2026-10-10T09:00:00Z', 'COMPETITION');

    await expect(scheduler.sendTrainingReminders(EVENING)).resolves.toBe(1);
    expect(push.sendPushNotification).toHaveBeenCalledTimes(1);
    expect(push.sendPushNotification).toHaveBeenCalledWith({
      userId: DELETED_USER_ID,
      title: 'Tomorrow',
      body: '2 sessions: Strides, Long run',
      data: { type: 'training_reminder', date: '2026-10-10' },
    });

    // The next runs of the evening, from the API or the worker, send nothing
    await scheduler.sendTrainingReminders(new Date('2026-10-09T17:20:00Z'));
    await scheduler.sendTrainingReminders(new Date('2026-10-09T20:45:00Z'));
    expect(push.sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('sends once when two containers run the job together', async () => {
    await plan('Long run', '2026-10-10T07:00:00Z');
    await Promise.all([
      scheduler.sendTrainingReminders(EVENING),
      scheduler.sendTrainingReminders(EVENING),
    ]);
    expect(push.sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('waits for the evening in the athlete’s own time zone', async () => {
    await plan('Long run', '2026-10-10T14:00:00Z');
    await prisma.user.update({
      where: { userId: DELETED_USER_ID },
      data: { timeZone: 'America/New_York' },
    });
    // 13:05 in New York
    await scheduler.sendTrainingReminders(EVENING);
    expect(push.sendPushNotification).not.toHaveBeenCalled();
    // 19:05 in New York, still Friday there
    await scheduler.sendTrainingReminders(new Date('2026-10-09T23:05:00Z'));
    expect(push.sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Long run' }),
    );
  });

  it('reminds again the next evening', async () => {
    await plan('Long run', '2026-10-10T07:00:00Z');
    await plan('Recovery', '2026-10-11T07:00:00Z');
    await scheduler.sendTrainingReminders(EVENING);
    await scheduler.sendTrainingReminders(new Date('2026-10-10T17:05:00Z'));
    expect(push.sendPushNotification).toHaveBeenCalledTimes(2);
    expect(push.sendPushNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: 'Recovery' }),
    );
  });

  it('leaves out users who turned reminders off, or have no app', async () => {
    await plan('Long run', '2026-10-10T07:00:00Z');
    await prisma.user.update({
      where: { userId: DELETED_USER_ID },
      data: { trainingReminders: false },
    });
    await scheduler.sendTrainingReminders(EVENING);

    await prisma.user.update({
      where: { userId: DELETED_USER_ID },
      data: { trainingReminders: true, pushToken: null },
    });
    await scheduler.sendTrainingReminders(EVENING);
    expect(push.sendPushNotification).not.toHaveBeenCalled();

    // A coach's own token does not bring their athletes' sessions
    await prisma.user.update({
      where: { userId: COACH_USER_ID },
      data: { pushToken: 'coach-device' },
    });
    await scheduler.sendTrainingReminders(EVENING);
    expect(push.sendPushNotification).not.toHaveBeenCalled();
  });

  it('sends nothing when no session is planned tomorrow', async () => {
    await expect(scheduler.sendTrainingReminders(EVENING)).resolves.toBe(0);
    expect(push.sendPushNotification).not.toHaveBeenCalled();
  });
});
