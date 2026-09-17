/**
 * S10.0 — Game Setup Canonical Folder Controls.
 *
 * Sideline chooses automatically. A human "No, use this folder" outranks
 * that automatic choice. This slice adds the mutation boundary
 * (`/api/games/filesystem/choose`, `/api/games/filesystem/restore`) that
 * records that human choice through the exact same S6 `GameFilesystemCoordinator`
 * authority (`recordHumanChoice` / `clearChoice`) S6 already reserved for it —
 * no second settings store, no filesystem mutation, no new persistence concept.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkGamePaths, inspectGameFilesystemEvidence, browseGameDirectory, ensureGameFilesystemStructure } from '../out/game-files.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

function makeGame(tree = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's10-game-'));
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

/** One daemon, one or more registered Games, each backed by a real folder tree
 * and a fake Stadium socket that answers inspect/ensure/check/apply RPCs against
 * that real tree — the same fixture shape S8's own wire-integration tests use. */
async function wireHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's10-wire-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 46200 + Math.floor(Math.random() * 400), idleTimeoutMs: 60_000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };
  const games = new Map(); // gameId -> { root, calls }

  return {
    daemon, dir, api,
    registerGame(gameId, { tree = {}, features = ['game.files.v1', 'game.filesystem.v1', 'game.filesystem.apply.v1', 'game.filesystem.ensure.v1'], capabilities = [] } = {}) {
      const root = makeGame(tree);
      const calls = [];
      const socket = {
        readyState: 1,
        send(raw) {
          const frame = JSON.parse(String(raw));
          calls.push(frame);
          if (frame.method === 'game.filesystem.inspect') {
            void (async () => {
              const evidence = await inspectGameFilesystemEvidence(gameId, root, { checkPaths: frame.params.checkPaths ?? [] });
              daemon.handleWsResponseForTest(frame.id, { success: true, gameId, evidence });
            })();
          } else if (frame.method === 'game.files.check') {
            void (async () => {
              const checks = await checkGamePaths(root, frame.params.paths ?? []);
              daemon.handleWsResponseForTest(frame.id, { success: true, gameId, checkedAt: Date.now(), checks });
            })();
          } else if (frame.method === 'game.files.browse') {
            void (async () => {
              const result = await browseGameDirectory(root, frame.params.dir ?? '');
              daemon.handleWsResponseForTest(frame.id, { success: true, gameId, ...result });
            })();
          } else if (frame.method === 'game.filesystem.ensure') {
            void (async () => {
              const result = await ensureGameFilesystemStructure(root, { root: frame.params.root, lanesRoot: frame.params.lanesRoot, lanes: frame.params.lanes });
              daemon.handleWsResponseForTest(frame.id, { success: true, gameId, revision: frame.params.revision, ...result });
            })();
          } else if (frame.method === 'game.filesystem.apply') {
            daemon.handleWsResponseForTest(frame.id, { success: true, gameId, revision: frame.params.revision, applied: true });
          }
        },
        close() {}
      };
      daemon.registryInstance.registerSession({
        instanceId: `session-${gameId}`, stadiumId: `stadium-${gameId}`, name: gameId, platform: process.platform, socket,
        lastHeartbeat: Date.now(), game: { gameId, displayName: gameId, fingerprintSource: 'test' }, rootFsPath: root,
        roster: [], capabilities, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features
      });
      games.set(gameId, { root, calls, instanceId: `session-${gameId}` });
      return games.get(gameId);
    },
    disconnectGame(gameId) {
      daemon.registryInstance.removeSession(`session-${gameId}`);
    },
    gameRoot(gameId) { return games.get(gameId).root; },
    gameCalls(gameId) { return games.get(gameId).calls; },
    snapshotGame(gameId) { return snapshot(games.get(gameId).root); },
    async reinspect(gameId) { return api('/api/games/filesystem/reinspect', { method: 'POST', body: JSON.stringify({ gameId }) }); },
    async choose(gameId, kind, folderPath) {
      return api('/api/games/filesystem/choose', { method: 'POST', body: JSON.stringify({ gameId, kind, path: folderPath }) });
    },
    async restore(gameId, kind) {
      return api('/api/games/filesystem/restore', { method: 'POST', body: JSON.stringify({ gameId, kind }) });
    },
    async getSetup(gameId) { return api(`/api/games/filesystem?gameId=${encodeURIComponent(gameId)}`); },
    async cleanup() {
      await daemon.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      for (const { root } of games.values()) fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

// --- 1/3 — auto-detected roots read truthfully -----------------------------

test('S10-1 ready auto-detected Reports root: label and Dad-facing provenance are truthful', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Reports/old.md': 'x' } });
    const reinspected = await h.reinspect('g1');
    assert.equal(reinspected.body.gameSetup.reports.label, 'Reports');
    // Reports auto-adoption is provenance 'adopted' — S6's own Dad-facing label
    // for that is "Using existing folder" (never fabricated as "detected").
    assert.equal(reinspected.body.gameSetup.reports.provenance, 'Using existing folder');
    assert.equal(reinspected.body.gameSetup.reports.state, 'ready');
  } finally { await h.cleanup(); }
});

test('S10-3 SOP auto-detected root: label and provenance "Automatically selected"', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Onboarding-Docs/readme.md': 'x' } });
    const reinspected = await h.reinspect('g1');
    assert.equal(reinspected.body.gameSetup.sop.label, 'Onboarding-Docs');
    assert.equal(reinspected.body.gameSetup.sop.provenance, 'Automatically selected');
  } finally { await h.cleanup(); }
});

// --- 2/4 — human-selected roots ---------------------------------------------

test('S10-2 human-selected Reports root: nested folder, exact path, "Chosen by you"', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Custom Folder/Reports': null } });
    const chosen = await h.choose('g1', 'reports', 'Custom Folder/Reports');
    assert.equal(chosen.status, 200);
    assert.equal(chosen.body.gameSetup.reports.label, 'Custom Folder/Reports');
    assert.equal(chosen.body.gameSetup.reports.provenance, 'Chosen by you');
    assert.equal(chosen.body.gameSetup.reports.state, 'ready');
  } finally { await h.cleanup(); }
});

test('S10-4 human-selected SOP root: "Chosen by you"', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'My Docs/SOP': null } });
    const chosen = await h.choose('g1', 'sop', 'My Docs/SOP');
    assert.equal(chosen.status, 200);
    assert.equal(chosen.body.gameSetup.sop.label, 'My Docs/SOP');
    assert.equal(chosen.body.gameSetup.sop.provenance, 'Chosen by you');
  } finally { await h.cleanup(); }
});

// --- 5 — reuses the existing neutral Browse Game surface --------------------

test('S10-5 folder choice uses the exact same read-only browse endpoint the neutral Browse Game UI already calls', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Custom Folder/Reports': null } });
    const browsed = await h.api(`/api/games/files/browse?gameId=g1&dir=${encodeURIComponent('Custom Folder')}`);
    assert.equal(browsed.status, 200);
    assert.ok(browsed.body.entries.some((entry) => entry.name === 'Reports' && entry.kind === 'folder'));
  } finally { await h.cleanup(); }
});

// --- 6 — folder-only selection ----------------------------------------------

test('S10-6 a file can never be chosen as a canonical folder', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'notes.txt': 'hello' } });
    const before = h.snapshotGame('g1');
    const chosen = await h.choose('g1', 'reports', 'notes.txt');
    assert.equal(chosen.status, 409);
    assert.match(chosen.body.message, /Can't use this location/);
    const setup = await h.getSetup('g1');
    assert.equal(setup.body.gameSetup.reports.state, 'not-set');
    assert.equal(h.snapshotGame('g1'), before);
  } finally { await h.cleanup(); }
});

// --- 7 — read-only browse never mutates the contract (explicit confirmation only) --

test('S10-7 browsing into folders never records a choice; only /choose does', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Custom Folder/Reports': null } });
    const before = await h.getSetup('g1');
    await h.api(`/api/games/files/browse?gameId=g1&dir=${encodeURIComponent('Custom Folder')}`);
    await h.api(`/api/games/files/browse?gameId=g1&dir=${encodeURIComponent('Custom Folder/Reports')}`);
    const after = await h.getSetup('g1');
    assert.deepEqual(after.body.gameSetup, before.body.gameSetup, 'navigating alone never changes the contract');
  } finally { await h.cleanup(); }
});

// --- 8/9 — exact Game isolation + stale-picker protection --------------------

test('S10-8 exact Game isolation: choosing for Game A never writes Game B\'s contract', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('a', { tree: { ReportsA: null } });
    h.registerGame('b', { tree: { ReportsB: null } });
    await h.choose('a', 'reports', 'ReportsA');
    const setupB = await h.getSetup('b');
    assert.equal(setupB.body.gameSetup.reports.state, 'not-set');
  } finally { await h.cleanup(); }
});

test('S10-9 explicit gameId wins regardless of which Game is currently "selected" elsewhere', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('a', { tree: { ReportsA: null } });
    h.registerGame('b', { tree: { ReportsB: null } });
    h.daemon.registryInstance.setSelectedGameId('b'); // ambient selection is Game B
    const chosen = await h.choose('a', 'reports', 'ReportsA'); // explicit gameId is Game A
    assert.equal(chosen.status, 200);
    assert.equal(chosen.body.gameId, 'a');
    const setupA = await h.getSetup('a');
    const setupB = await h.getSetup('b');
    assert.equal(setupA.body.gameSetup.reports.provenance, 'Chosen by you');
    assert.equal(setupB.body.gameSetup.reports.state, 'not-set', 'the ambient "selected" Game is never touched by an explicit-gameId choice');
  } finally { await h.cleanup(); }
});

// --- 10 — disconnected Game: no false save ----------------------------------

test('S10-10 a disconnected Game rejects choose/restore with no contract change', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null } });
    h.disconnectGame('g1');
    const before = await h.getSetup('g1');
    const chosen = await h.choose('g1', 'reports', 'Reports');
    assert.equal(chosen.status, 409);
    assert.equal(chosen.body.status, 'offline');
    const after = await h.getSetup('g1');
    assert.deepEqual(after.body.gameSetup, before.body.gameSetup);
  } finally { await h.cleanup(); }
});

// --- 11 — invalid / escaping path --------------------------------------------

test('S10-11 traversal/escaping paths are rejected and never mutate the tree', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', {});
    const before = h.snapshotGame('g1');
    for (const bad of ['../escape', '..\\escape', '/etc/passwd', 'a/../../b']) {
      const chosen = await h.choose('g1', 'reports', bad);
      assert.ok(chosen.status === 409 || chosen.status === 400, `expected rejection for ${bad}, got ${chosen.status}`);
    }
    const setup = await h.getSetup('g1');
    assert.equal(setup.body.gameSetup.reports.state, 'not-set');
    assert.equal(h.snapshotGame('g1'), before);
  } finally { await h.cleanup(); }
});

// --- 12 — nested path with spaces preserved exactly --------------------------

test('S10-12 a nested path with spaces is preserved exactly, byte for byte', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Some Folder/Reports Here': null } });
    const chosen = await h.choose('g1', 'reports', 'Some Folder/Reports Here');
    assert.equal(chosen.body.gameSetup.reports.label, 'Some Folder/Reports Here');
  } finally { await h.cleanup(); }
});

// --- 13 — human choice outranks re-detection ---------------------------------

test('S10-13 human choice outranks automatic detection even after a fresh reinspect finds a competitor', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Existing Stuff/My Reports': null, 'Reports-SLC': null } });
    const chosen = await h.choose('g1', 'reports', 'Existing Stuff/My Reports');
    assert.equal(chosen.body.gameSetup.reports.provenance, 'Chosen by you');
    const reinspected = await h.reinspect('g1');
    assert.equal(reinspected.body.gameSetup.reports.label, 'Existing Stuff/My Reports', 'the human decision is verified, never re-decided');
    assert.equal(reinspected.body.gameSetup.reports.provenance, 'Chosen by you');
  } finally { await h.cleanup(); }
});

// --- 14 — S7 convergence: contract apply reaches the Stadium -----------------

test('S10-14 choosing a Reports root pushes the updated contract to the Stadium (S7 apply convergence)', async () => {
  const h = await wireHarness();
  try {
    const game = h.registerGame('g1', { tree: { 'Existing Stuff/My Reports': null } });
    await h.choose('g1', 'reports', 'Existing Stuff/My Reports');
    const applyCall = game.calls.find((frame) => frame.method === 'game.filesystem.apply');
    assert.ok(applyCall, 'an apply RPC was sent after the human choice');
    assert.equal(applyCall.params.reports.path, 'Existing Stuff/My Reports');
    assert.equal(applyCall.params.reports.state, 'ready');
  } finally { await h.cleanup(); }
});

// --- 15 — S9 convergence: a subsequent Controlled Play follows the new root --

test('S10-15 a Controlled Play dispatched after the human choice resolves its report destination from the new root, no special-case wiring', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null, 'Existing Stuff/My Reports': null } });
    // Establish an existing Codex lane under the OLD root via reinspect + ensure.
    h.daemon.registryInstance.updateRoster('session-g1', [
      { id: 'codex', name: 'Codex', instances: [{ instanceId: 'i1' }] },
      { id: 'terminal', name: 'Terminal', instances: [] }
    ]);
    await h.reinspect('g1');
    const beforeContract = h.daemon.gameFilesystemInstance.get('g1');
    assert.equal(beforeContract.reports.path, 'Reports');
    assert.ok(beforeContract.reports.lanes.Codex, 'a Codex lane exists under the auto-detected root');

    // Human overrides the root; the lane record (folder name, not an absolute
    // path) is preserved unchanged by recordHumanChoice.
    await h.choose('g1', 'reports', 'Existing Stuff/My Reports');
    const afterContract = h.daemon.gameFilesystemInstance.get('g1');
    assert.equal(afterContract.reports.path, 'Existing Stuff/My Reports');
    assert.ok(afterContract.reports.lanes.Codex, 'the lane record survives the root change');

    const capability = {
      instanceId: 'i1', playerType: 'codex', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Codex', state: 'ready',
      capability: { provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live', models: [] }
    };
    h.daemon.registryInstance.updateCapabilities('session-g1', [capability]);
    const calls = h.gameCalls('g1');
    const alreadySeen = calls.length;
    const pending = h.daemon.routerInstance.dispatch({ gameId: 'g1', routingMode: 'manual', playerInstanceId: 'i1', prompt: 'Do it.' });
    const frame = calls.slice(alreadySeen).find((item) => item.method === 'dispatch.request');
    assert.ok(frame, 'dispatch frame was sent');
    h.daemon.routerInstance.handleDispatchAccepted({
      clientRef: frame.params.clientRef, stadiumId: 'stadium-g1', gameId: 'g1', playerInstanceId: 'i1',
      turnRef: `turn-${frame.params.clientRef}`, acceptedAt: Date.now()
    });
    await pending;
    const match = /Canonical Game-relative report folder:\n(.+)\n/.exec(frame.params.prompt);
    assert.equal(match?.[1], 'Existing Stuff/My Reports/Codex/', 'S9 resolves from the NEW human-chosen root with zero S10-specific wiring');
  } finally { await h.cleanup(); }
});

// --- 16/17 — dimensions are independent ---------------------------------------

test('S10-16 choosing an SOP root never alters the Reports root', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null, SOP: null } });
    await h.choose('g1', 'reports', 'Reports');
    await h.choose('g1', 'sop', 'SOP');
    const setup = await h.getSetup('g1');
    assert.equal(setup.body.gameSetup.reports.label, 'Reports');
    assert.equal(setup.body.gameSetup.reports.provenance, 'Chosen by you');
    assert.equal(setup.body.gameSetup.sop.label, 'SOP');
  } finally { await h.cleanup(); }
});

test('S10-17 choosing a Reports root never alters the SOP root', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null, SOP: null } });
    await h.choose('g1', 'sop', 'SOP');
    await h.choose('g1', 'reports', 'Reports');
    const setup = await h.getSetup('g1');
    assert.equal(setup.body.gameSetup.sop.label, 'SOP');
    assert.equal(setup.body.gameSetup.sop.provenance, 'Chosen by you');
  } finally { await h.cleanup(); }
});

// --- 18/19 — truthful "not set" / "needs attention" ---------------------------

test('S10-18 brand-new Game with no evidence yet: truthful "not set"', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', {});
    const setup = await h.getSetup('g1');
    assert.equal(setup.body.gameSetup.reports.provenance, 'Not set');
    assert.equal(setup.body.gameSetup.sop.provenance, 'Not set');
  } finally { await h.cleanup(); }
});

test('S10-19 a vanished configured root shows a truthful "needs attention" sentence, never a fabricated healthy path', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null } });
    await h.choose('g1', 'reports', 'Reports');
    fs.rmSync(path.join(h.gameRoot('g1'), 'Reports'), { recursive: true, force: true });
    const reinspected = await h.reinspect('g1');
    assert.equal(reinspected.body.gameSetup.reports.state, 'needs-attention');
    assert.match(reinspected.body.gameSetup.reports.attention, /missing/i);
  } finally { await h.cleanup(); }
});

// --- 20 — Restore detected folder ---------------------------------------------

test('S10-20 Restore detected folder clears the human override and automatic detection resumes', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null, 'Existing Stuff/My Reports': null } });
    await h.reinspect('g1'); // auto-adopts 'Reports'
    const auto = await h.getSetup('g1');
    assert.equal(auto.body.gameSetup.reports.label, 'Reports');

    await h.choose('g1', 'reports', 'Existing Stuff/My Reports');
    const overridden = await h.getSetup('g1');
    assert.equal(overridden.body.gameSetup.reports.provenance, 'Chosen by you');

    const restored = await h.restore('g1', 'reports');
    assert.equal(restored.status, 200);
    assert.equal(restored.body.gameSetup.reports.label, 'Reports', 'automatic detection re-adopted the original root');
    assert.notEqual(restored.body.gameSetup.reports.provenance, 'Chosen by you');
  } finally { await h.cleanup(); }
});

// --- 21 — no filesystem mutation -----------------------------------------------

test('S10-21 choosing a folder never creates, moves, renames, or deletes anything on disk', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { 'Existing Stuff/My Reports/old.md': 'history', SOP: null } });
    const before = h.snapshotGame('g1');
    await h.choose('g1', 'reports', 'Existing Stuff/My Reports');
    await h.choose('g1', 'sop', 'SOP');
    await h.restore('g1', 'sop');
    assert.equal(h.snapshotGame('g1'), before);
  } finally { await h.cleanup(); }
});

// --- kind / payload validation --------------------------------------------------

test('S10-22 an invalid kind is rejected with 400', async () => {
  const h = await wireHarness();
  try {
    h.registerGame('g1', { tree: { Reports: null } });
    const chosen = await h.choose('g1', 'bogus', 'Reports');
    assert.equal(chosen.status, 400);
  } finally { await h.cleanup(); }
});

test('S10-23 an unknown Game is rejected with 404 for both choose and restore', async () => {
  const h = await wireHarness();
  try {
    const chosen = await h.choose('nope', 'reports', 'Reports');
    assert.equal(chosen.status, 404);
    const restored = await h.restore('nope', 'reports');
    assert.equal(restored.status, 404);
  } finally { await h.cleanup(); }
});
