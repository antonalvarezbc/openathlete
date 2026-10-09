import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { isTimeZone } from '@openathlete/shared';

import { Language } from 'src/common/constants/languages.constant';
import {
  addDaysToDateKey,
  startOfZonedDay,
  zonedClock,
} from 'src/common/utils/time-zone';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { trainingReminderNotification } from '../push/training-reminder';
import { PushNotificationService } from './push-notification.service';

/** Reminders go out from 19:00, local time */
const REMINDER_HOUR = 19;
/** A late run (after a restart) still sends until 22:59, never at night */
const LAST_REMINDER_HOUR = 22;

/**
 * Pushes, the evening before, the training sessions planned for the next
 * day, at the user's local time (the time zone the app saves; UTC until it
 * has).
 */
@Injectable()
export class TrainingReminderScheduler {
  private readonly logger = new Logger(TrainingReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Cron('*/15 * * * *')
  async sendTrainingReminders(now = new Date()): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        pushToken: { not: null },
        trainingReminders: true,
        athlete: { isNot: null },
      },
      select: {
        userId: true,
        language: true,
        timeZone: true,
        trainingReminderSentOn: true,
        athlete: { select: { athleteId: true } },
      },
    });

    let sent = 0;
    for (const user of users) {
      const timeZone =
        user.timeZone && isTimeZone(user.timeZone) ? user.timeZone : 'UTC';
      const { date, hour } = zonedClock(now, timeZone);
      if (hour < REMINDER_HOUR || hour > LAST_REMINDER_HOUR) continue;

      const evening = new Date(`${date}T00:00:00Z`);
      if (user.trainingReminderSentOn?.getTime() === evening.getTime()) {
        continue;
      }
      // The API and the worker both run this job: whoever records the
      // evening first sends the reminder
      const claimed = await this.prisma.user.updateMany({
        where: {
          userId: user.userId,
          OR: [
            { trainingReminderSentOn: null },
            { trainingReminderSentOn: { not: evening } },
          ],
        },
        data: { trainingReminderSentOn: evening },
      });
      if (claimed.count === 0) continue;

      const tomorrow = addDaysToDateKey(date, 1);
      const sessions = await this.prisma.event.findMany({
        where: {
          athleteId: user.athlete!.athleteId,
          type: 'TRAINING',
          startDate: {
            gte: startOfZonedDay(tomorrow, timeZone),
            lt: startOfZonedDay(addDaysToDateKey(tomorrow, 1), timeZone),
          },
        },
        orderBy: { startDate: 'asc' },
        select: { name: true },
      });
      if (sessions.length === 0) continue;

      const { title, body } = trainingReminderNotification(
        user.language as Language,
        sessions.map((session) => session.name),
      );
      const delivered = await this.pushNotificationService.sendPushNotification(
        {
          userId: user.userId,
          title,
          body,
          data: { type: 'training_reminder', date: tomorrow },
        },
      );
      if (delivered) sent++;
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} training reminders`);
    }
    return sent;
  }
}
