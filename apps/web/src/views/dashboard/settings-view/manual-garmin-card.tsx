import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';

interface Status {
  enabled: boolean;
  connected?: boolean;
  canConfigure?: boolean;
  athleteId?: number;
  lastAttempt?: string;
  lastSuccess?: string;
  running?: boolean;
  error?: string;
  result?: {
    imported: number;
    updated?: number;
    fitsChecked?: number;
    fitsIncompatible?: string[];
    skipped: number;
    metrics: number;
    fitsImported?: number;
    fitsFailed?: string[];
    fitsPending?: number;
    warnings: string[];
  };
}

export function ManualGarminCard({
  athleteId,
  configure = false,
  compact = false,
}: {
  athleteId?: number;
  configure?: boolean;
  compact?: boolean;
}) {
  const { space } = useSpaceContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const cache = useQueryClient();
  const [error, setError] = useState<string>();
  const status = useQuery({
    queryKey: ['garmin-manual-status', athleteId],
    queryFn: async () =>
      (
        await client.get<Status>('/provider/garmin-manual/status', {
          params: { athleteId },
        })
      ).data,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sync = useMutation({
    mutationFn: async () =>
      (
        await client.post(
          '/provider/garmin-manual/sync',
          { athleteId },
          { timeout: 240_000 },
        )
      ).data,
    retry: false,
    onMutate: () => setError(undefined),
    onSuccess: async () => {
      await cache.invalidateQueries();
    },
    onError: (failure) =>
      setError(
        isAxiosError(failure) &&
          typeof failure.response?.data?.message === 'string'
          ? failure.response.data.message
          : m.garmin_manual_failed(),
      ),
    onSettled: () => {
      void status.refetch();
    },
  });
  const login = useMutation({
    mutationFn: async () => {
      const input = {
        ...(mfa ? { code } : { email, password }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      setPassword('');
      setCode('');
      return (
        await client.post<{ mfaRequired?: boolean; connected?: boolean }>(
          '/provider/garmin-manual/connect',
          input,
          { timeout: 160000 },
        )
      ).data;
    },
    retry: false,
    onMutate: () => setError(undefined),
    onSuccess: async (reply) => {
      setMfa(!!reply.mfaRequired);
      if (reply.connected) {
        setShowLogin(false);
        setEmail('');
        await status.refetch();
      }
    },
    onError: () => {
      setMfa(false);
      setError(m.garmin_login_failed());
    },
  });
  if (status.isError)
    return <p role="alert">{m.garmin_manual_status_failed()}</p>;
  if (!status.data?.enabled) return null;
  const data = status.data;
  const Container = compact ? 'div' : Card;
  const Content = compact ? 'div' : CardContent;
  return (
    <Container>
      {!compact && (
        <CardHeader>
          <CardTitle>{m.garmin_manual_title()}</CardTitle>
          <CardDescription>
            {m.garmin_manual_description({ athleteId: String(data.athleteId) })}
          </CardDescription>
        </CardHeader>
      )}
      <Content className="space-y-3">
        {!compact && configure && space === 'ATHLETE' && data.canConfigure && (
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => setShowLogin(!showLogin)}
              disabled={login.isPending}
            >
              {m.garmin_login_setup()}
            </Button>
            {showLogin && (
              <form
                className="space-y-3 max-w-md"
                onSubmit={(event) => {
                  event.preventDefault();
                  login.mutate();
                }}
              >
                <p className="text-sm">{m.garmin_login_help()}</p>
                {mfa ? (
                  <label className="block">
                    {m.garmin_login_code()}
                    <input
                      className="w-full border rounded p-2"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </label>
                ) : (
                  <>
                    <label className="block">
                      {m.email()}
                      <input
                        className="w-full border rounded p-2"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      {m.password()}
                      <input
                        className="w-full border rounded p-2"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                    </label>
                  </>
                )}
                <Button type="submit" disabled={login.isPending}>
                  {m.connect()}
                </Button>
              </form>
            )}
          </div>
        )}
        {!data.connected && <p>{m.garmin_login_needed()}</p>}
        <Button
          disabled={
            !data.connected || sync.isPending || data.running || login.isPending
          }
          onClick={() => sync.mutate()}
        >
          {sync.isPending || data.running
            ? m.garmin_manual_running()
            : m.garmin_manual_button()}
        </Button>
        <p className="text-sm">
          {m.garmin_manual_last_success({
            date: data.lastSuccess
              ? new Date(data.lastSuccess).toLocaleString()
              : m.garmin_manual_never(),
          })}
        </p>
        {data.result && (
          <p className="text-sm">
            {m.garmin_manual_result({
              imported: data.result.imported,
              updated: data.result.updated ?? 0,
              skipped: data.result.skipped,
              metrics: data.result.metrics,
            })}
          </p>
        )}
        {data.result?.fitsImported !== undefined && (
          <p className="text-sm">
            {m.garmin_manual_fit_result({
              imported: data.result.fitsImported,
              failed: data.result.fitsFailed?.length ?? 0,
              pending: data.result.fitsPending ?? 0,
            })}
          </p>
        )}
        {data.result?.fitsChecked !== undefined && (
          <p className="text-sm">
            {m.garmin_manual_fit_checked({ count: data.result.fitsChecked })}
          </p>
        )}
        {!!data.result?.fitsIncompatible?.length && (
          <p className="text-sm" role="status">
            {m.garmin_manual_fit_incompatible({
              ids: data.result.fitsIncompatible.join(', '),
            })}
          </p>
        )}
        {!!data.result?.fitsFailed?.length && (
          <p className="text-sm" role="status">
            {m.garmin_manual_fit_failed_ids({
              ids: data.result.fitsFailed.join(', '),
            })}
          </p>
        )}
        {!!data.result?.warnings.length && (
          <p role="status" className="text-sm">
            {m.garmin_manual_warnings()}
          </p>
        )}
        {(error || data.error) && <p role="alert">{error || data.error}</p>}
      </Content>
    </Container>
  );
}
