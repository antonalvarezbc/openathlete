/**
 * Browser regression checks against an isolated Vite server and Chromium CDP.
 * Start Vite on 5188 and Chromium with --remote-debugging-port=9331, then run:
 * node scripts/tests/activity-feedback.browser.mjs
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
    const source = await fetch('/src/components/activity-feedback/activity-feedback-flow.tsx').then(r=>r.text());
    const version = source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const React = (await import('/node_modules/.vite/deps/react.js?v='+version)).default;
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);
    const {createRoot} = dom.default ?? dom;
    const sync = await import('/node_modules/.vite/deps/react-dom.js?v='+version);
    const {flushSync} = sync.default ?? sync;
    const {QueryClient,QueryClientProvider} = await import('/node_modules/.vite/deps/@tanstack_react-query.js?v='+version);
    const {MemoryRouter} = await import('/node_modules/.vite/deps/react-router-dom.js?v='+version);
    const {Toaster} = await import('/node_modules/.vite/deps/sonner.js?v='+version);
    const {AuthContext} = await import('/src/contexts/auth/context/auth-context.tsx');
    const {ActivityFeedbackFlow} = await import('/src/components/activity-feedback/activity-feedback-flow.tsx');
    const {ActivityFeedbackOverlay} = await import('/src/components/activity-feedback/activity-feedback-overlay.tsx');
    const {ActivityFeedbackDisplayCard} = await import('/src/components/event-details/activity-feedback-display-card.tsx');
    const {default:client} = await import('/src/utils/axios.ts');
    if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async()=>{throw Error('Microphone deliberately disabled in tests');};
    const fixture = ()=>[1,2,3].map(questionId=>({questionId,questionText:'Pregunta '+questionId,qcmOptions:[{label:'Bien'},{label:'Cansancio'}],answerText:null}));
    const event = {eventId:995,athleteId:996,rpe:null,description:'',feedbackSkipped:false,feedbackQuestions:[]};
    window.qaQuestions = fixture();window.qaFailure = '';window.qaDone=0;window.qaCalls=[];
    client.get=async url=>{
      if(url.includes('/feedback-questions')) {if(qaFailure==='load') throw Error('Simulated load failure');return {data:{questions:structuredClone(qaQuestions),feedbackSkipped:false}};}
      if(url==='/athlete/me') return {data:{athleteId:996}};
      if(url.includes('feature')) return {data:{hasAccess:true}};
      return {data:[]};
    };
    client.patch=async(url,body)=>{
      qaCalls.push({url,body});
      if(qaFailure==='save') throw Error('Simulated save failure');
      if(qaFailure==='pending') await new Promise(resolve=>window.qaRelease=resolve);
      const questionId=Number(url.split('/').at(-2));
      qaQuestions.find(q=>q.questionId===questionId).answerText=body.answerText;
      return {data:{questionId,answerText:body.answerText}};
    };
    client.post=async url=>{
      qaCalls.push({url});
      if(qaFailure==='generate') throw {isAxiosError:true,response:{data:{message:'FEEDBACK_INVALID_QUESTIONS'}}};
      if(qaFailure==='model') throw {isAxiosError:true,response:{data:{message:'FEEDBACK_MODEL_NOT_CONFIGURED'}}};
      if(qaFailure==='provider') throw {isAxiosError:true,response:{data:{message:'FEEDBACK_PROVIDER_ERROR'}}};
      if(qaFailure==='disabled') throw {isAxiosError:true,response:{data:{message:'FEEDBACK_DISABLED'}}};
      if(qaFailure==='skip') throw Error('Simulated skip failure');
      if(url.endsWith('/generate')) {qaQuestions=fixture();return {data:{questions:structuredClone(qaQuestions),feedbackSkipped:false}};}
      return {data:{success:true}};
    };
    const container=document.createElement('div');container.id='feedback-qa';container.style.padding='16px';document.body.append(container);document.getElementById('root').style.display='none';
    const root=createRoot(container);
    window.qaRender=async(mode='flow',partial=false)=>{
      flushSync(()=>root.render(null));await new Promise(r=>setTimeout(r,50));
      qaCalls=[];qaDone=0;qaQuestions=mode==='display'?[]:fixture();
      if(partial) qaQuestions[0].answerText='Respuesta guardada';
      const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
      const Component=mode==='display'?ActivityFeedbackDisplayCard:mode==='overlay'?ActivityFeedbackOverlay:ActivityFeedbackFlow;
      const props=mode==='flow'?{eventId:995,questions:structuredClone(qaQuestions),onComplete:()=>qaDone++}:{event,onSkip:()=>qaDone++};
      root.render(React.createElement(QueryClientProvider,{client:cache},React.createElement(AuthContext.Provider,{value:{user:{userId:991,roles:['COACH']}}},React.createElement(MemoryRouter,null,React.createElement(React.Fragment,null,React.createElement(Component,props),React.createElement(Toaster))))));
      await new Promise(r=>setTimeout(r,250));
    };
    window.qaClick = text => {const button=[...document.querySelectorAll('#feedback-qa button')].find(b=>b.textContent.trim()===text);if(!button) throw Error('Missing button '+text);button.click();};
    window.qaType=text=>{const field=document.querySelector('#feedback-qa textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,text);field.dispatchEvent(new Event('input',{bubbles:true}));};
  })()`);
  for (const width of [390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await evaluate("qaFailure='';qaRender('display')");
    await until(
      "document.body.innerText.includes('Todavía no se han generado preguntas.')",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#feedback-qa').innerText.includes('Valoración completada mediante preguntas')",
      ),
      false,
    );
    await evaluate("qaFailure='generate';qaClick('Generar preguntas con IA')");
    await until("document.querySelector('#feedback-qa [role=alert]')!==null");
    assert.equal(await evaluate("qaQuestions.length"), 0);
    await evaluate("qaFailure='disabled';qaClick('Generar preguntas con IA')");
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('están desactivadas')",
    );
    assert(await evaluate("document.querySelector('#feedback-qa').innerText.includes('Consulta con tu entrenador')"));
    await evaluate("qaFailure='model';qaClick('Generar preguntas con IA')");
    await until("document.querySelector('#feedback-qa').innerText.includes('no está configurado')");
    await evaluate("qaFailure='provider';qaClick('Generar preguntas con IA')");
    await until("document.querySelector('#feedback-qa').innerText.includes('obtener una respuesta del proveedor')");
    await evaluate("qaFailure='';qaClick('Generar preguntas con IA')");
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('Pregunta 3')",
    );
    assert(
      await evaluate(
        "document.querySelector('#feedback-qa').innerText.includes('Respondidas: 0 de 3')",
      ),
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('#feedback-qa button')].some(b=>b.textContent.includes('Generar preguntas'))",
      ),
      false,
    );
    pass(
      `${width}: demand generation, settings error, retry and visible unanswered questions`,
    );

    await evaluate("qaFailure='';qaRender('flow',true)");
    await evaluate(
      "[...document.querySelectorAll('#feedback-qa button')][0].click()",
    );
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('Pregunta 2')",
    );
    await evaluate("qaType('Me he sentido bien')");
    await evaluate("qaFailure='save';qaClick('Siguiente')");
    await until("document.querySelector('#feedback-qa [role=alert]')!==null");
    assert.equal(
      await evaluate("document.querySelector('#feedback-qa textarea').value"),
      "Me he sentido bien",
    );
    assert.equal(await evaluate("qaDone"), 0);
    assert(
      await evaluate(
        "document.querySelector('#feedback-qa').innerText.includes('Pregunta 2')",
      ),
    );
    await evaluate(
      "qaFailure='pending';qaClick('Siguiente');qaClick('Siguiente')",
    );
    await until("qaCalls.length===2");
    assert(
      await evaluate(
        "[...document.querySelectorAll('#feedback-qa button')].find(b=>b.textContent==='Siguiente').disabled",
      ),
    );
    await evaluate("qaFailure='';qaRelease()");
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('Pregunta 3')",
    );
    await evaluate("qaType('Sin molestias')");
    await evaluate(
      "qaFailure='save';[...document.querySelectorAll('#feedback-qa button')].at(-1).click()",
    );
    await until("document.querySelector('#feedback-qa [role=alert]')!==null");
    assert.equal(await evaluate("qaDone"), 0);
    await evaluate(
      "qaFailure='';[...document.querySelectorAll('#feedback-qa button')].at(-1).click()",
    );
    await until("qaDone===1");
    assert.equal(
      await evaluate("qaQuestions[0].answerText"),
      "Respuesta guardada",
    );
    pass(
      `${width}: partial resume, failed save preserves text, duplicate submit blocked and completion only after success`,
    );

    await evaluate("qaFailure='';qaRender('flow')");
    await evaluate(
      "[...document.querySelectorAll('#feedback-qa button')][1].click()",
    );
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('Pregunta 1')",
    );
    await evaluate("qaFailure='save';qaClick('Bien')");
    await until("document.querySelector('#feedback-qa [role=alert]')!==null");
    assert(
      await evaluate(
        "document.querySelector('#feedback-qa').innerText.includes('Pregunta 1')",
      ),
    );
    await evaluate("qaFailure='';qaClick('Bien')");
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('Pregunta 2')",
    );
    pass(`${width}: multiple-choice answers also stay on the failed question`);

    await evaluate("qaFailure='load';qaRender('overlay')");
    await until("document.querySelector('#feedback-qa [role=alert]')!==null");
    assert.equal(await evaluate("qaDone"), 0);
    await evaluate("qaFailure='';qaClick('Reintentar')");
    await until(
      "document.querySelector('#feedback-qa').innerText.includes('Omitir')",
    );
    await evaluate(
      "qaFailure='skip';[...document.querySelectorAll('#feedback-qa button')].find(b=>b.textContent.includes('Omitir')).click()",
    );
    await until("document.body.innerText.includes('No se ha podido omitir')");
    assert.equal(await evaluate("qaDone"), 0);
    pass(
      `${width}: load and skip errors do not silently dismiss the questionnaire`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `Passed ${passed} questionnaire scenarios without external AI calls.`,
  );
} finally {
  try {
    await call("Page.close");
  } finally {
    ws.close();
  }
}
