import {
  AiAccessSource,
  AiErrorCode,
  AiPlanFailureReason,
} from '@openathlete/shared';

import {
  AiInvalidAnswerException,
  AiNotConfiguredException,
  AiProviderException,
} from '../../ai/ai.errors';

/** A failure we raise ourselves, with its reason already known. */
export class AiPlanFailureError extends Error {
  constructor(
    readonly reason: AiPlanFailureReason,
    readonly detail?: string,
  ) {
    super(`AI plan draft failed: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'AiPlanFailureError';
  }
}

export interface AiPlanFailure {
  reason: AiPlanFailureReason;
  /** For the coach: the provider's HTTP status or TRUNCATED, never its text */
  detail?: string;
}

/**
 * Why a plan draft failed, from the errors the resolver and AiService raise:
 * no AI for plans, the key's account (quota, key), the provider (rate limit,
 * outage), the clock, or an answer that was not a valid plan.
 */
export function planFailure(error: unknown): AiPlanFailure {
  if (error instanceof AiPlanFailureError)
    return {
      reason: error.reason,
      ...(error.detail ? { detail: error.detail } : {}),
    };
  if (error instanceof AiNotConfiguredException)
    return { reason: 'NOT_CONFIGURED' };
  if (error instanceof AiInvalidAnswerException)
    return {
      reason: 'INVALID_ANSWER',
      ...(error.truncated ? { detail: 'TRUNCATED' } : {}),
    };
  if (!(error instanceof AiProviderException))
    return { reason: 'PROVIDER_ERROR' };
  const detail = error.providerStatus
    ? String(error.providerStatus)
    : undefined;
  const result = (reason: AiPlanFailureReason): AiPlanFailure => ({
    reason,
    ...(detail ? { detail } : {}),
  });
  if (error.code === AiErrorCode.QUOTA_EXCEEDED)
    return result(error.kind === 'rate_limit' ? 'RATE_LIMIT' : 'QUOTA');
  if (error.code === AiErrorCode.CREDENTIAL_REJECTED) return result('AUTH');
  if (error.kind === 'timeout') return result('TIMEOUT');
  return result(
    error.providerStatus && error.providerStatus >= 500
      ? 'UNAVAILABLE'
      : 'PROVIDER_ERROR',
  );
}

const PREFIX = 'AI_PLAN_FAILED ';

/**
 * Stored as the BullMQ failed reason: the reason, the safe detail and whose
 * key the call ran on.
 */
export const encodeAiFailure = (
  failure: AiPlanFailure,
  source?: AiAccessSource,
) => PREFIX + JSON.stringify({ ...failure, ...(source ? { source } : {}) });

export function decodeAiFailure(failedReason: string | undefined): {
  reason: AiPlanFailureReason;
  detail?: string;
  source?: AiAccessSource;
} {
  if (failedReason?.startsWith(PREFIX)) {
    try {
      const parsed = JSON.parse(failedReason.slice(PREFIX.length)) as {
        reason: AiPlanFailureReason;
        detail?: string;
        source?: AiAccessSource;
      };
      return {
        reason: parsed.reason,
        ...(parsed.detail ? { detail: parsed.detail } : {}),
        ...(parsed.source ? { source: parsed.source } : {}),
      };
    } catch {
      // Fall through: an unexpected failure.
    }
  }
  return { reason: 'PROVIDER_ERROR' };
}
