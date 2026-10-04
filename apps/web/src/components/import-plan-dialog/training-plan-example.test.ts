import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPlanSchedule,
  createWorkoutSchema,
  trainingPlanImportSchema,
} from '@openathlete/shared';

import { TRAINING_PLAN_EXAMPLE_TEXT } from './training-plan-example';

describe('JSON plan example', () => {
  const parsed = trainingPlanImportSchema.safeParse(
    JSON.parse(TRAINING_PLAN_EXAMPLE_TEXT),
  );

  it('passes the import validation', () => {
    expect(parsed.error?.issues).toBeUndefined();
  });

  it('has workouts the API accepts', () => {
    const workouts = parsed.data!.cycles.flatMap((cycle) =>
      cycle.weeks.flatMap((week) =>
        week.sessions.flatMap((session) =>
          session.workout ? [session.workout] : [],
        ),
      ),
    );
    expect(workouts.length).toBeGreaterThan(0);
    for (const workout of workouts)
      expect(createWorkoutSchema.safeParse(workout).error).toBeUndefined();
  });

  it('shows every part of the format', () => {
    const text = TRAINING_PLAN_EXAMPLE_TEXT;
    for (const part of [
      '"repeatBlock"',
      '"DISTANCE"',
      '"LAP_BUTTON"',
      '"metricType": "HR_MAX"',
      '"targetType": "PACE"',
      '"targetType": "RPE"',
      '"STRENGTH"',
      '"TAPER"',
      '"goalElevationGain"',
    ])
      expect(text).toContain(part);
  });

  it('places three weeks of sessions from the chosen date', () => {
    // Monday 5 October 2026: Tuesday sessions fall on the 6th, Sunday on the 11th.
    const schedule = buildPlanSchedule(
      parsed.data!,
      '2026-10-05',
      'Europe/Madrid',
    );
    const [first] = schedule.cycles[0].weeks[0].sessions;
    expect(first.date).toBe('2026-10-06');
    expect(schedule.cycles[0].weeks[0].sessions.at(-1)!.date).toBe(
      '2026-10-11',
    );
    expect(schedule.cycles[1].weeks[0].sessions.at(-1)!.date).toBe(
      '2026-10-25',
    );
  });

  it('is the same file as the documentation example', () => {
    const docs = readFileSync(
      join(__dirname, '../../../../../docs/examples/training-plan.json'),
      'utf8',
    );
    expect(docs).toBe(TRAINING_PLAN_EXAMPLE_TEXT);
  });
});
