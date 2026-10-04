// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportPlanDialog } from './import-plan-dialog';
import {
  TRAINING_PLAN_EXAMPLE_FILE,
  TRAINING_PLAN_EXAMPLE_TEXT,
} from './training-plan-example';

const seoPlan = vi.hoisted(() => ({
  listPlans: vi.fn().mockResolvedValue([]),
  importJson: vi.fn(),
  importPlan: vi.fn(),
}));

vi.mock('@/api/athlete', () => ({
  useGetMyAthleteQuery: () => ({
    data: { athleteId: 7, user: { firstName: 'Ana', lastName: 'Ruiz' } },
  }),
  useGetMyCoachedAthletesQuery: () => ({ data: [] }),
}));
vi.mock('@/api/seo-plan', () => ({
  SeoPlanAPI: seoPlan,
  useGetTemporaryPlan: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'es' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('ImportPlanDialog example', () => {
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
    vi.restoreAllMocks();
  });

  const render = (planToken?: string) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ImportPlanDialog
            open
            onClose={() => undefined}
            planToken={planToken}
          />
        </QueryClientProvider>,
      );
    });
  const dialog = () => document.body.querySelector('[role="dialog"]')!;
  const textarea = () => dialog().querySelector('textarea')!;
  const button = (name: string) =>
    [...dialog().querySelectorAll('button')].find(
      (element) => element.textContent === name,
    )!;
  const type = (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea(), value);
      textarea().dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('loads the example and previews what it would create', async () => {
    await render();
    expect(dialog().textContent).toContain('json_plan_example_title');
    await act(async () => button('json_plan_example_load').click());

    expect(textarea().value).toBe(TRAINING_PLAN_EXAMPLE_TEXT);
    const preview = dialog().querySelector('[aria-label="json_plan_preview"]')!;
    expect(preview.textContent).toContain('Ejemplo · 10K en 3 semanas');
    expect(preview.textContent).toContain('Series 5x1000 m');
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
    // Loading never imports anything.
    expect(seoPlan.importJson).not.toHaveBeenCalled();

    // Loading it again has nothing to lose, so it does not ask.
    const confirm = vi.spyOn(window, 'confirm');
    await act(async () => button('json_plan_example_load').click());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing JSON already in the box', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await render();
    await type('{"plan": {}}');
    await act(async () => button('json_plan_example_load').click());
    expect(confirm).toHaveBeenCalledWith('json_plan_example_replace');
    expect(textarea().value).toBe('{"plan": {}}');

    confirm.mockReturnValue(true);
    await act(async () => button('json_plan_example_load').click());
    expect(textarea().value).toBe(TRAINING_PLAN_EXAMPLE_TEXT);
  });

  it('downloads the example as a JSON file', async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob);
      return 'blob:example';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    await render();
    await act(async () => button('json_plan_example_download').click());

    expect(clicks[0].download).toBe(TRAINING_PLAN_EXAMPLE_FILE);
    expect(clicks[0].href).toBe('blob:example');
    expect(created[0].type).toBe('application/json');
    // jsdom's Blob has no text(); FileReader reads it the old way.
    const content = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(created[0]);
    });
    expect(content).toBe(TRAINING_PLAN_EXAMPLE_TEXT);
    expect(revoke).toHaveBeenCalledWith('blob:example');
  });

  it('explains the format in a collapsed summary', async () => {
    await render();
    const details = dialog().querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelectorAll('li')).toHaveLength(6);
  });

  it('is not offered when importing a shared plan', async () => {
    await render('token-1');
    expect(dialog().textContent).not.toContain('json_plan_example_title');
  });
});
