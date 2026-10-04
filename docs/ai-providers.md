# AI providers

The API runs its AI agents through the Mastra model router, so every model is a
`provider/model` id such as `openai/gpt-5.1`, `google/gemini-3-pro-preview` or
`anthropic/claude-opus-5`. All AI settings are server variables in
`apps/api/.env` (or the Compose environment); restart the API after changing
them.

## Agents

`AI_PROVIDER` selects the default provider for every agent:

| Value | Agents use | Key |
| --- | --- | --- |
| `openai` (default) | OpenAI models; post-activity feedback questions use `google/gemini-3-pro-preview` | `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` for feedback questions |
| `anthropic` | `anthropic/claude-opus-5` for every agent | `ANTHROPIC_API_KEY` |

Per-agent `AI_MODEL_*` variables always take precedence over `AI_PROVIDER`, for
example `AI_MODEL_MEMORY=anthropic/claude-sonnet-5` or
`AI_MODEL_POST_ACTIVITY_FEEDBACK=openai/gpt-5.1`. See
[model defaults](../apps/api/src/common/constants/ai-models.constant.ts) for
the full list.

## Embeddings and transcription

Claude has no embeddings API and no audio input, so these two features keep
their own provider settings:

| Variable | `openai` (default) | `google` |
| --- | --- | --- |
| `AI_EMBEDDING_PROVIDER` | `text-embedding-3-small` | `gemini-embedding-001` at 1,536 dimensions |
| `AI_TRANSCRIPTION_PROVIDER` | Whisper (`whisper-1`) | Gemini, `AI_MODEL_TRANSCRIPTION` (default `gemini-2.5-flash`) |

- **Embeddings** index athlete feedback in `activity_feedback_embedding`. No
  feature reads that index yet; see
  [activity feedback](activity-feedback-extraction.md#embeddings-and-storage).
  Vectors from different providers are not comparable, so rows stored before a
  provider change must be regenerated before any similarity search uses them.
- **Transcription** converts voice notes in activity feedback to text. Gemini is
  a generative model: the prompt asks for a verbatim transcript, but the output
  is not guaranteed to be literal. WebM, the usual browser recording format, is
  not in Gemini's documented audio formats; test with real voice notes before
  relying on it.

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
AI_EMBEDDING_PROVIDER=google
AI_TRANSCRIPTION_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Startup warnings

The API logs warnings (logger `AiProviders`) at startup; it still starts.

- `AI_PROVIDER=anthropic` without `ANTHROPIC_API_KEY`.
- A provider selected for embeddings or transcription without its key. With the
  OpenAI defaults this is only reported when `AI_PROVIDER=anthropic`, the case
  where the OpenAI key is most likely to have been removed.
- `AI_EMBEDDING_PROVIDER=google` or `AI_TRANSCRIPTION_PROVIDER=google`, with the
  trade-offs described above.

A default installation without any AI keys logs nothing. Keys that are empty or
still contain the `.env.example` placeholder count as missing.

These model names describe repository configuration, not a guarantee of current
availability from an external provider.

## Source references

- [Model defaults and provider settings](../apps/api/src/common/constants/ai-models.constant.ts)
- [Embedding providers](../apps/api/src/common/utils/ai-embedding.util.ts)
- [Transcription status and Gemini transcription](../apps/api/src/common/utils/ai-transcription.util.ts)
- [Feedback recorder](../apps/web/src/components/activity-feedback/activity-feedback-flow.tsx)
- [Startup warnings](../apps/api/src/common/utils/ai-provider-warnings.util.ts)
- [Environment schema](../libs/shared/src/types/config/environments/api.environment.ts)
