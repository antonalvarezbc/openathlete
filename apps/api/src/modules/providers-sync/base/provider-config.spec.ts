import { configuredProviders } from './provider-config';

describe('configured providers', () => {
  const env = (values: Record<string, string>) => (key: string) => values[key];

  it('offers no connector on a bare instance', () => {
    expect(configuredProviders(env({}))).toEqual([]);
  });

  it('needs every setting of a connector', () => {
    expect(
      configuredProviders(
        env({
          STRAVA_CLIENT_ID: 'id',
          STRAVA_CLIENT_SECRET: 'secret',
          // Suunto also needs its subscription key
          SUUNTO_CLIENT_ID: 'id',
          SUUNTO_CLIENT_SECRET: 'secret',
          GARMIN_CLIENT_ID: 'id',
        }),
      ),
    ).toEqual(['STRAVA']);
  });

  it('ignores values left from an example file', () => {
    expect(
      configuredProviders(
        env({
          STRAVA_CLIENT_ID: 'your-strava-client-id',
          STRAVA_CLIENT_SECRET: 'your-strava-client-secret',
          POLAR_CLIENT_ID: '<client id>',
          POLAR_CLIENT_SECRET: 'changeme',
          GARMIN_CLIENT_ID: '1234',
          GARMIN_CLIENT_SECRET: 'an-opaque-secret',
        }),
      ),
    ).toEqual(['GARMIN']);
  });
});
