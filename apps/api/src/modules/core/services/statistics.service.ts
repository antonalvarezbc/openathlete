import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Athlete,
  Event,
  EventActivity,
  EventType,
} from '@openathlete/database';
import {
  GetStatisticsForPeriodDto,
  SPORT_TYPE,
  WeeklyVolumeDto,
} from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
  ) {}

  private computeBasicStatisticsForActivities(
    activities: (Event & { activity: EventActivity | null })[],
  ): {
    duration: number;
    distance: number;
    elevationGain: number;
    count: number;
  } {
    const duration = activities.reduce((acc, activity) => {
      const start = new Date(activity.startDate);
      const end = new Date(activity.endDate);
      const diff = end.getTime() - start.getTime();
      const seconds = diff / 1000;
      return acc + seconds;
    }, 0);
    const distance = activities.reduce((acc, activity) => {
      if (activity.activity?.distance) {
        return acc + activity.activity.distance;
      }
      return acc;
    }, 0);
    const elevationGain = activities.reduce((acc, activity) => {
      if (activity.activity?.elevationGain) {
        return acc + activity.activity.elevationGain;
      }
      return acc;
    }, 0);

    return {
      duration,
      distance,
      elevationGain,
      count: activities.length,
    };
  }

  /**
   * Checks the user may read this athlete. Asking CASL about 'Athlete' in
   * general would let anyone read any athlete's statistics by id.
   */
  private async assertCanRead(user: AuthUser, athleteId: number) {
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
    });
    if (!athlete) throw new NotFoundException('Athlete not found');
    const ability = await this.abilities.getFor({ user });
    if (!ability.can('read', subject('Athlete', athlete))) {
      throw new ForbiddenException('Not allowed to access this athlete');
    }
  }

  /**
   * Volume of each of the last `weeks` weeks (Monday to Sunday, UTC), by
   * sport. Weeks without activity are included, empty.
   */
  async getWeeklyVolume(
    user: AuthUser,
    athleteId: Athlete['athleteId'],
    weeks: number,
    now = new Date(),
  ): Promise<WeeklyVolumeDto[]> {
    await this.assertCanRead(user, athleteId);

    const currentWeek = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // getUTCDay: Sunday is 0, the week starts on Monday
    currentWeek.setUTCDate(
      currentWeek.getUTCDate() - ((currentWeek.getUTCDay() + 6) % 7),
    );
    const from = new Date(currentWeek);
    from.setUTCDate(from.getUTCDate() - 7 * (weeks - 1));

    const rows = await this.prisma.$queryRaw<
      {
        week: Date;
        sport: SPORT_TYPE;
        duration: number;
        distance: number;
        elevation_gain: number;
        count: number;
      }[]
    >`
      SELECT date_trunc('week', e.start_date) AS week, a.sport,
        sum(extract(epoch FROM e.end_date - e.start_date))::float8 AS duration,
        sum(a.distance)::float8 AS distance,
        sum(a.elevation_gain)::float8 AS elevation_gain,
        count(*)::int AS count
      FROM event e
      JOIN event_activity a ON a.event_id = e.event_id
      WHERE e.athlete_id = ${athleteId}
        AND e.type = 'ACTIVITY'
        AND e.start_date >= ${from}
      GROUP BY 1, 2
      ORDER BY 1, 3 DESC`;

    return Array.from({ length: weeks }, (_, index) => {
      const weekStart = new Date(from);
      weekStart.setUTCDate(weekStart.getUTCDate() + 7 * index);
      return {
        weekStart,
        sports: rows
          .filter((row) => row.week.getTime() === weekStart.getTime())
          .map((row) => ({
            sport: row.sport,
            duration: row.duration,
            distance: row.distance,
            elevationGain: row.elevation_gain,
            count: row.count,
          })),
      };
    });
  }

  async getStatisticsForPeriod(
    user: AuthUser,
    athleteId: Athlete['athleteId'],
    startDate: Date,
    endDate: Date,
  ): Promise<GetStatisticsForPeriodDto> {
    await this.assertCanRead(user, athleteId);

    const events = await this.prisma.event.findMany({
      where: {
        athleteId: athleteId,
        type: EventType.ACTIVITY,
        startDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        activity: true,
      },
    });

    const groupedBySport = events.reduce(
      (acc, event) => {
        const sport = event.activity?.sport as SPORT_TYPE;
        if (!acc[sport]) {
          acc[sport] = [];
        }
        acc[sport].push(event);
        return acc;
      },
      {} as Record<SPORT_TYPE, (Event & { activity: EventActivity | null })[]>,
    );

    const sportStatistics = Object.entries(groupedBySport).map(
      ([sport, events]) => {
        return {
          sport: sport as SPORT_TYPE,
          ...this.computeBasicStatisticsForActivities(events),
        };
      },
    );

    return {
      ...this.computeBasicStatisticsForActivities(events),
      sports: sportStatistics,
    };
  }
}
