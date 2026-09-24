import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uncompressActivityStream } from '../../core/helpers/activity-stream';
import { hasActivityStream, readManualFit } from './manual-garmin-fit';

// Native loading uses the actual installed ESM FIT SDK under Node 22.
jest.mock('@garmin/fitsdk', () => {
  const sdk = process.getBuiltinModule('module').createRequire(__filename)(
    '@garmin/fitsdk',
  );
  // Native ESM runs outside Jest's VM. Normalize Date objects into the test
  // realm so the production parser's instanceof Date checks behave as in Node.
  class Decoder extends sdk.Decoder {
    read(options: unknown) {
      const result = super.read(options);
      for (const messages of Object.values(result.messages ?? {})) {
        if (!Array.isArray(messages)) continue;
        for (const message of messages) {
          for (const [key, value] of Object.entries(message)) {
            if (Object.prototype.toString.call(value) === '[object Date]') {
              message[key] = new Date((value as Date).getTime());
            }
          }
        }
      }
      return result;
    }
  }
  return { ...sdk, Decoder };
});

// Synthetic SDK-encoded running activity: three records, one lap, no athlete data.
const fixtures = {
  complete:
    'DgK6UskAAAAuRklUMpNAAAAAAAQAAQIBAoQCAoQEBIYABP8AAQAArwtFQQAAFAAI/QSGBQSGAgKEAwECBAECBwKEAASFAQSFAQCvC0UAAAAAuAt4UMgAAGXNHYCWmAABAa8LRSwBAAC9C3lRyQBkZc0d5JaYAAECrwtFWAIAAMILelLKAMhlzR1Il5gAQgAAEwAEAgSG/QSGCASGBwSGAgCvC0UCrwtF0AcAANAHAABDAAASAAUCBIb9BIYIBIYHBIYFAQIDAK8LRQKvC0XQBwAA0AcAAAEULg==',
  partial:
    'DgK6UuMAAAAuRklUsPRAAAAAAAQAAQIBAoQCAoQEBIYABP8AAQAArwtFQQAAFAAI/QSGBQSGAgKEAwECBAECBwKEAASFAQSFAQCvC0UAAAAAuAt4UMgAAGXNHYCWmABCAAAUAAf9BIYFBIYCAoQEAQIHAoQABIUBBIUCAa8LRSwBAAC9C1HJAGRlzR3klpgAAQKvC0VYAgAAwgt6UsoAyGXNHUiXmABDAAATAAQCBIb9BIYIBIYHBIYDAK8LRQKvC0XQBwAA0AcAAEQAABIABQIEhv0EhggEhgcEhgUBAgQArwtFAq8LRdAHAADQBwAAAe5k',
};

describe('Manual Garmin FIT reader', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'oa-fit-'));
    await mkdir(join(directory, '.private/fits/123'), { recursive: true });
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  async function put(data: Buffer) {
    await writeFile(join(directory, '.private/fits/123/456.fit'), data);
  }
  it('decodes real FIT records and laps using the existing SDK parser', async () => {
    await put(Buffer.from(fixtures.complete, 'base64'));
    const result = await readManualFit(directory, '123', '456');
    const stream = uncompressActivityStream(result.stream);
    expect(stream.time).toEqual([0, 1, 2]);
    expect(stream.heartrate).toEqual([120, 121, 122]);
    expect(stream.distance).toEqual([0, 3, 6]);
    expect(stream.watts).toEqual([200, 201, 202]);
    expect(stream.latlng).toHaveLength(3);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      segmentType: 'LAP',
      startTimeSeconds: 0,
      endTimeSeconds: 2,
    });
    expect(result.incomplete).toBe(false);
    expect(hasActivityStream(result.stream)).toBe(true);
  });
  it('excludes shortened channels rather than shifting samples to the wrong timestamp', async () => {
    await put(Buffer.from(fixtures.partial, 'base64'));
    const result = await readManualFit(directory, '123', '456');
    const stream = uncompressActivityStream(result.stream);
    expect(result.incomplete).toBe(true);
    expect(stream.heartrate).toBeUndefined();
    expect(stream.watts).toEqual([200, 201, 202]);
  });
  it('rejects invalid CRC and invalid identifiers', async () => {
    const bytes = Buffer.from(fixtures.complete, 'base64');
    bytes[bytes.length - 1] ^= 255;
    await put(bytes);
    await expect(readManualFit(directory, '123', '456')).rejects.toThrow();
    await expect(readManualFit(directory, '../123', '456')).rejects.toThrow(
      'identity',
    );
    await expect(readManualFit(directory, '123', '../456')).rejects.toThrow(
      'identity',
    );
  });
  it('does not treat placeholder JSON as an existing stream', () => {
    for (const value of [null, {}, { time: [] }, { heartrate: [123] }])
      expect(hasActivityStream(value)).toBe(false);
  });
});
