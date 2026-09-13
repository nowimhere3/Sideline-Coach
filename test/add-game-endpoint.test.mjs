/**
 * Q2.9 Add Game and Player lifecycle over the real HTTP + WebSocket contract.
 *
 * A real ControlPlaneDaemon is started and a real StadiumClient connects to it,
 * so these exercise the actual routes, the actual RPC dispatch, and the actual
 * SSE convergence. Only the two VS Code mechanics — the folder picker and
 * opening a window — are stubbed, because those are precisely the parts that
 * cannot exist outside an extension host.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';

const GS3 = { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' };
const GALLERY = { gameId: 'game_gallery', displayName: 'Gallery Media Suite', fingerprintSource: 'git-remote' };

function gameContext(game, root) {
  return () => ({
    game,
    stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId: game.gameId, stadiumId: 'stadium_test', rootFsPath: root, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  });
}

/**
 * Boot a daemon plus one connected Stadium whose VS Code mechanics are stubbed.
 * `calls` records what the Control Plane actually asked the Stadium to do.
 */
async function harness(port, options = {}) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-q29-'));
  const daemon = new ControlPlaneDaemon({ dir: scratch, port, idleTimeoutMs: 120000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(scratch, 'token'), 'utf8').trim();

  const calls = { pick: 0, open: [], lifecycle: [] };

  const client = new StadiumClient({
    port: daemon.port,
    dir: scratch,
    token,
    instanceId: 'inst_gs3',
    gameContextGetter: gameContext(GS3, 'C:\\repos\\GS3'),
    autoReconnect: false,
    pickGame: async () => {
      calls.pick++;
      return options.pick ?? { success: true, folderPath: 'C:\\repos\\Gallery', game: GALLERY };
    },
    openGame: async (params) => {
      calls.open.push(params);
      return options.open ?? { success: true, outcome: 'opened', message: `Opening ${params.displayName}…` };
    },
    playerLifecycle: async (method, params) => {
      calls.lifecycle.push({ method, params });
      if (method === 'player.discover') {
        return {
          success: true,
          discovery: {
            stadiumId: 'stadium_test',
            gameId: params.gameId,
            at: Date.now(),
            catalog: [{ playerType: 'terminal', displayName: 'Terminal', state: 'available', summary: 'Available', canAddNow: true, controlled: false }],
            externalCandidates: [],
            externalScanSupported: true
          }
        };
      }
      return { success: true, message: 'ok', instanceId: 'terminal-abc12345' };
    }
  });

  assert.equal(await client.connect(), true, 'the synthetic Stadium must connect');

  const api = async (pathname, init) => {
    const res = await fetch(
      `http://127.0.0.1:${daemon.port}${pathname}?token=${encodeURIComponent(token)}`,
      { method: 'POST', body: '{}', ...init }
    );
    return { status: res.status, body: await res.json() };
  };

  const status = async () =>
    (await (await fetch(`http://127.0.0.1:${daemon.port}/api/status?token=${encodeURIComponent(token)}`)).json());

  const stop = async () => {
    client.dispose();
    await daemon.stop();
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
  };

  return { daemon, client, token, calls, api, status, stop };
}

test('E1. Add Game runs the whole lifecycle from one browser action', async () => {
  const h = await harness(39411);
  try {
    const result = await h.api('/api/game/add');

    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'opening', 'the human sees Opening, not a dialog instruction');
    assert.equal(result.body.gameId, GALLERY.gameId);

    // Exactly one picker and one open — the browser never had to ask twice.
    assert.equal(h.calls.pick, 1);
    assert.deepEqual(h.calls.open, [
      { gameId: GALLERY.gameId, folderPath: 'C:\\repos\\Gallery', displayName: 'Gallery Media Suite' }
    ]);

    // And the Game is immediately visible as Opening without a refresh.
    const games = (await h.status()).games;
    const gallery = games.find((g) => g.gameId === GALLERY.gameId);
    assert.equal(gallery.connectionStatus, 'opening');
  } finally {
    await h.stop();
  }
});

test('E2. Opening converges to Connected when the new window activates', async () => {
  const h = await harness(39412);
  try {
    await h.api('/api/game/add');
    assert.equal((await h.status()).games.find((g) => g.gameId === GALLERY.gameId).connectionStatus, 'opening');

    // The second window activated and its Stadium connected outbound.
    h.daemon.registryInstance.registerSession({
      instanceId: 'inst_gallery',
      stadiumId: 'stadium_test',
      name: 'Windows',
      platform: 'win32',
      socket: { readyState: 1, send() {}, close() {} },
      lastHeartbeat: Date.now(),
      game: GALLERY,
      rootFsPath: 'C:\\repos\\Gallery',
      roster: [],
      capabilities: [],
      reports: [],
      rosterSynchronized: false,
      rosterSyncedAt: 0
    });

    const gallery = (await h.status()).games.find((g) => g.gameId === GALLERY.gameId);
    assert.equal(gallery.connectionStatus, 'connected');
  } finally {
    await h.stop();
  }
});

test('E3. Choosing an already-connected repository selects it instead of opening a duplicate', async () => {
  const h = await harness(39413, { pick: { success: true, folderPath: 'C:\\repos\\GS3', game: GS3 } });
  try {
    const result = await h.api('/api/game/add');

    assert.equal(result.body.status, 'connected');
    assert.match(result.body.message, /already connected/i);
    assert.equal(h.calls.open.length, 0, 'no second window may be opened for a live Game');
  } finally {
    await h.stop();
  }
});

test('E4. A cancelled picker is a quiet no-op, not an error', async () => {
  const h = await harness(39414, { pick: { success: false, cancelled: true } });
  try {
    const result = await h.api('/api/game/add');
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'cancelled');
    assert.equal(h.calls.open.length, 0);
  } finally {
    await h.stop();
  }
});

test('E5. A folder with no identifiable Game is refused in plain language', async () => {
  const h = await harness(39415, {
    pick: { success: false, folderPath: 'C:\\tmp\\notarepo', message: 'Coach could not identify a Game in that folder.' }
  });
  try {
    const result = await h.api('/api/game/add');
    assert.equal(result.status, 400);
    assert.equal(result.body.status, 'unresolved');
    assert.match(result.body.message, /could not identify a Game/i);
  } finally {
    await h.stop();
  }
});

test('E6. A failed open clears Opening so the Game does not spin forever', async () => {
  const h = await harness(39416, { open: { success: false, outcome: 'failed', message: 'Coach could not open this Game.' } });
  try {
    const result = await h.api('/api/game/add');

    assert.equal(result.status, 400);
    assert.equal(result.body.status, 'failed');

    const gallery = (await h.status()).games.find((g) => g.gameId === GALLERY.gameId);
    assert.notEqual(gallery.connectionStatus, 'opening', 'a failed open must not leave the Game Opening');
  } finally {
    await h.stop();
  }
});

test('E7. Exit Game archives without touching anything else, and Restore brings it back', async () => {
  const h = await harness(39417);
  try {
    await h.api('/api/game/add'); // registers Gallery

    const archived = await h.api('/api/game/archive', { body: JSON.stringify({ gameId: GALLERY.gameId }) });
    assert.equal(archived.status, 200);
    assert.match(archived.body.message, /repository was not changed/i);

    const games = (await h.status()).games;
    assert.equal(games.some((g) => g.gameId === GALLERY.gameId), false);
    assert.equal(games.some((g) => g.gameId === GS3.gameId), true, 'archiving one Game must not disturb another');

    const restored = await h.api('/api/game/restore', { body: JSON.stringify({ gameId: GALLERY.gameId }) });
    assert.equal(restored.body.success, true);
    assert.equal((await h.status()).games.some((g) => g.gameId === GALLERY.gameId), true);
  } finally {
    await h.stop();
  }
});

test('E8. Every Player lifecycle call carries the selected gameId, so nothing can land in another Game', async () => {
  const h = await harness(39418);
  try {
    await h.api('/api/players/discover');
    await h.api('/api/players/add', { body: JSON.stringify({ playerType: 'terminal' }) });
    await h.api('/api/players/instance/terminal-abc12345/bench');
    await h.api('/api/players/instance/terminal-abc12345/remove');
    await h.api('/api/players/helper-terminal', { body: JSON.stringify({ playerType: 'claude', purpose: 'install' }) });
    await h.api('/api/players/instance/terminal-abc12345/send', { body: JSON.stringify({ text: 'npm -v' }) });

    assert.deepEqual(
      h.calls.lifecycle.map((call) => call.method),
      [
        'player.discover',
        'player.addTerminal',
        'player.takeOffField',
        'player.remove',
        'player.helperTerminal',
        'player.terminalSend'
      ]
    );

    for (const call of h.calls.lifecycle) {
      assert.equal(call.params.gameId, GS3.gameId, `${call.method} must be Game-scoped`);
    }

    const send = h.calls.lifecycle.find((call) => call.method === 'player.terminalSend');
    assert.equal(send.params.text, 'npm -v');
    assert.equal(send.params.playerInstanceId, 'terminal-abc12345');
  } finally {
    await h.stop();
  }
});

test('E9. Discovery is cached per Game and published to the browser', async () => {
  const h = await harness(39419);
  try {
    assert.equal((await h.status()).playerDiscovery, null, 'not checked yet is null, never an empty catalog');

    await h.api('/api/players/discover');

    const discovery = (await h.status()).playerDiscovery;
    assert.ok(discovery, 'the browser must be able to render the catalog without re-probing');
    assert.equal(discovery.gameId, GS3.gameId);
    assert.equal(discovery.catalog[0].playerType, 'terminal');
  } finally {
    await h.stop();
  }
});

test('E10. Player lifecycle is refused when the Game is not connected', async () => {
  const h = await harness(39420);
  try {
    h.client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = await h.api('/api/players/add', { body: JSON.stringify({ playerType: 'terminal' }) });
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
    assert.equal(h.calls.lifecycle.length, 0, 'nothing may be dispatched into an offline Game');
  } finally {
    await h.stop();
  }
});

test('E11. Add Game reports honestly when no Stadium can show a picker', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-q29-nohost-'));
  const daemon = new ControlPlaneDaemon({ dir: scratch, port: 39421, idleTimeoutMs: 120000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(scratch, 'token'), 'utf8').trim();

  try {
    const res = await fetch(`http://127.0.0.1:${daemon.port}/api/game/add?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: '{}'
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.match(body.message, /nowhere to show the repository picker/i);
    assert.doesNotMatch(body.message, /undefined|Error:/);
  } finally {
    await daemon.stop();
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
  }
});
