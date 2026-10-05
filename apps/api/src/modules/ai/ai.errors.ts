import { HttpException, HttpStatus } from '@nestjs/common';

import { AiErrorCode, AiTask } from '@openathlete/shared';

/** Body of AI errors: the web app switches on `code`. */
function body(status: HttpStatus, code: AiErrorCode, message: string) {
  return { statusCode: status, code, message };
}

/** Neither a key of the user's nor hosted AI is available for the task. */
export class AiNotConfiguredException extends HttpException {
  constructor(readonly task: AiTask) {
    super(
      body(
        HttpStatus.FORBIDDEN,
        AiErrorCode.NOT_CONFIGURED,
        'Add an AI provider key in Settings > AI to use this feature',
      ),
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * What a provider error turned out to be, beyond its code: the code groups
 * an exhausted quota with a rate limit, and a timeout with other failures.
 */
export type AiFailureKind = 'rate_limit' | 'timeout';

/** The provider refused the call; `code` says whether the key is at fault. */
export class AiProviderException extends HttpException {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly providerStatus?: number,
    readonly kind?: AiFailureKind,
  ) {
    super(
      body(HttpStatus.UNPROCESSABLE_ENTITY, code, message),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * The model answered, but not with the structure asked for. `rawText` is the
 * answer, untrusted, for callers that feed it back to the model to repair.
 */
export class AiInvalidAnswerException extends AiProviderException {
  constructor(
    readonly rawText: string,
    /** The answer was cut off by the output token limit */
    readonly truncated: boolean,
  ) {
    super(
      AiErrorCode.PROVIDER_ERROR,
      'The AI model did not return a valid result',
    );
  }
}

type ErrorLike = {
  id?: unknown;
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  responseBody?: unknown;
  data?: unknown;
  text?: unknown;
  finishReason?: unknown;
  details?: { statusCode?: unknown; value?: unknown; finishReason?: unknown };
  cause?: unknown;
  lastError?: unknown;
};

/** The error and the errors it wraps (Mastra and the AI SDK nest them). */
function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    current && typeof current === 'object' && depth < 6;
    depth++
  ) {
    const item = current as ErrorLike;
    chain.push(item);
    current = item.cause ?? item.lastError;
  }
  return chain;
}

/** Finds the HTTP status a provider answered with, through wrapped errors. */
export function providerStatusOf(error: unknown): number | undefined {
  for (const item of errorChain(error)) {
    for (const value of [
      item.statusCode,
      item.status,
      item.details?.statusCode,
    ]) {
      if (typeof value === 'number' && value >= 400 && value < 600) {
        return value;
      }
    }
  }
  return undefined;
}

const OUT_OF_CREDIT =
  /insufficient_quota|no credits remaining|credit balance is too low|exceeded your current quota|billing_hard_limit|purchase credits/i;

/**
 * An account without credit or quota, as OpenAI and Anthropic report it
 * (OpenAI with a 429, like a rate limit): retrying cannot help.
 */
export function isOutOfCredit(error: unknown): boolean {
  const chain = errorChain(error);
  if (providerStatusOf(error) === 402) return true;
  return chain.some((item) => {
    const providerError = (
      item.data as { error?: { code?: unknown; type?: unknown } } | undefined
    )?.error;
    return [
      item.message,
      item.responseBody,
      providerError?.code,
      providerError?.type,
    ].some((value) => typeof value === 'string' && OUT_OF_CREDIT.test(value));
  });
}

/** Removes anything that looks like an API key from a log line, and keeps it short. */
export const redactAiError = (text: string) =>
  text
    .replace(/\b(sk|sk-ant|sk-proj|key)-[\w-]{4,}/gi, '[key]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);

const isTimeout = (chain: ErrorLike[]) =>
  chain.some(
    (item) =>
      item.name === 'TimeoutError' ||
      item.name === 'AbortError' ||
      (typeof item.message === 'string' &&
        /timed? ?out|timeout/i.test(item.message)),
  );

/**
 * Errors of an answer that is not the structure asked for, as Mastra
 * recognizes them: its own (MastraError ids) and the AI SDK's (names).
 */
const INVALID_ANSWER_IDS = [
  'STRUCTURED_OUTPUT_OBJECT_UNDEFINED',
  'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED',
  'STRUCTURED_OUTPUT_TRUNCATED',
];
const INVALID_ANSWER_NAMES = [
  'AI_NoObjectGeneratedError',
  'AI_JSONParseError',
  'AI_TypeValidationError',
  'ZodError',
];

/** A structured answer that did not match its schema, or was cut off. */
function invalidAnswer(chain: ErrorLike[]): AiInvalidAnswerException | null {
  const invalid = chain.some(
    (item) =>
      INVALID_ANSWER_IDS.includes(String(item.id)) ||
      INVALID_ANSWER_NAMES.includes(String(item.name)),
  );
  if (!invalid) return null;
  const raw = chain
    .map((item) =>
      typeof item.details?.value === 'string'
        ? item.details.value
        : typeof item.text === 'string'
          ? item.text
          : '',
    )
    .find(Boolean);
  // Cut off by the output token limit (not by a content filter)
  const truncated = chain.some(
    (item) =>
      item.finishReason === 'length' || item.details?.finishReason === 'length',
  );
  return new AiInvalidAnswerException(raw ?? '', truncated);
}

/** Translates a failed model call into an error safe to show the user. */
export function toAiProviderException(error: unknown): AiProviderException {
  if (error instanceof AiProviderException) return error;
  const chain = errorChain(error);
  const status = providerStatusOf(error);
  const invalid = status === undefined ? invalidAnswer(chain) : null;
  if (invalid) return invalid;
  if (status === 401 || status === 403) {
    return new AiProviderException(
      AiErrorCode.CREDENTIAL_REJECTED,
      'The AI provider rejected the API key',
      status,
    );
  }
  // Before the status: Anthropic reports an empty account with a 400.
  const outOfCredit = isOutOfCredit(error);
  if (outOfCredit || status === 402 || status === 429) {
    return new AiProviderException(
      AiErrorCode.QUOTA_EXCEEDED,
      'The AI provider quota is exhausted or rate limited',
      status,
      status === 429 && !outOfCredit ? 'rate_limit' : undefined,
    );
  }
  if (status === 404) {
    return new AiProviderException(
      AiErrorCode.PROVIDER_ERROR,
      'The AI provider does not know this model',
      status,
    );
  }
  if (status === undefined && isTimeout(chain)) {
    return new AiProviderException(
      AiErrorCode.PROVIDER_ERROR,
      'The AI model took too long to answer',
      undefined,
      'timeout',
    );
  }
  return new AiProviderException(
    AiErrorCode.PROVIDER_ERROR,
    'The AI provider could not complete the request',
    status,
  );
}

/**
 * Whether a failed generation is worth another try: invalid answers (wrong
 * structure, failed validation) are. Provider errors were already retried
 * where it helps, and a rejected key, an exhausted quota or a timeout won't
 * recover with another identical call.
 */
export function isRetryableAiError(error: unknown): boolean {
  return (
    !(error instanceof AiProviderException) ||
    (error.code === AiErrorCode.PROVIDER_ERROR &&
      error.providerStatus === undefined &&
      error.kind !== 'timeout')
  );
}
