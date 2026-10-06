import z from 'zod';

import { SPORT_TYPE } from '../../misc';

export const WEEKLY_VOLUME_MAX_WEEKS = 104;

export const getWeeklyVolumeQuerySchema = z.object({
  athleteId: z.coerce.number().int().positive(),
  /** Weeks to return, the current one included */
  weeks: z.coerce
    .number()
    .int()
    .min(1)
    .max(WEEKLY_VOLUME_MAX_WEEKS)
    .default(26),
});

export const weeklyVolumeSchema = z.object({
  /** Monday 00:00 UTC */
  weekStart: z.coerce.date(),
  sports: z.array(
    z.object({
      sport: z.nativeEnum(SPORT_TYPE),
      /** Seconds, from start to end of each activity */
      duration: z.number(),
      /** Metres */
      distance: z.number(),
      /** Metres */
      elevationGain: z.number(),
      count: z.number(),
    }),
  ),
});

export type GetWeeklyVolumeQueryDto = z.infer<
  typeof getWeeklyVolumeQuerySchema
>;
export type WeeklyVolumeDto = z.infer<typeof weeklyVolumeSchema>;
