import { m } from '@/paraglide/messages';
import { metricTypeLabelMap } from '@/utils/label-map/core/metric-type.label-map';
import { isAxiosError } from 'axios';

import { WorkoutTargetError } from '@openathlete/shared';

export function workoutTargetErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const detail =
    error instanceof WorkoutTargetError
      ? error
      : isAxiosError(error)
        ? error.response?.data
        : undefined;
  const reference =
    typeof detail?.reference === 'string' ? detail.reference : '';
  switch (detail?.code) {
    case 'WORKOUT_TARGET_MISSING_METRIC':
      return m.workout_target_missing_metric({
        metric:
          metricTypeLabelMap[reference as keyof typeof metricTypeLabelMap] ??
          reference,
      });
    case 'WORKOUT_TARGET_MISSING_ZONE':
      return m.workout_target_missing_zone({ zone: reference });
    case 'WORKOUT_TARGET_AMBIGUOUS_ZONE':
      return m.workout_target_ambiguous_zone({ zone: reference });
    case 'WORKOUT_TARGET_INVALID':
      return m.workout_target_invalid();
    default:
      return fallback;
  }
}
