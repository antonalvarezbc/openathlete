import { z } from 'zod';

import { isTimeZone } from '../../../utils/date';

export const updateAccountDtoSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  /** The device's IANA time zone, which the app keeps up to date */
  timeZone: z.string().refine(isTimeZone, 'Unknown time zone').optional(),
  /** Push the evening before planned training sessions */
  trainingReminders: z.boolean().optional(),
});

export type UpdateAccountDto = z.infer<typeof updateAccountDtoSchema>;
