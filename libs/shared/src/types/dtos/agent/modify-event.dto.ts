import { z } from 'zod';

import { trainingEventSchema } from '../core/create-event.dto';
import { updateEventDtoSchema } from '../core/update-event.dto';

export const modifyEventDtoSchema = z.object({
  prompt: z.string().min(1).max(500),
  eventData: trainingEventSchema,
  /** Athlete the session is for; coaches must send it. */
  athleteId: z.number().int().positive().optional(),
});

export type ModifyEventDto = z.infer<typeof modifyEventDtoSchema>;

export const modifyEventResponseDtoSchema = updateEventDtoSchema;

export type ModifyEventResponseDto = z.infer<
  typeof modifyEventResponseDtoSchema
>;
