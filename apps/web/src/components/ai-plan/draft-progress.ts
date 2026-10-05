export type DraftStage = 'queued' | 'generating' | 'repairing';

const WEEK_MS = 7 * 86400000;

/**
 * Rough seconds the model needs to write a plan: a fixed start plus each
 * session it writes (about 50 tokens each).
 */
export function estimateDraftSeconds(
  startDate: string,
  raceDate: string,
  daysPerWeek: number,
) {
  const weeks = Math.max(
    1,
    Math.ceil((Date.parse(raceDate) - Date.parse(startDate)) / WEEK_MS) || 1,
  );
  return Math.round(20 + 1.2 * weeks * Math.max(1, daysPerWeek));
}

/**
 * How full the progress bar is, from 0 to 100. The model reports no progress
 * of its own, so within a stage the bar follows the elapsed time against the
 * estimate and slows down instead of reaching the end: only the finished
 * draft completes it.
 */
export function draftProgress(
  stage: DraftStage,
  elapsedSeconds: number,
  estimateSeconds: number,
) {
  const eased = (from: number, to: number, seconds: number) =>
    from +
    (to - from) * (1 - Math.exp((-2 * Math.max(0, seconds)) / estimateSeconds));
  if (stage === 'queued') return 3;
  if (stage === 'generating') return Math.round(eased(5, 90, elapsedSeconds));
  // The repair round rewrites the plan once more after the first answer.
  return Math.round(eased(90, 98, elapsedSeconds - estimateSeconds));
}
