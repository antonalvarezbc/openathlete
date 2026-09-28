/**
 * Browser regression checks against an isolated Vite server and Chromium CDP.
 * Start Vite on 5188 and Chromium with --remote-debugging-port=9331, then run:
 * node scripts/tests/heart-rate-zones.browser.mjs
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
    `Timeout: ${expression}\n${errors.join("\n")}\n${await evaluate("JSON.stringify({text:document.body.innerText})")}`,
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
    const source = await fetch('/src/components/training-zone-editor/training-zone-bulk-editor.tsx').then(r=>r.text());
    const version = source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const React = (await import('/node_modules/.vite/deps/react.js?v='+version)).default;
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);
    const {createRoot} = dom.default ?? dom;
    const sync = await import('/node_modules/.vite/deps/react-dom.js?v='+version);
    const {flushSync} = sync.default ?? sync;
    const {QueryClient,QueryClientProvider} = await import('/node_modules/.vite/deps/@tanstack_react-query.js?v='+version);
    const {AuthContext} = await import('/src/contexts/auth/context/auth-context.tsx');
    const {TrainingZoneBulkEditor} = await import('/src/components/training-zone-editor/training-zone-bulk-editor.tsx');
    const {TrainingZoneList} = await import('/src/components/training-zone-editor/training-zone-list.tsx');
    const {default:client} = await import('/src/utils/axios.ts');
    window.qaCalls=[]; window.qaHrMax=200; window.qaHrRest=60; window.qaFailAt=0; window.qaDone=0; window.qaExisting=[];
    client.get=async url=>({data:url.includes('metric')?{...(qaHrMax?{HR_MAX:{value:qaHrMax}}:{}),...(qaHrRest==null?{}:{HR_REST:{value:qaHrRest}}),HR_MIN_DAILY:{value:40}}:structuredClone(qaExisting)});
    client.post=async(url,body)=>{
      qaCalls.push({method:'POST',url,body});
      if(qaFailAt && qaCalls.length===qaFailAt) throw Error('Simulated save error');
      return {data:{trainingZoneId:900+qaCalls.length}};
    };
    client.patch=async(url,body)=>{qaCalls.push({method:'PATCH',url,body});return {data:body};};
    client.delete=async url=>{qaCalls.push({method:'DELETE',url});return {data:{success:true}};};
    const container=document.createElement('div');container.id='zones-qa';container.style.padding='16px';document.body.append(container);document.getElementById('root').style.display='none';
    const root=createRoot(container);
    window.qaRender=async({existing=false,hrMax=200,hrRest=60,type='HEARTRATE',role='COACH',list=false}={})=>{
      flushSync(()=>root.render(null));await new Promise(r=>setTimeout(r,50));
      qaCalls=[];qaDone=0;qaFailAt=0;qaHrMax=hrMax;qaHrRest=hrRest;
      qaExisting=existing?[0,1,2,3,4].map(i=>({trainingZoneId:700+i,index:i,type,name:'Zona '+(i+1),description:'Preservar '+i,color:'#22C55E',values:[{min:100+20*i,max:i===4?200:119+20*i,sports:['RUNNING']}]})):[];
      const cache=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
      root.render(React.createElement(QueryClientProvider,{client:cache},React.createElement(AuthContext.Provider,{value:{user:{userId:999,roles:[role]}}},React.createElement(list?TrainingZoneList:TrainingZoneBulkEditor,{athleteId:998,type,zones:qaExisting,onComplete:()=>qaDone++}))));
      await new Promise(r=>setTimeout(r,250));
    };
    window.qaClick=text=>{const button=[...document.querySelectorAll('#zones-qa button')].find(b=>b.textContent.trim()===text);if(!button)throw Error('Missing '+text);button.click();};
    window.qaType=(id,text)=>{const field=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,text);field.dispatchEvent(new Event('input',{bubbles:true}));};
    window.qaSaveDisabled=()=>[...document.querySelectorAll('#zones-qa button')].find(b=>b.textContent.trim()==='Guardar').disabled;
  })()`);
  for (const width of [390, 1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
    await evaluate('qaRender()');
    await until("document.querySelectorAll('[data-testid=hr-zone-preview]').length===6");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-testid=hr-zone-preview]')].map(e=>e.textContent)"), ['0–99 ppm','100–119 ppm','120–139 ppm','140–159 ppm','160–179 ppm','180–200 ppm']);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('#zones-qa [role=group] button')].map(b=>b.textContent.trim())"), ['Manual','% de la FC de reserva','% de la FC máxima']);
    assert.equal(await evaluate("document.getElementById('zones-hr-rest')===null"),true);
    await evaluate("qaClick('Guardar')");
    await until('qaDone===1');
    const created=await evaluate('qaCalls');
    assert.equal(created.length,6);
    assert.equal(created[0].body.name,'Zona 0');
    assert.deepEqual(created.map(c=>[c.body.min,c.body.max]),[[0,99],[100,119],[120,139],[140,159],[160,179],[180,200]]);
    pass(width+': defaults and persisted bpm');

    await evaluate('qaRender({hrMax:195,hrRest:60})');
    await evaluate("qaClick('% de la FC de reserva')");
    await until("document.getElementById('zones-hr-rest')?.value==='60'");
    await until("document.querySelectorAll('[data-testid=hr-zone-preview]')[2]?.textContent==='141–154 ppm'");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-testid=hr-zone-preview]')].map(e=>e.textContent)"), ['60–127 ppm','128–140 ppm','141–154 ppm','155–167 ppm','168–181 ppm','182–195 ppm']);
    await evaluate("qaType('zones-hr-rest','50')");
    await until("document.querySelectorAll('[data-testid=hr-zone-preview]')[2]?.textContent==='137–151 ppm'");
    await evaluate("qaType('zones-hr-rest','60')");
    await until("document.querySelectorAll('[data-testid=hr-zone-preview]')[2]?.textContent==='141–154 ppm'");
    await evaluate("qaClick('Manual')");
    await until("document.getElementById('zone-2-min').value==='141'");
    await evaluate("qaClick('% de la FC de reserva')");
    await until("document.querySelectorAll('[data-testid=hr-zone-preview]')[2]?.textContent==='141–154 ppm'");
    await evaluate("qaClick('Guardar')");
    await until('qaDone===1');
    const reserve=await evaluate('qaCalls');
    assert.deepEqual([reserve[2].body.min,reserve[2].body.max],[141,154]);
    pass(width+': reserve preview, changes, unit roundtrip and saved bpm');

    await evaluate('qaRender({hrMax:195,hrRest:null})');
    await until("document.getElementById('zones-hr-max').value==='195'");
    await evaluate("qaClick('% de la FC de reserva')");
    await until("document.getElementById('zones-hr-rest')?.value===''");
    await until('qaSaveDisabled()');
    assert.equal(await evaluate("document.querySelector('#zones-qa').innerText.includes('mayor que cero y menor que la FC máxima')"),true);
    for (const invalidRest of ['0','195','200','60.5']) {
      await evaluate("qaType('zones-hr-rest',"+JSON.stringify(invalidRest)+")");
      await until('qaSaveDisabled()');
    }
    await evaluate("qaType('zones-hr-rest','0')");
    await evaluate("qaClick('Manual')");
    await until("document.querySelector('#zones-qa').innerText.includes('Revisa la FC máxima, la FC en reposo')");
    assert.equal(await evaluate('qaSaveDisabled()'),true);
    await evaluate("qaType('zones-hr-rest','60')");
    await until('!qaSaveDisabled()');
    await evaluate("qaType('zones-hr-rest','')");
    await until('qaSaveDisabled()');
    await evaluate("qaClick('% de la FC máxima')");
    await until('!qaSaveDisabled()');
    assert.equal(await evaluate('qaCalls.length'),0);
    assert.equal(await evaluate("document.getElementById('zones-hr-rest')===null"),true);
    await evaluate("qaClick('% de la FC de reserva')");
    await until("document.getElementById('zones-hr-rest')?.value===''");
    await evaluate("qaType('zones-hr-rest','60')");
    await until('!qaSaveDisabled()');
    await evaluate("qaClick('% de la FC máxima')");
    await until("document.getElementById('zones-hr-rest')===null");
    await evaluate("qaClick('% de la FC de reserva')");
    await until("document.getElementById('zones-hr-rest')?.value==='60'");
    pass(width+': resting HR visibility, preserved input and daily minimum ignored');

    await evaluate('qaRender({hrMax:0})');
    assert.equal(await evaluate('qaSaveDisabled()'),true);
    await evaluate("qaType('zones-hr-max','185')");
    await until('!qaSaveDisabled()');
    await evaluate("qaType('zone-2-max','75')");
    await until("document.getElementById('zone-3-min').value==='75'");
    await evaluate("qaType('zone-2-max','101')");
    await until('qaSaveDisabled()');
    assert.equal(await evaluate('qaCalls.length'),0);
    pass(width+': missing HRmax, custom boundaries and invalid input');

    await evaluate('qaRender({existing:true})');
    assert.equal(await evaluate("document.getElementById('zone-0-min').value"),'100');
    assert.equal(await evaluate("document.getElementById('zones-hr-max')===null && document.getElementById('zones-hr-rest')===null"),true);
    assert.equal(await evaluate("document.querySelector('#zones-qa').innerText.includes('Los límites se redondean')"),false);
    await evaluate("qaClick('% de la FC máxima')");
    await until("document.getElementById('zone-0-min').value==='50'");
    await evaluate("qaClick('Manual')");
    await until("document.getElementById('zone-0-min').value==='100'");
    await evaluate("qaClick('% de la FC máxima')");
    await until("document.getElementById('zone-0-min').value==='50'");
    await evaluate("qaClick('Aplicar porcentajes predeterminados')");
    await evaluate("qaClick('Guardar')");
    await until('qaDone===1');
    const updated=await evaluate('qaCalls');
    assert.equal(updated.length,5);
    assert.ok(updated.every((c,i)=>c.method==='PATCH'&&c.url==='/training-zone/'+(700+i)&&c.body.description==='Preservar '+i&&c.body.sports[0]==='RUNNING'));
    pass(width+': existing zone IDs, sports and descriptions preserved');

    await evaluate('qaRender({existing:true,hrMax:0,hrRest:null})');
    assert.equal(await evaluate("document.getElementById('zones-hr-max')===null && document.getElementById('zones-hr-rest')===null"),true);
    assert.equal(await evaluate('qaSaveDisabled()'),false);
    await evaluate("qaClick('% de la FC de reserva')");
    await until("!!document.querySelector('[role=dialog] #zones-hr-rest')");
    await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Cancelar').click()");
    await until("!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.getElementById('zone-0-min').value"),'100');
    assert.equal(await evaluate("document.getElementById('zones-hr-max')===null"),true);
    await evaluate("qaClick('% de la FC de reserva')");
    await until("!!document.querySelector('[role=dialog] #zones-hr-rest')");
    await evaluate("qaType('zones-hr-max','200')");
    await evaluate("qaType('zones-hr-rest','60')");
    await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Convertir límites actuales').click()");
    await until("!document.querySelector('[role=dialog]') && document.querySelectorAll('[data-testid=hr-zone-preview]').length===5");
    assert.equal(await evaluate("document.querySelector('[data-testid=hr-zone-preview]').textContent"),'100–119 ppm');
    await evaluate("qaClick('Manual')");
    await until("document.getElementById('zones-hr-max')===null && document.getElementById('zones-hr-rest')===null");
    assert.equal(await evaluate('qaCalls.length'),0);
    pass(width+': Manual hides references and help; conversion dialog preserves limits');

    await evaluate('qaRender()');
    await until('!qaSaveDisabled()');
    await evaluate("qaFailAt=3;qaClick('Guardar')");
    await until("document.querySelector('#zones-qa').innerText.includes('No se pudieron guardar')");
    assert.equal(await evaluate('qaDone'),0);
    await evaluate("qaFailAt=0;qaClick('Guardar')");
    await until('qaDone===1');
    assert.equal(await evaluate("qaCalls.filter(c=>c.method==='POST'&&c.body.name==='Zona 0').length"),1);
    assert.equal(await evaluate("qaCalls.filter(c=>c.method==='POST'&&c.body.name==='Zona 1').length"),1);
    pass(width+': failed saves keep created IDs and allow retry');

    await evaluate("qaRender({type:'POWER'})");
    assert.equal(await evaluate("!!document.getElementById('zones-hr-max')"),false);
    assert.equal(await evaluate("document.getElementById('zone-0-max').value"),'140');
    await evaluate("qaRender({existing:true,list:true,role:'ATHLETE'})");
    await until("document.querySelector('#zones-qa').innerText.includes('Zona 1')");
    assert.equal(await evaluate("document.querySelector('#zones-qa').innerText.includes('Editar zonas')"),false);
    pass(width+': power defaults and athlete read-only access');
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(passed+' browser scenarios passed');
} finally {
  await call('Page.close').catch(()=>{});
  ws.close();
}
