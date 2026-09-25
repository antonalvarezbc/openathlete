import { z } from 'zod';

export const useEventTemplateDtoSchema = z.object({
  trainingPlanId: z.number().int().positive().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  athleteId: z.number().optional().nullable(),
});

export type UseEventTemplateDto = z.infer<typeof useEventTemplateDtoSchema>;
