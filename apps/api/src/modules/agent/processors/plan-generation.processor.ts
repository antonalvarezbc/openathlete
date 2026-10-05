import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';

import { AiPlanDraft } from '@openathlete/shared';

import {
  PLAN_GENERATION_QUEUE,
  PlanGenerationJob,
  PlanGenerationService,
} from '../services/plan-generation.service';

/** Drafts AI plans; each can take minutes, so few run at once. */
@Processor(PLAN_GENERATION_QUEUE, { concurrency: 2 })
export class PlanGenerationProcessor extends WorkerHost {
  constructor(private readonly service: PlanGenerationService) {
    super();
  }

  async process(job: Job<PlanGenerationJob>): Promise<AiPlanDraft> {
    await job.updateProgress({ stage: 'generating' });
    return this.service.generate(job.data.request, (stage) =>
      job.updateProgress({ stage }),
    );
  }
}
