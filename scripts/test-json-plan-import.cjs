/* Local integration test. Requires the API/DB and fictitious coach/athlete accounts.
 * Usage: node scripts/test-json-plan-import.cjs lab/local-qa/accounts.json
 * Only plans created by this run are removed. No Garmin or LLM calls are made.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const req = createRequire(path.resolve("apps/api/package.json"));
req("dotenv").config({ path: "apps/api/.env", quiet: true });
req("ts-node").register({
  transpileOnly: true,
  project: path.resolve("apps/api/tsconfig.json"),
});
const { PrismaClient } = req("@openathlete/database");
const { TrainingPlanService } = req(
  path.resolve("apps/api/src/modules/core/services/training-plan.service.ts"),
);
const accounts = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const account of [accounts.coach, accounts.athlete])
  assert.ok(
    account.email.endsWith("@openathlete.test"),
    "Use fictitious test accounts only",
  );
const db = new PrismaClient();
const prefix = `QA JSON ${Date.now()}`;
const tokens = [];
let token;
const base = "http://localhost:3000";
async function request(route, body, access = token) {
  const res = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: await res.json() };
}
function plan(suffix) {
  return {
    plan: {
      name: prefix + suffix,
      description: "Synthetic test plan",
      goal: "QA",
      sportType: "RUNNING",
      distance: 10000,
      duration: 2,
    },
    cycles: [
      {
        name: "QA base",
        description: "",
        phase: "BASE",
        weeks: [1, 2].map((weekNumber) => ({
          weekNumber,
          sessions: [
            {
              name: "QA Sunday",
              dayOfWeek: 0,
              sport: "RUNNING",
              description: "Synthetic only",
              goalDuration: 1800,
              goalDistance: 0,
              goalElevationGain: 0,
              goalRpe: 0,
              workout: {
                steps: [
                  {
                    stepType: "REPEAT",
                    repeatTimes: 2,
                    childSteps: [
                      {
                        stepType: "STEADY",
                        durationType: "TIME",
                        durationValue: 900,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        })),
      },
    ],
  };
}
async function snapshot() {
  const plans = await db.trainingPlan.findMany({
    where: { name: { startsWith: prefix } },
    include: {
      cycles: { include: { weeks: { include: { sessions: true } } } },
    },
  });
  return JSON.stringify(plans);
}
(async () => {
  const login = await request(
    "/auth/login",
    { email: accounts.coach.email, password: accounts.coach.password },
    null,
  );
  assert.equal(login.status, 201);
  token = login.data.accessToken;
  assert.ok(token);
  const coach = await db.user.findUniqueOrThrow({
    where: { email: accounts.coach.email },
    include: { athlete: true },
  });
  const athlete = await db.user.findUniqueOrThrow({
    where: { email: accounts.athlete.email },
    include: { athlete: true },
  });
  const options = {
    startDate: "2030-10-21",
    timeZone: "Europe/Madrid",
    athleteId: athlete.athlete.athleteId,
  };
  const original = plan(" import");
  assert.equal(
    (
      await request(
        "/seo-plan/import-json",
        { ...options, planData: original },
        null,
      )
    ).status,
    401,
  );
  const invalid = structuredClone(original);
  invalid.plan.duration = 3;
  assert.equal(
    (await request("/seo-plan/import-json", { ...options, planData: invalid }))
      .status,
    400,
  );
  assert.equal(await snapshot(), "[]");
  const imported = await request("/seo-plan/import-json", {
    ...options,
    planData: original,
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  assert.equal(imported.data.athleteId, athlete.athlete.athleteId);
  assert.equal(imported.data.status, "ACTIVE");
  const id = imported.data.trainingPlanId;
  const events = await db.event.findMany({
    where: { trainingWeek: { cycle: { trainingPlanId: id } } },
    orderBy: { startDate: "asc" },
    include: {
      training: {
        include: {
          workout: {
            include: {
              steps: {
                include: { repeatBlock: { include: { childSteps: true } } },
              },
            },
          },
        },
      },
    },
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].startDate.toISOString(), "2030-10-27T08:00:00.000Z");
  assert.equal(events[0].training.goalRpe, 0);
  assert.equal(events[0].training.goalDistance, 0);
  assert.equal(events[0].training.workout.steps[0].repeatBlock.repetitions, 2);
  assert.equal(
    events[0].training.workout.steps[0].repeatBlock.childSteps.length,
    1,
  );
  assert.equal(
    (await request("/seo-plan/import-json", { ...options, planData: original }))
      .status,
    409,
  );
  console.log(
    "PASS: authenticated import, selected athlete, dates, zero values, repeat steps, duplicate rejection",
  );
  const otherLogin = await request(
    "/auth/login",
    { email: accounts.athlete.email, password: accounts.athlete.password },
    null,
  );
  assert.equal(
    (
      await request(
        "/seo-plan/import-json",
        {
          ...options,
          athleteId: coach.athlete.athleteId,
          planData: plan(" denied"),
        },
        otherLogin.data.accessToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/seo-plan/athletes/${coach.athlete.athleteId}/plans`,
        undefined,
        otherLogin.data.accessToken,
      )
    ).status,
    403,
  );
  const replacement = plan(" replaced");
  replacement.cycles[0].weeks[0].sessions[0].goalDuration = 2400;
  const updated = await request("/seo-plan/import-json", {
    ...options,
    replacePlanId: id,
    planData: replacement,
  });
  assert.equal(updated.status, 201, JSON.stringify(updated.data));
  assert.equal(updated.data.trainingPlanId, id);
  assert.equal(
    await db.event.count({
      where: { trainingWeek: { cycle: { trainingPlanId: id } } },
    }),
    2,
  );
  await db.trainingPlan.update({
    where: { trainingPlanId: id },
    data: { startDate: new Date("2000-01-01") },
  });
  const before = await snapshot();
  assert.equal(
    (
      await request("/seo-plan/import-json", {
        ...options,
        replacePlanId: id,
        planData: replacement,
      })
    ).status,
    409,
  );
  assert.equal(await snapshot(), before);
  console.log(
    "PASS: authorization, explicit replacement, protection of started plans",
  );
  const temp = await request("/seo-plan", { planData: plan(" concurrent") });
  assert.equal(temp.status, 201);
  tokens.push(temp.data.token);
  const concurrent = await Promise.all([
    request(`/seo-plan/${temp.data.token}/import`, options),
    request(`/seo-plan/${temp.data.token}/import`, options),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 201).length, 1);
  assert.ok(concurrent.some((result) => [400, 409].includes(result.status)));
  console.log("PASS: simultaneous token imports create exactly one plan");
  const rollbackPlan = plan(" rollback");
  const temporary = await request("/seo-plan", { planData: rollbackPlan });
  tokens.push(temporary.data.token);
  const beforeRollback = await snapshot();
  const failingDb = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return (fn, settings) =>
          target.$transaction(async (tx) => {
            let calls = 0;
            const wrapped = new Proxy(tx, {
              get(t, prop) {
                if (prop === "event")
                  return new Proxy(t.event, {
                    get(events, op) {
                      if (op === "create")
                        return async (args) => {
                          if (++calls === 2)
                            throw new Error("Injected failure");
                          return events.create(args);
                        };
                      return events[op];
                    },
                  });
                return t[prop];
              },
            });
            return fn(wrapped);
          }, settings);
      return target[key];
    },
  });
  await assert.rejects(
    new TrainingPlanService(failingDb).importSeoPlan(
      coach,
      rollbackPlan,
      options.startDate,
      options,
      temporary.data.token,
    ),
    /Injected failure/,
  );
  assert.equal(await snapshot(), beforeRollback);
  assert.equal(
    (
      await db.temporaryTrainingPlan.findUniqueOrThrow({
        where: { id: temporary.data.token },
      })
    ).importedAt,
    null,
  );
  const replaceId = concurrent.find((result) => result.status === 201).data
    .trainingPlanId;
  await assert.rejects(
    new TrainingPlanService(failingDb).importSeoPlan(
      coach,
      rollbackPlan,
      options.startDate,
      { ...options, replacePlanId: replaceId },
      temporary.data.token,
    ),
    /Injected failure/,
  );
  assert.equal(await snapshot(), beforeRollback);
  console.log(
    "PASS: failed replacement preserves the original plan and sessions",
  );
  console.log(
    "PASS: injected mid-import failure rolls back sessions, plan and token consumption",
  );
})()
  .finally(async () => {
    const plans = await db.trainingPlan.findMany({
      where: { name: { startsWith: prefix } },
    });
    for (const plan of plans) {
      const where = {
        trainingWeek: { cycle: { trainingPlanId: plan.trainingPlanId } },
      };
      const events = await db.event.findMany({
        where,
        select: { eventId: true },
      });
      await db.eventTraining.deleteMany({
        where: { eventId: { in: events.map((event) => event.eventId) } },
      });
      await db.event.deleteMany({ where });
      await db.cycle.deleteMany({
        where: { trainingPlanId: plan.trainingPlanId },
      });
      await db.trainingPlan.delete({
        where: { trainingPlanId: plan.trainingPlanId },
      });
    }
    await db.temporaryTrainingPlan.deleteMany({
      where: { id: { in: tokens } },
    });
    await db.$disconnect();
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
