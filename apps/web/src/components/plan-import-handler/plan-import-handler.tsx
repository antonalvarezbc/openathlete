import { ImportPlanDialog } from '@/components/import-plan-dialog';
import { useAuthContext } from '@/contexts/auth';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const PLAN_TOKEN_STORAGE_KEY = 'pendingPlanToken';

export function PlanImportHandler() {
  const { authenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [planToken, setPlanToken] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Check for pending plan token when authenticated
  useEffect(() => {
    if (!authenticated) {
      return;
    }

    if (searchParams.get('importPlan') === 'json') {
      setPlanToken(null);
      setDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('importPlan');
      setSearchParams(next, { replace: true });
      return;
    }

    // First, check URL parameters (for direct access when already logged in)
    const urlToken = searchParams.get('planToken');
    if (urlToken) {
      setPlanToken(urlToken);
      setDialogOpen(true);
      // Remove from URL to clean it up
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('planToken');
      setSearchParams(newSearchParams, { replace: true });
      return;
    }

    // Then, check sessionStorage (for users coming from auth flow)
    const storageToken = sessionStorage.getItem(PLAN_TOKEN_STORAGE_KEY);
    if (storageToken) {
      setPlanToken(storageToken);
      setDialogOpen(true);
      // Remove from storage immediately to prevent showing again on refresh
      sessionStorage.removeItem(PLAN_TOKEN_STORAGE_KEY);
    }
  }, [authenticated, searchParams, setSearchParams]);

  const handleClose = () => {
    setDialogOpen(false);
    // Clear token after a delay to allow dialog to close
    setTimeout(() => {
      setPlanToken(null);
    }, 300);
  };

  if (!dialogOpen) {
    return null;
  }

  return (
    <ImportPlanDialog
      open={dialogOpen}
      onClose={handleClose}
      planToken={planToken ?? undefined}
    />
  );
}
