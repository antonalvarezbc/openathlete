import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { CorosProviderService, SuuntoProviderService } from '../providers';
import { GarminProviderService } from '../providers/garmin.provider.service';
import { PolarProviderService } from '../providers/polar.provider.service';
import { StravaProviderService } from '../providers/strava.provider.service';
import { ProviderOAuthController } from './provider-oauth.controller';

jest.mock('../providers', () => ({
  CorosProviderService: class {},
  SuuntoProviderService: class {},
}));
jest.mock('../providers/garmin.provider.service', () => ({
  GarminProviderService: class {},
}));
jest.mock('../providers/polar.provider.service', () => ({
  PolarProviderService: class {},
}));
jest.mock('../providers/strava.provider.service', () => ({
  StravaProviderService: class {},
}));

// Local HTTP only: provider services, JWT verification and persistence are synthetic.
describe('provider configuration HTTP boundary', () => {
  let app: INestApplication;
  let origin: string;
  const config = new ConfigService({});
  const prisma = {
    athlete: { findUnique: jest.fn().mockResolvedValue({ athleteId: 7 }) },
  };
  const provider = {
    getAuthorizationUri: jest
      .fn()
      .mockReturnValue('https://provider.test/authorize'),
    getAuthorizationUriWithPKCE: jest.fn().mockReturnValue({
      uri: 'https://provider.test/authorize',
      codeVerifier: 'synthetic-verifier',
    }),
    connect: jest.fn().mockResolvedValue({ connected: true }),
  };
  const headers = { Authorization: 'Bearer synthetic-token' };
  const names = ['STRAVA', 'GARMIN', 'SUUNTO', 'POLAR'] as const;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProviderOAuthController],
      providers: [
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        // Historical imports are queued; these tests never start one.
        { provide: QueueService, useValue: {} },
        ...[
          StravaProviderService,
          GarminProviderService,
          SuuntoProviderService,
          PolarProviderService,
          CorosProviderService,
        ].map((provide) => ({ provide, useValue: provider })),
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest();
          if (request.headers.authorization !== headers.Authorization)
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
    jest.clearAllMocks();
    for (const name of names) {
      config.set(`${name}_CLIENT_ID`, `your-${name.toLowerCase()}-client-id`);
      config.set(
        `${name}_CLIENT_SECRET`,
        `your-${name.toLowerCase()}-client-secret`,
      );
      config.set(
        `${name}_REDIRECT_URI`,
        `http://localhost:5173/auth/callback/${name.toLowerCase()}`,
      );
    }
    config.set('SUUNTO_SUBSCRIPTION_KEY', 'synthetic-subscription-key');
  });
  function configure(name: string) {
    config.set(`${name}_CLIENT_ID`, '123456');
    config.set(`${name}_CLIENT_SECRET`, 'synthetic-opaque-secret');
  }

  it.each(names)(
    'blocks placeholder %s authorization and token exchange without provider or DB calls',
    async (name) => {
      const uri = await fetch(origin + `/provider/${name.toLowerCase()}/uri`);
      expect(uri.status).toBe(503);
      expect(await uri.json()).toMatchObject({
        message: 'PROVIDER_NOT_CONFIGURED',
      });
      const token = await fetch(
        origin + `/provider/${name.toLowerCase()}/token`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'synthetic-code',
            codeVerifier: 'synthetic-verifier',
          }),
        },
      );
      expect(token.status).toBe(503);
      expect(await token.json()).toMatchObject({
        message: 'PROVIDER_NOT_CONFIGURED',
      });
      expect(provider.getAuthorizationUri).not.toHaveBeenCalled();
      expect(provider.getAuthorizationUriWithPKCE).not.toHaveBeenCalled();
      expect(provider.connect).not.toHaveBeenCalled();
      expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
    },
  );
  it.each(names)('preserves configured %s authorization', async (name) => {
    configure(name);
    const response = await fetch(
      origin + `/provider/${name.toLowerCase()}/uri`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uri: 'https://provider.test/authorize',
    });
  });
  it('preserves a configured token exchange', async () => {
    configure('STRAVA');
    const response = await fetch(origin + '/provider/strava/token', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'synthetic-code' }),
    });
    expect(response.status).toBe(201);
    expect(provider.connect).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3 }),
      'synthetic-code',
    );
  });
});
