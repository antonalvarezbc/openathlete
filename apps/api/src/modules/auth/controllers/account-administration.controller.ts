import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  ChangeAccountMode,
  changeAccountModeSchema,
} from '@openathlete/shared';

import { AuthUser, JwtUser } from '../decorators/user.decorator';
import { AccountAdministrationService } from '../services/account-administration.service';

const listQuery = z
  .object({
    search: z.string().trim().max(200).default(''),
    page: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();

@Controller('admin/accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountAdministrationController {
  constructor(private readonly service: AccountAdministrationService) {}
  @Get()
  list(
    @JwtUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>,
  ) {
    return this.service.list(user, query.search, query.page);
  }
  @Patch(':userId/mode')
  change(
    @JwtUser() user: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body(new ZodValidationPipe(changeAccountModeSchema))
    body: ChangeAccountMode,
  ) {
    return this.service.change(user, userId, body);
  }
  @Delete(':userId')
  delete(
    @JwtUser() user: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.delete(user, userId);
  }
}
