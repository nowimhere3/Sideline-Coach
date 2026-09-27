/**
 * S57.5 Commercial Product Batch — C5 + C8 + C9.
 *
 *   C5  Game admission (Q5): Add Game or first Play admits; archive releases; grandfathering
 *   C8  product-event emitters at existing seams (Q7: telemetry OFF by default)
 *   C9  Access panel, telemetry consent control, Dev telemetry preview, phone allowance notice
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { StadiumClient } from '../out/stadium-client.js';
import { SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player-contract.js';
import { CAPABILITY_CATALOGUE } from '../out/commercial/index.js';
import { validateProductEvent } from '../out/telemetry/index.js';
import { DEFAULT_PREFERENCES, loadPreferences } from '../out/running-players.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'src', 'public', 'index.html'), 'utf8');
const scratch = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `sideline-s57-5-${label}-`));
const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
let nextPort = 39_960;
const port = () => { nextPort += 3; return nextPort; };

const GS3 = { gameId: 'game_s575_gs3', displayName: 'GS3 Secret Project', fingerprintSource: 'git-remote' };
const GALLERY = { gameId: 'game_s575_gallery', displayName: 'Gallery', fingerprintSource: 'git-remote' };
const CODEX = 'codex-57500001';
const codex = (instanceId = CODEX) => ({
  instanceId, playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready',
  capability: { provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt', models: [{ id: 'gpt', displayName: 'GPT', isDefault: true, supportedEfforts: ['medium'], defaultEffort: 'medium' }] }
});
const ceiling = (limit) => ({
  id: 'games-test', label: 'Games test',
  grants: [
    { grantId: 'slots', capability: 'games.active', allowance: { kind: 'ceiling', limit }, source: 'override' },
    { grantId: 'routines', capability: 'routines', allowance: { kind: 'unlimited' }, source: 'override' }
  ]
});

async function harness({ profile, dir = scratch('c5'), telemetry, stadium = true } = {}) {
  const daemon = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 120_000, ...(profile ? { entitlements: { profile } } : {}), ...(telemetry ? { telemetry } : {}) });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const calls = { pick: 0 };
  let client;
  if (stadium) {
    client = new StadiumClient({
      port: daemon.port, dir, token, instanceId: 'inst_s575', autoReconnect: false,
      gameContextGetter: () => ({
        game: GS3,
        stadium: { stadiumId: 'stadium_s575', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
        binding: { gameId: GS3.gameId, stadiumId: 'stadium_s575', rootFsPath: 'C:\\repos\\GS3', boundAt: Date.now(), isPrimary: true, status: 'bound' }
      }),
      pickGame: async () => { calls.pick++; return calls.nextPick ?? { success: true, folderPath: 'C:\\repos\\Gallery', game: GALLERY }; },
      openGame: async () => ({ success: true, outcome: 'opened', message: 'Opening' })
    });
    assert.equal(await client.connect(), true);
  }
  const api = async (pathname, init = {}) => {
    const res = await fetch(`http://127.0.0.1:${daemon.port}${pathname}`, {
      method: 'POST', body: '{}', ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  };
  const members = () => Object.keys(daemon.usageStore.state.members['games.active'] ?? {}).map((slot) => slot.slice(2)).sort();
  /** A fake Stadium session for `gameId` with one ready Codex Player; returns captured frames. */
  const session = (gameId, instanceId = `fake_${gameId}`) => {
    const frames = [];
    daemon.registry.registerSession({
      instanceId, stadiumId: `stadium_${instanceId}`, name: 'Fake', platform: 'win32',
      socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
      game: { gameId, displayName: `Fake ${gameId}`, fingerprintSource: 'test' }, rootFsPath: `C:/fake/${gameId}`,
      roster: [], capabilities: [codex()], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
    });
    return frames;
  };
  /** Dispatch one MANUAL Play and accept it; returns the router result and whether a frame was sent. */
  const play = async (gameId, frames) => {
    const before = frames.length;
    const pending = daemon.router.dispatch({ gameId, routingMode: 'manual', playerInstanceId: CODEX, prompt: 'Run the tests in C:\\repos\\secret\\app.ts' });
    await new Promise((resolve) => setImmediate(resolve));
    const frame = frames.slice(before).find((entry) => entry.method === 'dispatch.request');
    if (frame) daemon.router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: `stadium_fake_${gameId}`, gameId, playerInstanceId: CODEX, turnRef: `turn_${frame.params.clientRef}`, acceptedAt: Date.now() });
    return { result: await pending, sent: Boolean(frame) };
  };
  const stop = async ({ keepDir = false } = {}) => { client?.dispose(); await daemon.stop(); if (!keepDir) rm(dir); };
  return { daemon, dir, token, calls, api, members, session, play, stop };
}

// ═════════════════════════════════════════════════════════════════════════════
// C5 — GAME ADMISSION
// ═════════════════════════════════════════════════════════════════════════════

test('C5-1. opening, discovering or auto-registering a workspace consumes no slot', async () => {
  const h = await harness();
  try {
    h.session('game_s575_window_only');
    assert.ok(h.daemon.registry.getKnownGame(GS3.gameId), 'the Stadium window registered its Game');
    assert.ok(h.daemon.registry.getKnownGame('game_s575_window_only'));
    assert.deepEqual(h.members(), []);
  } finally { await h.stop(); }
});

test('C5-2. explicit Add Game admits; repeating it or playing afterwards never double-charges', async () => {
  const h = await harness();
  try {
    assert.equal((await h.api('/api/game/add')).status, 200);
    assert.deepEqual(h.members(), [GALLERY.gameId]);
    assert.equal((await h.api('/api/game/add')).status, 200);
    const frames = h.session(GALLERY.gameId);
    assert.equal((await h.play(GALLERY.gameId, frames)).result.success, true);
    assert.deepEqual(h.members(), [GALLERY.gameId], 'Add then Play: one slot');
    assert.equal(h.daemon.usageStore.journal().filter((receipt) => receipt.capability === 'games.active').length, 1);
  } finally { await h.stop(); }
});

test('C5-3. the first Play admits; later Plays and a later Add never double-charge', async () => {
  const h = await harness();
  try {
    const frames = h.session('game_s575_play');
    const first = await h.play('game_s575_play', frames);
    assert.equal(first.result.success, true);
    assert.deepEqual(h.members(), ['game_s575_play']);
    await h.play('game_s575_play', frames);
    h.calls.nextPick = { success: true, folderPath: 'C:\\fake\\game_s575_play', game: { gameId: 'game_s575_play', displayName: 'Played', fingerprintSource: 'test' } };
    assert.equal((await h.api('/api/game/add')).status, 200);
    assert.deepEqual(h.members(), ['game_s575_play'], 'Play then Add: one slot');
  } finally { await h.stop(); }
});

test('C5-4. archive releases the slot and keeps history; reopening alone does not re-admit; a later Play does', async () => {
  const h = await harness();
  try {
    const frames = h.session('game_s575_arch');
    await h.play('game_s575_arch', frames);
    assert.deepEqual(h.members(), ['game_s575_arch']);
    const historyBefore = h.daemon.ledger.forGame('game_s575_arch').length;
    assert.equal((await h.api('/api/game/archive', { body: JSON.stringify({ gameId: 'game_s575_arch' }) })).status, 200);
    assert.deepEqual(h.members(), [], 'released');
    assert.ok(h.daemon.registry.getKnownGame('game_s575_arch').isArchived, 'archived, not deleted');
    assert.equal(h.daemon.ledger.forGame('game_s575_arch').length, historyBefore, 'Play history preserved');
    // Reopen: restore and a reconnecting window both leave the slot free.
    await h.api('/api/game/restore', { body: JSON.stringify({ gameId: 'game_s575_arch' }) });
    const reconnected = h.session('game_s575_arch'); // the same window reconnecting
    assert.deepEqual(h.members(), []);
    assert.equal((await h.play('game_s575_arch', reconnected)).result.success, true);
    assert.deepEqual(h.members(), ['game_s575_arch'], 're-admitted by actual use');
  } finally { await h.stop(); }
});

test('C5-5. at the ceiling only NEW admissions are refused: before the picker, and before any Play is sent', async () => {
  const h = await harness({ profile: ceiling(1) });
  try {
    const framesA = h.session('game_s575_a');
    assert.equal((await h.play('game_s575_a', framesA)).result.success, true);
    const added = await h.api('/api/game/add');
    assert.equal(added.status, 403);
    assert.equal(added.body.capability, 'games.active');
    assert.equal(added.body.message, "You're using all 1 active Game slots. Archive a Game to make room.");
    assert.equal(h.calls.pick, 0, 'refused before the picker opened');
    assert.doesNotMatch(added.body.message, /\b(pro|free|plan|price|upgrade|subscription|tier)\b/i);

    const framesB = h.session('game_s575_b');
    const refused = await h.play('game_s575_b', framesB);
    assert.equal(refused.result.success, false);
    assert.equal(refused.result.statusCode, 403);
    assert.equal(refused.sent, false, 'nothing dispatched, nothing queued');
    assert.equal((await h.play('game_s575_a', framesA)).result.success, true, 'the admitted Game keeps working at the ceiling');

    await h.api('/api/game/archive', { body: JSON.stringify({ gameId: 'game_s575_a' }) });
    assert.equal((await h.play('game_s575_b', framesB)).result.success, true, 'archiving made room');
  } finally { await h.stop(); }
});

test('C5-6/7. grandfathering admits every Game with Play history — above the ceiling, once, and survives restart/downgrade', async () => {
  const dir = scratch('c5-grandfather');
  const ledger = new InstanceWorkLedger();
  for (const gameId of ['game_s575_h1', 'game_s575_h2', 'game_s575_h3']) {
    ledger.recordDispatch({ gameId, playerInstanceId: CODEX, playerType: 'codex', clientRef: `ref_${gameId}`, at: Date.now() });
    ledger.recordDelivery(`ref_${gameId}`, 'received'); // a real Play in the Ledger's history
  }
  ledger.recordDispatch({ gameId: 'game_s575_window_only', playerInstanceId: CODEX, playerType: 'codex', clientRef: 'ref_never_sent', at: Date.now() }); // no Play: not seeded
  fs.writeFileSync(path.join(dir, 'work-ledger.json'), JSON.stringify(ledger.serialize()));
  const first = await harness({ profile: ceiling(1), dir, stadium: false });
  try {
    assert.deepEqual(first.members(), ['game_s575_h1', 'game_s575_h2', 'game_s575_h3'], 'seeded above a ceiling of 1');
    const frames = first.session('game_s575_h2');
    assert.equal((await first.play('game_s575_h2', frames)).result.success, true, 'grandfathered Games stay usable');
    const newFrames = first.session('game_s575_new');
    assert.equal((await first.play('game_s575_new', newFrames)).result.statusCode, 403, 'new admissions wait until count < ceiling');
    first.session('game_s575_h3'); // Coach archives only Games it knows (its window connected)
    assert.equal((await first.api('/api/game/archive', { body: JSON.stringify({ gameId: 'game_s575_h3' }) })).status, 200);
  } finally { await first.stop({ keepDir: true }); }
  const second = await harness({ profile: ceiling(1), dir, stadium: false });
  try {
    assert.deepEqual(second.members(), ['game_s575_h1', 'game_s575_h2'], 'restart preserves admissions and never re-seeds an archived Game');
  } finally { await second.stop({ keepDir: true }); }
  const unlimited = await harness({ dir, stadium: false });
  try {
    for (let index = 0; index < 40; index++) assert.equal(unlimited.daemon.featureGate.charge('games.active', `game_s575_many_${index}`).allowed, true);
    assert.equal(unlimited.members().length, 42, 'unlimited never blocks');
  } finally { await unlimited.stop(); }
});

// ═════════════════════════════════════════════════════════════════════════════
// C8 — TELEMETRY EMITTERS
// ═════════════════════════════════════════════════════════════════════════════

const FORBIDDEN_CONTENT = [GS3.gameId, GS3.displayName, 'game_s575', 'C:\\\\repos', 'secret', 'app.ts', 'Run the tests', 'S57 phone', 'Gallery'];

async function exerciseSeams(h) {
  const frames = h.session('game_s575_tel');
  await h.play('game_s575_tel', frames); // play.dispatched + game.admitted
  await h.play('game_s575_tel', frames); // play.dispatched only
  await h.api('/api/game/archive', { body: JSON.stringify({ gameId: 'game_s575_tel' }) }); // game.archived
  h.daemon.ledger.recordReports('game_s575_tel', [{ path: 'REPORTS/Codex/secret-a.md', mtime: 1 }]); // baseline: no event
  h.daemon.ledger.recordReports('game_s575_tel', [{ path: 'REPORTS/Codex/secret-a.md', mtime: 1 }, { path: 'REPORTS/Codex/secret-b.md', mtime: 2 }]); // report.delivered
  h.daemon.deliverAlarmEvent({ id: 'alarm_1', type: 'alarm:threshold_entered', provider: 'claude', window: 'five_hour', windowLabel: '5H', previousState: 'NORMAL', currentState: 'LOW', severity: 'warning', timestamp: new Date().toISOString(), message: 'Claude 5H is low' });
  h.daemon.observeScoutTurn({ instanceId: SCOUT_PLAYER_INSTANCE_ID, state: 'completed', turnRef: 'scout_turn_1' });
  h.daemon.observeScoutTurn({ instanceId: SCOUT_PLAYER_INSTANCE_ID, state: 'completed', turnRef: 'scout_turn_1' }); // duplicate
  await h.api('/api/scout/bootstrap', { body: JSON.stringify({ gameId: 'game_s575_absent', action: 'refresh' }) }); // scout.maintenance_run
  await h.api('/api/preferences', { body: JSON.stringify({ remoteAccess: { enabled: true } }) }); // remote.enabled
  const pairing = await h.api('/api/pairing/create');
  await h.api('/api/pairing/exchange', { body: JSON.stringify({ secret: pairing.body.secret, label: 'S57 phone' }) }); // remote.paired
  const adapter = new InProcessRemoteAdapter({ daemon: h.daemon, deviceRegistry: h.daemon.deviceRegistry, expectedOrigin: 'https://h-test.localhost' });
  const { rawToken } = h.daemon.deviceRegistry.createDevice('S57 phone');
  await adapter.dispatch({ id: 'sse-1', method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${rawToken}` } }, () => undefined);
  adapter.cancel('sse-1');
  h.daemon.remoteMeter.stop(); // session end is reported when the merge window closes or on stop
}

test('C8-1. telemetry is OFF by default: every seam fires, nothing is written anywhere', async () => {
  assert.equal(DEFAULT_PREFERENCES.productTelemetry, 'off');
  const h = await harness();
  try {
    await exerciseSeams(h);
    await h.daemon.telemetryOutbox.whenIdle();
    assert.equal(fs.existsSync(path.join(h.dir, 'telemetry')), false, 'no directory, no file');
    assert.deepEqual(h.daemon.telemetryOutbox.pending(), []);
  } finally { await h.stop(); }
});

test('C8-2. with explicit consent each implemented seam emits one valid, content-free event', async () => {
  const h = await harness();
  try {
    assert.equal((await h.api('/api/preferences', { body: JSON.stringify({ productTelemetry: 'on' }) })).status, 200);
    await exerciseSeams(h);
    await h.daemon.telemetryOutbox.whenIdle();
    const events = h.daemon.telemetryOutbox.pending();
    const names = events.map((event) => event.name);
    const count = (name) => names.filter((candidate) => candidate === name).length;
    assert.equal(count('play.dispatched'), 2);
    assert.equal(count('game.admitted'), 1, 'admission is reported once, not per Play');
    assert.equal(count('game.archived'), 1);
    assert.equal(count('report.delivered'), 1, 'the first-seen baseline is never reported');
    assert.equal(count('alert.fired'), 1);
    assert.equal(count('scout.play_finished'), 1, 'duplicate terminal turns are reported once');
    assert.equal(count('scout.maintenance_run'), 1);
    assert.equal(count('remote.enabled'), 1);
    assert.equal(count('remote.paired'), 1);
    assert.equal(count('remote.session_ended'), 1);
    const dispatched = events.find((event) => event.name === 'play.dispatched');
    assert.deepEqual(dispatched.dims, { playerType: 'codex' });
    assert.equal(events.find((event) => event.name === 'scout.play_finished').outcome, 'ok');
    assert.equal(events.find((event) => event.name === 'scout.maintenance_run').outcome, 'failed', 'coarse outcome only');
    for (const event of events) assert.equal(validateProductEvent(event).ok, true, event.name);
    const serialized = JSON.stringify(events);
    for (const forbidden of FORBIDDEN_CONTENT) assert.equal(serialized.includes(forbidden), false, `no "${forbidden}" in telemetry`);
    assert.equal(serialized.includes(h.daemon.deviceRegistry.list()[0].deviceId), false, 'no deviceId');
    // Future routing signals are not fabricated; superseded or unscheduled events are not emitted.
    for (const name of names) assert.doesNotMatch(name, /^routing\.|^scout\.followed_by_premium$|^coach_refresh\.used$|^app\.daily_active$|^games\.daily_snapshot$/);
  } finally { await h.stop(); }
});

test('C8-3. gate.refused fires only on an actual refusal, carries only capability + closed reason, and is rate-limited', async () => {
  const h = await harness({ profile: ceiling(1) });
  try {
    await h.api('/api/preferences', { body: JSON.stringify({ productTelemetry: 'on' }) });
    const framesA = h.session('game_s575_ra');
    await h.play('game_s575_ra', framesA);
    await h.play('game_s575_ra', framesA); // allowed: no refusal event
    assert.equal(h.daemon.telemetryOutbox.pending().filter((event) => event.name === 'gate.refused').length, 0);
    const framesB = h.session('game_s575_rb');
    await h.play('game_s575_rb', framesB);
    await h.play('game_s575_rb', framesB);
    await h.api('/api/game/add');
    const refusals = h.daemon.telemetryOutbox.pending().filter((event) => event.name === 'gate.refused');
    assert.equal(refusals.length, 1, 'a refusal storm is one signal per minute');
    assert.deepEqual({ capability: refusals[0].capability, dims: refusals[0].dims }, { capability: 'games.active', dims: { reason: 'ceiling-reached' } });
    await h.api('/api/pairing/create'); // remote.access not in this profile → not-entitled
    assert.deepEqual(h.daemon.telemetryOutbox.pending().filter((event) => event.name === 'gate.refused').map((event) => `${event.capability}:${event.dims.reason}`).sort(),
      ['games.active:ceiling-reached', 'remote.access:not-entitled']);
  } finally { await h.stop(); }
});

test('C8-4. opting out discards pending events; telemetry failure never touches the feature', async () => {
  const h = await harness();
  try {
    await h.api('/api/preferences', { body: JSON.stringify({ productTelemetry: 'on' }) });
    const frames = h.session('game_s575_opt');
    await h.play('game_s575_opt', frames);
    await h.daemon.telemetryOutbox.whenIdle();
    assert.ok(fs.existsSync(path.join(h.dir, 'telemetry', 'outbox.jsonl')));
    assert.equal((await h.api('/api/preferences', { body: JSON.stringify({ productTelemetry: 'off' }) })).status, 200);
    await h.daemon.telemetryOutbox.whenIdle();
    assert.deepEqual(h.daemon.telemetryOutbox.pending(), []);
    assert.equal(fs.existsSync(path.join(h.dir, 'telemetry', 'outbox.jsonl')), false, 'nothing kept after opting out');
    await h.play('game_s575_opt', frames);
    await h.daemon.telemetryOutbox.whenIdle();
    assert.deepEqual(h.daemon.telemetryOutbox.pending(), []);
  } finally { await h.stop(); }

  const dir = scratch('c8-broken');
  fs.writeFileSync(path.join(dir, 'telemetry'), 'blocked');
  const broken = await harness({ dir, telemetry: { consent: () => 'on' } });
  try {
    const frames = broken.session('game_s575_broken');
    assert.equal((await broken.play('game_s575_broken', frames)).result.success, true);
    assert.equal((await broken.api('/api/game/archive', { body: JSON.stringify({ gameId: 'game_s575_broken' }) })).status, 200);
    assert.equal(broken.daemon.telemetryOutbox.transportKind, 'none', 'no network sender exists');
  } finally { await broken.stop(); }
});

// ═════════════════════════════════════════════════════════════════════════════
// C9 — ACCESS PANEL, CONSENT, DEV PREVIEW, PHONE NOTICE
// ═════════════════════════════════════════════════════════════════════════════

/** The shipped C9 script block, run in a sandbox with a minimal DOM. */
function c9Sandbox({ remote = false } = {}) {
  const start = html.indexOf('const ACCESS_ROWS');
  const end = html.indexOf('/** AI Usage Refresh Frequency');
  assert.ok(start > 0 && end > start, 'C9 block present');
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id, hidden: id === 'telemetryPreviewSection' || id === 'remoteAllowanceBanner', checked: false, textContent: '', dataset: {}, children: [], listeners: {}, className: '',
        addEventListener(event, fn) { (this.listeners[event] ??= []).push(fn); },
        appendChild(child) { this.children.push(child); return child; },
        set innerHTML(_value) { this.children = []; },
        get innerHTML() { return ''; }
      });
    }
    return nodes.get(id);
  };
  const requests = [];
  const toasts = [];
  const context = {
    $: node,
    document: { createElement: () => ({ dataset: {}, children: [], textContent: '', className: '', appendChild(child) { this.children.push(child); return child; } }) },
    api: async (url, options = {}) => {
      requests.push({ url, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      if (url === '/api/telemetry/preview') return { success: true, consent: 'off', transport: 'none', pending: 0, events: [] };
      return { success: true, message: 'Product usage telemetry is on.' };
    },
    showToast: (message, isError) => toasts.push({ message, isError }),
    refresh: async () => undefined,
    canMutateLiveState: () => true,
    isRemoteDevicePresentation: () => remote,
    Date, JSON, Math, Number, String, Boolean, Object, console
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.syncAccessSettings = syncAccessSettings; this.renderRemoteAllowance = renderRemoteAllowance; this.describeAccess = describeAccess; this.ACCESS_ROWS = ACCESS_ROWS;`, context);
  const rows = () => node('accessCapabilityList').children.map((row) => [row.children[0].textContent, row.children[1].textContent]);
  return { context, node, rows, requests, toasts };
}

test('C9-1. Access reads the canonical projection: unlimited shows "Full access" under the exact Dad labels', async () => {
  const h = await harness();
  try {
    const status = (await h.api('/api/status', { method: 'GET', body: undefined })).body;
    const ui = c9Sandbox();
    ui.context.syncAccessSettings(status);
    assert.deepEqual(ui.rows(), [
      ['Active Games', 'Full access'],
      ['Mobile Remote', 'Full access'],
      ['Scout Plays', 'Full access'],
      ['Scout Roster Refresh', 'Full access'],
      ['Coach Routines', 'Full access']
    ]);
    // Reserved / unbuilt capabilities are never surfaced as product features.
    const shown = ui.context.ACCESS_ROWS.map(([id]) => id);
    for (const [id, definition] of CAPABILITY_CATALOGUE) if (definition.reserved) assert.equal(shown.includes(id), false, id);
    assert.equal(CAPABILITY_CATALOGUE.get('scout.maintenance').dadName, 'Scout Roster Refresh', 'Q3 name in denial copy too');
    // Remote stays unrestricted under the unlimited profile.
    assert.equal(status.entitlements.capabilities['remote.access'].unlimited, true);
  } finally { await h.stop(); }
});

test('C9-2. metered and absent capabilities read concisely, without billing language', () => {
  const ui = c9Sandbox();
  const resetsAt = Date.UTC(2026, 10, 1, 12);
  ui.context.syncAccessSettings({ entitlements: { capabilities: {
    'games.active': { entitled: true, unlimited: false, limit: 3, used: 2, remaining: 1, unit: 'games' },
    'remote.access': { entitled: true, unlimited: false, limit: 60, used: 35, remaining: 25, resetsAt, unit: 'minutes' },
    'scout.play': { entitled: true, unlimited: false, limit: 5, used: 5, remaining: 0, unit: 'count' },
    'scout.maintenance': { entitled: false, unlimited: false },
    routines: { entitled: true, unlimited: false }
  } } });
  const rows = Object.fromEntries(ui.rows());
  assert.equal(rows['Active Games'], '2 of 3 active');
  assert.match(rows['Mobile Remote'], /^25 of 60 min left · resets /);
  assert.equal(rows['Scout Plays'], '0 of 5 left');
  assert.equal(rows['Scout Roster Refresh'], 'Not included');
  assert.equal(rows['Coach Routines'], 'Included');
  const c9Html = html.slice(html.indexOf('<div id="accessSettingsCard"'), html.indexOf('<div id="remoteAccessSettingsCard"'))
    + html.slice(html.indexOf('const ACCESS_ROWS'), html.indexOf('/** AI Usage Refresh Frequency'));
  assert.doesNotMatch(c9Html.replace(/No plans, prices or upgrade copy|No plan names,\s*\*\s*prices or upgrade copy/g, ''), /\b(price|pricing|upgrade|subscribe|subscription|billing|plan|tier|pro|premium|founder|buy)\b/i);
});

test('C9-3. telemetry consent: OFF by default, the toggle writes the canonical preference, bad values are refused', async () => {
  const ui = c9Sandbox();
  ui.context.syncAccessSettings({ preferences: { productTelemetry: 'off' }, entitlements: { capabilities: {} } });
  assert.equal(ui.node('productTelemetryToggle').checked, false);
  await ui.node('productTelemetryToggle').listeners.change[0]({ target: { checked: true } });
  assert.deepEqual(ui.requests.at(-1), { url: '/api/preferences', method: 'POST', body: { productTelemetry: 'on' } });

  const h = await harness({ stadium: false });
  try {
    assert.equal((await h.api('/api/status', { method: 'GET', body: undefined })).body.preferences.productTelemetry, 'off');
    const saved = await h.api('/api/preferences', { body: JSON.stringify({ productTelemetry: 'on' }) });
    assert.equal(saved.status, 200);
    assert.equal(loadPreferences(path.join(h.dir, 'preferences.json')).productTelemetry, 'on');
    assert.equal(h.daemon.telemetryOutbox.consent(), 'on', 'the outbox reads the same canonical source');
    assert.equal((await h.api('/api/preferences', { body: JSON.stringify({ productTelemetry: 'yes' }) })).status, 400);
    fs.writeFileSync(path.join(h.dir, 'preferences-legacy.json'), JSON.stringify({ productTelemetry: true }));
    assert.equal(loadPreferences(path.join(h.dir, 'preferences-legacy.json')).productTelemetry, 'off', 'anything but an explicit "on" is off');
  } finally { await h.stop(); }
});

test('C9-4. the Dev telemetry preview is hidden in Dad Mode and on phones, and the endpoint is local Dev-only', async () => {
  const dadMode = c9Sandbox();
  dadMode.context.syncAccessSettings({ preferences: { devMode: false }, entitlements: { capabilities: {} } });
  assert.equal(dadMode.node('telemetryPreviewSection').hidden, true);
  const phone = c9Sandbox({ remote: true });
  phone.context.syncAccessSettings({ preferences: { devMode: true }, entitlements: { capabilities: {} } });
  assert.equal(phone.node('telemetryPreviewSection').hidden, true, 'never on a phone');
  const dev = c9Sandbox();
  dev.context.syncAccessSettings({ preferences: { devMode: true }, entitlements: { capabilities: {} } });
  assert.equal(dev.node('telemetryPreviewSection').hidden, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(dev.requests.some((request) => request.url === '/api/telemetry/preview'));
  assert.match(dev.node('telemetryPreviewSummary').textContent, /^Consent: Off · Transport: none \(nothing is sent\) · Pending: 0$/);

  const h = await harness();
  try {
    assert.equal((await h.api('/api/telemetry/preview', { method: 'GET', body: undefined })).status, 404, 'Dad Mode');
    assert.equal((await h.api('/api/preferences', { body: JSON.stringify({ gameId: GS3.gameId, devMode: true }) })).status, 200);
    const preview = await h.api('/api/telemetry/preview', { method: 'GET', body: undefined });
    assert.equal(preview.status, 200);
    assert.deepEqual({ consent: preview.body.consent, transport: preview.body.transport }, { consent: 'off', transport: 'none' });
    const adapter = new InProcessRemoteAdapter({ daemon: h.daemon, deviceRegistry: h.daemon.deviceRegistry, expectedOrigin: 'https://h-test.localhost' });
    const { rawToken } = h.daemon.deviceRegistry.createDevice('Phone');
    const frames = [];
    await adapter.dispatch({ id: 'p1', method: 'GET', path: '/api/telemetry/preview', headers: { cookie: `sl_dev=${rawToken}` } }, (frame) => frames.push(frame));
    assert.equal(frames.find((frame) => frame.t === 'head').status, 403, 'a phone can never read the local preview');
  } finally { await h.stop(); }
});

test('C9-5. the phone renders the daemon\'s grace and exhausted notices (and nothing else)', () => {
  const ui = c9Sandbox({ remote: true });
  const banner = ui.node('remoteAllowanceBanner');
  ui.context.renderRemoteAllowance({ state: 'something-else', message: 'x' });
  assert.equal(banner.hidden, true, 'unknown states are ignored');
  ui.context.renderRemoteAllowance({ state: 'grace', message: 'Mobile Remote: allowance used up until Nov 1.', graceUntil: Date.now() + 4.5 * 60_000 });
  assert.equal(banner.hidden, false);
  assert.equal(banner.dataset.state, 'grace');
  assert.equal(ui.node('remoteAllowanceTitle').textContent, 'Mobile Remote time is almost up');
  assert.match(ui.node('remoteAllowanceText').textContent, /About 5 min left on this phone\. Sideline keeps working on your computer\.$/);
  ui.context.renderRemoteAllowance({ state: 'exhausted', message: 'Mobile Remote: allowance used up until Nov 1.' });
  assert.equal(banner.dataset.state, 'exhausted');
  assert.equal(ui.node('remoteAllowanceTitle').textContent, 'Mobile Remote paused');
  assert.match(ui.node('remoteAllowanceText').textContent, /this phone stays paired\.$/);
  assert.match(html, /source\.addEventListener\('remote-allowance'/, 'wired to the SSE event C4 emits');
  assert.match(html, /<div id="remoteAllowanceBanner"[^>]*role="status"[^>]*hidden>/);
});
