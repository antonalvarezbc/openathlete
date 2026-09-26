import { CompressedActivityStream, isValidGpsPoint } from '@openathlete/shared';

import { compressActivityStream } from '../../core/helpers/activity-stream';

type Sample = number | number[];

// Bound expansion of legacy or malformed JSON before inspecting its channels.
const MAX_SAMPLES = 1_000_000;
const CHANNELS = [
  'distance',
  'latlng',
  'altitude',
  'heartrate',
  'cadence',
  'watts',
  'temp',
  'gap',
  'norm',
] as const;

function decodeChannel(value: unknown): Sample[] | null {
  if (!Array.isArray(value)) return null;
  const samples: Sample[] = [];
  const isSample = (sample: unknown): sample is Sample =>
    (typeof sample === 'number' && Number.isFinite(sample)) ||
    (Array.isArray(sample) &&
      sample.every(
        (item) => typeof item === 'number' && Number.isFinite(item),
      ));
  for (const unit of value) {
    if (isSample(unit)) {
      samples.push(unit);
    } else if (unit && typeof unit === 'object') {
      if (
        Number.isInteger(unit.r) &&
        unit.r > 0 &&
        unit.r <= MAX_SAMPLES - samples.length &&
        isSample(unit.v)
      ) {
        for (let index = 0; index < unit.r; index++) samples.push(unit.v);
      } else if (
        Number.isInteger(unit.i) &&
        unit.i > 0 &&
        unit.i <= MAX_SAMPLES - samples.length &&
        typeof unit.s === 'number' &&
        Number.isFinite(unit.s) &&
        Number.isFinite(unit.s + unit.i - 1)
      ) {
        for (let index = 0; index < unit.i; index++)
          samples.push(unit.s + index);
      } else {
        return null;
      }
    } else {
      return null;
    }
    if (samples.length > MAX_SAMPLES) return null;
  }
  return samples;
}

function timeline(value: unknown): number[] | null {
  const samples = decodeChannel(value);
  if (
    !samples?.length ||
    !samples.every(
      (sample, index) =>
        typeof sample === 'number' &&
        sample >= 0 &&
        (index === 0 || sample >= (samples[index - 1] as number)),
    )
  )
    return null;
  return samples as number[];
}

/** Add available FIT channels without replacing existing recordings or guessing timestamps. */
export function mergeManualGarminStreams(
  existing: unknown,
  incoming: CompressedActivityStream,
): { stream: CompressedActivityStream; changed: boolean; conflict: boolean } {
  const current =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as CompressedActivityStream)
      : {};
  const incomingTime = timeline(incoming.time);
  if (!incomingTime) return { stream: current, changed: false, conflict: true };
  if (!current.time?.length)
    return { stream: incoming, changed: true, conflict: false };
  const currentTime = timeline(current.time);
  if (!currentTime) return { stream: current, changed: false, conflict: true };

  const identical =
    currentTime.length === incomingTime.length &&
    currentTime.every((value, index) => value === incomingTime[index]);
  const unique =
    new Set(currentTime).size === currentTime.length &&
    new Set(incomingTime).size === incomingTime.length;
  const incomingIndices = new Map(
    incomingTime.map((value, index) => [value, index]),
  );
  const indices = currentTime.map((value, index) =>
    identical ? index : unique ? incomingIndices.get(value) : undefined,
  );
  const merged: CompressedActivityStream = { ...current };
  let changed = false;
  // A caller may add laps even when every sensor channel already exists.
  // Report incompatible timelines independently of whether any channel changes.
  let conflict = indices.some((index) => index === undefined);

  for (const channel of CHANNELS) {
    if (!incoming[channel]?.length) continue;
    // Existing numerical channels retain their original samples and compression.
    if (channel !== 'latlng' && current[channel]?.length) continue;
    const candidate = decodeChannel(incoming[channel]);
    if (!candidate || candidate.length !== incomingTime.length) {
      conflict = true;
      continue;
    }

    if (channel === 'latlng') {
      if (
        !candidate.every(
          (point) =>
            Array.isArray(point) &&
            (point.length === 0 || isValidGpsPoint(point)),
        )
      ) {
        conflict = true;
        continue;
      }
      const original = current.latlng?.length
        ? decodeChannel(current.latlng)
        : currentTime.map(() => []);
      if (
        !original ||
        original.length !== currentTime.length ||
        !original.every(
          (point) =>
            Array.isArray(point) &&
            (point.length === 0 || isValidGpsPoint(point)),
        )
      ) {
        conflict = true;
        continue;
      }
      let added = false;
      const points = original.map((point, index) => {
        if (isValidGpsPoint(point)) return point as number[];
        const sourceIndex = indices[index];
        if (sourceIndex === undefined) {
          conflict = true;
          return [];
        }
        const source = candidate[sourceIndex];
        if (isValidGpsPoint(source)) {
          added = true;
          return source as number[];
        }
        return [];
      });
      if (added) {
        merged.latlng = compressActivityStream({ latlng: points }).latlng;
        changed = true;
      }
      continue;
    }

    if (
      !candidate.every((sample) => typeof sample === 'number') ||
      indices.some((index) => index === undefined)
    ) {
      conflict = true;
      continue;
    }
    const values = indices.map((index) => candidate[index!] as number);
    merged[channel] = compressActivityStream({ [channel]: values })[channel];
    changed = true;
  }
  return { stream: merged, changed, conflict };
}
