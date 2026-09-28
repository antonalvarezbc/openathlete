/**
 * Browser regression checks against an isolated Vite server and Chromium CDP.
 * Start Vite on 5188 and Chromium with --remote-debugging-port=9331, then run:
 * node scripts/tests/activity-training-load.browser.mjs
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
    const source=await fetch('/src/components/dashboard/coach-training-load-summary.tsx').then(r=>r.text());
    const version=source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const React=(await import('/node_modules/.vite/deps/react.js?v='+version)).default;
    const dom=await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);
    const {createRoot}=dom.default??dom;
    const sync=await import('/node_modules/.vite/deps/react-dom.js?v='+version);
    const {flushSync}=sync.default??sync;
    const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js?v='+version);
    const {ActivityTrainingLoadStats}=await import('/src/components/event-details/activity-training-load-stats.tsx');
    const {default:client}=await import('/src/utils/axios.ts');
    const fixture=type=>({trainingLoadEntryId:1,calculationId:2,activityId:3,date:'2026-09-26',createdAt:'2026-09-26',updatedAt:'2026-09-26',value:type==='TRIMP'?48.5579:413,metadata:{calculationType:type}});
    window.qaCalls=[];window.qaWrites=0;window.qaMode='saved';
    client.get=async url=>{
      if(!url.includes('training-load')) return {data:[]};
      qaCalls.push(url);
      if(qaMode==='error') throw Error('Simulated lookup failure');
      if(qaMode==='pending') await new Promise(resolve=>window.qaRelease=resolve);
      if(qaMode==='empty') return {data:[]};
      if(qaMode==='foster') return {data:[fixture('FOSTER_RPE')]};
      if(qaMode==='zero') return {data:[{...fixture('TRIMP'),value:0}]};
      return {data:[fixture('TRIMP'),fixture('FOSTER_RPE')]};
    };
    client.post=client.patch=client.delete=async()=>{qaWrites++;throw Error('A saved-load view must never write');};
    const container=document.createElement('div');container.id='load-qa';container.style.padding='16px';document.body.append(container);document.getElementById('root').style.display='none';
    const root=createRoot(container);let cache;
    const mount=()=>root.render(React.createElement(QueryClientProvider,{client:cache},React.createElement(ActivityTrainingLoadStats,{activityId:999})));
    window.qaRender=async mode=>{
      flushSync(()=>root.render(null));await new Promise(r=>setTimeout(r,30));
      qaCalls=[];qaWrites=0;qaMode=mode;
      cache=new QueryClient({defaultOptions:{queries:{staleTime:300000,refetchOnMount:false}}});
      mount();await new Promise(r=>setTimeout(r,200));
    };
    window.qaRemount=async()=>{flushSync(()=>root.render(null));await new Promise(r=>setTimeout(r,30));mount();await new Promise(r=>setTimeout(r,200));};
  })()`);
  for(const width of [390,1280]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
    await evaluate("qaRender('saved')");
    await until("document.querySelector('#load-qa').innerText.includes('49')");
    assert.equal(await evaluate("document.querySelector('#load-qa').innerText.includes('413')"),false);
    await evaluate('qaRemount()');
    assert.equal(await evaluate('qaCalls.length'),1);
    assert.equal(await evaluate('qaWrites'),0);
    pass(width+': saved TRIMP displayed and reused after reopening');

    await evaluate("qaRender('zero')");
    await until("document.querySelector('#load-qa').innerText.trim().endsWith('0')");
    assert.equal(await evaluate("document.querySelector('#load-qa').innerText.includes('No hay')"),false);
    pass(width+': valid zero load remains visible');

    for(const mode of ['empty','foster']){
      await evaluate('qaRender('+JSON.stringify(mode)+')');
      await until("document.querySelector('#load-qa').innerText.includes('No hay una carga TRIMP guardada')");
      assert.equal(await evaluate('qaWrites'),0);
    }
    pass(width+': missing TRIMP is explained, including Foster-only entries');

    await evaluate("qaRender('error')");
    await until("document.querySelector('#load-qa [role=alert]')?.textContent.includes('No se ha podido consultar')");
    assert.equal(await evaluate('qaCalls.length'),1);
    await evaluate("qaMode='saved';document.querySelector('#load-qa button').click()");
    await until("document.querySelector('#load-qa').innerText.includes('49')");
    assert.equal(await evaluate('qaCalls.length'),2);
    assert.equal(await evaluate('qaWrites'),0);
    pass(width+': visible error and read-only retry');

    await evaluate("qaRender('pending')");
    await until("document.querySelector('#load-qa').innerText.includes('Consultando carga guardada')");
    await evaluate('qaRelease()');
    await until("document.querySelector('#load-qa').innerText.includes('49')");
    assert.equal(await evaluate('qaWrites'),0);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    pass(width+': loading copy describes a read, with no calculation request');
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(passed+' browser scenarios passed');
} finally {await call('Page.close').catch(()=>{});ws.close();}
