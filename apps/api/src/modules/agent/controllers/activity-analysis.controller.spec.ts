import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { FeatureAccessGuard } from '../../subscription/guards/feature-access.guard';
import { ActivityAnalysisService } from '../services/activity-analysis.service';
import { ActivityAnalysisController } from './activity-analysis.controller';

jest.mock('../services/activity-analysis.service', () => ({
  ActivityAnalysisService: class {},
}));

// Actual routes and DTO pipes, synthetic authentication/service, local HTTP only.
// Role and relationship ownership checks are covered with the real service.
describe('Activity analysis HTTP boundary', () => {
  let app: INestApplication;
  let origin: string;
  let aiAllowed = true;
  const coach = { userId: 3, roles: ['COACH'] };
  const headers = {
    Authorization: 'Bearer synthetic-coach-token',
    'Content-Type': 'application/json',
  };
  const service = {
    list: jest.fn().mockResolvedValue([]),
    context: jest.fn().mockResolvedValue({ data: {} }),
    generate: jest.fn().mockResolvedValue({ activityAnalysisId: 81 }),
    updateFeedback: jest.fn().mockResolvedValue({ feedbackDraft: 'Reviewed' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ActivityAnalysisController],
      providers: [{ provide: ActivityAnalysisService, useValue: service }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest();
          if (request.headers.authorization !== headers.Authorization)
            throw new UnauthorizedException();
          request.user = coach;
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
    aiAllowed = true;
    jest.clearAllMocks();
  });

  function request(
    path: string,
    method = 'GET',
    body?: unknown,
    authenticated = true,
  ) {
    return fetch(origin + '/agent/ai/activity-analysis/' + path, {
      method,
      headers: authenticated ? headers : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  test.each([
    ['42', 'GET', undefined],
    ['42/context', 'POST', { language: 'es' }],
    ['42/generate', 'POST', { language: 'es' }],
    ['42/81', 'PATCH', { feedbackDraft: 'Reviewed' }],
  ])('requires authentication for %s', async (path, method, body) => {
    expect(
      (await request(path as string, method as string, body, false)).status,
    ).toBe(401);
    for (const operation of Object.values(service))
      expect(operation).not.toHaveBeenCalled();
  });

  test('forwards the authenticated coach and an integer event ID when listing private history', async () => {
    expect((await request('42')).status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(coach, 42);
  });

  test.each(['context', 'generate'])(
    'validates and normalizes %s input',
    async (path) => {
      expect(
        (await request(`42/${path}`, 'POST', { language: 'es' })).status,
      ).toBe(201);
      expect(service[path as 'context' | 'generate']).toHaveBeenCalledWith(
        coach,
        42,
        {
          language: 'es',
          coachContext: '',
        },
      );
    },
  );

  test.each([
    ['unsupported language', { language: 'de' }],
    ['missing language', { coachContext: 'Review' }],
    ['excessive context', { language: 'es', coachContext: 'x'.repeat(5001) }],
    [
      'injected athlete and owner',
      { language: 'es', athleteId: 999, coachUserId: 999 },
    ],
    [
      'client-supplied activity',
      { language: 'es', contextSnapshot: { rpe: 1 } },
    ],
    ['write instruction', { language: 'es', apply: true }],
  ])('rejects %s without requesting a model analysis', async (_label, body) => {
    expect((await request('42/generate', 'POST', body)).status).toBe(400);
    expect(service.generate).not.toHaveBeenCalled();
  });

  test('preserves private history, context and draft editing without granting the AI feature', async () => {
    aiAllowed = false;
    expect(
      (await request('42/generate', 'POST', { language: 'es' })).status,
    ).toBe(403);
    expect(service.generate).not.toHaveBeenCalled();
    expect((await request('42')).status).toBe(200);
    expect(
      (await request('42/context', 'POST', { language: 'es' })).status,
    ).toBe(201);
    expect(
      (await request('42/81', 'PATCH', { feedbackDraft: 'Reviewed' })).status,
    ).toBe(200);
  });

  test('only forwards the trimmed feedback draft when editing', async () => {
    expect(
      (await request('42/81', 'PATCH', { feedbackDraft: '  Reviewed  ' }))
        .status,
    ).toBe(200);
    expect(service.updateFeedback).toHaveBeenCalledWith(coach, 42, 81, {
      feedbackDraft: 'Reviewed',
    });
  });

  test.each([
    ['blank feedback', { feedbackDraft: '  ' }],
    ['excessive feedback', { feedbackDraft: 'x'.repeat(5001) }],
    ['owner override', { feedbackDraft: 'Reviewed', coachUserId: 999 }],
    [
      'original analysis rewrite',
      { feedbackDraft: 'Reviewed', analysis: { summary: 'Changed' } },
    ],
    ['snapshot rewrite', { feedbackDraft: 'Reviewed', contextSnapshot: {} }],
    ['automatic sending', { feedbackDraft: 'Reviewed', sendToAthlete: true }],
  ])('rejects %s during draft editing', async (_label, body) => {
    expect((await request('42/81', 'PATCH', body)).status).toBe(400);
    expect(service.updateFeedback).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid', 'GET', undefined],
    ['invalid/generate', 'POST', { language: 'es' }],
    ['42/invalid', 'PATCH', { feedbackDraft: 'Reviewed' }],
  ])('rejects invalid route identifiers in %s', async (path, method, body) => {
    expect((await request(path as string, method as string, body)).status).toBe(
      400,
    );
    for (const operation of Object.values(service))
      expect(operation).not.toHaveBeenCalled();
  });
});
