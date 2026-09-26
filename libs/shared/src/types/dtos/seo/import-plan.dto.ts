import { z } from 'zod';

import { trainingPlanImportSchema } from './training-plan-import.dto';

const startDateSchema = z.union([
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(value);
      return (
        !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      );
    }, 'Invalid calendar date'),
  z.string().datetime({ offset: true }),
  z.date(),
]);

export const importPlanBodyDtoSchema = z.object({
  startDate: startDateSchema,
  athleteId: z.number().int().positive().optional(),
  timeZone: z
    .string()
    .refine((value) => {
      try {
        return (
          new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
            .timeZone.length > 0
        );
      } catch {
        return false;
      }
    }, 'Invalid time zone')
    .default('UTC'),
  replacePlanId: z.number().int().positive().optional(),
});
export type ImportPlanBodyDto = z.infer<typeof importPlanBodyDtoSchema>;
export const importPlanDtoSchema = importPlanBodyDtoSchema.extend({
  planToken: z.string().uuid(),
});
export type ImportPlanDto = z.infer<typeof importPlanDtoSchema>;
export const importJsonPlanDtoSchema = importPlanBodyDtoSchema.extend({
  planData: trainingPlanImportSchema,
});
export type ImportJsonPlanDto = z.infer<typeof importJsonPlanDtoSchema>;
export const createTemporaryPlanDtoSchema = z.object({ planData: z.unknown() });
export type CreateTemporaryPlanDto = z.infer<
  typeof createTemporaryPlanDtoSchema
>;
