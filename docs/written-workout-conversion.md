# Written workouts to structured steps

Coaches often write sessions as text, for example:

> 15-20' calentar + 3x8' a RPE 6-7, aprox. 4:35-4:40/km, recuperación 3' trote
> muy suave + enfriar

The AI converts that text into the editor's steps: a warm-up, one repeat block
with work and recovery steps, and a cool-down. It uses a small model and a
short prompt, because the text already says what the session is. Nothing is
saved until the coach saves the session.

## Where it is available

| Place | Action | What changes |
| --- | --- | --- |
| Event dialog, next to the **Structured workout** heading (create, edit, templates, from template) | **From text (AI)** | Only the steps. The text box starts with the session description. Name, date and goals stay. |
| **Modify with AI** dialog | **Convert as written** | Only the steps; the rest of the session stays. |
| **Create with AI** dialog (calendar) and the AI dialog of a new, empty session | **Convert as written** | A new session: the text becomes the description, the AI gives a short name and the sport, and the event dialog opens for review. |

**Generate** and **Modify** in the same dialogs still use the full session
model. Use them for requests that need judgement ("an easy 1 h run", "make it
harder"). Use **Convert as written** when the text already is the workout.

A new session starts at 8:00, like generated sessions. Its duration goal is the
sum of the steps when every step is timed, and its distance goal the sum when
every step is a distance. Otherwise both goals stay empty and the session lasts
one hour in the calendar.

## Conversion rules

- `NxD` becomes one repeat block of `N` with the work step and, when written,
  the recovery. Repeats are never nested, and repetitions are limited to 1–99.
- Times are seconds and distances metres. For a range such as `15-20'` the
  lower bound is used and the range is kept in the step note.
- A step without a duration ends with the lap button.
- Absolute paces are converted from min/km to m/s, with the slower pace as the
  minimum.
- The editor stores one whole RPE value: a range such as `6-7` is stored as the
  rounded midpoint (7) and `RPE 6-7` is added to the note.
- Percentages such as `80% FCmax` or `90% FTP` stay relative to the metric.
- Zones are used only when they belong to the athlete. Templates have no
  athlete, so zone references are dropped and absolute targets are kept.
- Words that the structure cannot hold ("trote muy suave") go into the step
  note, in the language of the text. Intensities and durations are never
  invented.

## Token use

| Request | Approximate size |
| --- | --- |
| Convert, steps only | 3,600 characters (about 900 tokens) |
| Convert, new session (name and sport too) | 3,800 characters (about 950 tokens) |
| Full session generation, before zones, metrics and memory | 12,000 characters (about 3,000 tokens) |

The sizes are the full OpenAI request for the example above, measured against a
fake API. The conversion stays small because:

- **Small model.** `AI_MODEL_WORKOUT_PARSER`, by default `openai/gpt-5-mini`,
  or `anthropic/claude-haiku-4-5` with `AI_PROVIDER=anthropic`.
- **Short fixed instructions** (under 1,600 characters) and a compact output
  schema without recursion, so OpenAI can enforce it strictly. A new session
  asks for the sport as free text, checked against the app's sports, instead of
  listing every sport in the schema.
- **Athlete context only when the text refers to it.** Zones are read and sent
  only if the text names a zone, and reference metrics (max HR, VMA, FTP,
  critical power) only if it uses a percentage or names one.
- **No coach memory.** The conversion neither reads nor writes
  [coach AI memory](ai-memory.md).
- **Cache.** The same text for the same athlete, sport and context is answered
  from memory for one hour (up to 200 conversions per API process), without a
  model call.

## API

`POST /agent/ai/events/structure` takes
[`GenerateWorkoutStructureDto`](../libs/shared/src/types/dtos/agent/generate-workout-structure.dto.ts):
the text is `instructions` (up to 2,000 characters), else `description`, else
`name`. `athleteId` is optional; coaches can only send athletes they coach.
With `sport`, the response is `{ steps }`; without it, `{ steps, name, sport }`.
The endpoint requires the AI generation feature.

Source:
[parser](../apps/api/src/modules/agent/services/workout-parser.ts),
[service](../apps/api/src/modules/agent/services/workout-parser.service.ts),
[web helper](../apps/web/src/utils/workout/written-workout.ts).
