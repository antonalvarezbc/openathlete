// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  activityFileKind,
  fileActivityName,
  gpxTrackName,
} from './activity-file';
import { ImportFitDialog } from './import-fit-dialog';

const api = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@/utils/axios', () => ({ default: api }));
vi.mock('@/components/event-details/event-details', () => ({
  EventDetails: () => null,
}));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'es' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GPX = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Export</name></metadata><trk><name>Morning Run</name><trkseg/></trk></gpx>`;

beforeAll(() => {
  // jsdom's Blob has no text(); browsers do.
  Blob.prototype.text ??= function (this: Blob) {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(this);
    });
  };
});

describe('activity files', () => {
  it('accepts FIT and GPX by extension', () => {
    expect(activityFileKind('a.FIT')).toBe('fit');
    expect(activityFileKind('run.gpx')).toBe('gpx');
    expect(activityFileKind('run.tcx')).toBeNull();
    expect(fileActivityName('Rodaje largo.GPX')).toBe('Rodaje largo');
  });

  it('reads the track name, not the export metadata', () => {
    expect(gpxTrackName(GPX)).toBe('Morning Run');
    expect(gpxTrackName('<gpx><trk><trkseg/></trk></gpx>')).toBe('');
    expect(gpxTrackName('not xml <')).toBe('');
  });
});

describe('ImportFitDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    api.post.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ImportFitDialog />
        </QueryClientProvider>,
      );
    });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-import-fit-trigger]')!
        .click(),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const dialog = () => document.body.querySelector('[role="dialog"]')!;
  const choose = (name: string, content = 'x') =>
    act(async () => {
      const input =
        dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File([content], name)],
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  const nameInput = () =>
    dialog().querySelector<HTMLInputElement>('input[name="name"]')!;
  const sportSelect = () =>
    dialog().querySelector<HTMLSelectElement>('select[name="sport"]');
  const submit = () =>
    act(async () => {
      // jsdom cannot fill a required file input, so skip native validation.
      dialog()
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it('accepts GPX files and offers the sport', async () => {
    expect(
      dialog().querySelector('input[type="file"]')!.getAttribute('accept'),
    ).toContain('.gpx');
    await choose('export.gpx', GPX);
    expect(nameInput().value).toBe('Morning Run');
    expect(sportSelect()!.value).toBe('');
    expect(sportSelect()!.options[0].textContent).toBe('gpx_import_sport_auto');
  });

  it('sends a GPX to its endpoint, with the sport only when chosen', async () => {
    api.post.mockResolvedValue({
      data: {
        eventId: 9,
        name: 'Morning Run',
        startDate: '2026-10-03T07:00:00Z',
        alreadyImported: false,
        processingQueued: true,
        warnings: ['GPX_NO_GPS'],
      },
    });
    await choose('export.gpx', GPX);
    await submit();
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/activity-import/gpx');
    expect((body as FormData).get('name')).toBe('Morning Run');
    expect((body as FormData).has('sport')).toBe(false);
    expect(dialog().textContent).toContain('gpx_import_no_gps');
  });

  it('sends the chosen sport', async () => {
    api.post.mockRejectedValue(new Error('stop'));
    await choose('export.gpx', GPX);
    await act(async () => {
      const select = sportSelect()!;
      select.value = 'TRAIL_RUNNING';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await submit();
    const [, body] = api.post.mock.calls[0];
    expect((body as FormData).get('sport')).toBe('TRAIL_RUNNING');
  });

  it('keeps FIT files as before, without the sport choice', async () => {
    api.post.mockRejectedValue(new Error('stop'));
    await choose('ride.fit');
    expect(sportSelect()).toBeNull();
    expect(nameInput().value).toBe('ride');
    await submit();
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/activity-import/fit');
    expect((body as FormData).has('sport')).toBe(false);
  });

  it('explains other files and planned routes', async () => {
    await choose('run.tcx');
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'activity_import_unsupported',
    );
    const { AxiosError } = await import('axios');
    api.post.mockRejectedValue(
      new AxiosError('Bad', '400', undefined, undefined, {
        status: 400,
        data: { message: 'GPX_NO_TIME' },
      } as never),
    );
    await choose('route.gpx', GPX);
    await submit();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'gpx_import_no_time',
    );
    api.post.mockRejectedValue(
      new AxiosError('Bad', '400', undefined, undefined, {
        status: 400,
        data: { message: 'GPX_INVALID' },
      } as never),
    );
    await submit();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'gpx_import_invalid',
    );
  });
});
