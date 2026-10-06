import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BulkWorkoutSelectButton } from './bulk-workout-select-button';
import { BulkWorkoutSelectionContext } from './contexts/bulk-workout-selection-context';

// The last props given to the real Button, to exercise its click handler.
const captured = vi.hoisted(() => ({
  props: null as { onClick?: () => void } | null,
}));

vi.mock('@/paraglide/messages', () => ({
  m: { bulk_workouts_select: () => 'Select workouts' },
}));

vi.mock('../ui/button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/button')>();
  return {
    ...actual,
    Button: (props: ComponentProps<typeof actual.Button>) => {
      captured.props = props as { onClick?: () => void };
      return createElement(actual.Button, props);
    },
  };
});

type Selection = NonNullable<
  ComponentProps<typeof BulkWorkoutSelectionContext.Provider>['value']
>;

const selection = (overrides: Partial<Selection> = {}): Selection => ({
  available: true,
  selecting: false,
  busy: false,
  selected: new Set(),
  eligible: new Set([1]),
  toggle: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  ...overrides,
});

const render = (
  value: Selection | null,
  props: ComponentProps<typeof BulkWorkoutSelectButton> = {},
) =>
  renderToStaticMarkup(
    <BulkWorkoutSelectionContext.Provider value={value}>
      <BulkWorkoutSelectButton {...props} />
    </BulkWorkoutSelectionContext.Provider>,
  );

describe('BulkWorkoutSelectButton', () => {
  beforeEach(() => {
    captured.props = null;
  });

  it('renders nothing where bulk selection is not available', () => {
    expect(render(null)).toBe('');
    expect(render(selection({ available: false }))).toBe('');
  });

  it('starts selecting when idle', () => {
    const value = selection();
    const html = render(value);
    expect(html).toContain('Select workouts');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('disabled=""');

    captured.props?.onClick?.();
    expect(value.start).toHaveBeenCalledTimes(1);
    expect(value.cancel).not.toHaveBeenCalled();
  });

  it('is disabled when there is nothing to select', () => {
    expect(render(selection({ eligible: new Set() }))).toContain('disabled=""');
  });

  it('stays pressed while selecting and leaves selection mode', () => {
    // Still usable when the last eligible workout disappears mid-selection.
    const value = selection({ selecting: true, eligible: new Set() });
    const html = render(value);
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('disabled=""');

    captured.props?.onClick?.();
    expect(value.cancel).toHaveBeenCalledTimes(1);
    expect(value.start).not.toHaveBeenCalled();
  });

  it('is disabled while a deletion is running', () => {
    expect(render(selection({ selecting: true, busy: true }))).toContain(
      'disabled=""',
    );
  });

  it('keeps an accessible name when the label is hidden on mobile', () => {
    const html = render(selection(), { iconOnlyOnMobile: true });
    expect(html).toContain('aria-label="Select workouts"');
    expect(html).toContain('hidden md:inline');
    expect(render(selection())).not.toContain('hidden md:inline');
  });
});
