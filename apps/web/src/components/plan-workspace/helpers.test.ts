import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { AiErrorCode } from '@openathlete/shared';

import { workspaceError } from './helpers';

const apiError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('workspaceError', () => {
  it('explains AI failures before access problems', () => {
    expect(
      workspaceError(apiError(403, { code: AiErrorCode.NOT_CONFIGURED })),
    ).toMatch(/Settings > AI/);
    expect(
      workspaceError(apiError(422, { code: AiErrorCode.QUOTA_EXCEEDED })),
    ).toMatch(/quota/i);
  });

  it('keeps the workspace messages for other errors', () => {
    expect(workspaceError(apiError(403, { message: 'Forbidden' }))).toMatch(
      /access/i,
    );
    expect(workspaceError(apiError(409, {}))).not.toMatch(/AI/);
  });
});
