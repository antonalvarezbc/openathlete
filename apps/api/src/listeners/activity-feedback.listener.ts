import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ActivityImportedEvent } from 'src/events';
import { ActivityFeedbackGenerationService } from 'src/modules/core/services/activity-feedback-generation.service';

@Injectable()
export class ActivityFeedbackListener {
  private readonly logger = new Logger(ActivityFeedbackListener.name);
  constructor(private readonly generation: ActivityFeedbackGenerationService) {}

  @OnEvent(ActivityImportedEvent.SLUG, { async: true })
  async handleActivityImport(event: ActivityImportedEvent) {
    if (event.payload.bulkImport) return;
    try {
      await this.generation.generate(event.payload.eventActivityId);
    } catch (error) {
      this.logger.warn(
        `Feedback generation skipped or failed for activity ${event.payload.eventActivityId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
