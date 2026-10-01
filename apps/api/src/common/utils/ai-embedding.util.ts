import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

import { AI_EMBEDDING_PROVIDER } from '../constants/ai-models.constant';

/** Dimensions of the activity_feedback_embedding vector column. */
export const EMBEDDING_DIMENSIONS = 1536;

export const GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001';
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

/** AI SDK embedding model (named through a direct dependency for declaration emit). */
export type EmbeddingModel = ReturnType<typeof openai.embedding>;

/** Minimal embedder used by the feedback listener. */
export interface TextEmbedder {
  doEmbed(options: {
    values: string[];
  }): PromiseLike<{ embeddings: number[][] }>;
}

/**
 * Embedding model for the configured provider, for consumers that take an
 * AI SDK model directly (Mastra memory).
 */
export function createEmbeddingModel(
  provider = AI_EMBEDDING_PROVIDER,
): EmbeddingModel {
  return provider === 'google'
    ? google.textEmbeddingModel(GOOGLE_EMBEDDING_MODEL)
    : openai.embedding(OPENAI_EMBEDDING_MODEL);
}

/**
 * Embedder that always returns EMBEDDING_DIMENSIONS-dimensional vectors.
 * Gemini defaults to 3072 dimensions, so it is truncated and re-normalized
 * (Google only normalizes the full-size output).
 */
export function createTextEmbedder(
  provider = AI_EMBEDDING_PROVIDER,
): TextEmbedder {
  const model = createEmbeddingModel(provider);
  if (provider !== 'google') {
    return {
      doEmbed: ({ values }: { values: string[] }) => model.doEmbed({ values }),
    };
  }
  return {
    doEmbed: async ({ values }: { values: string[] }) => {
      const result = await model.doEmbed({
        values,
        providerOptions: {
          google: {
            outputDimensionality: EMBEDDING_DIMENSIONS,
            taskType: 'SEMANTIC_SIMILARITY',
          },
        },
      });
      return { ...result, embeddings: result.embeddings.map(normalize) };
    },
  };
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}
