import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { m } from '@/paraglide/messages';
import { metricTypeLabelMap } from '@/utils/label-map/core/metric-type.label-map';
import { cn } from '@/utils/shadcn';
import { getTargetTypeLabel } from '@/utils/workout';
import { workoutTargetErrorMessage } from '@/utils/workout-target-errors';

import type { WorkoutStepTargetDto } from '@openathlete/shared';
import {
  SPORT_TYPE,
  formatTarget,
  resolveWorkoutTarget,
} from '@openathlete/shared';

import { useWorkoutTargetData } from './workout-athlete-context';

interface TargetBadgeProps {
  target: WorkoutStepTargetDto;
  className?: string;
  showTooltip?: boolean;
  sport?: SPORT_TYPE;
  showAbsoluteValues?: boolean;
}

export function TargetBadge({
  target,
  className,
  showTooltip = true,
  showAbsoluteValues = true,
  sport,
}: TargetBadgeProps) {
  const {
    athleteId,
    zones,
    metrics,
    isLoading,
    isError,
    sport: targetSport,
  } = useWorkoutTargetData(sport);
  let formatted = formatTarget(
    target,
    (metric) =>
      metricTypeLabelMap[metric as keyof typeof metricTypeLabelMap] ?? metric,
    undefined,
    zones,
  );
  let warning: string | undefined;
  if (isError) warning = m.workout_target_data_error();
  else if (
    athleteId &&
    !isLoading &&
    (target.metricType || target.targetType === 'ZONE')
  ) {
    try {
      const absolute = resolveWorkoutTarget(
        target,
        { zones, metrics, sport: targetSport },
        true,
      );
      if (showAbsoluteValues)
        formatted += ` · ${formatTarget(absolute).replace(' bpm', ` ${m.bpm()}`)}`;
    } catch (error) {
      warning = workoutTargetErrorMessage(error, m.workout_target_invalid());
    }
  }

  const label = getTargetTypeLabel(target.targetType);

  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        warning &&
          'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
        className,
      )}
    >
      {formatted}
    </span>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          {warning && <p>{warning}</p>}
          <p className="text-sm">
            <span className="font-medium">{label}:</span> {formatted}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
