# Coach dashboard

The **Dashboard** at `/dashboard/coach` is the first screen of the coach space.
The dashboard index, switching to the coach space and a coach-first login open
it. It is the first item of the coach sidebar and of the mobile bottom bar,
before Planning. Athlete-only accounts are sent to their calendar. Saved
`/dashboard/coach?…` links with query parameters still open Planning with those
parameters.

## What it shows

A period switch reviews the **last 7 days** (default) or the **last 28 days**.
The next 7 days are always checked for planned sessions.

- **Team compliance**: sessions done out of sessions due, for all coached
  athletes (yourself included when you coach yourself).
- **Today**: today's sessions done out of those planned.
- **Needs attention**: how many athletes have something to check, and below, a
  list with the reasons, the most serious first:
  1. Active injuries (any status except resolved).
  2. Sessions missed in the last 3 days, by name and date.
  3. Compliance under 50 % with at least two sessions due.
  4. No activity for 5 days or more, or no activity at all.
  5. No sessions planned today or in the next 7 days.
  6. Activities linked to no session. This is a hint shown with other reasons;
     on its own it does not put an athlete in the list.
- **Compliance by athlete**: every coached athlete, lowest compliance first and
  athletes without past sessions last. Each row shows a compliance bar, sessions
  done out of due, time compliance, today's sessions, sessions in the next 7
  days, the last activity and a link to the athlete's calendar.

With no coached athletes yet, the dashboard links to Settings → Athletes to
invite one.

## How compliance is measured

- A session is **due** when it was planned from the start of the period to the
  start of today. Today's sessions are shown apart and are never counted as
  missed.
- A due session is **done** when it has a linked activity. Imported activities
  are linked automatically to a similar session of the same day; others can be
  linked from the session details, where the same day's activities are
  suggested first.
- **Time compliance** compares the moving time of the linked activities with the
  goal duration, only for due sessions that have a goal duration.
- Only training sessions count; competitions do not.

Day boundaries come from the coach's browser, so "today" follows the coach's
time zone.

## API

`GET /coach/overview?from=…&today=…&until=…` requires the COACH role. The three
ISO 8601 dates are local midnights: the first day reviewed, today, and the end
(exclusive) of the upcoming days. `today` must be after or equal to `from`,
`until` at least one day after `today`, and the window at most 120 days. Per
athlete it returns due and done sessions, compliance, planned and completed
time, the three latest missed sessions and their total, today's sessions,
upcoming sessions, unlinked activities, the latest activity and active injuries.
See [`CoachOverviewAthleteDto`](../libs/shared/src/types/dtos/core/coach-overview.dto.ts).

The older `GET /coach/dashboard` endpoint is unchanged and no longer used by the
web app.

Source:
[service](../apps/api/src/modules/core/services/coach.service.ts),
[attention rules](../apps/web/src/views/dashboard/coach-home/coach-overview.ts),
[view](../apps/web/src/views/dashboard/coach-dashboard-view.tsx).
