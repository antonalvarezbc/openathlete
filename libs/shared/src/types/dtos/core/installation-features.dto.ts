import type { ConnectorProvider } from '../../../entities/core';

/** Effective installation capabilities; credentials and filesystem paths are never exposed. */
export type InstallationFeaturesDto = {
  manualFitImport: boolean;
  manualGarminSync: boolean;
};

/** Local OAuth readiness only; credentials are never included. */
export type ProviderConfigurationDto = Partial<
  Record<ConnectorProvider, boolean>
>;
