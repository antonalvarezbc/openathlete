import { AiFeatureTask, AiTask } from '@openathlete/shared';

import { DEFAULT_HOSTED_MODELS, hostedModelFor } from './ai-models.constant';

describe('hostedModelFor', () => {
  it('uses the built-in default without configuration', () => {
    expect(hostedModelFor(AiTask.EVENT_GENERATION, {})).toBe(
      DEFAULT_HOSTED_MODELS[AiTask.EVENT_GENERATION],
    );
  });

  it('lets AI_MODEL_DEFAULT replace every default', () => {
    const env = { AI_MODEL_DEFAULT: 'anthropic/claude-sonnet-4-5' };

    expect(hostedModelFor(AiTask.POST_ACTIVITY_QUESTIONS, env)).toBe(
      'anthropic/claude-sonnet-4-5',
    );
  });

  it('prefers the task variable over AI_MODEL_DEFAULT', () => {
    const env = {
      AI_MODEL_DEFAULT: 'anthropic/claude-sonnet-4-5',
      AI_MODEL_TRIMP_ESTIMATION: 'openai/gpt-5-mini',
    };

    expect(hostedModelFor(AiTask.TRAINING_LOAD_ESTIMATION, env)).toBe(
      'openai/gpt-5-mini',
    );
  });

  it('still reads the former feedback extraction variables', () => {
    expect(
      hostedModelFor(AiTask.FEEDBACK_EXTRACTION, {
        AI_MODEL_EXTRACT_RPE: 'openai/gpt-4o',
      }),
    ).toBe('openai/gpt-4o');
    expect(
      hostedModelFor(AiTask.FEEDBACK_EXTRACTION, {
        AI_MODEL_FEEDBACK_EXTRACTION: 'mistral/mistral-large-latest',
        AI_MODEL_EXTRACT_RPE: 'openai/gpt-4o',
      }),
    ).toBe('mistral/mistral-large-latest');
  });

  it.each<AiFeatureTask>([
    AiTask.PLAN_GENERATION,
    AiTask.PLAN_ADAPTATION,
    AiTask.ACTIVITY_ANALYSIS,
  ])(
    'keeps the coach feature %s on AI_MODEL_EVENT_MODIFICATION unless its own variable is set',
    (task) => {
      expect(hostedModelFor(task, {})).toBe('openai/gpt-5.1');
      expect(
        hostedModelFor(task, {
          AI_MODEL_EVENT_MODIFICATION: 'anthropic/claude-opus-5-5',
        }),
      ).toBe('anthropic/claude-opus-5-5');
      expect(
        hostedModelFor(task, {
          AI_MODEL_DEFAULT: 'anthropic/claude-sonnet-5-5',
        }),
      ).toBe('anthropic/claude-sonnet-5-5');
    },
  );

  it('lets each coach feature have its own model', () => {
    const env = {
      AI_MODEL_EVENT_MODIFICATION: 'openai/gpt-5.1',
      AI_MODEL_PLAN_GENERATION: 'anthropic/claude-opus-5-5',
      AI_MODEL_PLAN_ADAPTATION: 'anthropic/claude-sonnet-5-5',
      AI_MODEL_ACTIVITY_ANALYSIS: 'google/gemini-3-pro-preview',
    };
    expect(hostedModelFor(AiTask.PLAN_GENERATION, env)).toBe(
      'anthropic/claude-opus-5-5',
    );
    expect(hostedModelFor(AiTask.PLAN_ADAPTATION, env)).toBe(
      'anthropic/claude-sonnet-5-5',
    );
    expect(hostedModelFor(AiTask.ACTIVITY_ANALYSIS, env)).toBe(
      'google/gemini-3-pro-preview',
    );
  });

  it.each<[AiFeatureTask, string, string]>([
    [AiTask.WORKOUT_PARSER, 'AI_MODEL_WORKOUT_PARSER', 'openai/gpt-5-mini'],
    [AiTask.AI_MEMORY, 'AI_MODEL_MEMORY', 'openai/gpt-4o-mini'],
  ])(
    'keeps %s on a small model: AI_MODEL_DEFAULT does not apply',
    (task, variable, fallback) => {
      const main = { AI_MODEL_DEFAULT: 'anthropic/claude-opus-5-5' };
      expect(hostedModelFor(task, main)).toBe(fallback);
      // AI_PROVIDER=anthropic picks Claude Haiku
      expect(hostedModelFor(task, { ...main, AI_PROVIDER: 'anthropic' })).toBe(
        'anthropic/claude-haiku-4-5',
      );
      expect(
        hostedModelFor(task, {
          ...main,
          AI_PROVIDER: 'anthropic',
          [variable]: 'mistral/mistral-small-latest',
        }),
      ).toBe('mistral/mistral-small-latest');
    },
  );
});
