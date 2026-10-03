import { z } from 'zod';

/** Planned sessions sent to Garmin through the manual connector, per request. */
export const MANUAL_GARMIN_WORKOUT_BATCH = 14;

export const manualGarminWorkoutsSchema = z
  .object({
    athleteId: z.number().int().positive().optional(),
    eventIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(MANUAL_GARMIN_WORKOUT_BATCH)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export type ManualGarminWorkouts = z.infer<typeof manualGarminWorkoutsSchema>;

/** Garmin copy of a planned session, as last sent. */
export type ManualGarminWorkoutStateDto = {
  eventId: number;
  /** Garmin calendar day (YYYY-MM-DD) */
  plannedDate: string;
  sentAt: string;
  /** False when the session or its date changed in OA after sending. */
  upToDate: boolean;
};

export type ManualGarminWorkoutResultDto = {
  eventId: number;
  ok: boolean;
  /** Stable error code, translated by the web app. */
  code?: string;
};
