/** Message search browser regression checks. Run with isolated Vite (5188) and Chromium CDP (9331).
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

  await evaluate(`(async () => {
    const source=await fetch('/src/components/chatbot/chat-window.tsx').then(r=>r.text());
    const version=source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const React=(await import('/node_modules/.vite/deps/react.js?v='+version)).default;
    const dom=await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);const {createRoot}=dom.default??dom;
    const sync=await import('/node_modules/.vite/deps/react-dom.js?v='+version);const {flushSync}=sync.default??sync;
    const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js?v='+version);
    const {MemoryRouter}=await import('/node_modules/.vite/deps/react-router-dom.js?v='+version);
    const {AuthContext}=await import('/src/contexts/auth/context/auth-context.tsx');
    const {SpaceContext}=await import('/src/contexts/space/context/space-context.tsx');
    const {ChatbotProvider,useChatbot}=await import('/src/contexts/chatbot.tsx');
    const {ChatWindow}=await import('/src/components/chatbot/chat-window.tsx');
    const {MessagesPage}=await import('/src/pages/dashboard/messages/index.tsx');
    const {MessagesAPI}=await import('/src/api/messages/messages.api.ts');
    const {default:client}=await import('/src/utils/axios.ts');
    const {setLocale}=await import('/src/paraglide/runtime.js');setLocale('es',{reload:false});
    const me={userId:991,roles:['COACH'],firstName:'Coach',lastName:'Test'};
    window.qaThreads=[
      {messageThreadId:101,title:'Atleta Uno',createdAt:'2026-01-01',participants:[],messages:Array.from({length:65},(_,i)=>({messageId:i+1001,messageThreadId:101,senderId:992,sender:{firstName:'María',lastName:'López'},content:i===0?'Sesión montaña antigua':i===64?'Final reciente':'Rodaje suave '+i,createdAt:new Date(Date.UTC(2024,0,i+1)).toISOString(),readReceipts:[{userId:991}]}))},
      {messageThreadId:102,title:'Atleta Dos',createdAt:'2026-02-01',participants:[],messages:[{messageId:2001,messageThreadId:102,senderId:993,content:'Sesión montaña distinta',createdAt:'2026-02-01T10:00:00Z',readReceipts:[{userId:991}]}]}
    ];
    localStorage.clear();
    const listeners=new Map();
    const socket={connected:false,on(name,fn){const list=listeners.get(name)??[];list.push(fn);listeners.set(name,list);},off(name,fn){if(fn)listeners.set(name,(listeners.get(name)??[]).filter(f=>f!==fn));else listeners.delete(name);},emit(){}};
    window.qaPrepareSend=()=>{
      socket.connected=true;
      const e=document.querySelector('#search-qa textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Mensaje de prueba');
      e.dispatchEvent(new Event('input',{bubbles:true}));
    };
    MessagesAPI.getSocket=()=>socket;MessagesAPI.connectSocket=async()=>{};
    window.qaSocket=(name,message)=>{for(const fn of [...(listeners.get(name)??[])])fn({message});};
    window.qaWrites=[];window.qaFail=false;
    for(const method of ['post','put','patch','delete'])client[method]=async()=>{qaWrites.push(method);throw Error('Unexpected write');};
    client.get=async url=>{
      if(url==='/user/me')return {data:me};
      if(url==='/messages/threads'){if(qaFail)throw Error('Test offline');return {data:structuredClone(qaThreads)};}
      const parts=url.split('/');
      if(parts[1]==='messages'&&parts[2]==='threads'&&Number(parts[3])){const thread=qaThreads.find(t=>t.messageThreadId===Number(parts[3]));return {data:structuredClone(parts[4]==='messages'?thread.messages:thread)};}
      return {data:[]};
    };
    const container=document.createElement('div');container.id='search-qa';document.body.append(container);document.getElementById('root').style.display='none';
    const root=createRoot(container),h=React.createElement;
    function Harness({page}){const chat=useChatbot();React.useEffect(()=>{chat.setChatWidth(Math.min(440,innerWidth-48));},[chat.setChatWidth]);return h(React.Fragment,null,h('button',{id:'qa-open',onClick:chat.openChat},'Open'),page?h(MessagesPage):h(ChatWindow));}
    window.qaRender=async(page=false)=>{flushSync(()=>root.render(null));await new Promise(r=>setTimeout(r,60));window.qaCache=new QueryClient({defaultOptions:{queries:{retry:false}}});root.render(h(QueryClientProvider,{client:qaCache},h(AuthContext.Provider,{value:{user:me}},h(SpaceContext.Provider,{value:{space:'COACH'}},h(MemoryRouter,null,h(ChatbotProvider,null,h(Harness,{page})))))));await new Promise(r=>setTimeout(r,400));};
    window.qaType=text=>{const e=document.querySelector('[role=dialog] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}));};
  })()`);
  const searchButton = `[...document.querySelectorAll('button[aria-label="Buscar mensajes"]')].filter(e=>e.getBoundingClientRect().width>0).at(-1)`;
  const button = (text) =>
    `[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  const result = (text) =>
    `[...document.querySelectorAll('[role="dialog"] li button')].find(e=>e.textContent.includes(${JSON.stringify(text)}))`;
  const openSearch = async () => {
    await clickElement(searchButton);
    await until(
      `document.querySelector('[role="dialog"] input[type="search"]')`,
    );
    await delay(250);
  };
  const closeSearch = async () => {
    await clickElement(
      `document.querySelector('[role="dialog"] [data-slot="dialog-close"], [role="dialog"] button:has(.lucide-x)')`,
    );
    await until(`!document.querySelector('[role="dialog"]')`);
  };
  for (const width of [390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await evaluate("qaRender()");
    await clickElement(`document.querySelector('#qa-open')`);
    await delay(500);
    await openSearch();
    await evaluate(`qaType('SESION MONTANA')`);
    await until(`document.querySelectorAll('[role="dialog"] li').length===1`);
    assert.equal(
      await evaluate(`${button("Este chat")}.getAttribute('aria-pressed')`),
      "true",
    );
    await clickElement(button("Todos mis chats"));
    await until(`document.querySelectorAll('[role="dialog"] li').length===2`);
    await clickElement(result("Atleta Dos"));
    await until(
      `document.querySelector('[data-search-match="true"][data-message-id="2001"]')`,
    );
    assert.equal(
      await evaluate(`document.activeElement.dataset.messageId`),
      "2001",
    );
    pass(
      width +
        ": search scopes ignore case/accents and open the matching conversation/message",
    );
    await openSearch();
    await clickElement(button("Todos mis chats"));
    await evaluate(`qaType('antigua')`);
    await until(`document.querySelectorAll('[role="dialog"] li').length===1`);
    await clickElement(result("antigua"));
    await until(
      `document.querySelector('[data-search-match="true"][data-message-id="1001"]')`,
    );
    assert.equal(
      await evaluate(
        `(()=>{const r=document.querySelector('[data-search-match="true"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`,
      ),
      true,
    );
    pass(
      width +
        ": old matching message scrolls into view instead of jumping to the newest",
    );
    await openSearch();
    await evaluate(`qaType('zzzznotfound')`);
    await until(
      `document.querySelector('[role="dialog"]').textContent.includes('No se han encontrado')`,
    );
    await evaluate(`qaType('Maria Lopez')`);
    await until(`document.querySelectorAll('[role="dialog"] li').length===50`);
    await clickElement(button("Mostrar más"));
    await until(`document.querySelectorAll('[role="dialog"] li').length===65`);
    assert.equal(
      await evaluate(`document.documentElement.scrollWidth<=innerWidth`),
      true,
    );
    pass(
      width +
        ": no-result state, sender search and all results remain reachable without overflow",
    );
    await closeSearch();
  }
  const checkSendAfterSearch = async () => {
    await evaluate("qaPrepareSend()");
    await clickElement(
      `document.querySelector('#search-qa button:has(.lucide-send)')`,
    );
    await until(`!document.querySelector('[data-search-match="true"]')`);
    await until(
      `(()=>{const r=document.querySelector('[data-message-id="1065"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`,
    );
  };
  await checkSendAfterSearch();
  pass(
    "Sending from the floating chat clears search focus and returns to recent messages",
  );
  // Verify the real websocket handler keeps complete histories searchable.
  await openSearch();
  await evaluate(`qaType('Novedad')`);
  await evaluate(
    `qaSocket('new_message',{messageId:3001,messageThreadId:101,senderId:991,content:'Novedad recibida',createdAt:'2026-03-01T10:00:00Z',readReceipts:[]})`,
  );
  await until(`document.querySelectorAll('[role="dialog"] li').length===1`);
  await evaluate(
    `qaSocket('message_updated',{messageId:3001,messageThreadId:101,senderId:991,content:'Texto corregido',createdAt:'2026-03-01T10:00:00Z',updatedAt:'2026-03-01T11:00:00Z',readReceipts:[]})`,
  );
  await until(`document.querySelectorAll('[role="dialog"] li').length===0`);
  await evaluate(`qaType('corregido')`);
  await until(`document.querySelectorAll('[role="dialog"] li').length===1`);
  pass("New and edited messages immediately update search matches");
  await closeSearch();
  // The same control works on the full messages page, including narrow web viewports.
  for (const width of [390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await evaluate("qaRender(true)");
    await openSearch();
    await evaluate(`qaType('antigua')`);
    await until(`document.querySelectorAll('[role="dialog"] li').length===1`);
    await clickElement(result("antigua"));
    await until(
      `document.querySelector('[data-search-match="true"][data-message-id="1001"]')`,
    );
    pass(width + ": full messages page opens the selected old message");
  }
  await checkSendAfterSearch();
  pass(
    "Sending from the messages page returns to recent messages after searching",
  );
  await evaluate("qaFail=true");
  await openSearch();
  await until(`document.querySelector('[role="dialog"] [role="alert"]')`);
  await evaluate("qaFail=false");
  await clickElement(button("Reintentar"));
  await evaluate(`qaType('antigua')`);
  await until(`document.querySelectorAll('[role="dialog"] li').length===1`);
  pass("Loading errors are shown and retry restores results");
  assert.deepEqual(await evaluate("qaWrites"), []);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(passed + " browser scenarios passed");
} finally {
  await call("Page.close").catch(() => {});
  ws.close();
}
