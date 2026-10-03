import { z } from 'zod';

import { NotFoundException } from '@nestjs/common';

import { AuthUser } from '../auth/decorators/user.decorator';
import { PrismaService } from '../prisma/services/prisma.service';
import {
  clipText,
  isoDay,
  resolveAthleteId,
  utcWeekStart,
} from './ai-tools.access';
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

const listAthletes = defineTool({
  name: 'list_athletes',
  description:
    'Athletes you can read: your own athlete profile and the athletes you coach. Use the athleteId with the other tools.',
  input: z.object({}).strict(),
  async run({ prisma }, user: AuthUser) {
    const [own, coached] = await Promise.all([
      prisma.athlete.findFirst({
        where: { userId: user.userId },
        select: {
          athleteId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.coachAthlete.findMany({
        where: { userId: user.userId },
        select: {
          athlete: {
            select: {
              athleteId: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
        take: 200,
      }),
    ]);
    const athletes = new Map<
      number,
      { athleteId: number; name: string; self: boolean }
    >();
    if (own)
      athletes.set(own.athleteId, {
        athleteId: own.athleteId,
        name: `${own.user.firstName} ${own.user.lastName}`,
        self: true,
      });
    for (const { athlete } of coached)
      if (!athletes.has(athlete.athleteId))
        athletes.set(athlete.athleteId, {
          athleteId: athlete.athleteId,
          name: `${athlete.user.firstName} ${athlete.user.lastName}`,
          self: false,
        });
    return { athletes: [...athletes.values()] };
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
      load: week && {
        actual: round(week.actualLoad, 0),
        plannedPending: round(week.estimatedLoad, 0),
        total: round(week.totalLoad, 0),
        recommendedMin: round(week.recommendedMin, 0),
        recommendedMax: round(week.recommendedMax, 0),
        acwr: round(week.acwr, 2),
        acwrStatus: week.acwrStatus,
      },
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

const getActivity = defineTool({
  name: 'get_activity',
  description:
    'Details of one completed activity: summary metrics, TRIMP, athlete comment, answered feedback questions, and the planned session it fulfilled (goals and workout step count).',
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
            averageCadence: true,
            feedbackQuestions: {
              where: { answerText: { not: null } },
              select: { questionText: true, answerText: true },
              take: 10,
            },
            relatedTraining: {
              select: {
                goalDuration: true,
                goalDistance: true,
                goalElevationGain: true,
                goalRpe: true,
                description: true,
                event: { select: { name: true } },
                workout: { select: { _count: { select: { steps: true } } } },
              },
            },
          },
        },
      },
    });
    if (!event?.activity || !event.athleteId || event.type !== 'ACTIVITY')
      throw new NotFoundException('Activity not found');
    const athleteId = await resolveAthleteId(prisma, user, event.athleteId);
    const loads = await activityLoads(prisma, athleteId, [
      event.activity.eventActivityId,
    ]);
    const planned = event.activity.relatedTraining;
    return {
      eventId: event.eventId,
      athleteId,
      name: event.name,
      start: event.startDate.toISOString(),
      end: event.endDate.toISOString(),
      ...activitySummary(
        event.activity,
        loads.get(event.activity.eventActivityId),
      ),
      averageSpeedMps: round(event.activity.averageSpeed, 2),
      averageCadence: round(event.activity.averageCadence, 0),
      feedback: event.activity.feedbackQuestions.map((q) => ({
        question: clipText(q.questionText, 200),
        answer: clipText(q.answerText, 400),
      })),
      plannedSession: planned && {
        name: planned.event.name,
        goalDurationSeconds: planned.goalDuration ?? undefined,
        goalDistanceKm: km(planned.goalDistance),
        goalElevationM: round(planned.goalElevationGain, 0),
        goalRpe:
          planned.goalRpe == null ? undefined : round(planned.goalRpe * 10, 0),
        workoutSteps: planned.workout?._count.steps ?? 0,
        description: clipText(planned.description, 300),
      },
    };
  },
});

const getTrainingLoad = defineTool({
  name: 'get_training_load',
  description:
    'Weekly training load (TRIMP) of an athlete over several weeks: actual, pending planned load, recommended range and ACWR with its risk status.',
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
    const summaries = await trainingLoad.getWeeklyTrimpSummary(
      user,
      first,
      end,
      athleteId,
    );
    return {
      athleteId,
      weeks: summaries
        .filter((s) => {
          const start = new Date(s.weekStart).getTime();
          return start >= first.getTime() && start <= lastWeek.getTime();
        })
        .map((s) => ({
          weekStart: isoDay(new Date(s.weekStart)),
          actual: round(s.actualLoad, 0),
          plannedPending: round(s.estimatedLoad, 0),
          total: round(s.totalLoad, 0),
          recommendedMin: round(s.recommendedMin, 0),
          recommendedMax: round(s.recommendedMax, 0),
          acwr: round(s.acwr, 2),
          acwrStatus: s.acwrStatus,
        })),
    };
  },
});

const getWellness = defineTool({
  name: 'get_wellness',
  description:
    'Daily wellness and body metrics of an athlete (e.g. HRV/RMSSD, resting HR, sleep, stress, body battery, weight, VO2max), newest first. Missing values are unknown, not zero.',
  input: z
    .object({
      athleteId: athleteIdInput,
      days: z.number().int().min(1).max(90).default(14),
      types: z
        .array(z.string().max(40))
        .max(15)
        .optional()
        .describe('Metric types, e.g. ["HR_REST","RMSSD","SLEEP_SCORE"]'),
    })
    .strict(),
  async run({ prisma }, user, input) {
    const athleteId = await resolveAthleteId(prisma, user, input.athleteId);
    const since = new Date(Date.now() - input.days * DAY_MS);
    const metrics = await prisma.athleteMetric.findMany({
      where: {
        athleteId,
        date: { gte: since },
        ...(input.types?.length && { type: { in: input.types as never[] } }),
      },
      orderBy: { date: 'desc' },
      take: 300,
      select: { type: true, date: true, value: true },
    });
    return {
      athleteId,
      since: isoDay(since),
      metrics: metrics.map((metric) => ({
        type: metric.type,
        date: isoDay(metric.date),
        value: round(metric.value, 2),
      })),
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

/** Read-only tools, in the order they are offered to models. */
export const AI_TOOLS: AiTool[] = [
  listAthletes,
  getWeek,
  searchActivities,
  getActivity,
  getTrainingLoad,
  getWellness,
  getInjuries,
  getPlans,
];
