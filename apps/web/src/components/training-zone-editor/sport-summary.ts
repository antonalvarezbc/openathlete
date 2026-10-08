import { m } from '@/paraglide/messages';
import { sportTypeLabelMap } from '@/utils/label-map/core';

import { SPORT_TYPE } from '@openathlete/shared';

export const ALL_SPORTS = Object.values(SPORT_TYPE);

export type SportSummary =
  | { kind: 'all' }
  | { kind: 'except'; sports: SPORT_TYPE[] }
  | { kind: 'only'; sports: SPORT_TYPE[] };

/**
 * Zones store every sport explicitly, so a zone saved before a sport was
 * added misses only that one: name whichever of the selected or the missing
 * sports is shorter.
 */
export function summarizeSports(sports: readonly SPORT_TYPE[]): SportSummary {
  const covered = new Set(sports);
  const missing = ALL_SPORTS.filter((sport) => !covered.has(sport));
  if (!missing.length) return { kind: 'all' };
  return missing.length < covered.size
    ? { kind: 'except', sports: missing }
    : { kind: 'only', sports: [...covered] };
}

const listSports = (sports: SPORT_TYPE[]) =>
  sports.map((sport) => sportTypeLabelMap[sport]).join(', ');

export function describeSports(sports: readonly SPORT_TYPE[]): string {
  const summary = summarizeSports(sports);
  switch (summary.kind) {
    case 'all':
      return m.all_sports();
    case 'except':
      return m.all_sports_except({ sports: listSports(summary.sports) });
    case 'only':
      return listSports(summary.sports);
  }
}
