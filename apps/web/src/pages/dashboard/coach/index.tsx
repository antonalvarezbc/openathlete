import { useUserRoles } from '@/contexts/auth';
import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import { CoachDashboardView } from '@/views/dashboard/coach-dashboard-view';
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/** The coach space's landing page. */
export function CoachDashboardPage() {
  const roles = useUserRoles();
  const { search } = useLocation();
  const { space, setSpace } = useSpaceContext();
  const isCoach = !!roles?.includes('COACH');
  // Reached from the athlete space's link: show the coach's sidebar. Not
  // while redirecting below, since switching space navigates here.
  useEffect(() => {
    if (isCoach && !search && space !== 'COACH') setSpace('COACH');
  }, [isCoach, search, space, setSpace]);

  if (!roles) return null;
  if (!isCoach) return <Navigate to="/dashboard/calendar" replace />;
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
