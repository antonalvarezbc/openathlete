import { z } from 'zod';

import { SPORT_TYPE } from '../../misc';

const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
});
export const createManagedPlanSchema = z
  .object({
    athleteId: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    goal: z.string().trim().min(1).max(2000),
    description: z.string().trim().max(5000).default(''),
    startDate: civilDate,
    endDate: civilDate,
    timeZone,
  })
  .strict()
  .superRefine((value, ctx) => {
    const days =
      (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 + 1;
    if (days < 1 || days > 728)
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Plan must span between 1 and 728 days',
      });
  });
export const updateManagedPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    goal: z.string().trim().min(1).max(2000),
    description: z.string().trim().max(5000),
    status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
  })
  .strict();
export const planRacePrioritySchema = z.enum(['TARGET', 'PREPARATORY']);
export const planRaceSchema = z
  .object({
    priority: planRacePrioritySchema,
    name: z.string().trim().min(1).max(100),
    startDate: z.coerce.date(),
    sport: z.nativeEnum(SPORT_TYPE),
    description: z.string().trim().max(5000).default(''),
    goalDistance: z.number().finite().nonnegative().nullable().default(null),
    goalElevationGain: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .default(null),
    goalDuration: z
      .number()
      .int()
      .positive()
      .max(2147483647)
      .nullable()
      .default(null),
  })
  .strict();
export const linkPlanRaceSchema = z
  .object({
    eventId: z.number().int().positive(),
    priority: planRacePrioritySchema,
  })
  .strict();
export type CreateManagedPlan = z.infer<typeof createManagedPlanSchema>;
export type UpdateManagedPlan = z.infer<typeof updateManagedPlanSchema>;
export type PlanRaceInput = z.infer<typeof planRaceSchema>;
export type LinkPlanRace = z.infer<typeof linkPlanRaceSchema>;
