/** S1 — neutral Game Files exact-Game wire contract. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { browseGameDirectory, checkGamePaths, searchGameFiles, resolveAbsoluteGamePath } from '../out/game-files.js';

async function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-wire-'));
  const gameRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-wire-game-'));
  fs.mkdirSync(path.join(gameRoot, 'src'));
  fs.writeFileSync(path.join(gameRoot, 'src', 'server.ts'), 'export {};');
  const daemon = new ControlPlaneDaemon({ dir, port: 42300 + Math.floor(Math.random() * 300), idleTimeoutMs: 60_000 });
  await daemon.start();
  const gameId = 'game_files_wire';
  const calls = [];
  let mutateResponse;
  const socket = {
    readyState: 1,
    send(raw) {
      const frame = JSON.parse(String(raw));
      calls.push(frame);
      if (frame.method === 'game.files.browse') {
        browseGameDirectory(gameRoot, frame.params.dir).then((result) => daemon.handleWsResponseForTest(frame.id, mutateResponse?.({ success: true, gameId, ...result }) ?? { success: true, gameId, ...result }));
      } else if (frame.method === 'game.files.check') {
        checkGamePaths(gameRoot, frame.params.paths).then((checks) => daemon.handleWsResponseForTest(frame.id, mutateResponse?.({ success: true, gameId, checkedAt: Date.now(), checks }) ?? { success: true, gameId, checkedAt: Date.now(), checks }));
      } else if (frame.method === 'game.files.search') {
        searchGameFiles(gameRoot, frame.params.query, { limit: frame.params.limit, allowSingleCharacter: frame.params.allowSingleCharacter === true }).then((result) => daemon.handleWsResponseForTest(frame.id, mutateResponse?.({ success: true, gameId, searchId: frame.params.searchId, ...result }) ?? { success: true, gameId, searchId: frame.params.searchId, ...result }));
      } else if (frame.method === 'game.files.resolveAbsolute') {
        resolveAbsoluteGamePath(gameRoot, frame.params.path).then((result) => daemon.handleWsResponseForTest(frame.id, mutateResponse?.({ success: true, gameId, ...result }) ?? { success: true, gameId, ...result }));
      } else if (frame.method === 'routine.sources.browse') {
        browseGameDirectory(gameRoot, frame.params.dir).then((result) => daemon.handleWsResponseForTest(frame.id, { success: true, gameId, dir: result.dir, entries: result.entries }));
      }
    },
    close() {}
  };
  daemon.registryInstance.registerSession({
    instanceId: 'session-files', stadiumId: 'stadium-files', name: 'Files', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId, displayName: 'Files', fingerprintSource: 'test' }, rootFsPath: gameRoot,
    roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: ['game.files.v1']
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
    daemon, gameId, gameRoot, calls, api, setMutator(fn) { mutateResponse = fn; },
    async cleanup() {
      await daemon.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(gameRoot, { recursive: true, force: true });
    }
  };
}

test('WI-1: neutral Browse/Check reach the exact authoritative Stadium', async () => {
  const h = await harness();
  try {
    const browse = await h.api(`/api/games/files/browse?gameId=${h.gameId}&dir=src`);
    assert.equal(browse.status, 200);
    assert.equal(browse.body.gameId, h.gameId);
    assert.deepEqual(browse.body.entries, [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }]);
    assert.equal(browse.body.truncated, false);
    const check = await h.api('/api/games/files/check', { method: 'POST', body: JSON.stringify({ gameId: h.gameId, paths: ['src/server.ts', '../outside'] }) });
    assert.equal(check.status, 200);
    assert.deepEqual(check.body.checks, [{ path: 'src/server.ts', state: 'file' }, { path: '../outside', state: 'blocked' }]);
    assert.deepEqual(h.calls.filter((call) => call.method?.startsWith('game.files.')).map((call) => call.method), ['game.files.browse', 'game.files.check']);
  } finally { await h.cleanup(); }
});

test('S2-WI-1: neutral Search reaches the exact authoritative Stadium and preserves correlation metadata', async () => {
  const h = await harness();
  try {
    h.setMutator((result) => ({ ...result, results: result.results.map((entry) => ({ ...entry, content: 'must not cross' })) }));
    const response = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=SERVER&limit=10`);
    assert.equal(response.status, 200);
    assert.equal(response.body.gameId, h.gameId);
    assert.equal(response.body.query, 'server');
    assert.equal(typeof response.body.searchId, 'string');
    assert.deepEqual(response.body.results, [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }]);
    assert.equal(response.body.truncated, false);
    assert.equal(response.body.moreMatches, false);
    assert.equal(h.calls.at(-1).method, 'game.files.search');
    assert.deepEqual(Object.keys(response.body.results[0]).sort(), ['kind', 'name', 'path']);
  } finally { await h.cleanup(); }
});

test('S4-WI-1: explicit Enter alone enables the bounded one-character Search exception', async () => {
  const h = await harness();
  try {
    const ordinary = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=s`);
    assert.equal(ordinary.status, 200);
    assert.equal(ordinary.body.results.length, 0);
    assert.equal(h.calls.at(-1).params.allowSingleCharacter, false);

    const explicit = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=s&explicit=1`);
    assert.equal(explicit.status, 200);
    assert.ok(explicit.body.results.some((entry) => entry.path === 'src' || entry.path === 'src/server.ts'));
    assert.equal(h.calls.at(-1).params.allowSingleCharacter, true);
  } finally { await h.cleanup(); }
});

test('S5-WI-1: absolute resolution reaches only the exact Stadium and returns a shaped ephemeral coordinate', async () => {
  const h = await harness();
  try {
    h.setMutator((result) => ({ ...result, rootFsPath: 'must-not-cross', content: 'must-not-cross' }));
    const response = await h.api('/api/games/files/absolute-path', {
      method: 'POST', body: JSON.stringify({ gameId: h.gameId, path: '.\\src\\server.ts', rootFsPath: 'C:\\caller-must-not-control' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true, gameId: h.gameId, path: 'src/server.ts', available: true,
      absolutePath: path.resolve(h.gameRoot, 'src', 'server.ts'),
      pathStyle: process.platform === 'win32' ? 'windows' : 'posix', environment: 'local'
    });
    const call = h.calls.at(-1);
    assert.equal(call.method, 'game.files.resolveAbsolute');
    assert.deepEqual(call.params, { gameId: h.gameId, path: 'src/server.ts' });
    assert.equal('rootFsPath' in call.params, false);
  } finally { await h.cleanup(); }
});

test('S5-WI-2: mismatched absolute Game/path echoes are rejected', async () => {
  const h = await harness();
  try {
    h.setMutator((result) => ({ ...result, gameId: 'wrong-game' }));
    const wrongGame = await h.api('/api/games/files/absolute-path', { method: 'POST', body: JSON.stringify({ gameId: h.gameId, path: 'src/server.ts' }) });
    assert.equal(wrongGame.status, 502);
    assert.match(wrongGame.body.message, /different Game/i);

    h.setMutator((result) => ({ ...result, path: 'other.txt' }));
    const wrongPath = await h.api('/api/games/files/absolute-path', { method: 'POST', body: JSON.stringify({ gameId: h.gameId, path: 'src/server.ts' }) });
    assert.equal(wrongPath.status, 502);
    assert.match(wrongPath.body.message, /mismatched absolute-path/i);
  } finally { await h.cleanup(); }
});

test('S2-WI-4: Control Plane rejects mismatched Search identity', async () => {
  const h = await harness();
  try {
    h.setMutator((result) => ({ ...result, searchId: 'wrong-search' }));
    const response = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=server`);
    assert.equal(response.status, 502);
    assert.match(response.body.message, /mismatched search response/i);

    h.setMutator((result) => ({ ...result, query: 'wrong-query' }));
    const wrongQuery = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=server`);
    assert.equal(wrongQuery.status, 502);
    assert.match(wrongQuery.body.message, /mismatched search response/i);
  } finally { await h.cleanup(); }
});

test('S2-WI-2: a second connected Game can never satisfy the first Game search', async () => {
  const h = await harness();
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-wire-second-'));
  const secondCalls = [];
  try {
    fs.writeFileSync(path.join(secondRoot, 'only-second.txt'), 'x');
    const secondGameId = 'game_files_wire_second';
    const secondSocket = {
      readyState: 1,
      send(raw) {
        const frame = JSON.parse(String(raw));
        secondCalls.push(frame);
        if (frame.method === 'game.files.search') {
          searchGameFiles(secondRoot, frame.params.query, { limit: frame.params.limit }).then((result) =>
            h.daemon.handleWsResponseForTest(frame.id, { success: true, gameId: secondGameId, searchId: frame.params.searchId, ...result }));
        }
      },
      close() {}
    };
    h.daemon.registryInstance.registerSession({
      instanceId: 'session-files-second', stadiumId: 'stadium-files-second', name: 'Files Two', platform: 'win32', socket: secondSocket,
      lastHeartbeat: Date.now(), game: { gameId: secondGameId, displayName: 'Files Two', fingerprintSource: 'test' }, rootFsPath: secondRoot,
      roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: ['game.files.v1']
    });

    const response = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=only-second`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.results, []);
    assert.equal(secondCalls.length, 0);
    assert.equal(h.calls.at(-1).params.gameId, h.gameId);
    const absolute = await h.api('/api/games/files/absolute-path', { method: 'POST', body: JSON.stringify({ gameId: h.gameId, path: 'src/server.ts' }) });
    assert.equal(absolute.status, 200);
    assert.equal(absolute.body.absolutePath, path.resolve(h.gameRoot, 'src', 'server.ts'));
    assert.equal(secondCalls.length, 0);
  } finally {
    fs.rmSync(secondRoot, { recursive: true, force: true });
    await h.cleanup();
  }
});

test('WI-4: Control Plane rejects a different-game response', async () => {
  const h = await harness();
  try {
    h.setMutator((result) => ({ ...result, gameId: 'wrong-game' }));
    const response = await h.api(`/api/games/files/browse?gameId=${h.gameId}`);
    assert.equal(response.status, 502);
    assert.match(response.body.message, /different Game/i);
  } finally { await h.cleanup(); }
});

test('WI-5/7: offline and older Stadiums report unavailable/unsupported', async () => {
  const h = await harness();
  try {
    h.daemon.registryInstance.removeSession('session-files');
    const offline = await h.api(`/api/games/files/browse?gameId=${h.gameId}`);
    assert.equal(offline.status, 409);
    assert.equal(offline.body.status, 'offline');
    const offlineSearch = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=server`);
    assert.equal(offlineSearch.status, 409);
    assert.equal(offlineSearch.body.status, 'offline');
    const offlineAbsolute = await h.api('/api/games/files/absolute-path', { method: 'POST', body: JSON.stringify({ gameId: h.gameId, path: 'src/server.ts' }) });
    assert.equal(offlineAbsolute.status, 409);
    assert.equal(offlineAbsolute.body.status, 'offline');

    h.daemon.registryInstance.registerSession({
      instanceId: 'session-old', stadiumId: 'stadium-old', name: 'Old', platform: 'win32', socket: { readyState: 1, send() {}, close() {} },
      lastHeartbeat: Date.now(), game: { gameId: h.gameId, displayName: 'Files', fingerprintSource: 'test' },
      roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
    });
    const unsupported = await h.api(`/api/games/files/browse?gameId=${h.gameId}`);
    assert.equal(unsupported.status, 409);
    assert.equal(unsupported.body.status, 'unsupported');
    const unsupportedSearch = await h.api(`/api/games/files/search?gameId=${h.gameId}&q=server`);
    assert.equal(unsupportedSearch.status, 409);
    assert.equal(unsupportedSearch.body.status, 'unsupported');
    const unsupportedAbsolute = await h.api('/api/games/files/absolute-path', { method: 'POST', body: JSON.stringify({ gameId: h.gameId, path: 'src/server.ts' }) });
    assert.equal(unsupportedAbsolute.status, 409);
    assert.equal(unsupportedAbsolute.body.status, 'unsupported');
  } finally { await h.cleanup(); }
});

test('WI-6: legacy routine browse remains available', async () => {
  const h = await harness();
  try {
    const response = await h.api(`/api/routines/sources/browse?gameId=${h.gameId}&dir=src`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.entries, [{ name: 'server.ts', path: 'src/server.ts', kind: 'file' }]);
  } finally { await h.cleanup(); }
});

test('WI-3: Stadium rejects mismatched gameId before a Game Files helper runs', async () => {
  let calls = 0;
  const sent = [];
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: 'exact-game', displayName: 'Exact', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'exact-game', stadiumId: 'stadium', rootFsPath: 'unused', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    gameFiles: { browse: async () => { calls += 1; return { dir: '', entries: [], truncated: false }; } }
  });
  client.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
  client.connected = true;
  await client.handleIncomingRequest({ id: 1, method: 'game.files.browse', params: { gameId: 'other-game' } });
  assert.equal(calls, 0);
  assert.equal(sent[0].result.success, false);
  assert.match(sent[0].result.message, /Game mismatch/i);
});

test('S2-WI-3: Stadium rejects a mismatched Search gameId before filesystem access', async () => {
  let calls = 0;
  const sent = [];
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: 'exact-game', displayName: 'Exact', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'exact-game', stadiumId: 'stadium', rootFsPath: 'unused', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    gameFiles: { search: async () => { calls += 1; return { query: 'server', results: [], truncated: false, moreMatches: false }; } }
  });
  client.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
  client.connected = true;
  await client.handleIncomingRequest({ id: 1, method: 'game.files.search', params: { gameId: 'other-game', query: 'server', searchId: 's1' } });
  assert.equal(calls, 0);
  assert.equal(sent[0].result.success, false);
  assert.match(sent[0].result.message, /Game mismatch/i);
});

test('S5-WI-3: Stadium rejects a mismatched absolute-resolution gameId before filesystem access', async () => {
  let calls = 0;
  const sent = [];
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: 'exact-game', displayName: 'Exact', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'exact-game', stadiumId: 'stadium', rootFsPath: 'unused', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    gameFiles: { resolveAbsolute: async () => { calls += 1; return { path: 'x', available: false, reason: 'unknown' }; } }
  });
  client.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
  client.connected = true;
  await client.handleIncomingRequest({ id: 1, method: 'game.files.resolveAbsolute', params: { gameId: 'other-game', path: 'x' } });
  assert.equal(calls, 0);
  assert.equal(sent[0].result.success, false);
  assert.match(sent[0].result.message, /Game mismatch/i);
});

test('S2 rapid-search contract: a newer request supersedes an older Stadium walk', async () => {
  const sent = [];
  let releaseOld;
  let signalOldStarted;
  const oldStarted = new Promise((resolve) => { signalOldStarted = resolve; });
  const oldRelease = new Promise((resolve) => { releaseOld = resolve; });
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: 'exact-game', displayName: 'Exact', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'exact-game', stadiumId: 'stadium', rootFsPath: 'unused', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    gameFiles: {
      search: async (_gameId, _root, query, _limit, isSuperseded) => {
        if (query === 'old') {
          signalOldStarted();
          await oldRelease;
        }
        return { query, results: [], truncated: false, moreMatches: false, ...(isSuperseded() ? { superseded: true } : {}) };
      }
    }
  });
  client.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
  client.connected = true;

  const older = client.handleIncomingRequest({ id: 1, method: 'game.files.search', params: { gameId: 'exact-game', query: 'old', searchId: 'old-id' } });
  await oldStarted;
  await client.handleIncomingRequest({ id: 2, method: 'game.files.search', params: { gameId: 'exact-game', query: 'new', searchId: 'new-id' } });
  releaseOld();
  await older;

  const oldResponse = sent.find((frame) => frame.id === 1);
  const newResponse = sent.find((frame) => frame.id === 2);
  assert.equal(oldResponse.result.superseded, true);
  assert.equal(newResponse.result.superseded, undefined);
});
