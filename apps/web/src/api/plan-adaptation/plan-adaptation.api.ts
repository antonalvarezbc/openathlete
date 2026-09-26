import client from '@/utils/axios';

import {
  AdaptationSession,
  ApplyPlanAdaptation,
  PlanAdaptationProposal,
  PlanAdaptationRequest,
  RefinePlanAdaptation,
} from '@openathlete/shared';

export interface AdaptationContextResponse {
  contextVersion: string;
  data: {
    asOf: string;
    sessions: Array<{
      startDate: string;
      endDate: string;
      exported: boolean;
      original: AdaptationSession;
    }>;
    missingMetrics: string[];
    [key: string]: unknown;
  };
}
export interface AdaptationProposalResponse extends AdaptationContextResponse {
  proposal: PlanAdaptationProposal | null;
  rawResponse?: string;
  validationIssue?: { code: string; sessionName?: string } | null;
}
export const PlanAdaptationAPI = {
  context: async (request: PlanAdaptationRequest) =>
    (
      await client.post<AdaptationContextResponse>(
        '/agent/ai/plan-adaptation/context',
        request,
      )
    ).data,
  propose: async (request: PlanAdaptationRequest) =>
    (
      await client.post<AdaptationProposalResponse>(
        '/agent/ai/plan-adaptation/propose',
        request,
      )
    ).data,
  refine: async (request: RefinePlanAdaptation) =>
    (
      await client.post<AdaptationProposalResponse>(
        '/agent/ai/plan-adaptation/refine',
        request,
      )
    ).data,
  apply: async (request: ApplyPlanAdaptation) =>
    (
      await client.post<{ updated: number; created: number }>(
        '/agent/ai/plan-adaptation/apply',
        request,
      )
    ).data,
};
