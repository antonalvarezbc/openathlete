import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { InstallationFeaturesDto } from '@openathlete/shared';

import { getVoiceTranscriptionStatus } from '../../../common/utils/ai-transcription.util';
import { getInstallationFeatures } from '../helpers/installation-features';

@ApiTags('Installation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('installation')
export class InstallationFeaturesController {
  constructor(private readonly config: ConfigService) {}

  @Get('features')
  features(): InstallationFeaturesDto {
    return {
      ...getInstallationFeatures(this.config),
      voiceTranscription: getVoiceTranscriptionStatus(),
    };
  }
}
