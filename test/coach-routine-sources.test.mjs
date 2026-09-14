/** Coach Routines V0 Slice C — Authoritative, Game-bounded canonical source discovery and verification proof. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suggestSources, browseSources, checkSources } from '../out/routine-sources.js';
import { CoachRoutineEngine } from '../out/control-plane/coach-routines.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';

function createGameFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routine-game-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routine-outside-'));

  // Canonical candidates
  fs.mkdirSync(path.join(root, 'Docs ANCHOR'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Docs ANCHOR', 'ARCHITECTURE-BREADCRUMBS.md'), '# Breadcrumbs');
  fs.writeFileSync(path.join(root, 'Docs ANCHOR', 'Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md'), '# Roadmap');
  fs.mkdirSync(path.join(root, 'Project SOP'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Project SOP', 'PROJECT-NORTH-STAR.md'), '# North Star');
  fs.writeFileSync(path.join(root, 'README.md'), '# README');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Claude');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agents');
  fs.writeFileSync(path.join(root, 'operating-manual.md'), '# Manual');
  fs.writeFileSync(path.join(root, 'playbook.txt'), '# Playbook');

  // Normal code files
  fs.mkdirSync(path.join(root, 'src', 'deep', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const a = 1;');
  fs.writeFileSync(path.join(root, 'src', 'deep', 'nested', 'helper.ts'), 'export const h = 1;');

  // Blocked / secret plumbing
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'config'), 'git config');
  fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET_KEY=123');
  fs.writeFileSync(path.join(root, '.env.local'), 'LOCAL=1');
  fs.writeFileSync(path.join(root, 'cert.pem'), 'CERT');
  fs.writeFileSync(path.join(root, 'server.key'), 'KEY');
  fs.writeFileSync(path.join(root, 'bundle.pfx'), 'PFX');
  fs.writeFileSync(path.join(root, 'id_rsa'), 'KEY');
  fs.writeFileSync(path.join(root, 'id_rsa.pub'), 'PUB');
  fs.writeFileSync(path.join(root, 'credentials.json'), '{}');
  fs.mkdirSync(path.join(root, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'secrets', 'passwords.txt'), 'passwords');
  fs.mkdirSync(path.join(root, '.sideline'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sideline', 'token'), 'secret_token');

  // Symlink / junction escaping the Game root
  fs.writeFileSync(path.join(outside, 'escaped-secret.txt'), 'outside secret');
  const junctionPath = path.join(root, 'escaped-dir');
  try {
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(outside, junctionPath, symlinkType);
  } catch {}

  const cleanup = () => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(outside, { recursive: true, force: true }); } catch {}
  };

  return { root, outside, cleanup };
}

test('Coach Routines C1: suggest finds likely canonical docs', async () => {
  const fixture = createGameFixture();
  try {
    const suggestions = await suggestSources(fixture.root);
    assert.ok(suggestions.length > 0);
    const paths = suggestions.map((s) => s.path);
    assert.ok(paths.some((p) => p.includes('NORTH-STAR')), 'finds North Star');
    assert.ok(paths.some((p) => p === 'Docs ANCHOR' || p.startsWith('Docs ANCHOR/')), 'finds Docs ANCHOR');
    assert.ok(paths.includes('README.md'), 'finds README.md');
    assert.ok(paths.includes('CLAUDE.md'), 'finds CLAUDE.md');
    assert.ok(paths.includes('AGENTS.md'), 'finds AGENTS.md');
    // Blocked paths must never appear
    for (const p of paths) {
      assert.doesNotMatch(p, /\.git|node_modules|\.env|\.pem|\.key|\.pfx|id_rsa|secrets|credentials|\.sideline/i);
    }
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C2: suggest is deterministic and bounded', async () => {
  const fixture = createGameFixture();
  try {
    const first = await suggestSources(fixture.root, 10);
    const second = await suggestSources(fixture.root, 10);
    assert.ok(first.length <= 10, 'bounded to at most 10');
    assert.deepEqual(first, second, 'deterministic output across runs');
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C3: suggestions do not automatically alter routine configuration', async () => {
  const fixture = createGameFixture();
  const engine = new CoachRoutineEngine();
  const GAME_ID = 'game_suggest_immutability';
  engine.create(GAME_ID, {
    name: 'Canonical Refresh', template: 'canonical-refresh', enabled: true,
    cadence: { kind: 'plays', every: 5 }, targets: { strategyBoard: true, players: false },
    sources: [{ path: 'README.md', kind: 'file' }]
  });
  const before = JSON.stringify(engine.forGame(GAME_ID));
  try {
    await suggestSources(fixture.root);
    const after = JSON.stringify(engine.forGame(GAME_ID));
    assert.equal(before, after, 'engine state remains untouched by suggestion queries');
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C4: browse returns one level only', async () => {
  const fixture = createGameFixture();
  try {
    const rootBrowse = await browseSources(fixture.root, '');
    assert.equal(rootBrowse.dir, '');
    const names = rootBrowse.entries.map((e) => e.name);
    assert.ok(names.includes('Docs ANCHOR'));
    assert.ok(names.includes('Project SOP'));
    assert.ok(names.includes('README.md'));
    // Must NOT recursively include files inside Docs ANCHOR or Project SOP
    assert.ok(!names.includes('ARCHITECTURE-BREADCRUMBS.md'));
    assert.ok(!names.includes('PROJECT-NORTH-STAR.md'));

    // Browsing a specific subfolder returns entries for that subfolder only
    const subBrowse = await browseSources(fixture.root, 'Docs ANCHOR');
    assert.equal(subBrowse.dir, 'Docs ANCHOR');
    const subNames = subBrowse.entries.map((e) => e.name);
    assert.ok(subNames.includes('ARCHITECTURE-BREADCRUMBS.md'));
    assert.ok(!subNames.includes('README.md'));
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C5: browse is bounded', async () => {
  const fixture = createGameFixture();
  try {
    const bounded = await browseSources(fixture.root, '', 2);
    assert.equal(bounded.entries.length, 2);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C6: file is reported as file', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['README.md', 'CLAUDE.md']);
    assert.deepEqual(checks, [
      { path: 'README.md', state: 'file' },
      { path: 'CLAUDE.md', state: 'file' }
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C7: folder is reported as folder', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['Docs ANCHOR', 'Project SOP']);
    assert.deepEqual(checks, [
      { path: 'Docs ANCHOR', state: 'folder' },
      { path: 'Project SOP', state: 'folder' }
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C8: nonexistent source is missing', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['nonexistent.md', 'Docs ANCHOR/missing-subfile.md']);
    assert.deepEqual(checks, [
      { path: 'nonexistent.md', state: 'missing' },
      { path: 'Docs ANCHOR/missing-subfile.md', state: 'missing' }
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C9: blocked path is blocked', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['.git', 'node_modules', '.env', 'cert.pem']);
    assert.deepEqual(checks, [
      { path: '.git', state: 'blocked' },
      { path: 'node_modules', state: 'blocked' },
      { path: '.env', state: 'blocked' },
      { path: 'cert.pem', state: 'blocked' }
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C10: offline/unavailable Stadium is unknown', async () => {
  const checks = await checkSources('', ['README.md', 'Docs ANCHOR']);
  assert.deepEqual(checks, [
    { path: 'README.md', state: 'unknown' },
    { path: 'Docs ANCHOR', state: 'unknown' }
  ]);
});

test('Coach Routines C11: .. traversal rejected', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['../outside.md', 'Docs ANCHOR/../../secret.txt', '..']);
    assert.deepEqual(checks, [
      { path: '../outside.md', state: 'blocked' },
      { path: 'Docs ANCHOR/../../secret.txt', state: 'blocked' },
      { path: '..', state: 'blocked' }
    ]);
    await assert.rejects(async () => browseSources(fixture.root, '..'), /traversal|leave Game root/i);
    await assert.rejects(async () => browseSources(fixture.root, 'Docs ANCHOR/..'), /traversal|leave Game root/i);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C12: absolute path rejected', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['/etc/passwd', '/Docs ANCHOR']);
    assert.deepEqual(checks, [
      { path: '/etc/passwd', state: 'blocked' },
      { path: '/Docs ANCHOR', state: 'blocked' }
    ]);
    await assert.rejects(async () => browseSources(fixture.root, '/etc/passwd'), /Absolute/i);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C13: Windows drive path rejected', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['C:\\secret.txt', 'd:/other/file.md']);
    assert.deepEqual(checks, [
      { path: 'C:\\secret.txt', state: 'blocked' },
      { path: 'd:/other/file.md', state: 'blocked' }
    ]);
    await assert.rejects(async () => browseSources(fixture.root, 'C:\\Windows'), /drive/i);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C14: UNC path rejected', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['\\\\server\\share\\file.txt', '//nas/data']);
    assert.deepEqual(checks, [
      { path: '\\\\server\\share\\file.txt', state: 'blocked' },
      { path: '//nas/data', state: 'blocked' }
    ]);
    await assert.rejects(async () => browseSources(fixture.root, '\\\\server\\share'), /UNC/i);
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C15: symlink escape blocked', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, [
      'escaped-dir',
      'escaped-dir/escaped-secret.txt',
      'escaped-dir/nonexistent-in-escaped.txt'
    ]);
    for (const c of checks) {
      assert.equal(c.state, 'blocked', `escaped symlink target '${c.path}' must be blocked`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C16: .git blocked', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['.git', '.git/config', '.git/HEAD', 'sub/.git']);
    for (const c of checks) {
      assert.equal(c.state, 'blocked', `git path '${c.path}' must be blocked`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C17: node_modules blocked', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, ['node_modules', 'node_modules/dep', 'node_modules/dep/index.js']);
    for (const c of checks) {
      assert.equal(c.state, 'blocked', `node_modules path '${c.path}' must be blocked`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C18: secrets/credentials blocked', async () => {
  const fixture = createGameFixture();
  try {
    const checks = await checkSources(fixture.root, [
      '.env', '.env.local', 'cert.pem', 'server.key', 'bundle.pfx',
      'id_rsa', 'id_rsa.pub', 'credentials.json', 'secrets/passwords.txt', '.sideline/token'
    ]);
    for (const c of checks) {
      assert.equal(c.state, 'blocked', `secret path '${c.path}' must be blocked`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C19: no file contents cross the RPC/Control Plane boundary', async () => {
  const fixture = createGameFixture();
  try {
    const suggestions = await suggestSources(fixture.root);
    for (const s of suggestions) {
      assert.equal((s).content, undefined);
      assert.equal((s).body, undefined);
      assert.equal((s).text, undefined);
    }
    const browse = await browseSources(fixture.root, '');
    for (const entry of browse.entries) {
      assert.equal((entry).content, undefined);
      assert.equal((entry).body, undefined);
      assert.equal((entry).text, undefined);
    }
    const checks = await checkSources(fixture.root, ['README.md', 'CLAUDE.md']);
    for (const c of checks) {
      assert.equal((c).content, undefined);
      assert.equal((c).body, undefined);
      assert.equal((c).text, undefined);
    }
  } finally {
    fixture.cleanup();
  }
});

// Daemon integration harness for C20-C25
async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-c-daemon-'));
  const fixtureA = createGameFixture();
  const fixtureB = createGameFixture();
  const daemon = new ControlPlaneDaemon({ dir, port: 40700 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();

  const GAME_A = 'game_sources_wire_a';
  const GAME_B = 'game_sources_wire_b';
  const responseMutators = new Map();

  const registerSession = (gameId, rootFsPath) => {
    const respond = (frameId, result) => daemon.handleWsResponseForTest?.(frameId, responseMutators.get(gameId)?.(result) ?? result);
    const socket = {
      readyState: 1,
      send(raw) {
        const frame = JSON.parse(String(raw));
        if (frame.method === 'routine.sources.suggest') {
          suggestSources(rootFsPath).then((suggestions) => {
            respond(frame.id, { success: true, gameId, suggestions });
          }).catch((err) => {
            daemon.handleWsResponseForTest?.(frame.id, { success: false, message: err.message });
          });
        } else if (frame.method === 'routine.sources.browse') {
          browseSources(rootFsPath, frame.params.dir).then((res) => {
            respond(frame.id, { success: true, gameId, dir: res.dir, entries: res.entries });
          }).catch((err) => {
            daemon.handleWsResponseForTest?.(frame.id, { success: false, message: err.message });
          });
        } else if (frame.method === 'routine.sources.check') {
          checkSources(rootFsPath, frame.params.paths).then((checks) => {
            respond(frame.id, { success: true, gameId, checkedAt: Date.now(), checks });
          }).catch((err) => {
            daemon.handleWsResponseForTest?.(frame.id, { success: false, message: err.message });
          });
        }
      },
      close() {}
    };

    daemon.registryInstance.registerSession({
      instanceId: `session-${gameId}`, stadiumId: `stadium-${gameId}`, name: gameId, platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId, displayName: gameId, fingerprintSource: 'test' },
      rootFsPath, roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
    });
  };

  registerSession(GAME_A, fixtureA.root);

  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };

  const cleanup = async () => {
    await daemon.stop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    fixtureA.cleanup();
    fixtureB.cleanup();
  };

  return { dir, daemon, api, GAME_A, GAME_B, fixtureA, fixtureB, registerSession, responseMutators, cleanup };
}

test('Coach Routines C20: Game A cannot browse/check Game B', async () => {
  const h = await daemonHarness();
  try {
    // Game B is known in registry but has no connected session yet
    h.daemon.registryInstance.recordKnownGame?.({ gameId: h.GAME_B, displayName: 'Game B', fingerprintSource: 'test' });
    // Attempt to browse Game B when Game B's stadium is not connected
    const browseB = await h.api(`/api/routines/sources/browse?gameId=${h.GAME_B}`);
    assert.equal(browseB.status, 409);
    assert.match(browseB.body.message, /offline|not connected/i);

    // Register session for Game B
    h.registerSession(h.GAME_B, h.fixtureB.root);
    const browseA = await h.api(`/api/routines/sources/browse?gameId=${h.GAME_A}`);
    assert.equal(browseA.status, 200);
    assert.equal(browseA.body.gameId, h.GAME_A);

    // Attempting path traversal to leave Game A and reach Game B is blocked
    const escapeCheck = await h.api('/api/routines/sources/check', {
      method: 'POST',
      body: JSON.stringify({ gameId: h.GAME_A, paths: ['../../outside'] })
    });
    assert.equal(escapeCheck.status, 200);
    assert.equal(escapeCheck.body.checks[0].state, 'blocked');
  } finally {
    await h.cleanup();
  }
});

test('Coach Routines C21: wrong/unknown Game fails safely', async () => {
  const h = await daemonHarness();
  try {
    const unknownSuggest = await h.api('/api/routines/sources/suggest?gameId=unknown_game_id');
    assert.equal(unknownSuggest.status, 404);

    const unknownBrowse = await h.api('/api/routines/sources/browse?gameId=unknown_game_id');
    assert.equal(unknownBrowse.status, 404);

    const unknownCheck = await h.api('/api/routines/sources/check', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'unknown_game_id', paths: ['README.md'] })
    });
    assert.equal(unknownCheck.status, 404);

    const missingGameId = await h.api('/api/routines/sources/suggest');
    assert.equal(missingGameId.status, 400);
  } finally {
    await h.cleanup();
  }
});

test('Coach Routines C22: authoritative check updates lastCheck', async () => {
  const h = await daemonHarness();
  try {
    const create = await h.api('/api/routines', {
      method: 'POST',
      body: JSON.stringify({
        gameId: h.GAME_A,
        name: 'Canonical Refresh',
        template: 'canonical-refresh',
        cadence: { kind: 'plays', every: 5 },
        targets: { strategyBoard: true, players: false },
        sources: [
          { path: 'README.md', kind: 'file' },
          { path: 'Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md', kind: 'file' },
          { path: 'nonexistent.md', kind: 'file' }
        ]
      })
    });
    assert.equal(create.status, 201);
    const routineId = create.body.routine.id;

    // Check the sources
    const checkRes = await h.api('/api/routines/sources/check', {
      method: 'POST',
      body: JSON.stringify({
        gameId: h.GAME_A,
        paths: ['README.md', 'Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md', 'nonexistent.md']
      })
    });
    assert.equal(checkRes.status, 200);
    assert.deepEqual(checkRes.body.checks, [
      { path: 'README.md', state: 'file' },
      { path: 'Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md', state: 'file' },
      { path: 'nonexistent.md', state: 'missing' }
    ]);

    // Verify stored routine.sources have updated lastCheck
    const gameRoutines = h.daemon.routineEngineInstance.forGame(h.GAME_A);
    const stored = gameRoutines.routines.find((r) => r.id === routineId);
    assert.ok(stored);
    const readme = stored.sources.find((s) => s.path === 'README.md');
    assert.equal(readme.lastCheck?.state, 'file');
    assert.ok(readme.lastCheck?.at > 0);

    const breadcrumbs = stored.sources.find((s) => s.path === 'Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md');
    assert.equal(breadcrumbs.lastCheck?.state, 'file');
    assert.ok(breadcrumbs.lastCheck?.at > 0);

    const nonexistent = stored.sources.find((s) => s.path === 'nonexistent.md');
    assert.equal(nonexistent.lastCheck?.state, 'missing');
    assert.ok(nonexistent.lastCheck?.at > 0);
  } finally {
    await h.cleanup();
  }
});

test('Coach Routines C23: check does not change cadence/delivery/count state', async () => {
  const h = await daemonHarness();
  try {
    const routine = h.daemon.routineEngineInstance.create(h.GAME_A, {
      name: 'Test Routine',
      template: 'canonical-refresh',
      cadence: { kind: 'plays', every: 5 },
      targets: { strategyBoard: true, players: false },
      sources: [{ path: 'README.md', kind: 'file' }]
    });

    const beforeGame = h.daemon.routineEngineInstance.forGame(h.GAME_A);
    const beforePlayCount = beforeGame.playCount;
    const beforeBaselinePlayCount = routine.board.baselinePlayCount;
    const beforeBaselineAt = routine.board.baselineAt;

    await h.api('/api/routines/sources/check', {
      method: 'POST',
      body: JSON.stringify({ gameId: h.GAME_A, paths: ['README.md'] })
    });

    const afterGame = h.daemon.routineEngineInstance.forGame(h.GAME_A);
    const afterRoutine = afterGame.routines.find((r) => r.id === routine.id);
    assert.equal(afterGame.playCount, beforePlayCount, 'playCount unchanged');
    assert.equal(afterRoutine.board.baselinePlayCount, beforeBaselinePlayCount, 'baselinePlayCount unchanged');
    assert.equal(afterRoutine.board.baselineAt, beforeBaselineAt, 'baselineAt unchanged');
    assert.equal(afterRoutine.board.lastDelivered, undefined, 'lastDelivered unchanged');
    assert.equal(afterRoutine.board.manualDue, undefined, 'manualDue unchanged');
  } finally {
    await h.cleanup();
  }
});

test('Coach Routines C24: routine with no valid source remains Needs files', async () => {
  const h = await daemonHarness();
  try {
    // 1. Default routine with no sources
    const emptyRoutine = h.daemon.routineEngineInstance.create(h.GAME_A, {
      name: 'Empty Sources',
      template: 'canonical-refresh',
      cadence: { kind: 'plays', every: 5 },
      targets: { strategyBoard: true, players: false },
      sources: []
    });
    const projEmpty = h.daemon.routineEngineInstance.project(h.GAME_A, true);
    const emptyView = projEmpty.routines.find((r) => r.id === emptyRoutine.id);
    assert.equal(emptyView.needs, 'sources');
    assert.equal(emptyView.due, false);

    // 2. Routine with a source that is checked as missing
    const missingRoutine = h.daemon.routineEngineInstance.create(h.GAME_A, {
      name: 'Missing Sources',
      template: 'canonical-refresh',
      cadence: { kind: 'plays', every: 1 },
      targets: { strategyBoard: true, players: false },
      sources: [{ path: 'definitely-missing.md', kind: 'file' }]
    });

    // Run authoritative check on definitely-missing.md
    await h.api('/api/routines/sources/check', {
      method: 'POST',
      body: JSON.stringify({ gameId: h.GAME_A, paths: ['definitely-missing.md'] })
    });

    // Advance plays so cadence is earned
    h.daemon.routineEngineInstance.observePlay({ gameId: h.GAME_A, kind: 'received', clientRef: 'p1' });

    const projMissing = h.daemon.routineEngineInstance.project(h.GAME_A, true);
    const missingView = projMissing.routines.find((r) => r.id === missingRoutine.id);
    assert.equal(missingView.needs, 'sources', 'routine with all missing sources projects Needs files');
    assert.equal(missingView.due, false, 'routine with all missing sources cannot become due');
    assert.equal(projMissing.handoff, undefined, 'does not manufacture handoff envelope');
  } finally {
    await h.cleanup();
  }
});

test('Coach Routines C25: Stadium RPCs require the exact Game id before touching filesystem helpers', async () => {
  const fixture = createGameFixture();
  const calls = [];
  const client = new StadiumClient({
    gameContextGetter: () => ({
      game: { gameId: 'game_exact_rpc', displayName: 'Exact RPC', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium_exact_rpc', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'game_exact_rpc', stadiumId: 'stadium_exact_rpc', rootFsPath: fixture.root, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    routineSources: {
      suggest: async () => { calls.push('suggest'); return []; },
      browse: async () => { calls.push('browse'); return { dir: '', entries: [] }; },
      check: async () => { calls.push('check'); return []; }
    },
    autoReconnect: false
  });
  const responses = [];
  client.socket = { readyState: 1, send: (raw) => responses.push(JSON.parse(String(raw))) };
  client.connected = true;
  try {
    await client.handleIncomingRequest({ id: 1, method: 'routine.sources.suggest', params: {} });
    await client.handleIncomingRequest({ id: 2, method: 'routine.sources.browse', params: { gameId: 'wrong_game' } });
    await client.handleIncomingRequest({ id: 3, method: 'routine.sources.check', params: { paths: ['README.md'] } });
    assert.deepEqual(calls, [], 'no filesystem helper runs without exact Game authority');
    assert.equal(responses.length, 3);
    assert.ok(responses.every((response) => response.result?.success === false));
  } finally {
    fixture.cleanup();
  }
});

test('Coach Routines C26: only authoritative ordered checks persist and browser-supplied checks are ignored', () => {
  const store = (() => { let value; return { load: () => value, save: (next) => { value = structuredClone(next); }, read: () => value }; })();
  const engine = new CoachRoutineEngine(store);
  const routine = engine.create('game_check_order', {
    name: 'Canonical', template: 'canonical-refresh', cadence: { kind: 'plays', every: 1 },
    targets: { strategyBoard: true, players: false },
    sources: [{ path: 'README.md', kind: 'file', lastCheck: { at: 9999, state: 'file' } }]
  });
  assert.equal(engine.forGame('game_check_order').routines[0].sources[0].lastCheck, undefined, 'untrusted input cannot manufacture filesystem truth');
  assert.equal(engine.recordSourceCheck('game_check_order', 200, [{ path: 'README.md', state: 'file' }]).updatedCount, 1);
  assert.equal(engine.recordSourceCheck('game_check_order', 100, [{ path: 'README.md', state: 'missing' }]).updatedCount, 0, 'stale evidence cannot overwrite newer truth');
  assert.equal(engine.forGame('game_check_order').routines[0].sources[0].lastCheck.state, 'file');
  engine.flush();
  const restored = new CoachRoutineEngine({ load: () => store.read(), save: () => undefined });
  assert.deepEqual(restored.forGame('game_check_order').routines.find((candidate) => candidate.id === routine.id).sources[0].lastCheck, { at: 200, state: 'file' });
});

test('Coach Routines C27: every configured canonical source must be authoritatively confirmed with its declared kind', () => {
  const engine = new CoachRoutineEngine();
  const gameId = 'game_confirmation_truth';
  engine.create(gameId, {
    name: 'Canonical', template: 'canonical-refresh', cadence: { kind: 'plays', every: 1 },
    targets: { strategyBoard: true, players: false },
    sources: [{ path: 'README.md', kind: 'file' }, { path: 'Docs', kind: 'folder' }]
  });
  engine.observePlay({ gameId, kind: 'received', clientRef: 'p1' });
  assert.equal(engine.project(gameId, true).routines[0].needs, 'sources');
  engine.recordSourceCheck(gameId, 10, [{ path: 'README.md', state: 'file' }, { path: 'Docs', state: 'unknown' }]);
  assert.equal(engine.project(gameId, true).handoff, undefined);
  engine.recordSourceCheck(gameId, 20, [{ path: 'README.md', state: 'file' }, { path: 'Docs', state: 'file' }]);
  assert.equal(engine.project(gameId, true).handoff, undefined, 'a file result cannot confirm a configured folder');
  engine.recordSourceCheck(gameId, 30, [{ path: 'Docs', state: 'folder' }]);
  assert.ok(engine.project(gameId, true).handoff, 'all exact source kinds are now confirmed');
});

test('Coach Routines C28: daemon re-shapes Stadium metadata and cannot proxy injected source contents', async () => {
  const h = await daemonHarness();
  try {
    h.responseMutators.set(h.GAME_A, (result) => {
      if (result.suggestions) return { ...result, suggestions: result.suggestions.map((item) => ({ ...item, content: 'SECRET' })) };
      if (result.entries) return { ...result, entries: result.entries.map((item) => ({ ...item, content: 'SECRET' })) };
      return result;
    });
    const suggested = await h.api(`/api/routines/sources/suggest?gameId=${h.GAME_A}`);
    const browsed = await h.api(`/api/routines/sources/browse?gameId=${h.GAME_A}`);
    assert.equal(JSON.stringify(suggested.body).includes('SECRET'), false);
    assert.equal(JSON.stringify(browsed.body).includes('SECRET'), false);
  } finally { await h.cleanup(); }
});

test('Coach Routines C29: source checks reject unbounded or malformed request lists', async () => {
  const h = await daemonHarness();
  try {
    const tooMany = await h.api('/api/routines/sources/check', { method: 'POST', body: JSON.stringify({ gameId: h.GAME_A, paths: Array.from({ length: 21 }, (_, i) => `file-${i}.md`) }) });
    assert.equal(tooMany.status, 400);
    const malformed = await h.api('/api/routines/sources/check', { method: 'POST', body: JSON.stringify({ gameId: h.GAME_A, paths: ['README.md', 7] }) });
    assert.equal(malformed.status, 400);
  } finally { await h.cleanup(); }
});

test('Coach Routines C30: real daemon and StadiumClient prove exact-Game filesystem authority over the wire', async () => {
  const fixture = createGameFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routine-real-wire-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 41200 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const gameId = 'game_real_source_wire';
  const client = new StadiumClient({
    port: daemon.port, dir, token, instanceId: 'source-wire-instance', autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId, displayName: 'Real Source Wire', fingerprintSource: 'test' },
      stadium: { stadiumId: 'source-wire-stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId, stadiumId: 'source-wire-stadium', rootFsPath: fixture.root, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    })
  });
  try {
    assert.equal(await client.connect(), true);
    const response = await fetch(`http://127.0.0.1:${daemon.port}/api/routines/sources/check`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, paths: ['README.md', 'Docs ANCHOR', '../outside'] })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.gameId, gameId);
    assert.ok(Number.isFinite(body.checkedAt));
    assert.deepEqual(body.checks, [
      { path: 'README.md', state: 'file' },
      { path: 'Docs ANCHOR', state: 'folder' },
      { path: '../outside', state: 'blocked' }
    ]);
  } finally {
    client.dispose();
    await daemon.stop();
    fixture.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
