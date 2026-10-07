import { ConnectorProvider } from '@openathlete/shared';

/**
 * Connectors to show: those the instance can connect, plus any the user
 * already connected, so they can still disconnect it.
 */
export function offeredProviders(
  supported: ConnectorProvider[],
  configured: ConnectorProvider[],
  connected: ConnectorProvider[],
): ConnectorProvider[] {
  return supported.filter(
    (provider) => configured.includes(provider) || connected.includes(provider),
  );
}
