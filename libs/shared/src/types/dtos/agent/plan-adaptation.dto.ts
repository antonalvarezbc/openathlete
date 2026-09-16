import { z } from 'zod';

import {
  METRIC_TYPE,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
} from '../../misc';
import { importPlanBodyDtoSchema } from '../seo/import-plan.dto';

export const planAdaptationRequestSchema = z
  .object({
    athleteId: z.number().int().positive(),
    planId: z.number().int().positive(),
    language: z.enum(['es', 'en', 'fr', 'it']).optional(),
    allowRedistribution: z.boolean().optional(),
    allowNewSessions: z.boolean().optional(),
    maxNewSessions: z.number().int().min(1).max(7).optional(),
    newSessionMinutes: z.number().int().min(1).max(600).optional(),
    newSessionMaxRpe: z.number().min(1).max(10).optional(),
    scope: z.enum(['NEXT_SESSION', 'WEEK']),
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: importPlanBodyDtoSchema.shape.timeZone,
    readiness: z.enum(['UNKNOWN', 'READY', 'TIRED', 'ILL', 'PAIN']),
    currentState: z.string().trim().min(1).max(3000),
    instructions: z.string().max(3000),
    allowIncrease: z.boolean(),
    maxIncreasePercent: z.number().int().min(0).max(25),
  })
  .strict();
export type PlanAdaptationRequest = z.infer<typeof planAdaptationRequestSchema>;

const target = z
  .object({
    targetType: z.nativeEnum(WORKOUT_TARGET_TYPE),
    targetMin: z.number().finite().nonnegative().nullable(),
    targetMax: z.number().finite().nonnegative().nullable(),
    targetValue: z.number().finite().nonnegative().nullable(),
    metricType: z.nativeEnum(METRIC_TYPE).nullable(),
  })
  .strict();
const step = z
  .object({
    stepType: z.nativeEnum(WORKOUT_STEP_TYPE),
    name: z.string().max(200).nullable(),
    notes: z.string().max(2000).nullable(),
    durationType: z.nativeEnum(WORKOUT_DURATION_TYPE),
    durationValue: z.number().finite().positive().nullable(),
    targets: z.array(target).max(5),
  })
  .strict();
export const adaptationWorkoutSchema = z
  .object({
    steps: z
      .array(
        step
          .extend({
            // Repeat containers derive duration from their children.
            durationValue: z.number().finite().nonnegative().nullable(),
            repeatBlock: z
              .object({
                repetitions: z.number().int().min(1).max(99),
                childSteps: z.array(step).min(1).max(30),
              })
              .strict()
              .nullable()
              .default(null),
          })
          .superRefine((value, ctx) => {
            if (
              value.stepType !== WORKOUT_STEP_TYPE.REPEAT &&
              value.durationValue === 0
            )
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['durationValue'],
                message: 'Simple blocks require a positive duration or null',
              });
          }),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const adaptationSessionSchema = z
  .object({
    eventId: z.number().int().positive(),
    startDate: z.string().datetime({ offset: true }).nullable().optional(),
    action: z.enum(['KEEP', 'UPDATE', 'REST']),
    reason: z.string().min(1).max(3000),
    name: z.string().min(1).max(200),
    sport: z.nativeEnum(SPORT_TYPE),
    description: z.string().max(8000),
    goalDuration: z.number().int().min(0).max(604800),
    goalDistance: z.number().finite().nonnegative().nullable(),
    goalElevationGain: z.number().finite().nonnegative().nullable(),
    goalRpe: z.number().finite().min(0).max(10).nullable(),
    workout: adaptationWorkoutSchema.nullable(),
  })
  .strict();
// New sessions have no event ID: the database assigns it only after confirmation.
// New sessions include a time/RPE workout validated against the authorized budget.
export const adaptationNewSessionSchema = adaptationSessionSchema
  .omit({
    eventId: true,
    action: true,
    startDate: true,
    workout: true,
    goalDistance: true,
    goalElevationGain: true,
    goalRpe: true,
  })
  .extend({
    trainingWeekId: z.number().int().positive(),
    startDate: z.string().datetime({ offset: true }),
    goalDuration: z.number().int().positive().max(36000),
    goalRpe: z.number().min(1).max(10),
    workout: adaptationWorkoutSchema,
  })
  .strict();
export type AdaptationNewSession = z.infer<typeof adaptationNewSessionSchema>;

export const planAdaptationProposalSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    warnings: z.array(z.string().max(1000)).max(20),
    sessions: z.array(adaptationSessionSchema).max(28),
    newSessions: z.array(adaptationNewSessionSchema).max(7).optional(),
  })
  .strict();
export type AdaptationSession = z.infer<typeof adaptationSessionSchema>;
export type PlanAdaptationProposal = z.infer<
  typeof planAdaptationProposalSchema
>;
export const applyPlanAdaptationSchema = z
  .object({
    request: planAdaptationRequestSchema,
    contextVersion: z.string().regex(/^[a-f0-9]{64}$/),
    proposal: planAdaptationProposalSchema,
    confirmed: z.literal(true),
  })
  .strict();
export type ApplyPlanAdaptation = z.infer<typeof applyPlanAdaptationSchema>;

export const refinePlanAdaptationSchema = z
  .object({
    request: planAdaptationRequestSchema,
    contextVersion: z.string().regex(/^[a-f0-9]{64}$/),
    proposal: planAdaptationProposalSchema.nullable(),
    rawResponse: z.string().max(100000).optional(),
    feedback: z.string().trim().min(1).max(3000),
    history: z
      .array(
        z
          .object({
            feedback: z.string().max(3000),
            summary: z.string().max(4000),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type RefinePlanAdaptation = z.infer<typeof refinePlanAdaptationSchema>;
