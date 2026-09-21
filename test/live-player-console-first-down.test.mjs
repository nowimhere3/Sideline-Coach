// Live Player Console — first-down slice (UI/state seam only).
//
// Runs the real src/public/index.html script against the same small DOM stub used by
// the Q2.10F.2 strip harnesses. Truth enters through daemon-shaped status snapshots
// (`status.preferences`, `status.execution`). No provider activity exists here: the
// console is an honest, empty shell.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadPreferences, savePreferences } from '../out/running-players.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

const GAME = 'game_git_trend';
const CL1 = 'claude-cccc1111';
const CL2 = 'claude-cccc2222';
const ORDER = [CL1, CL2];
const T0 = 1_800_000_000_000;

const snap = { provider: 'x', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'm', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: [] }] };
const cap = (instanceId) => ({ instanceId, playerType: 'claude', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: instanceId, state: 'ready', capability: snap });
const view = (instanceId, state, revision, extra = {}) => ({ instanceId, state, revision, executionType: 'reasoning', ...extra });
const working = (id, rev) => view(id, 'working', rev, { playRef: `ref_${id}`, summary: 'Fix the Play Clock bug', executionStartedAt: T0 - 137_000 });

function daemonStatus({ preferences, views }) {
  const inst = (instanceId, seat, fieldLabel) => ({ instanceId, playerType: 'claude', seat, fieldLabel, onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' });
  const caps = ORDER.map(cap);
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Trend' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [{ id: 'claude', name: 'Claude', instances: [inst(CL1, 1, 'Claude 1 · Controlled'), inst(CL2, 2, 'Claude 2 · Controlled')] }],
    capabilities: caps.map((c) => ({ ...c, work: { workState: 'working', queuedCount: 0 } })),
    queue: [],
    routing: { mode: 'auto', capabilities: caps, activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null, preferences: { runningPlayers: 'ask', ...preferences }, at: T0,
    execution: { gameId: GAME, epoch: 'E1', serverNow: T0, byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v])) }
  };
}

function createPage(initialStatus) {
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
  const posts = [];
  const clipboard = { writes: [], fail: false };
  const backfill = { sessionKey: undefined, entries: [], requests: [] };
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
      if (url.startsWith('/api/player-activity')) {
        backfill.requests.push(url);
        if (backfill.wait) await backfill.wait;
        return reply(200, { success: true, sessionKey: backfill.sessionKey, entries: backfill.entries });
      }
      if (url === '/api/preferences' && options.method === 'POST') {
        posts.push(body);
        status = { ...status, preferences: { ...status.preferences, ...body } };
        return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' });
      }
      return reply(200, {});
    },
    setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval: () => {},
    Date: class extends Date { static now() { return T0; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { if (clipboard.fail) throw new Error('denied'); clipboard.writes.push(text); } } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, posts, allText, find, clipboard, backfill,
    emitEvent: (name, data) => source.emit(name, data),
    body: (id) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === 'console-body'); },
    lines: (id) => { const b = page.body(id); return b ? b.children.filter((c) => c.className === 'play-console-line') : []; },
    lineText: (id) => page.lines(id).map((l) => l.children.map((c) => c.textContent).join('')),
    row: (id) => $('roster').children.find((r) => r.className === 'player' && r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    toggle: (id) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === 'console-toggle'); },
    shell: (id) => { const s = page.strip(id); return s && find(s, (n) => n.className === 'play-console'); },
    button: (id, key) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === key); },
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
    change: async (node, checked) => { node.checked = checked; for (const fn of node.listeners.change || []) await fn({ target: node }); await flush(); },
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

const startPage = (preferences, views = [working(CL1, 4), view(CL2, 'idle', 0)]) => createPage(daemonStatus({ preferences, views })).start();

test('LPC-1. Dev Mode OFF: setting hidden and no console controls, even if the flag is stored ON', async () => {
  const page = await startPage({ devMode: false, livePlayerConsole: true });
  assert.equal(page.$('livePlayerConsoleCard').hidden, true, 'setting hidden in normal Settings');
  assert.ok(page.strip(CL1), 'active strip still renders');
  assert.equal(page.toggle(CL1), null, 'no console control on the Player card');
  assert.equal(page.shell(CL1), null);
});

test('LPC-2. Dev Mode ON + Live Player Console OFF: setting visible (unchecked), no console controls', async () => {
  const page = await startPage({ devMode: true, livePlayerConsole: false });
  assert.equal(page.$('livePlayerConsoleCard').hidden, false);
  assert.equal(page.$('livePlayerConsoleToggle').checked, false);
  assert.match(pageSource, /<h3>View Player Terminal<\/h3>\s*<p class="tiny muted">Show a live Player terminal view inside active Player cards\.<\/p>/, 'Settings copy uses Terminal terminology');
  assert.doesNotMatch(pageSource, /<h3>Live Player Console<\/h3>/);
  assert.equal(page.toggle(CL1), null);
  assert.equal(page.shell(CL1), null);
});

test('LPC-3. Both ON: active card gets Expand → shell → Collapse, exact identity unchanged, idle Player gets none', async () => {
  const page = await startPage({ devMode: true, livePlayerConsole: true });
  assert.equal(page.$('livePlayerConsoleToggle').checked, true);
  const toggle = page.toggle(CL1);
  assert.ok(toggle, 'Expand control present on the working Player');
  assert.equal(toggle.textContent, 'Expand');
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  assert.match(toggle.attributes['aria-label'], /live terminal/);
  assert.equal(toggle.parentNode.className, 'play-strip-actions play-terminal-toggle-row', 'compact right-aligned utility row');
  assert.equal(page.shell(CL1), null, 'collapsed by default');
  assert.equal(page.strip(CL2), null, 'idle Player has no strip, so no console');

  const stripBefore = page.strip(CL1);
  const identity = { row: page.row(CL1).dataset.instanceId, strip: stripBefore.dataset.instanceId, state: stripBefore.dataset.state };

  await page.click(page.toggle(CL1));
  assert.equal(page.toggle(CL1).textContent, 'Collapse');
  assert.equal(page.toggle(CL1).attributes['aria-expanded'], 'true');
  const shell = page.shell(CL1);
  assert.ok(shell, 'console region appears');
  assert.equal(shell.dataset.instanceId, CL1, 'console keyed by exact instanceId');
  assert.match(page.allText(shell), /Waiting for live execution activity…/, 'honest placeholder');
  assert.equal(shell.attributes['aria-label'], 'Live terminal for Claude 1');
  assert.deepEqual(
    { row: page.row(CL1).dataset.instanceId, strip: page.strip(CL1).dataset.instanceId, state: page.strip(CL1).dataset.state },
    identity, 'expanding never alters exact Player identity or work state');
  assert.match(page.allText(page.strip(CL1)), /◉ Working/, 'timer/work row intact while expanded');
  assert.equal(page.strip(CL1).children[0].className, 'play-strip-row');
  assert.equal(page.find(page.strip(CL1), (n) => n.dataset.elapsedSince !== undefined)?.dataset.elapsedSince, String(T0 - 137_000), 'canonical timer origin untouched');

  await page.click(page.toggle(CL1));
  assert.equal(page.toggle(CL1).textContent, 'Expand');
  assert.equal(page.shell(CL1), null, 'collapse returns the card cleanly');
  assert.equal(page.strip(CL1).dataset.instanceId, identity.strip);
  assert.equal(page.posts.length, 0, 'collapse/expand made no server request of any kind');
});

test('LPC-4. Copy All / Copy New are honest disabled seams; expansion survives a roster rebuild per exact instance', async () => {
  const page = await startPage({ devMode: true, livePlayerConsole: true }, [working(CL1, 4), working(CL2, 4)]);
  await page.click(page.toggle(CL1));
  for (const key of ['console-copy-all', 'console-copy-new']) {
    const button = page.button(CL1, key);
    assert.ok(button, key);
    assert.equal(button.disabled, true, `${key} is disabled — nothing real to copy`);
  }
  assert.deepEqual(
    page.find(page.shell(CL1), (n) => n.className === 'play-console-actions').children.map((b) => b.textContent),
    ['Copy All', 'Copy New'], 'copy controls sit at the bottom of the console');
  const shellChildren = page.shell(CL1).children.map((c) => c.className);
  assert.deepEqual(shellChildren, ['play-console-header', 'play-console-body', 'play-console-actions']);

  await page.refresh();
  assert.ok(page.shell(CL1), 'still expanded for CL1 after roster rebuild');
  assert.equal(page.shell(CL2), null, 'sibling instance unaffected');
  assert.equal(page.toggle(CL2).textContent, 'Expand');
});

test('LPC-4b. Toggle is compact and right-aligned; Copy controls are left-aligned at the bottom', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /\.play-strip-actions\.play-terminal-toggle-row \{[^}]*justify-content: flex-end;/);
  const btn = css.match(/\.play-strip-actions\.play-terminal-toggle-row button \{([^}]*)\}/)[1];
  assert.match(btn, /min-height: 32px/);
  assert.match(btn, /padding: 4px 10px/);
  assert.match(btn, /flex: 0 0 auto/, 'not stretched by the narrow-screen flex:1 rule');
  assert.match(css, /\.play-console-actions \{[^}]*justify-content: flex-start;/);
});

test('LPC-5. Toggling the setting saves only livePlayerConsole through /api/preferences', async () => {
  const page = await startPage({ devMode: true, livePlayerConsole: false });
  await page.change(page.$('livePlayerConsoleToggle'), true);
  assert.deepEqual(page.posts, [{ livePlayerConsole: true }]);
  assert.ok(page.toggle(CL1), 'console control appears once saved');
  await page.change(page.$('livePlayerConsoleToggle'), false);
  assert.deepEqual(page.posts[1], { livePlayerConsole: false });
  assert.equal(page.toggle(CL1), null, 'and disappears again when turned off');
});

test('LPC-6. Preference persists via the existing preferences file and defaults OFF', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-lpc-'));
  const file = path.join(dir, 'preferences.json');
  assert.equal(loadPreferences(file).livePlayerConsole, false);
  fs.writeFileSync(file, JSON.stringify({ runningPlayers: 'ask', devMode: true }));
  assert.equal(loadPreferences(file).livePlayerConsole, false, 'older file without the key → OFF');
  savePreferences(file, { runningPlayers: 'ask', devMode: true, livePlayerConsole: true });
  assert.equal(loadPreferences(file).livePlayerConsole, true);
  fs.writeFileSync(file, JSON.stringify({ devMode: true, livePlayerConsole: 'yes' }));
  assert.equal(loadPreferences(file).livePlayerConsole, false, 'non-boolean → OFF');
});

// ---------------------------------------------------------------------------
// V0.2 — live activity into the shell (browser side)
// ---------------------------------------------------------------------------

const BOTH = { devMode: true, livePlayerConsole: true };
const act = (instanceId, seq, category, text, extra = {}) => ({ gameId: GAME, instanceId, sessionKey: 'aaaaaaaa', entry: { seq, at: T0 + seq * 1000, category, text }, ...extra });
const bothWorking = () => [working(CL1, 4), working(CL2, 4)];
async function expandBoth() {
  const page = await startPage(BOTH, bothWorking());
  await page.click(page.toggle(CL1));
  await page.click(page.toggle(CL2));
  return page;
}

test('LPT-10. Live activity reaches only its own exact Player terminal, in order, without touching the other', async () => {
  const page = await expandBoth();
  page.emitEvent('activity', act(CL1, 1, 'command', 'git status'));
  page.emitEvent('activity', act(CL2, 1, 'tool', 'Read src/a.ts'));
  page.emitEvent('activity', act(CL1, 2, 'message', 'Looking at the diff'));
  assert.deepEqual(page.lineText(CL1).map((t) => t.replace(/^\d\d:\d\d:\d\d /, '')), ['COMMAND git status', 'MESSAGE Looking at the diff']);
  assert.deepEqual(page.lineText(CL2).map((t) => t.replace(/^\d\d:\d\d:\d\d /, '')), ['TOOL Read src/a.ts']);
  assert.doesNotMatch(page.allText(page.shell(CL2)), /git status|Looking at the diff/);
  assert.doesNotMatch(page.allText(page.shell(CL1)), /Waiting for live execution activity/, 'placeholder replaced by real lines');
  assert.match(page.allText(page.strip(CL1)), /◉ Working/, 'timer/work row intact');
  // A different Game's activity, or one for a Player that is not on screen, is ignored.
  page.emitEvent('activity', act(CL1, 3, 'command', 'other game', { gameId: 'game_other' }));
  page.emitEvent('activity', act('claude-unknown', 1, 'command', 'ghost'));
  assert.equal(page.lines(CL1).length, 2);
});

test('LPT-11. Replays, re-renders, streaming growth and backfill overlap never duplicate lines', async () => {
  const page = await expandBoth();
  page.emitEvent('activity', act(CL1, 1, 'command', 'ls'));
  page.emitEvent('activity', act(CL1, 1, 'command', 'ls'));
  assert.equal(page.lines(CL1).length, 1, 'same seq replayed');
  page.emitEvent('activity', act(CL1, 2, 'message', 'Hel'));
  page.emitEvent('activity', act(CL1, 2, 'message', 'Hello world'));
  assert.equal(page.lines(CL1).length, 2, 'streaming growth updates the same line');
  assert.equal(page.lines(CL1)[1].textEl.textContent, 'Hello world');
  await page.refresh(); // roster + strips rebuilt from the store
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['ls', 'Hello world']);
  page.backfill.entries = [{ seq: 1, at: T0 + 1000, category: 'command', text: 'ls' }, { seq: 2, at: T0 + 2000, category: 'message', text: 'Hello world' }, { seq: 3, at: T0 + 3000, category: 'result', text: 'Completed' }];
  page.emitEvent('hello');
  await flush(); await flush();
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['ls', 'Hello world', 'Completed'], 'reconnect backfill merges by seq');
});

test('LPT-12. Browser retention is bounded and keeps the newest lines', async () => {
  const page = await expandBoth();
  for (let i = 1; i <= 350; i += 1) page.emitEvent('activity', act(CL1, i, 'command', `step ${i}`));
  const lines = page.lines(CL1);
  assert.equal(lines.length, 300);
  assert.equal(lines[0].textEl.textContent, 'step 51');
  assert.equal(lines.at(-1).textEl.textContent, 'step 350');
});

test('LPT-13. Copy All / Copy New: human-readable text, exact-Player cursor, advanced only after a successful write', async () => {
  const page = await expandBoth();
  const btn = (id, mode) => page.button(id, `console-copy-${mode}`);
  assert.equal(btn(CL1, 'all').disabled, true, 'nothing to copy yet');
  page.emitEvent('activity', act(CL1, 1, 'command', 'git status'));
  page.emitEvent('activity', act(CL1, 2, 'message', 'All clean'));
  page.emitEvent('activity', act(CL2, 1, 'tool', 'Read b.ts'));
  assert.equal(btn(CL1, 'all').disabled, false);
  assert.equal(btn(CL1, 'new').disabled, false);

  await page.click(btn(CL1, 'all'));
  assert.equal(page.clipboard.writes.length, 1);
  assert.match(page.clipboard.writes[0], /^\[\d\d:\d\d:\d\d\] COMMAND {2}git status\n\[\d\d:\d\d:\d\d\] MESSAGE {2}All clean$/, 'readable lines, never JSON');
  assert.doesNotMatch(page.clipboard.writes[0], /\{|seq|instanceId|Read b\.ts/);
  assert.equal(btn(CL1, 'all').textContent, '✓ Copied');
  assert.equal(btn(CL1, 'new').disabled, true, 'nothing new since Copy All');
  assert.equal(btn(CL1, 'new').title, 'No new activity since your last copy');
  assert.equal(btn(CL2, 'new').disabled, false, "Claude 2's cursor is untouched by Claude 1's copy");

  page.emitEvent('activity', act(CL1, 3, 'command', 'npm test'));
  assert.equal(btn(CL1, 'new').disabled, false);
  await page.click(btn(CL1, 'new'));
  assert.equal(page.clipboard.writes.length, 2);
  assert.match(page.clipboard.writes[1], /^\[\d\d:\d\d:\d\d\] COMMAND {2}npm test$/, 'only lines after the last successful copy');

  page.emitEvent('activity', act(CL1, 4, 'result', 'Completed'));
  page.clipboard.fail = true;
  await page.click(btn(CL1, 'new'));
  assert.equal(page.clipboard.writes.length, 2, 'failed write copied nothing');
  assert.equal(btn(CL1, 'new').textContent, 'Copy failed');
  assert.equal(btn(CL1, 'new').disabled, false, 'cursor did NOT advance');
  page.clipboard.fail = false;
  await page.click(btn(CL1, 'new'));
  assert.match(page.clipboard.writes[2], /RESULT {2}Completed$/, 'the same lines are still eligible after the failure');
  assert.doesNotMatch(page.clipboard.writes[2], /npm test/);
  await page.click(btn(CL1, 'all'));
  assert.equal(page.clipboard.writes[3].split('\n').length, 4, 'Copy All is the whole retained transcript');

  // Streaming growth after a copy: only the appended text is "new".
  page.emitEvent('activity', act(CL1, 5, 'message', 'Part one'));
  await page.click(btn(CL1, 'all'));
  page.emitEvent('activity', act(CL1, 5, 'message', 'Part one and two'));
  await page.click(btn(CL1, 'new'));
  assert.equal(page.clipboard.writes.at(-1), ' and two');
});

test('LPT-14. A new provider session starts a fresh transcript and a fresh copy cursor', async () => {
  const page = await expandBoth();
  page.emitEvent('activity', act(CL1, 1, 'command', 'old session line'));
  await page.click(page.button(CL1, 'console-copy-all'));
  assert.equal(page.button(CL1, 'console-copy-new').disabled, true);
  page.emitEvent('activity', act(CL1, 2, 'command', 'new session line', { sessionKey: 'bbbbbbbb' }));
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['new session line']);
  assert.equal(page.button(CL1, 'console-copy-new').disabled, false, 'cursor is scoped to (Player, session)');
});

test('LPT-15. Gates: no activity is kept unless Dev Mode AND View Player Terminal are on', async () => {
  const page = await startPage({ devMode: true, livePlayerConsole: false }, bothWorking());
  page.emitEvent('activity', act(CL1, 1, 'command', 'should be ignored'));
  await page.refresh(daemonStatus({ preferences: BOTH, views: bothWorking() }));
  await page.click(page.toggle(CL1));
  assert.equal(page.lines(CL1).length, 0, 'nothing retained while the setting was off');
  assert.match(page.allText(page.shell(CL1)), /Waiting for live execution activity/);
  page.emitEvent('activity', act(CL1, 2, 'command', 'now visible'));
  assert.equal(page.lines(CL1).length, 1);
  await page.refresh(daemonStatus({ preferences: { devMode: false, livePlayerConsole: true }, views: bothWorking() }));
  assert.equal(page.toggle(CL1), null, 'Dev Mode off removes the control');
  await page.refresh(daemonStatus({ preferences: BOTH, views: bothWorking() }));
  await page.click(page.toggle(CL1));
  assert.equal(page.lines(CL1).length, 0, 'retained activity was dropped when the gate closed');
});

test('LPT-16. Auto-follow the newest line, but never yank the view while the human reads older output', async () => {
  const page = await expandBoth();
  for (let i = 1; i <= 3; i += 1) page.emitEvent('activity', act(CL1, i, 'command', `c${i}`));
  const body = page.body(CL1);
  const scrollTo = (node, top) => { node.scrollHeight = 1000; node.clientHeight = 200; node.scrollTop = top; for (const fn of node.listeners.scroll || []) fn(); };
  scrollTo(body, 800); // at the bottom
  page.emitEvent('activity', act(CL1, 4, 'command', 'c4'));
  assert.equal(body.scrollTop, 1000, 'follows the newest activity');
  scrollTo(body, 100); // human scrolled up
  page.emitEvent('activity', act(CL1, 5, 'command', 'c5'));
  page.emitEvent('activity', act(CL1, 6, 'command', 'c6'));
  assert.equal(body.scrollTop, 100, 'position preserved while reading older output');
  await page.refresh(); // strips rebuilt: the reading position survives
  const rebuilt = page.body(CL1);
  assert.notEqual(rebuilt, body, 'the strip really was rebuilt');
  assert.equal(rebuilt.scrollTop, 100);
  scrollTo(rebuilt, 800);
  page.emitEvent('activity', act(CL1, 7, 'command', 'c7'));
  assert.equal(rebuilt.scrollTop, 1000, 'follows again once the human returns to the bottom');
});

test("LPT-17. Expand backfills the daemon's retained lines for that exact Player only", async () => {
  const page = await startPage(BOTH, bothWorking());
  page.backfill.sessionKey = 'aaaaaaaa';
  page.backfill.entries = [{ seq: 1, at: T0 + 1000, category: 'working', text: 'Working…' }, { seq: 2, at: T0 + 2000, category: 'command', text: 'ls' }];
  await page.click(page.toggle(CL1));
  assert.equal(page.backfill.requests.length, 1);
  assert.match(page.backfill.requests[0], new RegExp(`gameId=${GAME}&instanceId=${CL1}$`));
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['Working…', 'ls']);
  assert.equal(page.shell(CL2), null, 'the other Player did not expand or fetch');
});

test('LPT-18. Honest placeholders per transport; Scout is ineligible; Finished card retains output', async () => {
  const shellPage = await startPage(BOTH, [view(CL1, 'working', 4, { executionType: 'direct-shell', playRef: 'r', executionStartedAt: T0 - 5000 }), view(CL2, 'working', 4, { executionType: 'scout-formation', playRef: 'r2', executionStartedAt: T0 - 5000 })]);
  await shellPage.click(shellPage.toggle(CL1));
  assert.match(shellPage.allText(shellPage.shell(CL1)), /Waiting for live execution activity/);
  assert.equal(shellPage.lines(CL1).length, 0, 'nothing fabricated');
  assert.equal(shellPage.toggle(CL2), null, 'Scout receives NO Expand control');
  assert.equal(shellPage.shell(CL2), null, 'Scout receives NO console shell');

  const page = await startPage(BOTH, [working(CL1, 4), view(CL2, 'idle', 0)]);
  await page.click(page.toggle(CL1));
  page.emitEvent('activity', act(CL1, 1, 'command', 'npm run build'));
  await page.refresh(daemonStatus({ preferences: BOTH, views: [view(CL1, 'finished', 6, { playRef: 'ref_c', summary: 'Fix the Play Clock bug', finishedAt: T0 - 5000 }), view(CL2, 'idle', 0)] }));
  assert.match(page.allText(page.strip(CL1)), /Finished/);
  assert.ok(page.shell(CL1), 'expanded terminal survives the Play finishing while the strip is shown');
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['npm run build'], 'retained output stays inspectable/copyable');
  assert.equal(page.button(CL1, 'console-copy-all').disabled, false);
});

test('LPT-19. Terminal text follows Preview Reports typography (desktop + narrow); approved toggle styling untouched', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /--reader-font-size: 14\.5px;[\s\S]*--reader-line-height: 1\.6;[\s\S]*--reader-font-size-narrow: 16\.5px;[\s\S]*--reader-line-height-narrow: 1\.65;/);
  assert.match(css, /#reportPreview \{[^}]*font-size: var\(--reader-font-size\);[^}]*line-height: var\(--reader-line-height\);/);
  assert.match(css, /\.play-console-body \{[^}]*font: var\(--reader-font-size\) \/ var\(--reader-line-height\) ui-monospace/);
  assert.match(css, /@media \(max-width: 619px\) \{\s*#reportPreview \{[^}]*font-size: var\(--reader-font-size-narrow\);[^}]*line-height: var\(--reader-line-height-narrow\)/);
  assert.match(css, /@media \(max-width: 619px\) \{[\s\S]*\.play-console-body \{[^}]*font-size: var\(--reader-font-size-narrow\); line-height: var\(--reader-line-height-narrow\);/);
  // Human-approved Expand/Collapse control: byte-identical rules.
  for (const rule of [
    '.play-strip-actions.play-terminal-toggle-row { justify-content: flex-end; margin-top: 6px; }',
    '.play-strip:has(> .play-terminal-toggle-row:last-child) { margin-bottom: -4px; }',
    '.play-strip-actions.play-terminal-toggle-row button { flex: 0 0 auto; min-height: 32px; padding: 4px 10px; font-size: .78rem; }',
    '.play-console-actions { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 7px;'
  ]) assert.ok(css.includes(rule), `approved rule changed: ${rule}`);
});

test('LPT-20. A daemon restart (new epoch, seq restarts) never merges into the old transcript', async () => {
  const page = await expandBoth();
  page.emitEvent('activity', act(CL1, 1, 'command', 'before restart', { epoch: 'execution_old' }));
  page.emitEvent('activity', act(CL1, 2, 'command', 'still before', { epoch: 'execution_old' }));
  await page.click(page.button(CL1, 'console-copy-all'));
  assert.equal(page.button(CL1, 'console-copy-new').disabled, true);
  page.emitEvent('activity', act(CL1, 1, 'command', 'after restart', { epoch: 'execution_new' }));
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['after restart'], 'seq collision cannot overwrite or interleave old lines');
  assert.equal(page.button(CL1, 'console-copy-new').disabled, false, 'fresh transcript, fresh cursor');
});

test('LPT-21. Collapsed-first flow: live activity arriving while collapsed immediately renders on Expand with active copy controls', async () => {
  const page = await startPage(BOTH, [working(CL1, 4), working(CL2, 4)]);
  assert.equal(page.shell(CL1), null, 'terminal starts collapsed');
  assert.equal(page.shell(CL2), null);

  // Activity arrives while collapsed
  page.emitEvent('activity', act(CL1, 1, 'working', 'Working…'));
  page.emitEvent('activity', act(CL1, 2, 'command', 'git status -s'));
  page.emitEvent('activity', act(CL1, 3, 'result', 'Completed'));

  // User later clicks Expand
  await page.click(page.toggle(CL1));
  assert.ok(page.shell(CL1), 'shell appears');
  assert.equal(page.lines(CL1).length, 3, 'all 3 entries rendered immediately');
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['Working…', 'git status -s', 'Completed']);
  assert.doesNotMatch(page.allText(page.shell(CL1)), /Waiting for live execution activity…/, 'placeholder removed');

  // Copy controls immediately enabled without any extra event
  assert.equal(page.button(CL1, 'console-copy-all').disabled, false);
  assert.equal(page.button(CL1, 'console-copy-new').disabled, false);

  // Exact instance separation: CL2 was never touched
  assert.equal(page.shell(CL2), null);
  await page.click(page.toggle(CL2));
  assert.equal(page.lines(CL2).length, 0, 'CL2 has 0 lines');
  assert.match(page.allText(page.shell(CL2)), /Waiting for live execution activity…/);
  assert.equal(page.button(CL2, 'console-copy-all').disabled, true);
});

test('LPT-22. Session rotation: authoritative backfill replaces old session transcript and updates copy cursor', async () => {
  const page = await startPage(BOTH, [working(CL1, 4)]);
  await page.click(page.toggle(CL1));

  // Session A activity arrives
  page.emitEvent('activity', act(CL1, 1, 'command', 'session A command', { sessionKey: 'aaaa1111' }));
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['session A command']);
  await page.click(page.button(CL1, 'console-copy-all'));
  assert.equal(page.button(CL1, 'console-copy-new').disabled, true, 'all copied for session A');

  // Server now transitions same Player to session B (e.g. subsequent Play or restart)
  page.backfill.sessionKey = 'bbbb2222';
  page.backfill.entries = [
    { seq: 1, at: T0 + 1000, category: 'working', text: 'Session B working' },
    { seq: 2, at: T0 + 2000, category: 'command', text: 'Session B command' }
  ];

  // Collapse and expand on new turn/play to trigger backfill
  await page.click(page.toggle(CL1)); // collapse
  await page.click(page.toggle(CL1)); // expand with new backfill

  // Verify session B is accepted as authoritative:
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['Session B working', 'Session B command']);
  assert.doesNotMatch(page.allText(page.shell(CL1)), /session A command/, 'session A wiped cleanly');
  assert.equal(page.button(CL1, 'console-copy-all').disabled, false);
  assert.equal(page.button(CL1, 'console-copy-new').disabled, false, 'fresh session resets copy cursor');
});

test('LPT-23. PlayRef rotation resets sticky backfill state across sequential plays', async () => {
  const page = await startPage(BOTH, [view(CL1, 'working', 1, { playRef: 'play_alpha' })]);

  // Expand and backfill play_alpha
  page.backfill.sessionKey = 'alpha001';
  page.backfill.entries = [{ seq: 1, at: T0 + 1000, category: 'command', text: 'run alpha' }];
  await page.click(page.toggle(CL1));
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['run alpha']);
  assert.equal(page.backfill.requests.length, 1);

  // Collapse
  await page.click(page.toggle(CL1));

  // Next play begins on same instance with new playRef:
  await page.refresh(daemonStatus({ preferences: BOTH, views: [view(CL1, 'working', 2, { playRef: 'play_beta' })] }));

  // Daemon now has beta activity
  page.backfill.sessionKey = 'beta0002';
  page.backfill.entries = [{ seq: 1, at: T0 + 5000, category: 'command', text: 'run beta' }];

  // Expand play_beta: stale backfilled=true must not block backfill
  await page.click(page.toggle(CL1));
  assert.equal(page.backfill.requests.length, 2, 'new backfill was requested for play_beta');
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['run beta']);
});

test('LPT-24. Genuinely late old backfill arriving after live SSE for a newer session is discarded', async () => {
  const page = await startPage(BOTH, [working(CL1, 4)]);

  // Client starts in old_session:
  page.emitEvent('activity', act(CL1, 1, 'command', 'initial line', { sessionKey: 'old_session' }));

  // Set up in-flight delayed backfill response for old_session:
  let release;
  page.backfill.wait = new Promise((r) => { release = r; });
  page.backfill.sessionKey = 'old_session';
  page.backfill.entries = [{ seq: 1, at: T0 + 1000, category: 'command', text: 'delayed old line' }];

  // Expand initiates backfillConsole while on old_session (fetch pauses on backfill.wait):
  const clickPromise = page.click(page.toggle(CL1));

  // While that fetch is in-flight, live SSE for a brand new session arrives:
  page.emitEvent('activity', act(CL1, 1, 'command', 'live brand new line', { sessionKey: 'live_new_session' }));

  // Release the delayed old backfill response:
  release();
  await clickPromise;

  // The live new session must NOT be overwritten by the delayed old_session response:
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['live brand new line']);
});

// ---------------------------------------------------------------------------
// V0.3 — Full Expand + Post-Play Retention
// ---------------------------------------------------------------------------

test('LPT-25. Desktop ~50vh layout, header title + collapse button, bottom-left copy, and mobile fullscreen layer', async () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];

  // Desktop rules
  assert.match(css, /\.play-console \{[^}]*height: 50vh;/);
  assert.match(css, /\.play-console \{[^}]*min-height: 280px;/);
  assert.match(css, /\.play-console \{[^}]*display: flex;\s*flex-direction: column;/);
  assert.match(css, /\.play-console-body \{[^}]*flex: 1 1 auto;[^}]*overflow-y: auto;/);

  // Mobile fullscreen layer rules
  assert.match(css, /@media \(max-width: 619px\) \{[\s\S]*\.play-console \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*z-index: 1000;/);
  assert.match(css, /@media \(max-width: 619px\) \{[\s\S]*\.play-console-header \{[\s\S]*position: sticky;[\s\S]*top: 0;/);

  // Header & Collapse DOM structure
  const page = await startPage(BOTH, [working(CL1, 4)]);
  await page.click(page.toggle(CL1));
  const shell = page.shell(CL1);
  assert.ok(shell);
  const header = shell.children.find((c) => c.className === 'play-console-header');
  assert.ok(header, 'header exists inside shell');
  const title = header.children.find((c) => c.className === 'play-console-title');
  assert.ok(title, 'title element exists');
  assert.equal(title.textContent, 'Live Terminal · Claude 1', 'Player context displayed');
  const collapse = header.children.find((c) => c.dataset.focusKey === 'console-toggle');
  assert.ok(collapse, 'collapse button is in the top-right header');
  assert.equal(collapse.textContent, 'Collapse');

  // Copy controls placement: bottom-left
  const actions = shell.children.find((c) => c.className === 'play-console-actions');
  assert.ok(actions);
  assert.match(css, /\.play-console-actions \{[^}]*justify-content: flex-start;/);
});

test('LPT-26. Post-Play Retention: completed terminal remains available after the 30s rich window expires', async () => {
  const page = await startPage(BOTH, [working(CL1, 4)]);
  await page.click(page.toggle(CL1));
  page.emitEvent('activity', act(CL1, 1, 'command', 'build succeeded'));

  // Play finishes at T0 - 5000 (within rich 30s window)
  await page.refresh(daemonStatus({
    preferences: BOTH,
    views: [view(CL1, 'finished', 5, { playRef: 'play_1', summary: 'Build task', finishedAt: T0 - 5000 })]
  }));
  assert.ok(page.shell(CL1), 'terminal is open while finished');
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['build succeeded']);

  // Now time progresses past the 30s rich window: finishedAt is 35s ago (T0 - 35000)
  await page.refresh(daemonStatus({
    preferences: BOTH,
    views: [view(CL1, 'finished', 6, { playRef: 'play_1', summary: 'Build task', finishedAt: T0 - 35000 })]
  }));

  // Pinned terminal MUST remain rendered even though isRichFinished is false!
  assert.ok(page.strip(CL1), 'strip remains rendered past 30s rich window because terminal is pinned');
  assert.ok(page.shell(CL1), 'terminal shell remains expanded and visible');
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['build succeeded'], 'transcript preserved');
  assert.equal(page.button(CL1, 'console-copy-all').disabled, false, 'copy controls still active');
});

test('LPT-27. Release condition (a): manual Collapse clears post-play pinning and releases expired strip', async () => {
  const page = await startPage(BOTH, [working(CL1, 4)]);
  await page.click(page.toggle(CL1));
  page.emitEvent('activity', act(CL1, 1, 'command', 'done'));

  // Finished 40s ago (past 30s rich window)
  await page.refresh(daemonStatus({
    preferences: BOTH,
    views: [view(CL1, 'finished', 5, { playRef: 'play_1', summary: 'Old play', finishedAt: T0 - 40000 })]
  }));
  assert.ok(page.shell(CL1), 'pinned terminal is open');

  // Human clicks Collapse in header
  const collapse = page.toggle(CL1);
  assert.equal(collapse.textContent, 'Collapse');
  await page.click(collapse);

  // Releasing the pinned terminal after the rich window expired removes the strip cleanly
  assert.equal(page.shell(CL1), null, 'terminal closed');
  assert.equal(page.strip(CL1), null, 'expired strip cleanly unmounted');
});

test('LPT-28. Release condition (b): Copy All / Copy New releases only after play completion, never mid-play', async () => {
  const page = await startPage(BOTH, [working(CL1, 4)]);
  await page.click(page.toggle(CL1));
  page.emitEvent('activity', act(CL1, 1, 'command', 'git status'));

  // Mid-play (working): copying does NOT collapse the terminal
  assert.equal(page.strip(CL1).dataset.state, 'working');
  await page.click(page.button(CL1, 'console-copy-all'));
  assert.ok(page.shell(CL1), 'terminal remains open after copy mid-play');
  assert.equal(page.toggle(CL1).textContent, 'Collapse');

  // Play finishes and ages past 30s (pinned)
  await page.refresh(daemonStatus({
    preferences: BOTH,
    views: [view(CL1, 'finished', 5, { playRef: 'play_1', summary: 'Done', finishedAt: T0 - 45000 })]
  }));
  assert.ok(page.shell(CL1), 'pinned terminal is open');

  // After play completion: successful copy releases the pinned terminal
  page.emitEvent('activity', act(CL1, 2, 'result', 'Done'));
  await page.click(page.button(CL1, 'console-copy-all'));

  // Clipboard received text and pinned terminal released
  assert.equal(page.clipboard.writes.length, 2);
  assert.equal(page.shell(CL1), null, 'terminal closed upon successful copy after completion');
  assert.equal(page.strip(CL1), null, 'expired strip unmounted on copy release');
});

test('LPT-29. Release condition (c): next play unpins old session and keeps terminal expanded for new play', async () => {
  const page = await startPage(BOTH, [working(CL1, 4)]);
  await page.click(page.toggle(CL1));
  page.emitEvent('activity', act(CL1, 1, 'command', 'play 1 command', { sessionKey: 'sess_1' }));

  // Play 1 finishes
  await page.refresh(daemonStatus({
    preferences: BOTH,
    views: [view(CL1, 'finished', 5, { playRef: 'play_1', finishedAt: T0 - 40000 })]
  }));
  assert.ok(page.shell(CL1), 'terminal is pinned in finished state');

  // Next play begins on same player instance (playRef changes, state is working)
  await page.refresh(daemonStatus({
    preferences: BOTH,
    views: [view(CL1, 'working', 6, { playRef: 'play_2', executionStartedAt: T0 })]
  }));

  // Terminal stays expanded for the new play!
  assert.ok(page.shell(CL1), 'terminal stays expanded when next play begins');
  assert.equal(page.toggle(CL1).textContent, 'Collapse');

  // New session activity arrives and supersedes old transcript
  page.emitEvent('activity', act(CL1, 1, 'command', 'play 2 fresh command', { sessionKey: 'sess_2' }));
  assert.deepEqual(page.lines(CL1).map((l) => l.textEl.textContent), ['play 2 fresh command'], 'new transcript shown');
  assert.doesNotMatch(page.allText(page.shell(CL1)), /play 1 command/);
});

