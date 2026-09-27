import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];

const GAME = 'game_alarm_test';
const T0 = 1_800_000_000_000;

const DEFAULT_ALARM_PREFERENCES = {
  enabled: true,
  notifyOnThreshold: true,
  notifyOnReset: true,
  channels: { vscode: true, browser: false },
  thresholds: {
    claude: { fiveHourLowPercent: 20, fiveHourCriticalPercent: 5, weeklyLowPercent: 20, weeklyCriticalPercent: 5 },
    codex: { fiveHourLowPercent: 20, fiveHourCriticalPercent: 5, weeklyLowPercent: 20, weeklyCriticalPercent: 5 }
  }
};

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
    preferences: { runningPlayers: 'ask', devMode: false, livePlayerConsole: false, alarms: DEFAULT_ALARM_PREFERENCES, ...preferences },
    at: now,
    execution: { gameId, epoch: 'E1', serverNow: now, byInstance: {} }
  };
}

function createTestPage(initialStatus, { simulateFailure = false } = {}) {
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
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(child) {
        child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child));
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      replaceChildren(...kids) {
        for (const c of this.children) c.parentNode = null;
        this.children = [];
        for (const kid of kids) this.appendChild(kid);
      },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = null; }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); } });
    return node;
  };

  const $ = (id) => {
    if (!elements.has(id)) {
      const node = makeNode(id);
      if (id === 'routingAlarmsSaveBtn') node.textContent = 'Save';
      elements.set(id, node);
    }
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
  let shouldFail = simulateFailure;

  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), addEventListener() {}, body: makeNode('body'),
    querySelector: () => null, querySelectorAll: () => [], elementFromPoint: () => null
  });

  const ctx = {
    document: doc, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: memoryStorage(),
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      if (url.startsWith('/api/player-activity')) return reply(200, { success: true, sessionKey: 'sess_1', entries: [] });
      if (url === '/api/preferences' && options.method === 'POST') {
        posts.push(body);
        if (shouldFail) {
          return reply(500, { success: false, message: 'Server error saving preferences' });
        }
        status = { ...status, preferences: { ...status.preferences, ...body } };
        return reply(200, { success: true, preferences: status.preferences, message: 'AI Usage Alarm preferences saved.' });
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
  source.emit('hello');

  return {
    $, posts, doc,
    setShouldFail: (val) => { shouldFail = val; },
    applyStatus: async (s) => {
      status = s;
      source.emit('status', s);
      await new Promise((r) => setTimeout(r, 20));
    },
    change: async (node, checked = true) => {
      if (typeof checked === 'boolean') node.checked = checked;
      for (const listener of node.listeners['change'] || []) {
        await listener({ target: node });
      }
      await new Promise((r) => setTimeout(r, 20));
    },
    click: async (node) => {
      for (const listener of node.listeners['click'] || []) {
        await listener({ target: node, currentTarget: node });
      }
      await new Promise((r) => setTimeout(r, 20));
    },
    pressEnter: async (node) => {
      let defaultPrevented = false;
      for (const listener of node.listeners['keydown'] || []) {
        await listener({
          target: node,
          key: 'Enter',
          preventDefault: () => { defaultPrevented = true; }
        });
      }
      await new Promise((r) => setTimeout(r, 20));
      return defaultPrevented;
    }
  };
}

test('SAVE-1. Save button renders at bottom-right with resting state Save', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());
  const saveBtn = page.$('routingAlarmsSaveBtn');
  assert.equal(saveBtn.textContent, 'Save');
  assert.equal(saveBtn.disabled, false);

  // Markup checks
  assert.match(pageSource, /id="routingAlarmsSaveBtn"/);
  assert.match(pageSource, /class="btn quiet alarm-save-btn"/);
  assert.match(pageSource, /\.alarm-actions\s*\{\s*display:\s*flex;\s*justify-content:\s*flex-end;/);
});

test('SAVE-2. Blur on threshold input persists value and transitions button states (Saving -> Saved)', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());
  const input = page.$('alarmClaudeFiveHourLow');
  input.value = '17';
  await page.change(input);

  assert.equal(page.posts.length, 1);
  assert.equal(page.posts[0].alarms.thresholds.claude.fiveHourLowPercent, 17);

  const saveBtn = page.$('routingAlarmsSaveBtn');
  assert.equal(saveBtn.textContent, 'Saved ✓');
  assert.equal(saveBtn.classList.contains('saved') || saveBtn.classList.contains('is-success'), true);
});

test('SAVE-3. Pressing Enter in threshold input prevents default, saves immediately, and reflects status', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());
  const input = page.$('alarmCodexWeeklyCritical');
  input.value = '8';

  const defaultPrevented = await page.pressEnter(input);
  assert.equal(defaultPrevented, true, 'Enter key should prevent default');

  assert.equal(page.posts.length, 1);
  assert.equal(page.posts[0].alarms.thresholds.codex.weeklyCriticalPercent, 8);

  const saveBtn = page.$('routingAlarmsSaveBtn');
  assert.equal(saveBtn.textContent, 'Saved ✓');
  assert.equal(saveBtn.classList.contains('saved') || saveBtn.classList.contains('is-success'), true);
});

test('SAVE-4. Clicking Save button persists current DOM/unblurred input values and reflects status', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());

  // Type directly into input without blurring or triggering change event
  const claudeWeeklyLow = page.$('alarmClaudeWeeklyLow');
  claudeWeeklyLow.value = '29';
  claudeWeeklyLow.focus();

  const saveBtn = page.$('routingAlarmsSaveBtn');
  await page.click(saveBtn);

  assert.equal(page.posts.length, 1);
  assert.equal(page.posts[0].alarms.thresholds.claude.weeklyLowPercent, 29, 'Save button must capture unblurred DOM value');
  assert.equal(saveBtn.textContent, 'Saved ✓');
});

test('SAVE-5. All three paths use the same canonical POST /api/preferences contract', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());

  // 1. Blur
  page.$('alarmClaudeFiveHourCritical').value = '9';
  await page.change(page.$('alarmClaudeFiveHourCritical'));
  assert.equal(page.posts[0].alarms.thresholds.claude.fiveHourCriticalPercent, 9);

  // 2. Enter
  page.$('alarmCodexFiveHourLow').value = '18';
  await page.pressEnter(page.$('alarmCodexFiveHourLow'));
  assert.equal(page.posts[1].alarms.thresholds.codex.fiveHourLowPercent, 18);

  // 3. Save button
  page.$('alarmCodexWeeklyLow').value = '22';
  await page.click(page.$('routingAlarmsSaveBtn'));
  assert.equal(page.posts[2].alarms.thresholds.codex.weeklyLowPercent, 22);

  // Verify all 3 posts have identical canonical structure
  for (const post of page.posts) {
    assert.equal(typeof post.alarms, 'object');
    assert.equal(typeof post.alarms.channels, 'object');
    assert.equal(typeof post.alarms.thresholds, 'object');
  }
});

test('SAVE-6. Toggle switches in Routing & Alarms update Save button status', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());
  const saveBtn = page.$('routingAlarmsSaveBtn');

  // Alarms Enabled toggle
  await page.change(page.$('alarmsEnabledToggle'), false);
  assert.equal(page.posts.at(-1).alarms.enabled, false);
  assert.equal(saveBtn.textContent, 'Saved ✓');

  // Notify when usage window resets toggle
  await page.change(page.$('alarmResetToggle'), false);
  assert.equal(page.posts.at(-1).alarms.notifyOnReset, false);
  assert.equal(saveBtn.textContent, 'Saved ✓');

  // VS Code Popups toggle
  await page.change(page.$('alarmVsCodeToggle'), false);
  assert.equal(page.posts.at(-1).alarms.channels.vscode, false);
  assert.equal(saveBtn.textContent, 'Saved ✓');
});

test('SAVE-7. Failure transition shows Save failed · Retry and remains actionable for retry', async () => {
  const page = createTestPage(daemonStatus(), { simulateFailure: true });
  await page.applyStatus(daemonStatus());
  const saveBtn = page.$('routingAlarmsSaveBtn');

  page.$('alarmClaudeFiveHourLow').value = '35';
  await page.change(page.$('alarmClaudeFiveHourLow'));

  assert.equal(saveBtn.textContent, 'Save failed · Retry');
  assert.equal(saveBtn.classList.contains('failed') || saveBtn.classList.contains('is-failure'), true);
  assert.equal(saveBtn.disabled, false, 'Button must remain actionable when in failed state');

  // Recover backend and click retry
  page.setShouldFail(false);
  await page.click(saveBtn);

  assert.equal(saveBtn.textContent, 'Saved ✓');
  assert.equal(saveBtn.classList.contains('saved') || saveBtn.classList.contains('is-success'), true);
});

test('SAVE-8. Saved ✓ reverts to Save after timeout', async () => {
  const page = createTestPage(daemonStatus());
  await page.applyStatus(daemonStatus());
  const saveBtn = page.$('routingAlarmsSaveBtn');

  page.$('alarmClaudeFiveHourLow').value = '14';
  await page.change(page.$('alarmClaudeFiveHourLow'));
  assert.equal(saveBtn.textContent, 'Saved ✓');

  // Fast forward past the 2200ms reset timer
  await new Promise((resolve) => setTimeout(resolve, 2300));
  assert.equal(saveBtn.textContent, 'Save');
});
