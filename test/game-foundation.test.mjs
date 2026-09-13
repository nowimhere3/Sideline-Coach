import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  normalizeGitUrl,
  getStadiumIdentity,
  resolveGameContext,
  resolveGameContextSync,
  PROJECT_REGISTRY_KEY
} from '../out/game-identity.js';
import {
  isControlledBindingRecord,
  planControlledRestores,
  cloneRecord
} from '../out/player-control/bindings.js';
import { PlayerControlHost } from '../out/player-control/host.js';
import { CodexAppServerFactory } from '../out/player-control/codex-app-server.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');

class MemoryStore {
  constructor(value = []) {
    this.value = structuredClone(value);
    this.snapshots = [];
    this.saveCount = 0;
  }
  load() { return structuredClone(this.value); }
  async save(records) {
    this.saveCount += 1;
    this.value = structuredClone(records);
    this.snapshots.push(structuredClone(records));
  }
}

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

const html = await readFile(resolve('src/public/index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script found in index.html');
const scriptCode = scriptMatch[1];

function createHarness(initialStatus = null) {
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
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      classList: {
        classes: new Set(),
        add(...tokens) { for (const t of tokens) this.classes.add(t); },
        remove(...tokens) { for (const t of tokens) this.classes.delete(t); }
      },
      appendChild(child) { this.children = this.children || []; this.children.push(child); },
      append(...children) { this.children = this.children || []; this.children.push(...children); },
      addEventListener() {},
      children: []
    })
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
    emit(event, data) {
      for (const fn of this.listeners[event] || []) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
    close() {}
  }

  const defaultStatus = initialStatus || {
    game: { gameId: 'game_git_test', displayName: 'GS3', fingerprintSource: 'git-remote' },
    stadium: { stadiumId: 'stadium_win_123', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    workspaceRoots: ['/repo'],
    modelSwitches: { Default: '' },
    players: [{
      id: 'codex',
      name: 'Codex',
      availability: 'available',
      fieldState: 'on-field',
      instances: [
        {
          instanceId: 'codex-inst-1',
          playerType: 'codex',
          seat: 1,
          fieldLabel: 'Codex 1 · Controlled',
          controlMode: 'controlled',
          turnState: { instanceId: 'codex-inst-1', state: 'idle', summary: 'Ready', at: 0 }
        }
      ]
    }]
  };

  let currentStatus = defaultStatus;
  let dispatchedPayloads = [];

  let fetchHandler = async (url, options = {}) => {
    if (url === '/api/status') {
      return { ok: true, status: 200, json: async () => currentStatus };
    }
    if (url === '/api/reports') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url === '/api/dispatch') {
      const body = JSON.parse(options.body || '{}');
      dispatchedPayloads.push(body);
      return { ok: true, status: 200, json: async () => ({ success: true, outcome: 'accepted', message: 'Accepted' }) };
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
    fetch: async (...args) => fetchHandler(...args),
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
    elements,
    getEl,
    getEventSource: () => eventSourceInstance,
    dispatchedPayloads,
    setFetch: (handler) => { fetchHandler = handler; },
    setStatus: (status) => { currentStatus = status; },
    selectPlayer: (instanceId) => {
      getEl('terminalSelect').value = instanceId;
      for (const fn of getEl('terminalSelect').listeners['change'] || []) fn({ target: { value: instanceId } });
    },
    clickDispatch: async () => {
      for (const fn of getEl('dispatchBtn').listeners['click'] || []) await fn();
    }
  };
}

async function initConnectedHarness(initialStatus = null) {
  const harness = createHarness(initialStatus);
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
// TESTS
// ============================================================================

test('1. Equivalent Git remote forms resolve to the same Game ID', () => {
  const forms = [
    'git@github.com:nowimhere3/Sideline-Coach.git',
    'https://github.com/nowimhere3/Sideline-Coach.git',
    'https://github.com/nowimhere3/Sideline-Coach',
    'http://github.com/nowimhere3/Sideline-Coach.git',
    'ssh://git@github.com/nowimhere3/Sideline-Coach.git',
    'ssh://git@github.com:22/nowimhere3/Sideline-Coach.git',
    'git://github.com/nowimhere3/Sideline-Coach.git'
  ];

  const normalizedResults = forms.map(normalizeGitUrl);
  for (const n of normalizedResults) {
    assert.equal(n, 'github.com/nowimhere3/sideline-coach');
  }

  const baseFolder = { uri: { fsPath: repoRoot }, name: 'SidelineCoach' };
  const context = resolveGameContextSync({ workspaceFolder: baseFolder });
  assert.match(context.game.gameId, /^game_git_[0-9a-f]{8}$/);
});

test('2. Folder path rename does not alter Git-derived Game identity', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'sideline-test-git-'));
  const pathA = join(scratch, 'repo-path-a');
  const pathB = join(scratch, 'repo-path-b');

  await mkdir(join(pathA, '.git'), { recursive: true });
  await mkdir(join(pathB, '.git'), { recursive: true });

  const gitConfig = `[remote "origin"]\n\turl = git@github.com:acme/my-service.git\n`;
  await writeFile(join(pathA, '.git', 'config'), gitConfig, 'utf8');
  await writeFile(join(pathB, '.git', 'config'), gitConfig, 'utf8');

  const contextA = resolveGameContextSync({ workspaceFolder: { uri: { fsPath: pathA }, name: 'folderA' } });
  const contextB = resolveGameContextSync({ workspaceFolder: { uri: { fsPath: pathB }, name: 'folderB' } });

  assert.equal(contextA.game.gameId, contextB.game.gameId);
  assert.equal(contextA.game.fingerprintSource, 'git-remote');
  assert.equal(contextB.game.fingerprintSource, 'git-remote');

  await rm(scratch, { recursive: true, force: true });
});

test('3. Explicit marker overrides Git identity', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'sideline-test-marker-'));
  await mkdir(join(scratch, '.git'), { recursive: true });
  await mkdir(join(scratch, '.sideline'), { recursive: true });

  await writeFile(join(scratch, '.git', 'config'), `[remote "origin"]\n\turl = https://github.com/acme/my-service.git\n`, 'utf8');
  await writeFile(join(scratch, '.sideline', 'game.json'), JSON.stringify({
    gameId: 'custom-game-override',
    displayName: 'Explicit Game Name'
  }), 'utf8');

  const context = resolveGameContextSync({ workspaceFolder: { uri: { fsPath: scratch }, name: 'test-folder' } });
  assert.equal(context.game.gameId, 'game_marker_custom-game-override');
  assert.equal(context.game.displayName, 'Explicit Game Name');
  assert.equal(context.game.fingerprintSource, 'marker');

  await rm(scratch, { recursive: true, force: true });
});

test('4. Non-Git local registry is stable across ordinary reload', () => {
  const memento = new MockMemento();
  const folder = { uri: { fsPath: 'C:\\projects\\scratch-workspace' }, name: 'scratch-workspace' };

  const first = resolveGameContextSync({ workspaceFolder: folder, memento });
  assert.match(first.game.gameId, /^game_reg_[0-9a-f]{8}$/);
  assert.equal(first.game.fingerprintSource, 'registry');

  const second = resolveGameContextSync({ workspaceFolder: folder, memento });
  assert.equal(second.game.gameId, first.game.gameId);
  assert.equal(second.game.displayName, 'scratch-workspace');
});

test('5. No workspace produces Game Unknown', () => {
  const context = resolveGameContextSync({ workspaceFolder: undefined });
  assert.equal(context.game.gameId, 'unknown');
  assert.equal(context.game.displayName, 'Unknown');
  assert.equal(context.game.fingerprintSource, 'unknown');
  assert.equal(context.binding.status, 'unbound');
  assert.equal(context.binding.rootFsPath, '');
});

test('6. Canonical status shape includes Game and Stadium context', () => {
  const stadium = getStadiumIdentity();
  assert.ok(stadium.stadiumId.startsWith('stadium_'));
  assert.ok(stadium.name.length > 0);
  assert.ok(stadium.platform === 'win32' || stadium.platform === 'darwin' || stadium.platform === 'linux');
});

test('7. Browser renders current Game from canonical Coach state', async () => {
  const initialStatus = {
    game: { gameId: 'game_git_98765432', displayName: 'GS3', fingerprintSource: 'git-remote' },
    stadium: { stadiumId: 'stadium_win_123', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    activeProject: 'GS3',
    workspaceRoots: ['GS3'],
    players: []
  };

  const harness = await initConnectedHarness(initialStatus);
  const projectEl = harness.getEl('projectName');
  const stadiumEl = harness.getEl('stadiumName');

  assert.equal(projectEl.textContent, 'Game: GS3');
  assert.equal(stadiumEl.textContent, 'Stadium: Windows');

  // Updating status with unknown Game
  harness.setStatus({
    game: { gameId: 'unknown', displayName: 'Unknown', fingerprintSource: 'unknown' },
    stadium: { stadiumId: 'stadium_win_123', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    activeProject: 'No workspace',
    workspaceRoots: [],
    players: []
  });
  harness.getEventSource().emit('status', { type: 'game-change' });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(projectEl.textContent, 'Game: Unknown');
});

test('8. Dispatch includes active canonical gameId', async () => {
  const initialStatus = {
    game: { gameId: 'game_git_current', displayName: 'Current Game' },
    stadium: { name: 'Windows' },
    players: [{
      id: 'codex',
      name: 'Codex',
      availability: 'available',
      fieldState: 'on-field',
      instances: [{ instanceId: 'codex-inst-1', fieldLabel: 'Codex 1 · Controlled' }]
    }]
  };

  const harness = await initConnectedHarness(initialStatus);
  harness.selectPlayer('codex-inst-1');
  harness.getEl('promptInput').value = 'Hello';

  await harness.clickDispatch();

  assert.equal(harness.dispatchedPayloads.length, 1);
  assert.equal(harness.dispatchedPayloads[0].gameId, 'game_git_current');
});

test('9. Controlled binding includes/migrates Game identity safely', () => {
  const legacyRecord = {
    instanceId: 'codex-12345678',
    playerType: 'codex',
    seat: 1,
    adapter: 'codex-app-server',
    sessionRef: 'sess-1',
    historyExpected: true,
    pendingPlay: null
  };
  assert.ok(isControlledBindingRecord(legacyRecord));

  const migratedRecord = {
    ...legacyRecord,
    gameId: 'game_git_abcdef12'
  };
  assert.ok(isControlledBindingRecord(migratedRecord));

  const invalidRecord = {
    ...legacyRecord,
    bogusField: 'not-allowed'
  };
  assert.equal(isControlledBindingRecord(invalidRecord), false);

  const adapters = new Set(['codex-app-server']);
  const plans = planControlledRestores([legacyRecord], adapters, 'game_git_backfilled');
  assert.equal(plans[0].kind, 'restore');
  assert.equal(plans[0].record.gameId, 'game_git_backfilled');
});

test('10. Controlled restore for a different Game is quarantined', () => {
  const adapters = new Set(['codex-app-server']);
  const recordOldGame = {
    instanceId: 'codex-12345678',
    playerType: 'codex',
    seat: 1,
    adapter: 'codex-app-server',
    sessionRef: 'sess-1',
    historyExpected: true,
    pendingPlay: null,
    gameId: 'game_git_game_A'
  };

  const plans = planControlledRestores([recordOldGame], adapters, 'game_git_game_B');
  assert.equal(plans[0].kind, 'needs-decision');
  assert.match(plans[0].message, /belongs to Game 'game_git_game_A', but active Game is 'game_git_game_B'/);
});

test('11. Same Game + same root preserves normal controlled restore', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'sideline-test-host-'));
  const logPath = join(scratch, 'test-normal.jsonl');
  const store = new MemoryStore([{
    instanceId: 'codex-12345678',
    playerType: 'codex',
    seat: 1,
    adapter: 'codex-app-server',
    sessionRef: 'session-normal',
    historyExpected: false,
    pendingPlay: null,
    gameId: 'game_git_same'
  }]);

  const host = new PlayerControlHost(store);
  const factory = new CodexAppServerFactory({
    command: process.execPath,
    args: [fixture],
    shell: false,
    closeGraceMs: 100,
    requestTimeoutMs: 1_000,
    retryDelayMs: 5,
    resumeRetryDelaysMs: [5, 5, 5],
    env: { FAKE_LOG_PATH: logPath, FAKE_MODE: 'normal' }
  });

  host.register('codex', factory);
  const plans = host.planRestores('game_git_same');
  assert.equal(plans[0].kind, 'restore');

  const outcome = await host.restore({
    instanceId: 'codex-12345678',
    playerType: 'codex',
    seat: 1,
    gameRoot: repoRoot,
    gameId: 'game_git_same',
    authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
  });

  assert.equal(outcome.kind, 'ready');
  await host.dispose();
  await rm(scratch, { recursive: true, force: true });
});

test('12. Same Game + different root does NOT bypass provider cwd validation', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'sideline-test-diff-root-'));
  const logPath = join(scratch, 'test-diff.jsonl');

  const store = new MemoryStore([{
    instanceId: 'codex-12345678',
    playerType: 'codex',
    seat: 1,
    adapter: 'codex-app-server',
    sessionRef: 'session-normal',
    historyExpected: false,
    pendingPlay: null,
    gameId: 'game_git_same'
  }]);

  const host = new PlayerControlHost(store);
  const factory = new CodexAppServerFactory({
    command: process.execPath,
    args: [fixture],
    shell: false,
    closeGraceMs: 100,
    requestTimeoutMs: 1_000,
    retryDelayMs: 5,
    resumeRetryDelaysMs: [5, 5, 5],
    env: { FAKE_LOG_PATH: logPath, FAKE_MODE: 'resume-wrong-cwd' }
  });

  host.register('codex', factory);

  const plans = host.planRestores('game_git_same');
  assert.equal(plans[0].kind, 'restore');

  // Even though gameId matches, provider cwd check rejects contradictory cwd
  const outcome = await host.restore({
    instanceId: 'codex-12345678',
    playerType: 'codex',
    seat: 1,
    gameRoot: repoRoot,
    gameId: 'game_git_same',
    authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
  });

  assert.equal(outcome.kind, 'needs-decision');
  assert.match(outcome.message, /cwd/i);

  await host.dispose();
  await rm(scratch, { recursive: true, force: true });
});

test('13. No Game identity depends on terminal names, PID, or Coach port', () => {
  const folder = { uri: { fsPath: repoRoot }, name: 'SidelineCoach' };
  const context1 = resolveGameContextSync({ workspaceFolder: folder });
  const context2 = resolveGameContextSync({ workspaceFolder: folder });
  assert.equal(context1.game.gameId, context2.game.gameId);
  assert.equal(context1.game.displayName, context2.game.displayName);
});
