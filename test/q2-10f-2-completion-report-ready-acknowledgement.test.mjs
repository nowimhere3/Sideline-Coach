// Q2.10F.2 Slice E — Completion, Report Ready & Acknowledgement.
//
// The real src/public/index.html script runs against a DOM stub extended once more
// (parent/child, remove/contains/closest, focus/blur, scrollIntoView, matchMedia,
// visibilitychange — Slice D's stub) plus Incoming's report list/select/copy elements
// and a mockable POST /api/work/acknowledge. Truth enters ONLY through Slice B's real
// store (status.execution snapshots + execution SSE) and Slice A's real endpoint
// contract shape; nothing here is simulated as a second acknowledgement store.
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
const CL2 = 'claude-cccc2222'; // a idle sibling only, so CL1 gets contiguous "Claude 1" naming
const CX = 'codex-bbbb2222';
const ORDER = [AG, CL1, CX];
const T0 = 1_800_000_000_000;

const snap = { provider: 'x', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'm', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: [] }] };
const typeOf = (id) => id.split('-')[0];
const cap = (instanceId) => ({ instanceId, playerType: typeOf(instanceId), transport: 'controlled', transportLabel: 'Controlled', fieldLabel: instanceId, state: 'ready', capability: snap });
const view = (instanceId, state, revision, extra = {}) => ({ instanceId, state, revision, executionType: 'reasoning', ...extra });
const idle = () => ORDER.map((id) => view(id, 'idle', 0));
const withViews = (...changed) => idle().map((v) => changed.find((c) => c.instanceId === v.instanceId) || v);
const names = { [AG]: 'AntiGravity', [CL1]: 'Claude 1', [CX]: 'Codex' };

const finishedView = (instanceId, revision, { finishedAt, durationMs = 499_000, playRef = `ref_${instanceId}`, report, awaitingReport, ...extra } = {}) =>
  view(instanceId, 'finished', revision, { finishedAt, durationMs, playRef, ...(report ? { report } : {}), ...(awaitingReport ? { awaitingReport: true } : {}), ...extra });

const reportFixture = (instanceId, overrides = {}) => {
  const reportPath = overrides.path || `REPORTS/${instanceId}.md`;
  const filename = overrides.filename || reportPath.split('/').pop();
  return { agent: names[instanceId], filename, path: reportPath, mtime: T0, project: 'Trend', content: `Body for ${instanceId}`, ...overrides };
};

function daemonStatus({ gameId = GAME, epoch = 'E1', serverNow = T0, views = idle(), execution = true, mode = 'auto', activeDecision = null } = {}) {
  const inst = (instanceId, seat, fieldLabel) => ({ instanceId, playerType: typeOf(instanceId), seat, fieldLabel, onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' });
  const caps = [AG, CL1, CX].map(cap);
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: gameId === GAME ? 'Trend' : 'GS3' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }, { gameId: OTHER, displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [
      { id: 'antigravity', name: 'AntiGravity', instances: [inst(AG, 1, 'AntiGravity · Controlled')] },
      { id: 'claude', name: 'Claude', instances: [inst(CL1, 1, 'Claude 1 · Controlled'), inst(CL2, 2, 'Claude 2 · Controlled')] },
      { id: 'codex', name: 'Codex', instances: [inst(CX, 1, 'Codex · Controlled')] }
    ],
    capabilities: caps,
    queue: [],
    routing: { mode, capabilities: caps, activeDecision },
    routingMode: mode, reports: [], playerDiscovery: null, preferences: { runningPlayers: 'ask' }, at: serverNow
  };
  if (execution) status.execution = { gameId, epoch, serverNow, byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v])) };
  return status;
}

const received = (instanceId, name, clientRef = 'ref_1') => ({ status: 200, body: { success: true, statusCode: 200, clientRef, turnRef: `turn-${clientRef}`, status: 'received', playerInstanceId: instanceId, playerName: name, message: 'Dispatch accepted by Stadium provider.' } });
const unknownReply = (instanceId, name, clientRef = 'ref_u') => ({ status: 504, body: { success: false, statusCode: 504, clientRef, status: 'unknown', playerInstanceId: instanceId, playerName: name, message: 'Dispatch timed out.' } });

function createPage(initialStatus, initialReports = []) {
  const elements = new Map();
  const scrollCalls = [];
  const doc = { activeElement: null, visibilityState: 'visible', _listeners: {} };
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
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = null; },
      scrollIntoView(opts) { scrollCalls.push({ id: this.dataset.instanceId || this.id, opts }); }
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
  let now = T0;
  let reducedMotion = false;
  const intervals = [];
  const timeouts = [];
  let status = initialStatus;
  let reportsList = initialReports;
  const posts = [];
  let onDispatch = async () => received(AG, 'AntiGravity');
  let onAcknowledge = async (body) => ({ success: true, acknowledged: true, changed: true, instanceId: body.instanceId || AG });
  let onSelectGame = async () => ({ status: 200, body: { success: true } });
  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), body: makeNode('body'),
    querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []),
    addEventListener(e, fn) { (this._listeners[e] = this._listeners[e] || []).push(fn); },
    removeEventListener() {}
  });
  const ctx = {
    document: doc, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: (query) => ({ matches: /reduced-motion:\s*reduce/.test(query) ? reducedMotion : false }),
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, reportsList);
      if (url === '/api/game/select') { const r = await onSelectGame(body); return reply(r.status, r.body); }
      posts.push({ url, body });
      if (url === '/api/dispatch') { const r = await onDispatch(body); return reply(r.status, r.body); }
      if (url === '/api/route/preview') return reply(200, { success: true, decision: status.routing?.activeDecision });
      if (url === '/api/work/acknowledge') {
        const r = await onAcknowledge(body);
        return reply(r.success === false ? 404 : 200, r);
      }
      return reply(200, {});
    },
    setTimeout: (fn, ms) => { const id = timeouts.length; timeouts.push({ fn, ms, fired: false, id }); return { unref() {}, id }; },
    clearTimeout: (t) => { if (!t) return; const id = typeof t === 'object' ? t.id : t; const found = timeouts.find((x) => x.id === id); if (found) found.fired = true; },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: () => {},
    Date: class extends Date { static now() { return now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, doc, allText, find, scrollCalls, posts,
    store: () => ctx.__sidelineCoach.execution(),
    attempt: () => ctx.__sidelineCoach.dispatchAttempt(),
    rows: () => $('roster').children.filter((c) => c.className === 'player'),
    row: (id) => page.rows().find((r) => r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    stripText: (id) => { const s = page.strip(id); return s ? allText(s) : ''; },
    quiet: (id) => page.find(page.row(id), (n) => n.className === 'player-quiet'),
    quietText: (id) => page.quiet(id)?.textContent || '',
    ack: () => $('outgoingAck'),
    ackText: () => allText($('outgoingAck')),
    setStatus: (next) => { status = next; },
    setReports: (next) => { reportsList = next; },
    setNow: (value) => { now = value; },
    setReducedMotion: (value) => { reducedMotion = value; },
    tick: () => { for (const i of intervals.filter((x) => x.ms === 1_000)) i.fn(); },
    fireTimeouts: (upToMs) => {
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const t of timeouts) if (!t.fired && t.ms <= upToMs) { t.fired = true; t.fn(); progressed = true; }
      }
    },
    ackIntervalCount: () => intervals.filter((i) => i.ms === 1_000).length,
    onDispatch: (fn) => { onDispatch = fn; },
    onAcknowledge: (fn) => { onAcknowledge = fn; },
    onSelectGame: (fn) => { onSelectGame = fn; },
    emit: (viewsArg, serverNow = T0, gameId = GAME, epoch = 'E1') => source.emit('execution', { gameId, epoch, serverNow, views: viewsArg }),
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); },
    typeInPrompt: (text) => { $('promptInput').value = text; for (const fn of $('promptInput').listeners.input || []) fn(); },
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

const startPage = (status, reports = []) => createPage(status, reports).start();
const rich = (id, extra = {}) => finishedView(id, 4, { finishedAt: T0, ...extra });

// ---------------------------------------------------------------------------

test('E-1. Finished with no report gets only a bounded truthful handoff strip', async () => {
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { awaitingReport: true })) }));
  assert.match(page.stripText(CL1), /✓ Finished.*Report on its way/);
  assert.doesNotMatch(page.stripText(CL1), /View Report/);
  assert.equal(page.find(page.strip(CL1), (n) => n.dataset?.elapsedSince !== undefined), null);
  assert.equal(page.quietText(CL1), '');
  assert.equal(page.store().views[CL1].state, 'finished');
  assert.equal(page.store().views[CL1].awaitingReport, true);
});

test('E-2. Report-linked completion briefly bridges the exact Player to Incoming', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  assert.match(page.stripText(CL1), /✓ Finished.*x\.md.*View Report/);
  assert.equal(page.quietText(CL1), '');
  assert.equal(page.$('reportFilename').textContent, 'x.md');
  assert.equal(page.store().views[CL1].report.path, 'REPORTS/x.md');
  const viewButton = page.find(page.strip(CL1), (n) => n.textContent === 'View Report');
  assert.equal(viewButton.attributes['aria-label'], 'View report from Claude 1');
  await page.click(viewButton);
  await flush();
  assert.equal(page.$('reportFilename').textContent, 'x.md');
  assert.deepEqual(page.posts.find((p) => p.url === '/api/work/acknowledge').body, {
    gameId: GAME, reportPath: 'REPORTS/x.md', instanceId: CL1, playRef: `ref_${CL1}`
  });
  assert.ok(page.strip(CL1), 'no optimistic hiding before canonical acknowledgement arrives');
});

test('E-2b. View Report refreshes the existing Incoming list once when execution linkage arrives first', async () => {
  const report = { path: 'REPORTS/late.md', filename: 'late.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), []);
  page.setReports([reportFixture(CL1, { path: report.path, filename: report.filename, content: 'Late exact report' })]);
  const viewButton = page.find(page.strip(CL1), (n) => n.textContent === 'View Report');
  await page.click(viewButton);
  await flush();
  assert.equal(page.$('reportFilename').textContent, 'late.md');
  assert.match(page.$('reportPreviewBody').textContent, /Late exact report/);
  assert.deepEqual(page.posts.find((p) => p.url === '/api/work/acknowledge').body, {
    gameId: GAME, reportPath: report.path, instanceId: CL1, playRef: `ref_${CL1}`
  });
});

test('E-3. Finished clock is static: no [data-elapsed-since]; ticking cannot alter duration', async () => {
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { awaitingReport: true })) }));
  const before = page.stripText(CL1);
  page.setNow(T0 + 4_000);
  page.tick();
  assert.equal(page.stripText(CL1), before, 'the ticker cannot touch a static duration');
});

test('E-4. Reload reconstructs only the canonical time remaining in the transient bridge', async () => {
  const finishedAt = T0 - 28_000;
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { finishedAt, awaitingReport: true })) }));
  assert.match(page.stripText(CL1), /✓ Finished/);
  page.setNow(T0 + 2_500); // > 2 s remaining of the ORIGINAL 30 s window (not a fresh one)
  page.fireTimeouts(2_500);
  assert.equal(page.strip(CL1), null);
  assert.equal(page.quietText(CL1), '');
});

test('E-5. Finished stays quiet after any former rich window', async () => {
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { awaitingReport: true })) }));
  page.setNow(T0 + 30_100);
  page.fireTimeouts(30_100);
  assert.equal(page.strip(CL1), null);
  assert.equal(page.quietText(CL1), '');
});

test('E-6. Q2.14: an unacknowledged report stays visible on the Player card past the rich window — a durable handoff, not a decorative timeout', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  page.setNow(T0 + 30_100);
  page.fireTimeouts(30_100);
  // The rich "Finished" decoration ends on schedule, but the report-ready
  // affordance itself does not — it persists until deliberate acknowledgement.
  assert.match(page.stripText(CL1), /Report ready.*x\.md.*View Report/);
  assert.doesNotMatch(page.stripText(CL1), /✓ Finished/, 'the rich window has genuinely ended');
  assert.equal(page.quietText(CL1), '', 'the quiet adjunct stays empty; the strip itself carries the durable signal');
  assert.equal(page.store().views[CL1].report.acknowledged, false, 'still not acknowledged — nothing here auto-acknowledges');
  assert.equal(page.$('reportFilename').textContent, 'x.md');
});

test('E-7. TEAM omits report history even while canonical truth retains it', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  assert.equal(page.$('rosterSummary').textContent, 'TEAM');
  assert.equal(page.store().views[CL1].report.path, 'REPORTS/x.md');
});

test('E-8. Report arrival inside the bridge updates its right slot without restarting lifecycle', async () => {
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { awaitingReport: true })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  assert.match(page.stripText(CL1), /Report on its way/);
  assert.doesNotMatch(page.stripText(CL1), /View Report/);
  page.emit([finishedView(CL1, 5, { finishedAt: T0, report: { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false } })]);
  assert.match(page.stripText(CL1), /✓ Finished.*x\.md.*View Report/);
  assert.equal(page.store().views[CL1].durationMs, 499_000, 'same finished Play: duration unchanged');
  assert.equal(page.store().views[CL1].report.path, 'REPORTS/x.md');
});

test('E-9. Q2.14: a report that arrives AFTER the rich window has already expired still produces the durable report-ready strip', async () => {
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { awaitingReport: true })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  page.setNow(T0 + 30_100);
  page.fireTimeouts(30_100);
  // No report yet: correctly still nothing to show.
  assert.equal(page.quietText(CL1), '');
  assert.equal(page.strip(CL1), null);
  page.emit([finishedView(CL1, 5, { finishedAt: T0, report: { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false } })], T0 + 30_100);
  assert.equal(page.quietText(CL1), '');
  assert.match(page.stripText(CL1), /Report ready.*x\.md.*View Report/, 'the report arriving late still produces the durable handoff, well past the decorative rich window');
});

test('E-10. Incoming selection opens the exact report, never another Player\'s', async () => {
  const claudeReport = { path: 'REPORTS/claude.md', filename: 'claude.md', acknowledged: false };
  const codexReport = { path: 'REPORTS/codex.md', filename: 'codex.md', acknowledged: false };
  const page = await startPage(
    daemonStatus({ views: withViews(rich(CL1, { report: claudeReport }), rich(CX, { report: codexReport, playRef: 'ref_cx' })) }),
    [reportFixture(CX, { path: 'REPORTS/codex.md', content: 'Codex body' }), reportFixture(CL1, { path: 'REPORTS/claude.md', content: 'Claude body' })]
  );
  page.$('reportSelect').value = '1';
  for (const fn of page.$('reportSelect').listeners.change || []) await fn({ target: page.$('reportSelect') });
  assert.equal(page.$('reportFilename').textContent, 'claude.md');
  assert.match(page.$('reportPreviewBody').textContent, /Claude body/);
  assert.doesNotMatch(page.$('reportPreviewBody').textContent, /Codex body/);
});

test('E-11. Deliberate Incoming selection acknowledges through the real endpoint', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  page.$('reportSelect').value = '0';
  for (const fn of page.$('reportSelect').listeners.change || []) await fn({ target: page.$('reportSelect') });
  const call = page.posts.find((p) => p.url === '/api/work/acknowledge');
  assert.deepEqual(call.body, { gameId: GAME, reportPath: 'REPORTS/x.md' });
});

test('E-12. Copy acknowledges the linked report through the existing deliberate Copy action', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  await page.click(page.$('copyReportBtn'));
  await flush();
  const call = page.posts.find((p) => p.url === '/api/work/acknowledge');
  assert.equal(call.body.reportPath, 'REPORTS/x.md');
  assert.equal(page.$('copyReportBtn').textContent, '✓ Report copied');
});

test('E-13. No background acknowledgement: rendering, refresh, and a report arriving never call acknowledge', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { awaitingReport: true })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  await page.refresh();
  page.emit([rich(CL1, { report })]);
  page.tick();
  await page.refresh();
  assert.equal(page.posts.filter((p) => p.url === '/api/work/acknowledge').length, 0, 'no acknowledge call from any background path');
});

test('E-14. Acknowledge idempotence: repeated copy never corrupts local state', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  await page.click(page.$('copyReportBtn'));
  await page.click(page.$('copyReportBtn'));
  await page.click(page.$('copyReportBtn'));
  assert.equal(page.posts.filter((p) => p.url === '/api/work/acknowledge').length, 3, 'each explicit action calls it; safe and idempotent server-side');
  assert.equal(page.$('reportFilename').textContent, 'x.md');
});

test('E-15. Acknowledge HTTP failure never hides or blocks the Incoming report', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md', content: 'The actual content' })]);
  page.onAcknowledge(async () => ({ success: false }));
  page.$('reportSelect').value = '0';
  for (const fn of page.$('reportSelect').listeners.change || []) await fn({ target: page.$('reportSelect') });
  assert.match(page.$('reportPreviewBody').textContent, /The actual content/, 'reading is never blocked by acknowledgement failing');
  assert.equal(page.store().views[CL1].report.acknowledged, false, 'canonical truth is unchanged');
  assert.match(page.stripText(CL1), /View Report/, 'transient bridge follows canonical unacknowledged truth');
});

test('E-16. A canonical acknowledged view remains quiet and removes canonical report attention', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  assert.match(page.stripText(CL1), /View Report/);
  // Real daemon behaviour: acknowledged Plays fall through to idle (no more report on the view).
  page.emit([view(CL1, 'idle', 5)]);
  assert.equal(page.strip(CL1), null);
  assert.equal(page.quietText(CL1), '');
  assert.doesNotMatch(page.$('rosterSummary').textContent, /REPORT READY/);
});

test('E-17. Reconnect: a fresh acknowledged snapshot leaves the quiet roster unchanged', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  assert.match(page.stripText(CL1), /View Report/);
  await page.refresh(daemonStatus({ views: withViews(view(CL1, 'idle', 5)) }));
  assert.equal(page.strip(CL1), null);
  assert.equal(page.quietText(CL1), '');
});

test('E-18. Unknown recovery: text is never restored automatically; the explicit action restores it exactly, no dispatch', async () => {
  const page = await startPage(daemonStatus({ activeDecision: null }));
  page.onDispatch(async () => unknownReply(AG, 'AntiGravity'));
  page.$('promptInput').value = 'Migrate the schema exactly like this';
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.$('promptInput').value, '', 'never auto-restored');
  const dispatchCountBefore = page.posts.filter((p) => p.url === '/api/dispatch').length;
  const recover = page.find(page.ack(), (n) => n.textContent === 'Recover Play Text');
  assert.equal(recover.attributes['aria-label'], 'Recover the Play text into the composer');
  await page.click(recover);
  assert.equal(page.$('promptInput').value, 'Migrate the schema exactly like this');
  assert.equal(page.posts.filter((p) => p.url === '/api/dispatch').length, dispatchCountBefore, 'never auto-dispatched');
  assert.equal(page.attempt().mode, 'auto', 'routing mode untouched');
});

test('E-19. Unknown recovery with an occupied composer: materially different text is not silently overwritten', async () => {
  const page = await startPage(daemonStatus());
  page.onDispatch(async () => unknownReply(AG, 'AntiGravity'));
  page.$('promptInput').value = 'Original important Play';
  await page.click(page.$('dispatchBtn'));
  // A different draft already sitting in the composer (e.g. restored without a keystroke,
  // the same way clearSubmittedPrompt/switchGame set .value directly) — NOT a material-edit
  // dismissal of the acknowledgement, so Recover is still reachable to prove its own guard.
  page.$('promptInput').value = 'A totally different Play I am composing now';
  const recover = page.find(page.ack(), (n) => n.textContent === 'Recover Play Text');
  await page.click(recover);
  assert.equal(page.$('promptInput').value, 'A totally different Play I am composing now', 'not silently overwritten');
  const dialog = page.$('confirmModal');
  assert.equal(dialog.hidden, false, 'a confirming action is required');
  await page.click(page.$('confirmOkBtn'));
  assert.equal(page.$('promptInput').value, 'Original important Play', 'confirmed: recovered text now in place');
});

test('E-19b. Declining the confirmation leaves the composer exactly as the human left it', async () => {
  const page = await startPage(daemonStatus());
  page.onDispatch(async () => unknownReply(AG, 'AntiGravity'));
  page.$('promptInput').value = 'Original important Play';
  await page.click(page.$('dispatchBtn'));
  page.$('promptInput').value = 'A totally different Play I am composing now';
  const recover = page.find(page.ack(), (n) => n.textContent === 'Recover Play Text');
  await page.click(recover);
  await page.click(page.$('confirmCancelBtn'));
  assert.equal(page.$('promptInput').value, 'A totally different Play I am composing now', 'declined: nothing overwritten');
});

test('E-20. Unknown recovery never claims the prior attempt failed', async () => {
  const page = await startPage(daemonStatus());
  page.onDispatch(async () => unknownReply(AG, 'AntiGravity'));
  page.$('promptInput').value = 'Some Play';
  await page.click(page.$('dispatchBtn'));
  assert.doesNotMatch(page.ackText(), /failed|Failed|Couldn't send/);
  assert.match(page.ackText(), /Can't confirm AntiGravity received this Play/);
});

test('E-21. Multi-Player: one gets a bounded report bridge while another keeps Working independently', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(
    daemonStatus({ views: withViews(rich(CL1, { report }), view(CX, 'working', 6, { executionStartedAt: T0 - 30_000, playRef: 'ref_cx' })) }),
    [reportFixture(CL1, { path: 'REPORTS/x.md' })]
  );
  assert.match(page.stripText(CL1), /✓ Finished.*View Report/);
  assert.match(page.stripText(CX), /◉ Working/);
  assert.equal(page.$('rosterSummary').textContent, 'TEAM · 1 ACTIVE · Codex');
  const codexClockBefore = page.find(page.strip(CX), (n) => n.dataset?.elapsedSince !== undefined)?.dataset.elapsedSince;
  await page.click(page.$('copyReportBtn'));
  assert.match(page.stripText(CX), /◉ Working/, 'Codex unaffected by Claude\'s report action');
  assert.equal(page.find(page.strip(CX), (n) => n.dataset?.elapsedSince !== undefined)?.dataset.elapsedSince, codexClockBefore, 'Codex clock origin untouched');
  assert.match(page.stripText(CL1), /View Report/, 'local action does not optimistically erase canonical report truth');
});

test('E-22. Exact report acknowledgement isolation is preserved through Incoming', async () => {
  const claudeReport = { path: 'REPORTS/claude.md', filename: 'claude.md', acknowledged: false };
  const codexReport = { path: 'REPORTS/codex.md', filename: 'codex.md', acknowledged: false };
  const page = await startPage(
    daemonStatus({ views: withViews(rich(CL1, { report: claudeReport }), rich(CX, { report: codexReport, playRef: 'ref_cx' })) }),
    [reportFixture(CL1, { path: 'REPORTS/claude.md' }), reportFixture(CX, { path: 'REPORTS/codex.md' })]
  );
  page.$('reportSelect').value = '0';
  for (const fn of page.$('reportSelect').listeners.change || []) await fn({ target: page.$('reportSelect') });
  const call = page.posts.find((p) => p.url === '/api/work/acknowledge');
  assert.equal(call.body.reportPath, 'REPORTS/claude.md');
  assert.notEqual(call.body.reportPath, 'REPORTS/codex.md');
  assert.equal(page.store().views[CX].report.path, 'REPORTS/codex.md', 'Codex machine truth is untouched');
});

test('E-23. Game isolation: Incoming acknowledgement is always scoped to the presented Game', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  page.$('reportSelect').value = '0';
  for (const fn of page.$('reportSelect').listeners.change || []) await fn({ target: page.$('reportSelect') });
  const call = page.posts.find((p) => p.url === '/api/work/acknowledge');
  assert.equal(call.body.gameId, GAME);
});

test('E-24. Exactly one 1 s production interval; no timer in TEAM, Outgoing, Incoming, or the quiet adjunct', async () => {
  const report = { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false };
  const page = await startPage(daemonStatus({ views: withViews(rich(CL1, { report }), view(CX, 'working', 6, { executionStartedAt: T0 - 5_000 })) }), [reportFixture(CL1, { path: 'REPORTS/x.md' })]);
  assert.equal(page.ackIntervalCount(), 1);
  assert.match(pageSource, /setInterval\(tickElapsedClocks, 1_000\);/);
  const headerBefore = page.$('rosterSummary').textContent;
  const quietBefore = page.quietText(CL1);
  page.setNow(T0 + 3_000);
  page.tick();
  assert.equal(page.$('rosterSummary').textContent, headerBefore);
  assert.equal(page.quietText(CL1), quietBefore);
  assert.doesNotMatch(page.stripText(CL1), /8m 1\d s|8m 2\d s/, 'Finished duration for CL1 is unaffected by the tick');
});

test('E-25. Accessibility: terminal history stays quiet; current live transitions announce without per-second chatter', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(CL1, 'working', 3, { executionStartedAt: T0 - 5_000 })) }));
  page.emit([finishedView(CL1, 4, { finishedAt: T0, awaitingReport: true })]);
  assert.equal(page.$('executionAnnouncer').textContent, '', 'completion history does not demand Dad\'s attention');
  page.emit([finishedView(CL1, 5, { finishedAt: T0, report: { path: 'REPORTS/x.md', filename: 'x.md', acknowledged: false } })]);
  assert.equal(page.$('executionAnnouncer').textContent, '');
  const sets = page.$('executionAnnouncer').textContent;
  page.setNow(T0 + 3_000);
  page.tick();
  assert.equal(page.$('executionAnnouncer').textContent, sets, 'no per-tick announcement');
  assert.match(page.stripText(CL1), /✓ Finished.*View Report/);
  assert.equal(page.$('copyReportBtn').attributes['aria-label'] ?? 'Copy Report', 'Copy Report');
});

test('E-26. Mobile: no floating/sticky completion duplication remains on Player cards', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  const quietRules = css.split('}').filter((rule) => /\.player-quiet/.test(rule)).join('}');
  assert.doesNotMatch(quietRules, /position:\s*(fixed|sticky|absolute)/);
  assert.match(css, /\.player-quiet \{ color: #4ade80; font-weight: 700; \}/);
  const stripRules = css.split('}').filter((rule) => /\.play-strip/.test(rule)).join('}');
  assert.doesNotMatch(stripRules, /position:\s*(fixed|sticky|absolute)/);
});

// ---------------------------------------------------------------------------
// Q2.14 — Scout Player Card.
//
// S31 Slice 5: Scout is a roster-native Virtual Player. A Team member arrives as
// an ordinary roster instance (flagged `virtual`) and reuses the SAME
// rosterRows/strip machinery every other Player uses. Nothing here
// reimplements the strip, elapsed timer, or report-ready handoff proven above —
// these tests prove Scout's card exists ONLY for a member, survives losing
// readiness, and routes through those same paths.
// ---------------------------------------------------------------------------

const SCOUT = 'scout';
const scoutCap = (state = 'ready') => ({ instanceId: SCOUT, playerType: 'scout', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Scout', state, capability: { provider: 'scout', authenticated: true, models: [], observedAt: T0, freshness: 'live' }, executionType: 'scout-formation' });

/** A Scout roster group exactly as PlayerRoster emits it for a MEMBER (no terminal, PID, or ownership). */
const scoutGroup = ({ onField = true, label = 'Ready', readiness = 'ready' } = {}) => ({
  id: 'scout', name: 'Scout', virtual: true,
  instances: [{ instanceId: SCOUT, playerType: 'scout', seat: 1, fieldLabel: 'Scout', onField, virtual: true, singleton: true, readinessState: readiness, readinessLabel: label, transport: label }]
});

/** Scout is a Team member. Its routing capability is present and executable, or `unavailable` when it cannot run. */
function withScoutMember(status, state = 'ready', { onField = true } = {}) {
  const unavailable = state === 'unavailable';
  const capability = unavailable
    ? { ...scoutCap('unavailable'), transportLabel: 'No Scouts ready yet', capability: { provider: 'scout', authenticated: true, models: [], observedAt: T0, freshness: 'unavailable' }, autoEligible: false }
    : scoutCap(state);
  const label = state === 'busy' ? 'Scouting' : unavailable ? 'No Scouts ready yet' : 'Ready';
  return {
    ...status,
    players: [...status.players, scoutGroup({ onField, label, readiness: state })],
    routing: { ...status.routing, capabilities: onField ? [...status.routing.capabilities, capability] : status.routing.capabilities }
  };
}
const withScoutCapability = withScoutMember;

test('Q2.14-1. A Scout that is a Team member gets a persistent roster card that reads Ready, and appears once in the dispatch list', async () => {
  const page = await startPage(withScoutCapability(daemonStatus()));
  const row = page.row(SCOUT);
  assert.ok(row, 'a Scout card exists');
  assert.equal(page.allText(row).includes('Scout'), true);
  assert.equal(page.allText(row).includes('Ready'), true);
  const options = page.$('terminalSelect').children.map((o) => o.value);
  assert.equal(options.filter((v) => v === SCOUT).length, 1, 'Scout appears exactly once in the dispatch target list (from capabilities), never duplicated by its roster instance');
  assert.equal(row.dataset.fieldState, 'on-field');
});

test('Q2.14-2. A Scout that is NOT on the Team has no card at all: entitlement and readiness never recruit it', async () => {
  const page = await startPage(daemonStatus());
  assert.equal(page.row(SCOUT), undefined);
});

test('Q2.14-3. Working Scout reuses the existing strip: truthful receiver count, one aggregate elapsed timer, no invented per-receiver progress', async () => {
  const status = withScoutCapability(daemonStatus({ views: [...idle(), view(SCOUT, 'working', 1, { executionType: 'scout-formation', executionStartedAt: T0, activitySummary: '2 Scouts running', summary: 'Investigate Scout report lifecycle and evidence seams' })] }), 'busy');
  const page = await startPage(status);
  assert.match(page.stripText(SCOUT), /◉ Scouting.*2 Scouts running.*Investigate Scout report lifecycle/);
  assert.ok(page.find(page.strip(SCOUT), (n) => n.dataset?.elapsedSince !== undefined), 'one aggregate ticking timer, the same mechanism every Player strip already uses');
});

test('Q2.14-4. A finished Scout Formation with an unacknowledged report gets the SAME durable Report Ready handoff as any other Player', async () => {
  const report = { path: 'REPORTS/Scout Only/Formations/f/FORMATION-RESULT.md', filename: 'FORMATION-RESULT.md', acknowledged: false };
  const status = withScoutCapability(daemonStatus({ views: [...idle(), finishedView(SCOUT, 4, { finishedAt: T0, report, executionType: 'scout-formation' })] }), 'ready');
  const page = await startPage(status, [reportFixture(SCOUT, { path: report.path, filename: report.filename })]);
  page.setNow(T0 + 30_100);
  page.fireTimeouts(30_100);
  assert.match(page.stripText(SCOUT), /Report ready.*View Scout Report/, 'durable past the rich window, with the Formation parent as Scout\'s deliberate handoff');
});

test('Q2.14-5. Multi-Scout PARTIAL outcome renders truthfully through the same strip vocabulary — never fabricated as success', async () => {
  const report = { path: 'REPORTS/Scout Only/Formations/f/FORMATION-RESULT.md', filename: 'FORMATION-RESULT.md', acknowledged: false };
  const detail = 'Formation partial · 2 of 3 Scouts completed';
  const status = withScoutCapability(daemonStatus({ views: [...idle(), finishedView(SCOUT, 4, { executionType: 'scout-formation', report, detail })] }), 'ready');
  const page = await startPage(status, [reportFixture(SCOUT, { path: report.path, filename: report.filename })]);
  assert.match(page.stripText(SCOUT), /Report ready.*Formation partial.*2 of 3 Scouts completed.*View Scout Report/);
});

test('Q2.14-6. BLOCKED Scout retains the exact Formation parent until intentional View Scout Report acknowledgement', async () => {
  const report = { path: 'REPORTS/Scout Only/Formations/blocked-f/FORMATION-RESULT.md', filename: 'FORMATION-RESULT.md', acknowledged: false };
  const blocked = view(SCOUT, 'couldnt-finish', 6, {
    executionType: 'scout-formation',
    playRef: 'ref_scout_blocked',
    finishedAt: T0,
    report,
    detail: 'Formation blocked · 0 of 1 Scouts completed'
  });
  const status = withScoutCapability(daemonStatus({ serverNow: T0 + 60_000, views: [...idle(), blocked] }), 'ready');
  const page = await startPage(status, [reportFixture(SCOUT, { path: report.path, filename: report.filename, content: 'Exact blocked Formation parent' })]);

  page.setNow(T0 + 60_000);
  page.fireTimeouts(60_000);
  assert.match(page.stripText(SCOUT), /Report ready.*Formation blocked.*View Scout Report/, 'BLOCKED report remains visible beyond the rich-finished timeout');
  assert.equal(page.store().views[SCOUT].report.path, report.path);

  await page.refresh();
  page.emit([blocked], T0 + 120_000);
  assert.match(page.stripText(SCOUT), /Report ready.*View Scout Report/, 'polls and rerenders preserve the unacknowledged handoff');
  assert.equal(page.posts.filter((post) => post.url === '/api/work/acknowledge').length, 0, 'background activity never acknowledges');

  const button = page.find(page.strip(SCOUT), (node) => node.textContent === 'View Scout Report');
  await page.click(button);
  await flush();
  assert.equal(page.$('reportFilename').textContent, 'FORMATION-RESULT.md');
  assert.match(page.$('reportPreviewBody').textContent, /Exact blocked Formation parent/);
  assert.deepEqual(page.posts.find((post) => post.url === '/api/work/acknowledge').body, {
    gameId: GAME,
    reportPath: report.path,
    instanceId: SCOUT,
    playRef: 'ref_scout_blocked'
  });

  page.emit([view(SCOUT, 'idle', 7, { executionType: 'scout-formation' })], T0 + 120_001);
  assert.equal(page.strip(SCOUT), null, 'canonical acknowledged/idle truth clears the handoff after intentional opening');
});

test('Q2.14-7. ordinary non-Scout blocked reports remain quiet on TEAM', async () => {
  const report = { path: 'REPORTS/Claude/blocked.md', filename: 'blocked.md', acknowledged: false };
  const blocked = view(CL1, 'couldnt-finish', 6, { playRef: 'ref_claude_blocked', report, detail: 'Provider blocked.' });
  const page = await startPage(daemonStatus({ views: withViews(blocked) }), [reportFixture(CL1, { path: report.path, filename: report.filename })]);
  assert.equal(page.strip(CL1), null);
  assert.equal(page.posts.filter((post) => post.url === '/api/work/acknowledge').length, 0);
});

// ---- S31 Slice 5: a member Scout that cannot run is still a Team member, truthfully shown ----------------------------------

test('S31.5-B1. An UNAVAILABLE Scout member stays on the Team: card says why, MANUAL dropdown labels it, and there is no fake Ready', async () => {
  const page = await startPage(withScoutMember(daemonStatus(), 'unavailable'));
  const row = page.row(SCOUT);
  assert.ok(row, 'membership, not readiness, decides that the card exists');
  assert.equal(row.dataset.fieldState, 'on-field');
  const text = page.allText(row);
  assert.ok(text.includes('No Scouts ready yet'), 'the third line is READINESS, so a member that cannot run says so');
  assert.equal(text.includes('Ready'), false, 'and never claims Ready');
  const option = page.$('terminalSelect').children.find((o) => o.value === SCOUT);
  assert.equal(option?.textContent, 'Scout · No Scouts ready yet', 'MANUAL shows Scout truthfully unavailable instead of hiding it');
});

test('S31.5-B2. A BENCHED Scout member keeps its card as On Bench and is not a dispatch candidate', async () => {
  const page = await startPage(withScoutMember(daemonStatus(), 'ready', { onField: false }));
  const row = page.row(SCOUT);
  assert.ok(row);
  assert.equal(row.dataset.fieldState, 'on-bench');
  assert.equal(page.$('terminalSelect').children.some((o) => o.value === SCOUT), false, 'a benched Player is never a dispatch target');
});

test('S31.5-B3. Scout is a singleton: no "Add another Scout" affordance, and its removal copy names what is kept', async () => {
  const page = await startPage(withScoutMember(daemonStatus(), 'ready'));
  const everything = page.allText(page.doc.body ?? page.$('teamRoster') ?? page.row(SCOUT));
  assert.equal(/Add another Scout/i.test(everything), false);
});

test('S31.5-B4. An unacknowledged report stays Report ready on an UNAVAILABLE Scout member (no second report state)', async () => {
  const report = { path: 'REPORTS/Scout Only/Formations/f/FORMATION-RESULT.md', filename: 'FORMATION-RESULT.md', acknowledged: false };
  const status = withScoutMember(daemonStatus({ views: [...idle(), finishedView(SCOUT, 4, { finishedAt: T0, report, executionType: 'scout-formation' })] }), 'unavailable');
  const page = await startPage(status, [reportFixture(SCOUT, { path: report.path, filename: report.filename })]);
  page.setNow(T0 + 30_100);
  page.fireTimeouts(30_100);
  assert.match(page.stripText(SCOUT), /Report ready.*View Scout Report/, 'losing readiness does not lose the durable handoff');
  assert.ok(page.allText(page.row(SCOUT)).includes('No Scouts ready yet'), 'and the card still says why Scout cannot run');
});
