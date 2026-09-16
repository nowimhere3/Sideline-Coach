import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { ReportPublisher } from '../out/report-publisher.js';
import { StadiumClient } from '../out/stadium-client.js';
import { StadiumFilesystemContractCache } from '../out/stadium-filesystem-contract.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, ms = 5_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return true; await wait(25); }
  return false;
}

const apply = (gameId, revision, path, state = 'ready', lanes = {}) => ({
  gameId, revision, reports: { path, state }, lanes
});

test('S7-1 contract cache accepts newer, idempotently ignores same, rejects stale/cross-Game, and keeps no durable state', () => {
  const cache = new StadiumFilesystemContractCache();
  assert.equal(cache.apply(apply('game-a', 2, 'Reports-SLC')).applied, true);
  assert.equal(cache.apply(apply('game-a', 2, 'Reports-SLC')).applied, false);
  assert.equal(cache.apply(apply('game-a', 1, 'Reports')).stale, true);
  assert.equal(cache.current.revision, 2);
  assert.equal(cache.current.reportsPath, 'Reports-SLC');
  assert.throws(() => cache.apply(apply('game-b', 3, 'Reports')), /belongs to 'game-a'/);
  assert.throws(() => new StadiumFilesystemContractCache().apply(apply('game-a', 1, '../Reports')), /safe Game-relative/);
  assert.equal(cache.store, undefined, 'projection has no persistence adapter or serialized store');
});

test('S7-2 ready roots and canonical lane attribution support legacy, nested, and custom paths', () => {
  for (const [root, reportPath, expected] of [
    ['Reports', 'Reports/Claude/a.md', 'Claude'],
    ['Docs REPORT', 'Docs REPORT/Codex/a.txt', 'Codex'],
    ['Reports-SLC', 'Reports-SLC/Claude/a.md', 'Claude'],
    ['docs/Reports', 'docs/Reports/AntiGravity/2026/a.md', 'AntiGravity'],
    ['custom output', 'custom output/codex/a.md', 'Codex']
  ]) {
    const cache = new StadiumFilesystemContractCache();
    cache.apply(apply('game-a', 1, root, 'ready', {
      codex: { key: 'Codex', folder: 'Codex', state: 'ready' }
    }));
    assert.equal(cache.canonicalAgent(reportPath, 'win32'), expected);
    assert.equal(cache.canonicalAgent(`${root}/result-Claude.md`, 'win32'), 'Unknown Agent');
  }
  for (const state of ['not-set', 'needs-choice', 'needs-attention', 'unknown']) {
    const inactive = new StadiumFilesystemContractCache();
    inactive.apply(apply('game-a', 1, 'Reports-SLC', state));
    assert.equal(inactive.current.reportsReady, false);
    assert.equal(inactive.canonicalAgent('Reports-SLC/Claude/a.md', 'win32'), undefined);
  }
});

test('S7-2b Stadium rejects a wrong gameId before the apply callback can run', async () => {
  let calls = 0;
  let response;
  const client = new StadiumClient({
    port: 1, dir: os.tmpdir(), autoReconnect: false,
    gameContextGetter: () => gameContext('game-a', path.join(os.tmpdir(), 'game-a'), 'stadium-a'),
    filesystemContractApplier: () => { calls += 1; return { success: true, gameId: 'game-a', revision: 1, applied: true, stale: false, reportsChanged: true }; }
  });
  client.sendResponse = (_id, result) => { response = result; };
  await client.handleIncomingRequest({ id: 1, method: 'game.filesystem.apply', params: apply('game-b', 1, 'Reports') });
  assert.equal(calls, 0);
  assert.equal(response.success, false);
  assert.match(response.message, /Game mismatch/);
  client.dispose();
});

test('S7-3 root revision rebuild disposes the old watcher, republishes immediately, and stale watcher stays silent', async () => {
  const cache = new StadiumFilesystemContractCache();
  const host = {
    watchers: [],
    getPatterns: () => cache.current?.reportsPath ? [cache.current.reportsPath] : [],
    createWatcher(pattern, fire) {
      const watcher = { pattern, fire, disposed: false, dispose() { this.disposed = true; } };
      this.watchers.push(watcher);
      return watcher;
    },
    onReportConfigurationChanged: () => ({ dispose() {} })
  };
  const published = [];
  const publisher = new ReportPublisher(host, (reason) => published.push(reason), 10);
  publisher.start();
  cache.apply(apply('game-a', 1, 'Reports'));
  await publisher.rebuildAndPublish();
  const old = host.watchers.at(-1);
  cache.apply(apply('game-a', 2, 'Reports-SLC'));
  await publisher.rebuildAndPublish();
  assert.equal(old.disposed, true);
  assert.deepEqual(publisher.patterns, ['Reports-SLC']);
  assert.deepEqual(published, ['report-root-changed', 'report-root-changed']);
  old.fire();
  await wait(30);
  assert.equal(published.length, 2, 'disposed generation cannot publish');
  host.watchers.at(-1).fire();
  assert.ok(await until(() => published.at(-1) === 'report-file-changed'));
  publisher.dispose();
});

function gameContext(gameId, rootFsPath, stadiumId) {
  return {
    game: { gameId, displayName: gameId, fingerprintSource: 'git-remote', repoUri: `https://example.invalid/${gameId}.git` },
    stadium: { stadiumId, name: 'fixture', platform: process.platform, stadiumType: 'vscode-desktop' },
    binding: { gameId, stadiumId, rootFsPath, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  };
}

function treeSnapshot(root) {
  const entries = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(folder, entry.name);
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isDirectory()) { entries.push(`d:${relative}`); walk(full); }
      else entries.push(`f:${relative}:${fs.readFileSync(full).toString('base64')}`);
    }
  };
  walk(root);
  return entries;
}

function fixtureRuntime({ gameId, root, stadiumId, port, dir }) {
  const cache = new StadiumFilesystemContractCache();
  const scan = async () => {
    const reportsRoot = cache.current?.reportsReady && cache.current.reportsPath
      ? path.join(root, ...cache.current.reportsPath.split('/'))
      : undefined;
    if (!reportsRoot || !fs.existsSync(reportsRoot)) return [];
    const files = [];
    const walk = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:md|txt)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(reportsRoot);
    return files.map((file) => {
      const relative = path.relative(root, file).replace(/\\/g, '/');
      const stat = fs.statSync(file);
      return {
        gameId, project: gameId, agent: cache.canonicalAgent(relative, process.platform) ?? 'Unknown Agent',
        filename: path.basename(file), path: relative, mtime: stat.mtimeMs, content: fs.readFileSync(file, 'utf8')
      };
    }).sort((a, b) => b.mtime - a.mtime);
  };
  const watcherHost = {
    getPatterns: () => cache.current?.reportsPath ? [path.join(root, ...cache.current.reportsPath.split('/'))] : [],
    createWatcher(pattern, fire) {
      try {
        const watcher = fs.watch(String(pattern), { recursive: true }, fire);
        return { dispose: () => watcher.close() };
      } catch { return { dispose() {} }; }
    },
    onReportConfigurationChanged: () => ({ dispose() {} })
  };
  let client;
  const publisher = new ReportPublisher(watcherHost, () => client.publishReportsChanged(), 30);
  publisher.start();
  client = new StadiumClient({
    port, dir, instanceId: `${stadiumId}_${gameId}`, gameContextGetter: () => gameContext(gameId, root, stadiumId),
    reportsGetter: scan,
    filesystemContractApplier: async (params) => {
      const result = cache.apply(params);
      if (result.reportsChanged) await publisher.rebuildAndPublish();
      return result;
    }
  });
  return { cache, client, publisher };
}

test('S7-4 real wire: durable exact-Game contract applies, existing/new canonical reports reach API, sibling Game is unchanged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-s7-wire-'));
  const gameARoot = path.join(dir, 'game-a');
  const gameBRoot = path.join(dir, 'game-b');
  fs.mkdirSync(path.join(gameARoot, 'Reports-SLC', 'Claude'), { recursive: true });
  fs.mkdirSync(path.join(gameBRoot, 'Reports', 'Codex'), { recursive: true });
  fs.writeFileSync(path.join(gameARoot, 'Reports-SLC', 'Claude', 'existing.md'), '# existing');
  fs.writeFileSync(path.join(gameBRoot, 'Reports', 'Codex', 'b.md'), '# b');
  const beforeApplyA = treeSnapshot(gameARoot);
  const beforeApplyB = treeSnapshot(gameBRoot);
  fs.writeFileSync(path.join(dir, 'game-filesystem.json'), JSON.stringify({
    schemaVersion: 1,
    games: {
      'game-a': { schemaVersion: 1, gameId: 'game-a', revision: 4, reports: { path: 'Reports-SLC', provenance: 'human', state: 'ready', lanes: {} }, sop: { provenance: 'none', state: 'not-set' } },
      'game-b': { schemaVersion: 1, gameId: 'game-b', revision: 9, reports: { path: 'Reports', provenance: 'human', state: 'ready', lanes: {} }, sop: { provenance: 'none', state: 'not-set' } }
    }
  }));
  const daemon = new ControlPlaneDaemon({ dir, port: 43000 + Math.floor(Math.random() * 1000), idleTimeoutMs: 60_000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (gameId) => (await fetch(`http://127.0.0.1:${daemon.port}/api/reports?gameId=${gameId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const stadiumId = 'stadium_s7_fixture';
  const a = fixtureRuntime({ gameId: 'game-a', root: gameARoot, stadiumId, port: daemon.port, dir });
  const b = fixtureRuntime({ gameId: 'game-b', root: gameBRoot, stadiumId, port: daemon.port, dir });
  try {
    assert.ok(await a.client.connect());
    assert.ok(await b.client.connect());
    assert.ok(await until(() => a.cache.current?.reportsPath === 'Reports-SLC' && b.cache.current?.reportsPath === 'Reports'), 'reconnect applies each durable contract');
    const gameBRevision = b.cache.current.revision;
    assert.ok(await until(async () => (await api('game-a')).some((report) => report.filename === 'existing.md')));
    assert.deepEqual((await api('game-a')).map((report) => report.agent), ['Claude']);
    assert.deepEqual(treeSnapshot(gameARoot), beforeApplyA, 'apply/scan/watch creates, moves, renames, and deletes nothing in Game A');
    assert.deepEqual(treeSnapshot(gameBRoot), beforeApplyB, 'apply/scan/watch creates, moves, renames, and deletes nothing in Game B');
    const beforeB = await api('game-b');
    assert.deepEqual(beforeB.map((report) => report.filename), ['b.md']);

    fs.writeFileSync(path.join(gameARoot, 'Reports-SLC', 'Claude', 'new.md'), '# new');
    assert.ok(await until(async () => (await api('game-a')).some((report) => report.filename === 'new.md')), 'filesystem watcher republishes without reconnect/browser refresh');
    assert.deepEqual((await api('game-b')).map((report) => report.filename), ['b.md'], 'Game B report snapshot is untouched');
    assert.equal(b.cache.current.revision, gameBRevision, 'Game A activity cannot alter Game B applied revision');
  } finally {
    a.publisher.dispose(); b.publisher.dispose();
    a.client.dispose(); b.client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
