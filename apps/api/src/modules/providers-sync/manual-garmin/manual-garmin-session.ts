import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { manualGarminConnection } from './manual-garmin.schema';

/**
 * Directory of one athlete's Garmin session, sync state and FIT cache. Only
 * a database athlete ID becomes a path segment, never text a user sent.
 */
export function manualGarminAccountDirectory(root: string, athleteId: number) {
  if (!isAbsolute(root)) throw new Error('Invalid Garmin directory');
  if (!Number.isSafeInteger(athleteId) || athleteId <= 0)
    throw new Error('Invalid athlete ID');
  return join(root, 'accounts', String(athleteId));
}

/** Athlete of the single connection configured from the command line. */
async function legacyManualGarminAthleteId(root: string) {
  try {
    return manualGarminConnection.parse(
      JSON.parse(
        await readFile(join(root, '.private/connection.json'), 'utf8'),
      ),
    ).athleteId;
  } catch {
    return undefined;
  }
}

/**
 * Forgets an athlete's Garmin session: their tokens, link, sync state and
 * FIT cache. When the command-line connection at the root is theirs, its
 * files go too, but the lock and request pacing shared by every athlete
 * stay. Missing files are not an error.
 */
export async function removeManualGarminSession(
  root: string,
  athleteId: number,
) {
  await rm(manualGarminAccountDirectory(root, athleteId), {
    recursive: true,
    force: true,
  });
  if ((await legacyManualGarminAthleteId(root)) !== athleteId) return;
  const legacy = join(root, '.private');
  for (const entry of [
    'tokens',
    'fits',
    'sync-state.json',
    'fit-backfill-state.json',
  ])
    await rm(join(legacy, entry), { recursive: true, force: true });
  // The link goes last: if a removal fails, it still points at the files
  // left, and disconnecting again finishes the job.
  await rm(join(legacy, 'connection.json'), { force: true });
}
