/**
 * Browser regression checks against an isolated Vite server and Chromium CDP.
 * Start Vite on 5188 and Chromium with --remote-debugging-port=9331, then run:
 * node scripts/tests/calendar-training-load.browser.mjs
 * Override QA_WEB_URL / QA_CDP_URL to use other local test ports.
 * API requests are mocked; no credentials or athlete data are required.
 */
import assert from "node:assert/strict";

const web = process.env.QA_WEB_URL || "http://localhost:5188";
const cdp = process.env.QA_CDP_URL || "http://127.0.0.1:9331";
const target = await fetch(`${cdp}/json/new?about:blank`, {
  method: "PUT",
}).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => {
  ws.onopen = resolve;
});
let sequence = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(message.error);
    else request.resolve(message.result);
  } else if (message.method === "Runtime.exceptionThrown") {
    errors.push(
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    );
  }
};
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  return result.result.value;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (expression) => {
  for (let attempt = 0; attempt < 75; attempt++) {
    if (await evaluate(expression)) return;
    await delay(200);
  }
  throw Error(
    `Timeout: ${expression}\n${errors.join("\n")}\n${await evaluate("JSON.stringify({text:document.querySelector('#load-qa')?.innerHTML,calls:window.qaCalls,mode:window.qaMode})")}`,
  );
};
let passed = 0;
const pass = (label) => {
  passed++;
  console.log(`PASS ${label}`);
};
try {
  await call("Runtime.enable");
  await call("Page.enable");
  // Permit only the isolated frontend origin, blocking real API/provider traffic.
  await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  const onMessage = ws.onmessage;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      void call(
        request.url.startsWith(web + "/")
          ? "Fetch.continueRequest"
          : "Fetch.failRequest",
        request.url.startsWith(web + "/")
          ? { requestId }
          : { requestId, errorReason: "BlockedByClient" },
      );
    } else onMessage(event);
  };
  await call("Network.setCookie", {
    name: "PARAGLIDE_LOCALE",
    value: "es",
    url: web,
    path: "/",
  });
  await call("Page.navigate", { url: web + "/auth/login" });
  await delay(3500);
  await evaluate(`(async () => {
    const source = await fetch('/src/components/dashboard/coach-training-load-summary.tsx').then(r => r.text());
    const version = source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const reactModule = await import('/node_modules/.vite/deps/react.js?v=' + version);
    const React = reactModule.default ?? reactModule;
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js?v=' + version);
    const { createRoot } = domModule.default ?? domModule;
    const syncModule = await import('/node_modules/.vite/deps/react-dom.js?v=' + version);
    const { flushSync } = syncModule.default ?? syncModule;
    const { QueryClient, QueryClientProvider } = await import('/node_modules/.vite/deps/@tanstack_react-query.js?v=' + version);
    const { AuthContext } = await import('/src/contexts/auth/context/auth-context.tsx');
    const { SpaceContext } = await import('/src/contexts/space/context/space-context.tsx');
    const { CoachTrainingLoadSummary } = await import('/src/components/dashboard/coach-training-load-summary.tsx');
    const { AthleteDashboardHeader } = await import('/src/components/dashboard/athlete-dashboard-header.tsx');
    const { default: client } = await import('/src/utils/axios.ts');
    window.qaMode = 'empty';
    window.qaCalls = [];
    window.qaData = { ctl: 15.45, atl: 25.8, tsb: -10.35, trainingDays: 12, totalLoad: 900 };
    client.get = async (url, config) => {
      qaCalls.push({ url, params: config?.params });
      if (url.includes('training-load')) {
        if (qaMode === 'error') throw Error('Synthetic unavailable server');
        if (qaMode === 'loading') return new Promise(() => {});
        return { data: qaMode === 'empty' ? { ctl: 0, atl: 0, tsb: 0, trainingDays: 0, totalLoad: 0 } : structuredClone(qaData) };
      }
      return { data: [] };
    };
    const container = document.createElement('div');
    container.id = 'load-qa';
    container.style.cssText = 'position:absolute;inset:0;background:white;padding:16px;z-index:40';
    document.body.append(container);
    document.getElementById('root').style.display = 'none';
    const root = createRoot(container);
    window.qaRender = async (space = 'COACH', roles = ['COACH'], athleteId = 992, header = false) => {
      flushSync(() => root.render(null));
      await new Promise(r => setTimeout(r, 50));
      qaCalls = [];
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      root.render(React.createElement(QueryClientProvider, { client: cache },
        React.createElement(AuthContext.Provider, { value: { user: { userId: 991, roles } } },
          React.createElement(SpaceContext.Provider, { value: { space } },
            React.createElement(header ? AthleteDashboardHeader : CoachTrainingLoadSummary, { athleteId })))));
      await new Promise(r => setTimeout(r, 100));
    };
  })()`);
  for (const width of [390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await evaluate("qaMode='empty';qaRender()");
    await until(
      "document.querySelector('#load-qa').innerText.includes('Sin datos suficientes')",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('#load-qa dl').length"),
      0,
    );
    assert(
      await evaluate(
        "document.querySelector('#load-qa').innerText.includes('FC máxima')",
      ),
    );
    assert.equal((await evaluate("qaCalls[0].params")).athleteId, 992);
    assert.equal(
      (await evaluate("qaCalls[0].params")).calculationType,
      "TRIMP",
    );
    pass(`${width}: missing loads show requirements, not zero metrics`);

    await evaluate("qaMode='valid';qaRender()");
    await until("document.querySelector('#load-qa dl') !== null");
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('#load-qa dd.font-bold')).map(e=>e.textContent)",
      ),
      ["15,5", "25,8", "-10,4"],
    );
    assert(
      await evaluate(
        "document.querySelector('#load-qa').scrollWidth <= innerWidth",
      ),
    );
    pass(
      `${width}: calculated loads use the selected athlete and fit the viewport`,
    );

    await evaluate("qaMode='error';qaRender()");
    await until("document.querySelector('#load-qa [role=alert]') !== null");
    assert.equal(
      await evaluate("document.querySelectorAll('#load-qa dl').length"),
      0,
    );
    await evaluate(
      "qaMode='valid';Array.from(document.querySelectorAll('#load-qa button')).find(button=>button.textContent==='Reintentar').click()",
    );
    await until("document.querySelector('#load-qa dl') !== null");
    pass(`${width}: server errors can be retried without false zeros`);

    await evaluate("qaMode='loading';qaRender()");
    assert.equal(
      await evaluate(
        "document.querySelectorAll('#load-qa dl, #load-qa [role=status]').length",
      ),
      0,
    );
    pass(`${width}: loading is not presented as absent data`);

    await evaluate(
      "qaMode='valid';qaData.trimpRefresh={processed:0,reused:12,unavailable:1,heartRateReferences:[{hrMax:180,hrRest:55,source:'TRAINING_ZONE'}]};qaRender()",
    );
    await until("document.querySelector('#load-qa dl') !== null");
    assert.equal(
      await evaluate(
        "document.querySelector('#load-qa h3').textContent.trim()",
      ),
      "Carga de entrenamiento",
    );
    assert.equal(
      await evaluate("document.body.innerText.includes('Reutilizadas: 12')"),
      false,
    );
    await evaluate("document.querySelector('#load-qa button').click()");
    await until(
      "document.querySelector('[data-slot=popover-content]')?.innerText.includes('Reutilizadas: 12')",
    );
    assert(
      await evaluate(
        "document.querySelector('[data-slot=popover-content]').innerText.includes('FC máxima de zonas: 180 ppm')",
      ),
    );
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('#load-qa button')).some(b=>b.textContent.includes('Recalcular'))",
      ),
      false,
    );
    pass(
      `${width}: automatic refresh displays cache reuse and source without a recalculate button`,
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
    });
    await until("!document.querySelector('[data-slot=popover-content]')");
    for (const [metric, content] of [
      ["CTL", "42 días"],
      ["ATL", "7 días"],
      ["TSB", "Diferencia entre CTL y ATL"],
    ]) {
      await evaluate(
        `document.querySelector('[aria-label="Información sobre ${metric}"]').focus()`,
      );
      assert.equal(
        await evaluate("document.activeElement?.getAttribute('aria-label')"),
        `Información sobre ${metric}`,
      );
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: "\r",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await until(
        `document.querySelector('[data-slot=popover-content]')?.innerText.includes('${content}')`,
      );
      assert(
        await evaluate(
          "(() => {const r=document.querySelector('[data-slot=popover-content]').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})()",
        ),
      );
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
      });
      await until("!document.querySelector('[data-slot=popover-content]')");
    }
    pass(
      `${width}: all metric explanations open with keyboard, fit viewport and close with Escape`,
    );
    const button = await evaluate(
      "(() => {const r=document.querySelector('#load-qa button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    if (width < 500) {
      await call("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...button, radiusX: 2, radiusY: 2 }],
      });
      await call("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...button });
    }
    await until(
      "document.querySelector('[data-slot=popover-content]')?.innerText.includes('Reutilizadas: 12')",
    );
    if (width >= 500) {
      const popup = await evaluate(
        "(() => {const r=document.querySelector('[data-slot=popover-content]').getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()",
      );
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...popup });
      await delay(300);
      assert(
        await evaluate(
          "!!document.querySelector('[data-slot=popover-content]')",
        ),
      );
      await call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: 1270,
        y: 830,
      });
      await until("!document.querySelector('[data-slot=popover-content]')");
    }
    pass(
      `${width}: header information opens with ${width < 500 ? "touch" : "hover and stays readable under pointer"}`,
    );
    await evaluate("delete qaData.trimpRefresh");

    for (const args of [
      "'ATHLETE',['ATHLETE']",
      "'ATHLETE',['COACH','ATHLETE']",
      "'COACH',['ATHLETE']",
      "'COACH',['COACH'],0",
    ]) {
      await evaluate(`qaRender(${args})`);
      assert.equal(
        await evaluate("document.querySelector('#load-qa').innerText"),
        "",
      );
      assert.equal(await evaluate("qaCalls.length"), 0);
    }
    pass(
      `${width}: athlete space, missing role and invalid athlete make no load requests`,
    );

    await evaluate("qaMode='valid';qaRender('ATHLETE',['ATHLETE'],992,true)");
    await until("document.querySelector('#load-qa').innerText.length > 0");
    assert.equal(
      await evaluate("qaCalls.some(c=>c.url.includes('training-load'))"),
      false,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#load-qa').innerText.includes('CTL')",
      ),
      false,
    );
    pass(
      `${width}: athlete header retains competitions and metrics without training load`,
    );

    await evaluate(
      "qaData={ctl:0,atl:0,tsb:0,trainingDays:1,totalLoad:0};qaMode='valid';qaRender()",
    );
    await until("document.querySelector('#load-qa dl') !== null");
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('#load-qa dd.font-bold')).map(e=>e.textContent)",
      ),
      ["0", "0", "0"],
    );
    pass(`${width}: genuinely calculated zeros remain valid values`);
    await evaluate(
      "qaData={ctl:15.45,atl:25.8,tsb:-10.35,trainingDays:12,totalLoad:900}",
    );
  }
  assert.deepEqual(errors, []);
  console.log(`Passed ${passed} browser scenarios without real API calls.`);
} finally {
  try {
    await call("Page.close");
  } finally {
    ws.close();
  }
}
