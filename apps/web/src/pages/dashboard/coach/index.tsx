import { useUserRoles } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import { CoachDashboardView } from '@/views/dashboard/coach-dashboard-view';
import { Navigate, useLocation } from 'react-router-dom';

/** The coach space's landing page. */
export function CoachDashboardPage() {
  const roles = useUserRoles();
  const { search } = useLocation();
  if (!roles) return null;
  if (!roles.includes('COACH'))
    return <Navigate to="/dashboard/calendar" replace />;
  // Links saved while this address opened the planning workspace.
  if (search) return <Navigate to={`/dashboard/planning${search}`} replace />;
  return (
    <>
      <title>{m.coach_dashboard()}</title>
      <CoachDashboardView />
    </>
  );
}

export default CoachDashboardPage;
