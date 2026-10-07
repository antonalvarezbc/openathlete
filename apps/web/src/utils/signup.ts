import { m } from '@/paraglide/messages';
import { isAxiosError } from 'axios';

/** The message for an account the instance's SIGNUP_MODE refused. */
export function signupRefusal(error: unknown): string | null {
  if (!isAxiosError(error) || error.response?.status !== 403) return null;
  const code = (error.response.data as { message?: unknown } | undefined)
    ?.message;
  if (code === 'SIGNUP_CLOSED') return m.signup_closed_message();
  if (code === 'SIGNUP_INVITE_ONLY') return m.signup_invite_only_message();
  return null;
}
