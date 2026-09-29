# Historical record: initial fork consolidation

This document records the initial integration of the 19 commits after `272948d8`
through `08d20401` into the fork's `main`. At that point, feature branches formed a
chain and the latest Garmin branch contained the preceding work. It is not a
current inventory of branches or a command to merge those branches again.
Published commit hashes are retained rather than rewriting history.

For current capabilities and setup, use the [documentation index](README.md).
Later work includes private activity analysis, chat notifications/search,
training-load caching, feedback questionnaires and athlete-relative templates.
Their individual guides describe current behavior and migrations.

## Capabilities in the initial integration

- Self-hosted operation without Stripe billing and clearer login errors.
- Spanish localization, mobile navigation and login password visibility.
- Athlete/coach account modes, administrator controls and coach-owned zones.
- Coach planning workspace, goals, target/preparation races and injury records.
- Reviewed JSON plan import, plan adaptation and a read-only AI coach assistant.
- Coach bulk deletion of planned sessions and athlete FIT uploads.
- Manual Garmin activity/recovery refresh and separate paced FIT completion,
  including GPS-gap handling and preservation of existing athlete feedback.

## Additional context for the earliest commits

These descriptions supplement the original commit messages without rewriting
published history. They describe the scope at the time of each commit; later
commits extend that behavior.

### f6c3d64d — self-hosted operation without billing

Add `SELF_HOSTED`, disabled by default, to allow startup without Stripe and make
existing AI features available without a platform subscription. Hide billing
controls and remove subscription athlete limits in this mode while retaining
authentication and athlete-access checks. Billing operations remain unavailable;
AI provider credentials and provider charges are separate from platform billing.
Add configuration, feature-access and Stripe initialization test coverage.

### 87b0cb66 — visible login errors

Reject unauthorized Axios responses after clearing local authentication state.
Display distinct messages for invalid credentials and failed requests, clear
previous errors on submission and remove duplicate submission handling. Add
accessible error feedback in English, French and Italian.

### 7ca157c8 — initial manual Garmin connector

Restore a local Garmin session to import recent activity summaries and available
health/recovery metrics on an explicit request. Restrict access to the configured
athlete and linked coaches, validate imports, serialize synchronization and apply
a two-minute cooldown. Add connection diagnostics, status messages, rounded metric
display and synthetic API/Python coverage. This initial version supported one
connection and did not import FIT files or GPS; subsequent commits added per-athlete
connections, FIT ingestion and separate completion controls.

## Deployment

The inherited Scaleway workflow remains enabled for `openathleteorg/openathlete`.
Forks skip its deployment job unless the repository Actions variable
`ENABLE_SCALEWAY_DEPLOY` is explicitly set to the string `true`. Leave it unset
for local use or a different hosting setup. Lint, typecheck and build workflows
remain enabled. Opting in requires configuring the workflow's Scaleway secrets.

The initial integration included these migrations (this is not a complete list
of migrations in the current branch):

- `20260915190000_add_spanish_language`: add the Spanish language enum value.
- `20260925180000_add_training_plan_races`: add the plan/race relation and the
  database constraint allowing only one target race per plan.

Use the existing database deployment process (`pnpm database run db:deploy`) and
regenerate Prisma (`pnpm database run db:generate`) before building/restarting the
updated application. Consolidating Git branches does not itself apply migrations
or modify athlete data.

Manual Garmin requires its Python environment, scripts and private session storage.
The inherited API Docker image does not include that environment; follow the
[manual Garmin setup](../scripts/garmin-probe/README.md) for the local installation.
This consolidation does not add container packaging for the unofficial connector.

## Limitations recorded at integration

- AI plan adaptation has reported failures with real provider output. Existing
  tests and successful examples do not establish that those failures are resolved.
  Changes still require explicit coach review and acceptance.
- Target/preparation race priority was not explicitly included in adaptation
  context. That limitation still applies to adaptation; the later activity-analysis
  feature has a separate context that includes plan races.
- The read-only coach assistant cannot write plans or trigger synchronization.
- Garmin request pacing is a local precaution, not a provider-guaranteed quota.
  Validation uses synthetic responses; it does not certify live Garmin behavior.

## Validation commands

Run with the repository's Node and pnpm versions after dependency installation,
Prisma generation and shared-library build:

```sh
pnpm shared build
pnpm web exec paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
pnpm website translate
pnpm tsc:check
pnpm lint
pnpm api exec jest --runInBand
scripts/garmin-probe/.venv/bin/python -m unittest discover -s scripts/garmin-probe -v
node --experimental-strip-types --test scripts/tests/*.test.mjs
pnpm check:translations
pnpm api build
pnpm web build
git diff --check
```

The API, Python and UI unit tests use synthetic inputs. They do not require live
Garmin/LLM calls. Database integration scripts and provider smoke tests are separate
checks and must not be inferred from a passing unit suite. The inherited GitHub
workflows run lint, typecheck and build; they currently do not run these unit suites.

## Branch workflow after consolidation

Start new `feat/...` or `fix/...` branches from the updated fork `main`. Keep changes
small, describe the behavior and validation in English, and integrate completed
work through a pull request that preserves useful commits. Remove old branches only
after confirming their commits are reachable from `main`. Track upstream changes
separately and review their integration into this fork.

## Source references

- [Migration history](../libs/database/prisma/schema/migrations)
- [GitHub workflows](../.github/workflows)
