import { AiPlanFailureReason } from '@openathlete/shared';

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

export interface AiFailure {
  reason: AiPlanFailureReason;
  /** The provider's HTTP status, when it answered */
  status?: number;
  /** The provider's error code or type, when it sent one */
  code?: string;
  name: string;
  /** For the logs: short, with anything that looks like a key removed */
  message: string;
  /** For the coach: status and code only, never the provider's text */
  detail?: string;
}

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  responseBody?: unknown;
  data?: unknown;
  cause?: unknown;
  lastError?: unknown;
};

const QUOTA =
  /insufficient_quota|no credits remaining|credit balance is too low|exceeded your current quota|billing_hard_limit|purchase credits/i;
const AUTH =
  /invalid_api_key|incorrect api key|invalid x-api-key|authentication_error|permission_error|api key is missing|missing api key/i;
const RATE_LIMIT = /rate_limit|rate limit|too many requests/i;
const UNAVAILABLE =
  /overloaded|service unavailable|econnreset|econnrefused|enotfound|fetch failed|socket hang up/i;
const TIMEOUT = /timeout|timed out/i;

/** Removes anything that looks like an API key, and keeps it short. */
export const redact = (text: string) =>
  text
    .replace(/\b(sk|sk-ant|sk-proj|key)-[\w-]{4,}/gi, '[key]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);

const errorCode = (data: unknown): string | undefined => {
  const error = (data as { error?: { code?: unknown; type?: unknown } })?.error;
  const code = error?.code ?? error?.type;
  return typeof code === 'string' ? code : undefined;
};

/**
 * What went wrong in an AI call, from the AI SDK errors Mastra throws
 * (APICallError with statusCode, responseBody and data, possibly wrapped or
 * retried): the instance's account (quota, key), the provider (rate limit,
 * outage) or the call itself (timeout).
 */
export function classifyAiFailure(error: unknown): AiFailure {
  if (error instanceof AiPlanFailureError)
    return {
      reason: error.reason,
      name: error.name,
      message: error.message,
      detail: error.detail,
    };
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    current && typeof current === 'object' && depth < 6;
    depth++
  ) {
    chain.push(current as ErrorLike);
    const item = current as ErrorLike;
    current = item.cause ?? item.lastError;
  }
  const status = chain
    .flatMap((item) => [item.statusCode, item.status])
    .find(
      (value): value is number =>
        typeof value === 'number' && value >= 400 && value < 600,
    );
  const code = chain.map((item) => errorCode(item.data)).find(Boolean);
  const names = chain.map((item) => String(item.name ?? ''));
  const text = chain
    .flatMap((item) => [
      item.message,
      typeof item.responseBody === 'string' ? item.responseBody : '',
      code,
    ])
    .filter((value) => typeof value === 'string')
    .join(' ');
  const top = chain[0] ?? {};
  const name = String(top.name ?? 'Error');
  const message = redact(String(top.message ?? error));
  const detail = [status, code].filter(Boolean).join(' ') || undefined;
  const result = (reason: AiPlanFailureReason): AiFailure => ({
    reason,
    status,
    code,
    name,
    message,
    detail,
  });

  if (
    names.some((item) => item === 'TimeoutError') ||
    (!status && TIMEOUT.test(text))
  )
    return result('TIMEOUT');
  // Quota before rate limit: OpenAI answers an empty account with a 429.
  if (status === 402 || QUOTA.test(text)) return result('QUOTA');
  if (
    status === 401 ||
    status === 403 ||
    names.some((item) => item === 'AI_LoadAPIKeyError') ||
    AUTH.test(text)
  )
    return result('AUTH');
  if (status === 429 || RATE_LIMIT.test(text)) return result('RATE_LIMIT');
  if ((status && status >= 500) || UNAVAILABLE.test(text))
    return result('UNAVAILABLE');
  return result('PROVIDER_ERROR');
}

/** The instance's account or the clock: retrying cannot help. */
export const isTerminalAiFailure = (error: unknown) =>
  ['QUOTA', 'AUTH', 'TIMEOUT'].includes(classifyAiFailure(error).reason);

/** Only passing troubles are worth another call: rate limits and outages. */
export const shouldRetryAiCall = (error: unknown) =>
  ['RATE_LIMIT', 'UNAVAILABLE'].includes(classifyAiFailure(error).reason);

const PREFIX = 'AI_PLAN_FAILED ';

/** Stored as the BullMQ failed reason: only the reason and the safe detail. */
export const encodeAiFailure = (failure: AiFailure) =>
  PREFIX + JSON.stringify({ reason: failure.reason, detail: failure.detail });

export function decodeAiFailure(failedReason: string | undefined): {
  reason: AiPlanFailureReason;
  detail?: string;
} {
  if (failedReason?.startsWith(PREFIX)) {
    try {
      const parsed = JSON.parse(failedReason.slice(PREFIX.length)) as {
        reason: AiPlanFailureReason;
        detail?: string;
      };
      return {
        reason: parsed.reason,
        ...(parsed.detail ? { detail: parsed.detail } : {}),
      };
    } catch {
      // Fall through: an unexpected failure.
    }
  }
  return { reason: 'PROVIDER_ERROR' };
}
