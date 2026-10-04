import { useAiPlanJobQuery, useStartAiPlanMutation } from '@/api/ai-plan';
import { useGetInjuriesQuery } from '@/api/injury';
import { ImportPlanDialog } from '@/components/import-plan-dialog';
import {
  Field,
  dateInput,
  selectClass,
  workspaceError,
} from '@/components/plan-workspace/helpers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { sportTypeLabelMap } from '@/utils/label-map/core';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  AI_PLAN_METHODOLOGIES,
  AiPlanRequest,
  INJURY_STATUS,
  SPORT_TYPE,
  aiPlanRequestSchema,
} from '@openathlete/shared';

/** Sports usually combined in an endurance plan; the race sport is added. */
const SPORT_CHOICES = [
  SPORT_TYPE.RUNNING,
  SPORT_TYPE.TRAIL_RUNNING,
  SPORT_TYPE.CYCLING,
  SPORT_TYPE.GRAVEL_RIDE,
  SPORT_TYPE.MOUNTAIN_BIKE_RIDE,
  SPORT_TYPE.SWIMMING,
  SPORT_TYPE.WEIGHT_TRAINING,
  SPORT_TYPE.MOBILITY,
  SPORT_TYPE.HIKING,
  SPORT_TYPE.NORDIC_SKI,
];
/** Monday first; plan files use 0 for Sunday. */
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
const LANGUAGES = ['es', 'en', 'fr', 'it'] as const;

const dayLabel = (day: number) =>
  new Intl.DateTimeFormat(getLocale(), {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2023, 0, 1 + day)));

function nextMonday() {
  const date = new Date();
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  return dateInput(date);
}

const optionalNumber = (value: unknown) =>
  value === '' || value == null ? null : Number(value);

/** "3:45:00" or "45:00" from a time input, in seconds. */
const toSeconds = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  const parts = value.split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  const [h, mm, ss = 0] = parts;
  return h * 3600 + mm * 60 + ss;
};

const errorText = (message?: string) => {
  if (!message) return null;
  switch (message) {
    case 'AI_PLAN_LENGTH':
      return m.ai_plan_error_length();
    case 'AI_PLAN_RACE_BEFORE_START':
      return m.ai_plan_error_race_before_start();
    case 'AI_PLAN_GOAL_SPORT':
      return m.ai_plan_error_goal_sport();
    case 'AI_PLAN_LONG_DAY':
      return m.ai_plan_error_long_day();
    default:
      return m.ai_plan_error_field();
  }
};

function FieldError({ message }: { message?: string }) {
  const text = errorText(message);
  return text ? (
    <span role="alert" className="text-sm font-normal text-destructive">
      {text}
    </span>
  ) : null;
}

interface P {
  athleteId: number;
  onClose: () => void;
  onImported: (plan: { trainingPlanId: number; name: string }) => void;
  /** Tests poll faster. */
  pollMs?: number;
}

/**
 * Asks for the goal and limits, queues an AI draft, follows it, and opens
 * the draft in the plan review dialog. Nothing is saved until it is imported.
 */
export function AiPlanDialog({ athleteId, onClose, onImported, pollMs }: P) {
  const locale = getLocale();
  const methods = useForm<AiPlanRequest>({
    resolver: zodResolver(aiPlanRequestSchema),
    defaultValues: {
      athleteId,
      goal: { name: '', date: '', sport: SPORT_TYPE.RUNNING },
      startDate: nextMonday(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sports: [SPORT_TYPE.RUNNING],
      trainingDays: [2, 4, 6],
      weeklyHours: 5,
      longSessionDay: null,
      methodology: null,
      methodologyNotes: '',
      constraints: '',
      language: (LANGUAGES as readonly string[]).includes(locale)
        ? (locale as AiPlanRequest['language'])
        : 'en',
    },
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = methods;
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [, setTick] = useState(0);
  const start = useStartAiPlanMutation();
  const job = useAiPlanJobQuery(jobId, pollMs);
  const injuries = useGetInjuriesQuery(athleteId).data?.filter(
    (injury) => injury.status !== INJURY_STATUS.RESOLVED,
  );
  const goalSport = watch('goal.sport');
  const trainingDays = watch('trainingDays');

  // The race sport is always part of the plan.
  useEffect(() => {
    const sports = getValues('sports');
    if (!sports.includes(goalSport)) setValue('sports', [goalSport, ...sports]);
  }, [goalSport, getValues, setValue]);
  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [jobId]);

  const submit = handleSubmit((request) =>
    start.mutate(request, {
      onSuccess: (status) => {
        setStartedAt(Date.now());
        setJobId(status.jobId);
      },
      onError: (error) => toast.error(workspaceError(error)),
    }),
  );

  const status = job.data;
  const draft = status?.state === 'done' ? status.draft : undefined;
  if (draft?.plan)
    return (
      <ImportPlanDialog
        open
        onClose={onClose}
        onImported={onImported}
        draft={{
          plan: draft.plan,
          athleteId,
          startDate: getValues('startDate'),
          facts: draft.facts,
          conflicts: draft.conflicts,
        }}
      />
    );
  const failed =
    status?.state === 'failed' || (status?.state === 'done' && !draft?.plan);

  const sportOptions = Object.values(SPORT_TYPE).sort((a, b) =>
    sportTypeLabelMap[a].localeCompare(sportTypeLabelMap[b], locale),
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.ai_plan_title()}</DialogTitle>
          <DialogDescription>{m.ai_plan_help()}</DialogDescription>
        </DialogHeader>
        {jobId && !failed ? (
          <div role="status" className="space-y-3">
            <p>
              {status?.state === 'running'
                ? status.stage === 'repairing'
                  ? m.ai_plan_repairing()
                  : m.ai_plan_generating()
                : m.ai_plan_queued()}
            </p>
            <p className="text-sm text-muted-foreground">
              {m.ai_plan_elapsed({
                seconds: String(Math.round((Date.now() - startedAt) / 1000)),
              })}
            </p>
            <Button variant="outline" className="min-h-11" onClick={onClose}>
              {m.cancel()}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {failed && (
              <p role="alert" className="text-sm text-destructive">
                {m.ai_plan_failed()}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.ai_plan_goal_name()}>
                <Input {...register('goal.name')} maxLength={100} />
                <FieldError message={errors.goal?.name?.message} />
              </Field>
              <Field label={m.ai_plan_race_date()}>
                <Input type="date" {...register('goal.date')} />
                <FieldError message={errors.goal?.date?.message} />
              </Field>
              <Field label={m.ai_plan_goal_sport()}>
                <select className={selectClass} {...register('goal.sport')}>
                  {sportOptions.map((sport) => (
                    <option key={sport} value={sport}>
                      {sportTypeLabelMap[sport]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={m.ai_plan_start_date()}>
                <Input type="date" {...register('startDate')} />
                <FieldError message={errors.startDate?.message} />
              </Field>
              <Field label={m.ai_plan_distance()}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  {...register('goal.distanceKm', {
                    setValueAs: optionalNumber,
                  })}
                />
                <FieldError message={errors.goal?.distanceKm?.message} />
              </Field>
              <Field label={m.ai_plan_elevation()}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  {...register('goal.elevationGain', {
                    setValueAs: optionalNumber,
                  })}
                />
                <FieldError message={errors.goal?.elevationGain?.message} />
              </Field>
              <Field label={m.ai_plan_time_target()}>
                <Input
                  type="time"
                  step={1}
                  {...register('goal.timeTarget', { setValueAs: toSeconds })}
                />
                <FieldError message={errors.goal?.timeTarget?.message} />
              </Field>
              <Field label={m.ai_plan_weekly_hours()}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={40}
                  step="0.5"
                  {...register('weeklyHours', { setValueAs: Number })}
                />
                <FieldError message={errors.weeklyHours?.message} />
              </Field>
            </div>
            <Controller
              name="trainingDays"
              control={control}
              render={({ field, fieldState }) => (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    {m.ai_plan_training_days()}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((day) => (
                      <label
                        key={day}
                        className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={field.value.includes(day)}
                          onChange={(event) =>
                            field.onChange(
                              event.target.checked
                                ? [...field.value, day]
                                : field.value.filter((item) => item !== day),
                            )
                          }
                        />
                        {dayLabel(day)}
                      </label>
                    ))}
                  </div>
                  <FieldError message={fieldState.error?.message} />
                </fieldset>
              )}
            />
            <Controller
              name="sports"
              control={control}
              render={({ field, fieldState }) => (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    {m.ai_plan_sports()}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set([goalSport, ...SPORT_CHOICES])].map(
                      (sport) => (
                        <label
                          key={sport}
                          className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            disabled={sport === goalSport}
                            checked={field.value.includes(sport)}
                            onChange={(event) =>
                              field.onChange(
                                event.target.checked
                                  ? [...field.value, sport]
                                  : field.value.filter(
                                      (item) => item !== sport,
                                    ),
                              )
                            }
                          />
                          {sportTypeLabelMap[sport]}
                        </label>
                      ),
                    )}
                  </div>
                  <FieldError message={fieldState.error?.message} />
                </fieldset>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.ai_plan_long_day()}>
                <select
                  className={selectClass}
                  {...register('longSessionDay', {
                    setValueAs: optionalNumber,
                  })}
                >
                  <option value="">{m.ai_plan_long_day_any()}</option>
                  {WEEK_DAYS.filter((day) => trainingDays.includes(day)).map(
                    (day) => (
                      <option key={day} value={day}>
                        {dayLabel(day)}
                      </option>
                    ),
                  )}
                </select>
                <FieldError message={errors.longSessionDay?.message} />
              </Field>
              <Field label={m.ai_plan_methodology()}>
                <select
                  className={selectClass}
                  {...register('methodology', {
                    setValueAs: (value) => value || null,
                  })}
                >
                  <option value="">{m.ai_plan_methodology_auto()}</option>
                  {AI_PLAN_METHODOLOGIES.map((methodology) => (
                    <option key={methodology} value={methodology}>
                      {
                        {
                          POLARIZED: m.ai_plan_methodology_polarized(),
                          PYRAMIDAL: m.ai_plan_methodology_pyramidal(),
                          THRESHOLD: m.ai_plan_methodology_threshold(),
                        }[methodology]
                      }
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={m.ai_plan_methodology_notes()}>
              <Textarea
                rows={2}
                maxLength={800}
                {...register('methodologyNotes')}
              />
            </Field>
            <Field label={m.ai_plan_constraints()}>
              <Textarea
                rows={3}
                maxLength={1500}
                placeholder={m.ai_plan_constraints_placeholder()}
                {...register('constraints')}
              />
            </Field>
            {!!injuries?.length && (
              <p className="text-sm text-muted-foreground">
                {m.ai_plan_injuries({
                  injuries: injuries
                    .map((injury) => injury.location)
                    .join(', '),
                })}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={onClose}
              >
                {m.cancel()}
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                isLoading={start.isPending}
                onClick={() => setJobId(null)}
              >
                {m.ai_plan_generate()}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
