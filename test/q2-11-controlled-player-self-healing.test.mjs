/**
 * Q2.11 — Controlled Player self-healing restore & truthful roster state.
 *
 * Field evidence: a Player card could show 🟢 On Field · Controlled while its
 * note read "Coach couldn't reopen this Player's conversation." — a green
 * card claiming a broken Player. This suite proves the replacement contract:
 *
 *   restore fails → bounded fresh-open recovery, attempted silently
 *   recovery succeeds → stays On Field / Controlled, no plumbing shown
 *   recovery also fails → benched + "Needs attention", never green+broken
 *   "Try Again" (Put on Field) re-attempts the same bounded recovery
 *
 * A minimal fake PlayerControlFactory drives PlayerRoster exactly as a real
 * provider adapter would, so this proves the roster's OWN self-healing
 * policy rather than any one provider's adapter internals (those already
 * have targeted coverage of their own restore/open contracts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Minimal VS Code host (same approach as p0-1-terminal-player) ---------

class StubEventEmitter {
  constructor() { this.listeners = new Set(); }
  get event() { return (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
  fire(value) { for (const listener of [...this.listeners]) listener(value); }
  dispose() { this.listeners.clear(); }
}

const terminalWrites = new Map(); // terminal -> string[]
const vscodeStub = {
  EventEmitter: StubEventEmitter,
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  TerminalExitReason: { Unknown: 0, Shutdown: 1, Process: 2, User: 3, Extension: 4 },
  window: {
    terminals: [],
    createTerminal(options) {
      const written = [];
      const terminal = {
        name: options?.name ?? 'terminal',
        pty: options?.pty,
        exitStatus: undefined,
        processId: Promise.resolve(undefined),
        show() {},
        sendText() {},
        dispose() {}
      };
      if (options?.pty) {
        terminalWrites.set(terminal, written);
        options.pty.onDidWrite((text) => written.push(text));
        options.pty.open();
      }
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
const { ControlOpenError } = await import('../out/player-control/contract.js');

class MemoryMemento { constructor() { this.data = new Map(); } get(k, f) { return this.data.has(k) ? structuredClone(this.data.get(k)) : f; } async update(k, v) { this.data.set(k, structuredClone(v)); } }
class MemoryBindingStore { constructor(records) { this.records = structuredClone(records); } load() { return structuredClone(this.records); } async save(records) { this.records = structuredClone(records); } }

const GAME_ID = 'game_git_q211';
const INSTANCE_ID = 'codex-a1b2c3d4';
const OLD_SESSION_REF = 'thread-old-broken';
const gameContext = () => ({
  game: { gameId: GAME_ID, displayName: 'Q2.11 Self-Healing', fingerprintSource: 'git-remote' },
  stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId: GAME_ID, stadiumId: 'stadium_test', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
});

function persistedBinding(extra = {}) {
  return {
    instanceId: INSTANCE_ID,
    playerType: 'codex',
    seat: 1,
    adapter: 'fake-codex',
    sessionRef: OLD_SESSION_REF,
    historyExpected: true,
    pendingPlay: null,
    gameId: GAME_ID,
    ...extra
  };
}

function fakeControl(sessionRef) {
  const listeners = new Set();
  return {
    instanceId: INSTANCE_ID,
    providerSessionRef: sessionRef,
    runtimeVersion: '0.0.0-fake',
    model: 'fake-model',
    effort: 'medium',
    state: 'ready',
    async deliver() { return { kind: 'accepted', turnRef: 'turn-fake' }; },
    async close() {},
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

/** A scripted PlayerControlFactory: each call is answered by the next queued script step. */
function fakeFactory({ restoreScript, openScript }) {
  let restoreCalls = 0;
  let openCalls = 0;
  return {
    adapterId: 'fake-codex',
    calls: { get restore() { return restoreCalls; }, get open() { return openCalls; } },
    async open(request) {
      openCalls += 1;
      return openScript(request, openCalls);
    },
    async restore(request, binding) {
      restoreCalls += 1;
      return restoreScript(request, binding, restoreCalls);
    }
  };
}

async function until(predicate, { timeoutMs = 3000, intervalMs = 10, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function codexInstance(roster) {
  const status = await roster.status();
  const codex = status.find((p) => p.id === 'codex');
  return codex?.instances?.[0];
}

function boot(factory) {
  vscodeStub.window.terminals.length = 0;
  terminalWrites.clear();
  const store = new MemoryBindingStore([persistedBinding()]);
  const host = new PlayerControlHost(store);
  host.register('codex', factory);
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);
  return { roster, host };
}

function allWrites() {
  return [...terminalWrites.values()].flat().join('\n');
}

const PLUMBING = /command failed|powershell|get-command|\[pscustomobject\]/i;

test('Q2.11-1. Restore succeeds: Player stays On Field/Controlled, no recovery attempted', async () => {
  const factory = fakeFactory({
    restoreScript: async () => ({ kind: 'ready', control: fakeControl(OLD_SESSION_REF), reconciliation: { kind: 'none' }, openedFresh: false }),
    openScript: async () => { throw new Error('recovery must not run when restore succeeds'); }
  });
  const { roster, host } = boot(factory);
  const inst = await until(() => codexInstance(roster).then((i) => i?.controlState === 'ready' && i), { label: 'ready' });
  assert.equal(inst.onField, true);
  assert.equal(inst.stateMessage, 'Ready');
  assert.equal(factory.calls.open, 0, 'a clean restore never attempts fresh-open recovery');
  await host.dispose();
});

test('Q2.11-2. Restore fails on technical plumbing, fresh recovery succeeds: stays On Field/Controlled with no plumbing shown', async () => {
  const diagnostic = 'Command failed: powershell.exe -NoLogo -NoProfile -Command Get-Command codex';
  const factory = fakeFactory({
    restoreScript: async () => ({ kind: 'needs-decision', message: "Coach couldn't reopen this Player's conversation.", diagnostic }),
    openScript: async () => fakeControl('thread-fresh-1')
  });
  const { roster, host } = boot(factory);
  const inst = await until(() => codexInstance(roster).then((i) => i?.controlState === 'ready' && i), { label: 'recovered ready' });
  assert.equal(inst.onField, true, 'a self-healed Player stays On Field');
  assert.equal(inst.stateMessage, 'Ready', 'no error text on a healed card');
  assert.equal(factory.calls.open, 1, 'exactly one bounded recovery attempt');

  const written = allWrites();
  assert.match(written, /Started a fresh conversation\./, 'the one-time notice is preserved, just not on the card state');
  assert.match(written, new RegExp(diagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'raw diagnostic stays available internally');
  await host.dispose();
});

test('Q2.11-3. Restore fails AND recovery fails: Player is benched with Needs attention, never green+broken', async () => {
  const restoreDiagnostic = 'Command failed: powershell.exe -NoLogo -NoProfile -Command Get-Command codex';
  const factory = fakeFactory({
    restoreScript: async () => ({ kind: 'needs-decision', message: "Coach couldn't reopen this Player's conversation.", diagnostic: restoreDiagnostic }),
    openScript: async () => { throw new ControlOpenError('failed', 'Codex is not installed or could not be found in this Stadium.'); }
  });
  const { roster, host } = boot(factory);
  const inst = await until(() => codexInstance(roster).then((i) => i?.onField === false && i), { label: 'benched' });

  // The forbidden state: green and On Field while actually broken.
  assert.notEqual(inst.controlState, 'ready');
  assert.equal(inst.onField, false, 'not dispatchable, so not On Field');
  assert.match(inst.stateMessage, /^Needs attention:/);
  assert.doesNotMatch(inst.stateMessage, PLUMBING, 'customer-facing message stays clean');

  const written = allWrites();
  assert.match(written, new RegExp(restoreDiagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'restore diagnostic preserved internally');
  assert.match(written, /Codex is not installed/, 'recovery diagnostic preserved internally');

  // Remove Player remains the human's explicit act — the Player survives on the roster.
  const removed = await roster.removePlayer(INSTANCE_ID);
  assert.equal(removed.success, true);
  await host.dispose();
});

test('Q2.11-4. "Try Again" (Put on Field) on a benched Player re-attempts the bounded recovery and can succeed', async () => {
  let restoreShouldSucceed = false;
  const factory = fakeFactory({
    restoreScript: async () => restoreShouldSucceed
      ? { kind: 'ready', control: fakeControl(OLD_SESSION_REF), reconciliation: { kind: 'none' }, openedFresh: false }
      : { kind: 'needs-decision', message: "Coach couldn't reopen this Player's conversation.", diagnostic: 'spawn ENOENT codex' },
    openScript: async () => { throw new ControlOpenError('failed', 'Codex is not installed or could not be found in this Stadium.'); }
  });
  const { roster, host } = boot(factory);
  await until(() => codexInstance(roster).then((i) => i?.onField === false && i), { label: 'initially benched' });

  restoreShouldSucceed = true;
  const result = await roster.putInstanceOnField(INSTANCE_ID);
  assert.equal(result.success, true);
  const inst = await until(() => codexInstance(roster).then((i) => i?.controlState === 'ready' && i), { label: 'recovered after Try Again' });
  assert.equal(inst.onField, true);
  assert.equal(inst.stateMessage, 'Ready');
  await host.dispose();
});
