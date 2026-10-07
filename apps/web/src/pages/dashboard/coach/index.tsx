import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import { CoachDashboardView } from '@/views/dashboard/coach-dashboard-view';
import { useEffect } from 'react';

export function CoachDashboardPage() {
  const { space, setSpace } = useSpaceContext();
  // Reached from the athlete space's link: show the coach's sidebar
  useEffect(() => {
    if (space !== 'COACH') setSpace('COACH');
  }, [space, setSpace]);

  return (
    <>
      <title>{m.coach_dashboard()}</title>
      <CoachDashboardView />
    </>
  );
}

export default CoachDashboardPage;
