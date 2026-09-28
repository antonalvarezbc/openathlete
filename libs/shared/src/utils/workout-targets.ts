import type {
  CreateWorkoutStepDto,
  WorkoutStepTargetDto,
  WorkoutZoneReference,
} from '../types/dtos/core/workout.dto';
import { METRIC_TYPE, SPORT_TYPE, WORKOUT_TARGET_TYPE } from '../types/misc';
import { isMetricCompatibleWithTarget } from './target-metric.map';

export type WorkoutTargetZone = {
  trainingZoneId: number;
  name: string;
  type: WorkoutZoneReference['type'];
  values: { min: number; max: number; sports: `${SPORT_TYPE}`[] }[];
};
export type WorkoutTargetMetrics = Record<string, { value: number } | number>;
export type WorkoutTargetContext = {
  zones: WorkoutTargetZone[];
  metrics: WorkoutTargetMetrics;
  sport: `${SPORT_TYPE}`;
};
export type WorkoutTargetErrorCode =
  | 'WORKOUT_TARGET_MISSING_METRIC'
  | 'WORKOUT_TARGET_MISSING_ZONE'
  | 'WORKOUT_TARGET_AMBIGUOUS_ZONE'
  | 'WORKOUT_TARGET_INVALID';

export class WorkoutTargetError extends Error {
  constructor(
    public code: WorkoutTargetErrorCode,
    public reference: string,
  ) {
    super(`${code}: ${reference}`);
  }
}

// Zone indexes describe display order, not physiological zone numbers.
// Recognize the numbered names used by all four locales; custom names match exactly.
export function workoutZoneKey(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const numbered = /^(?:zone|zona|z)\s*(\d+)$/.exec(normalized);
  return numbered ? `zone:${Number(numbered[1])}` : normalized;
}

export function getWorkoutZoneRange(
  zone: WorkoutTargetZone,
  sport: `${SPORT_TYPE}`,
) {
  const specific = zone.values.filter((value) => value.sports.includes(sport));
  const candidates = specific.length
    ? specific
    : zone.values.filter((value) => value.sports.length === 0);
  if (candidates.length > 1) {
    throw new WorkoutTargetError('WORKOUT_TARGET_AMBIGUOUS_ZONE', zone.name);
  }
  const range = candidates[0];
  if (!range) return undefined;
  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min < 0 ||
    range.max < range.min
  ) {
    throw new WorkoutTargetError('WORKOUT_TARGET_INVALID', zone.name);
  }
  return range;
}

export function findWorkoutZone(
  target: WorkoutStepTargetDto,
  zones: WorkoutTargetZone[],
  sport: `${SPORT_TYPE}`,
) {
  const reference = target.zoneReference;
  const candidates = zones.filter((zone) =>
    reference
      ? zone.type === reference.type &&
        workoutZoneKey(zone.name) === workoutZoneKey(reference.name)
      : zone.trainingZoneId === target.targetValue,
  );
  const available = candidates
    .map((zone) => ({ zone, range: getWorkoutZoneRange(zone, sport) }))
    .filter((entry) => entry.range !== undefined);
  const specific = available.filter((entry) =>
    entry.range!.sports.includes(sport),
  );
  const matches = specific.length ? specific : available;
  if (matches.length > 1) {
    throw new WorkoutTargetError(
      'WORKOUT_TARGET_AMBIGUOUS_ZONE',
      reference?.name ?? String(target.targetValue),
    );
  }
  if (!matches.length) {
    throw new WorkoutTargetError(
      'WORKOUT_TARGET_MISSING_ZONE',
      reference?.name ?? String(target.targetValue ?? ''),
    );
  }
  return { zone: matches[0].zone, range: matches[0].range! };
}

/** No population defaults: a missing reference must never become a prescription. */
export function resolveWorkoutMetric(
  metricType: string,
  metrics: WorkoutTargetMetrics,
) {
  const read = (type: string) => {
    const metric = metrics[type];
    const value = typeof metric === 'number' ? metric : metric?.value;
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      throw new WorkoutTargetError('WORKOUT_TARGET_MISSING_METRIC', type);
    }
    return value;
  };
  if (metricType === METRIC_TYPE.HR_RESERVE) {
    const max = read(METRIC_TYPE.HR_MAX);
    const rest = read(METRIC_TYPE.HR_REST);
    if (rest >= max)
      throw new WorkoutTargetError('WORKOUT_TARGET_INVALID', metricType);
    return { multiplier: max - rest, offset: rest };
  }
  return { multiplier: read(metricType), offset: 0 };
}

export function validateWorkoutTarget(target: WorkoutStepTargetDto) {
  if (target.targetType === WORKOUT_TARGET_TYPE.ZONE) {
    if (
      target.metricType ||
      target.targetMin != null ||
      target.targetMax != null ||
      (!target.zoneReference &&
        (!Number.isInteger(target.targetValue) ||
          (target.targetValue ?? 0) <= 0))
    ) {
      throw new WorkoutTargetError('WORKOUT_TARGET_INVALID', 'ZONE');
    }
    return;
  }
  if (
    target.zoneReference ||
    (target.metricType &&
      !isMetricCompatibleWithTarget(
        target.metricType as METRIC_TYPE,
        target.targetType,
      ))
  ) {
    throw new WorkoutTargetError('WORKOUT_TARGET_INVALID', target.targetType);
  }
  if (!target.metricType) return;
  const range = target.targetMin != null || target.targetMax != null;
  const values = range
    ? [target.targetMin, target.targetMax]
    : [target.targetValue];
  if (
    values.some(
      (value) => value == null || !Number.isFinite(value) || value < 0,
    ) ||
    (range &&
      (target.targetMin! > target.targetMax! || target.targetValue != null)) ||
    ([METRIC_TYPE.HR_MAX, METRIC_TYPE.HR_RESERVE].includes(
      target.metricType as METRIC_TYPE,
    ) &&
      values.some((value) => value! > 1))
  ) {
    throw new WorkoutTargetError('WORKOUT_TARGET_INVALID', target.metricType);
  }
}

export function resolveWorkoutTarget(
  target: WorkoutStepTargetDto,
  context: WorkoutTargetContext,
  absolute = false,
): WorkoutStepTargetDto {
  validateWorkoutTarget(target);
  if (target.targetType === WORKOUT_TARGET_TYPE.ZONE) {
    const { zone, range } = findWorkoutZone(
      target,
      context.zones,
      context.sport,
    );
    if (absolute && zone.type === 'PACE' && range.min <= 0) {
      throw new WorkoutTargetError('WORKOUT_TARGET_INVALID', zone.name);
    }
    if (absolute)
      return {
        targetType: zone.type as unknown as WORKOUT_TARGET_TYPE,
        targetMin: zone.type === 'PACE' ? 1000 / (range.max * 60) : range.min,
        targetMax: zone.type === 'PACE' ? 1000 / (range.min * 60) : range.max,
        targetValue: null,
        metricType: null,
        zoneReference: null,
      };
    return {
      ...target,
      targetValue: zone.trainingZoneId,
      zoneReference: target.zoneReference ?? {
        type: zone.type,
        name: zone.name,
      },
    };
  }
  if (!target.metricType) return { ...target };
  const { multiplier, offset } = resolveWorkoutMetric(
    target.metricType,
    context.metrics,
  );
  if (!absolute) return { ...target };
  const convert = (value: number | null | undefined) =>
    value == null
      ? null
      : (offset + value * multiplier) *
        (target.metricType === METRIC_TYPE.VMA ? 1000 / 3600 : 1);
  return {
    ...target,
    metricType: null,
    zoneReference: null,
    targetMin: convert(target.targetMin),
    targetMax: convert(target.targetMax),
    targetValue: convert(target.targetValue),
  };
}

export function mapWorkoutTargets<T extends CreateWorkoutStepDto>(
  steps: T[],
  transform: (target: WorkoutStepTargetDto) => WorkoutStepTargetDto,
): T[] {
  return steps.map((step) => ({
    ...step,
    targets: (step.targets ?? []).map(transform),
    ...(step.repeatBlock
      ? {
          repeatBlock: {
            ...step.repeatBlock,
            childSteps: mapWorkoutTargets(
              step.repeatBlock.childSteps,
              transform,
            ),
          },
        }
      : {}),
    ...(step.childSteps
      ? { childSteps: mapWorkoutTargets(step.childSteps, transform) }
      : {}),
  }));
}

/** Strip athlete IDs from a template, retaining a reusable identity instead. */
export function portableWorkoutTargets<T extends CreateWorkoutStepDto>(
  steps: T[],
  zones: WorkoutTargetZone[],
): T[] {
  return mapWorkoutTargets(steps, (target) => {
    validateWorkoutTarget(target);
    if (target.targetType !== WORKOUT_TARGET_TYPE.ZONE) return { ...target };
    const zone = zones.find(
      (item) => item.trainingZoneId === target.targetValue,
    );
    const reference =
      target.zoneReference ??
      (zone ? { type: zone.type, name: zone.name } : null);
    if (!reference)
      throw new WorkoutTargetError(
        'WORKOUT_TARGET_MISSING_ZONE',
        String(target.targetValue ?? ''),
      );
    return {
      ...target,
      targetValue: null,
      metricType: null,
      zoneReference: reference,
    };
  });
}
