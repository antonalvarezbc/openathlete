# AI planning and adaptation workflow

## Coach workflow

1. In **Planning**, choose the athlete and create a plan with AI, or select an
   existing plan/calendar. Preview the athlete context before generating.
2. Inspect **Load and recovery evidence**. This uses stored records only: viewing
   it neither contacts Garmin nor calls an LLM. Synchronization stays manual.
3. Ask the **AI assistant** about the next session or week when useful. Its tools
   remain read-only, including the externally exposed MCP tools.
4. **Adapt next session** or **Adapt this week** transfers the selected period,
   current-state text and the coach's latest question into the adaptation form.
   Assistant answers are not copied as instructions or approvals. Review the
   transferred text, choose the current condition and set permissions explicitly.
   With no current-state text, fill it in before requesting a proposal.
5. Review a proposal against the original sessions, edit it or discuss revisions.
   No increase, new session or redistribution is enabled by the transfer.
6. Reject it, or confirm review and **Accept and apply changes**. Existing server
   validation and the context-version check still run on acceptance. Changed
   recovery, activities, linked prescriptions or answers invalidate old proposals.

The handoff is temporary component state. Changing the athlete/plan through the
workspace selector clears it; reloading does not persist the conversation or draft.
For plan generation, the normal draft review/import workflow is unchanged.

## Evidence calculated in code

Creation, consultation and adaptation use the same pure calculation. No extra
agent, database table, dependency, provider request or automatic job is added.

- **Activity window:** 42 UTC dates including today, from at most 200 queried
  activities (generation queries up to eight weeks for its existing volume
  history). Truncation is explicit. The current day is incomplete.
- **Load:** totals per stored method for the latest seven days and previous
  seven, accompanied by the number of activities with a load and total activity
  count. TRIMP and Foster are never added together. Nothing is recalculated here.
- **Volume and effort:** minutes, distance, ascent, mean RPE and number of RPE
  answers. RPE is converted from the stored 0–1 scale to 0–10. Missing values
  remain null; recorded zeroes are preserved.
- **Recovery:** overnight HRV average, resting HR, sleep duration/score, average
  stress and RMSSD. Each includes the latest value/date, age and measured-day
  counts. The recent mean requires at least three distinct dates in the latest
  seven days. Its reference is the median of the preceding 28 days, requiring
  at least seven measured dates. No overlap between those two windows.
- **Freshness:** latest values older than two days are labelled stale. Missing,
  insufficient and available comparisons are distinct. These are data-quality
  conventions, not validated physiological thresholds or readiness scores.
- **Planned versus actual:** up to ten recently completed activities with a linked
  prescription, comparing minutes, distance, ascent and RPE. Percentages are null
  when the prescription is missing or zero. These are the current stored goals;
  historical revisions cannot be reconstructed.
- **Athlete feedback:** up to five recent activities with RPE/answered questions,
  at most five answers each. Question/answer text is bounded. Skipped feedback
  is excluded from this block. Existing authorized activity comments in the
  adaptation context retain their separate access checks.

The context preview shows the same object sent to the model. Recovery dates and
summary values also participate in adaptation's context version. The summary
has date precision so an unchanged context does not become stale every second;
rolling into another UTC date requires review again.

## Model and permissions

Both plan generation and adaptation receive the shared evidence instructions:
explain the dated observations supporting changes, identify conflicting or
missing information, prioritize the next session and consider the week around it.
Maintaining a session is a valid decision. Never treat one favourable reading as
permission to increase load or automatically compensate for missed sessions.

Model calls continue through `AiModelResolverService` and `AiService`, with the
requesting coach's access and usage accounting. Background athlete features do
not fall back to a coach's personal key. No new write-capable assistant or MCP tool
is introduced. Existing increase/new-session/redistribution permissions remain
independent; injury and readiness checks still apply.

## Limits and future work

- These summaries cannot establish whether a workload is appropriate or diagnose
  illness. The coach reviews the athlete's own reports and the proposed workout.
- Imported zeroes may be provider defaults. An empty day may mean an incomplete
  import rather than rest. Incomplete coverage can bias load comparisons.
- Metrics have dates, not intraday measurement times or guaranteed Garmin origin.
  Older recovery must not be presented as today's state. Current recovery cannot
  be projected across a plan starting far in the future.
- No CTL/ATL/ACWR readiness classifier, automatic weekly alert job, new descent
  metric, terrain difficulty, nutrition/custom fields or physiological threshold
  engine is implemented by this change.
- The assistant hands off the coach's input, not an automatically generated draft
  ID. Draft persistence, acceptance-rate analytics and longitudinal evals remain
  separate work. Live LLM quality is not established by mocked-provider tests.

## Verification

- API tests: `planning-evidence.spec.ts`, plan-generation and plan-adaptation
  suites cover missing/sparse/stale readings, zero values, units, personal
  baselines, load coverage, context changes and parity between preview and prompt.
- Web tests: `planning-evidence.test.tsx` and `adaptation-handoff.test.ts` cover
  evidence presentation and the transfer without write permissions.
- `scripts/tests/ai-planning-workflow.browser.mjs` checks the isolated real
  components at mobile/desktop widths with synthetic data and mocked API calls.
  See the script header for the Vite and Chromium prerequisites.
- Run `scripts/verify.sh --build --e2e` for repository checks and the production
  Docker stack. Docker/browser/provider availability must be reported separately.

Implementation verification (2026-10-05): workspace lint, types, unit tests,
API/web/website builds and agent tests passed. The isolated Chromium workflow
passed seven checks, including mobile/desktop layout and explicit confirmation.
The production-stack E2E run could not start: Docker was unavailable inside the
execution environment and the host Docker socket denied access. No live LLM or
Garmin calls were made for these checks.

Sources: [evidence calculation](../apps/api/src/modules/agent/services/planning-evidence.ts),
[shared contract](../libs/shared/src/types/dtos/agent/planning-evidence.dto.ts),
[model instructions](../apps/api/src/mastra/agents/planning-evidence-instructions.ts),
[evidence view](../apps/web/src/components/ai-plan/planning-evidence.tsx).
