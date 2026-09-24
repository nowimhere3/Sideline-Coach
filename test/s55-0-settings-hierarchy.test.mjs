// S55.0 — Settings UI/UX Hierarchy and Dev Mode Visibility Pass
//
// Proof for:
// - Dev Mode as master visibility gate (developer-only absent when OFF, visible when ON)
// - View Player Terminal as parent feature card with nested child cards:
//     * Terminal Success Retention
//     * Advanced Player Discovery
// - Scout Intelligence: normal controls visible, developer subsection absent when Dev Mode OFF, visible inside card when Dev Mode ON
// - Preference semantics & persistence preserved with zero execution changes
// - Responsive layout styles for desktop and narrow screens
// - Breadcrumbs: FINAL-SETTINGS-UX-PASS graduated, AUTHENTICATED-DEVELOPER-TERMINAL-FIDELITY placed at sanitization seam
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Module from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];

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

const GAME = 'game_s55';
const T0 = 1_800_000_000_000;

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries({ sidelineCoachToken: 'test-token', ...initial }));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
}

function daemonStatus({ preferences = {}, now = T0, gameId = GAME } = {}) {
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: 'Test Game' },
    games: [{ gameId, displayName: 'Test Game', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [{ id: 'team', name: 'Team', instances: [] }],
    capabilities: [],
    queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode: false, livePlayerConsole: false, advancedPlayerDiscovery: false, terminalRetention: '5m', ...preferences },
    at: now,
    execution: { gameId, epoch: 'E1', serverNow: now, byInstance: {} }
  };
}

function createIndexedDb(records = new Map()) {
  const db = {
    objectStoreNames: { contains: () => true }, createObjectStore() {},
    transaction: () => ({ objectStore: () => ({
      put(record) { records.set(record.sectionId, { ...record }); },
      get(sectionId) {
        const request = {};
        queueMicrotask(() => { request.result = records.get(sectionId); request.onsuccess?.(); });
        return request;
      },
      getAll() {
        const request = {};
        queueMicrotask(() => { request.result = [...records.values()]; request.onsuccess?.(); });
        return request;
      }
    }) })
  };
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
      return request;
    }
  };
}

function createTestPage(initialStatus, { scoutAvailable = true, scoutConfigured = true, indexedDB, frames } = {}) {
  const elements = new Map();
  const doc = { activeElement: null };
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList: {
        classes: new Set(),
        add(...t) { for (const x of t) this.classes.add(x); },
        remove(...t) { for (const x of t) this.classes.delete(x); },
        toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
        contains(c) { return this.classes.has(c); }
      },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child));
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      insertBefore(child, before) {
        child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child));
        child.parentNode = this;
        const index = before ? this.children.indexOf(before) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
      },
      replaceChildren(...kids) {
        for (const c of this.children) c.parentNode = null;
        this.children = [];
        for (const kid of kids) this.appendChild(kid);
      },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; },
      closest(selector) {
        for (let n = this; n; n = n.parentNode) {
          if (selector === '#livePlayerConsoleCard' && n.id === 'livePlayerConsoleCard') return n;
          if (selector === '.card' && n.classList.contains('card')) return n;
          if (selector === '[data-settings-card]' && n.dataset.settingsCard) return n;
        }
        return null;
      },
      focus() { doc.activeElement = this; }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); } });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { for (const c of node.children) c.parentNode = null; node.children = []; } });
    Object.defineProperty(node, 'nextSibling', { get: () => {
      const siblings = node.parentNode?.children || [];
      const index = siblings.indexOf(node);
      return index >= 0 ? (siblings[index + 1] || null) : null;
    } });
    return node;
  };

  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  };

  let source;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
    emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); }
    close() {}
  }

  let status = initialStatus;
  const posts = [];
  const requests = [];

  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), addEventListener() {}, body: makeNode('body'),
    querySelector: () => null, querySelectorAll: () => [], elementFromPoint: () => null
  });

  const settingsCards = {
    mode: 'modeSettingsCard', 'player-terminal': 'livePlayerConsoleCard', 'scout-intelligence': 'scoutOpenRouterCard',
    'coach-routines': 'coachRoutinesCard', 'game-setup': 'gameSetupCard', routing: 'routingSettingsCard',
    'players-providers': 'playersProvidersCard', 'usage-budgets': 'usageBudgetsSettingsCard', stadiums: 'stadiumsSettingsCard',
    'github-repositories': 'githubRepositoriesSettingsCard', 'time-format': 'timeFormatCard', 'ai-usage-scorecard': 'aiScoreboardSettingsCard',
    'remote-access': 'remoteAccessSettingsCard'
  };
  for (const [sectionId, cardId] of Object.entries(settingsCards)) {
    const card = $(cardId); card.dataset.settingsCard = sectionId; card.classList.add('card', 'settings-card');
    card.getBoundingClientRect = () => ({ top: 0, height: 100 });
    $('settingsList').appendChild(card);
  }

  const ctx = {
    document: doc, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: memoryStorage(),
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ url, method: options.method || 'GET', body });
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url.startsWith('/api/player-activity')) return reply(200, { success: true, sessionKey: 'sess_1', entries: [] });
      if (url.startsWith('/api/scout/openrouter-credential')) return reply(200, { success: true, available: scoutAvailable, configured: scoutConfigured });
      if (url.startsWith('/api/scout/formation-receivers')) return reply(200, { success: true, receivers: [{ id: 'scout-1', player: 'Scout 1', provider: 'openrouter' }] });
      if (url === '/api/preferences' && options.method === 'POST') {
        posts.push(body);
        status = { ...status, preferences: { ...status.preferences, ...body } };
        return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' });
      }
      return reply(200, {});
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms ?? 0),
    clearTimeout, setInterval: () => 1, clearInterval: () => {},
    Date: class extends Date { static now() { return T0; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }, indexedDB,
    // Optional manual animation-frame queue (drag tests); absent = synchronous fallback.
    ...(frames ? { requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; }, cancelAnimationFrame: () => {} } : {})
  };

  const script = new vm.Script(pageScript);
  const context = vm.createContext(ctx);
  script.runInContext(context);

  // Connect the page
  source.emit('hello');

  return {
    $, posts, requests, doc,
    openSettings: async () => {
      for (const listener of $('settingsBtn').listeners['click'] || []) {
        await listener();
      }
      await new Promise((r) => setTimeout(r, 20));
    },
    applyStatus: async (s) => {
      status = s;
      source.emit('status', s);
      await new Promise((r) => setTimeout(r, 20));
    },
    change: async (node, checked = true) => {
      node.checked = checked;
      for (const listener of node.listeners['change'] || []) {
        await listener({ target: node });
      }
      await new Promise((r) => setTimeout(r, 20));
    },
    click: async (node) => {
      for (const listener of node.listeners['click'] || []) await listener({ target: node, currentTarget: node });
      await new Promise((r) => setTimeout(r, 20));
    }
  };
}

test('DISC-1. Dev/Dad switch preserves the existing boolean and names both states', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: false } }));
  await page.applyStatus(daemonStatus({ preferences: { devMode: false } }));
  assert.equal(page.$('modeSettingTitle').textContent, 'Dad Mode');
  assert.match(page.$('modeSettingDescription').textContent, /^Simple by default\./);
  assert.equal(page.$('devModeToggle').getAttribute('aria-label'), 'Turn on Dev Mode');
  await page.applyStatus(daemonStatus({ preferences: { devMode: true } }));
  assert.equal(page.$('modeSettingTitle').textContent, 'Dev Mode');
  assert.match(page.$('modeSettingDescription').textContent, /^Advanced tools are visible\./);
  assert.equal(page.$('devModeToggle').getAttribute('aria-label'), 'Turn off Dev Mode');
  assert.equal(pageSource.includes('id="modeSwitchState"'), false, 'no redundant visible state label');
  page.$('devModeToggle').checked = false;
  await page.change(page.$('devModeToggle'), true);
  assert.equal(page.posts.some((post) => post.devMode === true), true);
});

test('DISC-2. disclosure defaults, controls, accessibility, and IndexedDB restore are shared', async () => {
  const indexedDB = createIndexedDb(new Map([
    ['ai-usage-scorecard', { sectionId: 'ai-usage-scorecard', expanded: true }],
    ['unknown-future-section', { sectionId: 'unknown-future-section', expanded: true }]
  ]));
  const page = createTestPage(daemonStatus(), { indexedDB });
  await page.openSettings();
  assert.equal(page.$('gameSetupDisclosureBody').hidden, false, 'Game Setup defaults open');
  for (const id of ['playerTerminalDisclosureBody', 'scoutIntelligenceDisclosureBody', 'coachRoutinesDisclosureBody', 'playersProvidersDisclosureBody', 'timeFormatDisclosureBody']) {
    assert.equal(page.$(id).hidden, true, `${id} defaults collapsed`);
  }
  assert.equal(page.$('aiUsageScorecardDisclosureBody').hidden, false, 'remembered open state wins');
  await page.click(page.$('gameSetupDisclosureButton'));
  assert.equal(page.$('gameSetupDisclosureBody').hidden, true, 'collapse hides the existing body');
  assert.equal(indexedDB.records.get('game-setup').expanded, false, 'closed state persisted');
  await page.click(page.$('timeFormatDisclosureButton'));
  assert.equal(page.$('timeFormatDisclosureBody').hidden, false, 'expand reveals existing controls');
  assert.equal(indexedDB.records.get('time-format').expanded, true, 'open state persisted');
  await page.click(page.$('coachRoutinesDisclosureButton'));
  assert.equal(page.$('coachRoutinesDisclosureBody').hidden, false, 'Coach Routines expands through the shared control');
  assert.equal(indexedDB.records.get('coach-routines').expanded, true, 'Coach Routines disclosure persisted');

  const returned = createTestPage(daemonStatus(), { indexedDB });
  await returned.openSettings();
  assert.equal(returned.$('gameSetupDisclosureBody').hidden, true, 'returning restores remembered closed state');
  assert.equal(returned.$('timeFormatDisclosureBody').hidden, false, 'returning restores remembered open state');
  assert.equal(returned.$('coachRoutinesDisclosureBody').hidden, false, 'returning restores Coach Routines state');
});

test('ORDER-1. remembered order validates IDs, retains hidden cards, and appends newly known cards', async () => {
  const indexedDB = createIndexedDb(new Map([
    ['settings-card-order', { sectionId: 'settings-card-order', order: ['ai-usage-scorecard', 'unknown-old-card', 'coach-routines', 'player-terminal'] }]
  ]));
  const page = createTestPage(daemonStatus({ preferences: { devMode: false } }), { indexedDB });
  await page.openSettings();
  const order = page.$('settingsList').children.map((card) => card.dataset.settingsCard);
  assert.deepEqual(order.slice(0, 3), ['ai-usage-scorecard', 'coach-routines', 'player-terminal']);
  assert.equal(order.includes('unknown-old-card'), false);
  assert.equal(order.includes('time-format'), true, 'newly introduced card remains present');
  assert.equal(page.$('coachRoutinesCard').hidden, true, 'hidden Dev-only card stays in the ordered DOM');
});

test('ORDER-2. mouse and touch/pointer handle drags reorder and persist independently from disclosure state', async () => {
  const indexedDB = createIndexedDb(new Map([
    ['game-setup', { sectionId: 'game-setup', expanded: false }]
  ]));
  const page = createTestPage(daemonStatus(), { indexedDB });
  await page.openSettings();
  const dragged = page.$('aiScoreboardSettingsCard');
  const target = page.$('modeSettingsCard');
  const handle = dragged.children.find((child) => child.className === 'settings-drag-handle');
  assert.ok(handle, 'handle alone owns pointer listeners');
  assert.equal((dragged.listeners.pointerdown || []).length, 0, 'card itself is not draggable');
  page.doc.elementFromPoint = () => target;
  for (const listener of handle.listeners.pointerdown || []) listener({ button: 0, pointerId: 1, pointerType: 'mouse', preventDefault() {} });
  for (const listener of handle.listeners.pointermove || []) listener({ clientX: 1, clientY: -1, pointerType: 'mouse' });
  for (const listener of handle.listeners.pointerup || []) listener({ pointerId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(page.$('settingsList').children[0], dragged, 'mouse drag moves the card');
  assert.equal(indexedDB.records.get('settings-card-order').order[0], 'ai-usage-scorecard');
  assert.equal(indexedDB.records.get('game-setup').expanded, false, 'order does not overwrite disclosure memory');
  await page.click(page.$('settingsBackBtn'));
  await page.openSettings();
  assert.equal(page.$('settingsList').children[0], dragged, 'leaving and reopening Settings restores the order');

  const touchTarget = page.$('timeFormatCard');
  page.doc.elementFromPoint = () => touchTarget;
  for (const listener of handle.listeners.pointerdown || []) listener({ button: 0, pointerId: 2, pointerType: 'touch', preventDefault() {} });
  for (const listener of handle.listeners.pointermove || []) listener({ clientX: 1, clientY: 99, pointerType: 'touch' });
  for (const listener of handle.listeners.pointerup || []) listener({ pointerId: 2 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(page.$('settingsList').children.indexOf(dragged), page.$('settingsList').children.indexOf(touchTarget) + 1, 'touch pointer can place after target');

  const reloaded = createTestPage(daemonStatus(), { indexedDB });
  await reloaded.openSettings();
  assert.equal(reloaded.$('settingsList').children.map((card) => card.dataset.settingsCard).join(','), indexedDB.records.get('settings-card-order').order.join(','), 'reload restores order');
});

test('DISC-3. disclosure markup is button-based, responsive, bounded, and does not wrap Routing', () => {
  for (const id of ['gameSetup', 'playerTerminal', 'scoutIntelligence', 'coachRoutines', 'playersProviders', 'timeFormat', 'aiUsageScorecard', 'remoteAccess']) {
    assert.match(pageSource, new RegExp(`<button id="${id}DisclosureButton"[^>]*aria-expanded="(?:true|false)"[^>]*aria-controls="${id}DisclosureBody"`));
  }
  assert.match(pageSource, /\.settings-disclosure-body \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
  assert.match(pageSource, /@media \(max-width: 460px\)[\s\S]*\.settings-disclosure-body \{ padding: 0 14px 14px; \}/);
  const routingCard = pageSource.slice(pageSource.indexOf('<h3>Routing</h3>') - 200, pageSource.indexOf('<h3>Routing</h3>'));
  assert.doesNotMatch(routingCard, /settings-disclosure/);
});

// ---------------------------------------------------------------------------
// UX-1 to UX-5: Settings UI Hierarchy & Gating
// ---------------------------------------------------------------------------

test('UX-1. Dev Mode OFF hides the View Player Terminal developer feature family', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: false, livePlayerConsole: true, advancedPlayerDiscovery: true, terminalRetention: '30m' } }));
  await page.applyStatus(daemonStatus({ preferences: { devMode: false, livePlayerConsole: true, advancedPlayerDiscovery: true, terminalRetention: '30m' } }));

  assert.equal(page.$('livePlayerConsoleCard').hidden, true, 'parent feature card is hidden');
  assert.equal(page.$('terminalRetentionCard').hidden, true, 'Terminal Success Retention child is hidden');
  assert.equal(page.$('advancedPlayerDiscoveryCard').hidden, true, 'Advanced Player Discovery child is hidden');
});

test('UX-2. Dev Mode ON shows the View Player Terminal parent feature', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: true, livePlayerConsole: false, advancedPlayerDiscovery: false } }));
  await page.applyStatus(daemonStatus({ preferences: { devMode: true, livePlayerConsole: false, advancedPlayerDiscovery: false } }));

  assert.equal(page.$('livePlayerConsoleCard').hidden, false, 'parent feature card is visible');
  assert.equal(page.$('advancedPlayerDiscoveryCard').hidden, false, 'discovery child card is visible inside parent');
  assert.equal(page.$('terminalRetentionCard').hidden, true, 'retention child card hidden while console toggle is off');
});

test('UX-3 & UX-4 & UX-5. Child setting cards are nested inside View Player Terminal parent and not flat siblings', () => {
  const terminalIndex = pageSource.indexOf('id="livePlayerConsoleCard"');
  const retentionIndex = pageSource.indexOf('id="terminalRetentionCard"');
  const discoveryIndex = pageSource.indexOf('id="advancedPlayerDiscoveryCard"');
  const scoutIndex = pageSource.indexOf('id="scoutOpenRouterCard"');

  assert.ok(terminalIndex > 0, 'livePlayerConsoleCard exists');
  assert.ok(retentionIndex > terminalIndex, 'terminalRetentionCard is after livePlayerConsoleCard start');
  assert.ok(discoveryIndex > retentionIndex, 'advancedPlayerDiscoveryCard is after terminalRetentionCard');
  assert.ok(discoveryIndex < scoutIndex, 'both children are before scoutOpenRouterCard');

  const parentSlice = pageSource.slice(terminalIndex, scoutIndex);
  assert.ok(parentSlice.includes('class="settings-children"'), 'contains settings-children container');
  assert.ok(parentSlice.includes('id="terminalRetentionCard"'), 'terminalRetentionCard is nested inside parent card');
  assert.ok(parentSlice.includes('id="advancedPlayerDiscoveryCard"'), 'advancedPlayerDiscoveryCard is nested inside parent card');

  // Verify child cards use settings-child-card class
  assert.match(pageSource, /<div id="terminalRetentionCard" class="card settings-card settings-child-card"/);
  assert.match(pageSource, /<div id="advancedPlayerDiscoveryCard" class="card settings-card settings-child-card"/);
});

// ---------------------------------------------------------------------------
// UX-6 to UX-9: Preference semantics and independence
// ---------------------------------------------------------------------------

test('UX-6. Existing View Player Terminal preference behavior remains intact', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: true, livePlayerConsole: false } }));
  await page.applyStatus(daemonStatus({ preferences: { devMode: true, livePlayerConsole: false } }));
  assert.equal(page.$('livePlayerConsoleToggle').checked, false);

  page.$('livePlayerConsoleToggle').checked = true;
  await page.change(page.$('livePlayerConsoleToggle'));

  assert.ok(page.posts.some((p) => p.livePlayerConsole === true), 'saves livePlayerConsole toggle');
});

test('UX-7. Existing Terminal Success Retention persistence remains intact', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: true, livePlayerConsole: true, terminalRetention: '5m' } }));
  await page.applyStatus(daemonStatus({ preferences: { devMode: true, livePlayerConsole: true, terminalRetention: '5m' } }));

  assert.equal(page.$('terminalRetention5m').checked, true);
  page.$('terminalRetentionUntilDismissed').checked = true;
  await page.change(page.$('terminalRetentionUntilDismissed'));

  assert.ok(page.posts.some((p) => p.terminalRetention === 'until-dismissed'), 'saves terminalRetention');
});

test('UX-8. Existing Advanced Player Discovery persistence remains intact', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: true, advancedPlayerDiscovery: false } }));
  await page.applyStatus(daemonStatus({ preferences: { devMode: true, advancedPlayerDiscovery: false } }));

  assert.equal(page.$('advancedPlayerDiscoveryToggle').checked, false);
  page.$('advancedPlayerDiscoveryToggle').checked = true;
  await page.change(page.$('advancedPlayerDiscoveryToggle'));

  assert.ok(page.posts.some((p) => p.advancedPlayerDiscovery === true), 'saves advancedPlayerDiscovery');
});

test('UX-9. Visual nesting does not invent a new persisted dependency between APD and View Player Terminal', async () => {
  // Turning View Player Terminal off does NOT change APD setting
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's55-prefs-'));
  try {
    const file = path.join(dir, 'preferences.json');
    savePreferences(file, { runningPlayers: 'ask', devMode: true, livePlayerConsole: false, advancedPlayerDiscovery: true, terminalRetention: '5m' });
    const loaded = loadPreferences(file);
    assert.equal(loaded.livePlayerConsole, false);
    assert.equal(loaded.advancedPlayerDiscovery, true);

    // APD projection remains active when APD is true, even if livePlayerConsole is false
    assert.equal(advancedPlayerDiscoveryVisible({ devMode: true, livePlayerConsole: false, advancedPlayerDiscovery: true }), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UX-10 to UX-13: Scout Intelligence Gating
// ---------------------------------------------------------------------------

test('UX-10 & UX-11. Scout Intelligence normal controls visible when Dev Mode OFF; dev section absent', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: false } }), { scoutAvailable: true });
  await page.applyStatus(daemonStatus({ preferences: { devMode: false } }));
  await page.openSettings();

  assert.equal(page.$('scoutOpenRouterCard').hidden, false, 'Scout Intelligence card is visible');
  assert.equal(page.$('scoutFormationOperator').hidden, true, 'dev-only Field one READY Scout is absent');
});

test('UX-12. Dev Mode · Field one READY Scout appears inside Scout Intelligence when Dev Mode is ON', async () => {
  const page = createTestPage(daemonStatus({ preferences: { devMode: true } }), { scoutAvailable: true });
  await page.applyStatus(daemonStatus({ preferences: { devMode: true } }));
  await page.openSettings();

  assert.equal(page.$('scoutOpenRouterCard').hidden, false, 'Scout Intelligence card is visible');
  assert.equal(page.$('scoutFormationOperator').hidden, false, 'dev section is visible');

  // Verify DOM nesting: scoutFormationOperator is inside scoutOpenRouterCard
  const scoutCardIndex = pageSource.indexOf('id="scoutOpenRouterCard"');
  const operatorIndex = pageSource.indexOf('id="scoutFormationOperator"');
  const routinesIndex = pageSource.indexOf('id="coachRoutinesCard"');

  assert.ok(operatorIndex > scoutCardIndex, 'operator is after scoutOpenRouterCard start');
  assert.ok(operatorIndex < routinesIndex, 'operator is inside scoutOpenRouterCard, before next card');
});

test('UX-13. No duplicate Scout dev subsection exists', () => {
  const matches = pageSource.match(/Dev Mode · Field one READY Scout/g) || [];
  assert.equal(matches.length, 1, 'exactly one instance of the subsection');
});

// ---------------------------------------------------------------------------
// UX-14 to UX-16: Execution semantics & substrate isolation
// ---------------------------------------------------------------------------

test('UX-14 & UX-15 & UX-16. Dev Mode changes no execution semantics', () => {
  const forbiddenFiles = [
    'src/terminal-player.ts',
    'src/terminal-intent.ts',
    'src/control-plane/router.ts',
    'src/control-plane/work-ledger.ts',
    'src/scout-formation.ts',
    'src/scout-combine.ts',
    'src/scout-player.ts'
  ];
  for (const file of forbiddenFiles) {
    const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    // Ensure these execution engines don't reference visual UI hierarchy
    assert.ok(!content.includes('settings-child-card'), `${file} must not know about settings hierarchy`);
    assert.ok(!content.includes('settings-children'), `${file} must not know about settings hierarchy`);
  }
});

// ---------------------------------------------------------------------------
// UX-17 & UX-18: Styling & Responsive Hierarchy
// ---------------------------------------------------------------------------

test('UX-17 & UX-18. Settings visual styling: nested card CSS and responsive rules exist', () => {
  const css = pageSource.slice(0, pageSource.indexOf('</style>'));

  // Hidden reset rule guaranteeing elements with hidden are never displayed
  assert.match(css, /\[hidden\] \{\s*display: none !important;\s*\}/, 'universal hidden rule');
  assert.match(css, /\.scout-credential-body\[hidden\] \{\s*display: none !important;\s*\}/, 'scout-credential-body hidden rule');

  // Nested card CSS: background, border, radius language matching Sideline Roster grammar
  assert.match(css, /\.card\.settings-child-card \{\s*background: var\(--card-2\);\s*border: 1px solid var\(--line\);\s*border-radius: 14px;/);
  assert.match(css, /\.settings-children \{\s*display: grid;\s*gap: 10px;\s*margin-top: 14px;\s*\}/);

  // Narrow/mobile responsive rule
  assert.match(css, /@media \(max-width: 460px\) \{\s*\.card\.settings-child-card \{\s*padding: 10px 12px;\s*\}/);
});

// ---------------------------------------------------------------------------
// UX-19 & UX-20: Breadcrumbs
// ---------------------------------------------------------------------------

test('UX-19. FINAL-SETTINGS-UX-PASS breadcrumb is graduated into SETTINGS-UX-HIERARCHY', () => {
  assert.equal(pageSource.includes('BREADCRUMB: FINAL-SETTINGS-UX-PASS'), false, 'no unresolved FINAL-SETTINGS-UX-PASS comment');

  const matches = [...pageSource.matchAll(/<!--([\s\S]*?)-->/g)].filter((m) => m[1].includes('BREADCRUMB: SETTINGS-UX-HIERARCHY'));
  assert.equal(matches.length, 1, 'exactly one graduated durable breadcrumb');
  const [full] = matches;
  assert.match(full[1], /Developer settings preserve feature ownership visually/);
  assert.match(full[1], /Dev Mode gates developer-only presentation/);
  assert.match(full[1], /Child settings/);
});

test('UX-20. Remote terminal redaction breadcrumb owns the narrow authenticated-device override', () => {
  const activitySrc = fs.readFileSync(path.join(repoRoot, 'src', 'player-activity.ts'), 'utf8');

  assert.ok(activitySrc.includes('BREADCRUMB: REMOTE-TERMINAL-REDACTION-BOUNDARY'));
  assert.ok(activitySrc.includes('redacted for remote devices by default'));
  assert.ok(activitySrc.includes('Show sensitive terminal output on paired devices'));
  assert.ok(activitySrc.includes('report/file redaction, blocked paths, credentials'));
  assert.ok(activitySrc.includes('Local terminal UX keeps'));
});

// ---------------------------------------------------------------------------
// Physical drag polish: lifted real card + placeholder, rAF-coalesced pointer
// work, and ONE idempotent cleanup path (pointerup / pointercancel / lostpointercapture).
// ---------------------------------------------------------------------------

const fire = (node, type, event = {}) => { for (const listener of node.listeners[type] || []) listener({ preventDefault() {}, ...event }); };
const handleOf = (card) => card.children.find((child) => child.className === 'settings-drag-handle');
const placeholders = (page) => page.$('settingsList').children.filter((c) => c.className === 'settings-drag-placeholder');
const hasDropLine = (page) => page.$('settingsList').children.some((c) => c.classList?.contains('settings-drop-before') || c.classList?.contains('settings-drop-after'));
const assertClean = (page, card, label) => {
  assert.equal(placeholders(page).length, 0, `${label}: no placeholder left`);
  assert.equal(card.classList.contains('settings-card-lifted') || card.classList.contains('settings-card-dragging'), false, `${label}: no lifted/dragging class`);
  assert.equal(hasDropLine(page), false, `${label}: no insertion line`);
  assert.equal(page.doc.body.classList.contains('settings-reordering'), false, `${label}: body drag state cleared`);
  for (const prop of ['position', 'top', 'left', 'width', 'transform']) assert.equal(card.style[prop] || '', '', `${label}: inline ${prop} cleared`);
};

test('ORDER-3. pickup lifts the real card over a same-size placeholder; pointer work is rAF-coalesced; drop commits and leaves nothing behind', async () => {
  const frames = [];
  const indexedDB = createIndexedDb(new Map());
  const page = createTestPage(daemonStatus(), { indexedDB, frames });
  await page.openSettings();
  const list = page.$('settingsList');
  const dragged = page.$('aiScoreboardSettingsCard');
  const target = page.$('modeSettingsCard');
  dragged.getBoundingClientRect = () => ({ top: 400, left: 20, width: 700, height: 900 }); // a tall, expanded card
  const handle = handleOf(dragged);
  let hitTests = 0;
  page.doc.elementFromPoint = () => { hitTests += 1; return target; };

  fire(handle, 'pointerdown', { button: 0, pointerId: 7, pointerType: 'touch', clientX: 30, clientY: 420 });
  assert.equal(dragged.classList.contains('settings-card-lifted'), true, 'the real card lifts');
  assert.equal(dragged.style.position, 'fixed', 'lifted out of flow');
  assert.equal(dragged.style.width, '700px', 'keeps its original width');
  const [ph] = placeholders(page);
  assert.ok(ph, 'a placeholder holds the layout slot');
  assert.equal(ph.style.height, '900px', 'placeholder is exactly the tall card height');
  assert.equal(list.children.indexOf(ph) + 1, list.children.indexOf(dragged), 'placeholder takes the card slot');
  assert.equal(page.doc.body.classList.contains('settings-reordering'), true, 'no text selection while carrying');

  for (let i = 0; i < 30; i += 1) fire(handle, 'pointermove', { clientX: 30, clientY: 400 - i * 15, pointerType: 'touch' });
  assert.equal(frames.length, 1, '30 pointer events schedule ONE animation frame');
  assert.equal(hitTests, 0, 'no hit-testing on the raw pointer stream');
  frames.shift()();
  assert.equal(hitTests, 1, 'one hit-test per frame');
  assert.equal(dragged.style.transform.startsWith('translate3d(0px, -455px, 0)'), true, `the card is carried to the latest pointer position (${dragged.style.transform})`);
  assert.equal(list.children.indexOf(placeholders(page)[0]), list.children.indexOf(target) - 1, 'placeholder moved to the destination');
  assert.equal(list.children.indexOf(dragged) > 1, true, 'the real card has NOT been moved in the DOM while carried');

  list.children[1].classList.add('settings-drop-after'); // a stale indicator from any source
  fire(handle, 'pointerup', { pointerId: 7 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(list.children[0], dragged, 'drop commits the placeholder position');
  assertClean(page, dragged, 'after drop');
  assert.equal(indexedDB.records.get('settings-card-order').order[0], 'ai-usage-scorecard', 'same IndexedDB record shape');
  fire(handle, 'lostpointercapture', { pointerId: 7 });
  assert.equal(list.children[0], dragged, 'the implicit post-up lostpointercapture is a harmless no-op');
});

test('ORDER-4. pointercancel and lostpointercapture fully clean up and keep the original order; self/hidden targets never leave indicators', async () => {
  const indexedDB = createIndexedDb(new Map());
  const page = createTestPage(daemonStatus({ preferences: { devMode: false } }), { indexedDB });
  await page.openSettings();
  const list = page.$('settingsList');
  const dragged = page.$('aiScoreboardSettingsCard');
  const handle = handleOf(dragged);
  const original = list.children.map((c) => c.dataset.settingsCard).join(',');

  for (const ending of ['pointercancel', 'lostpointercapture']) {
    page.doc.elementFromPoint = () => page.$('modeSettingsCard');
    fire(handle, 'pointerdown', { button: 0, pointerId: 3, clientX: 0, clientY: 0 });
    fire(handle, 'pointermove', { clientX: 0, clientY: -50 });
    assert.equal(placeholders(page).length, 1);
    fire(handle, ending, { pointerId: 3 });
    assertClean(page, dragged, ending);
    assert.equal(list.children.map((c) => c.dataset.settingsCard).join(','), original, `${ending} keeps the original order`);
    assert.equal(indexedDB.records.has('settings-card-order'), false, `${ending} does not persist an aborted drag`);
  }

  // Self and hidden (Dev-only) targets are ignored and cannot strand an indicator.
  for (const bad of [dragged, page.$('coachRoutinesCard')]) {
    page.doc.elementFromPoint = () => bad;
    fire(handle, 'pointerdown', { button: 0, pointerId: 4, clientX: 0, clientY: 0 });
    fire(handle, 'pointermove', { clientX: 0, clientY: -50 });
    assert.equal(hasDropLine(page), false);
    fire(handle, 'pointerup', { pointerId: 4 });
    assertClean(page, dragged, 'invalid target');
    assert.equal(list.children.map((c) => c.dataset.settingsCard).join(','), original, 'an invalid target moves nothing');
  }
  assert.equal(page.$('coachRoutinesCard').hidden, true, 'hidden Dev-only card stays hidden');
  assert.equal(list.children.includes(page.$('coachRoutinesCard')), true, 'and keeps its ordering slot');

  // Controls inside cards are untouched: the card itself owns no pointer listeners.
  for (const card of list.children) assert.equal((card.listeners?.pointerdown || []).length, 0);
});

test('ORDER-5. drag visuals: lifted/placeholder CSS, handle-only touch-action, reduced motion still carries the card', () => {
  const html = pageSource;
  assert.match(html, /\.settings-drag-handle \{[^}]*touch-action: none;/, 'only the handle suppresses touch panning');
  assert.doesNotMatch(html, /\.settings-card\[data-settings-card\] \{[^}]*touch-action/, 'cards keep normal scrolling');
  assert.match(html, /\.settings-card\.settings-card-lifted \{ position: fixed; z-index: 1000;/);
  assert.match(html, /\.settings-drag-placeholder \{[^}]*border: 2px dashed/);
  assert.match(html, /\.settings-list \{ position: relative; \}/, 'layout offsets are measured against the list');
  assert.match(html, /body\.settings-reordering[^{]*\{[^}]*user-select: none;/);
  assert.doesNotMatch(html, /prefers-reduced-motion[^{]*\{[^}]*settings-card-lifted/, 'reduced motion never freezes the carried card');
  assert.match(html, /lift: prefersReducedMotion\(\) \? '' : ' scale\(1\.015\)'/, 'reduced motion drops only the lift scale');
  assert.match(html, /handle\.addEventListener\('lostpointercapture', \(\) => finishSettingsCardDrag\(handle, \{ commit: false \}\)\)/);
});
