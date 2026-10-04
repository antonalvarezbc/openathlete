import { ForbiddenException, Injectable } from '@nestjs/common';

import { EventType, InjuryStatus } from '@openathlete/database';
import {
  CoachDashboardAthleteRowDto,
  CoachDashboardResponseDto,
  CoachOverviewQueryDto,
  CoachOverviewResponseDto,
  coachDashboardResponseSchema,
} from '@openathlete/shared';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : null;

@Injectable()
export class CoachService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * How each coached athlete follows the plan: due sessions done (with a
   * linked activity), what was missed, today and the coming days, and signals
   * that need the coach (no recent activity, unlinked activities, injuries).
   */
  async getCoachOverview(
    user: AuthUser,
    { from, today, until }: CoachOverviewQueryDto,
  ): Promise<CoachOverviewResponseDto> {
    if (!user.roles?.includes('COACH')) throw new ForbiddenException();
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const athletes = await this.prisma.athlete.findMany({
      where: { coachAthletes: { some: { userId: user.userId } } },
      select: {
        athleteId: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { athleteId: 'asc' },
    });
    const athleteIds = athletes.map((athlete) => athlete.athleteId);
    if (!athleteIds.length) return { athletes: [] };
    const ofAthletes = { athleteId: { in: athleteIds } };

    const [sessions, activities, latest, injuries] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          ...ofAthletes,
          type: EventType.TRAINING,
          startDate: { gte: from, lt: until },
        },
        select: {
          eventId: true,
          athleteId: true,
          name: true,
          startDate: true,
          training: {
            select: {
              sport: true,
              goalDuration: true,
              relatedActivity: { select: { movingTime: true } },
            },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.event.findMany({
        where: {
          ...ofAthletes,
          type: EventType.ACTIVITY,
          startDate: { gte: from, lt: tomorrow },
        },
        select: {
          athleteId: true,
          activity: {
            select: {
              relatedTraining: { select: { eventTrainingId: true } },
              relatedCompetition: { select: { eventCompetitionId: true } },
            },
          },
        },
      }),
      this.prisma.event.groupBy({
        by: ['athleteId'],
        where: { ...ofAthletes, type: EventType.ACTIVITY },
        _max: { startDate: true },
      }),
      this.prisma.athleteInjury.groupBy({
        by: ['athleteId'],
        where: { ...ofAthletes, status: { not: InjuryStatus.RESOLVED } },
        _count: { _all: true },
      }),
    ]);

    return {
      athletes: athletes.map((athlete) => {
        const own = sessions.filter(
          (session) => session.athleteId === athlete.athleteId,
        );
        const linked = (session: (typeof own)[number]) =>
          !!session.training?.relatedActivity;
        const due = own.filter((session) => session.startDate < today);
        const done = due.filter(linked);
        const missed = due.filter((session) => !linked(session));
        const timed = due.filter((session) => session.training?.goalDuration);
        const plannedTime = timed.reduce(
          (sum, session) => sum + (session.training?.goalDuration ?? 0),
          0,
        );
        const completedTime = timed.reduce(
          (sum, session) =>
            sum + (session.training?.relatedActivity?.movingTime ?? 0),
          0,
        );
        const todays = own.filter(
          (session) =>
            session.startDate >= today && session.startDate < tomorrow,
        );
        const lastActivity = latest.find(
          (row) => row.athleteId === athlete.athleteId,
        )?._max.startDate;
        return {
          athleteId: athlete.athleteId,
          firstName: athlete.user?.firstName ?? null,
          lastName: athlete.user?.lastName ?? null,
          isSelf: athlete.userId === user.userId,
          due: due.length,
          done: done.length,
          compliancePercent: percent(done.length, due.length),
          plannedTime,
          completedTime,
          timePercent: percent(completedTime, plannedTime),
          missed: missed.slice(0, 3).map((session) => ({
            eventId: session.eventId,
            name: session.name,
            startDate: session.startDate.toISOString(),
            sport: session.training?.sport ?? 'OTHER',
          })),
          missedCount: missed.length,
          todayPlanned: todays.length,
          todayDone: todays.filter(linked).length,
          upcoming: own.filter((session) => session.startDate >= tomorrow)
            .length,
          unlinkedActivities: activities.filter(
            (event) =>
              event.athleteId === athlete.athleteId &&
              !event.activity?.relatedTraining &&
              !event.activity?.relatedCompetition,
          ).length,
          lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
          activeInjuries:
            injuries.find((row) => row.athleteId === athlete.athleteId)?._count
              ._all ?? 0,
        };
      }),
    };
  }

  private defaultPeriod(): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 28); // last 4 weeks
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  async getCoachDashboard(
    user: AuthUser,
    period?: { start?: Date; end?: Date },
  ): Promise<CoachDashboardResponseDto> {
    // Resolve period
    const { start, end } = (() => {
      if (period?.start && period?.end)
        return { start: period.start, end: period.end };
      return this.defaultPeriod();
    })();

    // Get coached athletes for this user
    const coachedAthletes = await this.prisma.athlete.findMany({
      where: { coachAthletes: { some: { userId: user.userId } } },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const athleteIds = coachedAthletes.map((a) => a.athleteId);
    if (athleteIds.length === 0) {
      return coachDashboardResponseSchema.parse({
        period: { start: start.toISOString(), end: end.toISOString() },
        athletes: [],
      });
    }

    // Planned training sessions within period
    const plannedByAthlete = await this.prisma.event.groupBy({
      by: ['athleteId'],
      where: {
        athleteId: { in: athleteIds },
        type: EventType.TRAINING,
        startDate: { gte: start, lte: end },
      },
      _count: { _all: true },
    });

    // Planned time: sum of workout estimated_duration when available
    const plannedTimeByAthleteRaw = await this.prisma.event.findMany({
      where: {
        athleteId: { in: athleteIds },
        type: EventType.TRAINING,
        startDate: { gte: start, lte: end },
      },
      select: {
        athleteId: true,
        training: {
          select: {
            goalDuration: true,
          },
        },
      },
    });

    const plannedTimeByAthlete = plannedTimeByAthleteRaw.reduce(
      (acc, e) => {
        const aid = e.athleteId as number;
        const duration = e.training?.goalDuration ?? 0;
        acc[aid] = (acc[aid] || 0) + duration;
        return acc;
      },
      {} as Record<number, number>,
    );

    // Completed activity events within period with activity details
    const activities = await this.prisma.event.findMany({
      where: {
        athleteId: { in: athleteIds },
        type: EventType.ACTIVITY,
        startDate: { gte: start, lte: end },
      },
      select: {
        athleteId: true,
        startDate: true,
        endDate: true,
        activity: { select: { distance: true } },
      },
    });

    const completedByAthlete: Record<
      number,
      { count: number; time: number; distance: number; lastAt: string | null }
    > = {};
    for (const ev of activities) {
      const aid = ev.athleteId as number;
      const startTs = new Date(ev.startDate).getTime();
      const endTs = new Date(ev.endDate).getTime();
      const time = Math.max(0, Math.floor((endTs - startTs) / 1000));
      const distance = ev.activity?.distance ?? 0;
      const iso = new Date(ev.endDate).toISOString();
      if (!completedByAthlete[aid]) {
        completedByAthlete[aid] = {
          count: 0,
          time: 0,
          distance: 0,
          lastAt: null,
        };
      }
      completedByAthlete[aid].count += 1;
      completedByAthlete[aid].time += time;
      completedByAthlete[aid].distance += distance;
      const prev = completedByAthlete[aid].lastAt;
      completedByAthlete[aid].lastAt = !prev || iso > prev ? iso : prev;
    }

    // Build rows
    const rows: CoachDashboardAthleteRowDto[] = coachedAthletes.map((a) => {
      const plannedCount =
        plannedByAthlete.find((p) => p.athleteId === a.athleteId)?._count
          ._all || 0;
      const plannedTime = plannedTimeByAthlete[a.athleteId] || 0;
      const completed = completedByAthlete[a.athleteId] || {
        count: 0,
        time: 0,
        distance: 0,
        lastAt: null,
      };
      const compliance =
        plannedCount > 0
          ? Math.round((completed.count / plannedCount) * 100)
          : 0;
      return {
        athleteId: a.athleteId,
        firstName: a.user?.firstName ?? null,
        lastName: a.user?.lastName ?? null,
        email: a.user?.email ?? null,
        start: start.toISOString(),
        end: end.toISOString(),
        plannedSessions: plannedCount,
        completedSessions: completed.count,
        plannedTime: plannedTime,
        completedTime: completed.time,
        completedDistance: completed.distance,
        lastActivityAt: completed.lastAt,
        compliancePercent: compliance,
      };
    });

    return coachDashboardResponseSchema.parse({
      period: { start: start.toISOString(), end: end.toISOString() },
      athletes: rows,
    });
  }
}
