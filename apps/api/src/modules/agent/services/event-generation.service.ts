import { Injectable } from '@nestjs/common';

import { eventGenerationAgent } from 'src/mastra/agents';
import {
  AiMemoryService,
  aiMemoryPromptSection,
} from 'src/modules/ai-memory/ai-memory.service';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import {
  type TrainingEventSchema,
  buildMetricsContext,
  buildWorkoutTargetsInstructions,
  buildZonesContext,
  convertWorkoutPaceTargetsToMs,
  createZoneIdMap,
  fetchAthleteMetrics,
  fetchAthleteZones,
  formatZonesByType,
  getLatestMetrics,
  trainingEventOutputOptions,
  validateNoNestedRepeatBlocks,
  validateWorkoutZoneTargets,
  withRetry,
} from './event-ai-helpers';

@Injectable()
export class EventGenerationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly memory: AiMemoryService,
  ) {}

  async generateTrainingEvent(
    prompt: string,
    athleteId: number,
    userId: number,
    /** Coach memory entry; defaults to the whole request. */
    memoryNote?: string,
  ): Promise<TrainingEventSchema> {
    const memory = await this.memory.getCoachMemory(userId, athleteId);
    const zones = await fetchAthleteZones(this.prismaService, athleteId);
    const metrics = await fetchAthleteMetrics(this.prismaService, athleteId);
    const latestMetrics = getLatestMetrics(metrics);
    const zonesByType = formatZonesByType(zones);
    const zonesContext = buildZonesContext(zonesByType);
    const metricsContext = buildMetricsContext(latestMetrics);

    const fullPrompt = `

Generate a training event based on this request: ${prompt}

ATHLETE CONTEXT:
${zonesContext ? `TRAINING ZONES:\n${zonesContext}` : 'No training zones configured'}
${metricsContext ? `\nLATEST METRICS:\n${metricsContext}` : '\nNo metrics available'}
${aiMemoryPromptSection(memory)}
CRITICAL REQUIREMENTS:
- Return a complete training event with workout structure
- For intervals (e.g., "10x 30s/30s"), create ONE REPEAT step with repeatBlock
- Use proper step types: WARMUP, STEADY, INTERVAL_ACTIVE, INTERVAL_REST, COOLDOWN, REPEAT
- Set appropriate startDate and endDate based on the event date

${buildWorkoutTargetsInstructions()}`;

    const zoneIdMap = createZoneIdMap(zones);

    const response = await withRetry(async () => {
      const result = await eventGenerationAgent.generate(
        fullPrompt,
        trainingEventOutputOptions,
      );

      if (!result.object) {
        throw new Error(
          'Failed to generate event: no structured output received',
        );
      }

      // Validate the generated event - if validation fails, retry
      if (result.object.workout) {
        validateNoNestedRepeatBlocks(result.object.workout);
        validateWorkoutZoneTargets(result.object.workout, zoneIdMap, zones);
        convertWorkoutPaceTargetsToMs(result.object.workout);
      }

      return result;
    });

    if (!response.object) {
      throw new Error(
        'Failed to generate event: no structured output received',
      );
    }

    await this.memory.addNote(
      userId,
      athleteId,
      'EVENT_GENERATION',
      memoryNote ??
        `Generated ${response.object.sport} session "${response.object.name}" from request: ${prompt}`,
    );

    return response.object;
  }
}
