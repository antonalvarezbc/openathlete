import { subject } from '@casl/ability';

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CopyEventsBatch,
  DeleteEventsBatch,
  EventBatchResult,
  MoveEventsBatch,
  PlanWeekContext,
  UpdateTrainingWeek,
  WeekOverviewDto,
} from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { accessibleBy } from 'src/modules/auth/services/casl-prisma';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { authorizePlanAthlete, findPlanWeek } from '../helpers/plan-access';
import { EventService } from './event.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PLAN_STATUS_ORDER = ['ACTIVE', 'DRAFT', 'COMPLETED', 'ARCHIVED'];

function batchError(error: unknown) {
  return error instanceof HttpException ? error.message : 'Unexpected error';
}

/**
 * Week-level planning: the overview the weekly view needs (plan context and
 * actual load per activity), week targets, and batch copy/move/delete of
 * planned sessions. Batch operations reuse EventService per event so every
 * existing permission, workout copy, load estimation and plan-week rule
 * still applies.
 */
@Injectable()
export class WeekPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
    private readonly events: EventService,
  ) {}

  private async resolveAthlete(user: AuthUser, athleteId?: number) {
    if (!athleteId) {
      const own = await this.prisma.athlete.findFirst({
        where: { userId: user.userId },
      });
      if (!own) throw new NotFoundException('Athlete not found');
      return own.athleteId;
    }
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
    });
    if (!athlete) throw new NotFoundException('Athlete not found');
    const ability = await this.abilities.getFor({ user });
    if (!ability.can('read', subject('Athlete', athlete)))
      throw new ForbiddenException('Not allowed to access this athlete');
    return athleteId;
  }

  async overview(
    user: AuthUser,
    weekStart: Date,
    athleteId?: number,
    trainingPlanId?: number,
  ): Promise<WeekOverviewDto> {
    const targetAthleteId = await this.resolveAthlete(user, athleteId);
    const weekEnd = new Date(weekStart.getTime() + WEEK_MS - 1);

    const [planWeek, activityLoads] = await Promise.all([
      this.planWeek(targetAthleteId, weekStart, weekEnd, trainingPlanId),
      this.activityLoads(targetAthleteId, weekStart, weekEnd),
    ]);
    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      planWeek,
      activityLoads,
    };
  }

  /** The plan week overlapping the calendar week, preferring the given plan. */
  private async planWeek(
    athleteId: number,
    weekStart: Date,
    weekEnd: Date,
    trainingPlanId?: number,
  ): Promise<PlanWeekContext | null> {
    const weeks = await this.prisma.trainingWeek.findMany({
      where: {
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
        cycle: {
          trainingPlan: {
            athleteId,
            ...(trainingPlanId ? { trainingPlanId } : {}),
          },
        },
      },
      include: {
        cycle: {
          include: {
            trainingPlan: {
              include: {
                races: {
                  include: {
                    competition: {
                      include: {
                        event: {
                          select: {
                            eventId: true,
                            name: true,
                            startDate: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!weeks.length) return null;
    // Most overlap first, then active plans before drafts and older plans.
    const overlap = (w: { startDate: Date; endDate: Date }) =>
      Math.min(w.endDate.getTime(), weekEnd.getTime()) -
      Math.max(w.startDate.getTime(), weekStart.getTime());
    const week = [...weeks].sort(
      (a, b) =>
        overlap(b) - overlap(a) ||
        PLAN_STATUS_ORDER.indexOf(a.cycle.trainingPlan!.status) -
          PLAN_STATUS_ORDER.indexOf(b.cycle.trainingPlan!.status),
    )[0];
    const plan = week.cycle.trainingPlan!;
    const weekCount = await this.prisma.trainingWeek.count({
      where: { cycle: { trainingPlanId: plan.trainingPlanId } },
    });
    return {
      trainingWeekId: week.trainingWeekId,
      weekNumber: week.weekNumber,
      startDate: week.startDate.toISOString(),
      endDate: week.endDate.toISOString(),
      theme: week.theme,
      targetVolume: week.targetVolume,
      targetLoad: week.targetLoad,
      cycle: {
        cycleId: week.cycle.cycleId,
        name: week.cycle.name,
        phase: week.cycle.phase,
        color: week.cycle.color,
      },
      plan: {
        trainingPlanId: plan.trainingPlanId,
        name: plan.name,
        status: plan.status,
        weekCount,
      },
      races: plan.races
        .filter(
          (race) =>
            race.competition.event.startDate >= weekStart &&
            race.competition.event.startDate <= weekEnd,
        )
        .map((race) => ({
          eventId: race.competition.event.eventId,
          name: race.competition.event.name,
          startDate: race.competition.event.startDate.toISOString(),
          priority: race.priority,
        })),
    };
  }

  /** Actual TRIMP of each activity in the week, keyed by activity event id. */
  private async activityLoads(
    athleteId: number,
    weekStart: Date,
    weekEnd: Date,
  ) {
    const calculation = await this.prisma.trainingLoadCalculation.findUnique({
      where: { athleteId_type: { athleteId, type: 'TRIMP' } },
      select: { trainingLoadCalculationId: true },
    });
    if (!calculation) return {};
    const entries = await this.prisma.trainingLoadEntry.findMany({
      where: {
        calculationId: calculation.trainingLoadCalculationId,
        activity: {
          event: { startDate: { gte: weekStart, lte: weekEnd } },
        },
      },
      select: { value: true, activity: { select: { eventId: true } } },
    });
    return Object.fromEntries(
      entries.map((entry) => [entry.activity.eventId, entry.value]),
    ) as Record<number, number>;
  }

  async updateWeek(
    user: AuthUser,
    trainingWeekId: number,
    input: UpdateTrainingWeek,
  ) {
    const week = await this.prisma.trainingWeek.findUnique({
      where: { trainingWeekId },
      include: { cycle: { include: { trainingPlan: true } } },
    });
    const plan = week?.cycle.trainingPlan;
    if (!week || !plan) throw new NotFoundException('Week not found');
    await authorizePlanAthlete(this.prisma, user, plan.athleteId);
    if (plan.status === 'ARCHIVED')
      throw new BadRequestException('Archived plans cannot be edited');
    return this.prisma.trainingWeek.update({
      where: { trainingWeekId },
      data: input,
      select: {
        trainingWeekId: true,
        theme: true,
        targetVolume: true,
        targetLoad: true,
      },
    });
  }

  private async plannedSource(
    user: AuthUser,
    eventId: number,
    action: 'create' | 'update' | 'delete',
  ) {
    const ability = await this.abilities.getFor({ user });
    const actions =
      action === 'create' ? (['read', action] as const) : [action];
    // An inaccessible event must look absent before revealing its type or
    // completion state, including users with no Event permissions at all.
    if (actions.some((required) => !ability.can(required, 'Event')))
      throw new NotFoundException('Event not found');
    const event = await this.prisma.event.findFirst({
      where: {
        AND: [
          { eventId },
          ...actions.map((required) => accessibleBy(ability, required).Event),
        ],
      },
      select: {
        type: true,
        athleteId: true,
        training: { select: { relatedActivityId: true } },
        trainingWeek: {
          select: { cycle: { select: { trainingPlanId: true } } },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const allowCompleted = action === 'create';
    const planned =
      event.type === 'NOTE' ||
      (event.type === 'TRAINING' &&
        (allowCompleted || !event.training?.relatedActivityId));
    if (!planned)
      throw new BadRequestException(
        allowCompleted
          ? 'Only planned sessions and notes can be copied'
          : 'Only planned sessions without an activity and notes can be changed',
      );
    return event;
  }

  /** Copies sessions and notes, keeping their plan week when possible. */
  async copy(
    user: AuthUser,
    input: CopyEventsBatch,
  ): Promise<EventBatchResult> {
    const result: EventBatchResult = { succeeded: [], failed: [] };
    for (const item of input.items) {
      try {
        const source = await this.plannedSource(user, item.eventId, 'create');
        const copy = await this.events.duplicateEventComplete(
          user,
          item.eventId,
          { startDate: item.startDate, endDate: item.endDate },
        );
        const planId =
          source.trainingWeek?.cycle.trainingPlanId ?? input.trainingPlanId;
        if (planId && source.athleteId) {
          // Outside the plan the copy stays a plain calendar session.
          const weekId = await findPlanWeek(
            this.prisma,
            planId,
            source.athleteId,
            item.startDate,
            item.endDate,
          ).catch(() => null);
          if (weekId)
            await this.prisma.event.update({
              where: { eventId: copy.eventId },
              data: { trainingWeekId: weekId },
            });
        }
        result.succeeded.push(copy.eventId);
      } catch (error) {
        result.failed.push({
          eventId: item.eventId,
          message: batchError(error),
        });
      }
    }
    return result;
  }

  /** Moves planned sessions and notes; plan weeks follow the new dates. */
  async move(
    user: AuthUser,
    input: MoveEventsBatch,
  ): Promise<EventBatchResult> {
    const result: EventBatchResult = { succeeded: [], failed: [] };
    for (const item of input.items) {
      try {
        await this.plannedSource(user, item.eventId, 'update');
        await this.events.updateEvent(user, item.eventId, {
          startDate: item.startDate,
          endDate: item.endDate,
        } as Parameters<EventService['updateEvent']>[2]);
        result.succeeded.push(item.eventId);
      } catch (error) {
        result.failed.push({
          eventId: item.eventId,
          message: batchError(error),
        });
      }
    }
    return result;
  }

  /** Deletes planned sessions without an activity and notes. */
  async delete(
    user: AuthUser,
    input: DeleteEventsBatch,
  ): Promise<EventBatchResult> {
    const result: EventBatchResult = { succeeded: [], failed: [] };
    for (const eventId of input.eventIds) {
      try {
        await this.plannedSource(user, eventId, 'delete');
        await this.events.deleteEvent(user, eventId);
        result.succeeded.push(eventId);
      } catch (error) {
        result.failed.push({ eventId, message: batchError(error) });
      }
    }
    return result;
  }
}
