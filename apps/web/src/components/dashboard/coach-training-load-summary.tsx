import { useTrainingLoadMetrics } from '@/api/training-load';
import { TrainingLoadCalculationType } from '@/api/training-load/training-load.api';
import { trainingLoadKeys } from '@/api/training-load/training-load.keys';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserRoles } from '@/contexts/auth';
import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

function LoadInfo({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={m.coach_load_info({ metric: label })}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') scheduleClose();
          }}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={m.coach_load_info({ metric: label })}
        className="max-h-[var(--radix-popover-content-available-height)] overflow-y-auto w-80 max-w-[calc(100vw-2rem)] space-y-2 text-xs normal-case tracking-normal font-normal"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={cancelClose}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') scheduleClose();
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function CoachTrainingLoadSummary({ athleteId }: { athleteId: number }) {
  const { space } = useSpaceContext();
  const roles = useUserRoles();
  if (
    space !== 'COACH' ||
    !roles?.includes('COACH') ||
    !Number.isInteger(athleteId) ||
    athleteId <= 0
  ) {
    return null;
  }
  return <TrainingLoadSummary key={athleteId} athleteId={athleteId} />;
}

function TrainingLoadSummary({ athleteId }: { athleteId: number }) {
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const { data, dataUpdatedAt, isPending, isError, refetch } =
    useTrainingLoadMetrics(
      TrainingLoadCalculationType.TRIMP,
      today,
      athleteId,
      { retry: false },
    );
  useEffect(() => {
    if (!data?.trimpRefresh?.processed) return;
    queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].startsWith(trainingLoadKeys.root + '.') &&
        query.queryKey[0] !== trainingLoadKeys.getTrainingLoadMetrics,
    });
  }, [data?.trimpRefresh?.processed, dataUpdatedAt, queryClient]);

  const metrics = data
    ? [
        {
          label: 'CTL',
          title: m.coach_load_ctl(),
          description: m.coach_load_ctl_help(),
          value: data.ctl,
          color:
            'from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30',
          textColor: 'text-purple-700 dark:text-purple-300',
        },
        {
          label: 'ATL',
          title: m.coach_load_atl(),
          description: m.coach_load_atl_help(),
          value: data.atl,
          color:
            'from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30',
          textColor: 'text-orange-700 dark:text-orange-300',
        },
        {
          label: 'TSB',
          title: m.coach_load_tsb(),
          description: m.coach_load_tsb_help(),
          value: data.tsb,
          color:
            data.tsb > 5
              ? 'from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30'
              : data.tsb < -5
                ? 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30'
                : 'from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30',
          textColor:
            data.tsb > 5
              ? 'text-green-700 dark:text-green-300'
              : data.tsb < -5
                ? 'text-red-700 dark:text-red-300'
                : 'text-blue-700 dark:text-blue-300',
        },
      ]
    : [];
  const hasData =
    data &&
    data.trainingDays > 0 &&
    metrics.every((metric) => Number.isFinite(metric.value));

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {m.training_load()}
        </h3>
        <LoadInfo label={m.training_load()}>
          <p className="text-xs text-muted-foreground">
            {m.coach_load_period({
              date: today.toLocaleDateString(getLocale()),
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {m.coach_load_hr_priority()}
          </p>
          {data?.trimpRefresh && !isPending && !isError && (
            <div
              role="status"
              className="space-y-1 text-xs text-muted-foreground"
            >
              <p>{m.coach_load_auto_summary(data.trimpRefresh)}</p>
              {data.trimpRefresh.unavailable > 0 && (
                <p>{m.coach_load_auto_unavailable()}</p>
              )}
              {data.trimpRefresh.heartRateReferences.map((reference) => (
                <p
                  key={`${reference.source}-${reference.hrMax}-${reference.hrRest}`}
                >
                  {reference.source === 'TRAINING_ZONE'
                    ? m.coach_load_hr_zones({
                        max: reference.hrMax,
                        rest: reference.hrRest,
                      })
                    : m.coach_load_hr_metric({
                        max: reference.hrMax,
                        rest: reference.hrRest,
                      })}
                </p>
              ))}
            </div>
          )}
          <p>{m.coach_load_coverage()}</p>
        </LoadInfo>
      </div>
      {isPending ? (
        <div className="grid grid-cols-3 gap-2" aria-label={m.loading()}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{m.coach_load_error()}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {m.coach_load_retry()}
          </Button>
        </div>
      ) : hasData ? (
        <dl className="grid grid-cols-3 gap-2">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-lg bg-gradient-to-br p-3 ${metric.color}`}
            >
              <dt className="flex items-center justify-between gap-1 text-xs font-medium">
                {metric.label}
                <LoadInfo label={metric.label}>
                  <p className="font-semibold">{metric.title}</p>
                  <p>{metric.description}</p>
                </LoadInfo>
              </dt>
              <dd
                className={`text-2xl font-bold tabular-nums ${metric.textColor}`}
              >
                {metric.value.toLocaleString(getLocale(), {
                  maximumFractionDigits: 1,
                })}
              </dd>
              <dd className="text-xs text-muted-foreground">{metric.title}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium">{m.coach_load_empty()}</p>
          <p className="text-xs text-muted-foreground">
            {m.coach_load_requirements()}
          </p>
        </div>
      )}
    </div>
  );
}
