import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const html = await readFile(resolve('src/public/index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script found in index.html');
const scriptCode = scriptMatch[1];

function createHarness(initialStatus = null, initialNow = Date.now()) {
  const elements = new Map();
  const intervals = [];
  let now = initialNow;
  let clipboardHandler = async () => {};
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
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => {},
    Date: class extends Date { static now() { return now; } },
    console,
    navigator: { clipboard: { writeText: (text) => clipboardHandler(text) } },
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
    getStatus: () => currentStatus,
    setNow: (value) => { now = value; },
    tickIntervals: (ms) => { for (const interval of intervals.filter((item) => item.ms === ms)) interval.fn(); },
    setClipboard: (handler) => { clipboardHandler = handler; },
    click: async (id) => { for (const fn of getEl(id).listeners['click'] || []) await fn(); },
    selectPlayer: (instanceId) => {
      getEl('terminalSelect').value = instanceId;
      for (const fn of getEl('terminalSelect').listeners['change'] || []) fn({ target: { value: instanceId } });
    },
    clickDispatch: async () => {
      for (const fn of getEl('dispatchBtn').listeners['click'] || []) await fn();
    }
  };
}

async function initConnectedHarness(initialStatus = null, initialNow = Date.now()) {
  const harness = createHarness(initialStatus, initialNow);
  harness.getEventSource().emit('hello');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const text = harness.getEl('connectionText').textContent;
    if (text === 'Coach Online' || text === 'Connected') return harness;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Harness failed to establish Connected state');
}

async function initReportHarness(reportItems) {
  const harness = createHarness();
  harness.setFetch(async (url) => {
    if (url === '/api/status') return { ok: true, status: 200, json: async () => harness.getStatus() };
    if (url === '/api/reports/rescan') return { ok: true, status: 200, json: async () => ({ message: 'Incoming refreshed.' }) };
    if (String(url).startsWith('/api/reports')) return { ok: true, status: 200, json: async () => reportItems };
    return { ok: true, status: 200, json: async () => ({}) };
  });
  harness.getEventSource().emit('hello');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (harness.getEl('connectionText').textContent === 'Coach Online') return harness;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
  throw new Error('Report harness failed to connect');
}

test('1. Initial state: runner displays Dispatch Play when idle', async () => {
  const harness = await initConnectedHarness();
  assert.equal(harness.getEl('dispatchBtn').textContent, 'Dispatch Play');
  assert.equal(harness.getEl('dispatchBtn').disabled, false);
});

// Tests 2-16, 18 and 22 encoded the pre-Q2.10F.2 Dispatcher state machine (turn-derived
// Received/Working/Completed button states, selection-coupled execution, the legacy
// `outcome` reply shape). Q2.10F.2 Slice B replaced that contract; its regression proof
// lives in test/q2-10f-2-browser-execution-store.test.mjs.

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

test('19. Normal report preview hides provenance without mutating the underlying report or human body', async () => {
  const marker = '<!-- sideline-provenance: {"gameId":"game-1","playerInstanceId":"codex-12345678"} -->';
  const first = {
    agent: 'Codex', filename: 'Result.md', project: 'Game', path: 'Reports/Codex/Result.md', mtime: 10,
    content: `${marker}\n# Human result\n\nBody stays intact.\n\n    npm test`
  };
  const harness = await initReportHarness([first]);
  assert.equal(harness.getEl('reportPreviewBody').textContent, '# Human result\n\nBody stays intact.\n\n    npm test');
  assert.equal(first.content.startsWith(marker), true, 'underlying report data retains provenance');
  assert.match(first.content, /Body stays intact/);
});

test('20. Copy acknowledgement follows real clipboard success, copies human content, and resets on report selection', async () => {
  const marker = '<!-- sideline-provenance: {"gameId":"game-1"} -->';
  const items = [
    { agent: 'Codex', filename: 'One.md', project: 'Game', path: 'Reports/One.md', mtime: 1, content: `${marker}\n# One` },
    { agent: 'Claude', filename: 'Two.md', project: 'Game', path: 'Reports/Two.md', mtime: 2, content: '# Two' }
  ];
  const harness = await initReportHarness(items);
  let copied;
  let finishCopy;
  harness.setClipboard((text) => {
    copied = text;
    return new Promise((resolveCopy) => { finishCopy = resolveCopy; });
  });

  const copying = harness.click('copyReportBtn');
  await Promise.resolve();
  assert.equal(harness.getEl('copyReportBtn').textContent, 'Copying…');
  assert.equal(harness.getEl('copyReportBtn').classList.contains('copy-success'), false, 'success is not claimed early');
  finishCopy();
  await copying;
  assert.equal(copied, '# One', 'Dad-mode copy excludes machine provenance without mutating the report');
  assert.equal(harness.getEl('copyReportBtn').textContent, '✓ Report copied');
  assert.equal(harness.getEl('copyReportBtn').classList.contains('copy-success'), true);

  const select = harness.getEl('reportSelect');
  select.value = '1';
  for (const listener of select.listeners.change || []) listener({ target: select });
  assert.equal(harness.getEl('reportPreviewBody').textContent, '# Two', 'existing report selection still renders the selected body');
  assert.equal(harness.getEl('copyReportBtn').textContent, 'Copy Report');
  assert.equal(harness.getEl('copyReportBtn').classList.contains('copy-success'), false);
});

test('21. Clipboard failure stays truthful, reader typography is responsive, and Refresh Incoming is one shared action', async () => {
  const report = { agent: 'Codex', filename: 'One.md', project: 'Game', path: 'Reports/One.md', mtime: 1, content: '# One' };
  const harness = await initReportHarness([report]);
  harness.setClipboard(async () => { throw new Error('Clipboard blocked'); });
  await harness.click('copyReportBtn');
  assert.equal(harness.getEl('copyReportBtn').textContent, 'Copy Failed · Try Again');
  assert.equal(harness.getEl('copyReportBtn').classList.contains('copy-success'), false);
  assert.equal(harness.getEl('copyReportBtn').classList.contains('copy-error'), true);

  assert.match(html, /#reportPreview\s*\{[\s\S]*?font-size:\s*14\.5px;[\s\S]*?line-height:\s*1\.6;/);
  assert.match(html, /@media \(max-width: 619px\)\s*\{[\s\S]*?#reportPreview\s*\{[\s\S]*?font-size:\s*16\.5px;[\s\S]*?line-height:\s*1\.65;/);
  assert.equal((html.match(/id="refreshIncomingBtn"/g) || []).length, 1, 'desktop and mobile share one recovery control');
  await harness.click('refreshIncomingBtn');
  assert.equal(harness.getEl('refreshIncomingBtn').textContent, '✓ Incoming Refreshed');
  assert.equal(harness.getEl('refreshIncomingBtn').classList.contains('refresh-success'), true);
});
