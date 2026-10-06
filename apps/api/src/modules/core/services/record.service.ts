import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Athlete,
  Record as PrismaRecord,
  RecordType,
  SportType,
} from '@openathlete/database';

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

  async getRecords(
    user: AuthUser,
    sport?: SportType,
    athleteId?: Athlete['athleteId'],
  ): Promise<PrismaRecord[]> {
    const targetAthleteId = await this.targetAthleteId(user, athleteId);

    const records = await this.prisma.record.findMany({
      where: {
        athleteId: targetAthleteId,
        ...(sport && {
          eventActivity: {
            sport,
          },
        }),
      },
    });

    const bestRecords = records.reduce(
      (acc, record) => {
        const { type, distance } = record;
        if (!acc[type]) {
          acc[type] = {};
        }
        if (!acc[type][distance]) {
          acc[type][distance] = record;
        } else {
          if (record.type === 'SPEED') {
            if (record.value < acc[type][distance].value) {
              acc[type][distance] = record;
            }
          } else {
            if (record.value > acc[type][distance].value) {
              acc[type][distance] = record;
            }
          }
        }
        return acc;
      },
      {} as Record<RecordType, Record<string, PrismaRecord>>,
    );

    const bestRecordsArray = Object.values(bestRecords).flatMap((type) =>
      Object.values(type),
    );

    return bestRecordsArray;
  }
}
