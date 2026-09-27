import { ExecutionContext, INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { TrainingLoadService } from '../services/training-load.service';
import { TrainingLoadController } from './training-load.controller';

jest.mock('../services/training-load.service', () => ({
  TrainingLoadService: class {},
}));

describe('training load recalculation HTTP validation', () => {
  let app: INestApplication;
  let origin: string;
  let authorized = true;
  const user = {
    userId: 1,
    email: 'coach@example.test',
    roles: ['COACH'],
    athlete: null,
  };
  const service = {
    recalculateAllLoads: jest
      .fn()
      .mockResolvedValue({ processed: 1, errors: 0, heartRateReferences: [] }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TrainingLoadController],
      providers: [{ provide: TrainingLoadService, useValue: service }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = user;
          return authorized;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    authorized = true;
    jest.clearAllMocks();
  });
  const send = (body: unknown) =>
    fetch(`${origin}/training-load/recalculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  it('passes the authenticated coach and selected athlete to the service', async () => {
    expect(
      (await send({ calculationType: 'TRIMP', athleteId: 12 })).status,
    ).toBe(201);
    expect(service.recalculateAllLoads).toHaveBeenCalledWith(user, 'TRIMP', 12);
  });
  it('preserves the self recalculation contract', async () => {
    expect((await send({ calculationType: 'TRIMP' })).status).toBe(201);
    expect(service.recalculateAllLoads).toHaveBeenCalledWith(
      user,
      'TRIMP',
      undefined,
    );
  });
  it.each([
    { calculationType: 'WRONG' },
    { calculationType: 'TRIMP', athleteId: '12' },
    { calculationType: 'TRIMP', athleteId: 0 },
    { calculationType: 'TRIMP', userId: 2 },
  ])('rejects invalid body %j', async (body) => {
    expect((await send(body)).status).toBe(400);
    expect(service.recalculateAllLoads).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated requests', async () => {
    authorized = false;
    expect(
      (await send({ calculationType: 'TRIMP', athleteId: 12 })).status,
    ).toBe(403);
    expect(service.recalculateAllLoads).not.toHaveBeenCalled();
  });
});
