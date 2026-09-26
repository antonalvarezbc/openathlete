import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConnectorProvider } from '@openathlete/database';
import { ProviderConfigurationDto } from '@openathlete/shared';

// Recognize templates, not provider-specific credential formats. Configured
// means locally complete; it does not prove the provider will accept the keys.
function supplied(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !/^(?:your[-_]|(?:replace[-_]?me|change[-_]?me|placeholder|example)(?:$|[-_])|x{3,}$|<[^>]+>$|\$\{[^}]+\}$)/i.test(
      value.trim(),
    )
  );
}

function hasCallback(value: unknown): boolean {
  if (!supplied(value)) return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/(^|\.)(example\.(com|org|net)|[^.]+\.invalid)$/.test(url.hostname) &&
      !/^your[-_]/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function getProviderConfiguration(
  config: ConfigService<Record<string, unknown>, boolean>,
): ProviderConfigurationDto {
  const configured = (provider: string) =>
    supplied(config.get(`${provider}_CLIENT_ID`)) &&
    supplied(config.get(`${provider}_CLIENT_SECRET`)) &&
    hasCallback(config.get(`${provider}_REDIRECT_URI`));

  return {
    STRAVA: configured('STRAVA'),
    GARMIN: configured('GARMIN'),
    SUUNTO:
      configured('SUUNTO') && supplied(config.get('SUUNTO_SUBSCRIPTION_KEY')),
    POLAR: configured('POLAR'),
    // The current Coros service intentionally has empty OAuth credentials.
    COROS: false,
  };
}

export function assertProviderConfigured(
  config: ConfigService<Record<string, unknown>, boolean>,
  provider: ConnectorProvider,
) {
  const providers = getProviderConfiguration(config);
  if (!Object.prototype.hasOwnProperty.call(providers, provider))
    throw new BadRequestException('Unsupported provider');
  if (!providers[provider])
    throw new ServiceUnavailableException({
      code: 'PROVIDER_NOT_CONFIGURED',
      message: 'Provider is not configured for this installation',
    });
}
