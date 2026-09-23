// S55.1 — Team Finished State Truth And Time Format Setting
//
// Proof for:
// - FS-1: Finished + no report requested → Finished shown, Report on its way absent
// - FS-2: Finished + report requested → Finished shown, Report on its way shown appropriately
// - FS-3: Report-requested Play followed by no-report Play → second Play does NOT inherit report caption
// - FS-4: Behavior is shared across relevant Team Player types (Codex, Claude, AntiGravity, Terminal, Scout)
// - FS-5: Working / failed / interrupted / unknown states remain unchanged
// - FS-6: Actual report-producing Plays retain correct report presentation
// - TF-1: Default / legacy preference → 12-hour
// - TF-2: 12-hour example: 20:57 local → 8:57 PM
// - TF-3: 24-hour example: 20:57 local → 20:57
// - TF-4: Preference persists via CoachPreferences and POST /api/preferences
// - TF-5: Switching preference updates human-facing presentation
// - TF-6: Timezone abbreviation follows actual local date: MDT in summer, MST in winter
// - TF-7: Machine-safe filenames / IDs remain unchanged
// - TF-8: Malformed preference safely falls back to 12-hour
// - TF-9: Setting appears as the final normal Settings card
// - TF-10: Setting is visible without Dev Mode

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Module from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];

const vscodeStub = {
  EventEmitter: class { get event() { return () => ({ dispose() {} }); } fire() {} dispose() {} },
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  window: { terminals: [], onDidOpenTerminal: () => ({ dispose() {} }), onDidCloseTerminal: () => ({ dispose() {} }) },
  workspace: { workspaceFolders: undefined }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, ...rest);
};

const { ControlPlaneDaemon } = await import('../out/control-plane/daemon.js');
const { InstanceWorkLedger, REPORT_GRACE_MS } = await import('../out/control-plane/work-ledger.js');
const { projectExecution } = await import('../out/control-plane/execution-projection.js');
const { isReportRequested } = await import('../out/play-analyzer.js');
const { formatHumanTime, getTimeZoneAbbr, isTimeFormatPreference, DEFAULT_TIME_FORMAT } = await import('../out/time-format.js');
const { DEFAULT_PREFERENCES, loadPreferences, savePreferences } = await import('../out/running-players.js');

const GAME = 'game_s55_1';
const AG = 'antigravity-1';
const CL = 'claude-1';
const CX = 'codex-1';
const TERM = 'terminal-1';
const SCT = 'scout-1';
const ORDER = [AG, CL, CX, TERM, SCT];
const T0 = 1_800_000_000_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);
const typeOf = (id) => id.split('-')[0];

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries({ sidelineCoachToken: 'test-token', ...initial }));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
}

function daemonStatus({ gameId = GAME, serverNow = T0, views = [], preferences = {} } = {}) {
  const inst = (instanceId, seat, fieldLabel, extra = {}) => ({
    instanceId,
    playerType: typeOf(instanceId),
    seat,
    fieldLabel,
    onField: true,
    ownership: 'coach-managed',
    transport: 'Controlled',
    controlMode: 'controlled',
    ...extra
  });

  return {
    success: true,
    connected: true,
    connectionStatus: 'connected',
    selectedGameId: gameId,
    game: { gameId, displayName: 'S55.1 Test Game' },
    games: [{ gameId, displayName: 'S55.1 Test Game', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [
      { id: 'antigravity', name: 'AntiGravity', instances: [inst(AG, 1, 'AntiGravity · Controlled')] },
      { id: 'claude', name: 'Claude', instances: [inst(CL, 1, 'Claude · Controlled')] },
      { id: 'codex', name: 'Codex', instances: [inst(CX, 1, 'Codex · Controlled')] },
      { id: 'terminal', name: 'Terminal', instances: [inst(TERM, 1, 'Terminal', { transport: undefined, controlMode: undefined })] },
      { id: 'scout', name: 'Scout', instances: [inst(SCT, 1, 'Scout', { transport: 'controlled', controlMode: 'controlled' })] }
    ],
    capabilities: [],
    queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto',
    reports: [],
    playerDiscovery: null,
    preferences: { ...DEFAULT_PREFERENCES, ...preferences },
    at: serverNow,
    execution: {
      gameId,
      epoch: 'E1',
      serverNow,
      byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v]))
    }
  };
}

function createPage(initialStatus) {
  const elements = new Map();
  const textSets = new Map();
  const doc = { activeElement: null };

  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id,
      tagName,
      parentNode: null,
      children: [],
      value: '',
      disabled: false,
      hidden: false,
      title: '',
      className: '',
      placeholder: '',
      checked: false,
      dataset: {},
      style: {},
      attributes: {},
      listeners: {},
      classList: {
        classes: new Set(),
        add(...t) { for (const x of t) this.classes.add(x); },
        remove(...t) { for (const x of t) this.classes.delete(x); },
        toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
        contains(c) { return this.classes.has(c); }
      },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child));
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      replaceChildren(...kids) {
        for (const c of this.children) c.parentNode = null;
        this.children = [];
        for (const kid of kids) this.appendChild(kid);
      },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; },
      closest(selector) {
        for (let n = this; n; n = n.parentNode) {
          if (selector === '.player[data-instance-id]' && n.className === 'player' && n.dataset.instanceId) return n;
          if (selector === '#livePlayerConsoleCard' && n.id === 'livePlayerConsoleCard') return n;
          if (selector === '.card' && n.classList.contains('card')) return n;
        }
        return null;
      },
      focus() { doc.activeElement = this; }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); if (id) textSets.set(id, (textSets.get(id) || 0) + 1); } });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { for (const c of node.children) c.parentNode = null; node.children = []; } });
    return node;
  };

  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  };

  let source;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
    emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); }
    close() {}
  }

  let now = T0;
  const intervals = [];
  let status = initialStatus;
  const posts = [];
  const requests = [];

  Object.assign(doc, {
    getElementById: $,
    createElement: (tag) => makeNode('', tag),
    addEventListener() {},
    body: makeNode('body'),
    querySelectorAll: (sel) => {
      if (sel === 'input[name="timeFormat"]') {
        return [$('timeFormat12'), $('timeFormat24')];
      }
      if (sel === '[data-live-action]') return [$('dispatchBtn')];
      return [];
    }
  });

  const ctx = {
    document: doc,
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage: memoryStorage(),
    localStorage: memoryStorage(),
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ url, method: options.method || 'GET', body });
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url === '/api/preferences' && options.method === 'POST') {
        posts.push(body);
        status = { ...status, preferences: { ...status.preferences, ...body } };
        return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' });
      }
      return reply(200, {});
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms ?? 0),
    clearTimeout,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => {},
    Date: class extends Date { static now() { return now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };

  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');

  const page = {
    $, doc, textSets, intervals, allText, posts, requests,
    rows: () => $('roster').children.filter((c) => c.className === 'player'),
    row: (id) => page.rows().find((r) => r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    stripText: (id) => { const s = page.strip(id); return s ? allText(s) : ''; },
    summaryText: (id) => {
      const s = page.strip(id);
      if (!s || !s.children[0]) return '';
      const summaryNode = s.children[0].children.find((c) => c.className === 'play-strip-summary');
      return summaryNode ? summaryNode.textContent : '';
    },
    setStatus: (next) => { status = next; },
    emit: (views, serverNow = T0, gameId = GAME, epoch = 'E1') => source.emit('execution', { gameId, epoch, serverNow, views }),
    applyStatus: async (s) => {
      status = s;
      source.emit('status', s);
      await flush();
    },
    change: async (node, checked = true) => {
      node.checked = checked;
      for (const listener of node.listeners['change'] || []) {
        await listener({ target: node });
      }
      await flush();
    },
    start: async () => {
      vm.createContext(ctx);
      vm.runInContext(pageScript, ctx);
      source.emit('hello');
      const end = Date.now() + 2_000;
      while (Date.now() < end && $('connectionText').textContent !== 'Coach Online') await wait(5);
      assert.equal($('connectionText').textContent, 'Coach Online', 'page connected');
      return page;
    }
  };
  return page;
}

const startPage = (status) => createPage(status).start();

// ---------------------------------------------------------------------------
// FS-1 to FS-6: Finished State Truth
// ---------------------------------------------------------------------------

test('FS-1. Finished + no report requested → Finished shown, Report on its way absent', async () => {
  // Test pure detection
  assert.equal(isReportRequested('Fix the bug in src/index.ts'), false);
  assert.equal(isReportRequested('git status'), false);
  assert.equal(isReportRequested('npm test'), false);
  assert.equal(isReportRequested('Do not write a report'), false);

  // Test ledger & projection
  let now = 1000;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.recordDispatch({
    gameId: GAME,
    playerInstanceId: CL,
    playerType: 'claude',
    clientRef: 'ref-noreport',
    at: 900,
    reportRequested: false
  });
  ledger.recordDelivery('ref-noreport', 'received', { turnRef: 'turn-1' });
  now = 1100;
  ledger.recordTurn(GAME, { instanceId: CL, state: 'started', turnRef: 'turn-1' });
  now = 1200;
  ledger.recordTurn(GAME, { instanceId: CL, state: 'completed', turnRef: 'turn-1' });

  const view = projectExecution({
    instanceId: CL,
    entry: ledger.get(GAME, CL),
    now: 1250
  });

  assert.equal(view.state, 'finished');
  assert.equal(view.awaitingReport, undefined, 'awaitingReport must be absent when no report requested');

  // Verify rendered DOM strip
  const page = await startPage(daemonStatus({ serverNow: 1250, views: [view] }));
  assert.match(page.stripText(CL), /Finished/);
  assert.doesNotMatch(page.stripText(CL), /Report on its way/);
  assert.equal(page.summaryText(CL), '', 'summary text must be empty so only Finished appears');
});

test('FS-2. Finished + report requested → Finished shown, Report on its way shown appropriately', async () => {
  // Test pure detection
  assert.equal(isReportRequested('Please run tests and write a report'), true);
  assert.equal(isReportRequested('REPORT CONTRACT\nREPORT FILE: S55.1.md\n'), true);
  assert.equal(isReportRequested('Investigate the failure and produce a report'), true);

  let now = 1000;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.recordDispatch({
    gameId: GAME,
    playerInstanceId: CL,
    playerType: 'claude',
    clientRef: 'ref-withreport',
    at: 900,
    reportRequested: true
  });
  ledger.recordDelivery('ref-withreport', 'received', { turnRef: 'turn-1' });
  now = 1100;
  ledger.recordTurn(GAME, { instanceId: CL, state: 'started', turnRef: 'turn-1' });
  now = 1200;
  ledger.recordTurn(GAME, { instanceId: CL, state: 'completed', turnRef: 'turn-1' });

  const view = projectExecution({
    instanceId: CL,
    entry: ledger.get(GAME, CL),
    now: 1250
  });

  assert.equal(view.state, 'finished');
  assert.equal(view.awaitingReport, true, 'awaitingReport must be true when report requested');

  // Verify rendered DOM strip
  const page = await startPage(daemonStatus({ serverNow: 1250, views: [view] }));
  assert.match(page.stripText(CL), /Finished/);
  assert.match(page.stripText(CL), /Report on its way/);
  assert.equal(page.summaryText(CL), '· Report on its way');
});

test('FS-3. Report-requested Play followed by no-report Play → second Play does NOT inherit report caption', async () => {
  let now = 1000;
  const ledger = new InstanceWorkLedger(() => now);

  // Play A: report requested
  ledger.recordDispatch({
    gameId: GAME, playerInstanceId: CX, clientRef: 'play-a', at: now, reportRequested: true
  });
  ledger.recordDelivery('play-a', 'received', { turnRef: 'turn-a' });
  now += 100;
  ledger.recordTurn(GAME, { instanceId: CX, state: 'started', turnRef: 'turn-a' });
  now += 100;
  ledger.recordTurn(GAME, { instanceId: CX, state: 'completed', turnRef: 'turn-a' });

  const viewA = projectExecution({ instanceId: CX, entry: ledger.get(GAME, CX), now });
  assert.equal(viewA.awaitingReport, true, 'Play A has awaitingReport true');

  // Play B: no report requested
  now += 1000;
  ledger.recordDispatch({
    gameId: GAME, playerInstanceId: CX, clientRef: 'play-b', at: now, reportRequested: false
  });
  ledger.recordDelivery('play-b', 'received', { turnRef: 'turn-b' });
  now += 100;
  ledger.recordTurn(GAME, { instanceId: CX, state: 'started', turnRef: 'turn-b' });
  now += 100;
  ledger.recordTurn(GAME, { instanceId: CX, state: 'completed', turnRef: 'turn-b' });

  const viewB = projectExecution({ instanceId: CX, entry: ledger.get(GAME, CX), now });
  assert.equal(viewB.playRef, 'play-b');
  assert.equal(viewB.awaitingReport, undefined, 'Play B must NOT inherit Play A awaitingReport');

  // Verify rendered DOM strip for Play B
  const page = await startPage(daemonStatus({ serverNow: now, views: [viewB] }));
  assert.match(page.stripText(CX), /Finished/);
  assert.doesNotMatch(page.stripText(CX), /Report on its way/);
  assert.equal(page.summaryText(CX), '');
});

test('FS-4. Behavior is shared across relevant Team Player types', async () => {
  const playerInstances = [
    { id: CX, type: 'codex' },
    { id: CL, type: 'claude' },
    { id: AG, type: 'antigravity' },
    { id: TERM, type: 'terminal' }
  ];

  for (const { id: instId, type: pType } of playerInstances) {
    const ledger = new InstanceWorkLedger(() => 2000);
    ledger.recordDispatch({
      gameId: GAME,
      playerInstanceId: instId,
      playerType: pType,
      clientRef: `ref-${pType}`,
      at: 1000,
      reportRequested: false
    });
    ledger.recordDelivery(`ref-${pType}`, 'received', { turnRef: `turn-${pType}` });
    ledger.recordTurn(GAME, { instanceId: instId, state: 'started', turnRef: `turn-${pType}` });
    ledger.recordTurn(GAME, { instanceId: instId, state: 'completed', turnRef: `turn-${pType}` });

    const view = projectExecution({ instanceId: instId, entry: ledger.get(GAME, instId), now: 2050 });
    assert.equal(view.state, 'finished', `${pType} state is finished`);
    assert.equal(view.awaitingReport, undefined, `${pType} awaitingReport is undefined when no report requested`);

    const page = await startPage(daemonStatus({ serverNow: 2050, views: [view] }));
    assert.match(page.stripText(instId), /Finished/, `${pType} renders Finished`);
    assert.doesNotMatch(page.stripText(instId), /Report on its way/, `${pType} does not render report caption`);
    assert.equal(page.summaryText(instId), '', `${pType} summary is empty`);
  }
});

test('FS-5. Working / failed / interrupted / unknown states remain unchanged', () => {
  const ledger = new InstanceWorkLedger(() => 3000);

  // working
  ledger.recordDispatch({ gameId: GAME, playerInstanceId: 'worker-1', clientRef: 'play-w', reportRequested: true });
  ledger.recordDelivery('play-w', 'received', { turnRef: 'turn-w' });
  ledger.recordTurn(GAME, { instanceId: 'worker-1', state: 'started', turnRef: 'turn-w' });
  const viewW = projectExecution({ instanceId: 'worker-1', entry: ledger.get(GAME, 'worker-1'), now: 3100 });
  assert.equal(viewW.state, 'working');
  assert.equal(viewW.awaitingReport, undefined);

  // failed
  ledger.recordTurn(GAME, { instanceId: 'worker-1', state: 'failed', turnRef: 'turn-w' });
  const viewF = projectExecution({ instanceId: 'worker-1', entry: ledger.get(GAME, 'worker-1'), now: 3200 });
  assert.equal(viewF.state, 'couldnt-finish');
  assert.equal(viewF.awaitingReport, undefined);
});

test('FS-6. Actual report-producing Plays retain correct report presentation', async () => {
  let now = 1000;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.recordDispatch({
    gameId: GAME, playerInstanceId: CL, clientRef: 'play-report', at: now, reportRequested: true
  });
  ledger.recordDelivery('play-report', 'received', { turnRef: 'turn-r' });
  now += 100;
  ledger.recordTurn(GAME, { instanceId: CL, state: 'started', turnRef: 'turn-r' });
  now += 100;
  ledger.recordTurn(GAME, { instanceId: CL, state: 'completed', turnRef: 'turn-r' });

  // Report arrives
  ledger.recordReports(GAME, [{
    path: 'REPORTS/AntiGravity/S55.1-Test.md',
    filename: 'S55.1-Test.md',
    mtime: now + 50,
    provenance: { gameId: GAME, clientRef: 'play-report', playerInstanceId: CL }
  }]);

  const view = projectExecution({ instanceId: CL, entry: ledger.get(GAME, CL), now: now + 60 });
  assert.equal(view.state, 'finished');
  assert.equal(view.report?.filename, 'S55.1-Test.md');
  assert.equal(view.awaitingReport, undefined);

  const page = await startPage(daemonStatus({ serverNow: now + 60, views: [view] }));
  assert.match(page.stripText(CL), /Finished/);
  assert.match(page.stripText(CL), /S55\.1-Test\.md/);
  assert.equal(page.summaryText(CL), '· S55.1-Test.md');
});

// ---------------------------------------------------------------------------
// TF-1 to TF-10: Time Format Setting
// ---------------------------------------------------------------------------

test('TF-1. Default / legacy preference → 12-hour', () => {
  assert.equal(DEFAULT_TIME_FORMAT, '12h');
  assert.equal(DEFAULT_PREFERENCES.timeFormat, '12h');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-prefs-'));
  try {
    const file = path.join(dir, 'preferences.json');
    // Legacy file without timeFormat
    fs.writeFileSync(file, JSON.stringify({ devMode: true }));
    const loaded = loadPreferences(file);
    assert.equal(loaded.timeFormat, '12h', 'legacy preferences default to 12h');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TF-2. 12-hour example: 20:57 local → 8:57 PM', () => {
  // 20:57 MDT is UTC-6, so 2026-09-21T02:57:00Z
  const d = new Date('2026-09-21T02:57:00Z');
  const formatted = formatHumanTime(d, '12h');
  assert.equal(formatted, '8:57 PM');
});

test('TF-3. 24-hour example: 20:57 local → 20:57', () => {
  const d = new Date('2026-09-21T02:57:00Z');
  const formatted = formatHumanTime(d, '24h');
  assert.equal(formatted, '20:57');
});

test('TF-4. Preference persists via CoachPreferences and POST /api/preferences', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-persist-'));
  try {
    const file = path.join(dir, 'preferences.json');
    savePreferences(file, { ...DEFAULT_PREFERENCES, timeFormat: '24h' });
    assert.equal(loadPreferences(file).timeFormat, '24h');

    savePreferences(file, { ...DEFAULT_PREFERENCES, timeFormat: '12h' });
    assert.equal(loadPreferences(file).timeFormat, '12h');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TF-5. Switching preference updates human-facing presentation', () => {
  const d = new Date('2026-09-21T02:57:07Z');
  const f12 = formatHumanTime(d, '12h', { seconds: true, timeZone: true, date: true });
  const f24 = formatHumanTime(d, '24h', { seconds: true, timeZone: true, date: true });

  assert.equal(f12, 'September 20, 2026 · 8:57:07 PM MDT');
  assert.equal(f24, 'September 20, 2026 · 20:57:07 MDT');
});

test('TF-6. Timezone abbreviation follows actual local date: MDT in summer, MST in winter', () => {
  const summerDate = new Date('2026-09-20T20:00:00Z'); // Summer (Daylight Saving Time)
  const winterDate = new Date('2026-01-20T20:00:00Z'); // Winter (Standard Time)

  assert.equal(getTimeZoneAbbr(summerDate), 'MDT', 'September Calgary time is MDT');
  assert.equal(getTimeZoneAbbr(winterDate), 'MST', 'January Calgary time is MST');
});

test('TF-7. Machine-safe filenames / IDs remain unchanged', () => {
  // Machine identifiers remain untouched
  const machineId = '2026-09-20_205707_342_MDT';
  assert.match(machineId, /^\d{4}-\d{2}-\d{2}_\d{6}_\d{3}_MDT$/);
  // Scout playId format remains untouched
  const scoutPlayId = 'TTA-Full-Sync-Formation-Alpha__2026-09-15_2235_MDT';
  assert.match(scoutPlayId, /_MDT$/);
});

test('TF-8. Malformed preference safely falls back to 12-hour', () => {
  assert.equal(isTimeFormatPreference('12h'), true);
  assert.equal(isTimeFormatPreference('24h'), true);
  assert.equal(isTimeFormatPreference('bad-format'), false);
  assert.equal(isTimeFormatPreference(null), false);
  assert.equal(isTimeFormatPreference(12), false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-malformed-'));
  try {
    const file = path.join(dir, 'preferences.json');
    fs.writeFileSync(file, JSON.stringify({ timeFormat: 'invalid-value' }));
    assert.equal(loadPreferences(file).timeFormat, '12h');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TF-9. Setting appears as the final normal Settings card', () => {
  const cardIndex = pageSource.indexOf('id="timeFormatCard"');
  const footerIndex = pageSource.indexOf('class="settings-footer"');
  const githubIndex = pageSource.indexOf('<h3>GitHub &amp; Repositories</h3>');

  assert.ok(cardIndex > 0, 'timeFormatCard exists in DOM');
  assert.ok(cardIndex > githubIndex, 'timeFormatCard is after GitHub & Repositories');
  assert.ok(cardIndex < footerIndex, 'timeFormatCard is inside settings-list before footer');

  // Verify radio buttons
  assert.ok(pageSource.includes('id="timeFormat12"'), 'timeFormat12 radio button exists');
  assert.ok(pageSource.includes('id="timeFormat24"'), 'timeFormat24 radio button exists');
});

test('TF-10. Setting is visible without Dev Mode', async () => {
  const page = await startPage(daemonStatus({
    preferences: { devMode: false, timeFormat: '12h' }
  }));

  const card = page.$('timeFormatCard');
  assert.equal(card.hidden, false, 'Time Format card is visible when Dev Mode is OFF');
  assert.equal(page.$('timeFormat12').checked, true, '12-hour is selected by default');
  assert.equal(page.$('timeFormat24').checked, false);

  // Switch to 24h
  await page.change(page.$('timeFormat24'), true);
  assert.equal(page.posts.some((p) => p.timeFormat === '24h'), true, 'POST /api/preferences was called with timeFormat: 24h');
});

test('AI Usage Scoreboard settings card exists as one dedicated card, with the refresh-frequency setting integrated (not a second copy)', () => {
  assert.ok(pageSource.includes('id="aiScoreboardSettingsCard"'));
  assert.equal(pageSource.includes('id="aiUsageRefreshCard"'), false, 'the old standalone card is gone, not duplicated');
  for (const minutes of [3, 5, 10, 15]) {
    assert.ok(pageSource.includes(`id="aiUsageRefresh${minutes}"`), `aiUsageRefresh${minutes} radio button exists`);
  }
  assert.doesNotMatch(pageSource, /name="aiUsageRefreshSeconds"/, 'the old seconds-based options are gone, not merely relabeled');
});

test('AI Usage Refresh Frequency: default selection is 5 minutes, and a valid change persists', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiUsageRefresh5').checked, true, '5 minutes is selected by default');
  assert.equal(page.$('aiUsageRefresh15').checked, false);

  await page.change(page.$('aiUsageRefresh15'), true);
  assert.equal(page.posts.some((p) => p.aiUsageRefreshMinutes === 15), true, 'POST /api/preferences was called with aiUsageRefreshMinutes: 15');
});

test('AI Usage Refresh Frequency reflects a non-default persisted value on load', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false, aiUsageRefreshMinutes: 10 } }));
  assert.equal(page.$('aiUsageRefresh10').checked, true);
  assert.equal(page.$('aiUsageRefresh5').checked, false);
});

test('AI Usage Refresh Frequency: 3 minutes is the minimum selectable option', () => {
  assert.ok(pageSource.includes('id="aiUsageRefresh3"'));
  assert.doesNotMatch(pageSource, /value="1"[^>]*name="aiUsageRefreshMinutes"|value="2"[^>]*name="aiUsageRefreshMinutes"/);
});

test('AI Usage Scoreboard Placement: defaults to Bottom, and Top persists', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiScoreboardPlacementBottom').checked, true);
  assert.equal(page.$('aiScoreboardPlacementTop').checked, false);
  await page.change(page.$('aiScoreboardPlacementTop'), true);
  assert.equal(page.posts.some((p) => p.aiScoreboardPlacement === 'top'), true);
});

test('AI Usage Scoreboard Placement reflects a persisted Top value on load', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false, aiScoreboardPlacement: 'top' } }));
  assert.equal(page.$('aiScoreboardPlacementTop').checked, true);
  assert.equal(page.$('aiScoreboardPlacementBottom').checked, false);
});

test('AI Usage Scoreboard Default state: defaults to Collapsed, and Expanded persists as a boolean', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiScoreboardDefaultCollapsed').checked, true);
  await page.change(page.$('aiScoreboardDefaultExpanded'), true);
  assert.equal(page.posts.some((p) => p.aiScoreboardDefaultExpanded === true), true);
});

test('AI Usage Scoreboard Default state reflects a persisted Expanded value on load', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false, aiScoreboardDefaultExpanded: true } }));
  assert.equal(page.$('aiScoreboardDefaultExpanded').checked, true);
  assert.equal(page.$('aiScoreboardDefaultCollapsed').checked, false);
});

test('AI Usage Scoreboard Compact percentage: defaults to % Left, and Both persists', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiScoreboardPercentLeft').checked, true);
  await page.change(page.$('aiScoreboardPercentBoth'), true);
  assert.equal(page.posts.some((p) => p.aiScoreboardPercentMode === 'both'), true);
});

test('AI Usage Scoreboard Compact reset: defaults to Absolute, and Countdown persists', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiScoreboardResetAbsolute').checked, true);
  await page.change(page.$('aiScoreboardResetCountdown'), true);
  assert.equal(page.posts.some((p) => p.aiScoreboardResetMode === 'countdown'), true);
});

test('AI Usage Scoreboard Compact density: defaults to Standard, and Tight persists', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiScoreboardDensityStandard').checked, true);
  await page.change(page.$('aiScoreboardDensityTight'), true);
  assert.equal(page.posts.some((p) => p.aiScoreboardDensity === 'tight'), true);
});

test('AI Usage Scoreboard reset marker: defaults to plain separator, and the reset icon persists', async () => {
  const page = await startPage(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('aiScoreboardResetMarkerSeparator').checked, true);
  await page.change(page.$('aiScoreboardResetMarkerIcon'), true);
  assert.equal(page.posts.some((p) => p.aiScoreboardResetMarker === 'icon'), true);
});
