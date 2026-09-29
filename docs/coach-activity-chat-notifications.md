# Activity notifications in coach conversations

Coaches can choose **Athletes → Chat notifications** for each linked athlete.
The three independent switches control athlete comments/responses, changes to
RPE, and new activities. All are enabled initially. Preferences belong to the
requesting coach and apply to future changes; switching them off keeps existing
chat history.

Notifications appear as clearly marked automatic entries in the one-to-one
conversation between that coach and athlete. The athlete can also see these
entries. Each has an **Open activity** button, and RPE notices display the
reported value on the 0–10 scale. Opening checks normal activity permissions;
deleted activities retain a notice with an unavailable link. No arbitrary URLs
or HTML supplied by users are interpreted as links.

## Triggers

- Manual changes to the activity RPE, including clearing it.
- Changes to the activity description, messages/edits in its comment thread,
  and changed questionnaire answers submitted by its owner.
- A newly created manual activity or newly uploaded FIT file.
- New rows added by manual Garmin synchronization.
- Newly stored activities from ordinary official-provider import jobs.

Coach-authored feedback, unchanged values, repeated imports, enrichment of an
existing FIT and load recalculation do not create additional notices. The
separate provider bulk-history import jobs are excluded to avoid a historical
notification burst. Explicit manual uploads and new manual-Garmin rows count as
newly added activities, even when the activity itself is older.

The notification only links to the existing activity/comment. It does not copy
comment text or use an AI provider. These automatic entries do not trigger the
existing email-notification scheduler; this feature is for the in-app chat.
Regular manually authored messages retain their existing notification behavior.

## Storage, access and delivery

- `coach_activity_alert_settings`: one preference row per coach and athlete.
- `activity_chat_notice`: typed notice metadata and a unique delivery key per coach.
- Existing `message` and direct `message_thread` records provide chat history,
  unread counts and read receipts. A typed relation distinguishes notices from
  messages written by a person, so notices cannot be edited as human messages.
- Group and activity-specific conversations are never used as the destination.
  An existing exact two-person conversation is reused, or one is created.
- Delivery rechecks the current relationship and coach role. The actor on a
  comment/RPE change must be the owner of the activity.
- A PostgreSQL transaction and advisory lock serialize concurrent deliveries for
  a coach. Unique delivery keys prevent duplicates. Disabled notices retain a
  suppression record, and deleting a chat does not allow retries to recreate it.
- WebSocket inbox subscription works without an already open conversation.

The feature uses the application's asynchronous event mechanism. Delivery errors
are logged without failing the activity update. It is not a durable outbox:
a process interruption between saving an activity and handling its event can
lose the notice. No historical scan, automatic provider polling or replay of
older feedback is introduced.

## API and migration

Authenticated `GET` / `PUT` at `/messages/activity-alert-settings/:athleteId`.
Only a linked coach can read or change their own preferences. PUT accepts exactly
three booleans: `notifyComments`, `notifyRpe`, `notifyNewActivities`.

```sh
pnpm database run db:deploy
pnpm database run db:generate
pnpm shared build
```

Restart the API after generating Prisma. No new environment variables are needed.

## Source references

- [Notification regression tests](../apps/api/src/modules/messages/services/message-activity-notice.spec.ts)
- [Activity-notice UI](../apps/web/src/components/messages/activity-chat-notice.tsx)
