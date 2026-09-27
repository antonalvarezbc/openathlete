# Automatic refresh of saved TRIMP loads

Opening or refreshing the coach's athlete calendar refreshes the current TRIMP
summary. Only missing or changed loads in its 42-day window are recalculated.
There is no recalculation button and no background polling or Garmin/LLM request.

Each saved load carries an `inputSignature` in its existing JSON metadata. It
covers the compressed activity stream, event date, current heart-rate references,
their source, the sex-specific formula selection and a calculation version.
Unchanged entries survive API restarts and are reused without decompressing or
integrating their pulse streams. Compressed data is read locally to verify the
signature because activity records do not have an update timestamp. Summary averages are still recomputed from saved
loads so rest days and activities leaving the window are reflected correctly.
New activities, FIT enrichment, changed HR references, applicable zone changes,
activity dates and formula versions invalidate affected entries. Old entries
without a signature are recalculated once.

Overlapping refreshes in one API process share the same in-flight work after
checking access. Database upserts prevent duplicate calculation/activity rows
across processes and concurrent import listeners. Requests still read local data
to detect changes. Missing-data failures are checked again on the next refresh;
they are not persisted as fake zero loads.

## Heart-rate references

1. Use the latest `HR_MAX` metric when present.
2. Only if absent, use the highest upper bound of the athlete's `HEARTRATE` zones
   applicable to the activity's sport. Sport-specific zones take precedence over
   general zones (an empty sports list).
3. `HR_REST` remains required. Values must be finite and positive, with maximum HR
   greater than resting HR. Invalid explicit metrics do not silently use zones.

The zone limit is a calculation reference, not a new physiological measurement;
no `HR_MAX` metric is created. Saved metadata records `hrMax`, `hrRest` and
`hrMaxSource`. The summary reports those references and counts updated, reused
and unavailable activities. Failed activities retain any previous load and the
UI states that limitation. Latest references also apply to older activities.
Automatic calculation after import uses the same resolution.

## Existing explicit API

`POST /training-load/recalculate` remains available for full-history recalculation:

```json
{ "calculationType": "TRIMP", "athleteId": 12 }
```

The optional athlete ID selects a linked athlete for a coach; omitting it retains
self recalculation. Authorization is checked before reading activities and again
before each write. IDs and calculation types are validated. The calendar uses
the automatic summary refresh instead of this endpoint.
