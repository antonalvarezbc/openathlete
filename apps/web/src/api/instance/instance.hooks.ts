import { useQuery } from '@tanstack/react-query';

import { InstanceAPI } from './instance.api';

export const instanceKeys = {
  getInstanceInfo: 'InstanceAPI.getInstanceInfo',
} as const;

/** What the instance offers; it only changes when the API restarts. */
export const useInstanceInfoQuery = () =>
  useQuery({
    queryKey: [instanceKeys.getInstanceInfo],
    queryFn: InstanceAPI.getInstanceInfo,
    staleTime: Infinity,
  });
