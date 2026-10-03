import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { PrismaService } from '../prisma/services/prisma.service';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokensController } from './access-tokens.controller';
import { AccessTokensService } from './access-tokens.service';
import { AiToolsController } from './ai-tools.controller';
import { AiToolsService } from './ai-tools.service';

@Module({
  imports: [CoreModule],
  controllers: [AiToolsController, AccessTokensController],
  providers: [
    AiToolsService,
    AccessTokensService,
    AccessTokenGuard,
    PrismaService,
  ],
  exports: [AiToolsService],
})
export class AiToolsModule {}
