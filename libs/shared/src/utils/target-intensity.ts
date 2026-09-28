import type { WorkoutStepTargetDto } from '../types/dtos/core/workout.dto';
import { METRIC_TYPE } from '../types/misc/core/metric-type.enum';
import { resolveWorkoutMetric } from './workout-targets';
import { kmhToSpeedMs } from './workout.utils';

/**
 * Default metric values used as fallback when athlete metrics are not available.
 * These represent population averages.
 */
export const DEFAULT_METRIC_VALUES: Record<string, number> = {
  [METRIC_TYPE.VMA]: 15, // km/h - average VMA (~4:00 min/km pace)
  [METRIC_TYPE.FTP_RUNNING]: 275, // W - average running FTP
  [METRIC_TYPE.FTP_CYCLING]: 225, // W - average cycling FTP
  [METRIC_TYPE.CRITICAL_POWER_RUNNING]: 275, // W - same as FTP_RUNNING
  [METRIC_TYPE.CRITICAL_POWER_CYCLING]: 225, // W - same as FTP_CYCLING
  [METRIC_TYPE.HR_MAX]: 190, // bpm - average max heart rate
  [METRIC_TYPE.HR_REST]: 60, // bpm - average resting heart rate
  [METRIC_TYPE.HR_RESERVE]: 130, // bpm - average HR reserve (HR_MAX - HR_REST)
};

/** Resolve explicit metric references without guessing from numeric values. */
export function getTargetIntensity(
  target: Pick<
    WorkoutStepTargetDto,
    'targetType' | 'targetValue' | 'targetMin' | 'targetMax' | 'metricType'
  >,
  metrics: Record<string, { value: number } | number> | undefined,
): {
  value: number | null;
  min: number | null;
  max: number | null;
} {
  if (!target || target.targetType === 'OPEN') {
    return { value: null, min: null, max: null };
  }

  const { targetValue, targetMin, targetMax, metricType, targetType } = target;

  let multiplier = 1;
  let offset = 0;
  if (metricType) {
    try {
      ({ multiplier, offset } = resolveWorkoutMetric(
        metricType,
        metrics ?? {},
      ));
    } catch {
      return { value: null, min: null, max: null };
    }
  }
  const convert = (value: number | null | undefined) =>
    value == null ? null : offset + value * multiplier;
  const absoluteValue = convert(targetValue);
  const absoluteMin = convert(targetMin);
  const absoluteMax = convert(targetMax);
  // Special handling for PACE: if metricType is VMA, convert from km/h to m/s
  const convertKmHToMs = (value: number | null | undefined): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    return kmhToSpeedMs(value);
  };

  if (targetType === 'PACE' && metricType === METRIC_TYPE.VMA) {
    return {
      value: convertKmHToMs(absoluteValue),
      min: convertKmHToMs(absoluteMin),
      max: convertKmHToMs(absoluteMax),
    };
  }

  return {
    value: absoluteValue,
    min: absoluteMin,
    max: absoluteMax,
  };
}
