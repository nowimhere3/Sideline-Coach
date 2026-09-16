/**
 * S6 — read-only Game filesystem detection against real fixtures, plus the
 * exact-Game wire contract for evidence.
 *
 * Every test in this file proves detection observes without mutating: the Game tree
 * before an inspection must equal the tree after it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { inspectGameFilesystemEvidence, countReportFiles, deriveNestedReportRoots } from '../out/game-files.js';
import { applyEvidenceToContract, createEmptyContract } from '../out/game-filesystem-contract.js';

const NOW = '2026-09-15T18:00:00.000Z';

function makeGame(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's6-game-'));
  for (const [relativePath, content] of Object.entries(tree)) {
    const target = path.join(root, ...relativePath.split('/'));
    if (content === null) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
  }
  return root;
}

/** Full recursive snapshot: paths plus file bytes, so any mutation is visible. */
function snapshot(root) {
  const entries = [];
  const walk = (dir, prefix) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        entries.push(`D ${relative}`);
        walk(full, relative);
      } else if (dirent.isFile()) {
        entries.push(`F ${relative} ${fs.readFileSync(full, 'utf8')}`);
      } else {
        entries.push(`L ${relative}`);
      }
    }
  };
  walk(root, '');
  return entries.join('\n');
}

async function detect(root, gameId = 'game_fixture', options = {}) {
  const before = snapshot(root);
  const evidence = await inspectGameFilesystemEvidence(gameId, root, options);
  const contract = applyEvidenceToContract(createEmptyContract(gameId), evidence, NOW);
  assert.equal(snapshot(root), before, 'detection must not change the Game tree');
  return { evidence, contract };
}

test('S6-38 Trend-shaped Game: populated Reports and one onboarding folder are detected', async () => {
  const root = makeGame({
    'Reports/Claude/Stage-1.md': '# report',
    'Reports/Codex/fix.md': '# report',
    'Onboarding-Docs/README.md': '# docs',
    'src/server.ts': 'export {};'
  });
  try {
    const { contract } = await detect(root);
    assert.equal(contract.reports.path, 'Reports');
    assert.equal(contract.reports.provenance, 'adopted');
    assert.equal(contract.reports.state, 'ready');
    assert.equal(contract.sop.path, 'Onboarding-Docs');
    assert.equal(contract.sop.provenance, 'detected');
    assert.equal(contract.pendingReportsAction, undefined);
    assert.deepEqual(contract.reports.lanes, {}, 'no Player lane is created or claimed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-39 AI-Usage-shaped Game: Reports plus Onboarding-SOP', async () => {
  const root = makeGame({ 'Reports/AntiGravity/run.md': '# report', 'Onboarding-SOP/SOP.md': '# sop' });
  try {
    const { contract } = await detect(root);
    assert.equal(contract.reports.path, 'Reports');
    assert.equal(contract.sop.path, 'Onboarding-SOP');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-40 clean Game: nothing detected, nothing created', async () => {
  const root = makeGame({ 'src/index.ts': 'export {};', 'README.md': '# game' });
  try {
    const { contract } = await detect(root);
    assert.equal(contract.reports.path, undefined);
    assert.equal(contract.reports.state, 'not-set');
    assert.equal(contract.pendingReportsAction, 'create-reports-slc');
    assert.equal(contract.sop.state, 'not-set');
    assert.equal(fs.existsSync(path.join(root, 'Reports-SLC')), false, 'S6 never creates Reports-SLC');
    assert.equal(fs.existsSync(path.join(root, 'Reports')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-41 legacy Game: Docs REPORT is detected truthfully', async () => {
  const root = makeGame({ 'Docs REPORT/Codex/old.md': '# legacy' });
  try {
    const { evidence, contract } = await detect(root);
    assert.equal(contract.reports.path, 'Docs REPORT');
    assert.equal(evidence.reportRootEntries[0].reportFiles, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-42 competing populated roots stay ambiguous on a real tree', async () => {
  const root = makeGame({ 'Reports/Claude/a.md': 'a', 'Docs REPORT/Codex/b.md': 'b', 'Reports-SLC': null });
  try {
    const { contract } = await detect(root);
    assert.equal(contract.reports.state, 'needs-choice');
    assert.deepEqual(contract.reports.candidates, ['Docs REPORT', 'Reports']);
    assert.equal(contract.reports.path, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-43 a file named Reports-SLC is reported as a collision and left untouched', async () => {
  const root = makeGame({ 'Reports-SLC': 'not a folder' });
  try {
    const { evidence, contract } = await detect(root);
    assert.equal(evidence.reportRootEntries[0].kind, 'file');
    assert.equal(contract.reports.state, 'needs-attention');
    assert.equal(contract.reports.attention.code, 'name-collision');
    assert.equal(fs.readFileSync(path.join(root, 'Reports-SLC'), 'utf8'), 'not a folder');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-44 a recognized root that escapes the Game through a link is never adoptable', async () => {
  const root = makeGame({ 'Docs REPORT/Codex/inside.md': 'ok' });
  const outside = makeGame({ 'Claude/secret-report.md': 'outside the Game' });
  let linked = false;
  try {
    try {
      fs.symlinkSync(outside, path.join(root, 'Reports'), process.platform === 'win32' ? 'junction' : 'dir');
      linked = true;
    } catch {
      linked = false;
    }
    if (!linked) {
      assert.ok(true, 'skipped: this environment does not allow junctions/symlinks');
      return;
    }
    const evidence = await inspectGameFilesystemEvidence('game_fixture', root);
    const escaping = evidence.reportRootEntries.find((entry) => entry.name === 'Reports');
    assert.equal(escaping.safety, 'escapes-game');
    assert.equal(escaping.reportFiles, 0, 'an escaping candidate is never counted');
    const contract = applyEvidenceToContract(createEmptyContract('game_fixture'), evidence, NOW);
    assert.equal(contract.reports.path, 'Docs REPORT');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('S6-45 blocked locations never become candidates or evidence', async () => {
  const root = makeGame({
    '.git/Reports/fake.md': 'x',
    'node_modules/pkg/Reports/dep.md': 'x',
    'secrets/Reports/leak.md': 'x',
    'Reports/Claude/real.md': 'real'
  });
  try {
    const { evidence, contract } = await detect(root, 'game_fixture', {
      reportPaths: ['node_modules/pkg/Reports/dep.md', 'secrets/Reports/leak.md', '.git/Reports/fake.md', 'Reports/Claude/real.md']
    });
    assert.deepEqual(evidence.nestedReportRoots, [], 'blocked prefixes are not nested report roots');
    assert.equal(contract.reports.path, 'Reports');
    assert.equal(evidence.reportRootEntries.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-46 a working report root below the Game root is adopted instead of proposing creation', async () => {
  const root = makeGame({ 'docs/Reports/Codex/a.md': 'a', 'docs/Reports/Codex/b.md': 'b' });
  try {
    const { contract } = await detect(root, 'game_fixture', {
      reportPaths: ['docs/Reports/Codex/a.md', 'docs/Reports/Codex/b.md']
    });
    assert.equal(contract.reports.path, 'docs/Reports');
    assert.equal(contract.pendingReportsAction, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-47 nested root derivation ignores root-level and filename-only coordinates', () => {
  assert.deepEqual(deriveNestedReportRoots(['Reports/Claude/a.md']), []);
  assert.deepEqual(deriveNestedReportRoots(['a.md']), []);
  assert.deepEqual(deriveNestedReportRoots(['docs/Reports/x.md', 'docs/Reports/y.md']), [{ path: 'docs/Reports', reportFiles: 2 }]);
});

test('S6-48 report counting is bounded and reports truncation instead of exhausting a huge tree', async () => {
  const files = {};
  for (let index = 0; index < 40; index += 1) files[`Reports/Claude/r${index}.md`] = 'x';
  const root = makeGame(files);
  try {
    const counted = await countReportFiles(root, 'Reports');
    assert.equal(counted.files, 40);
    assert.equal(counted.truncated, false);
    const bounded = await countReportFiles(root, 'Reports', { maxEntries: 5 });
    assert.equal(bounded.truncated, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S6-49 an unresolvable Game root yields unusable evidence, not absence', async () => {
  const evidence = await inspectGameFilesystemEvidence('game_fixture', path.join(os.tmpdir(), 's6-missing-root-xyz'));
  assert.equal(evidence.rootResolvable, false);
  const contract = applyEvidenceToContract(createEmptyContract('game_fixture'), evidence, NOW);
  assert.equal(contract.reports.state, 'unknown');
  assert.equal(contract.pendingReportsAction, undefined);
});

// --- Exact-Game wire contract ---

async function wireHarness({ features = ['game.files.v1', 'game.filesystem.v1'], answerGameId } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-wire-'));
  const gameRoot = makeGame({ 'Reports/Claude/one.md': 'x', 'Onboarding-SOP/SOP.md': 'y' });
  const daemon = new ControlPlaneDaemon({ dir, port: 42700 + Math.floor(Math.random() * 200), idleTimeoutMs: 60_000 });
  await daemon.start();
  const gameId = 'game_s6_wire';
  const calls = [];
  const socket = {
    readyState: 1,
    send(raw) {
      const frame = JSON.parse(String(raw));
      calls.push(frame);
      if (frame.method === 'game.filesystem.inspect') {
        const answerFor = answerGameId ?? gameId;
        inspectGameFilesystemEvidence(answerFor, gameRoot, { checkPaths: frame.params.checkPaths ?? [] }).then((evidence) =>
          daemon.handleWsResponseForTest(frame.id, { success: true, gameId: frame.params.gameId, evidence })
        );
      }
    },
    close() {}
  };
  daemon.registryInstance.registerSession({
    instanceId: 'session-s6', stadiumId: 'stadium-s6', name: 'S6', platform: process.platform, socket,
    lastHeartbeat: Date.now(), game: { gameId, displayName: 'S6 Game', fingerprintSource: 'test' }, rootFsPath: gameRoot,
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
  return {
    daemon, gameId, gameRoot, dir, calls, api,
    snapshotGame: () => snapshot(gameRoot),
    async cleanup() {
      await daemon.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(gameRoot, { recursive: true, force: true });
    }
  };
}

test('S6-50 reinspect asks the exact Game Stadium and adopts what it finds, without mutation', async () => {
  const harness = await wireHarness();
  try {
    const before = harness.snapshotGame();
    const initial = await harness.api(`/api/games/filesystem?gameId=${harness.gameId}`);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.gameSetup.reports.state, 'not-set');

    const reinspected = await harness.api('/api/games/filesystem/reinspect', {
      method: 'POST',
      body: JSON.stringify({ gameId: harness.gameId })
    });
    assert.equal(reinspected.status, 200);
    assert.equal(reinspected.body.inspected, true);
    assert.equal(reinspected.body.gameSetup.reports.label, 'Reports');
    assert.equal(reinspected.body.gameSetup.reports.provenance, 'Using existing folder');
    assert.equal(reinspected.body.gameSetup.sop.label, 'Onboarding-SOP');
    assert.equal(reinspected.body.gameSetup.canChange, true);
    assert.equal(harness.snapshotGame(), before, 'the wire path mutates nothing');

    const inspectCalls = harness.calls.filter((frame) => frame.method === 'game.filesystem.inspect');
    assert.ok(inspectCalls.length >= 1);
    assert.equal(inspectCalls[0].params.gameId, harness.gameId, 'evidence is requested for the exact Game only');

    const status = await harness.api('/api/status');
    assert.equal(status.body.gameSetup.reports.label, 'Reports');
  } finally {
    await harness.cleanup();
  }
});

test('S6-51 an unknown Game is refused and a Stadium without the feature is never inspected', async () => {
  const harness = await wireHarness({ features: ['game.files.v1'] });
  try {
    const unknown = await harness.api('/api/games/filesystem?gameId=game_not_here');
    assert.equal(unknown.status, 404);

    const reinspected = await harness.api('/api/games/filesystem/reinspect', {
      method: 'POST',
      body: JSON.stringify({ gameId: harness.gameId })
    });
    assert.equal(reinspected.status, 200);
    assert.equal(reinspected.body.inspected, false, 'an older Stadium is not inspected');
    assert.equal(reinspected.body.gameSetup.reports.state, 'not-set');
    assert.equal(harness.calls.filter((frame) => frame.method === 'game.filesystem.inspect').length, 0);
  } finally {
    await harness.cleanup();
  }
});

test('S6-52 evidence returned for a different Game is discarded, never adopted', async () => {
  const harness = await wireHarness({ answerGameId: 'game_other' });
  try {
    const reinspected = await harness.api('/api/games/filesystem/reinspect', {
      method: 'POST',
      body: JSON.stringify({ gameId: harness.gameId })
    });
    assert.equal(reinspected.status, 200);
    assert.equal(reinspected.body.inspected, false);
    assert.equal(reinspected.body.gameSetup.reports.state, 'not-set');
  } finally {
    await harness.cleanup();
  }
});

test('S6-53 an offline Game reports its last durable answer and is not re-decided', async () => {
  const harness = await wireHarness();
  try {
    await harness.api('/api/games/filesystem/reinspect', { method: 'POST', body: JSON.stringify({ gameId: harness.gameId }) });
    harness.daemon.registryInstance.removeSession('session-s6');

    const offline = await harness.api('/api/games/filesystem/reinspect', {
      method: 'POST',
      body: JSON.stringify({ gameId: harness.gameId })
    });
    assert.equal(offline.status, 409);
    assert.equal(offline.body.gameSetup.reports.label, 'Reports');
    assert.equal(offline.body.gameSetup.canChange, false);
  } finally {
    await harness.cleanup();
  }
});
