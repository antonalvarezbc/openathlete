import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Athlete } from '@openathlete/database';
import { CreateAthleteInjury, SaveAthleteInjury } from '@openathlete/shared';
import { AthleteInjury, INJURY_STATUS } from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { authorizePlanAthlete } from '../helpers/plan-access';

@Injectable()
export class InjuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
  ) {}

  async create(user: AuthUser, data: CreateAthleteInjury) {
    return this.prisma.$transaction(async (tx) => {
      await authorizePlanAthlete(tx, user, data.athleteId);
      return tx.athleteInjury.create({
        data: { athleteId: data.athleteId, ...data.injury },
      });
    });
  }

  async update(user: AuthUser, injuryId: number, data: SaveAthleteInjury) {
    return this.prisma.$transaction(async (tx) => {
      const injury = await tx.athleteInjury.findUnique({
        where: { athleteInjuryId: injuryId },
      });
      if (!injury) throw new NotFoundException('Injury not found');
      await authorizePlanAthlete(tx, user, injury.athleteId);
      return tx.athleteInjury.update({
        where: { athleteInjuryId: injuryId },
        data,
      });
    });
  }

  /**
   * Get all injuries for the authenticated user or specific athlete
   */
  async getInjuries(
    user: AuthUser,
    athleteId?: Athlete['athleteId'],
  ): Promise<AthleteInjury[]> {
    const ability = await this.abilities.getFor({ user });

    // Determine which athlete's injuries to fetch
    let targetAthleteId: number;

    if (athleteId) {
      // Check if user can access this athlete's data
      const athlete = await this.prisma.athlete.findUnique({
        where: { athleteId: athleteId },
      });

      if (!athlete) {
        throw new NotFoundException('Athlete not found');
      }

      if (!ability.can('read', subject('Athlete', athlete))) {
        throw new ForbiddenException('Not allowed to access this athlete');
      }

      targetAthleteId = athleteId;
    } else {
      // Use current user's athlete ID
      const athlete = await this.prisma.athlete.findFirst({
        where: {
          user: {
            userId: user.userId,
          },
        },
        select: {
          athleteId: true,
        },
      });

      if (!athlete) {
        throw new NotFoundException('Athlete not found');
      }

      targetAthleteId = athlete.athleteId;
    }

    const injuries = await this.prisma.athleteInjury.findMany({
      where: {
        athleteId: targetAthleteId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Map Prisma injury_status to shared INJURY_STATUS enum
    const mappedInjuries = injuries.map((injury) => ({
      ...injury,
      status: injury.status as INJURY_STATUS,
    }));

    return mappedInjuries;
  }
}
