import { describe, expect, it } from 'vitest';

import { adaptationHandoff } from './adaptation-handoff';

describe('Consultation to adaptation', () => {
  it('preserves athlete, period and coach wording, without granting permissions', () => {
    const value = adaptationHandoff(
      {
        athleteId: 7,
        planId: 3,
        weekStart: '2030-10-21',
        currentState: 'Heavy legs',
      },
      'NEXT_SESSION',
      'Replace intervals with an easy session',
    );
    expect(value).toEqual({
      athleteId: 7,
      planId: 3,
      weekStart: '2030-10-21',
      currentState: 'Heavy legs',
      scope: 'NEXT_SESSION',
      instructions: 'Replace intervals with an easy session',
    });
    for (const key of [
      'allowIncrease',
      'allowNewSessions',
      'readiness',
      'proposal',
      'confirmed',
    ])
      expect(value).not.toHaveProperty(key);
  });
  it('supports the calendar without a plan and bounds the text to request limits', () => {
    const value = adaptationHandoff(
      { athleteId: 7, weekStart: '2030-10-21', currentState: 'x'.repeat(4000) },
      'WEEK',
      'y'.repeat(4000),
    );
    expect(value.currentState).toHaveLength(3000);
    expect(value.instructions).toHaveLength(3000);
    expect(value.planId).toBeUndefined();
    expect(value.scope).toBe('WEEK');
  });
});
