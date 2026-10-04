import { z } from 'zod';

import { SPORT_TYPE } from '../../misc';
import type { CreateWorkoutStepDto } from '../core/workout.dto';

/**
 * Turn a workout written in words into steps. With a sport, only the steps
 * come back and the session keeps its name, date and goals. Without one (a
 * new session from text alone) a name and the sport come back too.
 */
export const generateWorkoutStructureDtoSchema = z
  .object({
    /** Athlete the session is for; coaches must send it. */
    athleteId: z.number().int().positive().optional(),
    sport: z.nativeEnum(SPORT_TYPE).optional(),
    name: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    /** Seconds */
    goalDuration: z.number().positive().max(86400).nullable().optional(),
    /** Metres */
    goalDistance: z.number().positive().max(1_000_000).nullable().optional(),
    /** The workout in words, e.g. "15' warm-up + 3x8' at 4:35/km...". */
    instructions: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (input) => !!(input.name || input.description || input.instructions),
    {
      message: 'Describe the session or what the structure should contain',
    },
  );

export type GenerateWorkoutStructureDto = z.infer<
  typeof generateWorkoutStructureDtoSchema
>;

export type GenerateWorkoutStructureResponseDto = {
  steps: CreateWorkoutStepDto[];
  /** Only when no sport was sent. */
  name?: string;
  sport?: SPORT_TYPE;
};
