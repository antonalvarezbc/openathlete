import { INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { FeatureAccessGuard } from '../../subscription';
import { CoachAssistantService } from '../services/coach-assistant.service';
import { CoachAssistantController } from './coach-assistant.controller';

jest.mock('../../../mastra/agents/coach-assistant.agent', () => ({
  coachAssistantAgent: { generate: jest.fn() },
}));
jest.mock('../../../mastra/agents/plan-adaptation.agent', () => ({
  planAdaptationAgent: { generate: jest.fn() },
}));

// Local HTTP exercises the actual DTO pipes and role guard. Ownership is tested
// with the real context service in coach-assistant.spec.ts; no LLM requests.
describe('Coach assistant HTTP boundary', () => {
  let app: INestApplication;
  let origin: string;
  let roles: string[];
  let aiAllowed = true;
  const service = {
    context: jest.fn().mockResolvedValue({ data: {} }),
    chat: jest.fn().mockResolvedValue({ reply: 'Suggestion' }),
  };
  const input = {
    athleteId: 4,
    planId: 1,
    language: 'es',
    weekStart: '2030-10-21',
    timeZone: 'Europe/Madrid',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CoachAssistantController],
      providers: [{ provide: CoachAssistantService, useValue: service }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = { userId: 3, roles };
          return true;
        },
      })
      .overrideGuard(FeatureAccessGuard)
      .useValue({ canActivate: () => aiAllowed })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    roles = ['COACH'];
    aiAllowed = true;
    jest.clearAllMocks();
  });
  const post = (path: string, body: unknown) =>
    fetch(origin + '/agent/ai/coach-assistant/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  test('permits context preview without granting access to the LLM feature', async () => {
    aiAllowed = false;
    expect((await post('context', input)).status).toBe(201);
    expect(
      (await post('chat', { ...input, question: 'Review this week' })).status,
    ).toBe(403);
    expect(service.chat).not.toHaveBeenCalled();
  });
  test.each(['context', 'chat'])(
    'rejects athlete-only access to %s',
    async (path) => {
      roles = ['ATHLETE'];
      expect(
        (
          await post(path, {
            ...input,
            ...(path === 'chat' ? { question: 'Review' } : {}),
          })
        ).status,
      ).toBe(403);
      expect(service.context).not.toHaveBeenCalled();
      expect(service.chat).not.toHaveBeenCalled();
    },
  );
  test('accepts a coach question with validated defaults', async () => {
    expect((await post('chat', { ...input, question: 'Review' })).status).toBe(
      201,
    );
    expect(service.chat).toHaveBeenCalledWith(
      { userId: 3, roles: ['COACH'] },
      { ...input, question: 'Review', currentState: '', history: [] },
    );
  });
  test('rejects write permissions or client-supplied context in the chat request', async () => {
    expect(
      (
        await post('chat', {
          ...input,
          question: 'Review',
          context: { athleteId: 999 },
          apply: true,
        })
      ).status,
    ).toBe(400);
    expect(service.chat).not.toHaveBeenCalled();
  });
});
