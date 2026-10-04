import type { Prisma } from '@openathlete/database';

/**
 * A user with both roles can coach their own athlete profile: a regular
 * coach–athlete link where the coach is the athlete's own user. Everything a
 * coach can do then works on their own calendar without special cases.
 */

/** Links that are a coach coaching their own athlete profile. */
export const selfCoachingLink = (userId: number) => ({
  userId,
  athlete: { userId },
});

/** Links to other athletes only: what athlete limits and coach lists count. */
export const otherAthleteLinks = (userId: number) => ({
  userId,
  athlete: { userId: { not: userId } },
});

/**
 * Creates the self-coaching link once. The user row is locked so two
 * concurrent requests cannot create duplicates (links have no unique key).
 */
export async function ensureSelfCoachingLink(
  tx: Prisma.TransactionClient,
  userId: number,
  athleteId: number,
) {
  await tx.$queryRaw`SELECT 1 FROM "user" WHERE user_id = ${userId} FOR UPDATE`;
  const existing = await tx.coachAthlete.findFirst({
    where: { userId, athleteId },
    select: { coachAthleteId: true },
  });
  if (!existing) await tx.coachAthlete.create({ data: { userId, athleteId } });
  return { created: !existing };
}
