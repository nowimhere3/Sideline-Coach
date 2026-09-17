// Coach Routines V0 Slice D — Dadified Dev Mode Settings + source selection.
//
// Two layers:
//   - A few REAL daemon tests (ControlPlaneDaemon + CoachRoutineEngine) proving backend
//     authority: Dev Mode defaults off, the first-enable default comes from the real
//     engine, a deliberate deletion is never resurrected, and Game isolation holds.
//   - A DOM-driven suite running the REAL src/public/index.html script against a mocked
//     fetch shaped exactly like the real endpoints (Slice A/B/C contracts, verified by
//     inspection against src/control-plane/daemon.ts and src/routine-sources.ts), proving
//     the browser only renders/stages backend truth and never invents a second store.
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
// Layer 1: real daemon / real CoachRoutineEngine
// ---------------------------------------------------------------------------

async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-slice-d-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 40800 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const register = (gameId, displayName) => {
    const socket = { readyState: 1, send() {}, close() {} };
    daemon.registryInstance.registerSession({
      instanceId: `session-${gameId}`, stadiumId: `stadium-${gameId}`, name: displayName, platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId, displayName, fingerprintSource: 'test', repoUri: `https://example.test/${gameId}.git` },
      rootFsPath: `C:\\Games\\${displayName}`, roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
    });
  };
  register('game_slice_d_a', 'Slice D Game A');
  register('game_slice_d_b', 'Slice D Game B');
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };
  return { dir, daemon, api };
}

test('SliceD-1. Dev Mode defaults OFF for a brand new install', async () => {
  const h = await daemonHarness();
  try {
    const status = (await h.api('/api/status')).body;
    assert.equal(status.preferences.devMode, false);
    assert.equal(status.routines.devMode, false);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('SliceD-2. Turning Dev Mode ON initializes the default routine only through the real engine', async () => {
  const h = await daemonHarness();
  try {
    const before = h.daemon.routineEngineInstance.forGame('game_slice_d_a');
    assert.equal(before.routines.length, 0, 'nothing exists before the deliberate transition');
    const result = await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_slice_d_a' }) });
    assert.equal(result.body.preferences.devMode, true);
    const after = h.daemon.routineEngineInstance.forGame('game_slice_d_a');
    assert.equal(after.routines.length, 1);
    assert.deepEqual([after.routines[0].template, after.routines[0].enabled, after.routines[0].cadence], ['canonical-refresh', true, { kind: 'plays', every: 5 }]);
    assert.equal(result.body.routines.routines[0].sources.length, 0, 'empty sources: truthfully Needs files, not a fabricated ready state');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('SliceD-3. A deliberate deletion is never resurrected by a later Dev Mode toggle', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_slice_d_a' }) });
    const routineId = h.daemon.routineEngineInstance.forGame('game_slice_d_a').routines[0].id;
    const deleted = await h.api(`/api/routines/${routineId}`, { method: 'DELETE', body: JSON.stringify({ gameId: 'game_slice_d_a' }) });
    assert.equal(deleted.body.success, true);
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: false, gameId: 'game_slice_d_a' }) });
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_slice_d_a' }) });
    assert.equal(h.daemon.routineEngineInstance.forGame('game_slice_d_a').routines.length, 0, 'human deletion intent survives the toggle');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('SliceD-4. Game isolation: enabling Dev Mode for Game A never creates or exposes a routine in Game B', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_slice_d_a' }) });
    assert.equal(h.daemon.routineEngineInstance.forGame('game_slice_d_b').routines.length, 0);
    const statusB = await h.api('/api/status'); // selected Game is still A by default registration order; force B explicitly
    await h.api('/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: 'game_slice_d_b' }) });
    const afterSelect = (await h.api('/api/status')).body;
    assert.equal(afterSelect.routines.gameId, 'game_slice_d_b');
    assert.equal(afterSelect.routines.routines.length, 0, "Game B's own projection is empty; Game A's default never leaked across");
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Layer 2: the real browser script, DOM-driven, against a mocked-but-shaped backend
// ---------------------------------------------------------------------------

const GAME = 'game_git_trend';
const OTHER = 'game_git_gs3';
const T0 = 1_800_000_000_000;

const defaultRoutine = (overrides = {}) => ({
  id: 'rt_default', name: 'Canonical Refresh', enabled: true, template: 'canonical-refresh',
  cadence: { kind: 'plays', every: 5 }, cadenceLabel: 'Every 5 Plays',
  targets: { strategyBoard: true, players: false }, targetsLabel: 'Strategy Board',
  due: false, lastSentLabel: 'Last sent: never', nextLabel: 'Next: in 5 Plays',
  sources: [], includeLocalRoot: true, ...overrides
});

const routinesProjection = (gameId, devMode, routines) => ({ gameId, devMode, playCount: 0, routines });

function daemonStatus({ devMode = false, routines = [], gameId = GAME, execution = true } = {}) {
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: gameId === GAME ? 'Trend' : 'GS3' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }, { gameId: OTHER, displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode },
    routines: routinesProjection(gameId, devMode, routines),
    at: T0
  };
  if (execution) status.execution = { gameId, epoch: 'E1', serverNow: T0, byInstance: {} };
  return status;
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
  const statusFetches = { count: 0 };
  let onPatch = async (routineId, body) => ({ success: true, routine: { ...defaultRoutine(), id: routineId }, projection: status.routines });
  let onDelete = async () => ({ success: true, projection: status.routines });
  let onDue = async () => ({ success: true, message: 'Marked ready to refresh.' });
  let onSuggest = async () => ({ success: true, gameId: status.selectedGameId, suggestions: [] });
  let onBrowse = async (dir) => ({ success: true, gameId: status.selectedGameId, dir, entries: [] });
  let onCheck = async () => ({ success: true, checks: [] });
  let onPreferences = async (body) => ({ success: true, preferences: { ...status.preferences, ...body }, message: 'Saved.', routines: status.routines });
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
      if (url.startsWith('/api/status')) { statusFetches.count += 1; return reply(200, status); }
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url === '/api/game/select') return reply(200, { success: true, status });
      posts.push({ url, body });
      if (url === '/api/preferences' && options.method === 'POST') return reply(200, await onPreferences(body));
      if (url.startsWith('/api/routines/sources/suggest')) return reply(200, await onSuggest());
      if (url.startsWith('/api/routines/sources/browse')) {
        const dir = new URL(url, 'http://x').searchParams.get('dir') || '';
        return reply(200, await onBrowse(dir));
      }
      if (url === '/api/routines/sources/check') return reply(200, await onCheck(body));
      const dueMatch = /^\/api\/routines\/([^/]+)\/due$/.exec(url);
      if (dueMatch && options.method === 'POST') return reply(200, await onDue(dueMatch[1], body));
      const mutateMatch = /^\/api\/routines\/([^/]+)$/.exec(url);
      if (mutateMatch && options.method === 'PATCH') return reply(200, await onPatch(mutateMatch[1], body));
      if (mutateMatch && options.method === 'DELETE') return reply(200, await onDelete(mutateMatch[1], body));
      return reply(200, {});
    },
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const findAll = (root, pred) => { const hits = []; walk(root, (n) => { if (pred(n)) hits.push(n); }); return hits; };
  const page = {
    $, allText, find, findAll, posts, statusFetches,
    setStatus: (next) => { status = next; },
    onPatch: (fn) => { onPatch = fn; },
    onDelete: (fn) => { onDelete = fn; },
    onDue: (fn) => { onDue = fn; },
    onSuggest: (fn) => { onSuggest = fn; },
    onBrowse: (fn) => { onBrowse = fn; },
    onCheck: (fn) => { onCheck = fn; },
    routineCards: () => page.findAll($('coachRoutinesList'), (n) => n.className === 'routine-card'),
    // Q2.10F.7 V0.2: routine cards are collapsed by default — this clicks "Edit" for the
    // exact routine and returns its fresh (re-rendered) expanded card node.
    expandRoutine: async (routineId) => {
      const card = page.routineCards().find((c) => c.attributes['data-routine-id'] === routineId);
      const editBtn = page.find(card, (n) => n.tagName === 'button' && n.textContent === 'Edit');
      await page.click(editBtn);
      return page.routineCards().find((c) => c.attributes['data-routine-id'] === routineId);
    },
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    // Several production handlers are deliberately fire-and-forget (`() => void asyncFn()`),
    // the same pattern used throughout this file's other buttons — so a click is followed
    // by a flush rather than relied upon to return an awaitable promise.
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

test('SliceD-5. Coach Routines UI stays hidden and off by default (Dad Mode off surface, Dev Mode off)', async () => {
  const page = await startPage(daemonStatus({ devMode: false }));
  assert.equal(page.$('devModeToggle').checked, false);
  assert.equal(page.$('coachRoutinesCard').hidden, true);
});

test('SliceD-6. Turning Dev Mode ON posts the exact preference shape and reveals Coach Routines from backend truth only', async () => {
  const page = await startPage(daemonStatus({ devMode: false }));
  page.$('devModeToggle').checked = true;
  await page.change(page.$('devModeToggle'));
  const call = page.posts.find((p) => p.url === '/api/preferences');
  assert.deepEqual(call.body, { devMode: true, gameId: GAME });
  await page.refresh(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  assert.equal(page.$('coachRoutinesCard').hidden, false);
  const card = page.routineCards()[0];
  assert.match(page.allText(card), /Coach Refresh/, 'Dad-facing name, never the raw internal "Canonical Refresh" label');
  assert.doesNotMatch(page.allText(card), /Canonical Refresh/);
});

test('SliceD-7. Every-N-Plays cadence change persists with the exact shape', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  const card = await page.expandRoutine('rt_default');
  const n = page.find(card, (el) => el.className === 'routine-cadence-n');
  n.value = '3';
  await page.change(n);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default');
  assert.deepEqual(call.body, { gameId: GAME, cadence: { kind: 'plays', every: 3 } });
});

test('SliceD-7b. Switching the cadence unit to Days sends everyMs, never the internal word "cadence" concept exposed', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  const card = await page.expandRoutine('rt_default');
  const unit = page.find(card, (el) => el.className === 'routine-cadence-unit');
  unit.value = 'days';
  await page.change(unit);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default');
  assert.deepEqual(call.body.cadence, { kind: 'time', everyMs: 5 * 86_400_000 });
  assert.doesNotMatch(page.allText(card), /\bcadence\b|\beveryMs\b/i);
});

test('SliceD-8. Enable/disable persists', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine({ enabled: true })] }));
  const card = page.routineCards()[0];
  const toggle = page.find(card, (n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Coach Refresh on or off');
  toggle.checked = false;
  await page.change(toggle);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default');
  assert.deepEqual(call.body, { gameId: GAME, enabled: false });
});

test('SliceD-9. "Send to Coach" persists; "Send to Players" is disabled and never implies working delivery', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  const card = await page.expandRoutine('rt_default');
  const coach = page.find(card, (n) => n.attributes['aria-label'] === 'Send to Coach');
  coach.checked = false;
  await page.change(coach);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default');
  assert.deepEqual(call.body, { gameId: GAME, targets: { strategyBoard: false, players: false } });

  const players = page.find(card, (n) => n.attributes['aria-label'] === 'Send to Players (coming soon)');
  assert.equal(players.disabled, true);
  assert.equal(players.checked, false);
  assert.match(page.allText(card), /Coming soon/);
  assert.doesNotMatch(page.allText(card), /Strategy Board|strategyBoard/i, 'internal target vocabulary never reaches Dad-facing text');
});

test('SliceD-10 / V0.2. Suggestions are on-demand (never eagerly rendered as a long list); "Suggest references" fetches and reveals them, and nothing mutates until confirmed', async () => {
  const initialStatus = daemonStatus({ devMode: true, routines: [defaultRoutine()] });
  const raw = createPage(initialStatus);
  raw.onSuggest(async () => ({ success: true, gameId: GAME, suggestions: [{ path: 'NORTH-STAR.md', kind: 'file', reason: 'North Star rules' }] }));
  // Applies the mutation to the shared status the way the real daemon would, so the
  // subsequent refresh() actually reconverges to a state with the new source in it.
  raw.onPatch(async (routineId, body) => {
    const routine = initialStatus.routines.routines.find((r) => r.id === routineId);
    if (routine && body.sources) routine.sources = body.sources.map((s) => ({ ...s, state: s.kind }));
    return { success: true, routine, projection: initialStatus.routines };
  });
  const page = await raw.start();
  await flush();
  const postsBefore = page.posts.filter((p) => p.url.startsWith('/api/routines/rt_default')).length;
  assert.equal(postsBefore, 0, 'no background mutation on render');
  assert.equal(page.posts.some((p) => p.url.startsWith('/api/routines/sources/suggest')), false, 'V0.2: not even the lookup fires until asked');

  let card = await page.expandRoutine('rt_default');
  assert.doesNotMatch(page.allText(card), /Suggested references/, 'collapsed by default, not eagerly rendered as a long list');
  const suggestBtn = page.find(card, (n) => n.tagName === 'button' && n.textContent === 'Suggest references');
  assert.ok(suggestBtn, 'an explicit on-demand entry point');
  await page.click(suggestBtn);
  card = page.routineCards().find((c) => c.attributes['data-routine-id'] === 'rt_default');
  assert.match(page.allText(card), /Suggested references/);
  assert.match(page.allText(card), /Sideline found project docs that may be useful for Coach Refresh\./);

  const addBtn = page.find(card, (n) => n.tagName === 'button' && n.textContent === 'Add');
  assert.ok(addBtn, 'an explicit, unambiguous Add action, nothing pre-selected');
  await page.click(addBtn);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default' && p.body.sources);
  assert.deepEqual(call.body.sources, [{ path: 'NORTH-STAR.md', kind: 'file' }], 'added only on explicit human confirmation');
  card = page.routineCards().find((c) => c.attributes['data-routine-id'] === 'rt_default');
  assert.match(page.allText(card), /✓ Added/, 'once configured, the suggestion truthfully shows it is already added');

  const hideBtn = page.find(card, (n) => n.tagName === 'button' && n.textContent === 'Hide suggestions');
  assert.ok(hideBtn, 'the human can hide the suggestions again');
  await page.click(hideBtn);
  card = page.routineCards().find((c) => c.attributes['data-routine-id'] === 'rt_default');
  assert.doesNotMatch(page.allText(card), /Suggested references/);
});

test('SliceD-11. One "+ Add references" entry point; CHECK selects, OPEN only navigates and never auto-selects', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  page.onBrowse(async (dir) => ({
    success: true, gameId: GAME, dir,
    entries: dir === '' ? [{ name: 'Project SOP', path: 'Project SOP', kind: 'folder' }, { name: 'README.md', path: 'README.md', kind: 'file' }] : []
  }));
  const card = await page.expandRoutine('rt_default');
  assert.equal(page.find(card, (n) => n.textContent === '+ Add files'), null, 'the old duplicate entry point is gone');
  assert.equal(page.find(card, (n) => n.textContent === 'Browse folder'), null);
  await page.click(page.find(card, (n) => n.textContent === '+ Add references'));
  const openBtn = page.find(page.routineCards()[0], (n) => n.className === 'quiet routine-browse-open');
  assert.equal(openBtn.textContent, 'Open ›', 'OPEN is a distinct, separately tappable control from the checkbox');
  const postsBefore = page.posts.filter((p) => p.url.startsWith('/api/routines/rt_default')).length;
  await page.click(openBtn);
  assert.equal(page.posts.filter((p) => p.url.startsWith('/api/routines/rt_default')).length, postsBefore, 'opening a folder never selects it');
  const dirCall = page.posts.filter((p) => p.url.startsWith('/api/routines/sources/browse'));
  assert.ok(dirCall.length >= 2, 'a real second browse request was made for the opened folder');
});

test('SliceD-12. Checking a folder from its OWN listing (no need to open it first) stores exactly that folder', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  page.onBrowse(async (dir) => ({ success: true, gameId: GAME, dir, entries: [{ name: 'Project SOP', path: 'Project SOP', kind: 'folder' }] }));
  const card = await page.expandRoutine('rt_default');
  await page.click(page.find(card, (n) => n.textContent === '+ Add references'));
  const row = page.find(page.routineCards()[0], (n) => n.className === 'routine-browse-entry');
  const checkbox = page.find(row, (n) => n.tagName === 'input');
  checkbox.checked = true;
  for (const fn of checkbox.listeners.change || []) fn();
  await flush();
  const addSelected = page.find(page.routineCards()[0], (n) => n.textContent?.startsWith('Add '));
  assert.equal(addSelected.textContent, 'Add 1 selected', 'the count is visible before confirming');
  await page.click(addSelected);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default' && p.body.sources);
  assert.deepEqual(call.body.sources, [{ path: 'Project SOP', kind: 'folder' }], 'checking the folder IS the whole-folder choice; no separate step was needed');
});

test('SliceD-13. Individual file selection stores only the chosen files, never the whole folder', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  page.onBrowse(async (dir) => ({
    success: true, gameId: GAME, dir: 'Project SOP',
    entries: [
      { name: 'NORTH-STAR.md', path: 'Project SOP/NORTH-STAR.md', kind: 'file' },
      { name: 'Manual.md', path: 'Project SOP/Manual.md', kind: 'file' },
      { name: 'Diagnostics.md', path: 'Project SOP/Diagnostics.md', kind: 'file' }
    ]
  }));
  const card = await page.expandRoutine('rt_default');
  await page.click(page.find(card, (n) => n.textContent === '+ Add references'));
  const rows = page.findAll(page.routineCards()[0], (n) => n.className === 'routine-browse-entry');
  const north = page.find(rows[0], (n) => n.tagName === 'input');
  const manual = page.find(rows[1], (n) => n.tagName === 'input');
  north.checked = true; for (const fn of north.listeners.change || []) fn();
  manual.checked = true; for (const fn of manual.listeners.change || []) fn();
  await flush();
  const addBtn = page.find(page.routineCards()[0], (n) => n.textContent === 'Add 2 selected');
  assert.ok(addBtn, 'the button communicates exactly how many are selected');
  await page.click(addBtn);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default' && p.body.sources);
  assert.deepEqual(call.body.sources.sort((a, b) => a.path.localeCompare(b.path)), [
    { path: 'Project SOP/Manual.md', kind: 'file' },
    { path: 'Project SOP/NORTH-STAR.md', kind: 'file' }
  ]);
});

test('SliceD-14. Removing a source updates backend state with the remaining set', async () => {
  const routine = defaultRoutine({ sources: [{ path: 'NORTH-STAR.md', kind: 'file', state: 'file' }, { path: 'Docs ANCHOR', kind: 'folder', state: 'folder' }] });
  const page = await startPage(daemonStatus({ devMode: true, routines: [routine] }));
  const card = await page.expandRoutine('rt_default');
  const removeBtn = page.find(card, (n) => n.attributes['aria-label'] === 'Remove NORTH-STAR.md from what Coach rereads');
  await page.click(removeBtn);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default');
  assert.deepEqual(call.body, { gameId: GAME, sources: [{ path: 'Docs ANCHOR', kind: 'folder' }] });
});

test('SliceD-15. Missing/blocked/unchecked/changed states are Dadified truthfully; a confirmed source shows no warning', async () => {
  const routine = defaultRoutine({ sources: [
    { path: 'ok.md', kind: 'file', state: 'file' },
    { path: 'gone.md', kind: 'file', state: 'missing' },
    { path: 'locked', kind: 'folder', state: 'blocked' },
    { path: 'fresh.md', kind: 'file', state: 'not-checked' },
    { path: 'wasfile', kind: 'file', state: 'folder' }
  ] });
  const page = await startPage(daemonStatus({ devMode: true, routines: [routine] }));
  const card = await page.expandRoutine('rt_default');
  const text = page.allText(card);
  assert.match(text, /gone\.md[\s\S]*?Can't find this/);
  assert.match(text, /locked[\s\S]*?Can't use this location/);
  assert.match(text, /fresh\.md[\s\S]*?Not checked yet/);
  assert.match(text, /wasfile[\s\S]*?This changed/);
  assert.doesNotMatch(text, /lastCheck|Needs files/);
  const okRow = page.find(card, (n) => n.className === 'routine-source-path' && n.textContent === 'ok.md');
  assert.equal(page.find(okRow.parentNode, (n) => n.className === 'routine-source-state'), null, 'a confirmed source carries no warning badge');
});

test('SliceD-16. Zero sources shows a Dadified needs-message, never the internal phrase "Needs files"', async () => {
  const routine = defaultRoutine({ needs: 'sources' });
  const page = await startPage(daemonStatus({ devMode: true, routines: [routine] }));
  const card = await page.expandRoutine('rt_default');
  const text = page.allText(card);
  assert.match(text, /Add at least one reference/);
  assert.doesNotMatch(text, /Needs files/);
});

test('SliceD-17. Game switch cannot leak sources: a new Game\'s projection replaces the list and stale browse/suggestion state is dropped', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine({ id: 'rt_a', name: 'A' })] }));
  page.onBrowse(async (dir) => ({ success: true, gameId: GAME, dir, entries: [{ name: 'x.md', path: 'x.md', kind: 'file' }] }));
  const cardA = await page.expandRoutine('rt_a');
  await page.click(page.find(cardA, (n) => n.textContent === '+ Add references'));
  assert.ok(page.find(page.$('coachRoutinesList'), (n) => n.className === 'routine-browse'), 'browse panel open before switching');

  // A non-canonical-refresh template so its own name renders (the default template's
  // Dad-facing title is always "Coach Refresh", by design, regardless of stored name).
  page.setStatus(daemonStatus({ devMode: true, routines: [defaultRoutine({ id: 'rt_b', name: 'B Routine', template: 'custom' })], gameId: OTHER }));
  const gameList = page.$('gameList');
  const gs3 = gameList.children.find((item) => item.children[1]?.textContent === 'GS3');
  await page.click(gs3);
  await flush();

  const cards = page.routineCards();
  assert.equal(cards.length, 1);
  // Collapsed by default in the new Game too (V0.2) — its summary text carries the name.
  assert.match(page.allText(cards[0]), /B Routine/);
  const cardB = await page.expandRoutine('rt_b');
  // A custom-template routine's name renders as an editable input (Coach Routines V0.1),
  // so its value — not textContent — carries the name.
  const nameInput = page.find(cardB, (n) => n.className === 'routine-name-input');
  assert.equal(nameInput.value, 'B Routine');
  assert.equal(page.find(page.$('coachRoutinesList'), (n) => n.className === 'routine-browse'), null, 'no leaked browse state from the old Game');
});

test('SliceD-18. Source contents never render: only name/path/kind/reason fields reach the DOM', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  page.onBrowse(async (dir) => ({ success: true, gameId: GAME, dir, entries: [{ name: 'secret.md', path: 'secret.md', kind: 'file', content: 'TOP SECRET FILE BODY' }] }));
  const card = await page.expandRoutine('rt_default');
  await page.click(page.find(card, (n) => n.textContent === '+ Add references'));
  assert.doesNotMatch(page.allText(page.routineCards()[0]), /TOP SECRET FILE BODY/);
  assert.doesNotMatch(pageSource, /entry\.content|source\.content\b/);
});

test('SliceD-19. Manual due is no longer a Dad-facing routine action (V0.2); Delete routine still calls the real exact-routine endpoint', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  const card = await page.expandRoutine('rt_default');
  assert.equal(page.find(card, (n) => n.textContent === 'Refresh now'), null, 'the machine-sounding old label is gone');
  assert.equal(page.find(card, (n) => n.textContent === 'Refresh on next Copy'), null, 'the earlier Dad-facing label was renamed, then removed entirely');
  assert.equal(page.find(card, (n) => n.textContent === 'Add to next report'), null, 'V0.2: manual due is no longer a Dad-facing routine action');
  assert.equal(page.posts.some((p) => p.url === '/api/routines/rt_default/due'), false);

  const deleteBtn = page.find(page.routineCards()[0], (n) => n.textContent === 'Delete routine');
  // The Delete handler awaits the confirm modal's own promise, so its click must not be
  // awaited until after the modal is answered (same pattern as the existing Remove Player /
  // Restart with Coach controls confirm-modal tests elsewhere in this repo).
  const deleting = page.click(deleteBtn);
  await flush();
  await page.click(page.$('confirmOkBtn'));
  await deleting;
  const del = page.posts.find((p) => p.url === '/api/routines/rt_default' && !p.body?.sources && !p.body?.cadence);
  assert.ok(del);
});

test('SliceD-20. No manual browser refresh is required: every mutation converges the view via a real status re-fetch', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  const before = page.statusFetches.count;
  const card = page.routineCards()[0];
  const toggle = page.find(card, (n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Coach Refresh on or off');
  toggle.checked = false;
  await page.change(toggle);
  assert.ok(page.statusFetches.count > before, 'the mutation triggers refresh() on its own');
});

test('SliceD-21. No Incoming/report/clipboard mutation occurs from any Coach Routines interaction', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine({ sources: [{ path: 'a.md', kind: 'file', state: 'file' }] })] }));
  const card = await page.expandRoutine('rt_default');
  await page.click(page.find(card, (n) => n.attributes['aria-label']?.startsWith('Remove ')));
  assert.equal(page.posts.filter((p) => p.url === '/api/work/acknowledge').length, 0);
  assert.equal(page.posts.filter((p) => p.url.startsWith('/api/reports')).length, 0);
});

test('SliceD-22. Existing Running Players preference still renders and saves independently of Coach Routines', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: [defaultRoutine()] }));
  assert.ok(page.$('runningPrefAsk'));
  await page.click(page.$('runningPrefAutoAdd'));
  await page.change(page.$('runningPrefAutoAdd'));
  const call = page.posts.find((p) => p.url === '/api/preferences' && p.body.runningPlayers);
  assert.equal(call.body.runningPlayers, 'auto-add');
});

test('SliceD-23. Mobile: Coach Routines controls stay in the existing Settings card flow, no floating/fixed UI', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  const routineRules = css.split('}').filter((rule) => /\.routine-/.test(rule)).join('}');
  assert.doesNotMatch(routineRules, /position:\s*(fixed|sticky|absolute)/);
  assert.match(css, /\.routine-section > button, \.routine-card > button\.quiet, \.routine-card > \.routine-delete-btn \{[^}]*min-height: 40px;/);
  assert.match(css, /\.routine-browse-entry \{[^}]*min-height: 44px;/, 'browse rows stay thumb-friendly');
  assert.match(css, /\.routine-browse-open \{/, 'Open is a visually distinct, separately tappable control from the checkbox');
});

test('SliceD-24. Vocabulary check: no internal words leak into Coach Routines DOM text', async () => {
  const routine = defaultRoutine({ sources: [{ path: 'a.md', kind: 'file', state: 'file' }] });
  const page = await startPage(daemonStatus({ devMode: true, routines: [routine] }));
  const text = page.allText(page.routineCards()[0]);
  for (const forbidden of [/\bcanonical\b/i, /\bprojection\b/i, /\blastCheck\b/, /\bstrategy board\b/i, /\bRPC\b/, /\bdelivery cycle\b/i]) {
    assert.doesNotMatch(text, forbidden);
  }
});
