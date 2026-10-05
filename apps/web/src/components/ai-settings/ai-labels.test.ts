import { describe, expect, it } from 'vitest';

import { AiTask } from '@openathlete/shared';

import { aiTaskDescription, aiTaskLabel } from './ai-labels';

describe('AI task labels', () => {
  it('name and describe every task, each differently', () => {
    const tasks = Object.values(AiTask);
    const labels = tasks.map(aiTaskLabel);
    const descriptions = tasks.map(aiTaskDescription);
    for (const text of [...labels, ...descriptions])
      expect(text).toEqual(expect.stringMatching(/\S/));
    expect(new Set(labels).size).toBe(tasks.length);
    expect(new Set(descriptions).size).toBe(tasks.length);
  });

  it('say which coach features each new task covers', () => {
    expect(aiTaskLabel(AiTask.PLAN_ADAPTATION)).toMatch(/assistant/i);
    expect(aiTaskDescription(AiTask.WORKOUT_PARSER)).toMatch(/small/i);
  });
});
