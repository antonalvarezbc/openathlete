import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthUser, JwtUser } from '../auth/decorators/user.decorator';
import { AccessTokenGuard } from './access-token.guard';
import { AiToolsService } from './ai-tools.service';

/**
 * Read-only data tools for external clients (the OpenAthlete MCP server),
 * authenticated with a personal access token.
 */
@ApiTags('AI tools')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('ai-tools')
export class AiToolsController {
  constructor(private readonly tools: AiToolsService) {}

  @Get()
  @ApiOperation({ summary: 'List tools with their JSON input schemas' })
  list() {
    return this.tools.describe();
  }

  @Post(':name')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run a tool as the token owner' })
  run(
    @JwtUser() user: AuthUser,
    @Param('name') name: string,
    @Body() input: unknown,
  ) {
    return this.tools.run(user, name, input);
  }
}
