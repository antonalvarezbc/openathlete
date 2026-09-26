import { isAbsolute } from 'node:path';

import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InstallationFeaturesDto } from '@openathlete/shared';

/** Read the validated API configuration; raw truthy strings must not enable a tool. */
export function getInstallationFeatures(
  config: ConfigService,
): InstallationFeaturesDto {
  const directory = config.get<string>('GARMIN_UNOFFICIAL_DIRECTORY');
  return {
    manualFitImport: config.get<boolean>('ENABLE_MANUAL_FIT_IMPORT') === true,
    manualGarminSync:
      config.get<boolean>('ENABLE_MANUAL_GARMIN_SYNC') === true &&
      config.get<boolean>('SELF_HOSTED') === true &&
      typeof directory === 'string' &&
      isAbsolute(directory),
  };
}

export function assertManualFitImportEnabled(config: ConfigService) {
  if (!getInstallationFeatures(config).manualFitImport)
    throw new ForbiddenException('MANUAL_FIT_IMPORT_DISABLED');
}
