import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { AiErrorCode } from '@openathlete/shared';

import { aiErrorCode, aiErrorMessage } from './ai-errors';

function apiError(status: number, data: unknown) {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data,
    },
  );
}

describe('aiErrorCode', () => {
  it('reads the AI error code returned by the API', () => {
    expect(
      aiErrorCode(apiError(403, { code: AiErrorCode.NOT_CONFIGURED })),
    ).toBe(AiErrorCode.NOT_CONFIGURED);
  });

  it('ignores other errors', () => {
    expect(aiErrorCode(apiError(400, { message: 'Bad request' }))).toBeNull();
    expect(aiErrorCode(apiError(403, { code: 'SOMETHING_ELSE' }))).toBeNull();
    expect(aiErrorCode(new Error('network'))).toBeNull();
  });
});

describe('aiErrorMessage', () => {
  it('explains each AI failure', () => {
    for (const code of Object.values(AiErrorCode)) {
      expect(aiErrorMessage(code)).toEqual(expect.any(String));
      expect(aiErrorMessage(apiError(422, { code }))).toBe(
        aiErrorMessage(code),
      );
    }
  });

  it('returns null so callers keep their own message', () => {
    expect(aiErrorMessage(new Error('boom'))).toBeNull();
    expect(aiErrorMessage('not-a-code')).toBeNull();
  });
});
