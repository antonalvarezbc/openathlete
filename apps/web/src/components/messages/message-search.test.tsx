// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageSearch } from './message-search';

const api = vi.hoisted(() => ({
  data: [
    {
      messageThreadId: 1,
      title: 'First',
      messages: [
        {
          messageId: 11,
          content: 'Recuperación antigua',
          createdAt: '2024-01-01T12:00:00Z',
        },
      ],
    },
    {
      messageThreadId: 2,
      title: 'Second',
      messages: [
        {
          messageId: 22,
          content: 'Recuperación reciente',
          createdAt: '2026-01-01T12:00:00Z',
        },
      ],
    },
  ],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/api/messages', () => ({ useGetUserThreadsQuery: () => api }));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'en' }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('message search dialog', () => {
  let container: HTMLDivElement;
  let root: Root;
  const select = vi.fn();
  beforeEach(() => {
    api.isError = false;
    api.isLoading = false;
    api.refetch.mockClear();
    select.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const button = (text: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(text),
    )!;
  const open = async (id?: number) => {
    await act(async () =>
      root.render(<MessageSearch activeThreadId={id} onSelect={select} />),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button')!.click(),
    );
  };
  const query = async (value: string) => {
    await act(async () => {
      const input = document.body.querySelector<HTMLInputElement>(
        'input[type="search"]',
      )!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  it('defaults to current chat, switches to all chats and selects a result', async () => {
    await open(1);
    await query('RECUPERACION');
    expect(document.body.textContent).toContain('Recuperación antigua');
    expect(document.body.textContent).not.toContain('Recuperación reciente');
    await act(async () => button('messages_search_all').click());
    expect(document.body.textContent).toContain('Recuperación reciente');
    await act(async () => button('Recuperación reciente').click());
    // The result is handed over once the dialog has closed
    await vi.waitFor(() =>
      expect(select).toHaveBeenCalledWith({
        messageThreadId: 2,
        messageId: 22,
      }),
    );
  });
  it('disables current scope without a selected conversation', async () => {
    await open();
    expect(button('messages_search_current').disabled).toBe(true);
    await query('no matches');
    expect(document.body.textContent).toContain('messages_search_empty');
  });
  it('shows loading and retryable errors instead of stale results', async () => {
    api.isLoading = true;
    await open();
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
      'loading',
    );
    api.isLoading = false;
    api.isError = true;
    await act(async () => root.render(<MessageSearch onSelect={select} />));
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => button('messages_search_retry').click());
    expect(api.refetch).toHaveBeenCalledOnce();
  });
});
