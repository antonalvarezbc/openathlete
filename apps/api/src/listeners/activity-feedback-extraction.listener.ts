import { openai } from '@ai-sdk/openai';

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { FeatureName } from '@openathlete/shared';

import { ActivityFeedbackCompletedEvent } from 'src/events';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { FeatureAccessService } from 'src/modules/subscription/services/feature-access.service';

import { feedbackEmbeddingUpsert } from './activity-feedback-embedding';

@Injectable()
export class ActivityFeedbackExtractionListener {
  private readonly logger = new Logger(ActivityFeedbackExtractionListener.name);
  private readonly embedder = openai.embedding('text-embedding-3-small');
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureAccessService: FeatureAccessService,
  ) {}

  @OnEvent(ActivityFeedbackCompletedEvent.SLUG, { async: true })
  async handleActivityFeedbackCompleted(event: ActivityFeedbackCompletedEvent) {
    const { eventActivityId, trigger } = event.payload;

    try {
      this.logger.log(
        `Processing feedback extraction for activity ${eventActivityId} (trigger: ${trigger})...`,
      );

      // Fetch activity with questions, answers, and comment
      const activity = await this.prisma.eventActivity.findUnique({
        where: { eventActivityId: eventActivityId },
        include: {
          event: {
            select: {
              eventId: true,
              athleteId: true,
            },
          },
          feedbackQuestions: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!activity || !activity.event?.athleteId || !activity.event?.eventId) {
        this.logger.warn(
          `Activity ${eventActivityId} not found or has no athlete/event, skipping extraction`,
        );
        return;
      }

      const athleteId = activity.event.athleteId;

      // Use the same opt-out and feature entitlement as feedback questions.
      // Check before sending any athlete content to agents or the embedder.
      const settings = await this.prisma.athleteSettings.findUnique({
        where: { athleteId },
      });
      if (!settings?.requireFeedbackQuestions) return;
      if (
        !(await this.featureAccessService.canAccessFeatureForAthlete(
          athleteId,
          FeatureName.AI_RPE_QUESTIONS,
        ))
      )
        return;

      // Collect all answers and comment
      const questions = activity.feedbackQuestions;
      const allAnswered = questions.every((q: { answerText: string | null }) =>
        Boolean(q.answerText?.trim()),
      );

      // Only process if all questions are answered OR if RPE+comment are present
      if (trigger === 'questions_completed' && !allAnswered) {
        this.logger.debug(
          `Not all questions answered for activity ${eventActivityId}, skipping extraction`,
        );
        return;
      }

      // Build feedback text: concatenate all answers + comment
      const answersText = questions
        .filter((q: { answerText: string | null }) => q.answerText)
        .map(
          (q: { questionText: string; answerText: string | null }) =>
            `${q.questionText}\n${q.answerText}`,
        )
        .join('\n\n');

      const commentText = activity.description?.trim() || '';
      const feedbackText = [answersText, commentText]
        .filter((t) => t.length > 0)
        .join('\n\n');

      if (!feedbackText || feedbackText.trim().length === 0) {
        this.logger.debug(
          `No feedback text available for activity ${eventActivityId}, skipping extraction`,
        );
        return;
      }

      // Create embeddings with retry
      const embedding = await this.retryWithBackoff(async () => {
        const result = await this.embedder.doEmbed({
          values: [feedbackText],
        });

        // doEmbed returns an object with embeddings property
        // Structure: { embeddings: number[][] }
        if (!result || typeof result !== 'object') {
          throw new Error(
            `Invalid embedding result: ${JSON.stringify(result)}`,
          );
        }

        if ('embeddings' in result && Array.isArray(result.embeddings)) {
          const embeddings = result.embeddings as number[][];
          if (embeddings.length === 0 || !Array.isArray(embeddings[0])) {
            throw new Error(
              `Invalid embeddings array: ${JSON.stringify(embeddings)}`,
            );
          }
          return embeddings[0];
        }

        // Fallback: check if result is directly an array
        if (
          Array.isArray(result) &&
          result.length > 0 &&
          Array.isArray(result[0])
        ) {
          return result[0];
        }

        throw new Error(
          `Unexpected embedding result structure: ${JSON.stringify(result)}`,
        );
      }, 'embedding creation');

      // Validate vector dimensions and values before any writes.
      const embeddingQuery = feedbackEmbeddingUpsert(
        eventActivityId,
        feedbackText,
        embedding,
      );

      // Questionnaire answers remain the athlete's words. Do not infer or
      // write an RPE or injury without an explicit review workflow.
      await this.prisma.$transaction(async (tx) => {
        const currentSettings = await tx.athleteSettings.findUnique({
          where: { athleteId },
        });
        if (!currentSettings?.requireFeedbackQuestions) return;
        await tx.$executeRaw(embeddingQuery);
      });

      this.logger.log(
        `✓ Completed feedback extraction for activity ${eventActivityId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing feedback extraction for activity ${eventActivityId}:`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    operation: string,
    retries = this.MAX_RETRIES,
  ): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          this.logger.warn(
            `${operation} failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `${operation} failed after ${retries} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }
}
