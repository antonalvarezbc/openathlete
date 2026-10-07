import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ConnectorProvider } from '@openathlete/database';
import { ApiEnvSchemaType, InstanceInfoDto } from '@openathlete/shared';

import { configuredProviders } from '../providers-sync/base/provider-config';

@ApiTags('Instance')
@Controller('instance')
export class InstanceController {
  constructor(private readonly config: ConfigService<ApiEnvSchemaType, true>) {}

  @Get()
  @ApiOperation({
    summary: 'What this instance offers',
    description:
      'Public. Which optional services are configured: Google sign-in, email, and the device connectors users can connect. The app hides the rest. Says nothing about how they are configured.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        googleSignIn: { type: 'boolean' },
        email: { type: 'boolean' },
        providers: {
          type: 'array',
          items: { type: 'string', enum: Object.values(ConnectorProvider) },
        },
      },
    },
  })
  getInstanceInfo(): InstanceInfoDto {
    const get = (key: keyof ApiEnvSchemaType) => this.config.get(key);
    return {
      googleSignIn: !!get('FIREBASE_SERVICE_ACCOUNT_JSON'),
      email: !!get('BREVO_API_KEY'),
      providers: configuredProviders(get),
    };
  }
}
