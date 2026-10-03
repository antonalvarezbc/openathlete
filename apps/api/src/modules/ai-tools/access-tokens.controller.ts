import { ZodValidationPipe } from 'nestjs-zod';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CreateAccessToken,
  createAccessTokenSchema,
} from '@openathlete/shared';

import { AuthUser, JwtUser } from '../auth/decorators/user.decorator';
import { AccessTokensService } from './access-tokens.service';

/** Manage personal access tokens with the normal (JWT) session. */
@ApiTags('Access tokens')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('access-tokens')
export class AccessTokensController {
  constructor(private readonly tokens: AccessTokensService) {}

  @Get()
  list(@JwtUser() user: AuthUser) {
    return this.tokens.list(user);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a read-only token for the MCP server (shown once)',
  })
  create(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAccessTokenSchema))
    input: CreateAccessToken,
  ) {
    return this.tokens.create(user, input.name, input.expiresInDays);
  }

  @Delete(':id')
  revoke(@JwtUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tokens.revoke(user, id);
  }
}
