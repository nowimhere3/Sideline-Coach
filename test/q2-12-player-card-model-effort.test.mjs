/**
 * Q2.12 — Truthful Player card Model + Effort.
 *
 *   active PlayerControl.model/.effort (what this session IS running now)
 *     -> capability catalog consulted ONLY for a human-readable display name
 *     -> PlayerRoster.status() projects modelDisplayName/effortDisplayName
 *     -> the browser renders it, never reconstructing provider truth itself
 *
 * Never manufactured: unknown stays unknown, a capability catalog with many
 * models never causes a guess at which one is active, and a `settings` event
 * wakes the existing roster-changed broadcast rather than a new event bus.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class StubEventEmitter {
  constructor() { this.listeners = new Set(); }
  get event() { return (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
  fire(value) { for (const listener of [...this.listeners]) listener(value); }
  dispose() { this.listeners.clear(); }
}
const vscodeStub = {
  EventEmitter: StubEventEmitter,
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  TerminalExitReason: { Unknown: 0, Shutdown: 1, Process: 2, User: 3, Extension: 4 },
  window: {
    terminals: [],
    createTerminal(options) {
      const terminal = { name: options?.name ?? 'terminal', pty: options?.pty, exitStatus: undefined, processId: Promise.resolve(undefined), show() {}, sendText() {}, dispose() {} };
      if (options?.pty) options.pty.open?.();
      vscodeStub.window.terminals.push(terminal);
      return terminal;
    },
    onDidOpenTerminal: () => ({ dispose() {} }),
    onDidCloseTerminal: () => ({ dispose() {} })
  },
  workspace: { workspaceFolders: undefined }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, ...rest);
};

const { PlayerRoster } = await import('../out/player-roster.js');
const { PlayerControlHost } = await import('../out/player-control/host.js');
const { controlledControlProfile } = await import('../out/provider-control.js');

class MemoryMemento { constructor() { this.data = new Map(); } get(k, f) { return this.data.has(k) ? structuredClone(this.data.get(k)) : f; } async update(k, v) { this.data.set(k, structuredClone(v)); } }
class MemoryBindingStore { constructor(records) { this.records = structuredClone(records); } load() { return structuredClone(this.records); } async save(records) { this.records = structuredClone(records); } }

const GAME_ID = 'game_git_q212';
const INSTANCE_ID = 'codex-a1b2c3d4';
const gameContext = () => ({
  game: { gameId: GAME_ID, displayName: 'Q2.12 Model Effort', fingerprintSource: 'git-remote' },
  stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId: GAME_ID, stadiumId: 'stadium_test', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
});

const CODEX_CAPABILITY = {
  provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live',
  models: [
    { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    { id: 'gpt-6-astra', displayName: 'GPT-6 Astra', isDefault: false, supportedEfforts: ['medium', 'high', 'ultra'], defaultEffort: 'high' }
  ]
};

function fakeControl(overrides = {}) {
  const listeners = new Set();
  const control = {
    instanceId: 'codex-a1b2c3d4',
    providerSessionRef: 'thread-1',
    runtimeVersion: '1.0.0',
    model: undefined,
    effort: undefined,
    state: 'ready',
    async deliver() { return { kind: 'accepted', turnRef: 'turn-1' }; },
    async close() {},
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async queryCapabilities() { return CODEX_CAPABILITY; },
    emit(event) { for (const listener of [...listeners]) listener(event); },
    ...overrides
  };
  return control;
}

function fakeFactory(control) {
  return { adapterId: 'fake-codex', async open() { return control; }, async restore() { return { kind: 'ready', control, reconciliation: { kind: 'none' }, openedFresh: false }; } };
}

function persistedBinding() {
  return { instanceId: INSTANCE_ID, playerType: 'codex', seat: 1, adapter: 'fake-codex', sessionRef: 'thread-1', historyExpected: false, pendingPlay: null, gameId: GAME_ID };
}

async function codexInstance(roster) {
  const status = await roster.status();
  return status.find((p) => p.id === 'codex')?.instances?.[0];
}

/**
 * Boots a controlled Codex instance via the SAME persisted-restore path a
 * real reconnect uses (adoptControlledRestores -> restoreControlled), not
 * addControlledInstance() — that path additionally probes `Get-Command codex`
 * on this machine, which is irrelevant to what this feature actually tests.
 */
function boot(control) {
  vscodeStub.window.terminals.length = 0;
  const store = new MemoryBindingStore([persistedBinding()]);
  const host = new PlayerControlHost(store);
  host.register('codex', fakeFactory(control));
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);
  return { roster, host };
}

async function untilReady(roster) {
  for (let i = 0; i < 100; i += 1) {
    const instance = await codexInstance(roster);
    if (instance?.controlState === 'ready' && roster.getCapabilityService().get('codex').freshness !== 'unavailable') return instance;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for the controlled instance to become ready with queried capabilities.');
}

test('Q2.12-1. A Controlled Player with authoritative model + effort projects a truthful display name for both', async () => {
  const control = fakeControl({ model: 'gpt-5.6-sol', effort: 'medium' });
  const { roster, host } = boot(control);
  const instance = await untilReady(roster);
  assert.equal(instance.modelDisplayName, 'GPT-5.6 Sol');
  assert.equal(instance.effortDisplayName, 'Medium');
  await host.dispose();
});

test('Q2.12-2. A known model with unknown effort shows the model alone — effort is never invented', async () => {
  const control = fakeControl({ model: 'gpt-5.6-sol', effort: undefined });
  const { roster, host } = boot(control);
  const instance = await untilReady(roster);
  assert.equal(instance.modelDisplayName, 'GPT-5.6 Sol');
  assert.equal(instance.effortDisplayName, undefined, 'unknown effort stays unknown, never defaulted to e.g. Medium');
  await host.dispose();
});

test('Q2.12-3. Neither model nor effort known (no Play sent yet): both stay genuinely absent, never a fabricated default', async () => {
  const control = fakeControl({ model: undefined, effort: undefined });
  const { roster, host } = boot(control);
  const instance = await untilReady(roster);
  assert.equal(instance.modelDisplayName, undefined);
  assert.equal(instance.effortDisplayName, undefined);
  await host.dispose();
});

test('Q2.12-4. A capability catalog with multiple models never causes a guess — the display name matches the ACTIVE model, not the catalog default', async () => {
  const control = fakeControl({ model: 'gpt-6-astra', effort: 'high' });
  const { roster, host } = boot(control);
  const instance = await untilReady(roster);
  assert.equal(instance.modelDisplayName, 'GPT-6 Astra', 'the SECOND, non-default catalog entry — proves exact matching, not "pick the default"');
  assert.equal(instance.effortDisplayName, 'High');
  await host.dispose();
});

test('Q2.12-5. An authoritative settings change propagates through the existing roster-changed broadcast, no new event bus', async () => {
  const control = fakeControl({ model: 'gpt-5.6-sol', effort: 'medium' });
  const { roster, host } = boot(control);
  await untilReady(roster);
  let changeCount = 0;
  roster.onDidChange(() => { changeCount += 1; });
  // The adapter updates its own control fields in place, THEN emits settings —
  // exactly the sequence CodexAppServerControl/StructuredPrintControl follow.
  control.model = 'gpt-6-astra';
  control.effort = 'high';
  control.emit({ kind: 'settings', model: control.model, effort: control.effort, runtimeVersion: control.runtimeVersion });
  assert.ok(changeCount > 0, 'a settings event wakes the existing roster-changed broadcast');
  const instance = await codexInstance(roster);
  assert.equal(instance.modelDisplayName, 'GPT-6 Astra', 'status() reads the updated control state fresh, no cached stale value');
  assert.equal(instance.effortDisplayName, 'High');
  await host.dispose();
});

test('Q2.12-6. Legacy/external (non-controlled) Players are never assigned a model/effort field at all', async () => {
  const host = new PlayerControlHost();
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);
  await roster.addTerminalPlayer();
  const status = await roster.status();
  const terminal = status.find((p) => p.id === 'terminal')?.instances?.[0];
  assert.ok(terminal, 'terminal instance exists');
  assert.equal('modelDisplayName' in terminal, false);
  assert.equal('effortDisplayName' in terminal, false);
  await host.dispose();
});

test('Q2.12-7. AntiGravity-shaped variant ids: the catalog is keyed by family, the active session reports the full variant — matched, not guessed', () => {
  const capability = {
    provider: 'antigravity', authenticated: false, observedAt: Date.now(), freshness: 'live',
    models: [{ id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', isDefault: false, supportedEfforts: ['low', 'medium', 'high'] }]
  };
  const profile = controlledControlProfile('antigravity', capability, { model: 'gemini-3.8-flash-medium', effort: 'medium' });
  assert.equal(profile.model.currentLabel, 'Gemini 3.8 Flash', 'family-prefix match, not the raw variant id, and no duplicated "(Medium)"');
  assert.equal(profile.effort.currentLabel, 'Medium');

  const noMatch = controlledControlProfile('antigravity', capability, { model: 'gemini-9.9-nonexistent-medium', effort: 'medium' });
  assert.notEqual(noMatch.model.currentLabel, 'Gemini 3.8 Flash', 'never matches an active id onto a DIFFERENT catalog entry just because one exists');
});

test('Q2.12-8. Claude-shaped mismatch (catalog alias vs. full model slug): last-resort humanized fallback, never a wrong catalog match', () => {
  const capability = {
    provider: 'claude', authenticated: false, observedAt: Date.now(), freshness: 'live',
    models: [{ id: 'sonnet', displayName: 'Sonnet', isDefault: true, supportedEfforts: ['low', 'medium', 'high'] }]
  };
  const profile = controlledControlProfile('claude', capability, { model: 'claude-sonnet-5', effort: 'high' });
  assert.equal(profile.model.currentLabel, 'Claude Sonnet 5', 'truthful humanized fallback of the REAL active id, not the catalog alias label "Sonnet"');
  assert.equal(profile.effort.currentLabel, 'High');
});
