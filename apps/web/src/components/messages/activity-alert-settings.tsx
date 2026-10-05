import { useAuthContext } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CoachActivityAlertSettingsDto } from '@openathlete/shared';

import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

export function ActivityAlertSettings({ athleteId }: { athleteId: number }) {
  const { user } = useAuthContext();
  const cache = useQueryClient();
  const queryKey = ['coach-activity-alert-settings', user?.userId, athleteId];
  const path = `/messages/activity-alert-settings/${athleteId}`;
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await client.get<CoachActivityAlertSettingsDto>(path)).data,
    retry: false,
  });
  const update = useMutation({
    mutationFn: async (settings: CoachActivityAlertSettingsDto) =>
      (await client.put<CoachActivityAlertSettingsDto>(path, settings)).data,
    onSuccess: (data) => cache.setQueryData(queryKey, data),
  });
  const fields = [
    ['notifyComments', m.activity_alert_comments()],
    ['notifyRpe', m.activity_alert_rpe()],
    ['notifyNewActivities', m.activity_alert_new()],
  ] as const;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {m.activity_alert_settings_help()}
      </p>
      {query.isPending && <p>{m.loading()}</p>}
      {query.isError && (
        <div role="alert">
          <p>{m.activity_alert_settings_error()}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {m.activity_alert_retry()}
          </Button>
        </div>
      )}
      {query.data &&
        fields.map(([field, label]) => (
          <label
            key={field}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span>{label}</span>
            <Switch
              aria-label={label}
              checked={query.data[field]}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate({ ...query.data!, [field]: checked })
              }
            />
          </label>
        ))}
      {update.isPending && (
        <p role="status" className="text-sm">
          {m.loading()}
        </p>
      )}
      {update.isSuccess && !update.isPending && (
        <p role="status" className="text-sm">
          {m.activity_alert_settings_saved()}
        </p>
      )}
      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.activity_alert_settings_error()}
        </p>
      )}
    </div>
  );
}
