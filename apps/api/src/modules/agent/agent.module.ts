import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { AuthModule } from '../auth';
import { CoreModule } from '../core/core.module';
import { PrismaService } from '../prisma/services/prisma.service';
import { SubscriptionModule } from '../subscription';
import { WebSocketModule } from '../websocket/websocket.module';
import { ActivityAnalysisController } from './controllers/activity-analysis.controller';
import { AIFeaturesController } from './controllers/ai-features.controller';
import { AiPlanController } from './controllers/ai-plan.controller';
import { CoachAssistantController } from './controllers/coach-assistant.controller';
import { PlanAdaptationController } from './controllers/plan-adaptation.controller';
import { PlanGenerationProcessor } from './processors/plan-generation.processor';
import { ActivityAnalysisService } from './services/activity-analysis.service';
import { CoachAssistantService } from './services/coach-assistant.service';
import { EventGenerationService } from './services/event-generation.service';
import { EventModificationService } from './services/event-modification.service';
import { PlanAdaptationService } from './services/plan-adaptation.service';
import {
  PLAN_GENERATION_QUEUE,
  PlanGenerationService,
} from './services/plan-generation.service';
import { WorkoutParserService } from './services/workout-parser.service';

@Module({
  imports: [
    AiMemoryModule,
    AiToolsModule,
    AiModule,
    AuthModule,
    CoreModule,
    SubscriptionModule,
    WebSocketModule,
    BullModule.registerQueue({
      name: PLAN_GENERATION_QUEUE,
      defaultJobOptions: {
        // A failed draft costs a model call: the coach retries, not the queue
        attempts: 1,
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 24 * 3600 },
      },
    }),
  ],
  controllers: [
    AIFeaturesController,
    ActivityAnalysisController,
    PlanAdaptationController,
    CoachAssistantController,
    AiPlanController,
  ],
  providers: [
    CoachAssistantService,
    ActivityAnalysisService,
    EventGenerationService,
    EventModificationService,
    PlanAdaptationService,
    PlanGenerationService,
    // Drafts run where activity processing runs, like the other jobs.
    // process.env: ConfigService is not available at module definition.
    ...(process.env.ENABLE_ACTIVITY_PROCESSING === 'true'
      ? [PlanGenerationProcessor]
      : []),
    WorkoutParserService,
    PrismaService,
  ],
  exports: [],
})
export class AgentModule {}
