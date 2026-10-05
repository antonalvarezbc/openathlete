import { describe, expect, it } from 'vitest';

import { draftProgress, estimateDraftSeconds } from './draft-progress';

describe('estimateDraftSeconds', () => {
  it('grows with the weeks and the training days', () => {
    // 16 weeks of 4 sessions
    expect(estimateDraftSeconds('2030-01-07', '2030-04-28', 4)).toBe(97);
    expect(estimateDraftSeconds('2030-01-07', '2030-06-23', 6)).toBeGreaterThan(
      estimateDraftSeconds('2030-01-07', '2030-04-28', 4),
    );
  });

  it('counts at least one week and one day', () => {
    expect(estimateDraftSeconds('2030-01-07', '2030-01-07', 0)).toBe(21);
    expect(estimateDraftSeconds('not a date', '2030-01-07', 3)).toBe(24);
  });
});

describe('draftProgress', () => {
  const estimate = 100;

  it('starts low while the plan waits in the queue', () => {
    expect(draftProgress('queued', 30, estimate)).toBe(3);
  });

  it('fills while the plan is written, without reaching the end', () => {
    const early = draftProgress('generating', 10, estimate);
    const late = draftProgress('generating', estimate, estimate);
    const overdue = draftProgress('generating', 10 * estimate, estimate);
    expect(early).toBeGreaterThan(5);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(85);
    expect(overdue).toBeLessThanOrEqual(90);
  });

  it('keeps going forward through the repair round', () => {
    const before = draftProgress('generating', 10 * estimate, estimate);
    const repairing = draftProgress('repairing', 1.5 * estimate, estimate);
    expect(draftProgress('repairing', 10, estimate)).toBe(90);
    expect(repairing).toBeGreaterThanOrEqual(before);
    expect(repairing).toBeGreaterThan(90);
    expect(draftProgress('repairing', 100 * estimate, estimate)).toBeLessThan(
      100,
    );
  });
});
