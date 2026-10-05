import {
  AiPlanFailureError,
  classifyAiFailure,
  decodeAiFailure,
  encodeAiFailure,
  isTerminalAiFailure,
  redact,
  shouldRetryAiCall,
} from './ai-failure';

/** The shape of the AI SDK's APICallError, which Mastra bundles. */
const call = (statusCode: number, body: object) =>
  Object.assign(
    new Error(
      (body as { error?: { message?: string } }).error?.message ?? 'Error',
    ),
    {
      name: 'AI_APICallError',
      url: 'https://api.example.test/v1/responses',
      statusCode,
      responseBody: JSON.stringify(body),
      data: body,
      isRetryable: statusCode === 429 || statusCode >= 500,
    },
  );

// The exact answer OpenAI gave in production for an account without credit.
const OPENAI_NO_CREDIT = call(429, {
  error: {
    message:
      'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
    type: 'insufficient_quota',
    code: 'insufficient_quota',
  },
});

describe('classifyAiFailure', () => {
  test.each([
    [
      'OpenAI without credit',
      OPENAI_NO_CREDIT,
      'QUOTA',
      '429 insufficient_quota',
    ],
    [
      'OpenAI quota exceeded',
      call(429, {
        error: {
          message:
            'You exceeded your current quota, please check your plan and billing details.',
          type: 'insufficient_quota',
          code: 'insufficient_quota',
        },
      }),
      'QUOTA',
      '429 insufficient_quota',
    ],
    [
      'Anthropic credit balance too low',
      call(400, {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message:
            'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
        },
      }),
      'QUOTA',
      '400 invalid_request_error',
    ],
    [
      'OpenAI wrong key',
      call(401, {
        error: {
          message: 'Incorrect API key provided: sk-proj-abcd1234****wxyz.',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      }),
      'AUTH',
      '401 invalid_api_key',
    ],
    [
      'Anthropic wrong key',
      call(401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      }),
      'AUTH',
      '401 authentication_error',
    ],
    [
      'no permission',
      call(403, {
        type: 'error',
        error: { type: 'permission_error', message: 'Not allowed' },
      }),
      'AUTH',
      '403 permission_error',
    ],
    [
      'a bare 401',
      call(401, { error: { message: 'Unauthorized' } }),
      'AUTH',
      '401',
    ],
    [
      'rate limit',
      call(429, {
        error: {
          message: 'Rate limit reached for requests',
          type: 'requests',
          code: 'rate_limit_exceeded',
        },
      }),
      'RATE_LIMIT',
      '429 rate_limit_exceeded',
    ],
    [
      'Anthropic overloaded',
      call(529, {
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      }),
      'UNAVAILABLE',
      '529 overloaded_error',
    ],
    [
      'server error',
      call(500, { error: { message: 'The server had an error' } }),
      'UNAVAILABLE',
      '500',
    ],
    [
      'unknown model',
      call(404, {
        error: { message: 'The model does not exist', code: 'model_not_found' },
      }),
      'PROVIDER_ERROR',
      '404 model_not_found',
    ],
  ])('%s', (_name, error, reason, detail) => {
    expect(classifyAiFailure(error)).toMatchObject({ reason, detail });
  });

  test('finds the provider error inside wrapped and retried errors', () => {
    const wrapped = Object.assign(new Error('Agent failed'), {
      cause: {
        name: 'AI_RetryError',
        message: 'Failed after 3 attempts',
        lastError: OPENAI_NO_CREDIT,
      },
    });
    expect(classifyAiFailure(wrapped)).toMatchObject({
      reason: 'QUOTA',
      status: 429,
      code: 'insufficient_quota',
    });
  });

  test('a missing key and a timeout', () => {
    const missing = Object.assign(new Error('OpenAI API key is missing.'), {
      name: 'AI_LoadAPIKeyError',
    });
    expect(classifyAiFailure(missing).reason).toBe('AUTH');
    const timeout = new DOMException(
      'The operation timed out.',
      'TimeoutError',
    );
    expect(classifyAiFailure(timeout).reason).toBe('TIMEOUT');
    // Recognized by its name too, whatever the message says.
    const aborted = new DOMException(
      'This operation was aborted',
      'TimeoutError',
    );
    expect(classifyAiFailure(aborted).reason).toBe('TIMEOUT');
  });

  test('keeps our own reasons', () => {
    expect(
      classifyAiFailure(new AiPlanFailureError('INVALID_ANSWER', 'TRUNCATED')),
    ).toMatchObject({ reason: 'INVALID_ANSWER', detail: 'TRUNCATED' });
  });

  test('never logs a key or a long text', () => {
    const failure = classifyAiFailure(
      call(401, {
        error: {
          message: `Incorrect API key provided: sk-proj-abcd1234wxyz. ${'x'.repeat(500)}`,
          code: 'invalid_api_key',
        },
      }),
    );
    expect(failure.message).not.toMatch(/sk-proj-abcd/);
    expect(failure.message).toContain('[key]');
    expect(failure.message.length).toBeLessThanOrEqual(300);
    expect(redact('key sk-ant-api03-AbC_dEf and sk-1234')).toBe(
      'key [key] and [key]',
    );
  });
});

describe('retrying', () => {
  test('retries rate limits and outages, never quota, keys or timeouts', () => {
    expect(
      shouldRetryAiCall(
        call(429, {
          error: { message: 'Rate limit', code: 'rate_limit_exceeded' },
        }),
      ),
    ).toBe(true);
    expect(shouldRetryAiCall(call(503, { error: { message: 'Busy' } }))).toBe(
      true,
    );
    expect(shouldRetryAiCall(OPENAI_NO_CREDIT)).toBe(false);
    expect(
      shouldRetryAiCall(call(401, { error: { code: 'invalid_api_key' } })),
    ).toBe(false);
    expect(isTerminalAiFailure(OPENAI_NO_CREDIT)).toBe(true);
    // An invalid structured answer is not terminal: the parser may retry it.
    expect(
      isTerminalAiFailure(new Error('Structured output validation failed')),
    ).toBe(false);
  });
});

describe('the stored failed reason', () => {
  test('keeps only the reason and the safe detail', () => {
    const failure = classifyAiFailure(OPENAI_NO_CREDIT);
    const stored = encodeAiFailure(failure);
    expect(stored).not.toContain('credits');
    expect(decodeAiFailure(stored)).toEqual({
      reason: 'QUOTA',
      detail: '429 insufficient_quota',
    });
    expect(decodeAiFailure(undefined)).toEqual({ reason: 'PROVIDER_ERROR' });
    expect(decodeAiFailure('AI_PLAN_FAILED {broken')).toEqual({
      reason: 'PROVIDER_ERROR',
    });
  });
});
