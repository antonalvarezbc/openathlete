import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { ManualGarminController } from './manual-garmin.controller';
import { ManualGarminService } from './manual-garmin.service';

jest.mock('./manual-garmin.service', () => ({
  ManualGarminService: class {},
}));

// Exercise actual routing and Zod pipes over local HTTP. JWT verification and
// service effects are mocked; ownership checks are covered in the service tests.
describe('Manual Garmin HTTP boundary', () => {
  let app: INestApplication;
  let origin: string;
  let user: AuthUser;
  const service = {
    status: jest.fn(),
    sync: jest.fn(),
    backfill: jest.fn(),
    stopBackfill: jest.fn(),
    connect: jest.fn(),
  };
  const operations = [
    ['sync', 'sync'],
    ['backfill', 'backfill'],
    ['backfill/stop', 'stopBackfill'],
  ] as const;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ManualGarminController],
      providers: [{ provide: ManualGarminService, useValue: service }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: AuthUser;
          }>();
          if (request.headers.authorization !== 'Bearer synthetic-test-token')
            throw new UnauthorizedException();
          request.user = user;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = (await app.getUrl()) + '/provider/garmin-manual/';
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    user = {
      userId: 3,
      email: 'synthetic.coach@example.test',
      roles: ['COACH'],
      athlete: null,
    };
    for (const method of Object.values(service))
      method.mockReset().mockResolvedValue({ accepted: true });
  });

  const post = (path: string, body: unknown, authorized = true) =>
    fetch(origin + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorized ? { Authorization: 'Bearer synthetic-test-token' } : {}),
      },
      body: JSON.stringify(body),
    });

  const expectNoEffects = () => {
    for (const method of Object.values(service))
      expect(method).not.toHaveBeenCalled();
  };

  test.each(operations)(
    'requires authentication before dispatching POST %s',
    async (path) => {
      const response = await post(path, { athleteId: 7 }, false);
      expect(response.status).toBe(401);
      expectNoEffects();
    },
  );

  test.each(operations)(
    'passes only the authenticated user and validated target to POST %s',
    async (path, method) => {
      const response = await post(path, { athleteId: '7' });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ accepted: true });
      expect(service[method]).toHaveBeenCalledTimes(1);
      expect(service[method]).toHaveBeenCalledWith(user, 7);
      for (const [name, effect] of Object.entries(service))
        if (name !== method) expect(effect).not.toHaveBeenCalled();
    },
  );

  test.each(operations)(
    'allows the service to resolve the athlete account for POST %s',
    async (path, method) => {
      user = {
        userId: 8,
        email: 'synthetic.athlete@example.test',
        roles: ['ATHLETE'],
        athlete: { athleteId: 7 },
      };
      expect((await post(path, {})).status).toBe(201);
      expect(service[method]).toHaveBeenCalledWith(user, undefined);
    },
  );

  test.each(operations)(
    'rejects caller-selected files, operation IDs and credentials in POST %s',
    async (path) => {
      const injectedFields = [
        { ids: ['123'] },
        { directory: '/tmp/arbitrary' },
        { root: '/tmp/arbitrary' },
        { runId: '237ce3d8-04e7-4c2c-af8f-f947ed1bb26c' },
        { env: { OA_GARMIN_PRIVATE_DIR: '/tmp/arbitrary' } },
        { password: 'synthetic-password' },
        { user: { userId: 99, roles: ['COACH'] } },
        { force: true, cooldown: 0, maxDownloads: 100000 },
      ];
      for (const fields of injectedFields) {
        const response = await post(path, { athleteId: 7, ...fields });
        expect(response.status).toBe(400);
      }
      expectNoEffects();
    },
  );

  test.each(operations)(
    'rejects invalid athlete identifiers in POST %s',
    async (path) => {
      for (const athleteId of [
        0,
        -1,
        1.5,
        '',
        'invalid',
        null,
        {},
        true,
        false,
        [7],
      ])
        expect((await post(path, { athleteId })).status).toBe(400);
      expectNoEffects();
    },
  );

  test.each(operations)(
    'preserves ownership denials from the service for POST %s',
    async (path, method) => {
      service[method].mockRejectedValueOnce(new ForbiddenException());
      expect((await post(path, { athleteId: 7 })).status).toBe(403);
      expect(service[method]).toHaveBeenCalledTimes(1);
    },
  );

  test('preserves the busy code so the UI does not start another operation', async () => {
    service.backfill.mockRejectedValueOnce(
      new ConflictException({
        code: 'GARMIN_BACKFILL_BUSY',
        message: 'A manual operation is already running.',
      }),
    );
    const response = await post('backfill', { athleteId: 7 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'GARMIN_BACKFILL_BUSY',
    });
    expect(service.sync).not.toHaveBeenCalled();
    expect(service.stopBackfill).not.toHaveBeenCalled();
  });

  test('status polling only reads status and passes the validated query target', async () => {
    const response = await fetch(origin + 'status?athleteId=7', {
      headers: { Authorization: 'Bearer synthetic-test-token' },
    });
    expect(response.status).toBe(200);
    expect(service.status).toHaveBeenCalledWith(user, 7);
    expect(service.sync).not.toHaveBeenCalled();
    expect(service.backfill).not.toHaveBeenCalled();
    expect(service.stopBackfill).not.toHaveBeenCalled();
    expect(service.connect).not.toHaveBeenCalled();
  });

  test('rejects injected status query fields and unauthenticated polling', async () => {
    expect((await fetch(origin + 'status?athleteId=7')).status).toBe(401);
    const response = await fetch(origin + 'status?athleteId=7&ids=123', {
      headers: { Authorization: 'Bearer synthetic-test-token' },
    });
    expect(response.status).toBe(400);
    expectNoEffects();
  });
});
