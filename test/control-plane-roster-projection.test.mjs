/**
 * Q2.8F regression proof — persisted controlled Player must survive the whole
 * chain from workspace-state binding to the browser's rendered roster.
 *
 * The Q2.8 blind spot this file closes: every prior test either drove
 * PlayerRoster's output shape by hand or fed the browser a hand-written
 * /api/status body. Nothing joined the real roster authority to the real
 * Control Plane projection to the real browser parser, so a renamed status
 * field blanked the roster while 172/172 stayed green.
 *
 * These tests deliberately do NOT inject `players: [fakeCodex]` anywhere.
 * The only Player in play is resumed from a persisted ControlledBindingRecord
 * by the real PlayerControlHost against the real fake codex app-server.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const fixture = path.join(testDir, 'fixtures', 'fake-codex-app-server.mjs');

const GAME_ID = 'game_git_gs3test';
const INSTANCE_ID = 'codex-c7967b47';
const SESSION_REF = 'thread-gs3-persisted';
const ADAPTER_ID = 'codex-app-server';

// ---------------------------------------------------------------------------
// Minimal VS Code host. PlayerRoster is the canonical roster authority and it
// only exists inside an extension host, so a faithful integration test has to
// stand one up rather than substitute a hand-written roster.
// ---------------------------------------------------------------------------

class StubEventEmitter {
  constructor() { this.listeners = new Set(); }
  get event() {
    return (listener) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }
  fire(value) { for (const listener of [...this.listeners]) listener(value); }
  dispose() { this.listeners.clear(); }
}

const openTerminalListeners = new Set();
const closeTerminalListeners = new Set();

const vscodeStub = {
  EventEmitter: StubEventEmitter,
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  TerminalExitReason: { Unknown: 0, Shutdown: 1, Process: 2, User: 3, Extension: 4 },
  window: {
    terminals: [],
    createTerminal(options) {
      const terminal = {
        name: options?.name ?? 'terminal',
        pty: options?.pty,
        exitStatus: undefined,
        processId: Promise.resolve(undefined),
        show() {},
        sendText() {},
        dispose() {}
      };
      vscodeStub.window.terminals.push(terminal);
      options?.pty?.open?.();
      return terminal;
    },
    onDidOpenTerminal(listener) {
      openTerminalListeners.add(listener);
      return { dispose: () => openTerminalListeners.delete(listener) };
    },
    onDidCloseTerminal(listener) {
      closeTerminalListeners.add(listener);
      return { dispose: () => closeTerminalListeners.delete(listener) };
    }
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
const { CodexAppServerFactory } = await import('../out/player-control/codex-app-server.js');
const { ControlPlaneDaemon } = await import('../out/control-plane/daemon.js');
const { StadiumClient } = await import('../out/stadium-client.js');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const html = await readFile(path.resolve(repoRoot, 'src/public/index.html'), 'utf8');
const scriptCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class MemoryMemento {
  constructor() { this.data = new Map(); }
  get(key, fallback) { return this.data.has(key) ? structuredClone(this.data.get(key)) : fallback; }
  async update(key, value) { this.data.set(key, structuredClone(value)); }
}

/** Stands in for WorkspaceStateBindingStore; same BindingStore contract. */
class MemoryBindingStore {
  constructor(records) { this.records = structuredClone(records); }
  load() { return structuredClone(this.records); }
  async save(records) { this.records = structuredClone(records); }
}

function persistedControlledBinding() {
  return {
    instanceId: INSTANCE_ID,
    playerType: 'codex',
    seat: 1,
    adapter: ADAPTER_ID,
    sessionRef: SESSION_REF,
    historyExpected: false,
    pendingPlay: null,
    gameId: GAME_ID
  };
}

function gameContext() {
  return {
    game: { gameId: GAME_ID, displayName: 'GS3', fingerprintSource: 'git-remote', repoUri: 'github.com/nowimhere3/gs3' },
    stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId: GAME_ID, stadiumId: 'stadium_test', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  };
}

function codexFactory(logPath) {
  return new CodexAppServerFactory({
    command: process.execPath,
    args: [fixture],
    shell: false,
    certifiedVersions: ['0.154.0'],
    env: { ...process.env, FAKE_LOG_PATH: logPath, FAKE_MODE: 'normal', FAKE_THREAD_ID: SESSION_REF }
  });
}

async function until(predicate, { timeoutMs = 15000, intervalMs = 25, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Boots the real persistence -> roster -> StadiumClient -> Control Plane chain
 * exactly as extension activation does, and hands back live handles.
 */
async function bootStadium({ port }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-q28f-'));
  const store = new MemoryBindingStore([persistedControlledBinding()]);
  const host = new PlayerControlHost(store);
  host.register('codex', codexFactory(path.join(scratch, 'codex.jsonl')));

  // 1-3. Activation order: roster is constructed, which plans and adopts the
  //      persisted controlled restores before any Control Plane traffic.
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);

  const daemon = new ControlPlaneDaemon({ dir: scratch, port, idleTimeoutMs: 120000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(scratch, 'token'), 'utf8').trim();

  const client = new StadiumClient({
    port: daemon.port,
    dir: scratch,
    token,
    instanceId: 'inst_q28f_1',
    gameContextGetter: gameContext,
    playerRoster: roster,
    playerControlHost: host,
    autoReconnect: false
  });

  // 4. Roster changes keep announcing, exactly as extension.ts wires them.
  roster.onDidChange(() => {
    void client.sendRosterChanged();
    client.sendCapabilitySnapshot();
  });

  const api = async (pathname, init) => {
    const res = await fetch(`http://127.0.0.1:${daemon.port}${pathname}${pathname.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, init);
    return { status: res.status, body: await res.json() };
  };

  const teardown = async () => {
    client.dispose();
    roster.dispose();
    await host.dispose();
    await daemon.stop();
    fs.rmSync(scratch, { recursive: true, force: true });
  };

  return { scratch, store, host, roster, daemon, client, token, api, teardown };
}

/** Runs the real browser script against a real /api/status body. */
function renderInBrowser(status) {
  const elements = new Map();
  const makeNode = (id) => ({
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    hidden: false,
    title: '',
    className: '',
    dataset: {},
    style: { display: '', opacity: '' },
    attributes: {},
    children: [],
    listeners: {},
    classList: {
      classes: new Set(),
      add(...t) { for (const x of t) this.classes.add(x); },
      remove(...t) { for (const x of t) this.classes.delete(x); },
      toggle(c, force) { const on = force === undefined ? !this.classes.has(c) : force; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; this[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); },
    append(...kids) { this.children.push(...kids); }
  });
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  };

  let eventSourceInstance = null;
  class FakeEventSource {
    constructor(url) { this.url = url; this.listeners = {}; eventSourceInstance = this; }
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
    emit(event, data = {}) { for (const fn of this.listeners[event] || []) fn({ data: JSON.stringify(data) }); }
    close() {}
  }

  const sessionData = new Map([['sidelineCoachToken', 'test-token']]);
  const context = {
    document: {
      getElementById: getEl,
      querySelectorAll: (selector) => (selector === '[data-live-action]' ? [getEl('dispatchBtn')] : []),
      createElement: () => makeNode('')
    },
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage: {
      getItem: (k) => sessionData.get(k) ?? null,
      setItem: (k, v) => sessionData.set(k, v),
      removeItem: (k) => sessionData.delete(k)
    },
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: async (url) => {
      if (url.startsWith('/api/status')) return { ok: true, status: 200, json: async () => status };
      if (url.startsWith('/api/reports')) return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    },
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
  eventSourceInstance.emit('hello');
  return { getEl, eventSource: eventSourceInstance };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

test('Q2.8F-1. A persisted controlled binding resumes the same conversation and the roster reports it On Field', async () => {
  const rig = await bootStadium({ port: 39301 });
  try {
    // C/D. PlayerRoster believes the controlled Codex instance is On Field.
    const ready = await until(async () => {
      const players = await rig.roster.status(GAME_ID);
      const codex = players.find((p) => p.id === 'codex');
      const instance = codex?.instances.find((i) => i.instanceId === INSTANCE_ID);
      return instance?.controlState === 'ready' ? { codex, instance } : null;
    }, { label: 'controlled Codex to finish resuming' });

    assert.equal(ready.codex.fieldState, 'on-field');
    assert.equal(ready.instance.controlMode, 'controlled');
    assert.match(ready.instance.fieldLabel, /Controlled/);

    // F. Identity is preserved: no new instanceId, no new provider conversation.
    assert.equal(rig.host.binding(INSTANCE_ID).sessionRef, SESSION_REF);
    assert.equal(rig.host.resolve(INSTANCE_ID).providerSessionRef, SESSION_REF);
    assert.equal(rig.store.load()[0].instanceId, INSTANCE_ID);

    // E. Routing capabilities include that exact Player.
    const capabilities = rig.roster.getRoutingCapabilities(GAME_ID);
    const candidate = capabilities.find((c) => c.instanceId === INSTANCE_ID);
    assert.ok(candidate, 'routing capabilities must include the resumed controlled Player');
    assert.equal(candidate.transport, 'controlled');
    assert.equal(candidate.state, 'ready');
  } finally {
    await rig.teardown();
  }
});

test('Q2.8F-2. /api/status projects the resumed Player in the contract the browser parses', async () => {
  const rig = await bootStadium({ port: 39302 });
  try {
    await until(async () => {
      const players = await rig.roster.status(GAME_ID);
      return players.find((p) => p.id === 'codex')?.instances[0]?.controlState === 'ready';
    }, { label: 'controlled Codex ready' });

    assert.equal(await rig.client.connect(), true);

    const status = await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.rosterSynchronized && body.connected ? body : null;
    }, { label: 'Control Plane to record the roster snapshot' });

    // The regression: the browser reads `players`, not `roster`.
    assert.ok(Array.isArray(status.players), '/api/status must expose `players`');
    const codex = status.players.find((p) => p.id === 'codex');
    assert.equal(codex.fieldState, 'on-field');
    assert.equal(codex.instances[0].instanceId, INSTANCE_ID);
    assert.equal(codex.instances[0].controlMode, 'controlled');

    // The browser reads `routing.capabilities` and `routing.activeDecision`.
    assert.ok(status.routing, '/api/status must expose `routing`');
    assert.equal(status.routing.mode, 'auto');
    assert.equal(status.routing.capabilities.find((c) => c.instanceId === INSTANCE_ID)?.transport, 'controlled');
    assert.equal(status.routing.autoError, undefined);
    assert.equal(status.routing.activeDecision?.playerInstanceId, INSTANCE_ID);
  } finally {
    await rig.teardown();
  }
});

test('Q2.8F-3. The real browser script renders the resumed Player from the real /api/status body', async () => {
  const rig = await bootStadium({ port: 39303 });
  try {
    await until(async () => {
      const players = await rig.roster.status(GAME_ID);
      return players.find((p) => p.id === 'codex')?.instances[0]?.controlState === 'ready';
    }, { label: 'controlled Codex ready' });
    await rig.client.connect();
    const status = await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.rosterSynchronized ? body : null;
    }, { label: 'roster snapshot' });

    const browser = renderInBrowser(status);
    await until(async () => browser.getEl('rosterSummary').textContent === 'Players · 1 On Field',
      { timeoutMs: 4000, label: 'browser to render 1 Player On Field' });

    const options = browser.getEl('terminalSelect').children;
    assert.ok(options.some((option) => option.value === INSTANCE_ID),
      'Target Player must offer the exact resumed playerInstanceId');
    assert.ok(!options.some((option) => option.textContent === 'No Player on field'),
      'browser must not claim the field is empty');
  } finally {
    await rig.teardown();
  }
});

test('Q2.8F-4. Every status field the browser reads is actually produced by the Control Plane', async () => {
  const rig = await bootStadium({ port: 39304 });
  try {
    await rig.client.connect();
    const status = await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.rosterSynchronized ? body : null;
    }, { label: 'roster snapshot' });

    // Derived straight from the page so a future rename cannot drift silently.
    const consumed = new Set([...scriptCode.matchAll(/\bstatus\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    consumed.delete('offline'); // CSS class name captured by the same pattern.

    const missing = [...consumed].filter((field) => !(field in status));
    assert.deepEqual(missing, [], `Control Plane /api/status is missing browser-consumed fields: ${missing.join(', ')}`);
  } finally {
    await rig.teardown();
  }
});

test('Q2.8F-5. AUTO routing targets the exact resumed playerInstanceId', async () => {
  const rig = await bootStadium({ port: 39305 });
  try {
    await until(async () => {
      const players = await rig.roster.status(GAME_ID);
      return players.find((p) => p.id === 'codex')?.instances[0]?.controlState === 'ready';
    }, { label: 'controlled Codex ready' });
    await rig.client.connect();
    await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.rosterSynchronized || null;
    }, { label: 'roster snapshot' });

    const result = await rig.daemon.routerInstance.dispatch({
      prompt: 'Check the roster.',
      gameId: GAME_ID,
      routingMode: 'auto'
    });

    assert.equal(result.success, true, result.message);
    assert.equal(result.status, 'received');
    assert.ok(result.turnRef, 'AUTO dispatch must return the provider turnRef');
  } finally {
    await rig.teardown();
  }
});

test('Q2.8F-6. Reconnect republishes the current canonical roster, not an activation-time copy', async () => {
  const rig = await bootStadium({ port: 39306 });
  try {
    await until(async () => {
      const players = await rig.roster.status(GAME_ID);
      return players.find((p) => p.id === 'codex')?.instances[0]?.controlState === 'ready';
    }, { label: 'controlled Codex ready' });
    await rig.client.connect();
    await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.rosterSynchronized || null;
    }, { label: 'first roster snapshot' });

    rig.client.disconnect();
    await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.connected === false || null;
    }, { label: 'Control Plane to observe the disconnect' });

    assert.equal(await rig.client.connect(), true);

    const status = await until(async () => {
      const { body } = await rig.api('/api/status');
      return body.rosterSynchronized && body.connected ? body : null;
    }, { label: 'roster to be republished after reconnect' });

    assert.equal(status.players.find((p) => p.id === 'codex').instances[0].instanceId, INSTANCE_ID);
    assert.equal(status.routing.activeDecision?.playerInstanceId, INSTANCE_ID);
  } finally {
    await rig.teardown();
  }
});

test('Q2.8F-7. A connected-but-unsynchronized Stadium is never published as an authoritative empty roster', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-q28f-sync-'));
  const daemon = new ControlPlaneDaemon({ dir: scratch, port: 39307, idleTimeoutMs: 120000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(scratch, 'token'), 'utf8').trim();
  const getStatus = async () => (await (await fetch(`http://127.0.0.1:${daemon.port}/api/status?token=${encodeURIComponent(token)}`)).json());

  // A Stadium that has registered a Game but published no roster yet.
  const registry = daemon.registryInstance;
  registry.registerSession({
    instanceId: 'inst_sync',
    stadiumId: 'stadium_sync',
    name: 'Windows',
    platform: 'win32',
    socket: { readyState: 1, send() {}, close() {} },
    lastHeartbeat: Date.now(),
    game: { gameId: GAME_ID, displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [],
    capabilities: [],
    reports: [],
    rosterSynchronized: false,
    rosterSyncedAt: 0
  });

  try {
    const before = await getStatus();
    assert.equal(before.connected, true);
    assert.equal(before.rosterSynchronized, false, 'an unsynchronized roster must be reported as such');
    assert.match(before.routing.autoError, /synchronizing/i);

    // The browser must render that as "synchronizing", never as "0 On Field".
    const browser = renderInBrowser(before);
    await until(async () => browser.getEl('rosterSummary').textContent === 'Players · Synchronizing…',
      { timeoutMs: 4000, label: 'browser to show the synchronizing state' });

    registry.updateRoster('inst_sync', [
      { id: 'codex', name: 'Codex', availability: 'available', fieldState: 'on-field', instances: [{ instanceId: INSTANCE_ID, playerType: 'codex', seat: 1, fieldLabel: 'Codex · Controlled', controlMode: 'controlled' }] }
    ]);

    const after = await getStatus();
    assert.equal(after.rosterSynchronized, true);
    assert.equal(after.players[0].instances[0].instanceId, INSTANCE_ID);
  } finally {
    await daemon.stop();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('Q2.8F-8. /api/diagnostics localizes Player plumbing without leaking content', async () => {
  const rig = await bootStadium({ port: 39308 });
  try {
    await until(async () => {
      const players = await rig.roster.status(GAME_ID);
      return players.find((p) => p.id === 'codex')?.instances[0]?.controlState === 'ready';
    }, { label: 'controlled Codex ready' });
    await rig.client.connect();

    const diagnostics = await until(async () => {
      const { body } = await rig.api('/api/diagnostics');
      return body.selectedGameRosterSynchronized ? body : null;
    }, { label: 'diagnostics to report a synchronized roster' });

    assert.equal(diagnostics.selectedGameId, GAME_ID);
    assert.equal(diagnostics.selectedGameRosterCount, 1);
    assert.equal(diagnostics.selectedGameCapabilityCount, 1);
    const session = diagnostics.sessions.find((s) => s.instanceId === 'inst_q28f_1');
    assert.deepEqual(session.rosterInstanceIds, [INSTANCE_ID]);
    assert.deepEqual(session.capabilityInstanceIds, [INSTANCE_ID]);
    assert.ok(session.rosterSyncedAt > 0);

    // Structural facts only: no prompts, no reports, no provider credentials.
    const serialized = JSON.stringify(diagnostics);
    assert.doesNotMatch(serialized, /content|prompt|accountEmail|token/i);
  } finally {
    await rig.teardown();
  }
});
