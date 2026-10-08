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
});
