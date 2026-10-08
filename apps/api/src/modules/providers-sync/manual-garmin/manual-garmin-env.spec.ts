import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { manualGarminWorkerEnv } from './manual-garmin-env';

const apiEnvironment = {
  PATH: '/usr/local/bin:/usr/bin',
  HOME: '/home/node',
  LANG: 'C.UTF-8',
  TZ: 'Europe/Madrid',
  HTTPS_PROXY: 'http://proxy.internal:3128',
  SSL_CERT_FILE: '/etc/ssl/certs/ca-certificates.crt',
  DATABASE_URL: 'postgresql://openathlete:secret@db/openathlete',
  REDIS_URL: 'redis://:secret@redis:6379',
  JWT_SECRET_KEY: 'synthetic-jwt-secret',
  HASH_PEPPER: 'synthetic-pepper',
  STRIPE_SECRET_KEY: 'sk_test_synthetic',
  STRIPE_WEBHOOK_SECRET: 'whsec_synthetic',
  AI_OPENAI_API_KEY: 'sk-synthetic',
  BREVO_API_KEY: 'synthetic-brevo',
  GARMIN_CLIENT_SECRET: 'synthetic-garmin-secret',
  GARMIN_UNOFFICIAL_DIRECTORY: '/data/garmin',
  GARMINTOKENS: '/elsewhere/tokens',
  OA_GARMIN_PRIVATE_DIR: '/elsewhere/.private',
  PYTHONPATH: '/tmp/injected',
  NODE_OPTIONS: '--require /tmp/injected.js',
};

describe('manual Garmin worker environment', () => {
  it('keeps what Python needs and drops the API secrets', () => {
    expect(
      manualGarminWorkerEnv(
        {
          OA_GARMIN_PRIVATE_DIR: '/data/garmin/accounts/7/.private',
          OA_GARMIN_LOCK_DIRECTORY: '/data/garmin/.private',
        },
        apiEnvironment,
      ),
    ).toEqual({
      PATH: '/usr/local/bin:/usr/bin',
      HOME: '/home/node',
      LANG: 'C.UTF-8',
      TZ: 'Europe/Madrid',
      HTTPS_PROXY: 'http://proxy.internal:3128',
      SSL_CERT_FILE: '/etc/ssl/certs/ca-certificates.crt',
      PYTHONUNBUFFERED: '1',
      // The caller's paths win over any inherited value
      OA_GARMIN_PRIVATE_DIR: '/data/garmin/accounts/7/.private',
      OA_GARMIN_LOCK_DIRECTORY: '/data/garmin/.private',
    });
  });

  it('never passes an inherited Garmin setting the caller did not set', () => {
    const env = manualGarminWorkerEnv(
      { OA_GARMIN_LOCK_DIRECTORY: '/data/garmin/.private' },
      apiEnvironment,
    );
    expect(env).not.toHaveProperty('OA_GARMIN_PRIVATE_DIR');
    expect(env).not.toHaveProperty('GARMINTOKENS');
    expect(env).not.toHaveProperty('GARMIN_UNOFFICIAL_DIRECTORY');
  });

  it('reads the process environment by default', () => {
    process.env.HASH_PEPPER_TEST_SENTINEL = 'synthetic';
    try {
      const env = manualGarminWorkerEnv({});
      expect(env).not.toHaveProperty('HASH_PEPPER_TEST_SENTINEL');
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      delete process.env.HASH_PEPPER_TEST_SENTINEL;
    }
  });

  // Guards future workers too: every process start goes through the helper.
  it('is used by every place that starts a Garmin worker', async () => {
    const sources = (await readdir(__dirname)).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
    );
    const starters: string[] = [];
    for (const file of sources) {
      const source = await readFile(join(__dirname, file), 'utf8');
      expect({ file, spread: source.includes('...process.env') }).toEqual({
        file,
        spread: false,
      });
      if (/from ['"](node:)?child_process['"]/.test(source)) {
        starters.push(file);
        expect({
          file,
          helper: source.includes('manualGarminWorkerEnv('),
        }).toEqual({ file, helper: true });
      }
    }
    expect(starters.sort()).toEqual([
      'manual-garmin-backfill-worker.ts',
      'manual-garmin-login.ts',
      'manual-garmin-workouts.service.ts',
      'manual-garmin.service.ts',
    ]);
  });
});
