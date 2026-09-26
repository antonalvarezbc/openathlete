import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
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

@Controller('provider/garmin-manual')
@UseGuards(AuthGuard('jwt'))
export class ManualGarminController {
  constructor(private readonly service: ManualGarminService) {}

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
}
