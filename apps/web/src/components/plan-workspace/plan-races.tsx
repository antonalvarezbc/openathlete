import {
  ManagedPlan,
  ManagedPlanRace,
  PlanWorkspaceAPI,
} from '@/api/plan-workspace/plan-workspace.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { sportTypeLabelMap } from '@/utils/label-map/core';
import { useQuery } from '@tanstack/react-query';
import { Flag, Plus, Trophy } from 'lucide-react';
import { useState } from 'react';

import { SPORT_TYPE } from '@openathlete/shared';

import {
  Field,
  dateInput,
  displayDate,
  selectClass,
  workspaceError,
} from './helpers';

export function PlanRaces({
  plan,
  onChanged,
}: {
  plan: ManagedPlan;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ManagedPlanRace | 'new' | null>(null);
  const [mode, setMode] = useState('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const competitions = useQuery({
    queryKey: ['plan-competitions', plan.trainingPlanId],
    queryFn: () => PlanWorkspaceAPI.competitions(plan.trainingPlanId),
    enabled: editing === 'new',
  });
  const race = editing && editing !== 'new' ? editing : undefined;
  const editable = ['DRAFT', 'ACTIVE'].includes(plan.status);
  const open = (value: ManagedPlanRace | 'new') => {
    setError('');
    setMode('new');
    setEditing(value);
  };
  const priorityOptions = (
    <>
      <option value="TARGET">{m.workspace_target_race()}</option>
      <option value="PREPARATORY">{m.workspace_preparatory_race()}</option>
    </>
  );
  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Trophy className="size-5" />
          {m.workspace_races()}
        </h3>
        {editable && (
          <Button variant="outline" onClick={() => open('new')}>
            <Plus className="size-4" />
            {m.workspace_add_race()}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {m.workspace_races_help()}
      </p>
      {plan.races.length === 0 && (
        <p className="text-sm">{m.workspace_no_races()}</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {[...plan.races]
          .sort((a, b) =>
            a.competition.event.startDate.localeCompare(
              b.competition.event.startDate,
            ),
          )
          .map((item) => (
            <div
              key={item.eventCompetitionId}
              className="space-y-2 rounded-lg border p-4"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <Flag className="size-4" />
                {item.priority === 'TARGET'
                  ? m.workspace_target_race()
                  : m.workspace_preparatory_race()}
              </p>
              <p className="font-semibold break-words">
                {item.competition.event.name}
              </p>
              <p className="text-sm">
                {displayDate(item.competition.event.startDate)} ·{' '}
                {sportTypeLabelMap[item.competition.sport]}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.competition.goalDistance != null &&
                  `${item.competition.goalDistance / 1000} km`}
                {item.competition.goalElevationGain != null &&
                  ` · +${item.competition.goalElevationGain} m`}
              </p>
              {item.competition.description && (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {item.competition.description}
                </p>
              )}
              {editable && (
                <div className="flex flex-wrap gap-2">
                  {!item.competition.relatedActivityId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => open(item)}
                    >
                      {m.edit()}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await PlanWorkspaceAPI.unlinkRace(
                          plan.trainingPlanId,
                          item.eventCompetitionId,
                        );
                        await onChanged();
                      } catch (err) {
                        setError(workspaceError(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {m.workspace_unlink_race()}
                  </Button>
                </div>
              )}
            </div>
          ))}
      </div>
      {error && !editing && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {editing && (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value && !busy) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {race ? m.edit() : m.workspace_add_race()}
              </DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setBusy(true);
                setError('');
                const priority = String(form.get('priority')) as
                  'TARGET' | 'PREPARATORY';
                const number = (name: string) =>
                  form.get(name) ? Number(form.get(name)) : null;
                try {
                  if (mode === 'existing')
                    await PlanWorkspaceAPI.linkRace(plan.trainingPlanId, {
                      eventId: Number(form.get('eventId')),
                      priority,
                    });
                  else
                    await PlanWorkspaceAPI.saveRace(
                      plan.trainingPlanId,
                      {
                        priority,
                        name: String(form.get('name')),
                        description: String(form.get('description')),
                        startDate: new Date(
                          `${form.get('date')}T${form.get('time')}`,
                        ),
                        sport: String(form.get('sport')) as SPORT_TYPE,
                        goalDistance:
                          number('distance') == null
                            ? null
                            : number('distance')! * 1000,
                        goalElevationGain: number('elevation'),
                        goalDuration:
                          number('duration') == null
                            ? null
                            : number('duration')! * 60,
                      },
                      race?.eventCompetitionId,
                    );
                  await onChanged();
                  setEditing(null);
                } catch (err) {
                  setError(workspaceError(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {!race && (
                <Field label={m.workspace_race_source()}>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className={selectClass}
                  >
                    <option value="new">{m.workspace_new_race()}</option>
                    <option value="existing">
                      {m.workspace_existing_race()}
                    </option>
                  </select>
                </Field>
              )}
              <Field label={m.workspace_race_role()}>
                <select
                  name="priority"
                  defaultValue={
                    race?.priority ??
                    (plan.races.some((r) => r.priority === 'TARGET')
                      ? 'PREPARATORY'
                      : 'TARGET')
                  }
                  className={selectClass}
                >
                  {priorityOptions}
                </select>
              </Field>
              {mode === 'existing' ? (
                <Field label={m.workspace_existing_race()}>
                  <select
                    name="eventId"
                    required
                    defaultValue=""
                    className={selectClass}
                  >
                    <option value="">{m.workspace_choose_race()}</option>
                    {competitions.data
                      ?.filter(
                        (c) =>
                          !plan.races.some(
                            (r) => r.competition.event.eventId === c.eventId,
                          ),
                      )
                      .map((c) => (
                        <option key={c.eventId} value={c.eventId}>
                          {displayDate(c.startDate)} · {c.name}
                        </option>
                      ))}
                  </select>
                  {competitions.isError && (
                    <span role="alert" className="text-destructive">
                      {m.workspace_failed()}
                    </span>
                  )}
                </Field>
              ) : (
                <>
                  <Field label={m.event_name()}>
                    <Input
                      name="name"
                      defaultValue={race?.competition.event.name}
                      maxLength={100}
                      required
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={m.date()}>
                      <Input
                        name="date"
                        type="date"
                        defaultValue={
                          race
                            ? dateInput(race.competition.event.startDate)
                            : ''
                        }
                        min={dateInput(plan.startDate)}
                        max={dateInput(plan.endDate)}
                        required
                      />
                    </Field>
                    <Field label={m.workspace_start_time()}>
                      <Input
                        name="time"
                        type="time"
                        defaultValue={
                          race
                            ? new Date(race.competition.event.startDate)
                                .toTimeString()
                                .slice(0, 5)
                            : '09:00'
                        }
                        required
                      />
                    </Field>
                  </div>
                  <Field label={m.sport()}>
                    <select
                      name="sport"
                      defaultValue={
                        race?.competition.sport ?? SPORT_TYPE.TRAIL_RUNNING
                      }
                      className={selectClass}
                    >
                      {Object.values(SPORT_TYPE).map((sport) => (
                        <option key={sport} value={sport}>
                          {sportTypeLabelMap[sport]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={`${m.distance()} (km)`}>
                      <Input
                        name="distance"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={
                          race?.competition.goalDistance == null
                            ? ''
                            : race.competition.goalDistance / 1000
                        }
                      />
                    </Field>
                    <Field label="D+ (m)">
                      <Input
                        name="elevation"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={race?.competition.goalElevationGain ?? ''}
                      />
                    </Field>
                    <Field label={`${m.duration()} (min)`}>
                      <Input
                        name="duration"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={
                          race?.competition.goalDuration == null
                            ? ''
                            : race.competition.goalDuration / 60
                        }
                      />
                    </Field>
                  </div>
                  <Field label={m.description()}>
                    <Textarea
                      name="description"
                      maxLength={5000}
                      defaultValue={race?.competition.description ?? ''}
                      className="min-h-20"
                    />
                  </Field>
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  {m.cancel()}
                </Button>
                <Button type="submit" isLoading={busy}>
                  {m.save()}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
