import { ZodValidationPipe } from 'nestjs-zod';

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  ApplyPlanAdaptation,
  FeatureName,
  PlanAdaptationRequest,
  RefinePlanAdaptation,
  applyPlanAdaptationSchema,
  planAdaptationRequestSchema,
  refinePlanAdaptationSchema,
} from '@openathlete/shared';

import { JwtUser } from '../../auth';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { FeatureAccessGuard, RequireFeature } from '../../subscription';
import { PlanAdaptationService } from '../services/plan-adaptation.service';

@Controller('agent/ai/plan-adaptation')
@UseGuards(AuthGuard('jwt'))
export class PlanAdaptationController {
  constructor(private readonly service: PlanAdaptationService) {}

  @Post('context')
  context(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(planAdaptationRequestSchema))
    request: PlanAdaptationRequest,
  ) {
    return this.service.context(user, request);
  }

  @Post('propose')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FeatureName.AI_GENERATION)
  propose(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(planAdaptationRequestSchema))
    request: PlanAdaptationRequest,
  ) {
    return this.service.propose(user, request);
  }

  @Post('refine')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FeatureName.AI_GENERATION)
  refine(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(refinePlanAdaptationSchema))
    dto: RefinePlanAdaptation,
  ) {
    return this.service.refine(user, dto);
  }

  @Post('apply')
  apply(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(applyPlanAdaptationSchema))
    request: ApplyPlanAdaptation,
  ) {
    return this.service.apply(user, request);
  }
}
