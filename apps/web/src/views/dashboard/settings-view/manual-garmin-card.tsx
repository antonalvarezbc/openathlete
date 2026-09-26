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
import { getLocale } from '@/paraglide/runtime';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';

interface Backfill {
  runId: string;
  status: 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'PAUSED' | 'FAILED';
  reason?:
    | 'COMPLETE'
    | 'CANCELLED'
    | 'BUDGET'
    | 'COOLDOWN'
    | 'RATE_LIMIT'
    | 'AUTH'
    | 'ERROR'
    | 'BUSY'
    | 'INTERRUPTED';
  total: number;
  checked: number;
  updated: number;
  cached: number;
  downloaded: number;
  failed: string[];
  incompatible: string[];
  remaining: number;
  nextRequestAt?: string;
  startedAt: string;
  updatedAt: string;
}

interface Status {
  enabled: boolean;
  connected?: boolean;
  canConfigure?: boolean;
  athleteId?: number;
  lastAttempt?: string;
  lastSuccess?: string;
  running?: boolean;
  error?: string;
  backfill?: Backfill;
  backfillPending?: number;
  remoteBlockedUntil?: string;
  result?: {
    imported: number;
    updated?: number;
    skipped: number;
    metrics: number;
    warnings: string[];
  };
}

function isBackfillActive(backfill?: Backfill) {
  return backfill?.status === 'RUNNING' || backfill?.status === 'STOPPING';
}

function backfillMessage(backfill: Backfill) {
  if (backfill.status === 'RUNNING') return m.garmin_backfill_running();
  if (backfill.status === 'STOPPING') return m.garmin_backfill_stopping();
  switch (backfill.reason) {
    case 'COMPLETE':
      return m.garmin_backfill_complete();
    case 'CANCELLED':
      return m.garmin_backfill_cancelled();
    case 'BUDGET':
      return m.garmin_backfill_budget();
    case 'RATE_LIMIT':
      return m.garmin_backfill_rate_limit();
    case 'COOLDOWN':
      return m.garmin_backfill_cooldown();
    case 'AUTH':
      return m.garmin_backfill_auth();
    case 'BUSY':
      return m.garmin_backfill_busy();
    case 'INTERRUPTED':
      return m.garmin_backfill_interrupted();
    default:
      return m.garmin_backfill_failed();
  }
}

function actionError(failure: unknown) {
  if (!isAxiosError(failure)) return m.garmin_manual_failed();
  switch (failure.response?.data?.code) {
    case 'GARMIN_BACKFILL_BUSY':
    case 'GARMIN_LOGIN_BUSY':
      return m.garmin_backfill_busy();
    case 'GARMIN_REMOTE_COOLDOWN':
      return m.garmin_backfill_cooldown();
    case 'GARMIN_SYNC_COOLDOWN':
      return m.garmin_manual_cooldown();
    case 'GARMIN_LOGIN_REQUIRED':
      return m.garmin_backfill_auth();
    case 'GARMIN_BACKFILL_FAILED':
      return m.garmin_backfill_failed();
    default:
      return typeof failure.response?.data?.message === 'string'
        ? failure.response.data.message
        : m.garmin_manual_failed();
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(getLocale());
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
  const [now, setNow] = useState(Date.now);
  const finishedRun = useRef<string | undefined>(undefined);
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
    // This endpoint only reads OA's local progress, never Garmin.
    refetchInterval: (query) =>
      isBackfillActive(query.state.data?.backfill) || query.state.data?.running
        ? 2_000
        : false,
  });
  const activeBackfill = isBackfillActive(status.data?.backfill);
  const blockedUntil = Date.parse(status.data?.remoteBlockedUntil ?? '');
  const syncAllowedAt = Date.parse(status.data?.lastAttempt ?? '') + 120_000;
  const remoteBlocked = blockedUntil > now;
  const syncCoolingDown = syncAllowedAt > now;

  useEffect(() => {
    const until = Math.max(blockedUntil || 0, syncAllowedAt || 0);
    if (until <= Date.now()) return;
    // Countdown only; reaching zero never starts a Garmin request.
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [blockedUntil, syncAllowedAt]);

  useEffect(() => {
    const backfill = status.data?.backfill;
    if (
      backfill &&
      !isBackfillActive(backfill) &&
      finishedRun.current !== backfill.runId
    ) {
      finishedRun.current = backfill.runId;
      void cache.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'garmin-manual-status',
      });
    }
  }, [cache, status.data?.backfill]);

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
    onError: (failure) => setError(actionError(failure)),
    onSettled: () => {
      void status.refetch();
    },
  });
  const backfill = useMutation({
    mutationFn: async () =>
      (await client.post('/provider/garmin-manual/backfill', { athleteId }))
        .data,
    retry: false,
    onMutate: () => setError(undefined),
    onError: (failure) => setError(actionError(failure)),
    onSettled: async () => {
      await status.refetch();
    },
  });
  const stopBackfill = useMutation({
    mutationFn: async () =>
      (
        await client.post('/provider/garmin-manual/backfill/stop', {
          athleteId,
        })
      ).data,
    retry: false,
    onMutate: () => setError(undefined),
    onError: (failure) => setError(actionError(failure)),
    onSettled: async () => {
      await status.refetch();
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
      }
      await status.refetch();
    },
    onError: async (failure) => {
      setMfa(false);
      const guardedFailure =
        isAxiosError(failure) &&
        [
          'GARMIN_BACKFILL_BUSY',
          'GARMIN_REMOTE_COOLDOWN',
          'GARMIN_LOGIN_REQUIRED',
        ].includes(failure.response?.data?.code);
      setError(guardedFailure ? actionError(failure) : m.garmin_login_failed());
      await status.refetch();
    },
  });
  if (status.isError && !status.data)
    return <p role="alert">{m.garmin_manual_status_failed()}</p>;
  if (!status.data?.enabled) return null;
  const data = status.data;
  const busy =
    sync.isPending ||
    data.running ||
    activeBackfill ||
    backfill.isPending ||
    login.isPending;
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
      <Content className="min-w-0 space-y-4 break-words">
        {!compact && configure && space === 'ATHLETE' && data.canConfigure && (
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => setShowLogin(!showLogin)}
              disabled={busy || remoteBlocked || mfa}
            >
              {m.garmin_login_setup()}
            </Button>
            {showLogin && (
              <form
                className="space-y-3 max-w-md"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!busy && (!remoteBlocked || mfa)) login.mutate();
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
                      disabled={busy}
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
                        disabled={busy || remoteBlocked}
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
                        disabled={busy || remoteBlocked}
                        required
                      />
                    </label>
                  </>
                )}
                <Button
                  type="submit"
                  disabled={busy || (remoteBlocked && !mfa)}
                >
                  {m.connect()}
                </Button>
              </form>
            )}
          </div>
        )}
        {!data.connected && <p>{m.garmin_login_needed()}</p>}
        <div className="space-y-2">
          <Button
            className="h-auto min-h-11 max-w-full whitespace-normal text-left"
            disabled={
              !data.connected || busy || mfa || remoteBlocked || syncCoolingDown
            }
            onClick={() => sync.mutate()}
          >
            {sync.isPending || data.running
              ? m.garmin_manual_running()
              : m.garmin_manual_button()}
          </Button>
          <p className="text-sm text-muted-foreground">
            {m.garmin_manual_summary_help()}
          </p>
          <p className="text-sm">
            {m.garmin_manual_last_success({
              date: data.lastSuccess
                ? formatDate(data.lastSuccess)
                : m.garmin_manual_never(),
            })}
          </p>
          {syncCoolingDown &&
            !data.running &&
            !sync.isPending &&
            !remoteBlocked && (
              <p className="text-sm">
                {m.garmin_manual_available_at({
                  date: formatDate(new Date(syncAllowedAt).toISOString()),
                })}
              </p>
            )}
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
          {data.result?.warnings.includes('ActivityHistoryIncomplete') && (
            <p
              role="alert"
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              {m.garmin_manual_history_incomplete()}
            </p>
          )}
          {!!data.result?.warnings.length && (
            <p role="status" className="text-sm">
              {m.garmin_manual_warnings()}
            </p>
          )}
        </div>
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal text-left"
              disabled={!data.connected || busy || mfa || remoteBlocked}
              onClick={() => backfill.mutate()}
            >
              {activeBackfill || backfill.isPending
                ? m.garmin_backfill_running()
                : m.garmin_backfill_button()}
            </Button>
            {activeBackfill && (
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  stopBackfill.isPending || data.backfill?.status === 'STOPPING'
                }
                onClick={() => stopBackfill.mutate()}
              >
                {m.garmin_backfill_stop()}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {m.garmin_backfill_help()}
          </p>
          {data.backfillPending !== undefined && (
            <p className="text-sm">
              {m.garmin_backfill_pending({ count: data.backfillPending })}
            </p>
          )}
          {data.backfill && (
            <div
              className="space-y-2"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="text-sm font-medium">
                {backfillMessage(data.backfill)}
              </p>
              <progress
                className="block h-2 w-full accent-primary"
                aria-label={m.garmin_backfill_progress_label()}
                max={Math.max(data.backfill.total, 1)}
                value={Math.min(data.backfill.checked, data.backfill.total)}
              />
              <p className="text-sm">
                {m.garmin_backfill_progress({
                  checked: data.backfill.checked,
                  total: data.backfill.total,
                  updated: data.backfill.updated,
                  remaining: data.backfill.remaining,
                })}
              </p>
              <p className="text-sm">
                {m.garmin_backfill_sources({
                  cached: data.backfill.cached,
                  downloaded: data.backfill.downloaded,
                })}
              </p>
              {activeBackfill &&
                data.backfill.nextRequestAt &&
                Date.parse(data.backfill.nextRequestAt) > now && (
                  <p className="text-sm">
                    {m.garmin_backfill_next_request({
                      date: formatDate(data.backfill.nextRequestAt),
                    })}
                  </p>
                )}
              {!!data.backfill.failed.length && (
                <p className="text-sm">
                  {m.garmin_manual_fit_failed_ids({
                    ids: data.backfill.failed.join(', '),
                  })}
                </p>
              )}
              {!!data.backfill.incompatible.length && (
                <p className="text-sm">
                  {m.garmin_manual_fit_incompatible({
                    ids: data.backfill.incompatible.join(', '),
                  })}
                </p>
              )}
            </div>
          )}
        </div>
        {remoteBlocked && data.remoteBlockedUntil && (
          <p role="status" className="text-sm">
            {m.garmin_backfill_blocked_until({
              date: formatDate(data.remoteBlockedUntil),
            })}
          </p>
        )}
        {status.isError && (
          <p role="alert">{m.garmin_manual_status_failed()}</p>
        )}
        {(error || data.error) && <p role="alert">{error || data.error}</p>}
      </Content>
    </Container>
  );
}
