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

/**
 * GPT-5.6 Luna gives the best quality for its price among small models
 * (October 2026), with native structured output, so hosted AI runs on a
 * single OpenAI key within the Supporter budget.
 */
const DEFAULT_HOSTED_MODEL = 'openai/gpt-5.6-luna';

export const DEFAULT_HOSTED_MODELS: Record<AiFeatureTask, string> = {
  [AiTask.EVENT_GENERATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.EVENT_MODIFICATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.POST_ACTIVITY_QUESTIONS]: DEFAULT_HOSTED_MODEL,
  [AiTask.FEEDBACK_EXTRACTION]: DEFAULT_HOSTED_MODEL,
  [AiTask.TRAINING_LOAD_ESTIMATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.PLAN_GENERATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.PLAN_ADAPTATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.ACTIVITY_ANALYSIS]: DEFAULT_HOSTED_MODEL,
  [AiTask.WORKOUT_PARSER]: DEFAULT_HOSTED_MODEL,
  [AiTask.AI_MEMORY]: DEFAULT_HOSTED_MODEL,
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

/** US dollars per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * Standard prices of the models hosted AI is likely to run, to charge calls
 * against the monthly budget (AI_HOSTED_MONTHLY_BUDGET_USD). Update them
 * when providers change their prices.
 */
export const HOSTED_MODEL_PRICES: Record<string, ModelPrice> = {
  'openai/gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'openai/gpt-5.4-nano': { input: 0.2, output: 1.25 },
  'openai/gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'openai/gpt-5-nano': { input: 0.05, output: 0.4 },
  'openai/gpt-5-mini': { input: 0.25, output: 2 },
  'openai/gpt-5.1': { input: 1.25, output: 10 },
  'openai/gpt-5': { input: 1.25, output: 10 },
  // Gemini 3.x prices double on 1 January 2027; these are the new ones
  'google/gemini-3.1-flash-lite': { input: 0.5, output: 3 },
  'google/gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'google/gemini-2.5-flash': { input: 0.3, output: 2.5 },
  // This fork can put the instance on Claude (AI_PROVIDER=anthropic)
  'anthropic/claude-opus-5-5': { input: 4, output: 20 },
  'anthropic/claude-opus-5': { input: 5, output: 25 },
  'anthropic/claude-sonnet-5-5': { input: 2, output: 10 },
  'anthropic/claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * A model missing from the table is charged like a flagship one, so that a
 * new configuration can never spend more than the budget.
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = { input: 5, output: 30 };

/** Cost of a call on the instance keys, in millionths of a US dollar. */
export function hostedCallCostMicroUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = HOSTED_MODEL_PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  // A price per million tokens is the cost of one token in micro-dollars;
  // rounding first keeps float noise (0.1 + 0.2) from adding a micro-dollar
  const cost = inputTokens * price.input + outputTokens * price.output;
  return Math.ceil(Math.round(cost * 1000) / 1000);
}

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
