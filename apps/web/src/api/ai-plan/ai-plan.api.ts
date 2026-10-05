import client, { routes } from '@/utils/axios';

import {
  AiPlanContextPreview,
  AiPlanContextRequest,
  AiPlanJobStatus,
  AiPlanRequest,
  AiPlanUpcomingRace,
  AiPlanWeekSteps,
  AiPlanWeekStepsRequest,
} from '@openathlete/shared';

export class AiPlanAPI {
  /** Queues a plan draft; follow it with `status`. */
  static async start(request: AiPlanRequest) {
    const res = await client.post<AiPlanJobStatus>(
      routes.aiPlan.draft,
      request,
    );
    return res.data;
  }

  static async status(jobId: string) {
    const res = await client.get<AiPlanJobStatus>(
      routes.aiPlan.draftStatus(jobId),
    );
    return res.data;
  }

  /** The athlete's upcoming competitions, to pick the goal race from. */
  static async races(athleteId: number) {
    const res = await client.get<AiPlanUpcomingRace[]>(routes.aiPlan.races, {
      params: { athleteId },
    });
    return res.data;
  }

  /** What the AI will receive about the athlete for these dates. */
  static async context(input: AiPlanContextRequest) {
    const res = await client.post<AiPlanContextPreview>(
      routes.aiPlan.context,
      input,
    );
    return res.data;
  }

  /** Structured steps for one week of a draft, one entry per session. */
  static async weekSteps(
    request: AiPlanWeekStepsRequest,
    signal?: AbortSignal,
  ) {
    const res = await client.post<AiPlanWeekSteps>(
      routes.aiPlan.weekSteps,
      request,
      { signal },
    );
    return res.data;
  }
}
