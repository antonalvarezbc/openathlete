import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, TrainingPlan } from '@openathlete/database';
import {
  CYCLE_PHASE,
  CreateManagedPlan,
  LinkPlanRace,
  PlanRaceInput,
  SPORT_TYPE,
  UpdateManagedPlan,
  buildPlanSchedule,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { authorizePlanAthlete } from '../helpers/plan-access';

const details = {
  races: { include: { competition: { include: { event: true } } } },
  cycles: {
    orderBy: { startDate: 'asc' as const },
    include: {
      weeks: {
        orderBy: { startDate: 'asc' as const },
        include: { _count: { select: { sessions: true } } },
      },
    },
  },
} satisfies Prisma.TrainingPlanInclude;

@Injectable()
export class PlanWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async plan(db: Prisma.TransactionClient, user: AuthUser, id: number) {
    const plan = await db.trainingPlan.findUnique({
      where: { trainingPlanId: id },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    await authorizePlanAthlete(db, user, plan.athleteId);
    return plan;
  }

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Plan changed or target race already exists',
        );
      throw error;
    }
  }

  async list(user: AuthUser, athleteId: number) {
    await authorizePlanAthlete(this.prisma, user, athleteId);
    return this.prisma.trainingPlan.findMany({
      where: { athleteId },
      orderBy: { startDate: 'desc' },
      include: details,
    });
  }

  async get(user: AuthUser, id: number) {
    await this.plan(this.prisma, user, id);
    return this.prisma.trainingPlan.findUniqueOrThrow({
      where: { trainingPlanId: id },
      include: details,
    });
  }

  async competitions(user: AuthUser, id: number) {
    const plan = await this.plan(this.prisma, user, id);
    return this.prisma.event.findMany({
      where: {
        athleteId: plan.athleteId,
        type: 'COMPETITION',
        startDate: { gte: plan.startDate, lte: plan.endDate },
      },
      select: { eventId: true, name: true, startDate: true },
      orderBy: { startDate: 'asc' },
    });
  }

  async create(user: AuthUser, data: CreateManagedPlan) {
    const duration = Math.ceil(
      (Date.parse(data.endDate) - Date.parse(data.startDate) + 86400000) /
        (7 * 86400000),
    );
    const structure = {
      plan: {
        name: data.name,
        description: data.description,
        goal: data.goal,
        sportType: SPORT_TYPE.TRAIL_RUNNING,
        distance: 0,
        duration,
      },
      cycles: [
        {
          name: data.name,
          description: data.description,
          phase: CYCLE_PHASE.BASE,
          weeks: Array.from({ length: duration }, (_, i) => ({
            weekNumber: i + 1,
            sessions: [],
          })),
        },
      ],
    };
    const schedule = buildPlanSchedule(
      structure,
      data.startDate,
      data.timeZone,
    );
    const nextDay = new Date(Date.parse(data.endDate) + 86400000)
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(
      buildPlanSchedule(structure, nextDay, data.timeZone).startDate.getTime() -
        1,
    );
    return this.transaction(async (tx) => {
      await authorizePlanAthlete(tx, user, data.athleteId);
      const duplicate = await tx.trainingPlan.findFirst({
        where: {
          athleteId: data.athleteId,
          name: data.name,
          startDate: schedule.startDate,
        },
      });
      if (duplicate) throw new ConflictException('Plan already exists');
      return tx.trainingPlan.create({
        data: {
          athleteId: data.athleteId,
          name: data.name,
          goal: data.goal,
          description: data.description,
          startDate: schedule.startDate,
          endDate,
          status: 'ACTIVE',
          cycles: {
            create: {
              athleteId: data.athleteId,
              name: data.name,
              description: '',
              phase: 'BASE',
              startDate: schedule.startDate,
              endDate,
              weeks: {
                create: schedule.cycles[0].weeks.map((week) => ({
                  weekNumber: week.weekNumber,
                  startDate: week.startDate,
                  endDate: week.endDate > endDate ? endDate : week.endDate,
                })),
              },
            },
          },
        },
        include: details,
      });
    });
  }

  async update(user: AuthUser, id: number, data: UpdateManagedPlan) {
    return this.transaction(async (tx) => {
      await this.plan(tx, user, id);
      return tx.trainingPlan.update({
        where: { trainingPlanId: id },
        data,
        include: details,
      });
    });
  }

  private async validateRace(
    db: Prisma.TransactionClient,
    plan: TrainingPlan,
    priority: 'TARGET' | 'PREPARATORY',
    start: Date,
    end: Date,
    excludeId?: number,
  ) {
    if (['COMPLETED', 'ARCHIVED'].includes(plan.status))
      throw new ConflictException('Plan is not editable');
    if (
      start < plan.startDate ||
      start > plan.endDate ||
      end > plan.endDate ||
      end < start
    )
      throw new BadRequestException('Race must be inside the plan dates');
    const races = await db.trainingPlanRace.findMany({
      where: {
        trainingPlanId: plan.trainingPlanId,
        ...(excludeId ? { eventCompetitionId: { not: excludeId } } : {}),
      },
      include: { competition: { include: { event: true } } },
    });
    const target = races.find((race) => race.priority === 'TARGET');
    if (priority === 'TARGET' && target)
      throw new ConflictException('Plan already has a target race');
    if (
      (priority === 'PREPARATORY' &&
        target &&
        start >= target.competition.event.startDate) ||
      (priority === 'TARGET' &&
        races.some((race) => race.competition.event.startDate >= start))
    )
      throw new BadRequestException(
        'Preparation races must precede the target race',
      );
  }

  async saveRace(
    user: AuthUser,
    id: number,
    data: PlanRaceInput,
    competitionId?: number,
  ) {
    return this.transaction(async (tx) => {
      const plan = await this.plan(tx, user, id);
      const endDate = new Date(
        data.startDate.getTime() + (data.goalDuration ?? 3600) * 1000,
      );
      await this.validateRace(
        tx,
        plan,
        data.priority,
        data.startDate,
        endDate,
        competitionId,
      );
      const { priority, name, startDate, ...competitionData } = data;
      if (competitionId) {
        const link = await tx.trainingPlanRace.findUnique({
          where: {
            trainingPlanId_eventCompetitionId: {
              trainingPlanId: id,
              eventCompetitionId: competitionId,
            },
          },
          include: { competition: true },
        });
        if (!link) throw new NotFoundException('Race not found');
        if (link.competition.relatedActivityId)
          throw new ConflictException('Completed races cannot be edited here');
        // A race shared with another plan must be edited in the calendar instead.
        const links = await tx.trainingPlanRace.count({
          where: { eventCompetitionId: competitionId },
        });
        if (links > 1)
          throw new ConflictException('Race is shared by multiple plans');
        await tx.event.update({
          where: { eventId: link.competition.eventId },
          data: {
            name,
            startDate,
            endDate,
            competition: { update: competitionData },
          },
        });
        return tx.trainingPlanRace.update({
          where: {
            trainingPlanId_eventCompetitionId: {
              trainingPlanId: id,
              eventCompetitionId: competitionId,
            },
          },
          data: { priority },
        });
      }
      const event = await tx.event.create({
        data: {
          name,
          startDate,
          endDate,
          athleteId: plan.athleteId,
          type: 'COMPETITION',
          competition: { create: competitionData },
        },
        include: { competition: true },
      });
      return tx.trainingPlanRace.create({
        data: {
          trainingPlanId: id,
          eventCompetitionId: event.competition!.eventCompetitionId,
          priority,
        },
      });
    });
  }

  async linkRace(user: AuthUser, id: number, data: LinkPlanRace) {
    return this.transaction(async (tx) => {
      const plan = await this.plan(tx, user, id);
      const event = await tx.event.findFirst({
        where: {
          eventId: data.eventId,
          athleteId: plan.athleteId,
          type: 'COMPETITION',
        },
        include: { competition: true },
      });
      if (!event?.competition)
        throw new NotFoundException('Competition not found');
      await this.validateRace(
        tx,
        plan,
        data.priority,
        event.startDate,
        event.endDate,
      );
      return tx.trainingPlanRace.create({
        data: {
          trainingPlanId: id,
          eventCompetitionId: event.competition.eventCompetitionId,
          priority: data.priority,
        },
      });
    });
  }

  async unlinkRace(user: AuthUser, id: number, competitionId: number) {
    return this.transaction(async (tx) => {
      await this.plan(tx, user, id);
      return tx.trainingPlanRace.deleteMany({
        where: { trainingPlanId: id, eventCompetitionId: competitionId },
      });
    });
  }
}
