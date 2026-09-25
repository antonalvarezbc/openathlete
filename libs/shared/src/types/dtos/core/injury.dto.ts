import { z } from 'zod';

import { INJURY_STATUS } from '../../misc';

export const athleteInjurySchema = z.object({
  athleteInjuryId: z.number(),
  athleteId: z.number(),
  location: z.string(),
  painScore: z.number().min(0).max(1),
  context: z.string(),
  status: z.nativeEnum(INJURY_STATUS),
  sourceActivityId: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AthleteInjury = z.infer<typeof athleteInjurySchema>;

// Pain is displayed on a 0-10 scale and stored normalized, like AI feedback.
export const saveAthleteInjurySchema = z
  .object({
    location: z.string().trim().min(1).max(200),
    painScore: z.number().finite().min(0).max(1),
    context: z.string().trim().min(1).max(5000),
    status: z.nativeEnum(INJURY_STATUS),
  })
  .strict()
  .refine(
    (value) => value.status !== INJURY_STATUS.RESOLVED || value.painScore === 0,
    {
      path: ['painScore'],
      message: 'Resolved injuries must have a zero pain score',
    },
  );
export const createAthleteInjurySchema = z
  .object({
    athleteId: z.number().int().positive(),
    injury: saveAthleteInjurySchema,
  })
  .strict();
export type SaveAthleteInjury = z.infer<typeof saveAthleteInjurySchema>;
export type CreateAthleteInjury = z.infer<typeof createAthleteInjurySchema>;
