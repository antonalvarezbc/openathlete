/** Only uncompleted planned training sessions are eligible for bulk deletion. */
export function canBulkDeleteWorkout(event: {
  type: string;
  relatedActivity?: unknown;
  relatedActivityId?: number | null;
}) {
  return (
    event.type === 'TRAINING' &&
    !event.relatedActivity &&
    !event.relatedActivityId
  );
}

/** Keep requests sequential: existing deletion can also remove provider exports. */
export async function deleteWorkoutsSequentially(
  ids: number[],
  remove: (id: number) => Promise<unknown>,
) {
  const deleted: number[] = [];
  const failed: number[] = [];
  for (const id of new Set(ids)) {
    try {
      await remove(id);
      deleted.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { deleted, failed };
}
