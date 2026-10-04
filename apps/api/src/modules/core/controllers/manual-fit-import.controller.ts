import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { SPORT_TYPE } from '@openathlete/shared';

import { UserTypes } from '../../auth/decorators/user-type.decorator';
import { AuthUser, JwtUser } from '../../auth/decorators/user.decorator';
import { UserTypeGuard } from '../../auth/guards/user-type.guard';
import { ManualFitImportGuard } from '../guards/manual-fit-import.guard';
import { MAX_MANUAL_FIT_BYTES } from '../helpers/manual-fit-import';
import {
  ManualFitFile,
  ManualFitImportService,
} from '../services/manual-fit-import.service';

const bodySchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
const gpxBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    /** Overrides the sport the GPX declares. */
    sport: z.nativeEnum(SPORT_TYPE).optional(),
  })
  .strict();

@ApiTags('Activities')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), UserTypeGuard, ManualFitImportGuard)
@UserTypes(['ATHLETE'])
@Controller('activity-import')
export class ManualFitImportController {
  constructor(private readonly service: ManualFitImportService) {}

  @Post('fit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_MANUAL_FIT_BYTES, files: 1, fields: 1, parts: 3 },
    }),
  )
  import(
    @JwtUser() user: AuthUser,
    @UploadedFile() file: ManualFitFile | undefined,
    @Body(new ZodValidationPipe(bodySchema)) body: z.infer<typeof bodySchema>,
  ) {
    return this.service.import(user, file, body.name);
  }

  @Post('gpx')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import a recorded GPX activity',
    description:
      'Multipart `file` (.gpx, up to 20 MB and 100,000 points), `name` and an optional `sport` that overrides the track type. Points need times: a route without them is refused with GPX_NO_TIME. Distance, moving time and climbing are computed from the track; sensors present on fewer than 90% of points are left out. Same duplicate rules and processing as FIT imports.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_MANUAL_FIT_BYTES, files: 1, fields: 2, parts: 4 },
    }),
  )
  importGpx(
    @JwtUser() user: AuthUser,
    @UploadedFile() file: ManualFitFile | undefined,
    @Body(new ZodValidationPipe(gpxBodySchema))
    body: z.infer<typeof gpxBodySchema>,
  ) {
    return this.service.importGpx(user, file, body.name, body.sport);
  }
}
