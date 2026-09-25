// Terminal Success Retention setting + presentation lock (S53 Play 3 / S54.4).
//
// Preference plumbing (running-players.ts, daemon POST /api/preferences) plus the browser-owned
// S54.3 evidence lifetime driven by `preferences.terminalRetention`. Same real-index.html vm +
// DOM-stub harness as terminal-evidence-retention.test.mjs (controllable server clock, Map-backed
// sessionStorage, captured wake-up timers). Only SUCCESS evidence is ever timed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
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
const { DEFAULT_PREFERENCES, DEFAULT_TERMINAL_RETENTION, TERMINAL_RETENTION_VALUES, isTerminalRetention, loadPreferences, savePreferences, projectDiscovery, advancedPlayerDiscoveryVisible } = await import('../out/running-players.js');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

const GAME = 'game_evidence';
const T1 = 'shell-tttt1111'; // Terminal Player 1
const T2 = 'shell-tttt2222'; // Terminal Player 2
const T3 = 'shell-tttt3333'; // Terminal Player 3
const ORDER = [T1, T2, T3];
const T0 = 1_800_000_000_000;
const FIVE_MIN = 5 * 60_000;
const BOTH = { devMode: true, livePlayerConsole: true };

const snap = { provider: 'x', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'm', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: [] }] };
const cap = (instanceId) => ({ instanceId, playerType: 'claude', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: instanceId, state: 'ready', capability: snap });

let revision = 0;
const view = (instanceId, state, extra = {}) => ({ instanceId, state, revision: ++revision, ...extra });
const idle = (id) => view(id, 'idle');
const runningShell = (id, playRef, command = 'git status') => view(id, 'working', { playRef, executionType: 'direct-shell', summary: command, executionStartedAt: T0 });
const ended = (id, state, playRef, { command = 'git status', finishedAt = T0, detail, durationMs = 800 } = {}) => view(id, state, {
  playRef, executionType: 'direct-shell', summary: command, executionStartedAt: finishedAt - durationMs, finishedAt, durationMs,
  detail: detail ?? (state === 'finished' ? 'Completed · exit code 0' : state === 'couldnt-finish' ? 'Failed · exit code 128' : 'Finished — exit code not reported')
});
const done = (id, playRef, opts) => ended(id, 'finished', playRef, opts);
const failed = (id, playRef, opts) => ended(id, 'couldnt-finish', playRef, opts);
const unknown = (id, playRef, opts) => ended(id, 'unknown', playRef, opts);

function daemonStatus({ preferences = BOTH, views, now = T0, gameId = GAME }) {
  const inst = (instanceId, seat) => ({ instanceId, playerType: 'claude', seat, fieldLabel: instanceId, onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' });
  const caps = ORDER.map(cap);
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: 'Evidence' },
    games: [{ gameId, displayName: 'Evidence', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [{ id: 'team', name: 'Team', instances: ORDER.map((id, i) => inst(id, i + 1)) }],
    capabilities: caps.map((c) => ({ ...c, work: { workState: 'idle', queuedCount: 0 } })),
    queue: [],
    routing: { mode: 'auto', capabilities: caps, activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null, preferences: { runningPlayers: 'ask', ...preferences }, at: now,
    execution: { gameId, epoch: 'E1', serverNow: now, byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v])) }
  };
}

const allIdle = () => ORDER.map(idle);
/** A status where `overrides` replace those Players' views and everyone else is idle. */
const world = (overrides = [], extra = {}) => daemonStatus({ views: [...allIdle().filter((v) => !overrides.some((o) => o.instanceId === v.instanceId)), ...overrides], ...extra });

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries({ sidelineCoachToken: 'test-token', ...initial }));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
}
const throwingStorage = () => ({
  getItem: (k) => { if (k === 'sidelineCoachToken') return 'test-token'; throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); }
});

function createPage(initialStatus, { storage = memoryStorage(), activity = {} } = {}) {
  const elements = new Map();
  const doc = { activeElement: null };
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child)); child.parentNode = this; this.children.push(child); return child; },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; },
      closest(selector) {
        if (selector !== '.player[data-instance-id]') throw new Error(`stub closest does not support ${selector}`);
        for (let n = this; n; n = n.parentNode) if (n.className === 'player' && n.dataset.instanceId) return n;
        return null;
      },
      focus() { doc.activeElement = this; }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); } });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { for (const c of node.children) c.parentNode = null; node.children = []; } });
    return node;
  };
  const $ = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
  let source;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
    emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); }
    close() {}
  }
  let status = initialStatus;
  const clock = { now: initialStatus.execution.serverNow };
  const posts = [];
  const requests = [];
  const timers = [];
  const clipboard = { writes: [] };
  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), addEventListener() {}, body: makeNode('body'),
    querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : [])
  });
  const ctx = {
    document: doc, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: storage,
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ url, method: options.method || 'GET', body });
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url.startsWith('/api/player-activity')) return reply(200, { success: true, sessionKey: activity.sessionKey ?? 'sess_1', entries: activity.entries ?? [] });
      if (url === '/api/preferences' && options.method === 'POST') { posts.push(body); status = { ...status, preferences: { ...status.preferences, ...body } }; return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' }); }
      return reply(200, {});
    },
    // Long (evidence-length) timers are captured so tests can fire them deterministically.
    setTimeout: (fn, ms, ...rest) => {
      if (ms >= 10_000) { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; }
      return setTimeout(fn, ms, ...rest);
    },
    clearTimeout, setInterval: () => 1, clearInterval: () => {},
    Date: class extends Date { static now() { return clock.now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { clipboard.writes.push(text); } } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, posts, requests, timers, clipboard, storage, allText, find, clock,
    acks: () => requests.filter((r) => r.url.startsWith('/api/work/acknowledge')),
    emitEvent: (name, data) => source.emit(name, data),
    row: (id) => $('roster').children.find((r) => r.className === 'player' && r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    shell: (id) => { const s = page.strip(id); return s && find(s, (n) => n.className === 'play-console'); },
    button: (id, key) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === key); },
    body: (id) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === 'console-body'); },
    lines: (id) => { const b = page.body(id); return b ? b.children.filter((c) => c.className === 'play-console-line') : []; },
    stripText: (id) => { const s = page.strip(id); return s ? allText(s) : ''; },
    /** Move the server clock and publish the given world, like the daemon would. */
    refresh: async (next, now) => {
      if (now !== undefined) clock.now = now;
      const base = next ?? status;
      status = { ...base, execution: { ...base.execution, serverNow: clock.now }, at: clock.now };
      source.emit('status', { type: 'registry-change' });
      await flush();
    },
    /** Fire the captured evidence wake-up timers (what setTimeout would do at finishedAt + T). */
    tick: async () => { for (const t of page.timers) t.fn(); await flush(); },
    change: async (node, checked = true) => { node.checked = checked; for (const fn of node.listeners.change || []) await fn({ target: node }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
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

const start = (status, options) => createPage(status, options).start();
const act = (instanceId, seq, category, text, extra = {}) => ({ gameId: GAME, instanceId, sessionKey: 'sess_1', epoch: 'E1', entry: { seq, at: seq, category, text }, ...extra });
const STORAGE_KEY = 'sidelineCoach.terminalEvidence.v1';

const MIN = 60_000;
const LIFETIME = { '30s': 30_000, '5m': 5 * MIN, '30m': 30 * MIN };
const prefs = (terminalRetention, extra = {}) => ({ ...BOTH, ...(terminalRetention === undefined ? {} : { terminalRetention }), ...extra });
const successAt = (finishedAt = T0, playRef = 'play_ok') => done(T3, playRef, { finishedAt });

// ---------------------------------------------------------------------------
// Preference plumbing
// ---------------------------------------------------------------------------

test('RET-1. Default terminalRetention is 5 minutes, with a stable enum', () => {
  assert.equal(DEFAULT_PREFERENCES.terminalRetention, '5m');
  assert.equal(DEFAULT_TERMINAL_RETENTION, '5m');
  assert.deepEqual([...TERMINAL_RETENTION_VALUES], ['30s', '5m', '30m', 'until-dismissed']);
  for (const value of TERMINAL_RETENTION_VALUES) assert.equal(isTerminalRetention(value), true);
});

test('RET-2. Legacy preference files without terminalRetention load as 5 minutes and keep every other field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-prefs-'));
  try {
    const file = path.join(dir, 'preferences.json');
    fs.writeFileSync(file, JSON.stringify({ runningPlayers: 'auto-add', devMode: true, livePlayerConsole: true, advancedPlayerDiscovery: true }));
    assert.deepEqual(loadPreferences(file), { ...DEFAULT_PREFERENCES, runningPlayers: 'auto-add', devMode: true, livePlayerConsole: true, advancedPlayerDiscovery: true });
    assert.equal(loadPreferences(path.join(dir, 'missing.json')).terminalRetention, '5m');
    fs.writeFileSync(file, '{not json');
    assert.equal(loadPreferences(file).terminalRetention, '5m');
    for (const value of TERMINAL_RETENTION_VALUES) {
      savePreferences(file, { ...DEFAULT_PREFERENCES, terminalRetention: value });
      assert.equal(loadPreferences(file).terminalRetention, value, `${value} round-trips`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('RET-3. Invalid or unknown stored values fail safe to 5 minutes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-prefs-'));
  try {
    const file = path.join(dir, 'preferences.json');
    for (const bad of ['forever', '10m', '5M', '', 300, 0, null, true, {}, ['5m'], 'until-closed']) {
      fs.writeFileSync(file, JSON.stringify({ devMode: true, terminalRetention: bad }));
      assert.equal(loadPreferences(file).terminalRetention, '5m', `falls back for ${JSON.stringify(bad)}`);
      assert.equal(isTerminalRetention(bad), false);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-daemon-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 41100 + Math.floor(Math.random() * 100), idleTimeoutMs: 60_000 });
  await daemon.start();
  const roster = [{ id: 'team', name: 'Players', instances: [] }];
  daemon.registryInstance.registerSession({
    instanceId: 'session-ret', stadiumId: 'stadium-ret', name: 'RET', platform: 'win32', socket: { readyState: 1, send() {}, close() {} },
    lastHeartbeat: Date.now(), game: { gameId: GAME, displayName: 'RET Game', fingerprintSource: 'test', repoUri: 'https://example.test/ret.git' },
    rootFsPath: 'C:\\Games\\RET', roster, capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  daemon.registryInstance.updateRoster('session-ret', roster);
  daemon.registryInstance.updateCapabilities('session-ret', []);
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    return { status: response.status, body: await response.json() };
  };
  const post = (body) => api('/api/preferences', { method: 'POST', body: JSON.stringify(body) });
  const stop = async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { daemon, api, post, stop };
}

test('RET-4. POST /api/preferences accepts and persists each valid retention; other preferences are untouched', async () => {
  const h = await daemonHarness();
  try {
    assert.equal((await h.api('/api/preferences')).body.preferences.terminalRetention, '5m', 'default');
    await h.post({ advancedPlayerDiscovery: true });
    for (const value of ['30s', '30m', 'until-dismissed', '5m']) {
      const res = await h.post({ terminalRetention: value });
      assert.equal(res.status, 200);
      assert.equal(res.body.preferences.terminalRetention, value);
      assert.equal(res.body.message, 'Terminal Success Retention saved.');
      assert.equal(res.body.preferences.advancedPlayerDiscovery, true, 'unrelated preference untouched');
      assert.equal(res.body.preferences.devMode, false);
      assert.equal(loadPreferences(path.join(h.daemon.dir, 'preferences.json')).terminalRetention, value, 'persisted to disk');
    }
  } finally { await h.stop(); }
});

test('RET-5. POST rejects invalid retention values and changes nothing', async () => {
  const h = await daemonHarness();
  try {
    await h.post({ terminalRetention: '30m' });
    for (const bad of ['forever', '10m', '', 300, 0, null, true, {}, ['5m']]) {
      const res = await h.post({ terminalRetention: bad });
      assert.equal(res.status, 400, `rejects ${JSON.stringify(bad)}`);
      assert.equal(res.body.success, false);
    }
    assert.equal((await h.api('/api/preferences')).body.preferences.terminalRetention, '30m', 'previous value survives');
    assert.equal((await h.post({})).status, 400, 'empty POST still rejected');
  } finally { await h.stop(); }
});

// ---------------------------------------------------------------------------
// Success evidence lifetime follows the setting
// ---------------------------------------------------------------------------

for (const [id, value] of [['RET-6', '30s'], ['RET-7', '5m'], ['RET-8', '30m']]) {
  test(`${id}. ${value} retention expires SUCCESSFUL evidence at exactly its lifetime (server clock, real wake-up timer)`, async () => {
    const lifetime = LIFETIME[value];
    const page = await start(world([successAt(T0 - 1_000)], { preferences: prefs(value) }));
    assert.equal(page.strip(T3).dataset.terminalEvidence, 'completed');
    await page.refresh(world([], { preferences: prefs(value) }), T0 - 1_000 + 20_000); // server view long since decayed (or about to)
    assert.ok(page.strip(T3), 'still there well inside every lifetime shorter than the setting');
    await page.refresh(null, T0 - 1_000 + lifetime - 1);
    await page.tick();
    assert.ok(page.strip(T3), `present at ${value} - 1 ms`);
    await page.refresh(null, T0 - 1_000 + lifetime + 1);
    await page.tick();
    assert.equal(page.strip(T3), null, `gone at ${value} + 1 ms`);
    const wakeUps = page.timers.filter((t) => t.ms > 31_000 || value === '30s');
    assert.ok(wakeUps.length >= 1, 'a wake-up was scheduled from finishedAt');
  });
}

test('RET-9. Until dismissed never auto-expires success, schedules no wake-up, and survives a rerender a month later', async () => {
  const page = await start(world([successAt(T0 - 1_000)], { preferences: prefs('until-dismissed') }));
  assert.ok(page.strip(T3));
  for (const days of [1, 7, 30]) {
    await page.refresh(world([], { preferences: prefs('until-dismissed') }), T0 + days * 86_400_000);
    await page.tick();
    assert.equal(page.strip(T3)?.dataset.terminalEvidence, 'completed', `still there after ${days} d`);
  }
  assert.equal(page.timers.filter((t) => t.ms > 31_000 && t.ms !== 45_000).length, 0, 'no evidence wake-up is ever scheduled (only the existing 30 s rich-window redraw)');
  await page.click(page.button(T3, 'evidence-dismiss'));
  assert.equal(page.strip(T3), null, 'only Dismiss releases it');
});

test('RET-9b. A missing / bogus setting behaves as the 5-minute default', async () => {
  for (const preferences of [prefs(undefined), prefs('bogus'), prefs(300)]) {
    const page = await start(world([successAt(T0 - 1_000)], { preferences }));
    await page.refresh(world([], { preferences }), T0 - 1_000 + 5 * MIN - 1); await page.tick();
    assert.ok(page.strip(T3), 'present just under 5 min');
    await page.refresh(null, T0 - 1_000 + 5 * MIN + 1); await page.tick();
    assert.equal(page.strip(T3), null, 'gone just after 5 min');
  }
});

test('RET-10. Changing retention affects SUCCESS evidence only, immediately, with no execution change', async () => {
  const world3 = (preferences, finishedAt = T0) => world([failed(T1, 'play_f', { finishedAt }), unknown(T2, 'play_u', { finishedAt }), done(T3, 'play_ok', { finishedAt })], { preferences });
  const page = await start(world3(prefs('5m')));
  await page.refresh(world3(prefs('5m')), T0 + 2 * MIN);
  assert.ok(page.strip(T1) && page.strip(T2) && page.strip(T3), 'all three at 2 min under 5 min');

  await page.refresh(world3(prefs('30s')), T0 + 2 * MIN + 1);
  assert.equal(page.strip(T3), null, 'success hides the moment the shorter lifetime applies');
  assert.match(page.stripText(T1), /Command failed/, 'failure unaffected');
  assert.match(page.stripText(T2), /Ended — result unknown/, 'unknown unaffected');

  await page.refresh(world3(prefs('until-dismissed')), T0 + 3 * MIN);
  assert.equal(page.strip(T3)?.dataset.terminalEvidence, 'completed', 'a longer setting keeps the still-held record (documented)');
  assert.match(page.stripText(T1), /Command failed/);
});

test('RET-11. Failure evidence has no timer under any setting', async () => {
  for (const value of ['30s', '5m', '30m', 'until-dismissed']) {
    const page = await start(world([failed(T1, 'play_f')], { preferences: prefs(value) }));
    await page.refresh(world([], { preferences: prefs(value) }), T0 + 24 * 3_600_000);
    await page.tick();
    assert.match(page.stripText(T1), /Command failed/, `${value}: still there a day later`);
  }
});

test('RET-12. Unknown evidence has no timer under any setting', async () => {
  for (const value of ['30s', '5m', '30m', 'until-dismissed']) {
    const page = await start(world([unknown(T1, 'play_u')], { preferences: prefs(value) }));
    await page.refresh(world([], { preferences: prefs(value) }), T0 + 24 * 3_600_000);
    await page.tick();
    assert.match(page.stripText(T1), /Ended — result unknown/, `${value}: still there a day later`);
  }
});

// ---------------------------------------------------------------------------
// S54.3 behaviour intact under the setting
// ---------------------------------------------------------------------------

test('RET-13. Copy All still does not dismiss Terminal evidence, and an Expanded success is not timed out from under the reader', async () => {
  const page = await start(world([runningShell(T3, 'play_1')], { preferences: prefs('30s') }));
  await page.click(page.button(T3, 'console-toggle'));
  page.emitEvent('activity', act(T3, 1, 'output', 'On branch main'));
  await page.refresh(world([done(T3, 'play_1', { finishedAt: T0 })]), T0 + 1_000);
  await page.refresh(world([], { preferences: prefs('30s') }), T0 + 10 * MIN); // far past 30 s, human still has it open
  await page.tick();
  assert.ok(page.shell(T3), 'expanded success outlives its lifetime while open');
  await page.click(page.button(T3, 'console-copy-all'));
  assert.equal(page.clipboard.writes.length, 1);
  assert.match(page.clipboard.writes[0], /On branch main/);
  assert.ok(page.shell(T3) && page.strip(T3), 'Copy All did not dismiss');
  assert.equal(page.acks().length, 0);
});

test('RET-14. Copy New still does not dismiss Terminal evidence', async () => {
  const page = await start(world([failed(T1, 'play_f')], { preferences: prefs('30s') }));
  await page.click(page.button(T1, 'console-toggle'));
  page.emitEvent('activity', act(T1, 1, 'output', 'fatal: bad object'));
  await page.click(page.button(T1, 'console-copy-new'));
  assert.match(page.clipboard.writes[0], /fatal: bad object/);
  assert.ok(page.shell(T1) && page.strip(T1));
  page.emitEvent('activity', act(T1, 2, 'output', 'more'));
  await page.click(page.button(T1, 'console-copy-new'));
  assert.doesNotMatch(page.clipboard.writes[1], /fatal: bad object/, 'cursor advanced');
  assert.ok(page.shell(T1) && page.strip(T1));
});

test('RET-15. Explicit Dismiss still releases evidence under every setting, browser-only', async () => {
  for (const value of ['30s', '5m', '30m', 'until-dismissed']) {
    const page = await start(world([successAt(T0), failed(T1, 'play_f')], { preferences: prefs(value) }));
    await page.click(page.button(T3, 'evidence-dismiss'));
    assert.equal(page.strip(T3), null, `${value}: success dismissed`);
    assert.ok(page.strip(T1), 'a different Player is untouched');
    await page.click(page.button(T1, 'evidence-dismiss'));
    assert.equal(page.strip(T1), null, `${value}: failure dismissed`);
    assert.equal(page.acks().length, 0, 'Dismiss never acknowledges reports');
  }
});

test('RET-16. Next Play behaviour from S54.3 is intact under until-dismissed (supersede, carry-over, per-Play dismissal)', async () => {
  const page = await start(world([done(T3, 'play_1', { command: 'old command', finishedAt: T0 })], { preferences: prefs('until-dismissed') }));
  await page.click(page.button(T3, 'console-toggle'));
  await page.refresh(world([view(T3, 'queued', { playRef: 'play_2', executionType: 'direct-shell', summary: 'next' })], { preferences: prefs('until-dismissed') }), T0 + 1_000);
  assert.match(page.stripText(T3), /Queued/, 'queued Play shows its own strip');
  await page.refresh(world([runningShell(T3, 'play_2', 'new command')], { preferences: prefs('until-dismissed') }), T0 + 2_000);
  assert.match(page.stripText(T3), /Running command/);
  assert.ok(page.shell(T3), 'human-open console carries into the next Play (LPT-29)');
  assert.doesNotMatch(page.stripText(T3), /old command/);
  await page.refresh(world([done(T3, 'play_2', { command: 'new command', finishedAt: T0 + 3_000 })], { preferences: prefs('until-dismissed') }), T0 + 4_000);
  assert.match(page.stripText(T3), /new command/);
  assert.deepEqual(JSON.parse(page.storage.getItem(STORAGE_KEY)).records.map((r) => r.playRef), ['play_2']);
});

test('RET-17. sessionStorage restore is safe with the configured policy; the stored record never carries a lifetime', async () => {
  const storage = memoryStorage();
  const first = await start(world([successAt(T0)], { preferences: prefs('until-dismissed') }), { storage });
  const stored = JSON.parse(storage.getItem(STORAGE_KEY)).records[0];
  assert.equal('retention' in stored || 'terminalRetention' in stored || 'expiresAt' in stored, false, 'lifetime is applied at read time, so a stale value can never override the setting');

  // Reload one hour later: the CURRENT setting decides.
  const later = world([], { now: T0 + 60 * MIN, preferences: prefs('30s') });
  const shortPage = await start(later, { storage: memoryStorage({ [STORAGE_KEY]: storage.getItem(STORAGE_KEY) }) });
  assert.equal(shortPage.strip(T3), null, '30 s setting: restored success is already past its lifetime');
  const keepPage = await start(world([], { now: T0 + 60 * MIN, preferences: prefs('until-dismissed') }), { storage: memoryStorage({ [STORAGE_KEY]: storage.getItem(STORAGE_KEY) }) });
  assert.equal(keepPage.strip(T3)?.dataset.terminalEvidence, 'completed', 'until-dismissed: restored');
  await first.click(first.button(T3, 'evidence-dismiss'));
  const dismissedPage = await start(world([], { now: T0 + 60 * MIN, preferences: prefs('until-dismissed') }), { storage: memoryStorage({ [STORAGE_KEY]: first.storage.getItem(STORAGE_KEY) }) });
  assert.equal(dismissedPage.strip(T3), null, 'dismissal restored too');

  const throwing = await start(world([successAt(T0)], { preferences: prefs('30m') }), { storage: throwingStorage() });
  assert.ok(throwing.strip(T3), 'blocked storage: retention still works');
});

// ---------------------------------------------------------------------------
// Settings UI
// ---------------------------------------------------------------------------

const RADIOS = { '30s': 'terminalRetention30s', '5m': 'terminalRetention5m', '30m': 'terminalRetention30m', 'until-dismissed': 'terminalRetentionUntilDismissed' };

test('RET-21. Settings: shown only with Dev Mode + View Player Terminal, reflects the value, saves only its own field', async () => {
  const hidden1 = await start(world([], { preferences: { devMode: false, livePlayerConsole: true, terminalRetention: '30m' } }));
  assert.equal(hidden1.$('terminalRetentionCard').hidden, true, 'hidden outside Dev Mode');
  const hidden2 = await start(world([], { preferences: { devMode: true, livePlayerConsole: false, terminalRetention: '30m' } }));
  assert.equal(hidden2.$('terminalRetentionCard').hidden, true, 'hidden while View Player Terminal is off (evidence needs both gates)');

  const page = await start(world([], { preferences: prefs('30m') }));
  assert.equal(page.$('terminalRetentionCard').hidden, false);
  for (const [value, id] of Object.entries(RADIOS)) assert.equal(page.$(id).checked, value === '30m', `${id} reflects saved value`);
  await page.change(page.$(RADIOS['until-dismissed']));
  assert.deepEqual(page.posts, [{ terminalRetention: 'until-dismissed' }], 'only its own field');
  assert.equal(page.$(RADIOS['until-dismissed']).checked, true);
  assert.equal(page.$(RADIOS['30m']).checked, false);

  const legacy = await start(world([], { preferences: prefs(undefined) }));
  assert.equal(legacy.$(RADIOS['5m']).checked, true, 'legacy status without the field shows 5 minutes');
  const bogus = await start(world([], { preferences: prefs('nonsense') }));
  assert.equal(bogus.$(RADIOS['5m']).checked, true, 'unknown value shows 5 minutes and does not break Settings');
  const copy = pageSource.slice(pageSource.indexOf('id="terminalRetentionCard"'), pageSource.indexOf('id="advancedPlayerDiscoveryCard"'));
  for (const jargon of ['ExecutionView', 'sessionStorage', 'projection', 'server clock', 'playRef']) assert.ok(!copy.includes(jargon), `no jargon: ${jargon}`);
  assert.match(copy, /Failed commands stay until dismissed or the next Play\./);
});

// ---------------------------------------------------------------------------
// Boundaries and the field-approved presentation lock
// ---------------------------------------------------------------------------

test('RET-18. No Terminal execution / output / routing / ledger substrate references the setting', () => {
  const files = ['src/player-activity.ts', 'src/terminal-player.ts', 'src/player-roster.ts', 'src/stadium-client.ts', 'src/control-plane/work-ledger.ts',
    'src/control-plane/execution-projection.ts', 'src/control-plane/router.ts', 'src/routing-policy.ts', 'src/control-plane/route-constraints.ts', 'src/player-control/contract.ts', 'src/player-control/host.ts', 'src/player-control/codex-app-server.ts'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.ok(!/terminalRetention|TERMINAL_RETENTION/i.test(text), `${file} must not know the setting`);
  }
  const block = pageSource.slice(pageSource.indexOf('Terminal Evidence Retention (S53 Play 2'), pageSource.indexOf('const stripCopy = '));
  for (const forbidden of ['/api/work', 'fetch(', 'api(', 'localStorage', 'acknowledgeWork', 'consoleActivity.set', 'upsertConsoleEntry']) {
    assert.ok(!block.includes(forbidden), `evidence block must not touch ${forbidden}`);
  }
  assert.ok(!/TERMINAL_EVIDENCE_DEFAULT_MS/.test(pageSource), 'the provisional hard-coded constant is gone; there is exactly one retention source');
});

test('RET-19. Advanced Player Discovery is unchanged and not coupled to retention', async () => {
  const discovery = { catalog: [{ playerType: 'terminal' }], externalCandidates: [{ shellPid: 1 }], runningElsewhere: [{ playerType: 'x' }], adoptableTerminals: [{ terminalName: 'pwsh', shellPid: 9 }] };
  for (const value of TERMINAL_RETENTION_VALUES) {
    const hiddenView = projectDiscovery(discovery, 'ask', advancedPlayerDiscoveryVisible({ devMode: true, advancedPlayerDiscovery: false, terminalRetention: value }));
    assert.deepEqual(hiddenView.adoptableTerminals, [], `${value}: still hidden when APD is off`);
    const shownView = projectDiscovery(discovery, 'ask', advancedPlayerDiscoveryVisible({ devMode: true, advancedPlayerDiscovery: true, terminalRetention: value }));
    assert.deepEqual(shownView.adoptableTerminals, discovery.adoptableTerminals, `${value}: visible when APD is on`);
  }
  const h = await daemonHarness();
  try {
    await h.post({ advancedPlayerDiscovery: true });
    await h.post({ terminalRetention: '30s' });
    assert.equal((await h.api('/api/preferences')).body.preferences.advancedPlayerDiscovery, true, 'saving retention leaves APD alone');
    await h.post({ advancedPlayerDiscovery: false });
    assert.equal((await h.api('/api/preferences')).body.preferences.terminalRetention, '30s', 'saving APD leaves retention alone');
  } finally { await h.stop(); }
  const page = await start(world([], { preferences: { devMode: true, livePlayerConsole: false, advancedPlayerDiscovery: false } }));
  assert.equal(page.$('advancedPlayerDiscoveryCard').hidden, false, 'APD card gating (Dev Mode only) unchanged');
  assert.equal(page.$('terminalRetentionCard').hidden, true, 'and independent of the retention card');
});

test('RET-20. Field-approved Terminal presentation is preserved: no auto-expand, mobile coexistence only, carry-over intact', async () => {
  const css = pageSource.slice(0, pageSource.indexOf('</style>'));
  // Desktop: the existing embedded ~half-height console. Mobile (<=619px): the existing full-screen one.
  assert.match(css, /\.play-console \{\s*margin-top: 8px;[^}]*height: 50vh; min-height: 280px; max-height: calc\(100vh - 140px\);/);
  assert.match(css, /@media \(max-width: 619px\) \{\s*\.play-console \{\s*position: fixed; inset: 0; z-index: 1000; width: 100vw; height: 100vh; height: 100dvh;/);

  // The ONLY writer that opens a console is the human's Expand click. Nothing here auto-expands or sizes.
  const adds = [...pageSource.matchAll(/consoleExpandedByInstance\.add\(/g)];
  assert.equal(adds.length, 1, 'exactly one place opens a console');
  assert.match(pageSource.slice(adds[0].index - 500, adds[0].index), /stripButton\('Expand'/, 'and it is the Expand button handler');
  const script = pageScript;
  assert.ok(!/autoExpand|auto-expand toggle|autoOpen/i.test(script.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'no auto-expand code or setting');
  assert.doesNotMatch(script, /matchMedia\('\(min-width/, 'no desktop breakpoint changes terminal behavior');
  assert.match(script, /mobileLiveTerminalViewport[\s\S]*matchMedia\('\(max-width: 619px\)'\)/, 'the only new terminal breakpoint decision is the explicit mobile coexistence gate');
  assert.ok(!/autoExpand|expandTerminal/i.test(pageSource.slice(pageSource.indexOf('id="terminalRetentionCard"'), pageSource.indexOf('id="advancedPlayerDiscoveryCard"'))), 'no auto-expand setting in Settings');

  // Behaviour the field sees: once Expanded, a Player's console stays open into its next Play and
  // after completion; a never-Expanded Player stays compact. Retention changes never resize or close it.
  const page = await start(world([runningShell(T3, 'play_1')], { preferences: prefs('5m') }));
  assert.equal(page.shell(T3), null, 'a never-expanded console is not force-opened');
  await page.click(page.button(T3, 'console-toggle'));
  assert.ok(page.shell(T3));
  await page.refresh(world([done(T3, 'play_1', { finishedAt: T0 })], { preferences: prefs('5m') }), T0 + 1_000);
  assert.ok(page.shell(T3), 'stays open through completion');
  await page.refresh(world([done(T3, 'play_1', { finishedAt: T0 })], { preferences: prefs('30s') }), T0 + 2_000);
  assert.ok(page.shell(T3), 'changing the retention setting never closes or resizes an open console');
  await page.refresh(world([runningShell(T3, 'play_2')], { preferences: prefs('30s') }), T0 + 3_000);
  assert.ok(page.shell(T3), 'and carries into the next Play');
  const fresh = await start(world([done(T3, 'play_x', { finishedAt: T0 })], { preferences: prefs('5m') }));
  assert.equal(fresh.shell(T3), null, 'a finished Play never force-opens a console either');
});
