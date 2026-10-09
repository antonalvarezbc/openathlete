import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/services/prisma.service';
import {
  EmailTransportService,
  NotificationService,
  PushNotificationService,
  TrainingReminderScheduler,
} from './services';

@Module({
  providers: [
    EmailTransportService,
    NotificationService,
    PushNotificationService,
    TrainingReminderScheduler,
    PrismaService,
  ],
  controllers: [],
  exports: [
    EmailTransportService,
    NotificationService,
    PushNotificationService,
  ],
})
export class NotificationModule {}
