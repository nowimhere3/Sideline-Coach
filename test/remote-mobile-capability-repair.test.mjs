import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { classifyDaemonRoute, principalMayAccess } from '../out/control-plane/remote-routes.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(20);

const T0 = Date.now() + 3600_000;

function createTestPage({ hostname = 'localhost', devMode = true, players = [] } = {}) {
  const elements = new Map();
  const allNodes = new Set();
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    let classNameVal = '';
    const classList = {
      classes: new Set(),
      add(...t) { for (const x of t) this.classes.add(x); classNameVal = Array.from(this.classes).join(' '); },
      remove(...t) { for (const x of t) this.classes.delete(x); classNameVal = Array.from(this.classes).join(' '); },
      toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.add(c); else this.remove(c); return on; },
      contains(c) { return this.classes.has(c); }
    };
    const node = {
      tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', type: '', checked: false,
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList,
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child)); child.parentNode = this; this.children.push(child); return child; },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      replaceChildren(...kids) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...kids); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      focus() {}, blur() {},
      querySelector(sel) {
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        for (const c of this.children) {
          if (cls && c.classList.contains(cls)) return c;
          if (!cls && c.tagName.toLowerCase() === sel.toLowerCase()) return c;
          const sub = c.querySelector?.(sel);
          if (sub) return sub;
        }
        return null;
      },
      querySelectorAll(sel) {
        const res = [];
        const [tag, cls] = sel.includes('.') ? sel.split('.') : [sel.startsWith('.') ? '' : sel, sel.startsWith('.') ? sel.slice(1) : null];
        const walk = (n) => {
          for (const c of n.children) {
            const matchTag = !tag || c.tagName.toLowerCase() === tag.toLowerCase();
            const matchCls = !cls || c.classList.contains(cls);
            if (matchTag && matchCls) res.push(c);
            walk(c);
          }
        };
        walk(this);
        return res;
      }
    };
    Object.defineProperty(node, 'textContent', {
      get: () => (node.children.length ? node.children.map((c) => c.textContent).join('') : text),
      set: (v) => { text = String(v); for (const c of node.children) c.parentNode = null; node.children = []; }
    });
    Object.defineProperty(node, 'innerHTML', {
      get: () => '',
      set: (v) => { for (const c of node.children) c.parentNode = null; node.children = []; }
    });
    Object.defineProperty(node, 'className', {
      get: () => classNameVal,
      set: (v) => {
        classNameVal = String(v);
        classList.classes.clear();
        for (const c of classNameVal.split(/\s+/).filter(Boolean)) classList.classes.add(c);
      }
    });
    let idValue = id;
    Object.defineProperty(node, 'id', { get: () => idValue, set: (v) => { idValue = v; if (v) elements.set(v, node); } });
    if (id) elements.set(id, node);
    allNodes.add(node);
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

  const initialStatus = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: 'game-1',
    game: { id: 'game-1', title: 'Test Game', root: 'C:/games/test', reportsDir: 'C:/games/test/reports', sopDir: 'C:/games/test/sop' },
    games: [{ id: 'game-1', title: 'Test Game', root: 'C:/games/test', reportsDir: 'C:/games/test/reports', sopDir: 'C:/games/test/sop' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players,
    capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: {
      runningPlayers: 'ask', devMode, livePlayerConsole: true,
      terminalRetention: '30s', remoteSensitiveTerminalOutput: false,
      advancedPlayerDiscovery: false, timeFormat: '12h',
      aiScoreboardPlacement: 'bottom', aiScoreboardDefaultExpanded: false,
      aiScoreboardShowOnMobileLiveTerminal: false, aiScoreboardPercentMode: 'left',
      aiScoreboardResetMode: 'absolute', aiScoreboardDensity: 'standard',
      aiScoreboardResetMarker: 'separator', aiUsageRefreshMinutes: 5
    },
    gameSetup: {
      canChange: true,
      reports: { path: 'C:/games/test/reports', label: 'C:/games/test/reports', provenance: 'Chosen by you' },
      sop: { path: 'C:/games/test/sop', label: 'C:/games/test/sop', provenance: 'Chosen by you' }
    },
    routines: { gameId: 'game-1', devMode, playCount: 0, routines: [], repositoryUrl: 'https://github.com/test/repo' },
    at: T0
  };

  const apiCalls = [];
  const documentListeners = {};
  const isRemote = Boolean(hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]');

  const ctx = {
    document: {
      getElementById: $,
      querySelectorAll: (sel) => sel === '[data-live-action]'
        ? Array.from(allNodes).filter((el) => (el.dataset && 'liveAction' in el.dataset) || (el.attributes && 'data-live-action' in el.attributes))
        : [],
      createElement: (tag) => makeNode('', tag),
      addEventListener: (type, fn) => { (documentListeners[type] = documentListeners[type] || []).push(fn); },
      body: makeNode('body'), activeElement: null
    },
    location: { search: '', pathname: '/', hostname }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: () => ({ matches: false }),
    fetch: async (url, options = {}) => {
      apiCalls.push({ url, method: options.method || 'GET', body: options.body });
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });

      if (url.startsWith('/api/status')) return reply(200, initialStatus);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url.startsWith('/api/ai-health')) return reply(200, { success: true, health: { schemaVersion: 1, providers: {} } });
      if (url === '/api/players/discover') {
        initialStatus.playerDiscovery = {
          at: new Date().toISOString(),
          catalog: [
            { playerType: 'codex', displayName: 'Codex', state: 'ready', canAddNow: true, candidate: null },
            { playerType: 'claude', displayName: 'Claude', state: 'ready', canAddNow: false, candidate: null }
          ],
          externalCandidates: [{ playerType: 'claude', shellPid: 1234, terminalName: 'Claude Terminal' }],
          runningElsewhere: [],
          adoptableTerminals: [{ shellPid: 5678, terminalName: 'Adoptable Terminal' }],
          openTerminals: []
        };
        return reply(200, { success: true });
      }
      if (url === '/api/scout/openrouter-credential') {
        if (isRemote) return reply(403, { success: false, message: 'This action is available only on the local Sideline.' });
        return reply(200, { success: true, configured: false, available: true });
      }
      if (url === '/api/preferences' && options.method === 'POST') {
        const parsed = options.body ? JSON.parse(options.body) : {};
        initialStatus.preferences = { ...initialStatus.preferences, ...parsed };
        return reply(200, { success: true, message: 'Saved.' });
      }
      if (url.startsWith('/api/players/') && options.method === 'POST') {
        return reply(200, { success: true, message: 'Player action completed.' });
      }
      if (url.startsWith('/api/games/filesystem/') && options.method === 'POST') {
        return reply(200, { success: true, message: 'Folder action completed.' });
      }
      return reply(200, { success: true });
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };

  const page = {
    $, apiCalls,
    body: ctx.document.body,
    click: async (node) => { for (const fn of node?.listeners?.click || []) await fn({ stopPropagation() {} }); await flush(); },
    trigger: async (node, eventName, eventObj = {}) => {
      for (const fn of node?.listeners?.[eventName] || []) await fn({ target: node, stopPropagation() {}, ...eventObj });
      await flush();
    },
    start: async () => {
      vm.createContext(ctx);
      vm.runInContext(pageScript, ctx);
      source.emit('hello');
      const end = Date.now() + 2_000;
      while (Date.now() < end && $('connectionText').textContent !== 'Coach Online') await wait(5);
      assert.equal($('connectionText').textContent, 'Coach Online', 'page connected');
      await flush();
      return page;
    }
  };
  return page;
}

// ---------------------------------------------------------------------------
// Route Classification & Security Boundary Tests
// ---------------------------------------------------------------------------

test('REMOTE-SEC-1: Remote Coach route policy enforces first-class capabilities and preserves security boundaries', () => {
  // First-class Remote Coach capabilities
  assert.equal(classifyDaemonRoute('POST', '/api/players/discover'), 'remote-read');
  assert.equal(classifyDaemonRoute('POST', '/api/players/add'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/adopt'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/adopt-terminal'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/helper-terminal'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/instance/inst-1/field'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/instance/inst-1/bench'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/instance/inst-1/remove'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/instance/inst-1/send'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/preferences'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/games/files/check'), 'remote-read');
  assert.equal(classifyDaemonRoute('POST', '/api/games/files/absolute-path'), 'remote-read');
  assert.equal(classifyDaemonRoute('POST', '/api/games/filesystem/choose'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/games/filesystem/restore'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/games/filesystem/reinspect'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/game/add'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/game/archive'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/game/restore'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('GET', '/api/scout/formation-receivers'), 'remote-read');
  assert.equal(classifyDaemonRoute('POST', '/api/scout/formation-run'), 'remote-mutate');

  // Genuinely protected endpoints (strict security fence)
  assert.equal(classifyDaemonRoute('POST', '/api/scout/openrouter-credential'), 'local-only');
  assert.equal(classifyDaemonRoute('DELETE', '/api/scout/openrouter-credential'), 'local-only');
  assert.equal(classifyDaemonRoute('POST', '/api/pairing/create'), 'local-only');
  assert.equal(classifyDaemonRoute('GET', '/api/devices'), 'local-only');
  assert.equal(classifyDaemonRoute('DELETE', '/api/devices'), 'local-only');
  assert.equal(classifyDaemonRoute('POST', '/api/control-plane/shutdown'), 'local-only');
  assert.equal(classifyDaemonRoute('POST', '/api/session'), 'local-only');
  assert.equal(classifyDaemonRoute('GET', '/stadium'), 'local-only');

  const remote = { kind: 'remote-device', deviceId: 'd1' };
  assert.equal(principalMayAccess(remote, 'remote-read'), true);
  assert.equal(principalMayAccess(remote, 'remote-mutate'), true);
  assert.equal(principalMayAccess(remote, 'local-only'), false);
  assert.equal(principalMayAccess({ kind: 'local-admin' }, 'local-only'), true);
});

// ---------------------------------------------------------------------------
// Physical Field Failure 1: Check Players & Add / Add to Roster / Adopt Remotely
// ---------------------------------------------------------------------------

test('SLICE-A-1: Remote user tapping Check Players discovers and can Add to Roster candidate without 403 or toast', async () => {
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com' }).start();
  const toast = page.$('toast');

  // Trigger Check Players
  const checkPlayersBtn = page.$('checkPlayersBtn');
  assert.ok(checkPlayersBtn, 'checkPlayersBtn exists');
  await page.click(checkPlayersBtn);

  // Verify POST /api/players/discover was called
  const discoverCalls = page.apiCalls.filter((c) => c.url === '/api/players/discover');
  assert.equal(discoverCalls.length, 1, 'discoverPlayers called POST /api/players/discover');
  assert.equal(toast.classList.contains('error'), false, 'no error toast on remote Check Players');

  // Verify candidate actions are enabled and functional for mobile Coach
  const actionButtons = page.$('playerCatalog').querySelectorAll('button');
  assert.ok(actionButtons.length > 0, 'recruit candidate buttons rendered');

  const addToRosterBtn = actionButtons.find((btn) => btn.textContent === 'Add to Roster');
  assert.ok(addToRosterBtn, 'candidate "Add to Roster" button rendered');
  assert.equal(addToRosterBtn.disabled, false, 'Add to Roster button is enabled remotely');
  assert.notEqual(addToRosterBtn.title, 'Available only on the local Sideline.');

  // Click Add to Roster
  await page.click(addToRosterBtn);

  // Verify POST /api/players/adopt was called
  const adoptCalls = page.apiCalls.filter((c) => c.url === '/api/players/adopt' && c.method === 'POST');
  assert.equal(adoptCalls.length, 1, 'called POST /api/players/adopt');
  assert.deepEqual(JSON.parse(adoptCalls[0].body), { shellPid: 1234 });
  assert.equal(toast.classList.contains('error'), false, 'no error toast shown on remote Add to Roster');
  assert.ok(!toast.textContent.includes('Could not'));
});

test('SLICE-A-2: Remote user can click Add for uninstalled / installable recruit without 403 or toast', async () => {
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com' }).start();
  const toast = page.$('toast');

  await page.click(page.$('checkPlayersBtn'));
  const actionButtons = page.$('playerCatalog').querySelectorAll('button');
  const addBtn = actionButtons.find((btn) => btn.textContent === 'Add');
  assert.ok(addBtn, 'recruit "Add" button rendered');
  assert.equal(addBtn.disabled, false, 'Add button is enabled remotely');
  assert.notEqual(addBtn.title, 'Available only on the local Sideline.');

  await page.click(addBtn);

  const addCalls = page.apiCalls.filter((c) => c.url === '/api/players/add' && c.method === 'POST');
  assert.equal(addCalls.length, 1, 'called POST /api/players/add');
  assert.equal(toast.classList.contains('error'), false, 'no error toast shown on remote Add');
  assert.ok(!toast.textContent.includes('Could not'));
});

// ---------------------------------------------------------------------------
// Physical Field Failure 2: Player on Bench > Retry ("Try Again") Remotely
// ---------------------------------------------------------------------------

test('SLICE-A-3: Remote user can click Try Again on benched Player without local-only toast', async () => {
  const benchedPlayer = {
    id: 'player-codex',
    name: 'Codex',
    type: 'codex',
    instances: [
      {
        playerType: 'codex',
        instanceId: 'inst-bench-1',
        displayName: 'Codex Bench',
        ownership: 'coach-managed',
        controlState: 'error',
        stateMessage: 'Process exited with error',
        onField: false
      }
    ]
  };
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com', players: [benchedPlayer] }).start();
  const toast = page.$('toast');

  // Find the benched player strip
  const benchedPlayerCard = page.$('roster').querySelectorAll('div.player')
    .find((n) => n.textContent.includes('Codex Bench'));
  assert.ok(benchedPlayerCard, 'benched player card rendered');

  const tryAgainBtn = benchedPlayerCard.querySelectorAll('button')
    .find((btn) => btn.textContent === 'Try Again');
  assert.ok(tryAgainBtn, 'Try Again button rendered for benched player needing recovery');
  assert.equal(tryAgainBtn.disabled, false, 'Try Again button is enabled remotely');

  await page.click(tryAgainBtn);

  // Verify POST /api/players/instance/inst-bench-1/field was called
  const fieldCalls = page.apiCalls.filter((c) => c.url === '/api/players/instance/inst-bench-1/field' && c.method === 'POST');
  assert.equal(fieldCalls.length, 1, 'called POST /api/players/instance/inst-bench-1/field');
  assert.equal(toast.classList.contains('error'), false, 'NO error toast shown');
  assert.ok(!toast.textContent.includes('only on the local Sideline'));
});

test('SLICE-A-4: Remote user can Put on Bench and Remove Player without local-only toast', async () => {
  const onFieldPlayer = {
    id: 'player-claude',
    name: 'Claude',
    type: 'claude',
    instances: [
      {
        playerType: 'claude',
        instanceId: 'inst-field-1',
        displayName: 'Claude Field',
        ownership: 'coach-managed',
        controlState: 'ready',
        stateMessage: 'Ready',
        onField: true
      }
    ]
  };
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com', players: [onFieldPlayer] }).start();
  const toast = page.$('toast');

  const onFieldCard = page.$('roster').querySelectorAll('div.player')
    .find((n) => n.textContent.includes('Claude Field'));
  assert.ok(onFieldCard, 'on-field player card rendered');

  // 1. Put on Bench
  const benchBtn = onFieldCard.querySelectorAll('button')
    .find((btn) => btn.textContent === 'Put on Bench');
  assert.ok(benchBtn, 'Put on Bench button rendered');
  await page.click(benchBtn);

  const benchCalls = page.apiCalls.filter((c) => c.url === '/api/players/instance/inst-field-1/bench' && c.method === 'POST');
  assert.equal(benchCalls.length, 1, 'called POST /api/players/instance/inst-field-1/bench');
  assert.equal(toast.classList.contains('error'), false, 'no error toast on remote Put on Bench');
  assert.ok(!toast.textContent.includes('Could not'));

  // 2. Remove Player
  const removeBtn = onFieldCard.querySelectorAll('button')
    .find((btn) => btn.textContent === 'Remove Player');
  assert.ok(removeBtn, 'Remove Player button rendered');
  const removeClick = page.click(removeBtn);
  await wait(10);

  // Confirmation dialog opens: confirm it
  assert.equal(page.$('confirmModal').hidden, false, 'confirm modal shown');
  await page.click(page.$('confirmOkBtn'));
  await removeClick;

  const removeCalls = page.apiCalls.filter((c) => c.url === '/api/players/instance/inst-field-1/remove' && c.method === 'POST');
  assert.equal(removeCalls.length, 1, 'called POST /api/players/instance/inst-field-1/remove');
  assert.equal(toast.classList.contains('error'), false, 'no error toast on remote Remove Player');
  assert.ok(!toast.textContent.includes('Could not'));
});

// ---------------------------------------------------------------------------
// Security Fence: Secret Material Remains Strictly Protected
// ---------------------------------------------------------------------------

test('SLICE-B-1: Opening Settings remotely does NOT fetch OpenRouter credential and shows no toast', async () => {
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com' }).start();
  const toast = page.$('toast');

  // Open Settings
  const settingsBtn = page.$('settingsBtn');
  await page.click(settingsBtn);

  assert.equal(page.$('settingsView').hidden, false, 'settingsView opened');

  // Verify GET /api/scout/openrouter-credential was NEVER called
  const credentialCalls = page.apiCalls.filter((c) => c.url.includes('/api/scout/openrouter-credential'));
  assert.equal(credentialCalls.length, 0, 'remote Settings open did not fetch openrouter-credential');

  // Verify no error toast
  assert.equal(toast.classList.contains('error'), false, 'no error toast on remote Settings open');

  // Verify credential card remains hidden on remote
  assert.equal(page.$('scoutOpenRouterCard').hidden, true, 'scoutOpenRouterCard remains hidden remotely');
});

// ---------------------------------------------------------------------------
// Settings: Full First-Class Remote Preferences & Game Setup Control
// ---------------------------------------------------------------------------

test('SLICE-C-1: Remote Coach can change preferences in Settings without 403 or error toasts', async () => {
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com', devMode: true }).start();
  const toast = page.$('toast');

  await page.click(page.$('settingsBtn'));

  // 1. Dev Mode Toggle
  const devModeToggle = page.$('devModeToggle');
  assert.equal(devModeToggle.disabled, false, 'devModeToggle enabled remotely');
  devModeToggle.checked = !devModeToggle.checked;
  await page.trigger(devModeToggle, 'change');

  // 2. Live Player Console Toggle
  const livePlayerConsoleToggle = page.$('livePlayerConsoleToggle');
  assert.equal(livePlayerConsoleToggle.disabled, false, 'livePlayerConsoleToggle enabled remotely');
  livePlayerConsoleToggle.checked = !livePlayerConsoleToggle.checked;
  await page.trigger(livePlayerConsoleToggle, 'change');

  // 3. Terminal Success Retention Radio
  const retentionRadio = page.$('terminalRetention30m');
  assert.equal(retentionRadio.disabled, false, 'terminal retention enabled remotely');
  retentionRadio.checked = true;
  await page.trigger(retentionRadio, 'change');

  // 4. Remote Sensitive Terminal Output Toggle
  const remoteSensitiveToggle = page.$('remoteSensitiveTerminalOutputToggle');
  assert.equal(remoteSensitiveToggle.disabled, false, 'remoteSensitiveTerminalOutputToggle enabled remotely');
  remoteSensitiveToggle.checked = !remoteSensitiveToggle.checked;
  await page.trigger(remoteSensitiveToggle, 'change');

  // 5. Advanced Player Discovery Toggle
  const apdToggle = page.$('advancedPlayerDiscoveryToggle');
  assert.equal(apdToggle.disabled, false, 'advancedPlayerDiscoveryToggle enabled remotely');
  apdToggle.checked = !apdToggle.checked;
  await page.trigger(apdToggle, 'change');

  // 6. Running Players Radio
  const runningRadio = page.$('runningPrefAutoAdd');
  assert.equal(runningRadio.disabled, false, 'running players preference enabled remotely');
  runningRadio.checked = true;
  await page.trigger(runningRadio, 'change');

  // 7. Time Format Radio
  const timeRadio = page.$('timeFormat24');
  assert.equal(timeRadio.disabled, false, 'time format radio enabled remotely');
  timeRadio.checked = true;
  await page.trigger(timeRadio, 'change');

  // 8. AI Scoreboard Radio
  const scoreboardRadio = page.$('aiScoreboardPlacementTop');
  assert.equal(scoreboardRadio.disabled, false, 'aiScoreboardPlacementTop enabled remotely');
  scoreboardRadio.checked = true;
  await page.trigger(scoreboardRadio, 'change');

  // 9. AI Scoreboard Mobile Live Terminal Toggle
  const scoreboardMobileToggle = page.$('aiScoreboardShowOnMobileLiveTerminal');
  assert.equal(scoreboardMobileToggle.disabled, false, 'aiScoreboardShowOnMobileLiveTerminal enabled remotely');
  scoreboardMobileToggle.checked = !scoreboardMobileToggle.checked;
  await page.trigger(scoreboardMobileToggle, 'change');

  // 10. AI Usage Refresh Radio
  const refreshRadio = page.$('aiUsageRefresh10');
  assert.equal(refreshRadio.disabled, false, 'aiUsageRefresh10 enabled remotely');
  refreshRadio.checked = true;
  await page.trigger(refreshRadio, 'change');

  // Verify: Remote interactions successfully POSTed to /api/preferences!
  const prefPosts = page.apiCalls.filter((c) => c.url === '/api/preferences' && c.method === 'POST');
  assert.ok(prefPosts.length >= 10, `expected at least 10 preference updates, got ${prefPosts.length}`);
  assert.equal(toast.classList.contains('error'), false, 'no error toast produced during remote preference changes');
  assert.ok(!toast.textContent.includes('Could not'));
});

test('SLICE-C-2: Remote Coach can use Game Setup change and restore buttons', async () => {
  const page = await createTestPage({ hostname: 'remote.mysidelinecoach.com', devMode: true }).start();
  const toast = page.$('toast');

  await page.click(page.$('settingsBtn'));

  const reportsChangeBtn = page.$('gameSetupReportsChangeBtn');
  const reportsRestoreBtn = page.$('gameSetupReportsRestoreBtn');
  assert.equal(reportsChangeBtn.disabled, false, 'reports change button enabled remotely');
  assert.equal(reportsRestoreBtn.disabled, false, 'reports restore button enabled remotely');
  assert.notEqual(reportsChangeBtn.title, 'Available only on the local Sideline.');
  assert.notEqual(reportsRestoreBtn.title, 'Available only on the local Sideline.');

  // Click Restore Reports folder
  await page.click(reportsRestoreBtn);

  const restoreCalls = page.apiCalls.filter((c) => c.url === '/api/games/filesystem/restore' && c.method === 'POST');
  assert.equal(restoreCalls.length, 1, 'called POST /api/games/filesystem/restore');
  assert.deepEqual(JSON.parse(restoreCalls[0].body), { gameId: 'game-1', kind: 'reports' });
  assert.equal(toast.classList.contains('error'), false, 'no error toast produced on remote folder restore');
  assert.ok(!toast.textContent.includes('Could not'));
});
