# Coach activity analysis with AI

In the **Coach** space, open a completed activity and select **AI analysis**.
Add optional context (up to 5,000 characters), inspect the data preview, and generate
an assessment. The model uses the interface language: English, Spanish, French
or Italian.

## Review workflow

A successful generation validates and saves a new private analysis automatically.
It includes:

- Summary and planned-versus-actual comparison.
- Positive observations, concerns, suggested next steps and missing evidence.
- A draft message addressed to the athlete.

The original generated result and input snapshot remain unchanged. The coach can
edit and save the feedback draft or copy it for review/sharing elsewhere. This
feature does not send messages, publish comments or modify workouts. Only the
coach who generated an analysis can retrieve or edit it, and they must still have
access to that athlete. Athlete-only accounts cannot access these endpoints.
Coaches who also have an athlete role can analyze their own activities in the
Coach space.

The interface shows the latest 20 analyses per coach and activity. Generating
again adds a version; it does not overwrite an older analysis. Saved analyses and
feedback editing remain available even if AI generation access is unavailable.

## Actual input and limits

The server constructs a bounded context from stored OpenAthlete data:

- Selected activity: duration, distance, elevation gain, heart rate, speed, power,
  cadence, RPE, description, stored load entries and answered athlete feedback.
- Linked planned training/competition: description, explicit goals and structured
  workout where present. An unlinked activity has no inferred prescription.
- Previous 28 days: up to 60 completed activities and their stored loads, with
  FOSTER/TRIMP and other calculation methods kept distinct.
- Up to 120 dated recovery/physiology values in the preceding 28 days. Overnight
  sleep/HRV can include the activity date; other daily metrics stop at the previous
  UTC date because their capture time is unknown.
- Objectives/races from linked plans and relevant currently active injuries, when
  stored. These records are current snapshots, not historical versions.
- The coach's optional context and requested language.

Dates, units, truncation and missing fields are explicit. Normalized stored RPE
and pain are presented on a 0–10 scale. The snapshot shown with a saved analysis
is the exact data supplied to that generation; a fresh preview may differ after
activity data changes.

Profile identifiers, account credentials, provider IDs, raw FIT files, GPS,
activity streams, private chats and activity message-thread comments are
excluded. Free text is not automatically redacted and may contain personal
information. No Garmin/Strava API requests are made to prepare an analysis.
There is no inferred nutrition intake or custom-metric data that is not stored.

The model has no tools or calendar write access. It is instructed to distinguish
facts from hypotheses, avoid diagnoses and explain missing evidence. Structured
validation checks the response shape and size, not the truth or coaching quality
of its conclusions. The coach must review the assessment and feedback.

## Configuration and storage

The feature reuses the existing AI generation entitlement, self-hosted mode and
`AI_MODEL_EVENT_MODIFICATION` model/provider configuration. It introduces no new
API-key variables or external dependencies. The existing model default is used
when that setting is absent.

Apply the additive migration and regenerate Prisma when updating an installation:

```sh
pnpm database run db:deploy
pnpm database run db:generate
pnpm shared build
```

Restart the API after regenerating Prisma. The migration adds only
`coach_activity_analysis`, with indexed coach/activity relationships and cascade
cleanup when an activity or coach account is deleted. Analysis JSON, editable
feedback, coach context, input snapshot, language, model, prompt version and
timestamps are stored separately from calendar events and athlete-visible comments.

## API

All routes require authentication and server-side coach/athlete authorization.
Base path: `/agent/ai/activity-analysis/:eventId`.

| Method | Suffix         | Behavior                                              |
| ------ | -------------- | ----------------------------------------------------- |
| GET    | —              | Latest 20 analyses owned by the requesting coach      |
| POST   | `/context`     | Preview stored athlete data; no LLM call or write     |
| POST   | `/generate`    | Generate, validate and persist a new private analysis |
| PATCH  | `/:analysisId` | Update only the owning coach's feedback draft         |

Context/generate bodies: `{ "coachContext": "...", "language": "es" }`.
Feedback body: `{ "feedbackDraft": "..." }`.

Generation checks the AI entitlement, then athlete access, and rechecks access
before saving. Invalid output returns `ACTIVITY_ANALYSIS_INVALID`; provider errors
return `ACTIVITY_ANALYSIS_PROVIDER`, without raw provider error details. Neither
saves an analysis. A second in-flight generation for the same coach/activity in
the same API process returns `ACTIVITY_ANALYSIS_BUSY`. This is not a distributed
rate limit. Model calls have a two-minute cancellation signal.

## Source references

- [Analysis service](../apps/api/src/modules/agent/services/activity-analysis.service.ts)
- [Activity context](../apps/api/src/modules/agent/services/activity-analysis-context.ts)
