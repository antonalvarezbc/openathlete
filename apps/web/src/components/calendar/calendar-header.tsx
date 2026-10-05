import { useSidebar } from '@/components/ui/sidebar';
import { useAthleteInfo } from '@/hooks/use-athlete-info';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getDateLocale } from '@/utils/locales';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { useState } from 'react';

import { EVENT_TYPE, Event, SPORT_TYPE } from '@openathlete/shared';

import { AiSetupDialog } from '../ai-settings';
import { SportSelect } from '../sport-select/sport-select';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { CalendarDayActions } from './calendar-day-actions';
import { useTemplateLibrarySidebar } from './contexts/template-library-sidebar-context';
import { useCalendarContext } from './hooks/use-calendar-context';
import { COLORED_BY, coloredByLabelMap } from './types/filter';

export function CalendarHeader() {
  const {
    nextMonth,
    prevMonth,
    goToCurrentMonth,
    displayedMonth,
    setFilter,
    coloredBy,
    setColoredBy,
    athleteId,
    allowCreate,
  } = useCalendarContext();
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
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

  const displayedMonthString = displayedMonth.toLocaleString(
    getDateLocale(getLocale()),
    {
      month: 'long',
      year: 'numeric',
    },
  );

  // Today in the current month, otherwise the first day of the month shown
  const now = new Date();
  const planningDay =
    displayedMonth.getMonth() === now.getMonth() &&
    displayedMonth.getFullYear() === now.getFullYear()
      ? now
      : new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);

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
    <div className="flex flex-col md:flex-row md:justify-between gap-4">
      <h1 className="text-xl md:text-2xl font-semibold">{calendarTitle}</h1>
      <div className="flex flex-col md:flex-row gap-2">
        {/* Filters row */}
        <div className="flex gap-2">
          {allowCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-calendar-plan-trigger>
                  <Plus className="size-4" />
                  {m.plan()}
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {planningDay.toLocaleDateString(getDateLocale(getLocale()), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <CalendarDayActions
                  day={planningDay}
                  menu="dropdown"
                  onAiSetupNeeded={() => setAiSetupOpen(true)}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant={open ? 'default' : 'outline'}
            onClick={handleTemplateLibraryToggle}
            className="hidden md:flex items-center gap-2"
          >
            <BookOpen className="h-4 w-4" />
            {m.template_library()}
          </Button>
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
          <Button size="icon" onClick={() => prevMonth()}>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="default"
            className="px-2 md:px-3 text-xs md:text-sm"
            disabled={
              displayedMonth.getMonth() === new Date().getMonth() &&
              displayedMonth.getFullYear() === new Date().getFullYear()
            }
            onClick={() => goToCurrentMonth()}
          >
            {m.calendar_current_month()}
          </Button>
          <Button onClick={() => nextMonth()} size="icon">
            <ChevronRight />
          </Button>
        </div>
      </div>
      <AiSetupDialog
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        analyticsSource="calendar_header"
      />
    </div>
  );
}
