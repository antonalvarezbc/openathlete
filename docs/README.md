# Technical documentation

This directory describes the implementation in this repository branch. Start
with the feature guide below, and use its source links to check behavior before
changing code. Planned features and historical verification results are identified
explicitly; they are not evidence that a live provider currently works.

## Language policy

- **English is the maintained reference language for technical documentation.**
  It supports collaboration with upstream without duplicating every change.
- The application's four locales (English, Spanish, French and Italian) apply to
  UI messages, not automatically to developer documentation. New interface copy
  must still update all four catalogs.
- Spanish user guides can be added for a specific audience when someone can keep
  them synchronized. A translation should link to its English source and record
  the source revision it tracks. Do not create four complete documentation copies
  without maintainers for each language.
- Spanish terminology in the localization guide and fictional sample text in the
  JSON example are intentional. API identifiers, environment variables and paths
  keep their exact spelling.

## Guides

### Installation, accounts and data imports

- [Account modes, administrators and manual Garmin](account-modes-and-manual-garmin.md)
- [Official provider configuration](provider-configuration.md)
- [Manual FIT import and GPS handling](manual-fit-import.md)
- [Spanish localization and four-locale maintenance](spanish-localization.md)

### Planning and training data

- [Coach planning workspace, races and injuries](coach-training-plan-workspace.md)
- [JSON plan import](training-plan-json.md)
- [Bulk deletion of planned workouts](calendar-bulk-delete.md)
- [Heart-rate zones and percentage methods](heart-rate-percentage-zones.md)
- [Reusable workouts with athlete-relative targets](athlete-relative-workout-templates.md)
- [Saved training loads and automatic recalculation](training-load-recalculation.md)

### AI and feedback

- [Plan adaptation and proposal review](plan-adaptation.md)
- [Read-only coach AI assistant](coach-ai-assistant.md)
- [Private coach activity analysis](coach-activity-ai-analysis.md)
- [Activity questionnaires and feedback processing](activity-feedback-extraction.md)

### Navigation and communication

- [Mobile navigation and collapsed coach sidebar](mobile-navigation.md)
- [Activity notifications in coach chats](coach-activity-chat-notifications.md)
- [Search within one chat or all chats](chat-message-search.md)

### Project history

- [Initial fork consolidation](fork-consolidation.md) is a historical integration
  record. Its commit list and initial migrations are not a current release manifest.

## Examples and privacy

Use fictional roles, names and test data. Test email addresses should use the
reserved `openathlete.test` domain. Example numeric IDs are illustrative, not
references to installed accounts. Never include real athlete identities, health
records, activity URLs, private file paths, credentials or local account files.
Keep `docs/local.md` and local QA credentials untracked, as configured in Git ignore
rules. Do not copy their contents into public guides.

## Keeping guides current

Update a guide when its entry point, role restrictions, data scope, persistence,
provider behavior or configuration changes. Link to source files rather than
relying on unstable line numbers. Apply all pending Prisma migrations using the
normal deployment process; a migration mentioned in a feature guide is not a
substitute for the full migration history.

Verification sections describe coverage and commands. Past run counts are
historical results, not proof that checks were rerun for a documentation edit.
Browser regression scripts need the isolated Vite/Chromium setup described in
their headers. Database integration scripts need a local test database and may
create temporary fixtures; inspect their cleanup behavior before running them.
Unit tests or mocked provider responses do not establish live Garmin/LLM access.
