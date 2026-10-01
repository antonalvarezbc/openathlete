import { useSidebar } from '@/components/ui/sidebar';
import { useUserRoles } from '@/contexts/auth';
import { useAthleteInfo } from '@/hooks/use-athlete-info';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getDateLocale } from '@/utils/locales';
import { addDays, getISOWeek } from 'date-fns';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { EVENT_TYPE, Event, SPORT_TYPE } from '@openathlete/shared';

import { SportSelect } from '../sport-select/sport-select';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { CalendarViewToggle } from './calendar-view-toggle';
import { useTemplateLibrarySidebar } from './contexts/template-library-sidebar-context';
import { useCalendarContext } from './hooks/use-calendar-context';
import { COLORED_BY, coloredByLabelMap } from './types/filter';

export function CalendarHeader() {
  const roles = useUserRoles();
  const {
    nextMonth,
    prevMonth,
    goToCurrentMonth,
    displayedMonth,
    setFilter,
    coloredBy,
    setColoredBy,
    athleteId,
    view,
    weekStart,
    nextWeek,
    prevWeek,
    goToCurrentWeek,
  } = useCalendarContext();
  const isWeek = view === 'week';
  const [sportFilter, setSportFilter] = useState<SPORT_TYPE | null>(null);
  const { athlete, isCurrentUser } = useAthleteInfo({ athleteId });
  const { open, setOpen, mainSidebarWasOpen, setMainSidebarWasOpen } =
    useTemplateLibrarySidebar();
  const { setOpen: setMainSidebarOpen, open: mainSidebarOpen } = useSidebar();

  const handleChangeSportFilter = (value: string | null) => {
    setSportFilter(value as SPORT_TYPE);

    if (!value) {
      setFilter(() => () => true);
    } else {
      setFilter(
        () => (event: Event) =>
          event.type !== EVENT_TYPE.NOTE && event.sport === value,
      );
    }
  };

  const locale = getDateLocale(getLocale());
  const weekEnd = addDays(weekStart, 6);
  // Week view: short title, with the date range on its own line below.
  const weekRange = `${weekStart.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  })} – ${weekEnd.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
  const displayedMonthString = isWeek
    ? m.calendar_week_title({ week: getISOWeek(weekStart) })
    : displayedMonth.toLocaleString(locale, {
        month: 'long',
        year: 'numeric',
      });
  const today = new Date();
  const showingCurrent = isWeek
    ? today >= weekStart && today < addDays(weekStart, 7)
    : displayedMonth.getMonth() === today.getMonth() &&
      displayedMonth.getFullYear() === today.getFullYear();

  const calendarTitle = isCurrentUser
    ? m.calendar_of({ month: displayedMonthString })
    : m.calendar_of_athlete({
        firstName: athlete?.user?.firstName || '',
        lastName: athlete?.user?.lastName || '',
        month: displayedMonthString,
      });

  const handleTemplateLibraryToggle = () => {
    if (!open) {
      // Opening: first fold main sidebar, then open library
      if (mainSidebarOpen) {
        setMainSidebarWasOpen(true);
        setMainSidebarOpen(false);
        // Wait for sidebar to fold before opening library
        setTimeout(() => {
          setOpen(true);
        }, 200); // Match sidebar animation duration
      } else {
        setMainSidebarWasOpen(false);
        setOpen(true);
      }
    } else {
      // Closing: first close library, then unfold main sidebar
      setOpen(false);
      // Wait for library to close before unfolding main sidebar
      setTimeout(() => {
        if (mainSidebarWasOpen) {
          setMainSidebarOpen(true);
        }
        setMainSidebarWasOpen(false);
      }, 200); // Match sidebar animation duration
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
      <div className="min-w-0 lg:max-w-md">
        <h1 className="text-xl md:text-2xl font-semibold">{calendarTitle}</h1>
        {isWeek && <p className="text-sm text-muted-foreground">{weekRange}</p>}
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        <CalendarViewToggle />
        {/* Filters row */}
        <div className="flex gap-2">
          {roles?.includes('COACH') && (
            <Button
              variant={open ? 'default' : 'outline'}
              onClick={handleTemplateLibraryToggle}
              className="hidden md:flex items-center gap-2"
            >
              <BookOpen className="h-4 w-4" />
              {m.template_library()}
            </Button>
          )}
          <Select
            value={coloredBy || ''}
            onValueChange={(c) => {
              if (c === '') {
                setColoredBy(null);
              } else {
                setColoredBy(c as COLORED_BY);
              }
            }}
          >
            <SelectTrigger className="flex-1 md:flex-none">
              <SelectValue placeholder={m.colored_by()} />
            </SelectTrigger>
            <SelectContent>
              {Object.values(COLORED_BY).map((colorProfile) => (
                <SelectItem key={colorProfile} value={colorProfile}>
                  {coloredByLabelMap[colorProfile]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SportSelect
            selected={sportFilter}
            onChange={(sport) => handleChangeSportFilter(sport)}
          />
        </div>
        {/* Navigation buttons */}
        <div className="flex gap-2">
          <Button
            size="icon"
            aria-label={isWeek ? m.calendar_previous_week() : undefined}
            onClick={() => (isWeek ? prevWeek() : prevMonth())}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="default"
            className="px-2 md:px-3 text-xs md:text-sm"
            disabled={showingCurrent}
            onClick={() => (isWeek ? goToCurrentWeek() : goToCurrentMonth())}
          >
            {isWeek ? m.calendar_current_week() : m.calendar_current_month()}
          </Button>
          <Button
            size="icon"
            aria-label={isWeek ? m.calendar_next_week() : undefined}
            onClick={() => (isWeek ? nextWeek() : nextMonth())}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
