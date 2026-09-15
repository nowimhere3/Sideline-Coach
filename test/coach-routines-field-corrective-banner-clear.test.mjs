// Coach Routines V0 Field Corrective — Due Banner Never Clears After Successful Copy.
//
// Field defect: after a manually-due cycle ("Refresh on next Copy") was successfully
// delivered via a real Copy (clipboard succeeded, /api/routines/delivered succeeded,
// backend status no longer projects the handoff), the blue "Coach Refresh is due"
// banner remained visible indefinitely.
//
// Root cause (confirmed via a real end-to-end repro: real ControlPlaneDaemon + the
// real src/public/index.html script driven over real HTTP, not a mock):
//   1. CSS: `.coach-handoff-banner { display: flex; ... }` had no `[hidden]` override.
//      Every sibling component in this file that toggles visibility via the `hidden`
//      DOM property (.outgoing-ack[hidden], .modal-backdrop[hidden], .settings-view[hidden],
//      .game-dropdown-menu[hidden]) explicitly adds `[hidden] { display: none !important; }`
//      because author CSS always wins over the UA stylesheet's `[hidden] { display: none }`
//      regardless of selector specificity. This one component was missing that guard, so
//      `banner.hidden = true` never actually hid it in a real browser.
//   2. JS: `syncIncomingCoachHandoff` early-returned when there was no handoff without
//      clearing `coachHandoffTitle.textContent`, so the stale "is due" text stayed in the
//      DOM forever — exactly the symptom the human saw.
//
// Why prior automated tests (Slice E) missed this: they assert against the `hidden` DOM
// PROPERTY directly (`page.banner().hidden === false`), which the JS logic already set
// correctly. None of them resolve CSS cascade / computed style, so the missing
// `[hidden] { display: none !important; }` override was invisible to them. This suite
// adds a direct assertion on the stylesheet text itself (the same technique already used
// by Slice E's own E-25) plus an end-to-end check that the stale-title defect is fixed.
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

const dueHandoff = (routines = [defaultRoutineView({ due: true, cycle: 'rt_default:0:m1' })]) => ({
  text: HANDOFF_TEXT,
  deliveries: routines.filter((r) => r.due).map((r) => ({ routineId: r.id, cycle: r.cycle })),
  names: routines.filter((r) => r.due).map((r) => r.name)
});

function routinesProjection({ gameId = GAME, devMode = true, routines = [defaultRoutineView({ due: true, cycle: 'rt_default:0:m1' })], withHandoff = true } = {}) {
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
    game: { gameId, displayName: 'Trend' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }],
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
    navigator: { clipboard: { writeText: async (text) => { clipboardWrites.push(text); } } },
    window: { isSecureContext: true }
  };
  const page = {
    $, posts, clipboardWrites,
    setStatus: (next) => { status = next; },
    onDelivered: (fn) => { onDelivered = fn; },
    banner: () => $('coachHandoffBanner'),
    bannerVisible: () => page.banner().hidden === false,
    bannerTitle: () => $('coachHandoffTitle').textContent,
    // Q2.10F.7 V0.2: the compact disclosure is now the only human-visible due cue.
    disclosureVisible: () => $('coachBriefDisclosure').hidden === false,
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
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

test('FC-1. CSS: the banner has an explicit [hidden] override, matching every sibling component that toggles visibility via the hidden DOM property', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  // Author CSS `.coach-handoff-banner { display: flex; ... }` otherwise always wins over
  // the UA stylesheet's `[hidden] { display: none }`, regardless of specificity — the
  // exact class of bug this field corrective fixes.
  assert.match(css, /\.coach-handoff-banner\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, 'banner must force display:none when hidden, like .outgoing-ack[hidden] / .modal-backdrop[hidden] / .settings-view[hidden]');
});

test('FC-2. The exact human sequence: due -> compact disclosure visible -> Copy includes the brief -> delivered succeeds -> disclosure clears without reload, no fake title left behind on the retained internal banner', async () => {
  const page = await startPage(daemonStatus());
  // Q2.10F.7 V0.2: the large due/"Not this time" card is retained only as internal
  // plumbing and is never surfaced — the compact disclosure is the real Dad-facing cue.
  assert.equal(page.bannerVisible(), false);
  assert.equal(page.disclosureVisible(), true, 'step 3: Incoming correctly shows the brief is included');

  page.onDelivered(async (body) => {
    assert.deepEqual(body.deliveries, [{ routineId: 'rt_default', cycle: 'rt_default:0:m1' }], 'exact cycle acknowledged');
    page.setStatus(daemonStatus({ routines: routinesProjection({ routines: [defaultRoutineView({ due: false, lastSentLabel: 'Last sent: 0 Plays ago' })], withHandoff: false }) }));
    return { success: true, gameId: body.gameId, delivered: true, alreadyDelivered: false, stale: false, projection: {} };
  });

  await page.copy();
  assert.equal(page.$('copyReportBtn').textContent, '✓ Report copied', 'step 5 (V0.2 plain copy language)');

  const delivered = page.posts.find((p) => p.url === '/api/routines/delivered');
  assert.ok(delivered, '/api/routines/delivered was called');

  // No reload, no new Play, no new report — only the async reconvergence already
  // triggered by deliverCoachHandoff's own refresh().
  assert.equal(page.disclosureVisible(), false, 'step 7: the disclosure disappears automatically from real backend truth');
  assert.equal(page.bannerTitle(), '', 'no stale "is due" text is left behind on the retained internal banner either');
});

test('FC-3. Failure path unchanged: clipboard succeeds, delivery acknowledgement fails, still due, no fabricated delivered state', async () => {
  const page = await startPage(daemonStatus());
  page.onDelivered(async () => ({ success: false }));
  await page.copy();
  assert.equal(page.$('copyReportBtn').textContent, '✓ Report copied', 'clipboard still succeeded');
  // Canonical status is unchanged server-side (nothing was actually delivered).
  await page.refresh(daemonStatus());
  assert.equal(page.disclosureVisible(), true, 'still due — acknowledgement failure never fabricates a delivered UI');
});
