import { ManagedPlan } from '@/api/plan-workspace/plan-workspace.api';

import { dateInput } from './helpers';

/** A plan of the athlete, or their calendar without a plan. */
export type PlanChoice = number | 'calendar';

/** Planning opens the active plan covering today, else the calendar. */
export function defaultPlanChoice(
  plans: Pick<
    ManagedPlan,
    'trainingPlanId' | 'status' | 'startDate' | 'endDate'
  >[],
  now = new Date(),
): PlanChoice {
  const today = dateInput(now);
  return (
    plans.find(
      (plan) =>
        plan.status === 'ACTIVE' &&
        dateInput(plan.startDate) <= today &&
        today <= dateInput(plan.endDate),
    )?.trainingPlanId ?? 'calendar'
  );
}

/** The `planId` URL value: absent until chosen, so the default can apply. */
export function parsePlanChoice(value: string | null): PlanChoice | null {
  if (value === 'calendar') return 'calendar';
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export type CalendarWeek = { start: Date; next: Date };

/** Weeks from Monday around today: a couple back and several ahead. */
export function calendarWeeks(
  now = new Date(),
  before = 2,
  after = 5,
): CalendarWeek[] {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: before + after + 1 }, (_, index) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() + (index - before) * 7);
    const next = new Date(start);
    next.setDate(start.getDate() + 7);
    return { start, next };
  });
}
