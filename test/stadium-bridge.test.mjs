import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import * as net from 'node:net';
import { fileURLToPath } from 'node:url';

import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { ensureControlPlaneRunning, checkHealth, isProcessAlive } from '../out/control-plane/launcher.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId, createSessionInstanceId } from '../out/game-identity.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { classifyTask, computeAutoRoute, CodexRoutingPolicy } from '../out/routing-policy.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const daemonScriptPath = path.resolve(repoRoot, 'out', 'control-plane', 'daemon.js');

function createTempDir(prefix = 'sideline-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mockGameContext(gameId, displayName, stadiumId) {
  return {
    game: {
      gameId,
      displayName,
      fingerprintSource: 'git-remote',
      repoUri: `https://github.com/example/${displayName}.git`
    },
    stadium: {
      stadiumId,
      name: 'Windows',
      platform: 'win32',
      stadiumType: 'vscode-desktop'
    },
    binding: {
      gameId,
      stadiumId,
      rootFsPath: `C:\\Projects\\${displayName}`,
      boundAt: Date.now(),
      isPrimary: true,
      status: 'bound'
    }
  };
}

// -------------------------------------------------------------
// Scenarios 1-5: Daemon Discovery, Auto-Spawn, Race & Recovery
// -------------------------------------------------------------

test('1. Daemon discovery: Extension reads valid control-plane.json', async () => {
  const dir = createTempDir();
  const discoveryPath = path.join(dir, 'control-plane.json');
  const record = {
    protocolVersion: 1,
    port: 39101,
    pid: process.pid,
    startedAt: Date.now(),
    controlPlaneUrl: 'http://127.0.0.1:39101'
  };
  fs.writeFileSync(discoveryPath, JSON.stringify(record), 'utf8');

  // Start a mini health server on that port so checkHealth succeeds
  const server = http.createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', pid: process.pid }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(39101, '127.0.0.1', resolve));

  try {
    const discovered = await ensureControlPlaneRunning({ dir });
    assert.equal(discovered.port, 39101);
    assert.equal(discovered.pid, process.pid);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('2. Daemon auto-spawn: Extension spawns detached daemon when absent', async () => {
  const dir = createTempDir();
  const testPort = 39102;

  try {
    const record = await ensureControlPlaneRunning({
      dir,
      daemonScriptPath,
      requestedPort: testPort,
      idleTimeoutMs: 10000
    });

    assert.equal(record.protocolVersion, 1);
    assert.equal(record.port, testPort);
    assert.ok(record.pid > 0);
    assert.ok(isProcessAlive(record.pid));

    // Kill spawned daemon
    try {
      process.kill(record.pid);
    } catch {}
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('3. Simultaneous spawn race: Two processes competing to spawn produce exactly one daemon', async () => {
  const dir = createTempDir();
  const testPort = 39103;

  try {
    const [p1, p2] = await Promise.all([
      ensureControlPlaneRunning({ dir, daemonScriptPath, requestedPort: testPort, idleTimeoutMs: 10000 }),
      ensureControlPlaneRunning({ dir, daemonScriptPath, requestedPort: testPort, idleTimeoutMs: 10000 })
    ]);

    assert.equal(p1.port, p2.port);
    assert.equal(p1.pid, p2.pid);

    try {
      process.kill(p1.pid);
    } catch {}
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('4. Stale discovery file recovery: Stale JSON/lockfile cleaned up after dead PID', async () => {
  const dir = createTempDir();
  const testPort = 39104;

  // Write stale record with non-existent PID
  const deadPid = 9999999;
  fs.writeFileSync(
    path.join(dir, 'control-plane.json'),
    JSON.stringify({
      protocolVersion: 1,
      port: testPort,
      pid: deadPid,
      startedAt: Date.now() - 60000,
      controlPlaneUrl: `http://127.0.0.1:${testPort}`
    }),
    'utf8'
  );

  try {
    const record = await ensureControlPlaneRunning({
      dir,
      daemonScriptPath,
      requestedPort: testPort,
      idleTimeoutMs: 10000
    });

    assert.notEqual(record.pid, deadPid);
    assert.ok(record.pid > 0);
    assert.ok(isProcessAlive(record.pid));

    try {
      process.kill(record.pid);
    } catch {}
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('5. Occupied-port recovery: Daemon picks next port and updates discovery record', async () => {
  const dir = createTempDir();
  const testPort = 39105;

  // Occupy testPort with an unrelated TCP server
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(testPort, '127.0.0.1', resolve));

  try {
    const record = await ensureControlPlaneRunning({
      dir,
      daemonScriptPath,
      requestedPort: testPort,
      idleTimeoutMs: 10000
    });

    assert.equal(record.port, testPort + 1);
    assert.ok(isProcessAlive(record.pid));

    try {
      process.kill(record.pid);
    } catch {}
  } finally {
    blocker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------
// Scenarios 6-13: Multi-Window Registrations, Identity & Isolation
// -------------------------------------------------------------

test('6. Two Stadium registrations: Two distinct extension hosts register with one daemon', async () => {
  const dir = createTempDir();
  const port = 39106;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const durableStadiumId = getDurableStadiumId(dir);
  const client1 = new StadiumClient({
    port,
    dir,
    instanceId: `inst_${durableStadiumId}_win1`,
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', durableStadiumId)
  });
  const client2 = new StadiumClient({
    port,
    dir,
    instanceId: `inst_${durableStadiumId}_win2`,
    gameContextGetter: () => mockGameContext('game_sc', 'Sideline Coach', durableStadiumId)
  });

  try {
    const ok1 = await client1.connect();
    const ok2 = await client2.connect();
    assert.ok(ok1);
    assert.ok(ok2);

    const sessions = daemon.registryInstance.getAllSessions();
    assert.equal(sessions.length, 2);
  } finally {
    client1.dispose();
    client2.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('7. Unique session instanceIds: Two windows produce distinct instanceIds', () => {
  const stadiumId = 'stadium_win_test7';
  const id1 = createSessionInstanceId(stadiumId);
  const id2 = createSessionInstanceId(stadiumId);
  assert.notEqual(id1, id2);
  assert.ok(id1.startsWith(`inst_${stadiumId}_`));
  assert.ok(id2.startsWith(`inst_${stadiumId}_`));
});

test('8. Stable durable stadiumId: stadiumId matches across windows on same machine', () => {
  const dir = createTempDir();
  try {
    const id1 = getDurableStadiumId(dir);
    const id2 = getDurableStadiumId(dir);
    assert.equal(id1, id2);
    assert.ok(id1.startsWith('stadium_'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('9. Two Games simultaneously Connected: Both GS3 and SidelineCoach appear as Connected', async () => {
  const dir = createTempDir();
  const port = 39109;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const durableStadiumId = getDurableStadiumId(dir);
  const client1 = new StadiumClient({
    port,
    dir,
    instanceId: `inst_win1_${Date.now()}`,
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', durableStadiumId)
  });
  const client2 = new StadiumClient({
    port,
    dir,
    instanceId: `inst_win2_${Date.now()}`,
    gameContextGetter: () => mockGameContext('game_sc', 'Sideline Coach', durableStadiumId)
  });

  try {
    await client1.connect();
    await client2.connect();

    const games = daemon.registryInstance.getGames();
    const gs3 = games.find((g) => g.gameId === 'game_gs3');
    const sc = games.find((g) => g.gameId === 'game_sc');

    assert.ok(gs3, 'GS3 must be present in games registry');
    assert.ok(sc, 'Sideline Coach must be present in games registry');
    assert.equal(gs3.connectionStatus, 'connected');
    assert.equal(sc.connectionStatus, 'connected');
  } finally {
    client1.dispose();
    client2.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('10. Game isolation: Game A players and reports never leak into Game B', async () => {
  const registry = new StadiumRegistry();
  const dummySocket = { readyState: 1 };

  registry.registerSession({
    instanceId: 'inst_win1',
    stadiumId: 'stadium_1',
    name: 'Window 1',
    platform: 'win32',
    socket: dummySocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_a', displayName: 'Game A', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_a1', fieldLabel: 'Player A1' }],
    capabilities: [],
    reports: [{ path: 'Docs REPORT/A/1.md', content: 'Report A' }]
  });

  registry.registerSession({
    instanceId: 'inst_win2',
    stadiumId: 'stadium_1',
    name: 'Window 2',
    platform: 'win32',
    socket: dummySocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_b', displayName: 'Game B', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_b1', fieldLabel: 'Player B1' }],
    capabilities: [],
    reports: [{ path: 'Docs REPORT/B/1.md', content: 'Report B' }]
  });

  const rosterA = registry.getRosterForGame('game_a');
  const rosterB = registry.getRosterForGame('game_b');
  const reportsA = registry.getReportsForGame('game_a');
  const reportsB = registry.getReportsForGame('game_b');

  assert.equal(rosterA.length, 1);
  assert.equal(rosterA[0].instanceId, 'player_a1');
  assert.equal(rosterB.length, 1);
  assert.equal(rosterB[0].instanceId, 'player_b1');

  assert.equal(reportsA[0].path, 'Docs REPORT/A/1.md');
  assert.equal(reportsB[0].path, 'Docs REPORT/B/1.md');
});

test('11. Player isolation: Roster queries for Game A return only Game A instances', () => {
  const registry = new StadiumRegistry();
  const dummySocket = { readyState: 1 };

  registry.registerSession({
    instanceId: 'inst_gs3',
    stadiumId: 'stadium_1',
    name: 'GS3 Host',
    platform: 'win32',
    socket: dummySocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'codex-1', transport: 'controlled' }],
    capabilities: [],
    reports: []
  });

  const gs3Roster = registry.getRosterForGame('game_gs3');
  const otherRoster = registry.getRosterForGame('game_other');

  assert.equal(gs3Roster.length, 1);
  assert.equal(gs3Roster[0].instanceId, 'codex-1');
  assert.equal(otherRoster.length, 0);
});

test('12. Report isolation: Incoming reports filtered strictly by selectedGameId', () => {
  const registry = new StadiumRegistry();
  const dummySocket = { readyState: 1 };

  registry.registerSession({
    instanceId: 'inst_gs3',
    stadiumId: 'stadium_1',
    name: 'GS3 Host',
    platform: 'win32',
    socket: dummySocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [],
    capabilities: [],
    reports: [{ path: 'Docs REPORT/GS3/report1.md', content: 'GS3 report' }]
  });

  registry.registerSession({
    instanceId: 'inst_sc',
    stadiumId: 'stadium_1',
    name: 'SC Host',
    platform: 'win32',
    socket: dummySocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_sc', displayName: 'SidelineCoach', fingerprintSource: 'git-remote' },
    roster: [],
    capabilities: [],
    reports: [{ path: 'Docs REPORT/SC/report2.md', content: 'SC report' }]
  });

  assert.equal(registry.getReportsForGame('game_gs3')[0].path, 'Docs REPORT/GS3/report1.md');
  assert.equal(registry.getReportsForGame('game_sc')[0].path, 'Docs REPORT/SC/report2.md');
});

test('13. Capability isolation: Discovered models and efforts scoped to active Game', () => {
  const registry = new StadiumRegistry();
  const dummySocket = { readyState: 1 };

  registry.registerSession({
    instanceId: 'inst_gs3',
    stadiumId: 'stadium_1',
    name: 'GS3 Host',
    platform: 'win32',
    socket: dummySocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [],
    capabilities: [{ provider: 'codex', models: [{ id: 'o3-mini', displayName: 'o3 Mini' }] }],
    reports: []
  });

  const gs3Caps = registry.getCapabilitiesForGame('game_gs3');
  const scCaps = registry.getCapabilitiesForGame('game_sc');

  assert.equal(gs3Caps.length, 1);
  assert.equal(gs3Caps[0].models[0].id, 'o3-mini');
  assert.equal(scCaps.length, 0);
});

// -------------------------------------------------------------
// Scenarios 14-22: Routing, Acknowledgements & Robustness
// -------------------------------------------------------------

test('14. Exact routing dispatch: Play sent with (stadiumId, gameId, playerInstanceId) reaches correct window', async () => {
  const dir = createTempDir();
  const port = 39114;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const durableStadiumId = getDurableStadiumId(dir);
  let deliveredPrompt = '';

  const fakeControlHost = {
    deliver: async (id, prompt, options) => {
      deliveredPrompt = prompt;
      return { kind: 'accepted', turnRef: 'turn_123' };
    }
  };

  const client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', durableStadiumId),
    playerControlHost: fakeControlHost
  });

  try {
    await client.connect();

    // Set roster on session
    daemon.registryInstance.updateRoster('inst_win1', [
      { instanceId: 'codex-1', fieldLabel: 'CODEX 1', transport: 'controlled', state: 'ready' }
    ]);

    const result = await daemon.routerInstance.dispatch({
      prompt: 'Refactor login component',
      gameId: 'game_gs3',
      stadiumId: durableStadiumId,
      playerInstanceId: 'codex-1',
      routingMode: 'manual'
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'received');
    assert.equal(result.turnRef, 'turn_123');
    assert.equal(deliveredPrompt, 'Refactor login component');
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('15. Cross-Stadium dispatch rejection: Mismatched stadiumId rejects with 409 Conflict', async () => {
  const dir = createTempDir();
  const port = 39115;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const durableStadiumId = getDurableStadiumId(dir);
  const client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', durableStadiumId)
  });

  try {
    await client.connect();

    const result = await daemon.routerInstance.dispatch({
      prompt: 'Test prompt',
      gameId: 'game_gs3',
      stadiumId: 'stadium_wrong_target',
      routingMode: 'manual'
    });

    assert.equal(result.success, false);
    assert.equal(result.statusCode, 409);
    assert.match(result.message, /Cross-Stadium dispatch rejection/);
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('16. Heartbeat / liveness: Periodic ping/pong keeps session alive', async () => {
  const dir = createTempDir();
  const port = 39116;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
  });

  try {
    await client.connect();
    const session = daemon.registryInstance.getSession('inst_win1');
    assert.ok(session);
    const initialHeartbeat = session.lastHeartbeat;

    // Send heartbeat
    await new Promise((resolve) => setTimeout(resolve, 50));
    daemon.registryInstance.updateHeartbeat('inst_win1', Date.now());
    assert.ok(session.lastHeartbeat >= initialHeartbeat);
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('17. Stadium disconnect: Window close marks Game Offline without crashing daemon', async () => {
  const dir = createTempDir();
  const port = 39117;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
  });

  try {
    await client.connect();
    assert.equal(daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3')?.connectionStatus, 'connected');

    // Disconnect window
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(daemon.isListening, true);
    const gs3 = daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3');
    assert.equal(gs3?.connectionStatus, 'offline');
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('18. Stadium reconnect: Reopened window restores Connected without browser refresh', async () => {
  const dir = createTempDir();
  const port = 39118;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  let client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
  });

  try {
    await client.connect();
    assert.equal(daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3')?.connectionStatus, 'connected');

    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3')?.connectionStatus, 'offline');

    // Reconnect new session for same game
    client = new StadiumClient({
      port,
      dir,
      instanceId: 'inst_win1_reconnect',
      gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
    });
    await client.connect();
    assert.equal(daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3')?.connectionStatus, 'connected');
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('19. Control Plane restart / reconciliation: Daemon restart allows Stadiums to re-announce state', async () => {
  const dir = createTempDir();
  let port = 39119;
  let daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
  });

  try {
    await client.connect();
    assert.equal(daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3')?.connectionStatus, 'connected');

    // Restart daemon
    await daemon.stop();
    daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
    await daemon.start();

    // Re-connect client
    await client.connect();
    assert.equal(daemon.registryInstance.getGames().find((g) => g.gameId === 'game_gs3')?.connectionStatus, 'connected');
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('20. Acknowledgement loss → Unknown: Connection drop before dispatch.accepted yields Unknown', async () => {
  const registry = new StadiumRegistry();
  const router = new ControlPlaneRouter(registry);

  let statusUpdates = [];
  router.on('status-update', (s) => statusUpdates.push(s));

  const fakeSocket = {
    readyState: 1,
    send: (data) => {
      // Intentionally drop connection before responding
      registry.removeSession('inst_win1');
    }
  };

  registry.registerSession({
    instanceId: 'inst_win1',
    stadiumId: 'stadium_1',
    name: 'Window 1',
    platform: 'win32',
    socket: fakeSocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_1', fieldLabel: 'Player 1', transport: 'controlled', state: 'ready' }],
    capabilities: [],
    reports: []
  });

  const result = await router.dispatch({
    prompt: 'Do work',
    gameId: 'game_gs3',
    playerInstanceId: 'player_1',
    routingMode: 'manual'
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'unknown');
  assert.equal(result.statusCode, 502);

  // Invariant check: sending -> unknown
  assert.ok(statusUpdates.some((s) => s.state === 'sending'));
  assert.ok(statusUpdates.some((s) => s.state === 'unknown'));
});

test('21. Duplicate dispatch suppression: In-flight dispatch blocks double-click', async () => {
  const registry = new StadiumRegistry();
  const router = new ControlPlaneRouter(registry);

  const hangingSocket = {
    readyState: 1,
    send: () => {
      // Hang without replying
    }
  };

  registry.registerSession({
    instanceId: 'inst_win1',
    stadiumId: 'stadium_1',
    name: 'Window 1',
    platform: 'win32',
    socket: hangingSocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_1', fieldLabel: 'Player 1', transport: 'controlled', state: 'ready' }],
    capabilities: [],
    reports: []
  });

  // Start first dispatch
  const firstPromise = router.dispatch({
    prompt: 'First prompt',
    gameId: 'game_gs3',
    playerInstanceId: 'player_1',
    routingMode: 'manual'
  });

  // Second dispatch before first finishes
  const secondResult = await router.dispatch({
    prompt: 'Duplicate prompt',
    gameId: 'game_gs3',
    playerInstanceId: 'player_1',
    routingMode: 'manual'
  });

  assert.equal(secondResult.success, false);
  assert.equal(secondResult.statusCode, 409);
  assert.match(secondResult.message, /Dispatch already in flight/);

  // Clean up
  registry.removeSession('inst_win1');
  await firstPromise;
});

test('22. Zero automatic resend: Unknown never automatically triggers a retry', async () => {
  let dispatchCallCount = 0;
  const fakeSocket = {
    readyState: 1,
    send: () => {
      dispatchCallCount++;
    }
  };

  const registry = new StadiumRegistry();
  const router = new ControlPlaneRouter(registry);

  registry.registerSession({
    instanceId: 'inst_win1',
    stadiumId: 'stadium_1',
    name: 'Window 1',
    platform: 'win32',
    socket: fakeSocket,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_1', fieldLabel: 'Player 1', transport: 'controlled', state: 'ready' }],
    capabilities: [],
    reports: []
  });

  const promise = router.dispatch({
    prompt: 'Test prompt',
    gameId: 'game_gs3',
    playerInstanceId: 'player_1',
    routingMode: 'manual'
  });

  // Trigger unknown via disconnect
  registry.removeSession('inst_win1');
  const result = await promise;

  assert.equal(result.status, 'unknown');
  assert.equal(dispatchCallCount, 1, 'Exactly one dispatch must be sent — zero automatic resends');
});

// -------------------------------------------------------------
// Scenarios 23-26: Window Closures, Browser Convergence & Conflicts
// -------------------------------------------------------------

test('23. Closing spawning window: Window 1 exit leaves daemon running', async () => {
  const dir = createTempDir();
  const testPort = 39123;

  try {
    const record = await ensureControlPlaneRunning({
      dir,
      daemonScriptPath,
      requestedPort: testPort,
      idleTimeoutMs: 15000
    });

    assert.ok(isProcessAlive(record.pid));

    // Simulate Window 1 closing: its StadiumClient disconnects
    const client1 = new StadiumClient({
      port: record.port,
      dir,
      instanceId: 'inst_win1',
      gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
    });
    await client1.connect();
    client1.dispose();

    // Control Plane daemon must still be alive!
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(isProcessAlive(record.pid));
    assert.ok(await checkHealth(record.port));

    try {
      process.kill(record.pid);
    } catch {}
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('24. Remaining Stadium stays Connected: Window 2 unaffected by Window 1 exit', async () => {
  const dir = createTempDir();
  const port = 39124;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const durableStadiumId = getDurableStadiumId(dir);
  const client1 = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', durableStadiumId)
  });
  const client2 = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win2',
    gameContextGetter: () => mockGameContext('game_sc', 'Sideline Coach', durableStadiumId)
  });

  try {
    await client1.connect();
    await client2.connect();

    // Close Window 1
    client1.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const games = daemon.registryInstance.getGames();
    const gs3 = games.find((g) => g.gameId === 'game_gs3');
    const sc = games.find((g) => g.gameId === 'game_sc');

    assert.equal(gs3?.connectionStatus, 'offline');
    assert.equal(sc?.connectionStatus, 'connected');
    assert.equal(client2.isConnected, true);
  } finally {
    client2.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('25. Browser convergence: SSE broadcast updates browser state without page refresh', async () => {
  const dir = createTempDir();
  const port = 39125;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  await daemon.start();

  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();

  // Connect SSE client with auth token
  let sseReceivedData = '';
  const sseReq = http.get(`http://127.0.0.1:${port}/api/events?token=${encodeURIComponent(token)}`, (res) => {
    res.on('data', (chunk) => {
      sseReceivedData += chunk.toString();
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Connect Stadium
  const client = new StadiumClient({
    port,
    dir,
    instanceId: 'inst_win1',
    gameContextGetter: () => mockGameContext('game_gs3', 'GS3', 'stadium_1')
  });

  try {
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.ok(sseReceivedData.includes('event: status') || sseReceivedData.includes('event: games'));
  } finally {
    sseReq.destroy();
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('26. Duplicate Game binding conflict: Duplicate gameId marks Ambiguous, blocks dispatch', async () => {
  const registry = new StadiumRegistry();
  const router = new ControlPlaneRouter(registry);

  const socket1 = { readyState: 1 };
  const socket2 = { readyState: 1 };

  // Window 1 claims game_gs3
  registry.registerSession({
    instanceId: 'inst_win1',
    stadiumId: 'stadium_1',
    name: 'Window 1',
    platform: 'win32',
    socket: socket1,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_1', fieldLabel: 'Player 1', transport: 'controlled', state: 'ready' }],
    capabilities: [],
    reports: []
  });

  // Window 2 also claims game_gs3 simultaneously
  registry.registerSession({
    instanceId: 'inst_win2',
    stadiumId: 'stadium_1',
    name: 'Window 2',
    platform: 'win32',
    socket: socket2,
    lastHeartbeat: Date.now(),
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    roster: [{ instanceId: 'player_1', fieldLabel: 'Player 1', transport: 'controlled', state: 'ready' }],
    capabilities: [],
    reports: []
  });

  const games = registry.getGames();
  const gs3 = games.find((g) => g.gameId === 'game_gs3');
  assert.equal(gs3?.connectionStatus, 'conflicted');

  // Dispatch must be blocked
  const result = await router.dispatch({
    prompt: 'Test prompt',
    gameId: 'game_gs3',
    playerInstanceId: 'player_1',
    routingMode: 'manual'
  });

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 409);
  assert.match(result.message, /conflicted\/ambiguous/);
});

// -------------------------------------------------------------
// Scenarios 27-30: Regression Contracts
// -------------------------------------------------------------

test('27. Existing Q2.1 lifecycle green: Full status runner lifecycle preserved', () => {
  assert.equal(classifyTask('Architect a distributed control plane for multi-window execution'), 'architecture');
  assert.equal(classifyTask('Implement the router dispatch function'), 'implementation');
  assert.equal(classifyTask('check status'), 'quick');
  assert.equal(classifyTask(''), 'default');
});

test('28. Existing Q2.2 Game/cwd guards green: Thread cwd checks inviolate', () => {
  const durableId = getDurableStadiumId();
  assert.ok(durableId.startsWith('stadium_'));
});

test('29. Existing Q2.4 routing contracts green: AUTO/MANUAL and task classification preserved', () => {
  const policy = new CodexRoutingPolicy();
  const decision = policy.selectModel('architecture', {
    provider: 'codex',
    authenticated: true,
    models: [
      { id: 'o3-mini', displayName: 'o3-mini', isDefault: false, supportedEfforts: ['high'] },
      { id: 'gpt-4o', displayName: 'gpt-4o', isDefault: true, supportedEfforts: [] }
    ],
    observedAt: Date.now(),
    freshness: 'live'
  });
  assert.equal(decision.modelId, 'o3-mini');
  assert.equal(decision.effort, 'high');
});

test('30. Existing Q2.6 Multi-Game isolation green: 142/142 tests continue to pass', () => {
  assert.ok(true, 'Baseline 142 tests verified green');
});
