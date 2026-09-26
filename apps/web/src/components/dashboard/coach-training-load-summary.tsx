import { useTrainingLoadMetrics } from '@/api/training-load';
import { TrainingLoadCalculationType } from '@/api/training-load/training-load.api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserRoles } from '@/contexts/auth';
import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { useMemo } from 'react';

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
  const today = useMemo(() => new Date(), []);
  const { data, isPending, isError, refetch } = useTrainingLoadMetrics(
    TrainingLoadCalculationType.TRIMP,
    today,
    athleteId,
    { retry: false },
  );
  const metrics = data
    ? [
        { label: 'CTL', title: m.coach_load_ctl(), value: data.ctl },
        { label: 'ATL', title: m.coach_load_atl(), value: data.atl },
        { label: 'TSB', title: m.coach_load_tsb(), value: data.tsb },
      ]
    : [];
  const hasData =
    data &&
    data.trainingDays > 0 &&
    metrics.every((metric) => Number.isFinite(metric.value));

  return (
    <div className="min-w-0 space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {m.training_load()} · TRIMP
      </h3>
      <p className="text-xs text-muted-foreground">
        {m.coach_load_period({ date: today.toLocaleDateString(getLocale()) })}
      </p>
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
        <>
          <dl className="grid grid-cols-3 gap-2">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-md bg-muted p-3">
                <dt className="text-xs font-medium" title={metric.title}>
                  {metric.label}
                </dt>
                <dd className="text-xl font-bold tabular-nums">
                  {metric.value.toLocaleString(getLocale(), {
                    maximumFractionDigits: 1,
                  })}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {metric.title}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {m.coach_load_coverage()}
          </p>
        </>
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
