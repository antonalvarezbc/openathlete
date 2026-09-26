import { z } from 'zod';

import {
  METRIC_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
} from '../../misc';
import {
  CreateWorkoutStepDto,
  createWorkoutStepTargetSchema,
} from '../core/workout.dto';

// Import-specific validation: unsupported fields must not disappear silently.
const targetSchema = createWorkoutStepTargetSchema
  .extend({
    targetMin: z.number().finite().nonnegative().nullable().optional(),
    targetMax: z.number().finite().nonnegative().nullable().optional(),
    targetValue: z.number().finite().nonnegative().nullable().optional(),
    metricType: z.nativeEnum(METRIC_TYPE).nullable().optional(),
  })
  .superRefine((target, ctx) => {
    if (
      target.targetMin != null &&
      target.targetMax != null &&
      target.targetMin > target.targetMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Target minimum exceeds maximum',
      });
    }
  });

export const planWorkoutStepSchema: z.ZodType<CreateWorkoutStepDto> = z.lazy(
  () =>
    z
      .object({
        // Historical SEO files include orderIndex; array order remains authoritative.
        orderIndex: z.number().int().nonnegative().optional(),
        stepType: z.nativeEnum(WORKOUT_STEP_TYPE),
        name: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        durationType: z.nativeEnum(WORKOUT_DURATION_TYPE).nullable().optional(),
        durationValue: z.number().finite().positive().nullable().optional(),
        targets: z.array(targetSchema).optional(),
        repeatTimes: z.number().int().min(1).max(99).nullable().optional(),
        childSteps: z.array(planWorkoutStepSchema).min(1).max(100).optional(),
        repeatBlock: z
          .object({
            repetitions: z.number().int().min(1).max(99),
            childSteps: z.array(planWorkoutStepSchema).min(1).max(100),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict()
      .superRefine((step, ctx) => {
        const issue = (message: string) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        const children = step.repeatBlock?.childSteps ?? step.childSteps;
        if (step.repeatBlock && step.childSteps)
          issue('Use either repeatBlock or childSteps');
        if (step.stepType === WORKOUT_STEP_TYPE.REPEAT) {
          if (!children?.length) issue('REPEAT requires child steps');
          if (
            children?.some(
              (child) => child.stepType === WORKOUT_STEP_TYPE.REPEAT,
            )
          )
            issue('Nested repeats are not supported');
        } else if (children || step.repeatTimes != null)
          issue('Only REPEAT steps may contain repetitions');
        if (
          step.durationType &&
          ![
            WORKOUT_DURATION_TYPE.OPEN,
            WORKOUT_DURATION_TYPE.LAP_BUTTON,
          ].includes(step.durationType) &&
          step.stepType !== WORKOUT_STEP_TYPE.REPEAT &&
          step.durationValue == null
        )
          issue('This duration type requires durationValue');
      })
      .transform((step) => {
        if (!step.repeatBlock && step.childSteps) {
          return {
            ...step,
            repeatBlock: {
              repetitions: step.repeatTimes ?? 1,
              childSteps: step.childSteps,
            },
            childSteps: undefined,
            repeatTimes: undefined,
          };
        }
        return step;
      }),
);
