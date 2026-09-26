import { ConfigService } from '@nestjs/config';

import { ApiEnvSchema } from '@openathlete/shared';

import { getInstallationFeatures } from './installation-features';

const base = {
  ENV: 'development',
  NODE_ENV: 'development',
  HASH_PEPPER: 'synthetic-test-pepper',
  JWT_SECRET_KEY: 'x'.repeat(32),
  DATABASE_URL: 'postgresql://localhost/test',
};
const configured = (flags: Record<string, unknown> = {}) =>
  new ConfigService(ApiEnvSchema.parse({ ...base, ...flags }));

describe('optional installation tools', () => {
  it('defaults both tools off even on self-hosted installations with Garmin configured', () => {
    expect(
      getInstallationFeatures(
        configured({
          SELF_HOSTED: 'true',
          GARMIN_UNOFFICIAL_DIRECTORY: '/tmp/synthetic-garmin',
        }),
      ),
    ).toEqual({ manualFitImport: false, manualGarminSync: false });
  });

  it.each([
    ['false', 'false', false, false],
    ['true', 'false', true, false],
    ['false', 'true', false, true],
    ['true', 'true', true, true],
  ])(
    'supports independent FIT=%s and Garmin=%s flags',
    (fit, garmin, manualFitImport, manualGarminSync) => {
      const config = configured({
        SELF_HOSTED: 'true',
        GARMIN_UNOFFICIAL_DIRECTORY: '/tmp/synthetic-garmin',
        ENABLE_MANUAL_FIT_IMPORT: fit,
        ENABLE_MANUAL_GARMIN_SYNC: garmin,
      });
      expect(getInstallationFeatures(config)).toEqual({
        manualFitImport,
        manualGarminSync,
      });
    },
  );

  it.each(['ENABLE_MANUAL_FIT_IMPORT', 'ENABLE_MANUAL_GARMIN_SYNC'])(
    'rejects misspelled or non-string values for %s at startup',
    (flag) => {
      for (const value of ['yes', 'TRUE', '1', '', true, false, 1, null]) {
        const result = ApiEnvSchema.safeParse({ ...base, [flag]: value });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(
            result.error.issues.some((issue) => issue.path[0] === flag),
          ).toBe(true);
      }
    },
  );

  it.each([
    {
      SELF_HOSTED: 'false',
      GARMIN_UNOFFICIAL_DIRECTORY: '/tmp/synthetic-garmin',
    },
    { SELF_HOSTED: 'true' },
    { SELF_HOSTED: 'true', GARMIN_UNOFFICIAL_DIRECTORY: '' },
    { SELF_HOSTED: 'true', GARMIN_UNOFFICIAL_DIRECTORY: 'relative/garmin' },
  ])('keeps Garmin disabled without all prerequisites: %j', (prerequisites) => {
    expect(
      getInstallationFeatures(
        configured({
          ...prerequisites,
          ENABLE_MANUAL_GARMIN_SYNC: 'true',
          ENABLE_MANUAL_FIT_IMPORT: 'true',
        }),
      ),
    ).toEqual({ manualFitImport: true, manualGarminSync: false });
  });

  it('does not let raw strings bypass validated booleans', () => {
    expect(
      getInstallationFeatures(
        new ConfigService({
          ENABLE_MANUAL_FIT_IMPORT: 'false',
          ENABLE_MANUAL_GARMIN_SYNC: 'true',
          SELF_HOSTED: true,
          GARMIN_UNOFFICIAL_DIRECTORY: '/tmp/synthetic-garmin',
        }),
      ),
    ).toEqual({ manualFitImport: false, manualGarminSync: false });
  });
});
