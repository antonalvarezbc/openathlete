import { m } from '@/paraglide/messages';
import { CalendarDays, CalendarRange } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { useCalendarContext } from './hooks/use-calendar-context';
import { CalendarView } from './hooks/use-calendar-data';

/** Month / week switch; hidden when the view is locked. */
export function CalendarViewToggle() {
  const { view, setView, viewLocked } = useCalendarContext();
  if (viewLocked) return null;
  return (
    <Tabs value={view} onValueChange={(v) => setView(v as CalendarView)}>
      <TabsList aria-label={m.calendar_view()}>
        <TabsTrigger value="month" className="gap-1.5">
          <CalendarDays className="size-4" />
          {m.calendar_view_month()}
        </TabsTrigger>
        <TabsTrigger value="week" className="gap-1.5">
          <CalendarRange className="size-4" />
          {m.calendar_view_week()}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
