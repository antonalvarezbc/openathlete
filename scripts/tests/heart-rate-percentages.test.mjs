import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_HEART_RATE_PERCENTAGES,
  percentageToHeartRate,
  heartRateToPercentage,
} from '../../apps/web/src/components/training-zone-editor/heart-rate-percentages.ts';

test('defaults produce zones 0–5 with shared boundaries in the higher zone', () => {
  assert.deepEqual(DEFAULT_HEART_RATE_PERCENTAGES.map(r => percentageToHeartRate(r, 200)), [
    { min: 0, max: 99 }, { min: 100, max: 119 }, { min: 120, max: 139 },
    { min: 140, max: 159 }, { min: 160, max: 179 }, { min: 180, max: 200 },
  ]);
});

test('non-round HRmax gives contiguous integer zones without overlaps', () => {
  for (const hrMax of [163, 185, 191, 202]) {
    const zones = DEFAULT_HEART_RATE_PERCENTAGES.map(r => percentageToHeartRate(r, hrMax));
    for (let bpm = 0; bpm <= hrMax; bpm++) {
      assert.equal(zones.filter(z => bpm >= z.min && bpm <= z.max).length, 1, `${hrMax}: ${bpm}`);
    }
  }
});

test('switching units preserves existing integer ranges for any supported HRmax', () => {
  for (let hrMax = 1; hrMax <= 300; hrMax++) {
    for (let bpm = 0; bpm <= hrMax; bpm++) {
      const range = { min: bpm, max: Math.min(bpm + 8, hrMax) };
      assert.deepEqual(percentageToHeartRate(heartRateToPercentage(range, hrMax), hrMax), range);
    }
  }
});

test('invalid or missing HRmax and invalid percentages cannot be saved', () => {
  for (const hrMax of [0, -1, NaN, Infinity, 200.5, 301]) {
    assert.throws(() => percentageToHeartRate({ min: 50, max: 60 }, hrMax));
  }
  for (const range of [{ min: -1, max: 60 }, { min: 60, max: 50 }, { min: 50, max: 101 }, { min: 50, max: 50 }, { min: NaN, max: 60 }, { min: 50, max: 50.01 }]) {
    assert.throws(() => percentageToHeartRate(range, 185));
  }
  assert.throws(() => heartRateToPercentage({ min: 190, max: 220 }, 185));
  assert.throws(() => heartRateToPercentage({ min: 120.5, max: 130 }, 185));
});

test('custom percentages and changed HRmax produce the requested ranges', () => {
  assert.deepEqual(percentageToHeartRate({ min: 62.5, max: 75 }, 200), { min: 125, max: 149 });
  assert.deepEqual(percentageToHeartRate({ min: 60, max: 70 }, 180), { min: 108, max: 125 });
});

test('heart-rate reserve uses resting HR plus a percentage of the reserve', () => {
  assert.deepEqual(percentageToHeartRate({ min: 60, max: 70 }, 195, 60), { min: 141, max: 154 });
  assert.deepEqual(percentageToHeartRate({ min: 70, max: 80 }, 195, 60), { min: 155, max: 167 });
  assert.deepEqual(percentageToHeartRate({ min: 90, max: 100 }, 195, 60), { min: 182, max: 195 });
  assert.deepEqual(percentageToHeartRate({ min: 60, max: 70 }, 195, 50), { min: 137, max: 151 });
});

test('reserve zones cover resting through maximum HR exactly once', () => {
  for (const hrMax of [163, 185, 195, 202]) {
    for (const hrRest of [40, 55, 60, 75]) {
      const zones = DEFAULT_HEART_RATE_PERCENTAGES.map(r => percentageToHeartRate(r, hrMax, hrRest));
      for (let bpm = hrRest; bpm <= hrMax; bpm++) {
        assert.equal(zones.filter(z => bpm >= z.min && bpm <= z.max).length, 1);
        const range = { min: bpm, max: Math.min(bpm + 8, hrMax) };
        assert.deepEqual(percentageToHeartRate(heartRateToPercentage(range, hrMax, hrRest), hrMax, hrRest), range);
      }
    }
  }
});

test('reserve rejects invalid resting HR and ranges below resting HR', () => {
  for (const hrRest of [-1, NaN, Infinity, 60.5, 195, 200]) {
    assert.throws(() => percentageToHeartRate({ min: 60, max: 70 }, 195, hrRest));
    assert.throws(() => heartRateToPercentage({ min: 141, max: 154 }, 195, hrRest));
  }
  assert.throws(() => heartRateToPercentage({ min: 0, max: 127 }, 195, 60));
});
