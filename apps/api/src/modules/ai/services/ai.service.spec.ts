import { z } from 'zod';

import { AiErrorCode, AiTask } from '@openathlete/shared';

import { AiInvalidAnswerException, AiProviderException } from '../ai.errors';
import { ResolvedAiModel } from './ai-model-resolver.service';
import { AiService } from './ai.service';

// Jest cannot load Mastra's ESM providers; the real calls are covered by
// test/agents.test.cjs against the build
const generate = jest.fn();
const agentConfigs: unknown[] = [];
// Mastra's processors entry is ESM-only under Jest.
jest.mock('./provider-retry.processor', () => ({
  ProviderRetryProcessor: class {
    readonly id = 'stream-error-retry-processor';
  },
}));
jest.mock('@mastra/core/agent', () => ({
  Agent: jest.fn().mockImplementation((config: unknown) => {
    agentConfigs.push(config);
    return { generate };
  }),
}));

const agent = { id: 'test-agent', name: 'Test', instructions: 'Be helpful' };

const ownKeyModel: ResolvedAiModel = {
  task: AiTask.EVENT_GENERATION,
  source: 'own_key',
  userId: 1,
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-5',
  credentialId: 42,
  config: { id: 'anthropic/claude-sonnet-4-5', apiKey: 'sk-ant-user' },
};

function setup() {
  const prisma = { aiCredential: { update: jest.fn().mockResolvedValue({}) } };
  const usage = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    usage,
    service: new AiService(prisma as never, usage as never),
  };
}

describe('AiService', () => {
  beforeEach(() => {
    generate.mockReset();
    agentConfigs.length = 0;
  });

  it("runs the agent on the resolved model and the user's key", async () => {
    const { service } = setup();
    generate.mockResolvedValue({ text: 'Hello' });

    await expect(service.generateText(agent, ownKeyModel, 'Hi')).resolves.toBe(
      'Hello',
    );
    expect(agentConfigs[0]).toMatchObject({
      id: 'test-agent',
      instructions: 'Be helpful',
      model: { id: 'anthropic/claude-sonnet-4-5', apiKey: 'sk-ant-user' },
    });
  });

  it('counts the tokens of the call for the user who pays for it', async () => {
    const { service, usage } = setup();
    generate.mockResolvedValue({
      text: 'Hello',
      usage: { inputTokens: 5, outputTokens: 2 },
      totalUsage: { inputTokens: 120, outputTokens: 30 },
    });

    await service.generateText(agent, ownKeyModel, 'Hi');

    expect(usage.record).toHaveBeenCalledWith(ownKeyModel, {
      inputTokens: 120,
      outputTokens: 30,
    });
  });

  it('asks for structured output in a provider-portable way', async () => {
    const { service } = setup();
    const schema = z.object({ value: z.number() });
    generate.mockResolvedValue({ object: { value: 3 } });

    await expect(
      service.generateObject(agent, ownKeyModel, 'Count', schema),
    ).resolves.toEqual({ value: 3 });
    expect(generate).toHaveBeenCalledWith(
      'Count',
      expect.objectContaining({
        structuredOutput: { schema, jsonPromptInjection: 'auto' },
        providerOptions: { openai: { strictJsonSchema: false } },
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('fails clearly when the model returns no valid object', async () => {
    const { service } = setup();
    generate.mockResolvedValue({ object: undefined });

    await expect(
      service.generateObject(agent, ownKeyModel, 'x', z.object({})),
    ).rejects.toMatchObject({ code: AiErrorCode.PROVIDER_ERROR });
  });

  it('keeps the answer of an invalid or cut-off object, for a repair', async () => {
    const { service } = setup();
    generate.mockResolvedValue({
      object: undefined,
      text: '{"cycles": [',
      finishReason: 'length',
    });

    const error = await service
      .generateObject(agent, ownKeyModel, 'x', z.object({}))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiInvalidAnswerException);
    expect(error).toMatchObject({ rawText: '{"cycles": [', truncated: true });
  });

  it('retries transient provider errors, but not an account without credit', async () => {
    const { service } = setup();
    generate.mockResolvedValue({ text: 'Hi' });
    await service.generateText(agent, ownKeyModel, 'x');
    // Replaces Mastra's default retry processor, which retried quota errors.
    expect(agentConfigs[0]).toMatchObject({
      errorProcessors: [{ id: 'stream-error-retry-processor' }],
    });
    expect(agentConfigs[0]).not.toHaveProperty('errorProcessorDefaults');
  });

  it('passes the call options: timeout, output cap, tools context and steps', async () => {
    const { service } = setup();
    const tools = { lookup: {} } as never;
    const requestContext = { user: 1 } as never;
    generate.mockResolvedValue({ text: 'Done' });

    await service.generateText({ ...agent, tools }, ownKeyModel, 'x', {
      timeoutMs: 600_000,
      maxOutputTokens: 64_000,
      requestContext,
      maxSteps: 6,
    });
    expect(agentConfigs[0]).toMatchObject({ tools });
    expect(generate).toHaveBeenCalledWith(
      'x',
      expect.objectContaining({
        modelSettings: { maxOutputTokens: 64_000 },
        requestContext,
        maxSteps: 6,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    // Without options, none of them is sent.
    await service.generateText(agent, ownKeyModel, 'y');
    expect(generate.mock.calls[1][1]).not.toHaveProperty('modelSettings');
    expect(generate.mock.calls[1][1]).not.toHaveProperty('maxSteps');
  });

  it('records a successful use of the key', async () => {
    const { service, prisma } = setup();
    generate.mockResolvedValue({ text: 'ok' });

    await service.generateText(agent, ownKeyModel, 'Hi');

    expect(prisma.aiCredential.update).toHaveBeenCalledWith({
      where: { aiCredentialId: 42 },
      data: {
        lastUsedAt: expect.any(Date),
        lastError: null,
        lastErrorAt: null,
      },
    });
  });

  it('flags a rejected key and reports it to the caller', async () => {
    const { service, prisma } = setup();
    generate.mockRejectedValue(
      Object.assign(new Error('invalid x-api-key'), {
        cause: { statusCode: 401 },
      }),
    );

    const error = await service
      .generateText(agent, ownKeyModel, 'Hi')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderException);
    expect(error).toMatchObject({ code: AiErrorCode.CREDENTIAL_REJECTED });
    expect(prisma.aiCredential.update).toHaveBeenCalledWith({
      where: { aiCredentialId: 42 },
      data: {
        lastError: AiErrorCode.CREDENTIAL_REJECTED,
        lastErrorAt: expect.any(Date),
      },
    });
  });

  it("does not blame the key for the provider's own failures", async () => {
    const { service, prisma } = setup();
    generate.mockRejectedValue({ statusCode: 503 });

    await expect(
      service.generateText(agent, ownKeyModel, 'Hi'),
    ).rejects.toMatchObject({ code: AiErrorCode.PROVIDER_ERROR });
    expect(prisma.aiCredential.update).not.toHaveBeenCalled();
  });

  it('records nothing for hosted calls', async () => {
    const { service, prisma } = setup();
    generate.mockResolvedValue({ text: 'ok' });

    await service.generateText(
      agent,
      { ...ownKeyModel, source: 'hosted', credentialId: null },
      'Hi',
    );

    expect(prisma.aiCredential.update).not.toHaveBeenCalled();
  });
});
