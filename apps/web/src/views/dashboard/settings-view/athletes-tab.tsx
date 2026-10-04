import {
  useCancelAthleteInvitationMutation,
  useCoachSelfMutation,
  useGetMyCoachedAthletesQuery,
  useGetSentAthleteInvitationsQuery,
  useInviteAthleteMutation,
  useRemoveAthleteMutation,
} from '@/api/athlete';
import { useInstallationFeatures } from '@/api/installation/installation.hooks';
import { AiMemorySettings } from '@/components/ai-memory-settings';
import { ConfirmAction } from '@/components/confirm-action';
import { InviteAthleteDialog } from '@/components/invite-athlete-dialog/invite-athlete.dialog';
import { ActivityAlertSettings } from '@/components/messages/activity-alert-settings';
import { PaywallDialog } from '@/components/paywall';
import { TrainingZoneEditor } from '@/components/training-zone-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton, SkeletonTableRow } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthContext, useUserRoles } from '@/contexts/auth';
import { useAthleteLimit } from '@/hooks/use-feature-access';
import { m } from '@/paraglide/messages';
import { getPath } from '@/routes/paths';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ManualGarminCard } from './manual-garmin-card';
import { SettingsSection } from './settings-section';

export function AthletesTab() {
  const { manualGarminSync } = useInstallationFeatures();
  const { data: athletes, isPending: isLoadingAthletes } =
    useGetMyCoachedAthletesQuery();
  const nav = useNavigate();
  const [alertsAthleteId, setAlertsAthleteId] = useState<number | null>(null);
  const [zonesAthleteId, setZonesAthleteId] = useState<number | null>(null);
  const [memoryAthleteId, setMemoryAthleteId] = useState<number | null>(null);
  const { data: sentInvitations, isLoading: sentInvitationsLoading } =
    useGetSentAthleteInvitationsQuery({ enabled: true });
  const [deleteAthleteDialog, setDeleteAthleteDialog] = useState<number | null>(
    null,
  );
  const [inviteAthleteDialog, setInviteAthleteDialog] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const { user } = useAuthContext();
  const roles = useUserRoles();
  // A coach who is also an athlete can coach their own athlete profile.
  const isSelf = (athleteUserId?: number) =>
    !!user && athleteUserId === user.userId;
  const coachesSelf = !!athletes?.some((athlete) =>
    isSelf(athlete.user?.userId),
  );
  const canCoachSelf =
    !!roles?.includes('ATHLETE') && !isLoadingAthletes && !coachesSelf;
  const coachSelfMutation = useCoachSelfMutation({
    onSuccess: () => toast.success(m.coach_self_added()),
    onError: () => toast.error(m.coach_self_failed()),
  });

  const { maxAthletes } = useAthleteLimit();
  // Coaching yourself does not use an athlete slot.
  const currentAthleteCount =
    athletes?.filter((athlete) => !isSelf(athlete.user?.userId)).length || 0;
  const canAddAthlete = useMemo(() => {
    if (maxAthletes === null) return true; // Unlimited
    return currentAthleteCount < maxAthletes;
  }, [maxAthletes, currentAthleteCount]);
  const removeAthleteMutation = useRemoveAthleteMutation();
  const inviteAthleteMutation = useInviteAthleteMutation({
    onSuccess: () => {
      setInviteAthleteDialog(false);
      toast.success(m.athlete_invited_successfully());
    },
  });
  const cancelInvitationMutation = useCancelAthleteInvitationMutation({
    onSuccess: () => {
      toast.success(m.invitation_cancelled());
    },
    onError: () => {
      toast.error(m.failed_to_cancel_invitation());
    },
  });
  const deletingSelf = isSelf(
    athletes?.find((athlete) => athlete.athleteId === deleteAthleteDialog)?.user
      ?.userId,
  );
  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="space-y-6">
      <Dialog
        open={alertsAthleteId !== null}
        onOpenChange={(open) => !open && setAlertsAthleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.activity_alert_settings_title()}</DialogTitle>
          </DialogHeader>
          {alertsAthleteId !== null && (
            <ActivityAlertSettings
              key={alertsAthleteId}
              athleteId={alertsAthleteId}
            />
          )}
        </DialogContent>
      </Dialog>
      <SettingsSection
        title={m.athletes()}
        description={m.athletes_tab_description()}
        action={
          <Button
            size="sm"
            onClick={() => {
              if (canAddAthlete) {
                setInviteAthleteDialog(true);
              } else {
                setPaywallOpen(true);
              }
            }}
          >
            {m.invite_athlete()}
          </Button>
        }
      >
        {canCoachSelf && (
          <div
            data-coach-self
            className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.coach_self_title()}</p>
              <p className="text-sm text-muted-foreground">
                {m.coach_self_help()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              isLoading={coachSelfMutation.isPending}
              disabled={coachSelfMutation.isPending}
              onClick={() => coachSelfMutation.mutate()}
            >
              {m.coach_self_button()}
            </Button>
          </div>
        )}
        {/* One block per athlete instead of table columns, so the actions
            wrap on every screen size. */}
        {!isLoadingAthletes && !athletes?.length ? (
          <p className="text-sm text-muted-foreground">
            {m.no_coached_athletes()}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {isLoadingAthletes
              ? Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="space-y-2 p-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </li>
                ))
              : athletes?.map((athlete) => (
                  <li key={athlete.athleteId} className="space-y-4 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {athlete.user?.firstName} {athlete.user?.lastName}
                          {isSelf(athlete.user?.userId) && (
                            <Badge variant="secondary">
                              {m.coach_self_you()}
                            </Badge>
                          )}
                        </p>
                        <p className="break-all text-sm text-muted-foreground">
                          {athlete.user?.email}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAlertsAthleteId(athlete.athleteId)}
                        >
                          {m.activity_alert_settings_title()}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setZonesAthleteId(athlete.athleteId)}
                        >
                          {m.edit_zones()}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMemoryAthleteId(athlete.athleteId)}
                        >
                          {m.ai_memory_settings()}
                        </Button>
                        {manualGarminSync && (
                          <ManualGarminCard
                            athleteId={athlete.athleteId}
                            display="button"
                            size="sm"
                            configure
                          />
                        )}
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() =>
                            nav(
                              getPath(['dashboard', 'calendar']) +
                                `/${athlete.athleteId}`,
                            )
                          }
                        >
                          {m.view_calendar()}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDeleteAthleteDialog(athlete.athleteId);
                          }}
                        >
                          {isSelf(athlete.user?.userId)
                            ? m.coach_self_stop()
                            : m.delete_()}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
          </ul>
        )}
      </SettingsSection>
      {sentInvitationsLoading ? (
        <SettingsSection
          title={m.sent_invitations_to_athletes()}
          description={m.sent_invitations_to_athletes_description()}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.email()}</TableHead>
                <TableHead>{m.invitation_sent_at()}</TableHead>
                <TableHead className="text-right">{m.actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonTableRow key={i} colCount={3} />
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      ) : sentInvitations && sentInvitations.length > 0 ? (
        <SettingsSection
          title={m.sent_invitations_to_athletes()}
          description={m.sent_invitations_to_athletes_description()}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.email()}</TableHead>
                <TableHead>{m.invitation_sent_at()}</TableHead>
                <TableHead className="text-right">{m.actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sentInvitations.map((invitation) => (
                <TableRow key={invitation.athleteInvitationId}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{formatDate(invitation.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        cancelInvitationMutation.mutate(
                          invitation.athleteInvitationId,
                        )
                      }
                      disabled={cancelInvitationMutation.isPending}
                    >
                      {m.cancel_invitation()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      ) : null}

      <Dialog
        open={zonesAthleteId !== null}
        onOpenChange={(open) => {
          if (!open) setZonesAthleteId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {m.training_zones()} ·{' '}
              {
                athletes?.find(
                  (athlete) => athlete.athleteId === zonesAthleteId,
                )?.user?.firstName
              }
            </DialogTitle>
          </DialogHeader>
          {zonesAthleteId !== null && (
            <TrainingZoneEditor
              key={zonesAthleteId}
              athleteId={zonesAthleteId}
              showHeading={false}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={memoryAthleteId !== null}
        onOpenChange={(open) => !open && setMemoryAthleteId(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {m.ai_memory_settings()} ·{' '}
              {
                athletes?.find(
                  (athlete) => athlete.athleteId === memoryAthleteId,
                )?.user?.firstName
              }
            </DialogTitle>
          </DialogHeader>
          {memoryAthleteId !== null && (
            <AiMemorySettings
              key={memoryAthleteId}
              athleteId={memoryAthleteId}
            />
          )}
        </DialogContent>
      </Dialog>
      <InviteAthleteDialog
        open={inviteAthleteDialog}
        onClose={() => setInviteAthleteDialog(false)}
        onInvite={(email) => inviteAthleteMutation.mutate({ email })}
        isLoading={inviteAthleteMutation.isPending}
      />
      <ConfirmAction
        open={!!deleteAthleteDialog}
        onClose={() => setDeleteAthleteDialog(null)}
        onConfirm={() => {
          if (deleteAthleteDialog) {
            removeAthleteMutation.mutate(deleteAthleteDialog);
          }
          setDeleteAthleteDialog(null);
        }}
        title={deletingSelf ? m.coach_self_stop() : m.delete_athlete()}
        message={
          deletingSelf
            ? m.coach_self_stop_confirm()
            : m.confirm_delete_athlete()
        }
        isLoading={removeAthleteMutation.isPending}
      />
      <PaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason="athlete-limit"
        analyticsSource="settings_athletes_tab"
      />
    </div>
  );
}
