import {
  TrainingLoadCalculationType,
  useActivityTrainingLoads,
} from '@/api/training-load';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import * as m from '@/paraglide/messages.js';
import { ActivityIcon } from 'lucide-react';

interface ActivityTrainingLoadStatsProps {
  activityId: number;
}

export function ActivityTrainingLoadStats({
  activityId,
}: ActivityTrainingLoadStatsProps) {
  const {
    data: trainingLoads,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useActivityTrainingLoads(activityId, { retry: false });

  if (isLoading) {
    return (
      <div className="text-left">
        <div className="text-sm font-semibold">{m.training_load()}</div>
        <div className="flex items-center gap-1.5">
          <Loader size="sm" />
          <span className="text-xs text-muted-foreground">
            {m.activity_load_reading()}
          </span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-left space-y-1">
        <div className="text-sm font-semibold">{m.training_load()}</div>
        <p role="alert" className="text-xs text-destructive">
          {m.activity_load_failed()}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {m.coach_load_retry()}
        </Button>
      </div>
    );
  }

  const loadsText = (trainingLoads ?? [])
    .filter(
      (load) =>
        load.metadata?.calculationType === TrainingLoadCalculationType.TRIMP &&
        Number.isFinite(load.value),
    )
    .map((load) => `${load.value.toFixed(0)}`)
    .join(' / ');

  return (
    <div className="text-left">
      <div className="text-sm font-semibold">{m.training_load()}</div>
      <div className="flex items-center gap-1.5">
        {loadsText ? (
          <>
            <ActivityIcon className="h-4 w-4 text-muted-foreground" />
            <span>{loadsText}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {m.activity_load_not_saved()}
          </span>
        )}
      </div>
    </div>
  );
}
