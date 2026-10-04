import { describe, expect, it } from 'vitest';

import {
  type CreateWorkoutStepDto,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
} from '@openathlete/shared';

import { writtenWorkoutEvent, writtenWorkoutGoals } from './written-workout';

const timed = (
  stepType: WORKOUT_STEP_TYPE,
  seconds: number,
): CreateWorkoutStepDto => ({
  stepType,
  durationType: WORKOUT_DURATION_TYPE.TIME,
  durationValue: seconds,
  targets: [],
});

// 15' + 3 x (8' + 3') + 10'
const intervals: CreateWorkoutStepDto[] = [
  timed(WORKOUT_STEP_TYPE.WARMUP, 900),
  {
    stepType: WORKOUT_STEP_TYPE.REPEAT,
    durationType: WORKOUT_DURATION_TYPE.OPEN,
    targets: [],
    repeatBlock: {
      repetitions: 3,
      childSteps: [
        timed(WORKOUT_STEP_TYPE.INTERVAL_ACTIVE, 480),
        timed(WORKOUT_STEP_TYPE.INTERVAL_REST, 180),
      ],
    },
  },
  timed(WORKOUT_STEP_TYPE.COOLDOWN, 600),
];

describe('writtenWorkoutGoals', () => {
  it('adds up timed steps, repeats included', () => {
    expect(writtenWorkoutGoals(intervals)).toEqual({
      goalDuration: 900 + 3 * (480 + 180) + 600,
      goalDistance: null,
    });
  });

  it('adds up distances when every step is a distance', () => {
    const meters = (value: number): CreateWorkoutStepDto => ({
      stepType: WORKOUT_STEP_TYPE.STEADY,
      durationType: WORKOUT_DURATION_TYPE.DISTANCE,
      durationValue: value,
      targets: [],
    });
    expect(writtenWorkoutGoals([meters(2000), meters(5000)])).toEqual({
      goalDuration: null,
      goalDistance: 7000,
    });
  });

  it('states no goal when steps mix time, distance or lap button', () => {
    expect(
      writtenWorkoutGoals([
        ...intervals,
        {
          stepType: WORKOUT_STEP_TYPE.COOLDOWN,
          durationType: WORKOUT_DURATION_TYPE.LAP_BUTTON,
          durationValue: null,
          targets: [],
        },
      ]),
    ).toEqual({ goalDuration: null, goalDistance: null });
  });
});

describe('writtenWorkoutEvent', () => {
  it('keeps the text as description and uses the AI name and sport', () => {
    const event = writtenWorkoutEvent({
      text: "  15' calentar + 3x8' + 10' enfriar ",
      date: new Date(2026, 9, 6, 17, 30),
      athleteId: 23,
      result: {
        steps: intervals,
        name: '3x8 umbral',
        sport: SPORT_TYPE.RUNNING,
      },
    });
    expect(event).toMatchObject({
      type: 'TRAINING',
      name: '3x8 umbral',
      description: "15' calentar + 3x8' + 10' enfriar",
      sport: 'RUNNING',
      goalDuration: 3480,
      athleteId: 23,
      workout: { steps: intervals },
    });
    expect(event.startDate).toEqual(new Date(2026, 9, 6, 8, 0));
    expect(event.endDate).toEqual(new Date(2026, 9, 6, 8, 58));
  });

  it('falls back to the text and the given sport', () => {
    const event = writtenWorkoutEvent({
      text: "4x4' fuerte",
      date: new Date(2026, 9, 6),
      result: { steps: [] },
      fallbackSport: SPORT_TYPE.CYCLING,
    });
    expect(event).toMatchObject({ name: "4x4' fuerte", sport: 'CYCLING' });
    // One hour when the length is unknown.
    expect(+event.endDate - +event.startDate).toBe(3600_000);
  });
});
