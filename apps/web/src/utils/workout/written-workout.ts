import {
  type CreateEventDto,
  type CreateWorkoutStepDto,
  EVENT_TYPE,
  type GenerateWorkoutStructureResponseDto,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
} from '@openathlete/shared';

/**
 * Goals a converted workout states on its own: the total time when every step
 * is timed, the total distance when every step is a distance, else nothing.
 */
export function writtenWorkoutGoals(steps: CreateWorkoutStepDto[]) {
  let seconds = 0;
  let meters = 0;
  const types = new Set<string>();
  const visit = (list: CreateWorkoutStepDto[], times: number) => {
    for (const step of list) {
      if (step.stepType === WORKOUT_STEP_TYPE.REPEAT && step.repeatBlock) {
        visit(
          step.repeatBlock.childSteps,
          times * step.repeatBlock.repetitions,
        );
        continue;
      }
      types.add(step.durationType ?? WORKOUT_DURATION_TYPE.OPEN);
      const value = (step.durationValue ?? 0) * times;
      if (step.durationType === WORKOUT_DURATION_TYPE.TIME) seconds += value;
      if (step.durationType === WORKOUT_DURATION_TYPE.DISTANCE) meters += value;
    }
  };
  visit(steps, 1);
  const only = (type: WORKOUT_DURATION_TYPE) =>
    types.size === 1 && types.has(type);
  return {
    goalDuration: only(WORKOUT_DURATION_TYPE.TIME) && seconds ? seconds : null,
    goalDistance:
      only(WORKOUT_DURATION_TYPE.DISTANCE) && meters ? meters : null,
  };
}

/**
 * A new training session from a written workout: the text is the
 * description, the AI gives the steps, a short name and the sport. Starts at
 * 8:00 like generated sessions.
 */
export function writtenWorkoutEvent(input: {
  text: string;
  date: Date;
  athleteId?: number | null;
  result: GenerateWorkoutStructureResponseDto;
  fallbackSport?: SPORT_TYPE;
}): CreateEventDto {
  const { goalDuration, goalDistance } = writtenWorkoutGoals(
    input.result.steps,
  );
  const startDate = new Date(input.date);
  startDate.setHours(8, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + (goalDuration ?? 3600) * 1000);
  const text = input.text.trim();
  return {
    type: EVENT_TYPE.TRAINING,
    name: input.result.name || text.slice(0, 60),
    description: text,
    startDate,
    endDate,
    sport: input.result.sport ?? input.fallbackSport ?? SPORT_TYPE.RUNNING,
    goalDuration,
    goalDistance,
    athleteId: input.athleteId ?? undefined,
    workout: { steps: input.result.steps },
  };
}
