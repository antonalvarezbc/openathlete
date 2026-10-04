// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SPORT_TYPE } from '@openathlete/shared';

import { WorkoutBuilder } from './workout-builder';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkoutBuilder', () => {
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

  it('shows header actions right next to the structured workout heading', async () => {
    await act(async () => {
      root.render(
        <WorkoutBuilder
          sport={SPORT_TYPE.RUNNING}
          hideMetadataForm
          hideActions
          headerActions={<button data-testid="from-text">AI</button>}
        />,
      );
    });
    const heading = container.querySelector('h3')!;
    const action = container.querySelector('[data-testid="from-text"]');
    expect(action).not.toBeNull();
    expect(heading.nextElementSibling).toBe(action);
  });
});
