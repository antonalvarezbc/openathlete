import { SEOPlanData } from '../types/dtos/seo/seo-plan.dto';

/** Convert civil calendar times to instants without assuming the server's zone. */
export function buildPlanSchedule(
  plan: SEOPlanData,
  startDate: string | Date,
  timeZone = 'UTC',
) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (date: Date) =>
    Object.fromEntries(
      formatter.formatToParts(date).map((p) => [p.type, p.value]),
    );
  const calendarDate =
    typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? startDate
      : (() => {
          const p = parts(new Date(startDate));
          return `${p.year}-${p.month}-${p.day}`;
        })();
  const firstDay = new Date(`${calendarDate}T00:00:00Z`);
  if (
    isNaN(firstDay.getTime()) ||
    firstDay.toISOString().slice(0, 10) !== calendarDate
  )
    throw new Error('Invalid start date');
  const civil = (offset: number) =>
    new Date(firstDay.getTime() + offset * 86400000);
  const instant = (offset: number, hour = 0) => {
    const desired = civil(offset).getTime() + hour * 3600000;
    let result = desired;
    for (let i = 0; i < 4; i++) {
      const p = parts(new Date(result));
      const rendered = Date.UTC(
        +p.year,
        +p.month - 1,
        +p.day,
        +p.hour,
        +p.minute,
        +p.second,
      );
      if (rendered === desired) return new Date(result);
      result += desired - rendered;
    }
    throw new Error('Calendar time does not exist in this time zone');
  };
  let weekIndex = 0;
  const cycles = plan.cycles.map((cycle) => {
    const weeks = cycle.weeks.map((week) => {
      const offset = weekIndex++ * 7;
      const sessions = week.sessions.map((session) => {
        const day =
          offset + ((session.dayOfWeek - civil(offset).getUTCDay() + 7) % 7);
        const start = instant(day, 9);
        return {
          ...session,
          date: civil(day).toISOString().slice(0, 10),
          startDate: start,
          endDate: new Date(
            start.getTime() + (session.goalDuration ?? 3600) * 1000,
          ),
        };
      });
      return {
        ...week,
        startDate: instant(offset),
        endDate: new Date(instant(offset + 7).getTime() - 1),
        sessions,
      };
    });
    return {
      ...cycle,
      startDate: weeks[0].startDate,
      endDate: weeks[weeks.length - 1].endDate,
      weeks,
    };
  });
  return {
    startDate: instant(0),
    endDate: new Date(instant(weekIndex * 7).getTime() - 1),
    cycles,
  };
}
