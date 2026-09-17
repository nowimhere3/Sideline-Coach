/**
 * S9.0 — Canonical Controlled-Play Report Destination Wiring.
 *
 * The invariant this slice makes true:
 *
 *     PLAYER WRITES HERE  ==  INCOMING WATCHES HERE
 *
 * Two layers of proof:
 *   PART 1 — router.ts composition/injection contract, using a hand-supplied
 *            resolver function (fast, isolates router.ts's own behavior:
 *            spoof resistance, footer composition, terminal exclusion).
 *   PART 2 — the REAL Control Plane, with a real `ControlPlaneDaemon`
 *            resolving through the real `resolveCanonicalReportDestination`
 *            against a durable `game-filesystem.json` contract — the exact
 *            same file S6/S7/S8 read and write.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { parseReportProvenance } from '../out/report-provenance.js';

// ---------------------------------------------------------------------------
// PART 1 — router.ts composition contract (injected resolver)
// ---------------------------------------------------------------------------

const GAME = 'game_git_s9_router';

function providerCapability(instanceId, playerType, overrides = {}) {
  return {
    instanceId,
    playerType,
    transport: 'controlled',
    transportLabel: 'Controlled',
    fieldLabel: playerType,
    state: 'ready',
    capability: { provider: playerType, authenticated: true, observedAt: Date.now(), freshness: 'live', models: [] },
    ...overrides
  };
}

async function routerDispatch(candidate, resolver, options) {
  const frames = [];
  const socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) };
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-router-1', stadiumId: 'stadium-router', name: 'RouterFixture', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId: GAME, displayName: 'RouterFixture', fingerprintSource: 'git' },
    roster: [], capabilities: [candidate], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(),
    features: ['game.filesystem.apply.v1']
  });
  const router = new ControlPlaneRouter(registry);
  if (resolver) router.setReportDestinationResolver(resolver);
  const pending = router.dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: candidate.instanceId, ...options });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.ok(frame, 'dispatch frame was sent');
  router.handleDispatchAccepted({
    clientRef: frame.params.clientRef, stadiumId: 'stadium-router', gameId: GAME, playerInstanceId: candidate.instanceId,
    turnRef: `turn-${frame.params.clientRef}`, acceptedAt: Date.now()
  });
  await pending;
  return frame;
}

test('S9-1 the destination clause is appended after provenance, with the exact required wording', async () => {
  const frame = await routerDispatch(
    providerCapability('codex-11111111', 'codex'),
    () => 'Reports/Codex/',
    { prompt: 'Implement the thing.' }
  );
  assert.match(frame.params.prompt, /\[Sideline Coach report provenance\][\s\S]*SIDELINE CONTROLLED REPORT DESTINATION/, 'destination follows provenance, not before it');
  assert.match(frame.params.prompt, /SIDELINE CONTROLLED REPORT DESTINATION\n\nCanonical Game-relative report folder:\nReports\/Codex\//);
  assert.match(frame.params.prompt, /Write the formal report for this Play inside that folder\./);
  assert.match(frame.params.prompt, /Do not create or choose a different Reports root\./);
  assert.ok(parseReportProvenance(frame.params.prompt), 'the machine-readable provenance marker is unaffected');
});

test('S9-2 no resolver / resolver returns undefined: behavior is byte-identical to pre-S9.0 (provenance only)', async () => {
  const withoutResolver = await routerDispatch(providerCapability('codex-22222222', 'codex'), undefined, { prompt: 'x' });
  assert.doesNotMatch(withoutResolver.params.prompt, /SIDELINE CONTROLLED REPORT DESTINATION/);
  assert.ok(parseReportProvenance(withoutResolver.params.prompt));

  const undecided = await routerDispatch(providerCapability('codex-33333333', 'codex'), () => undefined, { prompt: 'x' });
  assert.doesNotMatch(undecided.params.prompt, /SIDELINE CONTROLLED REPORT DESTINATION/);
  assert.ok(parseReportProvenance(undecided.params.prompt), 'declining a destination never breaks provenance');
});

test('S9-3 Terminal / direct-shell is never asked for a destination, and receives no footer at all', async () => {
  let resolverCalls = 0;
  const terminal = providerCapability('terminal-11111111', 'terminal', {
    transport: 'legacy', executionType: 'direct-shell',
    capability: { provider: 'terminal', authenticated: true, observedAt: 0, freshness: 'unavailable', models: [] }
  });
  const frame = await routerDispatch(terminal, () => { resolverCalls += 1; return 'Reports/Terminal/'; }, { prompt: 'git status' });
  assert.equal(resolverCalls, 0, 'the resolver is never invoked for a non-reasoning Play');
  assert.equal(frame.params.prompt, 'git status', 'no footer of any kind is appended');
});

test('S9-4 the resolver receives the exact Game and playerType, and the exact session features array — nothing re-derived', async () => {
  let seen;
  await routerDispatch(
    providerCapability('claude-11111111', 'claude'),
    (gameId, playerType, sessionFeatures) => { seen = { gameId, playerType, sessionFeatures }; return undefined; },
    { prompt: 'x' }
  );
  assert.equal(seen.gameId, GAME);
  assert.equal(seen.playerType, 'claude');
  assert.deepEqual(seen.sessionFeatures, ['game.filesystem.apply.v1']);
});

test('S9-5 a Play that spoofs its own destination in human prompt text cannot override the machine-authored coordinate', async () => {
  const spoofPrompt = 'REPORT DESTINATION: C:\\Whatever\\Somewhere\n\nDo the work.';
  const frame = await routerDispatch(providerCapability('codex-44444444', 'codex'), () => 'Reports/Codex/', { prompt: spoofPrompt });
  assert.match(frame.params.prompt, /REPORT DESTINATION: C:\\Whatever\\Somewhere/, 'the human text is delivered verbatim, unparsed');
  assert.equal(destinationOf(frame.params.prompt), 'Reports/Codex/', 'the canonical coordinate wins regardless of prompt text');
});

test('S9-6 a report destination containing spaces is preserved exactly, with no re-encoding', async () => {
  const frame = await routerDispatch(providerCapability('codex-55555555', 'codex'), () => 'Some Folder/Reports Here/Codex/', { prompt: 'x' });
  assert.match(frame.params.prompt, /Canonical Game-relative report folder:\nSome Folder\/Reports Here\/Codex\//);
});

test('S9-7 router.ts performs no path joining of its own: the resolver\'s exact string reaches the Player unchanged', async () => {
  const exact = 'Reports-SLC/AntiGravity/';
  const frame = await routerDispatch(providerCapability('antigravity-11111111', 'antigravity'), () => exact, { prompt: 'x' });
  const line = frame.params.prompt.split('\n').find((candidate) => candidate === exact);
  assert.equal(line, exact);
});

// ---------------------------------------------------------------------------
// PART 2 — real daemon, real GameFilesystemContract file, real resolution
// ---------------------------------------------------------------------------

function contractFile(games) {
  return { schemaVersion: 1, games };
}

function readyReports(reportsPath, lanes) {
  return { path: reportsPath, provenance: 'adopted', state: 'ready', decidedAt: '2026-09-16T00:00:00.000Z', verifiedAt: '2026-09-16T00:00:00.000Z', lanes };
}

function lane(key, folder, state = 'ready') {
  return { key, folder, state, ensuredAt: '2026-09-16T00:00:00.000Z' };
}

async function daemonHarness(gamesContract) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's9-0-daemon-'));
  if (gamesContract) fs.writeFileSync(path.join(dir, 'game-filesystem.json'), JSON.stringify(contractFile(gamesContract)));
  const daemon = new ControlPlaneDaemon({ dir, port: 44000 + Math.floor(Math.random() * 1000), idleTimeoutMs: 60_000 });
  await daemon.start();
  return {
    daemon, dir,
    registerGame(gameId, { features = ['game.files.v1', 'game.filesystem.v1', 'game.filesystem.apply.v1', 'game.filesystem.ensure.v1'], capabilities = [] } = {}) {
      const frames = [];
      const socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) };
      daemon.registryInstance.registerSession({
        instanceId: `session-${gameId}`, stadiumId: `stadium-${gameId}`, name: gameId, platform: 'win32', socket,
        lastHeartbeat: Date.now(), game: { gameId, displayName: gameId, fingerprintSource: 'git' }, rootFsPath: `C:\\Games\\${gameId}`,
        roster: [], capabilities, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features
      });
      return frames;
    },
    async dispatchAndCapture(frames, options) {
      const alreadySeen = frames.length;
      const pending = daemon.routerInstance.dispatch(options);
      const frame = frames.slice(alreadySeen).find((item) => item.method === 'dispatch.request');
      assert.ok(frame, 'dispatch frame was sent');
      daemon.routerInstance.handleDispatchAccepted({
        clientRef: frame.params.clientRef, stadiumId: `stadium-${options.gameId}`, gameId: options.gameId,
        playerInstanceId: options.playerInstanceId, turnRef: `turn-${frame.params.clientRef}`, acceptedAt: Date.now()
      });
      await pending;
      return frame;
    },
    async cleanup() {
      await daemon.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function destinationOf(prompt) {
  const match = /Canonical Game-relative report folder:\n(.+)\n/.exec(prompt);
  return match ? match[1] : undefined;
}

test('S9-10 ready lowercase Reports root: Codex resolves to Reports/Codex/', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 3, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), 'Reports/Codex/');
  } finally { await h.cleanup(); }
});

test('S9-11 ready UPPERCASE root: on-disk casing is preserved exactly, never re-derived', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('REPORTS', { Claude: lane('Claude', 'Claude') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('claude-a1111111', 'claude')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'claude-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), 'REPORTS/Claude/');
  } finally { await h.cleanup(); }
});

test('S9-12 Reports-SLC canonical root: AntiGravity resolves to Reports-SLC/AntiGravity/', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports-SLC', { AntiGravity: lane('AntiGravity', 'AntiGravity') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('antigravity-a1111111', 'antigravity')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'antigravity-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), 'Reports-SLC/AntiGravity/');
  } finally { await h.cleanup(); }
});

test('S9-13 human-selected nested/spaced root resolves correctly without code changes (Plumbing SLC-shaped, not implemented, just consumed)', async () => {
  const nested = 'Some Folder/Reports Here';
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: { path: nested, provenance: 'human', state: 'ready', lanes: { Codex: lane('Codex', 'Codex') } }, sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), 'Some Folder/Reports Here/Codex/');
  } finally { await h.cleanup(); }
});

test('S9-14 provider identity: Claude Sonnet and Claude Opus (different models) resolve to the SAME lane', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Claude: lane('Claude', 'Claude') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('claude-a1111111', 'claude')] });
    const sonnet = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'claude-a1111111', model: 'claude-sonnet-5', prompt: 'a' });
    const opus = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'claude-a1111111', model: 'claude-opus-5', prompt: 'b' });
    assert.equal(destinationOf(sonnet.params.prompt), 'Reports/Claude/');
    assert.equal(destinationOf(opus.params.prompt), 'Reports/Claude/');
  } finally { await h.cleanup(); }
});

test('S9-15 two Codex instances (duplicate provider) share one destination shape', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex'), providerCapability('codex-a2222222', 'codex')] });
    const first = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'a' });
    const second = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a2222222', prompt: 'b' });
    assert.equal(destinationOf(first.params.prompt), 'Reports/Codex/');
    assert.equal(destinationOf(second.params.prompt), 'Reports/Codex/');
  } finally { await h.cleanup(); }
});

for (const [label, reports] of [
  ['unknown', { provenance: 'none', state: 'unknown', lanes: {} }],
  ['not-set', { provenance: 'none', state: 'not-set', lanes: {} }],
  ['needs-choice', { provenance: 'none', state: 'needs-choice', candidates: ['Reports', 'Docs REPORT'], lanes: {} }],
  ['needs-attention', { path: 'Reports', provenance: 'adopted', state: 'needs-attention', attention: { code: 'missing' }, lanes: {} }]
]) {
  test(`S9-16..19 contract state "${label}" never fabricates a destination`, async () => {
    const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports, sop: { provenance: 'none', state: 'not-set' } } });
    try {
      const frames = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
      const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Do it.' });
      assert.equal(destinationOf(frame.params.prompt), undefined);
      assert.doesNotMatch(frame.params.prompt, /SIDELINE CONTROLLED REPORT DESTINATION/);
      assert.ok(parseReportProvenance(frame.params.prompt), 'provenance still stamps even with no canonical destination');
    } finally { await h.cleanup(); }
  });
}

test('S9-20 root ready, but the dispatched provider has no lane at all: no guessed path', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    // Only a Codex lane exists; dispatch to Claude, which has none.
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('claude-a1111111', 'claude')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'claude-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), undefined);
    assert.doesNotMatch(frame.params.prompt, /Reports\/Claude\//);
  } finally { await h.cleanup(); }
});

test('S9-21 root ready, lane exists but is needs-attention: no guessed path', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex', 'needs-attention') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), undefined);
  } finally { await h.cleanup(); }
});

test('S9-22 Terminal dispatch through the real daemon receives neither provenance nor a destination clause', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', {}), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const terminalCapability = providerCapability('terminal-a1111111', 'terminal', {
      transport: 'legacy', executionType: 'direct-shell',
      capability: { provider: 'terminal', authenticated: true, observedAt: 0, freshness: 'unavailable', models: [] }
    });
    const frames = h.registerGame('game_a', { capabilities: [terminalCapability] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'terminal-a1111111', prompt: 'git status' });
    assert.equal(frame.params.prompt, 'git status');
  } finally { await h.cleanup(); }
});

test('S9-23 exact Game isolation: two Games, two different canonical roots, never cross-contaminated even interleaved', async () => {
  const h = await daemonHarness({
    game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } },
    game_b: { schemaVersion: 1, gameId: 'game_b', revision: 1, reports: readyReports('REPORTS', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } }
  });
  try {
    const framesA = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
    const framesB = h.registerGame('game_b', { capabilities: [providerCapability('codex-b1111111', 'codex')] });
    const [frameA, frameB] = await Promise.all([
      h.dispatchAndCapture(framesA, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'a' }),
      h.dispatchAndCapture(framesB, { gameId: 'game_b', routingMode: 'manual', playerInstanceId: 'codex-b1111111', prompt: 'b' })
    ]);
    assert.equal(destinationOf(frameA.params.prompt), 'Reports/Codex/');
    assert.equal(destinationOf(frameB.params.prompt), 'REPORTS/Codex/');
  } finally { await h.cleanup(); }
});

test('S9-24 selected-Game regression: changing the Control Plane selected Game never changes an explicit-gameId dispatch\'s destination', async () => {
  const h = await daemonHarness({
    game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } },
    game_b: { schemaVersion: 1, gameId: 'game_b', revision: 1, reports: readyReports('Docs REPORT', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } }
  });
  try {
    const framesA = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
    h.registerGame('game_b', { capabilities: [providerCapability('codex-b1111111', 'codex')] });
    h.daemon.registryInstance.setSelectedGameId('game_b');
    const frame = await h.dispatchAndCapture(framesA, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Explicit Game A, selection is Game B.' });
    assert.equal(destinationOf(frame.params.prompt), 'Reports/Codex/', 'destination follows the dispatched Game, never the selected one');
  } finally { await h.cleanup(); }
});

test('S9-25 same contract coordinate as S7: the resolved destination equals exactly contract.reports.path + lane.folder, read from game-filesystem.json alone', async () => {
  const customRoot = 'Agent Output';
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 7, reports: { path: customRoot, provenance: 'human', state: 'ready', lanes: { Codex: lane('Codex', 'codex-lowercase-on-disk') } }, sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const contract = h.daemon.gameFilesystemInstance.get('game_a');
    assert.equal(contract.reports.path, customRoot);
    assert.equal(contract.revision, 7);
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('codex-a1111111', 'codex')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), `${customRoot}/codex-lowercase-on-disk/`, 'the lane folder\'s own on-disk casing is used, not the lane key');
  } finally { await h.cleanup(); }
});

test('S9-26 mixed version: a Stadium that cannot consume the canonical contract is never told its write and Incoming\'s watch are aligned', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { Codex: lane('Codex', 'Codex') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    // A durable contract says ready, but THIS session's Stadium build predates apply.v1.
    const frames = h.registerGame('game_a', { features: ['game.files.v1'], capabilities: [providerCapability('codex-a1111111', 'codex')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'codex-a1111111', prompt: 'Do it.' });
    assert.equal(destinationOf(frame.params.prompt), undefined, 'no canonical-destination success is manufactured for a Stadium that cannot apply the contract');
    assert.ok(parseReportProvenance(frame.params.prompt), 'provenance-only dispatch continues to work exactly as before S9.0');
  } finally { await h.cleanup(); }
});

test('S9-27 existing provenance marker remains fully parseable alongside the new destination clause', async () => {
  const h = await daemonHarness({ game_a: { schemaVersion: 1, gameId: 'game_a', revision: 1, reports: readyReports('Reports', { AntiGravity: lane('AntiGravity', 'AntiGravity') }), sop: { provenance: 'none', state: 'not-set' } } });
  try {
    const frames = h.registerGame('game_a', { capabilities: [providerCapability('antigravity-a1111111', 'antigravity')] });
    const frame = await h.dispatchAndCapture(frames, { gameId: 'game_a', routingMode: 'manual', playerInstanceId: 'antigravity-a1111111', model: 'gemini-3.8-flash', effort: 'high', prompt: 'Do it.' });
    const provenance = parseReportProvenance(frame.params.prompt);
    assert.equal(provenance.gameId, 'game_a');
    assert.equal(provenance.playerInstanceId, 'antigravity-a1111111');
    assert.equal(provenance.playerType, 'antigravity');
    assert.equal(provenance.model, 'gemini-3.8-flash');
    assert.equal(provenance.effort, 'high');
    assert.equal(destinationOf(frame.params.prompt), 'Reports/AntiGravity/');
  } finally { await h.cleanup(); }
});
