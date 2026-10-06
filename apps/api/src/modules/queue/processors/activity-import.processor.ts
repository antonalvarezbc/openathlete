import { Job } from 'bullmq';

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ConnectorProvider, EventActivity } from '@openathlete/database';

import { CoachActivityNoticeEvent } from '../../../events/coach-activity-notice.event';
import { PrismaService } from '../../prisma/services/prisma.service';
import {
  GarminProviderService,
  PolarProviderService,
  StravaProviderService,
  SuuntoProviderService,
} from '../../providers-sync/providers';
import { ActivityImportJobData, QueueService } from '../queue.service';

@Processor('activity-import', {
  concurrency: 3,
})
export class ActivityImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ActivityImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StravaProviderService))
    private readonly stravaProviderService: StravaProviderService,
    @Inject(forwardRef(() => GarminProviderService))
    private readonly garminProviderService: GarminProviderService,
    @Inject(forwardRef(() => PolarProviderService))
    private readonly polarProviderService: PolarProviderService,
    @Inject(forwardRef(() => SuuntoProviderService))
    private readonly suuntoProviderService: SuuntoProviderService,
    private readonly queueService: QueueService,
    @Optional() private readonly emitter?: EventEmitter2,
  ) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ActivityImportJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.data?.activity?.externalId || 'unknown'}) failed: ${error.message}`,
      error.stack,
    );
  }

  async process(job: Job<ActivityImportJobData>) {
    const { providerAccountId, activity, bulkImport } = job.data;

    try {
      await job.updateProgress(10);

      const account = await this.prisma.providerAccount.findUnique({
        where: {
          providerAccountId: providerAccountId,
        },
      });

      if (!account) {
        throw new Error(`Provider account ${providerAccountId} not found`);
      }

      if (account.status !== 'active') {
        throw new Error(
          `Provider account ${providerAccountId} is not active (status: ${account.status})`,
        );
      }

      if (!account.importActivitiesEnabled) {
        this.logger.debug(
          `Skipping import for provider account ${providerAccountId}: import disabled`,
        );
        return;
      }

      await job.updateProgress(30);

      let savedActivity: EventActivity;
      if (account.provider === ConnectorProvider.STRAVA) {
        savedActivity = await this.stravaProviderService.importActivity(
          account,
          activity,
        );
      } else if (account.provider === ConnectorProvider.GARMIN) {
        savedActivity = await this.garminProviderService.importActivity(
          account,
          activity,
        );
      } else if (account.provider === ConnectorProvider.POLAR) {
        savedActivity = await this.polarProviderService.importActivity(
          account,
          activity,
        );
      } else if (account.provider === ConnectorProvider.SUUNTO) {
        savedActivity = await this.suuntoProviderService.importActivity(
          account,
          activity,
        );
      } else {
        throw new Error(
          `Provider ${account.provider} does not support activity import yet`,
        );
      }

      if (!bulkImport && this.emitter) {
        const importedEvent = await this.prisma.event.findUnique({
          where: { eventId: savedActivity.eventId },
          select: { createdAt: true },
        });
        if (importedEvent && importedEvent.createdAt.getTime() >= job.timestamp)
          this.emitter.emit(
            CoachActivityNoticeEvent.SLUG,
            new CoachActivityNoticeEvent({
              eventId: savedActivity.eventId,
              kind: 'ACTIVITY',
              deliveryKey: `import:${savedActivity.eventId}`,
            }),
          );
      }
      await job.updateProgress(60);

      const activityWithStream = await this.prisma.eventActivity.findUnique({
        where: { eventActivityId: savedActivity.eventActivityId },
        select: { stream: true },
      });

      // Records are computed by the processing pipeline queued below
      await job.updateProgress(90);

      if (
        account.provider === ConnectorProvider.GARMIN &&
        !activityWithStream?.stream
      ) {
        return {
          success: true,
          eventActivityId: savedActivity.eventActivityId,
          eventId: savedActivity.eventId,
          waitingForStream: true,
        };
      }

      await this.queueService.addActivityProcessingJob(
        savedActivity.eventActivityId,
        savedActivity.eventId,
        bulkImport,
      );

      return {
        success: true,
        eventActivityId: savedActivity.eventActivityId,
        eventId: savedActivity.eventId,
      };
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
