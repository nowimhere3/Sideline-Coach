import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const managerStart = pageScript.indexOf('// Stage 5E: browser-owned SSE recovery.');
const managerEnd = pageScript.indexOf('const copyText = async', managerStart);
const wakeStart = pageScript.indexOf('// Mobile wake/loss signals feed the same bounded SSE recovery owner.');
const wakeEnd = pageScript.indexOf('// Read-only diagnostic view of browser truth', wakeStart);
assert.ok(managerStart >= 0 && managerEnd > managerStart, 'Stage 5E reconnect manager is extractable');
assert.ok(wakeStart >= 0 && wakeEnd > wakeStart, 'Stage 5E wake handlers are extractable');
const managerSource = pageScript.slice(managerStart, managerEnd);
const wakeSource = pageScript.slice(wakeStart, wakeEnd);

function createHarness() {
  let now = 1_800_000_000_000;
  let nextTimer = 0;
  const timers = new Map();
  const scheduledDelays = [];
  const sources = [];
  const states = [];
  const windowListeners = {};
  const documentListeners = {};
  let synchronizationCalls = 0;
  let refreshCalls = 0;
  let disconnectCalls = 0;

  class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    constructor(url) {
      this.url = url;
      this.readyState = FakeEventSource.CONNECTING;
      this.listeners = {};
      this.closed = false;
      sources.push(this);
    }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    emit(type, data = {}) {
      if (type === 'hello') this.readyState = FakeEventSource.OPEN;
      for (const listener of this.listeners[type] || []) listener({ data: JSON.stringify(data) });
    }
    fail() { this.onerror?.(); }
    close() { this.closed = true; this.readyState = FakeEventSource.CLOSED; }
  }

  const setTimeoutFake = (fn, delay) => {
    const id = ++nextTimer;
    timers.set(id, { at: now + delay, fn, delay });
    scheduledDelays.push(delay);
    return id;
  };
  const clearTimeoutFake = (id) => timers.delete(id);
  const advance = (duration) => {
    const end = now + duration;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };

  const context = {
    EventSource: FakeEventSource,
    Date: { now: () => now },
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    navigator: { onLine: true },
    console,
    eventSource: null,
    eventReconnectTimer: null,
    eventWatchdogTimer: null,
    eventReconnectAttempt: 0,
    eventStreamHealthy: false,
    lastEventActivityAt: 0,
    synchronizationGeneration: 0,
    SendToPhoneController: {
      noteSseDisconnect() { disconnectCalls += 1; },
      handlePairingComplete() {}
    },
    setConnectionState(state) { states.push(state); },
    synchronizeAfterHello: async () => { synchronizationCalls += 1; },
    refresh: async () => { refreshCalls += 1; return true; },
    aiHealthSnapshot: null,
    renderAiScoreboard() {}, renderStatus() {}, renderReports() {}, applyExecution: () => false,
    afterExecutionChange() {}, applyActivity() {}, dismissOutgoingAck() {},
    window: {
      addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); }
    },
    document: {
      visibilityState: 'visible',
      addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${managerSource}\n${wakeSource}\nwindow.__stage5e = { connectEvents, connectEventsImmediately, state: () => ({ eventSource, eventReconnectTimer, eventWatchdogTimer, eventReconnectAttempt, eventStreamHealthy, lastEventActivityAt }) };`, context);
  return {
    sources, states, scheduledDelays, timers, advance,
    connect: () => context.window.__stage5e.connectEvents(),
    state: () => context.window.__stage5e.state(),
    syncCalls: () => synchronizationCalls,
    refreshCalls: () => refreshCalls,
    disconnectCalls: () => disconnectCalls,
    fireWindow(type) { for (const listener of windowListeners[type] || []) listener(); },
    setVisible(value) { context.document.visibilityState = value; for (const listener of documentListeners.visibilitychange || []) listener(); }
  };
}

test('RA5E-1/2. one EventSource is active and failures use one bounded 1s→2s→4s→8s→15s retry owner', () => {
  const h = createHarness();
  h.connect();
  const expected = [1_000, 2_000, 4_000, 8_000, 15_000, 15_000];
  for (const delay of expected) {
    const source = h.sources.at(-1);
    source.fail();
    source.fail();
    assert.equal(source.closed, true, 'failed source is retired before replacement');
    assert.equal([...h.timers.values()].filter((timer) => timer.delay !== 45_000).length, 1, 'only one reconnect timer exists');
    h.advance(delay);
    assert.equal(h.sources.filter((candidate) => !candidate.closed).length, 1, 'only one active source remains');
  }
  assert.deepEqual(h.scheduledDelays.filter((delay) => delay !== 45_000), expected);
});

test('RA5E-3. online immediately replaces an unhealthy stream but never duplicates a healthy stream', () => {
  const h = createHarness();
  h.connect();
  h.sources[0].fail();
  assert.equal(h.sources.length, 1);
  h.fireWindow('online');
  assert.equal(h.sources.length, 2, 'pending backoff is preempted');
  assert.equal(h.sources[1].closed, false);
  h.sources[1].emit('hello');
  h.fireWindow('online');
  assert.equal(h.sources.length, 2, 'healthy stream is left alone');
});

test('RA5E-4. becoming visible immediately recovers only an unhealthy stream', () => {
  const h = createHarness();
  h.connect();
  h.sources[0].fail();
  h.setVisible('hidden');
  assert.equal(h.sources.length, 1, 'backgrounding alone does not reconnect');
  h.setVisible('visible');
  assert.equal(h.sources.length, 2);
  h.sources[1].emit('hello');
  h.setVisible('visible');
  assert.equal(h.sources.length, 2, 'healthy visible stream is left alone');
});

test('RA5E-5. 45s watchdog retains heartbeat-backed OPEN streams, resets on activity, and retires stale streams', () => {
  const h = createHarness();
  h.connect();
  const source = h.sources[0];
  source.emit('hello');
  h.advance(30_000);
  source.emit('reports');
  h.advance(44_999);
  assert.equal(source.closed, false, 'named activity resets the horizon');
  h.advance(1);
  assert.equal(source.closed, false, 'OPEN is the browser-visible evidence for opaque comment heartbeats');
  source.readyState = 0;
  h.advance(45_000);
  assert.equal(source.closed, true, 'non-OPEN stream at the watchdog horizon is stale');
  assert.equal(h.state().eventStreamHealthy, false);
  assert.equal(h.disconnectCalls(), 1);
});

test('RA5E-6. hello resets backoff, marks healthy, and runs the existing current-truth synchronization', () => {
  const h = createHarness();
  h.connect();
  h.sources[0].fail();
  h.advance(1_000);
  h.sources[1].emit('hello');
  assert.equal(h.state().eventStreamHealthy, true);
  assert.equal(h.state().eventReconnectAttempt, 0);
  assert.equal(h.syncCalls(), 1);
  h.sources[1].fail();
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 1_000), true, 'post-hello retry restarts at 1s');
});

test('RA5E-7/8. narrow header and reader containers stay bounded inside the mobile viewport', () => {
  const narrow = pageSource.match(/@media \(max-width: 379px\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(narrow, /header \{[^}]*flex-wrap: wrap/);
  assert.match(narrow, /\.brand \{[^}]*flex: 1 1 100%/);
  assert.match(narrow, /\.header-actions \{[^}]*width: 100%;[^}]*justify-content: space-between/);
  assert.match(pageSource, /html \{[^}]*overflow-x: hidden/);
  assert.match(pageSource, /#gameScrollRegion \{[\s\S]*?overflow-x: hidden;[\s\S]*?min-width: 0;/);
  assert.match(pageSource, /pre \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: auto;/);
  assert.match(pageSource, /\.play-console-body \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: auto;/);
});

test('RA5E safe areas and mobile security remain explicit; no offline replay architecture was added', () => {
  assert.match(pageSource, /#gameScrollRegion \{[\s\S]*?env\(safe-area-inset-top\)[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(pageSource, /\.modal-backdrop \{[\s\S]*?safe-area-inset-top[\s\S]*?safe-area-inset-bottom/);
  assert.match(pageSource, /const isRemoteDevicePresentation = \(\) =>/);
  assert.match(pageSource, /if \(localCard\) localCard\.hidden = remote;[\s\S]*?if \(remoteCard\) remoteCard\.hidden = !remote;/);
  assert.doesNotMatch(managerSource, /indexedDB|serviceWorker|WebSocket|api\/devices/);
});
