/**
 * Browser regression checks against an isolated Vite server and Chromium CDP.
 * Start Vite on 5188 and Chromium with --remote-debugging-port=9331, then run:
 * node scripts/tests/chat-activity-notice.browser.mjs
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
    const source = await fetch('/src/components/chatbot/chat-window.tsx').then(r => r.text());
    const version = source.match(/react[.]js[?]v=([^\"]+)/)[1];
    const reactModule = await import('/node_modules/.vite/deps/react.js?v=' + version);
    const React = reactModule.default ?? reactModule;
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js?v=' + version);
    const { createRoot } = domModule.default ?? domModule;
    const syncModule = await import('/node_modules/.vite/deps/react-dom.js?v=' + version);
    const { flushSync } = syncModule.default ?? syncModule;
    const { QueryClient, QueryClientProvider } = await import('/node_modules/.vite/deps/@tanstack_react-query.js?v=' + version);
    const { MemoryRouter } = await import('/node_modules/.vite/deps/react-router-dom.js?v=' + version);
    const { AuthContext } = await import('/src/contexts/auth/context/auth-context.tsx');
    const { SpaceContext } = await import('/src/contexts/space/context/space-context.tsx');
    const { ChatbotProvider, useChatbot } = await import('/src/contexts/chatbot.tsx');
    const { ChatWindow } = await import('/src/components/chatbot/chat-window.tsx');
    const { MessageMessages } = await import('/src/components/messages/message-messages.tsx');
    const { MessagesAPI } = await import('/src/api/messages/messages.api.ts');
    const { default: client } = await import('/src/utils/axios.ts');
    const me = {userId:991,roles:['COACH'],firstName:'Coach',lastName:'Test'};
    const thread = {messageThreadId:992,title:'Athlete test',createdAt:new Date().toISOString(),participants:[]};
    localStorage.clear();
    const socket = {connected:false,on(){},off(){},emit(){}};
    MessagesAPI.getSocket = () => socket;
    window.qaEventMode = 'valid';
    window.qaKind = 'COMMENT';
    window.qaWrites = [];
    for (const method of ['post','put','patch','delete']) client[method] = async (...args) => {qaWrites.push({method,args});throw Error('Unexpected write in browser regression');};
    client.get = async (url) => {
      let data = [];
      if (url === '/user/me') data = me;
      else if (url === '/messages/threads') data = [thread];
      else if (url === '/messages/threads/992') data = thread;
      else if (url === '/messages/threads/992/messages') data = [{messageId:993,messageThreadId:992,senderId:994,content:'',createdAt:new Date().toISOString(),readReceipts:[{userId:991}],activityNotice:{kind:qaKind,eventId:995,eventName:'Test activity',rpe:5}}];
      else if (url === '/event/995') {
        if (qaEventMode === 'error') throw Error('Unavailable activity');
        if (qaEventMode === 'loading') return new Promise(() => {});
        data = {eventId:995,athleteId:996,type:'ACTIVITY',sport:'RUNNING',name:'Test activity',startDate:'2026-09-27T08:00:00Z',endDate:'2026-09-27T09:00:00Z',movingTime:3600,distance:10000,averageSpeed:2.78,elevationGain:150,description:'Test comment',rpe:5,feedbackQuestions:[]};
      } else if (url.includes('/event/995/')) data = null;
      return {data};
    };
    const container = document.createElement('div');
    container.id = 'chat-qa';
    document.body.append(container);
    document.getElementById('root').style.display = 'none';
    const root = createRoot(container);
    function Harness({page}) {
      const chat = useChatbot();
      React.useEffect(() => {chat.setChatWidth(Math.min(400,innerWidth-48));}, [chat.setChatWidth]);
      return React.createElement(React.Fragment,null,
        React.createElement('button',{id:'qa-open',onClick:chat.openChat},'Open test chat'),
        page ? React.createElement(MessageMessages,{messageThreadId:992}) : React.createElement(ChatWindow));
    }
    window.qaRender = async (kind='COMMENT', mode='valid', page=false) => {
      flushSync(() => root.render(null));
      await new Promise(r => setTimeout(r,100));
      qaKind = kind; qaEventMode = mode;
      const cache = new QueryClient({defaultOptions:{queries:{retry:false}}});
      root.render(React.createElement(QueryClientProvider,{client:cache},
        React.createElement(AuthContext.Provider,{value:{user:me}},
          React.createElement(SpaceContext.Provider,{value:{space:'COACH'}},
            React.createElement(MemoryRouter,null,
              React.createElement(ChatbotProvider,null,React.createElement(Harness,{page})))))));
      await new Promise(r => setTimeout(r,200));
    };
  })()`);
  const click = async (selector, touch = false) => {
    const point = await evaluate(
      `(() => {const element=document.querySelector(${JSON.stringify(selector)});if (!element) throw Error('Missing '+${JSON.stringify(selector)});element.scrollIntoView({block:'nearest'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    if (touch) {
      await call("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [point],
      });
      await call("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
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
    }
  };
  const openActivity = async (touch) => {
    await until(
      "Array.from(document.querySelectorAll('#chat-qa button')).some(b=>b.textContent.includes('Abrir actividad'))",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('#chat-qa button')).find(b=>b.textContent.includes('Abrir actividad')).id='qa-activity'",
    );
    await click("#qa-activity", touch);
    await until(
      "document.querySelector('[data-slot=dialog-content]') !== null",
    );
    await delay(300);
    // Modal pointer suppression can make a visually covered dialog clickable.
    // Temporarily restore the chat button's hit testing to check the actual
    // stacking order, then restore its original pointer behavior immediately.
    const coveredByModal = await evaluate(`(() => {
      const button=document.querySelector('#chat-qa button[title="Cerrar"]');
      if (!button) return true;
      const previous=button.style.pointerEvents;
      button.style.pointerEvents='auto';
      try {
        const r=button.getBoundingClientRect();
        const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return !!top?.closest('[data-slot=dialog-content], [data-slot=dialog-overlay]');
      } finally {button.style.pointerEvents=previous;}
    })()`);
    assert.equal(
      coveredByModal,
      true,
      "An open activity must cover the chat close button instead of leaving it visibly blocked",
    );
  };
  const closeActivity = async (touch) => {
    // Use a physical click/tap: element.click() bypasses modal pointer blocking.
    const reachable = await evaluate(`(() => {
      const button=document.querySelector('[data-slot=dialog-content] > button:last-child');
      const r=button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    })()`);
    assert.equal(
      reachable,
      true,
      "Activity close button must be above the chat and its backdrop",
    );
    await click("[data-slot=dialog-content] > button:last-child", touch);
    await until("!document.querySelector('[data-slot=dialog-content]')");
    await until("getComputedStyle(document.body).pointerEvents !== 'none'");
  };
  for (const width of [390, 1280]) {
    const touch = width < 500;
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: touch,
    });
    for (const kind of ["COMMENT", "RPE", "ACTIVITY"]) {
      await evaluate(`qaRender('${kind}')`);
      await click("#qa-open", touch);
      await delay(500);
      await openActivity(touch);
      await until(
        "document.querySelector('[data-slot=dialog-content]').innerText.includes('Test comment')",
      );
      await closeActivity(touch);
      await click('#chat-qa button[title="Cerrar"]', touch);
      await until(`!document.querySelector('#chat-qa button[title="Cerrar"]')`);
      await click("#qa-open", touch);
      await delay(500);
      await openActivity(touch);
      await closeActivity(touch);
      await click('#chat-qa button[title="Cerrar"]', touch);
      await until(`!document.querySelector('#chat-qa button[title="Cerrar"]')`);
      pass(
        `${width}: ${kind} activity and chat close and reopen with ${touch ? "touch" : "mouse"}`,
      );
    }
    for (const mode of ["error", "loading"]) {
      await evaluate(`qaRender('COMMENT','${mode}')`);
      await click("#qa-open", touch);
      await delay(500);
      await openActivity(touch);
      if (mode === "error")
        await until(
          "document.querySelector('[data-slot=dialog-content] [role=alert]') !== null",
        );
      await closeActivity(touch);
      await click('#chat-qa button[title="Cerrar"]', touch);
      await until(`!document.querySelector('#chat-qa button[title="Cerrar"]')`);
      pass(`${width}: ${mode} activity does not leave chat blocked`);
    }
    await evaluate("qaRender('RPE','valid',true)");
    await openActivity(touch);
    await closeActivity(touch);
    pass(`${width}: activity also closes from the full messages page`);
  }
  assert.deepEqual(await evaluate("qaWrites"), []);
  assert.deepEqual(errors, []);
  console.log(
    `Passed ${passed} chat scenarios without real API or messaging calls.`,
  );
} finally {
  try {
    await call("Page.close");
  } finally {
    ws.close();
  }
}
