// Q2.10F.2 Slice D — Outgoing Handoff + View Player.
//
// The real src/public/index.html script runs against a DOM stub rich enough to prove
// the frozen contract: parent/child + remove/contains/closest (roster rebuilds), focus/blur,
// scrollIntoView (recorded, never invoked automatically), matchMedia (reduced motion), and a
// real document-level visibilitychange dispatch (leaving Outgoing). Truth enters ONLY through
// Slice B's real dispatch reply normalizer and execution store; Slice C's real strips/TEAM
// header render alongside so multi-Play and roster-rebuild scenarios are provably real.
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

const GAME = 'game_git_trend';
const AG = 'antigravity-aaaa1111';
const CL1 = 'claude-cccc1111';
const CX = 'codex-bbbb2222';
const ORDER = [AG, CL1, CX];
const T0 = 1_800_000_000_000;
// Mirrors src/public/index.html's DISPATCH_BRIDGE_MS (Q2.10F.8 post-dispatch bridge).
const DISPATCH_BRIDGE_MS = 12_000;

const snap = { provider: 'x', authenticated: true, observedAt: T0, freshness: 'live', defaultModelId: 'm', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: [] }] };
const typeOf = (id) => id.split('-')[0];
const cap = (instanceId) => ({ instanceId, playerType: typeOf(instanceId), transport: 'controlled', transportLabel: 'Controlled', fieldLabel: instanceId, state: 'ready', capability: snap });
const view = (instanceId, state, revision, extra = {}) => ({ instanceId, state, revision, executionType: 'reasoning', ...extra });
const idle = () => ORDER.map((id) => view(id, 'idle', 0));
const withViews = (...changed) => idle().map((v) => changed.find((c) => c.instanceId === v.instanceId) || v);
const names = { [AG]: 'AntiGravity', [CL1]: 'Claude 1', [CX]: 'Codex' };

const autoDecision = (instanceId, action = 'dispatch') => ({
  mode: 'auto', action, gameId: GAME, playerInstanceId: instanceId, playerName: names[instanceId],
  playerLabel: names[instanceId], provider: typeOf(instanceId), modelDisplayName: 'Provider Default',
  transport: 'controlled', reason: 'Free and able to run this Play now.', stagedAt: T0
});

function daemonStatus({ epoch = 'E1', serverNow = T0, views = idle(), execution = true, mode = 'auto', activeDecision = null } = {}) {
  const inst = (instanceId, seat, fieldLabel) => ({ instanceId, playerType: typeOf(instanceId), seat, fieldLabel, onField: true, ownership: 'coach-managed', transport: 'Controlled', controlMode: 'controlled' });
  const caps = [AG, CL1, CX].map(cap);
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Trend' },
    games: [{ gameId: GAME, displayName: 'Trend', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true,
    players: [
      { id: 'antigravity', name: 'AntiGravity', instances: [inst(AG, 1, 'AntiGravity · Controlled')] },
      { id: 'claude', name: 'Claude', instances: [inst(CL1, 1, 'Claude 1 · Controlled')] },
      { id: 'codex', name: 'Codex', instances: [inst(CX, 1, 'Codex · Controlled')] }
    ],
    capabilities: caps,
    queue: [],
    routing: { mode, capabilities: caps, activeDecision },
    routingMode: mode, reports: [], playerDiscovery: null, preferences: { runningPlayers: 'ask' }, at: serverNow
  };
  if (execution) status.execution = { gameId: GAME, epoch, serverNow, byInstance: Object.fromEntries(views.map((v) => [v.instanceId, v])) };
  return status;
}

/** Daemon DispatchResult shapes (router.ts), matching Slice B's fixtures exactly. */
const received = (instanceId, name, clientRef = 'ref_1') => ({ status: 200, body: { success: true, statusCode: 200, clientRef, turnRef: `turn-${clientRef}`, status: 'received', playerInstanceId: instanceId, playerName: name, message: 'Dispatch accepted by Stadium provider.' } });
const queuedReply = (instanceId, name, clientRef = 'ref_q') => ({ status: 202, body: { success: true, statusCode: 202, status: 'queued', queueItemId: 'queue_1', queuePosition: 1, clientRef, playerInstanceId: instanceId, playerName: name, message: `Queued for ${name}.` } });
const unknownReply = (instanceId, name, clientRef = 'ref_u') => ({ status: 504, body: { success: false, statusCode: 504, clientRef, status: 'unknown', playerInstanceId: instanceId, playerName: name, message: 'Dispatch timed out waiting for Stadium ingress confirmation.' } });
const failedReply = (message = 'Roster is still synchronizing with the Stadium.') => ({ status: 409, body: { success: false, statusCode: 409, message } });

function createPage(initialStatus) {
  const elements = new Map();
  const scrollCalls = [];
  const doc = { activeElement: null, visibilityState: 'visible', _listeners: {} };
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
      closest(selector) {
        if (selector !== '.player[data-instance-id]') throw new Error(`stub closest does not support ${selector}`);
        for (let n = this; n; n = n.parentNode) if (n.className === 'player' && n.dataset.instanceId) return n;
        return null;
      },
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = null; },
      scrollIntoView(opts) { scrollCalls.push({ id: this.dataset.instanceId || this.id, opts }); }
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
  let now = T0;
  let reducedMotion = false;
  const intervals = [];
  const timeouts = [];
  let status = initialStatus;
  const posts = [];
  let onDispatch = async () => received(AG, 'AntiGravity');
  Object.assign(doc, {
    getElementById: $, createElement: (tag) => makeNode('', tag), body: makeNode('body'),
    querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []),
    addEventListener(e, fn) { (this._listeners[e] = this._listeners[e] || []).push(fn); },
    removeEventListener() {}
  });
  const ctx = {
    document: doc, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: (query) => ({ matches: /reduced-motion:\s*reduce/.test(query) ? reducedMotion : false }),
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, []);
      posts.push({ url, body });
      if (url === '/api/dispatch') { const r = await onDispatch(body); return reply(r.status, r.body); }
      if (url === '/api/route/preview') return reply(200, { success: true, decision: status.routing?.activeDecision });
      return reply(200, {});
    },
    setTimeout: (fn, ms) => { const id = timeouts.length; timeouts.push({ fn, ms, fired: false, id }); return id; },
    clearTimeout: (id) => { const t = timeouts.find((x) => x.id === id); if (t) t.fired = true; },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: () => {},
    Date: class extends Date { static now() { return now; } },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  const allText = (node) => [node.textContent, ...node.children.map(allText)].filter(Boolean).join(' ');
  const walk = (node, fn) => { fn(node); for (const c of node.children) walk(c, fn); };
  const find = (root, pred) => { let hit = null; walk(root, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
  const page = {
    $, doc, allText, find, scrollCalls,
    store: () => ctx.__sidelineCoach.execution(),
    attempt: () => ctx.__sidelineCoach.dispatchAttempt(),
    outgoing: () => ctx.__sidelineCoach.outgoingAck(),
    ack: () => page.$('outgoingAck'),
    ackText: () => allText(page.$('outgoingAck')),
    rows: () => $('roster').children.filter((c) => c.className === 'player'),
    row: (id) => page.rows().find((r) => r.dataset.instanceId === id),
    strip: (id) => page.row(id)?.children.find((c) => c.className === 'play-strip') || null,
    setStatus: (next) => { status = next; },
    setNow: (value) => { now = value; },
    setReducedMotion: (value) => { reducedMotion = value; },
    tick: () => { for (const i of intervals.filter((x) => x.ms === 1_000)) i.fn(); },
    fireTimeouts: (upToMs) => {
      // Fire due one-shot timeouts (Outgoing's 8 s decay, the 1.5 s highlight expiry) in order.
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const t of timeouts) {
          if (!t.fired && t.ms <= upToMs) { t.fired = true; t.fn(); progressed = true; }
        }
      }
    },
    onDispatch: (fn) => { onDispatch = fn; },
    emit: (viewsArg, serverNow = T0, epoch = 'E1') => source.emit('execution', { gameId: GAME, epoch, serverNow, views: viewsArg }),
    refresh: async (next) => { if (next) status = next; source.emit('status', { type: 'registry-change' }); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); },
    typeInPrompt: (text) => { $('promptInput').value = text; for (const fn of $('promptInput').listeners.input || []) fn(); },
    leaveOutgoing: () => { doc.visibilityState = 'hidden'; for (const fn of doc._listeners.visibilitychange || []) fn(); },
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

const startPage = (status) => createPage(status).start();
const dispatchAndWait = async (page, prompt = 'Fix the Play Clock bug') => {
  // Q2.10F.8: a real keystroke (not a bare .value set) so any active in-place View
  // bridge correctly ends via the same material-edit path a human typing would take,
  // before this same dispatchBtn click is interpreted as a fresh dispatch.
  page.typeInPrompt(prompt);
  await page.click(page.$('dispatchBtn'));
};

// ---------------------------------------------------------------------------

test('D-1 (Q2.10F.8). Confirmed AUTO handoff: the SAME dispatchBtn slot becomes View <exact Player> in-place, no timer, no duplicate CTA below', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  // Q2.10F.8: the bridge is active immediately, so the large Outgoing panel stays quiet —
  // one obvious next action (the dispatchBtn slot itself), not a duplicate CTA underneath.
  assert.equal(page.ack().hidden, true, 'no duplicate lower View CTA while the bridge is active');
  const btn = page.$('dispatchBtn');
  assert.equal(btn.textContent, 'View Claude 1 ↑');
  assert.equal(btn.attributes['aria-label'], 'View Claude 1');
  assert.equal(btn.disabled, false, 'the next action is immediately tappable');
  assert.equal(page.$('toast').textContent, '', 'daemon plumbing message is not duplicated as a toast');
});

test('D-2 / D-3 (Q2.10F.8). The bridge label stays "View <Player>" regardless of Starting → Working execution truth; the exact match rule is unaffected', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  // A stale/other view.playRef on the SAME Player must not claim Working for THIS Play —
  // the Player's own strip (not Outgoing/the bridge) is where execution truth lives.
  page.emit([view(CL1, 'working', 2, { playRef: 'ref_other', executionStartedAt: T0 - 5_000 })]);
  assert.equal(page.$('dispatchBtn').textContent, 'View Claude 1 ↑');
  page.emit([view(CL1, 'working', 3, { playRef: 'ref_1', executionStartedAt: T0 - 2_000 })]);
  assert.equal(page.$('dispatchBtn').textContent, 'View Claude 1 ↑', 'the bridge CTA does not re-narrate execution state');
  assert.match(page.allText(page.strip(CL1)), /◉ Working/, 'execution truth lives on the Player strip, not the bridge');
});

test('D-4 (Q2.10F.8). Manual handoff: the bridge targets the exact Player identity returned by the daemon', async () => {
  const page = await startPage(daemonStatus({ mode: 'manual' }));
  await page.click(page.$('modeManualBtn'));
  page.$('terminalSelect').value = AG;
  for (const fn of page.$('terminalSelect').listeners.change || []) fn({ target: { value: AG } });
  page.$('promptInput').value = 'Manual Play';
  page.onDispatch(async () => received(AG, 'AntiGravity', 'ref_m'));
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.attempt().mode, 'manual');
  const btn = page.$('dispatchBtn');
  assert.equal(btn.textContent, 'View AntiGravity ↑');
  assert.equal(btn.attributes['aria-label'], 'View AntiGravity');
  assert.equal(page.$('toast').textContent, '', 'MANUAL uses the same local-only success feedback policy');
});

test('D-5 (Q2.10F.8). Queued: the bridge still offers View (a queued Play still names its exact target); Outgoing stays quiet underneath', async () => {
  const page = await startPage(daemonStatus({ activeDecision: { ...autoDecision(CX), action: 'queue' } }));
  page.onDispatch(async () => queuedReply(CX, 'Codex'));
  await dispatchAndWait(page);
  assert.equal(page.$('dispatchBtn').textContent, 'View Codex ↑');
  assert.equal(page.ack().hidden, true);
});

test('D-6. Failed: prompt remains, Couldn\'t Send UI, no Player navigation', async () => {
  const page = await startPage(daemonStatus());
  page.onDispatch(async () => failedReply('Roster is still synchronizing with the Stadium.'));
  await dispatchAndWait(page, 'Important drafted Play');
  assert.match(page.ackText(), /✕ Couldn't send this Play/);
  assert.match(page.ackText(), /Your Play is still here\./);
  assert.doesNotMatch(page.ackText(), /plumbing|stack|exception|ERR_/i);
  assert.equal(page.$('promptInput').value, 'Important drafted Play');
  assert.equal(page.find(page.ack(), (n) => n.textContent === 'Try Again') !== null, true);
  assert.equal(page.find(page.ack(), (n) => /View/.test(n.textContent || '')), null, 'no target exists to navigate to');
  assert.equal(page.scrollCalls.length, 0);
  // Q2.10F.8: a failed dispatch never offers the in-place View bridge either.
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play');
});

test('D-7. Unknown: never claims Sent, never restores the prompt, never auto-resends', async () => {
  const page = await startPage(daemonStatus());
  page.onDispatch(async () => unknownReply(AG, 'AntiGravity'));
  await dispatchAndWait(page, 'Migrate the schema');
  assert.match(page.ackText(), /\? Can't confirm AntiGravity received this Play/);
  assert.match(page.ackText(), /Check the Game before sending it again\./);
  assert.doesNotMatch(page.ackText(), /✓ Play sent/);
  assert.equal(page.$('promptInput').value, '', 'cleared from the box (may already be running)');
  const viewBtn = page.find(page.ack(), (n) => n.className === 'secondary outgoing-ack-view');
  assert.ok(viewBtn, 'exact target identity exists, so View is offered');
  page.emit([view(AG, 'unknown', 2, { playRef: 'ref_u' })]);
  assert.equal(page.$('promptInput').value, '', 'canonical Unknown never restores it');
});

test('D-8 (Q2.10F.8). The bridge (~12s) outlasts Outgoing\'s own 8s decay: dispatchBtn keeps showing View while Outgoing stays quiet, then both revert/resume once the bridge itself ends', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  page.setNow(T0 + 8_000);
  page.fireTimeouts(8_000);
  assert.equal(page.$('dispatchBtn').textContent, 'View Claude 1 ↑', 'the bridge is still active at 8s');
  assert.equal(page.ack().hidden, true, 'still no duplicate CTA underneath');
  page.setNow(T0 + DISPATCH_BRIDGE_MS);
  page.fireTimeouts(DISPATCH_BRIDGE_MS);
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play', 'the bridge ends and the primary slot returns to normal');
  assert.equal(page.ack().hidden, false, 'Outgoing resumes, already past its own 8s decay');
  assert.equal(page.ackText().trim(), '✓ Sent to Claude 1 · View');
});

test('D-9 (Q2.10F.8). Editing the next Play ends the bridge immediately — the primary slot never shows a stale View for a Play the human has moved past', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  assert.equal(page.$('dispatchBtn').textContent, 'View Claude 1 ↑');
  page.typeInPrompt('A brand new Play');
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play', 'material composition ends the bridge');
});

test('D-9b (Q2.10F.8). Leaving Outgoing (tab hidden) ends the bridge too; the store and TEAM are unaffected', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  page.emit([view(CL1, 'working', 2, { playRef: 'ref_1', executionStartedAt: T0 })]);
  page.leaveOutgoing();
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play', 'leaving Outgoing ends the bridge');
  assert.equal(page.ack().hidden, true);
  assert.equal(page.store().views[CL1].state, 'working', 'execution truth is untouched');
  assert.match(page.$('rosterSummary').textContent, /TEAM · 1 ACTIVE/, 'TEAM is untouched');
  assert.match(page.allText(page.strip(CL1)), /◉ Working/, 'the Player strip is untouched');
});

test('D-10 (Q2.10F.8). A new dispatch replaces the previous bridge immediately: only the latest target is offered', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(AG) }));
  page.onDispatch(async () => received(AG, 'AntiGravity', 'ref_1'));
  await dispatchAndWait(page, 'First Play');
  assert.equal(page.$('dispatchBtn').textContent, 'View AntiGravity ↑');
  page.onDispatch(async () => received(CX, 'Codex', 'ref_2'));
  await dispatchAndWait(page, 'Second Play');
  assert.equal(page.$('dispatchBtn').textContent, 'View Codex ↑');
});

test('D-11 (Q2.10F.8). Tapping the in-place View CTA navigates and ends the bridge per the frozen lifecycle', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.$('dispatchBtn').textContent, 'Dispatch Play', 'the bridge ends once viewed');
  assert.equal(page.ack().hidden, true);
  assert.ok(page.scrollCalls.some((c) => c.id === CL1));
});

test('D-12 (Q2.10F.8). Explicit View (via the in-place bridge) expands a collapsed TEAM', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  await page.click(page.$('rosterToggle'));
  assert.equal(page.$('rosterToggle').attributes['aria-expanded'], 'false');
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.$('rosterToggle').attributes['aria-expanded'], 'true', 'View explicitly expands TEAM');
  assert.equal(page.$('roster').hidden, false);
});

test('D-13 (Q2.10F.8). View (via the bridge) targets the exact returned Player, never another active one', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(AG, 'working', 3, { executionStartedAt: T0 - 60_000 })), activeDecision: autoDecision(CX) }));
  page.onDispatch(async () => received(CX, 'Codex', 'ref_cx'));
  await dispatchAndWait(page);
  await page.click(page.$('dispatchBtn'));
  assert.deepEqual(page.scrollCalls.map((c) => c.id), [CX], 'never AntiGravity, even though it is also active');
});

test('D-14 (Q2.10F.8). Reduced motion scrolls immediately; normal motion scrolls smoothly, via the in-place bridge', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  page.setReducedMotion(true);
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.scrollCalls.at(-1).opts.behavior, 'auto');

  page.onDispatch(async () => received(AG, 'AntiGravity', 'ref_2'));
  await dispatchAndWait(page, 'Second');
  page.setReducedMotion(false);
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.scrollCalls.at(-1).opts.behavior, 'smooth');
});

test('D-15 (Q2.10F.8). Highlight: the exact Player gets player-reveal, expires at ~1.5 s, survives an intervening rebuild', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  await page.click(page.$('dispatchBtn'));
  assert.ok(page.row(CL1).classList.contains('player-reveal'));

  // A roster rebuild mid-window must re-apply the highlight to the new row.
  page.setNow(T0 + 500);
  await page.refresh();
  assert.ok(page.row(CL1).classList.contains('player-reveal'), 'highlight survives rerender via highlightUntilByInstance');

  page.setNow(T0 + 1_600);
  page.fireTimeouts(1_600);
  assert.equal(page.row(CL1).classList.contains('player-reveal'), false, 'expires after ~1.5 s');
});

test('D-16 (Q2.10F.8). Focus: the strip (or fallback) receives focus after View, with no second scroll', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  page.emit([view(CL1, 'working', 2, { playRef: 'ref_1', executionStartedAt: T0 })]);
  const scrollsBefore = page.scrollCalls.length;
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.doc.activeElement, page.strip(CL1), 'focuses the rendered strip');
  assert.equal(page.doc.activeElement.attributes['tabindex'], '-1');
  assert.equal(page.scrollCalls.length, scrollsBefore + 1, 'exactly one scroll from View, no second jump from focusing');
});

test('D-16b (Q2.10F.8). Focus falls back to the Player name when idle (no strip rendered)', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  // No matching canonical view has arrived: idle, no strip.
  assert.equal(page.strip(CL1), null);
  await page.click(page.$('dispatchBtn'));
  assert.equal(page.doc.activeElement?.dataset.focusKey, 'name');
  assert.ok(page.row(CL1).contains(page.doc.activeElement));
});

test('D-17 (Q2.10F.8). Missing Player: a graceful local message, no exception, no crash', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  // The Player left the roster (empty players) before View is tapped.
  page.setStatus(daemonStatus({ views: [] }));
  page.setStatus({ ...daemonStatus({ views: [] }), players: [] });
  await page.refresh();
  await assert.doesNotReject(page.click(page.$('dispatchBtn')));
  assert.match(page.$('toast').textContent, /left the Team/);
});

test('D-18. No auto-scroll: dispatch, an execution event, Working, Finished, and a report event never call scrollIntoView', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  assert.equal(page.scrollCalls.length, 0, 'dispatch itself never scrolls');
  page.emit([view(CL1, 'working', 2, { playRef: 'ref_1', executionStartedAt: T0 })]);
  assert.equal(page.scrollCalls.length, 0, 'Working never scrolls');
  page.emit([view(CL1, 'finished', 3, { playRef: 'ref_1', finishedAt: T0, durationMs: 5_000, report: { path: 'r.md', acknowledged: false } })]);
  assert.equal(page.scrollCalls.length, 0, 'Finished / report arriving never scrolls');
  page.tick();
  assert.equal(page.scrollCalls.length, 0, 'the ticker never scrolls');
});

test('D-19 (Q2.10F.8). Multi-Play: Claude already Working; a second AUTO Play to Codex targets Codex via the bridge, Claude untouched', async () => {
  const page = await startPage(daemonStatus({ views: withViews(view(CL1, 'working', 4, { executionStartedAt: T0 - 90_000, summary: 'Refactor the parser' })), activeDecision: autoDecision(CX) }));
  const claudeStripBefore = page.strip(CL1);
  assert.match(page.allText(claudeStripBefore), /◉ Working/);
  page.onDispatch(async () => received(CX, 'Codex', 'ref_cx'));
  await dispatchAndWait(page, 'Second, independent Play');
  const btn = page.$('dispatchBtn');
  assert.equal(btn.textContent, 'View Codex ↑');
  assert.equal(btn.attributes['aria-label'], 'View Codex');
  await page.click(btn);
  assert.deepEqual(page.scrollCalls.map((c) => c.id), [CX]);
  assert.match(page.allText(page.strip(CL1)), /◉ Working/, 'Claude 1 unaffected by the second dispatch');

  // The daemon's own execution truth (not Outgoing) is what makes TEAM's count go to 2 —
  // and Claude's independent strip and clock stay exactly as they were.
  page.emit([view(CL1, 'working', 4, { playRef: view(CL1, 'working', 4).playRef, executionStartedAt: T0 - 90_000 }), view(CX, 'starting', 2, { playRef: 'ref_cx' })]);
  assert.match(page.$('rosterSummary').textContent, /TEAM · 2 ACTIVE/);
  assert.match(page.allText(page.strip(CL1)), /◉ Working/);
});

test('D-20. #activePlayStatus / renderTransitionalActiveStatus are gone; no duplicate ticking path', async () => {
  assert.doesNotMatch(pageSource, /id="activePlayStatus"/);
  assert.doesNotMatch(pageSource, /const renderTransitionalActiveStatus/);
  assert.doesNotMatch(pageSource, /class="active-play-status"/);
  // Only one production call site touches the ticking interval, and it is the strip clock.
  assert.match(pageSource, /setInterval\(tickElapsedClocks, 1_000\);/);
});

test('D-21 / D-22. Exactly one 1 s interval, updating only Player strip elapsed nodes — none in TEAM, Outgoing, or Dispatch', async () => {
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  page.emit([view(CL1, 'working', 2, { playRef: 'ref_1', executionStartedAt: T0 - 5_000 })]);
  assert.match(pageSource, /setInterval\(tickElapsedClocks, 1_000\)/, 'exactly one production interval calls the ticker, nothing else');
  const headerBefore = page.$('rosterSummary').textContent;
  const ackBefore = page.ackText();
  const btnBefore = page.$('dispatchBtn').textContent;
  page.setNow(T0 + 3_000);
  page.tick();
  assert.match(page.allText(page.strip(CL1)), /0:08/, 'the strip clock ticks');
  assert.equal(page.$('rosterSummary').textContent, headerBefore, 'TEAM header untouched by the ticker');
  assert.equal(page.ackText(), ackBefore, 'Outgoing untouched by the ticker');
  assert.equal(page.$('dispatchBtn').textContent, btnBefore, 'Dispatch button untouched by the ticker');
  assert.doesNotMatch(headerBefore + ackBefore + btnBefore, /\d:\d\d|\dm \d+s/, 'no elapsed value anywhere but the strip');
});

test('D-23 (Q2.10F.8). Accessibility: explicit View name on the in-place bridge, no per-tick chatter; Outgoing keeps its own accessible markup for when it resumes', async () => {
  assert.match(pageSource, /id="outgoingAck" class="outgoing-ack" role="status" aria-live="polite" hidden/);
  const page = await startPage(daemonStatus({ activeDecision: autoDecision(CL1) }));
  page.onDispatch(async () => received(CL1, 'Claude 1', 'ref_1'));
  await dispatchAndWait(page);
  const btn = page.$('dispatchBtn');
  assert.equal(btn.attributes['aria-label'], 'View Claude 1');
  const labelBefore = btn.textContent;
  page.tick(); // the ticker never touches the dispatch bridge
  assert.equal(page.$('dispatchBtn').textContent, labelBefore, 'no re-render from the ticker');
});

test('D-24. Mobile structure: the acknowledgement stays in normal flow; no fixed/sticky element', () => {
  const css = pageSource.match(/<style>([\s\S]*?)<\/style>/)[1];
  const ackRules = css.split('}').filter((rule) => /\.outgoing-ack/.test(rule)).join('}');
  assert.doesNotMatch(ackRules, /position:\s*(fixed|sticky|absolute)/);
  assert.match(pageSource, /<div id="outgoingAck" class="outgoing-ack" role="status" aria-live="polite" hidden><\/div>/);
});
