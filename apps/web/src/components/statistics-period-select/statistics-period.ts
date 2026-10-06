import { addDays, addMonths, addWeeks, addYears } from 'date-fns';

import {
  endOfDay,
  getMonthPeriod,
  getWeekPeriod,
  getYearPeriod,
  startOfDay,
} from '@openathlete/shared';

export type StatisticsPeriodType = 'days7' | 'week' | 'month' | 'year';

/**
 * The period `offset` steps back from today (0 is the current one). The
 * last seven days end today, so Monday does not open on an empty week.
 */
export function statisticsPeriod(
  type: StatisticsPeriodType,
  offset = 0,
  now = new Date(),
): { start: Date; end: Date } {
  switch (type) {
    case 'days7': {
      const end = endOfDay(addDays(now, 7 * offset));
      return { start: startOfDay(addDays(end, -6)), end };
    }
    case 'week':
      return getWeekPeriod(addWeeks(now, offset));
    case 'month':
      return getMonthPeriod(addMonths(now, offset));
    case 'year':
      return getYearPeriod(addYears(now, offset));
  }
}
