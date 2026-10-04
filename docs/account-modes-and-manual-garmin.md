# Account modes and manual Garmin connection

## Roles and access

The existing `User.roles` values define three modes. No new database tables are required.

| Roles           | Personal training                                                         | Planning                                                          |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| ATHLETE         | Read planned sessions; import activities when enabled and submit feedback | Cannot create, edit, delete, duplicate or import planned sessions |
| COACH           | No personal athlete settings                                              | Plan for linked athletes                                          |
| ATHLETE + COACH | Own athlete space and coaching space                                      | Plan for self and linked athletes                                 |

JWT authentication reads current roles from the database on each request.
Planning restrictions apply to API permissions as well as calendar controls.
An old coach-athlete link does not grant planning rights after the coach role is removed.
Linking a performed activity to an existing session remains available to its athlete.

## Initial choice and administrator changes

The first-login role selection is saved once in a database transaction.
The same transaction stores initial athlete metrics when applicable. A failure rolls
back the choice so onboarding can be retried. Repeated or concurrent submissions
cannot overwrite a completed choice. Profile updates cannot change roles or admin access.

After onboarding, only a configured administrator can change modes, from
Settings → Account administration. Each change requires confirmation; the backend
checks authorization independently. Mode changes do not grant administrator access
and do not delete athlete data or coach relationships. Removing the coach role
immediately removes its permissions on subsequent authenticated API requests.
Other open browser sessions may need a reload to update their visible menus.

Administrators are configured only on the server using `ADMIN_USER_IDS` in
`apps/api/.env` (or the Coolify environment, passed by `docker-compose.coolify.yml`): a comma-separated list of existing OpenAthlete user IDs. The empty value
disables administration. Restart the API after editing this configuration.
IDs are used so changing an email address cannot transfer administrator rights.
The authenticated `/user/me` response contains `isAdmin`; no admin setting is
accepted from registration, onboarding or profile requests.

Administrator endpoints:

- `GET /admin/accounts?search=...&page=0`: 25 accounts per page; no credentials.
- `PATCH /admin/accounts/:userId/mode`: strict `{ roles: [...] }` body.
  Only accounts that completed onboarding can be changed.
  The API logs the administrator ID, target ID and selected roles.
- `DELETE /admin/accounts/:userId`: permanently deletes the account and all
  its data (events, activities, plans, messages, settings) in one transaction,
  after confirmation in Settings → Account administration. Administrators
  cannot delete themselves or another configured administrator. The API logs
  the administrator ID and target ID.

Existing account modes are preserved; there is no automatic migration.
New users choose athlete, coach, or both during onboarding. The standard profile
shows the current mode and explains that subsequent changes require an administrator.

## Manual Garmin

The unofficial connector is disabled by default. Set
`ENABLE_MANUAL_GARMIN_SYNC=true` in `apps/api/.env`, restart the API and reload the
application to enable it. It also requires `SELF_HOSTED=true` and an absolute
`GARMIN_UNOFFICIAL_DIRECTORY` with the existing Python and session setup. A stored
session or a configured directory alone does not enable it.

With the flag unset or `false`, the athlete's manual connection card and the
coach's manual Garmin table column disappear, and manual login/sync/backfill
requests are rejected. No manual status polling is mounted by the interface.
Previously stored activities, recovery metrics and private session files are
preserved. Official connectors remain available. FIT uploads have their own
independent setting, `ENABLE_MANUAL_FIT_IMPORT`, also disabled by default.

- The manual connector appears after the official connectors in the athlete space.
- Only the authenticated owner with ATHLETE role can submit Garmin credentials.
- The owner and linked users with COACH role can trigger sync.
- Coaches have sync cards in Settings → Athletes, without credential fields.
- Login is explicitly triggered; no health/activity sync occurs during login.
- MFA is supported through a second step. Pending login processes expire after three minutes.
- Passwords/codes pass through stdin, not command arguments, files or API logs.
- Garmin session tokens are stored locally with restrictive permissions.
- Authentication errors never expose raw provider responses or exception messages.
- The previous single-athlete connection remains usable until the athlete connects through the UI.
- New sessions are isolated under `GARMIN_UNOFFICIAL_DIRECTORY/accounts/<athleteId>/.private`.
  This directory is ignored by Git.
- Sync retains the existing manual trigger, two-minute cooldown and database lock.
- Garmin *Mobility* activities (FIT sport 86) are imported with the Mobility sport.
  They used to be stored as Pilates; a migration corrects those with Garmin's
  default mobility name, and sync corrects any it sees again.
- Enabling requires ENABLE_MANUAL_GARMIN_SYNC=true, SELF_HOSTED=true and an absolute GARMIN_UNOFFICIAL_DIRECTORY.

The login worker uses the Python environment and pinned dependency already used by
the manual connector. Pending MFA state lives in the API process: restart requires a
fresh login, and multi-process deployments need request affinity for the two steps.
The local session files must persist across server restarts.

### Docker / Coolify deployment

The production API image (`apps/api/Dockerfile`) includes Python, `tzdata`
and the `scripts/garmin-probe` requirements, with the scripts in
`/opt/garmin-probe`. `docker-compose.coolify.yml` sets
`GARMIN_UNOFFICIAL_DIRECTORY=/data/garmin` on the `api` service and mounts the
`garmin_data` volume there, so sessions survive restarts and redeploys.

To enable it, set `SELF_HOSTED=true` and `ENABLE_MANUAL_GARMIN_SYNC=true` and
redeploy. On start the entrypoint copies the scripts from the image into the
directory, links `.venv` to the bundled Python and restricts `accounts/` and
`.private/` to the API user. Each athlete then connects Garmin from their own
space (login and MFA if Garmin asks). Only the `api` service runs the sync.

## Verification

Automated permission tests exercise all role combinations, role revocation,
Garmin owner/coach separation, and rejection of unrelated users.
Python tests simulate login and MFA without connecting to Garmin.
Do not use real Garmin credentials in automated tests or check them into Git.

## Training zones and athlete table

Training zones remain readable by their athlete. Creating, editing and deleting
zones requires the COACH role and access to the target athlete, checked in the
service. A dual-role account can edit its own zones. Linked coaches open the zone
editor from Settings → Athletes → Edit zones. The editor fetches zones by the
selected athlete ID, not by the signed-in account.

Manual Garmin synchronization is embedded in each athlete row in that table.
Each button targets that row's athlete ID. Credentials remain exclusively in
the athlete's own connector settings. Loading the table reads local status only;
synchronization still requires an explicit click.

## Separate update and FIT completion actions

**Update Garmin** imports activity summaries from 42 complete days before today,
including the boundary day and today, plus seven days of recovery metrics.
It requests 100 summaries per page, stopping at the history boundary or the end
of the list. At most five pages (500 summaries) are read per manual action.
Reaching this limit or receiving a repeated page reports `ActivityHistoryIncomplete`
in the UI; this is not a guarantee that every account's history is complete.
The baseline remains 27 data reads, with at most four additional activity-list
reads, plus necessary authentication or token renewal. There is at least one
second between HTTP responses and new requests. Errors stop without retries.

FIT files remain a separate **Complete pending activities** action. A 42-day
summary history alone does not enable TRIMP: activities also need heart-rate
streams and `HR_REST`. Maximum HR uses `HR_MAX` first, or applicable heart-rate
zones if absent; see [recalculation](training-load-recalculation.md). Daily/activity
peak heart rates are not substituted for physiological maximum heart rate.
No additional historical wellness requests or automatic FIT downloads are added.

**Complete pending activities** uses the Garmin IDs already stored for that OpenAthlete
athlete, including activities older than 42 days. It does not fetch the activity
list or recovery history again. Cached files require no login or remote calls;
when a download is necessary, the worker authenticates and verifies the linked
Garmin profile before requesting originals. Each explicit run reviews at most
100 files and downloads at most 20 new originals, with at least 15 seconds between
HTTP responses and new requests, including authentication requests.

Both actions and credential login share a filesystem lock across accounts in
this installation and a two-minute cooldown after the last remote response. A 429 blocks remote requests
for at least one hour, or longer if required by `Retry-After`. During token-based
read operations, request failures stop further calls; neither the application nor
its transport adapter retries automatically. The one-second and fifteen-second
pacing applies to those read operations. Initial credential login and MFA retain
the SDK's authentication sequence, which may try fallback flows; the same
within-login retry guarantees do not apply. Optional summary endpoints returning
404/501 remain skippable.
These are local precautions, not published Garmin quotas or a guarantee against
rate limiting. Credential setup remains in the athlete's own settings.

The backend tracks progress independently of the page. Active pages poll only
local status every two seconds. Closing the page leaves the batch running while
the API is alive. **Stop** signals cancellation; an in-flight request may finish,
but no following request starts. An API restart interrupts the worker and never
resumes it automatically. Users must explicitly start another run after a stop,
an error or a batch limit. Pending counts are refreshed during manual operations
and can become stale after unrelated activity additions or deletions.

The owner and linked coach can access the JWT-protected endpoints:

- `GET /provider/garmin-manual/status`
- `POST /provider/garmin-manual/sync`
- `POST /provider/garmin-manual/backfill`
- `POST /provider/garmin-manual/backfill/stop`

The Python worker uses the pinned garminconnect ORIGINAL download API. It accepts
a raw FIT or a ZIP containing exactly one FIT, reads the selected ZIP member in
memory without extracting paths, and limits compressed and uncompressed files to
20 MiB. Ambiguous multi-FIT archives, non-FIT originals and oversized files are
reported as failures and stop the batch.

Originals remain in the ignored private directory:
`.private/fits/<garmin-profile-id>/<activity-id>.fit` within each account's directory.
Both account and Garmin profile namespaces isolate caches. Keep private storage
in backups; it contains GPS and health data. Files are not served as public URLs.
Cached files survive transaction failures. Parse failures discard the cache entry
so a later explicit action can download it again.

The API matches by Garmin ID and OpenAthlete athlete, including summaries imported by the
official Garmin connector. It preserves feedback, descriptions, planned-session
links and existing supported measurements. GPS fills only missing samples with
matching timestamps; it never interpolates positions or overwrites valid points.
Unalignable channels are reported for manual review and prevent adding new laps.
Cross-provider matches remain skipped with a warning; no schema migration is needed.

The existing FIT parser and stream compression store GPS, time, distance, altitude,
heart rate, cadence, power and temperature when available. Laps use existing
ActivitySegment rows. Supported session summaries fill missing measurements.
This does not implement all FIT developer fields, strength sets or every Garmin
metric. A reviewed FIT may contain no GPS. The review ledger records Garmin
profile, OpenAthlete row and parser version only after the activity transaction commits;
it prevents repeatedly downloading a reviewed file solely because GPS is absent.

Each FIT has its own transaction: later failures preserve earlier completed imports.
Activity processing uses the historical import path without new-activity AI,
notifications or weather calls. Jobs are submitted after commit; failed submissions
remain in local sync state for a later manual operation. Summary sync has a
180-second worker timeout, 210-second transaction timeout and 240-second client
timeout; FIT batches have a 15-minute backend limit and short per-file transactions.

Progress is stored in `.private/fit-backfill-state.json`, reviews and import state
in `.private/sync-state.json`, and the shared cooldown in the root connector's
`.private/request-safety.json`. Preserve the shared private root when running
multiple API instances on one installation.

Validation uses mock Garmin downloads, synthetic SDK-encoded FIT files and
permission/import regression tests. Automated tests never query Garmin and do
not establish live-provider compatibility. See the [connector guide](../scripts/garmin-probe/README.md)
for test commands and a controlled manual verification procedure.

## Sending planned sessions to Garmin

With manual Garmin connected, an upcoming planned session can be sent to the
athlete's Garmin Connect calendar. Garmin then delivers it to the watch at the
watch's next sync. This uses the same unofficial connector, so it can stop
working if Garmin changes its private API.

- **Entry points:** the session details dialog shows **Send to Garmin** for
  training sessions dated today or later; the coach's week actions menu has
  **Send week to Garmin** for the upcoming sessions of the displayed week.
- **Who:** the athlete who owns the session and their linked coaches, the same
  as for sync. The athlete must have connected Garmin from their own space.
- **Always manual:** nothing is sent automatically. When a sent session changes
  in OpenAthlete (steps, targets, name, description or day), the dialog shows
  it as changed and **Update in Garmin** sends it again. The Garmin workout is
  updated in place, and its calendar entry moves when the day changed.
- **Removal:** **Remove from Garmin** deletes the calendar entry and the
  workout from the Garmin library. Deleting a session in OpenAthlete does not
  touch Garmin; the delete confirmation warns when a copy exists there.
- **Conversion:** steps, repeats, time/distance/lap-button durations and heart
  rate, power, pace (speed on the bike) and cadence targets. Zone and
  percentage targets are converted to absolute values with the athlete's zones
  and metrics; if one is missing, that session is not sent. Swimming sessions
  are sent without targets and have not been verified on a watch. A session
  without structured steps is sent as one step of its goal duration or
  distance.
- **Requests:** one send is one Garmin operation: one login, an identity check
  that the session belongs to the linked Garmin account, then one request per
  second. Up to 14 sessions are sent per operation. The shared two-minute pause
  between Garmin operations and the rate-limit stop of the sync also apply
  here. A workout Garmin rejects does not stop the others.
- **Storage:** `manual_garmin_workout_export` keeps, per session, the Garmin
  workout and calendar IDs, the Garmin day and a hash of what was sent. Copies
  written to a previously linked Garmin account are never updated or deleted.

Endpoints (JWT, validated with Zod): `GET /provider/garmin-manual/workouts`
(`athleteId`, `eventIds` comma-separated, at most 50) returns the sent state;
`POST /provider/garmin-manual/workouts/send` and `/workouts/remove` take
`{ athleteId?, eventIds }` and return one `{ eventId, ok, code? }` per session.

## Source references

- [Account-mode tests](../apps/api/src/modules/auth/services/account-modes.spec.ts)
- [Manual Garmin service](../apps/api/src/modules/providers-sync/manual-garmin/manual-garmin.service.ts)
- [Garmin summary worker](../scripts/garmin-probe/sync.py)
- [Planned session export service](../apps/api/src/modules/providers-sync/manual-garmin/manual-garmin-workouts.service.ts)
- [Garmin Connect workout mapper](../apps/api/src/modules/providers-sync/manual-garmin/manual-garmin-workout.mapper.ts)
- [Garmin workout worker](../scripts/garmin-probe/export_workout.py)
