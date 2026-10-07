import {
  ActivityStream,
  EventWeatherSampleDto,
  SPORT_TYPE,
  WorkoutStepTargetDto,
  WorkoutTargetContext,
  WorkoutTargetError,
  WorkoutTargetZone,
  getSportConfig,
  getWorkoutZoneRange,
  resolveWorkoutTarget,
} from '@openathlete/shared';

/** Activity details for the data tools: laps, splits, zones, plan, weather. */

// A sample stands for the time until the next one, but no longer than this:
// a longer gap is a pause, as in the records computation.
const MAX_SAMPLE_HOLD_SECONDS = 15;
export const MAX_SEGMENTS = 80;
const MAX_SPLITS = 60;

const round = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value)
    ? undefined
    : Number(value.toFixed(digits));

/** Pace sports read seconds per km; the others km/h. */
export const usesPace = (sport: string) =>
  getSportConfig(sport as SPORT_TYPE)?.speedUnit === 'min/km';

/** "4:35" for 275 seconds. */
export const formatPace = (secondsPerKm: number) => {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Pace (s/km) or speed (km/h) from a speed in m/s, in the sport's unit. */
export function speedFields(sport: string, metersPerSecond?: number | null) {
  if (!metersPerSecond || metersPerSecond <= 0) return {};
  return usesPace(sport)
    ? { pace: `${formatPace(1000 / metersPerSecond)}/km` }
    : { speedKmh: round(metersPerSecond * 3.6, 1) };
}

export type SegmentRow = {
  segmentType: string;
  name: string | null;
  orderIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  distance: number | null;
  elevationGain: number | null;
  movingTime: number | null;
  averageSpeed: number | null;
  averageGapSpeed: number | null;
  averageCadence: number | null;
  averageWatts: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  workoutStep: { name: string | null; stepType: string } | null;
};

/** Laps and workout-step segments as recorded by the device. */
export function formatSegments(sport: string, segments: SegmentRow[]) {
  return segments.map((segment) => {
    const gap = speedFields(sport, segment.averageGapSpeed);
    return {
      n: segment.orderIndex + 1,
      type: segment.segmentType,
      name: segment.name ?? undefined,
      startSecond: segment.startTimeSeconds,
      durationSeconds: segment.endTimeSeconds - segment.startTimeSeconds,
      movingTimeSeconds: segment.movingTime ?? undefined,
      distanceKm:
        segment.distance == null
          ? undefined
          : round(segment.distance / 1000, 2),
      ...speedFields(sport, segment.averageSpeed),
      ...('pace' in gap && { gradeAdjustedPace: gap.pace }),
      averageHeartrate: round(segment.averageHeartrate, 0),
      maxHeartrate: round(segment.maxHeartrate, 0),
      averagePowerW: round(segment.averageWatts, 0),
      cadence: round(segment.averageCadence, 0),
      elevationGainM: round(segment.elevationGain, 0),
      plannedStep: segment.workoutStep
        ? (segment.workoutStep.name ?? segment.workoutStep.stepType)
        : undefined,
    };
  });
}

/** Seconds each sample stands for, without the pauses. */
function sampleDurations(time: number[]) {
  return time.map((t, i) =>
    i === 0
      ? 0
      : Math.min(Math.max(t - time[i - 1], 0), MAX_SAMPLE_HOLD_SECONDS),
  );
}

/**
 * Splits of 1 km (pace sports) or 5 km, from the distance stream, for
 * activities without recorded laps. Time is moving time; the elevation is
 * the net change, which altitude noise cannot inflate.
 */
export function streamSplits(sport: string, stream: ActivityStream) {
  const { time, distance, heartrate, altitude } = stream;
  if (!time?.length || !distance || distance.length !== time.length) return [];
  const length = usesPace(sport) ? 1000 : 5000;
  const hold = sampleDurations(time);
  const splits: Record<string, unknown>[] = [];
  let start = 0;
  let seconds = 0;
  let hrSeconds = 0;
  let hrSum = 0;
  const close = (end: number, partial: boolean) => {
    const meters = distance[end] - distance[start];
    const hr = hrSeconds > 0 ? hrSum / hrSeconds : undefined;
    const elevation =
      altitude?.length === time.length
        ? altitude[end] - altitude[start]
        : undefined;
    splits.push({
      n: splits.length + 1,
      distanceKm: round(meters / 1000, 2),
      movingTimeSeconds: Math.round(seconds),
      ...speedFields(sport, seconds > 0 ? meters / seconds : undefined),
      averageHeartrate: round(hr, 0),
      elevationChangeM: round(elevation, 0),
      ...(partial && { partial: true }),
    });
  };
  for (let i = 1; i < time.length && splits.length < MAX_SPLITS; i++) {
    seconds += hold[i];
    const hr = heartrate?.[i];
    if (hr && hr > 0 && hold[i] > 0) {
      hrSum += hr * hold[i];
      hrSeconds += hold[i];
    }
    if (distance[i] - distance[start] >= length) {
      close(i, false);
      start = i;
      seconds = hrSeconds = hrSum = 0;
    }
  }
  // A short remainder says little about the effort
  const last = time.length - 1;
  if (
    splits.length < MAX_SPLITS &&
    distance[last] - distance[start] >= length * 0.2
  )
    close(last, true);
  return splits;
}

export type ZoneRow = WorkoutTargetZone & { index: number };

/** Applicable range of each heart-rate zone for the sport, lowest first. */
export function heartRateZoneRanges(zones: ZoneRow[], sport: string) {
  return zones
    .filter((zone) => zone.type === 'HEARTRATE')
    .flatMap((zone) => {
      try {
        const range = getWorkoutZoneRange(zone, sport as SPORT_TYPE);
        return range
          ? [{ name: zone.name, min: range.min, max: range.max }]
          : [];
      } catch {
        // An ambiguous zone is left out rather than guessed
        return [];
      }
    })
    .sort((a, b) => a.min - b.min);
}

/** Moving time spent in each heart-rate zone of the athlete. */
export function timeInHeartRateZones(
  stream: ActivityStream,
  ranges: { name: string; min: number; max: number }[],
) {
  const { time, heartrate } = stream;
  if (!ranges.length || !time?.length || heartrate?.length !== time.length)
    return undefined;
  const hold = sampleDurations(time);
  const seconds = ranges.map(() => 0);
  let below = 0;
  let above = 0;
  let total = 0;
  for (let i = 1; i < time.length; i++) {
    const hr = heartrate[i];
    if (!hr || hr <= 0 || hold[i] === 0) continue;
    total += hold[i];
    // Adjacent zones share their bound: the higher zone takes it
    let zone = -1;
    for (let z = 0; z < ranges.length; z++)
      if (hr >= ranges[z].min && hr <= ranges[z].max) zone = z;
    if (zone >= 0) seconds[zone] += hold[i];
    else if (hr < ranges[0].min) below += hold[i];
    else above += hold[i];
  }
  if (!total) return undefined;
  const share = (value: number) => round((value / total) * 100, 0);
  return {
    zones: ranges.map((range, z) => ({
      zone: range.name,
      bpm: `${Math.round(range.min)}-${Math.round(range.max)}`,
      seconds: Math.round(seconds[z]),
      percent: share(seconds[z]),
    })),
    ...(below > 0 && { belowZonesSeconds: Math.round(below) }),
    ...(above > 0 && { aboveZonesSeconds: Math.round(above) }),
  };
}

export type TargetRow = {
  targetType: string;
  targetMin: number | null;
  targetMax: number | null;
  targetValue: number | null;
  metricType: string | null;
  zoneReference: unknown;
};

export type StepRow = {
  stepType: string;
  name: string | null;
  notes: string | null;
  durationType: string;
  durationValue: number | null;
  targets: TargetRow[];
  repeatBlock?: { repetitions: number; childSteps: StepRow[] } | null;
};

/** Metrics a target needs to become absolute (HR reserve needs two). */
export function targetMetricTypes(steps: StepRow[]): string[] {
  const types = new Set<string>();
  const visit = (step: StepRow) => {
    for (const target of step.targets)
      if (target.metricType === 'HR_RESERVE') {
        types.add('HR_MAX');
        types.add('HR_REST');
      } else if (target.metricType) types.add(target.metricType);
    step.repeatBlock?.childSteps.forEach(visit);
  };
  steps.forEach(visit);
  return [...types];
}

function describeRange(
  type: string,
  sport: string,
  min: number | null | undefined,
  max: number | null | undefined,
  value: number | null | undefined,
) {
  const low = min ?? value;
  const high = max ?? value;
  if (low == null && high == null) return undefined;
  if (type === 'PACE') {
    // Speeds in m/s: the faster bound is the lower pace
    const speeds = [low, high].filter((v): v is number => !!v && v > 0);
    if (!speeds.length) return undefined;
    if (!usesPace(sport))
      return speeds.map((s) => round(s * 3.6, 1)).join('-') + ' km/h';
    return (
      speeds
        .map((s) => 1000 / s)
        .sort((a, b) => a - b)
        .map(formatPace)
        .join('-') + '/km'
    );
  }
  const unit =
    type === 'HEARTRATE'
      ? ' bpm'
      : type === 'POWER'
        ? ' W'
        : type === 'CADENCE'
          ? ' spm'
          : '';
  const bounds = [low, high].map((v) => (v == null ? '?' : Math.round(v)));
  return `${bounds[0] === bounds[1] ? bounds[0] : bounds.join('-')}${unit}`;
}

/** A step target in absolute units when the athlete's zones and metrics allow it. */
export function describeTarget(
  target: TargetRow,
  context: WorkoutTargetContext,
) {
  if (target.targetType === 'OPEN') return { type: 'OPEN' };
  const zoneName =
    (target.zoneReference as { name?: string } | null)?.name ??
    context.zones.find((zone) => zone.trainingZoneId === target.targetValue)
      ?.name;
  try {
    const absolute = resolveWorkoutTarget(
      target as WorkoutStepTargetDto,
      context,
      true,
    );
    return {
      type: absolute.targetType,
      ...(zoneName && { zone: zoneName }),
      ...(target.metricType && {
        relative: `${describeRelative(target)} of ${target.metricType}`,
      }),
      target: describeRange(
        absolute.targetType,
        context.sport,
        absolute.targetMin,
        absolute.targetMax,
        absolute.targetValue,
      ),
    };
  } catch (error) {
    return {
      type: target.targetType,
      ...(zoneName && { zone: zoneName }),
      ...(target.metricType
        ? { relative: `${describeRelative(target)} of ${target.metricType}` }
        : {
            target: describeRange(
              target.targetType,
              context.sport,
              target.targetMin,
              target.targetMax,
              target.targetValue,
            ),
          }),
      unresolved:
        error instanceof WorkoutTargetError
          ? error.code
          : 'WORKOUT_TARGET_INVALID',
    };
  }
}

/** "75-80%" for a target stored as a fraction of a reference metric. */
function describeRelative(target: TargetRow) {
  const pct = (v: number | null) => (v == null ? '?' : Math.round(v * 100));
  return target.targetMin != null || target.targetMax != null
    ? `${pct(target.targetMin)}-${pct(target.targetMax)}%`
    : `${pct(target.targetValue)}%`;
}

function describeDuration(step: StepRow) {
  const value = step.durationValue;
  switch (step.durationType) {
    case 'TIME':
      return value == null ? 'time' : `${Math.round(value)} s`;
    case 'DISTANCE':
      return value == null
        ? 'distance'
        : value >= 1000
          ? `${round(value / 1000, 2)} km`
          : `${Math.round(value)} m`;
    case 'HR_BELOW':
    case 'HR_ABOVE':
    case 'REPS':
    case 'CALORIES':
      return value == null
        ? step.durationType
        : `${step.durationType} ${value}`;
    default:
      return step.durationType;
  }
}

/** The planned workout, step by step, with repeats nested. */
export function formatSteps(
  steps: StepRow[],
  context: WorkoutTargetContext,
): Record<string, unknown>[] {
  return steps.map((step) => ({
    type: step.stepType,
    ...(step.name && { name: step.name }),
    ...(step.repeatBlock
      ? {
          repeat: step.repeatBlock.repetitions,
          steps: formatSteps(step.repeatBlock.childSteps, context),
        }
      : {
          duration: describeDuration(step),
          ...(step.targets.length && {
            targets: step.targets.map((target) =>
              describeTarget(target, context),
            ),
          }),
        }),
    ...(step.notes?.trim() && { notes: step.notes.trim().slice(0, 200) }),
  }));
}

/** Conditions along the route: range and averages of the weather samples. */
export function summarizeWeather(samples: EventWeatherSampleDto[]) {
  if (!samples.length) return undefined;
  const values = (pick: (s: EventWeatherSampleDto) => number | undefined) =>
    samples.map(pick).filter((v): v is number => Number.isFinite(v));
  const avg = (list: number[]) =>
    list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : undefined;
  const temperature = values((s) => s.temperatureC);
  const gusts = values((s) => s.windGusts10mKmh);
  const rain = values((s) => s.precipitationMm);
  return {
    temperatureC: temperature.length
      ? {
          min: round(Math.min(...temperature), 0),
          max: round(Math.max(...temperature), 0),
          avg: round(avg(temperature), 0),
        }
      : undefined,
    apparentTemperatureAvgC: round(
      avg(values((s) => s.apparentTemperatureC)),
      0,
    ),
    humidityAvgPct: round(avg(values((s) => s.humidityPct)), 0),
    windAvgKmh: round(avg(values((s) => s.windSpeed10mKmh)), 0),
    windGustMaxKmh: gusts.length ? round(Math.max(...gusts), 0) : undefined,
    // Each sample holds the hourly rate where it was taken: never add them up
    precipitationMaxMmPerHour: rain.length
      ? round(Math.max(...rain), 1)
      : undefined,
  };
}
