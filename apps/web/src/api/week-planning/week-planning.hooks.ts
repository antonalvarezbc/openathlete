import { eventKeys } from '@/api/event/event.keys';
import { trainingLoadKeys } from '@/api/training-load/training-load.keys';
import client, { routes } from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CopyEventsBatch,
  DeleteEventsBatch,
  EventBatchResult,
  MoveEventsBatch,
  UpdateTrainingWeek,
  WeekOverviewDto,
} from '@openathlete/shared';

export const weekPlanningKeys = {
  overview: 'WeekPlanningAPI.overview',
} as const;

/** Plan context and actual load per activity for the week starting at weekStart (local Monday). */
export function useWeekOverviewQuery(
  weekStart: Date | undefined,
  athleteId?: number,
  trainingPlanId?: number,
) {
  return useQuery({
    queryKey: [
      weekPlanningKeys.overview,
      weekStart?.toISOString(),
      athleteId,
      trainingPlanId,
    ],
    queryFn: async () =>
      (
        await client.get<WeekOverviewDto>(routes.weekPlanning.overview, {
          params: {
            weekStart: weekStart!.toISOString(),
            athleteId,
            trainingPlanId,
          },
        })
      ).data,
    enabled: !!weekStart,
  });
}

function useInvalidateWeek() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [eventKeys.getMyEvents] }),
      queryClient.invalidateQueries({
        queryKey: [trainingLoadKeys.getWeeklyLoadSummary],
      }),
      queryClient.invalidateQueries({
        queryKey: [weekPlanningKeys.overview],
      }),
      queryClient.invalidateQueries({ queryKey: ['managed-plans'] }),
    ]);
}

export function useUpdateTrainingWeekMutation() {
  const invalidate = useInvalidateWeek();
  return useMutation({
    mutationFn: async ({
      trainingWeekId,
      body,
    }: {
      trainingWeekId: number;
      body: UpdateTrainingWeek;
    }) =>
      (await client.patch(routes.weekPlanning.week(trainingWeekId), body)).data,
    onSuccess: invalidate,
  });
}

export function useCopyEventsMutation() {
  const invalidate = useInvalidateWeek();
  return useMutation({
    mutationFn: async (body: CopyEventsBatch) =>
      (
        await client.post<EventBatchResult>(
          routes.weekPlanning.copyEvents,
          body,
        )
      ).data,
    onSettled: invalidate,
  });
}

export function useMoveEventsMutation() {
  const invalidate = useInvalidateWeek();
  return useMutation({
    mutationFn: async (body: MoveEventsBatch) =>
      (
        await client.post<EventBatchResult>(
          routes.weekPlanning.moveEvents,
          body,
        )
      ).data,
    onSettled: invalidate,
  });
}

export function useDeleteEventsMutation() {
  const invalidate = useInvalidateWeek();
  return useMutation({
    mutationFn: async (body: DeleteEventsBatch) =>
      (
        await client.post<EventBatchResult>(
          routes.weekPlanning.deleteEvents,
          body,
        )
      ).data,
    onSettled: invalidate,
  });
}
