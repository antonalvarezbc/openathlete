# Coach AI memory per athlete

AI features for the same athlete can share a small, private memory so that an
activity analysis knows what the previous ones concluded, a plan adaptation
knows what was applied last week, and the assistant knows both. Memory is
scoped to one **coach–athlete pair** and is **off by default**.

## Enabling it

As a coach, open **Settings → Athletes** (`/dashboard/settings?tab=athletes`)
and choose **AI memory** on the athlete. The dialog offers three modes:

| Mode | Summary | Recent notes | Earlier athlete feedback | Added per AI request |
| --- | --- | --- | --- | --- |
| Off (default) | — | — | — | nothing |
| Compact | ≤ 700 chars | 3 | 2 activities, ≤ 280 chars each | at most ~600 tokens |
| Extended | ≤ 2,000 chars | 8 | 5 activities, ≤ 400 chars each | at most ~1,700 tokens |

The ceilings are fixed by [`AI_MEMORY_LIMITS`](../apps/api/src/modules/ai-memory/ai-memory.limits.ts)
and covered by a test, so the cost does not grow with the athlete's history.
The dialog also shows what the AI remembers and can clear it. Turning memory off
stops reading and writing notes but keeps what is stored until it is cleared.
Only coaches see it; athletes have no access to the endpoints.

## How it stays cheap

- **Notes are written without model calls.** Each AI result stores a one-line
  digest (≤ 300 characters) built from data that already exists: the
  structured analysis, the applied adaptation summary, the assistant's reply
  or the generated session.
- **Consolidation runs rarely.** When 6 (Compact) or 12 (Extended) notes are
  waiting, one background call folds the older ones into the summary with
  `AI_MODEL_MEMORY` (default `openai/gpt-4o-mini`; with
  `AI_PROVIDER=anthropic`, the Claude default) and deletes them. The newest
  notes stay verbatim. A failed consolidation leaves notes in place and never
  affects the feature that produced them.
- **Reads are bounded.** Every request receives the same capped block,
  whatever the history length. Memory never re-sends conversations.

## What reads and writes memory

| Feature | Reads | Writes a note |
| --- | --- | --- |
| Activity analysis | yes (excluding the analysed activity's own feedback) | after a validated analysis is saved |
| Plan adaptation | propose and refine | only when a proposal is **applied** |
| AI assistant | every turn | every answered turn |
| Generate / modify session with AI | yes | after a valid session is returned |
| [Convert a written workout](written-workout-conversion.md) | no | no |
| Post-activity feedback questions (athlete-facing) | the athlete's own earlier answers only | no |
| TRIMP estimation | no | no |

Memory is added to the prompt as an `aiMemory` block (or a delimited section
for plain-text prompts). Agents are told it may be outdated, that current data
takes precedence, that it is untrusted data, and never to quote it in text
addressed to the athlete. Context previews show the block, and saved activity
analyses keep it in their context snapshot.

Plan adaptation keeps memory outside `contextVersion`, so a note added
elsewhere never invalidates a pending proposal.

## Privacy

- Memory lives on the `coach_athlete` link (summary and mode) and in
  `ai_memory_note`. Unlinking an athlete deletes the link and, by cascade, the
  memory; relinking starts empty. Deleting either user deletes it too.
- One coach's memory is never visible to another coach of the same athlete.
- Athlete-facing feedback questions never receive coach notes. They only use
  the athlete's own earlier feedback answers, and only when at least one of
  their coaches enabled memory (the largest enabled mode sets the limits).
- A coach who analyses their own athlete profile (no coach–athlete link) has
  no memory.

## Related fix

Generating or modifying a session with AI previously ignored the calendar's
athlete and used the coach's own athlete profile (or their user id). The
dialogs now send `athleteId`; the API requires a linked athlete for coaches
and defaults to the caller's own athlete profile otherwise.

## Database

Migration `20260929120000_add_ai_memory` adds the `ai_memory_mode` and
`ai_memory_source` enums, three columns on `coach_athlete` and the
`ai_memory_note` table. Apply it with `pnpm --filter @openathlete/database
db:deploy` (or `db:migrate` in development).

## Source references

- [Memory service](../apps/api/src/modules/ai-memory/ai-memory.service.ts) and [limits](../apps/api/src/modules/ai-memory/ai-memory.limits.ts)
- [Memory endpoints](../apps/api/src/modules/ai-memory/ai-memory.controller.ts): `GET`, `PATCH`, `DELETE /agent/ai/memory/:athleteId`
- [Consolidation agent](../apps/api/src/mastra/agents/ai-memory-consolidation.agent.ts) and [shared agent rule](../apps/api/src/mastra/agents/ai-memory-instructions.ts)
- [Memory dialog](../apps/web/src/components/ai-memory-settings.tsx), opened from the [athletes list](../apps/web/src/views/dashboard/settings-view/athletes-tab.tsx)
- [Schema](../libs/database/prisma/schema/ai_memory.prisma)

## Editing memory

In the coach's **Athletes → AI memory** dialog, choose **Edit memory**.
The large editor contains the summary (up to 2,000 characters) and the displayed
notes (300 characters each). An empty note is deleted on saving. Cancel leaves
stored memory unchanged. Compact mode still sends only the first 700 characters
of the summary; editing does not change the memory mode.

Edits are private to the coach–athlete relationship. Saving uses
`PATCH /agent/ai/memory/:athleteId/content` and a transaction, checks the summary
revision and each note's original text, and preserves newly generated notes
that were not in the editor. A concurrent edit or consolidation returns a
conflict and preserves the local draft for copying before reopening. Saving
invalidates an older consolidation already in progress. It does not call an LLM,
change athlete feedback, or modify calendar entries. Future AI work can still
add notes and consolidate the summary.
