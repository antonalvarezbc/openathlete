import { randomUUID } from 'node:crypto';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BackfillWorkerResult } from './manual-garmin-backfill-worker';

export type BackfillProgress = {
  runId: string;
  status: 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'PAUSED' | 'FAILED';
  reason?: BackfillWorkerResult['reason'] | 'INTERRUPTED';
  total: number;
  checked: number;
  updated: number;
  cached: number;
  downloaded: number;
  failed: string[];
  incompatible: string[];
  remaining: number;
  nextRequestAt?: string;
  startedAt: string;
  updatedAt: string;
};

export const backfillActive = (state?: BackfillProgress) =>
  state?.status === 'RUNNING' || state?.status === 'STOPPING';

export function cancelPath(directory: string, runId: string) {
  return join(directory, '.private', `backfill-${runId}.cancel`);
}

export async function readBackfill(
  directory: string,
): Promise<BackfillProgress | undefined> {
  try {
    const state: BackfillProgress = JSON.parse(
      await readFile(
        join(directory, '.private/fit-backfill-state.json'),
        'utf8',
      ),
    );
    // A crashed/restarted API never resumes remote work automatically. The
    // Python process also stops if the parent closes its acknowledgement pipe.
    if (
      backfillActive(state) &&
      Date.now() - Date.parse(state.updatedAt) > 90_000
    )
      return {
        ...state,
        status: 'PAUSED',
        reason: 'INTERRUPTED',
        nextRequestAt: undefined,
      };
    if (backfillActive(state)) {
      try {
        await stat(cancelPath(directory, state.runId));
        return { ...state, status: 'STOPPING' };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function saveBackfill(directory: string, state: BackfillProgress) {
  const file = join(directory, '.private/fit-backfill-state.json');
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, file);
}

export async function remoteBlockedUntil(
  root: string,
): Promise<string | undefined> {
  try {
    const state = JSON.parse(
      await readFile(join(root, '.private/request-safety.json'), 'utf8'),
    );
    const until = Math.max(
      Date.parse(state.blockedUntil ?? '') || 0,
      Date.parse(state.cooldownUntil ?? '') || 0,
    );
    return until > Date.now() ? new Date(until).toISOString() : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    // Do not silently ignore an unreadable guard and imply remote access is safe.
    throw error;
  }
}
