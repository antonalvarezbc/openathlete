/** Civil date conversion independent of the API server's timezone. */
export function adaptationWeek(date: string, timeZone: string) {
  const civil = new Date(`${date}T00:00:00Z`);
  if (isNaN(civil.getTime()) || civil.toISOString().slice(0, 10) !== date)
    throw new Error('Invalid week date');
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
  const convert = (days: number) => {
    const desired = civil.getTime() + days * 86400000;
    let result = desired;
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(
        formatter
          .formatToParts(new Date(result))
          .map((part) => [part.type, part.value]),
      );
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
    throw new Error('Invalid local midnight');
  };
  return { start: convert(0), end: convert(7) };
}
