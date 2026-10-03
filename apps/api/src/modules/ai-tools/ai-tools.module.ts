import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { PrismaService } from '../prisma/services/prisma.service';
import { AiToolsService } from './ai-tools.service';

@Module({
  imports: [CoreModule],
  providers: [AiToolsService, PrismaService],
  exports: [AiToolsService],
})
export class AiToolsModule {}
