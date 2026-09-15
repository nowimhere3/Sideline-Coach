// Coach Routines V0.2 — Human Field Reconciliation and Dad-Mode Consolidation.
//
// Covers behaviors not already exercised by the updated Slice D/E, Human Field Polish,
// or V0.1 suites: report-preview positioning past the Assistant Coach brief, the
// repository field's local Saving/Saved/error feedback, the single "Dev Mode" label,
// intentional zero-state spacing, and Queue's contextual (not permanent) visibility.
// The real src/public/index.html script runs against a mocked-but-contract-shaped
// backend, the same pattern used throughout this test suite.
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
  project: 'Trend', content: '# COMMIT AND PUSH REPORT\n\nExact canonical report body.\nLine two.', ...overrides
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
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false, open: false,
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
  let onRepository = async (body) => ({ success: true, gameId: body.gameId, repositoryUrl: body.repositoryUrl || undefined, projection: {} });
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
      if (url === '/api/routines/repository') { const r = await onRepository(body); return reply(r.success === false ? 400 : 200, r); }
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { clipboardWrites.push(text); } } },
    window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, allText, find, posts, clipboardWrites,
    setStatus: (next) => { status = next; },
    onDelivered: (fn) => { onDelivered = fn; },
    onRepository: (fn) => { onRepository = fn; },
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
    change: async (node) => { for (const fn of node.listeners.change || []) await fn({ target: node }); await flush(); },
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
// Report preview positioning
// ---------------------------------------------------------------------------

test('V02-1. With an Assistant Coach brief, the initial preview viewport shows only the canonical Player report — zero envelope lines visible', async () => {
  const page = await startPage(daemonStatus());
  // The brief is present in the DOM (fully inspectable), but collapsed.
  assert.equal(page.$('reportPreviewBrief').hidden, true);
  assert.equal(page.$('reportPreviewBrief').textContent, HANDOFF_TEXT, 'the full payload stays inspectable in the same viewer');
  assert.equal(page.$('reportPreviewBody').textContent, '# COMMIT AND PUSH REPORT\n\nExact canonical report body.\nLine two.', 'the first visible content is the Player report itself');
  assert.doesNotMatch(page.$('reportPreviewBody').textContent, /SIDELINE COACH ROUTINE|REPORT FOLLOWS/);
});

test('V02-2. "View brief" reveals the wrapper without creating a second, mutated copy of the report', async () => {
  const page = await startPage(daemonStatus());
  await page.click(page.$('viewBriefBtn'));
  assert.equal(page.$('reportPreviewBrief').hidden, false);
  assert.equal(page.$('reportPreviewDetails').open, true);
  assert.equal(page.$('reportPreviewBody').textContent, '# COMMIT AND PUSH REPORT\n\nExact canonical report body.\nLine two.', 'the report node itself is untouched');
});

test('V02-3. Without a due Assistant Coach brief, ordinary preview behavior is unchanged', async () => {
  const page = await startPage(daemonStatus({ devMode: true, routines: routinesProjection({ devMode: true, routines: [defaultRoutineView({ due: false })], withHandoff: false }) }));
  assert.equal(page.$('coachBriefDisclosure').hidden, true);
  assert.equal(page.$('reportPreviewBrief').textContent, '');
  assert.equal(page.$('reportPreviewBody').textContent, '# COMMIT AND PUSH REPORT\n\nExact canonical report body.\nLine two.');
});

// ---------------------------------------------------------------------------
// Repository field: local save feedback
// ---------------------------------------------------------------------------

test('V02-4. Repository URL: local Saving… / Saved ✓ / failure feedback lives beside the field itself', async () => {
  const page = await startPage(daemonStatus({ routines: routinesProjection({ withHandoff: false, routines: [] }) }));
  const saveText = () => page.$('coachRepoUrlSaveText');
  assert.equal(saveText().hidden, true, 'nothing presumed before any save');

  let resolveSave;
  page.onRepository(() => new Promise((resolve) => { resolveSave = resolve; }));
  const input = page.$('coachRepoUrlInput');
  input.value = 'https://github.com/example/trend';
  const changing = page.change(input);
  await flush();
  assert.equal(saveText().hidden, false);
  assert.match(saveText().textContent, /Saving…/);
  resolveSave({ ok: true, status: 200, json: async () => ({ success: true, gameId: GAME, repositoryUrl: input.value, projection: {} }) });
  await changing;
  assert.match(saveText().textContent, /Saved ✓/);
});

test('V02-5. Repository URL: a failed save shows a local, truthful failure beside the field', async () => {
  const page = await startPage(daemonStatus({ routines: routinesProjection({ withHandoff: false, routines: [] }) }));
  page.onRepository(async () => ({ success: false, message: 'Enter a repository URL starting with https://' }));
  const input = page.$('coachRepoUrlInput');
  input.value = 'not a url';
  await page.change(input);
  const saveText = page.$('coachRepoUrlSaveText');
  assert.equal(saveText.hidden, false);
  assert.match(saveText.textContent, /Couldn't save/);
});

// ---------------------------------------------------------------------------
// Dev Mode: single label
// ---------------------------------------------------------------------------

test('V02-6. "Dev Mode" appears as a heading exactly once, not repeated as a second row label', async () => {
  const occurrences = (pageSource.match(/>Dev Mode</g) || []).length;
  assert.equal(occurrences, 1, 'Dev Mode is the card heading; the toggle carries only an aria-label, not a second visible "Dev Mode" text node');
  assert.match(pageSource, /id="devModeToggle"[^>]*aria-label="Dev Mode"/);
});

// ---------------------------------------------------------------------------
// Zero-state spacing
// ---------------------------------------------------------------------------

test('V02-7. Zero-state layering: the repository section and the routine list/empty-state read as distinct layers, not wedged together', async () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /\.coach-repo-section \{[^}]*margin-bottom:\s*\d/);
  assert.match(pageSource, /class="routine-section coach-repo-section"/);
  // The empty-state <p> is built via document.createElement, not static markup.
  assert.match(pageSource, /empty\.className = 'tiny muted coach-routines-empty'/);
});

// ---------------------------------------------------------------------------
// Queue visibility: contextual, not permanent chrome
// ---------------------------------------------------------------------------

test('V02-8. Queue for <Player> is contextual: hidden with an empty prompt, hidden when the target is idle, visible only when a real prompt targets a genuinely busy exact Controlled Player', async () => {
  const AG = 'antigravity-aaaa1111';
  const agySnap = { provider: 'agy', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'gemini-pro', models: [{ id: 'gemini-pro', displayName: 'Gemini Pro', isDefault: true, supportedEfforts: [] }] };
  const cap = (state) => ({ instanceId: AG, playerType: 'antigravity', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'AntiGravity', state, capability: agySnap });
  const view = (state, revision) => ({ instanceId: AG, state, revision, executionType: 'reasoning' });

  const dispatcherStatus = ({ execState = 'busy' } = {}) => ({
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Trend', fingerprintSource: 'git-remote' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [{ id: 'antigravity', name: 'AntiGravity', availability: 'available', fieldState: 'on-field', instances: [{ instanceId: AG, playerType: 'antigravity', seat: 1, fieldLabel: 'AntiGravity · Controlled', onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' }] }],
    capabilities: [cap(execState === 'busy' ? 'busy' : 'ready')], queue: [],
    routing: { mode: 'manual', capabilities: [cap(execState === 'busy' ? 'busy' : 'ready')], activeDecision: null },
    routingMode: 'manual', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode: false },
    routines: { gameId: GAME, devMode: false, playCount: 0, routines: [] },
    execution: { gameId: GAME, epoch: 'E1', serverNow: T0, byInstance: { [AG]: view(execState, 5) } },
    at: T0
  });

  const dispatcherPage = createPage(dispatcherStatus());
  const page = await dispatcherPage.start();
  await page.click(page.$('modeManualBtn'));
  page.$('terminalSelect').value = AG;
  for (const fn of page.$('terminalSelect').listeners.change || []) fn({ target: { value: AG } });
  await flush();

  assert.equal(page.$('queuePlayBtn').hidden, true, 'busy target but empty prompt: no Queue action');

  page.$('promptInput').value = 'Implement the next step';
  for (const fn of page.$('promptInput').listeners.input || []) fn();
  await flush();
  assert.equal(page.$('queuePlayBtn').hidden, false, 'a real prompt targets a genuinely busy exact Controlled Player');
  assert.match(page.$('queuePlayBtn').textContent, /Queue for/);

  page.$('promptInput').value = '';
  for (const fn of page.$('promptInput').listeners.input || []) fn();
  await flush();
  assert.equal(page.$('queuePlayBtn').hidden, true, 'clearing the prompt (e.g. right after dispatch) hides Queue again');

  // Idle target: never a redundant primary action, even with a prompt.
  page.setStatus(dispatcherStatus({ execState: 'idle' }));
  await page.refresh();
  page.$('promptInput').value = 'Implement the next step';
  for (const fn of page.$('promptInput').listeners.input || []) fn();
  await flush();
  assert.equal(page.$('queuePlayBtn').hidden, true, 'an idle target never shows Queue as a redundant primary action');
});
