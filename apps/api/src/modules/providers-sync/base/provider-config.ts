import { ConnectorProvider } from '@openathlete/database';
import { ApiEnvSchemaType } from '@openathlete/shared';

/** What each connector needs before users can connect it. */
const REQUIRED_ENV: Partial<
  Record<ConnectorProvider, (keyof ApiEnvSchemaType)[]>
> = {
  STRAVA: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'],
  GARMIN: ['GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET'],
  SUUNTO: [
    'SUUNTO_CLIENT_ID',
    'SUUNTO_CLIENT_SECRET',
    'SUUNTO_SUBSCRIPTION_KEY',
  ],
  POLAR: ['POLAR_CLIENT_ID', 'POLAR_CLIENT_SECRET'],
};

/**
 * Connectors this instance can offer. Self-hosted instances usually have
 * none: each one needs a developer account with the provider.
 */
export function configuredProviders(
  get: (key: keyof ApiEnvSchemaType) => unknown,
): ConnectorProvider[] {
  return (Object.keys(REQUIRED_ENV) as ConnectorProvider[]).filter((provider) =>
    REQUIRED_ENV[provider]!.every((key) => !!get(key)),
  );
}
