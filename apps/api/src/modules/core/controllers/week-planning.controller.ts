import { ZodValidationPipe } from 'nestjs-zod';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CopyEventsBatch,
  DeleteEventsBatch,
  MoveEventsBatch,
  UpdateTrainingWeek,
  copyEventsBatchSchema,
  deleteEventsBatchSchema,
  moveEventsBatchSchema,
  updateTrainingWeekSchema,
} from '@openathlete/shared';

import { JwtUser, UserTypeGuard, UserTypes } from '../../auth';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { WeekPlanningService } from '../services/week-planning.service';

const optionalId = (value?: string) => {
  if (value === undefined || value === '') return undefined;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new BadRequestException('Invalid id');
  return id;
};

@ApiTags('Week planning')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@Controller('week-planning')
export class WeekPlanningController {
  constructor(private readonly service: WeekPlanningService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Plan context and actual load per activity for one week',
  })
  overview(
    @JwtUser() user: AuthUser,
    @Query('weekStart') weekStart: string,
    @Query('athleteId') athleteId?: string,
    @Query('trainingPlanId') trainingPlanId?: string,
  ) {
    const start = new Date(weekStart);
    if (Number.isNaN(start.getTime()))
      throw new BadRequestException('Invalid weekStart');
    return this.service.overview(
      user,
      start,
      optionalId(athleteId),
      optionalId(trainingPlanId),
    );
  }

  @Patch('weeks/:trainingWeekId')
  @UserTypes(['COACH'])
  @ApiOperation({ summary: 'Update the theme and targets of a plan week' })
  updateWeek(
    @JwtUser() user: AuthUser,
    @Param('trainingWeekId', ParseIntPipe) trainingWeekId: number,
    @Body(new ZodValidationPipe(updateTrainingWeekSchema))
    input: UpdateTrainingWeek,
  ) {
    return this.service.updateWeek(user, trainingWeekId, input);
  }

  @Post('events/copy')
  @UserTypes(['COACH'])
  @ApiOperation({
    summary: 'Copy planned sessions and notes to new dates (per event)',
  })
  copy(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(copyEventsBatchSchema)) input: CopyEventsBatch,
  ) {
    return this.service.copy(user, input);
  }

  @Post('events/move')
  @UserTypes(['COACH'])
  @ApiOperation({
    summary: 'Move planned sessions without activity and notes (per event)',
  })
  move(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(moveEventsBatchSchema)) input: MoveEventsBatch,
  ) {
    return this.service.move(user, input);
  }

  @Post('events/delete')
  @UserTypes(['COACH'])
  @ApiOperation({
    summary: 'Delete planned sessions without activity and notes (per event)',
  })
  delete(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(deleteEventsBatchSchema))
    input: DeleteEventsBatch,
  ) {
    return this.service.delete(user, input);
  }
}
