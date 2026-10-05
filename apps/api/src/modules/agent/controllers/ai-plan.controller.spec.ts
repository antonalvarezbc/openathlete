import { INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { AiErrorCode, AiTask } from '@openathlete/shared';

import { AiNotConfiguredException } from '../../ai/ai.errors';
import { PlanGenerationService } from '../services/plan-generation.service';
import { AiPlanController } from './ai-plan.controller';

jest.mock('../../../mastra/agents/plan-generation.agent', () => ({
  planGenerationAgent: { id: 'plan-generation' },
}));
jest.mock('src/mastra/agents', () => ({ workoutParserAgent: {} }));
jest.mock('../../ai', () => ({
  AiModelResolverService: class {},
  AiService: class {},
}));

// Local HTTP exercises the real DTO pipes and role guard; the service, which
// checks the coach's AI settings, is covered by plan-generation.spec.ts.
describe('AI plan HTTP boundary', () => {
  let app: INestApplication;
  let origin: string;
  let roles: string[];
  const service = {
    start: jest.fn().mockResolvedValue({ jobId: 'x', state: 'queued' }),
    status: jest.fn().mockResolvedValue({ jobId: 'x', state: 'running' }),
    weekSteps: jest.fn().mockResolvedValue({ steps: [null] }),
    upcomingRaces: jest.fn().mockResolvedValue([]),
    previewContext: jest.fn().mockResolvedValue({ athlete: {} }),
  };
  const draft = {
    athleteId: 4,
    goal: { name: '10K', date: '2030-12-14', sport: 'RUNNING' },
    startDate: '2030-10-21',
    timeZone: 'Europe/Madrid',
    sports: ['RUNNING'],
    trainingDays: [2, 4, 6],
    weeklyHours: 5,
    language: 'es',
  };
  const jobId = '6f1f4b8e-2f5a-4c1e-9d2b-0c6a1b7e8f90';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiPlanController],
      providers: [{ provide: PlanGenerationService, useValue: service }],
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
    jest.clearAllMocks();
  });
  const post = (path: string, body: unknown) =>
    fetch(`${origin}/agent/ai/plans/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('queues a valid draft request for a coach', async () => {
    expect((await post('draft', draft)).status).toBe(201);
    expect(service.start).toHaveBeenCalledWith(
      { userId: 3, roles: ['COACH'] },
      expect.objectContaining({ athleteId: 4, weeklyHours: 5 }),
    );
    const status = await fetch(`${origin}/agent/ai/plans/draft/${jobId}`);
    expect(status.status).toBe(200);
    expect(service.status).toHaveBeenCalledWith(expect.anything(), jobId);
  });

  test('is for coaches, including self-coached athletes', async () => {
    roles = ['ATHLETE'];
    expect((await post('draft', draft)).status).toBe(403);
    roles = ['ATHLETE', 'COACH'];
    expect((await post('draft', draft)).status).toBe(201);
  });

  test('needs AI configured to generate, not to follow a draft', async () => {
    service.start.mockRejectedValueOnce(
      new AiNotConfiguredException(AiTask.PLAN_GENERATION),
    );
    service.weekSteps.mockRejectedValueOnce(
      new AiNotConfiguredException(AiTask.WORKOUT_PARSER),
    );
    const refused = await post('draft', draft);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({
      code: AiErrorCode.NOT_CONFIGURED,
    });
    expect(
      (
        await post('week-steps', {
          athleteId: 4,
          sessions: [{ sport: 'RUNNING', text: "20' easy" }],
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(`${origin}/agent/ai/plans/draft/${jobId}`)).status,
    ).toBe(200);
  });

  test('refuses plans over 24 weeks, bad job ids and oversized weeks', async () => {
    expect(
      (
        await post('draft', {
          ...draft,
          goal: { ...draft.goal, date: '2031-04-07' },
        })
      ).status,
    ).toBe(400);
    expect((await fetch(`${origin}/agent/ai/plans/draft/1`)).status).toBe(400);
    expect(
      (
        await post('week-steps', {
          athleteId: 4,
          sessions: Array.from({ length: 15 }, () => ({
            sport: 'RUNNING',
            text: 'easy',
          })),
        })
      ).status,
    ).toBe(400);
    expect(service.start).not.toHaveBeenCalled();
  });

  test('shows races and the AI context to coaches, AI or not', async () => {
    const races = await fetch(`${origin}/agent/ai/plans/races?athleteId=4`);
    expect(races.status).toBe(200);
    expect(service.upcomingRaces).toHaveBeenCalledWith(expect.anything(), 4);
    const context = {
      athleteId: 4,
      goalEventId: 50,
      startDate: '2030-10-21',
      raceDate: '2030-12-14',
      timeZone: 'Europe/Madrid',
    };
    expect((await post('context', context)).status).toBe(201);
    expect(service.previewContext).toHaveBeenCalledWith(
      expect.anything(),
      context,
    );
    // Over 24 weeks, or a race before the start, is refused.
    expect(
      (await post('context', { ...context, raceDate: '2031-04-07' })).status,
    ).toBe(400);
    expect(
      (await post('context', { ...context, raceDate: '2030-10-20' })).status,
    ).toBe(400);
    roles = ['ATHLETE'];
    expect(
      (await fetch(`${origin}/agent/ai/plans/races?athleteId=4`)).status,
    ).toBe(403);
  });
});
