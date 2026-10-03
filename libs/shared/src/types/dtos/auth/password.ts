import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
// Bounds the work of hashing attacker-supplied input with argon2
export const PASSWORD_MAX_LENGTH = 128;

/** Password chosen by a user (sign up, reset). */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** Password submitted to log in; accounts created before the policy may be shorter. */
export const existingPasswordSchema = z.string().max(PASSWORD_MAX_LENGTH);
