/**
 * P0.1 — Control Plane Freshness Guard.
 *
 * "Fresh source should automatically meet fresh runtime."
 * Build identity, never time. Ownership proven before any termination. Exactly one
 * replacement however many Stadiums notice. Everyone converges and reconnects.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessFreshness,
  computeControlPlaneBuild,
  provesOwnership,
  supersedesAfter,
  CONTROL_PLANE_SERVICE
} from '../out/control-plane/freshness.js';
import { ensureControlPlaneRunning } from '../out/control-plane/launcher.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realDaemonScript = path.join(repoRoot, 'out', 'control-plane', 'daemon.js');
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Build identity
// ---------------------------------------------------------------------------

function fakeOutTree() {
  const root = tmp('sideline-cp-build-');
  const write = (rel, content) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), content); };
  write('control-plane/daemon.js', 'const r = require("./router");\nconst p = require("../routing-policy");\nconst ws = require("ws");\n');
  write('control-plane/router.js', 'exports.route = 1;\n');
  write('routing-policy.js', 'const a = require("./play-analyzer");\n');
  write('play-analyzer.js', 'exports.a = 1;\n');
  write('player-roster.js', 'exports.stadiumOnly = 1;\n');
  write('public/index.html', '<html>page</html>');
  return { root, write, script: path.join(root, 'control-plane', 'daemon.js') };
}

test('P0.1-1. Build identity is deterministic, follows the daemon runtime closure, and ignores Stadium/UI files', () => {
  const tree = fakeOutTree();
  const a = computeControlPlaneBuild(tree.script);
  assert.equal(computeControlPlaneBuild(tree.script).buildId, a.buildId, 'unchanged build → identical identity');
  assert.deepEqual([...a.files], ['control-plane/daemon.js', 'control-plane/router.js', 'play-analyzer.js', 'routing-policy.js']);
  assert.match(a.buildId, /^cp-[0-9a-f]{24}$/);

  tree.write('public/index.html', '<html>new page</html>');
  tree.write('player-roster.js', 'exports.stadiumOnly = 2;\n');
  assert.equal(computeControlPlaneBuild(tree.script).buildId, a.buildId, 'page and Stadium-only changes never churn the daemon');

  tree.write('play-analyzer.js', 'exports.a = 2;\n');
  assert.notEqual(computeControlPlaneBuild(tree.script).buildId, a.buildId, 'a transitive daemon module change is a new build');
  fs.rmSync(tree.root, { recursive: true, force: true });
});

test('P0.1-2. The real daemon closure covers router, registry, ledger, protocol and the guard itself — not the roster or page', () => {
  const { files, buildId } = computeControlPlaneBuild(realDaemonScript);
  for (const expected of ['control-plane/daemon.js', 'control-plane/router.js', 'control-plane/stadium-registry.js', 'control-plane/work-ledger.js', 'control-plane/protocol.js', 'control-plane/freshness.js', 'routing-policy.js']) {
    assert.ok(files.includes(expected), `${expected} is part of the Control Plane build`);
  }
  for (const excluded of ['player-roster.js', 'extension.js', 'stadium-client.js', 'player-control/structured-print.js']) {
    assert.ok(!files.includes(excluded), `${excluded} is Stadium-side and must not churn the daemon`);
  }
  assert.ok(buildId);
});

// ---------------------------------------------------------------------------
// Ownership + verdicts
// ---------------------------------------------------------------------------

test('P0.1-3. Ownership is proven by the daemon itself; a reused PID or foreign listener never qualifies', () => {
  const manifest = { pid: 4242, port: 3100, instanceId: 'cpi_a' };
  assert.equal(provesOwnership(manifest, { status: 'ok', service: CONTROL_PLANE_SERVICE, pid: 4242, instanceId: 'cpi_a' }), true);
  assert.equal(provesOwnership({ pid: 4242, port: 3100 }, { status: 'ok', pid: 4242, protocolVersion: 1 }), true, 'legacy daemon (pre-guard) still provable by self-reported PID');
  assert.equal(provesOwnership(manifest, { status: 'ok', service: CONTROL_PLANE_SERVICE, pid: 9999, instanceId: 'cpi_a' }), false, 'PID now belongs to another process');
  assert.equal(provesOwnership(manifest, { status: 'ok', service: CONTROL_PLANE_SERVICE, pid: 4242, instanceId: 'cpi_other' }), false, 'a different daemon instance');
  assert.equal(provesOwnership(manifest, { status: 'ok', service: 'some-other-service', pid: 4242, instanceId: 'cpi_a' }), false);
  assert.equal(provesOwnership(manifest, undefined), false, 'silent → unknown, never owned');
});

test('P0.1-4. Freshness verdicts: match reuses; stale replaces only from a current Stadium; outdated windows never fight a newer build', () => {
  const script = 'C:/coach/out/control-plane/daemon.js';
  const running = (buildId, extra = {}) => ({ status: 'ok', buildId, daemonScriptPath: script, ...extra });
  assert.equal(assessFreshness({ expectedBuildId: 'B', diskBuildId: 'B', daemonScriptPath: script }, running('B')).kind, 'current');
  assert.deepEqual(assessFreshness({ expectedBuildId: 'B', diskBuildId: 'B', daemonScriptPath: script }, running('A')), { kind: 'stale', replace: true, reason: 'build-mismatch' });
  assert.equal(assessFreshness({ expectedBuildId: 'B', diskBuildId: 'B', daemonScriptPath: script }, { status: 'ok' }).reason, 'legacy-daemon-without-build-identity', 'Unknown build is never called current');
  assert.deepEqual(assessFreshness({ expectedBuildId: 'A', diskBuildId: 'B', daemonScriptPath: script }, running('B')), { kind: 'stadium-outdated', replace: false, reason: 'window-loaded-older-build' }, 'an un-reloaded window defers');
  assert.equal(assessFreshness({ expectedBuildId: 'A', diskBuildId: 'A', daemonScriptPath: script }, running('C', { supersedes: ['A'] })).kind, 'stale', 'same installation: disk is the truth, so a revert to A still wins');
  const other = 'C:/Users/u/.vscode/extensions/local.sideline-coach-2.0.0/out/control-plane/daemon.js';
  assert.equal(assessFreshness({ expectedBuildId: 'v1', diskBuildId: 'v1', daemonScriptPath: script }, { status: 'ok', buildId: 'v2', daemonScriptPath: other, supersedes: ['v1'] }).kind, 'stadium-outdated', 'an old installed version never replaces its successor');
  assert.equal(assessFreshness({ expectedBuildId: 'v2', diskBuildId: 'v2', daemonScriptPath: other }, { status: 'ok', buildId: 'v1', daemonScriptPath: script }).kind, 'stale', 'a new installed version replaces an old daemon');
  assert.deepEqual(supersedesAfter({ buildId: 'B', supersedes: ['A', 'B'] }), ['B', 'A']);
});

// ---------------------------------------------------------------------------
// Replacement protocol against a simulated process world
// ---------------------------------------------------------------------------

function world({ dir, script, diskBuild }) {
  const w = {
    daemons: new Map(), // pid → daemon
    foreignPids: new Set(),
    diskBuild,
    nextPid: 5000,
    spawns: 0,
    shutdowns: 0,
    terminations: [],
    spawnWorks: true,
    manifestPath: path.join(dir, 'control-plane.json'),
    writeManifest(d) {
      const temp = `${w.manifestPath}.${d.instanceId}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ protocolVersion: 1, port: d.port, pid: d.pid, startedAt: 0, controlPlaneUrl: '', service: d.legacy ? undefined : CONTROL_PLANE_SERVICE, instanceId: d.legacy ? undefined : d.instanceId, buildId: d.buildId, daemonScriptPath: script, supersedes: d.supersedes }));
      fs.renameSync(temp, w.manifestPath);
    },
    start({ buildId, instanceId = `cpi_${w.nextPid}`, port = 3100, supersedes = [], legacy = false, silent = false }) {
      const d = { pid: w.nextPid++, instanceId, buildId, port, supersedes, legacy, silent, alive: true };
      w.daemons.set(d.pid, d);
      w.writeManifest(d);
      return d;
    },
    listener(port) { return [...w.daemons.values()].find((d) => d.alive && d.port === port); },
    deps: {
      sleep: (ms) => wait(Math.max(1, Math.round(ms / 10))),
      isProcessAlive: (pid) => w.foreignPids.has(pid) || Boolean(w.daemons.get(pid)?.alive),
      health: async (port) => {
        await wait(2);
        const d = w.listener(port);
        if (!d || d.silent) return undefined;
        return d.legacy
          ? { status: 'ok', pid: d.pid, protocolVersion: 1 }
          : { status: 'ok', service: CONTROL_PLANE_SERVICE, pid: d.pid, instanceId: d.instanceId, buildId: d.buildId, daemonScriptPath: script, supersedes: d.supersedes };
      },
      requestShutdown: async (port, token, instanceId) => {
        const d = w.listener(port);
        if (!d || d.instanceId !== instanceId) return false;
        w.shutdowns += 1;
        setTimeout(() => { d.alive = false; try { if (JSON.parse(fs.readFileSync(w.manifestPath, 'utf8')).instanceId === d.instanceId) fs.unlinkSync(w.manifestPath); } catch {} }, 5);
        return true;
      },
      terminate: (pid) => { w.terminations.push(pid); const d = w.daemons.get(pid); if (d) d.alive = false; },
      spawnDaemon: (args, env) => {
        w.spawns += 1;
        if (!w.spawnWorks) return;
        setTimeout(() => {
          const busy = (port) => Boolean(w.listener(port));
          let port = 3100; while (busy(port)) port += 1;
          w.start({ buildId: w.diskBuild, instanceId: env.SIDELINE_DAEMON_INSTANCE, port, supersedes: JSON.parse(env.SIDELINE_SUPERSEDES) });
        }, 15);
      }
    }
  };
  return w;
}

function lab(diskBuild = 'B') {
  const dir = tmp('sideline-cp-launch-');
  fs.writeFileSync(path.join(dir, 'token'), 'tok');
  const script = path.join(dir, 'out', 'control-plane', 'daemon.js');
  const w = world({ dir, script, diskBuild });
  const ensure = (expectedBuildId = w.diskBuild, extra = {}) => ensureControlPlaneRunning({ dir, daemonScriptPath: script, expectedBuildId, diskBuildId: () => w.diskBuild, deps: w.deps, timeoutMs: 8_000, ...extra });
  return { dir, w, ensure, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('P0.1-5. Current daemon is reused: no spawn, no shutdown, no termination', async () => {
  const { w, ensure, cleanup } = lab('B');
  const running = w.start({ buildId: 'B' });
  const result = await ensure('B');
  assert.equal(result.pid, running.pid);
  assert.deepEqual(result.freshness, { verdict: 'current', expectedBuildId: 'B', runningBuildId: 'B', replaced: false, reason: 'build-match' });
  assert.equal(w.spawns + w.shutdowns + w.terminations.length, 0);
  cleanup();
});

test('P0.1-6. Stale daemon (A running, B compiled) is replaced safely: owner-verified step-down, one spawn, lineage recorded', async () => {
  const { w, ensure, cleanup } = lab('B');
  const old = w.start({ buildId: 'A' });
  const result = await ensure('B');
  assert.equal(w.shutdowns, 1, 'graceful, instance-addressed step-down');
  assert.equal(w.terminations.length, 0, 'no kill needed when the daemon stepped down');
  assert.equal(w.spawns, 1);
  assert.equal(old.alive, false);
  assert.equal(result.buildId, 'B');
  assert.deepEqual(result.supersedes, ['A']);
  assert.equal(result.port, 3100, 'the phone keeps its URL: the port is freed before the new daemon binds');
  assert.equal(result.freshness.replaced, true);
  assert.equal(result.freshness.reason, 'build-mismatch');
  cleanup();
});

test('P0.1-7. Two and three Stadiums noticing the same stale daemon produce exactly ONE replacement and converge', async () => {
  for (const count of [2, 3]) {
    const { w, ensure, cleanup } = lab('B');
    w.start({ buildId: 'A' });
    const results = await Promise.all(Array.from({ length: count }, () => ensure('B')));
    assert.equal(w.spawns, 1, `${count} Stadiums → one spawn`);
    assert.equal(w.shutdowns, 1, `${count} Stadiums → one step-down`);
    assert.equal(new Set(results.map((r) => r.instanceId)).size, 1, 'all converge on the same new daemon');
    assert.equal(results.filter((r) => r.freshness.replaced).length, 1, 'exactly one Stadium reports that it replaced it');
    assert.ok(results.every((r) => r.buildId === 'B'));
    cleanup();
  }
});

test('P0.1-8. Dead PID, missing manifest and corrupt manifest start a daemon without terminating anything', async () => {
  const dead = lab('B');
  const ghost = dead.w.start({ buildId: 'A' });
  ghost.alive = false;
  const r1 = await dead.ensure('B');
  assert.equal(r1.buildId, 'B');
  assert.equal(dead.w.terminations.length + dead.w.shutdowns, 0);
  dead.cleanup();

  const missing = lab('B');
  const r2 = await missing.ensure('B');
  assert.equal(r2.buildId, 'B');
  assert.equal(missing.w.spawns, 1);
  missing.cleanup();

  const corrupt = lab('B');
  fs.writeFileSync(corrupt.w.manifestPath, '{ this is not json');
  const r3 = await corrupt.ensure('B');
  assert.equal(r3.buildId, 'B');
  assert.equal(corrupt.w.terminations.length, 0);
  corrupt.cleanup();
});

test('P0.1-9. A legacy daemon with no build identity is Unknown → replaced only after ownership is proven', async () => {
  const { w, ensure, cleanup } = lab('B');
  const legacy = w.start({ buildId: undefined, legacy: true });
  const result = await ensure('B');
  assert.equal(result.freshness.reason, 'legacy-daemon-without-build-identity');
  assert.deepEqual(w.terminations, [legacy.pid], 'legacy daemons have no shutdown route; termination only after proven ownership');
  assert.equal(result.buildId, 'B');
  cleanup();
});

test('P0.1-10. A manifest PID that now belongs to another process is NEVER killed; a new daemon takes another port', async () => {
  const { w, ensure, cleanup } = lab('B');
  const foreign = 7777;
  w.foreignPids.add(foreign);
  const squatter = w.start({ buildId: 'Z', silent: true }); // something holds 3100 but never answers as a Control Plane
  fs.writeFileSync(w.manifestPath, JSON.stringify({ protocolVersion: 1, port: 3100, pid: foreign, startedAt: 0, controlPlaneUrl: '' }));
  const result = await ensure('B');
  assert.equal(w.terminations.length, 0, 'unrelated process untouched');
  assert.equal(w.shutdowns, 0);
  assert.equal(squatter.alive, true);
  assert.equal(result.port, 3101, 'port change is followed through the manifest');
  assert.equal(result.buildId, 'B');
  cleanup();
});

test('P0.1-11. An outdated window (not reloaded since the compile) reuses the newer daemon instead of fighting it', async () => {
  const { w, ensure, cleanup } = lab('B');
  const current = w.start({ buildId: 'B', supersedes: ['A'] });
  const result = await ensure('A'); // loaded A at activation; disk now holds B
  assert.equal(result.instanceId, current.instanceId);
  assert.equal(result.freshness.verdict, 'stadium-outdated');
  assert.equal(w.spawns + w.shutdowns + w.terminations.length, 0);
  cleanup();
});

test('P0.1-12. Spawn failure fails truthfully and never wedges the election lock', async () => {
  const { dir, w, ensure, cleanup } = lab('B');
  w.spawnWorks = false;
  await assert.rejects(ensure('B', { timeoutMs: 1_500 }), /did not start in time|Timed out/);
  assert.equal(fs.existsSync(path.join(dir, 'control-plane.lock')), false, 'lock released');
  w.spawnWorks = true;
  const recovered = await ensure('B');
  assert.equal(recovered.buildId, 'B');
  cleanup();
});

// ---------------------------------------------------------------------------
// Real daemon: handshake, owner-verified shutdown, reconnect, selection, reports
// ---------------------------------------------------------------------------

const gameContext = (gameId, displayName, stadiumId) => ({
  game: { gameId, displayName, fingerprintSource: 'git-remote', repoUri: `https://example.com/${gameId}.git` },
  stadium: { stadiumId, name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId, stadiumId, rootFsPath: `C:\\Games\\${displayName}`, boundAt: Date.now(), isPrimary: true, status: 'bound' }
});

async function until(predicate, ms = 6_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return true; await wait(25); }
  return false;
}

test('P0.1-13. Real daemon: truthful build handshake, instance-addressed shutdown, and a manifest it only removes when it is its own', async () => {
  const dir = tmp('sideline-cp-real-');
  const daemon = new ControlPlaneDaemon({ dir, port: 39210, idleTimeoutMs: 60_000, daemonScriptPath: realDaemonScript, instanceId: 'cpi_real_a', supersedes: ['cp-old'], replacementReason: 'build-mismatch' });
  const record = await daemon.start();
  try {
    assert.equal(record.buildId, computeControlPlaneBuild(realDaemonScript).buildId);
    assert.equal(record.instanceId, 'cpi_real_a');
    const health = await (await fetch(`http://127.0.0.1:${record.port}/api/health`)).json();
    assert.deepEqual({ service: health.service, pid: health.pid, instanceId: health.instanceId, buildId: health.buildId, supersedes: health.supersedes }, { service: CONTROL_PLANE_SERVICE, pid: process.pid, instanceId: 'cpi_real_a', buildId: record.buildId, supersedes: ['cp-old'] });
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const diag = await (await fetch(`http://127.0.0.1:${record.port}/api/diagnostics`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(diag.controlPlane.buildId, record.buildId);
    assert.equal(diag.controlPlane.replacementReason, 'build-mismatch');

    const post = (body, auth = token) => fetch(`http://127.0.0.1:${record.port}/api/control-plane/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ instanceId: 'cpi_real_a' }, 'wrong')).status, 401);
    assert.equal((await post({ instanceId: 'cpi_someone_else' })).status, 409, 'a shutdown for another instance is refused');

    // A replacement already wrote its manifest: stopping must not delete it.
    fs.writeFileSync(path.join(dir, 'control-plane.json'), JSON.stringify({ ...record, instanceId: 'cpi_new' }));
    assert.equal((await post({ instanceId: 'cpi_real_a', reason: 'test' })).status, 200);
    assert.ok(await until(() => !daemon.isListening));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'control-plane.json'), 'utf8')).instanceId, 'cpi_new');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('P0.1-14. After a Control Plane replacement every Stadium reconnects by itself; selected Game, Game isolation and Incoming survive; work is never fabricated', async () => {
  const dir = tmp('sideline-cp-reconnect-');
  let daemon = new ControlPlaneDaemon({ dir, port: 39220, idleTimeoutMs: 60_000, daemonScriptPath: realDaemonScript, instanceId: 'cpi_build_a' });
  await daemon.start();
  const stadiumId = getDurableStadiumId(dir);
  let currentPort = daemon.port;
  const resolveControlPlane = async () => ({ port: currentPort, freshness: { verdict: 'current', replaced: false, reason: 'test' } });
  const reports = (gameId, name) => [{ gameId, project: gameId, agent: 'Claude', filename: `${name}.md`, path: `Reports/Claude/${name}.md`, mtime: 1, content: name }];
  const trend = new StadiumClient({ port: currentPort, dir, instanceId: `inst_${stadiumId}_trend`, gameContextGetter: () => gameContext('game_trend', 'Trend', stadiumId), reportsGetter: async () => reports('game_trend', 'trend-report'), resolveControlPlane });
  const gs3 = new StadiumClient({ port: currentPort, dir, instanceId: `inst_${stadiumId}_gs3`, gameContextGetter: () => gameContext('game_gs3', 'GS3', stadiumId), reportsGetter: async () => reports('game_gs3', 'gs3-report'), resolveControlPlane });
  const api = async (url, init = {}) => {
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const response = await fetch(`http://127.0.0.1:${currentPort}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return response.json();
  };
  try {
    assert.ok(await gs3.connect());
    assert.ok(await trend.connect());
    assert.ok(await until(async () => (await api('/api/games')).games?.length === 2));
    await api('/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: 'game_trend' }) });
    assert.equal((await api('/api/status')).selectedGameId, 'game_trend');

    // Replacement: Build A steps down, Build B starts (another port proves re-resolution).
    await daemon.stop();
    daemon = new ControlPlaneDaemon({ dir, port: 39230, idleTimeoutMs: 60_000, daemonScriptPath: realDaemonScript, instanceId: 'cpi_build_b', supersedes: ['cp-a'] });
    await daemon.start();
    currentPort = daemon.port;

    assert.ok(await until(() => trend.isConnected && gs3.isConnected, 10_000), 'both Stadiums reconnect without anyone touching them');
    assert.ok(await until(async () => (await api('/api/games')).games?.filter((g) => g.connectionStatus === 'connected').length === 2, 6_000));
    assert.equal((await api('/api/status')).selectedGameId, 'game_trend', "the human's selected Game survives, even though GS3 reconnected first");
    assert.ok(await until(async () => (await api('/api/reports?gameId=game_trend')).length === 1));
    assert.deepEqual((await api('/api/reports?gameId=game_trend')).map((r) => r.filename), ['trend-report.md'], 'Incoming republished after reconnect');
    assert.deepEqual((await api('/api/reports?gameId=game_gs3')).map((r) => r.filename), ['gs3-report.md'], 'no report crosses Games');
    const ledger = (await api('/api/status')).workLedger || [];
    assert.ok(ledger.every((entry) => entry.workState !== 'working' && entry.workState !== 'completed'), 'a restarted Control Plane never fabricates work');
  } finally {
    trend.dispose();
    gs3.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('P0.1-15. The Stadium wires the guard: build loaded once at activation, every reconnect re-resolves, Dad Mode says "Updating…"', () => {
  const extension = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
  assert.match(extension, /expectedControlPlaneBuild = computeControlPlaneBuild\(daemonScriptPath\)\.buildId/);
  assert.match(extension, /expectedBuildId: expectedControlPlaneBuild/);
  assert.match(extension, /diskBuildId: \(\) => computeControlPlaneBuild\(daemonScriptPath\)\.buildId/);
  assert.match(extension, /resolveControlPlane: async \(\) =>/);
  assert.match(extension, /Coach: Updating…/);
  assert.doesNotMatch(extension, /ensureControlPlaneRunning\(\{ daemonScriptPath \}\)/, 'no unguarded launch path remains');
  const client = fs.readFileSync(path.join(repoRoot, 'src', 'stadium-client.ts'), 'utf8');
  assert.match(client, /void this\.reconnect\(\)/);
  assert.match(client, /controlPlaneBuildId: this\.options\.controlPlaneBuildId/);
});

test('P0.1-16. A superseded daemon with an open SSE stream still releases its port and closes promptly (field defect)', async () => {
  const dir = tmp('sideline-cp-sse-');
  const daemon = new ControlPlaneDaemon({ dir, port: 39240, idleTimeoutMs: 60_000, daemonScriptPath: realDaemonScript, instanceId: 'cpi_sse' });
  const record = await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const http = await import('node:http');
  let streamEnded = false;
  await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: record.port, path: `/api/events?token=${token}`, agent: new http.Agent({ keepAlive: true }) }, (res) => {
      res.on('close', () => { streamEnded = true; });
      res.once('data', () => resolve());
    });
    req.on('error', () => { streamEnded = true; resolve(); });
  });
  const started = Date.now();
  const response = await fetch(`http://127.0.0.1:${record.port}/api/control-plane/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId: 'cpi_sse' }) });
  assert.equal(response.status, 200);
  assert.ok(await until(() => streamEnded && !daemon.isListening, 3_000), 'phone stream closed and port released');
  assert.ok(Date.now() - started < 3_000);
  await daemon.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P0.1-17. A Stadium whose reconnect attempt hangs (half-closed daemon) keeps retrying until it reaches the new Control Plane', async () => {
  const dir = tmp('sideline-cp-hang-');
  const net = await import('node:net');
  // Accepts TCP but never answers the WebSocket upgrade — the live half-closed daemon.
  const hung = net.createServer(() => {});
  await new Promise((resolve) => hung.listen(39250, '127.0.0.1', resolve));
  const daemon = new ControlPlaneDaemon({ dir, port: 39251, idleTimeoutMs: 60_000, daemonScriptPath: realDaemonScript, instanceId: 'cpi_after_hang' });
  await daemon.start();
  let attempts = 0;
  const stadiumId = getDurableStadiumId(dir);
  const client = new StadiumClient({
    port: 39250, dir, instanceId: `inst_${stadiumId}_hang`,
    gameContextGetter: () => gameContext('game_trend', 'Trend', stadiumId),
    resolveControlPlane: async () => { attempts += 1; return { port: attempts === 1 ? 39250 : daemon.port }; }
  });
  try {
    client.reconnect();
    assert.ok(await until(() => client.isConnected, 15_000), 'recovered without a close event from the hung attempt');
    assert.ok(attempts >= 2);
  } finally {
    client.dispose();
    hung.close();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
