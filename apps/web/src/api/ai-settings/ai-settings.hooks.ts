import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  AiTask,
  CreateAiCredentialDto,
  UpdateAiModelPreferencesDto,
} from '@openathlete/shared';

import { AiSettingsAPI } from './ai-settings.api';
import { aiSettingsKeys } from './ai-settings.keys';

export function useAiProvidersQuery() {
  return useQuery({
    queryKey: aiSettingsKeys.providers(),
    queryFn: AiSettingsAPI.getProviders,
    // The model registry only changes with API deployments
    staleTime: 60 * 60 * 1000,
  });
}

export function useAiCredentialsQuery() {
  return useQuery({
    queryKey: aiSettingsKeys.credentials(),
    queryFn: AiSettingsAPI.getCredentials,
  });
}

export function useAiModelPreferencesQuery() {
  return useQuery({
    queryKey: aiSettingsKeys.models(),
    queryFn: AiSettingsAPI.getModelPreferences,
  });
}

/**
 * Which AI features can run for the user, and on which model. With an
 * athlete, background features consider the athlete and their coaches.
 */
export function useAiAccessQuery(athleteId?: number) {
  return useQuery({
    queryKey: aiSettingsKeys.access(athleteId),
    queryFn: () => AiSettingsAPI.getAccess(athleteId),
  });
}

/** Whether the user can run an AI feature they trigger themselves. */
export function useAiTaskAvailable(task: Exclude<AiTask, AiTask.DEFAULT>): {
  available: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useAiAccessQuery();
  return { available: data?.tasks[task].available ?? false, isLoading };
}

/** Keys, model choices and access all change together. */
function useInvalidateAiSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
}

export function useCreateAiCredentialMutation() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (body: CreateAiCredentialDto) =>
      AiSettingsAPI.createCredential(body),
    onSuccess: invalidate,
  });
}

export function useDeleteAiCredentialMutation() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (aiCredentialId: number) =>
      AiSettingsAPI.deleteCredential(aiCredentialId),
    onSuccess: invalidate,
  });
}

export function useTestAiCredentialMutation() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: ({
      aiCredentialId,
      modelId,
    }: {
      aiCredentialId: number;
      modelId: string;
    }) => AiSettingsAPI.testCredential(aiCredentialId, modelId),
    // The test records the key's status (last error, last use)
    onSettled: invalidate,
  });
}

export function useUpdateAiModelPreferencesMutation() {
  const invalidate = useInvalidateAiSettings();
  return useMutation({
    mutationFn: (body: UpdateAiModelPreferencesDto) =>
      AiSettingsAPI.updateModelPreferences(body),
    onSuccess: invalidate,
  });
}
