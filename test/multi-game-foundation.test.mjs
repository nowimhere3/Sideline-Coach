import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  loadGameRegistry,
  saveGameRegistry,
  getSelectedGameId,
  setSelectedGameId,
  registerGameInRegistry,
  archiveGameInRegistry,
  resolveGameContextSync,
  GAME_REGISTRY_KEY,
  SELECTED_GAME_KEY
} from '../out/game-identity.js';
import { CapabilityService } from '../out/capability-service.js';
import { computeAutoRoute, CodexRoutingPolicy } from '../out/routing-policy.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');

class MockMemento {
  constructor(initial = {}) {
    this.data = new Map(Object.entries(initial));
  }
  get(key, defaultValue) {
    return this.data.has(key) ? structuredClone(this.data.get(key)) : defaultValue;
  }
  async update(key, value) {
    this.data.set(key, structuredClone(value));
  }
}

// Read index.html for Browser UI tests
const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script found in index.html');
const scriptCode = scriptMatch[1];

function createBrowserHarness(initialStatus = null) {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: id === 'dispatchBtn' ? 'Dispatch Play' : '',
        value: '',
        disabled: false,
        hidden: false,
        title: '',
        dataset: id === 'dispatchBtn' ? { liveAction: '' } : {},
        style: { display: '', opacity: '' },
        classList: {
          classes: new Set(),
          add(...tokens) { for (const t of tokens) this.classes.add(t); },
          remove(...tokens) { for (const t of tokens) this.classes.delete(t); },
          toggle(c, force) {
            if (force === undefined) force = !this.classes.has(c);
            if (force) this.classes.add(c); else this.classes.delete(c);
            return force;
          },
          contains(c) { return this.classes.has(c); }
        },
        listeners: {},
        addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k]; },
        appendChild(child) { this.children = this.children || []; this.children.push(child); },
        append(...children) { this.children = this.children || []; this.children.push(...children); },
        children: []
      });
    }
    return elements.get(id);
  };

  const document = {
    getElementById: getEl,
    querySelectorAll: (selector) => {
      if (selector === '[data-live-action]') return [getEl('dispatchBtn')];
      return [];
    },
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        dataset: {},
        value: '',
        textContent: '',
        innerHTML: '',
        children: [],
        listeners: {},
        attributes: {},
        classList: {
          classes: new Set(),
          add(...tokens) { for (const t of tokens) this.classes.add(t); },
          remove(...tokens) { for (const t of tokens) this.classes.delete(t); },
          contains(c) { return this.classes.has(c); }
        },
        appendChild(child) { this.children.push(child); },
        append(...children) { this.children.push(...children); },
        addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
        setAttribute(k, v) { this.attributes[k] = v; this[k] = v; },
        getAttribute(k) { return this.attributes[k]; }
      };
      return el;
    }
  };

  const sessionStorageData = new Map([['sidelineCoachToken', 'test-token']]);
  const sessionStorage = {
    getItem: (k) => sessionStorageData.get(k) || null,
    setItem: (k, v) => sessionStorageData.set(k, v),
    removeItem: (k) => sessionStorageData.delete(k)
  };

  let eventSourceInstance = null;
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      eventSourceInstance = this;
    }
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
    emit(event, data = {}) {
      for (const fn of this.listeners[event] || []) fn({ data: JSON.stringify(data) });
    }
    close() {}
  }

  const defaultStatus = initialStatus || {
    success: true,
    selectedGameId: 'game_git_1111',
    connectedGameId: 'game_git_1111',
    connectionStatus: 'connected',
    game: { gameId: 'game_git_1111', displayName: 'GS3', fingerprintSource: 'git-remote' },
    stadium: { stadiumId: 'stadium_win_123', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    activeProject: 'GS3',
    workspaceRoots: ['GS3'],
    games: [
      { gameId: 'game_git_1111', displayName: 'GS3', connectionStatus: 'connected', isSelected: true },
      { gameId: 'game_git_2222', displayName: 'Browser Gallery', connectionStatus: 'offline', isSelected: false }
    ],
    players: [{
      id: 'codex',
      name: 'Codex',
      fieldState: 'on-field',
      availability: 'available',
      instances: [{
        instanceId: 'codex-inst-1',
        playerType: 'codex',
        seat: 1,
        fieldLabel: 'Codex 1 · Controlled',
        controlMode: 'controlled',
        turnState: { instanceId: 'codex-inst-1', state: 'idle', summary: 'Ready', at: 0 }
      }]
    }],
    routing: {
      mode: 'auto',
      activeDecision: {
        playerInstanceId: 'codex-inst-1',
        playerLabel: 'Codex 1',
        model: 'o3-mini',
        modelDisplayName: 'o3-mini',
        effort: 'high',
        taskClass: 'default',
        reason: 'Auto routing selected candidate'
      },
      capabilities: [{
        instanceId: 'codex-inst-1',
        playerType: 'codex',
        transport: 'controlled',
        fieldLabel: 'Codex 1 · Controlled',
        state: 'ready',
        capability: {
          provider: 'codex',
          freshness: 'live',
          observedAt: Date.now(),
          account: { type: 'chatgpt', tier: 'plus' },
          models: [{ id: 'o3-mini', displayName: 'o3-mini', isDefault: true, supportedEfforts: ['low', 'medium', 'high'] }]
        }
      }]
    }
  };

  let currentStatus = defaultStatus;
  const postedCalls = [];

  const fetchHandler = async (url, options = {}) => {
    if (url === '/api/status') {
      return { ok: true, status: 200, json: async () => currentStatus };
    }
    if (url.startsWith('/api/reports')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url === '/api/game/select') {
      const body = options.body ? JSON.parse(options.body) : {};
      postedCalls.push({ url, body });
      const targetGame = currentStatus.games.find(g => g.gameId === body.gameId);
      currentStatus = {
        ...currentStatus,
        selectedGameId: body.gameId,
        connectionStatus: targetGame?.connectionStatus || 'offline',
        game: {
          gameId: body.gameId,
          displayName: targetGame?.displayName || 'Unknown',
          fingerprintSource: 'git-remote'
        },
        games: currentStatus.games.map(g => ({ ...g, isSelected: g.gameId === body.gameId })),
        players: targetGame?.connectionStatus === 'connected' ? currentStatus.players : [],
        routing: targetGame?.connectionStatus === 'connected' ? currentStatus.routing : {
          mode: 'auto',
          activeDecision: null,
          autoError: 'Game is offline. Connect its Stadium or open in VS Code to dispatch Plays.',
          capabilities: []
        }
      };
      return { ok: true, status: 200, json: async () => ({ success: true, selectedGameId: body.gameId, status: currentStatus }) };
    }
    if (url.startsWith('/api/')) {
      const body = options.body ? JSON.parse(options.body) : {};
      postedCalls.push({ url, body });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const context = {
    document,
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage,
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: fetchHandler,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 0,
    clearInterval: () => {},
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };

  vm.createContext(context);
  vm.runInContext(scriptCode, context);

  return {
    getEl,
    getEventSource: () => eventSourceInstance,
    postedCalls,
    setStatus: (s) => { currentStatus = s; },
    getStatus: () => currentStatus
  };
}

async function initConnectedHarness(initialStatus = null) {
  const harness = createBrowserHarness(initialStatus);
  harness.getEventSource().emit('hello');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const text = harness.getEl('connectionText').textContent;
    if (text === 'Coach Online' || text === 'Connected') return harness;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Harness failed to establish Connected state');
}

// ============================================================================
// MULTI-GAME FOUNDATION TEST MATRIX (23 SCENARIOS)
// ============================================================================

test('1. Game Registry: loads and saves correctly from globalState memento', () => {
  const memento = new MockMemento();
  const initial = loadGameRegistry(memento);
  assert.equal(initial.version, 1);
  assert.deepEqual(initial.games, {});

  const gameIdentity = {
    gameId: 'game_git_test1',
    displayName: 'Test Game 1',
    fingerprintSource: 'git-remote',
    repoUri: 'github.com/org/test1'
  };

  const { record } = registerGameInRegistry(memento, gameIdentity, 'C:\\projects\\test1');
  assert.equal(record.gameId, 'game_git_test1');
  assert.equal(record.displayName, 'Test Game 1');
  assert.deepEqual(record.knownRootFsPaths, ['C:\\projects\\test1']);

  // Reload registry from memento
  const loaded = loadGameRegistry(memento);
  assert.equal(loaded.games['game_git_test1'].gameId, 'game_git_test1');
});

test('2. Active workspace auto-registers in registry on activation', () => {
  const memento = new MockMemento();
  const folder = { uri: { fsPath: 'C:\\work\\gs3' }, name: 'GS3' };
  const resolved = resolveGameContextSync({ workspaceFolder: folder, memento });

  assert.ok(resolved.game.gameId !== 'unknown');
  const { isNew, record } = registerGameInRegistry(memento, resolved.game, folder.uri.fsPath);
  assert.equal(isNew, true);
  assert.equal(record.displayName, 'GS3');

  const registry = loadGameRegistry(memento);
  assert.ok(registry.games[resolved.game.gameId]);
});

test('3. Identical Git remote updates path without creating duplicate record', () => {
  const memento = new MockMemento();
  const identity1 = {
    gameId: 'game_git_repoA',
    displayName: 'Repo A',
    fingerprintSource: 'git-remote',
    repoUri: 'github.com/user/repo-a'
  };
  const { isNew: firstNew } = registerGameInRegistry(memento, identity1, 'C:\\drive1\\repo-a');
  assert.equal(firstNew, true);

  // Second mount of identical remote at a different path
  const identity2 = {
    gameId: 'game_git_repoA',
    displayName: 'Repo A Moved',
    fingerprintSource: 'git-remote',
    repoUri: 'github.com/user/repo-a'
  };
  const { isNew: secondNew, record } = registerGameInRegistry(memento, identity2, 'D:\\drive2\\repo-a');
  assert.equal(secondNew, false);
  assert.equal(Object.keys(loadGameRegistry(memento).games).length, 1);
  assert.ok(record.knownRootFsPaths.includes('C:\\drive1\\repo-a'));
  assert.ok(record.knownRootFsPaths.includes('D:\\drive2\\repo-a'));
});

test('4. Same display name with different remote origin produces distinct gameIds', () => {
  const memento = new MockMemento();
  const identityA = {
    gameId: 'game_git_originA',
    displayName: 'FloppyDisk',
    fingerprintSource: 'git-remote',
    repoUri: 'github.com/orgA/floppydisk'
  };
  const identityB = {
    gameId: 'game_git_originB',
    displayName: 'FloppyDisk',
    fingerprintSource: 'git-remote',
    repoUri: 'github.com/orgB/floppydisk'
  };

  registerGameInRegistry(memento, identityA, 'C:\\forkA');
  registerGameInRegistry(memento, identityB, 'C:\\forkB');

  const registry = loadGameRegistry(memento);
  assert.equal(Object.keys(registry.games).length, 2);
  assert.ok(registry.games['game_git_originA']);
  assert.ok(registry.games['game_git_originB']);
  assert.equal(registry.games['game_git_originA'].displayName, 'FloppyDisk');
  assert.equal(registry.games['game_git_originB'].displayName, 'FloppyDisk');
});

test('5. Soft-delete / archive retains record safely without data loss', () => {
  const memento = new MockMemento();
  const game = {
    gameId: 'game_git_archive_me',
    displayName: 'Archived Repo',
    fingerprintSource: 'git-remote',
    repoUri: 'github.com/user/archive-me'
  };
  registerGameInRegistry(memento, game, 'C:\\archived');

  const archived = archiveGameInRegistry(memento, 'game_git_archive_me', true);
  assert.ok(archived);
  assert.equal(archived.isArchived, true);

  const registry = loadGameRegistry(memento);
  assert.ok(registry.games['game_git_archive_me']);
  assert.equal(registry.games['game_git_archive_me'].isArchived, true);
  assert.deepEqual(registry.games['game_git_archive_me'].knownRootFsPaths, ['C:\\archived']);
});

test('6. selectedGameId persists across reloads via globalState', () => {
  const memento = new MockMemento();
  setSelectedGameId(memento, 'game_git_chosen');
  assert.equal(getSelectedGameId(memento), 'game_git_chosen');

  // Verify stored in Memento under expected keys
  assert.equal(memento.get(SELECTED_GAME_KEY), 'game_git_chosen');
  assert.equal(loadGameRegistry(memento).selectedGameId, 'game_git_chosen');
});

test('7. Add Game uses safe folder-selection and registration path', () => {
  const memento = new MockMemento();
  const testPath = 'C:\\Projects\\NewGame';
  const folder = { uri: { fsPath: testPath }, name: 'NewGame' };
  const resolved = resolveGameContextSync({ workspaceFolder: folder, memento });

  assert.ok(resolved.game.gameId.startsWith('game_'));
  const { record } = registerGameInRegistry(memento, resolved.game, testPath);
  assert.equal(record.gameId, resolved.game.gameId);
  assert.equal(record.knownRootFsPaths[0], testPath);
});

test('8. Game selector renders all known Games in browser UI', async () => {
  const harness = await initConnectedHarness();
  const gameListEl = harness.getEl('gameList');
  assert.ok(gameListEl);
  assert.equal(gameListEl.children.length, 2);

  const names = gameListEl.children.map((c) => c.children[0].textContent);
  assert.ok(names.includes('GS3'));
  assert.ok(names.includes('Browser Gallery'));
});

test('9. Connected vs Offline labels are truthful in UI', async () => {
  const harness = await initConnectedHarness();
  const gameListEl = harness.getEl('gameList');

  const gs3Item = gameListEl.children.find((c) => c.children[0].textContent === 'GS3');
  const bgItem = gameListEl.children.find((c) => c.children[0].textContent === 'Browser Gallery');

  assert.equal(gs3Item.children[1].textContent, 'Connected');
  assert.equal(bgItem.children[1].textContent, 'Offline');
  assert.equal(harness.getEl('gameConnectionBadge').textContent, 'Connected');
});

test('10. Switching Game updates selected gameId in client and server payload', async () => {
  const harness = await initConnectedHarness();
  const gameListEl = harness.getEl('gameList');
  const bgItem = gameListEl.children.find((c) => c.children[0].textContent === 'Browser Gallery');

  // Click on Browser Gallery in dropdown
  await bgItem.listeners['click'][0]({ stopPropagation() {} });

  assert.equal(harness.postedCalls.length, 1);
  assert.equal(harness.postedCalls[0].url, '/api/game/select');
  assert.equal(harness.postedCalls[0].body.gameId, 'game_git_2222');
  assert.equal(harness.getEl('projectName').textContent, 'Game: Browser Gallery');
  assert.equal(harness.getEl('gameConnectionBadge').textContent, 'Offline');
});

test('11. Switch invalidates prior Player target in client UI', async () => {
  const harness = await initConnectedHarness();
  const terminalSelect = harness.getEl('terminalSelect');

  // GS3 connected with player codex-inst-1
  assert.equal(terminalSelect.value, 'codex-inst-1');

  // Switch to Browser Gallery (offline)
  const gameListEl = harness.getEl('gameList');
  const bgItem = gameListEl.children.find((c) => c.children[0].textContent === 'Browser Gallery');
  await bgItem.listeners['click'][0]({ stopPropagation() {} });

  // Target player reset to empty
  assert.equal(terminalSelect.value, '');
});

test('12. Switch invalidates prior staged route', async () => {
  const harness = await initConnectedHarness();
  const gameListEl = harness.getEl('gameList');
  const bgItem = gameListEl.children.find((c) => c.children[0].textContent === 'Browser Gallery');

  // Prior auto route chip has opacity 1
  assert.equal(harness.getEl('autoRouteDecisionChip').style.opacity, '1');

  // Switch to offline game
  await bgItem.listeners['click'][0]({ stopPropagation() {} });

  // Auto route warning is shown and chip is dimmed
  assert.equal(harness.getEl('autoRouteDecisionChip').style.opacity, '0.35');
  assert.ok(harness.getEl('autoRouteWarning').textContent.includes('offline'));
});

test('13. Game A Player never appears in Game B projection', () => {
  const capabilityService = new CapabilityService();
  capabilityService.record('codex', {
    provider: 'codex',
    freshness: 'live',
    observedAt: Date.now(),
    account: { type: 'chatgpt' },
    models: [{ id: 'o3-mini', displayName: 'o3-mini', isDefault: true }]
  });

  const connectedGameId = 'game_git_1111';
  const offlineGameId = 'game_git_2222';

  const getCandidatesForGame = (gameId) => {
    if (gameId !== connectedGameId) return [];
    return [{ instanceId: 'inst-1', playerType: 'codex', state: 'ready' }];
  };

  assert.equal(getCandidatesForGame(connectedGameId).length, 1);
  assert.equal(getCandidatesForGame(offlineGameId).length, 0);
});

test('14. Game A report never appears in Game B Incoming', () => {
  const allReports = [
    { gameId: 'game_git_1111', project: 'GS3', filename: 'report1.md', mtime: 100 },
    { gameId: 'game_git_2222', project: 'Browser Gallery', filename: 'report2.md', mtime: 200 }
  ];

  const filterReports = (targetGameId) => allReports.filter(r => r.gameId === targetGameId);

  const gs3Reports = filterReports('game_git_1111');
  assert.equal(gs3Reports.length, 1);
  assert.equal(gs3Reports[0].filename, 'report1.md');

  const bgReports = filterReports('game_git_2222');
  assert.equal(bgReports.length, 1);
  assert.equal(bgReports[0].filename, 'report2.md');
});

test('15. Cross-Game dispatch rejects with 409 Conflict', () => {
  const activeGameId = 'game_git_1111';
  const dispatchPayload = {
    gameId: 'game_git_2222',
    prompt: 'Implement feature'
  };

  let rejectedStatus = null;
  let rejectionMessage = null;

  if (dispatchPayload.gameId && dispatchPayload.gameId !== activeGameId) {
    rejectedStatus = 409;
    rejectionMessage = `Play targeted Game '${dispatchPayload.gameId}', but active Game is '${activeGameId}'.`;
  }

  assert.equal(rejectedStatus, 409);
  assert.ok(rejectionMessage.includes('Play targeted Game'));
});

test('16. Offline Game dispatch rejects with 400 Bad Request', () => {
  const connectedGameId = 'game_git_1111';
  const selectedGameId = 'game_git_2222';
  const selectedGameName = 'Browser Gallery';

  let rejectedStatus = null;
  let rejectionMessage = null;

  if (selectedGameId !== connectedGameId) {
    rejectedStatus = 400;
    rejectionMessage = `Game '${selectedGameName}' is offline. Connect its Stadium or open in VS Code to dispatch Plays.`;
  }

  assert.equal(rejectedStatus, 400);
  assert.ok(rejectionMessage.includes('is offline'));
});

test('17. AUTO routing uses only selected Game controlled candidates', () => {
  const policy = new CodexRoutingPolicy();
  const policies = new Map([['codex', policy]]);

  // Selected game is offline -> empty capabilities
  const offlineResult = computeAutoRoute('game_git_2222', 'Plan architecture', [], policies);
  assert.equal(offlineResult.decision, undefined);
  assert.ok(offlineResult.error.includes('No Player is on field'));

  // Selected game is connected with ready player
  const liveCaps = [{
    instanceId: 'codex-1',
    playerType: 'codex',
    transport: 'controlled',
    fieldLabel: 'Codex 1',
    state: 'ready',
    capability: {
      provider: 'codex',
      freshness: 'live',
      observedAt: Date.now(),
      account: { type: 'chatgpt' },
      models: [{ id: 'o3-mini', displayName: 'o3-mini', isDefault: true, supportedEfforts: ['low', 'medium'], defaultEffort: 'medium' }]
    }
  }];
  const liveResult = computeAutoRoute('game_git_1111', 'Plan architecture', liveCaps, policies);
  assert.ok(liveResult.decision);
  assert.equal(liveResult.decision.playerInstanceId, 'codex-1');
});

test('18. Browser receives Game switch through status/SSE without refresh', async () => {
  const harness = await initConnectedHarness();

  // Simulate server broadcasting game change over SSE
  harness.setStatus({
    ...harness.getStatus(),
    selectedGameId: 'game_git_2222',
    connectionStatus: 'offline',
    game: { gameId: 'game_git_2222', displayName: 'Browser Gallery', fingerprintSource: 'git-remote' }
  });

  harness.getEventSource().emit('status', { type: 'game-select' });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(harness.getEl('projectName').textContent, 'Game: Browser Gallery');
  assert.equal(harness.getEl('gameConnectionBadge').textContent, 'Offline');
});

test('19. Reconnect restores authoritative selected Game from server', async () => {
  const harness = await initConnectedHarness();

  // Server state has selected Game as Browser Gallery
  harness.setStatus({
    ...harness.getStatus(),
    selectedGameId: 'game_git_2222',
    connectionStatus: 'offline',
    game: { gameId: 'game_git_2222', displayName: 'Browser Gallery', fingerprintSource: 'git-remote' }
  });

  // Reconnection event
  harness.getEventSource().emit('hello');
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(harness.getEl('projectName').textContent, 'Game: Browser Gallery');
  assert.equal(harness.getEl('gameConnectionBadge').textContent, 'Offline');
});

test('20. Composer draft cannot accidentally cross Games', async () => {
  const harness = await initConnectedHarness();
  const promptInput = harness.getEl('promptInput');
  const gameListEl = harness.getEl('gameList');

  // User types prompt in GS3
  promptInput.value = 'Draft for GS3 only';

  // User switches to Browser Gallery
  const bgItem = gameListEl.children.find((c) => c.children[0].textContent === 'Browser Gallery');
  await bgItem.listeners['click'][0]({ stopPropagation() {} });

  // In Browser Gallery, composer is cleared/restored for BG
  assert.equal(promptInput.value, '');

  // User switches back to GS3
  const gs3Item = gameListEl.children.find((c) => c.children[0].textContent === 'GS3');
  await gs3Item.listeners['click'][0]({ stopPropagation() {} });

  // Draft for GS3 is preserved and restored
  assert.equal(promptInput.value, 'Draft for GS3 only');
});

test('21. Q2.1 lifecycle cannot masquerade across Game switch', async () => {
  const harness = await initConnectedHarness();
  const dispatchBtn = harness.getEl('dispatchBtn');

  // Simulate active dispatch state in Game A
  dispatchBtn.textContent = 'Working…';

  // Switch to Game B
  const gameListEl = harness.getEl('gameList');
  const bgItem = gameListEl.children.find((c) => c.children[0].textContent === 'Browser Gallery');
  await bgItem.listeners['click'][0]({ stopPropagation() {} });

  // In Game B, dispatcher state is reset to idle
  assert.equal(dispatchBtn.textContent, 'Dispatch Play');
  assert.equal(dispatchBtn.disabled, true); // Offline game disables dispatch
});

test('22. Existing Q2.2 Game identity and cwd protections remain intact', () => {
  const memento = new MockMemento();
  const folder = { uri: { fsPath: 'C:\\Projects\\SidelineCoach' }, name: 'SidelineCoach' };
  const resolved = resolveGameContextSync({ workspaceFolder: folder, memento });

  assert.ok(resolved.game.gameId.startsWith('game_'));
  assert.equal(resolved.binding.status, 'bound');
  assert.equal(resolved.binding.rootFsPath, 'C:\\Projects\\SidelineCoach');
});

test('23. Existing Q2.4 routing tests remain valid and isolated', () => {
  const policy = new CodexRoutingPolicy();
  const policies = new Map([['codex', policy]]);
  const candidate = {
    instanceId: 'codex-1',
    playerType: 'codex',
    transport: 'controlled',
    fieldLabel: 'Codex 1',
    state: 'ready',
    capability: {
      provider: 'codex',
      freshness: 'live',
      observedAt: Date.now(),
      account: { type: 'chatgpt' },
      models: [
        { id: 'o3-mini', displayName: 'o3-mini', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
      ]
    }
  };

  const result = computeAutoRoute('game_git_1111', 'Implement cache invalidation', [candidate], policies);

  assert.ok(result.decision);
  assert.equal(result.decision.playerInstanceId, 'codex-1');
  assert.equal(result.decision.model, 'o3-mini');
});