import client, { routes } from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AiMemoryDto, AiMemoryMode } from '@openathlete/shared';

const aiMemoryKey = (athleteId: number) => ['ai-memory', athleteId];

/** The current coach's private AI memory about one linked athlete. */
export function useAiMemoryQuery(athleteId: number) {
  return useQuery({
    queryKey: aiMemoryKey(athleteId),
    queryFn: async () =>
      (await client.get<AiMemoryDto>(routes.aiFeatures.memory(athleteId))).data,
    enabled: !!athleteId,
  });
}

export function useUpdateAiMemoryModeMutation(athleteId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mode: AiMemoryMode) =>
      (
        await client.patch<AiMemoryDto>(routes.aiFeatures.memory(athleteId), {
          mode,
        })
      ).data,
    onSuccess: (data) => queryClient.setQueryData(aiMemoryKey(athleteId), data),
  });
}

export function useClearAiMemoryMutation(athleteId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await client.delete<AiMemoryDto>(routes.aiFeatures.memory(athleteId)))
        .data,
    onSuccess: (data) => queryClient.setQueryData(aiMemoryKey(athleteId), data),
  });
}
