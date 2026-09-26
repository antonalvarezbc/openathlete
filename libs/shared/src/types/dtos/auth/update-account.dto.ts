import { z } from 'zod';

export const updateAccountDtoSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  })
  .strict();

export type UpdateAccountDto = z.infer<typeof updateAccountDtoSchema>;
