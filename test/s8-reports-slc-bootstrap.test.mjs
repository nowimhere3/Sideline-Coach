/**
 * S8.0 / S11.1 — bounded bootstrap + roster provider lanes.
 *
 * Adopt before create. Create only when authoritatively required. Never
 * migrate history silently. Every test proves either a safe mutation or the
 * absence of one — a Game tree that must stay untouched is snapshotted
 * before and after.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkGamePaths, ensureGameDirectory, ensureGameFilesystemStructure, inspectGameFilesystemEvidence } from '../out/game-files.js';
import {
  GameFilesystemCoordinator,
  fileGameFilesystemStore
} from '../out/control-plane/game-filesystem-coordinator.js';
import { applyEvidenceToContract, createEmptyContract } from '../out/game-filesystem-contract.js';
import { StadiumClient } from '../out/stadium-client.js';
import { StadiumFilesystemContractCache } from '../out/stadium-filesystem-contract.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

const NOW = '2026-09-16T08:00:00.000Z';

function makeGame(tree = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's8-game-'));
  for (const [relativePath, content] of Object.entries(tree)) {
    const target = path.join(root, ...relativePath.split('/'));
    if (content === null) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
  }
  return root;
}

function snapshot(root) {
  const entries = [];
  const walk = (dir, prefix) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) { entries.push(`D ${relative}`); walk(full, relative); }
      else if (dirent.isFile()) entries.push(`F ${relative} ${fs.readFileSync(full, 'utf8')}`);
      else entries.push(`L ${relative}`);
    }
  };
  walk(root, '');
  return entries.join('\n');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, ms = 5_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return true; await wait(20); }
  return false;
}

// --- Part A: ensureGameDirectory / ensureGameFilesystemStructure (Stadium mechanics) ---

test('S8-1 ensureGameDirectory creates a missing folder and verifies it after creation', async () => {
  const root = makeGame();
  try {
    const result = await ensureGameDirectory(root, 'Reports-SLC');
    assert.equal(result.state, 'ready');
    assert.equal(result.created, true);
    assert.ok(fs.statSync(path.join(root, 'Reports-SLC')).isDirectory());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-2 ensureGameDirectory is idempotent on an existing directory: no error, not reported as created', async () => {
  const root = makeGame({ 'Reports-SLC': null });
  try {
    const before = snapshot(root);
    const result = await ensureGameDirectory(root, 'Reports-SLC');
    assert.equal(result.state, 'ready');
    assert.equal(result.created, false);
    assert.equal(snapshot(root), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-3 ensureGameDirectory never overwrites or deletes a file collision', async () => {
  const root = makeGame({ 'Reports-SLC': 'not a folder' });
  try {
    const result = await ensureGameDirectory(root, 'Reports-SLC');
    assert.equal(result.state, 'needs-attention');
    assert.equal(result.attention.code, 'name-collision');
    assert.equal(fs.readFileSync(path.join(root, 'Reports-SLC'), 'utf8'), 'not a folder');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-4 ensureGameDirectory rejects traversal and absolute paths without touching disk', async () => {
  const root = makeGame();
  try {
    const before = snapshot(root);
    for (const bad of ['../escape', '..\\escape', '/etc/passwd', 'C:\\Windows', 'a/../../b']) {
      const result = await ensureGameDirectory(root, bad);
      assert.equal(result.state, 'needs-attention');
      assert.notEqual(result.attention.code, undefined);
    }
    assert.equal(snapshot(root), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-5 ensureGameDirectory rejects a symlink/junction that escapes the Game root', async () => {
  const root = makeGame();
  const outside = makeGame();
  let linked = false;
  try {
    try {
      fs.symlinkSync(outside, path.join(root, 'Reports-SLC'), process.platform === 'win32' ? 'junction' : 'dir');
      linked = true;
    } catch { linked = false; }
    if (!linked) { assert.ok(true, 'skipped: environment does not allow junctions/symlinks'); return; }
    const result = await ensureGameDirectory(root, 'Reports-SLC');
    assert.equal(result.state, 'needs-attention');
    assert.equal(result.attention.code, 'escapes-game');
    assert.equal(fs.existsSync(path.join(outside, 'sideline-marker')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('S8-6 ensureGameFilesystemStructure creates the root then lanes underneath it in one pass', async () => {
  const root = makeGame();
  try {
    const result = await ensureGameFilesystemStructure(root, { root: { name: 'Reports-SLC' }, lanes: ['Codex', 'Claude'] });
    assert.equal(result.root.state, 'ready');
    assert.equal(result.root.created, true);
    assert.equal(result.lanes.Codex.state, 'ready');
    assert.equal(result.lanes.Claude.state, 'ready');
    assert.ok(fs.statSync(path.join(root, 'Reports-SLC', 'Codex')).isDirectory());
    assert.ok(fs.statSync(path.join(root, 'Reports-SLC', 'Claude')).isDirectory());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-7 ensureGameFilesystemStructure never creates lanes under a root that failed to create', async () => {
  const root = makeGame({ 'Reports-SLC': 'collision' });
  try {
    const result = await ensureGameFilesystemStructure(root, { root: { name: 'Reports-SLC' }, lanes: ['Codex'] });
    assert.equal(result.root.state, 'needs-attention');
    assert.deepEqual(result.lanes, {});
    assert.equal(fs.existsSync(path.join(root, 'Codex')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-8 ensureGameFilesystemStructure ensures lanes under an already-existing root without touching the root', async () => {
  const root = makeGame({ 'Reports/Claude/old.md': 'history' });
  try {
    const result = await ensureGameFilesystemStructure(root, { lanesRoot: 'Reports', lanes: ['Codex'] });
    assert.equal(result.root, undefined);
    assert.equal(result.lanes.Codex.state, 'ready');
    assert.equal(result.lanes.Codex.created, true);
    assert.equal(fs.readFileSync(path.join(root, 'Reports', 'Claude', 'old.md'), 'utf8'), 'history');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-9 a lane name collision is truthful and independent: other lanes still succeed', async () => {
  const root = makeGame({ 'Reports/Codex': 'not a folder' });
  try {
    const result = await ensureGameFilesystemStructure(root, { lanesRoot: 'Reports', lanes: ['Codex', 'Claude'] });
    assert.equal(result.lanes.Codex.state, 'needs-attention');
    assert.equal(result.lanes.Codex.attention.code, 'name-collision');
    assert.equal(result.lanes.Claude.state, 'ready');
    assert.equal(fs.readFileSync(path.join(root, 'Reports', 'Codex'), 'utf8'), 'not a folder');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- Part B: GameFilesystemCoordinator mutation-recording methods ---

function coordinator() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-store-'));
  const file = path.join(dir, 'game-filesystem.json');
  const coord = new GameFilesystemCoordinator(fileGameFilesystemStore(file), {
    evidenceProvider: async () => undefined,
    now: () => new Date(NOW)
  });
  return { coord, dir };
}

test('S8-10 recordReportsRootCreated sets created provenance, clears the pending action, and is idempotent', () => {
  const { coord, dir } = coordinator();
  try {
    const first = coord.recordReportsRootCreated('game-a', 'Reports-SLC', NOW);
    assert.equal(first.reports.provenance, 'created');
    assert.equal(first.reports.state, 'ready');
    assert.equal(first.reports.path, 'Reports-SLC');
    assert.equal(first.pendingReportsAction, undefined);
    assert.equal(first.revision, 1);

    const second = coord.recordReportsRootCreated('game-a', 'Reports-SLC', NOW);
    assert.equal(second.revision, 1, 'repeating an already-true fact must not churn the revision');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S11.1-9 recordSopRootCreated uses existing created provenance and is idempotent', () => {
  const { coord, dir } = coordinator();
  try {
    const first = coord.recordSopRootCreated('game-a', 'Plumbing SLC/SOP', NOW);
    assert.equal(first.sop.provenance, 'created');
    assert.equal(first.sop.state, 'ready');
    assert.equal(first.sop.path, 'Plumbing SLC/SOP');
    assert.equal(first.revision, 1);
    const second = coord.recordSopRootCreated('game-a', 'Plumbing SLC/SOP', NOW);
    assert.equal(second.revision, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S8-11 recordReportsRootAttention records a truthful failure without claiming Sideline created anything', () => {
  const { coord, dir } = coordinator();
  try {
    const first = coord.recordReportsRootAttention('game-a', { code: 'name-collision', detail: 'Reports-SLC' }, NOW);
    assert.equal(first.reports.provenance, 'none');
    assert.equal(first.reports.state, 'needs-attention');
    assert.equal(first.reports.attention.code, 'name-collision');
    assert.equal(first.pendingReportsAction, undefined);
    assert.equal(first.revision, 1);

    const second = coord.recordReportsRootAttention('game-a', { code: 'name-collision', detail: 'Reports-SLC' }, NOW);
    assert.equal(second.revision, 1, 'the same attention twice must not churn the revision');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S8-12 recordLaneEnsured adds distinct lanes and bumps revision once per new lane', () => {
  const { coord, dir } = coordinator();
  try {
    coord.recordReportsRootCreated('game-a', 'Reports-SLC', NOW);
    const withCodex = coord.recordLaneEnsured('game-a', 'Codex', 'Codex', { state: 'ready' }, NOW);
    assert.equal(withCodex.reports.lanes.Codex.state, 'ready');
    assert.equal(withCodex.revision, 2);
    const withClaude = coord.recordLaneEnsured('game-a', 'Claude', 'Claude', { state: 'ready' }, NOW);
    assert.equal(withClaude.reports.lanes.Claude.state, 'ready');
    assert.equal(withClaude.revision, 3);
    assert.equal(withClaude.reports.lanes.Codex.state, 'ready', 'the earlier lane is untouched');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S8-13 recordLaneEnsured never touches an already-recorded lane (roster shrink safe, idempotent)', () => {
  const { coord, dir } = coordinator();
  try {
    coord.recordReportsRootCreated('game-a', 'Reports-SLC', NOW);
    const withClaude = coord.recordLaneEnsured('game-a', 'Claude', 'Claude', { state: 'ready' }, NOW);
    const revisionAfterClaude = withClaude.revision;

    // Roster shrinks to Codex-only; a real ensure pass would never even ask about
    // Claude again, but even a direct repeat call must not delete or rewrite it.
    const repeat = coord.recordLaneEnsured('game-a', 'Claude', 'Claude', { state: 'needs-attention', attention: { code: 'create-failed' } }, NOW);
    assert.equal(repeat.revision, revisionAfterClaude, 'an existing lane record is never rewritten');
    assert.equal(repeat.reports.lanes.Claude.state, 'ready', 'history is preserved, not replaced by a different later outcome');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- Part C: StadiumClient wire contract (exact Game isolation, safety) ---

function gameContext(gameId, rootFsPath, stadiumId) {
  return {
    game: { gameId, displayName: gameId, fingerprintSource: 'git-remote', repoUri: `https://example.invalid/${gameId}.git` },
    stadium: { stadiumId, name: 'fixture', platform: process.platform, stadiumType: 'vscode-desktop' },
    binding: { gameId, stadiumId, rootFsPath, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  };
}

test('S8-14 Stadium rejects an ensure request for a Game it is not bound to, before any mutation runs', async () => {
  const root = makeGame();
  try {
    let response;
    const client = new StadiumClient({
      port: 1, dir: os.tmpdir(), autoReconnect: false,
      gameContextGetter: () => gameContext('game-a', root, 'stadium-a')
    });
    client.sendResponse = (_id, result) => { response = result; };
    const before = snapshot(root);
    await client.handleIncomingRequest({
      id: 1,
      method: 'game.filesystem.ensure',
      params: { gameId: 'game-b', revision: 0, root: { name: 'Reports-SLC' } }
    });
    assert.equal(response.success, false);
    assert.match(response.message, /Game mismatch/);
    assert.equal(snapshot(root), before, 'a wrong-Game ensure request must mutate nothing');
    client.dispose();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-15 Stadium ensure handler creates the canonical root and lanes for the exact bound Game', async () => {
  const root = makeGame();
  try {
    let response;
    const client = new StadiumClient({
      port: 1, dir: os.tmpdir(), autoReconnect: false,
      gameContextGetter: () => gameContext('game-a', root, 'stadium-a')
    });
    client.sendResponse = (_id, result) => { response = result; };
    await client.handleIncomingRequest({
      id: 1,
      method: 'game.filesystem.ensure',
      params: { gameId: 'game-a', revision: 0, root: { name: 'Reports-SLC' }, lanesRoot: 'Reports-SLC', lanes: ['Codex', 'Claude'] }
    });
    assert.equal(response.success, true);
    assert.equal(response.gameId, 'game-a');
    assert.equal(response.root.state, 'ready');
    assert.equal(response.lanes.Codex.state, 'ready');
    assert.equal(response.lanes.Claude.state, 'ready');
    assert.ok(fs.statSync(path.join(root, 'Reports-SLC', 'Codex')).isDirectory());
    client.dispose();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-16 the gameFiles.ensure test seam is used ahead of the real filesystem when supplied', async () => {
  const root = makeGame();
  try {
    let seamCalls = 0;
    let response;
    const client = new StadiumClient({
      port: 1, dir: os.tmpdir(), autoReconnect: false,
      gameContextGetter: () => gameContext('game-a', root, 'stadium-a'),
      gameFiles: { ensure: async () => { seamCalls += 1; return { root: { name: 'Reports-SLC', folder: 'Reports-SLC', created: true, state: 'ready' }, lanes: {} }; } }
    });
    client.sendResponse = (_id, result) => { response = result; };
    await client.handleIncomingRequest({ id: 1, method: 'game.filesystem.ensure', params: { gameId: 'game-a', revision: 0, root: { name: 'Reports-SLC' } } });
    assert.equal(seamCalls, 1);
    assert.equal(response.root.created, true);
    assert.equal(fs.existsSync(path.join(root, 'Reports-SLC')), false, 'the seam stood in for real fs mutation');
    client.dispose();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('S8-17 S7 apply compatibility: the post-ensure contract projects cleanly into the Stadium watch cache', () => {
  const cache = new StadiumFilesystemContractCache();
  const { coord, dir } = coordinator();
  try {
    coord.recordReportsRootCreated('game-a', 'Reports-SLC', NOW);
    const withLanes = coord.recordLaneEnsured('game-a', 'Codex', 'Codex', { state: 'ready' }, NOW);
    const result = cache.apply({
      gameId: 'game-a',
      revision: withLanes.revision,
      reports: { path: withLanes.reports.path, state: withLanes.reports.state },
      lanes: withLanes.reports.lanes
    });
    assert.equal(result.applied, true);
    assert.equal(cache.current.reportsReady, true);
    assert.equal(cache.canonicalAgent('Reports-SLC/Codex/report.md', 'win32'), 'Codex');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- Part D: full daemon integration (S6 decision -> S8 ensure -> durable contract) ---

async function wireHarness({
  tree = {},
  features = ['game.files.v1', 'game.filesystem.v1', 'game.filesystem.apply.v1', 'game.filesystem.ensure.v1'],
  gameId = `game_s8_${Math.random().toString(36).slice(2)}`,
  ensureOverride,
  checkOverride
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-wire-'));
  const gameRoot = makeGame(tree);
  const daemon = new ControlPlaneDaemon({ dir, port: 45700 + Math.floor(Math.random() * 400), idleTimeoutMs: 60_000 });
  await daemon.start();
  const instanceId = `session-${gameId}`;
  const calls = [];
  const cache = new StadiumFilesystemContractCache();
  const socket = {
    readyState: 1,
    send(raw) {
      const frame = JSON.parse(String(raw));
      calls.push(frame);
      if (frame.method === 'game.filesystem.inspect') {
        void (async () => {
          const evidenceModule = await import('../out/game-files.js');
          const evidence = await evidenceModule.inspectGameFilesystemEvidence(gameId, gameRoot, { checkPaths: frame.params.checkPaths ?? [] });
          daemon.handleWsResponseForTest(frame.id, { success: true, gameId, evidence });
        })();
      } else if (frame.method === 'game.files.check') {
        const checked = checkOverride
          ? Promise.resolve(checkOverride({ gameRoot, paths: frame.params.paths ?? [], frame }))
          : checkGamePaths(gameRoot, frame.params.paths ?? []);
        void checked.then((checks) =>
          daemon.handleWsResponseForTest(frame.id, { success: true, gameId, checks })
        );
      } else if (frame.method === 'game.filesystem.apply') {
        const applied = cache.apply(frame.params);
        daemon.handleWsResponseForTest(frame.id, { ...applied, gameId });
      } else if (frame.method === 'game.filesystem.ensure') {
        void (async () => {
          const request = { root: frame.params.root, lanesRoot: frame.params.lanesRoot, lanes: frame.params.lanes };
          const result = ensureOverride
            ? await ensureOverride({ gameRoot, request, frame })
            : await ensureGameFilesystemStructure(gameRoot, request);
          daemon.handleWsResponseForTest(frame.id, { success: true, gameId, revision: frame.params.revision, ...result });
        })();
      }
    },
    close() {}
  };
  daemon.registryInstance.registerSession({
    instanceId, stadiumId: `stadium-${gameId}`, name: gameId, platform: process.platform, socket,
    lastHeartbeat: Date.now(), game: { gameId, displayName: gameId, fingerprintSource: 'test' }, rootFsPath: gameRoot,
    roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features
  });
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };
  const roster = (entries) => entries.map((entry) => ({ id: entry.id, name: entry.name, instances: entry.instances ?? [] }));
  return {
    daemon, gameId, gameRoot, dir, calls, cache, api,
    snapshotGame: () => snapshot(gameRoot),
    async reinspect() { return api('/api/games/filesystem/reinspect', { method: 'POST', body: JSON.stringify({ gameId }) }); },
    setRoster(entries) { daemon.registryInstance.updateRoster(instanceId, roster(entries)); },
    async cleanup() { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(gameRoot, { recursive: true, force: true }); }
  };
}

const CODEX_CLAUDE_ROSTER = [
  { id: 'codex', name: 'Codex', instances: [{ instanceId: 'i1' }] },
  { id: 'claude', name: 'Claude', instances: [{ instanceId: 'i2' }] },
  { id: 'antigravity', name: 'AntiGravity', instances: [] },
  { id: 'terminal', name: 'Terminal', instances: [{ instanceId: 'i3' }] }
];

test('S11.1-1 brand-new Game creates Plumbing SLC Reports/SOP and roster-only lanes', async () => {
  const harness = await wireHarness();
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const reinspected = await harness.reinspect();
    assert.equal(reinspected.status, 200);
    assert.equal(reinspected.body.gameSetup.reports.provenance, 'Created by Sideline');
    assert.equal(reinspected.body.gameSetup.reports.label, 'Plumbing SLC/Reports');
    assert.equal(reinspected.body.gameSetup.sop.label, 'Plumbing SLC/SOP');
    assert.equal(reinspected.body.gameSetup.sop.provenance, 'Created by Sideline');
    const laneKeys = reinspected.body.gameSetup.reports.lanes.map((lane) => lane.key).sort();
    assert.deepEqual(laneKeys, ['Claude', 'Codex']);
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'Codex')).isDirectory());
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'Claude')).isDirectory());
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')).isDirectory());
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'AntiGravity')), false, 'no speculative lane for an empty-instance provider');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Diagnostics')), false, 'Diagnostics remains future-only');
    assert.equal(harness.cache.current.reportsPath, 'Plumbing SLC/Reports', 'S7 consumes the nested coordinate unchanged');
    assert.equal(harness.cache.canonicalAgent('Plumbing SLC/Reports/Codex/report.md', 'win32'), 'Codex');
    assert.equal(
      harness.daemon.resolveCanonicalReportDestination(harness.gameId, 'codex', ['game.filesystem.apply.v1']),
      'Plumbing SLC/Reports/Codex/',
      'S9 consumes the same contract coordinate and lane unchanged'
    );
  } finally { await harness.cleanup(); }
});

test('S11.1-2 existing lowercase Reports/ is adopted; Plumbing is never created; lanes land inside Reports/', async () => {
  const harness = await wireHarness({ tree: { 'Reports/Claude/old.md': 'history' } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const reinspected = await harness.reinspect();
    await until(() => fs.existsSync(path.join(harness.gameRoot, 'Reports', 'Codex')));
    assert.equal(reinspected.body.gameSetup.reports.label, 'Reports');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Reports-SLC')), false);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Reports', 'Codex')).isDirectory());
    assert.equal(fs.readFileSync(path.join(harness.gameRoot, 'Reports', 'Claude', 'old.md'), 'utf8'), 'history');
  } finally { await harness.cleanup(); }
});

test('S11.1-3 existing uppercase REPORTS/ preserves on-disk casing; Plumbing is never created', async () => {
  const harness = await wireHarness({ tree: { 'REPORTS/Codex/old.md': 'x' } });
  try {
    const reinspected = await harness.reinspect();
    assert.equal(reinspected.body.gameSetup.reports.label, 'REPORTS');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Reports-SLC')), false);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-4 existing Docs REPORT/ is preserved; Plumbing is never created', async () => {
  const harness = await wireHarness({ tree: { 'Docs REPORT/Codex/old.md': 'x' } });
  try {
    const reinspected = await harness.reinspect();
    assert.equal(reinspected.body.gameSetup.reports.label, 'Docs REPORT');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Reports-SLC')), false);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
  } finally { await harness.cleanup(); }
});

test('S8-22 an ambiguous Game (two populated roots) never mutates the filesystem', async () => {
  const harness = await wireHarness({ tree: { 'Reports/Claude/a.md': 'a', 'Docs REPORT/Codex/b.md': 'b' } });
  try {
    const before = harness.snapshotGame();
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const reinspected = await harness.reinspect();
    assert.equal(reinspected.body.gameSetup.reports.state, 'needs-choice');
    assert.equal(harness.snapshotGame(), before);
    assert.equal(harness.calls.some((frame) => frame.method === 'game.filesystem.ensure'), false, 'ambiguity must never reach the mutation RPC');
  } finally { await harness.cleanup(); }
});

test('S8-23 a Reports-SLC file collision blocks creation truthfully and mutates nothing', async () => {
  const harness = await wireHarness({ tree: { 'Reports-SLC': 'not a folder' } });
  try {
    const before = harness.snapshotGame();
    const reinspected = await harness.reinspect();
    assert.equal(reinspected.body.gameSetup.reports.state, 'needs-attention');
    assert.equal(harness.snapshotGame(), before);

    // A second reinspect (roster/reconnect retry) must still never overwrite the file.
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    await harness.reinspect();
    assert.equal(harness.snapshotGame(), before);
    assert.equal(fs.readFileSync(path.join(harness.gameRoot, 'Reports-SLC'), 'utf8'), 'not a folder');
  } finally { await harness.cleanup(); }
});

test('S11.1-5 idempotent ensure: running the ensure pass again creates nothing new and does not churn the revision', async () => {
  const harness = await wireHarness();
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    await harness.reinspect();
    const revisionAfterFirstEnsure = harness.daemon.gameFilesystemInstance.get(harness.gameId).revision;
    const before = harness.snapshotGame();
    const ensureCallsAfterFirst = harness.calls.filter((frame) => frame.method === 'game.filesystem.ensure').length;

    // Re-run the exact S8.0 ensure pass on its own (no fresh evidence re-verification
    // in between), proving the ensure step itself is idempotent.
    await harness.daemon.runFilesystemEnsure(harness.gameId);

    assert.equal(harness.daemon.gameFilesystemInstance.get(harness.gameId).revision, revisionAfterFirstEnsure, 'repeating ensure must not bump the revision again');
    assert.equal(harness.snapshotGame(), before, 'repeating ensure creates nothing additional on disk');
    assert.equal(harness.calls.filter((frame) => frame.method === 'game.filesystem.ensure').length, ensureCallsAfterFirst, 'a second ensure pass with nothing missing never calls the mutation RPC again');
    const status = await harness.api(`/api/games/filesystem?gameId=${harness.gameId}`);
    assert.deepEqual(status.body.gameSetup.reports.lanes.map((l) => l.key).sort(), ['Claude', 'Codex']);
  } finally { await harness.cleanup(); }
});

test('S11.1-6 duplicate instances of the same provider still produce exactly one lane', async () => {
  const harness = await wireHarness();
  try {
    harness.setRoster([
      { id: 'codex', name: 'Codex', instances: [{ instanceId: 'a' }, { instanceId: 'b' }] },
      { id: 'claude', name: 'Claude', instances: [] },
      { id: 'antigravity', name: 'AntiGravity', instances: [] },
      { id: 'terminal', name: 'Terminal', instances: [] }
    ]);
    await harness.reinspect();
    const status = await harness.api(`/api/games/filesystem?gameId=${harness.gameId}`);
    assert.deepEqual(status.body.gameSetup.reports.lanes.map((l) => l.key), ['Codex']);
  } finally { await harness.cleanup(); }
});

test('S11.1-7 roster shrink never deletes a provider\'s existing report lane', async () => {
  const harness = await wireHarness();
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    await harness.reinspect();
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'Claude')).isDirectory());

    harness.setRoster([
      { id: 'codex', name: 'Codex', instances: [{ instanceId: 'i1' }] },
      { id: 'claude', name: 'Claude', instances: [] },
      { id: 'antigravity', name: 'AntiGravity', instances: [] },
      { id: 'terminal', name: 'Terminal', instances: [] }
    ]);
    await harness.reinspect();
    const status = await harness.api(`/api/games/filesystem?gameId=${harness.gameId}`);
    const laneKeys = status.body.gameSetup.reports.lanes.map((l) => l.key).sort();
    assert.ok(laneKeys.includes('Claude'), 'Claude lane history remains even though Claude left the roster');
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'Claude')).isDirectory(), 'the folder itself is never deleted');
  } finally { await harness.cleanup(); }
});

test('S11.1-8 exact Game isolation: ensuring Game A never mutates Game B\'s tree', async () => {
  const harnessA = await wireHarness();
  const harnessB = await wireHarness();
  try {
    const beforeB = harnessB.snapshotGame();
    harnessA.setRoster(CODEX_CLAUDE_ROSTER);
    await harnessA.reinspect();
    assert.ok(fs.existsSync(path.join(harnessA.gameRoot, 'Plumbing SLC')));
    assert.equal(harnessB.snapshotGame(), beforeB, 'Game B is untouched by Game A\'s bootstrap');
    assert.equal(fs.existsSync(path.join(harnessB.gameRoot, 'Reports-SLC')), false);
    assert.equal(fs.existsSync(path.join(harnessB.gameRoot, 'Plumbing SLC')), false);
  } finally {
    await harnessA.cleanup();
    await harnessB.cleanup();
  }
});

test('S8-28 an offline Game (Stadium disconnected) is never mutated by a reinspect retry', async () => {
  const harness = await wireHarness();
  try {
    harness.daemon.registryInstance.removeSession(`session-${harness.gameId}`);
    const before = harness.snapshotGame();
    const reinspected = await harness.reinspect();
    assert.equal(reinspected.status, 409);
    assert.equal(harness.snapshotGame(), before);
    assert.equal(harness.calls.some((frame) => frame.method === 'game.filesystem.ensure'), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-10 Reports-SLC remains canonical and is never migrated', async () => {
  const harness = await wireHarness({ tree: { 'Reports-SLC/Claude/history.md': 'legacy' } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'Reports-SLC');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
    assert.equal(fs.readFileSync(path.join(harness.gameRoot, 'Reports-SLC', 'Claude', 'history.md'), 'utf8'), 'legacy');
    assert.ok(await until(() => fs.existsSync(path.join(harness.gameRoot, 'Reports-SLC', 'Codex'))));
  } finally { await harness.cleanup(); }
});

test('S11.1-11 established Reports without SOP does not create Plumbing merely to supply SOP', async () => {
  const harness = await wireHarness({ tree: { 'Reports/Codex/history.md': 'keep' } });
  try {
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'Reports');
    assert.equal(result.body.gameSetup.sop.label, 'Not set');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-12 established Reports and Project SOP are adopted independently with no Plumbing', async () => {
  const harness = await wireHarness({ tree: { 'REPORTS/Codex/history.md': 'keep', 'Project SOP/guide.md': 'guide' } });
  try {
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'REPORTS');
    assert.equal(result.body.gameSetup.sop.label, 'Project SOP');
    assert.equal(harness.snapshotGame(), before);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-13 recognized existing SOP families remain in place and do not trigger Plumbing', async () => {
  for (const sopName of ['Project SOP', 'Onboarding-Docs', 'Onboarding-SOP', 'SOP']) {
    const harness = await wireHarness({ tree: { [`${sopName}/guide.md`]: sopName } });
    try {
      const before = harness.snapshotGame();
      const result = await harness.reinspect();
      assert.equal(result.body.gameSetup.sop.label, sopName);
      assert.equal(result.body.gameSetup.reports.label, 'Not set');
      assert.equal(harness.snapshotGame(), before);
      assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), false);
    } finally { await harness.cleanup(); }
  }
});

test('S11.1-14 partial Plumbing Reports creates only SOP and required lanes', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/Reports': null } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'Plumbing SLC/Reports');
    assert.equal(result.body.gameSetup.reports.provenance, 'Using existing folder');
    assert.equal(result.body.gameSetup.sop.label, 'Plumbing SLC/SOP');
    assert.equal(result.body.gameSetup.sop.provenance, 'Created by Sideline');
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'Codex')).isDirectory());
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')).isDirectory());
  } finally { await harness.cleanup(); }
});

test('S11.1-15 partial Plumbing SOP creates only Reports and required lanes', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/SOP': null } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.sop.label, 'Plumbing SLC/SOP');
    assert.equal(result.body.gameSetup.sop.provenance, 'Automatically selected');
    assert.equal(result.body.gameSetup.reports.label, 'Plumbing SLC/Reports');
    assert.equal(result.body.gameSetup.reports.provenance, 'Created by Sideline');
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports', 'Claude')).isDirectory());
  } finally { await harness.cleanup(); }
});

test('S11.1-16 empty Plumbing parent completes Reports, SOP and roster lanes', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC': null } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'Plumbing SLC/Reports');
    assert.equal(result.body.gameSetup.sop.label, 'Plumbing SLC/SOP');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Diagnostics')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-17 Plumbing Reports and Project SOP remain independent', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/Reports/Codex/history.md': 'keep', 'Project SOP/guide.md': 'guide' } });
  try {
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'Plumbing SLC/Reports');
    assert.equal(result.body.gameSetup.sop.label, 'Project SOP');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-18 meaningful Plumbing Reports and REPORTS require choice and mutate nothing', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/Reports/Codex/a.md': 'a', 'REPORTS/Claude/b.md': 'b' } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.state, 'needs-choice');
    assert.equal(harness.snapshotGame(), before);
    assert.equal(harness.calls.some((frame) => frame.method === 'game.filesystem.ensure'), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-19 Plumbing parent file collision is Needs Attention and preserves bytes', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC': 'do not overwrite' } });
  try {
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.state, 'needs-attention');
    assert.equal(harness.snapshotGame(), before);
    assert.equal(fs.readFileSync(path.join(harness.gameRoot, 'Plumbing SLC'), 'utf8'), 'do not overwrite');
  } finally { await harness.cleanup(); }
});

test('S11.1-20 Plumbing Reports child file collision blocks all bootstrap mutation', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/Reports': 'do not overwrite' } });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.state, 'needs-attention');
    assert.equal(harness.snapshotGame(), before);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-21 escaping Plumbing Reports junction is rejected without outside mutation', async () => {
  const root = makeGame({ 'Plumbing SLC': null });
  const outside = makeGame({ 'secret.md': 'outside' });
  let linked = false;
  try {
    try {
      fs.symlinkSync(outside, path.join(root, 'Plumbing SLC', 'Reports'), process.platform === 'win32' ? 'junction' : 'dir');
      linked = true;
    } catch { linked = false; }
    if (!linked) { assert.ok(true, 'skipped: environment does not allow junctions/symlinks'); return; }
    const harness = await wireHarness({ tree: {} });
    try {
      fs.rmSync(harness.gameRoot, { recursive: true, force: true });
      fs.renameSync(root, harness.gameRoot);
      const outsideBefore = snapshot(outside);
      const result = await harness.reinspect();
      assert.equal(result.body.gameSetup.reports.state, 'needs-attention');
      assert.equal(snapshot(outside), outsideBefore);
      assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')), false);
    } finally { await harness.cleanup(); }
  } finally {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('S11.1-22 unique Plumbing casing is preserved while missing children use that parent casing', async () => {
  const harness = await wireHarness({ tree: { 'PLUMBING SLC/rEpOrTs': null } });
  try {
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.label, 'PLUMBING SLC/rEpOrTs');
    assert.equal(result.body.gameSetup.sop.label, 'PLUMBING SLC/SOP');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC')), process.platform === 'win32');
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'PLUMBING SLC', 'SOP')).isDirectory());
  } finally { await harness.cleanup(); }
});

test('S11.1-23 clean bootstrap requires a Stadium that supports read-only preflight', async () => {
  const harness = await wireHarness({ features: ['game.filesystem.v1', 'game.filesystem.ensure.v1'] });
  try {
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.status, 200);
    assert.equal(harness.snapshotGame(), before);
    assert.equal(harness.calls.some((frame) => frame.method === 'game.filesystem.ensure'), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-24 unexpected child-create failure leaves truthful partial state and never rolls back parent', async () => {
  let failedReports = false;
  const harness = await wireHarness({
    ensureOverride: async ({ gameRoot, request }) => {
      if (request.root?.name === 'Plumbing SLC/Reports' && !failedReports) {
        failedReports = true;
        return { root: { name: request.root.name, folder: request.root.name, created: false, state: 'needs-attention', attention: { code: 'create-failed', detail: request.root.name } }, lanes: {} };
      }
      return ensureGameFilesystemStructure(gameRoot, request);
    }
  });
  try {
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.state, 'needs-attention');
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC')).isDirectory(), 'successfully created parent remains');
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports')), false);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-25 stale create-reports-slc intent is re-decided from fresh evidence before mutation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's11-legacy-store-'));
  const file = path.join(dir, 'game-filesystem.json');
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    games: {
      legacy: {
        schemaVersion: 1,
        gameId: 'legacy',
        revision: 4,
        reports: { provenance: 'none', state: 'not-set', lanes: {} },
        sop: { provenance: 'none', state: 'not-set' },
        pendingReportsAction: 'create-reports-slc'
      }
    }
  }), 'utf8');
  const coord = new GameFilesystemCoordinator(fileGameFilesystemStore(file), {
    evidenceProvider: async () => ({
      gameId: 'legacy', rootResolvable: true,
      reportRootEntries: [{ name: 'Reports', recognized: 'Reports', kind: 'folder', safety: 'ok', reportFiles: 1, reportFilesTruncated: false }],
      nestedReportRoots: [], sopRootEntries: [],
      checks: [
        { path: 'Plumbing SLC', state: 'missing' },
        { path: 'Plumbing SLC/Reports', state: 'missing' },
        { path: 'Plumbing SLC/SOP', state: 'missing' }
      ],
      observedAt: NOW, truncated: false
    }),
    now: () => new Date(NOW)
  });
  try {
    const result = await coord.reconcile('legacy');
    assert.equal(result.contract.reports.path, 'Reports');
    assert.equal(result.contract.pendingReportsAction, undefined);
    assert.equal(result.bootstrapPlan, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S11.1-26 S10 Reports/SOP human overrides win and Restore re-detects Plumbing when unambiguous', async () => {
  const harness = await wireHarness({ tree: { 'Existing Stuff/My Reports': null, 'Existing Stuff/My SOP': null } });
  try {
    harness.setRoster([{ id: 'codex', name: 'Codex', instances: [{ instanceId: 'i1' }] }]);
    await harness.reinspect();
    const reportsChoice = await harness.api('/api/games/filesystem/choose', {
      method: 'POST',
      body: JSON.stringify({ gameId: harness.gameId, kind: 'reports', path: 'Existing Stuff/My Reports' })
    });
    assert.equal(reportsChoice.status, 200);
    assert.equal(reportsChoice.body.gameSetup.reports.label, 'Existing Stuff/My Reports');
    assert.equal(reportsChoice.body.gameSetup.reports.provenance, 'Chosen by you');
    assert.equal(
      harness.daemon.resolveCanonicalReportDestination(harness.gameId, 'codex', ['game.filesystem.apply.v1']),
      'Existing Stuff/My Reports/Codex/'
    );

    const sopChoice = await harness.api('/api/games/filesystem/choose', {
      method: 'POST',
      body: JSON.stringify({ gameId: harness.gameId, kind: 'sop', path: 'Existing Stuff/My SOP' })
    });
    assert.equal(sopChoice.status, 200);
    assert.equal(sopChoice.body.gameSetup.sop.label, 'Existing Stuff/My SOP');
    assert.equal(sopChoice.body.gameSetup.sop.provenance, 'Chosen by you');

    const restoreReports = await harness.api('/api/games/filesystem/restore', {
      method: 'POST', body: JSON.stringify({ gameId: harness.gameId, kind: 'reports' })
    });
    assert.equal(restoreReports.status, 200);
    assert.equal(restoreReports.body.gameSetup.reports.label, 'Plumbing SLC/Reports');
    assert.ok(fs.statSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports')).isDirectory(), 'the default was never deleted');
  } finally { await harness.cleanup(); }
});

test('S11.1-27 SOP child file collision is Needs Attention and blocks workspace completion', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/SOP': 'do not overwrite' } });
  try {
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.sop.state, 'needs-attention');
    assert.equal(harness.snapshotGame(), before);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'Reports')), false);
  } finally { await harness.cleanup(); }
});

test('S11.1-28 provider-lane collision is preflighted before a missing SOP child is created', async () => {
  const harness = await wireHarness({ tree: { 'Plumbing SLC/Reports/Codex': 'collision' } });
  try {
    harness.setRoster([{ id: 'codex', name: 'Codex', instances: [{ instanceId: 'i1' }] }]);
    const before = harness.snapshotGame();
    const result = await harness.reinspect();
    assert.equal(result.body.gameSetup.reports.lanes.find((lane) => lane.key === 'Codex').ready, false);
    assert.equal(fs.existsSync(path.join(harness.gameRoot, 'Plumbing SLC', 'SOP')), false, 'preflight blocks all planned mutation');
    assert.equal(harness.snapshotGame().includes('F Plumbing SLC/Reports/Codex collision'), true);
    assert.equal(before.includes('F Plumbing SLC/Reports/Codex collision'), true);
  } finally { await harness.cleanup(); }
});

test('S11.1-29 multiple Plumbing case variants become Needs Attention instead of a guess', () => {
  const evidence = {
    gameId: 'case-game', rootResolvable: true,
    reportRootEntries: [],
    nestedReportRoots: [
      { path: 'Plumbing SLC/Reports', reportFiles: 1 },
      { path: 'PLUMBING SLC/REPORTS', reportFiles: 1 }
    ],
    sopRootEntries: [],
    checks: [
      { path: 'Plumbing SLC', state: 'folder' },
      { path: 'PLUMBING SLC', state: 'folder' },
      { path: 'Plumbing SLC/Reports', state: 'folder' },
      { path: 'PLUMBING SLC/REPORTS', state: 'folder' }
    ],
    observedAt: NOW, truncated: false
  };
  const contract = applyEvidenceToContract(createEmptyContract('case-game'), evidence, NOW);
  assert.equal(contract.reports.state, 'needs-attention');
  assert.equal(contract.reports.attention.code, 'multiple-case-variants');
  assert.equal(contract.reports.path, undefined);
});

test('S11.1-30 reserved Plumbing Reports evidence survives the bounded nested-root list', async () => {
  const root = makeGame({ 'Plumbing SLC/Reports': null });
  try {
    const reportPaths = Array.from({ length: 8 }, (_, index) => `Legacy ${index}/Reports/history.md`);
    const evidence = await inspectGameFilesystemEvidence('bounded-game', root, { reportPaths });
    assert.equal(evidence.nestedReportRoots.length, 8);
    assert.equal(evidence.nestedReportRoots[0].path, 'Plumbing SLC/Reports');
    assert.ok(evidence.nestedReportRoots.some((entry) => entry.path === 'Plumbing SLC/Reports'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S11.1-31 incomplete preflight response authorizes no bootstrap mutation', async () => {
  const harness = await wireHarness({ checkOverride: async () => [] });
  try {
    harness.setRoster(CODEX_CLAUDE_ROSTER);
    const before = harness.snapshotGame();
    await harness.reinspect();
    assert.equal(harness.snapshotGame(), before);
    assert.equal(harness.calls.some((frame) => frame.method === 'game.filesystem.ensure'), false);
  } finally {
    await harness.cleanup();
  }
});
