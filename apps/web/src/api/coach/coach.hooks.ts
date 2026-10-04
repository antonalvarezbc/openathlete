import { athleteKeys } from '@/api/athlete/athlete.keys';
import {
  MutationOptions,
  QueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { CoachAPI } from './coach.api';
import { coachKeys } from './coach.keys';

export function useCoachOverviewQuery(range: {
  from: Date;
  today: Date;
  until: Date;
}) {
  return useQuery({
    queryKey: coachKeys.overview(
      range.from.toISOString(),
      range.today.toISOString(),
      range.until.toISOString(),
    ),
    queryFn: () => CoachAPI.getOverview(range),
    staleTime: 60 * 1000,
  });
}

export const useGetPendingInvitationsQuery = (
  { enabled }: { enabled?: boolean },
  opt?: QueryOptions<
    Awaited<ReturnType<typeof CoachAPI.getPendingInvitations>>
  >,
) =>
  useQuery({
    ...opt,
    queryFn: CoachAPI.getPendingInvitations,
    queryKey: coachKeys.getPendingInvitations,
    enabled: !!enabled,
  });

export const useAcceptInvitationMutation = (
  opt?: MutationOptions<
    Awaited<ReturnType<typeof CoachAPI.acceptInvitation>>,
    Error,
    Parameters<typeof CoachAPI.acceptInvitation>[0]
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...opt,
    mutationFn: CoachAPI.acceptInvitation,
    onSuccess: (data, variables, onMutateResult, context) => {
      if (opt?.onSuccess)
        opt.onSuccess(data, variables, onMutateResult, context);
      queryClient.invalidateQueries({
        queryKey: coachKeys.getPendingInvitations,
      });
      queryClient.invalidateQueries({
        queryKey: [athleteKeys.getCoachedAthletes],
      });
      queryClient.invalidateQueries({
        queryKey: [athleteKeys.getMyCoaches],
      });
    },
  });
};

export const useRejectInvitationMutation = (
  opt?: MutationOptions<
    Awaited<ReturnType<typeof CoachAPI.rejectInvitation>>,
    Error,
    Parameters<typeof CoachAPI.rejectInvitation>[0]
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...opt,
    mutationFn: CoachAPI.rejectInvitation,
    onSuccess: (data, variables, onMutateResult, context) => {
      if (opt?.onSuccess)
        opt.onSuccess(data, variables, onMutateResult, context);
      queryClient.invalidateQueries({
        queryKey: coachKeys.getPendingInvitations,
      });
    },
  });
};
