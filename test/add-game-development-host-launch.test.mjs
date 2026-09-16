/**
 * Add Game — development host launch seam (real child processes, no stubs of spawn).
 *
 * Field failure this reproduces: Add Game registered the Game, showed Opening, and
 * `game.open` reported success, but no Stadium ever arrived. The dev-host profile
 * directories stayed empty. Cause: `game.open` runs inside a VS Code extension host,
 * whose environment carries ELECTRON_RUN_AS_NODE=1. The spawned Code.exe inherited it,
 * booted as plain Node, rejected `--user-data-dir` ("bad option", exit 9) in ~35 ms,
 * and with stdio ignored nobody noticed.
 *
 * The daemon-level Opening → Connected convergence is proven in add-game-endpoint.test.mjs
 * (E2/E6) with `openGame` stubbed; this file proves the seam those tests stub.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildDevelopmentInstanceEnv,
  buildDevelopmentInstancePlan,
  launchDevelopmentInstance
} from '../out/game-window-opener.js';

/** The environment shape observed live in the Stadium extension host that ran game.open (pid 23100). */
const EXTENSION_HOST_ENV = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  SIDELINE_DIR: 'C:\\Users\\someone\\.sideline',
  ELECTRON_RUN_AS_NODE: '1',
  CHROME_CRASHPAD_PIPE_NAME: '\\\\.\\pipe\\crashpad_23100',
  VSCODE_PID: '23100',
  VSCODE_IPC_HOOK: '\\\\.\\pipe\\vscode-ipc',
  VSCODE_ESM_ENTRYPOINT: 'vs/workbench/api/node/extensionHostProcess',
  VSCODE_CRASH_REPORTER_PROCESS_TYPE: 'extensionHost',
  VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
  VSCODE_NLS_CONFIG: '{}'
};

/**
 * Stand-in for Code.exe with the one behaviour that matters:
 * - ELECTRON_RUN_AS_NODE=1 → it is Node, so `--user-data-dir=…` is a bad option: exit 9.
 * - otherwise → it boots as the app: writes its profile and keeps running.
 * - `--handoff` → an instance for this profile already runs: forward and exit 0.
 */
const FAKE_CODE = `
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
if (process.env.ELECTRON_RUN_AS_NODE === '1') { console.error(process.execPath + ': bad option: ' + args[0]); process.exit(9); }
if (args.includes('--handoff')) process.exit(0);
const userData = args.find(a => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'boot.json'), JSON.stringify({ args, inheritedVSCodeVars: Object.keys(process.env).filter(k => /^(ELECTRON_RUN_AS_NODE|VSCODE_|CHROME_CRASHPAD)/i.test(k)) }));
setTimeout(() => process.exit(0), 4000);
`;

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'sideline-devhost-'));
  const fake = join(root, 'fake-code.cjs');
  writeFileSync(fake, FAKE_CODE);
  const folder = join(root, 'gallerytest');
  mkdirSync(folder);
  const plan = buildDevelopmentInstancePlan({
    extensionSourcePath: join(root, 'SidelineCoach'),
    folderPath: folder,
    gameId: 'game_git_7b79a141',
    devHostsDir: join(root, 'dev-hosts')
  });
  mkdirSync(plan.userDataDir, { recursive: true });
  mkdirSync(plan.extensionsDir, { recursive: true });
  // Real child_process.spawn; only the executable is redirected to the stand-in.
  const spawnFake = (_exe, args, options) => spawn(process.execPath, [fake, ...args], options);
  return { root, plan, spawnFake, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return predicate();
}

test('DH1. The development host environment drops VS Code process wiring and keeps everything else', () => {
  const env = buildDevelopmentInstanceEnv(EXTENSION_HOST_ENV);
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.CHROME_CRASHPAD_PIPE_NAME, undefined);
  assert.deepEqual(Object.keys(env).filter((k) => k.toUpperCase().startsWith('VSCODE_')), []);
  assert.equal(env.PATH, EXTENSION_HOST_ENV.PATH);
  assert.equal(env.SIDELINE_DIR, EXTENSION_HOST_ENV.SIDELINE_DIR);
  assert.equal(EXTENSION_HOST_ENV.ELECTRON_RUN_AS_NODE, '1', 'the parent environment is never mutated');
});

test('DH2. FORMER FAILURE: inheriting the extension host env kills the host on boot, silently', async () => {
  const ws = workspace();
  try {
    // Exactly what extension.ts used to do: spawn with the inherited env, stdio ignored, and call it opened.
    const child = ws.spawnFake('Code.exe', ws.plan.args, { detached: true, stdio: 'ignore', env: EXTENSION_HOST_ENV });
    const code = await new Promise((resolve) => child.once('exit', resolve));
    assert.equal(code, 9, 'Electron-as-Node rejects --user-data-dir');
    assert.deepEqual(readdirSync(ws.plan.userDataDir), [], 'profile stays empty — the field signature');
  } finally {
    ws.cleanup();
  }
});

test('DH3. Launch from an extension host env boots a real development host with canonical source and the chosen Game', async () => {
  const ws = workspace();
  try {
    const outcome = await launchDevelopmentInstance({
      spawn: ws.spawnFake, executable: 'Code.exe', plan: ws.plan, parentEnv: EXTENSION_HOST_ENV, confirmMs: 600
    });
    assert.deepEqual(outcome, { kind: 'started' });
    const bootFile = join(ws.plan.userDataDir, 'boot.json');
    assert.ok(await waitFor(() => existsSync(bootFile)), 'the host wrote its profile, i.e. it booted as the app');
    const boot = JSON.parse(readFileSync(bootFile, 'utf8'));
    assert.deepEqual(boot.inheritedVSCodeVars, []);
    assert.ok(boot.args.includes(`--extensionDevelopmentPath=${join(ws.root, 'SidelineCoach')}`), 'implementation = canonical source');
    assert.equal(boot.args.at(-1), join(ws.root, 'gallerytest'), 'content workspace = the chosen Game');
    assert.equal(boot.args.filter((a) => a.startsWith('--extensionDevelopmentPath=')).length, 1, 'the Game folder never supplies an implementation');
  } finally {
    ws.cleanup();
  }
});

test('DH4. A host that dies on boot is reported as failed, never as opened', async () => {
  const ws = workspace();
  try {
    // Real Node with the real plan arguments reproduces the literal Electron-as-Node error.
    const nodeAsCode = (_exe, args, options) => spawn(process.execPath, args, { ...options, env: { ...options.env } });
    const outcome = await launchDevelopmentInstance({
      spawn: nodeAsCode, executable: 'Code.exe', plan: ws.plan, parentEnv: EXTENSION_HOST_ENV, confirmMs: 2000
    });
    assert.equal(outcome.kind, 'failed');
    assert.match(outcome.message, /exited immediately \(code 9\)/);
  } finally {
    ws.cleanup();
  }
});

test('DH5. A missing executable fails truthfully instead of throwing inside the extension host', async () => {
  const ws = workspace();
  try {
    const outcome = await launchDevelopmentInstance({
      spawn, executable: join(ws.root, 'no-such-Code.exe'), plan: ws.plan, parentEnv: EXTENSION_HOST_ENV, confirmMs: 2000
    });
    assert.equal(outcome.kind, 'failed');
    assert.match(outcome.message, /ENOENT/);
  } finally {
    ws.cleanup();
  }
});

test('DH6. Reopening a Game whose host already runs hands off (exit 0) and is not a failure', async () => {
  const ws = workspace();
  try {
    const plan = { ...ws.plan, args: [...ws.plan.args, '--handoff'] };
    const outcome = await launchDevelopmentInstance({
      spawn: ws.spawnFake, executable: 'Code.exe', plan, parentEnv: EXTENSION_HOST_ENV, confirmMs: 2000
    });
    assert.deepEqual(outcome, { kind: 'handed-off' });
  } finally {
    ws.cleanup();
  }
});
