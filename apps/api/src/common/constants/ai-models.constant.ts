/**
 * AI Model Constants
 *
 * This file contains constants for AI models used by Mastra agents.
 * Models can be configured via environment variables with fallbacks to default models.
 *
 * Model ids use the Mastra model router format `provider/model`
 * (e.g. `openai/gpt-5.1`, `google/gemini-3-pro-preview`, `anthropic/claude-opus-5`).
 *
 * Note: These constants use process.env because they are used at module initialization time
 * when creating Mastra agents, before ConfigService is available.
 */

/**
 * Default AI provider for every agent that has no explicit AI_MODEL_* override.
 * - unset / 'openai': OpenAI defaults (Google for post-activity feedback)
 * - 'anthropic': Claude for every agent
 */
export const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai')
  .trim()
  .toLowerCase();

/**
 * Claude model used for every agent when AI_PROVIDER=anthropic
 */
export const CLAUDE_DEFAULT_MODEL = 'anthropic/claude-opus-5';

const defaultModel = (fallback: string): string =>
  AI_PROVIDER === 'anthropic' ? CLAUDE_DEFAULT_MODEL : fallback;

/**
 * Provider for text embeddings: 'openai' (default) or 'google'.
 * Claude has no embeddings API, so Claude installs use one of these.
 */
export const AI_EMBEDDING_PROVIDER = (
  process.env.AI_EMBEDDING_PROVIDER || 'openai'
)
  .trim()
  .toLowerCase();

/**
 * Provider for voice note transcription: 'openai' (Whisper, default) or
 * 'google' (Gemini). Claude has no audio input.
 */
export const AI_TRANSCRIPTION_PROVIDER = (
  process.env.AI_TRANSCRIPTION_PROVIDER || 'openai'
)
  .trim()
  .toLowerCase();

/**
 * Gemini model used for transcription when AI_TRANSCRIPTION_PROVIDER=google
 */
export const GOOGLE_TRANSCRIPTION_MODEL =
  process.env.AI_MODEL_TRANSCRIPTION || 'gemini-2.5-flash';

/**
 * Whether an API key env var holds a real value (not empty or a placeholder
 * copied from .env.example).
 */
export function hasAiApiKey(
  envVar: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const key = env[envVar]?.trim();
  return !!key && !/your[-_]|example|placeholder/i.test(key);
}

/**
 * Environment variable holding the API key for a `provider/model` id,
 * or undefined when the provider is not one we configure explicitly.
 */
export function getAiModelApiKeyEnvVar(model: string): string | undefined {
  const provider = model.split('/')[0];
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'google':
      return 'GOOGLE_GENERATIVE_AI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    default:
      return undefined;
  }
}

/**
 * Model for event generation agent
 * Fallback: 'openai/gpt-5.1'
 */
export const EVENT_GENERATION_MODEL =
  process.env.AI_MODEL_EVENT_GENERATION || defaultModel('openai/gpt-5.1');

/**
 * Model for event modification agent (also used by activity analysis,
 * plan adaptation and coach assistant agents)
 * Fallback: 'openai/gpt-5.1'
 */
export const EVENT_MODIFICATION_MODEL =
  process.env.AI_MODEL_EVENT_MODIFICATION || defaultModel('openai/gpt-5.1');

/**
 * Model for injury extraction agent
 * Fallback: 'openai/gpt-5.1'
 */
export const EXTRACT_INJURY_MODEL =
  process.env.AI_MODEL_EXTRACT_INJURY || defaultModel('openai/gpt-5.1');

/**
 * Model for RPE extraction agent
 * Fallback: 'openai/gpt-5.1'
 */
export const EXTRACT_RPE_MODEL =
  process.env.AI_MODEL_EXTRACT_RPE || defaultModel('openai/gpt-5.1');

/**
 * Model for post-activity feedback agent
 * Fallback: 'google/gemini-3-pro-preview'
 */
export const POST_ACTIVITY_FEEDBACK_MODEL =
  process.env.AI_MODEL_POST_ACTIVITY_FEEDBACK ||
  defaultModel('google/gemini-3-pro-preview');

/**
 * Model for QnA agent and the chat routing agent
 * Fallback: 'openai/gpt-4o'
 */
export const QNA_MODEL =
  process.env.AI_MODEL_QNA || defaultModel('openai/gpt-4o');

/**
 * Model that consolidates AI memory notes into the coach–athlete summary.
 * It only runs every few notes; a small model is enough here.
 * Fallback: 'openai/gpt-4o-mini'
 */
export const AI_MEMORY_MODEL =
  process.env.AI_MODEL_MEMORY || defaultModel('openai/gpt-4o-mini');

/**
 * Model for TRIMP estimation agent
 * Fallback: 'openai/gpt-5.1'
 */
export const TRIMP_ESTIMATION_MODEL =
  process.env.AI_MODEL_TRIMP_ESTIMATION || defaultModel('openai/gpt-5.1');
