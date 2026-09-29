# Activity feedback and AI questionnaires

## Configuration and access

In the Athlete space, open **Settings → Profile → Session validation** and enable
AI feedback questions and analysis.

- Athlete settings must exist with `requireFeedbackQuestions: true`.
- The athlete or a linked coach must have access to `AI_RPE_QUESTIONS`.
- `SELF_HOSTED=true` enables feature access without a platform subscription;
  the selected AI provider still needs its credentials.
- `AI_MODEL_POST_ACTIVITY_FEEDBACK` selects the question model. Its code default
  is `google/gemini-3-pro-preview`.
- The repository's OpenAI configuration example is
  `AI_MODEL_POST_ACTIVITY_FEEDBACK=openai/gpt-5.1`, together with
  `OPENAI_API_KEY` in `apps/api/.env`. Restart the API after editing it. An OpenAI
  key does not configure the default Google model; that provider uses
  `GOOGLE_GENERATIVE_AI_API_KEY`.
- Errors distinguish missing provider configuration, provider failure and invalid
  question output. When questions are disabled, the athlete is asked to contact
  their coach. This message does not itself change the settings permissions.
- Questions use the athlete's language. Transcription uses the interface language
  supplied by the client (`es`, `en`, `fr`, `it`); without it, Whisper detects the
  language.

These model names describe repository configuration, not a guarantee of current
availability from an external provider.

## On-demand generation

**Generate questions with AI** appears in activity details when no questions
exist. The activity owner and a linked coach can request questions for older
activities, including manual Garmin imports, without synchronizing Garmin again.

`POST /event/:eventId/activity/feedback-questions/generate`

The endpoint checks event read access, ownership or the coach relationship,
athlete settings and AI entitlement. Authorization is checked again before saving.
The response has the same shape as
`GET /event/:eventId/activity/feedback-questions`.

Existing questions and answers are preserved. There is no destructive regeneration
or questionnaire-template editor. Concurrent requests share one generation within
an API process. A brief activity-row lock and a second existing-question check
prevent duplicate writes across processes. The model call runs outside that
transaction: separate processes may still make multiple provider calls, although
only one will save questions.

Automatic post-import generation uses the same service. Bulk imports, including
manual Garmin and manual FIT uploads, do not trigger automatic AI questions.

## Context and validation

The model receives the activity summary, linked training/competition goals,
latest stored metric values, training zones and recorded active injuries. Injury
selection considers the latest 20 records, keeps the newest record per location,
and excludes resolved or zero-pain entries. Missing heart-rate values are not
invented. Load history and CTL/ATL/TSB are not included; the prompt states this limit.

Output must contain 3–4 distinct questions with nonempty text of up to 500
characters. Optional choices must contain 2–8 nonempty labels of up to 200
characters. Unexpected fields and invalid output are rejected before writing.
Model generation has a 120-second deadline. Failed requests can be retried without
replacing existing answers.

## Answering and reviewing

The coach sees **Activity feedback**, with distinct states for not generated,
unanswered, skipped and completed questionnaires. Coaches can also read questions
that have not yet been answered.

Only the owner can answer, edit, skip or reopen the questionnaire. Answers are
saved individually as text, with 1–5,000 characters after trimming. A failed save
preserves the text and current question, without advancing or showing success.
Repeated submissions are blocked during saving. Resuming starts at the first
unanswered question.

## Subsequent processing

Completing the questionnaire or saving RPE/comments can update the existing
semantic index when settings and feature access allow it. **AI does not create
injuries or fill in missing RPE automatically.** Answers and athlete-entered RPE
remain unchanged, including older records.

There is no Accept/Edit/Reject screen for extracted inferences. Extraction agents
remain in the code for a possible future review workflow, but the feedback listener
no longer invokes them.

## Embeddings and storage

Indexing uses `text-embedding-3-small`. Text and vector are passed as Prisma
parameters; the vector must contain 1,536 finite numbers. Settings are rechecked
before saving. An UPSERT maintains one embedding per activity. This path does not
require a new migration or automatically reprocess old activities.

## Verification coverage

- Permission and disabled-setting checks, invalid JSON, concurrent generation,
  provider errors and preservation of existing answers.
- Empty answers, save failures, transcription language and absence of automatic
  injury/RPE writes.
- Browser checks for on-demand generation, retry, partial answers and retained text.
- PostgreSQL integration checks with two service instances and simulated model
  output. Use disposable fixtures and remove only the data created by the test.

## Source references

- [Question generation](../apps/api/src/modules/core/services/activity-feedback-generation.service.ts)
- [Feedback processing listener](../apps/api/src/listeners/activity-feedback-extraction.listener.ts)
- [Model defaults](../apps/api/src/common/constants/ai-models.constant.ts)
