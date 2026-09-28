/** Local PostgreSQL roundtrip, always rolled back; no provider or application calls. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const databaseRequire = createRequire(
  new URL("../../libs/database/package.json", import.meta.url),
);
const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
databaseRequire("dotenv").config({
  path: fileURLToPath(new URL("../../libs/database/.env", import.meta.url)),
});
const host = new URL(process.env.DATABASE_URL).hostname;
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(host),
  "This test only runs against a local database",
);
const { PrismaClient } = databaseRequire("./generated/client");
const {
  mapWorkoutDtoToPrisma,
  mapPrismaWorkoutToDto,
  portableWorkoutTargets,
  mapWorkoutTargets,
  resolveWorkoutTarget,
} = apiRequire("@openathlete/shared");
const db = new PrismaClient();
const rollback = new Error("ROLLBACK_TEST_FIXTURES");
let count = 0;
try {
  await db.$transaction(
    async (tx) => {
      for (const target of [
        {
          targetType: "HEARTRATE",
          metricType: "HR_MAX",
          targetMin: 0.8,
          targetMax: 0.85,
          targetValue: null,
        },
        {
          targetType: "ZONE",
          metricType: null,
          zoneReference: { type: "HEARTRATE", name: "Zone 4" },
          targetValue: null,
        },
      ]) {
        const steps = [
          {
            stepType: "REPEAT",
            durationType: "OPEN",
            repeatBlock: {
              repetitions: 5,
              childSteps: [
                {
                  stepType: "INTERVAL_ACTIVE",
                  durationType: "TIME",
                  durationValue: 480,
                  targets: [target],
                },
              ],
            },
          },
        ];
        const row = await tx.event.create({
          data: {
            name: "QA rollback-only relative template",
            type: "TRAINING",
            startDate: new Date("2026-01-01T10:00Z"),
            endDate: new Date("2026-01-01T11:00Z"),
            training: {
              create: {
                sport: "RUNNING",
                workout: { create: mapWorkoutDtoToPrisma({ steps }) },
              },
            },
          },
          include: {
            training: {
              include: {
                workout: {
                  include: {
                    steps: {
                      include: {
                        targets: true,
                        repeatBlock: {
                          include: {
                            childSteps: { include: { targets: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const saved = mapPrismaWorkoutToDto(row.training.workout);
        assert.equal(saved.steps[0].repeatBlock.repetitions, 5);
        assert.equal(
          saved.steps[0].repeatBlock.childSteps[0].durationValue,
          480,
        );
        const savedTarget = saved.steps[0].repeatBlock.childSteps[0].targets[0];
        assert.equal(savedTarget.metricType, target.metricType);
        assert.deepEqual(
          savedTarget.zoneReference,
          target.zoneReference ?? null,
        );
        for (const [id, max, min, high] of [
          [47, 200, 160, 179],
          [92, 180, 144, 161],
        ]) {
          const context = {
            sport: "RUNNING",
            metrics: { HR_MAX: max },
            zones: [
              {
                trainingZoneId: id,
                name: "Zona 4",
                type: "HEARTRATE",
                values: [{ min, max: high, sports: ["RUNNING"] }],
              },
            ],
          };
          const portable = portableWorkoutTargets(saved.steps, []);
          const assigned = mapWorkoutTargets(portable, (t) =>
            resolveWorkoutTarget(t, context),
          );
          const actual = assigned[0].repeatBlock.childSteps[0].targets[0];
          assert.equal(
            actual.targetValue,
            target.targetType === "ZONE" ? id : null,
          );
          const absolute = resolveWorkoutTarget(actual, context, true);
          assert.equal(absolute.targetMin, min);
          assert.equal(
            absolute.targetMax,
            target.targetType === "ZONE" ? high : max * 0.85,
          );
          count++;
        }
      }
      throw rollback;
    },
    { timeout: 15000 },
  );
  throw Error("Expected rollback");
} catch (error) {
  if (error !== rollback) throw error;
  console.log(
    `${count} PostgreSQL roundtrips passed; all test rows rolled back`,
  );
} finally {
  await db.$disconnect();
}
