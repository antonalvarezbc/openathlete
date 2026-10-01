import { AiMemoryMode } from '@openathlete/shared';

export interface AiMemoryLimits {
  /** Max characters of the consolidated summary sent to the model. */
  summaryChars: number;
  /** Most recent unconsolidated notes sent to the model. */
  notes: number;
  /** Earlier activities whose athlete feedback answers are sent. */
  feedback: number;
  /** Max characters per athlete feedback entry. */
  feedbackChars: number;
  /** Consolidate once this many notes are waiting. */
  consolidateAfter: number;
}

/**
 * Bounded memory sizes. Characters, not tokens: roughly 4 characters per
 * token, so COMPACT adds at most ~600 tokens per call and EXTENDED ~1,700,
 * whatever the history length.
 */
export const AI_MEMORY_LIMITS: Record<
  Exclude<AiMemoryMode, 'OFF'>,
  AiMemoryLimits
> = {
  COMPACT: {
    summaryChars: 700,
    notes: 3,
    feedback: 2,
    feedbackChars: 280,
    consolidateAfter: 6,
  },
  EXTENDED: {
    summaryChars: 2000,
    notes: 8,
    feedback: 5,
    feedbackChars: 400,
    consolidateAfter: 12,
  },
};

/** Max characters of a single stored note. */
export const AI_MEMORY_NOTE_CHARS = 300;

const MODE_RANK: Record<AiMemoryMode, number> = {
  OFF: 0,
  COMPACT: 1,
  EXTENDED: 2,
};

export function largestMode(modes: AiMemoryMode[]): AiMemoryMode {
  return modes.reduce<AiMemoryMode>(
    (best, mode) => (MODE_RANK[mode] > MODE_RANK[best] ? mode : best),
    'OFF',
  );
}

/** Collapses whitespace and cuts at a word boundary with an ellipsis. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
