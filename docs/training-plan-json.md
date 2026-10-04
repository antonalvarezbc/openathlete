# Importing JSON training plans

In **Coach → Planning** (`/dashboard/planning`), open **Import JSON plan**.
Planning is separate from Settings; old `?tab=training_plan` settings links redirect
to it. Upload a file or paste JSON, explicitly select an athlete and start date,
review the weeks, confirm the review and publish to the calendar. JSON remains
editable before publication. Cancelling creates no plans or sessions. File preview
is local; the import request is sent only after confirmation.

The dialog starts with **First time? Start from an example**:

- **Load example** puts a fictional three-week 10K plan in the JSON box, so the
  preview shows what it would create. If the box already has other JSON, it asks
  before replacing it. Nothing is imported until you confirm and publish.
- **Download example** saves it as `training-plan-example.json` to edit.
- **The format in brief** summarizes the rules below.

The example is also in [examples/training-plan.json](examples/training-plan.json).
It covers two cycles, running and strength sessions, sessions with and without
structure, repeat blocks, time and distance steps, and RPE, maximum heart rate
percentage and absolute pace targets. A web test keeps that file identical to the
one the dialog uses and checks that it passes import and workout validation.

Importing JSON needs no AI API key or LLM call. AI session generation is a separate
workflow.

## Format

- Maximum JSON size: 90 kB, within the existing HTTP limit.
- `plan.duration`: integer weeks, equal to the sum of cycle durations. Technical
  limits are 104 weeks and 1,500 sessions per import.
- `dayOfWeek`: 0 is Sunday, 1 Monday, through 6 Saturday. Each week spans seven
  days from the chosen date; for a Monday start, Sunday is the last day.
- `goalDuration`: positive integer seconds. When absent, the calendar reserves an
  hour but leaves the duration goal unspecified.
- `goalDistance` and `goalElevationGain`: nonnegative meters. `goalRpe`: 0–10,
  converted to the stored 0–1 scale; zero is preserved.
- Sessions start at 09:00 in the browser's timezone, respecting daylight saving
  changes. The API accepts an IANA `timeZone`, defaulting to UTC when omitted.
- Targets: `RPE` uses `targetValue`; heart rate relative to the maximum uses
  `targetMin`/`targetMax` between 0 and 1 with `metricType: "HR_MAX"`; absolute
  `PACE` is in m/s (1000 ÷ seconds per km, so 4:30/km is 3.70), the slower pace as
  `targetMin`.
- `workout.steps` uses the existing OpenAthlete step types. Repeats require child
  steps, allow 1–99 repetitions and cannot be nested. Both `repeatBlock` and legacy
  `childSteps`/`repeatTimes` representations are accepted. Array order takes
  precedence over the compatibility field `orderIndex`. Rest periods are steps;
  `restTime` is not imported.
- Unknown fields are rejected. Custom Metrics, structured nutrition, fatigue
  rules and an exercise library are not part of this format.
- `plan.sportType`, `distance`, `timeTarget` and `elevationGainRange` are metadata
  from the existing SEO format. They have no dedicated `TrainingPlan` columns and
  are not persisted as structured plan goals. Session goals are persisted.

Validation is structural, not a coaching or medical assessment. A valid JSON plan
may prescribe inappropriate load and still requires coach review.

## Publication, access and replacement

Import requires the **COACH** role plus access to the target athlete. A dual-role
account can import into its own athlete profile; an athlete-only account cannot
publish plans. Confirmation creates an ACTIVE plan, cycles, weeks, events and
workouts in one PostgreSQL transaction. No sessions are created beforehand; a
DRAFT status is not used to imply calendar isolation. Import does not export to
Garmin.

A matching plan name, athlete and start date is rejected as a duplicate. To replace
it, explicitly select the existing plan. Its ID and athlete are preserved while
cycles, weeks and sessions are replaced. Only plans that have not started, with
future sessions and no linked activities, comments, templates, exported workouts
or linked races can be replaced. This is not partial adaptation of an active plan.

Concurrent conflicts are rejected; review the calendar before retrying. Temporary
token consumption is atomic. Existing token-storage links remain public and keep
their expiration behavior; do not use them to publish private data. File uploads
use the authenticated import endpoint directly.

## Endpoints

- `POST /seo-plan/import-json`: `{planData, athleteId, startDate, timeZone, replacePlanId?}`.
- `GET /seo-plan/athletes/:athleteId/plans`: available plans; requires athlete access.
- `POST /seo-plan/:token/import`: the same import options without `planData`;
  requires authentication and the import permissions above.
- `POST /seo-plan` and `GET /seo-plan/:token`: existing public temporary storage.

## Verification

```sh
pnpm shared build
pnpm api exec jest --runInBand
pnpm shared tsc:check
pnpm api tsc:check
pnpm web tsc:check
pnpm shared lint
pnpm api lint
pnpm web lint
```

With a local API/PostgreSQL instance and linked fictional test accounts:

```sh
node scripts/test-json-plan-import.cjs lab/local-qa/accounts.json
```

The ignored accounts file contains `coach` and `athlete`, each with `email` and
`password`. Use test addresses under `openathlete.test`, never production accounts.
The integration script logs in normally and verifies access, persistence, dates,
duplicates, replacement, concurrency and rollback after a failure in the second
session. It deletes only plans and tokens created by that run. It makes no Garmin
or LLM calls.

## Source references

- [Import schema](../libs/shared/src/types/dtos/seo/training-plan-import.dto.ts)
- [Import service](../apps/api/src/modules/core/services/training-plan.service.ts)
- [Import controller](../apps/api/src/modules/seo/seo-plan.controller.ts)
