# Coach AI assistant

## Use

Open the Coach planning workspace (`/dashboard/planning`) and choose **AI
assistant** (`?tab=assistant`). Select an athlete and an existing training plan.

- Choose the first day of the seven-day calendar period and optionally describe
  current feelings/circumstances.
- **Review athlete context** fetches application data without calling an LLM.
- **Send question** fetches fresh context, rechecks access and sends the question,
  context and recent conversation to the existing configured AI provider.
- **Review and adapt with AI** opens the existing adaptation section. It does not
  generate or apply a proposal automatically, and does not transfer the conversation.
  Copy any decisions you want to use before leaving the assistant tab.

Conversation state is held only in the browser component, with up to eight
question/answer pairs. It resets on leaving the tab, changing athlete/plan/language,
changing the period/current state, clearing it or reloading. No conversation table,
new schema migration or external dependency was added. Provider data retention is
separate from OpenAthlete's temporary UI state.

## Scope

This is an internal, read-only coach chat. It is **not an MCP server** and does not
add an external AI client connection or an autonomous planning agent.

It reuses the adaptation context: selected plan and goal, calendar descriptions
and structured workouts, recent activities and stored load entries/RPE/accessible
activity comments, the existing recovery-metric allowlist, unresolved injuries
and training zones. Recent activity/metric history covers 28 days, with at most
100 activities. Missing data remains missing. This version requires a plan;
it is not a complete athlete profile or an unrestricted history browser.

Read-only consultation allows a week with no pending sessions. Adaptation's
existing requirement and validation limits remain the default. Upcoming sessions
are still bounded by the existing context query; the surrounding calendar provides
the selected period's entries.

Queries read stored data only. They do not sync Garmin or Strava, retrieve FIT/GPS
streams, or send API credentials to the model. Existing free-text fields can still
contain personal information; users can inspect context before sending a question.

## Implementation

- Shared DTOs: `libs/shared/src/types/dtos/agent/coach-assistant.dto.ts`.
- Controller: `POST /agent/ai/coach-assistant/context` and `/chat`.
- `CoachAssistantService` uses `PlanAdaptationService.context` in consultation mode.
- `coachAssistantAgent` uses the existing `EVENT_MODIFICATION_MODEL` configuration,
  has no tools and returns text. No additional AI environment variables are needed.
- `CoachAssistant` lives in the existing Coach planning workspace alongside the
  plan tab; both share the athlete and plan selectors.

Both endpoints require JWT and the COACH role. The context service checks the
coach-athlete relationship and selected-plan ownership on every request, including
follow-up questions. Dual-role users can also access their own athlete profile.
Chat additionally uses the existing AI_GENERATION feature-access guard.

The request accepts no client-supplied athlete context or write permissions.
Questions/state are limited to 3,000 characters, history to eight pairs and replies
to 8,000 characters. Provider failure details are not returned to clients. Replies
are rendered as Markdown without raw HTML, images or active links.

Applying changes remains a separate, explicit action in the existing adaptation
workflow, with its current schema validation and context-version check. The chat
itself has no database write or provider-sync operations.

## Verification

```sh
pnpm shared build
pnpm api exec jest --runInBand --runTestsByPath \
  src/modules/agent/services/coach-assistant.spec.ts \
  src/modules/agent/controllers/coach-assistant.controller.spec.ts \
  src/modules/agent/services/plan-adaptation.spec.ts \
  src/modules/agent/services/plan-adaptation-generation.spec.ts
pnpm api tsc:check
pnpm api lint
pnpm web tsc:check
pnpm web lint
pnpm shared tsc:check
pnpm shared lint
pnpm check:locale-parity
```

Automated service/controller tests use mocked model responses and synthetic data;
they do not call the configured LLM. They cover role/ownership restrictions, empty
weeks, fresh context on follow-up turns, input validation, feature access, provider
failures and the existing adaptation regressions.

Verification result: 72 backend tests passed, with API/web/shared typechecks,
lint and locale parity. Chromium QA at mobile and desktop widths used synthetic
athletes and model replies to verify preview without generation, follow-up
history, context selection, clearing on athlete changes, retry behavior, Markdown
rendering, the adaptation shortcut and the athlete-only route redirect. No live
LLM provider, Garmin/Strava connection or real athlete account was used.
