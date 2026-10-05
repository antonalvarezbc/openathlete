import type { z } from 'zod';

import { AiErrorCode, AiTask } from '@openathlete/shared';

import {
  AiInvalidAnswerException,
  AiProviderException,
  toAiProviderException,
} from './ai.errors';
import type { ResolvedAiModel } from './services/ai-model-resolver.service';
import type { AiService } from './services/ai.service';

/** A user's own model, as the resolver returns it, for specs. */
export const testAiModel = (task: AiTask, userId = 3): ResolvedAiModel => ({
  task: task as ResolvedAiModel['task'],
  source: 'own_key',
  userId,
  provider: 'anthropic',
  modelId: 'claude-opus-5-5',
  credentialId: 9,
  config: { id: 'anthropic/claude-opus-5-5', apiKey: 'sk-ant-test' },
});

/**
 * AiService stand-in for specs. `generate(prompt, options)` plays the model
 * and returns `{ object }` or `{ text }`; its errors and answers are handled
 * as AiService does: provider errors translated, an object that does not
 * match the schema thrown as an invalid answer.
 */
export function aiServiceStandIn(generate: jest.Mock) {
  const call = async (prompt: string, options?: unknown) => {
    try {
      return (await generate(prompt, options)) as
        { object?: unknown; text?: string; finishReason?: string } | undefined;
    } catch (error) {
      throw toAiProviderException(error);
    }
  };
  return {
    generateObject: jest.fn(
      async (
        _agent: unknown,
        _model: ResolvedAiModel,
        prompt: string,
        schema: z.ZodTypeAny,
        options?: unknown,
      ) => {
        const result = await call(prompt, options);
        const parsed = schema.safeParse(result?.object);
        if (!parsed.success)
          throw new AiInvalidAnswerException(
            result?.text ?? JSON.stringify(result?.object ?? ''),
            result?.finishReason === 'length',
          );
        return parsed.data;
      },
    ),
    generateText: jest.fn(
      async (
        _agent: unknown,
        _model: ResolvedAiModel,
        prompt: string,
        options?: unknown,
      ) => {
        const result = await call(prompt, options);
        if (!result?.text)
          throw new AiProviderException(
            AiErrorCode.PROVIDER_ERROR,
            'The AI model returned an empty answer',
          );
        return result.text;
      },
    ),
  } as unknown as AiService & {
    generateObject: jest.Mock;
    generateText: jest.Mock;
  };
}

/** Resolver stand-in for specs: everyone has their own model. */
export function aiResolverStandIn(model?: ResolvedAiModel) {
  return {
    resolveForUser: jest.fn(
      async (task: AiTask, userId: number) =>
        model ?? testAiModel(task, userId),
    ),
    tryResolveForUser: jest.fn(
      async (task: AiTask, userId: number): Promise<ResolvedAiModel | null> =>
        model ?? testAiModel(task, userId),
    ),
  };
}
