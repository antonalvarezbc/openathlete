import { useGetLatestMetricsQuery } from '@/api/metric/metric.hooks';
import { useGetTrainingZones } from '@/api/training-zone/training-zone.hooks';
import { createContext, useContext } from 'react';

import { SPORT_TYPE } from '@openathlete/shared';

// null explicitly means a reusable template without an assigned athlete.
export const WorkoutAthleteContext = createContext<{
  athleteId?: number | null;
  sport?: SPORT_TYPE;
}>({});

export function useWorkoutTargetData(sportOverride?: SPORT_TYPE) {
  const context = useContext(WorkoutAthleteContext);
  // No implicit fallback to the signed-in coach's personal athlete profile.
  const athleteId = context.athleteId ?? null;
  const zonesQuery = useGetTrainingZones(athleteId ?? 0, {
    enabled: !!athleteId,
  } as Parameters<typeof useGetTrainingZones>[1]);
  const metricsQuery = useGetLatestMetricsQuery(athleteId ?? undefined, {
    enabled: !!athleteId,
  });
  return {
    athleteId,
    sport: sportOverride ?? context.sport ?? SPORT_TYPE.RUNNING,
    zones: zonesQuery.data ?? [],
    metrics: metricsQuery.data ?? {},
    isLoading: !!athleteId && (zonesQuery.isPending || metricsQuery.isPending),
    isError: zonesQuery.isError || metricsQuery.isError,
  };
}
