# Athlete manual FIT activity import

## Installation setting

Manual FIT uploads are disabled by default. Set `ENABLE_MANUAL_FIT_IMPORT=true`
in `apps/api/.env`, restart the API and reload the application to enable them.
Leave it unset or set it to `false` for a clean interface without the upload
button. The setting applies to every user and is independent of the manual Garmin
connector and `SELF_HOSTED`.

The authenticated `GET /installation/features` endpoint provides only effective
feature booleans to the interface. When the upload feature is disabled, the API
rejects manual upload requests before multipart parsing. Existing activities,
recordings and maps remain available, and official provider imports are unaffected.
For Compose installations, set the variable in the environment file passed to
Compose; `apps/api/.env` is used by the local Node development server.

## Usage

In the **Athlete** space, open your calendar and choose **Import FIT activity**.
Select one `.fit` file, review/edit the activity name and import it. The result
shows the activity's original date and a **View activity** action, including for
files outside the currently displayed calendar period.

A coach-only account cannot use this endpoint. An account with both roles can
import into its own athlete profile from the Athlete space. There is no target
athlete selector and no ability to upload on another athlete's behalf.

## Endpoint and storage

`POST /activity-import/fit` accepts multipart `file` and `name`. JWT and athlete
role guards run before file parsing. The service resolves the athlete from the
authenticated user ID; extra body fields such as `athleteId` are rejected.

The endpoint creates a canonical `Event` with type `ACTIVITY`, its `EventActivity`,
compressed series and lap segments in one serializable transaction. It reuses
the installed Garmin FIT SDK, existing FIT parser, compression and segment metric
helpers. No schema migration, new dependency, Garmin account or API key is needed.
The uploaded binary is read in memory and is not retained on the server.

Manual uploads have `provider = null` and an athlete-scoped SHA-256 external ID:
`fit-manual:<athleteId>:<file hash>`. They display **Manual FIT file**, without a
Garmin Connect link.

## Validation and interpretation

- Only FIT activity files with a valid header/integrity check, no decoder errors
  and exactly one session are accepted. Planned workouts, courses and multisport
  files are not imported as activities.
- Limits: 20 MiB, 100,000 samples, 1,000 lap segments and seven days of elapsed
  duration. Invalid/zero durations and activity end times more than five minutes
  in the future are rejected.
- Start time, elapsed/timer duration, sport and available summary metrics come
  from the session. Known sports/subsports are mapped to existing OA sports;
  unknown sports become `OTHER` with a notice.
- Available GPS, heart rate, distance, altitude, cadence and power series use the
  existing parser. Shortened sensor channels are omitted rather than shifted
  against the complete time axis. Invalid/nonmonotonic time axes are rejected.
- Indoor and summary-only files are supported. A map requires GPS coordinates;
  charts require corresponding series. Neither is fabricated.
- Missing GPS samples are stored as empty coordinate arrays on the original time
  axis. Maps split the route at gaps; chart hover and weather sampling skip them.
  GPS-derived personal records are skipped for incomplete routes. Other metrics
  and series remain available. Downsampling preserves gaps.
- Session totals take precedence. Where possible, missing totals are derived
  from series. Missing required distance/elevation fields fall back to zero and
  produce a notice because the current activity model does not allow nulls there.
  Optional heart-rate/power metrics remain null if unavailable. Timer duration
  falls back to elapsed duration when absent; maximum speed falls back to zero
  if neither the summary nor the series provides it.

## Duplicates and processing

Identical bytes for the same athlete reuse the existing activity, regardless of
filename or supplied activity name. If an earlier import lost GPS, an exact-file
retry restores only that missing channel when the stored timestamps match.
Existing GPS, summaries, other series, names and feedback are preserved. A different file or
provider activity with the exact same athlete/start timestamp produces a conflict,
so it can be reviewed instead of silently duplicated or merged. Activities whose
start times differ are not considered duplicates by this check.

After commit, the normal activity pipeline is queued with `bulkImport: true`.
This preserves load calculation, normalization and existing training matching,
while suppressing automatic AI feedback generation for the historical upload.
Bulk import also skips weather requests.

If queue submission fails, the response reports that the activity was saved but
processing could not be queued. Importing the same file again retries queue
submission without creating another activity. An exact-file retry can therefore
rerun existing processing; it does not duplicate the activity record. Failures
inside a successfully queued job use the existing queue retry behavior.

## Verification

```sh
pnpm api exec jest --runInBand --runTestsByPath \
  src/modules/core/controllers/manual-fit-import.controller.spec.ts \
  src/modules/core/services/manual-fit-import.spec.ts \
  src/modules/providers-sync/manual-garmin/manual-garmin-fit.spec.ts \
  src/modules/providers-sync/manual-garmin/manual-garmin.spec.ts
pnpm api tsc:check
pnpm api lint
pnpm web tsc:check
pnpm web lint
pnpm check:locale-parity
```

Fixtures use synthetic FIT bytes encoded with the installed SDK, without athlete
credentials or real activity data. Tests cover decoding, summary-only files,
incomplete channels, CRC failures, wrong file types, multisport, ownership,
duplicates, queue failure and multipart upload, plus existing Garmin regressions.
Browser QA verifies athlete upload, opening details, repeated import, rejected
owner spoofing, malformed input and coach-only denial. The browser fixture has
no GPS, avoiding weather requests, and imports without AI feedback generation.

Initial upload verification: all 34 tests passed, along with API/web typechecks, lint, locale
parity and diff checks. Persisted time and heart-rate series were verified through
the activity API. The synthetic QA activity was deleted after verification.

## GPS regression coverage and provider scope

The common FIT parser fixes both uploaded files and Garmin FIT downloads (manual
sync and official callbacks). Strava downloads native streams rather than FIT;
shared compression preserves aligned GPS gaps there too and rejects shortened
GPS channels whose missing timestamps cannot be recovered. No live Garmin or
Strava request is needed for these changes or synthetic regression tests.

Historical activities are not automatically re-downloaded. To restore an uploaded
FIT that lost GPS, import the exact same file again in the same athlete account.
Garmin manual sync currently skips activities that already have streams, so it
does not automatically repair previously stored routes. Official Garmin/Strava
activities also need their source data to be reprocessed; this change does not
add a historical resync control.

Additional regression commands:

```sh
pnpm api exec jest --runInBand --runTestsByPath \
  src/modules/core/helpers/activity-stream.spec.ts \
  src/modules/core/services/pipeline/processors/weather.processor.spec.ts
node --experimental-strip-types --test scripts/tests/map-hover.test.mjs
```

GPS fix verification: 51 API tests and two hover tests passed; API/web/shared
lint and typechecks passed. Chromium mobile QA confirmed split map paths, safe
empty GPS handling and a speed chart with gaps and no invalid values. The user's
FIT was checked locally without writing activity data: all 2,796 valid positions,
four missing samples and eight laps survived parsing and compression.
