import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Prisma } from '@openathlete/database';
import {
  AdaptationSession,
  ApplyPlanAdaptation,
  METRIC_TYPE,
  PlanAdaptationProposal,
  PlanAdaptationRequest,
  RefinePlanAdaptation,
  SPORT_TYPE,
  adaptationSessionSchema,
  mapWorkoutDtoToPrisma,
  metricUnitMap,
  planAdaptationProposalSchema,
} from '@openathlete/shared';

import { planAdaptationAgent } from '../../../mastra/agents/plan-adaptation.agent';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { adaptationWeek } from './adaptation-dates';
import { validateAdaptation } from './plan-adaptation.validation';

const workoutInclude = {
  steps: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      targets: true,
      repeatBlock: {
        include: {
          childSteps: {
            orderBy: { orderIndex: 'asc' as const },
            include: { targets: true },
          },
        },
      },
    },
  },
  providerWorkoutExports: { select: { providerWorkoutExportId: true } },
} satisfies Prisma.WorkoutInclude;
const calendarInclude = {
  training: { include: { workout: { include: workoutInclude } } },
  trainingWeek: { include: { cycle: { select: { trainingPlanId: true } } } },
  competition: true,
  note: true,
} satisfies Prisma.EventInclude;
type CalendarEvent = Prisma.EventGetPayload<{
  include: typeof calendarInclude;
}>;

function contextWorkout(event: CalendarEvent) {
  const raw = event.training?.workout;
  const simple = (step: NonNullable<typeof raw>['steps'][number]) => ({
    stepType: step.stepType,
    name: step.name,
    notes: step.notes,
    durationType: step.durationType,
    durationValue: step.durationValue,
    targets: step.targets.map((t) => ({
      targetType: t.targetType,
      targetMin: t.targetMin,
      targetMax: t.targetMax,
      targetValue: t.targetValue,
      metricType: t.metricType,
    })),
  });
  return raw?.steps.length
    ? {
        steps: raw.steps.map((step) => ({
          ...simple(step),
          repeatBlock: step.repeatBlock
            ? {
                repetitions: step.repeatBlock.repetitions,
                childSteps: step.repeatBlock.childSteps.map((child) =>
                  simple({ ...child, repeatBlock: null }),
                ),
              }
            : null,
        })),
      }
    : null;
}

function originalSession(event: CalendarEvent): AdaptationSession {
  const training = event.training!;
  return adaptationSessionSchema.parse({
    eventId: event.eventId,
    startDate: event.startDate.toISOString(),
    action: 'KEEP',
    reason: 'Original',
    name: event.name,
    sport: training.sport,
    description: training.description,
    goalDuration:
      training.goalDuration ??
      Math.max(
        0,
        Math.round(
          (event.endDate.getTime() - event.startDate.getTime()) / 1000,
        ),
      ),
    goalDistance: training.goalDistance,
    goalElevationGain: training.goalElevationGain,
    goalRpe: training.goalRpe == null ? null : training.goalRpe * 10,
    workout: contextWorkout(event),
  });
}

const wellnessTypes = [
  METRIC_TYPE.HRV_LAST_NIGHT_AVG,
  METRIC_TYPE.HRV_LAST_NIGHT_5MIN_HIGH,
  METRIC_TYPE.HR_REST,
  METRIC_TYPE.SLEEP_DURATION,
  METRIC_TYPE.SLEEP_SCORE,
  METRIC_TYPE.STRESS_AVERAGE,
  METRIC_TYPE.BODY_BATTERY_CHARGED,
  METRIC_TYPE.BODY_BATTERY_DRAINED,
  METRIC_TYPE.RMSSD,
  METRIC_TYPE.HR_MAX,
  METRIC_TYPE.VO2MAX,
];

@Injectable()
export class PlanAdaptationService {
  constructor(private readonly prisma: PrismaService) {}

  async context(
    user: AuthUser,
    request: PlanAdaptationRequest,
    db: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ) {
    const athlete = await db.athlete.findFirst({
      where: {
        athleteId: request.athleteId,
        OR: [
          { userId: user.userId },
          { coachAthletes: { some: { userId: user.userId } } },
        ],
      },
      select: { athleteId: true, user: { select: { language: true } } },
    });
    if (!athlete)
      throw new ForbiddenException('You cannot manage this athlete');
    const language =
      request.language ??
      (
        await db.user.findUniqueOrThrow({
          where: { userId: user.userId },
          select: { language: true },
        })
      ).language;
    const plan = await db.trainingPlan.findFirst({
      where: { trainingPlanId: request.planId, athleteId: request.athleteId },
      select: {
        trainingPlanId: true,
        name: true,
        description: true,
        goal: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });
    if (!plan)
      throw new ForbiddenException('Plan does not belong to this athlete');
    let range: ReturnType<typeof adaptationWeek>;
    try {
      range = adaptationWeek(request.weekStart, request.timeZone);
    } catch {
      throw new BadRequestException('Invalid week or timezone');
    }
    const future = await db.event.findMany({
      where: {
        athleteId: request.athleteId,
        type: 'TRAINING',
        startDate: { gte: now },
        trainingWeek: { cycle: { trainingPlanId: request.planId } },
        training: { relatedActivityId: null },
        ...(request.scope === 'WEEK'
          ? {
              startDate: {
                gte: now > range.start ? now : range.start,
                lt: range.end,
              },
            }
          : {}),
      },
      include: calendarInclude,
      orderBy: [{ startDate: 'asc' }, { eventId: 'asc' }],
      take: request.scope === 'NEXT_SESSION' ? 1 : 29,
    });
    if (
      !future.length &&
      !(request.scope === 'WEEK' && request.allowNewSessions)
    )
      throw new BadRequestException({
        code: 'ADAPTATION_NO_SESSIONS',
        message: 'No future uncompleted sessions in this scope',
      });
    if (future.length > 28)
      throw new BadRequestException(
        'At most 28 sessions can be adapted at once',
      );
    if (request.scope === 'NEXT_SESSION') {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: request.timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .formatToParts(future[0].startDate)
          .map((part) => [part.type, part.value]),
      );
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      range = adaptationWeek(date, request.timeZone);
    }
    const availableWeeks =
      request.allowNewSessions && request.scope === 'WEEK'
        ? await db.trainingWeek.findMany({
            where: {
              cycle: { trainingPlanId: request.planId },
              startDate: { lt: range.end },
              endDate: { gt: now > range.start ? now : range.start },
            },
            select: { trainingWeekId: true, startDate: true, endDate: true },
            orderBy: [{ startDate: 'asc' }, { trainingWeekId: 'asc' }],
          })
        : [];
    if (request.allowNewSessions && !availableWeeks.length)
      throw new BadRequestException({
        code: 'ADAPTATION_NO_WEEK',
        message: 'No future plan week in the selected period',
      });
    const historyStart = new Date(now.getTime() - 28 * 86400000);
    const [history, metrics, injuries, zones, calendar] = await Promise.all([
      db.event.findMany({
        where: {
          athleteId: request.athleteId,
          type: 'ACTIVITY',
          startDate: { gte: historyStart, lte: now },
        },
        orderBy: [{ startDate: 'desc' }, { eventId: 'asc' }],
        take: 100,
        select: {
          eventId: true,
          name: true,
          startDate: true,
          activity: {
            select: {
              sport: true,
              distance: true,
              movingTime: true,
              elevationGain: true,
              rpe: true,
              description: true,
              averageHeartrate: true,
              trainingLoadEntries: {
                orderBy: { trainingLoadEntryId: 'asc' },
                select: {
                  value: true,
                  date: true,
                  calculation: { select: { type: true } },
                },
              },
              messageThread: {
                select: {
                  messages: {
                    where: {
                      thread: {
                        participants: { some: { userId: user.userId } },
                      },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: { content: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
      }),
      db.athleteMetric.findMany({
        where: {
          athleteId: request.athleteId,
          type: { in: wellnessTypes },
          date: { gte: historyStart, lte: now },
        },
        select: { type: true, value: true, date: true },
        orderBy: [{ date: 'desc' }, { type: 'asc' }],
      }),
      db.athleteInjury.findMany({
        where: { athleteId: request.athleteId, status: { not: 'RESOLVED' } },
        select: {
          location: true,
          painScore: true,
          context: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { athleteInjuryId: 'asc' },
      }),
      db.trainingZone.findMany({
        where: { athleteId: request.athleteId },
        include: { values: true },
        orderBy: { trainingZoneId: 'asc' },
      }),
      db.event.findMany({
        where: {
          athleteId: request.athleteId,
          startDate: { lt: range.end },
          endDate: { gte: range.start },
          type: { in: ['TRAINING', 'COMPETITION', 'NOTE'] },
        },
        include: calendarInclude,
        orderBy: [{ startDate: 'asc' }, { eventId: 'asc' }],
      }),
    ]);
    const contextVersion = createHash('sha256')
      .update(
        JSON.stringify({
          request,
          language,
          plan,
          future,
          history,
          metrics,
          injuries,
          zones,
          calendar,
          availableWeeks,
        }),
      )
      .digest('hex');
    const sessions = future.map((event) => ({
      rescheduleStart: new Date(
        Math.max(
          range.start.getTime(),
          now.getTime(),
          event.trainingWeek!.startDate.getTime(),
          plan.startDate.getTime(),
        ),
      ).toISOString(),
      rescheduleEnd: new Date(
        Math.min(
          range.end.getTime(),
          event.trainingWeek!.endDate.getTime(),
          plan.endDate.getTime(),
        ),
      ).toISOString(),
      durationInferred: event.training?.goalDuration == null,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      exported: !!event.training?.workout?.providerWorkoutExports.length,
      original: originalSession(event),
    }));
    const data = {
      language,
      allowRedistribution: request.allowRedistribution ?? false,
      allowNewSessions: request.allowNewSessions ?? false,
      maxNewSessions: request.maxNewSessions,
      newSessionMinutes: request.newSessionMinutes,
      newSessionMaxRpe: request.newSessionMaxRpe,
      availableWeeks: availableWeeks.map((week) => ({
        trainingWeekId: week.trainingWeekId,
        startDate: new Date(
          Math.max(
            now.getTime(),
            range.start.getTime(),
            plan.startDate.getTime(),
            week.startDate.getTime(),
          ),
        ).toISOString(),
        endDate: new Date(
          Math.min(
            range.end.getTime(),
            plan.endDate.getTime(),
            week.endDate.getTime(),
          ),
        ).toISOString(),
      })),
      asOf: now.toISOString(),
      historyWindowDays: 28,
      historyLimit: 100,
      historyMayBeTruncated: history.length === 100,
      plan,
      currentState: request.currentState,
      readiness: request.readiness,
      instructions: request.instructions,
      allowIncrease: request.allowIncrease,
      maxIncreasePercent: request.maxIncreasePercent,
      scope: request.scope,
      timeZone: request.timeZone,
      sessions,
      activities: history.map((event) => ({
        date: event.startDate,
        sport: event.activity?.sport,
        durationSeconds: event.activity?.movingTime,
        distanceMeters: event.activity?.distance,
        elevationGainMeters: event.activity?.elevationGain,
        averageHeartRate: event.activity?.averageHeartrate,
        rpe: event.activity?.rpe == null ? null : event.activity.rpe * 10,
        description: event.activity?.description.slice(0, 3000),
        load: event.activity?.trainingLoadEntries,
        comments:
          event.activity?.messageThread?.messages.map((m) => ({
            date: m.createdAt,
            text: m.content.slice(0, 1500),
          })) ?? [],
      })),
      metrics: metrics.map((metric) => ({
        ...metric,
        unit: metricUnitMap[metric.type as METRIC_TYPE],
      })),
      missingMetrics: wellnessTypes.filter(
        (type) => !metrics.some((metric) => metric.type === type),
      ),
      injuries,
      zones: zones.map((zone) => ({
        trainingZoneId: zone.trainingZoneId,
        type: zone.type,
        index: zone.index,
        name: zone.name,
        values: zone.values.map((value) => ({
          min: value.min,
          max: value.max,
          sports: value.sports,
        })),
      })),
      surroundingCalendar: calendar.map((event) => ({
        eventId: event.eventId,
        date: event.startDate,
        endDate: event.endDate,
        name: event.name,
        type: event.type,
        description:
          event.training?.description ??
          event.competition?.description ??
          event.note?.description ??
          '',
        workout: contextWorkout(event),
        trainingWeekId: event.trainingWeekId,
        planId: event.trainingWeek?.cycle?.trainingPlanId ?? null,
        editable: future.some((item) => item.eventId === event.eventId),
        sport: event.training?.sport ?? event.competition?.sport,
        duration:
          event.training?.goalDuration ?? event.competition?.goalDuration,
        distance:
          event.training?.goalDistance ?? event.competition?.goalDistance,
        elevationGain:
          event.training?.goalElevationGain ??
          event.competition?.goalElevationGain,
        rpe:
          event.training?.goalRpe == null ? null : event.training.goalRpe * 10,
        completed: !!event.training?.relatedActivityId,
      })),
      exclusions: [
        'Profile name/email fields (free text may still contain personal data)',
        'Credentials and API keys',
        'GPS/raw activity streams',
        'General private conversations',
        'Metrics older than 28 days',
        'Unstored subjective variables',
      ],
    };
    return { contextVersion, data };
  }

  private proposalIssue(
    request: PlanAdaptationRequest,
    context: PlanAdaptationContext,
    proposal: PlanAdaptationProposal,
  ) {
    try {
      validateAdaptation(request, context, proposal, true);
      return null;
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      const response = error.getResponse() as {
        code?: string;
        message?: string;
        sessionName?: string;
      };
      return {
        code: response.code ?? 'ADAPTATION_INVALID',
        message: response.message ?? 'Invalid proposal',
        sessionName: response.sessionName,
      };
    }
  }

  private async generateProposal(prompt: string) {
    let result;
    try {
      result = await planAdaptationAgent.generate(prompt, {
        structuredOutput: { schema: planAdaptationProposalSchema },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Structured output validation failed') ||
          error.name === 'AI_NoObjectGeneratedError' ||
          ('cause' in error &&
            error.cause instanceof Error &&
            error.cause.name === 'ZodError'))
      ) {
        // Extract only model output, never the error message, request, headers or stack.
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
          if (typeof raw === 'string' && raw.length)
            return { proposal: null, rawResponse: raw.slice(0, 100000) };
          current = item.cause;
        }
        return { proposal: null, rawResponse: '' };
      }
      throw new ServiceUnavailableException({
        code: 'ADAPTATION_PROVIDER',
        message: 'AI generation could not complete. No changes were saved.',
      });
    }
    const parsed = planAdaptationProposalSchema.safeParse(result.object);
    return {
      proposal: parsed.success ? parsed.data : null,
      rawResponse: (typeof result.text === 'string' && result.text
        ? result.text
        : JSON.stringify(result.object ?? '')
      ).slice(0, 100000),
    };
  }

  async propose(user: AuthUser, request: PlanAdaptationRequest) {
    const context = await this.context(user, request);
    const generated = await this.generateProposal(JSON.stringify(context.data));
    const validationIssue = generated.proposal
      ? this.proposalIssue(request, context.data, generated.proposal)
      : { code: 'ADAPTATION_MODEL_INVALID' };
    return { ...context, ...generated, validationIssue };
  }

  async refine(user: AuthUser, dto: RefinePlanAdaptation) {
    const context = await this.context(user, dto.request);
    if (context.contextVersion !== dto.contextVersion)
      throw new ConflictException(
        'Athlete context or calendar changed. Generate and review a new proposal.',
      );
    const generated = await this.generateProposal(
      JSON.stringify({
        ...context.data,
        revision: {
          previousProposal: dto.proposal,
          ...(dto.rawResponse !== undefined
            ? { rawResponse: dto.rawResponse }
            : {}),
          feedback: dto.feedback,
          history: dto.history,
          validationIssue: dto.proposal
            ? this.proposalIssue(dto.request, context.data, dto.proposal)
            : { code: 'ADAPTATION_MODEL_INVALID' },
        },
      }),
    );
    const validationIssue = generated.proposal
      ? this.proposalIssue(dto.request, context.data, generated.proposal)
      : { code: 'ADAPTATION_MODEL_INVALID' };
    return { ...context, ...generated, validationIssue };
  }

  async apply(user: AuthUser, dto: ApplyPlanAdaptation) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const context = await this.context(user, dto.request, tx);
          if (context.contextVersion !== dto.contextVersion)
            throw new ConflictException(
              'Athlete context or calendar changed. Generate and review a new proposal.',
            );
          validateAdaptation(dto.request, context.data, dto.proposal);
          for (const session of dto.proposal.sessions) {
            if (session.action === 'KEEP') continue;
            const original = context.data.sessions.find(
              (item) => item.original.eventId === session.eventId,
            )!;
            if (original.exported)
              throw new ConflictException(
                'An exported workout must be managed in the provider before adapting it here.',
              );
            const start = new Date(session.startDate ?? original.startDate);
            const duration =
              session.action === 'REST' ? 0 : session.goalDuration;
            const training = await tx.eventTraining.findUniqueOrThrow({
              where: { eventId: session.eventId },
            });
            await tx.workout.deleteMany({
              where: { eventTrainingId: training.eventTrainingId },
            });
            await tx.event.update({
              where: { eventId: session.eventId },
              data: {
                startDate: start,
                name: session.name,
                endDate: new Date(start.getTime() + duration * 1000),
                training: {
                  update: {
                    sport:
                      session.action === 'REST'
                        ? SPORT_TYPE.OTHER
                        : session.sport,
                    description: session.description,
                    goalDuration: duration,
                    goalDistance: session.goalDistance,
                    goalElevationGain: session.goalElevationGain,
                    goalRpe:
                      session.goalRpe == null ? null : session.goalRpe / 10,
                    estimatedLoad: null,
                  },
                },
              },
            });
            if (session.workout)
              await tx.workout.create({
                data: {
                  eventTrainingId: training.eventTrainingId,
                  ...mapWorkoutDtoToPrisma(session.workout),
                },
              });
          }
          for (const session of dto.proposal.newSessions ?? []) {
            const start = new Date(session.startDate);
            await tx.event.create({
              data: {
                athleteId: dto.request.athleteId,
                trainingWeekId: session.trainingWeekId,
                type: 'TRAINING',
                name: session.name,
                startDate: start,
                endDate: new Date(
                  start.getTime() + session.goalDuration * 1000,
                ),
                training: {
                  create: {
                    sport: session.sport,
                    description: session.description,
                    goalDuration: session.goalDuration,
                    goalRpe: session.goalRpe / 10,
                    workout: { create: mapWorkoutDtoToPrisma(session.workout) },
                  },
                },
              },
            });
          }
          return {
            created: dto.proposal.newSessions?.length ?? 0,
            updated: dto.proposal.sessions.filter(
              (session) => session.action !== 'KEEP',
            ).length,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException(
          'Concurrent calendar change. Review again.',
        );
      throw error;
    }
  }
}
export type PlanAdaptationContext = Awaited<
  ReturnType<PlanAdaptationService['context']>
>['data'];
