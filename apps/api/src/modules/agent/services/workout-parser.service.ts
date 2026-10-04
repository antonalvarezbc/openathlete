import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  CreateWorkoutStepDto,
  METRIC_TYPE,
  SPORT_TYPE,
} from '@openathlete/shared';

import { workoutParserAgent } from 'src/mastra/agents';
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
 * structured steps with a small model and a minimal prompt. The same text for
 * the same athlete and context is answered from memory, without a model call.
 * Nothing is saved, and the coach memory is not touched.
 */
@Injectable()
export class WorkoutParserService {
  private readonly cache = new Map<
    string,
    { value: WrittenWorkout; expires: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** `session`: also ask for a name and the sport. */
  protected async callModel(
    prompt: string,
    session: boolean,
  ): Promise<ParsedWorkout & Partial<ParsedSession>> {
    const result = await withRetry(
      () =>
        workoutParserAgent.generate(prompt, {
          structuredOutput: {
            schema: session ? parsedSessionSchema : parsedWorkoutSchema,
          },
          abortSignal: AbortSignal.timeout(60_000),
        }),
      2,
    );
    if (!result.object) throw new Error('No structured workout returned');
    return result.object;
  }

  /** The steps of a session whose sport is known. */
  async parse(input: {
    text: string;
    sport: string;
    athleteId?: number;
  }): Promise<CreateWorkoutStepDto[]> {
    return (await this.convert(input)).steps;
  }

  /** A new session from text alone: steps, a name and the sport. */
  parseSession(input: {
    text: string;
    athleteId?: number;
  }): Promise<WrittenWorkout> {
    return this.convert(input);
  }

  private async convert(input: {
    text: string;
    sport?: string;
    athleteId?: number;
  }): Promise<WrittenWorkout> {
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

    // The prompt holds every input, so it is the cache key.
    const key = createHash('sha256')
      .update(`${input.athleteId ?? 0}\n${prompt}`)
      .digest('hex');
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return structuredClone(hit.value);

    const parsed = await this.callModel(prompt, !input.sport);
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
