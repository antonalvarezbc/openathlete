import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  AiTask,
  CreateWorkoutStepDto,
  METRIC_TYPE,
  SPORT_TYPE,
} from '@openathlete/shared';

import { workoutParserAgent } from 'src/mastra/agents';
import { AiModelResolverService, AiService } from 'src/modules/ai';
import type { ResolvedAiModel } from 'src/modules/ai/services/ai-model-resolver.service';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import {
  buildZonesContext,
  fetchAthleteMetrics,
  fetchAthleteZones,
  formatZonesByType,
  getLatestMetrics,
  withRetry,
} from './event-ai-helpers';
import {
  type ParsedSession,
  type ParsedWorkout,
  buildWorkoutParserPrompt,
  mentionsMetrics,
  mentionsZones,
  parsedSessionSchema,
  parsedWorkoutSchema,
  parsedWorkoutToSteps,
  toSportType,
} from './workout-parser';

const CACHE_SIZE = 200;
const CACHE_TTL_MS = 60 * 60 * 1000;
// Only the references a percentage target can use.
const REFERENCE_METRICS = [
  METRIC_TYPE.HR_MAX,
  METRIC_TYPE.HR_REST,
  METRIC_TYPE.VMA,
  METRIC_TYPE.FTP_RUNNING,
  METRIC_TYPE.FTP_CYCLING,
  METRIC_TYPE.CRITICAL_POWER_RUNNING,
  METRIC_TYPE.CRITICAL_POWER_CYCLING,
];

export type WrittenWorkout = {
  steps: CreateWorkoutStepDto[];
  /** Only for a new session, whose sport was unknown. */
  name?: string;
  sport?: SPORT_TYPE;
};

/**
 * Turns a workout written in words ("15' calentar + 3x8' a 4:35/km...") into
 * structured steps with a small model and a minimal prompt, on the model the
 * user picked for written workouts. The same text for the same athlete,
 * context and model is answered from memory, without a model call. Nothing
 * is saved, and the coach memory is not touched.
 */
@Injectable()
export class WorkoutParserService {
  private readonly cache = new Map<
    string,
    { value: WrittenWorkout; expires: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: AiModelResolverService,
    private readonly ai: AiService,
  ) {}

  /** The user's model for written workouts (their key, else the instance's). */
  resolveModel(userId: number): Promise<ResolvedAiModel> {
    return this.resolver.resolveForUser(AiTask.WORKOUT_PARSER, userId);
  }

  /** `session`: also ask for a name and the sport. */
  protected async callModel(
    model: ResolvedAiModel,
    prompt: string,
    session: boolean,
  ): Promise<ParsedWorkout & Partial<ParsedSession>> {
    // An invalid answer may be fixed by another try (isRetryableAiError).
    return withRetry(
      () =>
        this.ai.generateObject(
          workoutParserAgent,
          model,
          prompt,
          session ? parsedSessionSchema : parsedWorkoutSchema,
          { timeoutMs: 60_000 },
        ),
      2,
      1000,
    );
  }

  /** The steps of a session whose sport is known. */
  async parse(
    input: { text: string; sport: string; athleteId?: number },
    model: ResolvedAiModel,
  ): Promise<CreateWorkoutStepDto[]> {
    return (await this.convert(input, model)).steps;
  }

  /** A new session from text alone: steps, a name and the sport. */
  parseSession(
    input: { text: string; athleteId?: number },
    model: ResolvedAiModel,
  ): Promise<WrittenWorkout> {
    return this.convert(input, model);
  }

  private async convert(
    input: { text: string; sport?: string; athleteId?: number },
    model: ResolvedAiModel,
  ): Promise<WrittenWorkout> {
    const text = input.text.trim().replace(/\s+/g, ' ');
    let zones: string | undefined;
    let zoneIds: number[] = [];
    let metrics: string | undefined;
    if (input.athleteId && mentionsZones(text)) {
      const athleteZones = await fetchAthleteZones(
        this.prisma,
        input.athleteId,
      );
      zoneIds = athleteZones.map((zone) => zone.trainingZoneId);
      zones =
        buildZonesContext(formatZonesByType(athleteZones), {
          sport: input.sport,
        }) || undefined;
    }
    if (input.athleteId && mentionsMetrics(text)) {
      const latest = getLatestMetrics(
        await fetchAthleteMetrics(this.prisma, input.athleteId),
      );
      metrics =
        REFERENCE_METRICS.filter((type) => latest[type] != null)
          .map((type) => `${type} ${latest[type]}`)
          .join(', ') || undefined;
    }
    const prompt = buildWorkoutParserPrompt({
      text,
      sport: input.sport,
      zones,
      metrics,
    });

    // The prompt holds every input, so it is the cache key, with the model.
    const key = createHash('sha256')
      .update(
        `${input.athleteId ?? 0}\n${model.provider}/${model.modelId}\n${prompt}`,
      )
      .digest('hex');
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return structuredClone(hit.value);

    const parsed = await this.callModel(model, prompt, !input.sport);
    const value: WrittenWorkout = {
      steps: parsedWorkoutToSteps(parsed, zoneIds),
    };
    if (!input.sport) {
      value.name = parsed.name?.trim().slice(0, 100) || undefined;
      value.sport = toSportType(parsed.sport);
    }
    this.cache.delete(key);
    this.cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    while (this.cache.size > CACHE_SIZE)
      this.cache.delete(this.cache.keys().next().value!);
    return structuredClone(value);
  }
}
