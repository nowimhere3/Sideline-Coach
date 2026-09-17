// Q2.10F.2 Slice C — TEAM activity header + Player-attached execution strips.
//
// The real src/public/index.html script runs against a small DOM stub that supports
// parent/child structure, removal, focus and `closest`, so strips, focus survival and
// roster order can be asserted. Truth enters ONLY through Slice B's real store:
// daemon-shaped `status.execution` snapshots and `execution` SSE events.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

const GAME = 'game_git_trend';
const OTHER = 'game_git_gs3';
const AG = 'antigravity-aaaa1111';
const CL1 = 'claude-cccc1111';
const CL2 = 'claude-cccc2222';
const CX = 'codex-bbbb2222';
const TERM = 'terminal-dddd3333';
const ORDER = [AG, CL1, CL2, CX, TERM];
const T0 = 1_800_000_000_000;

const snap = { provider: 'x', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'm', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: [] }] };
const typeOf = (id) => id.split('-')[0];
const cap = (instanceId, state = 'ready') => ({ instanceId, playerType: typeOf(instanceId), transport: 'controlled', transportLabel: 'Controlled', fieldLabel: instanceId, state, capability: snap });
const view = (instanceId, state, revision, extra = {}) => ({ instanceId, state, revision, executionType: instanceId === TERM ? 'direct-shell' : 'reasoning', ...extra });
const idle = () => ORDER.map((id) => view(id, 'idle', 0));
const withViews = (...changed) => idle().map((v) => changed.find((c) => c.instanceId === v.instanceId) || v);

function daemonStatus({ gameId = GAME, epoch = 'E1', serverNow = T0, views = idle(), execution = true, queue = [], capState = {}, turnState, mode = 'auto' } = {}) {
  const inst = (instanceId, seat, fieldLabel, extra = {}) => ({ instanceId, playerType: typeOf(instanceId), seat, fieldLabel, onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled', ...extra });
  const caps = [AG, CL1, CL2, CX].map((id) => cap(id, capState[id]));
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: gameId === GAME ? 'Trend' : 'GS3' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }, { gameId: OTHER, displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [
      { id: 'antigravity', name: 'AntiGravity', instances: [inst(AG, 1, 'AntiGravity · Controlled', turnState ? { turnState } : {})] },
      { id: 'claude', name: 'Claude', instances: [inst(CL1, 1, 'Claude 1 · Controlled'), inst(CL2, 2, 'Claude 2 · Controlled')] },
      { id: 'codex', name: 'Codex', instances: [inst(CX, 1, 'Codex · Controlled', { work: { workState: 'working' } })] },
      { id: 'terminal', name: 'Terminal', instances: [inst(TERM, 1, 'Terminal', { transport: undefined, controlMode: undefined })] }
    ],
    capabilities: caps.map((c) => ({ ...c, work: { workState: 'working', queuedCount: 1 } })),
    queue,
    routing: { mode, capabilities: caps, activeDecision: null },
    routingMode: mode, reports: [], playerDiscovery: null, preferences: { runningPlayers: 'ask' }, at: serverNow
  };
  if (execution) status.execution = { gameId, epoch, serverNow, byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v])) };
  return status;
}

function createPage(initialStatus) {
  const elements = new Map();
  const textSets = new Map();
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
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); if (id) textSets.set(id, (textSets.get(id) || 0) + 1); } });
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
  let now = T0;
  const intervals = [];
  let status = initialStatus;
  let onSelectGame = async () => ({ status: 200, body: { success: true } });
  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), addEventListener() {}, body: makeNode('body'),
    querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : [])
  });
  const ctx = {
    document: doc, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url === '/api/game/select') { const r = await onSelectGame(body); return reply(r.status, r.body); }
      return reply(200, {});
    },
    setTimeout, clearTimeout,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: () => {},
    Date: class extends Date { static now() { return now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, doc, textSets, intervals, allText, find,
    store: () => ctx.__sidelineCoach.execution(),
    team: () => $('rosterSummary').textContent,
    rows: () => $('roster').children.filter((c) => c.className === 'player'),
    row: (id) => page.rows().find((r) => r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    stripText: (id) => { const s = page.strip(id); return s ? allText(s) : ''; },
    elapsedNodes: (root) => { const out = []; walk(root, (n) => { if (n.dataset.elapsedSince !== undefined) out.push(n); }); return out; },
    setStatus: (next) => { status = next; },
    setNow: (value) => { now = value; },
    tick: () => { for (const i of intervals.filter((x) => x.ms === 1_000)) i.fn(); },
    onSelectGame: (fn) => { onSelectGame = fn; },
    emit: (views, serverNow = T0, gameId = GAME, epoch = 'E1') => source.emit('execution', { gameId, epoch, serverNow, views }),
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); },
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
const working = (id, rev, extra = {}) => view(id, 'working', rev, { playRef: `ref_${id}`, summary: 'Fix the Play Clock bug', executionStartedAt: T0 - 137_000, ...extra });

// ---------------------------------------------------------------------------

test('C-1. Quiet TEAM: all idle shows exactly "TEAM", no zero counts, no strips', async () => {
  const page = await startPage(daemonStatus());
  assert.equal(page.team(), 'TEAM');
  assert.doesNotMatch(page.team(), /0 ACTIVE|0 /);
  for (const id of ORDER) assert.equal(page.strip(id), null, `idle ${id} renders nothing`);
  assert.equal(page.rows().length, 5);
});

test('C-2. One Working: TEAM names the Player; its strip shows Working with canonical elapsed', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(CL1, 4)) }));
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · Claude 1');
  const strip = page.strip(CL1);
  assert.ok(strip);
  assert.match(page.stripText(CL1), /◉ Working/);
  assert.match(page.stripText(CL1), /Fix the Play Clock bug/);
  const [clock] = page.elapsedNodes(strip);
  assert.equal(clock.textContent, '2m 17s');
  assert.equal(clock.dataset.elapsedSince, String(T0 - 137_000));
  assert.equal(clock.attributes['aria-hidden'], 'true');
  assert.deepEqual([strip.attributes.role, strip.attributes['aria-label']], ['group', 'Claude 1: Working']);
  assert.doesNotMatch(page.allText(page.row(CL1).children.find((c) => c.className === 'player-text')), /Working/, 'old roster work word retired: On Field is eligibility only');
});

test('C-2b. Working is one compact row and skips routing front matter for its task reminder', async () => {
  const rawPlay = `# AGENT ASSIGNMENT
**AGENT:** Codex
**MODEL:** GPT-5.6 Sol
**THINKING / REASONING EFFORT:** Medium
# REPOSITORY
C:\\work\\repo
# PLAY
Implement:
Make an edit to the last report and verify it.`;
  const page = await startPage(daemonStatus({ views: withViews(working(CL1, 4, { summary: rawPlay })) }));
  const strip = page.strip(CL1);
  assert.equal(strip.children.length, 1, 'ordinary Working has exactly one content row');
  const [row] = strip.children;
  assert.equal(row.className, 'play-strip-row');
  assert.deepEqual(row.children.map((node) => node.className), ['play-strip-state', 'play-strip-summary', 'play-strip-right']);
  assert.equal(row.children[1].textContent, '· Make an edit to the last report and verify it.');
  assert.doesNotMatch(page.stripText(CL1), /AGENT ASSIGNMENT|GPT-5\.6|REPOSITORY|THINKING/);
  assert.equal(page.elapsedNodes(strip).length, 1);
});

test('C-3. Two Working: TEAM counts both; each exact Player card owns its strip', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(AG, 3), working(CL2, 5, { executionStartedAt: T0 - 38_000 })) }));
  assert.equal(page.team(), 'TEAM · 2 ACTIVE');
  assert.equal(page.elapsedNodes(page.strip(AG))[0].textContent, '2m 17s');
  assert.equal(page.elapsedNodes(page.strip(CL2))[0].textContent, '0:38');
  assert.equal(page.strip(CL1), null);
});

test('C-4. Selection independence: selecting Codex in Outgoing leaves AntiGravity\'s strip visible and ticking', async () => {
  const page = await startPage(daemonStatus({ mode: 'manual', views: withViews(working(AG, 3)) }));
  await page.click(page.$('modeManualBtn'));
  page.$('terminalSelect').value = CX;
  for (const fn of page.$('terminalSelect').listeners.change || []) fn({ target: { value: CX } });
  await flush();
  assert.match(page.stripText(AG), /◉ Working/);
  page.setNow(T0 + 3_000);
  page.tick();
  assert.equal(page.elapsedNodes(page.strip(AG))[0].textContent, '2m 20s');
  assert.equal(page.strip(CX), null);
});

test('C-5 / C-6. Starting shows no timer; Working without an origin invents none', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(CL1, 'starting', 2, { summary: 'Fix the Play Clock bug' }), working(CX, 4, { executionStartedAt: undefined })) }));
  assert.match(page.stripText(CL1), /◌ Starting…/);
  assert.equal(page.elapsedNodes(page.strip(CL1)).length, 0);
  assert.match(page.stripText(CX), /◉ Working/);
  assert.equal(page.elapsedNodes(page.strip(CX)).length, 0);
  assert.doesNotMatch(page.stripText(CX), /\d:\d\d|\dm \d+s/);
  assert.equal(page.team(), 'TEAM · 2 ACTIVE');
});

test('C-7. Queued renders truthfully, with no timer; a named wait only when canonical', async () => {
  const page = await startPage(daemonStatus({ views: withViews(
    view(CL1, 'queued', 2, { queue: { count: 1, head: { reasonKind: 'unspecified' } } }),
    view(CL2, 'queued', 3, { queue: { count: 1, head: { reasonKind: 'waiting-for-player', waitingOnName: 'Claude 1' } } })
  ) }));
  assert.match(page.stripText(CL1), /◌ Queued.*Waiting for an available turn/);
  assert.match(page.stripText(CL2), /Waiting for Claude 1 to finish another Play/);
  assert.equal(page.elapsedNodes(page.$('roster')).length, 0);
  assert.equal(page.team(), 'TEAM · 2 ACTIVE');
});

test('C-8. Working + queue: Working stays primary with "1 more queued"', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(CL1, 6, { queue: { count: 1, head: { reasonKind: 'own-current-play' } } })) }));
  const text = page.stripText(CL1);
  assert.match(text, /^◉ Working/);
  assert.match(text, /1 more queued/);
  assert.doesNotMatch(text, /◌ Queued/);
  assert.equal(page.elapsedNodes(page.strip(CL1)).length, 1);
});

test('C-9 / C-15. Needs You escalates the header above routine activity and persists with Review', async () => {
  const queue = [{ id: 'q1', playerInstanceId: CL1, state: 'needs-attention', attention: 'Sign in again', promptSummary: 'Fix it', position: 1 }];
  const page = await startPage(daemonStatus({ queue, views: withViews(view(CL1, 'needs-you', 7, { detail: 'Sign in again' }), working(AG, 3), working(CX, 4)) }));
  assert.equal(page.team(), 'TEAM · 1 NEEDS YOU · 2 ACTIVE', 'human attention first; routine activity second');
  assert.match(page.stripText(CL1), /! Needs you.*Sign in again/);
  const review = page.find(page.strip(CL1), (n) => n.textContent === 'Review');
  assert.ok(review, 'Review wired to the existing needs-attention queue line');
  await page.click(review);
  assert.equal(page.doc.activeElement?.dataset.focusKey, 'queue-attention');
  page.setNow(T0 + 60_000);
  page.tick();
  await page.refresh();
  assert.match(page.stripText(CL1), /Needs you/, 'never auto-dismissed');
});

test('C-10. Historical Unknown remains canonical but is quiet in Dad mode', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(CX, 'unknown', 9, { detail: 'Coach cannot confirm how this Play ended.' })) }));
  assert.equal(page.strip(CX), null);
  assert.equal(page.team(), 'TEAM');
  assert.doesNotMatch(page.allText(page.row(CX)), /Can't confirm|See what happened|Needs you/);
  assert.equal(page.store().views[CX].state, 'unknown', 'presentation policy never deletes or acknowledges machine truth');
});

test('C-11. Historical failure remains canonical but leaves an available Player quiet', async () => {
  const page = await startPage(daemonStatus({ views: withViews(
    view(AG, 'couldnt-finish', 9, { finishedAt: T0 }),
    view(TERM, 'unknown', 8, { finishedAt: T0 })
  ) }));
  assert.equal(page.strip(AG), null);
  assert.equal(page.strip(TERM), null, 'an idle Terminal is not made alarming by old Unknown history');
  assert.equal(page.team(), 'TEAM');
  assert.doesNotMatch(page.allText(page.row(AG)), /Couldn't finish|See what happened|Needs you|\bError\b/);
  assert.doesNotMatch(page.allText(page.row(TERM)), /Can't confirm|See what happened|Needs you/);
  assert.equal(page.store().views[AG].state, 'couldnt-finish');
  assert.equal(page.store().views[TERM].state, 'unknown');
});

test('C-11b. Exact field failure: quiet old Unknown → same exact Player Working → transient completion → quiet', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(AG, 'unknown', 9, { playRef: 'old-play' })) }));
  assert.equal(page.team(), 'TEAM');
  assert.equal(page.strip(AG), null);
  page.emit([working(AG, 10, { playRef: 'new-play', summary: 'This is a Sideline Coach field-proof Play.', executionStartedAt: T0 - 10_000 })]);
  assert.equal(page.row(AG).dataset.instanceId, AG);
  assert.match(page.stripText(AG), /◉ Working.*This is a Sideline Coach field-proof Play\..*0:10/);
  assert.equal(page.elapsedNodes(page.strip(AG)).length, 1);
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · AntiGravity');
  page.emit([view(AG, 'finished', 11, { playRef: 'new-play', finishedAt: T0, durationMs: 10_000 })]);
  assert.match(page.stripText(AG), /✓ Finished/);
  assert.equal(page.elapsedNodes(page.strip(AG)).length, 0);
  assert.equal(page.team(), 'TEAM');
  page.emit([view(AG, 'finished', 12, { playRef: 'new-play', finishedAt: T0, durationMs: 10_000 })], T0 + 30_100);
  assert.equal(page.strip(AG), null);
  assert.equal(page.store().views[AG].state, 'finished', 'terminal truth remains canonical even though the card is quiet');
});

test('C-12. Working transitions through a bounded Finished bridge to quiet Player presentation', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(CL1, 4)) }));
  page.emit([view(CL1, 'finished', 5, { playRef: `ref_${CL1}`, finishedAt: T0, durationMs: 499_000, awaitingReport: true })]);
  assert.match(page.stripText(CL1), /✓ Finished.*Report on its way/);
  assert.equal(page.elapsedNodes(page.row(CL1)).length, 0, 'no ticking node after completion');
  page.emit([view(CL1, 'finished', 6, { playRef: `ref_${CL1}`, finishedAt: T0, durationMs: 499_000, awaitingReport: true })], T0 + 30_100);
  assert.equal(page.strip(CL1), null);
  assert.equal(page.team(), 'TEAM');
  assert.equal(page.store().views[CL1].state, 'finished', 'history is retained underneath the quiet policy');
});

test('C-13 / C-14. Report history stays out of TEAM; only current live/actionable state is summarized', async () => {
  const done = view(CL1, 'finished', 5, { finishedAt: T0, durationMs: 60_000, report: { path: 'REPORTS/x.md', acknowledged: false } });
  const page = await startPage(daemonStatus({ views: withViews(done) }));
  assert.equal(page.team(), 'TEAM');
  assert.match(page.stripText(CL1), /✓ Finished.*x\.md.*View Report/);
  page.emit([working(AG, 6)]);
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · AntiGravity');
  page.emit([view(CX, 'unknown', 7)]);
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · AntiGravity', 'historical uncertainty never becomes current Needs You');
});

test('C-16. Collapsed TEAM: activity updates the header; collapse state never changes', async () => {
  const page = await startPage(daemonStatus());
  await page.click(page.$('rosterToggle'));
  assert.equal(page.$('rosterToggle').attributes['aria-expanded'], 'false');
  page.emit([working(CL1, 3)]);
  await page.refresh(daemonStatus({ views: withViews(working(CL1, 3)) }));
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · Claude 1');
  assert.equal(page.$('roster').hidden, true);
  assert.equal(page.$('rosterToggle').attributes['aria-expanded'], 'false');
  assert.ok(page.$('rosterCard').classList.contains('is-collapsed'));
});

test('C-17. Exactly one elapsed node per Working Player; none in the TEAM header', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(AG, 3), working(CL1, 4), working(CX, 5, { executionStartedAt: undefined })) }));
  assert.equal(page.elapsedNodes(page.strip(AG)).length, 1);
  assert.equal(page.elapsedNodes(page.strip(CL1)).length, 1);
  assert.equal(page.elapsedNodes(page.$('roster')).length, 2);
  assert.doesNotMatch(page.team(), /\d:\d\d|\dm|\ds/);
  // #activePlayStatus is Slice B's transitional last-attempt line (removed in Slice D); not a strip.
});

test('C-18. The one ticker rewrites elapsed text only: no store, header, strip or announcer changes', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(CL1, 4)) }));
  page.emit([working(CL1, 5)]);
  assert.equal(page.intervals.filter((i) => i.ms === 1_000).length, 1, 'exactly one 1 s interval');
  const store = JSON.stringify(page.store().views);
  const strip = page.strip(CL1);
  const clock = page.elapsedNodes(strip)[0];
  const headerSets = page.textSets.get('rosterSummary');
  const announcerSets = page.textSets.get('executionAnnouncer') || 0;
  for (let s = 1; s <= 5; s += 1) { page.setNow(T0 + s * 1_000); page.tick(); }
  assert.equal(clock.textContent, '2m 22s');
  assert.equal(page.strip(CL1), strip, 'strip DOM untouched');
  assert.equal(JSON.stringify(page.store().views), store);
  assert.equal(page.textSets.get('rosterSummary'), headerSets);
  assert.equal(page.textSets.get('executionAnnouncer') || 0, announcerSets);
});

test('C-19. Roster rerender: live strips survive, origin unchanged, focus restored by instance + key', async () => {
  const queue = [{ id: 'q-attention', playerInstanceId: CX, state: 'needs-attention', attention: 'Permission required', promptSummary: 'Fix it', position: 1 }];
  const page = await startPage(daemonStatus({ queue, views: withViews(working(CL1, 4), view(CX, 'needs-you', 5, { detail: 'Permission required' })) }));
  const benchBefore = page.find(page.row(CL1), (n) => n.dataset.focusKey === 'field');
  benchBefore.focus();
  await page.refresh();
  const benchAfter = page.find(page.row(CL1), (n) => n.dataset.focusKey === 'field');
  assert.notEqual(benchAfter, benchBefore, 'row was rebuilt');
  assert.equal(page.doc.activeElement, benchAfter, 'focus restored to the same control of the same Player');
  assert.equal(page.elapsedNodes(page.strip(CL1))[0].dataset.elapsedSince, String(T0 - 137_000));

  const see = page.find(page.strip(CX), (n) => n.dataset.focusKey === 'strip-review');
  see.focus();
  page.emit([view(CX, 'needs-you', 6, { detail: 'Permission required' })]);
  assert.equal(page.doc.activeElement?.dataset.focusKey, 'strip-review', 'strip replacement keeps focus on its action');
  assert.ok(page.strip(CX).contains(page.doc.activeElement));
  assert.match(pageSource, /restoreRosterFocus[\s\S]*focusElement/);
  assert.match(pageSource, /const focusElement = \(el\) => \{[\s\S]*?preventScroll: true/);
});

test('C-20. Execution state never reorders Players', async () => {
  const page = await startPage(daemonStatus());
  const order = () => page.rows().map((r) => r.dataset.instanceId);
  assert.deepEqual(order(), ORDER);
  page.emit([working(CX, 3), view(TERM, 'working', 4), view(CL2, 'needs-you', 5)]);
  await page.refresh(daemonStatus({ views: withViews(working(CX, 3), view(TERM, 'working', 4), view(CL2, 'needs-you', 5)) }));
  assert.deepEqual(order(), ORDER);
});

test('C-21. Game switch: old Game strips leave immediately; the new Game shows only its own views', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(AG, 10)) }));
  let finish;
  page.onSelectGame(() => new Promise((resolve) => { finish = resolve; }));
  const gs3 = page.$('gameList').children.find((item) => item.children[1]?.textContent === 'GS3');
  const switching = page.click(gs3);
  await flush();
  assert.equal(page.strip(AG), null, 'old Game strip gone mid-switch');
  assert.equal(page.team(), 'TEAM');
  page.emit([working(AG, 11)]);
  assert.equal(page.strip(AG), null, 'late old-Game event ignored');
  const other = daemonStatus({ gameId: OTHER, views: withViews(working(CX, 2)) });
  page.setStatus(other);
  finish({ status: 200, body: { success: true, status: other } });
  await switching;
  await flush();
  assert.equal(page.strip(AG), null);
  assert.match(page.stripText(CX), /Working/);
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · Codex');
});

test('C-22. Stale daemon (no status.execution): no strips, no clocks, nothing derived from roster/capability', async () => {
  const page = await startPage(daemonStatus({ execution: false, capState: { [AG]: 'busy' }, turnState: { state: 'started', at: T0 - 5_000 } }));
  for (const id of ORDER) assert.equal(page.strip(id), null);
  assert.equal(page.elapsedNodes(page.$('roster')).length, 0);
  assert.equal(page.team(), 'TEAM');
  assert.doesNotMatch(page.allText(page.$('roster')), /Working|Queued/, 'capability work words are not execution truth');
});

test('C-23. Mobile structure: strips are in flow, full width, overflow-safe; no fixed/sticky live overlay', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  const stripRules = css.split('}').filter((rule) => /\.play-strip/.test(rule)).join('}');
  assert.doesNotMatch(stripRules, /position:\s*(fixed|sticky|absolute)/);
  assert.match(css, /\.play-strip \{[^}]*grid-column: 1 \/ -1;[^}]*min-width: 0;/);
  assert.match(css, /\.play-strip-row \{[^}]*grid-template-columns: max-content minmax\(0, 1fr\) max-content;[^}]*min-width: 0;/);
  assert.match(css, /\.play-strip-summary \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.play-strip-elapsed \{[^}]*flex: none;[^}]*font-size: 1rem;[^}]*font-variant-numeric: tabular-nums;/);
  assert.match(css, /@media \(max-width: 460px\)[\s\S]*?\.play-strip \{ padding-right: 7px; \}/);
  assert.match(css, /\.play-strip-line \{[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.play-strip-actions button \{[^}]*min-height: 40px;/);
  // Slice C itself never moves the viewport. Slice D later adds the ONE explicit-only
  // scrollIntoView call (View Player); that call, and that it is never automatic, is
  // proven in q2-10f-2-outgoing-handoff-view-player (C-18/C-19 here still prove no
  // scrolling from dispatch, ticking, or execution events).
});

test('C-24. Direct shell: Terminal shows "Running command", no AI clock, counts as ACTIVE', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(TERM, 'working', 3, { executionStartedAt: T0 - 9_000, summary: 'npm test' })) }));
  const text = page.stripText(TERM);
  assert.match(text, /▸ Running command/);
  assert.doesNotMatch(text, /Working|model|reasoning/i);
  assert.equal(page.elapsedNodes(page.strip(TERM)).length, 0);
  assert.equal(page.strip(TERM).dataset.executionType, 'direct-shell');
  assert.equal(page.team(), 'TEAM · 1 ACTIVE · Terminal');
  page.emit([view(TERM, 'finished', 4, { finishedAt: T0, durationMs: 9_000 })]);
  assert.doesNotMatch(page.stripText(TERM), /Report/, 'no Report-ready copy for a command');
});

test('C-25. Announcer: transitions only; the first snapshot of a Game is learned silently', async () => {
  const page = await startPage(daemonStatus({ views: withViews(working(AG, 3)) }));
  assert.equal(page.$('executionAnnouncer').textContent, '', 'no announcement for existing state on load');
  assert.equal(page.$('executionAnnouncer').attributes['aria-live'] ?? 'polite', 'polite');
  assert.match(pageSource, /id="executionAnnouncer" class="visually-hidden" aria-live="polite"/);
  page.emit([working(CL1, 4)]);
  assert.equal(page.$('executionAnnouncer').textContent, 'Claude 1 is working.');
  page.emit([view(CX, 'needs-you', 5)]);
  assert.equal(page.$('executionAnnouncer').textContent, 'Codex needs you.');
  const sets = page.textSets.get('executionAnnouncer');
  await page.refresh(daemonStatus({ views: withViews(working(AG, 3), working(CL1, 4), view(CX, 'needs-you', 5)) }));
  assert.equal(page.textSets.get('executionAnnouncer'), sets, 'a refresh with no transition says nothing');
});
