import { m } from '@/paraglide/messages';
import { sportTypeLabelMap } from '@/utils/label-map/core';
import { cn } from '@/utils/shadcn';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { SPORT_TYPE } from '@openathlete/shared';

import { SportIcon } from '../sport-icon/sport-icon';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface P {
  selected: SPORT_TYPE | null;
  onChange: (sport: SPORT_TYPE | null) => void;
  /** Sports to offer, all of them by default */
  sports?: SPORT_TYPE[];
  /** Whether "All sports" is offered */
  allowAll?: boolean;
}

const ALL_SPORTS = Object.values(SPORT_TYPE);

export function SportSelect({
  selected,
  onChange,
  sports = ALL_SPORTS,
  allowAll = true,
}: P) {
  const [open, setOpen] = useState(false);
  const allSportsLabel = m.all_sports();

  const handleSelect = (sport: SPORT_TYPE | null) => {
    onChange(sport);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-fit min-w-[10rem] justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <SportIcon sport={selected} />}
            <span className="truncate">
              {selected ? sportTypeLabelMap[selected] : allSportsLabel}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Command>
          <CommandInput autoFocus placeholder={m.search_sports()} />
          <CommandList>
            <CommandEmpty>{m.no_sport_found()}</CommandEmpty>
            {allowAll && (
              <CommandGroup>
                <CommandItem
                  value="all-sports"
                  keywords={[allSportsLabel]}
                  onSelect={() => handleSelect(null)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected === null ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {allSportsLabel}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {sports.map((sportType) => (
                <CommandItem
                  key={sportType}
                  value={sportType}
                  keywords={[sportTypeLabelMap[sportType]]}
                  onSelect={() => handleSelect(sportType)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected === sportType ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <SportIcon sport={sportType} />
                  {sportTypeLabelMap[sportType]}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
