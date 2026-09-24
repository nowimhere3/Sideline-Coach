// Q2.10F.2 Slice B — Browser Execution Store + Dispatcher Repair.
//
// The real src/public/index.html script runs in a DOM stub. Status, dispatch replies
// and SSE payloads use the Control Plane daemon's shapes from Slice A
// (status.execution, `execution` events, DispatchResult.status + exact identity).
// The legacy `outcome` reply shape appears only in the deliberate compatibility test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageScript = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

const GAME = 'game_git_trend';
const OTHER = 'game_git_gs3';
const AG = 'antigravity-aaaa1111';
const CX = 'codex-bbbb2222';
const T0 = 1_800_000_000_000;

const agySnap = { provider: 'agy', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'gemini-pro', models: [{ id: 'gemini-pro', displayName: 'Gemini Pro', isDefault: true, supportedEfforts: [] }] };
const codexSnap = { provider: 'codex', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'gpt-sol', models: [{ id: 'gpt-sol', displayName: 'GPT Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }] };
const cap = (instanceId, state = 'ready') => ({
  instanceId, playerType: instanceId.startsWith('codex') ? 'codex' : 'antigravity', transport: 'controlled', transportLabel: 'Controlled',
  fieldLabel: instanceId.startsWith('codex') ? 'Codex' : 'AntiGravity', state, capability: instanceId.startsWith('codex') ? codexSnap : agySnap
});
const view = (instanceId, state, revision, extra = {}) => ({ instanceId, state, revision, executionType: 'reasoning', ...extra });

/** A /api/status body shaped like ControlPlaneDaemon.buildStatus(). */
function daemonStatus({ gameId = GAME, epoch = 'epoch-1', serverNow = T0, views = [view(AG, 'idle', 0), view(CX, 'idle', 0)], mode = 'auto', activeDecision = null, execution = true, turnState } = {}) {
  const caps = [cap(AG), cap(CX)];
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: gameId === GAME ? 'Trend' : 'GS3', fingerprintSource: 'git-remote' },
    games: [
      { gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' },
      { gameId: OTHER, displayName: 'GS3', connectionStatus: 'connected' }
    ],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [
      { id: 'antigravity', name: 'AntiGravity', availability: 'available', fieldState: 'on-field', instances: [{ instanceId: AG, playerType: 'antigravity', seat: 1, fieldLabel: 'AntiGravity · Controlled', onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled', ...(turnState ? { turnState } : {}) }] },
      { id: 'codex', name: 'Codex', availability: 'available', fieldState: 'on-field', instances: [{ instanceId: CX, playerType: 'codex', seat: 1, fieldLabel: 'Codex · Controlled', onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' }] }
    ],
    capabilities: caps,
    queue: [],
    routing: { mode, capabilities: caps, activeDecision },
    routingMode: mode,
    reports: [],
    playerDiscovery: null,
    preferences: { runningPlayers: 'ask' },
    at: serverNow
  };
  if (execution) status.execution = { gameId, epoch, serverNow, byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v])) };
  return status;
}

const autoDecision = (instanceId = AG) => ({
  mode: 'auto', action: 'dispatch', gameId: GAME, playerInstanceId: instanceId, playerName: instanceId === AG ? 'AntiGravity' : 'Codex',
  playerLabel: instanceId === AG ? 'AntiGravity' : 'Codex', provider: instanceId === AG ? 'agy' : 'codex', modelDisplayName: 'Provider Default',
  transport: 'controlled', reason: 'Free and able to run this Play now.', stagedAt: T0
});

/** Daemon DispatchResult shapes (router.ts). */
const received = (instanceId, name, clientRef = 'ref_1') => ({ status: 200, body: { success: true, statusCode: 200, clientRef, turnRef: `turn-${clientRef}`, status: 'received', playerInstanceId: instanceId, playerName: name, message: 'Dispatch accepted by Stadium provider.' } });

function createPage(initialStatus) {
  const elements = new Map();
  const labelHistory = [];
  const makeNode = (id) => {
    const node = {
      id, innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
      dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {},
      classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
      appendChild(c) { this.children.push(c); }, append(...k) { this.children.push(...k); }, focus() {}, contains: () => false
    };
    let text = '';
    Object.defineProperty(node, 'textContent', {
      get: () => text,
      set: (value) => { text = String(value); if (id === 'dispatchBtn') labelHistory.push(text); }
    });
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
  let now = T0;
  const intervals = [];
  let status = initialStatus;
  const counts = { status: 0, dispatch: 0 };
  const posts = [];
  let onDispatch = async () => received(AG, 'AntiGravity');
  let onSelectGame = async () => ({ status: 200, body: { success: true } });
  const ctx = {
    document: { getElementById: $, querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []), createElement: () => makeNode(''), addEventListener() {}, body: makeNode('body') },
    location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) { counts.status += 1; return reply(200, status); }
      if (url.startsWith('/api/reports')) return reply(200, []);
      posts.push({ url, body });
      if (url === '/api/dispatch') { counts.dispatch += 1; const r = await onDispatch(body); return reply(r.status, r.body); }
      if (url === '/api/route/preview') return reply(200, { success: true, decision: status.routing?.activeDecision });
      if (url === '/api/game/select') { const r = await onSelectGame(body); return reply(r.status, r.body); }
      return reply(200, {});
    },
    setTimeout, clearTimeout,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: () => {},
    Date: class extends Date { static now() { return now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const page = {
    $, posts, counts, labelHistory,
    get source() { return source; },
    store: () => ctx.__sidelineCoach.execution(),
    attempt: () => ctx.__sidelineCoach.dispatchAttempt(),
    setStatus: (next) => { status = next; },
    setNow: (value) => { now = value; },
    tick: () => { for (const interval of intervals.filter((i) => i.ms === 1_000)) interval.fn(); },
    onDispatch: (fn) => { onDispatch = fn; },
    onSelectGame: (fn) => { onSelectGame = fn; },
    emit: (event, data) => source.emit(event, data),
    refresh: async () => { source.emit('status', { type: 'registry-change' }); await flush(); },
    type: async (text) => { $('promptInput').value = text; for (const fn of $('promptInput').listeners.input || []) fn(); await wait(350); },
    click: async (id) => { for (const fn of $(id).listeners.click || []) await fn({ stopPropagation() {} }); },
    selectPlayer: (instanceId) => { $('terminalSelect').value = instanceId; for (const fn of $('terminalSelect').listeners.change || []) fn({ target: { value: instanceId } }); },
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
const manual = async (page) => { await page.click('modeManualBtn'); await flush(); };

// ---------------------------------------------------------------------------
// Store + merge rule
// ---------------------------------------------------------------------------

test('B-1. A full status snapshot establishes the store for the exact Game + instance', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 5, { playRef: 'ref_1', executionStartedAt: T0 - 1_000 }), view(CX, 'idle', 0)] }));
  const store = page.store();
  assert.equal(store.gameId, GAME);
  assert.equal(store.epoch, 'E1');
  assert.deepEqual({ state: store.views[AG].state, revision: store.views[AG].revision, playRef: store.views[AG].playRef }, { state: 'working', revision: 5, playRef: 'ref_1' });
  assert.equal(store.views[CX].state, 'idle');
});

test('B-2. A newer execution event wins over the snapshot', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'starting', 5), view(CX, 'idle', 0)] }));
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'working', 6, { executionStartedAt: T0 })] });
  assert.deepEqual([page.store().views[AG].state, page.store().views[AG].revision], ['working', 6]);
});

test('B-3. A delayed older snapshot cannot regress a newer event (working rev 10 vs idle rev 9)', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'starting', 8), view(CX, 'idle', 0)] }));
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'working', 10, { executionStartedAt: T0 })] });
  page.setStatus(daemonStatus({ epoch: 'E1', views: [view(AG, 'idle', 9), view(CX, 'idle', 0)] }));
  await page.refresh();
  assert.deepEqual([page.store().views[AG].state, page.store().views[AG].revision], ['working', 10], 'stale snapshot ignored');
  // An equal-revision snapshot is accepted (snapshot rule is >=).
  page.setStatus(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 10, { executionStartedAt: T0, summary: 'same truth' }), view(CX, 'idle', 0)] }));
  await page.refresh();
  assert.equal(page.store().views[AG].summary, 'same truth');
});

test('B-4. Stale Working cannot resurrect a terminal state (finished rev 20 vs working rev 19)', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'finished', 20, { playRef: 'ref_1', finishedAt: T0 }), view(CX, 'idle', 0)] }));
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'working', 19, { playRef: 'ref_1', executionStartedAt: T0 - 5_000 })] });
  assert.equal(page.store().views[AG].state, 'finished');
  page.setStatus(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 19, { executionStartedAt: T0 - 5_000 }), view(CX, 'idle', 0)] }));
  await page.refresh();
  assert.deepEqual([page.store().views[AG].state, page.store().views[AG].revision], ['finished', 20]);
});

test('B-5. A different epoch: a stray event never replaces the store; the full snapshot does', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 10, { executionStartedAt: T0 }), view(CX, 'idle', 0)] }));
  const before = page.counts.status;
  page.emit('execution', { gameId: GAME, epoch: 'E2', serverNow: T0, views: [view(AG, 'idle', 1)] });
  assert.deepEqual([page.store().epoch, page.store().views[AG].state, page.store().views[AG].revision], ['E1', 'working', 10], 'stray new-epoch event ignored');
  await flush();
  assert.ok(page.counts.status > before, 'a new lifetime asks for the full snapshot');
  page.setStatus(daemonStatus({ epoch: 'E2', views: [view(AG, 'working', 1, { executionStartedAt: T0 - 9_000 }), view(CX, 'idle', 0)] }));
  await page.refresh();
  assert.deepEqual([page.store().epoch, page.store().views[AG].revision], ['E2', 1], 'full snapshot of the new lifetime replaces wholesale, even at a lower revision');
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'finished', 99)] });
  assert.deepEqual([page.store().epoch, page.store().views[AG].state], ['E2', 'working'], 'old-lifetime events are ignored afterwards');
});

test('B-6. Game isolation: after a Game switch, old-Game events are ignored and old truth never shows', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 10, { executionStartedAt: T0 }), view(CX, 'idle', 0)] }));
  let finishSelect;
  page.onSelectGame(() => new Promise((resolve) => { finishSelect = resolve; }));
  const gs3 = page.$('gameList').children.find((item) => item.children[1]?.textContent === 'GS3');
  const switching = (async () => { for (const fn of gs3.listeners.click || []) await fn({ stopPropagation() {} }); })();
  await flush();
  assert.equal(Object.keys(page.store().views).length, 0, 'old Game execution cleared from the view immediately');
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'working', 11, { executionStartedAt: T0 })] });
  assert.equal(Object.keys(page.store().views).length, 0, 'late old-Game event ignored mid-switch');
  const other = daemonStatus({ gameId: OTHER, epoch: 'E1', views: [view(AG, 'idle', 3), view(CX, 'idle', 4)] });
  page.setStatus(other);
  finishSelect({ status: 200, body: { success: true, status: other } });
  await switching;
  await flush();
  assert.equal(page.store().gameId, OTHER);
  assert.equal(page.store().views[AG].state, 'idle');
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'working', 50, { executionStartedAt: T0 })] });
  assert.equal(page.store().views[AG].state, 'idle', 'no cross-Game leakage after the switch');
});

test('B-7. Instance isolation: updating one Player never mutates another', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 10, { executionStartedAt: T0 }), view(CX, 'queued', 7, { queue: { count: 1 } })] }));
  const codexBefore = page.store().views[CX];
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'finished', 12, { finishedAt: T0 })] });
  assert.equal(page.store().views[AG].state, 'finished');
  assert.deepEqual(page.store().views[CX], codexBefore);
});

// ---------------------------------------------------------------------------
// Selection independence + concurrency
// ---------------------------------------------------------------------------

test('B-8. Changing the selected Player never changes execution truth', async () => {
  const page = await startPage(daemonStatus({ mode: 'manual', epoch: 'E1', views: [view(AG, 'working', 10, { executionStartedAt: T0 - 3_000 }), view(CX, 'idle', 2)] }));
  await manual(page);
  page.selectPlayer(AG);
  assert.equal(page.$('dispatchBtn').disabled, true, 'MANUAL form: the chosen exact Player is already working');
  page.selectPlayer(CX);
  assert.equal(page.store().views[AG].state, 'working');
  assert.equal(page.store().views[AG].executionStartedAt, T0 - 3_000);
  assert.equal(page.$('dispatchBtn').disabled, false, 'another Player working never locks Dispatch for a free Player');
  page.selectPlayer(AG);
  assert.deepEqual([page.store().views[AG].state, page.store().views[AG].revision], ['working', 10]);
});

test('B-9. A second AUTO dispatch to Codex leaves AntiGravity\'s truth untouched', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', activeDecision: autoDecision(CX), views: [view(AG, 'working', 10, { playRef: 'ref_ag', executionStartedAt: T0 - 60_000 }), view(CX, 'idle', 2)] }));
  const agBefore = page.store().views[AG];
  assert.equal(page.$('dispatchBtn').disabled, false, 'AUTO is free while AntiGravity works');
  page.onDispatch(async () => received(CX, 'Codex', 'ref_cx'));
  await page.type('Add a unit test for the parser');
  await page.click('dispatchBtn');
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(CX, 'starting', 11, { playRef: 'ref_cx' })] });
  assert.deepEqual(page.store().views[AG], agBefore);
  assert.equal(page.store().views[CX].state, 'starting');
  assert.equal(page.attempt().playerInstanceId, CX);
});

// The visible elapsed clock this test proved (Working with/without a known origin, ticking
// from serverNow()) now lives only on the Player strip: see q2-10f-2-team-activity-player-strips
// (C-2, C-5/C-6, C-18). Slice D removed the transitional #activePlayStatus that rendered it here.
// What remains B's concern — the store's offset and origin — is still proven below.
test('B-10. serverNow yields the display offset; the store never writes an execution origin', async () => {
  const skew = 5_000;
  const startedAt = T0 + skew - 60_000; // server clock: started one minute ago
  const page = await startPage(daemonStatus({ epoch: 'E1', serverNow: T0 + skew, activeDecision: autoDecision(AG), views: [view(AG, 'idle', 1), view(CX, 'idle', 0)] }));
  assert.equal(page.store().serverOffsetMs, skew);
  page.onDispatch(async () => received(AG, 'AntiGravity'));
  await page.type('Summarize the README');
  await page.click('dispatchBtn');
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0 + skew, views: [view(AG, 'working', 2, { playRef: 'ref_1', executionStartedAt: startedAt })] });
  assert.equal(page.store().views[AG].executionStartedAt, startedAt, 'the browser never writes an execution origin');
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0 + skew + 1_000, views: [view(AG, 'working', 3, { playRef: 'ref_1' })] });
  assert.equal(page.store().views[AG].executionStartedAt, undefined, 'no origin stays no origin: nothing invented in the store');
});

// ---------------------------------------------------------------------------
// Dispatcher attempt
// ---------------------------------------------------------------------------

test('B-11. Refresh and execution events during submission never end the attempt or re-enable Dispatch', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', activeDecision: autoDecision(AG), views: [view(AG, 'idle', 1), view(CX, 'idle', 0)] }));
  let finish;
  page.onDispatch(() => new Promise((resolve) => { finish = resolve; }));
  await page.type('Summarize the README');
  const clicking = page.click('dispatchBtn');
  await flush();
  assert.equal(page.attempt().phase, 'submitting');
  assert.equal(page.$('dispatchBtn').textContent, 'Finding the best Player…');
  assert.equal(page.$('dispatchBtn').disabled, true);

  // The field seam: status SSE → refresh() → renderStatus with a snapshot that still says idle.
  await page.refresh();
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'starting', 2, { playRef: 'ref_1' })] });
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'working', 3, { playRef: 'ref_1', executionStartedAt: T0 })] });
  await page.refresh();
  assert.equal(page.attempt().phase, 'submitting');
  assert.equal(page.$('dispatchBtn').disabled, true);
  assert.equal(page.$('dispatchBtn').textContent, 'Finding the best Player…');
  assert.equal(page.$('promptInput').value, 'Summarize the README', 'prompt kept until the reply confirms');
  await page.click('dispatchBtn');
  assert.equal(page.counts.dispatch, 1, 'duplicate click blocked');

  finish(received(AG, 'AntiGravity'));
  await clicking;
  assert.equal(page.attempt().phase, 'sent');
  assert.equal(page.$('dispatchBtn').disabled, false, 'free again for an independent Play');
  // Q2.10F.8: a confirmed dispatch morphs the same slot into the post-dispatch bridge.
  assert.equal(page.$('dispatchBtn').textContent, 'View AntiGravity ↑');
});

test('B-12. The daemon\'s status: received never produces the bogus Completed / Received / Working button', async () => {
  const page = await startPage(daemonStatus({ mode: 'manual', epoch: 'E1', views: [view(AG, 'idle', 1), view(CX, 'idle', 0)] }));
  await manual(page);
  page.selectPlayer(CX);
  page.$('promptInput').value = 'Run the tests';
  page.onDispatch(async () => received(CX, 'Codex'));
  await page.click('dispatchBtn');
  assert.ok(page.labelHistory.includes('Sending Play…'));
  for (const bogus of ['Completed', 'Received', 'Working', '◉ Working', 'Unknown', 'Failed', 'Sent to terminal']) {
    assert.ok(!page.labelHistory.includes(bogus), `button never shows ${bogus}`);
  }
  // Q2.10F.8: a confirmed dispatch morphs the same slot into the post-dispatch bridge.
  assert.equal(page.$('dispatchBtn').textContent, 'View Codex ↑');
  assert.equal(page.$('promptInput').value, '', 'confirmed handoff clears the prompt');
  assert.deepEqual({ phase: page.attempt().phase, delivery: page.attempt().delivery }, { phase: 'sent', delivery: 'received' });
});

test('B-13. Legacy in-extension server replies still normalize (compatibility only)', async () => {
  const page = await startPage(daemonStatus({ mode: 'manual', epoch: 'E1' }));
  await manual(page);
  page.selectPlayer(AG);
  const cases = [
    [{ status: 200, body: { success: true, outcome: 'accepted', playerInstanceId: AG, turnRef: 't1', message: 'Accepted by AntiGravity' } }, { phase: 'sent', delivery: 'received' }],
    [{ status: 200, body: { success: true, outcome: 'sent-to-terminal', playerInstanceId: AG, message: 'Dispatched' } }, { phase: 'sent', delivery: 'sent-to-terminal' }],
    [{ status: 202, body: { success: false, outcome: 'unknown', playerInstanceId: AG, message: 'Delivery Unknown' } }, { phase: 'sent', delivery: 'unknown' }],
    [{ status: 409, body: { success: false, outcome: 'refused', playerInstanceId: AG, reason: 'busy', message: 'That Player is still working.' } }, { phase: 'failed', delivery: 'failed' }]
  ];
  for (const [reply, expected] of cases) {
    // Q2.10F.8: a real keystroke, not a bare .value set — a materially new prompt ends
    // any in-place View bridge left over from the previous case's successful dispatch,
    // exactly as a real human typing the next Play would.
    await page.type('Legacy Play');
    page.onDispatch(async () => reply);
    await page.click('dispatchBtn');
    assert.deepEqual({ phase: page.attempt().phase, delivery: page.attempt().delivery }, expected, JSON.stringify(reply.body));
    assert.equal(page.attempt().playerInstanceId, AG);
  }
  assert.ok(!page.labelHistory.includes('Completed'));
});

test('B-14. Queued reply: phase queued with the exact Player identity', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', activeDecision: { ...autoDecision(CX), action: 'queue' }, views: [view(AG, 'idle', 1), view(CX, 'working', 4, { executionStartedAt: T0 })] }));
  await page.type('Continue the refactor');
  assert.equal(page.$('dispatchBtn').textContent, 'Queue for Codex');
  page.onDispatch(async () => ({ status: 202, body: { success: true, statusCode: 202, status: 'queued', queueItemId: 'queue_1', queuePosition: 1, playerInstanceId: CX, playerName: 'Codex', message: 'Queued for Codex.' } }));
  await page.click('dispatchBtn');
  assert.deepEqual({ phase: page.attempt().phase, id: page.attempt().playerInstanceId, name: page.attempt().playerName }, { phase: 'queued', id: CX, name: 'Codex' });
  assert.equal(page.$('promptInput').value, '');
  assert.equal(page.$('dispatchBtn').disabled, false);
});

test('B-15. Failed reply: prompt stays, attempt failed, Dispatch free to try again', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', activeDecision: autoDecision(AG) }));
  await page.type('Important drafted Play');
  page.onDispatch(async () => ({ status: 409, body: { success: false, statusCode: 409, message: 'Roster is still synchronizing with the Stadium. Retry in a moment or switch to Manual.' } }));
  await page.click('dispatchBtn');
  assert.equal(page.attempt().phase, 'failed');
  assert.match(page.attempt().failure.message, /Roster is still synchronizing/);
  assert.equal(page.attempt().playerInstanceId, undefined, 'no Player received it, none is claimed');
  assert.equal(page.$('promptInput').value, 'Important drafted Play');
  assert.equal(page.$('dispatchBtn').disabled, false);
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play');

  // Stadium rejection (status: failed, HTTP 400) is equally a failure, with its exact target.
  page.onDispatch(async () => ({ status: 400, body: { success: false, statusCode: 400, clientRef: 'ref_x', status: 'failed', playerInstanceId: AG, playerName: 'AntiGravity', message: 'That Player is still working.' } }));
  await page.click('dispatchBtn');
  assert.deepEqual([page.attempt().phase, page.attempt().playerInstanceId], ['failed', AG]);
  assert.equal(page.$('promptInput').value, 'Important drafted Play');
});

test('B-16. Unknown delivery never leaves a ready-to-resend prompt, never restores it, never resends', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', activeDecision: autoDecision(AG) }));
  await page.type('Migrate the schema');
  // Router delivery timeout: HTTP 504 with status unknown and the exact target.
  page.onDispatch(async () => ({ status: 504, body: { success: false, statusCode: 504, clientRef: 'ref_u', status: 'unknown', playerInstanceId: AG, playerName: 'AntiGravity', message: 'Dispatch timed out waiting for Stadium ingress confirmation.' } }));
  await page.click('dispatchBtn');
  assert.deepEqual({ phase: page.attempt().phase, delivery: page.attempt().delivery, id: page.attempt().playerInstanceId, clientRef: page.attempt().clientRef }, { phase: 'sent', delivery: 'unknown', id: AG, clientRef: 'ref_u' });
  assert.equal(page.$('promptInput').value, '', 'it may already be running: no resend-ready copy');
  assert.equal(page.attempt().prompt, 'Migrate the schema', 'text retained on the attempt for a deliberate later choice');
  assert.equal(page.$('toast').textContent, '', 'Outgoing owns the warning; no global toast covers its Recover/View actions');

  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0, views: [view(AG, 'unknown', 5, { playRef: 'ref_u', detail: 'Coach cannot confirm.' })] });
  await wait(20);
  assert.equal(page.$('promptInput').value, '', 'canonical Unknown does not restore the prompt');
  assert.equal(page.counts.dispatch, 1, 'never auto-resent');
  assert.equal(page.$('toast').textContent, '', 'canonical Unknown does not create duplicate toast feedback');
});

test('B-17. AUTO and MANUAL bind the attempt to the daemon\'s returned exact Player, not the preview or selection', async () => {
  const page = await startPage(daemonStatus({ epoch: 'E1', activeDecision: autoDecision(AG) }));
  await page.type('Whatever the route says');
  page.onDispatch(async () => received(CX, 'Codex', 'ref_auto'));
  await page.click('dispatchBtn');
  assert.deepEqual([page.attempt().mode, page.attempt().playerInstanceId, page.attempt().playerName, page.attempt().clientRef], ['auto', CX, 'Codex', 'ref_auto'], 'staged AntiGravity preview is not the target — the reply is');

  await manual(page);
  page.selectPlayer(AG);
  await page.type('Manual Play');
  page.onDispatch(async () => received(AG, 'AntiGravity 1', 'ref_manual'));
  await page.click('dispatchBtn');
  assert.deepEqual([page.attempt().mode, page.attempt().playerInstanceId, page.attempt().playerName], ['manual', AG, 'AntiGravity'], 'current exact-id label outranks the stale response label');

  page.selectPlayer(CX);
  await page.type('Reply without identity');
  page.onDispatch(async () => ({ status: 200, body: { success: true, statusCode: 200, status: 'received', clientRef: 'ref_anon' } }));
  await page.click('dispatchBtn');
  assert.equal(page.attempt().playerInstanceId, undefined, 'never inferred from the selected Player');
});

test('B-18. Reconnect: the full snapshot reconstructs Working with the original executionStartedAt', async () => {
  const startedAt = T0 - 138_000;
  const page = await startPage(daemonStatus({ epoch: 'E1', views: [view(AG, 'working', 7, { playRef: 'ref_1', executionStartedAt: startedAt }), view(CX, 'idle', 0)] }));
  page.setNow(T0 + 30_000);
  page.setStatus(daemonStatus({ epoch: 'E1', serverNow: T0 + 30_000, views: [view(AG, 'working', 7, { playRef: 'ref_1', executionStartedAt: startedAt }), view(CX, 'idle', 0)] }));
  page.emit('hello');
  await flush();
  assert.equal(page.store().views[AG].executionStartedAt, startedAt, 'original origin survives reconnect');
  assert.equal(page.store().serverOffsetMs, 0);
  page.emit('execution', { gameId: GAME, epoch: 'E1', serverNow: T0 + 30_000, views: [view(AG, 'idle', 6)] });
  assert.equal(page.store().views[AG].state, 'working', 'a lower-revision event after reconnect cannot regress the snapshot');
});

test('B-19. Stale daemon without status.execution: no execution truth is fabricated from roster turnState or Ledger work', async () => {
  const status = daemonStatus({ execution: false, activeDecision: autoDecision(AG), turnState: { instanceId: AG, state: 'started', turnRef: 't', summary: 'Working…', at: T0 - 5_000 } });
  status.capabilities = status.capabilities.map((c) => (c.instanceId === AG ? { ...c, state: 'busy', work: { workState: 'working', currentPlay: { clientRef: 'ref_1', startedAt: T0 - 9_000 } } } : c));
  const page = await startPage(status);
  assert.equal(Object.keys(page.store().views).length, 0);
  page.emit('turn', { instanceId: AG, state: 'started', turnRef: 't', summary: 'Working…', at: T0 });
  assert.equal(Object.keys(page.store().views).length, 0, 'raw turn events are not execution authority');
  await page.type('Summarize');
  page.onDispatch(async () => received(AG, 'AntiGravity'));
  await page.click('dispatchBtn');
  // Outgoing's handoff acknowledgement is sourced from the daemon's real dispatch reply
  // (identity + phase), never from execution truth, so it is expected to show here even
  // though the store stays empty — proven not to be a fabrication in q2-10f-2-outgoing-*.
  assert.equal(Object.keys(page.store().views).length, 0, 'still nothing fabricated in the execution store itself');
  assert.equal(page.$('dispatchBtn').disabled, false);
});

// B-20 (Transitional #activePlayStatus) is retired: Slice D removed that element. Its
// exact-target-not-selection and completion-hides-it invariants are re-proven against its
// successor, Outgoing's #outgoingAck, in test/q2-10f-2-outgoing-handoff-view-player.test.mjs.

// ---------------------------------------------------------------------------
// Real Control Plane wire: daemon + StadiumClient + page
// ---------------------------------------------------------------------------

test('B-21. Real Control Plane wire: slow start, refresh storms and a lagging roster never break the attempt or resurrect Working', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q210f2b-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 39510, idleTimeoutMs: 60_000 });
  await daemon.start();
  const port = daemon.port;
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const stadiumId = getDurableStadiumId(dir);
  const turnState = new Map();
  const active = new Set();
  let client;
  const players = [[AG, 'antigravity', 'AntiGravity', agySnap], [CX, 'codex', 'Codex', codexSnap]];
  const roster = {
    resolve: (id) => ({ state: 'live', transport: 'controlled', instance: { instanceId: id, playerType: id.split('-')[0], onField: true } }),
    // PlayerRoster.status() awaits refreshAvailability(): roster snapshots lag turn events.
    status: async () => { await wait(400); return players.map(([id, type, name]) => ({ id: type, name, availability: 'available', fieldState: 'on-field', instances: [{ instanceId: id, playerType: type, seat: 1, fieldLabel: `${name} · Controlled`, onField: true, ownership: 'coach-managed', controlMode: 'controlled', transport: 'Controlled', controlState: 'ready', turnState: turnState.get(id) ?? { instanceId: id, state: 'idle', summary: 'Ready', at: 0 } }] })); },
    getRoutingCapabilities: () => players.map(([id, type, name, snap]) => ({ instanceId: id, playerType: type, transport: 'controlled', transportLabel: 'Controlled', fieldLabel: name, state: ['accepted', 'started'].includes(turnState.get(id)?.state) || active.has(id) ? 'busy' : 'ready', capability: snap })),
    getLastDiscovery: () => undefined
  };
  const emitTurn = (instanceId, state, turnRef) => {
    const event = { instanceId, state, turnRef, summary: state, at: Date.now() };
    turnState.set(instanceId, event);
    client.sendTurnChanged(event);
    void client.sendRosterChanged();
    client.sendCapabilitySnapshot();
  };
  let n = 0;
  const host = {
    deliver: async (instanceId) => {
      active.add(instanceId);
      const turnRef = `turn-${++n}`;
      await wait(600); // provider spawn → init
      emitTurn(instanceId, 'accepted', turnRef);
      emitTurn(instanceId, 'started', turnRef);
      setTimeout(() => { active.delete(instanceId); emitTurn(instanceId, 'completed', turnRef); }, 900);
      return { kind: 'accepted', turnRef };
    }
  };
  client = new StadiumClient({
    port, dir, instanceId: `inst_${stadiumId}_${GAME}`,
    gameContextGetter: () => ({
      game: { gameId: GAME, displayName: 'Trend', fingerprintSource: 'git-remote', repoUri: 'https://example.com/trend.git' },
      stadium: { stadiumId, name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: GAME, stadiumId, rootFsPath: 'C:\\Games\\Trend', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    playerRoster: roster, playerControlHost: host, reportsGetter: async () => [],
    resolveControlPlane: async () => ({ port })
  });

  const abort = new AbortController();
  try {
    assert.ok(await client.connect());
    await client.sendRosterChanged();
    client.sendCapabilitySnapshot();
    await fetch(`http://127.0.0.1:${port}/api/game/select`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: GAME }) });
    await wait(200);

    // Page with fetch + EventSource bridged to the real daemon.
    const elements = new Map();
    const labels = [];
    const makeNode = (id) => {
      const node = { id, innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', dataset: {}, style: {}, attributes: {}, children: [], listeners: {},
        classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
        addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
        appendChild(c) { this.children.push(c); }, append(...k) { this.children.push(...k); }, focus() {}, contains: () => false };
      let text = '';
      Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); if (id === 'dispatchBtn') labels.push(text); } });
      return node;
    };
    const $ = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
    const snapshots = [];
    const browserOrigin = `http://127.0.0.1:${port}`;
    let browserCookie = '';
    const browserFetch = async (url, init = {}) => {
      const headers = new Headers(init.headers || {});
      if (browserCookie) headers.set('Cookie', browserCookie);
      const method = (init.method || 'GET').toUpperCase();
      if (browserCookie && method !== 'GET' && method !== 'HEAD') headers.set('Origin', browserOrigin);
      const res = await fetch(`${browserOrigin}${url}`, { ...init, headers, signal: abort.signal });
      if (url === '/api/session') browserCookie = (res.headers.get('set-cookie') || '').split(';', 1)[0];
      return res;
    };
    class BridgedEventSource {
      constructor(url) {
        this.listeners = {};
        (async () => {
          const res = await browserFetch(url);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read().catch(() => ({ done: true }));
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index;
            while ((index = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const event = /^event: (.*)$/m.exec(block)?.[1];
              const data = /^data: (.*)$/m.exec(block)?.[1];
              if (event) for (const fn of this.listeners[event] || []) fn({ data });
            }
          }
        })();
      }
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
      close() {}
    }
    const ctx = {
      document: { getElementById: $, querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []), createElement: () => makeNode(''), addEventListener() {} },
      location: { search: '', hash: `#token=${encodeURIComponent(token)}`, pathname: '/' }, history: { replaceState() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      Headers, URLSearchParams, EventSource: BridgedEventSource,
      fetch: browserFetch,
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, console: { ...console, error: () => {} },
      navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
    };
    vm.createContext(ctx);
    vm.runInContext(pageScript, ctx);
    const until = async (predicate, ms = 5_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (predicate()) return true; await wait(10); } return false; };
    assert.ok(await until(() => $('connectionText').textContent === 'Coach Online' && ctx.__sidelineCoach.execution().epoch), 'page established the real epoch from status.execution');
    const epoch = ctx.__sidelineCoach.execution().epoch;
    assert.equal(ctx.__sidelineCoach.execution().gameId, GAME);

    // Sample browser truth continuously while the Play runs.
    const sampler = setInterval(() => snapshots.push({ attempt: ctx.__sidelineCoach.dispatchAttempt(), view: ctx.__sidelineCoach.execution().views[AG], disabled: $('dispatchBtn').disabled }), 5);

    $('promptInput').value = 'Summarize the README';
    for (const fn of $('promptInput').listeners.input || []) fn();
    await wait(400);
    const clicking = (async () => { for (const fn of $('dispatchBtn').listeners.click || []) await fn(); })();
    await clicking;
    assert.ok(await until(() => ctx.__sidelineCoach.execution().views[AG]?.state === 'finished', 6_000), 'canonical Finished reached the browser');
    await wait(900); // let the lagging roster snapshot land after completion
    clearInterval(sampler);

    const attempt = ctx.__sidelineCoach.dispatchAttempt();
    assert.deepEqual({ phase: attempt.phase, delivery: attempt.delivery, id: attempt.playerInstanceId }, { phase: 'sent', delivery: 'received', id: AG }, 'exact identity from the real DispatchResult');
    assert.ok(attempt.clientRef?.startsWith('ref_'));
    assert.ok(!labels.includes('Completed') && !labels.includes('Received'), 'no bogus dispatcher lifecycle labels');

    const submitting = snapshots.filter((s) => s.attempt?.phase === 'submitting');
    assert.ok(submitting.length > 10, 'the in-flight window was observed');
    assert.ok(submitting.every((s) => s.disabled), 'Dispatch stayed guarded for the whole in-flight request despite status refreshes');

    const states = snapshots.map((s) => s.view?.state).filter(Boolean);
    const firstFinished = states.indexOf('finished');
    assert.ok(states.includes('working'), 'Working observed');
    assert.ok(firstFinished > 0 && states.slice(firstFinished).every((s) => s === 'finished'), 'nothing resurrected Working after Finished');
    const revisions = snapshots.map((s) => s.view?.revision).filter((r) => Number.isFinite(r));
    assert.ok(revisions.every((r, i) => i === 0 || r >= revisions[i - 1]), 'browser revisions never regress');
    const working = snapshots.map((s) => s.view).filter((v) => v?.state === 'working');
    assert.ok(working.every((v) => v.executionStartedAt === working[0].executionStartedAt && Number.isFinite(v.executionStartedAt)), 'one canonical execution origin');
    assert.equal(ctx.__sidelineCoach.execution().epoch, epoch);
  } finally {
    abort.abort();
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
