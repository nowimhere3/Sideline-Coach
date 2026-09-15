// Coach Routines V0 Slice E — Incoming / Copy Coach Handoff.
//
// The real src/public/index.html script runs against a mocked-but-contract-shaped
// backend (Slice A/B's real status.routines.handoff / POST /api/routines/delivered
// contracts, verified by reading src/control-plane/daemon.ts directly). A routine is
// marked delivered ONLY after a confirmed successful clipboard write; nothing else
// (render, selection, refresh, Game switch, a skipped Copy) may trigger it.
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
const T0 = 1_800_000_000_000;

const HANDOFF_TEXT = [
  '=== SIDELINE COACH ROUTINE — COACH REFRESH DUE ===',
  'Before recommending or drafting the next Play, reread the canonical project sources below.',
  'Game: Trend',
  'Sources (paths inside the Game folder):',
  '- NORTH-STAR.md',
  '=== END COACH ROUTINE — REPORT FOLLOWS ===',
  ''
].join('\n');

const defaultRoutineView = (overrides = {}) => ({
  id: 'rt_default', name: 'Canonical Refresh', enabled: true, template: 'canonical-refresh',
  cadence: { kind: 'plays', every: 5 }, cadenceLabel: 'Every 5 Plays',
  targets: { strategyBoard: true, players: false }, targetsLabel: 'Strategy Board',
  due: false, lastSentLabel: 'Last sent: never', nextLabel: 'Next: in 5 Plays',
  sources: [{ path: 'NORTH-STAR.md', kind: 'file', state: 'file' }], includeLocalRoot: true, ...overrides
});

const dueHandoff = (routines = [defaultRoutineView({ due: true, cycle: 'rt_default:0:c' })]) => ({
  text: HANDOFF_TEXT,
  deliveries: routines.filter((r) => r.due).map((r) => ({ routineId: r.id, cycle: r.cycle })),
  names: routines.filter((r) => r.due).map((r) => r.name)
});

function routinesProjection({ gameId = GAME, devMode = true, routines = [defaultRoutineView({ due: true, cycle: 'rt_default:0:c' })], withHandoff = true } = {}) {
  const projection = { gameId, devMode, playCount: 5, routines };
  if (withHandoff && devMode && routines.some((r) => r.due)) projection.handoff = dueHandoff(routines);
  return projection;
}

const reportFixture = (overrides = {}) => ({
  agent: 'Claude', filename: 'report.md', path: 'REPORTS/Claude/report.md', mtime: T0,
  project: 'Trend', content: 'Exact canonical report body.\nLine two.', ...overrides
});

function daemonStatus({ devMode = true, routines = routinesProjection({ devMode }), gameId = GAME, execution = true } = {}) {
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: gameId === GAME ? 'Trend' : 'GS3' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }, { gameId: OTHER, displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode },
    routines,
    at: T0
  };
  if (execution) status.execution = { gameId, epoch: 'E1', serverNow: T0, byInstance: {} };
  return status;
}

function createPage(initialStatus, initialReports = [reportFixture()]) {
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
  let reportsList = initialReports;
  const posts = [];
  const clipboardWrites = [];
  let clipboardShouldFail = false;
  let onDelivered = async (body) => ({ success: true, gameId: body.gameId, delivered: true, alreadyDelivered: false, stale: false, projection: routinesProjection({ devMode: status.preferences.devMode, routines: [defaultRoutineView({ due: false })], withHandoff: false }) });
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
      if (url.startsWith('/api/reports')) return reply(200, reportsList);
      if (url === '/api/game/select') return reply(200, { success: true, status });
      posts.push({ url, body });
      if (url === '/api/work/acknowledge') return reply(200, { success: true, acknowledged: true, changed: true });
      if (url === '/api/routines/delivered') { const r = await onDelivered(body); return reply(r.success === false ? 404 : 200, r); }
      if (url.startsWith('/api/routines/sources/') || url.startsWith('/api/routines?')) return reply(200, { success: true, suggestions: [], entries: [] });
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { clipboardWrites.push(text); if (clipboardShouldFail) throw new Error('Clipboard permission denied'); } } },
    window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, allText, find, posts, clipboardWrites,
    setStatus: (next) => { status = next; },
    setReports: (next) => { reportsList = next; },
    setClipboardShouldFail: (value) => { clipboardShouldFail = value; },
    onDelivered: (fn) => { onDelivered = fn; },
    banner: () => $('coachHandoffBanner'),
    bannerVisible: () => page.banner().hidden === false,
    // Q2.10F.7 V0.2: the compact disclosure is the only human-visible due cue now.
    disclosureVisible: () => $('coachBriefDisclosure').hidden === false,
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
    change: async (node) => { for (const fn of node.listeners.change || []) await fn({ target: node }); await flush(); },
    selectReport: async (index) => { $('reportSelect').value = String(index); for (const fn of $('reportSelect').listeners.change || []) fn({ target: { value: String(index) } }); await flush(); },
    copy: async () => { await page.click($('copyReportBtn')); },
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

const startPage = (status, reports) => createPage(status, reports).start();

// ---------------------------------------------------------------------------

test('E-1. Dev Mode OFF: no due UI, ordinary Copy unaffected', async () => {
  const page = await startPage(daemonStatus({ devMode: false, routines: routinesProjection({ devMode: false }) }));
  assert.equal(page.banner().hidden, true);
  await page.copy();
  assert.equal(page.clipboardWrites[0], 'Exact canonical report body.\nLine two.');
  assert.equal(page.posts.filter((p) => p.url === '/api/routines/delivered').length, 0);
});

test('E-2. Dev Mode ON, no due routine: no due UI, ordinary Copy unaffected', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: routinesProjection({ devMode: true, routines: [defaultRoutineView({ due: false })], withHandoff: false }) }));
  assert.equal(page.banner().hidden, true);
  assert.equal(page.disclosureVisible(), false);
  await page.copy();
  assert.equal(page.clipboardWrites[0], 'Exact canonical report body.\nLine two.');
  assert.equal(page.$('copyReportBtn').textContent, '✓ Report copied');
});

test('E-3 / E-4 (V0.2). A due Coach Refresh shows only the compact disclosure — never the large due/"Not this time" decision card', async () => {
  const page = await startPage(daemonStatus());
  // The large card is permanently retained as internal plumbing but never surfaced.
  assert.equal(page.bannerVisible(), false, 'the large due/"Not this time" card never renders in the ordinary Dad-facing path');
  assert.equal(page.disclosureVisible(), true, 'the compact disclosure is the only visible cue');
  // Static markup: the stub does not parse real HTML nesting, so read the exact
  // production-authored copy directly (a real browser already renders it).
  assert.match(pageSource, /✓ AI Assistant Coach brief included/);
  assert.match(pageSource, /id="viewBriefBtn"[^>]*>View brief</);
});

test('E-5 / E-6 / E-7 / E-8. Render, selection, refresh, and Game switch alone never mark delivered', async () => {
  const page = await startPage(daemonStatus(), [reportFixture(), reportFixture({ path: 'REPORTS/Claude/second.md', filename: 'second.md', mtime: T0 + 1000 })]);
  const deliveredCalls = () => page.posts.filter((p) => p.url === '/api/routines/delivered').length;
  assert.equal(deliveredCalls(), 0, 'render alone');
  await page.selectReport(1);
  assert.equal(deliveredCalls(), 0, 'report selection alone');
  await page.refresh();
  assert.equal(deliveredCalls(), 0, 'page refresh alone');
  await page.click(page.$('gameDropdownBtn'));
  const gs3 = page.$('gameList').children.find((item) => item.children[0]?.textContent === 'GS3');
  page.setStatus(daemonStatus({ gameId: OTHER, routines: routinesProjection({ gameId: OTHER, devMode: true, routines: [], withHandoff: false }) }));
  await page.click(gs3);
  assert.equal(deliveredCalls(), 0, 'Game switch alone');
});

test('E-9 / E-10 / E-11 (V0.2). "Not this time" is no longer a Dad-facing control, but the underlying skip/defer plumbing is preserved internally: invoking it still excludes the envelope for one Copy, marks nothing delivered, and the routine stays due', async () => {
  const page = await startPage(daemonStatus());
  // No Dad-facing entry point exists for this anymore — the large card is never visible.
  assert.equal(page.bannerVisible(), false);
  assert.equal(page.disclosureVisible(), true, 'still due, from the compact disclosure');
  // The underlying handler is preserved (not destroyed) even though nothing surfaces it.
  await page.click(page.$('coachHandoffSkipBtn'));
  await page.copy();
  assert.equal(page.clipboardWrites[0], 'Exact canonical report body.\nLine two.', 'envelope excluded from the clipboard payload');
  assert.equal(page.posts.filter((p) => p.url === '/api/routines/delivered').length, 0, 'skipping never marks delivered');
  // Still due: canonical status is unchanged, so the disclosure returns for the next Copy.
  await page.refresh(daemonStatus());
  assert.equal(page.disclosureVisible(), true, 'remains due; skip was for exactly one Copy');
});

test('E-12 / E-13. An included Copy places the envelope before the exact, unmutated report text', async () => {
  const page = await startPage(daemonStatus());
  await page.copy();
  const payload = page.clipboardWrites[0];
  assert.ok(payload.startsWith(HANDOFF_TEXT), 'envelope first');
  assert.ok(payload.endsWith('Exact canonical report body.\nLine two.'), 'exact canonical report text, unmutated, as the literal tail');
  assert.equal(payload, `${HANDOFF_TEXT}\nExact canonical report body.\nLine two.`);
});

test('E-14. No source file contents are fetched or embedded during Copy', async () => {
  const page = await startPage(daemonStatus());
  const before = page.posts.length;
  await page.copy();
  const sourceCalls = page.posts.slice(before).filter((p) => p.url.startsWith('/api/routines/sources/'));
  assert.equal(sourceCalls.length, 0, 'Copy never fetches/browses sources');
  assert.doesNotMatch(page.clipboardWrites[0], /Exact canonical report body\.\nLine two\.[\s\S]+Exact canonical report body/);
});

test('E-15 / E-16. Delivered is called only after a confirmed successful clipboard write, in that order', async () => {
  const page = await startPage(daemonStatus());
  const order = [];
  const originalWrite = page.clipboardWrites.push.bind(page.clipboardWrites);
  page.clipboardWrites.push = (...args) => { order.push('clipboard'); return originalWrite(...args); };
  page.onDelivered(async (body) => { order.push('delivered'); return { success: true, gameId: body.gameId, delivered: true, alreadyDelivered: false, stale: false, projection: routinesProjection({ routines: [defaultRoutineView({ due: false })], withHandoff: false }) }; });
  await page.copy();
  assert.deepEqual(order, ['clipboard', 'delivered']);
});

test('E-17. A failed clipboard write never calls delivered; the routine remains due', async () => {
  const page = await startPage(daemonStatus());
  page.setClipboardShouldFail(true);
  await page.copy();
  assert.equal(page.$('copyReportBtn').textContent, 'Copy Failed · Try Again');
  assert.equal(page.posts.filter((p) => p.url === '/api/routines/delivered').length, 0);
  await page.refresh(daemonStatus());
  assert.equal(page.disclosureVisible(), true, 'still due — nothing was ever delivered');
});

test('E-18. Clipboard success + acknowledgement (delivered) failure never fabricates a delivered UI', async () => {
  const page = await startPage(daemonStatus());
  page.onDelivered(async () => ({ success: false }));
  await page.copy();
  // V0.2: plain success copy — the disclosure already told Dad the brief was included.
  assert.equal(page.$('copyReportBtn').textContent, '✓ Report copied', 'the human still sees their real Copy result');
  // Canonical status is unchanged (delivery never actually recorded server-side), so a
  // subsequent refresh must still show the routine due — never a fabricated quiet state.
  await page.refresh(daemonStatus());
  assert.equal(page.disclosureVisible(), true);
});

test('E-19 / E-20. Successful acknowledgement reconverges from real backend status; the banner clears only from that', async () => {
  const page = await startPage(daemonStatus());
  page.onDelivered(async (body) => {
    assert.equal(body.gameId, GAME);
    assert.deepEqual(body.deliveries, [{ routineId: 'rt_default', cycle: 'rt_default:0:c' }]);
    assert.equal(body.via, 'copy-report');
    assert.equal(body.reportPath, 'REPORTS/Claude/report.md');
    page.setStatus(daemonStatus({ routines: routinesProjection({ routines: [defaultRoutineView({ due: false, lastSentLabel: 'Last sent: 0 Plays ago' })], withHandoff: false }) }));
    return { success: true, gameId: body.gameId, delivered: true, alreadyDelivered: false, stale: false, projection: {} };
  });
  await page.copy();
  await flush();
  assert.equal(page.disclosureVisible(), false, 'cleared because backend truth (re-fetched) says delivered, not a local guess');
});

test('E-21. Game isolation: Game A\'s due handoff cannot attach to Game B\'s report or delivery', async () => {
  const page = await startPage(daemonStatus());
  page.setStatus(daemonStatus({ gameId: OTHER, routines: routinesProjection({ gameId: OTHER, devMode: true, routines: [], withHandoff: false }) }));
  const gs3 = page.$('gameList').children.find((item) => item.children[0]?.textContent === 'GS3');
  await page.click(gs3);
  assert.equal(page.disclosureVisible(), false, "Game A's due state does not leak into Game B's view");
  await page.copy();
  const call = page.posts.find((p) => p.url === '/api/routines/delivered');
  assert.equal(call, undefined, 'nothing to deliver in Game B; no cross-Game delivery attempted');
});

test('E-22. A stale selected-report identity cannot cause copying a different report', async () => {
  const page = await startPage(daemonStatus(), [reportFixture({ content: 'Report ONE content.' }), reportFixture({ path: 'REPORTS/Claude/two.md', filename: 'two.md', mtime: T0 + 5000, content: 'Report TWO content.' })]);
  const btn = page.$('copyReportBtn');
  const copying = (async () => { for (const fn of btn.listeners.click || []) await fn({ stopPropagation() {} }); })();
  // A newly arrived report changes Incoming mid-flight; the in-progress Copy must still
  // use the report captured at the moment the human clicked, not whatever is current now.
  await page.selectReport(1);
  await copying;
  await flush();
  assert.match(page.clipboardWrites[0], /Report ONE content\./);
  assert.doesNotMatch(page.clipboardWrites[0], /Report TWO content\./);
});

test('E-23. Ordinary Incoming Copy behaviour (no due routine) is unchanged, including existing report acknowledgement', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: routinesProjection({ devMode: true, routines: [defaultRoutineView({ due: false })], withHandoff: false }) }));
  await page.copy();
  assert.equal(page.clipboardWrites[0], 'Exact canonical report body.\nLine two.');
  assert.equal(page.$('copyReportBtn').textContent, '✓ Report copied');
  const ack = page.posts.find((p) => p.url === '/api/work/acknowledge');
  assert.equal(ack.body.reportPath, 'REPORTS/Claude/report.md', 'the pre-existing Player-report acknowledgement path still fires');
});

test('E-24. No Player delivery behaviour appears anywhere in this flow', async () => {
  const page = await startPage(daemonStatus());
  await page.copy();
  assert.doesNotMatch(pageSource, /targets\.players\s*:\s*true/);
  assert.equal(page.posts.some((p) => p.url.includes('player') && p.url.includes('routine')), false);
  assert.doesNotMatch(page.clipboardWrites[0] || '', /Send to Players/);
});

test('E-25. Mobile: the handoff banner stays compact and in normal flow, no fixed/sticky element', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  const bannerRules = css.split('}').filter((rule) => /\.coach-handoff/.test(rule)).join('}');
  assert.doesNotMatch(bannerRules, /position:\s*(fixed|sticky|absolute)/);
  assert.match(css, /\.coach-handoff-banner button \{[^}]*min-height: 36px;/);
});
