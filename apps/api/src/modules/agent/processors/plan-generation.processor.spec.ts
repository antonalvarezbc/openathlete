import { UnrecoverableError } from 'bullmq';

import { ForbiddenException, Logger } from '@nestjs/common';

import { AiErrorCode, AiTask } from '@openathlete/shared';

import {
  AiNotConfiguredException,
  AiProviderException,
} from '../../ai/ai.errors';
import { decodeAiFailure } from '../services/ai-failure';
import { PlanGenerationService } from '../services/plan-generation.service';
import { PlanGenerationProcessor } from './plan-generation.processor';

jest.mock('../../../mastra/agents/plan-generation.agent', () => ({
  planGenerationAgent: { id: 'plan-generation' },
}));
jest.mock('src/mastra/agents', () => ({ workoutParserAgent: {} }));
jest.mock('../../ai', () => ({
  AiModelResolverService: class {},
  AiService: class {},
}));

const SECRET_PROMPT = 'Sunday long run in the Sierra';
const model = {
  task: AiTask.PLAN_GENERATION,
  source: 'own_key',
  userId: 3,
  provider: 'openai',
  modelId: 'gpt-5.1',
  credentialId: 9,
  config: { id: 'openai/gpt-5.1', apiKey: 'sk-proj-coachkey123456' },
};

function setup(
  generate: jest.Mock,
  resolveModel = jest.fn().mockResolvedValue(model),
) {
  const authorize = jest.fn().mockResolvedValue(4);
  const processor = new PlanGenerationProcessor({
    authorize,
    generate,
    resolveModel,
  } as unknown as PlanGenerationService);
  const job = {
    data: { userId: 3, request: { athleteId: 4, constraints: SECRET_PROMPT } },
    updateProgress: jest.fn(),
  };
  const error = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  return { processor, job, error, resolveModel, authorize };
}

afterEach(() => jest.restoreAllMocks());

describe('PlanGenerationProcessor', () => {
  test('rechecks access before resolving credentials or running a queued draft', async () => {
    const generate = jest.fn();
    const { processor, job, authorize, resolveModel } = setup(generate);
    authorize.mockRejectedValue(new ForbiddenException('Coach role required'));
    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(authorize).toHaveBeenCalledWith(3, 4);
    expect(resolveModel).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  test('drafts on the model resolved for whoever asked, on the worker', async () => {
    const draft = { plan: { plan: {}, cycles: [] } };
    const generate = jest.fn().mockResolvedValue(draft);
    const { processor, job, error, resolveModel } = setup(generate);
    await expect(processor.process(job as never)).resolves.toBe(draft);
    expect(resolveModel).toHaveBeenCalledWith(3);
    expect(generate).toHaveBeenCalledWith(
      model,
      job.data.request,
      expect.any(Function),
    );
    expect(job.updateProgress).toHaveBeenCalledWith({ stage: 'generating' });
    expect(error).not.toHaveBeenCalled();
  });

  test('logs a provider failure and stores only its reason and whose key it was', async () => {
    const quota = new AiProviderException(
      AiErrorCode.QUOTA_EXCEEDED,
      'The AI provider quota is exhausted or rate limited',
      429,
    );
    const { processor, job, error } = setup(jest.fn().mockRejectedValue(quota));
    const failure = await processor.process(job as never).catch((e) => e);

    // No retries: the reason is final.
    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(decodeAiFailure(failure.message)).toEqual({
      reason: 'QUOTA',
      detail: '429',
      source: 'own_key',
    });
    const logged = String(error.mock.calls[0][0]);
    expect(logged).toMatch(/task=PLAN_GENERATION/);
    expect(logged).toMatch(/model=openai\/gpt-5\.1 source=own_key/);
    expect(logged).toMatch(/reason=QUOTA detail=429/);
    expect(logged).not.toContain(SECRET_PROMPT);
    expect(logged).not.toContain('sk-proj-coachkey');
  });

  test('a coach without AI for plans gets NOT_CONFIGURED', async () => {
    const { processor, job, error } = setup(
      jest.fn(),
      jest
        .fn()
        .mockRejectedValue(
          new AiNotConfiguredException(AiTask.PLAN_GENERATION),
        ),
    );
    const failure = await processor.process(job as never).catch((e) => e);
    expect(decodeAiFailure(failure.message)).toEqual({
      reason: 'NOT_CONFIGURED',
    });
    expect(String(error.mock.calls[0][0])).toMatch(/model=- source=-/);
  });

  test('reports a timeout with its own reason', async () => {
    const timeout = new AiProviderException(
      AiErrorCode.PROVIDER_ERROR,
      'The AI model took too long to answer',
      undefined,
      'timeout',
    );
    const first = setup(jest.fn().mockRejectedValue(timeout));
    const failure = await first.processor
      .process(first.job as never)
      .catch((e) => e);
    expect(decodeAiFailure(failure.message).reason).toBe('TIMEOUT');
    expect(String(first.error.mock.calls[0][0])).toMatch(/reason=TIMEOUT/);
  });

  test('masks anything that looks like a key in the logged error', async () => {
    const { processor, job, error } = setup(
      jest
        .fn()
        .mockRejectedValue(
          new Error('Incorrect API key provided: sk-proj-abcdef123456'),
        ),
    );
    await processor.process(job as never).catch(() => undefined);
    expect(String(error.mock.calls[0][0])).not.toContain('sk-proj-abcdef');
  });
});
