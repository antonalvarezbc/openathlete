import { ZodValidationPipe } from 'nestjs-zod';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  CreateManagedPlan,
  LinkPlanRace,
  PlanRaceInput,
  UpdateManagedPlan,
  createManagedPlanSchema,
  linkPlanRaceSchema,
  planRaceSchema,
  updateManagedPlanSchema,
} from '@openathlete/shared';

import { JwtUser, UserTypeGuard, UserTypes } from '../../auth';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PlanWorkspaceService } from '../services/plan-workspace.service';

@ApiTags('Training plans')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@UserTypes(['COACH'])
@Controller('training-plan')
export class PlanWorkspaceController {
  constructor(private readonly service: PlanWorkspaceService) {}

  @Get()
  list(
    @JwtUser() user: AuthUser,
    @Query('athleteId', ParseIntPipe) athleteId: number,
  ) {
    return this.service.list(user, athleteId);
  }
  @Get(':id')
  get(@JwtUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(user, id);
  }
  @Get(':id/competitions')
  competitions(
    @JwtUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.competitions(user, id);
  }
  @Post()
  create(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(createManagedPlanSchema))
    data: CreateManagedPlan,
  ) {
    return this.service.create(user, data);
  }
  @Patch(':id')
  update(
    @JwtUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateManagedPlanSchema))
    data: UpdateManagedPlan,
  ) {
    return this.service.update(user, id, data);
  }
  @Post(':id/races')
  createRace(
    @JwtUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(planRaceSchema)) data: PlanRaceInput,
  ) {
    return this.service.saveRace(user, id, data);
  }
  @Post(':id/races/link')
  linkRace(
    @JwtUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(linkPlanRaceSchema)) data: LinkPlanRace,
  ) {
    return this.service.linkRace(user, id, data);
  }
  @Patch(':id/races/:raceId')
  updateRace(
    @JwtUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('raceId', ParseIntPipe) raceId: number,
    @Body(new ZodValidationPipe(planRaceSchema)) data: PlanRaceInput,
  ) {
    return this.service.saveRace(user, id, data, raceId);
  }
  @Delete(':id/races/:raceId')
  unlinkRace(
    @JwtUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('raceId', ParseIntPipe) raceId: number,
  ) {
    return this.service.unlinkRace(user, id, raceId);
  }
}
