import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  AiPlanAthleteContext,
  AiPlanCheckFacts,
  AiPlanConflicts,
  AiPlanContextPreview,
  AiPlanContextRequest,
  AiPlanDraft,
  AiPlanIssue,
  AiPlanJobStatus,
  AiPlanRequest,
  AiPlanRuleNote,
  AiPlanRules,
  AiPlanUpcomingRace,
  AiPlanWeekSteps,
  AiPlanWeekStepsRequest,
  METRIC_TYPE,
  SEOPlanData,
  aiPlanDayOffset,
  aiPlanWeekCount,
  applyAiPlanRules,
  checkAiPlan,
  trainingPlanImportSchema,
} from '@openathlete/shared';

import { planGenerationAgent } from '../../../mastra/agents/plan-generation.agent';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import {
  buildZonesContext,
  fetchAthleteMetrics,
  fetchAthleteZones,
  formatZonesByType,
  resolveAiEventAthleteId,
  withRetry,
} from './event-ai-helpers';
import {
  AiPlanOutput,
  aiPlanOutputSchema,
  dayName,
  describeIssue,
  toImportPlan,
} from './plan-generation';
import { WorkoutParserService } from './workout-parser.service';

export const PLAN_GENERATION_QUEUE = 'plan-generation';

export type PlanGenerationJob = { userId: number; request: AiPlanRequest };

const DAY_MS = 86400000;
/** Recent training: eight weeks shown, the last four averaged. */
const HISTORY_WEEKS = 8;
const AVERAGE_WEEKS = 4;
/** Sessions of one week structured at the same time. */
const STEP_CONCURRENCY = 3;
const MODEL_TIMEOUT_MS = 10 * 60_000;
const REFERENCE_METRICS = [
  METRIC_TYPE.HR_MAX,
  METRIC_TYPE.HR_REST,
  METRIC_TYPE.VMA,
  METRIC_TYPE.FTP_RUNNING,
  METRIC_TYPE.FTP_CYCLING,
  METRIC_TYPE.CRITICAL_POWER_RUNNING,
  METRIC_TYPE.CRITICAL_POWER_CYCLING,
  METRIC_TYPE.VO2MAX,
];

type ModelAnswer = { object: AiPlanOutput | null; raw: string };

/** The instant a civil date starts in a time zone. */
function startOfDay(date: string, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const desired = new Date(`${date}T00:00:00Z`).getTime();
  let result = desired;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(result)).map((x) => [x.type, x.value]),
    );
    const rendered = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    if (rendered === desired) break;
    result += desired - rendered;
  }
  return new Date(result);
}

/** The civil date of an instant in a time zone, as YYYY-MM-DD. */
const civilDate = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Races in the window after the race date (other goals, the next season). */
const RACES_AFTER_DAYS = 28;
const RACES_LIMIT = 10;
/** How far ahead the goal race can be picked from the calendar. */
const UPCOMING_RACES_DAYS = 370;

/** What the context is built for: the athlete, the dates and the goal. */
type ContextInput = Pick<
  AiPlanContextRequest,
  'athleteId' | 'startDate' | 'raceDate' | 'timeZone' | 'goalEventId'
> & { goalName?: string };

const addDays = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/** The model's own text from a structured output error, nothing else. */
function rawModelText(error: unknown): string {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === 'object';
    depth++
  ) {
    const item = current as {
      details?: { value?: unknown };
      name?: string;
      text?: unknown;
      cause?: unknown;
    };
    const raw =
      item.details?.value ??
      (item.name === 'AI_NoObjectGeneratedError' ? item.text : undefined);
    if (typeof raw === 'string' && raw.length) return raw;
    current = item.cause;
  }
  return '';
}

const isOutputError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes('Structured output validation failed') ||
    error.name === 'AI_NoObjectGeneratedError' ||
    ('cause' in error &&
      error.cause instanceof Error &&
      error.cause.name === 'ZodError'));

/**
 * Drafts a training plan with AI for a coach to review: one structured call
 * for the whole plan, automatic checks, and one repair round when they find
 * problems. The draft is returned in the plan import format and nothing is
 * saved; the coach applies it through the import.
 */
@Injectable()
export class PlanGenerationService {
  private readonly logger = new Logger(PlanGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutParser: WorkoutParserService,
    @InjectQueue(PLAN_GENERATION_QUEUE)
    private readonly queue: Queue<PlanGenerationJob, AiPlanDraft>,
  ) {}

  /** Queues a draft: a long plan takes minutes, more than a request should. */
  async start(
    user: AuthUser,
    request: AiPlanRequest,
  ): Promise<AiPlanJobStatus> {
    await resolveAiEventAthleteId(this.prisma, user, request.athleteId);
    if (request.goalEventId)
      await this.goalEvent(request.athleteId, request.goalEventId);
    const job = await this.queue.add(
      'generate',
      { userId: user.userId, request },
      { jobId: randomUUID() },
    );
    return { jobId: job.id!, state: 'queued' };
  }

  async status(user: AuthUser, jobId: string): Promise<AiPlanJobStatus> {
    const job = await this.queue.getJob(jobId);
    // Drafts belong to whoever asked for them.
    if (!job || job.data.userId !== user.userId) throw new NotFoundException();
    const state = await job.getState();
    if (state === 'completed')
      return { jobId, state: 'done', draft: job.returnvalue };
    if (state === 'failed') return { jobId, state: 'failed' };
    if (state === 'active') {
      const stage = (job.progress as { stage?: AiPlanJobStatus['stage'] })
        ?.stage;
      return { jobId, state: 'running', stage: stage ?? 'generating' };
    }
    return { jobId, state: 'queued' };
  }

  /**
   * Structured steps for one week's sessions, from their descriptions. A
   * session that cannot be structured keeps its description only.
   */
  async weekSteps(
    user: AuthUser,
    request: AiPlanWeekStepsRequest,
  ): Promise<AiPlanWeekSteps> {
    const athleteId = await resolveAiEventAthleteId(
      this.prisma,
      user,
      request.athleteId,
    );
    const steps = await mapLimit(
      request.sessions,
      STEP_CONCURRENCY,
      async (session) => {
        try {
          const parsed = await this.workoutParser.parse({
            text: session.text,
            sport: session.sport,
            athleteId,
          });
          return parsed.length ? parsed : null;
        } catch (error) {
          this.logger.warn(
            `A session could not be structured: ${error instanceof Error ? error.name : 'error'}`,
          );
          return null;
        }
      },
    );
    return { steps };
  }

  /**
   * Competitions in the athlete's calendar from today on, to pick the goal
   * race from. Their goals fill in the form.
   */
  async upcomingRaces(
    user: AuthUser,
    athleteId: number,
  ): Promise<AiPlanUpcomingRace[]> {
    await resolveAiEventAthleteId(this.prisma, user, athleteId);
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        athleteId,
        type: 'COMPETITION',
        startDate: {
          gte: new Date(now.getTime() - DAY_MS),
          lt: new Date(now.getTime() + UPCOMING_RACES_DAYS * DAY_MS),
        },
      },
      select: {
        eventId: true,
        name: true,
        startDate: true,
        competition: {
          select: {
            sport: true,
            goalDistance: true,
            goalElevationGain: true,
            goalDuration: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
      take: 50,
    });
    return events.flatMap((event) =>
      event.competition
        ? [
            {
              eventId: event.eventId,
              name: event.name,
              startDate: event.startDate.toISOString(),
              sport: event.competition.sport as AiPlanUpcomingRace['sport'],
              distance: event.competition.goalDistance,
              elevationGain: event.competition.goalElevationGain,
              timeTarget: event.competition.goalDuration,
            },
          ]
        : [],
    );
  }

  /** Exactly what the AI will receive about the athlete, for the form. */
  async previewContext(
    user: AuthUser,
    input: AiPlanContextRequest,
  ): Promise<AiPlanContextPreview> {
    await resolveAiEventAthleteId(this.prisma, user, input.athleteId);
    const context = await this.athleteContext(input);
    return {
      athlete: context.athlete,
      zoneTypes: context.zoneTypes,
      conflicts: context.conflicts,
    };
  }

  /** A goal race from the calendar must be a competition of the athlete. */
  private async goalEvent(athleteId: number, eventId: number) {
    const event = await this.prisma.event.findUnique({
      where: { eventId },
      select: { eventId: true, athleteId: true, type: true },
    });
    if (!event || event.athleteId !== athleteId)
      throw new ForbiddenException('You cannot use this race');
    if (event.type !== 'COMPETITION')
      throw new BadRequestException('AI_PLAN_GOAL_NOT_RACE');
    return event.eventId;
  }

  /** Runs in the plan-generation job. */
  async generate(
    request: AiPlanRequest,
    onStage: (stage: 'repairing') => Promise<unknown> = async () => undefined,
  ): Promise<AiPlanDraft> {
    const context = await this.context(request);
    const first = await this.callModel(JSON.stringify(context.prompt));
    let result = this.evaluate(first, request, context.facts);
    if (!result.plan || result.problems.length) {
      await onStage('repairing');
      const second = await this.callModel(
        JSON.stringify({
          ...context.prompt,
          revision: {
            previousDraft: first.object ?? first.raw.slice(0, 60000),
            rules: result.rules,
            problems: result.problems,
          },
        }),
      );
      const revised = this.evaluate(second, request, context.facts);
      // Keep the first draft if the repair broke the format.
      if (revised.plan || !result.plan) result = revised;
    }
    return {
      plan: result.plan,
      issues: result.issues,
      facts: context.facts,
      rules: result.rules,
      ruleNotes: result.ruleNotes,
      conflicts: context.conflicts,
    };
  }

  private evaluate(
    answer: ModelAnswer,
    request: AiPlanRequest,
    facts: AiPlanCheckFacts,
  ): {
    plan: SEOPlanData | null;
    issues: AiPlanIssue[];
    problems: string[];
    rules: AiPlanRules;
    ruleNotes: AiPlanRuleNote[];
  } {
    // The model's rules, clamped to the safety bounds; the checks use them.
    const { rules, notes: ruleNotes } = applyAiPlanRules(
      answer.object?.rules ?? [],
    );
    if (!answer.object)
      return {
        plan: null,
        issues: [],
        rules,
        ruleNotes,
        problems: [
          'The answer did not match the required format. Return the complete plan.',
        ],
      };
    const parsed = trainingPlanImportSchema.safeParse(
      toImportPlan(answer.object, request),
    );
    if (!parsed.success)
      return {
        plan: null,
        issues: [],
        rules,
        ruleNotes,
        problems: parsed.error.issues
          .slice(0, 20)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      };
    const issues = checkAiPlan(parsed.data, facts, rules);
    return {
      plan: parsed.data,
      issues,
      rules,
      ruleNotes,
      problems: issues.map(describeIssue),
    };
  }

  protected async callModel(prompt: string): Promise<ModelAnswer> {
    try {
      const result = await withRetry(
        () =>
          planGenerationAgent.generate(prompt, {
            structuredOutput: { schema: aiPlanOutputSchema },
            abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
          }),
        2,
      );
      const parsed = aiPlanOutputSchema.safeParse(result.object);
      return {
        object: parsed.success ? parsed.data : null,
        raw: typeof result.text === 'string' ? result.text : '',
      };
    } catch (error) {
      // A malformed answer gets the repair round; provider errors fail the job.
      if (isOutputError(error))
        return { object: null, raw: rawModelText(error) };
      throw error;
    }
  }

  private async context(request: AiPlanRequest) {
    const raceDate = request.goal.date;
    const weeks = aiPlanWeekCount(request.startDate, raceDate);
    const context = await this.athleteContext({
      athleteId: request.athleteId,
      startDate: request.startDate,
      raceDate,
      timeZone: request.timeZone,
      goalEventId: request.goalEventId,
      goalName: request.goal.name,
    });
    const facts: AiPlanCheckFacts = {
      startDate: request.startDate,
      raceDate,
      weeks,
      sports: request.sports,
      trainingDays: request.trainingDays,
      weeklyHours: request.weeklyHours,
      injuries: context.athlete.injuries.length,
      zoneNumbers: context.zoneNumbers,
      metrics: context.metricTypes,
      recentWeeklyMinutes: context.athlete.recentWeeklyMinutes,
    };
    const prompt = {
      request: {
        goal: request.goal,
        sports: request.sports,
        weeklyHours: request.weeklyHours,
        methodology: request.methodology ?? null,
        methodologyNotes: request.methodologyNotes ?? null,
        constraints: request.constraints ?? null,
        language: request.language,
      },
      schedule: {
        weeks,
        weekStarts: Array.from({ length: weeks }, (_, k) =>
          addDays(request.startDate, k * 7),
        ),
        raceDate,
        raceWeekday: dayName(new Date(`${raceDate}T00:00:00Z`).getUTCDay()),
        trainingDays: request.trainingDays.map(dayName),
        longSessionDay:
          request.longSessionDay != null
            ? dayName(request.longSessionDay)
            : null,
      },
      athlete: context.athlete,
    };
    return { prompt, facts, conflicts: context.conflicts };
  }

  /**
   * What the AI receives about the athlete for these dates: recent training,
   * metrics, zones, injuries and the races in the plan window, plus what is
   * already in the calendar. The form shows the same object.
   */
  private async athleteContext(input: ContextInput): Promise<{
    athlete: AiPlanAthleteContext;
    metricTypes: METRIC_TYPE[];
    zoneNumbers: number[];
    zoneTypes: string[];
    conflicts: AiPlanConflicts;
  }> {
    const { athleteId, timeZone, startDate, raceDate } = input;
    const goalEventId = input.goalEventId
      ? await this.goalEvent(athleteId, input.goalEventId)
      : null;
    const start = startOfDay(startDate, timeZone);
    const end = startOfDay(addDays(raceDate, 1), timeZone);
    const now = new Date();
    const historyStart = new Date(now.getTime() - HISTORY_WEEKS * 7 * DAY_MS);
    const [metricRows, zones, injuries, activities, races, sessions, plans] =
      await Promise.all([
        fetchAthleteMetrics(this.prisma, athleteId),
        fetchAthleteZones(this.prisma, athleteId),
        this.prisma.athleteInjury.findMany({
          where: { athleteId, status: { not: 'RESOLVED' } },
          select: {
            location: true,
            painScore: true,
            status: true,
            context: true,
          },
          orderBy: { athleteInjuryId: 'asc' },
        }),
        this.prisma.event.findMany({
          where: {
            athleteId,
            type: 'ACTIVITY',
            startDate: { gte: historyStart, lte: now },
          },
          select: {
            startDate: true,
            activity: { select: { sport: true, movingTime: true } },
          },
        }),
        this.prisma.event.findMany({
          where: {
            athleteId,
            type: 'COMPETITION',
            startDate: {
              gte: start,
              lt: new Date(end.getTime() + RACES_AFTER_DAYS * DAY_MS),
            },
          },
          select: {
            eventId: true,
            name: true,
            startDate: true,
            competition: {
              select: {
                sport: true,
                description: true,
                goalDistance: true,
                goalElevationGain: true,
                goalDuration: true,
                planRaces: { select: { priority: true } },
              },
            },
          },
          orderBy: { startDate: 'asc' },
          take: RACES_LIMIT,
        }),
        this.prisma.event.count({
          where: {
            athleteId,
            type: 'TRAINING',
            startDate: { gte: start > now ? start : now, lt: end },
          },
        }),
        this.prisma.trainingPlan.findMany({
          where: {
            athleteId,
            status: { not: 'ARCHIVED' },
            startDate: { lt: end },
            endDate: { gte: start },
          },
          select: {
            trainingPlanId: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          },
          orderBy: { startDate: 'asc' },
        }),
      ]);

    // Weekly minutes, newest week first.
    const history = Array.from({ length: HISTORY_WEEKS }, () => ({
      minutes: 0,
      sessions: 0,
    }));
    const bySport: Record<string, number> = {};
    for (const event of activities) {
      if (!event.activity) continue;
      const week = Math.floor(
        (now.getTime() - event.startDate.getTime()) / (7 * DAY_MS),
      );
      if (week < 0 || week >= HISTORY_WEEKS) continue;
      const minutes = event.activity.movingTime / 60;
      history[week].minutes += minutes;
      history[week].sessions += 1;
      bySport[event.activity.sport] =
        (bySport[event.activity.sport] ?? 0) + minutes;
    }
    const recent = history.slice(0, AVERAGE_WEEKS);
    // No activity at all in four weeks reads as unknown, not as zero.
    const recentWeeklyMinutes = recent.some((week) => week.sessions)
      ? Math.round(
          recent.reduce((sum, week) => sum + week.minutes, 0) / AVERAGE_WEEKS,
        )
      : null;

    const latest = new Map<string, number>();
    for (const row of metricRows)
      if (!latest.has(row.type)) latest.set(row.type, row.value);
    const zoneNumbers = [
      ...new Set(
        zones.flatMap((zone) =>
          [...zone.name.matchAll(/\d+/g)].map((match) => Number(match[0])),
        ),
      ),
    ];
    // The goal is flagged, never listed again as another race. Without a
    // calendar pick, a race on the race day with the same name is the goal.
    const isGoal = (race: (typeof races)[number]) =>
      goalEventId
        ? race.eventId === goalEventId
        : !!input.goalName &&
          sameName(race.name, input.goalName) &&
          civilDate(race.startDate, timeZone) === raceDate;
    const athlete: AiPlanAthleteContext = {
      recentWeeklyMinutes,
      weeklyHistoryNewestFirst: history.map((week) => ({
        minutes: Math.round(week.minutes),
        sessions: week.sessions,
      })),
      minutesBySportLast8Weeks: Object.fromEntries(
        Object.entries(bySport).map(([sport, minutes]) => [
          sport,
          Math.round(minutes),
        ]),
      ),
      metrics: Object.fromEntries(
        REFERENCE_METRICS.filter((type) => latest.has(type)).map((type) => [
          type,
          latest.get(type)!,
        ]),
      ),
      zones:
        buildZonesContext(formatZonesByType(zones), { ids: false }) || null,
      injuries: injuries.map((injury) => ({
        ...injury,
        context: injury.context.slice(0, 300),
      })),
      races: races.map((race) => {
        const priorities = race.competition?.planRaces.map(
          (link) => link.priority,
        );
        return {
          name: race.name,
          date: race.startDate.toISOString(),
          dayInPlan: aiPlanDayOffset(
            startDate,
            civilDate(race.startDate, timeZone),
          ),
          sport: (race.competition?.sport ??
            null) as AiPlanAthleteContext['races'][number]['sport'],
          distance: race.competition?.goalDistance ?? null,
          elevationGain: race.competition?.goalElevationGain ?? null,
          timeTarget: race.competition?.goalDuration ?? null,
          description:
            race.competition?.description.trim().slice(0, 300) || null,
          priority: priorities?.includes('TARGET')
            ? 'TARGET'
            : priorities?.length
              ? 'PREPARATORY'
              : null,
          goal: isGoal(race),
        };
      }),
    };
    return {
      athlete,
      metricTypes: [...latest.keys()] as METRIC_TYPE[],
      zoneNumbers,
      zoneTypes: [...new Set(zones.map((zone) => zone.type))],
      conflicts: {
        sessions,
        plans: plans.map((plan) => ({
          ...plan,
          startDate: plan.startDate.toISOString(),
          endDate: plan.endDate.toISOString(),
        })),
      },
    };
  }
}
