import { ZodValidationPipe } from 'nestjs-zod';

import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Athlete, RecordType, SportType } from '@openathlete/database';
import { GetRecordsQueryDto, getRecordsQuerySchema } from '@openathlete/shared';

import { JwtUser, UserTypeGuard } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';

import { RecordService } from '../services/record.service';

@ApiTags('Record')
@Controller('record')
export class RecordController {
  constructor(private recordService: RecordService) {}

  @UseGuards(AuthGuard('jwt'), UserTypeGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary: 'Get best records for an athlete',
    description:
      'Best record at each distance (pace, climbing) or duration (power, heart rate), computed from activity streams. Pass a sport: records of different sports do not compare. from and to restrict them to activities in a period, to compare seasons. Without athleteId, uses the authenticated user; reading another athlete requires access to them.',
  })
  @ApiQuery({ name: 'sport', enum: SportType, required: false })
  @ApiQuery({ name: 'athleteId', type: Number, required: false })
  @ApiQuery({
    name: 'from',
    type: String,
    format: 'date-time',
    required: false,
    description: 'Records set from this date on',
  })
  @ApiQuery({
    name: 'to',
    type: String,
    format: 'date-time',
    required: false,
    description: 'Records set before this date',
  })
  @ApiResponse({
    status: 200,
    description: 'Best records',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          recordId: { type: 'number' },
          type: { type: 'string', enum: Object.values(RecordType) },
          distance: {
            type: 'number',
            nullable: true,
            description: 'Metres covered, for pace and climbing records',
          },
          duration: {
            type: 'number',
            nullable: true,
            description: 'Seconds covered, for power and heart rate records',
          },
          value: {
            type: 'number',
            description:
              'Seconds for SPEED, metres for ELEVATION_GAIN, watts for POWER, bpm for HEARTRATE',
          },
          date: { type: 'string', format: 'date-time' },
          eventId: { type: 'number', nullable: true },
          activityName: { type: 'string', nullable: true },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not allowed to read the athlete' })
  @ApiResponse({ status: 404, description: 'Athlete not found' })
  getRecords(
    @JwtUser() user: AuthUser,
    @Query(new ZodValidationPipe(getRecordsQuerySchema))
    query: GetRecordsQueryDto,
  ) {
    return this.recordService.getRecords(user, {
      ...query,
      sport: query.sport as SportType | undefined,
    });
  }

  @UseGuards(AuthGuard('jwt'), UserTypeGuard)
  @ApiBearerAuth()
  @Get('sports')
  @ApiOperation({
    summary: 'Sports that have records',
    description:
      'Sports for which the athlete has records, the one with the most activities first. Clients show one sport at a time: mixing sports on one records curve is meaningless.',
  })
  @ApiQuery({
    name: 'athleteId',
    type: Number,
    description:
      "Optional athlete ID. If not provided, uses authenticated user's athlete.",
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Sport types, most frequent first',
    schema: {
      type: 'array',
      items: { type: 'string', enum: Object.values(SportType) },
    },
  })
  @ApiResponse({ status: 403, description: 'Not allowed to read the athlete' })
  @ApiResponse({ status: 404, description: 'Athlete not found' })
  getRecordSports(
    @JwtUser() user: AuthUser,
    @Query('athleteId', new ParseIntPipe({ optional: true }))
    athleteId?: Athlete['athleteId'],
  ) {
    return this.recordService.getRecordSports(user, athleteId);
  }
}
