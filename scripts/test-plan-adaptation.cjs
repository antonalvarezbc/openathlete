/* Local integration: existing linked @openathlete.test accounts, API + database.
 * No provider/LLM calls. Uses manually reviewed synthetic proposals.
 * node scripts/test-plan-adaptation.cjs lab/local-qa/accounts.json
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const req = createRequire(path.resolve("apps/api/package.json"));
req("dotenv").config({ path: "apps/api/.env", quiet: true });
const { PrismaClient } = req("@openathlete/database");
const db = new PrismaClient();
const accounts = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const account of [accounts.coach, accounts.athlete])
  assert.ok(account.email.endsWith("@openathlete.test"));
let token, planId, activityEventId;
const createdMetricIds = [];
const day = 86400000;
const now = new Date();
const midnight = new Date(now);
midnight.setHours(0, 0, 0, 0);
const at = (days) => new Date(midnight.getTime() + days * day + 9 * 3600000);
const weekStart = `${midnight.getFullYear()}-${String(midnight.getMonth() + 1).padStart(2, "0")}-${String(midnight.getDate()).padStart(2, "0")}`;
async function api(route, body, access = token) {
  const response = await fetch("http://localhost:3000" + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
function proposal(context, factor = 1) {
  return {
    summary: "QA synthetic proposal",
    warnings: [],
    sessions: context.data.sessions.map((item) => {
      const session = structuredClone(item.original);
      session.reason = "QA review";
      session.action = factor === 1 ? "KEEP" : "UPDATE";
      session.goalDuration = Math.round(session.goalDuration * factor);
      if (session.workout)
        for (const step of session.workout.steps)
          if (step.durationType === "TIME")
            step.durationValue = Math.round(step.durationValue * factor);
      return session;
    }),
  };
}
(async () => {
  const coach = await db.user.findUniqueOrThrow({
    where: { email: accounts.coach.email },
    include: { athlete: true },
  });
  const athlete = await db.user.findUniqueOrThrow({
    where: { email: accounts.athlete.email },
    include: { athlete: true },
  });
  const athleteId = athlete.athlete.athleteId;
  const login = await api(
    "/auth/login",
    { email: accounts.coach.email, password: accounts.coach.password },
    null,
  );
  assert.equal(login.status, 201);
  token = login.data.accessToken;
  const plan = await db.trainingPlan.create({
    data: {
      athleteId,
      name: `QA adaptation ${randomUUID()}`,
      goal: "Synthetic trail objective",
      status: "ACTIVE",
      startDate: at(-7),
      endDate: at(14),
    },
  });
  planId = plan.trainingPlanId;
  const cycle = await db.cycle.create({
    data: {
      athleteId,
      trainingPlanId: planId,
      name: "QA",
      phase: "BASE",
      startDate: at(-7),
      endDate: at(14),
    },
  });
  const week = await db.trainingWeek.create({
    data: {
      cycleId: cycle.cycleId,
      weekNumber: 1,
      startDate: at(-7),
      endDate: at(14),
    },
  });
  async function session(days) {
    return db.event.create({
      data: {
        athleteId,
        type: "TRAINING",
        name: "QA planned",
        trainingWeekId: week.trainingWeekId,
        startDate: at(days),
        endDate: new Date(at(days).getTime() + 1800000),
        training: {
          create: {
            sport: "TRAIL_RUNNING",
            description: "QA original",
            goalDuration: 1800,
            goalDistance: 4000,
            goalElevationGain: 150,
            goalRpe: 0.3,
            workout: {
              create: {
                steps: {
                  create: {
                    orderIndex: 0,
                    stepType: "STEADY",
                    durationType: "TIME",
                    durationValue: 1800,
                  },
                },
              },
            },
          },
        },
      },
      include: { training: true },
    });
  }
  const past = await session(-1);
  const next = await session(1);
  const later = await session(2);
  const completed = await session(3);
  const activity = await db.event.create({
    data: {
      athleteId,
      type: "ACTIVITY",
      name: "QA completed",
      startDate: at(-1),
      endDate: new Date(at(-1).getTime() + 2100000),
      activity: {
        create: {
          externalId: `qa-adaptation:${randomUUID()}`,
          sport: "TRAIL_RUNNING",
          movingTime: 2100,
          distance: 4200,
          elevationGain: 180,
          averageSpeed: 2,
          maxSpeed: 4,
          rpe: 0.7,
          description: "QA subjective feedback",
        },
      },
    },
    include: { activity: true },
  });
  activityEventId = activity.eventId;
  await db.eventTraining.update({
    where: { eventTrainingId: completed.training.eventTrainingId },
    data: { relatedActivityId: activity.activity.eventActivityId },
  });
  const request = {
    athleteId,
    planId,
    language: "es",
    allowRedistribution: false,
    scope: "NEXT_SESSION",
    weekStart,
    timeZone: "Europe/Madrid",
    readiness: "READY",
    currentState: "QA recovered; synthetic test only",
    instructions: "Keep upcoming races intact",
    allowIncrease: false,
    maxIncreasePercent: 10,
  };
  const denied = await api("/agent/ai/plan-adaptation/context", {
    ...request,
    athleteId: coach.athlete.athleteId,
  });
  assert.equal(denied.status, 403);
  let result = await api("/agent/ai/plan-adaptation/context", request);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  let context = result.data;
  assert.equal(context.data.language, "es");
  assert.equal(context.data.sessions.length, 1);
  assert.equal(context.data.sessions[0].original.eventId, next.eventId);
  assert.ok(
    context.data.activities.some(
      (item) => item.description === "QA subjective feedback" && item.rpe === 7,
    ),
  );
  assert.equal(context.data.plan.goal, "Synthetic trail objective");
  assert.ok(Array.isArray(context.data.missingMetrics));
  assert.ok(!JSON.stringify(context.data).includes(accounts.athlete.email));
  let p = proposal(context, 1.1);
  assert.equal(
    (
      await api("/agent/ai/plan-adaptation/apply", {
        request,
        contextVersion: context.contextVersion,
        proposal: p,
        confirmed: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await db.eventTraining.findUniqueOrThrow({
        where: { eventId: next.eventId },
      })
    ).goalDuration,
    1800,
  );
  request.allowIncrease = true;
  context = (await api("/agent/ai/plan-adaptation/context", request)).data;
  p = proposal(context, 1.1);
  const applied = await api("/agent/ai/plan-adaptation/apply", {
    request,
    contextVersion: context.contextVersion,
    proposal: p,
    confirmed: true,
  });
  assert.equal(applied.status, 201, JSON.stringify(applied.data));
  assert.equal(applied.data.updated, 1);
  assert.equal(
    (
      await db.eventTraining.findUniqueOrThrow({
        where: { eventId: next.eventId },
      })
    ).goalDuration,
    1980,
  );
  assert.equal(
    (
      await api("/agent/ai/plan-adaptation/apply", {
        request,
        contextVersion: context.contextVersion,
        proposal: p,
        confirmed: true,
      })
    ).status,
    409,
  );
  console.log(
    "PASS: context permissions, plan objective, real RPE input, default increase rejection, explicit +10%, stale proposal protection",
  );
  request.scope = "WEEK";
  request.allowIncrease = false;
  context = (await api("/agent/ai/plan-adaptation/context", request)).data;
  assert.deepEqual(
    context.data.sessions.map((item) => item.original.eventId),
    [next.eventId, later.eventId],
  );
  req("ts-node").register({
    transpileOnly: true,
    project: path.resolve("apps/api/tsconfig.json"),
  });
  const { PlanAdaptationService } = req(
    path.resolve(
      "apps/api/src/modules/agent/services/plan-adaptation.service.ts",
    ),
  );
  const beforeFailure = await db.event.findMany({
    where: { eventId: { in: [next.eventId, later.eventId] } },
    include: {
      training: { include: { workout: { include: { steps: true } } } },
    },
    orderBy: { eventId: "asc" },
  });
  const failingDb = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return (fn, options) =>
          target.$transaction(async (tx) => {
            let updates = 0;
            return fn(
              new Proxy(tx, {
                get(t, prop) {
                  if (prop === "event")
                    return new Proxy(t.event, {
                      get(events, op) {
                        if (op === "update")
                          return async (args) => {
                            if (++updates === 2)
                              throw new Error("Injected adaptation failure");
                            return events.update(args);
                          };
                        return events[op];
                      },
                    });
                  return t[prop];
                },
              }),
            );
          }, options);
      return target[key];
    },
  });
  await assert.rejects(
    new PlanAdaptationService(failingDb).apply(coach, {
      request,
      contextVersion: context.contextVersion,
      proposal: proposal(context, 0.5),
      confirmed: true,
    }),
    /Injected adaptation failure/,
  );
  const afterFailure = await db.event.findMany({
    where: { eventId: { in: [next.eventId, later.eventId] } },
    include: {
      training: { include: { workout: { include: { steps: true } } } },
    },
    orderBy: { eventId: "asc" },
  });
  assert.deepEqual(afterFailure, beforeFailure);
  console.log(
    "PASS: mid-week write failure rolls back all sessions and workout steps",
  );
  p = proposal(context);
  Object.assign(p.sessions[1], {
    action: "REST",
    name: "QA rest",
    description: "Synthetic rest",
    goalDuration: 0,
    goalDistance: 0,
    goalElevationGain: 0,
    goalRpe: 0,
    workout: null,
  });
  const rested = await api("/agent/ai/plan-adaptation/apply", {
    request,
    contextVersion: context.contextVersion,
    proposal: p,
    confirmed: true,
  });
  assert.equal(rested.status, 201, JSON.stringify(rested.data));
  assert.equal(
    (
      await db.eventTraining.findUniqueOrThrow({
        where: { eventId: later.eventId },
      })
    ).goalDuration,
    0,
  );
  assert.equal(
    (
      await db.eventTraining.findUniqueOrThrow({
        where: { eventId: past.eventId },
      })
    ).goalDuration,
    1800,
  );
  assert.equal(
    (
      await db.eventTraining.findUniqueOrThrow({
        where: { eventId: completed.eventId },
      })
    ).relatedActivityId,
    activity.activity.eventActivityId,
  );
  assert.equal(
    (
      await db.eventActivity.findUniqueOrThrow({
        where: { eventId: activityEventId },
      })
    ).rpe,
    0.7,
  );
  console.log(
    "PASS: remaining week excludes past/completed sessions; rest preserves other sessions and completed activity",
  );
  request.scope = "NEXT_SESSION";
  request.allowRedistribution = false;
  context = (await api("/agent/ai/plan-adaptation/context", request)).data;
  p = proposal(context, 1);
  p.sessions[0].action = "UPDATE";
  p.sessions[0].startDate = at(4).toISOString();
  let moved = await api("/agent/ai/plan-adaptation/apply", {request, contextVersion: context.contextVersion, proposal: p, confirmed: true});
  assert.equal(moved.status, 400, JSON.stringify(moved.data));
  request.allowRedistribution = true;
  context = (await api("/agent/ai/plan-adaptation/context", request)).data;
  p = proposal(context, 1);
  p.sessions[0].action = "UPDATE";
  p.sessions[0].startDate = at(3).toISOString(); // Occupied by protected completed session.
  moved = await api("/agent/ai/plan-adaptation/apply", {request, contextVersion: context.contextVersion, proposal: p, confirmed: true});
  assert.equal(moved.status, 400, JSON.stringify(moved.data));
  p.sessions[0].action = "UPDATE";
  p.sessions[0].startDate = at(4).toISOString();
  moved = await api("/agent/ai/plan-adaptation/apply", {request, contextVersion: context.contextVersion, proposal: p, confirmed: true});
  assert.equal(moved.status, 201, JSON.stringify(moved.data));
  const rescheduled = await db.event.findUniqueOrThrow({where: {eventId: next.eventId}});
  assert.equal(rescheduled.startDate.toISOString(), at(4).toISOString());
  assert.equal(rescheduled.trainingWeekId, week.trainingWeekId);
  assert.equal(rescheduled.endDate.getTime() - rescheduled.startDate.getTime(), 1980000);
  console.log("PASS: Spanish context; moving requires permission, prevents collisions and persists dates in original plan week");
  request.scope = "WEEK";
  request.weekStart = at(7).toISOString().slice(0,10);
  result = await api("/agent/ai/plan-adaptation/context", request);
  assert.equal(result.status, 400);
  assert.equal(result.data.code, "ADAPTATION_NO_SESSIONS");
  Object.assign(request, {allowNewSessions: true, maxNewSessions: 2, newSessionMinutes: 60, newSessionMaxRpe: 4});
  result = await api("/agent/ai/plan-adaptation/context", request);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  context = result.data;
  assert.equal(context.data.sessions.length, 0);
  assert.equal(context.data.availableWeeks[0].trainingWeekId, week.trainingWeekId);
  p = proposal(context);
  p.newSessions = [8,9].map(days => ({trainingWeekId: week.trainingWeekId, startDate: at(days).toISOString(),
    name: "QA additional session", reason: "Synthetic recovered athlete", description: "QA easy effort",
    sport: "RUNNING", goalDuration: 1800, goalRpe: 3, workout: {steps: [
      {stepType: 'WARMUP', durationType:'TIME', durationValue:300, name:'QA warmup', notes:null, targets:[], repeatBlock:null},
      {stepType: 'STEADY', durationType:'TIME', durationValue:1200, name:'QA steady', notes:null, targets:[{targetType:'RPE',targetValue:3,targetMin:null,targetMax:null,metricType:null}], repeatBlock:null},
      {stepType: 'COOLDOWN', durationType:'TIME', durationValue:300, name:'QA cooldown', notes:null, targets:[], repeatBlock:null},
    ]}}));
  const countBefore = await db.event.count({where: {trainingWeekId: week.trainingWeekId}});
  const failCreate = new Proxy(db, {
    get(target,key) {
      if (key === "$transaction") return (fn,options) => target.$transaction(async tx => {
        let creations = 0;
        return fn(new Proxy(tx, {get(t,prop) {
          if (prop === "event") return new Proxy(t.event, {get(events,op) {
            if (op === "create") return async args => {
              if (++creations === 2) throw new Error("Injected creation failure");
              return events.create(args);
            };
            return events[op];
          }});
          return t[prop];
        }}));
      },options);
      return target[key];
    },
  });
  await assert.rejects(new PlanAdaptationService(failCreate).apply(coach,{request: req("@openathlete/shared").planAdaptationRequestSchema.parse(request),contextVersion:context.contextVersion,proposal:p,confirmed:true}), /Injected creation failure/);
  assert.equal(await db.event.count({where:{trainingWeekId:week.trainingWeekId}}),countBefore);
  const created = await api("/agent/ai/plan-adaptation/apply", {request,contextVersion:context.contextVersion,proposal:p,confirmed:true});
  assert.equal(created.status,201,JSON.stringify(created.data));
  assert.equal(created.data.created,2);
  assert.equal(await db.event.count({where:{trainingWeekId:week.trainingWeekId}}),countBefore+2);
  const added = await db.event.findMany({where:{trainingWeekId:week.trainingWeekId,startDate:{gte:at(8)}},include:{training:{include:{workout:{include:{steps:{include:{targets:true}}}}}}}});
  assert.equal(added.length,2);
  assert.ok(added.every(e => e.training.workout.steps.length === 3));
  assert.ok(added.every(e => e.training.workout.steps.reduce((sum,s)=>sum+s.durationValue,0) === 1800));
  assert.ok(added.every(e => e.training.workout.steps.some(s=>s.targets.some(t=>t.targetType === 'RPE' && t.targetValue === 3))));
  assert.ok(added.every(e => e.athleteId === athleteId && e.training.goalRpe === 0.3 && e.training.goalDuration === 1800));
  const replay = await api("/agent/ai/plan-adaptation/apply", {request,contextVersion:context.contextVersion,proposal:p,confirmed:true});
  assert.equal(replay.status,409);
  console.log("PASS: localized empty-scope code, empty-week context, atomic additions, RPE conversion and duplicate prevention");
  // Leave fixture IDs only when explicitly requested for a subsequent browser test.
  if (process.env.QA_KEEP_ADAPTATION_FIXTURE === "1") {
    fs.writeFileSync(
      "lab/local-qa/adaptation-fixture.json",
      JSON.stringify({
        planId,
        activityEventId,
        request,
        pastId: past.eventId,
        nextId: next.eventId,
        laterId: later.eventId,
        completedId: completed.eventId,
      }),
    );
    planId = undefined;
    activityEventId = undefined;
  }
})()
  .finally(async () => {
    if (planId) {
      const events = await db.event.findMany({
        where: { trainingWeek: { cycle: { trainingPlanId: planId } } },
        select: { eventId: true },
      });
      await db.eventTraining.deleteMany({
        where: { eventId: { in: events.map((event) => event.eventId) } },
      });
      await db.event.deleteMany({
        where: { eventId: { in: events.map((event) => event.eventId) } },
      });
      await db.cycle.deleteMany({ where: { trainingPlanId: planId } });
      await db.trainingPlan.delete({ where: { trainingPlanId: planId } });
    }
    if (activityEventId) {
      await db.eventActivity.delete({ where: { eventId: activityEventId } });
      await db.event.delete({ where: { eventId: activityEventId } });
    }
    await db.athleteMetric.deleteMany({
      where: { athleteMetricId: { in: createdMetricIds } },
    });
    await db.$disconnect();
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
