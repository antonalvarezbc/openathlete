import { ConfigService } from '@nestjs/config';

import { ConnectorProvider } from '@openathlete/database';

import {
  assertProviderConfigured,
  getProviderConfiguration,
} from './provider-configuration';

const providers = ['STRAVA', 'GARMIN', 'SUUNTO', 'POLAR'] as const;
const credentials = (provider: string) => ({
  [`${provider}_CLIENT_ID`]: '12345678',
  [`${provider}_CLIENT_SECRET`]: 'synthetic-opaque-secret',
  [`${provider}_REDIRECT_URI`]: 'http://localhost:5173/auth/callback/provider',
  SUUNTO_SUBSCRIPTION_KEY: 'synthetic-subscription-key',
});

describe('official provider configuration', () => {
  it('defaults every provider to unconfigured and returns only booleans', () => {
    expect(getProviderConfiguration(new ConfigService())).toEqual({
      STRAVA: false,
      GARMIN: false,
      SUUNTO: false,
      POLAR: false,
      COROS: false,
    });
  });

  it.each(providers)(
    'recognizes a locally configured %s independently of manual flags',
    (provider) => {
      expect(
        getProviderConfiguration(
          new ConfigService({
            ...credentials(provider),
            SELF_HOSTED: false,
            ENABLE_MANUAL_GARMIN_SYNC: false,
            ENABLE_MANUAL_FIT_IMPORT: false,
          }),
        )[provider],
      ).toBe(true);
    },
  );

  it.each(providers)(
    'rejects missing and template credentials for %s',
    (provider) => {
      for (const suffix of ['CLIENT_ID', 'CLIENT_SECRET']) {
        for (const value of [
          undefined,
          '',
          '   ',
          `your-${provider.toLowerCase()}-${suffix.toLowerCase().replace('_', '-')}`,
          'YOUR_CLIENT_ID',
          'replace-me',
          'changeme',
          'placeholder',
          'example',
          'xxxxx',
          '<client-secret>',
          '${CLIENT_SECRET}',
        ]) {
          const config = new ConfigService({
            ...credentials(provider),
            [`${provider}_${suffix}`]: value,
          });
          expect(getProviderConfiguration(config)[provider]).toBe(false);
        }
      }
    },
  );

  it.each([
    '',
    'not-a-url',
    'https://example.com/callback',
    'https://api.example.org/callback',
    'https://your-domain.org/callback',
    'https://host.invalid/callback',
    'https://user:password@host.test/callback',
    'javascript:alert(1)',
  ])('rejects an incomplete or example callback: %s', (callback) => {
    const config = new ConfigService({
      ...credentials('GARMIN'),
      GARMIN_REDIRECT_URI: callback,
    });
    expect(getProviderConfiguration(config).GARMIN).toBe(false);
  });

  it('requires the Suunto subscription key too', () => {
    for (const value of [undefined, '', 'your-suunto-subscription-key']) {
      expect(
        getProviderConfiguration(
          new ConfigService({
            ...credentials('SUUNTO'),
            SUUNTO_SUBSCRIPTION_KEY: value,
          }),
        ).SUUNTO,
      ).toBe(false);
    }
  });

  it('does not reject opaque credentials containing ordinary words', () => {
    expect(
      getProviderConfiguration(
        new ConfigService({
          ...credentials('GARMIN'),
          GARMIN_CLIENT_SECRET: 'a1-example-actually-opaque-secret',
        }),
      ).GARMIN,
    ).toBe(true);
  });

  it('keeps the unfinished Coros connector unavailable', () => {
    expect(
      getProviderConfiguration(new ConfigService(credentials('COROS'))).COROS,
    ).toBe(false);
  });

  it('rejects unknown provider names without treating object prototype keys as providers', () => {
    expect(() =>
      assertProviderConfigured(
        new ConfigService(),
        'constructor' as ConnectorProvider,
      ),
    ).toThrow('Unsupported provider');
  });
});
