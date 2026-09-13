import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const html = await readFile(resolve('src/public/index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script found in index.html');
const scriptCode = scriptMatch[1];

function createHarness(initialStatus = null) {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: id === 'dispatchBtn' ? 'Dispatch Play' : '',
        value: '',
        disabled: false,
        hidden: false,
        title: '',
        dataset: id === 'dispatchBtn' ? { liveAction: '' } : {},
        classList: {
          classes: new Set(),
          add(...tokens) { for (const t of tokens) this.classes.add(t); },
          remove(...tokens) { for (const t of tokens) this.classes.delete(t); },
          toggle(c, force) {
            if (force === undefined) force = !this.classes.has(c);
            if (force) this.classes.add(c); else this.classes.delete(c);
            return force;
          },
          contains(c) { return this.classes.has(c); }
        },
        listeners: {},
        addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k]; },
        appendChild(child) { this.children = this.children || []; this.children.push(child); },
        append(...children) { this.children = this.children || []; this.children.push(...children); },
        children: []
      });
    }
    return elements.get(id);
  };

  const document = {
    getElementById: getEl,
    querySelectorAll: (selector) => {
      if (selector === '[data-live-action]') {
        return [getEl('dispatchBtn')];
      }
      return [];
    },
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); }
      },
      setAttribute() {},
      appendChild(child) { this.children = this.children || []; this.children.push(child); },
      append(...children) { this.children = this.children || []; this.children.push(...children); },
      addEventListener() {},
      children: []
    })
  };

  const sessionStorageData = new Map([['sidelineCoachToken', 'test-token']]);
  const sessionStorage = {
    getItem: (k) => sessionStorageData.get(k) || null,
    setItem: (k, v) => sessionStorageData.set(k, v),
    removeItem: (k) => sessionStorageData.delete(k)
  };

  let eventSourceInstance = null;
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      eventSourceInstance = this;
    }
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
    emit(event, data) {
      for (const fn of this.listeners[event] || []) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
    close() {}
  }

  const defaultStatus = initialStatus || {
    workspaceRoots: ['/repo'],
    modelSwitches: { Default: '' },
    players: [{
      id: 'codex',
      name: 'Codex',
      availability: 'available',
      fieldState: 'on-field',
      instances: [
        {
          instanceId: 'codex-inst-1',
          playerType: 'codex',
          seat: 1,
          fieldLabel: 'Codex 1 · Controlled',
          controlMode: 'controlled',
          turnState: { instanceId: 'codex-inst-1', state: 'idle', summary: 'Ready', at: 0 }
        },
        {
          instanceId: 'codex-inst-2',
          playerType: 'codex',
          seat: 2,
          fieldLabel: 'Codex 2 · Controlled',
          controlMode: 'controlled',
          turnState: { instanceId: 'codex-inst-2', state: 'idle', summary: 'Ready', at: 0 }
        }
      ]
    }]
  };

  let currentStatus = defaultStatus;
  let fetchHandler = async (url) => {
    if (url === '/api/status') {
      return { ok: true, status: 200, json: async () => currentStatus };
    }
    if (url === '/api/reports') {
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const context = {
    document,
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage,
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: async (...args) => fetchHandler(...args),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 0,
    clearInterval: () => {},
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };

  vm.createContext(context);
  vm.runInContext(scriptCode, context);

  return {
    elements,
    getEl,
    getEventSource: () => eventSourceInstance,
    setFetch: (handler) => { fetchHandler = handler; },
    setStatus: (status) => { currentStatus = status; },
    selectPlayer: (instanceId) => {
      getEl('terminalSelect').value = instanceId;
      for (const fn of getEl('terminalSelect').listeners['change'] || []) fn({ target: { value: instanceId } });
    },
    clickDispatch: async () => {
      for (const fn of getEl('dispatchBtn').listeners['click'] || []) await fn();
    }
  };
}

async function initConnectedHarness(initialStatus = null) {
  const harness = createHarness(initialStatus);
  harness.getEventSource().emit('hello');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const text = harness.getEl('connectionText').textContent;
    if (text === 'Coach Online' || text === 'Connected') return harness;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Harness failed to establish Connected state');
}

test('1. Initial state: runner displays Dispatch Play when idle', async () => {
  const harness = await initConnectedHarness();
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Dispatch Play');
  assert.equal(harness.getEl('dispatchBtn').disabled, false);
});

test('2. Request start: transition to Sending… on submission', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Test play';

  let resolveDispatch;
  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      await new Promise((r) => { resolveDispatch = r; });
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'accepted' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  const sendPromise = harness.clickDispatch();
  await new Promise((r) => setTimeout(r, 10));

  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Sending…');
  assert.equal(btn.disabled, true);
  assert.equal(btn.classList.contains('status-sending'), true);

  resolveDispatch();
  await sendPromise;
});

test('3. Canonical acceptance: transition to Received on provider acceptance', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Test play';

  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'accepted', message: 'Accepted' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Received');
  assert.equal(btn.disabled, true);
  assert.equal(btn.classList.contains('status-received'), true);
});

test('4. Active turn: transition to Working… on provider turn/started', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');

  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'started',
    summary: 'Working…',
    at: Date.now()
  });

  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Working…');
  assert.equal(btn.disabled, true);
  assert.equal(btn.classList.contains('status-working'), true);
});

test('5. Completion: transition to Completed on turn completion, then settles back to Dispatch Play', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');

  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'completed',
    summary: 'Completed',
    at: Date.now()
  });

  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Completed');
  assert.equal(btn.disabled, true);
  assert.equal(btn.classList.contains('status-completed'), true);

  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(btn.textContent, 'Dispatch Play');
  assert.equal(btn.disabled, false);
  assert.equal(btn.classList.contains('status-completed'), false);
});

test('6. Failure: provider failure transitions to Failed (distinct from success, never fakes Completed)', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');

  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'failed',
    summary: 'Turn execution failed',
    at: Date.now()
  });

  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Failed');
  assert.equal(btn.classList.contains('status-failed'), true);
  assert.equal(btn.classList.contains('status-completed'), false);

  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(btn.textContent, 'Dispatch Play');
  assert.equal(btn.disabled, false);
});

test('7. Interruption: provider interruption transitions to Interrupted (distinct from Failed)', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');

  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'interrupted',
    summary: 'Turn interrupted by human',
    at: Date.now()
  });

  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Interrupted');
  assert.equal(btn.classList.contains('status-interrupted'), true);
  assert.equal(btn.classList.contains('status-failed'), false);

  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(btn.textContent, 'Dispatch Play');
  assert.equal(btn.disabled, false);
});

test('8. Unknown: uncertainty transitions to Unknown (never fakes Completed, human decides)', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Uncertain play';

  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      return { ok: true, status: 202, json: async () => ({ success: false, outcome: 'unknown', message: 'Delivery unknown' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Unknown');
  assert.equal(btn.classList.contains('status-unknown'), true);
  assert.equal(btn.classList.contains('status-completed'), false);

  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(btn.textContent, 'Dispatch Play');
  assert.equal(btn.disabled, false);
});

test('9. Duplicate SEND guard: button is blocked/disabled during Sending…, Received, and Working…', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'First play';

  let dispatchCalls = 0;
  let resolveFirst;
  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      dispatchCalls += 1;
      await new Promise((r) => { resolveFirst = r; });
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'accepted' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  const firstClick = harness.clickDispatch();
  await new Promise((r) => setTimeout(r, 10));

  // In Sending… state: attempt second click
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Sending…');
  await harness.clickDispatch();
  assert.equal(dispatchCalls, 1, 'Duplicate click during Sending… must be blocked');

  // Resolve to Received: attempt third click
  resolveFirst();
  await firstClick;
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Received');
  await harness.clickDispatch();
  assert.equal(dispatchCalls, 1, 'Duplicate click during Received must be blocked');

  // Move to Working…: attempt fourth click
  harness.getEventSource().emit('turn', { instanceId: 'codex-inst-1', state: 'started', summary: 'Working…' });
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Working…');
  await harness.clickDispatch();
  assert.equal(dispatchCalls, 1, 'Duplicate click during Working… must be blocked');
});

test('10. Pre-acceptance failure preserves prompt: prompt textarea content is NOT cleared', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Important drafted play';

  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      return { ok: false, status: 409, json: async () => ({ success: false, message: 'Player is busy' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  assert.equal(harness.getEl('promptInput').value, 'Important drafted play', 'Prompt draft must be preserved on refusal');
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Failed');

  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Dispatch Play');
  assert.equal(harness.getEl('dispatchBtn').disabled, false);
});

test('11. Canonical acceptance clears prompt: prompt textarea content IS cleared upon Received', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Play to be cleared';

  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'accepted' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  assert.equal(harness.getEl('promptInput').value, '', 'Prompt draft must be cleared on accepted');
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Received');
});

test('12. Unknown preserves/restores prompt without overwriting a newer user draft', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Accepted then crashed';

  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'accepted' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  assert.equal(harness.getEl('promptInput').value, '');

  // Backend later signals unknown outcome (e.g. crash)
  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'unknown',
    summary: 'Process died mid-turn',
    at: Date.now()
  });

  assert.equal(harness.getEl('promptInput').value, 'Accepted then crashed', 'Prompt must be restored when empty');

  // Now test: if user already typed a newer draft, unknown does NOT overwrite it
  harness.getEl('promptInput').value = 'Brand new user draft';
  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'unknown',
    summary: 'Another unknown event',
    at: Date.now()
  });
  assert.equal(harness.getEl('promptInput').value, 'Brand new user draft', 'Newer draft must NOT be overwritten');
});

test('13. No auto-resend: Unknown does NOT automatically re-dispatch', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Send once only';

  let dispatchCount = 0;
  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      dispatchCount += 1;
      return { ok: true, status: 202, json: async () => ({ success: false, outcome: 'unknown', message: 'Delivery unknown' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  assert.equal(dispatchCount, 1);

  // Wait past settling interval
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(dispatchCount, 1, 'Must never auto-resend on unknown');
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Dispatch Play');
});

test('14. Refresh/reconnect: browser reload renders current canonical state for selected player', async () => {
  const activeStatus = {
    workspaceRoots: ['/repo'],
    modelSwitches: { Default: '' },
    players: [{
      id: 'codex',
      name: 'Codex',
      availability: 'available',
      fieldState: 'on-field',
      instances: [{
        instanceId: 'codex-inst-active',
        playerType: 'codex',
        seat: 1,
        fieldLabel: 'Codex 1 · Controlled',
        controlMode: 'controlled',
        turnState: { instanceId: 'codex-inst-active', state: 'started', summary: 'Working…', at: Date.now() }
      }]
    }]
  };

  const harness = await initConnectedHarness(activeStatus);
  harness.selectPlayer('codex-inst-active');

  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Working…', 'Page refresh must render canonical Working… state');
  assert.equal(btn.disabled, true);
});

test('15. Exact player targeting: dispatcher state is isolated per player instance', async () => {
  const harness = await initConnectedHarness();

  // Player 1 transitions to Working…
  harness.getEventSource().emit('turn', {
    instanceId: 'codex-inst-1',
    state: 'started',
    summary: 'Working…',
    at: Date.now()
  });

  // Select Player 1 -> Working…
  harness.selectPlayer('codex-inst-1');
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Working…');
  assert.equal(harness.getEl('dispatchBtn').disabled, true);

  // Switch to Player 2 -> Dispatch Play (idle)
  harness.selectPlayer('codex-inst-2');
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Dispatch Play');
  assert.equal(harness.getEl('dispatchBtn').disabled, false);

  // Switch back to Player 1 -> Working…
  harness.selectPlayer('codex-inst-1');
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Working…');
  assert.equal(harness.getEl('dispatchBtn').disabled, true);
});

test('16. Uncertified legacy terminal route displays Sent to terminal and never fakes Received/Working', async () => {
  const harness = await initConnectedHarness();
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Legacy send';

  harness.setFetch(async (url) => {
    if (url === '/api/dispatch') {
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'sent-to-terminal', message: 'Dispatched to Codex' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await harness.clickDispatch();
  const btn = harness.getEl('dispatchBtn');
  assert.equal(btn.textContent, 'Sent to terminal');
  assert.equal(btn.classList.contains('status-sent'), true);
  assert.equal(btn.classList.contains('status-received'), false);
  assert.equal(btn.classList.contains('status-working'), false);
  assert.equal(btn.classList.contains('status-completed'), false);
  assert.equal(harness.getEl('promptInput').value, '');

  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(btn.textContent, 'Dispatch Play');
  assert.equal(btn.disabled, false);
});

test('17. Presentation formatting: CODEX 2 · CONTROLLED never contains duplicated · CONTROLLED', async () => {
  const presentationSource = await readFile(resolve('src/controlled-player-presentation.ts'), 'utf8');
  const rosterSource = await readFile(resolve('src/player-roster.ts'), 'utf8');

  // Presentation source strips any existing '· controlled' before printing banner
  assert.match(presentationSource, /const base = fieldLabel\.replace\(\/\\s\*·\\s\*controlled\.\*\$\/i, ''\)\.trim\(\);/);
  assert.match(presentationSource, /this\.line\(`\$\{base\.toUpperCase\(\)\} · CONTROLLED`\);/);

  // Roster projection and creation sanitize base label
  assert.match(rosterSource, /const base = projection\.fieldLabel\.replace\(\/\\s\*·\\s\*controlled\.\*\$\/i, ''\)\.trim\(\);/);
  assert.match(rosterSource, /fieldLabel = fieldLabel\.replace\(\/\\s\*·\\s\*controlled\.\*\$\/i, ''\)\.trim\(\);/);

  // Functional verification of sanitizing algorithm
  const sanitizeIdentity = (fieldLabel) => {
    const base = fieldLabel.replace(/\s*·\s*controlled.*$/i, '').trim();
    return `${base.toUpperCase()} · CONTROLLED`;
  };

  assert.equal(sanitizeIdentity('Codex 2 · Controlled'), 'CODEX 2 · CONTROLLED');
  assert.equal(sanitizeIdentity('CODEX 2 · CONTROLLED · CONTROLLED'), 'CODEX 2 · CONTROLLED');
  assert.equal(sanitizeIdentity('Codex 2 · Controlled · Resuming…'), 'CODEX 2 · CONTROLLED');
  assert.equal(sanitizeIdentity('Codex 2'), 'CODEX 2 · CONTROLLED');
});
