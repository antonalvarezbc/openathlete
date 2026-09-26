import { z } from 'zod';

import { CYCLE_PHASE, SPORT_TYPE } from '../../misc';
import { planWorkoutStepSchema } from './plan-workout.dto';

// ============================================================================
// Strict training plan import DTOs
// ============================================================================
// DTOs for SEO training plan data structure used for displaying and importing
// training plans from the website to the app.
// ============================================================================

const elevationGainRangeSchema = z
  .object({
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative().optional(),
  })
  .strict();

const planSessionSchema = z
  .object({
    dayOfWeek: z.number().finite().int().min(0).max(6), // 0-6 (sunday-saturday)
    name: z.string().min(1),
    sport: z.nativeEnum(SPORT_TYPE),
    description: z.string(),
    goalDistance: z.number().finite().nonnegative().optional().nullable(),
    goalDuration: z
      .number()
      .finite()
      .int()
      .positive()
      .max(2147483647)
      .optional()
      .nullable(), // seconds
    goalElevationGain: z.number().finite().nonnegative().optional().nullable(),
    goalRpe: z.number().finite().min(0).max(10).optional().nullable(),
    workout: z
      .object({
        steps: z.array(planWorkoutStepSchema).min(1).max(100),
      })
      .strict()
      .optional()
      .nullable(),
  })
  .strict();

const planWeekSchema = z
  .object({
    weekNumber: z.number().finite().int().min(1),
    theme: z.string().optional().nullable(),
    sessions: z.array(planSessionSchema),
  })
  .strict();

const planCycleSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    phase: z.nativeEnum(CYCLE_PHASE),
    color: z.string().optional().nullable(),
    weeks: z.array(planWeekSchema).min(1),
  })
  .strict();

const planInfoSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    goal: z.string().min(1),
    sportType: z.nativeEnum(SPORT_TYPE),
    distance: z.number().finite().nonnegative(), // meters
    duration: z.number().finite().int().min(1).max(104), // total duration in weeks
    // For running/triathlon : time target in seconds (ex: 16200 for 4h30)
    timeTarget: z.number().finite().nonnegative().optional().nullable(),
    // For trail : positive elevation gain range (ex: 2000 for "2000d+")
    elevationGainRange: elevationGainRangeSchema.optional().nullable(),
  })
  .strict();

export const trainingPlanImportSchema = z
  .object({
    plan: planInfoSchema,
    cycles: z.array(planCycleSchema).min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      encodeURIComponent(JSON.stringify(data)).replace(/%[A-F0-9]{2}/g, 'x')
        .length > 90000
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Plan exceeds the 90 kB import limit',
      });
    }
    if (
      data.cycles.reduce((count, cycle) => count + cycle.weeks.length, 0) !==
      data.plan.duration
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cycles'],
        message: 'Cycle weeks must match plan.duration',
      });
    }
    const sessions = data.cycles.flatMap((cycle) =>
      cycle.weeks.flatMap((week) => week.sessions),
    );
    if (sessions.length === 0 || sessions.length > 1500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cycles'],
        message: 'A plan must contain between 1 and 1500 sessions',
      });
    }
  });
