import { z } from 'zod';

import { SPORT_TYPE } from '../../misc';
import type { CreateWorkoutStepDto } from '../core/workout.dto';

/**
 * Ask the AI for the steps of a session that is already being edited. Only
 * the workout structure comes back; name, date and goals stay as they are.
 */
export const generateWorkoutStructureDtoSchema = z
  .object({
    /** Athlete the session is for; coaches must send it. */
    athleteId: z.number().int().positive().optional(),
    sport: z.nativeEnum(SPORT_TYPE),
    name: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    /** Seconds */
    goalDuration: z.number().positive().max(86400).nullable().optional(),
    /** Metres */
    goalDistance: z.number().positive().max(1_000_000).nullable().optional(),
    /** Extra request, e.g. "6x1000 at 10 km pace with 90 s recovery". */
    instructions: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((input) => !!(input.name || input.description || input.instructions), {
    message: 'Describe the session or what the structure should contain',
  });

export type GenerateWorkoutStructureDto = z.infer<
  typeof generateWorkoutStructureDtoSchema
>;

export type GenerateWorkoutStructureResponseDto = {
  steps: CreateWorkoutStepDto[];
};
