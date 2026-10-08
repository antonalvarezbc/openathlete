import { z } from 'zod';

import { NotFoundException } from '@nestjs/common';

import {
  CompressedActivityStream,
  EventWeatherSampleDto,
  SPORT_TYPE,
  WorkoutTargetZone,
} from '@openathlete/shared';

import { AuthUser } from '../auth/decorators/user.decorator';
import { uncompressActivityStream } from '../core/helpers/activity-stream';
import { accessibleAthleteConditions } from '../core/helpers/plan-access';
import { PrismaService } from '../prisma/services/prisma.service';
import {
  clipText,
  isoDay,
  resolveAthleteId,
  utcWeekStart,
} from './ai-tools.access';
import {
  MAX_SEGMENTS,
  formatPace,
  formatSegments,
  formatSteps,
  heartRateZoneRanges,
  speedFields,
  streamSplits,
  summarizeWeather,
  targetMetricTypes,
  timeInHeartRateZones,
} from './ai-tools.activity';
import { AiTool, defineTool } from './ai-tools.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const athleteIdInput = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(
    'Athlete ID (from list_athletes). Omit for your own athlete profile.',
  );
const dayInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Date as YYYY-MM-DD (UTC)');

const round = (value: number | null | undefined, digits = 1) =>
  value == null ? undefined : Number(value.toFixed(digits));
const km = (meters: number | null | undefined) =>
  meters == null ? undefined : round(meters / 1000, 2);

const activitySelect = {
  eventActivityId: true,
  sport: true,
  movingTime: true,
  distance: true,
  elevationGain: true,
  averageHeartrate: true,
  maxHeartrate: true,
  averageWatts: true,
  rpe: true,
  description: true,
} as const;

type ActivityRow = {
  eventActivityId: number;
  sport: string;
  movingTime: number;
  distance: number;
  elevationGain: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  rpe: number | null;
  description: string;
};

const activitySummary = (activity: ActivityRow, load?: number) => ({
  sport: activity.sport,
  movingTimeSeconds: activity.movingTime,
  distanceKm: km(activity.distance),
  elevationGainM: round(activity.elevationGain, 0),
  averageHeartrate: round(activity.averageHeartrate, 0),
  maxHeartrate: round(activity.maxHeartrate, 0),
  averagePowerW: round(activity.averageWatts, 0),
  rpe: activity.rpe ?? undefined,
  trimp: round(load, 0),
  comment: clipText(activity.description, 300),
});

/** Actual TRIMP per activity (eventActivityId → value). */
async function activityLoads(
  prisma: PrismaService,
  athleteId: number,
  eventActivityIds: number[],
) {
  if (!eventActivityIds.length) return new Map<number, number>();
  const entries = await prisma.trainingLoadEntry.findMany({
    where: {
      activityId: { in: eventActivityIds },
      calculation: { athleteId, type: 'TRIMP' },
    },
    select: { activityId: true, value: true },
  });
  return new Map(entries.map((entry) => [entry.activityId, entry.value]));
}

/** Latest value of each metric type (type → value). */
async function latestMetrics(
  prisma: PrismaService,
  athleteId: number,
  types: string[],
) {
  if (!types.length) return {};
  const rows = await prisma.athleteMetric.findMany({
    where: { athleteId, type: { in: types as never[] } },
    orderBy: { date: 'desc' },
    distinct: ['type'],
    select: { type: true, value: true },
  });
  return Object.fromEntries(rows.map((row) => [row.type, row.value]));
}

const zoneSelect = {
  trainingZoneId: true,
  name: true,
  type: true,
  index: true,
  values: { select: { min: true, max: true, sports: true } },
} as const;

/** Weekly load fields, with the planned sessions that have no estimate. */
function weekLoad(
  week: {
    actualLoad: number;
    estimatedLoad: number;
    totalLoad: number;
    recommendedMin: number;
    recommendedMax: number;
    acwr?: number;
    acwrStatus?: string;
  },
  withoutEstimate?: { sessions: number; seconds: number },
) {
  return {
    actual: round(week.actualLoad, 0),
    plannedPending: round(week.estimatedLoad, 0),
    total: round(week.totalLoad, 0),
    recommendedMin: round(week.recommendedMin, 0),
    recommendedMax: round(week.recommendedMax, 0),
    acwr: round(week.acwr, 2),
    acwrStatus: week.acwrStatus,
    ...(withoutEstimate?.sessions && {
      plannedSessionsWithoutEstimate: withoutEstimate.sessions,
      plannedSecondsWithoutEstimate: withoutEstimate.seconds,
    }),
  };
}

const LOAD_NOTE =
  'plannedPending only counts planned sessions with a load estimate; plannedSessionsWithoutEstimate are not done and have none. No acwr until three weeks of load precede the week.';

const listAthletes = defineTool({
  name: 'list_athletes',
  description:
    'Athletes you can read: your own athlete profile and the athletes you coach. Use the athleteId with the other tools.',
  input: z.object({}).strict(),
  async run({ prisma }, user: AuthUser) {
    const conditions = accessibleAthleteConditions(user);
    if (!conditions.length) return { athletes: [] };
    // The rule resolveAthleteId applies, so every listed athlete can be read.
    const athletes = await prisma.athlete.findMany({
      where: { OR: conditions },
      orderBy: { athleteId: 'asc' },
      take: 200,
      select: {
        athleteId: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    return {
      athletes: athletes
        .map((athlete) => ({
          athleteId: athlete.athleteId,
          name: `${athlete.user.firstName} ${athlete.user.lastName}`,
          self: athlete.userId === user.userId,
        }))
        .sort((a, b) => Number(b.self) - Number(a.self)),
    };
  },
});

const getWeek = defineTool({
  name: 'get_week',
  description:
    'One Monday–Sunday week of an athlete: planned sessions (goals, estimated load, done or not), completed activities (summary, TRIMP), notes, plan week context (theme, targets, cycle phase) and weekly load against the recommended range.',
  input: z
    .object({
      athleteId: athleteIdInput,
      date: dayInput.describe('Any day of the week, YYYY-MM-DD'),
    })
    .strict(),
  async run({ prisma, trainingLoad, weekPlanning }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const start = utcWeekStart(new Date(`${input.date}T00:00:00Z`));
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const [events, overview, loadSummary] = await Promise.all([
      prisma.event.findMany({
        where: { athleteId, startDate: { gte: start, lt: end } },
        orderBy: { startDate: 'asc' },
        take: 80,
        select: {
          eventId: true,
          type: true,
          name: true,
          startDate: true,
          training: {
            select: {
              sport: true,
              description: true,
              goalDuration: true,
              goalDistance: true,
              goalElevationGain: true,
              goalRpe: true,
              estimatedLoad: true,
              relatedActivityId: true,
            },
          },
          competition: {
            select: {
              sport: true,
              goalDuration: true,
              goalDistance: true,
              goalElevationGain: true,
              relatedActivityId: true,
            },
          },
          note: { select: { description: true } },
          activity: { select: activitySelect },
        },
      }),
      weekPlanning.overview(user, start, athleteId),
      trainingLoad.getWeeklyTrimpSummary(user, start, end, athleteId),
    ]);
    const week = loadSummary.find(
      (summary) => isoDay(new Date(summary.weekStart)) === isoDay(start),
    );
    const withoutEstimate = events.filter(
      (event) =>
        event.training &&
        !event.training.relatedActivityId &&
        event.training.estimatedLoad == null,
    );
    return {
      athleteId,
      weekStart: isoDay(start),
      weekEnd: isoDay(new Date(end.getTime() - DAY_MS)),
      planWeek: overview.planWeek && {
        plan: overview.planWeek.plan.name,
        weekNumber: overview.planWeek.weekNumber,
        weekCount: overview.planWeek.plan.weekCount,
        theme: overview.planWeek.theme ?? undefined,
        targetVolumeSeconds: overview.planWeek.targetVolume ?? undefined,
        targetLoad: overview.planWeek.targetLoad ?? undefined,
        cycle: overview.planWeek.cycle.name,
        phase: overview.planWeek.cycle.phase ?? undefined,
        races: overview.planWeek.races,
      },
      load:
        week &&
        weekLoad(week, {
          sessions: withoutEstimate.length,
          seconds: withoutEstimate.reduce(
            (sum, event) => sum + (event.training?.goalDuration ?? 0),
            0,
          ),
        }),
      ...(week && { loadNote: LOAD_NOTE }),
      events: events.map((event) => ({
        eventId: event.eventId,
        type: event.type,
        name: event.name,
        date: event.startDate.toISOString(),
        ...(event.training && {
          sport: event.training.sport,
          goalDurationSeconds: event.training.goalDuration ?? undefined,
          goalDistanceKm: km(event.training.goalDistance),
          goalElevationM: round(event.training.goalElevationGain, 0),
          goalRpe:
            event.training.goalRpe == null
              ? undefined
              : round(event.training.goalRpe * 10, 0),
          estimatedLoad: round(event.training.estimatedLoad, 0),
          done: !!event.training.relatedActivityId,
          description: clipText(event.training.description, 300),
        }),
        ...(event.competition && {
          sport: event.competition.sport,
          goalDurationSeconds: event.competition.goalDuration ?? undefined,
          goalDistanceKm: km(event.competition.goalDistance),
          goalElevationM: round(event.competition.goalElevationGain, 0),
          done: !!event.competition.relatedActivityId,
        }),
        ...(event.note && { note: clipText(event.note.description, 300) }),
        ...(event.activity &&
          activitySummary(
            event.activity,
            overview.activityLoads[event.eventId],
          )),
      })),
    };
  },
});

const searchActivities = defineTool({
  name: 'search_activities',
  description:
    'Completed activities of an athlete, newest first, with summary metrics and TRIMP. Filter by date range, sport, minimum distance or elevation, or text in the name/comment.',
  input: z
    .object({
      athleteId: athleteIdInput,
      from: dayInput.optional(),
      to: dayInput.optional(),
      sport: z
        .string()
        .max(40)
        .optional()
        .describe('Sport type, e.g. RUNNING, TRAIL_RUNNING, CYCLING'),
      minDistanceKm: z.number().min(0).max(1000).optional(),
      minElevationM: z.number().min(0).max(20000).optional(),
      text: z.string().trim().max(100).optional(),
      limit: z.number().int().min(1).max(30).default(15),
    })
    .strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const events = await prisma.event.findMany({
      where: {
        athleteId,
        type: 'ACTIVITY',
        startDate: {
          ...(input.from && { gte: new Date(`${input.from}T00:00:00Z`) }),
          // `to` is inclusive: everything before the next day.
          ...(input.to && {
            lt: new Date(new Date(`${input.to}T00:00:00Z`).getTime() + DAY_MS),
          }),
        },
        ...(input.text && {
          OR: [
            { name: { contains: input.text, mode: 'insensitive' as const } },
            {
              activity: {
                description: {
                  contains: input.text,
                  mode: 'insensitive' as const,
                },
              },
            },
          ],
        }),
        activity: {
          ...(input.sport && { sport: input.sport as never }),
          ...(input.minDistanceKm != null && {
            distance: { gte: input.minDistanceKm * 1000 },
          }),
          ...(input.minElevationM != null && {
            elevationGain: { gte: input.minElevationM },
          }),
        },
      },
      orderBy: { startDate: 'desc' },
      take: input.limit,
      select: {
        eventId: true,
        name: true,
        startDate: true,
        activity: { select: activitySelect },
      },
    });
    const loads = await activityLoads(
      prisma,
      athleteId,
      events.flatMap((event) =>
        event.activity ? [event.activity.eventActivityId] : [],
      ),
    );
    return {
      athleteId,
      count: events.length,
      activities: events.map((event) => ({
        eventId: event.eventId,
        name: event.name,
        date: event.startDate.toISOString(),
        ...(event.activity &&
          activitySummary(
            event.activity,
            loads.get(event.activity.eventActivityId),
          )),
      })),
    };
  },
});

const targetSelect = {
  targetType: true,
  targetMin: true,
  targetMax: true,
  targetValue: true,
  metricType: true,
  zoneReference: true,
} as const;
const leafStepSelect = {
  stepType: true,
  name: true,
  notes: true,
  durationType: true,
  durationValue: true,
  targets: { select: targetSelect },
} as const;
// Repeats nest at most twice in the workout editor
const stepSelect = {
  ...leafStepSelect,
  repeatBlock: {
    select: {
      repetitions: true,
      childSteps: {
        orderBy: { orderIndex: 'asc' },
        select: {
          ...leafStepSelect,
          repeatBlock: {
            select: {
              repetitions: true,
              childSteps: {
                orderBy: { orderIndex: 'asc' },
                select: leafStepSelect,
              },
            },
          },
        },
      },
    },
  },
} as const;

const getActivity = defineTool({
  name: 'get_activity',
  description:
    "Details of one completed activity: summary metrics, TRIMP, athlete comment, answered feedback questions, laps as recorded (or 1 km / 5 km splits computed from the recording when there are none), time in the athlete's heart-rate zones, weather, and the planned session it fulfilled with its workout steps and targets.",
  input: z.object({ eventId: z.number().int().positive() }).strict(),
  async run({ prisma }, user, input) {
    const event = await prisma.event.findUnique({
      where: { eventId: input.eventId },
      select: {
        eventId: true,
        athleteId: true,
        type: true,
        name: true,
        startDate: true,
        endDate: true,
        activity: {
          select: {
            ...activitySelect,
            averageSpeed: true,
            averageGapSpeed: true,
            averageCadence: true,
            stream: true,
            weather: { select: { samples: true } },
            segments: {
              orderBy: { orderIndex: 'asc' },
              // One more than shown, to tell when laps were left out
              take: MAX_SEGMENTS + 1,
              select: {
                segmentType: true,
                name: true,
                orderIndex: true,
                startTimeSeconds: true,
                endTimeSeconds: true,
                distance: true,
                elevationGain: true,
                movingTime: true,
                averageSpeed: true,
                averageGapSpeed: true,
                averageCadence: true,
                averageWatts: true,
                averageHeartrate: true,
                maxHeartrate: true,
                workoutStep: { select: { name: true, stepType: true } },
              },
            },
            feedbackQuestions: {
              where: { answerText: { not: null } },
              select: { questionText: true, answerText: true },
              take: 10,
            },
            relatedTraining: {
              select: {
                sport: true,
                goalDuration: true,
                goalDistance: true,
                goalElevationGain: true,
                goalRpe: true,
                description: true,
                event: { select: { name: true } },
                workout: {
                  select: {
                    steps: {
                      where: { repeatParentId: null },
                      orderBy: { orderIndex: 'asc' },
                      select: stepSelect,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!event?.activity || !event.athleteId || event.type !== 'ACTIVITY')
      throw new NotFoundException('Activity not found');
    const athleteId = await resolveAthleteId(prisma, user, event.athleteId);
    const { activity } = event;
    const planned = activity.relatedTraining;
    const steps = planned?.workout?.steps ?? [];
    const [loads, zones, metrics] = await Promise.all([
      activityLoads(prisma, athleteId, [activity.eventActivityId]),
      prisma.trainingZone.findMany({
        where: { athleteId },
        orderBy: { index: 'asc' },
        select: zoneSelect,
      }),
      latestMetrics(prisma, athleteId, targetMetricTypes(steps)),
    ]);
    const stream = activity.stream
      ? uncompressActivityStream(activity.stream as CompressedActivityStream)
      : undefined;
    const segments = activity.segments.slice(0, MAX_SEGMENTS);
    const splits =
      !segments.length && stream ? streamSplits(activity.sport, stream) : [];
    const targetZones = zones as unknown as WorkoutTargetZone[];
    return {
      eventId: event.eventId,
      athleteId,
      name: event.name,
      start: event.startDate.toISOString(),
      end: event.endDate.toISOString(),
      ...activitySummary(activity, loads.get(activity.eventActivityId)),
      averageSpeedMps: round(activity.averageSpeed, 2),
      ...speedFields(activity.sport, activity.averageSpeed),
      averageCadence: round(activity.averageCadence, 0),
      feedback: activity.feedbackQuestions.map((q) => ({
        question: clipText(q.questionText, 200),
        answer: clipText(q.answerText, 400),
      })),
      ...(segments.length && {
        laps: formatSegments(activity.sport, segments, activity.averageCadence),
      }),
      ...(activity.segments.length > MAX_SEGMENTS && { lapsTruncated: true }),
      ...(splits.length && { splits }),
      heartRateZones:
        stream &&
        timeInHeartRateZones(
          stream,
          heartRateZoneRanges(zones, activity.sport),
        ),
      weather:
        activity.weather &&
        summarizeWeather(
          activity.weather.samples as unknown as EventWeatherSampleDto[],
        ),
      plannedSession: planned && {
        name: planned.event.name,
        goalDurationSeconds: planned.goalDuration ?? undefined,
        goalDistanceKm: km(planned.goalDistance),
        goalElevationM: round(planned.goalElevationGain, 0),
        goalRpe:
          planned.goalRpe == null ? undefined : round(planned.goalRpe * 10, 0),
        description: clipText(planned.description, 300),
        ...(steps.length && {
          steps: formatSteps(steps, {
            zones: targetZones,
            metrics,
            sport: planned.sport,
          }),
        }),
      },
    };
  },
});

const getTrainingLoad = defineTool({
  name: 'get_training_load',
  description:
    'Weekly training load (TRIMP) of an athlete over several weeks: actual, pending planned load, planned sessions without a load estimate, recommended range and ACWR with its risk status (none until three weeks of load precede the week).',
  input: z
    .object({
      athleteId: athleteIdInput,
      weeks: z.number().int().min(1).max(26).default(8),
      until: dayInput.optional().describe('Last day included (default today)'),
    })
    .strict(),
  async run({ prisma, trainingLoad }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const lastWeek = utcWeekStart(
      input.until ? new Date(`${input.until}T00:00:00Z`) : new Date(),
    );
    const first = new Date(lastWeek.getTime() - (input.weeks - 1) * 7 * DAY_MS);
    const end = new Date(lastWeek.getTime() + 7 * DAY_MS - 1);
    const [summaries, unestimated] = await Promise.all([
      trainingLoad.getWeeklyTrimpSummary(user, first, end, athleteId),
      prisma.eventTraining.findMany({
        where: {
          estimatedLoad: null,
          relatedActivityId: null,
          event: {
            athleteId,
            type: 'TRAINING',
            startDate: { gte: first, lte: end },
          },
        },
        select: { goalDuration: true, event: { select: { startDate: true } } },
      }),
    ]);
    const withoutEstimate = new Map<
      string,
      { sessions: number; seconds: number }
    >();
    for (const training of unestimated) {
      const key = isoDay(utcWeekStart(training.event.startDate));
      const week = withoutEstimate.get(key) ?? { sessions: 0, seconds: 0 };
      week.sessions += 1;
      week.seconds += training.goalDuration ?? 0;
      withoutEstimate.set(key, week);
    }
    return {
      athleteId,
      note: LOAD_NOTE,
      weeks: summaries
        .filter((s) => {
          const start = new Date(s.weekStart).getTime();
          return start >= first.getTime() && start <= lastWeek.getTime();
        })
        .map((s) => {
          const weekStart = isoDay(new Date(s.weekStart));
          return {
            weekStart,
            ...weekLoad(s, withoutEstimate.get(weekStart)),
          };
        }),
    };
  },
});

// Readiness signals most devices record; others can be asked for by type
const DEFAULT_WELLNESS_TYPES = [
  'HRV_LAST_NIGHT_AVG',
  'RMSSD',
  'HR_REST',
  'SLEEP_DURATION',
  'SLEEP_SCORE',
  'STRESS_AVERAGE',
  'BODY_BATTERY_CHARGED',
  'HOOPER_INDEX',
  'WEIGHT',
  'VO2MAX',
];
const MAX_WELLNESS_ROWS = 1500;

const getWellness = defineTool({
  name: 'get_wellness',
  description:
    "Daily wellness and body metrics of an athlete, one row per day, newest first, with each metric's 7-day and period averages and range. By default the readiness metrics (HRV, resting HR, sleep, stress, body battery, Hooper index, weight, VO2max); availableTypes lists every other metric recorded, to ask for by type. Missing values are unknown, not zero.",
  input: z
    .object({
      athleteId: athleteIdInput,
      days: z.number().int().min(1).max(90).default(14),
      types: z
        .array(z.string().max(40))
        .min(1)
        .max(15)
        .optional()
        .describe('Metric types, e.g. ["HR_REST","RMSSD","SLEEP_SCORE"]'),
    })
    .strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const since = new Date(Date.now() - input.days * DAY_MS);
    const types = input.types ?? DEFAULT_WELLNESS_TYPES;
    const [metrics, recorded] = await Promise.all([
      prisma.athleteMetric.findMany({
        where: {
          athleteId,
          date: { gte: since },
          type: { in: types as never[] },
        },
        orderBy: { date: 'desc' },
        take: MAX_WELLNESS_ROWS,
        select: { type: true, date: true, value: true },
      }),
      prisma.athleteMetric.groupBy({
        by: ['type'],
        where: { athleteId, date: { gte: since } },
      }),
    ]);
    const days = new Map<string, Record<string, number | string>>();
    const series = new Map<string, { date: string; value: number }[]>();
    for (const metric of metrics) {
      const date = isoDay(metric.date);
      const value = round(metric.value, 2)!;
      const day = days.get(date) ?? { date };
      days.set(date, day);
      // Several readings on one day: the latest one wins
      if (metric.type in day) continue;
      day[metric.type] = value;
      series.set(metric.type, [
        ...(series.get(metric.type) ?? []),
        { date, value },
      ]);
    }
    const average = (values: number[]) =>
      round(values.reduce((sum, v) => sum + v, 0) / values.length, 1);
    const baselines = Object.fromEntries(
      [...series].map(([type, points]) => {
        // Points are newest first; the 7 days run back from the latest one
        const latest = new Date(`${points[0].date}T00:00:00Z`).getTime();
        const week = points.filter(
          (point) =>
            latest - new Date(`${point.date}T00:00:00Z`).getTime() < 7 * DAY_MS,
        );
        const values = points.map((point) => point.value);
        return [
          type,
          {
            last7DaysAvg: average(week.map((point) => point.value)),
            periodAvg: average(values),
            periodMin: Math.min(...values),
            periodMax: Math.max(...values),
            days: values.length,
          },
        ];
      }),
    );
    return {
      athleteId,
      since: isoDay(since),
      types,
      days: [...days.values()],
      baselines,
      availableTypes: recorded.map((row) => row.type).sort(),
      ...(metrics.length === MAX_WELLNESS_ROWS && { truncated: true }),
    };
  },
});

const getInjuries = defineTool({
  name: 'get_injuries',
  description:
    'Injury log of an athlete: location, pain out of 10, status (WORSENING, STABLE, IMPROVING, RESOLVED) and context.',
  input: z
    .object({
      athleteId: athleteIdInput,
      includeResolved: z.boolean().default(false),
    })
    .strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const injuries = await prisma.athleteInjury.findMany({
      where: {
        athleteId,
        ...(!input.includeResolved && { status: { not: 'RESOLVED' } }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        location: true,
        painScore: true,
        status: true,
        context: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      athleteId,
      injuries: injuries.map((injury) => ({
        location: injury.location,
        // Stored on a 0-1 scale.
        painOutOf10: round(injury.painScore * 10, 1),
        status: injury.status,
        context: clipText(injury.context, 300),
        reported: isoDay(injury.createdAt),
        updated: isoDay(injury.updatedAt),
      })),
    };
  },
});

const getPlans = defineTool({
  name: 'get_plans',
  description:
    'Training plans of an athlete with their cycles (phase) and weeks (dates, theme, target volume and load, number of sessions), plus linked target and preparation races.',
  input: z
    .object({
      athleteId: athleteIdInput,
      includeArchived: z.boolean().default(false),
    })
    .strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const plans = await prisma.trainingPlan.findMany({
      where: {
        athleteId,
        ...(!input.includeArchived && { status: { not: 'ARCHIVED' } }),
      },
      orderBy: { startDate: 'desc' },
      take: 5,
      select: {
        trainingPlanId: true,
        name: true,
        goal: true,
        status: true,
        startDate: true,
        endDate: true,
        races: {
          select: {
            priority: true,
            competition: {
              select: { event: { select: { name: true, startDate: true } } },
            },
          },
        },
        cycles: {
          orderBy: { startDate: 'asc' },
          select: {
            name: true,
            phase: true,
            weeks: {
              orderBy: { startDate: 'asc' },
              select: {
                weekNumber: true,
                startDate: true,
                endDate: true,
                theme: true,
                targetVolume: true,
                targetLoad: true,
                _count: { select: { sessions: true } },
              },
            },
          },
        },
      },
    });
    return {
      athleteId,
      plans: plans.map((plan) => ({
        trainingPlanId: plan.trainingPlanId,
        name: plan.name,
        goal: clipText(plan.goal, 300),
        status: plan.status,
        start: isoDay(plan.startDate),
        end: isoDay(plan.endDate),
        races: plan.races.map((race) => ({
          name: race.competition.event.name,
          date: isoDay(race.competition.event.startDate),
          priority: race.priority,
        })),
        cycles: plan.cycles.map((cycle) => ({
          name: cycle.name,
          phase: cycle.phase ?? undefined,
          weeks: cycle.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            start: isoDay(week.startDate),
            end: isoDay(week.endDate),
            theme: week.theme ?? undefined,
            targetVolumeSeconds: week.targetVolume ?? undefined,
            targetLoad: round(week.targetLoad, 0),
            sessions: week._count.sessions,
          })),
        })),
      })),
    };
  },
});

const PROFILE_METRICS = [
  'HR_MAX',
  'HR_REST',
  'VO2MAX',
  'VO2MAX_CYCLING',
  'VMA',
  'FTP_RUNNING',
  'FTP_CYCLING',
  'CRITICAL_POWER_RUNNING',
  'CRITICAL_POWER_CYCLING',
  'WEIGHT',
  'HEIGHT',
];

/** "132-142 bpm", "200-240 W" or "4:30-5:00/km" (pace zones are min/km). */
function zoneRange(type: string, min: number, max: number) {
  if (type === 'PACE')
    return `${formatPace(min * 60)}-${formatPace(max * 60)}/km`;
  const unit = type === 'HEARTRATE' ? 'bpm' : type === 'POWER' ? 'W' : '';
  return `${Math.round(min)}-${Math.round(max)} ${unit}`.trim();
}

const ALL_SPORTS = Object.values(SPORT_TYPE) as string[];

/**
 * The sports a zone range applies to, short: zones created for every sport
 * list all of them, which says nothing and fills the answer.
 */
function zoneSports(sports: string[]) {
  const missing = ALL_SPORTS.filter((sport) => !sports.includes(sport));
  if (!sports.length || !missing.length) return 'all';
  return missing.length < sports.length
    ? `all except ${missing.join(', ')}`
    : sports;
}

const getAthleteProfile = defineTool({
  name: 'get_athlete_profile',
  description:
    "An athlete's reference values to judge intensity: training zones (heart rate, power, pace) and the sports they apply to, maximum and resting heart rate, and the latest fitness metrics (VO2max, VMA, FTP, critical power, weight), each with its date.",
  input: z.object({ athleteId: athleteIdInput }).strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const [athlete, zones, metrics] = await Promise.all([
      prisma.athlete.findUnique({
        where: { athleteId },
        select: {
          user: { select: { firstName: true, lastName: true, gender: true } },
        },
      }),
      prisma.trainingZone.findMany({
        where: { athleteId },
        orderBy: [{ type: 'asc' }, { index: 'asc' }],
        select: { ...zoneSelect, description: true },
      }),
      prisma.athleteMetric.findMany({
        where: { athleteId, type: { in: PROFILE_METRICS as never[] } },
        orderBy: { date: 'desc' },
        distinct: ['type'],
        select: { type: true, value: true, date: true },
      }),
    ]);
    return {
      athleteId,
      name: athlete && `${athlete.user.firstName} ${athlete.user.lastName}`,
      gender: athlete?.user.gender ?? undefined,
      metrics: metrics.map((metric) => ({
        type: metric.type,
        value: round(metric.value, 1),
        date: isoDay(metric.date),
      })),
      zones: zones.map((zone) => ({
        type: zone.type,
        name: zone.name,
        description: clipText(zone.description, 100),
        ranges: zone.values.map((value) => ({
          range: zoneRange(zone.type, value.min, value.max),
          sports: zoneSports(value.sports),
        })),
      })),
      ...(!zones.length && { zonesNote: 'No training zones configured' }),
    };
  },
});

const RECORD_TYPES = ['SPEED', 'POWER', 'HEARTRATE', 'ELEVATION_GAIN'] as const;

/** "1:23:45" or "23:45". */
const formatDuration = (seconds: number) => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const getRecords = defineTool({
  name: 'get_records',
  description:
    'Personal records of an athlete in one sport, with the activity each comes from: best times over distances (400 m to 100 km, type SPEED), best power and heart rate held over durations, and most climbing over distances. Optional date range, e.g. to compare seasons.',
  input: z
    .object({
      athleteId: athleteIdInput,
      sport: z
        .string()
        .max(40)
        .optional()
        .describe(
          'Sport type, e.g. RUNNING. Default: the sport with most records',
        ),
      types: z.array(z.enum(RECORD_TYPES)).min(1).max(4).default(['SPEED']),
      from: dayInput.optional(),
      to: dayInput.optional(),
    })
    .strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const sports = await prisma.eventActivity.groupBy({
      by: ['sport'],
      where: { records: { some: { athleteId } } },
      _count: { sport: true },
      orderBy: { _count: { sport: 'desc' } },
    });
    const sport = input.sport ?? sports[0]?.sport;
    const sportsWithRecords = sports.map((row) => row.sport);
    if (!sport) return { athleteId, sportsWithRecords, records: [] };
    const records = await prisma.record.findMany({
      where: {
        athleteId,
        type: { in: [...input.types] },
        eventActivity: { sport: sport as never },
        ...((input.from || input.to) && {
          date: {
            ...(input.from && { gte: new Date(`${input.from}T00:00:00Z`) }),
            ...(input.to && {
              lt: new Date(
                new Date(`${input.to}T00:00:00Z`).getTime() + DAY_MS,
              ),
            }),
          },
        }),
      },
      select: {
        type: true,
        distance: true,
        duration: true,
        value: true,
        date: true,
        eventActivity: {
          select: { event: { select: { eventId: true, name: true } } },
        },
      },
    });
    const best = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const key = `${record.type}:${record.distance ?? ''}:${record.duration ?? ''}`;
      const current = best.get(key);
      // Speed records hold the time over the distance: lower is better
      const better =
        !current ||
        (record.type === 'SPEED'
          ? record.value < current.value
          : record.value > current.value);
      if (better) best.set(key, record);
    }
    const order = (type: string) => RECORD_TYPES.indexOf(type as never);
    return {
      athleteId,
      sport,
      sportsWithRecords,
      records: [...best.values()]
        .sort(
          (a, b) =>
            order(a.type) - order(b.type) ||
            (a.distance ?? a.duration ?? 0) - (b.distance ?? b.duration ?? 0),
        )
        .map((record) => ({
          type: record.type,
          ...(record.distance != null && { distanceKm: km(record.distance) }),
          ...(record.duration != null && {
            durationSeconds: record.duration,
          }),
          ...(record.type === 'SPEED'
            ? {
                time: formatDuration(record.value),
                ...(record.distance &&
                  speedFields(sport, record.distance / record.value)),
              }
            : {
                value: round(record.value, 0),
                unit:
                  record.type === 'POWER'
                    ? 'W'
                    : record.type === 'HEARTRATE'
                      ? 'bpm'
                      : 'm',
              }),
          date: isoDay(record.date),
          eventId: record.eventActivity?.event.eventId,
          activityName: record.eventActivity?.event.name,
        })),
    };
  },
});

/** Read-only tools, in the order they are offered to models. */
export const AI_TOOLS: AiTool[] = [
  listAthletes,
  getAthleteProfile,
  getWeek,
  searchActivities,
  getActivity,
  getTrainingLoad,
  getWellness,
  getInjuries,
  getPlans,
  getRecords,
];
