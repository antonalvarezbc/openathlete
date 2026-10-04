import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { m } from '@/paraglide/messages';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { AiProvider } from '@openathlete/shared';

interface Props {
  id?: string;
  providers: AiProvider[];
  value: string | null;
  onChange: (providerId: string) => void;
}

/** Searchable list of the providers: popular ones first, then all others. */
export function ProviderPicker({ id, providers, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = providers.find((provider) => provider.id === value);
  const featured = providers.filter((provider) => provider.featured);
  const others = providers.filter((provider) => !provider.featured);

  const item = (provider: AiProvider) => (
    <CommandItem
      key={provider.id}
      value={`${provider.name} ${provider.id}`}
      onSelect={() => {
        onChange(provider.id);
        setOpen(false);
      }}
    >
      <Check
        className={
          provider.id === value ? 'size-4 opacity-100' : 'size-4 opacity-0'
        }
      />
      {provider.name}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected?.name ?? m.ai_key_select_provider()}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={m.ai_key_provider_search()} />
          <CommandList>
            <CommandEmpty>{m.ai_key_provider_none()}</CommandEmpty>
            {featured.length > 0 && (
              <CommandGroup heading={m.ai_key_provider_featured()}>
                {featured.map(item)}
              </CommandGroup>
            )}
            <CommandGroup heading={m.ai_key_provider_all()}>
              {others.map(item)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
