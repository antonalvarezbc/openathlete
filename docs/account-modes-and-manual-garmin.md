# Account modes and manual Garmin connection

## Roles and access

The existing `User.roles` values define three modes. No new database tables are required.

| Roles | Personal training | Planning |
| --- | --- | --- |
| ATHLETE | Read planned sessions; record completed activities and feedback | Cannot create, edit, delete, duplicate or import planned sessions |
| COACH | No personal athlete settings | Plan for linked athletes |
| ATHLETE + COACH | Own athlete space and coaching space | Plan for self and linked athletes |

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
`apps/api/.env`: a comma-separated list of existing OA user IDs. The empty value
disables administration. Restart the API after editing this configuration.
IDs are used so changing an email address cannot transfer administrator rights.
The authenticated `/user/me` response contains `isAdmin`; no admin setting is
accepted from registration, onboarding or profile requests.

Administrator endpoints:
- `GET /admin/accounts?search=...&page=0`: 25 accounts per page; no credentials.
- `PATCH /admin/accounts/:userId/mode`: strict `{ roles: [...] }` body.
  Only accounts that completed onboarding can be changed.
  The API logs the administrator ID, target ID and selected roles.

Existing account modes are preserved; there is no automatic migration.
New users choose athlete, coach, or both during onboarding. The standard profile
shows the current mode and explains that subsequent changes require an administrator.

## Manual Garmin

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
- Only SELF_HOSTED with an absolute GARMIN_UNOFFICIAL_DIRECTORY enables this connector.

The login worker uses the Python environment and pinned dependency already used by
the manual connector. Pending MFA state lives in the API process: restart requires a
fresh login, and multi-process deployments need request affinity for the two steps.
The local session files must persist across server restarts.

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

## Original FIT import

Manual sync now includes up to three original FIT downloads per click, within the
existing last-30-days / latest-100-activities window. Opening a page never downloads
files. The two-minute cooldown and per-athlete lock still apply. Further batches
require another explicit click; there is no scheduled catch-up.

The Python worker uses the pinned garminconnect ORIGINAL download API. It accepts
a raw FIT or a ZIP containing exactly one FIT, reads the selected ZIP member in
memory without extracting paths, and limits compressed and uncompressed files to
20 MiB. Ambiguous multi-FIT archives, non-FIT originals and oversized files are
reported as failures. Authentication/rate-limit failures stop the FIT batch.
Least-recently-attempted ordering prevents failed files from starving other files.

Originals remain in the ignored private directory:
`.private/fits/<garmin-profile-id>/<activity-id>.fit`.
Both the account directory and Garmin profile namespace isolate caches. Keep this
private storage in backups; it contains GPS and health data. Files are not served
as public URLs. Completed OA streams are excluded from future downloads; cached
files survive transaction failures. Parse failures discard the cache entry so a
later manual sync can download it again.

The API matches by Garmin ID and OA athlete, including summaries imported by the
official Garmin connector. It enriches existing summaries without changing their
feedback, descriptions or planned-session links. It never guesses using matching
timestamps; cross-provider matches remain skipped with a warning. Existing
nonempty streams and existing segments are preserved. No database migration is
needed.

The existing FIT parser and stream compression store GPS, time, distance, altitude,
heart rate, cadence and power when present. Laps use existing ActivitySegment
rows. The parser currently drops missing samples: shortened sensor channels are
excluded with FitIncompleteChannels rather than incorrectly aligned to time.
This is not an implementation of all FIT developer fields, strength sets or every
Garmin metric. Original files remain available for future reprocessing.

Activity processing jobs are submitted after the transaction commits. Failed queue
submissions are retained in local sync state and retried on the next manual sync.
The UI reports imported FITs, failed Garmin IDs and pending files (including
failures). Overall sync timeout is 210 seconds; client timeout is 240 seconds.
Individual download/parse failures preserve successful summaries and wellness;
a worker timeout or database transaction failure still fails the sync as a whole.

Validation uses mock Garmin downloads, synthetic SDK-encoded FIT files and
permission/import regression tests. Automated tests never query Garmin.
