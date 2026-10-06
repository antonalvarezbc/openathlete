import { EventAPI } from '@/api/event/event.api';
import { eventKeys } from '@/api/event/event.keys';
import { trainingLoadKeys } from '@/api/training-load/training-load.keys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSpaceContext } from '@/contexts/space';
import { useIsMobile } from '@/hooks/use-mobile';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { isCapacitor } from '@/utils/capacitor';
import { cn } from '@/utils/shadcn';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Event } from '@openathlete/shared';

import { BulkWorkoutSelectionContext } from './contexts/bulk-workout-selection-context';
import { useCalendarContext } from './hooks/use-calendar-context';
import {
  canBulkDeleteWorkout,
  deleteWorkoutsSequentially,
} from './utils/bulk-delete';

/**
 * Bulk selection and deletion of planned workouts. `header` is the calendar
 * header (it holds the select button); the selection bar appears below it
 * only while selecting, so entering selection mode does not move the header.
 */
export function CalendarBulkDelete({
  header,
  children,
}: {
  header?: ReactNode;
  children: ReactNode;
}) {
  const {
    events,
    allowCreate,
    athleteId,
    trainingPlanId,
    displayedMonth,
    view,
    weekStart,
  } = useCalendarContext();
  const { space } = useSpaceContext();
  const allowed = allowCreate && space === 'COACH' && !!athleteId;
  const eligible = useMemo(
    () =>
      new Set(
        allowed
          ? events.filter(canBulkDeleteWorkout).map((e) => e.eventId)
          : [],
      ),
    [allowed, events],
  );
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !isMobile || !selecting) return;
    const measure = () =>
      setToolbarHeight(toolbar.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [isMobile, selecting]);
  // The selection only covers the period on screen: the shown week in week
  // view, so nothing selected out of sight can be deleted
  const selectionScope = `${athleteId}:${trainingPlanId}:${
    view === 'week' ? weekStart.getTime() : displayedMonth.getTime()
  }`;
  useEffect(() => {
    setSelected(new Set());
    setSelecting(false);
    setConfirm(false);
  }, [selectionScope]);

  const selectedEvents = events.filter(
    (e) => selected.has(e.eventId) && eligible.has(e.eventId),
  );
  const selectedIds = new Set(selectedEvents.map((e) => e.eventId));

  // A changed filter or newly completed session must never leave hidden selections.
  useEffect(() => {
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => eligible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [eligible]);

  const toggle = (id: number) => {
    if (!allowed || !selecting || running.current || !eligible.has(id)) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const cancel = () => {
    if (running.current) return;
    setSelected(new Set());
    setSelecting(false);
  };
  const remove = async () => {
    if (!allowed || running.current || !selectedEvents.length) return;
    running.current = true;
    setBusy(true);
    const result = await deleteWorkoutsSequentially(
      selectedEvents.map((e) => e.eventId),
      EventAPI.deleteEvent,
    );
    const deleted = new Set(result.deleted);
    client.setQueriesData<Event[]>(
      { queryKey: [eventKeys.getMyEvents] },
      (old) => old?.filter((e) => !deleted.has(e.eventId)),
    );
    result.deleted.forEach((id) =>
      client.removeQueries({ queryKey: [eventKeys.getEvent, id] }),
    );
    setSelected(new Set(result.failed));
    setConfirm(false);
    setSelecting(result.failed.length > 0);
    if (result.failed.length) {
      toast.error(
        m.bulk_workouts_failed({
          deleted: result.deleted.length,
          failed: result.failed.length,
        }),
      );
    } else {
      toast.success(m.bulk_workouts_deleted({ count: result.deleted.length }));
    }
    await Promise.allSettled([
      client.invalidateQueries({ queryKey: [eventKeys.getMyEvents] }),
      client.invalidateQueries({
        queryKey: [trainingLoadKeys.getWeeklyLoadSummary],
      }),
      client.invalidateQueries({ queryKey: ['managed-plans'] }),
      client.invalidateQueries({ queryKey: ['calendar-plan'] }),
      client.invalidateQueries({ queryKey: ['json-plans'] }),
    ]);
    running.current = false;
    setBusy(false);
  };

  return (
    <BulkWorkoutSelectionContext.Provider
      value={{
        available: allowed,
        selecting: allowed && selecting,
        busy,
        selected: selectedIds,
        eligible,
        toggle,
        start: () => setSelecting(true),
        cancel,
      }}
    >
      {/* The mobile bar is fixed: reserve its height at the top of the flow. */}
      {allowed && isMobile && selecting && (
        <div aria-hidden style={{ height: toolbarHeight }} />
      )}
      {header}
      {allowed && selecting && (
        <div
          ref={toolbarRef}
          data-bulk-workouts-toolbar
          className={cn(
            'z-20 flex flex-wrap items-center gap-2 px-4 py-2',
            isMobile
              ? 'fixed inset-x-0 border-b bg-background shadow-sm'
              : 'rounded-md border bg-muted/40',
            isMobile &&
              (isCapacitor()
                ? 'top-14'
                : 'top-[calc(4rem+env(safe-area-inset-top))]'),
          )}
        >
          <p className="text-sm flex-1 min-w-40" aria-live="polite">
            {m.bulk_workouts_selected({ count: selectedEvents.length })}
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={cancel}
          >
            {m.cancel()}
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={!selectedEvents.length || busy}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-4" />
            {m.bulk_workouts_delete()}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            {m.bulk_workouts_help()}
          </p>
        </div>
      )}
      {children}
      <Dialog
        open={confirm && allowed}
        onOpenChange={(open) => {
          if (!running.current) setConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.bulk_workouts_delete()}</DialogTitle>
            <DialogDescription>
              {m.bulk_workouts_confirm({ count: selectedEvents.length })}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 overflow-y-auto space-y-2 text-sm">
            {selectedEvents.map((e) => (
              <li key={e.eventId} className="break-words">
                <span className="font-medium">{e.name}</span> ·{' '}
                {e.startDate.toLocaleDateString(getLocale())}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              {m.cancel()}
            </Button>
            <Button
              data-bulk-delete-confirm
              variant="destructive"
              disabled={busy || !selectedEvents.length}
              isLoading={busy}
              onClick={() => void remove()}
            >
              {m.delete_()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BulkWorkoutSelectionContext.Provider>
  );
}
