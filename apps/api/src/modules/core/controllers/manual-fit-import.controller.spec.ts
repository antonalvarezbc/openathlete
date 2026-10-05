import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { ManualFitImportGuard } from '../guards/manual-fit-import.guard';
import { ManualFitImportService } from '../services/manual-fit-import.service';
import { ManualFitImportController } from './manual-fit-import.controller';

jest.mock('@garmin/fitsdk', () =>
  process.getBuiltinModule('module').createRequire(__filename)(
    '@garmin/fitsdk',
  ),
);

// Exercise the real multipart interceptor and Zod body pipe over local HTTP.
// File decoding/persistence is covered by manual-fit-import.spec.ts.
describe('Manual FIT multipart upload', () => {
  let app: INestApplication;
  let origin: string;
  let roles: string[];
  let enabled: boolean;
  const service = {
    import: jest.fn().mockResolvedValue({ eventId: 90 }),
    importGpx: jest.fn().mockResolvedValue({ eventId: 91 }),
    importTcx: jest.fn().mockResolvedValue({ eventId: 92 }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ManualFitImportController],
      providers: [
        { provide: ManualFitImportService, useValue: service },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ENABLE_MANUAL_FIT_IMPORT' ? enabled : undefined,
          },
        },
        ManualFitImportGuard,
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = { userId: 4, roles };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    roles = ['ATHLETE'];
    enabled = true;
    service.import.mockClear();
    service.importGpx.mockClear();
    service.importTcx.mockClear();
  });
  const form = () => {
    const data = new FormData();
    data.append('file', new Blob(['fixture']), 'test.fit');
    data.append('name', 'My activity');
    return data;
  };
  test('blocks a disabled upload before the multipart interceptor can parse it', async () => {
    enabled = false;
    const response = await fetch(origin + '/activity-import/fit', {
      method: 'POST',
      // This malformed multipart body would fail with 400 if file handling ran.
      headers: { 'Content-Type': 'multipart/form-data; boundary=invalid' },
      body: 'not-a-valid-multipart-upload',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: 'MANUAL_FIT_IMPORT_DISABLED',
    });
    expect(service.import).not.toHaveBeenCalled();
  });
  test('accepts exactly one file and its activity name', async () => {
    const response = await fetch(origin + '/activity-import/fit', {
      method: 'POST',
      body: form(),
    });
    expect(response.status).toBe(201);
    expect(service.import).toHaveBeenCalledWith(
      { userId: 4, roles: ['ATHLETE'] },
      expect.objectContaining({
        originalname: 'test.fit',
        buffer: Buffer.from('fixture'),
      }),
      'My activity',
    );
  });
  test('rejects a supplied athlete ID instead of trusting form ownership', async () => {
    const data = form();
    data.append('athleteId', '999');
    const response = await fetch(origin + '/activity-import/fit', {
      method: 'POST',
      body: data,
    });
    expect(response.status).toBe(400);
    expect(service.import).not.toHaveBeenCalled();
  });
  test('accepts a GPX with an optional sport', async () => {
    const gpx = (sport?: string) => {
      const data = new FormData();
      data.append('file', new Blob(['<gpx/>']), 'run.gpx');
      data.append('name', 'Morning run');
      if (sport) data.append('sport', sport);
      return data;
    };
    let response = await fetch(origin + '/activity-import/gpx', {
      method: 'POST',
      body: gpx('TRAIL_RUNNING'),
    });
    expect(response.status).toBe(201);
    expect(service.importGpx).toHaveBeenCalledWith(
      { userId: 4, roles: ['ATHLETE'] },
      expect.objectContaining({ originalname: 'run.gpx' }),
      'Morning run',
      'TRAIL_RUNNING',
    );
    response = await fetch(origin + '/activity-import/gpx', {
      method: 'POST',
      body: gpx(),
    });
    expect(response.status).toBe(201);
    expect(service.importGpx.mock.calls[1][3]).toBeUndefined();
    response = await fetch(origin + '/activity-import/gpx', {
      method: 'POST',
      body: gpx('QUIDDITCH'),
    });
    expect(response.status).toBe(400);
    expect(service.importGpx).toHaveBeenCalledTimes(2);
  });
  test('blocks GPX uploads too when manual import is disabled', async () => {
    enabled = false;
    const response = await fetch(origin + '/activity-import/gpx', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=invalid' },
      body: 'not-a-valid-multipart-upload',
    });
    expect(response.status).toBe(403);
    expect(service.importGpx).not.toHaveBeenCalled();
  });
  test('blocks TCX uploads too when manual import is disabled', async () => {
    enabled = false;
    const response = await fetch(origin + '/activity-import/tcx', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=invalid' },
      body: 'not-a-valid-multipart-upload',
    });
    expect(response.status).toBe(403);
    expect(service.importTcx).not.toHaveBeenCalled();
  });
  test('rejects coach-only uploads before parsing', async () => {
    roles = ['COACH'];
    const response = await fetch(origin + '/activity-import/fit', {
      method: 'POST',
      body: form(),
    });
    expect(response.status).toBe(403);
    expect(service.import).not.toHaveBeenCalled();
  });
  test('accepts a TCX with an optional sport', async () => {
    const tcx = (sport?: string) => {
      const data = new FormData();
      data.append('file', new Blob(['<TrainingCenterDatabase/>']), 'run.tcx');
      data.append('name', 'Morning run');
      if (sport) data.append('sport', sport);
      return data;
    };
    let response = await fetch(origin + '/activity-import/tcx', {
      method: 'POST',
      body: tcx('HIKING'),
    });
    expect(response.status).toBe(201);
    expect(service.importTcx).toHaveBeenCalledWith(
      { userId: 4, roles: ['ATHLETE'] },
      expect.objectContaining({ originalname: 'run.tcx' }),
      'Morning run',
      'HIKING',
    );
    response = await fetch(origin + '/activity-import/tcx', {
      method: 'POST',
      body: tcx(),
    });
    expect(response.status).toBe(201);
    expect(service.importTcx.mock.calls[1][3]).toBeUndefined();
    response = await fetch(origin + '/activity-import/tcx', {
      method: 'POST',
      body: tcx('QUIDDITCH'),
    });
    expect(response.status).toBe(400);
    expect(service.importTcx).toHaveBeenCalledTimes(2);
  });
});
