import { m } from '@/paraglide/messages';
import { z } from 'zod';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@openathlete/shared';

/** Same rules as the API's newPasswordSchema, with a translated message. */
export function localizedNewPasswordSchema() {
  const message = m.password_length_requirement({
    min: PASSWORD_MIN_LENGTH,
    max: PASSWORD_MAX_LENGTH,
  });
  return z
    .string()
    .min(PASSWORD_MIN_LENGTH, message)
    .max(PASSWORD_MAX_LENGTH, message);
}
