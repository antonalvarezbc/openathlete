// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SPORT_TYPE } from '@openathlete/shared';

import { TrainingZoneForm } from './training-zone-form';

// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('TrainingZoneForm', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (sports?: SPORT_TYPE[]) => {
    const onSubmit = vi.fn();
    act(() =>
      root.render(
        <TrainingZoneForm
          defaultValues={{ name: 'Zone 1', ...(sports && { sports }) }}
          onSubmit={onSubmit}
        />,
      ),
    );
    return onSubmit;
  };
  const sports = () =>
    container.querySelector('[role=combobox]')!.textContent?.trim();
  const submit = () =>
    act(async () => container.querySelector('form')!.requestSubmit());

  it('applies a new zone to all sports, without a box per sport', async () => {
    const onSubmit = render();
    expect(sports()).toBe('all_sports');
    expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(0);

    await submit();
    expect(onSubmit.mock.calls[0][0].sports).toEqual(Object.values(SPORT_TYPE));
  });

  it('keeps the specific sports of a zone', async () => {
    const onSubmit = render([SPORT_TYPE.CYCLING]);
    expect(sports()).toBe('cycling');

    await submit();
    expect(onSubmit.mock.calls[0][0].sports).toEqual([SPORT_TYPE.CYCLING]);
  });
});
