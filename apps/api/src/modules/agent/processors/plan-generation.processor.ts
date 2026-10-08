import { Job, UnrecoverableError } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { AiPlanDraft } from '@openathlete/shared';

import { redactAiError } from '../../ai/ai.errors';
import type { ResolvedAiModel } from '../../ai/services/ai-model-resolver.service';
import { encodeAiFailure, planFailure } from '../services/ai-failure';
import {
  PLAN_GENERATION_QUEUE,
  PlanGenerationJob,
  PlanGenerationService,
} from '../services/plan-generation.service';

/** Drafts AI plans; each can take minutes, so few run at once. */
@Processor(PLAN_GENERATION_QUEUE, { concurrency: 2 })
export class PlanGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanGenerationProcessor.name);

  constructor(private readonly service: PlanGenerationService) {
    super();
  }

  async process(job: Job<PlanGenerationJob>): Promise<AiPlanDraft> {
    await job.updateProgress({ stage: 'generating' });
    let model: ResolvedAiModel | undefined;
    try {
      await this.service.authorize(job.data.userId, job.data.request.athleteId);
      // The keys of whoever asked, resolved here: they never enter the queue.
      model = await this.service.resolveModel(job.data.userId);
      return await this.service.generate(model, job.data.request, (stage) =>
        job.updateProgress({ stage }),
      );
    } catch (error) {
      // Never the prompt or keys: the reason, the model and the error.
      const failure = planFailure(error);
      this.logger.error(
        `AI plan draft failed: task=PLAN_GENERATION ` +
          `model=${model ? `${model.provider}/${model.modelId}` : '-'} ` +
          `source=${model?.source ?? '-'} reason=${failure.reason} ` +
          `detail=${failure.detail ?? '-'} error=${redactAiError(
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
          )}`,
      );
      // The status endpoint reads the reason back from the failed reason.
      throw new UnrecoverableError(encodeAiFailure(failure, model?.source));
    }
  }
}
