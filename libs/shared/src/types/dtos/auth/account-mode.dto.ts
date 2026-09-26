import { z } from 'zod';

export const accountRolesSchema = z
  .array(z.enum(['ATHLETE', 'COACH']))
  .min(1)
  .max(2)
  .refine((roles) => new Set(roles).size === roles.length);

export const changeAccountModeSchema = z
  .object({
    roles: accountRolesSchema,
  })
  .strict();
export type ChangeAccountMode = z.infer<typeof changeAccountModeSchema>;
