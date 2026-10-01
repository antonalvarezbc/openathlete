# Weekly training view

The calendar has a **Month / Week** switch. Week view shows one Monday–Sunday
week with its plan context, the seven days side by side (stacked on mobile) and
planned versus done figures. The choice is remembered per browser
(`calendar_view` in local storage). Links with `?view=week` (for example from
plan weeks) open it directly.

## What the week shows

- **Header:** ISO week number and date range, with previous/next week and
  "This week".
- **Plan bar** (when a training plan covers the week): plan name, "week N of
  M", cycle and phase, week theme and plan races in the week. When several plan
  weeks overlap, the one with most overlap wins, then active plans before
  drafts.
- **Days:** the month view's day cells, so drag and drop, Alt+drag duplicate,
  templates, context menus, cycles and bulk selection keep working. Cards show
  full names and, per session, the actual TRIMP of activities or the estimated
  load of sessions still to do. Each day shows its load.
- **Panel:**
  - Load: actual + pending (estimated), against the week's target load and the
    recommended range of the weekly summary.
  - Volume done against planned volume and the week's target volume.
  - Sessions done out of planned, distance and elevation done vs planned.
  - Load per day (actual and pending) and time by sport.

Planned figures count every planned session and race of the week, done or not.
Loads follow the weekly summary rules: activities contribute their TRIMP,
sessions not done yet their estimated load.

## Coach actions

Available to coaches when the calendar allows planning (plan `DRAFT` or
`ACTIVE`, or no plan):

- **Edit week** (plan bar): theme, target volume (hours) and target load
  (TRIMP) of the plan week. Archived plans cannot be edited.
- **Week actions:**
  - **Copy week / Paste week:** copies planned sessions (done or not) and notes
    to the same weekdays and times of another week, with workouts. Copies stay
    in the source's plan week when the new date is inside that plan; otherwise
    they become plain calendar sessions.
  - **Move week to…:** moves planned sessions not done yet and notes.
  - **Clear week:** deletes planned sessions not done yet and notes, after
    confirmation.

Activities and races are never copied, moved or deleted by week actions.
Dates are computed in the browser's time zone, so weekdays and times survive a
daylight-saving change. Each event is processed on its own through the existing
event rules (permissions, workout copy, load estimation, plan-week
reassignment); a summary reports how many items could not be processed and why.

## Planning workspace

In **Planning → Training plan**, plan weeks are a selectable strip (cycle
colour, dates, theme, session count). The selected week (the current one by
default) is shown below in the calendar locked to week view, with the same
panel and actions. **Open in calendar** opens that week in the full calendar.

## API

- `GET /week-planning/overview?weekStart&athleteId&trainingPlanId`: plan week
  context and actual TRIMP per activity event. Athletes read their own; coaches
  their linked athletes.
- `PATCH /week-planning/weeks/:trainingWeekId` (coach): `theme`,
  `targetVolume` (seconds), `targetLoad`.
- `POST /week-planning/events/copy | move | delete` (coach): up to 60 events per
  request; returns `{ succeeded, failed: [{ eventId, message }] }`.

## Source references

- [Week view](../apps/web/src/components/calendar/calendar-week-view.tsx),
  [panel](../apps/web/src/components/calendar/calendar-week-panel.tsx),
  [plan bar](../apps/web/src/components/calendar/calendar-week-plan-bar.tsx),
  [actions](../apps/web/src/components/calendar/calendar-week-actions.tsx),
  [calculations](../apps/web/src/components/calendar/utils/week-stats.ts)
- [Plan weeks in Planning](../apps/web/src/components/plan-workspace/plan-weeks.tsx)
- [Week planning service](../apps/api/src/modules/core/services/week-planning.service.ts)
  and [DTOs](../libs/shared/src/types/dtos/core/week-planning.dto.ts)
