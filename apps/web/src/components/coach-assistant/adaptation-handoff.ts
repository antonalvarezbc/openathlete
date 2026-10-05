import type { PlanAdaptationRequest } from '@openathlete/shared';

export type AdaptationHandoff = Pick<
  PlanAdaptationRequest,
  | 'athleteId'
  | 'planId'
  | 'weekStart'
  | 'scope'
  | 'currentState'
  | 'instructions'
>;

/** Only the coach's own request is transferred; an assistant answer grants no permissions. */
export function adaptationHandoff(
  selection: Pick<
    AdaptationHandoff,
    'athleteId' | 'planId' | 'weekStart' | 'currentState'
  >,
  scope: AdaptationHandoff['scope'],
  lastCoachQuestion: string,
): AdaptationHandoff {
  return {
    ...selection,
    scope,
    currentState: selection.currentState.slice(0, 3000),
    instructions: lastCoachQuestion.slice(0, 3000),
  };
}
