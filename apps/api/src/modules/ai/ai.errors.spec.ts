import { AiErrorCode } from '@openathlete/shared';

import {
  AiInvalidAnswerException,
  AiNotConfiguredException,
  AiProviderException,
  isOutOfCredit,
  isRetryableAiError,
  providerStatusOf,
  redactAiError,
  toAiProviderException,
} from './ai.errors';

describe('providerStatusOf', () => {
  it('finds the status through wrapped causes', () => {
    const apiError = Object.assign(new Error('Unauthorized'), {
      statusCode: 401,
    });
    const wrapped = Object.assign(new Error('Agent failed'), {
      cause: Object.assign(new Error('Model failed'), { cause: apiError }),
    });

    expect(providerStatusOf(wrapped)).toBe(401);
  });

  it('ignores non-HTTP values', () => {
    expect(providerStatusOf(new Error('timeout'))).toBeUndefined();
    expect(providerStatusOf({ status: 'failed' })).toBeUndefined();
    expect(providerStatusOf('boom')).toBeUndefined();
  });
});

describe('toAiProviderException', () => {
  it.each([
    [401, AiErrorCode.CREDENTIAL_REJECTED],
    [403, AiErrorCode.CREDENTIAL_REJECTED],
    [402, AiErrorCode.QUOTA_EXCEEDED],
    [429, AiErrorCode.QUOTA_EXCEEDED],
    [404, AiErrorCode.PROVIDER_ERROR],
    [500, AiErrorCode.PROVIDER_ERROR],
  ])('maps provider status %s to %s', (status, code) => {
    const error = toAiProviderException({ statusCode: status });

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code });
  });

  it('never leaks the provider message to users', () => {
    const error = toAiProviderException(
      Object.assign(new Error('Incorrect API key provided: sk-abc***xyz'), {
        statusCode: 401,
      }),
    );

    expect(error.message).not.toContain('sk-');
  });

  it('keeps errors that are already translated', () => {
    const original = new AiProviderException(
      AiErrorCode.QUOTA_EXCEEDED,
      'quota',
    );

    expect(toAiProviderException(original)).toBe(original);
  });
});

describe('AiNotConfiguredException', () => {
  it('is a 403 with the AI_NOT_CONFIGURED code', () => {
    const error = new AiNotConfiguredException('EVENT_GENERATION' as never);

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: AiErrorCode.NOT_CONFIGURED,
    });
  });
});

describe('isRetryableAiError', () => {
  it('retries invalid answers and unrelated errors', () => {
    expect(isRetryableAiError(new Error('Nested repeat blocks'))).toBe(true);
    expect(
      isRetryableAiError(
        new AiProviderException(AiErrorCode.PROVIDER_ERROR, 'no valid result'),
      ),
    ).toBe(true);
  });

  it('does not retry provider failures the SDK already retried', () => {
    expect(isRetryableAiError(toAiProviderException({ statusCode: 500 }))).toBe(
      false,
    );
    expect(isRetryableAiError(toAiProviderException({ statusCode: 401 }))).toBe(
      false,
    );
    expect(isRetryableAiError(toAiProviderException({ statusCode: 429 }))).toBe(
      false,
    );
  });
});

/** The shape of the AI SDK's APICallError, which Mastra bundles. */
const apiCall = (statusCode: number, body: object) =>
  Object.assign(
    new Error(
      (body as { error?: { message?: string } }).error?.message ?? 'Error',
    ),
    {
      name: 'AI_APICallError',
      statusCode,
      responseBody: JSON.stringify(body),
      data: body,
    },
  );

// The exact answer OpenAI gave in production for an account without credit.
const OPENAI_NO_CREDIT = apiCall(429, {
  error: {
    message:
      'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
    type: 'insufficient_quota',
    code: 'insufficient_quota',
  },
});
const ANTHROPIC_NO_CREDIT = apiCall(400, {
  type: 'error',
  error: {
    type: 'invalid_request_error',
    message:
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
  },
});
const RATE_LIMIT = apiCall(429, {
  error: { message: 'Rate limit reached for requests', type: 'requests' },
});

describe('accounts without credit', () => {
  it('are recognized from OpenAI and Anthropic, even wrapped', () => {
    expect(isOutOfCredit(OPENAI_NO_CREDIT)).toBe(true);
    expect(isOutOfCredit(ANTHROPIC_NO_CREDIT)).toBe(true);
    expect(isOutOfCredit({ cause: OPENAI_NO_CREDIT })).toBe(true);
    expect(isOutOfCredit({ statusCode: 402 })).toBe(true);
    expect(isOutOfCredit(RATE_LIMIT)).toBe(false);
    expect(isOutOfCredit(new Error('boom'))).toBe(false);
  });

  it('are a quota error, apart from rate limits', () => {
    const openai = toAiProviderException(OPENAI_NO_CREDIT);
    expect(openai.code).toBe(AiErrorCode.QUOTA_EXCEEDED);
    expect(openai.kind).toBeUndefined();
    // Anthropic answers 400, not 429
    expect(toAiProviderException(ANTHROPIC_NO_CREDIT).code).toBe(
      AiErrorCode.QUOTA_EXCEEDED,
    );
    const limited = toAiProviderException(RATE_LIMIT);
    expect(limited.code).toBe(AiErrorCode.QUOTA_EXCEEDED);
    expect(limited.kind).toBe('rate_limit');
  });
});

describe('answers that are not the structure asked for', () => {
  it('keep the answer and whether it was cut off', () => {
    const cut = toAiProviderException(
      Object.assign(new Error('No object generated'), {
        name: 'AI_NoObjectGeneratedError',
        text: '{"cycles": [',
        finishReason: 'length',
      }),
    );
    expect(cut).toBeInstanceOf(AiInvalidAnswerException);
    expect(cut).toMatchObject({ rawText: '{"cycles": [', truncated: true });
    expect(cut.code).toBe(AiErrorCode.PROVIDER_ERROR);

    // As Mastra raises it when the output token limit cuts the answer
    const mastraCut = toAiProviderException(
      Object.assign(
        new Error(
          'Structured output was truncated because the model finished with reason "length".',
        ),
        {
          name: 'MastraError',
          id: 'STRUCTURED_OUTPUT_TRUNCATED',
          details: { finishReason: 'length', value: '{"cycles": [' },
        },
      ),
    );
    expect(mastraCut).toMatchObject({
      rawText: '{"cycles": [',
      truncated: true,
    });

    const filtered = toAiProviderException(
      Object.assign(new Error('Structured output was truncated'), {
        id: 'STRUCTURED_OUTPUT_TRUNCATED',
        details: { finishReason: 'content-filter', value: '{' },
      }),
    );
    expect(filtered).toMatchObject({ truncated: false });

    const wrong = toAiProviderException(
      Object.assign(new Error('Structured output validation failed: ...'), {
        name: 'MastraError',
        id: 'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED',
        cause: Object.assign(new Error('Invalid'), { name: 'ZodError' }),
        details: { value: '{"name": 1}' },
      }),
    );
    expect(wrong).toMatchObject({ rawText: '{"name": 1}', truncated: false });
    expect(isRetryableAiError(wrong)).toBe(true);
  });
});

describe('timeouts', () => {
  it('are tagged and not retried by callers', () => {
    const timeout = toAiProviderException(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    );
    expect(timeout.code).toBe(AiErrorCode.PROVIDER_ERROR);
    expect(timeout.kind).toBe('timeout');
    expect(isRetryableAiError(timeout)).toBe(false);
  });
});

describe('redactAiError', () => {
  it('masks keys and keeps log lines short', () => {
    const line = redactAiError(
      `Incorrect API key provided: sk-proj-abcdef123456 and sk-ant-api03-xyz ${'x'.repeat(500)}`,
    );
    expect(line).not.toMatch(/sk-proj-abcdef|sk-ant-api03/);
    expect(line).toContain('[key]');
    expect(line.length).toBeLessThanOrEqual(300);
  });
});
