import { useGetMeQuery, useUpdateAccountMutation } from '@/api/user';
import { userKeys } from '@/api/user/user.keys';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { m } from '@/paraglide/messages';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { SettingsSection } from './settings-section';

/** The evening push reminder of the next day's planned sessions. */
export function TrainingRemindersSection() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMeQuery();
  const updateMutation = useUpdateAccountMutation({
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [userKeys.getMe] }),
    onError: () => toast.error(m.training_reminders_update_failed()),
  });

  return (
    <SettingsSection title={m.notifications()}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="training-reminders">{m.training_reminders()}</Label>
          <p className="text-sm text-muted-foreground">
            {m.training_reminders_description()}
          </p>
        </div>
        <Switch
          id="training-reminders"
          checked={me?.trainingReminders ?? true}
          onCheckedChange={(trainingReminders) =>
            updateMutation.mutate({ trainingReminders })
          }
          disabled={!me || updateMutation.isPending}
        />
      </div>
    </SettingsSection>
  );
}
