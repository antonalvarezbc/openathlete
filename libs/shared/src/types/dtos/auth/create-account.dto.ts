import { z } from 'zod';

import { newPasswordSchema } from './password';

export const createAccountDtoSchema = z.object({
  email: z.string().email(),
  password: newPasswordSchema,
  firstName: z.string(),
  lastName: z.string(),
  invitationToken: z.string().optional(),
  coachInvitationToken: z.string().optional(),
});

export type CreateAccountDto = z.infer<typeof createAccountDtoSchema>;
