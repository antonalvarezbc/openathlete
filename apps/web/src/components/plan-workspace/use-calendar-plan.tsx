/* eslint-disable react-refresh/only-export-components */
import {
  ManagedPlan,
  PlanWorkspaceAPI,
} from '@/api/plan-workspace/plan-workspace.api';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

export function useCalendarPlan(athleteId?: number) {
  const [params] = useSearchParams();
  const rawId = params.get('trainingPlanId');
  const planId = rawId ? Number(rawId) : undefined;
  const valid = !!planId && Number.isSafeInteger(planId) && planId > 0;
  const query = useQuery({
    queryKey: ['calendar-plan', planId],
    queryFn: () => PlanWorkspaceAPI.get(planId!),
    enabled: valid && !!athleteId,
  });
  const initial = new Date(
    params.get('date') ?? query.data?.startDate ?? Date.now(),
  );
  return {
    plan: query.data,
    planId,
    /** Links from plan weeks open the calendar in week view. */
    view: params.get('view') === 'week' ? ('week' as const) : undefined,
    initialDate: isNaN(initial.getTime()) ? new Date() : initial,
    isLoading: !!rawId && (!athleteId || (valid && query.isPending)),
    isError:
      !!rawId &&
      (!valid ||
        query.isError ||
        (!!query.data && query.data.athleteId !== athleteId)),
  };
}
export function CalendarPlanBanner({ plan }: { plan: ManagedPlan }) {
  return (
    <div className="mb-4 rounded-lg border bg-muted/40 p-4 space-y-2">
      <p className="font-semibold">{plan.name}</p>
      <p className="text-sm text-muted-foreground">
        {m.workspace_calendar_help()}
      </p>
      <Button asChild variant="outline" size="sm">
        <Link
          to={`/dashboard/planning?athleteId=${plan.athleteId}&planId=${plan.trainingPlanId}`}
        >
          {m.workspace_back_to_plan()}
        </Link>
      </Button>
    </div>
  );
}
