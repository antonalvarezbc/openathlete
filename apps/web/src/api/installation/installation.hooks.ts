import { useAuthContext } from '@/contexts/auth';
import client from '@/utils/axios';
import { useQuery } from '@tanstack/react-query';

import { InstallationFeaturesDto } from '@openathlete/shared';

export function useInstallationFeatures(): InstallationFeaturesDto {
  const { authenticated, user } = useAuthContext();
  const query = useQuery({
    queryKey: ['installation', 'features', user?.userId],
    queryFn: async () =>
      (await client.get<InstallationFeaturesDto>('/installation/features'))
        .data,
    enabled: authenticated,
    staleTime: 60_000,
    retry: false,
  });
  const available = authenticated && query.isSuccess;

  // An unavailable configuration must never expose an optional manual tool.
  return {
    manualFitImport: available && query.data?.manualFitImport === true,
    manualGarminSync: available && query.data?.manualGarminSync === true,
  };
}
