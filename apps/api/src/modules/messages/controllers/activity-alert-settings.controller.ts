import { ZodValidationPipe } from 'nestjs-zod';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  CoachActivityAlertSettingsDto,
  coachActivityAlertSettingsSchema,
} from '@openathlete/shared';

import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
import { CoachActivityNoticeService } from '../services/coach-activity-notice.service';

@Controller('messages/activity-alert-settings/:athleteId')
@UseGuards(AuthGuard('jwt'))
export class ActivityAlertSettingsController {
  constructor(private readonly service: CoachActivityNoticeService) {}
  @Get()
  get(
    @JwtUser() user: AuthUser,
    @Param('athleteId', ParseIntPipe) athleteId: number,
  ) {
    return this.service.settings(user, athleteId);
  }
  @Put()
  update(
    @JwtUser() user: AuthUser,
    @Param('athleteId', ParseIntPipe) athleteId: number,
    @Body(new ZodValidationPipe(coachActivityAlertSettingsSchema))
    input: CoachActivityAlertSettingsDto,
  ) {
    return this.service.updateSettings(user, athleteId, input);
  }
}
