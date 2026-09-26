import client from '@/utils/axios';

import {
  ActivityAnalysisRequest,
  SavedActivityAnalysis,
  UpdateActivityAnalysis,
} from '@openathlete/shared';

const path = (eventId: number) => `/agent/ai/activity-analysis/${eventId}`;

export const ActivityAnalysisAPI = {
  list: async (eventId: number, signal?: AbortSignal) =>
    (await client.get<SavedActivityAnalysis[]>(path(eventId), { signal })).data,
  context: async (eventId: number, request: ActivityAnalysisRequest) =>
    (
      await client.post<{ data: Record<string, unknown> }>(
        `${path(eventId)}/context`,
        request,
      )
    ).data,
  generate: async (eventId: number, request: ActivityAnalysisRequest) =>
    (
      await client.post<SavedActivityAnalysis>(
        `${path(eventId)}/generate`,
        request,
      )
    ).data,
  update: async (
    eventId: number,
    analysisId: number,
    request: UpdateActivityAnalysis,
  ) =>
    (
      await client.patch<SavedActivityAnalysis>(
        `${path(eventId)}/${analysisId}`,
        request,
      )
    ).data,
};
