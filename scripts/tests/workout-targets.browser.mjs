/**
 * Browser regression checks against an isolated Vite server and Chromium CDP.
 * Start Vite on 5188 and Chromium with --remote-debugging-port=9331, then run:
 * node scripts/tests/workout-targets.browser.mjs
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
    `Timeout: ${expression}\n${errors.join("\n")}\n${await evaluate("JSON.stringify({text:document.querySelector('#targets-qa')?.innerHTML,calls:window.qaCalls,mode:window.qaMode})")}`,
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
  await evaluate(`(async () => {
    const source=await fetch('/src/components/workout/target-form.tsx').then(r=>r.text());
    const version=source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const React=(await import('/node_modules/.vite/deps/react.js?v='+version)).default;
    const dom=await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);
    const {createRoot}=dom.default??dom;
    const sync=await import('/node_modules/.vite/deps/react-dom.js?v='+version);
    const {flushSync}=sync.default??sync;
    const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js?v='+version);
    const {TargetForm}=await import('/src/components/workout/target-form.tsx');
    const {WorkoutBuilder}=await import('/src/components/workout/workout-builder.tsx');
    // Use the same module URL as TargetForm, including Vite's HMR timestamp.
    const contextUrl=source.match(/["']([^"']*workout-athlete-context[.]tsx[^"']*)["']/)[1];
    const {WorkoutAthleteContext}=await import(contextUrl);
    const {default:client}=await import('/src/utils/axios.ts');
    window.qaCalls=[];window.qaWrites=0;window.qaMissing=false;
    client.get=async (url,config)=>{
      qaCalls.push({url,params:config?.params});
      if(url.includes('training-zone')) {
        const id=Number(url.split('/').at(-1));
        return {data:qaMissing?[]:[{trainingZoneId:id===12?47:92,name:'Zona 4',description:'',color:'#ea580c',index:4,type:'HEARTRATE',values:[{min:id===12?160:144,max:id===12?179:161,sports:['RUNNING']}]}]};
      }
      if(url.includes('metric')) return {data:qaMissing?{}:{HR_MAX:{value:config?.params?.athleteId===12?200:180},HR_REST:{value:60}}};
      if(url.includes('athlete')) return {data:{athleteId:999,trainingZones:[]}};
      return {data:[]};
    };
    client.post=client.patch=client.delete=async()=>{qaWrites++;throw Error('Unexpected real write');};
    const container=document.createElement('div');container.id='targets-qa';container.style.padding='16px';document.body.append(container);document.getElementById('root').style.display='none';
    const root=createRoot(container);
    window.qaPercent={targetType:'HEARTRATE',metricType:'HR_MAX',targetMin:.8,targetMax:.85,targetValue:null};
    window.qaZone={targetType:'ZONE',targetValue:null,zoneReference:{type:'HEARTRATE',name:'Zone 4'}};
    window.qaRender=async (athleteId=12,initialValues=qaPercent,missing=false,builder=false)=>{
      flushSync(()=>root.render(null));await new Promise(r=>setTimeout(r,30));
      qaCalls=[];qaWrites=0;qaMissing=missing;window.qaSubmitted=null;
      const cache=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:300000}}});
      const props={initialValues,onSubmit:values=>window.qaSubmitted=values};
      const workout={eventTrainingId:1,steps:[{workoutStepId:1,orderIndex:0,stepType:'REPEAT',durationType:'OPEN',targets:[],repeatBlock:{repetitions:5,childSteps:[{workoutStepId:2,orderIndex:0,stepType:'INTERVAL_ACTIVE',durationType:'TIME',durationValue:480,targets:[initialValues]}]}}]};
      const child=builder?React.createElement(WorkoutBuilder,{sport:'RUNNING',workout,onStepsChange:steps=>window.qaSteps=steps}):React.createElement(TargetForm,props);
      root.render(React.createElement(QueryClientProvider,{client:cache},React.createElement(WorkoutAthleteContext.Provider,{value:{athleteId,sport:'RUNNING'}},child)));
      await new Promise(r=>setTimeout(r,300));
    };
    window.qaClick=text=>[...document.querySelectorAll('#targets-qa button')].find(b=>b.textContent.trim()===text)?.click();
    window.qaSubmit=()=>document.querySelector('#targets-qa form').requestSubmit();
    window.qaType=(index,value)=>{const element=document.querySelectorAll('#targets-qa input[type=number]')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};
  })()`);
  for (const width of [390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    for (const [athlete, expected] of [
      [12, "160 - 170"],
      [13, "144 - 153"],
    ]) {
      await evaluate(`qaRender(${athlete})`);
      await until(
        `document.querySelector('#targets-qa [role=status]')?.textContent.includes('${expected}')`,
      );
      assert.deepEqual(
        await evaluate(
          "[...document.querySelectorAll('#targets-qa input[type=number]')].map(e=>e.value)",
        ),
        ["80", "85"],
      );
      assert.equal(
        await evaluate(
          `qaCalls.filter(c=>c.url.includes('metric')).every(c=>c.params?.athleteId===${athlete})`,
        ),
        true,
      );
      assert.equal(
        await evaluate("qaCalls.some(c=>c.url.includes('/athlete/me'))"),
        false,
      );
      await evaluate("qaSubmit()");
      await until("qaSubmitted!==null");
      assert.equal(await evaluate("qaSubmitted.metricType"), "HR_MAX");
      assert.equal(await evaluate("qaSubmitted.targetMin"), 0.8);
      pass(
        width +
          ": athlete " +
          athlete +
          " gets their own percentage range and preserves percentage on save",
      );
    }
    await evaluate("qaRender(null,{targetType:'HEARTRATE'})");
    await clickElement(
      "document.querySelectorAll('#targets-qa [role=combobox]')[1]",
    );
    await until(
      "[...document.querySelectorAll('[role=option]')].some(e=>e.textContent.includes('máxima'))",
    );
    await clickElement(
      "[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes('máxima'))",
    );
    await evaluate("document.getElementById('useRange').click()");
    await until(
      "document.querySelectorAll('#targets-qa input[type=number]').length===2",
    );
    await evaluate("qaType(0,'80');qaType(1,'85')");
    await evaluate("qaSubmit()");
    await until("qaSubmitted!==null");
    assert.equal(await evaluate("qaSubmitted.metricType"), "HR_MAX");
    assert.equal(await evaluate("qaSubmitted.targetMin"), 0.8);
    pass(
      width +
        ": author a new 80–85% target through the actual selector and inputs",
    );

    await evaluate("qaRender(null)");
    await until(
      "document.querySelector('#targets-qa [role=status]')?.textContent.includes('plantilla')",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('#targets-qa [role=combobox]').length",
      ),
      2,
    );
    assert.equal(await evaluate("qaCalls.length"), 0);
    await evaluate("qaSubmit()");
    await until("qaSubmitted!==null");
    assert.equal(await evaluate("qaSubmitted.targetMax"), 0.85);
    pass(
      width +
        ": coach-only template editor offers percentages without personal athlete metrics",
    );

    await evaluate("qaRender(13,qaZone)");
    await until(
      "document.querySelector('#targets-qa [role=status]')?.textContent.includes('144 - 161')",
    );
    await evaluate("qaSubmit()");
    await until("qaSubmitted!==null");
    assert.equal(await evaluate("qaSubmitted.zoneReference.name"), "Zone 4");
    assert.equal(await evaluate("qaSubmitted.metricType"), null);
    pass(width + ": generic zone previews destination athlete limits");

    await evaluate("qaRender(13,qaPercent,true)");
    await until(
      "document.querySelector('#targets-qa [role=alert]')?.textContent.includes('Falta la métrica')",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#targets-qa').innerText.includes('152 - 162')",
      ),
      false,
    );
    await evaluate("qaRender(13,qaZone,true)");
    await until(
      "document.querySelector('#targets-qa [role=alert]')?.textContent.includes('no tiene una zona')",
    );
    assert.equal(await evaluate("qaWrites"), 0);
    pass(
      width +
        ": missing references produce Spanish warnings with no invented values",
    );

    await evaluate("qaRender(12,qaPercent,false,true)");
    await until(
      "document.querySelector('#targets-qa').innerText.includes('160 - 170')",
    );
    assert.equal(await evaluate("qaSteps[0].repeatBlock.repetitions"), 5);
    assert.equal(
      await evaluate("qaSteps[0].repeatBlock.childSteps[0].durationValue"),
      480,
    );
    assert.equal(
      await evaluate(
        "qaSteps[0].repeatBlock.childSteps[0].targets[0].metricType",
      ),
      "HR_MAX",
    );
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
    );
    pass(width + ": 5 x 8 min repeat preserves targets and fits viewport");
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(passed + " browser scenarios passed");
} finally {
  await call("Page.close").catch(() => {});
  ws.close();
}
