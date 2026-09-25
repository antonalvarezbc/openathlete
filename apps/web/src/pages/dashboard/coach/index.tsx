import { Navigate, useLocation } from 'react-router-dom';

/** Keep saved dashboard links working after replacing the coach landing page. */
export function CoachDashboardPage() {
  const { search } = useLocation();
  return <Navigate to={`/dashboard/planning${search}`} replace />;
}

export default CoachDashboardPage;
