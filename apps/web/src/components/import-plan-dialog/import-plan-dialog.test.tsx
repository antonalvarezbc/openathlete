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
  const race = (eventId: number, name: string, day: string) => ({
    priority: 'PREPARATORY',
    competition: {
      event: {
        eventId,
        name,
        startDate: `${day}T08:00:00Z`,
        endDate: `${day}T10:00:00Z`,
      },
    },
  });
  const select = (label: string, value: string, kind = 'select') =>
    act(async () => {
      const element = dialog().querySelector<
        HTMLSelectElement | HTMLInputElement
      >(`${kind}[aria-label="${label}"]`)!;
      Object.getOwnPropertyDescriptor(
        kind === 'select'
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype,
        'value',
      )!.set!.call(element, value);
      element.dispatchEvent(
        new Event(kind === 'select' ? 'change' : 'input', { bubbles: true }),
      );
    });
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

  it('says which races of the replaced plan are kept or unlinked', async () => {
    seoPlan.listPlans.mockResolvedValue([
      {
        trainingPlanId: 3,
        name: 'Old plan',
        startDate: '2030-10-07T00:00:00Z',
        endDate: '2030-12-01T00:00:00Z',
        races: [
          // Inside the new plan's three weeks from 2030-10-21
          race(1, 'Spring 10K', '2030-11-08'),
          race(2, 'Autumn half', '2030-12-07'),
        ],
      },
    ]);
    await render();
    await act(async () => button('json_plan_example_load').click());
    await select('training_plan_start_date', '2030-10-21', 'input');
    await select('athlete', '7');
    for (
      let tries = 0;
      tries < 100 && !dialog().querySelector('option[value="3"]');
      tries++
    )
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    await select('json_plan_destination', '3');

    const status = dialog().querySelector('[role="status"]')!;
    expect(status.textContent).toContain('json_plan_replace_warning');
    expect(status.textContent).toContain('json_plan_races_kept');
    // Only the race after the new plan's end is unlinked.
    expect(
      [...status.querySelectorAll('p')].filter(
        (item) => item.textContent === 'json_plan_race_unlinked',
      ),
    ).toHaveLength(1);
    seoPlan.listPlans.mockResolvedValue([]);
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
