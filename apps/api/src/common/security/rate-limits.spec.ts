import request from 'supertest';

import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  SkipThrottle,
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';

import { DEFAULT_RATE_LIMIT, RATE_LIMITS } from './rate-limits';

@Controller()
class TestController {
  @Throttle(RATE_LIMITS.login)
  @Post('login')
  login() {
    return 'ok';
  }

  @SkipThrottle()
  @Post('webhook')
  webhook() {
    return 'ok';
  }

  @Get('default')
  default() {
    return 'ok';
  }
}

describe('rate limits', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(DEFAULT_RATE_LIMIT)],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  async function statuses(method: 'get' | 'post', path: string, n: number) {
    const codes: number[] = [];
    for (let i = 0; i < n; i++) {
      codes.push((await request(app.getHttpServer())[method](path)).status);
    }
    return codes;
  }

  it('blocks the 11th login attempt within a minute', async () => {
    const codes = await statuses('post', '/login', 11);
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('never throttles routes marked @SkipThrottle', async () => {
    const codes = await statuses('post', '/webhook', 50);
    expect(codes.every((c) => c === 201)).toBe(true);
  });

  it('applies the generous default limit elsewhere', async () => {
    const codes = await statuses('get', '/default', 50);
    expect(codes.every((c) => c === 200)).toBe(true);
  });
});
