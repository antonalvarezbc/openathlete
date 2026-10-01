import { useUpdateTrainingWeekMutation } from '@/api/week-planning/week-planning.hooks';
import { m } from '@/paraglide/messages';
import { Award, Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PlanWeekContext } from '@openathlete/shared';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useCalendarContext } from './hooks/use-calendar-context';

const phaseLabels: Record<string, () => string> = {
  BASE: m.cycle_phase_base,
  SPECIFIC: m.cycle_phase_specific,
  TAPER: m.cycle_phase_taper,
  RECOVERY: m.cycle_phase_recovery,
  COMPETITION: m.cycle_phase_competition,
};

function WeekTargetsDialog({
  week,
  open,
  onClose,
}: {
  week: PlanWeekContext;
  open: boolean;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState(week.theme ?? '');
  const [hours, setHours] = useState(
    week.targetVolume != null
      ? String(+(week.targetVolume / 3600).toFixed(2))
      : '',
  );
  const [load, setLoad] = useState(
    week.targetLoad != null ? String(Math.round(week.targetLoad)) : '',
  );
  const update = useUpdateTrainingWeekMutation();
  const hoursValue =
    hours.trim() === '' ? null : Number(hours.replace(',', '.'));
  const loadValue = load.trim() === '' ? null : Number(load);
  const invalid =
    (hoursValue !== null &&
      (!Number.isFinite(hoursValue) || hoursValue < 0 || hoursValue > 100)) ||
    (loadValue !== null &&
      (!Number.isFinite(loadValue) || loadValue < 0 || loadValue > 10000));

  const save = () =>
    update.mutate(
      {
        trainingWeekId: week.trainingWeekId,
        body: {
          theme: theme.trim() || null,
          targetVolume:
            hoursValue === null ? null : Math.round(hoursValue * 3600),
          targetLoad: loadValue,
        },
      },
      {
        onSuccess: () => {
          toast.success(m.week_targets_saved());
          onClose();
        },
        onError: () => toast.error(m.week_targets_error()),
      },
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {m.week_targets_title({ week: week.weekNumber })}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="week-theme">{m.week_theme()}</Label>
            <Input
              id="week-theme"
              value={theme}
              maxLength={200}
              placeholder={m.week_theme_placeholder()}
              onChange={(event) => setTheme(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="week-volume">
                {m.week_target_volume_hours()}
              </Label>
              <Input
                id="week-volume"
                inputMode="decimal"
                value={hours}
                placeholder="8"
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="week-load">{m.week_target_load()}</Label>
              <Input
                id="week-load"
                inputMode="numeric"
                value={load}
                placeholder="400"
                onChange={(event) => setLoad(event.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {m.week_targets_help()}
          </p>
          {invalid && (
            <p role="alert" className="text-sm text-destructive">
              {m.week_targets_invalid()}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {m.cancel()}
            </Button>
            <Button
              type="submit"
              disabled={invalid || update.isPending}
              isLoading={update.isPending}
            >
              {m.save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Plan week, cycle phase, theme and races of the displayed week. */
export function CalendarWeekPlanBar() {
  const { weekOverview, allowCreate } = useCalendarContext();
  const [editing, setEditing] = useState(false);
  const week = weekOverview?.planWeek;
  if (!week) return null;
  const phase = week.cycle.phase ? phaseLabels[week.cycle.phase] : undefined;
  const editable =
    allowCreate && ['ACTIVE', 'DRAFT', 'COMPLETED'].includes(week.plan.status);

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-l-4 bg-muted/30 p-3"
      style={
        week.cycle.color ? { borderLeftColor: week.cycle.color } : undefined
      }
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {week.plan.name} ·{' '}
          {m.week_plan_position({
            week: week.weekNumber,
            total: week.plan.weekCount,
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {week.cycle.name}
          {phase ? ` · ${phase()}` : ''}
        </p>
      </div>
      {week.theme && <Badge variant="secondary">{week.theme}</Badge>}
      {week.races.map((race) => (
        <Badge key={race.eventId} variant="outline" className="gap-1">
          <Award className="size-3.5" />
          {race.name} ·{' '}
          {race.priority === 'TARGET'
            ? m.workspace_target_race()
            : m.workspace_preparatory_race()}
        </Badge>
      ))}
      {editable && (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" />
          {m.week_edit_targets()}
        </Button>
      )}
      {editing && (
        <WeekTargetsDialog
          week={week}
          open={editing}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
