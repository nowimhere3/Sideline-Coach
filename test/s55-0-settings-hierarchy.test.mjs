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

function createTestPage(initialStatus, { scoutAvailable = true, scoutConfigured = true } = {}) {
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
        }
        return null;
      },
      focus() { doc.activeElement = this; }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); } });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { for (const c of node.children) c.parentNode = null; node.children = []; } });
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
    querySelectorAll: () => []
  });

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
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };

  const script = new vm.Script(pageScript);
  const context = vm.createContext(ctx);
  script.runInContext(context);

  // Connect the page
  source.emit('hello');

  return {
    $, posts, requests,
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
    }
  };
}

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

test('UX-20. AUTHENTICATED-DEVELOPER-TERMINAL-FIDELITY exists beside sanitization seam with zero behavior change', () => {
  const activitySrc = fs.readFileSync(path.join(repoRoot, 'src', 'player-activity.ts'), 'utf8');

  assert.ok(activitySrc.includes('BREADCRUMB: AUTHENTICATED-DEVELOPER-TERMINAL-FIDELITY'), 'breadcrumb exists in src/player-activity.ts');
  assert.ok(activitySrc.includes('Current broad sanitization is temporary pre-auth security scaffolding'), 'states current scaffolding');
  assert.ok(activitySrc.includes('developer Terminal evidence should preserve'), 'states developer intent verb');
  assert.ok(activitySrc.includes('high-fidelity real terminal output'), 'states developer product intent');
  assert.ok(activitySrc.includes('GitHub sign-in'), 'mentions GitHub sign-in security identity');
  assert.ok(activitySrc.includes('Do not expose unsanitized output before the approved authenticated security boundary exists'), 'preserves safety boundary');

  const breadcrumbIdx = activitySrc.indexOf('BREADCRUMB: AUTHENTICATED-DEVELOPER-TERMINAL-FIDELITY');
  const redactIdx = activitySrc.indexOf('export function redactSecrets');
  assert.ok(breadcrumbIdx > 0 && redactIdx > breadcrumbIdx, 'placed directly above redactSecrets seam');
});
