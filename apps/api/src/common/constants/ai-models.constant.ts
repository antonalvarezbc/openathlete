import { AiFeatureTask, AiTask } from '@openathlete/shared';

/**
 * Models used with the instance keys ("hosted AI"), as `provider/model`.
 * Each can be overridden by its environment variables (first set wins, later
 * names are kept for older configurations), and AI_MODEL_DEFAULT replaces
 * every default at once, e.g. to run everything on one provider.
 */
export const HOSTED_MODEL_ENV_VARS: Record<AiFeatureTask, string[]> = {
  [AiTask.EVENT_GENERATION]: ['AI_MODEL_EVENT_GENERATION'],
  [AiTask.EVENT_MODIFICATION]: ['AI_MODEL_EVENT_MODIFICATION'],
  [AiTask.POST_ACTIVITY_QUESTIONS]: ['AI_MODEL_POST_ACTIVITY_FEEDBACK'],
  [AiTask.FEEDBACK_EXTRACTION]: [
    'AI_MODEL_FEEDBACK_EXTRACTION',
    'AI_MODEL_EXTRACT_RPE',
    'AI_MODEL_EXTRACT_INJURY',
  ],
  [AiTask.TRAINING_LOAD_ESTIMATION]: ['AI_MODEL_TRIMP_ESTIMATION'],
};

export const DEFAULT_HOSTED_MODELS: Record<AiFeatureTask, string> = {
  [AiTask.EVENT_GENERATION]: 'openai/gpt-5.1',
  [AiTask.EVENT_MODIFICATION]: 'openai/gpt-5.1',
  [AiTask.POST_ACTIVITY_QUESTIONS]: 'google/gemini-3-pro-preview',
  [AiTask.FEEDBACK_EXTRACTION]: 'openai/gpt-5.1',
  [AiTask.TRAINING_LOAD_ESTIMATION]: 'openai/gpt-5.1',
};

/**
 * Claude model for every agent when AI_PROVIDER=anthropic (an older way to
 * put a whole installation on Claude; AI_MODEL_DEFAULT does it too).
 */
export const CLAUDE_DEFAULT_MODEL = 'anthropic/claude-opus-5';

const providerDefault = (env: Record<string, string | undefined>) =>
  env.AI_PROVIDER?.trim().toLowerCase() === 'anthropic'
    ? CLAUDE_DEFAULT_MODEL
    : undefined;

/** Hosted model for a task, from the environment or the defaults above. */
export function hostedModelFor(
  task: AiFeatureTask,
  env: Record<string, string | undefined>,
): string {
  const configured = HOSTED_MODEL_ENV_VARS[task]
    .map((name) => env[name])
    .find(Boolean);
  return (
    configured ||
    env.AI_MODEL_DEFAULT ||
    providerDefault(env) ||
    DEFAULT_HOSTED_MODELS[task]
  );
}

/*
 * The agents below run on the instance keys only; they are not AI settings
 * tasks yet. These constants use process.env because the agents are created
 * at module initialization, before ConfigService is available.
 */

/** Default provider of the agents below: 'openai' (default) or 'anthropic'. */
export const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai')
  .trim()
  .toLowerCase();

const instanceModel = (variable: string, fallback: string) =>
  process.env[variable] ||
  process.env.AI_MODEL_DEFAULT ||
  providerDefault(process.env) ||
  fallback;

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
 * Model of the activity analysis, plan adaptation and coach assistant agents
 * (named after event modification, whose variable it shares).
 * Fallback: 'openai/gpt-5.1'
 */
export const EVENT_MODIFICATION_MODEL = instanceModel(
  'AI_MODEL_EVENT_MODIFICATION',
  'openai/gpt-5.1',
);

/**
 * Model that consolidates AI memory notes into the coach–athlete summary.
 * It only runs every few notes; a small model is enough here.
 * Fallback: 'openai/gpt-4o-mini'
 */
export const AI_MEMORY_MODEL = instanceModel(
  'AI_MODEL_MEMORY',
  'openai/gpt-4o-mini',
);

/**
 * Model that turns a workout written in plain words into structured steps.
 * A short, well-defined task: a small model keeps it cheap and fast.
 * Fallback: 'openai/gpt-5-mini', or Claude Haiku with AI_PROVIDER=anthropic
 */
export const WORKOUT_PARSER_MODEL =
  process.env.AI_MODEL_WORKOUT_PARSER ||
  (AI_PROVIDER === 'anthropic'
    ? 'anthropic/claude-haiku-4-5'
    : 'openai/gpt-5-mini');
