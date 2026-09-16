import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { CoreModule } from '../core/core.module';
import { PrismaService } from '../prisma/services/prisma.service';
import { SubscriptionModule } from '../subscription';
import { WebSocketModule } from '../websocket/websocket.module';
import { AIFeaturesController } from './controllers/ai-features.controller';
import { PlanAdaptationController } from './controllers/plan-adaptation.controller';
import { EventGenerationService } from './services/event-generation.service';
import { EventModificationService } from './services/event-modification.service';
import { PlanAdaptationService } from './services/plan-adaptation.service';

@Module({
  imports: [AuthModule, CoreModule, SubscriptionModule, WebSocketModule],
  controllers: [AIFeaturesController, PlanAdaptationController],
  providers: [
    EventGenerationService,
    EventModificationService,
    PlanAdaptationService,
    PrismaService,
  ],
  exports: [],
})
export class AgentModule {}
