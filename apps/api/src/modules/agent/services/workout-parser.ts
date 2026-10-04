import { z } from 'zod';

import {
  CreateWorkoutStepDto,
  METRIC_TYPE,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
} from '@openathlete/shared';

/**
 * Natural-language workout -> structured steps, kept small on purpose: short
 * instructions, a compact output schema and athlete context only when the
 * text needs it. Pure functions; the service adds the model call and cache.
 */

const PERCENT_METRICS = [
  METRIC_TYPE.HR_MAX,
  METRIC_TYPE.HR_RESERVE,
  METRIC_TYPE.VMA,
  METRIC_TYPE.FTP_RUNNING,
  METRIC_TYPE.FTP_CYCLING,
  METRIC_TYPE.CRITICAL_POWER_RUNNING,
  METRIC_TYPE.CRITICAL_POWER_CYCLING,
] as const;

// Every field is required and nullable so the schema also works with strict
// structured outputs; no recursion: a repeat holds plain steps only.
const target = z.object({
  type: z.enum(['PACE', 'HEARTRATE', 'POWER', 'CADENCE', 'RPE', 'ZONE']),
  min: z.number().nullable(),
  max: z.number().nullable(),
  value: z.number().nullable(),
  metric: z.enum(PERCENT_METRICS).nullable(),
});

const step = z.object({
  type: z.enum([
    'WARMUP',
    'STEADY',
    'INTERVAL_ACTIVE',
    'INTERVAL_REST',
    'COOLDOWN',
    'FREE',
  ]),
  duration: z.enum(['TIME', 'DISTANCE', 'LAP_BUTTON']),
  value: z.number().nullable(),
  note: z.string().nullable(),
  targets: z.array(target),
});

export const parsedWorkoutSchema = z.object({
  blocks: z.array(
    z.object({
      step: step.nullable(),
      repeat: z
        .object({ times: z.number().int(), steps: z.array(step) })
        .nullable(),
    }),
  ),
});

// A new session from text alone also needs a name and the sport. The sport
// is free text, checked afterwards, so the schema does not list every sport.
export const parsedSessionSchema = parsedWorkoutSchema.extend({
  name: z.string(),
  sport: z.string(),
});

export type ParsedWorkout = z.infer<typeof parsedWorkoutSchema>;
export type ParsedSession = z.infer<typeof parsedSessionSchema>;
type ParsedStep = z.infer<typeof step>;

/** Replaces the "Sport:" line when the sport is not known yet. */
export const SESSION_FIELDS_HINT =
  "Also return name (a short title in the text's language) and sport (RUNNING, TRAIL_RUNNING, CYCLING, SWIMMING, STRENGTH, MOBILITY, WALK... or OTHER).";

/** The model's sport, if it is one of ours. */
export function toSportType(value: string | null | undefined) {
  const sport = value
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return Object.values(SPORT_TYPE).find((type) => type === sport);
}

export const WORKOUT_PARSER_INSTRUCTIONS = `Convert a coach's workout text into blocks. Use only what the text says; never invent intensities or durations.
Each block is either one step (repeat null) or a repeat (step null).
Step types: WARMUP, STEADY (continuous main work), INTERVAL_ACTIVE, INTERVAL_REST, COOLDOWN, FREE.
"NxD", "N x D", "N series/reps": one repeat {times N, steps [INTERVAL_ACTIVE, INTERVAL_REST]}; a recovery between reps goes inside the repeat. Never nest repeats.
duration: TIME (value in seconds: 8' = 480, 30" = 30, 1h = 3600), DISTANCE (meters: 1km = 1000) or LAP_BUTTON with value null when no duration is given. For a range use the lower bound and keep the range in note.
targets: PACE in decimal min/km (4:35 = 4.583, a range as min/max); HEARTRATE bpm; POWER W; CADENCE per minute; RPE 1-10 (a range as min/max). ZONE only with an id from the zone list, as value. Percentages ("80% FCmax", "90% FTP") use metric with 0-1 values. No target: [].
note: short words worth keeping that are not captured (e.g. "trote muy suave"), in the text's language; otherwise null.`;

/** Zones are only sent when the text names one. */
export const mentionsZones = (text: string) =>
  /\b(z|zona|zone)\s*\d|\bzonas?\b|\bzones?\b/i.test(text);

/** Metrics are only sent when the text uses a percentage or a reference. */
export const mentionsMetrics = (text: string) =>
  /%|\b(vma|vam|ftp|fc\s*m[aá]x|hr\s*max|fcm|reserva|reserve|cp)\b/i.test(text);

export function buildWorkoutParserPrompt(input: {
  text: string;
  /** Unknown for a new session: the model then names it and picks it. */
  sport?: string;
  zones?: string;
  metrics?: string;
}) {
  return [
    input.sport ? `Sport: ${input.sport}` : SESSION_FIELDS_HINT,
    input.zones && `Zones (id name: range):\n${input.zones}`,
    input.metrics && `Metrics: ${input.metrics}`,
    `Text: ${input.text}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const positive = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

const minPerKmToMs = (value: number | null) => {
  const pace = positive(value);
  return pace === null ? null : 1000 / (pace * 60);
};

function convertTargets(
  parsed: ParsedStep,
  zoneIds: Set<number>,
): { targets: CreateWorkoutStepDto['targets']; extraNote?: string } {
  const targets: NonNullable<CreateWorkoutStepDto['targets']> = [];
  let extraNote: string | undefined;
  for (const item of parsed.targets) {
    if (item.type === 'ZONE') {
      // Only zones of this athlete; a template has none.
      const id = item.value;
      if (id !== null && Number.isInteger(id) && zoneIds.has(id))
        targets.push({ targetType: WORKOUT_TARGET_TYPE.ZONE, targetValue: id });
      continue;
    }
    if (item.type === 'RPE') {
      // The editor stores one whole RPE; keep a range in the note.
      const low = positive(item.min) ?? positive(item.value);
      const high = positive(item.max) ?? positive(item.value);
      if (low === null || high === null) continue;
      const value = Math.min(10, Math.max(1, Math.round((low + high) / 2)));
      targets.push({ targetType: WORKOUT_TARGET_TYPE.RPE, targetValue: value });
      if (low !== high) extraNote = `RPE ${low}-${high}`;
      continue;
    }
    const type = WORKOUT_TARGET_TYPE[item.type];
    const metric = item.metric;
    // Percentages stay relative to the metric; absolute pace becomes m/s.
    const convert =
      item.type === 'PACE' && !metric ? minPerKmToMs : (v: number | null) => v;
    let min = convert(positive(item.min));
    let max = convert(positive(item.max));
    const value = convert(positive(item.value));
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    if (min === null && max === null && value === null) continue;
    targets.push({
      targetType: type,
      targetMin: min,
      targetMax: max,
      targetValue: min !== null && max !== null ? null : value,
      metricType: metric,
    });
  }
  return { targets, extraNote };
}

function convertStep(
  parsed: ParsedStep,
  zoneIds: Set<number>,
): CreateWorkoutStepDto {
  const { targets, extraNote } = convertTargets(parsed, zoneIds);
  const value = positive(parsed.value);
  const timed = parsed.duration !== 'LAP_BUTTON' && value !== null;
  const note = [parsed.note?.trim(), extraNote].filter(Boolean).join(' · ');
  return {
    stepType: WORKOUT_STEP_TYPE[parsed.type],
    durationType: timed
      ? WORKOUT_DURATION_TYPE[parsed.duration]
      : WORKOUT_DURATION_TYPE.LAP_BUTTON,
    durationValue: timed ? Math.round(value) : null,
    notes: note || null,
    targets,
  };
}

/** Parsed blocks -> the editor's steps; unusable blocks are dropped. */
export function parsedWorkoutToSteps(
  parsed: ParsedWorkout,
  zoneIds: Iterable<number> = [],
): CreateWorkoutStepDto[] {
  const zones = new Set(zoneIds);
  return parsed.blocks.flatMap((block): CreateWorkoutStepDto[] => {
    if (block.repeat) {
      const times = Math.min(99, Math.max(1, Math.round(block.repeat.times)));
      const childSteps = block.repeat.steps.map((s) => convertStep(s, zones));
      if (!childSteps.length) return [];
      return [
        {
          stepType: WORKOUT_STEP_TYPE.REPEAT,
          durationType: WORKOUT_DURATION_TYPE.OPEN,
          targets: [],
          repeatBlock: { repetitions: times, childSteps },
        },
      ];
    }
    return block.step ? [convertStep(block.step, zones)] : [];
  });
}
