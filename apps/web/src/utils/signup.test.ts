import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { signupRefusal } from './signup';

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));

const refused = (status: number, message: string) =>
  new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data: { message },
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

describe('sign-up refusals', () => {
  it('explains a refusal of the sign-up mode', () => {
    expect(signupRefusal(refused(403, 'SIGNUP_CLOSED'))).toBe(
      'signup_closed_message',
    );
    expect(signupRefusal(refused(403, 'SIGNUP_INVITE_ONLY'))).toBe(
      'signup_invite_only_message',
    );
  });

  it('leaves other errors to the caller', () => {
    expect(signupRefusal(refused(409, 'User already exists'))).toBeNull();
    expect(signupRefusal(refused(403, 'Forbidden'))).toBeNull();
    expect(signupRefusal(new Error('network'))).toBeNull();
  });
});
