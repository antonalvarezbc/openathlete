import { ZodValidationPipe } from 'nestjs-zod';

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  CoachAssistantChatRequest,
  CoachAssistantContextRequest,
  coachAssistantChatSchema,
  coachAssistantContextSchema,
} from '@openathlete/shared';

import { UserTypes } from '../../auth/decorators/user-type.decorator';
import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
import { UserTypeGuard } from '../../auth/guards/user-type.guard';
import { CoachAssistantService } from '../services/coach-assistant.service';

@Controller('agent/ai/coach-assistant')
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@UserTypes(['COACH'])
export class CoachAssistantController {
  constructor(private readonly service: CoachAssistantService) {}

  @Post('context')
  context(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(coachAssistantContextSchema))
    input: CoachAssistantContextRequest,
  ) {
    return this.service.context(user, input);
  }

  @Post('chat')
  chat(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(coachAssistantChatSchema))
    input: CoachAssistantChatRequest,
  ) {
    return this.service.chat(user, input);
  }
}
