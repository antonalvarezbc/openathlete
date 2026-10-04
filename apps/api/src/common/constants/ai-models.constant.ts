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

/** Hosted model for a task, from the environment or the defaults above. */
export function hostedModelFor(
  task: AiFeatureTask,
  env: Record<string, string | undefined>,
): string {
  const configured = HOSTED_MODEL_ENV_VARS[task]
    .map((name) => env[name])
    .find(Boolean);
  return configured || env.AI_MODEL_DEFAULT || DEFAULT_HOSTED_MODELS[task];
}
