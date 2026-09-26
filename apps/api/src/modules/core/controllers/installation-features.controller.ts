import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  InstallationFeaturesDto,
  ProviderConfigurationDto,
} from '@openathlete/shared';

import { getProviderConfiguration } from '../../providers-sync/helpers/provider-configuration';
import { getInstallationFeatures } from '../helpers/installation-features';

@ApiTags('Installation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('installation')
export class InstallationFeaturesController {
  constructor(private readonly config: ConfigService) {}

  @Get('providers')
  providers(): ProviderConfigurationDto {
    return getProviderConfiguration(this.config);
  }

  @Get('features')
  features(): InstallationFeaturesDto {
    return getInstallationFeatures(this.config);
  }
}
