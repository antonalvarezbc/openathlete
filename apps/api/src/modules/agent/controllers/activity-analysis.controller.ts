import { ZodValidationPipe } from 'nestjs-zod';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  ActivityAnalysisRequest,
  UpdateActivityAnalysis,
  activityAnalysisRequestSchema,
  updateActivityAnalysisSchema,
} from '@openathlete/shared';

import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
import { ActivityAnalysisService } from '../services/activity-analysis.service';

@Controller('agent/ai/activity-analysis/:eventId')
@UseGuards(AuthGuard('jwt'))
export class ActivityAnalysisController {
  constructor(private readonly service: ActivityAnalysisService) {}

  @Get()
  list(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.service.list(user, eventId);
  }

  @Post('context')
  context(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(activityAnalysisRequestSchema))
    request: ActivityAnalysisRequest,
  ) {
    return this.service.context(user, eventId, request);
  }

  @Post('generate')
  generate(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(activityAnalysisRequestSchema))
    request: ActivityAnalysisRequest,
  ) {
    return this.service.generate(user, eventId, request);
  }

  @Patch(':analysisId')
  updateFeedback(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('analysisId', ParseIntPipe) analysisId: number,
    @Body(new ZodValidationPipe(updateActivityAnalysisSchema))
    request: UpdateActivityAnalysis,
  ) {
    return this.service.updateFeedback(user, eventId, analysisId, request);
  }
}
