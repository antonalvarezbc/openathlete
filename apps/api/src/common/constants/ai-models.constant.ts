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
  // The coach features ran on AI_MODEL_EVENT_MODIFICATION before having
  // their own tasks: it still applies when their own variable is unset.
  [AiTask.PLAN_GENERATION]: [
    'AI_MODEL_PLAN_GENERATION',
    'AI_MODEL_EVENT_MODIFICATION',
  ],
  [AiTask.PLAN_ADAPTATION]: [
    'AI_MODEL_PLAN_ADAPTATION',
    'AI_MODEL_EVENT_MODIFICATION',
  ],
  [AiTask.ACTIVITY_ANALYSIS]: [
    'AI_MODEL_ACTIVITY_ANALYSIS',
    'AI_MODEL_EVENT_MODIFICATION',
  ],
  [AiTask.WORKOUT_PARSER]: ['AI_MODEL_WORKOUT_PARSER'],
  [AiTask.AI_MEMORY]: ['AI_MODEL_MEMORY'],
};

export const DEFAULT_HOSTED_MODELS: Record<AiFeatureTask, string> = {
  [AiTask.EVENT_GENERATION]: 'openai/gpt-5.1',
  [AiTask.EVENT_MODIFICATION]: 'openai/gpt-5.1',
  [AiTask.POST_ACTIVITY_QUESTIONS]: 'google/gemini-3-pro-preview',
  [AiTask.FEEDBACK_EXTRACTION]: 'openai/gpt-5.1',
  [AiTask.TRAINING_LOAD_ESTIMATION]: 'openai/gpt-5.1',
  [AiTask.PLAN_GENERATION]: 'openai/gpt-5.1',
  [AiTask.PLAN_ADAPTATION]: 'openai/gpt-5.1',
  [AiTask.ACTIVITY_ANALYSIS]: 'openai/gpt-5.1',
  [AiTask.WORKOUT_PARSER]: 'openai/gpt-5-mini',
  [AiTask.AI_MEMORY]: 'openai/gpt-4o-mini',
};

/**
 * Short, well-defined tasks run on a small model: AI_MODEL_DEFAULT, meant
 * for the main model, does not apply to them, and AI_PROVIDER=anthropic
 * picks Claude Haiku.
 */
const SMALL_MODEL_TASKS: AiFeatureTask[] = [
  AiTask.WORKOUT_PARSER,
  AiTask.AI_MEMORY,
];
const CLAUDE_SMALL_MODEL = 'anthropic/claude-haiku-4-5';

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
  if (SMALL_MODEL_TASKS.includes(task))
    return (
      configured ||
      (providerDefault(env) ? CLAUDE_SMALL_MODEL : DEFAULT_HOSTED_MODELS[task])
    );
  return (
    configured ||
    env.AI_MODEL_DEFAULT ||
    providerDefault(env) ||
    DEFAULT_HOSTED_MODELS[task]
  );
}

/** Provider of the instance keys: 'openai' (default) or 'anthropic'. */
export const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai')
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
