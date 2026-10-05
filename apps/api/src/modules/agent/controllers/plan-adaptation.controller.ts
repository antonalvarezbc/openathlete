import { ZodValidationPipe } from 'nestjs-zod';

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  ApplyPlanAdaptation,
  PlanAdaptationRequest,
  RefinePlanAdaptation,
  applyPlanAdaptationSchema,
  planAdaptationRequestSchema,
  refinePlanAdaptationSchema,
} from '@openathlete/shared';

import { JwtUser } from '../../auth';
import { AuthUser } from '../../auth/decorators/user.decorator';
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
    return this.service.previewContext(user, request);
  }

  @Post('propose')
  propose(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(planAdaptationRequestSchema))
    request: PlanAdaptationRequest,
  ) {
    return this.service.propose(user, request);
  }

  @Post('refine')
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
