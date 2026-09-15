// Tiny UX Polish — Routine Saved Time + In-Place View Player Bridge.
//
// Two small, unrelated Dad-facing changes:
//   1. Collapsed Coach Refresh cards show a truthful "Saved <time>" from a real backend
//      persisted mutation timestamp (never fabricated in the browser).
//   2. After a confirmed dispatch, the SAME dispatchBtn slot temporarily becomes
//      "View <exact Player>" instead of a second CTA elsewhere (see the dedicated,
//      much larger q2-10f-2-outgoing-handoff-view-player.test.mjs D-1..D-24 for the
//      full bridge contract — this file only adds the couple of checks not already
//      covered there: initial "Dispatch Play" state and "no focus without a click").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

// ---------------------------------------------------------------------------
// Layer 1: real daemon / real CoachRoutineEngine — proves updatedAt is a real,
// backend-persisted mutation timestamp, not a browser fabrication.
// ---------------------------------------------------------------------------

async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-savedtime-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 41900 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const socket = { readyState: 1, send() {}, close() {} };
  daemon.registryInstance.registerSession({
    instanceId: 'session-saved', stadiumId: 'stadium-saved', name: 'Saved Game', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId: 'game_saved', displayName: 'Saved Game', fingerprintSource: 'test' },
    rootFsPath: 'C:\\Games\\Saved', roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };
  return { dir, daemon, api };
}

test('Saved-1. create() sets a real updatedAt equal to createdAt; update() advances it on a real successful mutation', async () => {
  const h = await daemonHarness();
  try {
    const created = await h.api('/api/routines', { method: 'POST', body: JSON.stringify({ gameId: 'game_saved', name: 'Coach Refresh', template: 'custom', cadence: { kind: 'plays', every: 5 } }) });
    const routine = created.body.routine;
    assert.equal(routine.updatedAt, routine.createdAt);
    await wait(5);
    const edited = await h.api(`/api/routines/${routine.id}`, { method: 'PATCH', body: JSON.stringify({ gameId: 'game_saved', name: 'Renamed' }) });
    assert.ok(edited.body.routine.updatedAt > routine.updatedAt, 'a real successful mutation advances updatedAt');
    assert.equal(edited.body.routine.createdAt, routine.createdAt, 'createdAt never changes');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Saved-2. Two routines maintain independent updatedAt values', async () => {
  const h = await daemonHarness();
  try {
    const a = (await h.api('/api/routines', { method: 'POST', body: JSON.stringify({ gameId: 'game_saved', name: 'A', template: 'custom', cadence: { kind: 'plays', every: 5 } }) })).body.routine;
    await wait(5);
    const b = (await h.api('/api/routines', { method: 'POST', body: JSON.stringify({ gameId: 'game_saved', name: 'B', template: 'custom', cadence: { kind: 'plays', every: 5 } }) })).body.routine;
    await wait(5);
    const editedA = await h.api(`/api/routines/${a.id}`, { method: 'PATCH', body: JSON.stringify({ gameId: 'game_saved', name: 'A renamed' }) });
    assert.ok(editedA.body.routine.updatedAt > b.updatedAt, 'A was edited after B was created');
    const stillB = h.daemon.routineEngineInstance.forGame('game_saved').routines.find((r) => r.id === b.id);
    assert.equal(stillB.updatedAt, b.updatedAt, "B's own updatedAt is untouched by A's edit");
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Saved-3. An invalid (rejected) mutation never advances updatedAt', async () => {
  const h = await daemonHarness();
  try {
    const routine = (await h.api('/api/routines', { method: 'POST', body: JSON.stringify({ gameId: 'game_saved', name: 'Coach Refresh', template: 'custom', cadence: { kind: 'plays', every: 5 } }) })).body.routine;
    await wait(5);
    const rejected = await h.api(`/api/routines/${routine.id}`, { method: 'PATCH', body: JSON.stringify({ gameId: 'game_saved', cadence: { kind: 'plays', every: 999 } }) });
    assert.equal(rejected.status, 400, 'an out-of-range cadence is rejected');
    const stillThere = h.daemon.routineEngineInstance.forGame('game_saved').routines.find((r) => r.id === routine.id);
    assert.equal(stillThere.updatedAt, routine.updatedAt, 'the rejected mutation never persisted, so updatedAt is untouched');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Layer 2: the real browser script, DOM-driven — collapsed-card Saved display + Done.
// ---------------------------------------------------------------------------

const GAME = 'game_git_trend';
const T0 = 1_800_000_000_000;

const defaultRoutine = (overrides = {}) => ({
  id: 'rt_default', name: 'Coach Refresh', enabled: true, template: 'custom',
  cadence: { kind: 'plays', every: 1 }, cadenceLabel: 'Every 1 Play',
  targets: { strategyBoard: true, players: false }, targetsLabel: 'Strategy Board',
  due: false, lastSentLabel: 'Last sent: never', nextLabel: 'Next: in 1 Play',
  sources: [{ path: 'a.md', kind: 'file', state: 'file' }], includeLocalRoot: true,
  updatedAt: T0 - 60_000, ...overrides
});

function daemonStatus({ devMode = true, routines = [defaultRoutine()], gameId = GAME } = {}) {
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: 'Trend' },
    games: [{ gameId, displayName: 'Trend', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode },
    routines: { gameId, devMode, playCount: 0, routines },
    execution: { gameId, epoch: 'E1', serverNow: T0, byInstance: {} },
    at: T0
  };
}

function createPage(initialStatus) {
  const elements = new Map();
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
      focus() {}, blur() {}
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
  const posts = [];
  let onPatch = async (routineId, body) => {
    const routine = status.routines.routines.find((r) => r.id === routineId);
    if (routine) Object.assign(routine, body, { updatedAt: Date.now() });
    return { success: true, routine, projection: status.routines };
  };
  const ctx = {
    document: {
      getElementById: $, querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []),
      createElement: (tag) => makeNode('', tag), addEventListener() {}, body: makeNode('body'), activeElement: null
    },
    location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: () => ({ matches: false }),
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      posts.push({ url, body });
      const mutateMatch = /^\/api\/routines\/([^/]+)$/.exec(url);
      if (mutateMatch && options.method === 'PATCH') return reply(200, await onPatch(mutateMatch[1], body));
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const findAll = (root, pred) => { const hits = []; walk(root, (n) => { if (pred(n)) hits.push(n); }); return hits; };
  const page = {
    $, allText, find, findAll, posts,
    setStatus: (next) => { status = next; },
    onPatch: (fn) => { onPatch = fn; },
    routineCards: () => page.findAll($('coachRoutinesList'), (n) => n.className === 'routine-card'),
    expandRoutine: async (routineId) => {
      const card = page.routineCards().find((c) => c.attributes['data-routine-id'] === routineId);
      await page.click(page.find(card, (n) => n.tagName === 'button' && n.textContent === 'Edit'));
      return page.routineCards().find((c) => c.attributes['data-routine-id'] === routineId);
    },
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
    change: async (node) => { for (const fn of node.listeners.change || []) await fn({ target: node }); await flush(); },
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

test('Saved-4. The collapsed card shows deterministic "Saved <time>" clock text, not a ticking relative timer', async () => {
  const fixedTime = new Date(T0);
  const page = await startPage(daemonStatus({ routines: [defaultRoutine({ updatedAt: T0 })] }));
  const card = page.routineCards()[0];
  const summary = page.find(card, (n) => n.className === 'routine-status-line');
  assert.match(summary.textContent, /Every 1 Play · 1 reference · Saved/);
  assert.doesNotMatch(summary.textContent, /ago|just now/i, 'deterministic clock time, not a relative "N minutes ago" label');
  const expectedTime = fixedTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  assert.ok(summary.textContent.includes(expectedTime), `expected the deterministic time "${expectedTime}" in "${summary.textContent}"`);
});

test('Saved-5. Done waits for a real successful save, collapses, and the collapsed card then shows the freshly saved time', async () => {
  const page = await startPage(daemonStatus({ routines: [defaultRoutine({ updatedAt: T0 - 3_600_000 })] }));
  const card = await page.expandRoutine('rt_default');
  const nameInput = page.find(card, (n) => n.className === 'routine-name-input');
  nameInput.value = 'Renamed Refresh';
  let savedAt;
  page.onPatch(async (routineId, body) => {
    const routine = { ...defaultRoutine(), ...body, id: routineId };
    savedAt = Date.now();
    routine.updatedAt = savedAt;
    page.setStatus(daemonStatus({ routines: [routine] }));
    return { success: true, routine, projection: {} };
  });
  await page.change(nameInput);
  const doneBtn = page.find(page.routineCards().find((c) => c.attributes['data-routine-id'] === 'rt_default'), (n) => n.textContent === 'Done');
  await page.click(doneBtn);
  const collapsed = page.routineCards()[0];
  assert.ok(page.find(collapsed, (n) => n.textContent === 'Edit'), 'collapsed after the real save succeeded');
  const summary = page.find(collapsed, (n) => n.className === 'routine-status-line');
  const expectedTime = new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  assert.ok(summary.textContent.includes(`Saved ${expectedTime}`), `expected the just-saved time in "${summary.textContent}"`);
});

test('Saved-6. A failed save never advances the displayed saved time, and Done stays expanded', async () => {
  const page = await startPage(daemonStatus({ routines: [defaultRoutine({ updatedAt: T0 - 3_600_000 })] }));
  const card = await page.expandRoutine('rt_default');
  page.onPatch(async () => { throw Object.assign(new Error('save failed'), { data: { success: false, message: 'Could not save that change' } }); });
  const nameInput = page.find(card, (n) => n.className === 'routine-name-input');
  nameInput.value = 'Attempted rename';
  await page.change(nameInput);
  const doneBtn = page.find(page.routineCards().find((c) => c.attributes['data-routine-id'] === 'rt_default'), (n) => n.textContent === 'Done');
  await page.click(doneBtn);
  const stillExpanded = page.routineCards().find((c) => c.attributes['data-routine-id'] === 'rt_default');
  assert.equal(page.find(stillExpanded, (n) => n.textContent === 'Edit'), null, 'stays expanded on save failure');
  const saveText = page.find(stillExpanded, (n) => n.className?.startsWith?.('routine-save-text'));
  assert.match(saveText.textContent, /Couldn't save/);
});

test('Saved-7. Reload/re-render (a plain status refresh) never fabricates a new save time', async () => {
  const page = await startPage(daemonStatus({ routines: [defaultRoutine({ updatedAt: T0 - 3_600_000 })] }));
  const before = page.find(page.routineCards()[0], (n) => n.className === 'routine-status-line').textContent;
  await page.refresh(daemonStatus({ routines: [defaultRoutine({ updatedAt: T0 - 3_600_000 })] }));
  const after = page.find(page.routineCards()[0], (n) => n.className === 'routine-status-line').textContent;
  assert.equal(after, before, 're-rendering the identical backend truth never advances the saved time');
});

// ---------------------------------------------------------------------------
// Dispatch bridge completeness (initial state + no auto-focus)
// ---------------------------------------------------------------------------

test('Bridge-1. Before any dispatch, the primary CTA is plainly "Dispatch Play"', async () => {
  const page = await startPage(daemonStatus({ routines: [] }));
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play');
});
