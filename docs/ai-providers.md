# AI providers

The API runs its AI agents through the Mastra model router, so every model is a
`provider/model` id such as `openai/gpt-5.1`, `google/gemini-3-pro-preview` or
`anthropic/claude-opus-5`. Instance settings are server variables in
`apps/api/.env` (or the Compose environment); restart the API after changing
them. Personal keys and models are set by each user in **Settings → AI**.

## Model and key resolution

User-triggered features, including this fork's plan generation, adaptation,
coach assistant, activity analysis and written workout conversion, run through
`AiModelResolverService` and `AiService`:

1. The requesting user's own encrypted key and per-feature model (or DEFAULT).
2. Instance keys only when `AI_HOSTED_ACCESS` permits and the user's monthly
   hosted allowance is available. `AI_HOSTED_MONTHLY_TOKENS` is optional; an
   unset value does not cap hosted usage.

Background athlete questions, feedback extraction and load estimation use the
athlete's own access or permitted instance access, **never a coach's personal
key**. Coach–athlete memory consolidation resolves the coach's AI_MEMORY model;
without access, the notes wait. `ai_usage` records model calls through AiService.

The coach assistant shares PLAN_ADAPTATION settings. Hosted model overrides are
`AI_MODEL_PLAN_GENERATION`, `AI_MODEL_PLAN_ADAPTATION` and
`AI_MODEL_ACTIVITY_ANALYSIS`, each falling back to `AI_MODEL_EVENT_MODIFICATION`.
Other main-task fallbacks are `AI_MODEL_DEFAULT`, `AI_PROVIDER=anthropic`, then
built-in defaults. `WORKOUT_PARSER` and `AI_MEMORY` have their own overrides and
small-model defaults; they do not inherit `AI_MODEL_DEFAULT`.

Users without access receive `AI_NOT_CONFIGURED`, or
`AI_HOSTED_QUOTA_EXCEEDED` when only the hosted allowance is exhausted.
Rejected provider keys and exhausted provider credit have separate error codes.
Configure personal access in **Settings → AI**. See
[model defaults](../apps/api/src/common/constants/ai-models.constant.ts) for the
exact environment precedence and repository model identifiers.

## Transcription

Claude has no audio input, so voice note transcription keeps its own provider
setting:

| Variable | `openai` (default) | `google` |
| --- | --- | --- |
| `AI_TRANSCRIPTION_PROVIDER` | Whisper (`whisper-1`) | Gemini, `AI_MODEL_TRANSCRIPTION` (default `gemini-2.5-flash`) |

Gemini is a generative model: the prompt asks for a verbatim transcript, but the
output is not guaranteed to be literal. WebM, the usual browser recording
format, is not in Gemini's documented audio formats; test with real voice notes
before relying on it.

`GET /installation/features` reports `voiceTranscription` so the interface can
adapt before the athlete records anything:

| Status | Meaning | Interface |
| --- | --- | --- |
| `available` | The transcription provider has a key | Recorder shown |
| `unsupported-by-ai-provider` | `AI_PROVIDER=anthropic`, transcription left on `openai` and no `OPENAI_API_KEY` | Recorder replaced by "not available with the selected AI provider" |
| `not-configured` | The transcription provider has no key | Recorder replaced by "not configured on this server" |

Typed answers keep working in both unavailable cases. `POST .../transcribe`
rejects the same cases with `503` and the codes
`TRANSCRIPTION_UNSUPPORTED_BY_AI_PROVIDER` or `TRANSCRIPTION_NOT_CONFIGURED`;
the recorder shows the same localized message if it receives them. While the
status is unknown, the recorder stays visible as before.

A Claude-only installation therefore looks like this:

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_TRANSCRIPTION_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Startup warnings

The API logs warnings (logger `AiProviders`) at startup; it still starts.

- `AI_PROVIDER=anthropic` without `ANTHROPIC_API_KEY`.
- A transcription provider without its key. With the OpenAI default this is
  only reported when `AI_PROVIDER=anthropic`, the case where the OpenAI key is
  most likely to have been removed.
- `AI_TRANSCRIPTION_PROVIDER=google`, with the trade-offs described above.

A default installation without any AI keys logs nothing. Keys that are empty or
still contain the `.env.example` placeholder count as missing.

These model names describe repository configuration, not a guarantee of current
availability from an external provider.

## Source references

- [Model defaults and provider settings](../apps/api/src/common/constants/ai-models.constant.ts)
- [Model resolution for AI settings features](../apps/api/src/modules/ai/services/ai-model-resolver.service.ts)
- [Transcription status and Gemini transcription](../apps/api/src/common/utils/ai-transcription.util.ts)
- [Feedback recorder](../apps/web/src/components/activity-feedback/activity-feedback-flow.tsx)
- [Startup warnings](../apps/api/src/common/utils/ai-provider-warnings.util.ts)
- [Environment schema](../libs/shared/src/types/config/environments/api.environment.ts)
