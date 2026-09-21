// Terminal Evidence Retention Core (S53 Play 2 / S54.3) - browser-side only.
//
// Runs the real src/public/index.html script in the same vm + DOM-stub style as
// live-player-console-first-down.test.mjs, with a controllable server clock and a real
// (Map-backed) sessionStorage. Truth enters through daemon-shaped status snapshots; the
// browser-owned evidence record must keep completed Terminal evidence inspectable after the
// server ExecutionView decays, without touching execution truth, output transport or reports.
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

const GAME = 'game_evidence';
const T1 = 'shell-tttt1111'; // Terminal Player 1
const T2 = 'shell-tttt2222'; // Terminal Player 2
const AI = 'claude-cccc1111'; // non-Terminal Player
const ORDER = [T1, T2, AI];
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
      if (url === '/api/preferences' && options.method === 'POST') { posts.push(body); return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' }); }
      return reply(200, {});
    },
    // Long (evidence-length) timers are captured so tests can fire them deterministically.
    setTimeout: (fn, ms, ...rest) => {
      if (ms >= 60_000) { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; }
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

// ---------------------------------------------------------------------------
// 1-3. Fast success / failure / unknown stay inspectable
// ---------------------------------------------------------------------------

test('TER-1. Fast success: card survives the 30 s rich window and the server view decaying to idle; goes quiet at T', async () => {
  const page = await start(world([done(T1, 'play_1', { finishedAt: T0 - 1_000 })]));
  assert.equal(page.strip(T1).dataset.terminalEvidence, 'completed', 'first sighting creates evidence');
  assert.match(page.stripText(T1), /Finished/);
  assert.match(page.stripText(T1), /git status/);
  assert.match(page.stripText(T1), /Completed · exit code 0/);

  // Server projection decays (report-less REPORT_GRACE_MS) to idle; the rich window is long gone.
  await page.refresh(world([]), T0 + 3 * 60_000);
  assert.ok(page.strip(T1), 'still inspectable with no server ExecutionView state');
  assert.equal(page.strip(T1).dataset.state, 'finished');
  assert.ok(page.button(T1, 'console-toggle'), 'Expand is still offered');

  await page.refresh(null, T0 - 1_000 + FIVE_MIN - 1);
  await page.tick();
  assert.ok(page.strip(T1), 'present at T-1');
  await page.refresh(null, T0 - 1_000 + FIVE_MIN + 1);
  await page.tick();
  assert.equal(page.strip(T1), null, 'quiet at T+1 - the bounded, provisional success timer');
});

test('TER-2. Fast failure: card stays at any elapsed time, whether or not the server keeps projecting couldnt-finish', async () => {
  const page = await start(world([failed(T1, 'play_f', { command: 'git status --nonsense' })]));
  assert.equal(page.strip(T1).dataset.terminalEvidence, 'failed');
  assert.match(page.stripText(T1), /Command failed/);
  assert.match(page.stripText(T1), /Failed · exit code 128/);
  assert.equal(page.strip(T1).dataset.state, 'couldnt-finish');

  await page.refresh(world([]), T0 + 6 * 3_600_000); // server view long gone
  assert.match(page.stripText(T1), /Command failed/, 'no timer for failures');
  await page.refresh(world([failed(T1, 'play_f', { command: 'git status --nonsense' })]), T0 + 12 * 3_600_000);
  assert.match(page.stripText(T1), /Command failed/, 'still there while the server keeps the failed view');
});

test('TER-3. Unknown outcome: "Ended — result unknown" stays with no timer', async () => {
  const page = await start(world([unknown(T1, 'play_u')]));
  assert.equal(page.strip(T1).dataset.terminalEvidence, 'unknown');
  assert.match(page.stripText(T1), /Ended — result unknown/);
  await page.refresh(world([]), T0 + 3_600_000);
  assert.match(page.stripText(T1), /Ended — result unknown/);
});

test('TER-4. not-sent / never-ran refusals create no evidence', async () => {
  const notSent = view(T1, 'couldnt-finish', { playRef: 'play_n', executionType: 'direct-shell', summary: 'rm -rf x', detail: 'Coach refused to send that command' });
  const page = await start(world([notSent]));
  assert.equal(page.strip(T1), null, 'no strip: no duration, so nothing ran');
  assert.equal(page.storage.getItem(STORAGE_KEY), null, 'nothing stored');
});

// ---------------------------------------------------------------------------
// 4-5. Copy is not dismissal
// ---------------------------------------------------------------------------

test('TER-5. Copy All never dismisses completed Terminal evidence (also after the server view decays)', async () => {
  const page = await start(world([runningShell(T1, 'play_1')]));
  await page.click(page.button(T1, 'console-toggle'));
  page.emitEvent('activity', act(T1, 1, 'output', 'On branch main'));
  await page.refresh(world([done(T1, 'play_1', { finishedAt: T0 })]), T0 + 5_000);
  assert.ok(page.shell(T1), 'expanded while finished');

  await page.click(page.button(T1, 'console-copy-all'));
  assert.equal(page.clipboard.writes.length, 1, 'text was copied');
  assert.match(page.clipboard.writes[0], /On branch main/);
  assert.ok(page.shell(T1), 'console still open after Copy All');
  assert.ok(page.strip(T1), 'card still mounted');

  await page.refresh(world([]), T0 + 90_000); // server view decays
  await page.click(page.button(T1, 'console-copy-all'));
  assert.equal(page.clipboard.writes.length, 2);
  assert.ok(page.shell(T1) && page.strip(T1), 'still open after decay + Copy All');
  assert.equal(page.acks().length, 0, 'Copy never acknowledges anything');
});

test('TER-6. Copy New advances only the cursor and never dismisses; a failure card survives Copy too', async () => {
  const page = await start(world([failed(T1, 'play_f')]));
  await page.click(page.button(T1, 'console-toggle'));
  page.emitEvent('activity', act(T1, 1, 'output', 'fatal: bad object'));
  const copyNew = page.button(T1, 'console-copy-new');
  await page.click(copyNew);
  assert.equal(page.clipboard.writes.length, 1);
  assert.match(page.clipboard.writes[0], /fatal: bad object/);
  assert.ok(page.shell(T1) && page.strip(T1), 'open after Copy New');
  assert.equal(page.button(T1, 'console-copy-new').disabled, true, 'cursor advanced: nothing new');
  page.emitEvent('activity', act(T1, 2, 'output', 'more'));
  await page.click(page.button(T1, 'console-copy-new'));
  assert.equal(page.clipboard.writes.length, 2);
  assert.doesNotMatch(page.clipboard.writes[1], /fatal: bad object/, 'only the new line');
  assert.match(page.stripText(T1), /Command failed/);
});

// ---------------------------------------------------------------------------
// 6. Collapse / Dismiss release as designed; Read/Expand is not dismissal
// ---------------------------------------------------------------------------

test('TER-7. Expand is not dismissal: a human-open success is never timed out from under the reader; Collapse then releases it', async () => {
  const page = await start(world([done(T1, 'play_1', { finishedAt: T0 })]));
  await page.click(page.button(T1, 'console-toggle')); // Expand
  assert.ok(page.shell(T1));
  await page.refresh(world([]), T0 + FIVE_MIN + 60_000);
  assert.ok(page.shell(T1), 'past T but the human is reading');
  await page.click(page.button(T1, 'console-toggle')); // Collapse
  assert.equal(page.shell(T1), null);
  assert.equal(page.strip(T1), null, 'timer already elapsed: goes quiet on Collapse');
});

test('TER-8. Collapse keeps a failure as a compact strip; Dismiss releases it for good (per Play)', async () => {
  const failedView = failed(T1, 'play_f');
  const page = await start(world([failedView]));
  await page.click(page.button(T1, 'console-toggle'));
  await page.click(page.button(T1, 'console-toggle')); // Collapse
  assert.equal(page.shell(T1), null);
  assert.match(page.stripText(T1), /Command failed/, 'failure evidence stays as a compact strip');

  await page.click(page.button(T1, 'evidence-dismiss'));
  assert.equal(page.strip(T1), null, 'Dismiss releases it');
  await page.refresh(world([failedView]), T0 + 10_000); // server still projects the same failed Play
  assert.equal(page.strip(T1), null, 'not resurrected by the same Play');
  assert.equal(page.acks().length, 0, 'Dismiss is browser-only; it is not a report acknowledgement');
  assert.ok(JSON.parse(page.storage.getItem(STORAGE_KEY)).records[0].dismissed, 'dismissal persisted');
});

test('TER-9. Dismiss is available in the expanded console header too, and outcome text is in that header', async () => {
  const page = await start(world([failed(T1, 'play_f')]));
  await page.click(page.button(T1, 'console-toggle'));
  const header = page.find(page.shell(T1), (n) => n.className === 'play-console-header');
  assert.match(page.allText(header), /Failed · exit code 128/, 'outcome visible even where the fullscreen phone console hides the strip');
  await page.click(page.find(header, (n) => n.dataset.focusKey === 'evidence-dismiss'));
  assert.equal(page.strip(T1), null);
  assert.equal(page.shell(T1), null);
});

// ---------------------------------------------------------------------------
// 7. Next Play
// ---------------------------------------------------------------------------

test('TER-10. Next Play supersedes old evidence; human-open state carries over; a queued Play does not erase it', async () => {
  const page = await start(world([failed(T1, 'play_1', { command: 'old command' })]));
  await page.click(page.button(T1, 'console-toggle'));
  await page.refresh(world([view(T1, 'queued', { playRef: 'play_2', executionType: 'direct-shell', summary: 'next' })]), T0 + 1_000);
  assert.match(page.stripText(T1), /Queued/, 'a queued Play shows its own live strip instead of the card');
  assert.equal(JSON.parse(page.storage.getItem(STORAGE_KEY)).records[0].playRef, 'play_1', 'but the evidence record is not superseded until the next Play actually runs');
  await page.refresh(world([]), T0 + 1_500); // the queued Play was cancelled
  assert.match(page.stripText(T1), /old command/, 'evidence returns when nothing else is live');
  await page.refresh(world([view(T1, 'queued', { playRef: 'play_2', executionType: 'direct-shell', summary: 'next' })]), T0 + 1_800);

  await page.refresh(world([runningShell(T1, 'play_2', 'new command')]), T0 + 2_000);
  assert.equal(page.strip(T1).dataset.terminalEvidence, undefined, 'live Play owns the strip');
  assert.match(page.stripText(T1), /Running command/);
  assert.ok(page.shell(T1), 'human-open console carries over (LPT-29)');
  assert.doesNotMatch(page.stripText(T1), /old command/);

  await page.refresh(world([done(T1, 'play_2', { command: 'new command', finishedAt: T0 + 3_000 })]), T0 + 4_000);
  assert.equal(page.strip(T1).dataset.terminalEvidence, 'completed');
  assert.match(page.stripText(T1), /new command/);
  assert.doesNotMatch(page.stripText(T1), /old command/);
  const records = JSON.parse(page.storage.getItem(STORAGE_KEY)).records;
  assert.deepEqual(records.map((r) => r.playRef), ['play_2'], 'one bounded record per Player');
});

test('TER-11. A dismissed old Play never hides the next Play\'s evidence', async () => {
  const page = await start(world([failed(T1, 'play_1')]));
  await page.click(page.button(T1, 'evidence-dismiss'));
  assert.equal(page.strip(T1), null);
  await page.refresh(world([runningShell(T1, 'play_2')]), T0 + 1_000);
  await page.refresh(world([failed(T1, 'play_2', { finishedAt: T0 + 2_000 })]), T0 + 3_000);
  assert.match(page.stripText(T1), /Command failed/);
});

// ---------------------------------------------------------------------------
// 8-9. Reports and non-Terminal Players are unchanged
// ---------------------------------------------------------------------------

test('TER-12. Report lifecycle is separate: an unacknowledged report keeps its Report ready strip; evidence never acknowledges', async () => {
  const withReport = { ...done(T1, 'play_r', { finishedAt: T0 - 60_000 }), report: { path: 'C:\\g\\REPORTS\\r.md', filename: 'r.md', acknowledged: false } };
  const page = await start(world([withReport]));
  assert.match(page.stripText(T1), /Report ready/);
  assert.ok(page.button(T1, 'strip-view-report'), 'View Report action preserved');
  assert.equal(page.acks().length, 0, 'nothing acknowledged by rendering evidence');
});

test('TER-13. Non-Terminal Players are unchanged: no failure card, no retained finished card, Copy still releases a completed AI console', async () => {
  const reasoningFail = view(AI, 'couldnt-finish', { playRef: 'p_f', executionType: 'reasoning', summary: 'fix', finishedAt: T0, durationMs: 500, executionStartedAt: T0 - 500 });
  let page = await start(world([reasoningFail]));
  assert.equal(page.strip(AI), null, 'AI failure still is not a strip (stripCopy contract)');

  const aiRunning = view(AI, 'working', { playRef: 'p_1', executionType: 'reasoning', summary: 'Fix it', executionStartedAt: T0 });
  page = await start(world([aiRunning]));
  await page.click(page.button(AI, 'console-toggle'));
  page.emitEvent('activity', act(AI, 1, 'command', 'build'));
  await page.refresh(world([view(AI, 'finished', { playRef: 'p_1', executionType: 'reasoning', summary: 'Fix it', finishedAt: T0 - 45_000, durationMs: 500, executionStartedAt: T0 - 45_500 })]), T0);
  assert.ok(page.shell(AI), 'pinned AI console open after finish');
  assert.equal(page.strip(AI).dataset.terminalEvidence, undefined, 'never terminal evidence');
  await page.click(page.button(AI, 'console-copy-all'));
  assert.equal(page.shell(AI), null, 'LPT-28 behaviour for AI Players is intact');
  assert.equal(page.strip(AI), null);
});

// ---------------------------------------------------------------------------
// 10. Output streaming untouched
// ---------------------------------------------------------------------------

test('TER-14. Live output keeps streaming into retained evidence; an empty transcript is honest', async () => {
  const page = await start(world([done(T1, 'play_1', { finishedAt: T0 })]));
  await page.click(page.button(T1, 'console-toggle'));
  assert.match(page.body(T1).children.map((c) => c.textContent).join(' '), /No output was kept for this command\./, 'backfilled empty transcript is stated honestly');
  assert.doesNotMatch(page.allText(page.body(T1)), /Waiting for live execution activity/);
  page.emitEvent('activity', act(T1, 1, 'output', 'late line'));
  assert.deepEqual(page.lines(T1).map((l) => l.children.map((c) => c.textContent).join(' ')).length, 1, 'stream line appended as before');
  assert.match(page.allText(page.body(T1)), /late line/);
});

// ---------------------------------------------------------------------------
// 11. Identity never leaks
// ---------------------------------------------------------------------------

test('TER-15. Evidence is per exact Player and Play; nothing leaks across instances or Games', async () => {
  const page = await start(world([failed(T1, 'play_a', { command: 'cmd-one' }), done(T2, 'play_b', { command: 'cmd-two', finishedAt: T0 })]));
  assert.match(page.stripText(T1), /cmd-one/);
  assert.match(page.stripText(T2), /cmd-two/);
  assert.doesNotMatch(page.stripText(T1), /cmd-two/);
  assert.equal(page.strip(AI), null, 'a Player that ran nothing shows nothing');
  await page.click(page.button(T1, 'evidence-dismiss'));
  assert.equal(page.strip(T1), null);
  assert.ok(page.strip(T2), 'dismissing one Player never touches another');

  // Records saved for a different Game are ignored on restore.
  const foreign = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ gameId: 'other_game', records: [{ instanceId: T1, gameId: 'other_game', playRef: 'x', outcome: 'failed', finishedAt: T0, summary: 'alien', dismissed: false }] }) });
  const fresh = await start(world([]), { storage: foreign });
  assert.equal(fresh.strip(T1), null);
  assert.doesNotMatch(fresh.allText(fresh.$('roster')), /alien/);
});

// ---------------------------------------------------------------------------
// 12. Rerender / reconnect / reload / storage safety / gates
// ---------------------------------------------------------------------------

test('TER-16. Rerender and SSE reconnect are idempotent: the timer is scheduled once from server finishedAt and never restarts', async () => {
  const page = await start(world([done(T1, 'play_1', { finishedAt: T0 })]));
  for (let i = 0; i < 4; i += 1) { await page.refresh(null, T0 + 1_000 * (i + 1)); page.emitEvent('hello'); await flush(); }
  const evidenceTimers = page.timers.filter((t) => t.ms >= 60_000 && t.ms <= FIVE_MIN + 100);
  assert.equal(evidenceTimers.length, 1, 'one wake-up per (instance, playRef)');
  assert.ok(evidenceTimers[0].ms <= FIVE_MIN + 20, 'derived from finishedAt on the server clock, not render time');
  // Firing it after the window closes releases the card with no refresh at all.
  page.clock.now = T0 + FIVE_MIN + 1;
  evidenceTimers[0].fn();
  assert.equal(page.strip(T1), null);
});

test('TER-17. Reload restores evidence and dismissal from sessionStorage (server view already gone)', async () => {
  const storage = memoryStorage();
  const first = await start(world([failed(T1, 'play_f'), done(T2, 'play_ok', { finishedAt: T0 })]), { storage });
  await first.click(first.button(T2, 'evidence-dismiss'));
  assert.ok(storage.getItem(STORAGE_KEY), 'persisted');

  // A brand-new page (reload) with the same tab storage, and the server view long decayed.
  const second = await start(world([], { now: T0 + 60_000 }), { storage });
  assert.match(second.stripText(T1), /Command failed/, 'failure evidence restored');
  assert.equal(second.strip(T2), null, 'dismissal restored');
});

test('TER-18. Unavailable, throwing or corrupt storage never breaks retention', async () => {
  const blocked = await start(world([failed(T1, 'play_f')]), { storage: throwingStorage() });
  assert.match(blocked.stripText(T1), /Command failed/, 'works without storage');
  await blocked.click(blocked.button(T1, 'evidence-dismiss'));
  assert.equal(blocked.strip(T1), null);

  const corrupt = await start(world([failed(T1, 'play_f')]), { storage: memoryStorage({ [STORAGE_KEY]: '{not json' }) });
  assert.match(corrupt.stripText(T1), /Command failed/, 'corrupt payload ignored');
  const partial = await start(world([]), { storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify({ gameId: GAME, records: [{ instanceId: 5 }, null, { instanceId: T1, gameId: GAME, playRef: 'p', outcome: 'exploded', finishedAt: T0, dismissed: false }] }) }) });
  assert.equal(partial.strip(T1), null, 'malformed records rejected');
});

test('TER-19. Both gates are required; turning either off discards evidence and storage', async () => {
  const off = await start(world([failed(T1, 'play_f')], { preferences: { devMode: true, livePlayerConsole: false } }));
  assert.equal(off.strip(T1), null, 'View Player Terminal off -> no evidence card');
  const noDev = await start(world([failed(T1, 'play_f')], { preferences: { devMode: false, livePlayerConsole: true } }));
  assert.equal(noDev.strip(T1), null, 'Dev Mode off -> no evidence card');

  const page = await start(world([failed(T1, 'play_f')]));
  assert.ok(page.strip(T1));
  assert.ok(page.storage.getItem(STORAGE_KEY));
  await page.refresh(world([failed(T1, 'play_f')], { preferences: { devMode: true, livePlayerConsole: false } }), T0 + 1_000);
  assert.equal(page.strip(T1), null);
  assert.equal(page.storage.getItem(STORAGE_KEY), null, 'storage cleared with the gate');
});

test('TER-20. Scope guard: substrate, ledger, projection and transport are not referenced by the evidence code', () => {
  const block = pageSource.slice(pageSource.indexOf('Terminal Evidence Retention (S53 Play 2'), pageSource.indexOf('const stripCopy = '));
  assert.ok(block.length > 1_000);
  for (const forbidden of ['/api/work', 'fetch(', 'api(', 'localStorage', 'acknowledgeWork', 'consoleActivity.set', 'upsertConsoleEntry']) {
    assert.ok(!block.includes(forbidden), `evidence block must not touch ${forbidden}`);
  }
  assert.match(pageSource, /DEFAULT_TERMINAL_RETENTION = '5m'/, 'duration is now the Terminal Success Retention setting (S54.4); default 5 min');
});
