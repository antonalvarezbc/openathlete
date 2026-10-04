import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uncompressActivityStream } from '../../core/helpers/activity-stream';
import { FitParserStrategy } from '../../core/helpers/strategies/fit-parser.strategy';
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
    jest.restoreAllMocks();
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
  it('keeps GPS gaps and their timestamps when reading a cached Garmin FIT', async () => {
    const sdk = process.getBuiltinModule('module').createRequire(__filename)(
      '@garmin/fitsdk',
    );
    const encoder = new sdk.Encoder();
    const start = 1000000000;
    encoder.onMesg(0, {
      type: 'activity',
      manufacturer: 'development',
      product: 1,
      timeCreated: start,
    });
    for (let i = 0; i < 4; i++)
      encoder.onMesg(20, {
        timestamp: start + i,
        heartRate: 100 + i,
        distance: i * 3,
        ...(i === 0 || i === 2
          ? {}
          : {
              positionLat: 1000000 + i * 100,
              positionLong: 2000000 + i * 100,
            }),
      });
    encoder.onMesg(18, {
      startTime: start,
      timestamp: start + 3,
      totalTimerTime: 3,
      totalElapsedTime: 3,
      sport: 'running',
    });
    await put(Buffer.from(encoder.close()));
    const result = await readManualFit(directory, '123', '456');
    const stream = uncompressActivityStream(result.stream);
    expect(stream.time).toEqual([0, 1, 2, 3]);
    expect(stream.latlng?.map((p) => p.length)).toEqual([0, 2, 0, 2]);
    expect(stream.heartrate).toEqual([100, 101, 102, 103]);
  });
  function encode(
    records: Array<Record<string, unknown>>,
    sessions: Array<Record<string, unknown>> = [{}],
  ) {
    const sdk = process.getBuiltinModule('module').createRequire(__filename)(
      '@garmin/fitsdk',
    );
    const encoder = new sdk.Encoder();
    const start = 1000000000;
    encoder.onMesg(0, {
      type: 'activity',
      manufacturer: 'development',
      product: 1,
      timeCreated: start,
    });
    records.forEach((record, i) => {
      encoder.onMesg(20, { timestamp: start + i, ...record });
    });
    sessions.forEach((session) => {
      encoder.onMesg(18, {
        startTime: start,
        timestamp: start + records.length - 1,
        totalTimerTime: records.length - 1,
        totalElapsedTime: records.length - 1,
        sport: 'running',
        ...session,
      });
    });
    return Buffer.from(encoder.close());
  }
  it('retains FIT session summaries and recorded temperature', async () => {
    await put(
      encode(
        [
          { heartRate: 100, cadence: 80, power: 100, temperature: -2 },
          { heartRate: 120, cadence: 82, power: 200, temperature: 0 },
          { heartRate: 140, cadence: 84, power: 300, temperature: 5 },
        ],
        [
          {
            avgHeartRate: 123,
            maxHeartRate: 155,
            avgCadence: 83,
            avgPower: 210,
            maxPower: 330,
            normalizedPower: 230,
            totalWork: 420000,
          },
        ],
      ),
    );
    const result = await readManualFit(directory, '123', '456');
    expect(result.summary).toEqual({
      averageHeartrate: 123,
      maxHeartrate: 155,
      averageCadence: 83,
      averageWatts: 210,
      maxWatts: 330,
      weightedAverageWatts: 230,
      kilojoules: 420,
    });
    expect(uncompressActivityStream(result.stream).temp).toEqual([-2, 0, 5]);
  });
  it('uses aligned sensor records for missing averages without inventing normalized power or work', async () => {
    await put(
      encode([
        { heartRate: 100, cadence: 80, power: 100, temperature: 10 },
        { heartRate: 120, cadence: 82, power: 200 },
        { heartRate: 140, cadence: 84, power: 300, temperature: 12 },
      ]),
    );
    const result = await readManualFit(directory, '123', '456');
    expect(result.summary).toEqual({
      averageHeartrate: 120,
      maxHeartrate: 140,
      averageCadence: 82,
      averageWatts: 200,
      maxWatts: 300,
      weightedAverageWatts: null,
      kilojoules: null,
    });
    // The FIT parser itself leaves out a partial temperature series.
    expect(result.incomplete).toBe(false);
    expect(uncompressActivityStream(result.stream).temp).toBeUndefined();
  });
  it('leaves missing sensors unknown and preserves explicit zero values', async () => {
    await put(encode([{}, {}], [{ avgPower: 0, maxPower: 0, totalWork: 0 }]));
    const result = await readManualFit(directory, '123', '456');
    expect(result.summary).toEqual({
      averageHeartrate: null,
      maxHeartrate: null,
      averageCadence: null,
      averageWatts: 0,
      maxWatts: 0,
      weightedAverageWatts: null,
      kilojoules: 0,
    });
    expect(uncompressActivityStream(result.stream).temp).toBeUndefined();
  });
  it.each([
    [[{ avgPower: 100 }, { avgPower: 200 }]],
    [[]],
    [[{ sport: 'multisport', avgPower: 100 }]],
  ])(
    'does not attribute an ambiguous session summary to the activity (%j)',
    async (sessions) => {
      await put(encode([{ power: 100 }, { power: 200 }], sessions));
      const result = await readManualFit(directory, '123', '456');
      expect(
        Object.values(result.summary).every((value) => value === null),
      ).toBe(true);
    },
  );
  it('rejects non-finite, negative and nonnumeric summary values without using incomplete sensors', async () => {
    await put(Buffer.from(fixtures.complete, 'base64'));
    jest.spyOn(FitParserStrategy.prototype, 'parse').mockResolvedValueOnce({
      stream: { time: [0, 1, 2], heartrate: [120], watts: [-3, -2, -1] },
      fit: {
        fileType: 4,
        sessions: [
          {
            sport: 1,
            avgPower: Infinity,
            maxPower: -1,
            normalizedPower: NaN,
            avgHeartRate: '120',
            maxHeartRate: -1,
            avgCadence: null,
            totalWork: Infinity,
          },
        ],
        decodeErrors: false,
      },
    });
    const result = await readManualFit(directory, '123', '456');
    expect(result.incomplete).toBe(true);
    expect(Object.values(result.summary).every((value) => value === null)).toBe(
      true,
    );
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
