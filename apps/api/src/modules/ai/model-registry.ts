import {
  PROVIDER_REGISTRY,
  modelSupportsStructuredOutput,
} from '@mastra/core/llm';

/** A provider of Mastra's bundled model registry (models.dev data). */
export interface RegistryProvider {
  name: string;
  url?: string;
  apiKeyEnvVar: string | string[];
  docUrl?: string;
  models: readonly string[];
  deprecatedModels?: readonly string[];
}

export interface ModelRegistry {
  providers: Record<string, RegistryProvider>;
  /** false when the model is known to lack native structured output */
  supportsStructuredOutput(modelRouterId: string): boolean | undefined;
}

/** Kept in its own module so tests can replace the bundled registry. */
export const mastraModelRegistry: ModelRegistry = {
  providers: PROVIDER_REGISTRY as unknown as Record<string, RegistryProvider>,
  supportsStructuredOutput: modelSupportsStructuredOutput,
};
