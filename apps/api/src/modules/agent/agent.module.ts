import { Module } from '@nestjs/common';

import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { AuthModule } from '../auth';
import { CoreModule } from '../core/core.module';
import { PrismaService } from '../prisma/services/prisma.service';
import { SubscriptionModule } from '../subscription';
import { WebSocketModule } from '../websocket/websocket.module';
import { ActivityAnalysisController } from './controllers/activity-analysis.controller';
import { AIFeaturesController } from './controllers/ai-features.controller';
import { CoachAssistantController } from './controllers/coach-assistant.controller';
import { PlanAdaptationController } from './controllers/plan-adaptation.controller';
import { ActivityAnalysisService } from './services/activity-analysis.service';
import { CoachAssistantService } from './services/coach-assistant.service';
import { EventGenerationService } from './services/event-generation.service';
import { EventModificationService } from './services/event-modification.service';
import { PlanAdaptationService } from './services/plan-adaptation.service';
import { WorkoutParserService } from './services/workout-parser.service';

@Module({
  imports: [
    AiMemoryModule,
    AiToolsModule,
    AuthModule,
    CoreModule,
    SubscriptionModule,
    WebSocketModule,
  ],
  controllers: [
    AIFeaturesController,
    ActivityAnalysisController,
    PlanAdaptationController,
    CoachAssistantController,
  ],
  providers: [
    CoachAssistantService,
    ActivityAnalysisService,
    EventGenerationService,
    EventModificationService,
    PlanAdaptationService,
    WorkoutParserService,
    PrismaService,
  ],
  exports: [],
})
export class AgentModule {}
