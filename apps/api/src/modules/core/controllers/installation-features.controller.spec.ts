import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/services/prisma.service';
import { ManualGarminController } from '../../providers-sync/manual-garmin/manual-garmin.controller';
import { ManualGarminService } from '../../providers-sync/manual-garmin/manual-garmin.service';
import { QueueService } from '../../queue/queue.service';
import { InstallationFeaturesController } from './installation-features.controller';

jest.mock('@garmin/fitsdk', () =>
  process.getBuiltinModule('module').createRequire(__filename)(
    '@garmin/fitsdk',
  ),
);

// Exercise real capability responses and disabled Garmin service gates over
// local HTTP. Authentication uses a synthetic token; no Garmin or DB calls.
describe('installation features HTTP boundary', () => {
  let app: INestApplication;
  let origin: string;
  const config = new ConfigService({
    SELF_HOSTED: true,
    GARMIN_UNOFFICIAL_DIRECTORY: '/tmp/synthetic-private-garmin',
    JWT_SECRET_KEY: 'synthetic-secret-never-returned',
    ENABLE_MANUAL_FIT_IMPORT: false,
    ENABLE_MANUAL_GARMIN_SYNC: false,
  });
  const prisma = {
    athlete: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const queue = { addActivityProcessingJob: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InstallationFeaturesController, ManualGarminController],
      providers: [
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        ManualGarminService,
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest();
          if (request.headers.authorization !== 'Bearer synthetic-test-token')
            throw new UnauthorizedException();
          request.user = {
            userId: 3,
            roles: ['ATHLETE'],
            athlete: { athleteId: 7 },
          };
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
    config.set('ENABLE_MANUAL_FIT_IMPORT', false);
    config.set('ENABLE_MANUAL_GARMIN_SYNC', false);
    jest.clearAllMocks();
  });

  const headers = { Authorization: 'Bearer synthetic-test-token' };

  it('requires authentication for installation capabilities', async () => {
    expect((await fetch(origin + '/installation/features')).status).toBe(401);
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'returns only public capability flags for FIT=%s Garmin=%s',
    async (manualFitImport, manualGarminSync) => {
      config.set('ENABLE_MANUAL_FIT_IMPORT', manualFitImport);
      config.set('ENABLE_MANUAL_GARMIN_SYNC', manualGarminSync);
      const response = await fetch(origin + '/installation/features', {
        headers,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        manualFitImport,
        manualGarminSync,
        voiceTranscription: expect.any(String),
      });
      expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
    },
  );

  it('reports Garmin as disabled without accessing an existing connection', async () => {
    const response = await fetch(origin + '/provider/garmin-manual/status', {
      headers,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
    expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['sync', {}],
    ['backfill', {}],
    ['backfill/stop', {}],
    [
      'connect',
      {
        email: 'synthetic@example.test',
        password: 'synthetic-password',
        timezone: 'Europe/Madrid',
      },
    ],
    ['connect', { code: '123456', timezone: 'Europe/Madrid' }],
  ])(
    'rejects disabled Garmin POST %s before any database access',
    async (path, body) => {
      const response = await fetch(origin + '/provider/garmin-manual/' + path, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(403);
      expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(queue.addActivityProcessingJob).not.toHaveBeenCalled();
    },
  );
});
