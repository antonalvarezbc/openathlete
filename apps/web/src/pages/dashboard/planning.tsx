import { useUserRoles } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import { TrainingPlanTab } from '@/views/dashboard/settings-view/training-plan-tab';
import { Navigate } from 'react-router-dom';

export function PlanningPage() {
  const roles = useUserRoles();
  if (!roles) return null;
  if (!roles.includes('COACH'))
    return <Navigate to="/dashboard/calendar" replace />;
  return (
    <>
      <title>{m.coach_planning()}</title>
      <main className="w-full min-w-0 p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold hidden md:block">
          {m.coach_planning()}
        </h1>
        <TrainingPlanTab />
      </main>
    </>
  );
}
