/** Browser navigation regression checks. Run with isolated Vite (5188) and Chromium CDP (9331).
 * API data is mocked and external requests are blocked. Override QA_WEB_URL / QA_CDP_URL if needed.
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
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(200);
  }
  throw Error(
    `Timeout: ${expression}\n${errors.join("\n")}\n${await evaluate("document.body.innerText")}`,
  );
};
const clickElement = async (expression) => {
  const point = await evaluate(
    `(() => { const element = ${expression}; if(!element) throw Error('Missing click target'); element.scrollIntoView({block:'center'}); const rect=element.getBoundingClientRect(); return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`,
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...point,
  });
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

  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`(async () => {
    const source=await fetch('/src/components/sidebar/app-sidebar.tsx').then(r=>r.text());
    const version=source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const React=(await import('/node_modules/.vite/deps/react.js?v='+version)).default;
    const dom=await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);
    const {createRoot}=dom.default??dom;
    const sync=await import('/node_modules/.vite/deps/react-dom.js?v='+version);
    const {flushSync}=sync.default??sync;
    const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js?v='+version);
    const {MemoryRouter,useLocation}=await import('/node_modules/.vite/deps/react-router-dom.js?v='+version);
    const {AppSidebar}=await import('/src/components/sidebar/app-sidebar.tsx');
    const {SidebarProvider,SidebarTrigger}=await import('/src/components/ui/sidebar.tsx');
    const {SpaceContext}=await import('/src/contexts/space/context/space-context.tsx');
    const {AuthContext}=await import('/src/contexts/auth/context/auth-context.tsx');
    const {default:client}=await import('/src/utils/axios.ts');
    const {setLocale}=await import('/src/paraglide/runtime.js');
    setLocale('es',{reload:false});
    window.qaAthletes=[];
    client.get=async url=>({data:url.includes('coached')?qaAthletes:[]});
    client.post=client.patch=client.delete=async()=>{throw Error('Unexpected mutation');};
    const container=document.createElement('div');container.id='sidebar-qa';document.body.append(container);document.getElementById('root').style.display='none';
    const root=createRoot(container);
    const h=React.createElement;
    function Location(){const {pathname}=useLocation();return h('output',{id:'qa-path'},pathname);}
    window.qaRender=async (expanded=false,space='COACH',count=2)=>{
      flushSync(()=>root.render(null));
      document.cookie='sidebar_state=; path=/; max-age=0';
      qaAthletes=Array.from({length:count},(_,i)=>({athleteId:i+101,user:{firstName:'Atleta',lastName:'Prueba '+(i+1)}}));
      const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
      root.render(h(QueryClientProvider,{client:cache},h(AuthContext.Provider,{value:{user:null}},h(SpaceContext.Provider,{value:{space}},h(MemoryRouter,{initialEntries:['/dashboard/calendar/101']},h(SidebarProvider,{defaultOpen:expanded},h(AppSidebar),h(SidebarTrigger),h(Location)))))));
      await new Promise(r=>setTimeout(r,400));
    };
  })()`);
  const press = async (key) => {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
      windowsVirtualKeyCode: {
        Enter: 13,
        Escape: 27,
        ArrowRight: 39,
        ArrowDown: 40,
      }[key],
    });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
  };
  const selector = `document.querySelector('button[aria-label="Atletas"]')`;
  const athlete = (n) =>
    `[...document.querySelectorAll('[data-slot="dropdown-menu-sub-trigger"]')].find(e=>e.textContent.includes('Prueba ${n}'))`;
  await evaluate("qaRender()");
  await until(`${selector} && !${selector}.disabled`);
  assert.equal(
    await evaluate(
      `document.querySelectorAll('button[aria-label="Atletas"]').length`,
    ),
    1,
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('[data-slot="collapsible-trigger"]').length`,
    ),
    0,
  );
  await clickElement(selector);
  await clickElement(athlete(2));
  await until(
    `document.querySelector('[role="menu"] a[href="/dashboard/calendar/102"]')`,
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('[data-slot="dropdown-menu-sub-content"] a').length`,
    ),
    6,
  );
  await clickElement(
    `document.querySelector('[role="menu"] a[href="/dashboard/calendar/102"]')`,
  );
  await until(
    `document.querySelector('#qa-path').textContent==='/dashboard/calendar/102'`,
  );
  await until(`!document.querySelector('[role="menu"]')`);
  pass(
    "Collapsed coach menu opens athlete sections and navigates to the selected calendar",
  );
  await clickElement(selector);
  await clickElement(athlete(2));
  await until(`document.querySelector('[role="menu"] a[aria-current="page"]')`);
  assert.equal(
    await evaluate(
      `document.querySelector('[role="menu"] a[aria-current="page"]').getAttribute('href')`,
    ),
    "/dashboard/calendar/102",
  );
  await clickElement(
    `document.querySelector('[role="menu"] a[href="/dashboard/statistics/102"]')`,
  );
  await until(
    `document.querySelector('#qa-path').textContent==='/dashboard/statistics/102'`,
  );
  pass(
    "Selected athlete and page stay highlighted; statistics links target the correct athlete",
  );
  await until(`!document.querySelector('[role="menu"]')`);
  await evaluate(`${selector}.focus()`);
  await press("Enter");
  await press("ArrowDown");
  await press("ArrowRight");
  await until(
    `document.querySelector('[data-slot="dropdown-menu-sub-content"]')`,
  );
  await press("Escape");
  await press("Escape");
  await until(`!document.querySelector('[role="menu"]')`);
  assert.equal(
    await evaluate(`document.activeElement.getAttribute('aria-label')`),
    "Atletas",
  );
  pass(
    "Keyboard opens submenus, Escape closes and returns focus to the selector",
  );
  await evaluate('qaRender(false,"COACH",60)');
  await clickElement(selector);
  await until(`document.querySelector('[data-slot="dropdown-menu-content"]')`);
  assert.equal(
    await evaluate(
      `(()=>{const e=document.querySelector('[data-slot="dropdown-menu-content"]');return e.scrollHeight>e.clientHeight && e.getBoundingClientRect().bottom<=innerHeight;})()`,
    ),
    true,
  );
  await clickElement(athlete(60));
  await until(`document.querySelector('a[href="/dashboard/calendar/160"]')`);
  await clickElement(
    `document.querySelector('a[href="/dashboard/calendar/160"]')`,
  );
  await until(
    `document.querySelector('#qa-path').textContent==='/dashboard/calendar/160'`,
  );
  pass("Long athlete lists scroll and the last athlete remains reachable");
  await evaluate('qaRender(false,"COACH",0)');
  assert.equal(await evaluate(`${selector}.disabled`), true);
  pass("Empty athlete list disables the selector");
  await evaluate("qaRender(true)");
  assert.equal(await evaluate(`!!${selector}`), false);
  await until(`document.querySelector('a[href="/dashboard/calendar/102"]')`);
  await clickElement(
    `document.querySelector('a[href="/dashboard/calendar/102"]')`,
  );
  await until(
    `document.querySelector('#qa-path').textContent==='/dashboard/calendar/102'`,
  );
  pass("Expanded desktop sidebar retains its direct athlete links");
  await evaluate('qaRender(false,"ATHLETE")');
  assert.equal(await evaluate(`!!${selector}`), false);
  assert.equal(
    await evaluate(`!!document.querySelector('a[href="/dashboard/calendar"]')`),
    true,
  );
  pass("Athlete space keeps its personal navigation");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate("qaRender()");
  await clickElement(`document.querySelector('[data-sidebar="trigger"]')`);
  await until(
    `document.querySelector('[role="dialog"] a[href="/dashboard/calendar/102"]')`,
  );
  assert.equal(await evaluate(`!!${selector}`), false);
  // Wait for the drawer's entrance transition before taking pointer coordinates.
  await delay(500);
  await clickElement(
    `document.querySelector('[role="dialog"] a[href="/dashboard/calendar/102"]')`,
  );
  await until(
    `document.querySelector('#qa-path').textContent==='/dashboard/calendar/102'`,
  );
  await until(`!document.querySelector('[role="dialog"]')`);
  pass(
    "Mobile keeps the expanded athlete tree and closes the drawer after navigation",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(passed + " browser scenarios passed");
} finally {
  await call("Page.close").catch(() => {});
  ws.close();
}
