import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeHoverPin } from '../../apps/web/src/utils/map-hover.ts';

test('hovering a GPS gap does not place a false map marker', () => {
  const gps = [[40, 1], [], [40, 2]];
  assert.equal(computeHoverPin(gps, [0, 1, 2], { index: 1, time: 1 }), undefined);
  assert.deepEqual(computeHoverPin(gps, [0, 1, 2], { index: 2, time: 2 }), [[40, 2]]);
});
test('hover safely ignores unavailable or invalid coordinates', () => {
  for (const point of [[], null, [NaN, 1], [91, 1]]) {
    assert.equal(computeHoverPin([point], [0], { index: 0, time: 0 }), undefined);
  }
});
