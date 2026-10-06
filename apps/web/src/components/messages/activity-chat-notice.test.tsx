// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityChatNotice } from './activity-chat-notice';

const query = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  data: { type: 'ACTIVITY' },
}));
vi.mock('@/api/event', () => ({ useGetEventQuery: () => query }));
vi.mock('../event-details/activity-details', () => ({
  ActivityDetails: () => <div>Activity details</div>,
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('automatic activity notice', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    query.isError = false;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = async (eventId: number | null = 42) =>
    act(async () =>
      root.render(
        <ActivityChatNotice
          notice={{ kind: 'RPE', eventName: 'Evening run', eventId, rpe: 6 }}
        />,
      ),
    );
  it('labels automatic feedback and opens and closes the activity dialog', async () => {
    await render();
    expect(container.textContent).toContain('activity_alert_automatic');
    expect(container.textContent).toContain('RPE 6/10');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    expect(
      document.body.querySelector('[role="dialog"]')?.textContent,
    ).toContain('Activity details');
    const close = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ),
    ].find((b) => b.textContent?.includes('activity_feedback_close'))!;
    await act(async () => close.click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
  it('has no link for deleted activities', async () => {
    await render(null);
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('activity_alert_unavailable');
  });
  it('handles revoked access without showing activity details', async () => {
    query.isError = true;
    await render();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      'activity_alert_unavailable',
    );
    expect(document.body.textContent).not.toContain('Activity details');
  });
});
