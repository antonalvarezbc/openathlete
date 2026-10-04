# Bulk deletion of planned workouts

## Coach flow

In the coach calendar, choose **Select workouts**, mark individual sessions and
choose **Delete selected**. Review the names and dates in the confirmation dialog
before deleting. Cancel leaves all sessions untouched.

**Select workouts** sits with the other calendar buttons: in the header, next
to the template library and the filters (icon only on small screens), and on
the mobile month list next to the month/week switch. It stays highlighted while
selecting and pressing it again leaves selection mode. The bar with the count,
**Cancel** and **Delete selected** appears below the header only while
selecting, so the header does not move.

Only planned `TRAINING` events without a linked completed activity can be
selected. Activities, competitions and notes are excluded. The action requires
the coach space, coach permissions and an editable calendar. Athlete-only accounts
have no bulk deletion controls.

Selection works in the desktop grid and mobile list. While selecting, dragging
and event context menus are disabled. A fixed mobile toolbar keeps the count and
actions accessible while scrolling. Changing athlete, plan or month resets the
selection; filters and refreshed event data remove ineligible selections.

## Execution and failures

The feature reuses the existing authenticated `DELETE /event/:id` endpoint and
its per-event authorization and provider-export cleanup. No schema or API changes
are required. Requests run sequentially and duplicate IDs are removed.

This is not an atomic batch: successful deletions remain deleted if another
request fails. The result reports deleted/failed counts and retains failed IDs
for review and retry. Calendar events, weekly load and plan summaries refresh
after the operation. A failed request can have side effects already performed by
the existing endpoint, so the failure report refers to the request result.

## Verification

```sh
node --experimental-strip-types --test scripts/tests/calendar-bulk-delete.test.mjs
pnpm web test
pnpm web tsc:check
pnpm web lint
pnpm check:locale-parity
```

Tests cover eligibility, sequential execution, deduplication, partial failures,
retrying only failures and empty selections, and the select button's states
(hidden where unavailable, disabled without eligible sessions or while
deleting, toggling selection mode). Local browser QA used four synthetic
sessions on the linked QA athlete: cancellation, real deletion, an intercepted
403 failure followed by retry, an unselected session preserved until explicitly
selected on mobile, and absence of controls for the athlete account. All four
synthetic sessions were removed by the end of the test. No AI or Garmin requests
were needed for those fixtures.

## Source references

- [Bulk-deletion UI](../apps/web/src/components/calendar/calendar-bulk-delete.tsx)
- [Select button](../apps/web/src/components/calendar/bulk-workout-select-button.tsx)
- [Deletion sequencing](../apps/web/src/components/calendar/utils/bulk-delete.ts)
