import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthContext } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { UserRole } from '@openathlete/shared';

import { SettingsSection } from './settings-section';

interface Account {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  onboardingCompleted: boolean;
}
function mode(roles: UserRole[]) {
  return roles.length === 2 ? 'BOTH' : roles[0];
}
function rolesFor(value: string): UserRole[] {
  return value === 'BOTH' ? ['ATHLETE', 'COACH'] : [value as UserRole];
}

export function AccountAdministrationTab() {
  const { user, initialize } = useAuthContext();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<{
    account: Account;
    roles: UserRole[];
  } | null>(null);
  const accounts = useQuery({
    queryKey: ['admin-accounts', filter, page],
    queryFn: async () =>
      (
        await client.get<Account[]>('/admin/accounts', {
          params: { search: filter, page },
        })
      ).data,
    enabled: !!user?.isAdmin,
    retry: false,
  });
  const change = useMutation({
    mutationFn: async (value: NonNullable<typeof pending>) =>
      client.patch('/admin/accounts/' + value.account.userId + '/mode', {
        roles: value.roles,
      }),
    onSuccess: async (_, value) => {
      setPending(null);
      await cache.invalidateQueries();
      if (value.account.userId === user?.userId) await initialize();
      toast.success(m.admin_mode_saved());
    },
    onError: () => toast.error(m.admin_mode_failed()),
  });
  if (!user?.isAdmin) return null;
  const label = (roles: UserRole[]) =>
    roles.length === 2
      ? m.account_mode_both()
      : roles[0] === 'COACH'
        ? m.account_mode_coach()
        : m.account_mode_athlete();
  return (
    <SettingsSection
      title={m.account_administration()}
      description={m.admin_mode_help()}
    >
      <form
        className="flex flex-wrap gap-2 mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setFilter(search.trim());
        }}
      >
        <Input
          className="max-w-sm"
          aria-label={m.admin_account_search()}
          placeholder={m.admin_account_search()}
          value={search}
          maxLength={200}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit">{m.admin_search()}</Button>
      </form>
      {accounts.isError && <p role="alert">{m.admin_mode_failed()}</p>}
      {accounts.isPending && <p role="status">{m.admin_loading()}</p>}
      <div className="space-y-3">
        {accounts.data?.map((account) => (
          <div
            key={account.userId}
            className="border rounded p-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <p>
                {account.firstName} {account.lastName}
              </p>
              <p className="text-sm break-all">{account.email}</p>
              <p className="text-xs">ID: {account.userId}</p>
            </div>
            <div>
              <label className="flex flex-col gap-1">
                {m.account_mode()}
                <select
                  className="border rounded p-2"
                  aria-label={m.account_mode() + ': ' + account.email}
                  value={mode(account.roles)}
                  disabled={!account.onboardingCompleted || change.isPending}
                  onChange={(event) =>
                    setPending({ account, roles: rolesFor(event.target.value) })
                  }
                >
                  <option value="ATHLETE">{m.account_mode_athlete()}</option>
                  <option value="COACH">{m.account_mode_coach()}</option>
                  <option value="BOTH">{m.account_mode_both()}</option>
                </select>
              </label>
              {!account.onboardingCompleted && (
                <p className="text-xs">{m.admin_onboarding_pending()}</p>
              )}
            </div>
          </div>
        ))}
        {accounts.data?.length === 0 && <p>{m.admin_no_accounts()}</p>}
      </div>
      <div className="flex gap-2 mt-4">
        <Button
          variant="outline"
          disabled={page === 0 || accounts.isFetching}
          onClick={() => setPage(page - 1)}
        >
          {m.admin_previous()}
        </Button>
        <Button
          variant="outline"
          disabled={accounts.data?.length !== 25 || accounts.isFetching}
          onClick={() => setPage(page + 1)}
        >
          {m.admin_next()}
        </Button>
      </div>
      <ConfirmAction
        open={!!pending}
        onClose={() => !change.isPending && setPending(null)}
        onConfirm={() => pending && change.mutate(pending)}
        isLoading={change.isPending}
        title={m.account_mode()}
        message={
          pending
            ? m.admin_mode_confirm({
                email: pending.account.email,
                mode: label(pending.roles),
              })
            : ''
        }
      />
    </SettingsSection>
  );
}
