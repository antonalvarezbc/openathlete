import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
import { ManualGarminService } from './manual-garmin.service';

@Controller('provider/garmin-manual')
@UseGuards(AuthGuard('jwt'))
export class ManualGarminController {
  constructor(private readonly service: ManualGarminService) {}

  @Get('status')
  status(@JwtUser() user: AuthUser) {
    return this.service.status(user);
  }

  @Post('sync')
  sync(@JwtUser() user: AuthUser) {
    return this.service.sync(user);
  }
}
