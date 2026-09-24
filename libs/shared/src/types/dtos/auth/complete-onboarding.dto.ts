import { z } from 'zod';

import { accountRolesSchema } from './account-mode.dto';

export const completeOnboardingDtoSchema = z.object({
  roles: accountRolesSchema,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  hrMax: z.number().int().positive().optional(),
  hrRest: z.number().int().positive().optional(),
  coachEmail: z.string().email().optional(),
  athleteEmails: z.array(z.string().email()).optional(),
});

export type CompleteOnboardingDto = z.infer<typeof completeOnboardingDtoSchema>;
