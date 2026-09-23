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
const flush = () => wait(20);

const GAME = 'game_git_trend';
const T0 = 1_800_000_000_000;

const reportFixture = (overrides = {}) => ({
  agent: 'Claude', filename: 'report.md', path: 'REPORTS/Claude/report.md', mtime: T0,
  project: 'Trend', content: 'Exact canonical report body.\nLine two.', ...overrides
});

function daemonStatus({ devMode = false, gameId = GAME } = {}) {
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: gameId,
    game: { gameId, displayName: 'Trend' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: [], playerDiscovery: null,
    preferences: { runningPlayers: 'ask', devMode },
    routines: { gameId, devMode, playCount: 5, routines: [] },
    at: T0
  };
}

function createPage(initialStatus = daemonStatus(), initialReports = [reportFixture(), reportFixture({ path: 'REPORTS/Claude/second.md', filename: 'second.md', mtime: T0 + 1000 })]) {
  const elements = new Map();
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child)); child.parentNode = this; this.children.push(child); return child; },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; },
      focus() {}, blur() {}
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
  let reportsList = initialReports;
  const posts = [];
  const clipboardWrites = [];
  let clipboardShouldFail = false;
  const ctx = {
    document: {
      getElementById: $, querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []),
      createElement: (tag) => makeNode('', tag), addEventListener() {}, body: makeNode('body'), activeElement: null
    },
    location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: () => ({ matches: false }),
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, reportsList);
      posts.push({ url, body });
      if (url === '/api/work/acknowledge') return reply(200, { success: true, acknowledged: true, changed: true });
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { if (clipboardShouldFail) throw new Error('Clipboard permission denied'); clipboardWrites.push(text); } } },
    window: { isSecureContext: true }
  };
  const page = {
    $, posts, clipboardWrites,
    get source() { return source; },
    setClipboardShouldFail: (val) => { clipboardShouldFail = val; },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
    selectReport: async (index) => { $('reportSelect').value = String(index); for (const fn of $('reportSelect').listeners.change || []) fn({ target: { value: String(index) } }); await flush(); },
    copy: async () => { await page.click($('copyReportBtn')); },
    start: async () => {
      vm.createContext(ctx);
      vm.runInContext(pageScript, ctx);
      source.emit('hello');
      const end = Date.now() + 2_000;
      while (Date.now() < end && $('connectionText').textContent !== 'Coach Online') await wait(5);
      return page;
    }
  };
  return page;
}

const startPage = (status, reports) => createPage(status, reports).start();

// ---------------------------------------------------------------------------

test('1. Same report copied twice = exactly 2 clipboard writes', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');

  await page.copy();
  assert.equal(page.clipboardWrites.length, 1);
  assert.equal(btn.textContent, '✓ Report copied');
  assert.equal(btn.disabled, false);

  await page.copy();
  assert.equal(page.clipboardWrites.length, 2);
  assert.equal(page.clipboardWrites[0], page.clipboardWrites[1]);
});

test('2. Same report copied 5+ times = same number of clipboard writes', async () => {
  const page = await startPage();
  for (let i = 0; i < 6; i++) {
    await page.copy();
  }
  assert.equal(page.clipboardWrites.length, 6);
  for (let i = 0; i < 6; i++) {
    assert.equal(page.clipboardWrites[i], 'Exact canonical report body.\nLine two.');
  }
});

test('3. Every click invokes a fresh clipboard attempt', async () => {
  const page = await startPage();
  await page.copy();
  assert.equal(page.clipboardWrites.length, 1);
  await page.copy();
  assert.equal(page.clipboardWrites.length, 2);
});

test('4. Success displays temporary "✓ Report copied"', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');
  await page.copy();
  assert.equal(btn.textContent, '✓ Report copied');
  assert.ok(btn.classList.contains('copy-success'));
});

test('5. Success automatically restores "Copy Report"', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');
  await page.copy();
  assert.equal(btn.textContent, '✓ Report copied');

  // Wait for 2000ms timer
  await wait(2100);
  assert.equal(btn.textContent, 'Copy Report');
  assert.equal(btn.disabled, false);
});

test('6. copy-success class is removed after restoration', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');
  await page.copy();
  assert.ok(btn.classList.contains('copy-success'));

  await wait(2100);
  assert.equal(btn.classList.contains('copy-success'), false);
  assert.equal(btn.classList.contains('copy-error'), false);
});

test('7. Re-click during active feedback performs another copy and restarts feedback timing', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');
  await page.copy();
  assert.equal(btn.textContent, '✓ Report copied');
  assert.equal(page.clipboardWrites.length, 1);

  // Wait 1000ms (halfway through the 2000ms window)
  await wait(1000);
  // Click again while feedback is active
  await page.copy();
  assert.equal(page.clipboardWrites.length, 2);
  assert.equal(btn.textContent, '✓ Report copied');

  // Wait 1200ms (2200ms total from first click, but only 1200ms from second click)
  await wait(1200);
  // It should STILL be '✓ Report copied' because second click restarted the 2000ms timer!
  assert.equal(btn.textContent, '✓ Report copied');

  // Wait remaining 1000ms (2200ms from second click)
  await wait(1000);
  // Now it should be restored
  assert.equal(btn.textContent, 'Copy Report');
});

test('8. Clipboard failure remains retryable and auto-restores', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');

  // Force failure
  page.setClipboardShouldFail(true);
  await page.copy();
  assert.equal(btn.textContent, 'Copy Failed · Try Again');
  assert.ok(btn.classList.contains('copy-error'));
  assert.equal(btn.disabled, false);

  // Subsequent click when clipboard recovers
  page.setClipboardShouldFail(false);
  await page.copy();
  assert.equal(btn.textContent, '✓ Report copied');
  assert.ok(btn.classList.contains('copy-success'));
  assert.equal(page.clipboardWrites.length, 1);
});

test('9. Copying does not advance report selection', async () => {
  const page = await startPage();
  await page.selectReport(1);
  assert.equal(page.$('reportSelect').value, '1');
  assert.equal(page.$('reportFilename').textContent, 'second.md');

  await page.copy();
  assert.equal(page.$('reportSelect').value, '1');
  assert.equal(page.$('reportFilename').textContent, 'second.md');
});

test('10. Copying does not remove or reorder the report', async () => {
  const page = await startPage();
  const initialOptions = page.$('reportSelect').children.map((c) => c.textContent);
  await page.copy();
  const postOptions = page.$('reportSelect').children.map((c) => c.textContent);
  assert.deepEqual(initialOptions, postOptions);
});

test('11. Existing acknowledgement behavior remains intact', async () => {
  const page = await startPage();
  await page.copy();
  const acks = page.posts.filter((p) => p.url === '/api/work/acknowledge');
  assert.equal(acks.length, 1);
  assert.equal(acks[0].body.reportPath, 'REPORTS/Claude/report.md');
});

test('12. Switching report cancels previous timer and resets button immediately', async () => {
  const page = await startPage();
  const btn = page.$('copyReportBtn');
  await page.copy();
  assert.equal(btn.textContent, '✓ Report copied');

  // Switch report immediately without waiting 2000ms
  await page.selectReport(1);
  assert.equal(btn.textContent, 'Copy Report');
  assert.equal(btn.classList.contains('copy-success'), false);
});
