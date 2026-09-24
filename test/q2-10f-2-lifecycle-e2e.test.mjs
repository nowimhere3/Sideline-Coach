/**
 * Q2.10F.2 Slice F — asserted production-boundary lifecycle acceptance.
 *
 * Promotes the useful ordering from fixtures/q2-10f-2-lifecycle-trace.mjs:
 * real ControlPlaneDaemon + real StadiumClient/WebSocket + real Work Ledger +
 * real page script. The DOM is structural (not a second lifecycle model).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const GAME = 'game_git_f_acceptance';
const OTHER_GAME = 'game_git_f_other';
const AG = 'antigravity-f0f0a001';
const CX = 'codex-f0f0c001';
const PLAYER_NAMES = { [AG]: 'AntiGravity', [CX]: 'Codex' };
const snapshot = (provider) => ({
  provider, authenticated: true, observedAt: Date.now(), freshness: 'live', defaultModelId: `${provider}-default`,
  models: [{ id: `${provider}-default`, displayName: 'Provider Default', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]
});

async function until(predicate, { timeoutMs = 15_000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await wait(10);
  }
  assert.fail(`Timed out waiting for ${label}.`);
}

function createDom() {
  const elements = new Map();
  const scrollCalls = [];
  const doc = { activeElement: null, visibilityState: 'visible', _listeners: {} };
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList: {
        classes: new Set(),
        add(...tokens) { for (const token of tokens) this.classes.add(token); },
        remove(...tokens) { for (const token of tokens) this.classes.delete(token); },
        toggle(token, force) { const on = force === undefined ? !this.classes.has(token) : force; if (on) this.classes.add(token); else this.classes.delete(token); return on; },
        contains(token) { return this.classes.has(token); }
      },
      addEventListener(event, listener) { (this.listeners[event] = this.listeners[event] || []).push(listener); },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key]; },
      appendChild(child) { if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child); child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this); this.parentNode = null; },
      contains(other) { for (let current = other; current; current = current.parentNode) if (current === this) return true; return false; },
      closest(selector) { if (selector !== '.player[data-instance-id]') return null; for (let current = this; current; current = current.parentNode) if (current.className === 'player' && current.dataset.instanceId) return current; return null; },
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = null; },
      scrollIntoView(options) { scrollCalls.push({ id: this.dataset.instanceId || this.id, options }); }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (value) => { text = String(value); } });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { for (const child of node.children) child.parentNode = null; node.children = []; } });
    return node;
  };
  const $ = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), body: makeNode('body'),
    querySelectorAll: (selector) => selector === '[data-live-action]' ? [$('dispatchBtn')] : [],
    addEventListener(event, listener) { (this._listeners[event] = this._listeners[event] || []).push(listener); },
    removeEventListener() {}
  });
  const allText = (node) => [node?.textContent || '', ...(node?.children || []).map(allText)].filter(Boolean).join(' ');
  const find = (root, predicate) => {
    if (!root) return null;
    if (predicate(root)) return root;
    for (const child of root.children || []) { const match = find(child, predicate); if (match) return match; }
    return null;
  };
  return { doc, $, makeNode, allText, find, scrollCalls };
}

async function createLivePage(rig) {
  const dom = createDom();
  const abort = new AbortController();
  const intervals = [];
  const acknowledgeBodies = [];
  let pauseExecution = false;
  const heldExecution = [];
  let source;
  const browserOrigin = `http://127.0.0.1:${rig.port}`;
  let browserCookie = '';
  const browserFetch = async (url, options = {}) => {
    if (url === '/api/work/acknowledge' && options.body) acknowledgeBodies.push(JSON.parse(options.body));
    const headers = new Headers(options.headers || {});
    if (browserCookie) headers.set('Cookie', browserCookie);
    const method = (options.method || 'GET').toUpperCase();
    if (browserCookie && method !== 'GET' && method !== 'HEAD') headers.set('Origin', browserOrigin);
    const response = await fetch(`${browserOrigin}${url}`, { ...options, headers, signal: abort.signal });
    if (url === '/api/session') browserCookie = (response.headers.get('set-cookie') || '').split(';', 1)[0];
    return response;
  };

  class BridgedEventSource {
    constructor(url) {
      this.listeners = {};
      source = this;
      void this.read(url);
    }
    addEventListener(event, listener) { (this.listeners[event] = this.listeners[event] || []).push(listener); }
    deliver(event, data) {
      if (event === 'execution' && pauseExecution) { heldExecution.push(data); return; }
      for (const listener of this.listeners[event] || []) listener({ data });
    }
    async read(url) {
      const response = await browserFetch(url);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const chunk = await reader.read().catch(() => ({ done: true }));
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1] ?? '{}';
          if (event) this.deliver(event, data);
        }
      }
    }
    close() { abort.abort(); }
  }

  const context = {
    document: dom.doc,
    location: { search: '', hash: `#token=${encodeURIComponent(rig.token)}`, pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Headers, URLSearchParams, EventSource: BridgedEventSource,
    matchMedia: () => ({ matches: false }),
    fetch: browserFetch,
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
    setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timer.unref(); intervals.push(timer); return timer; }, clearInterval,
    console: { ...console, error: () => {} }, navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }, Date
  };
  vm.createContext(context);
  vm.runInContext(pageScript, context);
  await until(() => dom.$('connectionText').textContent === 'Coach Online' && context.__sidelineCoach.execution().epoch, { label: 'browser canonical execution snapshot' });

  const page = {
    ...dom,
    context,
    acknowledgeBodies,
    execution: () => context.__sidelineCoach.execution(),
    attempt: () => context.__sidelineCoach.dispatchAttempt(),
    rows: () => dom.$('roster').children.filter((child) => child.className === 'player'),
    row: (id) => page.rows().find((row) => row.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((child) => child.className === 'play-strip') || null,
    stripText: (id) => dom.allText(page.strip(id)),
    quietText: (id) => dom.find(page.row(id), (node) => node.className === 'player-quiet')?.textContent || '',
    ackText: () => dom.allText(dom.$('outgoingAck')),
    click: async (node) => { for (const listener of node?.listeners?.click || []) await listener({ stopPropagation() {} }); },
    selectPlayer: async (id) => {
      await page.click(dom.$('modeManualBtn'));
      dom.$('terminalSelect').value = id;
      for (const listener of dom.$('terminalSelect').listeners.change || []) await listener({ target: { value: id } });
    },
    dispatch: async (id, prompt) => {
      await page.selectPlayer(id);
      dom.$('promptInput').value = prompt;
      for (const listener of dom.$('promptInput').listeners.input || []) listener();
      await page.click(dom.$('dispatchBtn'));
      return page.attempt();
    },
    pauseExecution: () => { pauseExecution = true; },
    flushExecution: () => { pauseExecution = false; for (const data of heldExecution.splice(0)) source.deliver('execution', data); },
    deliverExecution: (payload) => source.deliver('execution', JSON.stringify(payload)),
    close: () => { abort.abort(); for (const interval of intervals) clearInterval(interval); }
  };
  return page;
}

async function createRig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-q210f2-f-'));
  const port = 39800 + Math.floor(Math.random() * 400);
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60_000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const stadiumId = getDurableStadiumId(dir);
  const turnState = new Map();
  const active = new Set();
  const turns = new Map();
  let reports = [];
  let client;
  const players = [
    [AG, 'antigravity', 'AntiGravity', snapshot('agy')],
    [CX, 'codex', 'Codex', snapshot('codex')]
  ];
  const roster = {
    resolve: (id) => ({ state: 'live', transport: 'controlled', instance: { instanceId: id, playerType: id.split('-')[0], onField: true } }),
    status: async () => players.map(([id, type, name]) => ({
      id: type, name, availability: 'available', fieldState: 'on-field',
      instances: [{ instanceId: id, playerType: type, seat: 1, fieldLabel: `${name} · Controlled`, onField: true, ownership: 'coach-managed', controlMode: 'controlled', transport: 'Controlled', controlState: 'ready', turnState: turnState.get(id) ?? { instanceId: id, state: 'idle', summary: 'Ready', at: 0 } }]
    })),
    getRoutingCapabilities: () => players.map(([id, type, name, capability]) => {
      const turn = turnState.get(id);
      const isActive = turn?.state === 'accepted' || turn?.state === 'started' || active.has(id);
      return {
        instanceId: id, playerType: type, transport: 'controlled', transportLabel: 'Controlled', fieldLabel: name,
        state: isActive ? 'busy' : 'ready', capability,
        ...(turn?.turnRef && (turn.state === 'accepted' || turn.state === 'started')
          ? { activeTurn: { turnRef: turn.turnRef, state: turn.state, startedAt: turn.at } }
          : {})
      };
    }),
    getLastDiscovery: () => undefined
  };
  const emitTurn = (instanceId, state, turnRef, summary = state) => {
    const event = { instanceId, state, turnRef, summary, at: Date.now() };
    turnState.set(instanceId, event);
    client.sendTurnChanged(event);
    client.sendCapabilitySnapshot();
    void client.sendRosterChanged();
  };
  let sequence = 0;
  const host = {
    deliver: async (instanceId) => {
      const turnRef = `turn-f-${++sequence}`;
      turns.set(instanceId, turnRef);
      active.add(instanceId);
      emitTurn(instanceId, 'accepted', turnRef, 'Play received');
      emitTurn(instanceId, 'started', turnRef, 'Working');
      return { kind: 'accepted', turnRef };
    }
  };
  client = new StadiumClient({
    port, dir, instanceId: `inst_${stadiumId}_${GAME}`,
    gameContextGetter: () => ({
      game: { gameId: GAME, displayName: 'F Acceptance', fingerprintSource: 'git-remote', repoUri: 'https://example.com/f.git' },
      stadium: { stadiumId, name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: GAME, stadiumId, rootFsPath: 'C:\\Games\\F', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    playerRoster: roster, playerControlHost: host, reportsGetter: async () => reports,
    resolveControlPlane: async () => ({ port })
  });
  assert.equal(await client.connect(), true);
  await client.sendRosterChanged();
  client.sendCapabilitySnapshot();
  await fetch(`http://127.0.0.1:${port}/api/game/select`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: GAME })
  });
  await wait(100);
  return {
    dir, port, token, daemon, client, turnState, turns,
    finish(instanceId, state = 'completed') { active.delete(instanceId); emitTurn(instanceId, state, turns.get(instanceId), state === 'completed' ? 'Done' : 'Stopped'); },
    async seedTerminal(instanceId, clientRef, outcome) {
      const turnRef = `turn-${clientRef}`;
      daemon.ledgerInstance.recordDispatch({ gameId: GAME, playerInstanceId: instanceId, playerType: instanceId.split('-')[0], clientRef, promptSummary: 'Acceptance failure proof', at: Date.now() - 2_000 });
      active.add(instanceId);
      emitTurn(instanceId, 'started', turnRef);
      active.delete(instanceId);
      emitTurn(instanceId, outcome, turnRef, 'Provider stopped before finishing.');
      await until(() => daemon.ledgerInstance.get(GAME, instanceId)?.recentPlays.some((play) => play.turnRef === turnRef), { label: `${outcome} turn at daemon` });
      daemon.ledgerInstance.recordDelivery(clientRef, 'received', { turnRef });
    },
    async publishReport(instanceId, clientRef, content = '# Acceptance report\n\nDone.') {
      const item = {
        agent: PLAYER_NAMES[instanceId], filename: `${clientRef}.md`, path: `REPORTS/${instanceId}/${clientRef}.md`,
        mtime: Date.now(), project: 'F Acceptance', content,
        provenance: { gameId: GAME, clientRef, playerInstanceId: instanceId, playerType: instanceId.split('-')[0], executionProvider: instanceId.split('-')[0], model: 'provider-default', timestamp: Date.now() }
      };
      reports = [...reports, item];
      client.sendReportChanged(reports);
      return item;
    },
    async close() { client.dispose(); await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

test('F-1. promoted real lifecycle: dispatch → two Working Players → transient report bridge → Incoming → canonical acknowledgement', async () => {
  const rig = await createRig();
  const page = await createLivePage(rig);
  try {
    const first = await page.dispatch(AG, 'Produce the acceptance report');
    assert.deepEqual({ phase: first.phase, delivery: first.delivery, instanceId: first.playerInstanceId, playerName: first.playerName },
      { phase: 'sent', delivery: 'received', instanceId: AG, playerName: 'AntiGravity' });
    // Q2.10F.8: the confirmed send is now communicated via the in-place dispatch bridge
    // (dispatchBtn itself), not the (now quiet) Outgoing panel.
    assert.equal(page.$('dispatchBtn').textContent, 'View AntiGravity ↑');
    assert.doesNotMatch(page.$('dispatchBtn').textContent, /Completed|Received|Working/);
    await until(() => page.execution().views[AG]?.state === 'working' && /◉ Working/.test(page.stripText(AG)), { label: 'AntiGravity Working strip' });
    const agOrigin = page.execution().views[AG].executionStartedAt;
    assert.ok(Number.isFinite(agOrigin));
    assert.equal(page.find(page.strip(AG), (node) => node.dataset?.elapsedSince !== undefined)?.dataset.elapsedSince, String(agOrigin));
    assert.equal(page.scrollCalls.length, 0, 'dispatch and Working never move the viewport');

    await page.click(page.$('rosterToggle'));
    assert.equal(page.$('roster').hidden, true, 'TEAM may remain collapsed while execution changes');
    rig.client.sendCapabilitySnapshot();
    await rig.client.sendRosterChanged();
    await wait(30);
    assert.equal(page.$('roster').hidden, true, 'refresh traffic never expands TEAM');
    assert.equal(page.scrollCalls.length, 0, 'refresh traffic never moves the viewport');

    // Q2.10F.8: View is tapped via the in-place dispatchBtn bridge, not the Outgoing panel.
    await page.click(page.$('dispatchBtn'));
    assert.equal(page.$('roster').hidden, false, 'explicit View expands TEAM');
    assert.equal(page.scrollCalls.at(-1).id, AG, 'only explicit View reaches the exact Player');
    assert.equal(page.row(AG).classList.contains('player-reveal'), true);

    const second = await page.dispatch(CX, 'Run the independent verification');
    assert.equal(second.playerInstanceId, CX);
    assert.equal(page.$('dispatchBtn').textContent, 'View Codex ↑');
    await until(() => page.execution().views[CX]?.state === 'working' && page.$('rosterSummary').textContent === 'TEAM · 2 ACTIVE', { label: 'two concurrent Players' });
    assert.equal(page.execution().views[AG].executionStartedAt, agOrigin, 'second dispatch cannot reset the first Player clock');

    const reconnected = await createLivePage(rig);
    assert.equal(reconnected.execution().epoch, page.execution().epoch);
    assert.equal(reconnected.execution().views[AG].executionStartedAt, agOrigin, 'reconnect preserves the canonical clock origin');
    assert.equal(reconnected.execution().views[CX].state, 'working');
    reconnected.close();

    rig.finish(AG);
    await until(() => page.execution().views[AG]?.state === 'finished', { label: 'AntiGravity Finished' });
    const report = await rig.publishReport(AG, first.clientRef);
    await until(() => page.execution().views[AG]?.report?.path === report.path && page.$('reportFilename').textContent === report.filename, { label: 'linked report in Incoming' });
    assert.equal(page.$('rosterSummary').textContent, 'TEAM · 1 ACTIVE · Codex');
    assert.match(page.stripText(AG), /✓ Finished.*View Report/, 'finished Player gets one bounded handoff to durable Incoming');
    assert.match(page.stripText(CX), /◉ Working/);
    const cxOrigin = page.execution().views[CX].executionStartedAt;

    page.pauseExecution();
    const revisionBeforeAck = rig.daemon.ledgerInstance.get(GAME, AG).revision;
    const viewReport = page.find(page.strip(AG), (node) => node.textContent === 'View Report');
    await page.click(viewReport);
    await until(() => rig.daemon.ledgerInstance.get(GAME, AG).reports[0]?.acknowledgedAt, { label: 'server acknowledgement' });
    assert.ok(rig.daemon.ledgerInstance.get(GAME, AG).revision > revisionBeforeAck);
    assert.match(page.stripText(AG), /View Report/, 'no optimistic hiding before canonical acknowledgement reaches the browser');
    assert.equal(page.$('reportPreviewBody').textContent, '# Acceptance report\n\nDone.');
    assert.deepEqual(page.acknowledgeBodies.at(-1), { gameId: GAME, reportPath: report.path, instanceId: AG, playRef: first.clientRef });

    page.flushExecution();
    await until(() => page.execution().views[AG]?.state === 'idle', { label: 'acknowledged quiet state' });
    assert.equal(page.strip(AG), null, 'canonical acknowledgement retires the transient bridge');
    assert.doesNotMatch(page.$('rosterSummary').textContent, /REPORT READY/);
    assert.equal(page.execution().views[CX].state, 'working');
    assert.equal(page.execution().views[CX].executionStartedAt, cxOrigin, 'acknowledging one report never touches the other Player');
    assert.equal(page.find(page.strip(CX), (node) => node.dataset?.elapsedSince !== undefined)?.dataset.elapsedSince, String(cxOrigin));
    const acknowledged = page.execution().views[AG];
    page.deliverExecution({
      gameId: GAME,
      epoch: page.execution().epoch,
      serverNow: Date.now(),
      views: [{ ...acknowledged, state: 'finished', revision: acknowledged.revision - 1, report: { path: report.path, acknowledged: false } }]
    });
    assert.equal(page.execution().views[AG].state, 'idle', 'stale pre-ack projection cannot resurrect Report Ready');
    page.deliverExecution({ gameId: OTHER_GAME, epoch: page.execution().epoch, serverNow: Date.now(), views: [{ ...page.execution().views[CX], state: 'finished', revision: 99_999 }] });
    assert.equal(page.execution().views[CX].state, 'working', 'another Game cannot mutate the selected Game execution store');
    rig.finish(CX);
  } finally {
    page.close();
    await rig.close();
  }
});

test('F-2. historical terminal truth is quiet in Dad mode and exact acknowledgement remains server-authoritative', async () => {
  const rig = await createRig();
  const page = await createLivePage(rig);
  try {
    await rig.seedTerminal(AG, 'failed-play', 'failed');
    assert.equal(rig.daemon.ledgerInstance.get(GAME, AG)?.recentPlays[0]?.outcome, 'failed', 'real daemon records the terminal failure');
    await until(() => page.execution().views[AG]?.state === 'couldnt-finish', { label: 'canonical failure truth' });
    assert.equal(page.strip(AG), null, 'historical failure does not impersonate current Player health');
    assert.equal(page.$('rosterSummary').textContent, 'TEAM');
    const revision = rig.daemon.ledgerInstance.get(GAME, AG).revision;

    const wrong = await fetch(`http://127.0.0.1:${rig.port}/api/work/acknowledge`, {
      method: 'POST', headers: { Authorization: `Bearer ${rig.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: GAME, instanceId: CX, playRef: 'failed-play' })
    });
    assert.equal(wrong.status, 404);
    assert.equal(rig.daemon.ledgerInstance.get(GAME, AG).recentPlays[0].acknowledgedAt, undefined);

    page.pauseExecution();
    const exact = await fetch(`http://127.0.0.1:${rig.port}/api/work/acknowledge`, {
      method: 'POST', headers: { Authorization: `Bearer ${rig.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: GAME, instanceId: AG, playRef: 'failed-play' })
    });
    assert.equal(exact.status, 200);
    await until(() => rig.daemon.ledgerInstance.get(GAME, AG).recentPlays[0].acknowledgedAt, { label: 'failed Play acknowledgement' });
    assert.equal(page.strip(AG), null);
    assert.ok(rig.daemon.ledgerInstance.get(GAME, AG).revision > revision);
    page.flushExecution();
    await until(() => page.execution().views[AG]?.state === 'idle', { label: 'dismissed failure becomes quiet' });
    assert.equal(page.strip(AG), null);

    await rig.seedTerminal(CX, 'unknown-play', 'unknown');
    await until(() => page.execution().views[CX]?.state === 'unknown', { label: 'canonical Unknown truth' });
    assert.equal(page.strip(CX), null);
    assert.equal(page.execution().views[CX].state, 'unknown');
    assert.equal(page.$('rosterSummary').textContent, 'TEAM');
  } finally {
    page.close();
    await rig.close();
  }
});

test('F-3. final page timer/navigation topology remains singular and mobile-flow safe', () => {
  const oneSecondIntervals = [...pageSource.matchAll(/setInterval\s*\([^;]+?1_000\s*\)/gs)];
  assert.equal(oneSecondIntervals.length, 1, 'one production one-second interval only');
  assert.equal([...pageSource.matchAll(/\.dataset\.elapsedSince\s*=/g)].length, 1, 'one ticking elapsed-display producer only');
  assert.match(pageSource, /setInterval\(tickElapsedClocks, 1_000\)/);
  assert.doesNotMatch(pageSource, /id=["']activePlayStatus["']|function\s+renderTransitionalActiveStatus/);
  assert.equal([...pageSource.matchAll(/\.scrollIntoView\?\.\(/g)].length, 2, 'only View Player and View Report may scroll');
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  const lifecycleRules = css.split('}').filter((rule) => /play-strip|outgoing-ack|player-quiet/.test(rule)).join('}');
  assert.doesNotMatch(lifecycleRules, /position:\s*(fixed|sticky|absolute)/);
  assert.match(css, /@media\s*\(max-width:\s*460px\)/);
});
