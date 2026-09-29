import { ZodValidationPipe } from 'nestjs-zod';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  UpdateAiMemorySettings,
  updateAiMemorySettingsSchema,
} from '@openathlete/shared';

import { UserTypes } from '../auth/decorators/user-type.decorator';
import { AuthUser, JwtUser } from '../auth/decorators/user.decorator';
import { UserTypeGuard } from '../auth/guards/user-type.guard';
import { AiMemoryService } from './ai-memory.service';

/**
 * A coach's private AI memory about one linked athlete. Athletes have no
 * access: the memory can contain the coach's private notes.
 */
@Controller('agent/ai/memory/:athleteId')
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@UserTypes(['COACH'])
export class AiMemoryController {
  constructor(private readonly memory: AiMemoryService) {}

  @Get()
  get(
    @JwtUser() user: AuthUser,
    @Param('athleteId', ParseIntPipe) athleteId: number,
  ) {
    return this.memory.get(user.userId, athleteId);
  }

  @Patch()
  update(
    @JwtUser() user: AuthUser,
    @Param('athleteId', ParseIntPipe) athleteId: number,
    @Body(new ZodValidationPipe(updateAiMemorySettingsSchema))
    input: UpdateAiMemorySettings,
  ) {
    return this.memory.setMode(user.userId, athleteId, input.mode);
  }

  @Delete()
  clear(
    @JwtUser() user: AuthUser,
    @Param('athleteId', ParseIntPipe) athleteId: number,
  ) {
    return this.memory.clear(user.userId, athleteId);
  }
}
