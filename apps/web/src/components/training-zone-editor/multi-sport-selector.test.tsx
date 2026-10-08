// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SPORT_TYPE } from '@openathlete/shared';

import { MultiSportSelector } from './multi-sport-selector';

// Every message renders as its key, followed by its parameters.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, key) => (params?: Record<string, string>) =>
        [String(key), ...Object.values(params ?? {})].join(' '),
    },
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ALL = Object.values(SPORT_TYPE);

describe('MultiSportSelector', () => {
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

  const render = (value: SPORT_TYPE[], onChange = vi.fn()) =>
    act(() =>
      root.render(<MultiSportSelector value={value} onChange={onChange} />),
    );
  const trigger = () =>
    container.querySelector('[role=combobox]')!.textContent?.trim();
  const badges = () =>
    [...container.querySelectorAll('[data-slot=badge]')].map((badge) =>
      badge.textContent?.trim(),
    );

  it('shows "All sports" once for a zone with every sport', async () => {
    await render([...ALL].reverse());
    expect(trigger()).toBe('all_sports');
    expect(badges()).toEqual(['all_sports']);
  });

  it('names only the missing sport when a zone has all but one', async () => {
    await render(ALL.filter((sport) => sport !== SPORT_TYPE.MOBILITY));
    expect(trigger()).toBe('all_sports_except sport_mobility');
    expect(badges()).toEqual([]);
  });

  it('lists a specific selection and lets each sport be removed', async () => {
    const onChange = vi.fn();
    await render([SPORT_TYPE.RUNNING, SPORT_TYPE.TRAIL_RUNNING], onChange);
    expect(trigger()).toBe('sport_running, sport_trail_running');
    expect(badges()).toEqual(['sport_running', 'sport_trail_running']);

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-slot=badge] button')!
        .click(),
    );
    expect(onChange).toHaveBeenCalledWith([SPORT_TYPE.TRAIL_RUNNING]);
  });

  it('asks to select sports when there are none', async () => {
    await render([]);
    expect(trigger()).toBe('select_sports');
    expect(badges()).toEqual([]);
  });
});
