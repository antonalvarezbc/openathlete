import { ZodValidationPipe } from 'nestjs-zod';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AiPlanContextRequest,
  AiPlanRequest,
  AiPlanWeekStepsRequest,
  FeatureName,
  aiPlanContextRequestSchema,
  aiPlanRequestSchema,
  aiPlanWeekStepsRequestSchema,
} from '@openathlete/shared';

import { JwtUser, UserTypeGuard } from 'src/modules/auth';
import { UserTypes } from 'src/modules/auth/decorators';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { FeatureAccessGuard, RequireFeature } from 'src/modules/subscription';

import { PlanGenerationService } from '../services/plan-generation.service';

@ApiTags('Agent')
@ApiBearerAuth()
@UserTypes(['COACH'])
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@Controller('agent/ai/plans')
export class AiPlanController {
  constructor(private readonly service: PlanGenerationService) {}

  @Post('draft')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FeatureName.AI_GENERATION)
  @ApiOperation({
    summary: 'Draft a training plan with AI',
    description:
      'Queues a draft for a linked athlete (or yourself as a self-coached athlete), up to 24 weeks ending with the goal race. Poll GET draft/:jobId. The draft comes in the plan import format with automatic check results; nothing is saved until it is imported.',
  })
  start(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiPlanRequestSchema)) request: AiPlanRequest,
  ) {
    return this.service.start(user, request);
  }

  @Get('races')
  @ApiOperation({
    summary: "The athlete's upcoming competitions, to pick the goal race",
  })
  races(
    @JwtUser() user: AuthUser,
    @Query('athleteId', ParseIntPipe) athleteId: number,
  ) {
    return this.service.upcomingRaces(user, athleteId);
  }

  @Post('context')
  @ApiOperation({
    summary: 'What the AI will receive about the athlete',
    description:
      'Recent training, metrics, zones, unresolved injuries and races in the plan window, exactly as a draft sends them, plus the sessions and plans already in those dates. Read-only and without AI.',
  })
  context(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiPlanContextRequestSchema))
    input: AiPlanContextRequest,
  ) {
    return this.service.previewContext(user, input);
  }

  @Get('draft/:jobId')
  @ApiOperation({ summary: 'State of an AI plan draft' })
  status(
    @JwtUser() user: AuthUser,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ) {
    return this.service.status(user, jobId);
  }

  @Post('week-steps')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FeatureName.AI_GENERATION)
  @ApiOperation({
    summary: "Structure one week of a draft's sessions",
    description:
      'Turns up to 14 session descriptions into structured steps with the workout parser. Sessions that cannot be structured come back as null. Nothing is saved.',
  })
  weekSteps(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiPlanWeekStepsRequestSchema))
    request: AiPlanWeekStepsRequest,
  ) {
    return this.service.weekSteps(user, request);
  }
}
