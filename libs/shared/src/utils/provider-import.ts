/**
 * A historical import with no outcome after this long is treated as lost
 * (worker restarted, Garmin backfill that never completed...) and can be
 * requested again.
 */
export const FULL_IMPORT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface FullImportState {
  fullImportRequestedAt: Date | string | null;
  fullImportCompletedAt: Date | string | null;
}

/** Whether a historical import is queued or running for a provider account. */
export function isFullImportInProgress(
  state: FullImportState,
  now: Date = new Date(),
): boolean {
  if (!state.fullImportRequestedAt || state.fullImportCompletedAt) {
    return false;
  }
  const requestedAt = new Date(state.fullImportRequestedAt).getTime();
  return now.getTime() - requestedAt < FULL_IMPORT_STALE_AFTER_MS;
}
