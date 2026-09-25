import { cycleKeys } from '@/api/cycle/cycle.keys';
import { eventKeys } from '@/api/event/event.keys';
import {
  MutationOptions,
  QueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { ImportPlanDto, SEOPlanData } from '@openathlete/shared';

import { SeoPlanAPI } from './seo-plan.api';
import { seoPlanKeys } from './seo-plan.keys';

/**
 * Query hook to get a temporary training plan by token
 * Public endpoint, no authentication required
 */
export function useGetTemporaryPlan(
  token: string | null,
  options?: QueryOptions<SEOPlanData>,
) {
  return useQuery({
    ...options,
    queryKey: seoPlanKeys.temporaryPlan(token),
    queryFn: () => {
      if (!token) {
        throw new Error('Token is required');
      }
      return SeoPlanAPI.getTemporaryPlan(token);
    },
    enabled: !!token,
  });
}

/**
 * Mutation hook to create a temporary training plan
 * Returns a unique token that can be used to retrieve and import the plan
 */
export function useCreateTemporaryPlan(
  options?: MutationOptions<{ token: string }, Error, SEOPlanData, unknown>,
) {
  return useMutation({
    ...options,
    mutationKey: seoPlanKeys.create,
    mutationFn: (planData: SEOPlanData) =>
      SeoPlanAPI.createTemporaryPlan(planData),
  });
}

/**
 * Mutation hook to import a temporary training plan into the authenticated user's account
 * Creates a TrainingPlan with all cycles, weeks, and events
 */
export function useImportPlan(
  options?: MutationOptions<
    { trainingPlanId: number; name: string },
    Error,
    ImportPlanDto,
    unknown
  >,
) {
  const queryClient = useQueryClient();

  const originalOnSuccess = options?.onSuccess;

  return useMutation({
    ...options,
    mutationKey: seoPlanKeys.import,
    mutationFn: (data: ImportPlanDto) => SeoPlanAPI.importPlan(data),
    onSuccess: (data, variables, onMutateResult, context) => {
      // Invalidate relevant queries after successful import
      queryClient.invalidateQueries({ queryKey: [cycleKeys.getMyCycles] });
      queryClient.invalidateQueries({ queryKey: [eventKeys.getMyEvents] });
      queryClient.invalidateQueries({ queryKey: ['managed-plans'] });

      // Call the original onSuccess if provided
      if (originalOnSuccess) {
        originalOnSuccess(data, variables, onMutateResult, context);
      }
    },
  });
}
