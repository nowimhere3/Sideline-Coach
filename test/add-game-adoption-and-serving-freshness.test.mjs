/**
 * Q2 Add Game final contract — explicit folder adoption + serving-Stadium freshness.
 *
 * Field evidence reproduced here:
 * - Gallery-Media-Suite is a real local Git repository with commits and NO remote.
 *   Add Game refused it ("add a .sideline/game.json marker"): the picker's identity
 *   ladder stops at git-remote, and every Stadium resolves such a folder as `unknown`.
 * - A plain folder resolved through the Stadium-local project registry gets a RANDOM id
 *   per VS Code profile, so the picking window and the launched dev host (own
 *   --user-data-dir) disagree on the Game id and the new Stadium can never bind.
 * - FloppyDisk Add Game was served by a Stadium still running pre-fix code while a
 *   current Stadium was connected.
 *
 * All identity tests use the real filesystem and real `git`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { adoptGameFolder } from '../out/game-adoption.js';
import { resolveGameContextSync } from '../out/game-identity.js';
import { computeControlPlaneBuild } from '../out/control-plane/freshness.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';

const PLUMBING = /\.sideline|game\.json|marker|extensionDevelopmentPath/i;

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-adopt-'));
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function git(cwd, ...args) {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'ignore' });
}

function localGitRepo(parent, name) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'README.md'), '# local\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'Stage 1');
  return dir;
}

/** A Stadium's view of a folder. Each "profile" has its own globalState, exactly like separate --user-data-dir hosts. */
function memento() {
  const store = new Map();
  return { get: (k) => store.get(k), update: (k, v) => { store.set(k, v); return Promise.resolve(); } };
}
function resolveAs(dir, profile) {
  return resolveGameContextSync({ workspaceFolder: { uri: { fsPath: dir }, name: path.basename(dir) }, memento: profile }).game;
}

test('AD1. FORMER FAILURE: a local Git repo with no remote has no Game identity in any Stadium', () => {
  const s = scratch();
  try {
    const repo = localGitRepo(s.root, 'Gallery-Media-Suite');
    assert.equal(resolveAs(repo, memento()).gameId, 'unknown');
    assert.equal(resolveAs(repo, undefined).gameId, 'unknown');
  } finally { s.cleanup(); }
});

test('AD2. FORMER LATENT FAILURE: a plain folder gets a different registry id in each Stadium profile', () => {
  const s = scratch();
  try {
    const folder = path.join(s.root, 'plain-project');
    fs.mkdirSync(folder);
    const pickingWindow = resolveAs(folder, memento());
    const launchedHost = resolveAs(folder, memento());
    assert.equal(pickingWindow.fingerprintSource, 'registry');
    assert.notEqual(pickingWindow.gameId, launchedHost.gameId, 'this is why such a Game could never bind');
  } finally { s.cleanup(); }
});

test('AD3. Local Git repo without remote is adopted, and every Stadium resolves the same Game id', () => {
  const s = scratch();
  try {
    const repo = localGitRepo(s.root, 'Gallery-Media-Suite');
    const outcome = adoptGameFolder(repo, { homeDir: s.root + '-home' });
    assert.equal(outcome.kind, 'adopted');
    assert.match(outcome.gameId, /^game_local_[0-9a-f]{16}$/);
    assert.equal(outcome.displayName, 'Gallery-Media-Suite');
    for (const profile of [memento(), memento(), undefined]) {
      const game = resolveAs(repo, profile);
      assert.equal(game.gameId, outcome.gameId);
      assert.equal(game.fingerprintSource, 'marker');
    }
  } finally { s.cleanup(); }
});

test('AD4. A plain local project folder is adopted with a portable identity', () => {
  const s = scratch();
  try {
    const folder = path.join(s.root, 'plain-project');
    fs.mkdirSync(folder);
    const outcome = adoptGameFolder(folder, { homeDir: s.root + '-home' });
    assert.equal(outcome.kind, 'adopted');
    assert.equal(resolveAs(folder, memento()).gameId, outcome.gameId);
    assert.equal(resolveAs(folder, memento()).gameId, outcome.gameId);
  } finally { s.cleanup(); }
});

test('AD5. Existing strong identity is reused and nothing is written', () => {
  const s = scratch();
  try {
    const remote = localGitRepo(s.root, 'FloppyDisk');
    git(remote, 'remote', 'add', 'origin', 'https://github.com/nowimhere3/floppydisk.git');
    assert.deepEqual(adoptGameFolder(remote, { homeDir: s.root + '-home' }), { kind: 'existing', source: 'git-remote' });
    assert.equal(fs.existsSync(path.join(remote, '.sideline')), false, 'a remote-backed repository is never touched');

    const marked = path.join(s.root, 'marked');
    fs.mkdirSync(path.join(marked, '.sideline'), { recursive: true });
    const markerBody = '{"gameId":"game_existing_1","displayName":"Marked"}';
    fs.writeFileSync(path.join(marked, '.sideline', 'game.json'), markerBody);
    assert.deepEqual(adoptGameFolder(marked, { homeDir: s.root + '-home' }), { kind: 'existing', source: 'marker' });
    assert.equal(fs.readFileSync(path.join(marked, '.sideline', 'game.json'), 'utf8'), markerBody);
  } finally { s.cleanup(); }
});

test('AD6. Adding the same folder twice converges on one Game id', () => {
  const s = scratch();
  try {
    const repo = localGitRepo(s.root, 'Twice');
    const first = adoptGameFolder(repo, { homeDir: s.root + '-home' });
    const markerAfterFirst = fs.readFileSync(first.markerPath, 'utf8');
    assert.deepEqual(adoptGameFolder(repo, { homeDir: s.root + '-home' }), { kind: 'existing', source: 'marker' });
    assert.equal(fs.readFileSync(first.markerPath, 'utf8'), markerAfterFirst);
    assert.equal(resolveAs(repo, memento()).gameId, first.gameId);
  } finally { s.cleanup(); }
});

test('AD7. Move/rename keeps the Game id; a later GitHub remote does not fork it', () => {
  const s = scratch();
  try {
    const repo = localGitRepo(s.root, 'Before');
    const { gameId } = adoptGameFolder(repo, { homeDir: s.root + '-home' });
    const moved = path.join(s.root, 'nested', 'After Rename');
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(repo, moved);
    assert.equal(resolveAs(moved, memento()).gameId, gameId);

    git(moved, 'remote', 'add', 'origin', 'git@github.com:nowimhere3/after.git');
    const later = resolveAs(moved, memento());
    assert.equal(later.gameId, gameId, 'the marker outranks the remote');
    assert.equal(later.fingerprintSource, 'marker');
  } finally { s.cleanup(); }
});

test('AD8. A failed marker write is truthful and leaves the folder as it was', () => {
  const s = scratch();
  try {
    const folder = path.join(s.root, 'blocked');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, '.sideline'), 'not a directory'); // makes the marker unwritable on every OS
    const outcome = adoptGameFolder(folder, { homeDir: s.root + '-home' });
    assert.equal(outcome.kind, 'refused');
    assert.equal(outcome.reason, 'not-writable');
    assert.doesNotMatch(outcome.message, PLUMBING);
    assert.equal(fs.readFileSync(path.join(folder, '.sideline'), 'utf8'), 'not a directory');
    assert.equal(resolveAs(folder, undefined).gameId, 'unknown');
  } finally { s.cleanup(); }
});

test('AD9. An unreadable existing marker is never overwritten', () => {
  const s = scratch();
  try {
    const folder = path.join(s.root, 'broken');
    fs.mkdirSync(path.join(folder, '.sideline'), { recursive: true });
    fs.writeFileSync(path.join(folder, '.sideline', 'game.json'), '{ not json');
    const outcome = adoptGameFolder(folder, { homeDir: s.root + '-home' });
    assert.equal(outcome.reason, 'marker-unreadable');
    assert.equal(fs.readFileSync(path.join(folder, '.sideline', 'game.json'), 'utf8'), '{ not json');
  } finally { s.cleanup(); }
});

test('AD10. Unsafe choices are refused in plain language: inside another repo, home folder, drive root', () => {
  const s = scratch();
  try {
    const repo = localGitRepo(s.root, 'GS3');
    const sub = path.join(repo, 'src');
    fs.mkdirSync(sub);
    const inside = adoptGameFolder(sub, { homeDir: s.root + '-home' });
    assert.equal(inside.reason, 'inside-repository');
    assert.match(inside.message, /inside the GS3 project/);
    assert.equal(fs.existsSync(path.join(sub, '.sideline')), false, 'never writes into another Game');

    assert.equal(adoptGameFolder(s.root, { homeDir: s.root }).reason, 'home-folder');
    assert.equal(adoptGameFolder(path.parse(s.root).root, { homeDir: s.root }).reason, 'filesystem-root');
    for (const refusal of [inside, adoptGameFolder(s.root, { homeDir: s.root }), adoptGameFolder(path.join(s.root, 'missing'))]) {
      assert.doesNotMatch(refusal.message, PLUMBING);
    }
  } finally { s.cleanup(); }
});

// --- Serving-Stadium freshness ---------------------------------------------------------

async function freshnessHarness(port, builds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-serving-'));
  const extensionEntryPath = path.join(dir, 'extension.js');
  fs.writeFileSync(extensionEntryPath, 'module.exports = { build: "current" };\n');
  const current = computeControlPlaneBuild(extensionEntryPath).buildId;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 120000, extensionEntryPath });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const served = [];

  const clients = [];
  for (const [name, build] of Object.entries(builds)) {
    const game = { gameId: `game_${name}`, displayName: name, fingerprintSource: 'git-remote' };
    const client = new StadiumClient({
      port: daemon.port, dir, token, instanceId: `inst_${name}`, autoReconnect: false,
      extensionBuildId: build === 'current' ? current : build,
      gameContextGetter: () => ({
        game,
        stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
        binding: { gameId: game.gameId, stadiumId: 'stadium_test', rootFsPath: `C:\\repos\\${name}`, boundAt: Date.now(), isPrimary: true, status: 'bound' }
      }),
      pickGame: async () => { served.push(name); return { success: false, cancelled: true, message: 'No repository chosen.' }; }
    });
    assert.equal(await client.connect(), true);
    clients.push(client);
  }

  const post = async (pathname, body = {}) => {
    const res = await fetch(`http://127.0.0.1:${daemon.port}${pathname}?token=${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify(body) });
    return res.json();
  };
  const stop = async () => { for (const c of clients) c.dispose(); await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { post, served, stop, logPath: path.join(dir, 'logs', 'control-plane.log') };
}

test('FH1. A known-stale selected Stadium does not serve Add Game when a current Stadium is connected', async () => {
  const h = await freshnessHarness(39471, { gs3: 'cp-prefix-stale', gallerytest: 'current' });
  try {
    await h.post('/api/game/select', { gameId: 'game_gs3' });
    await h.post('/api/game/add');
    assert.deepEqual(h.served, ['gallerytest']);
  } finally { await h.stop(); }
});

test('FH2. A stale Stadium still serves Add Game when it is the only one (never blocked)', async () => {
  const h = await freshnessHarness(39472, { gs3: 'cp-prefix-stale' });
  try {
    await h.post('/api/game/add');
    assert.deepEqual(h.served, ['gs3']);
  } finally { await h.stop(); }
});

test('FH3. Selected current Stadium serves; unknown builds never cause a switch', async () => {
  const a = await freshnessHarness(39473, { gs3: 'current', trend: 'current' });
  try {
    await a.post('/api/game/select', { gameId: 'game_trend' });
    await a.post('/api/game/add');
    assert.deepEqual(a.served, ['trend']);
  } finally { await a.stop(); }

  const b = await freshnessHarness(39474, { gs3: undefined, trend: 'current' });
  try {
    await b.post('/api/game/select', { gameId: 'game_gs3' });
    await b.post('/api/game/add');
    assert.deepEqual(b.served, ['gs3']);
  } finally { await b.stop(); }
});
