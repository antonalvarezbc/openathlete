import { useInstallationFeatures } from '@/api/installation/installation.hooks';
import { m } from '@/paraglide/messages';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import {
  ManualGarminWorkoutResultDto,
  ManualGarminWorkoutStateDto,
  ManualGarminWorkouts,
} from '@openathlete/shared';

const workoutsKey = 'ManualGarminAPI.workouts';
// One Garmin operation may wait for request pacing; the API stops it at 180 s.
const GARMIN_TIMEOUT = 240_000;

/** Whether planned sessions of this athlete can be sent to Garmin manually. */
export function useManualGarminConnected(athleteId?: number) {
  const { manualGarminSync } = useInstallationFeatures();
  const status = useQuery({
    // Same key and endpoint as the Garmin settings card: one shared read.
    queryKey: ['garmin-manual-status', athleteId],
    queryFn: async () =>
      (
        await client.get<{ connected?: boolean }>(
          '/provider/garmin-manual/status',
          { params: { athleteId } },
        )
      ).data,
    enabled: manualGarminSync && !!athleteId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return manualGarminSync && !!status.data?.connected;
}

export function useManualGarminWorkoutsQuery(
  athleteId: number | undefined,
  eventIds: number[],
  enabled = true,
) {
  return useQuery({
    queryKey: [workoutsKey, athleteId, eventIds],
    queryFn: async () =>
      (
        await client.get<ManualGarminWorkoutStateDto[]>(
          '/provider/garmin-manual/workouts',
          { params: { athleteId, eventIds: eventIds.join(',') } },
        )
      ).data,
    enabled: enabled && !!athleteId && eventIds.length > 0,
    refetchOnWindowFocus: false,
  });
}

function useWorkoutsMutation(path: 'send' | 'remove') {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (body: ManualGarminWorkouts) =>
      (
        await client.post<ManualGarminWorkoutResultDto[]>(
          `/provider/garmin-manual/workouts/${path}`,
          body,
          { timeout: GARMIN_TIMEOUT },
        )
      ).data,
    onSettled: () => cache.invalidateQueries({ queryKey: [workoutsKey] }),
  });
}

export const useSendToGarminMutation = () => useWorkoutsMutation('send');
export const useRemoveFromGarminMutation = () => useWorkoutsMutation('remove');

/** Stable API codes -> user language; unknown codes get the generic text. */
export function garminWorkoutErrorText(code?: string, retryAfter?: number) {
  switch (code) {
    case 'GARMIN_REMOTE_COOLDOWN':
      return retryAfter
        ? m.garmin_workout_wait({ seconds: retryAfter })
        : m.garmin_workout_wait_later();
    case 'GARMIN_BACKFILL_BUSY':
      return m.garmin_backfill_busy();
    case 'GARMIN_LOGIN_REQUIRED':
      return m.garmin_backfill_auth();
    case 'GARMIN_WORKOUT_REJECTED':
      return m.garmin_workout_rejected();
    case 'GARMIN_PAST_SESSION':
      return m.garmin_workout_past();
    case 'GARMIN_TARGETS_UNRESOLVED':
      return m.garmin_workout_targets();
    default:
      return m.garmin_workout_failed();
  }
}

export function garminRequestErrorText(failure: unknown) {
  if (!isAxiosError(failure)) return m.garmin_workout_failed();
  const data = failure.response?.data as
    { code?: string; retryAfterSeconds?: number } | undefined;
  return garminWorkoutErrorText(data?.code, data?.retryAfterSeconds);
}
