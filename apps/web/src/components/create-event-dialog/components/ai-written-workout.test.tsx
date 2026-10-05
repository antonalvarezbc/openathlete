// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { type ReactNode, act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiErrorCode,
  type CreateEventDto,
  EVENT_TYPE,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
} from '@openathlete/shared';

import { AIGenerateEventDialog } from '../../ai-generate-event-dialog/ai-generate-event.dialog';
import { AIModifyEventDialog } from './ai-modify-event-dialog';
import { AiWorkoutStructure } from './ai-workout-structure';

const api = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@/utils/axios', () => ({
  default: api,
  // routes.group.name -> "group.name"
  routes: new Proxy(
    {},
    {
      get: (_routes, group) =>
        new Proxy(
          {},
          { get: (_group, name) => `${String(group)}.${String(name)}` },
        ),
    },
  ),
}));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STRUCTURE = 'aiFeatures.workoutStructure';
const TEXT =
  "15' calentar + 3x8' a RPE 6-7, aprox. 4:35-4:40/km, recuperación 3' trote muy suave + enfriar";
const steps = [
  {
    stepType: WORKOUT_STEP_TYPE.WARMUP,
    durationType: WORKOUT_DURATION_TYPE.TIME,
    durationValue: 900,
    targets: [],
  },
];

describe('converting a written workout with AI', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    api.post.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (node: ReactNode) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          {node}
        </QueryClientProvider>,
      );
    });
  const dialog = () => document.body.querySelector('[role="dialog"]')!;
  const button = (name: string) =>
    [...document.body.querySelectorAll('button')].find(
      (element) => element.textContent === name,
    )!;
  const click = (element: Element) =>
    act(async () => (element as HTMLElement).click());
  const type = (value: string) =>
    act(async () => {
      const textarea = dialog().querySelector('textarea')!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea, value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

  describe('"From text" next to the structured workout heading', () => {
    const mount = async (
      props: { athleteId?: number; hasAccess?: boolean } = {},
    ) => {
      const onSteps = vi.fn();
      const onPaywall = vi.fn();
      await render(
        <AiWorkoutStructure
          athleteId={props.athleteId}
          session={() => ({
            sport: SPORT_TYPE.RUNNING,
            name: 'Series',
            description: TEXT,
          })}
          hasSteps={false}
          hasAccess={props.hasAccess ?? true}
          onPaywall={onPaywall}
          onSteps={onSteps}
        />,
      );
      return { onSteps, onPaywall };
    };

    it('starts from the description and converts it, also for templates', async () => {
      api.post.mockResolvedValue({ data: { steps } });
      const { onSteps } = await mount();
      await click(button('ai_structure_button'));
      expect(dialog().querySelector('textarea')!.value).toBe(TEXT);

      await click(button('ai_structure_generate'));
      await vi.waitFor(() => expect(onSteps).toHaveBeenCalledWith(steps));
      expect(api.post).toHaveBeenCalledWith(STRUCTURE, {
        // A template has no athlete.
        athleteId: undefined,
        sport: 'RUNNING',
        name: 'Series',
        description: TEXT,
        instructions: TEXT,
      });
    });

    it('points to Settings > AI when no AI is set up for written workouts', async () => {
      api.post.mockRejectedValue(
        new AxiosError('Forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 403,
          statusText: '',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: { code: AiErrorCode.NOT_CONFIGURED },
        }),
      );
      const { onSteps } = await mount();
      await click(button('ai_structure_button'));
      await click(button('ai_structure_generate'));
      await vi.waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('ai_error_not_configured'),
      );
      expect(onSteps).not.toHaveBeenCalled();
    });

    it('opens the paywall without AI access', async () => {
      const { onPaywall } = await mount({ athleteId: 7, hasAccess: false });
      await click(button('ai_structure_button'));
      expect(onPaywall).toHaveBeenCalled();
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('"Modify with AI" can replace only the steps, keeping the session', async () => {
    api.post.mockResolvedValue({ data: { steps } });
    const onEventModified = vi.fn();
    const eventData = {
      type: EVENT_TYPE.TRAINING,
      name: 'Tempo',
      description: 'Old',
      sport: SPORT_TYPE.CYCLING,
      goalDuration: 3600,
      startDate: new Date(2026, 9, 6, 8),
      endDate: new Date(2026, 9, 6, 9),
    } as CreateEventDto;
    await render(
      <AIModifyEventDialog
        open
        onClose={vi.fn()}
        eventData={eventData}
        athleteId={7}
        isCreateMode={false}
        onEventModified={onEventModified}
      />,
    );
    await type(TEXT);
    await click(button('ai_convert_as_written'));
    await vi.waitFor(() =>
      expect(onEventModified).toHaveBeenCalledWith({
        ...eventData,
        workout: { steps },
      }),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(STRUCTURE, {
      athleteId: 7,
      sport: 'CYCLING',
      instructions: TEXT,
    });
  });

  it('"Create with AI" can build a session from the text as written', async () => {
    api.post.mockResolvedValue({
      data: { steps, name: '3x8 umbral', sport: 'TRAIL_RUNNING' },
    });
    const onEventGenerated = vi.fn();
    await render(
      <AIGenerateEventDialog
        open
        onClose={vi.fn()}
        date={new Date(2026, 9, 6)}
        athleteId={7}
        onEventGenerated={onEventGenerated}
      />,
    );
    await type(TEXT);
    await click(button('ai_convert_as_written'));
    await vi.waitFor(() =>
      expect(onEventGenerated).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '3x8 umbral',
          sport: 'TRAIL_RUNNING',
          description: TEXT,
          goalDuration: 900,
          athleteId: 7,
          workout: { steps },
        }),
      ),
    );
    // Only the small converter: no sport sent, no full generation.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(STRUCTURE, {
      athleteId: 7,
      instructions: TEXT,
    });
  });

  it('does not convert an empty text', async () => {
    await render(
      <AIGenerateEventDialog
        open
        onClose={vi.fn()}
        date={new Date(2026, 9, 6)}
        onEventGenerated={vi.fn()}
      />,
    );
    await click(button('ai_convert_as_written'));
    expect(api.post).not.toHaveBeenCalled();
  });
});
