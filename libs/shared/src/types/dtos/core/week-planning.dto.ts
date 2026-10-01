import { z } from 'zod';

/** Max events per batch request (a busy week has well under this). */
export const EVENT_BATCH_LIMIT = 60;

const eventBatchItemSchema = z
  .object({
    eventId: z.number().int().positive(),
    // Computed by the client in its own time zone, so weekdays and times
    // survive daylight-saving changes between weeks.
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .strict()
  .refine((item) => item.endDate >= item.startDate, {
    message: 'endDate must not be before startDate',
  });

export const copyEventsBatchSchema = z
  .object({
    items: z.array(eventBatchItemSchema).min(1).max(EVENT_BATCH_LIMIT),
    /** Plan whose weeks copies are assigned to when their source had none. */
    trainingPlanId: z.number().int().positive().optional(),
  })
  .strict();
export type CopyEventsBatch = z.infer<typeof copyEventsBatchSchema>;

export const moveEventsBatchSchema = z
  .object({
    items: z.array(eventBatchItemSchema).min(1).max(EVENT_BATCH_LIMIT),
  })
  .strict();
export type MoveEventsBatch = z.infer<typeof moveEventsBatchSchema>;

export const deleteEventsBatchSchema = z
  .object({
    eventIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(EVENT_BATCH_LIMIT),
  })
  .strict();
export type DeleteEventsBatch = z.infer<typeof deleteEventsBatchSchema>;

/** Each event is processed on its own; failures do not undo the others. */
export interface EventBatchResult {
  succeeded: number[];
  failed: { eventId: number; message: string }[];
}

export const updateTrainingWeekSchema = z
  .object({
    theme: z.string().trim().max(200).nullable().optional(),
    /** Seconds. */
    targetVolume: z
      .number()
      .int()
      .min(0)
      .max(100 * 3600)
      .nullable()
      .optional(),
    /** TRIMP. */
    targetLoad: z.number().min(0).max(10000).nullable().optional(),
  })
  .strict();
export type UpdateTrainingWeek = z.infer<typeof updateTrainingWeekSchema>;

export interface PlanWeekContext {
  trainingWeekId: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  theme: string | null;
  targetVolume: number | null;
  targetLoad: number | null;
  cycle: {
    cycleId: number;
    name: string;
    phase: string | null;
    color: string | null;
  };
  plan: {
    trainingPlanId: number;
    name: string;
    status: string;
    weekCount: number;
  };
  races: {
    eventId: number;
    name: string;
    startDate: string;
    priority: 'TARGET' | 'PREPARATORY';
  }[];
}

/** Data the weekly view needs beyond the calendar events themselves. */
export interface WeekOverviewDto {
  weekStart: string;
  weekEnd: string;
  planWeek: PlanWeekContext | null;
  /** Actual TRIMP per activity event id, for session cards and day totals. */
  activityLoads: Record<number, number>;
}
