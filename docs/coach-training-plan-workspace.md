# Coach training plan workspace

## User flow

**Planning** is at `/dashboard/planning`, second in the coach navigation after
the [coach dashboard](coach-dashboard.md), which is the initial screen of the
coach space. It is separate from account settings. Saved `/dashboard/coach`
links with query parameters and `/dashboard/settings?tab=training_plan` links
redirect to Planning, preserving selected athlete and plan parameters.

1. Select a coached athlete (or yourself if your account has both roles).
2. Create a plan with a name, objective, description and inclusive dates.
3. Add one target race and optional earlier preparation races. Either create a
   calendar competition or link an existing one belonging to the athlete.
4. Record or update the athlete's injuries, symptoms and known restrictions.
5. Open **Plan sessions** or a specific week to use the existing calendar editor.
   Sessions created manually or from templates in that context receive the plan's
   week association. Opening the ordinary calendar does not select a plan.
6. Use the existing JSON import or expand AI adaptation when needed.

The UI has English, Spanish, French and Italian messages and supports mobile
layouts. Athlete-only accounts cannot manage this workspace.

## Data and boundaries

- Reuses `TrainingPlan`, `Cycle`, `TrainingWeek` and `Event.trainingWeekId`.
  Manual creation produces a single base cycle with empty weeks, not generated
  sessions or a periodization recommendation. The final week can be partial.
- Civil dates and the browser's IANA timezone determine plan boundaries; the
  schedule helper handles daylight saving transitions. Maximum span: 728 days.
- Adds `TrainingPlanRace`, a relation to canonical `EventCompetition` records.
  A PostgreSQL partial unique index permits at most one target race per plan.
  Both foreign keys are indexed. A race must fit within the plan;
  preparation races must start before its target race.
- Race unlinking preserves the calendar event. Deleting the competition removes
  its links through foreign-key cascades. Completed races cannot be edited here.
  Races shared between plans must be edited in the calendar, which validates date
  constraints for every linked plan.
- Reuses `AthleteInjury`; there is no separate plan injury table. The form displays
  pain on a 0–10 scale and persists the existing normalized 0–1 value. Resolving an
  injury sets pain to zero. Manual updates preserve any source activity reference.
- Plan edits cover name, objective, description and status. Moving an entire plan
  or changing its date boundaries is not implemented. Archived/completed plans
  cannot receive new sessions through this workspace. Archiving does not remove
  calendar events.
- JSON replacement rejects plans with linked races, preserving their calendar
  constraints. Imported plans can otherwise be selected in this workspace.

## API and permissions

All workspace routes require JWT authentication, the coach role and access to the
selected athlete. A coach-only account cannot use its otherwise unused personal
athlete profile. Write DTOs validate their shape with Zod.

| Route                                     | Purpose                                 |
| ----------------------------------------- | --------------------------------------- |
| `GET /training-plan?athleteId=…`          | Athlete plans, races and week counts    |
| `GET /training-plan/:id`                  | Plan detail                             |
| `POST /training-plan`                     | Create empty plan and weeks             |
| `PATCH /training-plan/:id`                | Update metadata/status                  |
| `GET /training-plan/:id/competitions`     | Existing competitions within plan dates |
| `POST /training-plan/:id/races`           | Create and link a calendar competition  |
| `POST /training-plan/:id/races/link`      | Link an existing competition            |
| `PATCH /training-plan/:id/races/:raceId`  | Edit linked competition and priority    |
| `DELETE /training-plan/:id/races/:raceId` | Unlink, keeping calendar competition    |
| `POST /injury`                            | Create an athlete injury                |
| `PATCH /injury/:id`                       | Update an athlete injury                |

`raceId` denotes `eventCompetitionId`. Existing event/template creation DTOs
accept optional `trainingPlanId`; the server resolves the appropriate week and
checks athlete ownership, editable status and dates.

Plan and race mutations use serializable transactions. Duplicate target races
and concurrent transaction conflicts return HTTP 409. Invalid dates return 400;
missing authorization returns 403.

## AI scope

This change preserves the existing adaptation behavior. The selected plan and
athlete are preselected in the adaptation form. Existing context already includes
unresolved athlete injuries, the plan objective and calendar events in its queried
window. Unresolved injuries prevent increases and added sessions under existing
validation rules.

Target/preparation priority from the new relation is **not yet added explicitly to
the AI context**. This feature does not generate a complete plan from races, add
medical advice, or resolve earlier provider/output-format failures. It makes the
plan structure and relevant athlete records editable for the coach.

## Migration and checks

Apply the additive `20260925180000_add_training_plan_races` migration before
running the updated API:

```sh
pnpm database run db:deploy
pnpm database run db:generate
pnpm shared build
```

Implementation-time verification (not rerun by documentation edits):

- 94 passing Jest tests across workspace contracts/services, JSON plan import,
  plan adaptation validation and account roles.
- Local browser QA with synthetic linked coach/athlete accounts: create a plan,
  target and preparation competitions, record/resolve an injury, create a session
  through the plan calendar, archive and reload.
- Viewport checks at 320, 390 and 1440 pixels; no horizontal page overflow.
- Browser navigation checks: coach landing route, mobile sidebar, legacy dashboard
  and settings redirects preserving athlete/plan, JSON import from Planning,
  removal from Settings and athlete-only redirection back to the calendar.
- API verification of four persisted weeks, two canonical competitions and one
  linked session; normalized pain; forbidden unrelated-athlete and athlete-only
  access. Synthetic QA plans archived and injuries resolved after verification.
- TypeScript checks for API and web, ESLint for API/web/shared, locale parity
  and `git diff --check` passed.

No external AI or Garmin requests are needed to create plans, races or injuries.
Creating future training sessions retains the calendar's existing background
processing behavior.

## Source references

- [Planning route](../apps/web/src/pages/dashboard/planning.tsx)
- [Planning workspace](../apps/web/src/views/dashboard/settings-view/training-plan-tab.tsx)
