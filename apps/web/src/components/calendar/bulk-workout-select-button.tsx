import { m } from '@/paraglide/messages';
import { ListChecks } from 'lucide-react';

import { Button } from '../ui/button';
import { useBulkWorkoutSelection } from './contexts/bulk-workout-selection-context';

/**
 * Toggle for selecting planned workouts in bulk, shown with the other
 * calendar buttons. Highlighted while selecting; pressing it again leaves
 * selection mode. Renders nothing where bulk selection is not available.
 */
export function BulkWorkoutSelectButton({
  iconOnlyOnMobile = false,
}: {
  /** Hide the label below the md breakpoint, where the header row is narrow. */
  iconOnlyOnMobile?: boolean;
}) {
  const bulk = useBulkWorkoutSelection();
  if (!bulk?.available) return null;
  const { selecting, busy, eligible, start, cancel } = bulk;

  return (
    <Button
      variant={selecting ? 'default' : 'outline'}
      aria-pressed={selecting}
      aria-label={m.bulk_workouts_select()}
      data-bulk-workouts-select
      disabled={busy || (!selecting && !eligible.size)}
      onClick={() => (selecting ? cancel() : start())}
      className={
        iconOnlyOnMobile ? 'max-md:size-9 max-md:has-[>svg]:px-0' : undefined
      }
    >
      <ListChecks className="size-4" />
      <span className={iconOnlyOnMobile ? 'hidden md:inline' : undefined}>
        {m.bulk_workouts_select()}
      </span>
    </Button>
  );
}
