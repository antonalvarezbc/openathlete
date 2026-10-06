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

import { MAX_ACTIVITY_FILE_BYTES } from '@openathlete/shared';

import {
  activityFileKind,
  fileActivityName,
  gpxTrackName,
  tcxActivityName,
} from './activity-file';
import { ImportFitDialog } from './import-fit-dialog';

const api = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@/utils/axios', () => ({
  default: api,
  routes: {
    activityImport: {
      fit: '/activity-import/fit',
      gpx: '/activity-import/gpx',
      tcx: '/activity-import/tcx',
    },
  },
}));
vi.mock('@/components/event-details/event-details', () => ({
  EventDetails: ({ eventId }: { eventId: number }) => (
    <p data-event-details>{eventId}</p>
  ),
}));
// Every message renders as its key, followed by its parameters.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, key) => (params?: Record<string, unknown>) =>
        params ? `${String(key)} ${JSON.stringify(params)}` : String(key),
    },
  ),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'en' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TCX = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Other"><Id>2026-10-03T07:00:00Z</Id><Lap StartTime="2026-10-03T07:00:00Z"/><Notes>Hill repeats</Notes></Activity></Activities></TrainingCenterDatabase>`;
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
  it('accepts FIT, GPX and TCX by extension', () => {
    expect(activityFileKind('a.FIT')).toBe('fit');
    expect(activityFileKind('run.gpx')).toBe('gpx');
    expect(activityFileKind('run.TCX')).toBe('tcx');
    expect(activityFileKind('run.kml')).toBeNull();
    expect(fileActivityName('Rodaje largo.GPX')).toBe('Rodaje largo');
    expect(fileActivityName('Tirada.tcx')).toBe('Tirada');
  });

  it('reads the notes of a TCX activity', () => {
    expect(tcxActivityName(TCX)).toBe('Hill repeats');
    expect(
      tcxActivityName(
        '<TrainingCenterDatabase><Activities><Activity/></Activities></TrainingCenterDatabase>',
      ),
    ).toBe('');
    expect(tcxActivityName('not xml <')).toBe('');
  });

  it('reads the track name, not the export metadata', () => {
    expect(gpxTrackName(GPX)).toBe('Morning Run');
    expect(gpxTrackName('<gpx><trk><trkseg/></trk></gpx>')).toBe('');
    expect(gpxTrackName('not xml <')).toBe('');
  });
});

const imported = (eventId: number, name: string, extra = {}) => ({
  data: {
    eventId,
    name,
    startDate: '2026-10-03T07:00:00Z',
    alreadyImported: false,
    processingQueued: true,
    warnings: [],
    ...extra,
  },
});
const failure = (status: number, message: string) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status, data: { message } },
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
  // Files are read and sent asynchronously.
  const waitFor = async (check: () => boolean) => {
    for (let tries = 0; tries < 200 && !check(); tries++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  };
  const choose = (...files: File[]) =>
    act(async () => {
      const input =
        dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: files,
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const fit = (name: string, size = 10) =>
    new File([new Uint8Array(size)], name);
  const gpx = (name: string) => new File([GPX], name);
  const tcx = (name: string) => new File([TCX], name);
  const sportSelect = () =>
    dialog().querySelector<HTMLSelectElement>('select[name="sport"]');
  const nameInput = () =>
    dialog().querySelector<HTMLInputElement>('input[name="name"]');
  const submit = async () => {
    await act(async () => {
      // jsdom cannot fill a required file input, so skip native validation.
      dialog()
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    });
    await waitFor(() => !!dialog().querySelector('[data-import-result]'));
  };
  const sent = (call: number) => {
    const [url, body] = api.post.mock.calls[call] as [string, FormData];
    return {
      url,
      file: body.get('file') as File,
      name: body.get('name'),
      sport: body.get('sport'),
    };
  };

  it('imports one file under the name the athlete gives it', async () => {
    api.post.mockResolvedValue(
      imported(9, 'Long run', { warnings: ['FIT_UNKNOWN_SPORT'] }),
    );
    await choose(fit('Long run.FIT'));
    expect(nameInput()!.value).toBe('Long run');
    await act(async () => {
      const input = nameInput()!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'Sunday long run');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submit();

    expect(sent(0)).toMatchObject({
      url: '/activity-import/fit',
      name: 'Sunday long run',
    });
    expect(sent(0).file.name).toBe('Long run.FIT');
    const result = dialog().querySelector('[data-import-result="ok"]')!;
    expect(result.textContent).toContain('fit_import_success');
    expect(result.textContent).toContain('fit_import_unknown_sport');

    const view = [...result.querySelectorAll('button')].find(
      (button) => button.textContent === 'fit_import_view',
    )!;
    await act(async () => view.click());
    expect(dialog().querySelector('[data-event-details]')!.textContent).toBe(
      '9',
    );
  });

  it('imports several files one by one, named after each file', async () => {
    api.post
      .mockResolvedValueOnce(imported(1, 'Monday'))
      .mockRejectedValueOnce(failure(409, 'FIT_DUPLICATE_TIME'))
      .mockResolvedValueOnce(
        imported(3, 'Wednesday', { alreadyImported: true }),
      );
    await choose(fit('Monday.fit'), fit('Tuesday.fit'), fit('Wednesday.fit'));
    // No single name to edit: each activity takes its file name.
    expect(nameInput()).toBeNull();
    expect(dialog().textContent).toContain('fit_import_files {"count":3}');
    await submit();

    expect(api.post).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((call) => sent(call).name)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
    ]);
    // One failure does not stop the others.
    expect(dialog().textContent).toContain(
      'fit_import_summary {"imported":1,"already":1,"failed":1}',
    );
    const failed = dialog().querySelector('[data-import-result="error"]')!;
    expect(failed.textContent).toContain('Tuesday.fit');
    expect(failed.textContent).toContain('fit_import_duplicate_time');
  });

  it('leaves out files that are not FIT, GPX or TCX or are too large', async () => {
    await choose(
      fit('ride.fit'),
      fit('route.kml'),
      fit('huge.fit', MAX_ACTIVITY_FILE_BYTES + 1),
    );
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'fit_import_skipped {"files":"route.kml, huge.fit"}',
    );
    // The valid file stays selected.
    expect(nameInput()!.value).toBe('ride');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('suggests the GPX track name and sends the chosen sport', async () => {
    api.post.mockResolvedValue(
      imported(9, 'Morning Run', { warnings: ['GPX_NO_GPS'] }),
    );
    await choose(gpx('export.gpx'));
    await waitFor(() => nameInput()!.value !== 'export');
    expect(nameInput()!.value).toBe('Morning Run');
    expect(sportSelect()!.value).toBe('');
    expect(sportSelect()!.options[0].textContent).toBe('gpx_import_sport_auto');
    await act(async () => {
      const select = sportSelect()!;
      select.value = 'TRAIL_RUNNING';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await submit();

    expect(sent(0)).toMatchObject({
      url: '/activity-import/gpx',
      name: 'Morning Run',
      sport: 'TRAIL_RUNNING',
    });
    expect(dialog().textContent).toContain('gpx_import_no_gps');
  });

  it('sends FIT and GPX files to their endpoints, the sport only with GPX', async () => {
    api.post
      .mockResolvedValueOnce(imported(1, 'ride'))
      .mockResolvedValueOnce(imported(2, 'Morning Run'))
      .mockResolvedValueOnce(imported(3, 'walk'));
    await choose(fit('ride.fit'), gpx('1234567890.gpx'), fit('walk.gpx', 0));
    // The empty GPX is left out; the sport choice appears for the other one.
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'fit_import_skipped {"files":"walk.gpx"}',
    );
    expect(sportSelect()).not.toBeNull();
    await submit();

    expect(api.post).toHaveBeenCalledTimes(2);
    expect(sent(0)).toMatchObject({
      url: '/activity-import/fit',
      name: 'ride',
      sport: null,
    });
    // In a batch a GPX is named after its track, not its numbered file.
    expect(sent(1)).toMatchObject({
      url: '/activity-import/gpx',
      name: 'Morning Run',
      sport: null,
    });
  });

  it('keeps the name of a file chosen while a GPX is being read', async () => {
    let finishRead!: () => void;
    const read = vi
      .spyOn(Blob.prototype, 'text')
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishRead = () => resolve(GPX))),
      );
    await choose(gpx('export.gpx'));
    await choose(fit('ride.fit'));
    await act(async () => finishRead());
    expect(nameInput()!.value).toBe('ride');
    read.mockRestore();
  });

  it('offers no sport for FIT files', async () => {
    await choose(fit('ride.fit'));
    expect(sportSelect()).toBeNull();
  });

  it('explains GPX files the API refuses', async () => {
    api.post
      .mockRejectedValueOnce(failure(400, 'GPX_NO_TIME'))
      .mockRejectedValueOnce(failure(400, 'GPX_INVALID'));
    await choose(gpx('route.gpx'), gpx('broken.gpx'));
    await submit();
    const errors = [
      ...dialog().querySelectorAll('[data-import-result="error"]'),
    ].map((item) => item.textContent);
    expect(errors[0]).toContain('gpx_import_no_time');
    expect(errors[1]).toContain('gpx_import_invalid');
  });

  it('suggests the TCX notes and sends the chosen sport to its endpoint', async () => {
    api.post.mockResolvedValue(
      imported(9, 'Hill repeats', { warnings: ['TCX_NO_GPS'] }),
    );
    await choose(tcx('activity_123.tcx'));
    await waitFor(() => nameInput()!.value !== 'activity_123');
    expect(nameInput()!.value).toBe('Hill repeats');
    // TCX only names running and biking: the sport can be chosen
    expect(sportSelect()).not.toBeNull();
    await act(async () => {
      const select = sportSelect()!;
      select.value = 'HIKING';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await submit();

    expect(sent(0)).toMatchObject({
      url: '/activity-import/tcx',
      name: 'Hill repeats',
      sport: 'HIKING',
    });
    expect(dialog().textContent).toContain('tcx_import_no_gps');
  });

  it('sends a batch of FIT and TCX files to their endpoints', async () => {
    api.post
      .mockResolvedValueOnce(imported(1, 'ride'))
      .mockResolvedValueOnce(imported(2, 'Hill repeats'));
    await choose(fit('ride.fit'), tcx('activity_123.tcx'));
    await submit();
    expect(sent(0)).toMatchObject({ url: '/activity-import/fit', sport: null });
    // In a batch a TCX is named after its notes
    expect(sent(1)).toMatchObject({
      url: '/activity-import/tcx',
      name: 'Hill repeats',
      sport: null,
    });
  });

  it('explains TCX files the API refuses', async () => {
    api.post
      .mockRejectedValueOnce(failure(400, 'TCX_NO_TIME'))
      .mockRejectedValueOnce(failure(400, 'TCX_MULTISPORT_UNSUPPORTED'))
      .mockRejectedValueOnce(failure(400, 'TCX_INVALID'));
    await choose(tcx('course.tcx'), tcx('triathlon.tcx'), tcx('broken.tcx'));
    await submit();
    const errors = [
      ...dialog().querySelectorAll('[data-import-result="error"]'),
    ].map((item) => item.textContent);
    expect(errors[0]).toContain('tcx_import_no_time');
    expect(errors[1]).toContain('fit_import_multisport');
    expect(errors[2]).toContain('tcx_import_invalid');
  });

  it('explains files the API refuses', async () => {
    api.post.mockRejectedValue(failure(400, 'FIT_NOT_ACTIVITY'));
    await choose(fit('workout.fit'));
    await submit();
    expect(
      dialog().querySelector('[data-import-result="error"]')!.textContent,
    ).toContain('fit_import_invalid');
  });
});
