// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AiMemorySettings } from './ai-memory-settings';

const state = vi.hoisted(() => ({
  edit: vi.fn(),
  memory: {
    mode: 'COMPACT',
    summary: 'Original summary',
    summaryUpdatedAt: null,
    notes: [
      {
        id: 11,
        source: 'COACH_ASSISTANT',
        content: 'Old note',
        createdAt: '2026-10-05T10:00:00Z',
      },
    ],
  },
}));
vi.mock('@/api/ai-memory/ai-memory.hooks', () => ({
  useAiMemoryQuery: () => ({ data: state.memory, isLoading: false }),
  useEditAiMemoryMutation: () => ({ mutate: state.edit, isPending: false }),
  useUpdateAiMemoryModeMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useClearAiMemoryMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_t, key) => () => String(key) }),
}));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => false }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  state.edit.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<AiMemorySettings athleteId={7} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function input(id: string, value: string) {
  const field = document.getElementById(id) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('opens the stored text and cancels edits without saving', async () => {
  await click('ai_memory_edit');
  expect(
    (document.getElementById('ai-memory-summary') as HTMLTextAreaElement).value,
  ).toBe('Original summary');
  await input('ai-memory-summary', 'Unsaved');
  await click('cancel');
  expect(state.edit).not.toHaveBeenCalled();
  await click('ai_memory_edit');
  expect(
    (document.getElementById('ai-memory-summary') as HTMLTextAreaElement).value,
  ).toBe('Original summary');
});
it('sends edits and empty-note removal with the original revision, then closes on success', async () => {
  await click('ai_memory_edit');
  await input('ai-memory-summary', 'Corrected summary');
  await input('ai-memory-note-11', '');
  await click('save');
  expect(state.edit.mock.calls[0][0]).toEqual({
    summary: 'Corrected summary',
    summaryUpdatedAt: null,
    notes: [{ id: 11, originalContent: 'Old note', content: '' }],
  });
  await act(async () => state.edit.mock.calls[0][1].onSuccess());
  expect(document.getElementById('ai-memory-summary')).toBeNull();
});
it('preserves the edited text after a failed save', async () => {
  await click('ai_memory_edit');
  await input('ai-memory-summary', 'Keep this correction');
  await click('save');
  await act(async () =>
    state.edit.mock.calls[0][1].onError(new Error('offline')),
  );
  expect(
    (document.getElementById('ai-memory-summary') as HTMLTextAreaElement).value,
  ).toBe('Keep this correction');
});
