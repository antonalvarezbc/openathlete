import { computeRecords } from './record';

// Metres per degree of latitude on the sphere used by the haversine formula
const METRES_PER_DEGREE = (2 * Math.PI * 6371000) / 360;

/** A straight route north, one point per (seconds, metres) step. */
function route(steps: Step[]) {
  const time = [0];
  const latlng = [[45, 5]];
  let t = 0;
  let d = 0;
  for (const [seconds, metres] of steps) {
    t += seconds;
    d += metres;
    time.push(t);
    latlng.push([45 + d / METRES_PER_DEGREE, 5]);
  }
  return { time, latlng };
}

type Step = [seconds: number, metres: number];
const repeat = (count: number, step: Step): Step[] =>
  Array.from({ length: count }, () => step);

function speedRecords(stream: ReturnType<typeof route>) {
  return new Map(
    computeRecords(stream)
      .filter((record) => record.type === 'SPEED')
      .map((record) => [record.distance, record.value]),
  );
}

describe('speed records', () => {
  test('finds every distance on a sparse recording', () => {
    // One point every 20 s at 5 m/s, as smart recording on a bike does
    const records = speedRecords(route(repeat(201, [20, 100])));
    expect(records.get(1000)).toBeCloseTo(200, 0);
    expect(records.get(1500)).toBeCloseTo(300, 0);
    expect(records.get(20000)).toBeCloseTo(4000, 0);
    expect(records.has(21097.5)).toBe(false);
  });

  test('does not depend on where the points fall', () => {
    // A steady 4 m/s, recorded every 1, 3 or 9 seconds
    const pattern: Step[] = [
      [3, 12],
      [9, 36],
      [1, 4],
    ];
    const records = speedRecords(
      route(repeat(400, pattern[0]).map((_, i) => pattern[i % 3])),
    );
    expect(records.size).toBeGreaterThan(5);
    for (const [distance, time] of records) {
      expect(time).toBeCloseTo(distance / 4, 3);
    }
  });

  test('finds a fast kilometre between points that miss its ends', () => {
    // 5 m/s, one point every 35 m, inside running at 3 m/s
    const records = speedRecords(
      route([
        ...repeat(100, [9, 27]),
        ...repeat(40, [7, 35]),
        ...repeat(100, [9, 27]),
      ]),
    );
    expect(records.get(1000)).toBeCloseTo(200, 3);
  });

  test('can rank a longer distance faster when a stop splits the shorter ones', () => {
    // Any 800 m includes the stop, the full 1000 m spreads it further
    const records = speedRecords(
      route([...repeat(10, [10, 50]), [120, 0], ...repeat(10, [10, 50])]),
    );
    expect(records.get(800)).toBeCloseTo(280, 3);
    expect(records.get(1000)).toBeCloseTo(320, 3);
  });
});

describe('average records', () => {
  test('averages the samples of the best stretch', () => {
    const stream = route(repeat(100, [10, 50]));
    const watts = stream.time.map((_, i) => (i >= 40 && i <= 60 ? 300 : 150));
    const power400 = computeRecords({ ...stream, watts }).find(
      (record) => record.type === 'POWER' && record.distance === 400,
    );
    expect(power400?.value).toBe(300);
  });
});
