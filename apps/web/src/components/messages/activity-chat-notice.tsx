import { useGetEventQuery } from '@/api/event';
import { m } from '@/paraglide/messages';
import { Bell, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { ActivityChatNoticeDto, EVENT_TYPE } from '@openathlete/shared';

import { ActivityDetails } from '../event-details/activity-details';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

function NoticeActivity({ eventId }: { eventId: number }) {
  const {
    data: event,
    isPending,
    isError,
  } = useGetEventQuery(eventId, { retry: false });
  if (isPending) return <p>{m.loading()}</p>;
  if (isError || event?.type !== EVENT_TYPE.ACTIVITY)
    return <p role="alert">{m.activity_alert_unavailable()}</p>;
  return <ActivityDetails event={event} />;
}

export function ActivityChatNotice({
  notice,
}: {
  notice: ActivityChatNoticeDto;
}) {
  const [open, setOpen] = useState(false);
  const heading =
    notice.kind === 'RPE'
      ? m.activity_alert_rpe_updated()
      : notice.kind === 'COMMENT'
        ? m.activity_alert_comment_updated()
        : m.activity_alert_uploaded();
  return (
    <div className="space-y-2">
      <p className="text-xs flex items-center gap-2 opacity-80">
        <Bell className="h-3 w-3" />
        {m.activity_alert_automatic()}
      </p>
      <p className="font-medium">{heading}</p>
      <p className="break-words">{notice.eventName}</p>
      {notice.kind === 'RPE' && (
        <p>
          {notice.rpe == null
            ? m.activity_alert_rpe_removed()
            : `RPE ${notice.rpe}/10`}
        </p>
      )}
      {notice.eventId ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <ExternalLink className="h-4 w-4" />
          {m.activity_alert_open()}
        </Button>
      ) : (
        <p className="text-sm">{m.activity_alert_unavailable()}</p>
      )}
      {open && notice.eventId && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent mobileFullscreen className="sm:max-w-6xl">
            <DialogHeader>
              <DialogTitle>{notice.eventName}</DialogTitle>
            </DialogHeader>
            <NoticeActivity eventId={notice.eventId} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
