import { CompressedActivityStream } from '@openathlete/shared';

import {
  compressActivityStream,
  uncompressActivityStream,
} from '../../core/helpers/activity-stream';
import { mergeManualGarminStreams } from './manual-garmin-enrichment';

const point = [42.1, -1.2];
const otherPoint = [42.2, -1.3];

describe('manual Garmin stream enrichment', () => {
  it('imports a first recording and rejects invalid incoming timelines', () => {
    const incoming = { time: [0, 1], heartrate: [120, 122] };
    for (const empty of [null, {}, { time: [] }])
      expect(mergeManualGarminStreams(empty, incoming)).toEqual({
        stream: incoming,
        changed: true,
        conflict: false,
      });
    expect(mergeManualGarminStreams(incoming, { time: [1, 0] })).toEqual({
      stream: incoming,
      changed: false,
      conflict: true,
    });
  });

  it('adds missing GPS and sensor channels without replacing existing values', () => {
    const existing = {
      time: [{ s: 0, i: 4 }],
      heartrate: [{ r: 4, v: 100 }],
      norm: [2, 2, 3, 3],
    };
    const incoming = compressActivityStream({
      time: [0, 1, 2, 3],
      heartrate: [120, 121, 122, 123],
      latlng: [[], point, [], otherPoint],
      watts: [100, 110, 120, 130],
    });
    const result = mergeManualGarminStreams(existing, incoming);
    expect(result.changed).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.stream.time).toEqual(existing.time);
    expect(result.stream.heartrate).toEqual(existing.heartrate);
    expect(result.stream.norm).toEqual(existing.norm);
    expect(uncompressActivityStream(result.stream)).toMatchObject({
      time: [0, 1, 2, 3],
      heartrate: [100, 100, 100, 100],
      latlng: [[], point, [], otherPoint],
      watts: [100, 110, 120, 130],
    });
    expect(mergeManualGarminStreams(result.stream, incoming)).toEqual({
      stream: result.stream,
      changed: false,
      conflict: false,
    });
  });

  it('fills only existing GPS gaps and does not mutate either input', () => {
    const existing = { time: [0, 1, 2], latlng: [point, [], []] };
    const incoming = {
      time: [0, 1, 2],
      latlng: [otherPoint, otherPoint, []],
    };
    const result = mergeManualGarminStreams(existing, incoming);
    expect(uncompressActivityStream(result.stream).latlng).toEqual([
      point,
      otherPoint,
      [],
    ]);
    expect(existing.latlng).toEqual([point, [], []]);
    expect(incoming.latlng).toEqual([otherPoint, otherPoint, []]);
  });

  it('aligns different unique timelines by exact timestamp rather than index', () => {
    const result = mergeManualGarminStreams(
      { time: [0, 2], heartrate: [100, 102] },
      {
        time: [0, 1, 2],
        latlng: [point, [], otherPoint],
        watts: [200, 201, 202],
      },
    );
    expect(result.conflict).toBe(false);
    expect(uncompressActivityStream(result.stream)).toEqual({
      time: [0, 2],
      heartrate: [100, 102],
      latlng: [point, otherPoint],
      watts: [200, 202],
    });
  });

  it('keeps unmatched GPS samples as gaps and omits incomplete numerical channels', () => {
    const result = mergeManualGarminStreams(
      { time: [0, 1, 2] },
      { time: [0, 2], latlng: [point, otherPoint], watts: [200, 202] },
    );
    expect(result.changed).toBe(true);
    expect(result.conflict).toBe(true);
    expect(uncompressActivityStream(result.stream)).toEqual({
      time: [0, 1, 2],
      latlng: [point, [], otherPoint],
    });
  });

  it('does not align ambiguous timestamps across different timelines', () => {
    const existing = { time: [0, 0, 1] };
    const result = mergeManualGarminStreams(existing, {
      time: [0, 1],
      latlng: [point, otherPoint],
      watts: [200, 202],
    });
    expect(result).toEqual({
      stream: existing,
      changed: false,
      conflict: true,
    });
  });

  it('reports incompatible timelines even when no new sensor channel can be added', () => {
    const existing = { time: [10, 20], heartrate: [120, 121] };
    expect(
      mergeManualGarminStreams(existing, {
        time: [0, 1],
        heartrate: [130, 131],
      }),
    ).toEqual({
      stream: existing,
      changed: false,
      conflict: true,
    });
  });

  it('allows identical timelines with duplicate timestamps without remapping', () => {
    const result = mergeManualGarminStreams(
      { time: [0, 0, 1] },
      { time: [0, 0, 1], latlng: [point, [], otherPoint] },
    );
    expect(result.conflict).toBe(false);
    expect(uncompressActivityStream(result.stream).latlng).toEqual([
      point,
      [],
      otherPoint,
    ]);
  });

  it('preserves malformed legacy GPS and reports the conflict instead of guessing', () => {
    const existing = { time: [0, 1, 2], latlng: [point, otherPoint] };
    const result = mergeManualGarminStreams(existing, {
      time: [0, 1, 2],
      latlng: [point, [], otherPoint],
    });
    expect(result).toEqual({
      stream: existing,
      changed: false,
      conflict: true,
    });
  });

  it('rejects malformed or unbounded compressed timelines safely', () => {
    for (const time of [
      [{ s: 0, i: 1_000_001 }],
      [{ r: -1, v: 0 }],
      [{ s: Number.NaN, i: 2 }],
      [0, -1],
    ]) {
      const existing = { time } as CompressedActivityStream;
      expect(
        mergeManualGarminStreams(existing, { time: [0], latlng: [point] }),
      ).toEqual({ stream: existing, changed: false, conflict: true });
    }
  });

  it('treats an indoor recording without GPS as valid and idempotent', () => {
    const stream = { time: [0, 1], heartrate: [100, 102] };
    expect(mergeManualGarminStreams(stream, stream)).toEqual({
      stream,
      changed: false,
      conflict: false,
    });
  });
});
