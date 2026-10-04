# AI providers

The API runs its AI agents through the Mastra model router, so every model is a
`provider/model` id such as `openai/gpt-5.1`, `google/gemini-3-pro-preview` or
`anthropic/claude-opus-5`. Instance settings are server variables in
`apps/api/.env` (or the Compose environment); restart the API after changing
them. Personal keys and models are set by each user in **Settings → AI**.

## Two kinds of AI features

**AI settings features** (generate and modify sessions, post-activity
questions, feedback extraction, training load estimation) run on the first
model available for the user:

1. A key the user added in **Settings → AI**, with the model they chose for the
   feature (or their default model).
2. For work done for an athlete in the background (questions, extraction,
   load), the athlete's key, then their coaches' keys.
3. The instance keys, when `AI_HOSTED_ACCESS` allows it: `subscribers` by default
   with Stripe, `everyone` without it, or `none`.

Instance models come from `AI_MODEL_<FEATURE>` (for example
`AI_MODEL_EVENT_GENERATION` or `AI_MODEL_FEEDBACK_EXTRACTION`), else
`AI_MODEL_DEFAULT`, else `AI_PROVIDER=anthropic` (`anthropic/claude-opus-5`),
else the built-in defaults. Users without any model available get
`AI_NOT_CONFIGURED`; rejected keys and exhausted quotas are reported with their
own error codes.

**Features of this fork that run on the instance keys only**: the coach
assistant, plan adaptation, activity analysis, AI memory consolidation and the
[written workout converter](written-workout-conversion.md). They use
`AI_MODEL_EVENT_MODIFICATION` (assistant, adaptation, analysis),
`AI_MODEL_MEMORY` and `AI_MODEL_WORKOUT_PARSER`, else `AI_MODEL_DEFAULT` or
`AI_PROVIDER=anthropic`. The converter keeps its small default
(`openai/gpt-5-mini`, or `anthropic/claude-haiku-4-5` with
`AI_PROVIDER=anthropic`) unless `AI_MODEL_WORKOUT_PARSER` is set. In the web
app they are available when the user may use the instance keys.

See [model defaults](../apps/api/src/common/constants/ai-models.constant.ts).

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
