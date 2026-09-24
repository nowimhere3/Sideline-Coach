/**
 * Add Game exact folder authority (S39).
 *
 * Field evidence: Dad chose C:\Users\dmcal\Documents\TamperMonkey\GPT-Reader-FA. It has no
 * Git repository of its own but sits inside the TamperMonkey repository, so Add Game refused it
 * ("inside-repository"). The product decision is that an explicit human folder choice is the
 * authority: that exact folder becomes the Game, with its own marker identity, and the enclosing
 * repository is neither consulted nor written to.
 *
 * All identity tests use the real filesystem and real `git`; nothing touches the network.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { adoptGameFolder } from '../out/game-adoption.js';
import { resolveGameContextSync } from '../out/game-identity.js';
import { buildDevelopmentInstancePlan } from '../out/game-window-opener.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUMBING = /\.sideline|game\.json|marker|extensionDevelopmentPath/i;

// --- fixtures -------------------------------------------------------------------------------------

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-exact-'));
  return { root, home: path.join(root, 'home'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * The field shape: a Git repository (TamperMonkey) that TRACKS a project folder (GPT-Reader-FA),
 * which has no `.git` of its own. `depth` folders sit between them.
 */
function tamperMonkey(s, { remote, depth = [] } = {}) {
  const parent = path.join(s.root, 'TamperMonkey');
  const nested = path.join(parent, ...depth, 'GPT-Reader-FA');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(parent, 'README.md'), '# TamperMonkey scripts\n');
  fs.writeFileSync(path.join(nested, 'gpt-reader.user.js'), '// ==UserScript==\n');
  fs.writeFileSync(path.join(nested, 'package.json'), '{"name":"gpt-reader-fa"}\n');
  git(parent, 'init', '-q');
  if (remote) git(parent, 'remote', 'add', 'origin', remote);
  git(parent, 'add', '.');
  git(parent, 'commit', '-q', '-m', 'scripts');
  return { parent, nested };
}

/** Every file under `dir` with a content hash, optionally excluding one subtree. */
function snapshot(dir, { exclude } = {}) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (exclude && full === exclude) continue;
      const rel = path.relative(dir, full).replace(/\\/g, '/');
      if (entry.isDirectory()) { out[`${rel}/`] = 'dir'; walk(full); }
      else out[rel] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

function memento() {
  const store = new Map();
  return { get: (k) => store.get(k), update: (k, v) => { store.set(k, v); return Promise.resolve(); } };
}
const resolveAs = (dir, profile) => resolveGameContextSync({ workspaceFolder: { uri: { fsPath: dir }, name: path.basename(dir) }, memento: profile }).game;
const adopt = (folder, s, extra = {}) => adoptGameFolder(folder, { homeDir: s.home, ...extra });

// --- 1-4: adoption -----------------------------------------------------------------------------------

test('EFA-1. A plain standalone folder can still be adopted', () => {
  const s = scratch();
  try {
    const folder = path.join(s.root, 'standalone');
    fs.mkdirSync(folder);
    const outcome = adopt(folder, s);
    assert.equal(outcome.kind, 'adopted');
    assert.equal(outcome.markerPath, path.join(folder, '.sideline', 'game.json'));
    assert.equal(resolveAs(folder, memento()).gameId, outcome.gameId);
  } finally { s.cleanup(); }
});

test('EFA-2. FORMER FAILURE: a folder nested one level inside another Git repository is adopted', () => {
  const s = scratch();
  try {
    const { nested } = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git' });
    const outcome = adopt(nested, s);
    assert.equal(outcome.kind, 'adopted', 'the explicit human folder choice is the authority');
    assert.match(outcome.gameId, /^game_local_[0-9a-f]{16}$/);
    assert.equal(outcome.displayName, 'GPT-Reader-FA');
  } finally { s.cleanup(); }
});

test('EFA-3. A folder nested several levels deep inside another repository is adopted, with or without a parent remote', () => {
  const s = scratch();
  try {
    for (const remote of [undefined, 'git@github.com:nowimhere3/tampermonkey.git']) {
      const t = scratch();
      try {
        const { nested } = tamperMonkey(t, { remote, depth: ['userscripts', 'chatgpt', 'v2'] });
        const outcome = adopt(nested, t);
        assert.equal(outcome.kind, 'adopted', `depth 3, parent remote: ${remote ?? 'none'}`);
        assert.equal(outcome.markerPath, path.join(nested, '.sideline', 'game.json'));
      } finally { t.cleanup(); }
    }
  } finally { s.cleanup(); }
});

test('EFA-4. The marker is written inside the EXACT selected folder and says what it is', () => {
  const s = scratch();
  try {
    const { nested } = tamperMonkey(s);
    const outcome = adopt(nested, s, { now: () => new Date('2026-09-19T18:00:00.000Z') });
    assert.equal(outcome.markerPath, path.join(nested, '.sideline', 'game.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(outcome.markerPath, 'utf8')), {
      version: 1, gameId: outcome.gameId, displayName: 'GPT-Reader-FA', createdBy: 'Sideline Coach (Add Game)', createdAt: '2026-09-19T18:00:00.000Z'
    });
  } finally { s.cleanup(); }
});

// --- 5: the enclosing repository is untouched --------------------------------------------------------------------

test('EFA-5. PARENT NON-MUTATION: the enclosing repository receives no marker and not one changed byte', () => {
  const s = scratch();
  try {
    const { parent, nested } = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git', depth: ['userscripts'] });
    const markerDir = path.join(nested, '.sideline');
    // Byte-level snapshot FIRST: running `git status` can itself refresh .git/index.
    const before = snapshot(parent);
    const configBefore = fs.readFileSync(path.join(parent, '.git', 'config'), 'utf8');

    assert.equal(adopt(nested, s).kind, 'adopted');

    const after = snapshot(parent, { exclude: markerDir });
    assert.deepEqual(after, before, 'everything in the parent tree, including all of .git, is byte-identical');
    assert.equal(fs.readFileSync(path.join(parent, '.git', 'config'), 'utf8'), configBefore, 'no remote, config or metadata change');
    assert.equal(fs.existsSync(path.join(parent, '.sideline')), false, 'no marker at the enclosing repository root');
    assert.equal(fs.existsSync(path.join(parent, 'userscripts', '.sideline')), false, 'none at an intermediate folder either');
    assert.deepEqual(fs.readdirSync(markerDir), ['game.json'], 'the only new thing is the one marker file');

    // Only now is it safe to ask git. The parent sees exactly one new untracked path, and nothing modified.
    const status = git(parent, 'status', '--porcelain', '--untracked-files=all').trim().split(/\r?\n/);
    assert.deepEqual(status, ['?? userscripts/GPT-Reader-FA/.sideline/game.json']);
    assert.equal(git(parent, 'rev-parse', 'HEAD').trim().length, 40, 'history is intact');
  } finally { s.cleanup(); }
});

// --- 6-8: identity -------------------------------------------------------------------------------------------------------

test('EFA-6. The nested Game resolves to its marker id in every Stadium, and never to the enclosing repository', () => {
  const s = scratch();
  try {
    const { parent, nested } = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git' });
    const outcome = adopt(nested, s);
    for (const profile of [memento(), memento(), undefined]) {
      const game = resolveAs(nested, profile);
      assert.equal(game.gameId, outcome.gameId, 'the picking window and any launched host agree');
      assert.equal(game.fingerprintSource, 'marker');
      assert.equal(game.repoUri, undefined, 'no repository identity is attached to the nested Game');
    }
    // The workspace for the nested Game is the nested folder; resolution never looks above it.
    assert.equal(resolveGameContextSync({ workspaceFolder: { uri: { fsPath: nested }, name: 'GPT-Reader-FA' } }).binding.rootFsPath, nested);
    assert.notEqual(resolveAs(parent, undefined).gameId, outcome.gameId);
  } finally { s.cleanup(); }
});

test('EFA-7. The enclosing repository and the nested Game have distinct identities, and the parent never leaks in', () => {
  const s = scratch();
  try {
    const withRemote = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git' });
    const nested = adopt(withRemote.nested, s);
    const parentGame = resolveAs(withRemote.parent, undefined);
    assert.match(parentGame.gameId, /^game_git_[0-9a-f]{8}$/, 'the parent keeps its own remote identity');
    assert.notEqual(nested.gameId, parentGame.gameId);
    assert.ok(!nested.gameId.includes(parentGame.gameId.replace('game_git_', '')), 'the nested id is not derived from the parent');

    const t = scratch();
    try {
      const noRemote = tamperMonkey(t);
      const nested2 = adopt(noRemote.nested, t);
      assert.equal(resolveAs(noRemote.parent, undefined).gameId, 'unknown', 'a remote-less parent is simply not a Game');
      assert.match(resolveAs(noRemote.nested, undefined).gameId, /^game_local_/);
      assert.equal(resolveAs(noRemote.nested, undefined).gameId, nested2.gameId);
    } finally { t.cleanup(); }
  } finally { s.cleanup(); }
});

test('EFA-8. Later giving the nested Game its own .git and a GitHub remote does not replace its marker identity', () => {
  const s = scratch();
  try {
    const { nested } = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git' });
    const { gameId } = adopt(nested, s);
    git(nested, 'init', '-q');
    assert.equal(resolveAs(nested, memento()).gameId, gameId, 'after `git init`');
    git(nested, 'remote', 'add', 'origin', 'https://github.com/nowimhere3/gpt-reader-fa.git');
    const later = resolveAs(nested, memento());
    assert.equal(later.gameId, gameId, 'the marker outranks the new remote');
    assert.equal(later.fingerprintSource, 'marker');
    assert.deepEqual(adopt(nested, s), { kind: 'existing', source: 'marker' }, 'and re-adding it changes nothing');
  } finally { s.cleanup(); }
});

// --- 9: existing identity is never overwritten -----------------------------------------------------------------------------

test('EFA-9. Existing strong identity in the nested folder is reused and never overwritten; the parent marker is ignored', () => {
  const s = scratch();
  try {
    const { parent, nested } = tamperMonkey(s);
    // The parent has its OWN marker; the nested folder has a different one. Only the nested one counts.
    fs.mkdirSync(path.join(parent, '.sideline'));
    fs.writeFileSync(path.join(parent, '.sideline', 'game.json'), '{"gameId":"game_parent_marker","displayName":"TamperMonkey"}');
    fs.mkdirSync(path.join(nested, '.sideline'));
    const body = '{"gameId":"game_nested_marker","displayName":"Mine"}';
    fs.writeFileSync(path.join(nested, '.sideline', 'game.json'), body);
    assert.deepEqual(adopt(nested, s), { kind: 'existing', source: 'marker' });
    assert.equal(fs.readFileSync(path.join(nested, '.sideline', 'game.json'), 'utf8'), body, 'bytes unchanged');
    assert.equal(resolveAs(nested, undefined).gameId, 'game_nested_marker');
    assert.equal(fs.readFileSync(path.join(parent, '.sideline', 'game.json'), 'utf8'), '{"gameId":"game_parent_marker","displayName":"TamperMonkey"}');

    // A nested folder that already has its own repository identity is reused with nothing written.
    const t = scratch();
    try {
      const own = tamperMonkey(t);
      git(own.nested, 'init', '-q');
      git(own.nested, 'remote', 'add', 'origin', 'https://github.com/nowimhere3/own.git');
      assert.deepEqual(adopt(own.nested, t), { kind: 'existing', source: 'git-remote' });
      assert.equal(fs.existsSync(path.join(own.nested, '.sideline')), false);
    } finally { t.cleanup(); }

    // Adopting twice converges on one id.
    const u = scratch();
    try {
      const again = tamperMonkey(u);
      const first = adopt(again.nested, u);
      const markerAfterFirst = fs.readFileSync(first.markerPath, 'utf8');
      assert.deepEqual(adopt(again.nested, u), { kind: 'existing', source: 'marker' });
      assert.equal(fs.readFileSync(first.markerPath, 'utf8'), markerAfterFirst);
    } finally { u.cleanup(); }
  } finally { s.cleanup(); }
});

// --- 10-12: the safeguards that must remain -----------------------------------------------------------------------------------

test('EFA-10. The drive root and the whole home folder are still refused; a project inside home is fine', () => {
  const s = scratch();
  try {
    fs.mkdirSync(s.home, { recursive: true });
    const root = adoptGameFolder(path.parse(s.root).root, { homeDir: s.home });
    const home = adoptGameFolder(s.home, { homeDir: s.home });
    assert.equal(root.reason, 'filesystem-root');
    assert.equal(home.reason, 'home-folder');
    for (const refusal of [root, home]) assert.doesNotMatch(refusal.message, PLUMBING);
    // Nested under home (the normal case, including a repository at the home root) is adoptable.
    git(s.home, 'init', '-q');
    const project = path.join(s.home, 'Documents', 'TamperMonkey', 'GPT-Reader-FA');
    fs.mkdirSync(project, { recursive: true });
    assert.equal(adoptGameFolder(project, { homeDir: s.home }).kind, 'adopted');
    assert.equal(fs.existsSync(path.join(s.home, '.sideline')), false, 'the home folder itself is never written');
  } finally { s.cleanup(); }
});

test('EFA-11. Unwritable, unreadable and missing cases stay truthful, and write nothing anywhere', () => {
  const s = scratch();
  try {
    const { parent, nested } = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git' });
    const parentBefore = snapshot(parent);

    // Unwritable: `.sideline` is a file, which blocks the marker on every OS.
    fs.writeFileSync(path.join(nested, '.sideline'), 'not a directory');
    const blocked = adopt(nested, s);
    assert.equal(blocked.kind, 'refused');
    assert.equal(blocked.reason, 'not-writable');
    assert.doesNotMatch(blocked.message, PLUMBING);
    assert.equal(fs.readFileSync(path.join(nested, '.sideline'), 'utf8'), 'not a directory');
    assert.equal(resolveAs(nested, undefined).gameId, 'unknown');
    fs.rmSync(path.join(nested, '.sideline'));

    // Unreadable existing marker: left exactly as it was.
    fs.mkdirSync(path.join(nested, '.sideline'));
    fs.writeFileSync(path.join(nested, '.sideline', 'game.json'), '{ not json');
    const broken = adopt(nested, s);
    assert.equal(broken.reason, 'marker-unreadable');
    assert.equal(fs.readFileSync(path.join(nested, '.sideline', 'game.json'), 'utf8'), '{ not json');

    // Missing folder and a file instead of a folder.
    assert.equal(adopt(path.join(nested, 'gone'), s).reason, 'not-a-folder');
    assert.equal(adopt(path.join(nested, 'package.json'), s).reason, 'not-a-folder');

    // Through all of that, the enclosing repository never changed.
    fs.rmSync(path.join(nested, '.sideline'), { recursive: true });
    assert.deepEqual(snapshot(parent), parentBefore);
  } finally { s.cleanup(); }
});

// --- 13: the Add Game lifecycle still opens the exact folder ------------------------------------------------------------------------

async function lifecycleHarness(pickGame, openCalls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-exact-lifecycle-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 40200 + Math.floor(Math.random() * 500), idleTimeoutMs: 120000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const host = { gameId: 'game_host', displayName: 'Host', fingerprintSource: 'git-remote' };
  const client = new StadiumClient({
    port: daemon.port, dir, token, instanceId: 'inst_host', autoReconnect: false,
    gameContextGetter: () => ({
      game: host,
      stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: host.gameId, stadiumId: 'stadium_test', rootFsPath: 'C:\\repos\\Host', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    pickGame,
    openGame: async (params) => { openCalls.push(params); return { success: true, outcome: 'opened', message: `Opening ${params.displayName}…` }; }
  });
  assert.equal(await client.connect(), true);
  const post = async () => {
    const res = await fetch(`http://127.0.0.1:${daemon.port}/api/game/add`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' });
    return { status: res.status, body: await res.json() };
  };
  const status = async () => (await (await fetch(`http://127.0.0.1:${daemon.port}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).json());
  return { post, status, stop: async () => { client.dispose(); await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** The same steps `pickGameFolder` performs in extension.ts after the native picker returns. */
function pickLikeTheExtension(folder, s) {
  const adoption = adoptGameFolder(folder, { homeDir: s.home });
  if (adoption.kind === 'refused') return { success: false, folderPath: folder, message: adoption.message };
  const resolved = resolveGameContextSync({ workspaceFolder: { uri: { fsPath: folder }, name: path.basename(folder) } });
  if (resolved.game.fingerprintSource !== 'marker' && resolved.game.fingerprintSource !== 'git-remote') {
    return { success: false, folderPath: folder, message: 'Coach could not identify a Game in that folder. Try choosing it again.' };
  }
  return { success: true, folderPath: folder, game: resolved.game };
}

test('EFA-12. LIFECYCLE: Add Game opens the exact nested folder with its marker Game id, never the enclosing Git root', async () => {
  const s = scratch();
  const opened = [];
  const { parent, nested } = tamperMonkey(s, { remote: 'https://github.com/nowimhere3/tampermonkey.git', depth: ['userscripts'] });
  const h = await lifecycleHarness(async () => pickLikeTheExtension(nested, s), opened);
  try {
    const result = await h.post();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'opening');
    assert.equal(opened.length, 1, 'one picker, one open');
    assert.equal(opened[0].folderPath, nested, 'the folder Dad chose');
    assert.notEqual(path.resolve(opened[0].folderPath), path.resolve(parent), 'not the enclosing Git root');
    assert.equal(opened[0].displayName, 'GPT-Reader-FA');
    assert.match(opened[0].gameId, /^game_local_[0-9a-f]{16}$/);
    assert.equal(opened[0].gameId, resolveAs(nested, undefined).gameId, 'the id the new Stadium will resolve');

    const games = (await h.status()).games;
    assert.equal(games.find((g) => g.gameId === opened[0].gameId).connectionStatus, 'opening', 'visible in the Game list as Opening');
    assert.ok(!games.some((g) => g.gameId === resolveAs(parent, undefined).gameId), 'the enclosing repository was not adopted instead');

    // Both open strategies are handed that exact folder; neither is redesigned.
    const plan = buildDevelopmentInstancePlan({ extensionSourcePath: repoRoot, folderPath: opened[0].folderPath, gameId: opened[0].gameId, devHostsDir: path.join(s.root, 'dev-hosts') });
    assert.equal(plan.args.at(-1), nested, 'development host opens the nested folder');
    assert.ok(!plan.args.some((arg) => path.resolve(arg) === path.resolve(parent)), 'and never the enclosing root');
    const extension = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
    assert.match(extension, /vscode\.Uri\.file\(params\.folderPath\)/, 'production strategy opens params.folderPath');
    assert.match(extension, /resolveGameContextSync\(\{\s*workspaceFolder: \{ uri: selectedUri, name: folderName \}/, 'identity is resolved from the exact selected folder');
  } finally { await h.stop(); s.cleanup(); }
});

test('EFA-13. A genuine refusal returns promptly with its plain-language reason, leaves nothing Opening, and Add Game works again', async () => {
  const s = scratch();
  const opened = [];
  const { nested } = tamperMonkey(s);
  fs.writeFileSync(path.join(nested, '.sideline'), 'not a directory'); // a genuinely unadoptable folder
  const h = await lifecycleHarness(async () => pickLikeTheExtension(nested, s), opened);
  try {
    const startedAt = Date.now();
    const refused = await h.post();
    assert.ok(Date.now() - startedAt < 3000, 'the refusal comes straight back, it does not hang');
    assert.equal(refused.status, 400);
    assert.equal(refused.body.status, 'unresolved');
    assert.match(refused.body.message, /couldn’t save its Game file in that folder/);
    assert.doesNotMatch(refused.body.message, PLUMBING);
    assert.equal(opened.length, 0, 'nothing was opened');
    assert.ok(!(await h.status()).games.some((g) => g.connectionStatus === 'opening'), 'nothing is left Opening');

    // The human fixes the folder and tries again on the SAME running Control Plane.
    fs.rmSync(path.join(nested, '.sideline'));
    const retry = await h.post();
    assert.equal(retry.status, 200);
    assert.equal(retry.body.status, 'opening');
    assert.equal(opened[0].folderPath, nested);
  } finally { await h.stop(); s.cleanup(); }
});

// --- source guards and the error UX -------------------------------------------------------------------------------------------------

test('EFA-14. Source contract: the enclosing-repository refusal and every upward repository walk are gone', () => {
  const adoption = fs.readFileSync(path.join(repoRoot, 'src', 'game-adoption.ts'), 'utf8');
  const code = adoption.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /inside-repository|findEnclosingRepository|enclosing/i);
  const identity = fs.readFileSync(path.join(repoRoot, 'src', 'game-identity.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(identity, /path\.dirname/, 'identity resolution reads only the exact root, never a parent');
  assert.match(adoption, /BREADCRUMB — exact folder authority/);
  // Nothing in src walks up looking for a `.git`.
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'public') walk(f); continue; }
      if (!f.endsWith('.ts')) continue;
      const text = fs.readFileSync(f, 'utf8');
      if (/while\s*\([^)]*path\.dirname\([^)]*\)[\s\S]{0,200}\.git['"]/.test(text)) offenders.push(path.relative(repoRoot, f));
    }
  };
  walk(path.join(repoRoot, 'src'));
  assert.deepEqual(offenders, []);
});

test('EFA-15. The browser keeps a refused Add Game readable, and always re-enables the button', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  // showToast keeps its 2.2 s default for all 55 other callers and gains an optional duration.
  const source = html.match(/const showToast = \(message, isError = false, durationMs = 2200\) => \{[\s\S]*?\n      \};/)[0];
  const run = (args) => {
    const timers = [];
    const classes = new Set();
    const toast = { textContent: '', classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
    const context = { $: () => toast, toastTimer: undefined, clearTimeout: () => {}, setTimeout: (fn, ms) => { timers.push(ms); return 1; } };
    vm.runInNewContext(`${source}\nshowToast(...args);`, { ...context, args });
    return { timers, classes, text: toast.textContent };
  };
  assert.deepEqual(run(['Saved']).timers, [2200], 'default unchanged');
  assert.deepEqual(run(['Nope', true]).timers, [2200], 'errors elsewhere are unchanged too');
  const custom = run(['Long reason', true, 8000]);
  assert.deepEqual(custom.timers, [8000]);
  assert.ok(custom.classes.has('error') && custom.classes.has('show'));

  const handler = html.match(/\$\('addGameBtn'\)\?\.addEventListener\('click', async \(e\) => \{[\s\S]*?\n      \}\);/)[0];
  assert.match(handler, /catch \(err\) \{[\s\S]*showToast\(err\.message \|\| 'Failed to add Game', true, ADD_GAME_FAILURE_TOAST_MS\)/);
  assert.match(handler, /finally \{[\s\S]*button\.disabled = false;/, 'the button is re-enabled on every outcome');
  assert.match(html, /const ADD_GAME_FAILURE_TOAST_MS = 8000;/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script), 'the page still parses');
});

test('EFA-16. FIELD SHAPE: the parent folder is ALREADY a Game (adopted by the old workaround); adding the nested folder makes a second, distinct Game', async () => {
  const s = scratch();
  const opened = [];
  const { parent, nested } = tamperMonkey(s); // a real parent repo with no remote, exactly like the field
  const picks = [parent, nested];
  const h = await lifecycleHarness(async () => pickLikeTheExtension(picks.shift(), s), opened);
  try {
    // 1) Add Game on the parent, as Dad did when the old message said "choose the top folder instead".
    const first = await h.post();
    assert.equal(first.status, 200);
    const parentMarkerBefore = fs.readFileSync(path.join(parent, '.sideline', 'game.json'), 'utf8');
    const parentGameId = JSON.parse(parentMarkerBefore).gameId;

    // 2) Add Game on the nested folder. The lifecycle is keyed by Game id, so nothing conflicts.
    const second = await h.post();
    assert.equal(second.status, 200);
    assert.equal(second.body.status, 'opening', 'a new Game is opened, not "already connected" or "conflicted"');
    assert.equal(opened.length, 2);
    assert.deepEqual(opened.map((o) => o.folderPath), [parent, nested], 'each Game opens its own exact folder');
    assert.notEqual(opened[0].gameId, opened[1].gameId, 'two Games, two identities');
    assert.equal(opened[0].gameId, parentGameId);
    assert.equal(opened[1].gameId, JSON.parse(fs.readFileSync(path.join(nested, '.sideline', 'game.json'), 'utf8')).gameId);

    // The parent's own marker was not touched by adopting the nested folder.
    assert.equal(fs.readFileSync(path.join(parent, '.sideline', 'game.json'), 'utf8'), parentMarkerBefore);
    const ids = (await h.status()).games.map((g) => g.gameId);
    assert.ok(ids.includes(opened[0].gameId) && ids.includes(opened[1].gameId), 'both appear in the Game list');
  } finally { await h.stop(); s.cleanup(); }
});
