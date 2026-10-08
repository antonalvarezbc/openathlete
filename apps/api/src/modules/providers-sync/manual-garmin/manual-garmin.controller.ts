import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { manualGarminWorkoutsSchema } from '@openathlete/shared';

import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
import { ManualGarminWorkoutsService } from './manual-garmin-workouts.service';
import { ManualGarminService } from './manual-garmin.service';

const targetSchema = z
  .object({
    athleteId: z
      .union([z.number(), z.string()])
      .pipe(z.coerce.number().int().positive())
      .optional(),
  })
  .strict();
const loginSchema = z
  .object({
    email: z.string().email().max(254).optional(),
    password: z.string().min(1).max(1000).optional(),
    code: z
      .string()
      .regex(/^[0-9]{4,10}$/)
      .optional(),
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict()
  .refine((value) =>
    value.code
      ? !value.email && !value.password
      : !!value.email && !!value.password,
  );

const workoutStatesSchema = z
  .object({
    athleteId: z.coerce.number().int().positive().optional(),
    eventIds: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .transform((value) => [...new Set(value.split(',').map(Number))])
      .pipe(z.array(z.number().int().positive()).max(50)),
  })
  .strict();

@Controller('provider/garmin-manual')
@UseGuards(AuthGuard('jwt'))
export class ManualGarminController {
  constructor(
    private readonly service: ManualGarminService,
    private readonly workouts: ManualGarminWorkoutsService,
  ) {}

  @Get('status')
  status(
    @JwtUser() user: AuthUser,
    @Query(new ZodValidationPipe(targetSchema))
    target: z.infer<typeof targetSchema>,
  ) {
    return this.service.status(user, target.athleteId);
  }

  @Post('sync')
  sync(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(targetSchema))
    target: z.infer<typeof targetSchema>,
  ) {
    return this.service.sync(user, target.athleteId);
  }

  @Post('backfill')
  backfill(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(targetSchema))
    target: z.infer<typeof targetSchema>,
  ) {
    return this.service.backfill(user, target.athleteId);
  }

  @Post('backfill/stop')
  stopBackfill(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(targetSchema))
    target: z.infer<typeof targetSchema>,
  ) {
    return this.service.stopBackfill(user, target.athleteId);
  }

  @Post('connect')
  connect(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(loginSchema))
    input: z.infer<typeof loginSchema>,
  ) {
    return this.service.connect(user, input);
  }

  /** Forget the athlete's Garmin session on this server. */
  @Post('disconnect')
  disconnect(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(targetSchema))
    target: z.infer<typeof targetSchema>,
  ) {
    return this.service.disconnect(user, target.athleteId);
  }

  @Get('workouts')
  workoutStates(
    @JwtUser() user: AuthUser,
    @Query(new ZodValidationPipe(workoutStatesSchema))
    query: z.infer<typeof workoutStatesSchema>,
  ) {
    return this.workouts.list(user, query.athleteId, query.eventIds);
  }

  /** Send (or update) up to MANUAL_GARMIN_WORKOUT_BATCH planned sessions. */
  @Post('workouts/send')
  sendWorkouts(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(manualGarminWorkoutsSchema))
    input: z.infer<typeof manualGarminWorkoutsSchema>,
  ) {
    return this.workouts.send(user, input.athleteId, input.eventIds);
  }

  @Post('workouts/remove')
  removeWorkouts(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(manualGarminWorkoutsSchema))
    input: z.infer<typeof manualGarminWorkoutsSchema>,
  ) {
    return this.workouts.remove(user, input.athleteId, input.eventIds);
  }
}
