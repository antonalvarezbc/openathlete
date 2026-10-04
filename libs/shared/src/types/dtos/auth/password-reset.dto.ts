import { z } from 'zod';

import { newPasswordSchema } from './password';

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export type PasswordResetRequestDto = z.infer<
  typeof passwordResetRequestSchema
>;

export const passwordResetSchema = z.object({
  token: z.string(),
  password: newPasswordSchema,
});

export type PasswordResetDto = z.infer<typeof passwordResetSchema>;
