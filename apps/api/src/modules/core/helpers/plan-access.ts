import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { Prisma } from '@openathlete/database';

import { AuthUser } from '../../auth/decorators/user.decorator';

/**
 * Which athletes a user may access, as alternatives for a Prisma `OR`: their
 * own profile with the ATHLETE role, the athletes they coach with the COACH
 * role. A coach link left after the coach role is removed grants nothing.
 * Empty when the user has neither role.
 */
export function accessibleAthleteConditions(
  user: AuthUser,
): Prisma.AthleteWhereInput[] {
  return [
    ...(user.roles?.includes('ATHLETE') ? [{ userId: user.userId }] : []),
    ...(user.roles?.includes('COACH')
      ? [{ coachAthletes: { some: { userId: user.userId } } }]
      : []),
  ];
}

export async function authorizePlanAthlete(
  db: Prisma.TransactionClient,
  user: AuthUser,
  athleteId: number,
) {
  if (!user.roles?.includes('COACH'))
    throw new ForbiddenException('Coach role required');
  const athlete = await db.athlete.findFirst({
    where: { athleteId, OR: accessibleAthleteConditions(user) },
  });
  if (!athlete) throw new ForbiddenException('You cannot manage this athlete');
}

export async function findPlanWeek(
  db: Prisma.TransactionClient,
  trainingPlanId: number,
  athleteId: number,
  startDate: Date,
  endDate: Date,
) {
  const plan = await db.trainingPlan.findFirst({
    where: { trainingPlanId, athleteId, status: { in: ['DRAFT', 'ACTIVE'] } },
  });
  if (
    !plan ||
    startDate < plan.startDate ||
    endDate > plan.endDate ||
    endDate < startDate
  ) {
    throw new BadRequestException('Session must be inside an editable plan');
  }
  const week = await db.trainingWeek.findFirst({
    where: {
      cycle: { trainingPlanId },
      startDate: { lte: startDate },
      endDate: { gte: startDate },
    },
    orderBy: { startDate: 'asc' },
  });
  if (!week) throw new BadRequestException('No plan week covers this date');
  return week.trainingWeekId;
}

/** Calendar edits must preserve race roles and dates across every linked plan. */
export async function validateLinkedRaceDates(
  db: Prisma.TransactionClient,
  eventId: number,
  start: Date,
  end: Date,
) {
  const links = await db.trainingPlanRace.findMany({
    where: { competition: { eventId } },
    include: {
      plan: {
        include: {
          races: { include: { competition: { include: { event: true } } } },
        },
      },
    },
  });
  for (const link of links) {
    if (start < link.plan.startDate || end > link.plan.endDate || end < start)
      throw new BadRequestException('Race must remain within its linked plans');
    const others = link.plan.races.filter(
      (race) => race.eventCompetitionId !== link.eventCompetitionId,
    );
    if (
      others.some((race) =>
        link.priority === 'TARGET'
          ? race.competition.event.startDate >= start
          : race.priority === 'TARGET' &&
            race.competition.event.startDate <= start,
      )
    )
      throw new BadRequestException(
        'Preparation races must precede the target race',
      );
  }
}
