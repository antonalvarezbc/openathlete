# Heart-rate zones entered as percentages

Coaches can use **Training zones → Heart rate → Create/Edit zones** and switch
between **Manual** (bpm), **% of heart-rate reserve**, and **% of maximum heart rate**,
in that order. Manual hides both reference-HR inputs and the percentage explanations. Maximum-HR
percentage mode hides resting HR. When switching from Manual requires missing or
corrected reference values, a dialog allows entering them before converting the
current limits; cancelling keeps the manual zones unchanged.
Athlete-only accounts remain read-only.

## Defaults

New heart-rate configurations start with six editable zones:

| Zone | Percentage of HRmax |
| ---- | ------------------- |
| 0    | Below 50%           |
| 1    | 50–60%              |
| 2    | 60–70%              |
| 3    | 70–80%              |
| 4    | 80–90%              |
| 5    | 90–100%             |

Existing configurations open in bpm without changing their values. Switching to
percentages requires a valid HRmax that covers their current ranges. The default
percentages button applies the five-zone preset to five rows or the six-zone
preset to six rows, retaining IDs, names, descriptions, colors and sports. It does
not replace or renumber existing zones. Zone 0 is an ordinary named zone, not a
new database type.

## Heart-rate reserve (Karvonen)

Select **% of heart-rate reserve** and enter maximum and resting heart rate.
The editor prefills resting heart rate from `HR_REST` when available. It never
uses `HR_MIN_DAILY`. Resting HR must be a positive integer below maximum HR;
missing or invalid resting HR prevents saving in reserve mode.

`target HR = resting HR + percentage / 100 × (maximum HR − resting HR)`

With maximum HR 195 and resting HR 60, the 60–70% boundaries are 141 and 154.5
bpm. After rounding and assigning shared boundaries to the higher zone, Z2 is
141–154 bpm and Z3 starts at 155 bpm. Zero percent reserve corresponds to resting
HR, so the default zone 0 starts at resting HR in this method.

Switching between the two percentage methods retains the entered percentages
and recalculates their bpm values. Switching between bpm and percentages retains
absolute bpm limits. Existing bpm limits below resting HR cannot be represented
as nonnegative reserve percentages; the editor reports that instead of silently
changing them. To apply a new reserve preset to such a configuration, enter the
maximum-HR percentage mode first, select reserve, then apply default percentages.

## Conversion and persistence

The editor prefills HRmax from the athlete's latest `HR_MAX` metric when available.
Otherwise the coach must enter it; no age formula or assumed HRmax is used.
Changing either HR input only changes the editor's calculation, not the athlete metrics.

Percentage boundaries are rounded to whole bpm. The shared boundary belongs to
the higher zone; 100% is inclusive. At HRmax 200, zone 0 is 0–99 bpm, zone 1 is
100–119 bpm, and zone 5 is 180–200 bpm. A preview shows the actual saved limits.

The existing API and database store **absolute bpm**, not percentage definitions.
Changing maximum or resting HR later does not automatically recalculate saved zones. To recalculate,
reopen the editor, select percentage mode and adjust/apply the desired percentages
before saving. Existing sport-specific values and workout references keep their
zone IDs. As before, the bulk editor edits each zone's first value record.

Saving uses the existing individual API calls, not an atomic bulk transaction.
A failed save can be partial; the editor reports that fact, retains newly created
IDs and allows retry without intentionally creating those zones again.

## Verification

- `node --experimental-strip-types --test scripts/tests/heart-rate-percentages.test.mjs`
- `node scripts/tests/heart-rate-zones.browser.mjs` against isolated Vite/Chromium
  (see the test file header). The browser tests mock API calls and use no real data.
- Existing API training-zone permission tests, web/API type checks, targeted lint
  and locale parity checks.

## Source references

- [Zone editor](../apps/web/src/components/training-zone-editor/training-zone-bulk-editor.tsx)
- [Percentage conversion](../apps/web/src/components/training-zone-editor/heart-rate-percentages.ts)
