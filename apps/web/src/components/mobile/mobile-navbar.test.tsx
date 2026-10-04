// @vitest-environment jsdom
import { SpaceContext } from '@/contexts/space/context/space-context';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileNavbar } from './mobile-navbar';

// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('MobileNavbar', () => {
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

  const labels = async (space: 'COACH' | 'ATHLETE') => {
    await act(async () => {
      root.render(
        <SpaceContext.Provider value={{ space, setSpace: () => undefined }}>
          <MemoryRouter key={space}>
            <MobileNavbar />
          </MemoryRouter>
        </SpaceContext.Provider>,
      );
    });
    return [...container.querySelectorAll('button')].map(
      (button) => button.textContent,
    );
  };

  it('starts the coach space with the dashboard', async () => {
    expect(await labels('COACH')).toEqual([
      'dashboard',
      'coach_planning',
      'profile',
      'messages',
    ]);
    expect(container.querySelector('nav > div')!.className).toContain(
      'grid-cols-4',
    );
  });

  it('keeps the athlete space as it was', async () => {
    expect(await labels('ATHLETE')).toEqual([
      'calendar',
      'profile',
      'messages',
    ]);
    expect(container.querySelector('nav > div')!.className).toContain(
      'grid-cols-3',
    );
  });
});
