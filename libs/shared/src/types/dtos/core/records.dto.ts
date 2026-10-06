import z from 'zod';

import { RECORD_TYPE } from '../../misc/core/record-type.enum';
import { SPORT_TYPE } from '../../misc/core/sport-type.enum';

/** Best record at one distance or duration, with the activity it comes from. */
export const bestRecordSchema = z.object({
  recordId: z.number(),
  type: z.nativeEnum(RECORD_TYPE),
  /** Metres covered: pace and climbing records */
  distance: z.number().nullable(),
  /** Seconds covered: power and heart rate records */
  duration: z.number().nullable(),
  /** Seconds for pace, metres for climbing, watts or bpm otherwise */
  value: z.number(),
  date: z.coerce.date(),
  eventId: z.number().nullable(),
  activityName: z.string().nullable(),
});

export type BestRecordDto = z.infer<typeof bestRecordSchema>;

export const getRecordsQuerySchema = z.object({
  sport: z.nativeEnum(SPORT_TYPE).optional(),
  athleteId: z.coerce.number().int().positive().optional(),
  /** Records set from this date on */
  from: z.coerce.date().optional(),
  /** Records set before this date */
  to: z.coerce.date().optional(),
});

export type GetRecordsQueryDto = z.infer<typeof getRecordsQuerySchema>;
