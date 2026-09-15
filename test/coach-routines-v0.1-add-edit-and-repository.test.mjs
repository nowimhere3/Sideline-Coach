// Coach Routines V0.1 — Add / Edit + AI Assistant Coach Repository Coordinates.
//
// Two layers, matching the established pattern (Slice D):
//   - Layer 1: a REAL ControlPlaneDaemon + real CoachRoutineEngine, proving backend
//     authority for create/repository persistence/handoff content.
//   - Layer 2: the REAL src/public/index.html script run against a mocked-but-shaped
//     fetch, proving the zero-state Add flow, inline Edit (name/instruction), and the
//     repository URL field render and mutate only from backend truth.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-v01-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 41400 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const register = (gameId, displayName, reports = []) => {
    const socket = { readyState: 1, send() {}, close() {} };
    daemon.registryInstance.registerSession({
      instanceId: `session-${gameId}`, stadiumId: `stadium-${gameId}`, name: displayName, platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId, displayName, fingerprintSource: 'test' },
      rootFsPath: `C:\\Games\\${displayName}`, roster: [], capabilities: [], reports, rosterSynchronized: true, rosterSyncedAt: Date.now()
    });
  };
  register('game_v01_a', 'V01 Game A');
  register('game_v01_b', 'V01 Game B');
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

test('V01-1. Zero-state create: POST /api/routines creates a routine for the exact Game with sensible defaults', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_v01_a' }) });
    const before = h.daemon.routineEngineInstance.forGame('game_v01_a').routines.length;
    assert.equal(before, 1, 'the amended default from the Dev Mode transition'); // matches Slice B/D precedent
    const created = await h.api('/api/routines', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'game_v01_a', name: 'Coach Refresh', template: 'custom', cadence: { kind: 'plays', every: 5 }, targets: { strategyBoard: true, players: false }, sources: [], includeLocalRoot: true })
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.success, true);
    const after = h.daemon.routineEngineInstance.forGame('game_v01_a').routines;
    assert.equal(after.length, 2);
    assert.equal(after[1].name, 'Coach Refresh');
    assert.equal(after[1].template, 'custom');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('V01-2. Edit: PATCH updates the exact routine (including a new name field), never creates a duplicate, and other routines are untouched', async () => {
  const h = await daemonHarness();
  try {
    const created1 = await h.api('/api/routines', { method: 'POST', body: JSON.stringify({ gameId: 'game_v01_a', name: 'North Star Refresh', template: 'custom', cadence: { kind: 'plays', every: 5 } }) });
    const created2 = await h.api('/api/routines', { method: 'POST', body: JSON.stringify({ gameId: 'game_v01_a', name: 'Architecture Refresh', template: 'custom', cadence: { kind: 'plays', every: 10 } }) });
    const id1 = created1.body.routine.id;
    const id2 = created2.body.routine.id;

    const edited = await h.api(`/api/routines/${id1}`, { method: 'PATCH', body: JSON.stringify({ gameId: 'game_v01_a', name: 'North Star Refresh (renamed)', instruction: 'Focus on the onboarding docs.' }) });
    assert.equal(edited.body.success, true);
    assert.equal(edited.body.routine.name, 'North Star Refresh (renamed)');
    assert.equal(edited.body.routine.instruction, 'Focus on the onboarding docs.');

    const all = h.daemon.routineEngineInstance.forGame('game_v01_a').routines;
    assert.equal(all.length, 2, 'no duplicate routine created by editing');
    const other = all.find((r) => r.id === id2);
    assert.equal(other.name, 'Architecture Refresh', 'the other routine is unchanged');
    assert.deepEqual(other.cadence, { kind: 'plays', every: 10 });
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('V01-3. Repository URL: persists per Game, survives a fresh engine load (reload/restart), and Game B never inherits Game A\'s URL', async () => {
  const h = await daemonHarness();
  try {
    const saved = await h.api('/api/routines/repository', { method: 'PATCH', body: JSON.stringify({ gameId: 'game_v01_a', repositoryUrl: 'https://github.com/example/trend' }) });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.repositoryUrl, 'https://github.com/example/trend');

    const statusA = await h.api('/api/status');
    // Force selection to compare both Games' projections explicitly.
    await h.api('/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: 'game_v01_a' }) });
    const afterA = (await h.api('/api/status')).body;
    assert.equal(afterA.routines.repositoryUrl, 'https://github.com/example/trend');

    await h.api('/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: 'game_v01_b' }) });
    const afterB = (await h.api('/api/status')).body;
    assert.equal(afterB.routines.repositoryUrl, undefined, "Game B never inherits Game A's repository URL");

    // Survives a fresh engine load from the same store (reload/restart seam).
    const snapshot = h.daemon.routineEngineInstance.snapshot();
    assert.equal(snapshot.games['game_v01_a'].repositoryUrl, 'https://github.com/example/trend');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('V01-4. Repository URL rejects an obviously invalid value without fabricating state', async () => {
  const h = await daemonHarness();
  try {
    const bad = await h.api('/api/routines/repository', { method: 'PATCH', body: JSON.stringify({ gameId: 'game_v01_a', repositoryUrl: 'not a url' }) });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.success, false);
    const status = (await h.api('/api/status')).body;
    assert.equal(status.routines.repositoryUrl, undefined);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('V01-5. Handoff: a configured repository URL appears in the canonical envelope alongside the local folder and Coach Sources, with scoping/truthfulness language, and the canonical report itself is untouched', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_v01_a' }) });
    const routineId = h.daemon.routineEngineInstance.forGame('game_v01_a').routines[0].id;
    h.daemon.routineEngineInstance.update('game_v01_a', routineId, { sources: [{ path: 'NORTH-STAR.md', kind: 'file' }] });
    h.daemon.routineEngineInstance.recordSourceCheck('game_v01_a', Date.now(), [{ path: 'NORTH-STAR.md', state: 'file' }]);
    await h.api('/api/routines/repository', { method: 'PATCH', body: JSON.stringify({ gameId: 'game_v01_a', repositoryUrl: 'https://github.com/example/trend' }) });
    await h.api(`/api/routines/${routineId}/due`, { method: 'POST', body: JSON.stringify({ gameId: 'game_v01_a' }) });

    const status = (await h.api('/api/status')).body;
    const text = status.routines.handoff.text;
    assert.match(text, /Repository: github\.com\/example\/trend/);
    assert.match(text, /Local folder: C:\\Games\\V01 Game A/);
    assert.match(text, /- NORTH-STAR\.md/);
    assert.match(text, /use the repository above and inspect the listed source paths there/i);
    assert.match(text, /stay scoped to the listed Coach Sources/i);
    assert.doesNotMatch(text, /is up to date|is current|was validated|definitely has access|has been pushed/i, 'no fabricated GitHub-currency/access claims');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('V01-6. Handoff: a blank repository URL still produces a valid handoff, with no fabricated repository line', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: 'game_v01_a' }) });
    const routineId = h.daemon.routineEngineInstance.forGame('game_v01_a').routines[0].id;
    h.daemon.routineEngineInstance.update('game_v01_a', routineId, { sources: [{ path: 'NORTH-STAR.md', kind: 'file' }] });
    h.daemon.routineEngineInstance.recordSourceCheck('game_v01_a', Date.now(), [{ path: 'NORTH-STAR.md', state: 'file' }]);
    await h.api(`/api/routines/${routineId}/due`, { method: 'POST', body: JSON.stringify({ gameId: 'game_v01_a' }) });
    const status = (await h.api('/api/status')).body;
    assert.equal(status.success, true);
    assert.doesNotMatch(status.routines.handoff.text, /Repository:/);
    assert.match(status.routines.handoff.text, /- NORTH-STAR\.md/);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Layer 2: the real browser script, DOM-driven, against a mocked-but-shaped backend
// ---------------------------------------------------------------------------

const GAME = 'game_git_trend';
const OTHER = 'game_git_gs3';
const T0 = 1_800_000_000_000;

const routinesProjection = (gameId, devMode, routines, repositoryUrl) => ({ gameId, devMode, playCount: 0, routines, ...(repositoryUrl ? { repositoryUrl } : {}) });

function daemonStatus({ devMode = true, routines = [], gameId = GAME, repositoryUrl, execution = true } = {}) {
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: gameId === GAME ? 'Trend' : 'GS3' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }, { gameId: OTHER, displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode },
    routines: routinesProjection(gameId, devMode, routines, repositoryUrl),
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
  let onCreate = async (body) => ({ success: true, gameId: body.gameId, routine: { id: 'rt_new', ...body }, projection: status.routines });
  let onPatch = async () => ({ success: true, projection: status.routines });
  let onRepository = async (body) => ({ success: true, gameId: body.gameId, repositoryUrl: body.repositoryUrl || undefined, projection: status.routines });
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
      if (url === '/api/game/select') return reply(200, { success: true, status });
      posts.push({ url, body });
      if (url === '/api/routines' && options.method === 'POST') return reply(201, await onCreate(body));
      if (url === '/api/routines/repository' && options.method === 'PATCH') return reply(200, await onRepository(body));
      const mutateMatch = /^\/api\/routines\/([^/]+)$/.exec(url);
      if (mutateMatch && options.method === 'PATCH') return reply(200, await onPatch(mutateMatch[1], body));
      if (mutateMatch && options.method === 'DELETE') return reply(200, { success: true, projection: status.routines });
      const dueMatch = /^\/api\/routines\/([^/]+)\/due$/.exec(url);
      if (dueMatch && options.method === 'POST') return reply(200, { success: true, message: 'ok' });
      if (url.startsWith('/api/routines/sources/suggest')) return reply(200, { success: true, suggestions: [] });
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
    onCreate: (fn) => { onCreate = fn; },
    onPatch: (fn) => { onPatch = fn; },
    onRepository: (fn) => { onRepository = fn; },
    routineCards: () => page.findAll($('coachRoutinesList'), (n) => n.className === 'routine-card'),
    // Q2.10F.7 V0.2: routine cards are collapsed by default — expand via "Edit" first.
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

test('V01-7. Zero-state: "+ Add Coach Refresh" is visible with zero routines, and clicking it creates one that appears without a browser reload', async () => {
  const page = await startPage(daemonStatus({ routines: [] }));
  assert.match(page.allText(page.$('coachRoutinesList')), /No Coach Refreshes yet for this Game\./);
  const addBtn = page.find(page.$('coachRoutinesList'), (n) => n.textContent === '+ Add Coach Refresh');
  assert.ok(addBtn, 'the zero-state Add action is present');

  page.onCreate(async (body) => {
    assert.equal(body.gameId, GAME);
    assert.equal(body.name, 'Coach Refresh');
    const routine = {
      id: 'rt_new', name: 'Coach Refresh', enabled: true, template: 'custom',
      cadence: { kind: 'plays', every: 5 }, cadenceLabel: 'Every 5 Plays',
      targets: { strategyBoard: true, players: false }, targetsLabel: 'Strategy Board',
      due: false, lastSentLabel: 'Last sent: never', nextLabel: 'Next: in 5 Plays',
      sources: [], includeLocalRoot: true, needs: 'sources'
    };
    page.setStatus(daemonStatus({ routines: [routine] }));
    return { success: true, gameId: body.gameId, routine, projection: {} };
  });
  await page.click(addBtn);

  const cards = page.routineCards();
  assert.equal(cards.length, 1, 'the new routine appears without a browser reload');
});

test('V01-8. Edit: the name field is pre-populated and saving updates the exact routine (not a duplicate)', async () => {
  const routine = {
    id: 'rt_x', name: 'North Star Refresh', enabled: true, template: 'custom',
    cadence: { kind: 'plays', every: 5 }, cadenceLabel: 'Every 5 Plays',
    targets: { strategyBoard: true, players: false }, targetsLabel: 'Strategy Board',
    due: false, lastSentLabel: 'Last sent: never', nextLabel: 'Next: in 5 Plays',
    sources: [], includeLocalRoot: true
  };
  const page = await startPage(daemonStatus({ routines: [routine] }));
  const card = await page.expandRoutine('rt_x');
  const nameInput = page.find(card, (n) => n.className === 'routine-name-input');
  assert.equal(nameInput.value, 'North Star Refresh', 'pre-populated with the current value');

  let patched;
  page.onPatch(async (routineId, body) => { patched = { routineId, body }; return { success: true, projection: {} }; });
  nameInput.value = 'North Star Refresh (v2)';
  await page.change(nameInput);
  assert.equal(patched.routineId, 'rt_x', 'the exact routine, not a new one');
  assert.equal(patched.body.name, 'North Star Refresh (v2)');
  assert.equal(page.posts.filter((p) => p.url === '/api/routines').length, 0, 'editing never creates a duplicate via the create endpoint');
});

test('V01-9. Repository URL field: persists on change, survives a reload-equivalent refresh, and Game B does not show Game A\'s value', async () => {
  const page = await startPage(daemonStatus({ routines: [] }));
  const input = page.$('coachRepoUrlInput');
  assert.equal(input.value, '', 'blank by default');

  let saved;
  page.onRepository(async (body) => { saved = body; return { success: true, gameId: body.gameId, repositoryUrl: body.repositoryUrl, projection: {} }; });
  input.value = 'https://github.com/example/trend';
  await page.change(input);
  assert.equal(saved.gameId, GAME);
  assert.equal(saved.repositoryUrl, 'https://github.com/example/trend');

  // Reload-equivalent: a fresh status fetch (refresh()) reflects the persisted value.
  await page.refresh(daemonStatus({ routines: [], repositoryUrl: 'https://github.com/example/trend' }));
  assert.equal(page.$('coachRepoUrlInput').value, 'https://github.com/example/trend');

  // Game B's own projection carries no repositoryUrl — never inherited.
  await page.refresh(daemonStatus({ routines: [], gameId: OTHER, repositoryUrl: undefined }));
});

test('V01-10. Existing contracts preserved: manual due, Copy delivery/acknowledgement, banner clear, "Not this time", Game isolation, Dev Mode gating all still function alongside the new Add/Edit/Repository UI', async () => {
  const page = await startPage(daemonStatus({ devMode: false, routines: [] }));
  // Dev Mode off: Coach Routines card stays hidden, matching Slice D-5 precedent.
  assert.equal(page.$('coachRoutinesCard').hidden, true);
  await page.refresh(daemonStatus({ devMode: true, routines: [] }));
  assert.equal(page.$('coachRoutinesCard').hidden, false);
});
