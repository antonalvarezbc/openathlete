import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PlanStatus, Prisma } from '@openathlete/database';
import {
  EVENT_TYPE,
  ImportPlanBodyDto,
  SEOPlanData,
  buildPlanSchedule,
  createWorkoutSchema,
  mapWorkoutDtoToPrisma,
  trainingPlanImportSchema,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';

@Injectable()
export class TrainingPlanService {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(
    user: AuthUser,
    athleteId: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const athlete = await db.athlete.findFirst({
      where: {
        athleteId,
        OR: [
          { userId: user.userId },
          { coachAthletes: { some: { userId: user.userId } } },
        ],
      },
    });
    if (!athlete)
      throw new ForbiddenException('You cannot manage this athlete');
  }

  async listPlans(user: AuthUser, athleteId: number) {
    await this.authorize(user, athleteId);
    return this.prisma.trainingPlan.findMany({
      where: { athleteId },
      orderBy: { startDate: 'desc' },
      select: {
        trainingPlanId: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    });
  }

  async importSeoPlan(
    user: AuthUser,
    input: SEOPlanData,
    startDate: Date | string,
    options: Partial<ImportPlanBodyDto> = {},
    token?: string,
  ) {
    const parsed = trainingPlanImportSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const planData = parsed.data;
    const athleteId = options.athleteId ?? user.athlete?.athleteId;
    if (!athleteId) throw new BadRequestException('Athlete ID is required');
    let schedule: ReturnType<typeof buildPlanSchedule>;
    try {
      schedule = buildPlanSchedule(
        planData,
        startDate,
        options.timeZone ?? 'UTC',
      );
    } catch {
      throw new BadRequestException('Invalid start date or time zone');
    }
    // Validate every workout before writing. Invalid steps must never be silently discarded.
    for (const cycle of planData.cycles)
      for (const week of cycle.weeks)
        for (const session of week.sessions) {
          if (session.workout) {
            const workout = createWorkoutSchema.safeParse(session.workout);
            if (!workout.success)
              throw new BadRequestException(workout.error.issues);
          }
        }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.authorize(user, athleteId, tx);
          if (token) {
            const claimed = await tx.temporaryTrainingPlan.updateMany({
              where: {
                id: token,
                importedAt: null,
                expiresAt: { gt: new Date() },
              },
              data: { importedAt: new Date() },
            });
            if (claimed.count !== 1)
              throw new ConflictException('Plan expired or already imported');
          }
          const data = {
            athleteId,
            name: planData.plan.name,
            description: planData.plan.description,
            goal: planData.plan.goal,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            status: PlanStatus.ACTIVE,
          };
          const duplicate = await tx.trainingPlan.findFirst({
            where: {
              athleteId,
              name: data.name,
              startDate: data.startDate,
              ...(options.replacePlanId
                ? { trainingPlanId: { not: options.replacePlanId } }
                : {}),
            },
          });
          if (duplicate)
            throw new ConflictException(
              'This plan already exists on this date. Select it explicitly to replace it.',
            );
          if (options.replacePlanId) {
            const previous = await tx.trainingPlan.findFirst({
              where: { trainingPlanId: options.replacePlanId, athleteId },
            });
            if (!previous)
              throw new ForbiddenException('You cannot replace this plan');
            const events = await tx.event.findMany({
              where: {
                trainingWeek: {
                  cycle: { trainingPlanId: previous.trainingPlanId },
                },
              },
              include: {
                templates: true,
                training: {
                  include: {
                    workout: { include: { providerWorkoutExports: true } },
                  },
                },
              },
            });
            // Preserve history, comments, completed activities and exported sessions.
            if (
              previous.startDate <= new Date() ||
              events.some(
                (event) =>
                  event.startDate <= new Date() ||
                  event.type !== EVENT_TYPE.TRAINING ||
                  !event.training ||
                  event.training.relatedActivityId ||
                  event.training.messageThreadId ||
                  event.templates.length ||
                  event.training.workout?.providerWorkoutExports.length,
              )
            ) {
              throw new ConflictException(
                'Only future plans without activities, comments, templates or exports can be replaced',
              );
            }
            const eventIds = events.map((event) => event.eventId);
            await tx.eventTraining.deleteMany({
              where: { eventId: { in: eventIds } },
            });
            await tx.event.deleteMany({ where: { eventId: { in: eventIds } } });
            await tx.cycle.deleteMany({
              where: { trainingPlanId: previous.trainingPlanId },
            });
          }
          const plan = options.replacePlanId
            ? await tx.trainingPlan.update({
                where: { trainingPlanId: options.replacePlanId },
                data,
              })
            : await tx.trainingPlan.create({ data });
          for (const cycle of schedule.cycles) {
            const savedCycle = await tx.cycle.create({
              data: {
                athleteId,
                trainingPlanId: plan.trainingPlanId,
                name: cycle.name,
                description: cycle.description,
                phase: cycle.phase,
                color: cycle.color ?? null,
                startDate: cycle.startDate,
                endDate: cycle.endDate,
              },
            });
            for (const week of cycle.weeks) {
              const savedWeek = await tx.trainingWeek.create({
                data: {
                  cycleId: savedCycle.cycleId,
                  weekNumber: week.weekNumber,
                  theme: week.theme ?? null,
                  startDate: week.startDate,
                  endDate: week.endDate,
                },
              });
              for (const session of week.sessions) {
                const event = await tx.event.create({
                  data: {
                    athleteId,
                    name: session.name,
                    type: EVENT_TYPE.TRAINING,
                    trainingWeekId: savedWeek.trainingWeekId,
                    startDate: session.startDate,
                    endDate: session.endDate,
                    training: {
                      create: {
                        sport: session.sport,
                        description: session.description,
                        goalDistance: session.goalDistance ?? null,
                        goalDuration: session.goalDuration ?? null,
                        goalElevationGain: session.goalElevationGain ?? null,
                        goalRpe:
                          session.goalRpe == null ? null : session.goalRpe / 10,
                      },
                    },
                  },
                  include: { training: true },
                });
                if (session.workout && event.training) {
                  await tx.workout.create({
                    data: {
                      eventTrainingId: event.training.eventTrainingId,
                      ...mapWorkoutDtoToPrisma(
                        createWorkoutSchema.parse(session.workout),
                      ),
                    },
                  });
                }
              }
            }
          }
          return plan;
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
      ) {
        throw new ConflictException(
          'The calendar changed during import. Review it before retrying.',
        );
      }
      throw error;
    }
  }
}
