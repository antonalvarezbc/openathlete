/** Effective installation capabilities; credentials and filesystem paths are never exposed. */
export type InstallationFeaturesDto = {
  manualFitImport: boolean;
  manualGarminSync: boolean;
};
