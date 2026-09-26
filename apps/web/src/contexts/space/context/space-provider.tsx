import { useUserRoles } from '@/contexts/auth';
import { getPath } from '@/routes/paths';
import { CURRENT_SPACE, getItem, setItem } from '@/utils/local-storage';
import { useEffect } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { UserRole } from '@openathlete/shared';

import { SpaceContextType } from '../types';
import { SpaceContext } from './space-context';

type Props = {
  children: React.ReactNode;
};

export function SpaceProvider({ children }: Props) {
  const [currentSpace, setCurrentSpace] = useState<UserRole>(() => {
    const storedSpace = getItem(CURRENT_SPACE);
    return storedSpace ? (storedSpace as UserRole) : 'ATHLETE';
  });
  const nav = useNavigate();
  const roles = useUserRoles();
  const space = roles?.includes(currentSpace)
    ? currentSpace
    : (roles?.[0] ?? 'ATHLETE');
  useEffect(() => {
    if (roles?.length && !roles.includes(currentSpace)) {
      setCurrentSpace(roles[0]);
      setItem(CURRENT_SPACE, roles[0]);
      nav(
        getPath(['dashboard', roles[0] === 'COACH' ? 'planning' : 'calendar']),
      );
    }
  }, [roles, currentSpace, nav]);

  const handleSpaceChange = useCallback(
    (space: UserRole) => {
      if (!roles?.includes(space)) return;
      setCurrentSpace(space);
      setItem(CURRENT_SPACE, space);
      if (space === 'COACH') {
        nav(getPath(['dashboard', 'planning']));
      } else {
        nav(getPath(['dashboard', 'calendar']));
      }
    },
    [nav, roles],
  );

  const memoizedValue = useMemo<SpaceContextType>(
    () => ({
      space,
      setSpace: handleSpaceChange,
    }),
    [space, handleSpaceChange],
  );

  return (
    <SpaceContext.Provider value={memoizedValue}>
      {children}
    </SpaceContext.Provider>
  );
}
