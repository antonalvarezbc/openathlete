import { AiTask } from '@openathlete/shared';

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
});
