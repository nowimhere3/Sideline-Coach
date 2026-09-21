// S53 Play 1 — Dad-safe Advanced Player Discovery.
//
// Raw adoptable developer terminals (powershell, node, bash, ...) are discovery TRUTH but not
// Dad-facing recruitment. They surface only when `devMode && advancedPlayerDiscovery`.
// This is a projection gate: the discovery cache, PlayerRoster discovery and the adoption
// endpoint are untouched.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Module from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const vscodeStub = {
  EventEmitter: class { get event() { return () => ({ dispose() {} }); } fire() {} dispose() {} },
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  window: { terminals: [], onDidOpenTerminal: () => ({ dispose() {} }), onDidCloseTerminal: () => ({ dispose() {} }) },
  workspace: { workspaceFolders: undefined }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, ...rest);
};

const { ControlPlaneDaemon } = await import('../out/control-plane/daemon.js');
const { DEFAULT_PREFERENCES, loadPreferences, savePreferences, projectDiscovery, advancedPlayerDiscoveryVisible } = await import('../out/running-players.js');

const GAME = 'game_apd';
const ADOPTABLE = [{ terminalName: 'powershell', shellPid: 111 }, { terminalName: 'node', shellPid: 222 }];
const CURATED = { playerType: 'terminal', displayName: 'Terminal', state: 'available', summary: 'Available', canAddNow: true, controlled: false };
const EXTERNAL = [{ playerType: 'claude', displayName: 'Claude', shellPid: 333 }];
const ELSEWHERE = [{ playerType: 'codex', displayName: 'Codex', gameLabel: 'Other Game' }];
const discovery = () => ({ catalog: [CURATED], externalCandidates: EXTERNAL, runningElsewhere: ELSEWHERE, adoptableTerminals: ADOPTABLE, externalScanSupported: true });

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

test('APD-1. Default preferences set advancedPlayerDiscovery=false', () => {
  assert.equal(DEFAULT_PREFERENCES.advancedPlayerDiscovery, false);
});

test('APD-2. Legacy saved preferences without the field load as false; non-boolean is false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apd-prefs-'));
  try {
    const file = path.join(dir, 'preferences.json');
    fs.writeFileSync(file, JSON.stringify({ runningPlayers: 'ask', devMode: true, livePlayerConsole: true }));
    assert.equal(loadPreferences(file).advancedPlayerDiscovery, false);
    fs.writeFileSync(file, JSON.stringify({ devMode: true, advancedPlayerDiscovery: 'yes' }));
    assert.equal(loadPreferences(file).advancedPlayerDiscovery, false);
    savePreferences(file, { ...DEFAULT_PREFERENCES, devMode: true, advancedPlayerDiscovery: true });
    assert.equal(loadPreferences(file).advancedPlayerDiscovery, true, 'round-trips');
    assert.equal(loadPreferences(path.join(dir, 'missing.json')).advancedPlayerDiscovery, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Projection (unit)
// ---------------------------------------------------------------------------

const project = (prefs, runningPlayers = 'ask') => projectDiscovery(discovery(), runningPlayers, advancedPlayerDiscoveryVisible(prefs));

test('APD-3. Dev Mode OFF + APD OFF → adoptableTerminals hidden', () => {
  assert.deepEqual(project({ devMode: false, advancedPlayerDiscovery: false }).adoptableTerminals, []);
});

test('APD-4. Dev Mode OFF + APD stored TRUE → still hidden', () => {
  assert.equal(advancedPlayerDiscoveryVisible({ devMode: false, advancedPlayerDiscovery: true }), false);
  assert.deepEqual(project({ devMode: false, advancedPlayerDiscovery: true }).adoptableTerminals, []);
});

test('APD-5. Dev Mode ON + APD OFF → hidden', () => {
  assert.deepEqual(project({ devMode: true, advancedPlayerDiscovery: false }).adoptableTerminals, []);
});

test('APD-6. Dev Mode ON + APD ON → visible exactly as discovered', () => {
  assert.deepEqual(project({ devMode: true, advancedPlayerDiscovery: true }).adoptableTerminals, ADOPTABLE);
});

test('APD-7. Curated Terminal stays visible and recruitable with APD OFF', () => {
  const view = project({ devMode: false, advancedPlayerDiscovery: false });
  const terminal = view.catalog.find((entry) => entry.playerType === 'terminal');
  assert.ok(terminal);
  assert.equal(terminal.canAddNow, true);
  assert.deepEqual(view.catalog, [CURATED], 'catalog untouched');
});

test('APD-8. externalCandidates are unchanged by the gate (only `ignore` clears them)', () => {
  for (const prefs of [{ devMode: false, advancedPlayerDiscovery: false }, { devMode: true, advancedPlayerDiscovery: true }]) {
    assert.deepEqual(project(prefs).externalCandidates, EXTERNAL);
  }
  assert.deepEqual(project({ devMode: true, advancedPlayerDiscovery: true }, 'ignore').externalCandidates, [], 'existing ignore behavior preserved');
});

test('APD-9. runningElsewhere is unchanged by the gate', () => {
  for (const prefs of [{ devMode: false, advancedPlayerDiscovery: false }, { devMode: true, advancedPlayerDiscovery: true }]) {
    assert.deepEqual(project(prefs).runningElsewhere, ELSEWHERE);
  }
});

test('APD-10. Projection does not mutate the underlying discovery truth', () => {
  const truth = discovery();
  const view = projectDiscovery(truth, 'ignore', false);
  assert.notEqual(view, truth);
  assert.deepEqual(truth.adoptableTerminals, ADOPTABLE);
  assert.deepEqual(truth.externalCandidates, EXTERNAL);
  assert.equal(projectDiscovery(truth, 'ask', true), truth, 'fully visible → same object');
  assert.equal(projectDiscovery(undefined, 'ask', false), null, 'not checked stays null');
});

// ---------------------------------------------------------------------------
// Daemon: persistence, validation, status projection
// ---------------------------------------------------------------------------

async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apd-daemon-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 40900 + Math.floor(Math.random() * 100), idleTimeoutMs: 60_000 });
  await daemon.start();
  const roster = [{ id: 'team', name: 'Players', instances: [] }];
  daemon.registryInstance.registerSession({
    instanceId: 'session-apd', stadiumId: 'stadium-apd', name: 'APD', platform: 'win32', socket: { readyState: 1, send() {}, close() {} },
    lastHeartbeat: Date.now(), game: { gameId: GAME, displayName: 'APD Game', fingerprintSource: 'test', repoUri: 'https://example.test/apd.git' },
    rootFsPath: 'C:\\Games\\APD', roster, capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  daemon.registryInstance.updateRoster('session-apd', roster);
  daemon.registryInstance.updateCapabilities('session-apd', []);
  daemon.discoveryByGame.set(GAME, discovery());
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    return { status: response.status, body: await response.json() };
  };
  const post = (body) => api('/api/preferences', { method: 'POST', body: JSON.stringify(body) });
  const discoveryNow = async () => (await api('/api/status')).body.playerDiscovery;
  const stop = async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { daemon, api, post, discoveryNow, stop };
}

test('APD-11. POST /api/preferences accepts and persists a boolean advancedPlayerDiscovery', async () => {
  const h = await daemonHarness();
  try {
    assert.equal((await h.api('/api/preferences')).body.preferences.advancedPlayerDiscovery, false, 'default OFF');
    const on = await h.post({ advancedPlayerDiscovery: true });
    assert.equal(on.status, 200);
    assert.equal(on.body.preferences.advancedPlayerDiscovery, true);
    assert.equal(on.body.message, 'Advanced Player Discovery is on.');
    assert.equal(on.body.preferences.devMode, false, 'other preferences untouched');
    assert.equal((await h.api('/api/preferences')).body.preferences.advancedPlayerDiscovery, true);
    assert.equal(loadPreferences(path.join(h.daemon.dir, 'preferences.json')).advancedPlayerDiscovery, true, 'persisted to disk');
    const off = await h.post({ advancedPlayerDiscovery: false });
    assert.equal(off.body.preferences.advancedPlayerDiscovery, false);
  } finally { await h.stop(); }
});

test('APD-12. Invalid advancedPlayerDiscovery values are rejected and change nothing', async () => {
  const h = await daemonHarness();
  try {
    for (const bad of ['true', 1, null, {}, []]) {
      const res = await h.post({ advancedPlayerDiscovery: bad });
      assert.equal(res.status, 400, `rejects ${JSON.stringify(bad)}`);
      assert.equal(res.body.success, false);
    }
    assert.equal((await h.api('/api/preferences')).body.preferences.advancedPlayerDiscovery, false);
  } finally { await h.stop(); }
});

test('APD-14. Status projection follows Dev Mode immediately; discovery truth is never mutated', async () => {
  const h = await daemonHarness();
  try {
    assert.deepEqual((await h.discoveryNow()).adoptableTerminals, [], 'default: Dad view');
    await h.post({ advancedPlayerDiscovery: true });
    assert.deepEqual((await h.discoveryNow()).adoptableTerminals, [], 'stored TRUE but Dev Mode OFF → hidden');
    await h.post({ devMode: true, gameId: GAME });
    const revealed = await h.discoveryNow();
    assert.deepEqual(revealed.adoptableTerminals, ADOPTABLE, 'Dev Mode + APD → visible');
    assert.deepEqual(revealed.catalog, [CURATED]);
    assert.deepEqual(revealed.externalCandidates, EXTERNAL);
    assert.deepEqual(revealed.runningElsewhere, ELSEWHERE);
    await h.post({ devMode: false, gameId: GAME });
    const hidden = await h.discoveryNow();
    assert.deepEqual(hidden.adoptableTerminals, [], 'Dev Mode off hides at once even though APD stays true');
    assert.equal((await h.api('/api/preferences')).body.preferences.advancedPlayerDiscovery, true, 'stored preference remains');
    assert.deepEqual(hidden.catalog, [CURATED], 'curated Terminal still recruitable');
    assert.deepEqual(hidden.externalCandidates, EXTERNAL);
    assert.deepEqual(hidden.runningElsewhere, ELSEWHERE);
    // APD-10 (daemon): the cache still holds the raw truth after every projection.
    assert.deepEqual(h.daemon.discoveryByGame.get(GAME).adoptableTerminals, ADOPTABLE);
  } finally { await h.stop(); }
});

// ---------------------------------------------------------------------------
// Browser: the toggle exists only under Dev Mode
// ---------------------------------------------------------------------------

const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      closest() { return null; },
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
      if (url === '/api/preferences' && options.method === 'POST') {
        posts.push(body);
        status = { ...status, preferences: { ...status.preferences, ...body } };
        return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' });
      }
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const page = {
    $, posts,
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await wait(15); },
    change: async (node, checked) => { node.checked = checked; for (const fn of node.listeners.change || []) await fn({ target: node }); await wait(15); },
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

const uiStatus = (preferences) => ({
  success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
  game: { gameId: GAME, displayName: 'APD' }, games: [{ gameId: GAME, displayName: 'APD', connectionStatus: 'connected' }],
  stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' }, rosterSynchronized: true,
  players: [], capabilities: [], queue: [], routing: { mode: 'auto', capabilities: [], activeDecision: null }, routingMode: 'auto', reports: [],
  playerDiscovery: null, preferences: { runningPlayers: 'ask', livePlayerConsole: false, ...preferences }, at: 1_800_000_000_000,
  execution: { gameId: GAME, epoch: 'E1', serverNow: 1_800_000_000_000, byInstance: {} }
});

test('APD-13. The toggle is shown only in Dev Mode, is separate from View Player Terminal, and saves only its own field', async () => {
  const off = await createPage(uiStatus({ devMode: false, advancedPlayerDiscovery: true })).start();
  assert.equal(off.$('advancedPlayerDiscoveryCard').hidden, true, 'hidden outside Dev Mode');

  const on = await createPage(uiStatus({ devMode: true, advancedPlayerDiscovery: false })).start();
  assert.equal(on.$('advancedPlayerDiscoveryCard').hidden, false);
  assert.equal(on.$('advancedPlayerDiscoveryToggle').checked, false, 'default OFF');
  assert.equal(on.$('livePlayerConsoleToggle').checked, false);
  await on.change(on.$('advancedPlayerDiscoveryToggle'), true);
  assert.deepEqual(on.posts, [{ advancedPlayerDiscovery: true }], 'does not touch livePlayerConsole');
  assert.equal(on.$('advancedPlayerDiscoveryToggle').checked, true);
  assert.equal(on.$('livePlayerConsoleToggle').checked, false, 'View Player Terminal unchanged');

  await on.refresh(uiStatus({ devMode: false, advancedPlayerDiscovery: true }));
  assert.equal(on.$('advancedPlayerDiscoveryCard').hidden, true, 'turning Dev Mode off hides the setting at once');
});

// ---------------------------------------------------------------------------
// Scope guard
// ---------------------------------------------------------------------------

test('APD-15. Adoption endpoints and PlayerRoster discovery stay ungated (hidden != forbidden)', () => {
  const daemonSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'daemon.ts'), 'latin1');
  for (const route of ['/api/players/adopt-terminal', '/api/players/adopt']) {
    const start = daemonSource.indexOf(`requestUrl.pathname === '${route}'`);
    assert.ok(start > 0, `${route} route exists`);
    const handler = daemonSource.slice(start, start + 400);
    assert.ok(!/advancedPlayerDiscovery/.test(handler), `${route} is not gated by the preference`);
  }
  const rosterSource = fs.readFileSync(path.join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  assert.ok(!/advancedPlayerDiscovery/.test(rosterSource), 'PlayerRoster discovery knows nothing of the gate');
  const routerSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'router.ts'), 'utf8');
  assert.ok(!/advancedPlayerDiscovery/.test(routerSource), 'AUTO routing knows nothing of the gate');
});
