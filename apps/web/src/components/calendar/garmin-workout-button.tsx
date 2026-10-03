import {
  garminRequestErrorText,
  garminWorkoutErrorText,
  useManualGarminConnected,
  useManualGarminWorkoutsQuery,
  useRemoveFromGarminMutation,
  useSendToGarminMutation,
} from '@/api/provider/manual-garmin-workouts.hooks';
import { m } from '@/paraglide/messages';
import { startOfDay } from 'date-fns';
import { Watch } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EVENT_TYPE, Event } from '@openathlete/shared';

import { ConfirmAction } from '../confirm-action';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface P {
  event: Event;
}

/**
 * Sends an upcoming planned session to the athlete's Garmin calendar through
 * the manual connector. Always an explicit action: later edits in OA are shown
 * as "changed" and are only sent again when someone asks.
 */
export function GarminWorkoutButton({ event }: P) {
  // Templates have no athlete and are never sent.
  const athleteId = event.athleteId ?? undefined;
  const upcoming =
    event.type === EVENT_TYPE.TRAINING &&
    new Date(event.startDate) >= startOfDay(new Date());
  const connected = useManualGarminConnected(upcoming ? athleteId : undefined);
  const state = useManualGarminWorkoutsQuery(
    athleteId,
    [event.eventId],
    connected,
  );
  const send = useSendToGarminMutation();
  const remove = useRemoveFromGarminMutation();
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!upcoming || !connected || !athleteId || state.isPending) return null;
  const sent = state.data?.find((item) => item.eventId === event.eventId);

  const run = (mutation: typeof send, success: string, after?: () => void) =>
    mutation.mutate(
      { athleteId, eventIds: [event.eventId] },
      {
        onSuccess: ([result]) => {
          if (result?.ok) toast.success(success);
          else toast.error(garminWorkoutErrorText(result?.code));
          after?.();
        },
        onError: (failure) => toast.error(garminRequestErrorText(failure)),
      },
    );

  const busy = send.isPending || remove.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {sent && (
        <Badge
          variant="outline"
          className={sent.upToDate ? '' : 'border-amber-500 text-amber-700'}
          title={sent.upToDate ? undefined : m.garmin_workout_outdated()}
        >
          <Watch className="mr-1 size-3" />
          {sent.upToDate
            ? m.garmin_workout_sent()
            : m.garmin_workout_outdated()}
        </Badge>
      )}
      {(!sent || !sent.upToDate) && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs md:text-sm"
          disabled={busy}
          isLoading={send.isPending}
          onClick={() => run(send, m.garmin_workout_sent_toast())}
        >
          {sent ? m.garmin_workout_update() : m.garmin_workout_send()}
        </Button>
      )}
      {sent && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs md:text-sm text-muted-foreground"
          disabled={busy}
          onClick={() => setConfirmRemove(true)}
        >
          {m.garmin_workout_remove()}
        </Button>
      )}
      <ConfirmAction
        open={confirmRemove}
        onClose={() => !remove.isPending && setConfirmRemove(false)}
        onConfirm={() =>
          run(remove, m.garmin_workout_removed_toast(), () =>
            setConfirmRemove(false),
          )
        }
        isLoading={remove.isPending}
        title={m.garmin_workout_remove()}
        confirmText={m.garmin_workout_remove()}
        message={m.garmin_workout_remove_confirm()}
      />
    </div>
  );
}
