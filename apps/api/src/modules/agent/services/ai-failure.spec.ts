import { AiErrorCode } from '@openathlete/shared';

import {
  AiInvalidAnswerException,
  AiNotConfiguredException,
  AiProviderException,
} from '../../ai/ai.errors';
import {
  AiPlanFailureError,
  decodeAiFailure,
  encodeAiFailure,
  planFailure,
} from './ai-failure';

describe('planFailure', () => {
  test.each([
    [
      'no credit',
      new AiProviderException(AiErrorCode.QUOTA_EXCEEDED, 'quota', 429),
      { reason: 'QUOTA', detail: '429' },
    ],
    [
      'a rate limit',
      new AiProviderException(
        AiErrorCode.QUOTA_EXCEEDED,
        'quota',
        429,
        'rate_limit',
      ),
      { reason: 'RATE_LIMIT', detail: '429' },
    ],
    [
      'a rejected key',
      new AiProviderException(AiErrorCode.CREDENTIAL_REJECTED, 'key', 401),
      { reason: 'AUTH', detail: '401' },
    ],
    [
      'an outage',
      new AiProviderException(AiErrorCode.PROVIDER_ERROR, 'down', 503),
      { reason: 'UNAVAILABLE', detail: '503' },
    ],
    [
      'another provider error',
      new AiProviderException(AiErrorCode.PROVIDER_ERROR, 'model', 404),
      { reason: 'PROVIDER_ERROR', detail: '404' },
    ],
    [
      'a timeout',
      new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'slow',
        undefined,
        'timeout',
      ),
      { reason: 'TIMEOUT' },
    ],
    [
      'a cut-off answer',
      new AiInvalidAnswerException('{"cycles": [', true),
      { reason: 'INVALID_ANSWER', detail: 'TRUNCATED' },
    ],
    [
      'no AI for plans',
      new AiNotConfiguredException('PLAN_GENERATION' as never),
      { reason: 'NOT_CONFIGURED' },
    ],
    [
      'our own reason',
      new AiPlanFailureError('INVALID_ANSWER'),
      { reason: 'INVALID_ANSWER' },
    ],
    [
      'anything else',
      new Error('Database unavailable'),
      { reason: 'PROVIDER_ERROR' },
    ],
  ])('%s', (_label, error, expected) => {
    expect(planFailure(error)).toEqual(expected);
  });
});

describe('the stored failed reason', () => {
  test('keeps only the reason, the safe detail and whose key it was', () => {
    const stored = encodeAiFailure(
      { reason: 'QUOTA', detail: '429' },
      'own_key',
    );
    expect(stored).not.toMatch(/credit|sk-/);
    expect(decodeAiFailure(stored)).toEqual({
      reason: 'QUOTA',
      detail: '429',
      source: 'own_key',
    });
    expect(decodeAiFailure(encodeAiFailure({ reason: 'TIMEOUT' }))).toEqual({
      reason: 'TIMEOUT',
    });
  });

  test('an unexpected failed reason is a provider error', () => {
    expect(decodeAiFailure('Error: something else')).toEqual({
      reason: 'PROVIDER_ERROR',
    });
    expect(decodeAiFailure(undefined)).toEqual({ reason: 'PROVIDER_ERROR' });
  });
});
