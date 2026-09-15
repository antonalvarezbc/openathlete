import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { m } from '@/paraglide/messages';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';

interface Status {
  enabled: boolean;
  athleteId?: number;
  lastAttempt?: string;
  lastSuccess?: string;
  running?: boolean;
  error?: string;
  result?: {
    imported: number;
    skipped: number;
    metrics: number;
    warnings: string[];
  };
}

export function ManualGarminCard() {
  const cache = useQueryClient();
  const [error, setError] = useState<string>();
  const status = useQuery({
    queryKey: ['garmin-manual-status'],
    queryFn: async () =>
      (await client.get<Status>('/provider/garmin-manual/status')).data,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sync = useMutation({
    mutationFn: async () =>
      (
        await client.post(
          '/provider/garmin-manual/sync',
          {},
          { timeout: 160_000 },
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
  if (status.isError)
    return <p role="alert">{m.garmin_manual_status_failed()}</p>;
  if (!status.data?.enabled) return null;
  const data = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.garmin_manual_title()}</CardTitle>
        <CardDescription>
          {m.garmin_manual_description({ athleteId: String(data.athleteId) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          disabled={sync.isPending || data.running}
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
              skipped: data.result.skipped,
              metrics: data.result.metrics,
            })}
          </p>
        )}
        {!!data.result?.warnings.length && (
          <p role="status" className="text-sm">
            {m.garmin_manual_warnings()}
          </p>
        )}
        {(error || data.error) && <p role="alert">{error || data.error}</p>}
      </CardContent>
    </Card>
  );
}
