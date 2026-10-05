# Adapting the next session or the rest of the week

Open **Coach → Planning → Review and adapt with AI** (`/dashboard/planning`).

1. Select an athlete and a plan, or use the calendar without a plan. Normally it needs future, uncompleted
   sessions. A future week already belonging to the plan can also receive new
   sessions when adding sessions is explicitly enabled, even if it is empty.
2. Choose **Next session** or **Rest of the week**. For the latter, choose the
   first day of the seven-day period to review.
3. Set the current state and describe feelings, circumstances and coach
   restrictions. These inputs supplement stored records.
4. Choose **Review athlete context** to inspect the data before sending it to
   the configured AI provider.
5. Generate a proposal and review each original session, proposed changes,
   explanation and structured workout. Edit duration/RPE or the complete JSON
   proposal as needed.
6. Reject the proposal, or confirm the review and choose **Accept and apply changes**.

Context preview and generation do not write to the calendar. Only acceptance
saves changes. Completed activities, past sessions, competitions and sessions
outside the eligible next-session/seven-day scope cannot be modified. At most 28 existing sessions can
be adapted in one request.

Dates stay fixed by default. **Allow redistributing sessions between days**
permits proposed moves within both the selected period and the session's original
plan week, without moving into the past or overlapping other calendar entries.
For Next session, the period begins on that session's day and spans seven days,
also constrained by its plan week. Adding sessions requires a separate permission;
missed workouts are not accumulated automatically.

Proposals use the coach's interface language. KEEP sessions retain their original
text. Regenerate an old proposal if a changed language or output format is needed.

## Independent permissions

Eligible sessions can already be kept, reduced or edited within their limits
without enabling extra permissions:

- **Increase existing sessions** permits exceeding their original targets up to
  the selected percentage.
- **Add sessions** permits new workouts within additional session-count, total
  minutes and RPE limits.
- **Redistribute sessions** permits date changes within the allowed boundaries.

Enabling multiple options combines those permissions. None enables editing the
whole plan outside the selected scope. Additional minutes are a ceiling, not a
quantity the model must fill.

## Increasing load

This is optional, not the default goal. Choose the recovered/ready state and
explicitly allow increased load for existing sessions, with a maximum of 0–25%.
The interface initially suggests 10% as an editable technical limit, not as a
training recommendation. The model may still maintain or reduce sessions.

For example, with fictional data, a 60-minute session could become 63 minutes
(+5%) at the same intensity if the coach authorizes and reviews the change. This
illustrates the interface, not a prescription for an individual athlete.

Server validation checks:

- Explicit increase permission, READY state and no unresolved recorded injuries.
  Fatigue, illness, pain and unknown state block increases.
- Per-session duration, distance, elevation gain and RPE limits, plus totals
  across selected sessions.
- Step durations, target maxima and exposure computed as target × duration ×
  repetitions, comparing compatible units.
- No increases from unknown or zero baselines. If `goalDuration` is missing, the
  calendar-derived duration is marked as inferred and cannot be increased.
- Basic workout consistency, athlete ownership of zones and overlaps caused by
  lengthening a session.

These checks are not a physiological model or medical guarantee. They do not
fully interpret intensity, sport changes or free-text instructions. The coach
must review each proposal. A single HRV reading never automatically authorizes
an increase.

## Load and recovery workflow

The [shared planning evidence](ai-planning-workflow.md) adds dated recovery
comparisons against a personal baseline, stored load coverage, RPE/answers and
linked planned-versus-actual activity summaries. Inspect it before generation.
You can also transfer your current state and latest question from the assistant
into the next-session or week adaptation form. Permissions start disabled.

## Context sent to the model

- Selected plan name, description, goal and dates.
- Eligible sessions, goals, structured workouts and surrounding calendar,
  including competitions and training already linked to completed activities.
  Eligible descriptions/workouts are in `sessions.original`; surrounding entries
  also include descriptions, workouts, plan/week and an `editable` flag.
  Inclusion in context does not authorize editing an ineligible entry.
- Up to 200 activities from the last 42 days: duration, distance, elevation gain,
  average HR, RPE converted to 0–10, descriptions and stored load entries kept
  separate by calculation method.
- Up to 10 comments per activity, only from threads the requester participates
  in; date and text limited to 1,500 characters. Descriptions are limited to 3,000.
- Dated metrics from those 42 days: average overnight HRV, highest overnight
  five-minute HRV, resting HR, sleep duration/score, average stress, Body Battery
  charged/drained, RMSSD, maximum HR and VO₂ max, using their existing units.
- Training zones, unresolved recorded injuries, current state, feedback and coach
  instructions for this proposal.

Metrics are read from `AthleteMetric`, which may contain Garmin imports or values
entered through other paths. This does not contact Garmin. Missing values stay
explicitly missing, rather than being invented or treated as zero. The service
does not calculate fresh ATL/CTL/TSB or fetch the complete 42-day load window.

Profile name/email fields, credentials, API keys, raw GPS/HR streams and general
conversations are excluded. Plan text and activity comments may contain personal
information; inspect the preview before sending. Explicit target/preparation race
priority is not added to this adaptation context, even though the separate
[activity analysis](coach-activity-ai-analysis.md) context includes plan races.

## Model, review and persistence

The adaptation agent has no write tools and uses `AI_MODEL_EVENT_MODIFICATION`,
the existing provider keys and the `AI_GENERATION` feature entitlement. This flow
introduced no separate model setting, dependency or database migration.

Structured output is validated before presentation and again before saving,
including coach edits. A parseable proposal that violates a rule is returned as
a draft with `validationIssue` (code and session where applicable). The interface
shows the translated reason and disables acceptance. Manual edits or a follow-up
AI request can correct it; refinement also receives the detected violation.

If output does not satisfy the schema, the interface shows recoverable model
content and the refinement chat, without allowing acceptance. Further failures
retain access to that chat. Once a valid structure is returned, session cards and
review confirmation become available. If the SDK supplies no recoverable text,
the interface says so and allows another request using the same context. Internal
messages, credentials and provider headers are not displayed.

Unvalidated text is limited to 100,000 characters. The most recent ten refinement
turns live only in the interface; reloading or leaving loses the conversation.
Unaccepted proposals are not saved to the calendar or persisted as drafts.

Acceptance rereads context and compares its fingerprint with the reviewed version.
Changed sessions, activities, metrics or other relevant data require a new
proposal. All selected writes are atomic: failure rolls back the complete batch.

REST retains the planned event with zero goals, sport OTHER and no workout. It
does not delete activities or comments. Exported workouts are protected; this
flow cannot update them or external devices. Changed sessions have `estimatedLoad`
cleared to null, without automatically asking another model to recalculate it.

## Adding sessions to a recovered week

Choose a weekly scope, its start date and READY state, then enable adding sessions
in addition to adapting existing ones. Review the maximum number of sessions,
**maximum total additional minutes**, and maximum RPE. These limits are independent
of the percentage for increasing existing sessions. The model may propose fewer
minutes/sessions or none.

New sessions are displayed separately with dates and explanations. Discard them
individually or edit the JSON before acceptance. Accepted sessions belong to the
same athlete and an existing plan week. Access, recovery, injuries, future dates,
limits and overlaps are validated. Additions and updates share one transaction;
an already applied proposal becomes stale.

Each new session includes sport, duration, RPE, description and a mandatory
structured workout. Steps use time and optional absolute RPE targets bounded by
the approved maximum. Simple repeats are allowed and total workout duration must
match the session. They are stored as `Workout`/`WorkoutStep`/targets and appear in
the structured-workout editor. New sessions do not yet include distance or
elevation-gain goals. UPDATE can also add structure to an existing unstructured
session within its duration/RPE limits; older saved sessions are not backfilled.

An empty future week can receive sessions if it already belongs to the plan.
Adaptation does not create weeks or extend plan dates. Selecting a future plan
initially selects its start day.

The no-sessions error means the selected plan has no uncompleted training whose
start time is still future within the selected period. A standalone calendar
session or one from another week does not satisfy that filter. Stable server
codes are translated; unexpected errors do not expose raw provider messages.

## Refinement conversation

After generation, enter a request under **Refine with AI**. Each turn sends the
whole draft (including manual edits), the comment and up to ten previous
comment/summary turns. The model returns a complete revised proposal and explains
its response in the summary. A failed request preserves the draft; each revision
clears the acceptance confirmation.

The refine endpoint validates input/output, authentication, AI access, athlete/plan
access and context version. It writes no calendar data. Limits always compare
against the original calendar, never the previous draft, so increases cannot be
accumulated over turns. Calendar changes require regeneration. Changing request
parameters or permissions resets the draft. Proposals from before mandatory
structured workouts for new sessions must be regenerated.

## API and verification

All endpoints use the base `/agent/ai/plan-adaptation`:

- `POST /context`
- `POST /propose`
- `POST /refine`
- `POST /apply`

```sh
pnpm shared build
pnpm api exec jest --runInBand
node scripts/test-plan-adaptation.cjs lab/local-qa/accounts.json
```

The integration script needs a local API/PostgreSQL instance and linked fictional
accounts under `openathlete.test`. The ignored accounts file is described in the
[JSON import guide](training-plan-json.md#verification). Tests cover permissions,
context, unauthorized increases, explicit increases, stale proposals, rest and
rollback on intermediate failures. They make no LLM/Garmin calls and remove their
own fixtures.

Service and browser regression coverage also checks language, redistribution,
new structured sessions, refinement against the original calendar, invalid
provider output and preserved drafts. PostgreSQL checks cover atomic writes,
duplicates and RPE-target persistence. Mocked responses do not establish that
all real-provider outputs are valid; previously reported provider-format failures
must not be treated as resolved solely because those tests pass.

Simple model steps may omit `repeatBlock`, normalized to null. A REPEAT container
can use duration 0 or null because its duration comes from children; work steps
still require positive durations. SDK format errors are translated and save no
changes. An empty proposal can explain its reasoning but cannot be applied.

## Source references

- [Adaptation service](../apps/api/src/modules/agent/services/plan-adaptation.service.ts)
- [Proposal validation](../apps/api/src/modules/agent/services/plan-adaptation.validation.ts)
- [Request and response schemas](../libs/shared/src/types/dtos/agent/plan-adaptation.dto.ts)
