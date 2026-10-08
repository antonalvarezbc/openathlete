import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuthUser } from '../auth/decorators/user.decorator';
import { accessibleAthleteConditions } from '../core/helpers/plan-access';
import { PrismaService } from '../prisma/services/prisma.service';

/**
 * Athlete the user may read, under the same role rules as the API: their own
 * profile with the ATHLETE role, an athlete they coach with the COACH role.
 * Without athleteId, the user's own athlete profile.
 */
export async function resolveAthleteId(
  prisma: PrismaService,
  user: AuthUser,
  athleteId?: number,
): Promise<number> {
  if (!athleteId) {
    const own = user.roles?.includes('ATHLETE')
      ? await prisma.athlete.findFirst({
          where: { userId: user.userId },
          select: { athleteId: true },
        })
      : null;
    if (!own)
      throw new NotFoundException(
        'No athlete profile; pass the athleteId of an athlete you coach',
      );
    return own.athleteId;
  }
  const conditions = accessibleAthleteConditions(user);
  const athlete = conditions.length
    ? await prisma.athlete.findFirst({
        where: { athleteId, OR: conditions },
        select: { athleteId: true },
      })
    : null;
  if (!athlete) throw new ForbiddenException('You cannot access this athlete');
  return athlete.athleteId;
}

/** Shortens free text supplied by athletes so tool output stays bounded. */
export const clipText = (value: string | null | undefined, max = 400) => {
  if (!value) return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text || undefined;
};

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Monday 00:00 UTC of the week containing the given day. */
export function utcWeekStart(day: Date): Date {
  const start = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}
