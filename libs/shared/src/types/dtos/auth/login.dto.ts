import { z } from 'zod';

import { existingPasswordSchema } from './password';

export const loginDtoSchema = z.object({
  email: z.string().email(),
  password: existingPasswordSchema,
});

export type LoginDto = z.infer<typeof loginDtoSchema>;
