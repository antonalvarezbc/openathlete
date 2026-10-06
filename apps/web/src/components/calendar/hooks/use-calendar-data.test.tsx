// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CalendarView, useCalendarData } from './use-calendar-data';

const state = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let data: ReturnType<typeof useCalendarData>;
function Harness({ date, view }: { date: Date; view: CalendarView }) {
  data = useCalendarData({ defaultMonth: date, view });
  return null;
}
const dates = () =>
  data.displayedWeeks[0].map((day) =>
    [day.getFullYear(), day.getMonth() + 1, day.getDate()].join('-'),
  );
beforeEach(() => {
  state.mobile = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it.each([false, true])(
  'shows exactly one local Monday-Sunday week (mobile=%s)',
  async (mobile) => {
    state.mobile = mobile;
    await act(async () =>
      root.render(<Harness date={new Date(2026, 9, 1)} view="week" />),
    );
    expect(data.displayedWeeks).toHaveLength(1);
    expect(dates()).toEqual([
      '2026-9-28',
      '2026-9-29',
      '2026-9-30',
      '2026-10-1',
      '2026-10-2',
      '2026-10-3',
      '2026-10-4',
    ]);
    expect(data.displayedMonth.getMonth()).toBe(8);
  },
);
it('navigates across year and daylight-saving boundaries at local midnight', async () => {
  await act(async () =>
    root.render(<Harness date={new Date(2026, 11, 31)} view="week" />),
  );
  await act(async () => data.nextWeek());
  expect(dates()[0]).toBe('2027-1-4');
  await act(async () => data.prevWeek());
  expect(dates()[0]).toBe('2026-12-28');
  await act(async () => data.goToWeek(new Date(2026, 2, 8)));
  await act(async () => data.nextWeek());
  expect(dates()[0]).toBe('2026-3-9');
  expect(data.displayedWeeks[0].every((day) => day.getHours() === 0)).toBe(
    true,
  );
  await act(async () => data.goToWeek(new Date(2026, 9, 25)));
  await act(async () => data.nextWeek());
  expect(dates()[0]).toBe('2026-10-26');
});
it('does not skip February when moving from a 31st and does not mutate the old date', async () => {
  await act(async () =>
    root.render(<Harness date={new Date(2026, 0, 31)} view="month" />),
  );
  const old = data.displayedMonth;
  await act(async () => data.nextMonth());
  expect(data.displayedMonth.getMonth()).toBe(1);
  expect(old.getDate()).toBe(31);
  expect(old.getMonth()).toBe(0);
  await act(async () => data.prevMonth());
  expect(data.displayedMonth.getMonth()).toBe(0);
});
