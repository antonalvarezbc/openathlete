import { describe, expect, it } from 'vitest';

import {
  calendarWeeks,
  defaultPlanChoice,
  parsePlanChoice,
} from './planning-selection';

const plan = (
  trainingPlanId: number,
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED',
  startDate: string,
  endDate: string,
) => ({ trainingPlanId, status, startDate, endDate });

describe('defaultPlanChoice', () => {
  const today = new Date(2030, 9, 23, 12);

  it('opens the active plan that covers today', () => {
    expect(
      defaultPlanChoice(
        [
          plan(1, 'ACTIVE', '2030-08-01T12:00:00', '2030-09-30T12:00:00'),
          plan(2, 'DRAFT', '2030-10-01T12:00:00', '2030-11-30T12:00:00'),
          plan(3, 'ACTIVE', '2030-10-01T12:00:00', '2030-11-30T12:00:00'),
        ],
        today,
      ),
    ).toBe(3);
  });

  it('counts the first and last day of the plan', () => {
    expect(
      defaultPlanChoice(
        [plan(4, 'ACTIVE', '2030-10-23T12:00:00', '2030-10-23T12:00:00')],
        today,
      ),
    ).toBe(4);
  });

  it('opens the calendar without an active plan for today', () => {
    expect(defaultPlanChoice([], today)).toBe('calendar');
    expect(
      defaultPlanChoice(
        [
          plan(5, 'DRAFT', '2030-10-01T12:00:00', '2030-11-30T12:00:00'),
          plan(6, 'ACTIVE', '2030-11-01T12:00:00', '2030-12-30T12:00:00'),
        ],
        today,
      ),
    ).toBe('calendar');
  });
});

describe('parsePlanChoice', () => {
  it('tells a choice apart from no choice yet', () => {
    expect(parsePlanChoice('calendar')).toBe('calendar');
    expect(parsePlanChoice('12')).toBe(12);
    expect(parsePlanChoice(null)).toBeNull();
    expect(parsePlanChoice('0')).toBeNull();
    expect(parsePlanChoice('abc')).toBeNull();
  });
});

describe('calendarWeeks', () => {
  it('lists weeks from Monday, two back and five ahead', () => {
    // A Thursday.
    const weeks = calendarWeeks(new Date(2030, 9, 24, 15));
    expect(weeks).toHaveLength(8);
    expect(weeks[2].start).toEqual(new Date(2030, 9, 21));
    expect(weeks[2].next).toEqual(new Date(2030, 9, 28));
    expect(weeks[0].start).toEqual(new Date(2030, 9, 7));
    expect(weeks[7].next).toEqual(new Date(2030, 11, 2));
  });

  it('treats Sunday as the end of its week', () => {
    expect(calendarWeeks(new Date(2030, 9, 27, 22))[2].start).toEqual(
      new Date(2030, 9, 21),
    );
  });
});
