import { useMutation, useQuery } from '@tanstack/react-query';

import { AiPlanContextRequest, AiPlanRequest } from '@openathlete/shared';

import { AiPlanAPI } from './ai-plan.api';
import { aiPlanKeys } from './ai-plan.keys';

export function useStartAiPlanMutation() {
  return useMutation({
    mutationFn: (request: AiPlanRequest) => AiPlanAPI.start(request),
  });
}

export function useAiPlanRacesQuery(athleteId: number) {
  return useQuery({
    queryKey: [aiPlanKeys.races, athleteId],
    queryFn: () => AiPlanAPI.races(athleteId),
  });
}

/** What the AI will use; off until the dates are valid. */
export function useAiPlanContextQuery(input: AiPlanContextRequest | null) {
  return useQuery({
    queryKey: [aiPlanKeys.context, input],
    queryFn: () => AiPlanAPI.context(input!),
    enabled: !!input,
    placeholderData: (previous) => previous,
  });
}

/** Follows a draft until it is done or failed. */
export function useAiPlanJobQuery(jobId: string | null, pollMs = 2500) {
  return useQuery({
    queryKey: [aiPlanKeys.job, jobId],
    queryFn: () => AiPlanAPI.status(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'done' || state === 'failed' ? false : pollMs;
    },
  });
}
