import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Athlete, SportType } from '@openathlete/database';
import { BestRecordDto, RECORD_TYPE } from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
  ) {}

  /** The athlete whose records the user asked for, once allowed to read them. */
  private async targetAthleteId(
    user: AuthUser,
    athleteId?: Athlete['athleteId'],
  ): Promise<number> {
    if (!athleteId) {
      if (!user.athlete?.athleteId) {
        throw new NotFoundException('Athlete not found');
      }
      return user.athlete.athleteId;
    }

    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
    });
    if (!athlete) {
      throw new NotFoundException('Athlete not found');
    }
    const ability = await this.abilities.getFor({ user });
    if (!ability.can('read', subject('Athlete', athlete))) {
      throw new ForbiddenException('Not allowed to access this athlete');
    }
    return athleteId;
  }

  /**
   * Sports with records, the most frequent first: a records curve only
   * makes sense for one sport.
   */
  async getRecordSports(
    user: AuthUser,
    athleteId?: Athlete['athleteId'],
  ): Promise<SportType[]> {
    const targetAthleteId = await this.targetAthleteId(user, athleteId);
    const rows = await this.prisma.$queryRaw<{ sport: SportType }[]>`
      SELECT a.sport FROM record r
      JOIN event_activity a ON a.event_activity_id = r.event_activity_id
      WHERE r.athlete_id = ${targetAthleteId}
      GROUP BY a.sport
      ORDER BY count(DISTINCT a.event_activity_id) DESC, a.sport`;
    return rows.map((row) => row.sport);
  }

  /**
   * Best record at each distance or duration, for one sport, among the
   * activities between `from` (included) and `to` (excluded).
   */
  async getRecords(
    user: AuthUser,
    {
      sport,
      athleteId,
      from,
      to,
    }: {
      sport?: SportType;
      athleteId?: Athlete['athleteId'];
      from?: Date;
      to?: Date;
    },
  ): Promise<BestRecordDto[]> {
    const targetAthleteId = await this.targetAthleteId(user, athleteId);

    const records = await this.prisma.record.findMany({
      where: {
        athleteId: targetAthleteId,
        ...(sport && { eventActivity: { sport } }),
        ...((from || to) && { date: { gte: from, lt: to } }),
      },
      include: {
        eventActivity: {
          select: { eventId: true, event: { select: { name: true } } },
        },
      },
    });

    const best = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const key = `${record.type}:${record.distance ?? ''}:${record.duration ?? ''}`;
      const current = best.get(key);
      // Pace records hold a time: lower is better
      const better =
        !current ||
        (record.type === 'SPEED'
          ? record.value < current.value
          : record.value > current.value);
      if (better) best.set(key, record);
    }

    return [...best.values()].map((record) => ({
      recordId: record.recordId,
      type: record.type as RECORD_TYPE,
      distance: record.distance,
      duration: record.duration,
      value: record.value,
      date: record.date,
      eventId: record.eventActivity?.eventId ?? null,
      activityName: record.eventActivity?.event.name ?? null,
    }));
  }
}
