import { Agent, type ToolsInput } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import type { z } from 'zod';

import { Injectable, Logger } from '@nestjs/common';

import { AiErrorCode } from '@openathlete/shared';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import {
  AiInvalidAnswerException,
  AiProviderException,
  redactAiError,
  toAiProviderException,
} from '../ai.errors';
import { AiModelConfig, ResolvedAiModel } from './ai-model-resolver.service';
import { AiUsageService, TokenUsage } from './ai-usage.service';

/** What an agent is, independently of the model it runs on. */
export interface AgentSpec {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  /** Read-only tools the agent may call (the coach assistant's data tools) */
  tools?: ToolsInput;
}

/** What a call may need beyond the defaults. */
export interface AiCallOptions {
  /** Whole training plans take minutes; the default suits everything else. */
  timeoutMs?: number;
  /**
   * Room for long answers, thinking included on the models that count it as
   * output; providers otherwise apply their own, sometimes short, limit.
   */
  maxOutputTokens?: number;
  /** For agents with tools: who the tools act as, and how many steps. */
  requestContext?: RequestContext;
  maxSteps?: number;
}

/** Long structured generations (full workouts) can take a while. */
const CALL_TIMEOUT_MS = 120_000;

const callSettings = (options: AiCallOptions) => ({
  abortSignal: AbortSignal.timeout(options.timeoutMs ?? CALL_TIMEOUT_MS),
  ...(options.maxOutputTokens
    ? { modelSettings: { maxOutputTokens: options.maxOutputTokens } }
    : {}),
  ...(options.requestContext ? { requestContext: options.requestContext } : {}),
  ...(options.maxSteps ? { maxSteps: options.maxSteps } : {}),
});

/**
 * The retry processor, loaded on first use: Mastra's processors entry loads
 * ESM-only AI SDK code that unit tests (Jest) cannot parse.
 */
const providerRetryProcessor = async () =>
  new (await import('./provider-retry.processor')).ProviderRetryProcessor();

/**
 * Runs AI agents on the model the resolver picked: the user's own key or the
 * instance's. Every model call of the API goes through here, so errors are
 * translated once (rejected key, quota...) and keys' health is tracked.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageService,
  ) {}

  async generateText(
    agent: AgentSpec,
    model: ResolvedAiModel,
    prompt: string,
    options: AiCallOptions = {},
  ): Promise<string> {
    const result = await this.run(model, async () =>
      (await this.createAgent(agent, model.config)).generate(
        prompt,
        callSettings(options),
      ),
    );
    if (!result.text) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'The AI model returned an empty answer',
      );
    }
    return result.text;
  }

  /**
   * Generates a value matching the schema. Models without native JSON output
   * get the schema in the prompt instead; OpenAI's strict mode stays off as it
   * rejects recursive schemas (workout repeat blocks). An answer that does
   * not match throws AiInvalidAnswerException, with the answer.
   */
  async generateObject<S extends z.ZodTypeAny>(
    agent: AgentSpec,
    model: ResolvedAiModel,
    prompt: string,
    schema: S,
    options: AiCallOptions = {},
  ): Promise<z.output<S>> {
    const result = await this.run(model, async () =>
      (await this.createAgent(agent, model.config)).generate(prompt, {
        ...callSettings(options),
        structuredOutput: { schema, jsonPromptInjection: 'auto' },
        providerOptions: { openai: { strictJsonSchema: false } },
      }),
    );
    if (result.object === undefined || result.object === null) {
      throw new AiInvalidAnswerException(
        typeof result.text === 'string' ? result.text : '',
        result.finishReason === 'length',
      );
    }
    return result.object as z.output<S>;
  }

  /** A minimal call checking that a key and model work together. */
  async ping(config: AiModelConfig): Promise<void> {
    await (
      await this.createAgent(
        {
          id: 'credential-check',
          name: 'Credential check',
          instructions: 'Answer with the single word OK.',
        },
        config,
      )
    ).generate('Say OK.', { abortSignal: AbortSignal.timeout(30_000) });
  }

  private async createAgent(spec: AgentSpec, config: AiModelConfig) {
    return new Agent({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      instructions: spec.instructions,
      model: config as MastraModelConfig,
      ...(spec.tools ? { tools: spec.tools } : {}),
      errorProcessors: [await providerRetryProcessor()],
    });
  }

  private async run<T extends { totalUsage?: TokenUsage; usage?: TokenUsage }>(
    model: ResolvedAiModel,
    call: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await call();
      this.logger.debug(
        `${model.task} ran on ${model.provider}/${model.modelId} (${model.source}) in ${Date.now() - started}ms`,
      );
      await this.recordCredentialUse(model, null);
      // Across all steps; failed calls are not counted, their usage is unknown
      await this.usage.record(model, result.totalUsage ?? result.usage);
      return result;
    } catch (error) {
      const failure = toAiProviderException(error);
      // Never the prompt; provider messages may quote part of a key.
      this.logger.warn(
        `${model.task} failed on ${model.provider}/${model.modelId} (${model.source}): ${failure.code} ${failure.providerStatus ?? ''} ${failure.kind ?? ''} ${redactAiError(error instanceof Error ? error.message : String(error))}`,
      );
      await this.recordCredentialUse(model, failure);
      throw failure;
    }
  }

  /** Lets the settings show which keys work, without failing the call. */
  private async recordCredentialUse(
    model: ResolvedAiModel,
    failure: AiProviderException | null,
  ) {
    if (model.credentialId === null) return;
    const keyProblem =
      failure?.code === AiErrorCode.CREDENTIAL_REJECTED ||
      failure?.code === AiErrorCode.QUOTA_EXCEEDED;
    if (failure && !keyProblem) return;
    try {
      await this.prisma.aiCredential.update({
        where: { aiCredentialId: model.credentialId },
        data: failure
          ? { lastError: failure.code, lastErrorAt: new Date() }
          : { lastUsedAt: new Date(), lastError: null, lastErrorAt: null },
      });
    } catch (error) {
      this.logger.warn(
        `Could not record use of AI credential ${model.credentialId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
