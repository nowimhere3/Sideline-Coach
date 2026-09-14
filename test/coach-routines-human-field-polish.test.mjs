// Coach Routines V0 — Human Field Polish (Dadified Settings UX).
//
// Field evidence: "Really cool feature, horrible UI." This suite proves the specific
// fixes — Hours cadence, one reference entry point with obvious CHECK-vs-OPEN semantics,
// a "Saved ✓ / Done" confidence affordance backed only by real mutation results, a
// Send-to-Coach explanation that never mentions Players, and a working info toggle — all
// against the real src/public/index.html script and the real cadence validator
// (src/control-plane/coach-routines.ts), not a reimplemented mock of either.
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
// Layer 1: the real daemon + real CoachRoutineEngine — proves Hours is genuinely
// accepted by the actual cadence validator, not just a browser-side conversion.
// ---------------------------------------------------------------------------

async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-polish-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 41300 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const socket = { readyState: 1, send() {}, close() {} };
  daemon.registryInstance.registerSession({
    instanceId: 'session-polish', stadiumId: 'stadium-polish', name: 'Polish Game', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId: 'game_polish', displayName: 'Polish Game', fingerprintSource: 'test', repoUri: 'https://example.test/polish.git' },
    rootFsPath: 'C:\\Games\\Polish', roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };
  return { dir, daemon, api };
}

test('Polish-1. The real cadence validator genuinely accepts Hours (not just a browser conversion)', async () => {
  const h = await daemonHarness();
  try {
    const routine = h.daemon.routineEngineInstance.create('game_polish', {
      name: 'Hourly Refresh', template: 'custom', cadence: { kind: 'time', everyMs: 3 * 3_600_000 }, sources: [], instruction: 'x'
    });
    assert.deepEqual(routine.cadence, { kind: 'time', everyMs: 10_800_000 });
    // The SAME lazy evaluation path as Days — no second scheduler, no new engine method.
    const view = h.daemon.routineEngineInstance.project('game_polish', true, {}).routines[0];
    assert.equal(view.cadenceLabel, 'Every 3 hours');
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Polish-2. Below-minimum and non-hour-aligned time cadences are still rejected', async () => {
  const h = await daemonHarness();
  try {
    assert.throws(() => h.daemon.routineEngineInstance.create('game_polish', {
      name: 'Too fast', template: 'custom', cadence: { kind: 'time', everyMs: 30_000 }, sources: [], instruction: 'x'
    }), /1 hour and 30 days/);
    assert.throws(() => h.daemon.routineEngineInstance.create('game_polish', {
      name: 'Odd', template: 'custom', cadence: { kind: 'time', everyMs: 5_000_000 }, sources: [], instruction: 'x'
    }));
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Layer 2: the real browser script, DOM-driven
// ---------------------------------------------------------------------------

const GAME = 'game_git_trend';
const T0 = 1_800_000_000_000;

const defaultRoutine = (overrides = {}) => ({
  id: 'rt_default', name: 'Canonical Refresh', enabled: true, template: 'canonical-refresh',
  cadence: { kind: 'plays', every: 5 }, cadenceLabel: 'Every 5 Plays',
  targets: { strategyBoard: true, players: false }, targetsLabel: 'Strategy Board',
  due: false, lastSentLabel: 'Last sent: never', nextLabel: 'Next: in 5 Plays',
  sources: [], includeLocalRoot: true, ...overrides
});

function daemonStatus({ devMode = true, routines = [defaultRoutine()], gameId = GAME } = {}) {
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: 'Trend' },
    games: [{ gameId, displayName: 'Trend', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode },
    routines: { gameId, devMode, playCount: 0, routines },
    execution: { gameId, epoch: 'E1', serverNow: T0, byInstance: {} },
    at: T0
  };
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
  let onPatch = async (routineId, body) => {
    const routine = status.routines.routines.find((r) => r.id === routineId);
    if (routine) Object.assign(routine, body);
    return { success: true, routine, projection: status.routines };
  };
  let onSuggest = async () => ({ success: true, gameId: status.selectedGameId, suggestions: [] });
  let onBrowse = async (dir) => ({ success: true, gameId: status.selectedGameId, dir, entries: [] });
  let patchShouldFail = false;
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
      if (url.startsWith('/api/routines/sources/suggest')) return reply(200, await onSuggest());
      if (url.startsWith('/api/routines/sources/browse')) {
        const dir = new URL(url, 'http://x').searchParams.get('dir') || '';
        return reply(200, await onBrowse(dir));
      }
      if (url === '/api/routines/sources/check') return reply(200, { success: true, checks: [] });
      const mutateMatch = /^\/api\/routines\/([^/]+)$/.exec(url);
      if (mutateMatch && options.method === 'PATCH') {
        if (patchShouldFail) return reply(500, { success: false, message: "Coach couldn't save that." });
        return reply(200, await onPatch(mutateMatch[1], body));
      }
      if (mutateMatch && options.method === 'DELETE') return reply(200, { success: true, projection: status.routines });
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
    $, allText, find, findAll, posts,
    onSuggest: (fn) => { onSuggest = fn; },
    onBrowse: (fn) => { onBrowse = fn; },
    onPatch: (fn) => { onPatch = fn; },
    setPatchShouldFail: (value) => { patchShouldFail = value; },
    routineCards: () => page.findAll($('coachRoutinesList'), (n) => n.className === 'routine-card'),
    refresh: async () => { source.emit('status', { type: 'registry-change' }); await flush(); },
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
const cadenceControls = (card, page) => ({
  n: page.find(card, (el) => el.className === 'routine-cadence-n'),
  unit: page.find(card, (el) => el.className === 'routine-cadence-unit')
});

// ---------------------------------------------------------------------------

test('Polish-3. Plays cadence still round-trips exactly', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  const { n } = cadenceControls(card, page);
  n.value = '7';
  await page.change(n);
  const call = page.posts.find((p) => p.url === '/api/routines/rt_default' && p.body.cadence);
  assert.deepEqual(call.body.cadence, { kind: 'plays', every: 7 });
});

test('Polish-4. Hours cadence round-trips to the exact backend shape', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  const { n, unit } = cadenceControls(card, page);
  assert.ok(page.find(card, (el) => el.tagName === 'option' && el.value === 'hours'), 'Hours is offered alongside Plays and Days');
  unit.value = 'hours';
  await page.change(unit);
  n.value = '3';
  await page.change(n);
  const call = page.posts.filter((p) => p.url === '/api/routines/rt_default' && p.body.cadence).pop();
  assert.deepEqual(call.body.cadence, { kind: 'time', everyMs: 3 * 3_600_000 });
});

test('Polish-5. Days cadence still round-trips exactly (Hours did not regress it)', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  const { n, unit } = cadenceControls(card, page);
  unit.value = 'days';
  await page.change(unit);
  n.value = '2';
  await page.change(n);
  const call = page.posts.filter((p) => p.url === '/api/routines/rt_default' && p.body.cadence).pop();
  assert.deepEqual(call.body.cadence, { kind: 'time', everyMs: 2 * 86_400_000 });
});

test('Polish-6. Switching units re-bounds the number input (no stale Plays-sized value in Hours)', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  const { n, unit } = cadenceControls(card, page);
  assert.equal(n.max, '100', 'Plays bound');
  unit.value = 'hours';
  await page.change(unit);
  assert.equal(n.max, '72', 'Hours has its own bound, not left over from Plays');
  unit.value = 'days';
  await page.change(unit);
  assert.equal(n.max, '30', 'Days has its own bound');
});

test('Polish-7. No second scheduler or duplicate timer was introduced for Hours', () => {
  assert.match(pageSource, /setInterval\(tickElapsedClocks, 1_000\);/);
  assert.equal((pageSource.match(/setInterval\(/g) || []).length <= 3, true, 'no new repeating interval added beyond the pre-existing few');
  assert.doesNotMatch(pageSource, /\bcron\b/i);
});

test('Polish-8 / Polish-9 / Polish-10. Saved ✓ / Done: only after a real successful mutation, never presumed, Done disabled mid-save', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  assert.equal(page.find(card, (n) => n.className?.includes?.('routine-save-row')), null, 'no presumed Saved state on first paint');
  let resolvePatch;
  page.onPatch(() => new Promise((resolve) => { resolvePatch = resolve; }));
  const toggle = page.find(card, (n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Coach Refresh on or off');
  const changing = page.change(toggle);
  await flush();
  const savingText = page.find(page.routineCards()[0], (n) => n.className?.startsWith?.('routine-save-text'));
  assert.match(savingText.textContent, /Saving…/);
  const doneBtn = page.find(page.routineCards()[0], (n) => n.textContent === 'Done');
  assert.equal(doneBtn.disabled, true, 'Done must not imply completion while a save is in flight');
  resolvePatch({ success: true, routine: { ...defaultRoutine(), enabled: false }, projection: daemonStatus().routines });
  await changing;
  const savedText = page.find(page.routineCards()[0], (n) => n.className?.startsWith?.('routine-save-text'));
  assert.match(savedText.textContent, /Saved ✓/);
  assert.equal(page.find(page.routineCards()[0], (n) => n.textContent === 'Done').disabled, false);
});

test('Polish-11. A failed mutation never shows Saved ✓ and states the truth instead', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  page.setPatchShouldFail(true);
  const toggle = page.find(card, (n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Coach Refresh on or off');
  await page.change(toggle);
  const text = page.find(page.routineCards()[0], (n) => n.className?.startsWith?.('routine-save-text'));
  assert.doesNotMatch(text.textContent, /Saved ✓/);
  assert.match(text.textContent, /Couldn't save/);
});

test('Polish-12. Done closes transient browse/info state but never deletes the persisted configuration', async () => {
  const page = await startPage(daemonStatus({ routines: [defaultRoutine({ sources: [{ path: 'NORTH-STAR.md', kind: 'file', state: 'file' }] })] }));
  const card = page.routineCards()[0];
  await page.click(page.find(card, (n) => n.textContent === '+ Add references'));
  assert.ok(page.find(page.routineCards()[0], (n) => n.className === 'routine-browse'), 'browse panel open');
  const infoBtn = page.find(page.routineCards()[0], (n) => n.className === 'quiet info-btn');
  await page.click(infoBtn);
  assert.equal(page.find(page.routineCards()[0], (n) => n.className === 'routine-explainer').hidden, false, 'info expanded');

  // Trigger a real save so Done actually appears.
  const enabledToggle = page.find(page.routineCards()[0], (n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Coach Refresh on or off');
  await page.change(enabledToggle);
  const doneBtn = page.find(page.routineCards()[0], (n) => n.textContent === 'Done');
  await page.click(doneBtn);

  const freshCard = page.routineCards()[0];
  assert.equal(page.find(freshCard, (n) => n.className === 'routine-browse'), null, 'transient browse state closed');
  assert.equal(page.find(freshCard, (n) => n.className === 'routine-explainer')?.hidden ?? true, true, 'info collapsed');
  assert.equal(page.find(freshCard, (n) => n.className?.includes?.('routine-save-row')), null, 'the confidence row itself also calms back down');
  assert.match(page.allText(freshCard), /NORTH-STAR\.md/, 'the actual persisted configuration is untouched by Done');
});

test('Polish-13. The ⓘ info toggle is independent of the Send-to-Coach checkbox (no double-toggle)', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  const coachCheckbox = page.find(card, (n) => n.attributes['aria-label'] === 'Send to Coach');
  const infoBtn = page.find(card, (n) => n.className === 'quiet info-btn');
  const before = coachCheckbox.checked;
  await page.click(infoBtn);
  assert.equal(coachCheckbox.checked, before, 'clicking the info toggle never flips Send to Coach');
  assert.equal(page.find(page.routineCards()[0], (n) => n.className === 'routine-explainer').hidden, false);
  await page.click(page.find(page.routineCards()[0], (n) => n.className === 'quiet info-btn'));
  assert.equal(page.find(page.routineCards()[0], (n) => n.className === 'routine-explainer').hidden, true, 'a second click reliably collapses it again');
});

test('Polish-14. Send-to-Coach copy never mentions Players; the explainer is collapsed by default', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  const sub = page.find(card, (n) => n.tagName === 'span' && /Your Coach AI will be reminded/.test(n.textContent || ''));
  assert.ok(sub);
  assert.doesNotMatch(sub.textContent, /Player/i);
  const explainer = page.find(card, (n) => n.className === 'routine-explainer');
  assert.equal(explainer.hidden, true, 'no permanently-expanded explainer on first paint');
});

test('Polish-15. Checked selections survive exploring into a folder and back (no re-checking lost work)', async () => {
  const page = await startPage(daemonStatus());
  const card = page.routineCards()[0];
  page.onBrowse(async (dir) => (dir === ''
    ? { success: true, gameId: GAME, dir: '', entries: [{ name: 'README.md', path: 'README.md', kind: 'file' }, { name: 'Onboarding-Docs', path: 'Onboarding-Docs', kind: 'folder' }] }
    : { success: true, gameId: GAME, dir, entries: [{ name: 'a.md', path: `${dir}/a.md`, kind: 'file' }] }));
  await page.click(page.find(card, (n) => n.textContent === '+ Add references'));
  // Scoped to the browse panel specifically — the card also has the routine's own
  // ON/OFF, Send to Coach, and Send to Players checkboxes earlier in the same tree.
  const browsePanel = page.find(page.routineCards()[0], (n) => n.className === 'routine-browse');
  const readme = page.find(browsePanel, (n) => n.tagName === 'input');
  readme.checked = true; for (const fn of readme.listeners.change || []) fn();
  await flush();
  const openBtn = page.find(page.routineCards()[0], (n) => n.className === 'quiet routine-browse-open');
  await page.click(openBtn); // explore into Onboarding-Docs
  const addBtn = page.find(page.routineCards()[0], (n) => n.textContent?.startsWith('Add '));
  assert.equal(addBtn.textContent, 'Add 1 selected', 'the earlier selection was not silently lost by navigating deeper');
});
