import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canBulkDeleteWorkout,
  deleteWorkoutsSequentially,
} from "../../apps/web/src/components/calendar/utils/bulk-delete.ts";

test("bulk selection excludes activities, races, notes and completed training", () => {
  assert.equal(
    canBulkDeleteWorkout({ type: "TRAINING", relatedActivity: null }),
    true,
  );
  for (const type of ["ACTIVITY", "COMPETITION", "NOTE"]) {
    assert.equal(canBulkDeleteWorkout({ type }), false);
  }
  assert.equal(
    canBulkDeleteWorkout({
      type: "TRAINING",
      relatedActivity: { eventId: 42 },
    }),
    false,
  );
});

test("deletes each selected ID once and never overlaps requests", async () => {
  let active = 0;
  const called = [];
  const result = await deleteWorkoutsSequentially(
    [10, 11, 10, 12],
    async (id) => {
      active += 1;
      assert.equal(active, 1);
      called.push(id);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    },
  );
  assert.deepEqual(called, [10, 11, 12]);
  assert.deepEqual(result, { deleted: [10, 11, 12], failed: [] });
});

test("continues after failures and reports only failed IDs for retry", async () => {
  const called = [];
  const first = await deleteWorkoutsSequentially([10, 11, 12], async (id) => {
    called.push(id);
    if (id === 11) throw new Error("Forbidden or provider failure");
  });
  assert.deepEqual(called, [10, 11, 12]);
  assert.deepEqual(first, { deleted: [10, 12], failed: [11] });
  const retried = [];
  const second = await deleteWorkoutsSequentially(first.failed, async (id) => {
    retried.push(id);
  });
  assert.deepEqual(retried, [11]);
  assert.deepEqual(second, { deleted: [11], failed: [] });
});

test("empty selection makes no requests", async () => {
  assert.deepEqual(
    await deleteWorkoutsSequentially([], () =>
      assert.fail("Unexpected delete"),
    ),
    { deleted: [], failed: [] },
  );
});
