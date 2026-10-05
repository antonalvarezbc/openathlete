/**
 * Isolated Vite + Chromium check with synthetic data and mocked API calls.
 * Start Vite at 5188 and Chromium CDP at 9331, then run this file with Node.
 * QA_WEB_URL and QA_CDP_URL override these addresses. No live AI/Garmin calls.
 */
import assert from "node:assert/strict";
import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";

const web = process.env.QA_WEB_URL || "http://localhost:5188";
const browser = await chromium.connectOverCDP(
  process.env.QA_CDP_URL || "http://127.0.0.1:9331",
);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "es-ES",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) =>
  route
    .request()
    .url()
    .startsWith(web + "/")
    ? route.continue()
    : route.abort(),
);
await context.addCookies([{ name: "PARAGLIDE_LOCALE", value: "es", url: web }]);
const click = async (text) =>
  page.getByRole("button", { name: text, exact: true }).click();
try {
  await page.goto(web + "/auth/login", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.evaluate(async () => {
    const source = await fetch(
      "/src/components/coach-assistant/coach-assistant.tsx",
    ).then((r) => r.text());
    const version = source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const react = await import(
      "/node_modules/.vite/deps/react.js?v=" + version
    );
    const React = react.default ?? react;
    const dom = await import(
      "/node_modules/.vite/deps/react-dom_client.js?v=" + version
    );
    const { createRoot } = dom.default ?? dom;
    const adaptationSource = await fetch(
      "/src/views/dashboard/settings-view/plan-adaptation-section.tsx",
    ).then((r) => r.text());
    const queryUrl = adaptationSource.match(
      /from ["']([^"']*tanstack_react-query[^"']*)["']/,
    )[1];
    const { QueryClient, QueryClientProvider } = await import(queryUrl);
    const { CoachAssistant } =
      await import("/src/components/coach-assistant/coach-assistant.tsx");
    const { PlanAdaptationSection } =
      await import("/src/views/dashboard/settings-view/plan-adaptation-section.tsx");
    const { PlanningEvidenceSummary } =
      await import("/src/components/ai-plan/planning-evidence.tsx");
    const { default: client } = await import("/src/utils/axios.ts");
    window.qaCalls = [];
    const original = {
      eventId: 7,
      action: "KEEP",
      reason: "Original",
      name: "Rodaje suave",
      sport: "RUNNING",
      description: "Sesión original",
      goalDuration: 3600,
      goalDistance: null,
      goalElevationGain: null,
      goalRpe: 3,
      workout: null,
      startDate: "2030-10-22T08:00:00Z",
    };
    const period = {
      fromDate: "2030-10-15",
      throughDate: "2030-10-21",
      activities: 2,
      minutes: 142,
      distanceMeters: 10000,
      elevationGainMeters: 1050,
      meanRpe: 7,
      rpeAnswers: 1,
      loads: [{ method: "TRIMP", total: 85.67, activities: 1 }],
    };
    const evidence = {
      asOfDate: "2030-10-21",
      windowDays: 42,
      historyTruncated: false,
      lastActivityDate: "2030-10-20",
      recent: period,
      previous: { ...period, loads: [], minutes: null },
      recovery: [
        {
          type: "HR_REST",
          unit: "bpm",
          latestDate: "2030-10-18",
          latestValue: 65,
          ageDays: 3,
          recentDays: 1,
          baselineDays: 0,
          recentMean: null,
          baselineMedian: null,
          changePercent: null,
          status: "STALE",
        },
      ],
      comparisons: [],
      feedback: [],
      limitations: [],
    };
    const ctx = {
      contextVersion: "a".repeat(64),
      data: {
        asOf: "2030-10-21T12:00:00Z",
        evidence,
        missingMetrics: [],
        sessions: [
          {
            startDate: original.startDate,
            endDate: "2030-10-22T09:00:00Z",
            exported: false,
            original,
          },
        ],
      },
    };
    client.get = async (url) => ({
      data: url.includes("/athlete/me")
        ? {
            athleteId: 4,
            userId: 3,
            firstName: "Test",
            lastName: "Athlete",
            trainingZones: [],
          }
        : url.includes("/athlete/coached")
          ? [
              {
                athleteId: 4,
                user: { firstName: "Test", lastName: "Athlete" },
                trainingZones: [],
              },
            ]
          : [],
    });
    client.post = async (url, body) => {
      qaCalls.push({ url, body: structuredClone(body) });
      if (url.endsWith("/chat"))
        return {
          data: {
            reply: "Revisemos la siguiente sesión con los datos disponibles.",
            context: ctx,
          },
        };
      if (url.endsWith("/propose"))
        return {
          data: {
            ...ctx,
            proposal: {
              summary: "Mantener la sesión tras revisar los datos",
              warnings: ["Comprobar el estado actual"],
              sessions: [original],
              newSessions: [],
            },
          },
        };
      if (url.endsWith("/apply")) return { data: { updated: 1, created: 0 } };
      return { data: ctx };
    };
    const container = document.createElement("div");
    container.id = "workflow-qa";
    container.style.cssText =
      "position:absolute;inset:0;background:white;padding:12px;z-index:40";
    document.body.append(container);
    document.getElementById("root").style.display = "none";
    const root = createRoot(container);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function Harness() {
      const [handoff, setHandoff] = React.useState(null);
      window.qaReset = () => setHandoff(null);
      return React.createElement(
        QueryClientProvider,
        { client: cache },
        handoff
          ? React.createElement(PlanAdaptationSection, {
              selection: { athleteId: 4, startDate: "2030-10-21" },
              handoff,
            })
          : React.createElement(CoachAssistant, {
              athleteId: 4,
              onAdapt: setHandoff,
            }),
      );
    }
    window.qaEvidenceOnly = () =>
      root.render(React.createElement(PlanningEvidenceSummary, { evidence }));
    root.render(React.createElement(Harness));
  });
  await page
    .getByLabel("Sensaciones y circunstancias actuales (opcional)")
    .fill("Piernas cargadas");
  await page
    .getByLabel("Primer día de la semana que revisar")
    .fill("2030-10-21");
  await click("Revisar contexto del atleta");
  await page.getByText("Hace más de 2 días", { exact: true }).waitFor();
  assert.match(
    await page.locator("#workflow-qa").innerText(),
    /1\/2 actividades con esta carga/,
  );
  console.log("PASS dated recovery and load coverage visible");
  await page
    .getByLabel("Pregunta al asistente")
    .fill("Revisar la intensidad de mañana");
  await page.locator('#workflow-qa form button[type="submit"]').click();
  await page
    .getByText("Revisemos la siguiente sesión con los datos disponibles.", {
      exact: true,
    })
    .waitFor();
  await click("Adaptar la siguiente sesión");
  await page
    .getByLabel("Instrucciones y restricciones del entrenador")
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Instrucciones y restricciones del entrenador")
      .inputValue(),
    "Revisar la intensidad de mañana",
  );
  assert.equal(
    await page
      .getByLabel("Describe las sensaciones y circunstancias actuales")
      .inputValue(),
    "Piernas cargadas",
  );
  assert.equal(
    await page.getByLabel("Qué adaptar", { exact: true }).inputValue(),
    "NEXT_SESSION",
  );
  assert.equal(
    await page.getByLabel("Estado actual", { exact: true }).inputValue(),
    "UNKNOWN",
  );
  for (const box of await page
    .locator('#workflow-qa input[type="checkbox"]')
    .all())
    assert.equal(await box.isChecked(), false);
  console.log("PASS coach context transfer with no increased-load permissions");
  await click("Revisar contexto del atleta");
  await page
    .getByRole("button", { name: "Generar propuesta", exact: true })
    .waitFor();
  await click("Generar propuesta");
  await page
    .getByText("Mantener la sesión tras revisar los datos", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => qaCalls.filter((c) => c.url.endsWith("/apply")).length,
    ),
    0,
  );
  const apply = page.getByRole("button", { name: /aplicar/i });
  assert.equal(await apply.isDisabled(), true);
  console.log("PASS draft generation does not write and requires confirmation");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(overflow, false);
  console.log("PASS mobile workflow fits 390px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  console.log("PASS desktop layout");
  await page
    .getByLabel(
      "He revisado los cambios, los pasos de las sesiones y cualquier aumento de carga.",
    )
    .check();
  assert.equal(await apply.isDisabled(), false);
  await apply.click();
  await page.waitForFunction(() =>
    qaCalls.some((c) => c.url.endsWith("/apply")),
  );
  assert.equal(
    await page.evaluate(
      () => qaCalls.find((c) => c.url.endsWith("/apply")).body.confirmed,
    ),
    true,
  );
  console.log("PASS writes only after explicit coach confirmation");
  await page.evaluate(() => qaReset());
  await click("Adaptar esta semana");
  assert.equal(
    await page.getByLabel("Qué adaptar", { exact: true }).inputValue(),
    "WEEK",
  );
  console.log("PASS explicit week scope transfer");
  assert.deepEqual(errors, []);
} catch (error) {
  console.error("Failure:", error);
  console.error("Browser errors:", errors);
  console.error(
    await page
      .locator("#workflow-qa")
      .innerText({ timeout: 1000 })
      .catch(() => ""),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
