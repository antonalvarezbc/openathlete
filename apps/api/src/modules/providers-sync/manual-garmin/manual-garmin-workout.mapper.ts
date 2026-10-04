import { SportType } from '@openathlete/database';
import {
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
} from '@openathlete/shared';

/**
 * OA planned session -> Garmin Connect workout JSON (the format of the Connect
 * website and `garminconnect`, not the official Training API format).
 *
 * Targets must already be absolute (prepareWorkoutTargets with absolute: true):
 * heart rate in bpm, power in W, pace/speed in m/s, cadence per minute.
 * Durations are seconds or metres, as in OA.
 */

type Target = {
  targetType: `${WORKOUT_TARGET_TYPE}`;
  targetMin?: number | null;
  targetMax?: number | null;
  targetValue?: number | null;
};

export type ManualGarminStep = {
  stepType: `${WORKOUT_STEP_TYPE}`;
  name?: string | null;
  notes?: string | null;
  durationType?: `${WORKOUT_DURATION_TYPE}` | null;
  durationValue?: number | null;
  targets?: Target[];
  repeatBlock?: { repetitions: number; childSteps: ManualGarminStep[] } | null;
};

export type ManualGarminSession = {
  name: string;
  description?: string | null;
  sport: SportType;
  steps: ManualGarminStep[];
  goalDuration?: number | null;
  goalDistance?: number | null;
};

type Keyed = Record<string, unknown>;

const SPORTS = {
  running: 1,
  cycling: 2,
  other: 3,
  swimming: 4,
  strength_training: 5,
  cardio_training: 6,
  yoga: 7,
  pilates: 8,
  hiit: 9,
  mobility: 11,
  walking: 17,
  hiking: 18,
} as const;
type GarminSport = keyof typeof SPORTS;

const STEP_TYPES = {
  warmup: 1,
  cooldown: 2,
  interval: 3,
  recovery: 4,
  rest: 5,
  repeat: 6,
} as const;

const CONDITIONS = {
  'lap.button': 1,
  time: 2,
  distance: 3,
  calories: 4,
  'heart.rate': 6,
  iterations: 7,
  reps: 10,
} as const;

const TARGETS = {
  'no.target': 1,
  'power.zone': 2,
  cadence: 3,
  'heart.rate.zone': 4,
  'speed.zone': 5,
  'pace.zone': 6,
} as const;

export function garminSport(sport: SportType): GarminSport {
  switch (sport) {
    case SportType.RUNNING:
    case SportType.TRAIL_RUNNING:
    case SportType.VIRTUAL_RUN:
      return 'running';
    case SportType.CYCLING:
    case SportType.E_BIKE_RIDE:
    case SportType.E_MOUNTAIN_BIKE_RIDE:
    case SportType.GRAVEL_RIDE:
    case SportType.MOUNTAIN_BIKE_RIDE:
    case SportType.VIRTUAL_RIDE:
    case SportType.HANDCYCLE:
    case SportType.VELOMOBILE:
      return 'cycling';
    case SportType.SWIMMING:
      return 'swimming';
    case SportType.WALK:
      return 'walking';
    case SportType.HIKING:
      return 'hiking';
    case SportType.STRENGTH:
    case SportType.WEIGHT_TRAINING:
      return 'strength_training';
    case SportType.CROSSFIT:
    case SportType.ELLIPTICAL:
    case SportType.STAIR_STEPPER:
      return 'cardio_training';
    case SportType.HIGH_INTENSITY_INTERVAL_TRAINING:
      return 'hiit';
    case SportType.YOGA:
      return 'yoga';
    case SportType.PILATES:
      return 'pilates';
    case SportType.MOBILITY:
      return 'mobility';
    default:
      return 'other';
  }
}

const sportType = (key: GarminSport) => ({
  sportTypeId: SPORTS[key],
  sportTypeKey: key,
  displayOrder: SPORTS[key],
});

const stepType = (key: keyof typeof STEP_TYPES) => ({
  stepTypeId: STEP_TYPES[key],
  stepTypeKey: key,
  displayOrder: STEP_TYPES[key],
});

const condition = (key: keyof typeof CONDITIONS) => ({
  conditionTypeId: CONDITIONS[key],
  conditionTypeKey: key,
  displayOrder: CONDITIONS[key],
  displayable: key !== 'iterations',
});

const targetType = (key: keyof typeof TARGETS) => ({
  workoutTargetTypeId: TARGETS[key],
  workoutTargetTypeKey: key,
  displayOrder: TARGETS[key],
});

function kindOf(step: ManualGarminStep, sport: GarminSport) {
  switch (step.stepType) {
    case WORKOUT_STEP_TYPE.WARMUP:
      return stepType('warmup');
    case WORKOUT_STEP_TYPE.COOLDOWN:
      return stepType('cooldown');
    case WORKOUT_STEP_TYPE.INTERVAL_REST:
      return stepType(sport === 'swimming' ? 'rest' : 'recovery');
    default:
      return stepType('interval');
  }
}

const positive = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

function endOf(step: ManualGarminStep): Keyed {
  const value = positive(step.durationValue);
  const open = {
    endCondition: condition('lap.button'),
    endConditionValue: null,
  };
  if (value === null) return open;
  switch (step.durationType) {
    case WORKOUT_DURATION_TYPE.TIME:
      return { endCondition: condition('time'), endConditionValue: value };
    case WORKOUT_DURATION_TYPE.DISTANCE:
      return {
        endCondition: condition('distance'),
        endConditionValue: value,
        preferredEndConditionUnit: { unitKey: 'meter' },
      };
    case WORKOUT_DURATION_TYPE.CALORIES:
      return { endCondition: condition('calories'), endConditionValue: value };
    case WORKOUT_DURATION_TYPE.REPS:
      return { endCondition: condition('reps'), endConditionValue: value };
    case WORKOUT_DURATION_TYPE.HR_BELOW:
    case WORKOUT_DURATION_TYPE.HR_ABOVE:
      return {
        endCondition: condition('heart.rate'),
        endConditionValue: value,
        endConditionCompare:
          step.durationType === WORKOUT_DURATION_TYPE.HR_BELOW ? 'lt' : 'gt',
      };
    default:
      return open;
  }
}

/** Garmin targets are ranges; a single value becomes a range of one value. */
function targetOf(step: ManualGarminStep, sport: GarminSport): Keyed {
  const none = {
    targetType: targetType('no.target'),
    targetValueOne: null,
    targetValueTwo: null,
  };
  for (const target of step.targets ?? []) {
    const low = positive(target.targetMin) ?? positive(target.targetValue);
    const high = positive(target.targetMax) ?? positive(target.targetValue);
    if (low === null || high === null) continue;
    const key = (
      {
        [WORKOUT_TARGET_TYPE.HEARTRATE]: 'heart.rate.zone',
        [WORKOUT_TARGET_TYPE.POWER]: 'power.zone',
        [WORKOUT_TARGET_TYPE.CADENCE]: 'cadence',
        [WORKOUT_TARGET_TYPE.PACE]:
          sport === 'cycling' ? 'speed.zone' : 'pace.zone',
      } as Partial<Record<string, keyof typeof TARGETS>>
    )[target.targetType];
    if (!key || sport === 'swimming') continue;
    return {
      targetType: targetType(key),
      targetValueOne: Math.min(low, high),
      targetValueTwo: Math.max(low, high),
    };
  }
  return none;
}

const text = (value: string | null | undefined, max: number) =>
  value?.trim() ? value.trim().slice(0, max) : undefined;

export function mapSessionToGarminWorkout(session: ManualGarminSession) {
  const sport = garminSport(session.sport);
  let order = 0;

  const executable = (step: ManualGarminStep): Keyed => ({
    type: 'ExecutableStepDTO',
    stepOrder: ++order,
    stepType: kindOf(step, sport),
    description: text(step.notes ?? step.name, 512),
    ...endOf(step),
    ...targetOf(step, sport),
  });

  const convert = (step: ManualGarminStep): Keyed => {
    if (step.stepType !== WORKOUT_STEP_TYPE.REPEAT || !step.repeatBlock)
      return executable(step);
    const repeat: Keyed = {
      type: 'RepeatGroupDTO',
      stepOrder: ++order,
      stepType: stepType('repeat'),
      numberOfIterations: step.repeatBlock.repetitions,
      smartRepeat: false,
      endCondition: condition('iterations'),
      endConditionValue: step.repeatBlock.repetitions,
    };
    repeat.workoutSteps = step.repeatBlock.childSteps.map(convert);
    return repeat;
  };

  // A session without structure still reaches the watch as one open step.
  const steps = session.steps.length
    ? session.steps
    : [
        positive(session.goalDuration)
          ? {
              stepType: WORKOUT_STEP_TYPE.STEADY,
              durationType: WORKOUT_DURATION_TYPE.TIME,
              durationValue: session.goalDuration,
            }
          : {
              stepType: WORKOUT_STEP_TYPE.STEADY,
              durationType: WORKOUT_DURATION_TYPE.DISTANCE,
              durationValue: session.goalDistance,
            },
      ];
  const workoutSteps = steps.map(convert);

  return {
    workoutName: text(session.name, 80) ?? 'OpenAthlete',
    description: text(session.description, 1024),
    sportType: sportType(sport),
    ...(positive(session.goalDuration)
      ? { estimatedDurationInSecs: Math.round(session.goalDuration!) }
      : {}),
    workoutSegments: [
      { segmentOrder: 1, sportType: sportType(sport), workoutSteps },
    ],
  };
}

export type GarminConnectWorkout = ReturnType<typeof mapSessionToGarminWorkout>;
