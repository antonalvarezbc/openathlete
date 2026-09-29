# Athlete-relative workout templates

## Authoring

In a training event's structured workout editor, add a repeat block with five
repetitions and an eight-minute active step. Add either:

- **Heart Rate → Metric Reference → Max Heart Rate**, range **80–85%**; or
- **Training Zone → Zone 4**.

The editor previews the selected athlete's values. A reusable template can be
edited without a selected athlete or personal coach metrics. Relative targets
remain relative when saved, duplicated and assigned, including repeated steps.
Heart-rate reserve targets use `rest + fraction * (max - rest)` and require both
`HR_MAX` and `HR_REST`. Maximum-HR percentages need only `HR_MAX`.

Setting the reference inputs in the zone bulk editor does not itself create an
`HR_MAX` athlete metric. The missing-metric message identifies what must be added.
Zone targets can be used directly when the athlete has configured zone ranges.

## Zone identity and matching

`WorkoutStepTarget.zoneReference` is an optional JSON object containing a zone's
`type` and `name`. A template does not retain the source athlete's zone ID. When
assigned, the server resolves the reference and stores the destination zone ID
in `targetValue`, retaining the portable reference for future reuse.

Numbered names such as `Zone 4`, `Zona 4` and `Z4` match across supported locales.
Zone 0 is supported. Custom names match after case/whitespace normalization; the
application does not assume that “Threshold” and “Zone 4” are equivalent. Zone
ordering indexes are not used as physiological zone numbers.

The sport-specific range takes precedence over an explicitly general range
(empty sports array). Missing or ambiguous matches block assignment. No guessed
zones, population HRmax values or coach metrics are used to prescribe targets.

## Persistence and export

- The additive migration adds only a nullable `zone_reference` JSONB column.
- Common DTO/Prisma mappers preserve `metricType` and `zoneReference`.
- Template assignment validates references and authorization before writing,
  then creates the event and structured workout in a single nested write.
- Garmin and Suunto adapters resolve targets using the destination athlete before
  mapping export payloads. Zone targets become actual HR/power/pace ranges;
  OpenAthlete database IDs are never sent as Garmin zone numbers by this path.
- Scheduled targets remain relative. Preview and export use the current available
  athlete metrics and configured zones; this does not bulk rewrite existing
  calendars or proactively re-export workouts when reference data changes.
- Garmin manual activity synchronization is separate and remains an import flow.

## Existing templates

Legacy zone-ID templates can be resolved if their original configured zone still
exists. If a zone was removed, select its replacement explicitly.

Older templates may already have lost `metricType`. That information cannot be
recovered reliably from a number alone. Open those templates and reselect the
metric reference and intended percentage. This feature does not guess whether
an old value was absolute or relative.

## Validation

Backend regression tests cover 5 × 8-minute repeats, template save/application,
two athlete contexts, Zone 0, translated/custom names, sport/general ranges,
ambiguous/missing references, HR reserve, authorization, and Garmin payloads.
`scripts/tests/workout-targets.browser.mjs` exercises actual editor components
with mocked API data at mobile and desktop widths. It needs an isolated Vite
server on port 5188 and Chromium CDP on 9331 (override with `QA_WEB_URL` and
`QA_CDP_URL`). These tests do not contact Garmin or write athlete data.

`scripts/tests/workout-targets.database.mjs` checks target persistence against a
local PostgreSQL instance in a transaction that is deliberately rolled back. It
reads the local database environment; use a disposable development database.
The portable-zone migration is `20260928160000_portable_workout_zone_targets`.
Apply pending migrations, regenerate Prisma and build the shared package before
running an updated API. Tests with mocked export payloads do not certify live
Garmin/Suunto compatibility.

## Source references

- [Shared target resolution](../libs/shared/src/utils/workout-targets.ts)
- [Template service](../apps/api/src/modules/core/services/event-template.service.ts)
