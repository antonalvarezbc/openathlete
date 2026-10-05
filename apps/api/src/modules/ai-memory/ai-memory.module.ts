import { Module } from '@nestjs/common';

import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { PrismaService } from '../prisma/services/prisma.service';
import { AiMemoryController } from './ai-memory.controller';
import { AiMemoryService } from './ai-memory.service';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [AiMemoryController],
  providers: [AiMemoryService, PrismaService],
  exports: [AiMemoryService],
})
export class AiMemoryModule {}
