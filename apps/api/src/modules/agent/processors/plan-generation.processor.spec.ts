import { UnrecoverableError } from 'bullmq';

import { Logger } from '@nestjs/common';

import { decodeAiFailure } from '../services/ai-failure';
import { PlanGenerationService } from '../services/plan-generation.service';
import { PlanGenerationProcessor } from './plan-generation.processor';

jest.mock('../../../mastra/agents/plan-generation.agent', () => ({
  planGenerationAgent: { generate: jest.fn() },
}));
jest.mock('src/mastra/agents', () => ({ workoutParserAgent: {} }));

const SECRET_PROMPT = 'Sunday long run in the Sierra';

function setup(generate: jest.Mock) {
  const processor = new PlanGenerationProcessor({
    generate,
  } as unknown as PlanGenerationService);
  const job = {
    data: { userId: 3, request: { constraints: SECRET_PROMPT } },
    updateProgress: jest.fn(),
  };
  const error = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  return { processor, job, error };
}

afterEach(() => jest.restoreAllMocks());

describe('PlanGenerationProcessor', () => {
  test('logs a provider failure and stores only its reason', async () => {
    const quota = Object.assign(
      new Error(
        'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
      ),
      {
        name: 'AI_APICallError',
        statusCode: 429,
        data: { error: { code: 'insufficient_quota' } },
        requestBodyValues: { input: SECRET_PROMPT },
      },
    );
    const { processor, job, error } = setup(jest.fn().mockRejectedValue(quota));
    const failure = await processor.process(job as never).catch((e) => e);

    // No retries: the reason is final.
    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(decodeAiFailure(failure.message)).toEqual({
      reason: 'QUOTA',
      detail: '429 insufficient_quota',
    });
    const logged = String(error.mock.calls[0][0]);
    expect(logged).toMatch(/task=PLAN_GENERATION/);
    expect(logged).toMatch(/model=\S+/);
    expect(logged).toMatch(/reason=QUOTA status=429 code=insufficient_quota/);
    expect(logged).toMatch(/AI_APICallError: You have no credits remaining/);
    expect(logged).not.toContain(SECRET_PROMPT);
  });

  test('reports a timeout with its own reason', async () => {
    const timeout = new DOMException(
      'The operation timed out.',
      'TimeoutError',
    );
    const first = setup(jest.fn().mockRejectedValue(timeout));
    const failure = await first.processor
      .process(first.job as never)
      .catch((e) => e);
    expect(decodeAiFailure(failure.message).reason).toBe('TIMEOUT');
    expect(String(first.error.mock.calls[0][0])).toMatch(/reason=TIMEOUT/);
  });

  test('returns the draft when generation works', async () => {
    const draft = { plan: { plan: {}, cycles: [] } };
    const { processor, job, error } = setup(jest.fn().mockResolvedValue(draft));
    await expect(processor.process(job as never)).resolves.toBe(draft);
    expect(job.updateProgress).toHaveBeenCalledWith({ stage: 'generating' });
    expect(error).not.toHaveBeenCalled();
  });
});
