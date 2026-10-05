import { Job, UnrecoverableError } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { AiPlanDraft } from '@openathlete/shared';

import { classifyAiFailure, encodeAiFailure } from '../services/ai-failure';
import {
  PLAN_GENERATION_QUEUE,
  PLAN_MODEL,
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
    try {
      return await this.service.generate(job.data.request, (stage) =>
        job.updateProgress({ stage }),
      );
    } catch (error) {
      // Never the prompt or keys: the reason, the model and the error.
      const failure = classifyAiFailure(error);
      this.logger.error(
        `AI plan draft failed: task=PLAN_GENERATION model=${PLAN_MODEL} ` +
          `reason=${failure.reason} status=${failure.status ?? '-'} ` +
          `code=${failure.code ?? '-'} error=${failure.name}: ${failure.message}`,
      );
      // The status endpoint reads the reason back from the failed reason.
      throw new UnrecoverableError(encodeAiFailure(failure));
    }
  }
}
