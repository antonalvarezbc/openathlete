import { useAuthContext } from '@/contexts/auth';
import { getPath } from '@/routes/paths';
import {
  RETURN_TO_PARAM,
  safeReturnPath,
  takeReturnTo,
} from '@/utils/return-to';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

type Props = {
  children: React.ReactNode;
};

export default function GuestGuard({ children }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { authenticated } = useAuthContext();

  const [checked, setChecked] = useState(false);

  const check = useCallback(() => {
    if (authenticated) {
      // Signed-in visitors following a website link go straight to it
      navigate(
        safeReturnPath(searchParams.get(RETURN_TO_PARAM)) ??
          takeReturnTo(getPath(['dashboard'])),
      );
    } else {
      setChecked(true);
    }
  }, [authenticated, navigate, searchParams]);

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) {
    return null;
  }

  return <>{children}</>;
}
