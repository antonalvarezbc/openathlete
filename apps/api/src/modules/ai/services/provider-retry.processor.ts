import {
  type ProcessAPIErrorArgs,
  type ProcessAPIErrorResult,
  type Processor,
  defaultStabilityErrorProcessors,
} from '@mastra/core/processors';

import { isOutOfCredit } from '../ai.errors';

const ID = 'stream-error-retry-processor';

/**
 * Mastra's default retry of transient provider errors (rate limits, outages),
 * with its delays, except for an account without credit: OpenAI answers it
 * with a 429 like a rate limit, and each retry is another failed call. Same
 * id as Mastra's default, which it replaces.
 */
export class ProviderRetryProcessor implements Processor<typeof ID> {
  readonly id = ID;
  readonly name = 'Provider retry, except accounts without credit';
  private readonly retry = defaultStabilityErrorProcessors().find(
    (processor) => processor.id === ID,
  );

  async processAPIError(
    args: ProcessAPIErrorArgs,
  ): Promise<ProcessAPIErrorResult | void> {
    if (isOutOfCredit(args.error)) return;
    if (this.retry && 'processAPIError' in this.retry)
      return this.retry.processAPIError(args);
  }
}
