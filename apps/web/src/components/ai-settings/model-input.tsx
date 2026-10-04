import { Input } from '@/components/ui/input';
import { useId } from 'react';

import { AiProvider } from '@openathlete/shared';

interface Props {
  id?: string;
  provider: AiProvider | undefined;
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * Model id with suggestions from the provider's known models. Any id is
 * accepted: providers release models faster than the registry updates.
 */
export function ModelInput({
  id,
  provider,
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: Props) {
  const listId = useId();
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? provider?.models[0]?.id ?? 'model-id'}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={listId}>
        {provider?.models.map((model) => (
          <option key={model.id} value={model.id} />
        ))}
      </datalist>
    </>
  );
}
