import {
  useCopyEventsMutation,
  useDeleteEventsMutation,
  useMoveEventsMutation,
} from '@/api/week-planning/week-planning.hooks';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getDateLocale } from '@/utils/locales';
import { addDays, format, isValid, parseISO } from 'date-fns';
import {
  ClipboardPaste,
  Copy,
  MoreHorizontal,
  MoveRight,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Event, EventBatchResult } from '@openathlete/shared';

import { ConfirmAction } from '../confirm-action';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useCalendarContext } from './hooks/use-calendar-context';
import { localWeekStart } from './hooks/use-calendar-data';
import { isCopyable, isMovable, shiftToWeek } from './utils/week-stats';

function weekLabel(weekStart: Date) {
  const locale = getDateLocale(getLocale());
  const end = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  })} – ${end.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

function reportBatch(result: EventBatchResult, success: string) {
  if (result.succeeded.length) toast.success(success);
  if (result.failed.length)
    toast.error(
      m.week_action_partial({
        count: result.failed.length,
        reason: result.failed[0].message,
      }),
    );
}

interface P {
  /** Every event of the displayed week (including sessions already done). */
  weekEvents: Event[];
}

/** Coach actions on the whole displayed week. */
export function CalendarWeekActions({ weekEvents }: P) {
  const {
    weekStart,
    weekClipboard,
    setWeekClipboard,
    trainingPlanId,
    goToWeek,
  } = useCalendarContext();
  const copyMutation = useCopyEventsMutation();
  const moveMutation = useMoveEventsMutation();
  const deleteMutation = useDeleteEventsMutation();
  const [confirmClear, setConfirmClear] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(() =>
    format(addDays(weekStart, 7), 'yyyy-MM-dd'),
  );
  const busy =
    copyMutation.isPending ||
    moveMutation.isPending ||
    deleteMutation.isPending;

  const copyable = weekEvents.filter(isCopyable);
  const movable = weekEvents.filter(isMovable);
  const clipboardHere =
    weekClipboard && weekClipboard.weekStart.getTime() === weekStart.getTime();

  const copyWeek = () => {
    setWeekClipboard({ weekStart, events: copyable });
    toast.success(m.week_copied({ count: copyable.length }));
  };

  const pasteWeek = () => {
    if (!weekClipboard) return;
    copyMutation.mutate(
      {
        trainingPlanId,
        items: weekClipboard.events.map((event) => ({
          eventId: event.eventId,
          ...shiftToWeek(event, weekClipboard.weekStart, weekStart),
        })),
      },
      {
        onSuccess: (result) =>
          reportBatch(
            result,
            m.week_pasted({ count: result.succeeded.length }),
          ),
        onError: () => toast.error(m.week_action_error()),
      },
    );
  };

  const parsedTarget = parseISO(moveTarget);
  const targetWeek = isValid(parsedTarget)
    ? localWeekStart(parsedTarget)
    : undefined;
  const moveWeek = () => {
    if (!targetWeek) return;
    moveMutation.mutate(
      {
        items: movable.map((event) => ({
          eventId: event.eventId,
          ...shiftToWeek(event, weekStart, targetWeek),
        })),
      },
      {
        onSuccess: (result) => {
          reportBatch(result, m.week_moved({ count: result.succeeded.length }));
          setMoveOpen(false);
          if (result.succeeded.length) goToWeek(targetWeek);
        },
        onError: () => toast.error(m.week_action_error()),
      },
    );
  };

  const clearWeek = () =>
    deleteMutation.mutate(
      { eventIds: movable.map((event) => event.eventId) },
      {
        onSuccess: (result) => {
          reportBatch(
            result,
            m.week_cleared({ count: result.succeeded.length }),
          );
          setConfirmClear(false);
        },
        onError: () => toast.error(m.week_action_error()),
      },
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            <MoreHorizontal className="size-4" />
            {m.week_actions()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem disabled={!copyable.length} onSelect={copyWeek}>
            <Copy className="size-4" />
            {m.week_copy()}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!weekClipboard?.events.length || !!clipboardHere}
            onSelect={pasteWeek}
          >
            <ClipboardPaste className="size-4" />
            {weekClipboard?.events.length
              ? m.week_paste_from({ week: weekLabel(weekClipboard.weekStart) })
              : m.week_paste()}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!movable.length}
            onSelect={() => {
              setMoveTarget(format(addDays(weekStart, 7), 'yyyy-MM-dd'));
              setMoveOpen(true);
            }}
          >
            <MoveRight className="size-4" />
            {m.week_move()}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!movable.length}
            onSelect={() => setConfirmClear(true)}
          >
            <Trash2 className="size-4" />
            {m.week_clear()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={moveOpen}
        onOpenChange={(open) => !open && setMoveOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.week_move()}</DialogTitle>
            <DialogDescription>
              {m.week_move_help({ count: movable.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="week-move-target">{m.week_move_target()}</Label>
            <Input
              id="week-move-target"
              type="date"
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            />
            {targetWeek && (
              <p className="text-sm text-muted-foreground">
                {m.week_move_to({ week: weekLabel(targetWeek) })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              {m.cancel()}
            </Button>
            <Button
              onClick={moveWeek}
              disabled={
                !targetWeek ||
                targetWeek.getTime() === weekStart.getTime() ||
                moveMutation.isPending
              }
              isLoading={moveMutation.isPending}
            >
              {m.week_move_confirm()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clearWeek}
        title={m.week_clear()}
        message={m.week_clear_confirm({ count: movable.length })}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
