/** S3/S4 — Browse Game, Search, contextual path actions, and amended Outgoing hierarchy. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const html = await readFile(resolve('src/public/index.html'), 'utf8');
const scriptCode = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!scriptCode) throw new Error('No browser script found');

const GAME = 'game_files_s3';
const PLAYER = 'codex-s3';
const flush = () => new Promise((resolveWait) => setTimeout(resolveWait, 15));
const visibleText = (node) => [node?.textContent || '', ...(node?.children || []).map(visibleText)].join(' ');

function status() {
  const capability = {
    instanceId: PLAYER, playerType: 'codex', fieldLabel: 'Codex', transport: 'controlled', state: 'ready',
    capability: {
      provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live', defaultModelId: 'sol',
      models: [{ id: 'sol', displayName: 'Sol', isDefault: true, supportedEfforts: ['low', 'medium'], defaultEffort: 'low' }]
    }
  };
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Trend and Tap Assist', fingerprintSource: 'test' },
    games: [{ gameId: GAME, displayName: 'Trend and Tap Assist', connectionStatus: 'connected', features: ['game.files.v1'] }],
    stadium: { stadiumId: 'stadium-s3', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [{ id: 'codex', name: 'Codex', availability: 'available', fieldState: 'on-field', instances: [{ instanceId: PLAYER, playerType: 'codex', seat: 1, fieldLabel: 'Codex · Controlled', onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' }] }],
    routing: { mode: 'auto', capabilities: [capability], activeDecision: { mode: 'auto', action: 'dispatch', gameId: GAME, playerInstanceId: PLAYER, playerName: 'Codex', provider: 'codex', model: 'sol', effort: 'low', transport: 'controlled', reason: 'Ready.' } },
    capabilities: [capability], modelSwitches: { Default: '' }, reports: [], queue: [], preferences: { runningPlayers: 'ask' },
    execution: { gameId: GAME, epoch: 's3', serverNow: Date.now(), byInstance: { [PLAYER]: { instanceId: PLAYER, state: 'idle', revision: 0, executionType: 'reasoning' } } }
  };
}

function nodeFactory(documentRef, id = '') {
  let innerHTML = '';
  const node = {
    id, type: '', value: '', textContent: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
    dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {}, selectionStart: 0, selectionEnd: 0, scrollTop: 0,
    classList: {
      classes: new Set(),
      add(...tokens) { for (const token of tokens) this.classes.add(token); },
      remove(...tokens) { for (const token of tokens) this.classes.delete(token); },
      toggle(token, force) { const next = force === undefined ? !this.classes.has(token) : force; if (next) this.classes.add(token); else this.classes.delete(token); return next; },
      contains(token) { return this.classes.has(token); }
    },
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); return true; },
    setAttribute(key, value) { this.attributes[key] = String(value); this[key] = String(value); },
    getAttribute(key) { return this.attributes[key]; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    contains(candidate) { return candidate === this || this.children.some((child) => child.contains?.(candidate)); },
    focus() { documentRef.activeElement = this; for (const fn of this.listeners.focus || []) fn({ target: this }); },
    blur() { if (documentRef.activeElement === this) documentRef.activeElement = null; },
    select() { this.selectionStart = 0; this.selectionEnd = String(this.value).length; },
    remove() {},
    scrollIntoView() {},
    setRangeText(replacement, start, end, selectionMode) {
      this.value = String(this.value).slice(0, start) + replacement + String(this.value).slice(end);
      const caret = start + replacement.length;
      if (selectionMode === 'end') this.selectionStart = this.selectionEnd = caret;
    }
  };
  Object.defineProperty(node, 'innerHTML', {
    get: () => innerHTML,
    set: (value) => { innerHTML = String(value); if (value === '') node.children.length = 0; }
  });
  return node;
}

function createPage({ browse = {}, search = {}, resolveAbsolute, clipboard = async () => {}, currentStatus = status() } = {}) {
  const elements = new Map();
  const document = {
    activeElement: null, visibilityState: 'visible', listeners: {},
    getElementById(id) { if (!elements.has(id)) elements.set(id, nodeFactory(document, id)); return elements.get(id); },
    createElement() { return nodeFactory(document); },
    querySelectorAll(selector) { return selector === '[data-live-action]' ? [this.getElementById('dispatchBtn')] : []; },
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
    execCommand() { return true; }
  };
  document.body = nodeFactory(document, 'body');
  const $ = (id) => document.getElementById(id);
  let source;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
    emit(event, data = {}) { for (const fn of this.listeners[event] || []) fn({ data: JSON.stringify(data) }); }
    close() {}
  }
  const browseCalls = [];
  const searchCalls = [];
  const absoluteCalls = [];
  const previewCalls = [];
  const defaultBrowse = {
    '': { gameId: GAME, dir: '', entries: [{ name: 'Reports', path: 'Reports', kind: 'folder' }, { name: 'server.ts', path: 'src/server.ts', kind: 'file' }], truncated: true },
    Reports: { gameId: GAME, dir: 'Reports', entries: [{ name: 'Codex', path: 'Reports/Codex', kind: 'folder' }], truncated: false },
    'Reports/Codex': { gameId: GAME, dir: 'Reports/Codex', entries: [], truncated: false }
  };
  const replies = { ...defaultBrowse, ...browse };
  const searchReplies = { ...search };
  const response = (code, body) => ({ ok: code >= 200 && code < 300, status: code, json: async () => body });
  const ctx = {
    document, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (key) => key === 'sidelineCoachToken' ? 'test-token' : null, setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    Event: class { constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles; } },
    fetch: async (url, options = {}) => {
      if (url === '/api/status') return response(200, currentStatus);
      if (url.startsWith('/api/reports')) return response(200, []);
      if (url.startsWith('/api/games/files/browse')) {
        const parsed = new URL(`http://test${url}`);
        const gameId = parsed.searchParams.get('gameId');
        const dir = parsed.searchParams.get('dir') || '';
        browseCalls.push({ gameId, dir });
        const value = replies[dir];
        if (typeof value === 'function') return value({ gameId, dir, response });
        if (value?.error) return response(value.status || 500, { success: false, message: value.error });
        return response(200, value || { gameId, dir, entries: [], truncated: false });
      }
      if (url.startsWith('/api/games/files/search')) {
        const parsed = new URL(`http://test${url}`);
        const gameId = parsed.searchParams.get('gameId');
        const query = parsed.searchParams.get('q') || '';
        const explicit = parsed.searchParams.get('explicit') === '1';
        searchCalls.push({ gameId, query, explicit });
        const value = searchReplies[query];
        if (typeof value === 'function') return value({ gameId, query, explicit, response });
        if (value?.error) return response(value.status || 500, { success: false, status: value.gameStatus, message: value.error });
        return response(200, value || { gameId, query, results: [], truncated: false, moreMatches: false });
      }
      if (url === '/api/games/files/absolute-path') {
        const body = JSON.parse(options.body);
        absoluteCalls.push(body);
        const value = typeof resolveAbsolute === 'function' ? await resolveAbsolute({ ...body, response }) : resolveAbsolute;
        if (value?.error) return response(value.status || 500, { success: false, status: value.gameStatus, message: value.error });
        return response(200, value || { gameId: body.gameId, path: body.path, available: false, reason: 'unknown' });
      }
      if (url === '/api/route/preview') { previewCalls.push(JSON.parse(options.body)); return response(200, { success: true, decision: currentStatus.routing.activeDecision }); }
      return response(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, console,
    navigator: { clipboard: { writeText: clipboard } }, window: { isSecureContext: true }
  };
  const page = {
    $, elements, browseCalls, searchCalls, absoluteCalls, previewCalls, get source() { return source; },
    state: () => ctx.__sidelineCoach,
    activeElement: () => document.activeElement,
    click: async (target) => {
      const node = typeof target === 'string' ? $(target) : target;
      for (const fn of node.listeners.click || []) await fn({ target: node, preventDefault() {}, stopPropagation() {} });
      await flush();
    },
    pointerDown: (id) => { for (const fn of $(id).listeners.pointerdown || []) fn({ target: $(id) }); },
    input: (id, value) => {
      const node = $(id);
      node.value = value;
      for (const fn of node.listeners.input || []) fn({ target: node });
    },
    keydown: (id, key) => {
      const node = $(id);
      for (const fn of node.listeners.keydown || []) fn({ key, target: node, preventDefault() {}, stopPropagation() {} });
    },
    rows: () => $('gameBrowserRows').children.filter((child) => child.className === 'game-file-row'),
    row: (path) => page.rows().find((row) => row.dataset.path === path),
    action: (id) => $('gamePathActionButtons').children.find((button) => button.dataset.actionId === id),
    start: async () => {
      vm.createContext(ctx);
      vm.runInContext(scriptCode, ctx);
      source.emit('hello');
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline && $('connectionText').textContent !== 'Coach Online') await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      assert.equal($('connectionText').textContent, 'Coach Online');
      return page;
    }
  };
  return page;
}

test('S3-UI-1: approved Dispatcher hierarchy keeps routing and path composition separate', () => {
  assert.doesNotMatch(html, /1-Tap Send/);
  const dispatcher = html.match(/<section class="card">\s*<div class="card-title-row">[\s\S]*?<h2>Play Dispatcher<\/h2>[\s\S]*?<\/section>/)?.[0];
  assert.ok(dispatcher);
  assert.match(dispatcher, /<div class="card-title-row">[\s\S]*?id="refreshCapsBtn"/);
  const routingRow = dispatcher.match(/<div class="routing-mode-bar">([\s\S]*?)<\/div>\s*<div id="autoRoutingCard"/)?.[1];
  assert.ok(routingRow);
  const routingGroup = routingRow.match(/<div class="mode-toggle-group"[\s\S]*?<\/div>/)?.[0];
  assert.match(routingGroup, /modeAutoBtn/);
  assert.match(routingGroup, /modeManualBtn/);
  assert.doesNotMatch(routingGroup, /insertPathBtn/);
  assert.match(routingRow, /<\/div>\s*<button id="insertPathBtn"/);
  assert.match(html, /\.path-entry-btn\s*\{[^}]*margin-left:\s*auto/s);
  assert.match(html, /\.routing-mode-bar\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(dispatcher, /Copy absolute path|Search files & folders/);
});

test('S3-BROWSE-1: exact Game root, folder navigation, Back, empty state, and truncation are truthful', async () => {
  const page = await createPage().start();
  assert.equal(page.$('insertPathBtn').disabled, false);
  await page.click('insertPathBtn');
  assert.deepEqual(page.browseCalls[0], { gameId: GAME, dir: '' });
  assert.equal(page.state().gameBrowser().status, 'ready');
  assert.equal(page.rows().length, 2);
  for (const entry of page.state().gameBrowser().entries) assert.deepEqual(Object.keys(entry).sort(), ['kind', 'name', 'path']);
  assert.match(page.$('gameBrowserNotice').textContent, /first 200 items/i);

  await page.click(page.row('Reports').children[0]);
  assert.equal(page.state().gameBrowser().dir, 'Reports');
  assert.equal(page.$('gameBrowserBackBtn').hidden, false);
  await page.click(page.row('Reports/Codex').children[0]);
  assert.equal(page.state().gameBrowser().dir, 'Reports/Codex');
  assert.match(page.$('gameBrowserRows').children[0].textContent, /empty/i);
  await page.click('gameBrowserBackBtn');
  assert.equal(page.state().gameBrowser().dir, 'Reports');
});

test('S3-BROWSE-2: loading and unavailable Game states remain truthful', async () => {
  let resolveBrowse;
  const pending = new Promise((resolvePending) => { resolveBrowse = resolvePending; });
  const page = await createPage({ browse: { '': () => pending } }).start();
  const opening = page.click('insertPathBtn');
  assert.equal(page.state().gameBrowser().status, 'loading');
  assert.match(page.$('gameBrowserRows').children[0].textContent, /Loading/i);
  resolveBrowse({ ok: true, status: 200, json: async () => ({ gameId: GAME, dir: '', entries: [], truncated: false }) });
  await opening;
  assert.equal(page.state().gameBrowser().status, 'ready');

  const unavailable = await createPage({ browse: { '': { status: 409, error: 'Game is offline.' } } }).start();
  await unavailable.click('insertPathBtn');
  assert.equal(unavailable.state().gameBrowser().status, 'offline');
  assert.match(unavailable.$('gameBrowserNotice').textContent, /offline/i);
});

test('S3-BROWSE-3: a selected Game change closes the captured exact-Game browser', async () => {
  const page = await createPage().start();
  await page.click('insertPathBtn');
  const switched = status();
  switched.selectedGameId = 'other-game';
  switched.game = { gameId: 'other-game', displayName: 'Other Game', fingerprintSource: 'test' };
  switched.games = [{ gameId: 'other-game', displayName: 'Other Game', connectionStatus: 'connected', features: ['game.files.v1'] }];
  page.source.emit('status', switched);
  await flush();
  assert.equal(page.state().gameBrowser().open, false);
  assert.match(page.$('toast').textContent, /Switched Game/i);
});

test('S3-BROWSE-4: an older Stadium without game.files.v1 disables + PATH truthfully', async () => {
  const older = status();
  older.games[0].features = [];
  const page = await createPage({ currentStatus: older }).start();
  assert.equal(page.$('insertPathBtn').disabled, true);
  assert.match(page.$('insertPathBtn').title, /Reload or update/i);
  await page.click('insertPathBtn');
  assert.equal(page.state().gameBrowser().open, false);
  assert.equal(page.browseCalls.length, 0);
});

test('S3-ACTION-1: file tap only opens actions; relative copy reports success and closes', async () => {
  const copied = [];
  const page = await createPage({ clipboard: async (text) => { copied.push(text); } }).start();
  page.$('promptInput').value = 'Keep this Play';
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[0]);
  assert.equal(page.$('promptInput').value, 'Keep this Play');
  assert.equal(page.$('gamePathActions').hidden, false);
  await page.click(page.action('copy-relative'));
  assert.deepEqual(copied, ['src/server.ts']);
  assert.equal(page.state().gameBrowser().open, false);
  assert.match(page.$('toast').textContent, /copied/i);
});

test('S3-ACTION-2: clipboard failure is truthful and keeps Browse Game open', async () => {
  const page = await createPage({ clipboard: async () => { throw new Error('denied'); } }).start();
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[1]);
  await page.click(page.action('copy-relative'));
  assert.equal(page.state().gameBrowser().open, true);
  assert.equal(page.$('gamePathActions').hidden, false);
  assert.match(page.$('toast').textContent, /failed/i);
  assert.equal(page.$('toast').classList.contains('error'), true);
});

test('S3-INSERT-1: insertion into empty prompt is explicit, formatted, focused, and drives preview', async () => {
  const page = await createPage().start();
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[1]);
  await page.click(page.action('insert'));
  assert.equal(page.$('promptInput').value, '`src/server.ts` ');
  assert.equal(page.$('promptInput').selectionStart, page.$('promptInput').value.length);
  assert.equal(page.$('promptInput').selectionEnd, page.$('promptInput').value.length);
  assert.equal(page.activeElement(), page.$('promptInput'));
  assert.equal(page.state().gameBrowser().open, false);
  await new Promise((resolveWait) => setTimeout(resolveWait, 340));
  assert.equal(page.previewCalls.length, 1);
});

test('S3-INSERT-2: caret insertion and selection replacement preserve surrounding text and routing state', async () => {
  const page = await createPage().start();
  await page.click('modeManualBtn');
  page.$('terminalSelect').value = PLAYER;
  for (const fn of page.$('terminalSelect').listeners.change || []) fn({ target: page.$('terminalSelect') });
  page.$('modelSelect').value = 'sol';
  for (const fn of page.$('modelSelect').listeners.change || []) fn({ target: page.$('modelSelect') });
  page.$('effortSelect').value = 'low';
  const beforeRouting = page.state().routing();

  const prompt = page.$('promptInput');
  prompt.value = 'Review please';
  prompt.selectionStart = 6;
  prompt.selectionEnd = 6;
  prompt.focus();
  page.pointerDown('insertPathBtn');
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[1]);
  await page.click(page.action('insert'));
  assert.equal(prompt.value, 'Review `src/server.ts` please');
  assert.deepEqual(page.state().routing(), beforeRouting);

  prompt.value = 'Review now please';
  prompt.selectionStart = 7;
  prompt.selectionEnd = 10;
  prompt.focus();
  page.pointerDown('insertPathBtn');
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[1]);
  await page.click(page.action('insert'));
  assert.equal(prompt.value, 'Review `src/server.ts` please');
  assert.deepEqual(page.state().routing(), beforeRouting);
});

test('S3-INSERT-3: folder insertion uses a trailing slash and header actions reuse the same provider', async () => {
  const page = await createPage().start();
  await page.click('insertPathBtn');
  await page.click(page.row('Reports').children[0]);
  await page.click('gameBrowserCurrentActionsBtn');
  await page.click(page.action('insert'));
  assert.equal(page.$('promptInput').value, '`Reports/` ');
});

test('S4-UI-1: Search lives inside Browse Game, stays outside routing, and is phone-safe', () => {
  const browser = html.match(/<div id="gameBrowserBackdrop"[\s\S]*?<div id="gamePathActions"/)?.[0];
  assert.ok(browser);
  assert.match(browser, /id="gameBrowserSearchInput"[^>]*type="search"[^>]*placeholder="Search files &amp; folders\.\.\."/);
  assert.match(browser, /enterkeyhint="search"[^>]*autocapitalize="off"[^>]*autocorrect="off"[^>]*spellcheck="false"/);
  const routingGroup = html.match(/<div class="mode-toggle-group"[\s\S]*?<\/div>/)?.[0];
  assert.doesNotMatch(routingGroup, /gameBrowserSearchInput|Search files/);
  assert.match(html, /\.game-browser-search input\s*\{[^}]*min-height:\s*46px/s);
  assert.match(html, /\.game-file-actions\s*\{[^}]*min-width:\s*46px/s);
  assert.match(html, /\.game-browser-rows\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(html, /\.game-file-path\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test('S4-SEARCH-1: typing is immediate, normalized, debounced, and exact-Game scoped', async () => {
  const page = await createPage({
    search: { 'server / ts': { gameId: GAME, query: 'server / ts', results: [], truncated: false, moreMatches: false } }
  }).start();
  await page.click('insertPathBtn');
  page.input('gameBrowserSearchInput', '  SERVER \\ TS  ');
  assert.equal(page.$('gameBrowserSearchInput').value, '  SERVER \\ TS  ');
  assert.equal(page.state().gameBrowser().query, 'server / ts');
  assert.equal(page.state().gameBrowser().mode, 'search');
  assert.equal(page.searchCalls.length, 0);
  await new Promise((resolveWait) => setTimeout(resolveWait, 330));
  assert.deepEqual(page.searchCalls, [{ gameId: GAME, query: 'server / ts', explicit: false }]);
});

test('S4-SEARCH-2: one character waits for explicit Enter and empty input restores Browse without refetch', async () => {
  const page = await createPage({
    search: { s: { gameId: GAME, query: 's', results: [{ name: 'src', path: 'src', kind: 'folder' }], truncated: false, moreMatches: false } }
  }).start();
  await page.click('insertPathBtn');
  await page.click(page.row('Reports').children[0]);
  page.$('gameBrowserRows').scrollTop = 73;
  const browseCount = page.browseCalls.length;
  page.input('gameBrowserSearchInput', 's');
  await new Promise((resolveWait) => setTimeout(resolveWait, 330));
  assert.equal(page.searchCalls.length, 0);
  assert.match(visibleText(page.$('gameBrowserRows')), /another character/i);
  page.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  assert.deepEqual(page.searchCalls, [{ gameId: GAME, query: 's', explicit: true }]);
  page.input('gameBrowserSearchInput', '   ');
  assert.equal(page.state().gameBrowser().mode, 'browse');
  assert.equal(page.state().gameBrowser().dir, 'Reports');
  assert.equal(page.$('gameBrowserRows').scrollTop, 73);
  assert.equal(page.browseCalls.length, browseCount);
});

test('S4-RESULT-1: returned order, kinds, relative context, and metadata-only shape are preserved', async () => {
  const ordered = [
    { name: 'server.ts', path: 'src/server.ts', kind: 'file', content: 'never render', rootFsPath: 'C:\\secret' },
    { name: 'Reports', path: 'Reports', kind: 'folder', content: 'never render' }
  ];
  const page = await createPage({ search: { re: { gameId: GAME, query: 're', results: ordered, truncated: false, moreMatches: false } } }).start();
  await page.click('insertPathBtn');
  page.input('gameBrowserSearchInput', 're');
  await new Promise((resolveWait) => setTimeout(resolveWait, 330));
  assert.deepEqual(page.state().gameBrowser().results.map((entry) => entry.path), ['src/server.ts', 'Reports']);
  for (const entry of page.state().gameBrowser().results) assert.deepEqual(Object.keys(entry).sort(), ['kind', 'name', 'path']);
  assert.equal(page.rows()[0].dataset.kind, 'file');
  assert.equal(page.rows()[1].dataset.kind, 'folder');
  const rendered = visibleText(page.$('gameBrowserRows'));
  assert.match(rendered, /server\.ts[\s\S]*file[\s\S]*src\/server\.ts/i);
  assert.match(rendered, /Reports[\s\S]*folder[\s\S]*Reports\//i);
  assert.doesNotMatch(rendered, /never render|C:\\secret/i);
});

test('S4-STALE-1: an older query, a Game switch, and a closed sheet cannot apply late Search results', async () => {
  let resolveOld;
  let resolveClosed;
  const oldPending = new Promise((resolvePending) => { resolveOld = resolvePending; });
  const closedPending = new Promise((resolvePending) => { resolveClosed = resolvePending; });
  const page = await createPage({
    search: {
      old: () => oldPending,
      newer: { gameId: GAME, query: 'newer', results: [{ name: 'new.ts', path: 'new.ts', kind: 'file' }], truncated: false, moreMatches: false },
      close: () => closedPending
    }
  }).start();
  await page.click('insertPathBtn');
  page.input('gameBrowserSearchInput', 'old');
  await new Promise((resolveWait) => setTimeout(resolveWait, 320));
  page.input('gameBrowserSearchInput', 'newer');
  await new Promise((resolveWait) => setTimeout(resolveWait, 330));
  assert.deepEqual(page.state().gameBrowser().results.map((entry) => entry.path), ['new.ts']);
  resolveOld({ ok: true, status: 200, json: async () => ({ gameId: GAME, query: 'old', results: [{ name: 'old.ts', path: 'old.ts', kind: 'file' }], truncated: false, moreMatches: false }) });
  await flush();
  assert.deepEqual(page.state().gameBrowser().results.map((entry) => entry.path), ['new.ts']);

  page.input('gameBrowserSearchInput', 'close');
  await new Promise((resolveWait) => setTimeout(resolveWait, 320));
  await page.click('gameBrowserCloseBtn');
  resolveClosed({ ok: true, status: 200, json: async () => ({ gameId: GAME, query: 'close', results: [{ name: 'late', path: 'late', kind: 'file' }], truncated: false, moreMatches: false }) });
  await flush();
  assert.equal(page.state().gameBrowser().open, false);
  assert.equal(page.state().gameBrowser().results.length, 0);

  const switchedPage = await createPage({ search: { wait: () => new Promise(() => {}) } }).start();
  await switchedPage.click('insertPathBtn');
  switchedPage.input('gameBrowserSearchInput', 'wait');
  await new Promise((resolveWait) => setTimeout(resolveWait, 320));
  const switched = status();
  switched.selectedGameId = 'other-game';
  switched.game = { gameId: 'other-game', displayName: 'Other Game', fingerprintSource: 'test' };
  switched.games = [{ gameId: 'other-game', displayName: 'Other Game', connectionStatus: 'connected', features: ['game.files.v1'] }];
  switchedPage.source.emit('status', switched);
  await flush();
  assert.equal(switchedPage.state().gameBrowser().open, false);
});

test('S4-STATE-1: no-match, more-match, truncated, offline, and unsupported states are truthful', async () => {
  const page = await createPage({
    search: {
      none: { gameId: GAME, query: 'none', results: [], truncated: false, moreMatches: false },
      more: { gameId: GAME, query: 'more', results: [], truncated: false, moreMatches: true },
      bounded: { gameId: GAME, query: 'bounded', results: [], truncated: true, limitReason: 'time', moreMatches: false },
      offline: { status: 409, gameStatus: 'offline', error: 'Game is offline.' },
      unsupported: { status: 409, gameStatus: 'unsupported', error: 'Unsupported Stadium.' }
    }
  }).start();
  await page.click('insertPathBtn');
  for (const [query, expected] of [['none', /No matching/i], ['more', /More matches exist/i], ['bounded', /results may be incomplete/i], ['offline', /Game offline/i], ['unsupported', /Reload or update/i]]) {
    page.input('gameBrowserSearchInput', query);
    page.keydown('gameBrowserSearchInput', 'Enter');
    await flush();
    assert.match(visibleText(page.$('gameBrowserRows')) + ' ' + page.$('gameBrowserNotice').textContent, expected);
  }
});

test('S4-ACTION-1: Search insertion and copy reuse S3 behavior without changing routing state', async () => {
  const result = { gameId: GAME, query: 'server', results: [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }], truncated: false, moreMatches: false };
  const page = await createPage({ search: { server: result } }).start();
  await page.click('modeManualBtn');
  page.$('terminalSelect').value = PLAYER;
  for (const fn of page.$('terminalSelect').listeners.change || []) fn({ target: page.$('terminalSelect') });
  page.$('modelSelect').value = 'sol';
  page.$('effortSelect').value = 'low';
  const before = page.state().routing();
  await page.click('insertPathBtn');
  page.input('gameBrowserSearchInput', 'server');
  page.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  await page.click(page.row('src/server.ts').children[1]);
  assert.ok(page.action('insert'));
  assert.ok(page.action('copy-relative'));
  assert.ok(page.action('open-containing'));
  await page.click(page.action('insert'));
  assert.equal(page.$('promptInput').value, '`src/server.ts` ');
  assert.deepEqual(page.state().routing(), before);

  const copied = [];
  const copyPage = await createPage({ search: { server: result }, clipboard: async (text) => copied.push(text) }).start();
  await copyPage.click('insertPathBtn');
  copyPage.input('gameBrowserSearchInput', 'server');
  copyPage.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  await copyPage.click(copyPage.row('src/server.ts').children[1]);
  await copyPage.click(copyPage.action('copy-relative'));
  assert.deepEqual(copied, ['src/server.ts']);
});

test('S4-ACTION-2: Open containing folder and folder Open return to lazy Browse mode', async () => {
  const results = {
    gameId: GAME, query: 'find', truncated: false, moreMatches: false,
    results: [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }, { name: 'Codex', path: 'Reports/Codex', kind: 'folder' }]
  };
  const page = await createPage({ search: { find: results } }).start();
  await page.click('insertPathBtn');
  page.input('gameBrowserSearchInput', 'find');
  page.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  await page.click(page.row('src/server.ts').children[1]);
  await page.click(page.action('open-containing'));
  assert.equal(page.state().gameBrowser().mode, 'browse');
  assert.equal(page.state().gameBrowser().dir, 'src');
  assert.deepEqual(page.browseCalls.at(-1), { gameId: GAME, dir: 'src' });

  page.input('gameBrowserSearchInput', 'find');
  page.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  await page.click(page.row('Reports/Codex').children[1]);
  assert.ok(page.action('open-folder'));
  await page.click(page.action('open-folder'));
  assert.equal(page.state().gameBrowser().mode, 'browse');
  assert.equal(page.state().gameBrowser().dir, 'Reports/Codex');
});

test('S4-ACTION-3: failed containing-folder browse remains in Search and recoverable', async () => {
  const page = await createPage({
    browse: { src: { status: 404, error: 'Folder disappeared.' } },
    search: { find: { gameId: GAME, query: 'find', results: [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }], truncated: false, moreMatches: false } }
  }).start();
  await page.click('insertPathBtn');
  page.input('gameBrowserSearchInput', 'find');
  page.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  await page.click(page.row('src/server.ts').children[1]);
  await page.click(page.action('open-containing'));
  assert.equal(page.state().gameBrowser().mode, 'search');
  assert.equal(page.state().gameBrowser().open, true);
  assert.match(page.$('toast').textContent, /disappeared/i);
});

test('S5-UI-1: Browse action prefetches authoritatively, then copies the exact returned absolute path', async () => {
  let finishResolve;
  const pending = new Promise((resolvePending) => { finishResolve = resolvePending; });
  const copied = [];
  const absolutePath = 'C:\\Games\\Trend and Tap Assist\\src\\server.ts';
  const page = await createPage({ resolveAbsolute: () => pending, clipboard: async (text) => copied.push(text) }).start();
  page.$('promptInput').value = 'Keep this Play';
  const beforeRouting = page.state().routing();
  await page.click('insertPathBtn');
  const beforeBrowser = page.state().gameBrowser();
  await page.click(page.row('src/server.ts').children[1]);
  const action = page.action('copy-absolute');
  assert.ok(action);
  assert.equal(action.disabled, true);
  assert.match(action.textContent, /resolving/i);
  assert.deepEqual(page.absoluteCalls, [{ gameId: GAME, path: 'src/server.ts' }]);
  finishResolve({ gameId: GAME, path: 'src/server.ts', available: true, absolutePath, pathStyle: 'windows', environment: 'local' });
  await flush();
  assert.equal(action.disabled, false);
  assert.equal(action.textContent, 'Copy absolute path');
  await page.click(action);
  assert.deepEqual(copied, [absolutePath]);
  assert.match(page.$('toast').textContent, /Absolute path copied/i);
  assert.equal(page.$('promptInput').value, 'Keep this Play');
  assert.deepEqual(page.state().routing(), beforeRouting);
  assert.equal(page.state().gameBrowser().dir, beforeBrowser.dir);
  assert.equal(page.state().gameBrowser().query, beforeBrowser.query);
  assert.equal(page.state().gameBrowser().open, false);
});

test('S5-UI-2: Search results use the same absolute action while normal rows disclose no absolute path', async () => {
  const absolutePath = 'C:\\Games\\Trend and Tap Assist\\src\\server.ts';
  const result = { gameId: GAME, query: 'server', results: [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }], truncated: false, moreMatches: false };
  const page = await createPage({
    search: { server: result },
    resolveAbsolute: ({ gameId, path: relativePath }) => ({ gameId, path: relativePath, available: true, absolutePath, pathStyle: 'windows', environment: 'local' })
  }).start();
  await page.click('insertPathBtn');
  assert.equal(page.absoluteCalls.length, 0);
  assert.doesNotMatch(visibleText(page.$('gameBrowserRows')), /C:\\Games/i);
  page.input('gameBrowserSearchInput', 'server');
  page.keydown('gameBrowserSearchInput', 'Enter');
  await flush();
  assert.doesNotMatch(visibleText(page.$('gameBrowserRows')), /C:\\Games/i);
  await page.click(page.row('src/server.ts').children[1]);
  assert.ok(page.action('copy-relative'));
  assert.ok(page.action('copy-absolute'));
  assert.ok(page.action('open-containing'));
  assert.deepEqual(page.absoluteCalls, [{ gameId: GAME, path: 'src/server.ts' }]);
  assert.equal('absolutePath' in page.state().gameBrowser().results[0], false);
  assert.equal(page.$('promptInput').value, '');
});

test('S5-UI-3: resolver and version-skew failures disable the action without copying or claiming success', async () => {
  const copied = [];
  const page = await createPage({
    resolveAbsolute: { status: 409, gameStatus: 'unsupported', error: 'Update this Game window.' },
    clipboard: async (text) => copied.push(text)
  }).start();
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[1]);
  const action = page.action('copy-absolute');
  assert.equal(action.disabled, true);
  assert.match(action.textContent, /update this Game window/i);
  assert.deepEqual(copied, []);
  assert.doesNotMatch(page.$('toast').textContent, /copied/i);

  const older = status();
  older.games[0].features = [];
  const unsupported = await createPage({ currentStatus: older }).start();
  assert.equal(unsupported.$('insertPathBtn').disabled, true);
  await unsupported.click('insertPathBtn');
  assert.equal(unsupported.state().gameBrowser().open, false);
  assert.equal(unsupported.absoluteCalls.length, 0);
});

test('S5-UI-4: clipboard failure after resolution keeps Browse recoverable and never claims success', async () => {
  const page = await createPage({
    resolveAbsolute: ({ gameId, path: relativePath }) => ({
      gameId, path: relativePath, available: true, absolutePath: '/workspace/game/src/server.ts', pathStyle: 'posix', environment: 'remote', remoteLabel: 'Dev Container'
    }),
    clipboard: async () => { throw new Error('denied'); }
  }).start();
  await page.click('insertPathBtn');
  await page.click(page.row('src/server.ts').children[1]);
  const action = page.action('copy-absolute');
  assert.equal(action.disabled, false);
  assert.match(action.textContent, /on Dev Container/i);
  assert.match(action.title, /remote machine/i);
  await page.click(action);
  assert.equal(page.state().gameBrowser().open, true);
  assert.equal(page.$('gamePathActions').hidden, false);
  assert.match(page.$('toast').textContent, /Copy failed/i);
  assert.doesNotMatch(page.$('toast').textContent, /Absolute path copied/i);
});
