import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHostLaunchPlan,
  buildLaunchPlans,
  validateDevGamesConfig,
  resolveVSCodeExecutable,
  DEV_HOSTS_DIRNAME
} from '../tools/dev/host-launch-plan.mjs';
import { describeGames } from '../tools/dev/verify-multi-game.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const devHostsDir = path.join('/home/dev/.sideline', DEV_HOSTS_DIRNAME);

const SAMPLE_CONFIG = {
  hosts: [
    { name: 'gs3', label: 'GS3', workspace: '../GS3', inspectExtensionsPort: 9229 },
    { name: 'gametest', label: 'GameTest', workspace: '../SidelineCoach-GameTest', inspectExtensionsPort: 9230 }
  ]
};

/**
 * Minimal JSONC reader: strips line comments outside strings. Enough for
 * .vscode/*.json, and deliberately strict about everything else so malformed
 * content (for example a file accidentally saved wrapped in markdown fences)
 * fails loudly instead of being silently tolerated.
 */
function parseJsonc(source) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
      continue;
    }

    out += char;
  }

  return JSON.parse(out);
}

// --- The two defects that actually cost us a Play -------------------------

test('.vscode/launch.json is machine-parseable', () => {
  const raw = fs.readFileSync(path.join(repoRoot, '.vscode', 'launch.json'), 'utf8');

  // Q2.8G: the file had been saved wrapped in ```json fences. VS Code's
  // error-tolerant parser limped along, so the corruption stayed invisible.
  assert.ok(!raw.includes('```'), 'launch.json must not contain markdown code fences');
  assert.equal(raw.trimStart()[0], '{', 'launch.json must start with a JSON object');

  const parsed = parseJsonc(raw);
  assert.ok(Array.isArray(parsed.configurations), 'launch.json needs a configurations array');
});

test('.vscode/launch.json declares no compound that starts two extensionHosts', () => {
  const parsed = parseJsonc(fs.readFileSync(path.join(repoRoot, '.vscode', 'launch.json'), 'utf8'));

  const typeByName = new Map(parsed.configurations.map((c) => [c.name, c.type]));

  for (const compound of parsed.compounds ?? []) {
    const extensionHosts = (compound.configurations ?? []).filter(
      (name) => typeByName.get(name) === 'extensionHost'
    );
    assert.ok(
      extensionHosts.length <= 1,
      `Compound '${compound.name}' starts ${extensionHosts.length} extensionHost configurations. ` +
        'VS Code reuses an existing window for a repeated --extensionDevelopmentPath, so the ' +
        'second one reloads the first instead of opening a second host. Use the dev harness ' +
        '(tools/dev/launch-games.mjs) for multiple live Games.'
    );
  }
});

test('tools/dev/dev-games.json is valid and declares at least two hosts', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tools', 'dev', 'dev-games.json'), 'utf8'));
  validateDevGamesConfig(config);
  assert.ok(config.hosts.length >= 2, 'The multi-Game harness needs at least two hosts configured');
});

// --- Launch plan construction ---------------------------------------------

test('each host gets its own VS Code instance via a distinct user-data-dir', () => {
  const plans = buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir });
  assert.equal(plans.length, 2);

  const userDataDirs = new Set(plans.map((p) => p.userDataDir));
  assert.equal(userDataDirs.size, 2, 'Shared user-data-dir means one VS Code instance means window reuse');

  const extensionDirs = new Set(plans.map((p) => p.extensionsDir));
  assert.equal(extensionDirs.size, 2);

  for (const plan of plans) {
    assert.ok(
      plan.args.some((a) => a === `--user-data-dir=${plan.userDataDir}`),
      'every host must pass its own --user-data-dir'
    );
  }
});

test('every host loads the same extension source', () => {
  const plans = buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir });
  for (const plan of plans) {
    assert.ok(plan.args.includes(`--extensionDevelopmentPath=${repoRoot}`));
  }
});

test('the Game workspace is the final positional argument', () => {
  const plans = buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir });
  for (const plan of plans) {
    assert.equal(plan.args[plan.args.length - 1], plan.workspacePath);
    assert.ok(!plan.workspacePath.includes('..'), 'workspace paths are resolved, not relative');
  }
});

test('workspace paths resolve relative to the repository root', () => {
  const plan = buildHostLaunchPlan(SAMPLE_CONFIG.hosts[0], { repoRoot, devHostsDir });
  assert.equal(plan.workspacePath, path.resolve(repoRoot, '../GS3'));
});

test('hosts get distinct extension-host debug ports', () => {
  const plans = buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir });
  const ports = plans.map((p) => p.inspectExtensionsPort);
  assert.deepEqual(ports, [9229, 9230]);
  for (const plan of plans) {
    assert.ok(plan.args.includes(`--inspect-extensions=${plan.inspectExtensionsPort}`));
  }
});

test('workspace trust is disabled so a fresh profile still activates the extension', () => {
  const plans = buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir });
  for (const plan of plans) {
    assert.ok(plan.args.includes('--disable-workspace-trust'));
  }
});

test('--only selects a subset and rejects unknown host names', () => {
  const plans = buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir, only: ['gametest'] });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].name, 'gametest');

  assert.throws(
    () => buildLaunchPlans(SAMPLE_CONFIG, { repoRoot, devHostsDir, only: ['nope'] }),
    /Unknown host 'nope'/
  );
});

// --- Config validation -----------------------------------------------------

test('config validation rejects duplicate names and duplicate debug ports', () => {
  assert.throws(
    () =>
      validateDevGamesConfig({
        hosts: [
          { name: 'a', workspace: '../A' },
          { name: 'a', workspace: '../B' }
        ]
      }),
    /Duplicate host name/
  );

  assert.throws(
    () =>
      validateDevGamesConfig({
        hosts: [
          { name: 'a', workspace: '../A', inspectExtensionsPort: 9229 },
          { name: 'b', workspace: '../B', inspectExtensionsPort: 9229 }
        ]
      }),
    /Duplicate inspectExtensionsPort/
  );
});

test('config validation rejects host names that are not filesystem-safe', () => {
  assert.throws(() => validateDevGamesConfig({ hosts: [{ name: '../evil', workspace: '../A' }] }), /filesystem-safe/);
  assert.throws(() => validateDevGamesConfig({ hosts: [{ name: 'ok', workspace: '' }] }), /needs a "workspace"/);
  assert.throws(() => validateDevGamesConfig({ hosts: [] }), /no hosts/);
});

// --- VS Code discovery -----------------------------------------------------

test('SIDELINE_DEV_VSCODE overrides executable discovery', () => {
  const resolved = resolveVSCodeExecutable({
    env: { SIDELINE_DEV_VSCODE: 'D:\\Insiders\\Code.exe' },
    platform: 'win32',
    existsSync: () => true
  });
  assert.deepEqual(resolved, { executable: 'D:\\Insiders\\Code.exe', source: 'env' });
});

test('executable discovery expands Windows environment variables', () => {
  const resolved = resolveVSCodeExecutable({
    env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
    platform: 'win32',
    existsSync: (p) => p === 'C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'
  });
  assert.equal(resolved.source, 'detected');
  assert.ok(resolved.executable.endsWith('Code.exe'));
});

test('executable discovery falls back to PATH', () => {
  assert.deepEqual(resolveVSCodeExecutable({ env: {}, platform: 'linux', existsSync: () => false }), {
    executable: 'code',
    source: 'path'
  });
  assert.equal(resolveVSCodeExecutable({ env: {}, platform: 'win32', existsSync: () => false }).executable, 'code.cmd');
});

// --- Live verification reporting ------------------------------------------

test('verifier reports a missing daemon rather than guessing', () => {
  assert.match(describeGames({ daemonRunning: false }), /daemon is not running/);
});

test('verifier passes only on two distinct Connected Games', () => {
  const twoGames = {
    daemonRunning: true,
    port: 3100,
    pid: 1,
    sessions: [
      { instanceId: 'inst_a', gameId: 'game_a', socketOpen: true, rosterSynchronized: true },
      { instanceId: 'inst_b', gameId: 'game_b', socketOpen: true, rosterSynchronized: true }
    ],
    games: [
      { gameId: 'game_a', displayName: 'GS3', connectionStatus: 'connected' },
      { gameId: 'game_b', displayName: 'GameTest', connectionStatus: 'connected' }
    ],
    connectedGames: [{ gameId: 'game_a' }, { gameId: 'game_b' }],
    conflictedGames: [],
    expected: 2,
    satisfied: true
  };

  const text = describeGames(twoGames);
  assert.match(text, /Stadium sessions: 2/);
  assert.match(text, /PASS: 2 Game\(s\) Connected/);
});

test('verifier surfaces a conflicted Game instead of counting it as proof', () => {
  // Two windows on the SAME Game must never look like a passing two-Game test.
  const conflicted = {
    daemonRunning: true,
    port: 3100,
    pid: 1,
    sessions: [
      { instanceId: 'inst_a', gameId: 'game_a', socketOpen: true, rosterSynchronized: true },
      { instanceId: 'inst_b', gameId: 'game_a', socketOpen: true, rosterSynchronized: true }
    ],
    games: [{ gameId: 'game_a', displayName: 'GS3', connectionStatus: 'conflicted' }],
    connectedGames: [],
    conflictedGames: [{ gameId: 'game_a' }],
    expected: 2,
    satisfied: false
  };

  const text = describeGames(conflicted);
  assert.match(text, /CONFLICTED/);
  assert.match(text, /FAIL: 0 Game\(s\) Connected/);
});
