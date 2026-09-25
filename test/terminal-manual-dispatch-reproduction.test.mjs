/**
 * Forensic Reproduction Test: Terminal Player Manual Dispatch
 * 
 * Verifies exact behavior of Dad's reported failure:
 * - Preferences: devMode=true, livePlayerConsole=true, terminalRetention='until-dismissed'
 * - Manual dispatch to Terminal Player
 * - Tests both unobserved dispatch (no shell integration / multi-line) and observed dispatch
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

const GAME = 'game_terminal_forensic';
const T_INSTANCE = 'terminal-11111111';
const T0 = 1_800_000_000_000;

const DAD_PREFERENCES = {
  devMode: true,
  livePlayerConsole: true,
  terminalRetention: 'until-dismissed',
  remoteSensitiveTerminalOutput: true,
  advancedPlayerDiscovery: false,
  runningPlayers: 'ask'
};

function daemonStatus({ views, preferences = DAD_PREFERENCES, now = T0 }) {
  const terminalInstance = {
    instanceId: T_INSTANCE,
    playerType: 'terminal',
    seat: 1,
    fieldLabel: 'Terminal',
    displayName: 'Terminal 1',
    ownership: 'coach-managed',
    onField: true,
    transport: 'Terminal'
  };
  const terminalCap = {
    instanceId: T_INSTANCE,
    playerType: 'terminal',
    transport: 'legacy',
    transportLabel: 'Terminal',
    executionType: 'direct-shell',
    fieldLabel: 'Terminal',
    state: 'ready',
    capability: { provider: 'terminal', freshness: 'unavailable', models: [] },
    work: { workState: 'idle' }
  };
  return {
    success: true,
    connected: true,
    connectionStatus: 'connected',
    selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Terminal Forensic Game' },
    games: [{ gameId: GAME, displayName: 'Terminal Forensic Game', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [{ id: 'terminal', name: 'Terminal', availability: 'available', fieldState: 'on-field', instances: [terminalInstance] }],
    capabilities: [terminalCap],
    queue: [],
    routing: { mode: 'manual', capabilities: [terminalCap] },
    routingMode: 'manual',
    playerDiscovery: null,
    preferences,
    reports: [],
    at: now,
    execution: {
      gameId: GAME,
      epoch: 'E1',
      serverNow: now,
      byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v]))
    }
  };
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries({ sidelineCoachToken: 'test-token', ...initial }));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

function createPage(initialStatus, { storage = memoryStorage(), activity = {} } = {}) {
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
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child));
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() {
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
          this.parentNode = null;
        }
      },
      contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; },
      closest(selector) {
        if (selector !== '.player[data-instance-id]') throw new Error(`stub closest does not support ${selector}`);
        for (let n = this; n; n = n.parentNode) if (n.className === 'player' && n.dataset.instanceId) return n;
        return null;
      },
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
  const clock = { now: initialStatus.execution.serverNow };
  const posts = [];
  const requests = [];
  const timers = [];
  const clipboard = { writes: [] };
  Object.assign(doc, {
    getElementById: $,
    createElement: (tag) => makeNode('', tag),
    addEventListener() {},
    body: makeNode('body'),
    querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : [])
  });
  const ctx = {
    document: doc,
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage: storage,
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ url, method: options.method || 'GET', body });
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url.startsWith('/api/player-activity')) return reply(200, { success: true, sessionKey: activity.sessionKey ?? 'sess_1', entries: activity.entries ?? [] });
      if (url === '/api/preferences' && options.method === 'POST') {
        posts.push(body);
        return reply(200, { success: true, preferences: status.preferences, message: 'Saved.' });
      }
      return reply(200, {});
    },
    setTimeout: (fn, ms, ...rest) => {
      if (ms >= 60_000) { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; }
      return setTimeout(fn, ms, ...rest);
    },
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    Date: class extends Date { static now() { return clock.now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { clipboard.writes.push(text); } } },
    window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, posts, requests, timers, clipboard, storage, allText, find, clock,
    emitEvent: (name, data) => source.emit(name, data),
    row: (id) => $('roster').children.find((r) => r.className === 'player' && r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    shell: (id) => { const s = page.strip(id); return s && find(s, (n) => n.className === 'play-console'); },
    button: (id, key) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === key); },
    body: (id) => { const s = page.strip(id); return s && find(s, (n) => n.dataset.focusKey === 'console-body'); },
    lines: (id) => { const b = page.body(id); return b ? b.children.filter((c) => c.className === 'play-console-line') : []; },
    stripText: (id) => { const s = page.strip(id); return s ? allText(s) : ''; },
    refresh: async (next, now) => {
      if (now !== undefined) clock.now = now;
      const base = next ?? status;
      status = { ...base, execution: { ...base.execution, serverNow: clock.now }, at: clock.now };
      source.emit('status', { type: 'registry-change' });
      await flush();
    },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
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

// ---------------------------------------------------------------------------
// TEST 1: Preference state agreement under Dad's exact configuration
// ---------------------------------------------------------------------------
test('Forensic 1: Preferences in browser state match Dad\'s screenshot and liveConsoleEnabled() is TRUE', async () => {
  const initial = daemonStatus({ views: [{ instanceId: T_INSTANCE, state: 'idle', revision: 1 }] });
  const page = await createPage(initial).start();

  // Check Settings UI
  assert.equal(page.$('devModeToggle').checked, true, 'Dev Mode toggle is checked');
  assert.equal(page.$('livePlayerConsoleToggle').checked, true, 'View Player Terminal toggle is checked');
  assert.equal(page.$('terminalRetentionUntilDismissed').checked, true, 'Retention Until dismissed is checked');
  assert.equal(page.$('remoteSensitiveTerminalOutputToggle').checked, true, 'Remote sensitive output is checked');
  assert.equal(page.$('advancedPlayerDiscoveryToggle').checked, false, 'Advanced Player Discovery is unchecked');

  // Verify terminal retention card is NOT hidden (proves devMode && livePlayerConsole is true)
  assert.equal(page.$('terminalRetentionCard').hidden, false, 'Retention card is visible because both gates are ON');
});

// ---------------------------------------------------------------------------
// TEST 2: Unobserved dispatch (Branch B: !shell || !singleLine)
// Dad's exact scenario: multi-line PowerShell command dispatched to Terminal Player.
// The command executes unobserved, and the terminal card and guts are retained.
// ---------------------------------------------------------------------------
test('Repair 2: Unobserved dispatch (Branch B) retains play strip, Expand button, and console under until-dismissed', async () => {
  const initial = daemonStatus({ views: [{ instanceId: T_INSTANCE, state: 'idle', revision: 1 }] });
  const page = await createPage(initial).start();

  // In Branch B with repair, daemon projects observed: false, executionStartedAt, and truthful detail
  const unobservedView = {
    instanceId: T_INSTANCE,
    revision: 2,
    executionType: 'direct-shell',
    state: 'unknown',
    playRef: 'play_cmd_123',
    summary: 'Running: Get-Process',
    detail: 'Command sent to terminal · execution unobserved',
    executionStartedAt: T0,
    observed: false
  };

  // Broadcast execution update
  page.emitEvent('execution', {
    gameId: GAME,
    epoch: 'E1',
    serverNow: T0 + 100,
    views: [unobservedView]
  });
  await flush();

  // 1. Verify strip exists and shows truthful unobserved copy
  const strip = page.strip(T_INSTANCE);
  assert.ok(strip, 'Strip remains present in DOM for unobserved terminal execution');
  assert.match(page.stripText(T_INSTANCE), /Sent to terminal · unobserved/);

  // 2. Verify Expand button exists
  const expandBtn = page.button(T_INSTANCE, 'console-toggle');
  assert.ok(expandBtn, 'Expand button is present');
  assert.equal(expandBtn.textContent, 'Expand');

  // 3. Verify Dismiss button exists in toggle row
  const dismissBtn = page.button(T_INSTANCE, 'evidence-dismiss');
  assert.ok(dismissBtn, 'Dismiss button is present');

  // 4. Click Expand: Console shell mounts with truthful placeholder
  await page.click(expandBtn);
  const consoleShell = page.shell(T_INSTANCE);
  assert.ok(consoleShell, 'Console shell mounts upon Expand');
  const consoleBody = page.body(T_INSTANCE);
  assert.ok(consoleBody, 'Console body is present');
  assert.equal(consoleBody.dataset.placeholder, 'Terminal output unavailable for this command.');

  // 5. Retention: Under until-dismissed, advancing time (e.g. 10 minutes) does NOT dismiss the card
  await page.refresh(null, T0 + 600_000);
  assert.ok(page.strip(T_INSTANCE), 'Strip remains retained after 10 minutes under until-dismissed');

  // 6. Dismiss: Clicking Dismiss clears the terminal strip (browser-only dismissal contract)
  const activeDismissBtn = page.button(T_INSTANCE, 'evidence-dismiss');
  assert.ok(activeDismissBtn, 'Dismiss button present in header');
  await page.click(activeDismissBtn);
  assert.equal(page.strip(T_INSTANCE), null, 'Strip is removed when Dad explicitly clicks Dismiss');
});

// ---------------------------------------------------------------------------
// TEST 3: Observed fast-finishing dispatch (Branch A: shell && singleLine)
// When shell integration works and command finishes with exitCode 0
// ---------------------------------------------------------------------------
test('Forensic 3: Observed dispatch (Branch A) preserves evidence and Expand under until-dismissed', async () => {
  const initial = daemonStatus({ views: [{ instanceId: T_INSTANCE, state: 'idle', revision: 1 }] });
  const page = await createPage(initial).start();

  // When command finishes fast in Branch A with exit code 0:
  const finishedView = {
    instanceId: T_INSTANCE,
    revision: 3,
    executionType: 'direct-shell',
    state: 'finished',
    playRef: 'play_cmd_456',
    summary: 'Completed · exit code 0',
    finishedAt: T0 + 50,
    durationMs: 50
  };

  page.emitEvent('execution', {
    gameId: GAME,
    epoch: 'E1',
    serverNow: T0 + 50,
    views: [finishedView]
  });
  await flush();

  // With until-dismissed, the strip MUST exist and show Finished with Expand button
  const strip = page.strip(T_INSTANCE);
  assert.ok(strip, 'Strip exists for observed completion');
  assert.match(page.stripText(T_INSTANCE), /Finished/);
  const expandBtn = page.button(T_INSTANCE, 'console-toggle');
  assert.ok(expandBtn, 'Expand button exists');
  assert.equal(expandBtn.textContent, 'Expand');

  // Expanding reveals console and Copy All
  await page.click(expandBtn);
  assert.ok(page.shell(T_INSTANCE), 'Console shell is mounted');
  assert.ok(page.button(T_INSTANCE, 'console-copy-all'), 'Copy All button exists');
});

// ---------------------------------------------------------------------------
// TEST 4: Observed fast-finishing dispatch with exitCode undefined
// What if VS Code shell integration ran, but exitCode was undefined?
// ---------------------------------------------------------------------------
test('Forensic 4: Observed dispatch with exitCode undefined (exit code not reported)', async () => {
  const initial = daemonStatus({ views: [{ instanceId: T_INSTANCE, state: 'idle', revision: 1 }] });
  const page = await createPage(initial).start();

  // When shell integration fires without exit code, describeTerminalExit returns state: 'unknown'
  // BUT durationMs is finite because started was received!
  const unknownWithDurationView = {
    instanceId: T_INSTANCE,
    revision: 3,
    executionType: 'direct-shell',
    state: 'unknown',
    playRef: 'play_cmd_789',
    summary: 'Finished — exit code not reported',
    finishedAt: T0 + 50,
    durationMs: 50
  };

  page.emitEvent('execution', {
    gameId: GAME,
    epoch: 'E1',
    serverNow: T0 + 50,
    views: [unknownWithDurationView]
  });
  await flush();

  // Because durationMs is finite, isTerminalEvidenceView accepts it!
  const strip = page.strip(T_INSTANCE);
  assert.ok(strip, 'Strip exists because evidence with durationMs is retained');
  assert.match(page.stripText(T_INSTANCE), /Ended — result unknown/);
});

// ---------------------------------------------------------------------------
// TEST 5: Expanded action-row flex sizing and clipping prevention
// Verifies that play-console-header and play-console-title have proper
// flex sizing, min-width: 0, and gap to prevent any button clipping/overflow sliver.
// ---------------------------------------------------------------------------
test('Repair 5: Expanded Terminal Player action-row flex sizing prevents clipping and overflow', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /\.play-console-header\s*\{[^}]*gap:\s*7px;/, 'play-console-header has gap: 7px');
  assert.match(css, /\.play-console-header\s*\{[^}]*min-width:\s*0;/, 'play-console-header has min-width: 0');
  assert.match(css, /\.play-console-title\s*\{[^}]*min-width:\s*0;/, 'play-console-title has min-width: 0');
  assert.match(css, /\.play-console-title\s*\{[^}]*flex:\s*1 1 auto;/, 'play-console-title has flex: 1 1 auto');
});
