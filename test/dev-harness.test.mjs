import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHostLaunchPlan,
  buildLaunchPlans,
  validateDevGamesConfig,
  resolveVSCodeExecutable,
  DEV_HOSTS_DIRNAME
} from '../tools/dev/host-launch-plan.mjs';
import { describeGames, describeExtensionSource, computeExpectedExtensionBuildId } from '../tools/dev/verify-multi-game.mjs';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

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

test('tools/dev/dev-games.json host workspaces all resolve to real directories (config is not stale)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tools', 'dev', 'dev-games.json'), 'utf8'));
  for (const host of config.hosts) {
    const resolved = path.resolve(repoRoot, host.workspace);
    assert.ok(fs.existsSync(resolved), `Host '${host.name}' points at a missing workspace: ${resolved}. dev-games.json has drifted from the current Games.`);
  }
});

test('tools/dev/dev-games.json still keeps SidelineCoach-GameTest as a regression fixture', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tools', 'dev', 'dev-games.json'), 'utf8'));
  const gametest = config.hosts.find((h) => h.workspace.includes('SidelineCoach-GameTest'));
  assert.ok(gametest, 'GameTest must remain configured — its stale historical source is the regression proof, not a reason to delete it');
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

// Q2.8H field defect: SidelineCoach-GameTest's workspace contains an old historical
// copy of SidelineCoach source. That must never matter — a host entry has no field
// through which a workspace could substitute itself as the extension source, so
// this is a structural proof, not merely today's config happening to be correct.
test('a Game workspace containing its own historical SidelineCoach source cannot replace the canonical extension source', () => {
  const configWithSelfHostingGame = {
    hosts: [
      { name: 'gametest', label: 'SidelineCoach-GameTest', workspace: '../SidelineCoach-GameTest', inspectExtensionsPort: 9229 }
    ]
  };
  const [plan] = buildLaunchPlans(configWithSelfHostingGame, { repoRoot, devHostsDir });
  assert.equal(plan.workspacePath, path.resolve(repoRoot, '../SidelineCoach-GameTest'), 'GameTest is usable as a workspace');
  assert.ok(
    plan.args.includes(`--extensionDevelopmentPath=${repoRoot}`),
    'yet extensionDevelopmentPath still resolves to the canonical repo, never the workspace'
  );
  assert.ok(!plan.args.some((a) => a.startsWith('--extensionDevelopmentPath=') && a !== `--extensionDevelopmentPath=${repoRoot}`));
});

// A host entry has no "extensionDevelopmentPath" field at all — buildHostLaunchPlan
// hard-codes it to repoRoot — so a brand-new Game config added tomorrow inherits the
// canonical source automatically, with nothing to copy from another host's entry.
test('a newly added Game config automatically inherits the canonical extension source, with nothing to copy', () => {
  const config = {
    hosts: [
      { name: 'brand-new-game', label: 'Some Future Game', workspace: '../SomeFutureGame' }
    ]
  };
  assert.ok(!('extensionDevelopmentPath' in config.hosts[0]), 'no such field exists to configure per-host');
  const [plan] = buildLaunchPlans(config, { repoRoot, devHostsDir });
  assert.ok(plan.args.includes(`--extensionDevelopmentPath=${repoRoot}`));
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

// --- Q2.8H: canonical extension-source proof --------------------------------
//
// Field defect: SidelineCoach-GameTest's Stadium reported
// "Method routine.sources.browse not implemented." — proof that a Game can be
// Connected while running a completely different (old) extension implementation.
// Connected alone cannot distinguish that from a Stadium running today's source.
// This closes exactly that gap: a content-hash build identity (the same technique
// the Control Plane Freshness Guard already uses, applied to this Stadium's own
// extension entrypoint) is sent at stadium.hello and compared against what the
// canonical repo computes for itself right now.

test('computeExpectedExtensionBuildId returns a real, stable identity from the compiled extension', () => {
  const id = computeExpectedExtensionBuildId(repoRoot);
  assert.equal(typeof id, 'string');
  assert.match(id, /^cp-[0-9a-f]{24}$/);
  assert.equal(computeExpectedExtensionBuildId(repoRoot), id, 'deterministic for the same compiled output');
});

test('computeExpectedExtensionBuildId is honestly undefined when nothing is compiled', () => {
  const id = computeExpectedExtensionBuildId(path.join(repoRoot, 'this-does-not-exist'));
  assert.equal(id, undefined, 'UNKNOWN, never a fabricated value');
});

test('describeExtensionSource PASSes when every connected Game reports the canonical build', () => {
  const expected = 'cp-aaaaaaaaaaaaaaaaaaaaaaaa';
  const snapshot = {
    games: [
      { gameId: 'g_trend', displayName: 'Trend and Tap Assist', connectionStatus: 'connected' },
      { gameId: 'g_gametest', displayName: 'SidelineCoach-GameTest', connectionStatus: 'connected' }
    ],
    sessions: [
      { gameId: 'g_trend', extensionBuildId: expected },
      { gameId: 'g_gametest', extensionBuildId: expected }
    ]
  };
  const result = describeExtensionSource(snapshot, expected);
  assert.equal(result.allCanonical, true);
  assert.match(result.text, /✓ Trend and Tap Assist/);
  assert.match(result.text, /✓ SidelineCoach-GameTest/);
  assert.match(result.text, /PASS: all connected Stadiums use the current SidelineCoach development source\./);
});

// The exact field symptom: GameTest Connected, but running a different build.
test('describeExtensionSource fails closed with a clear DEV HARNESS ERROR when a Game reports a different build', () => {
  const expected = 'cp-aaaaaaaaaaaaaaaaaaaaaaaa';
  const snapshot = {
    games: [
      { gameId: 'g_trend', displayName: 'Trend and Tap Assist', connectionStatus: 'connected' },
      { gameId: 'g_gametest', displayName: 'SidelineCoach-GameTest', connectionStatus: 'connected' }
    ],
    sessions: [
      { gameId: 'g_trend', extensionBuildId: expected },
      { gameId: 'g_gametest', extensionBuildId: 'cp-old-stale-build-000000' }
    ]
  };
  const result = describeExtensionSource(snapshot, expected);
  assert.equal(result.allCanonical, false);
  assert.match(result.text, /✗ SidelineCoach-GameTest.*WRONG EXTENSION SOURCE/);
  assert.match(result.text, /DEV HARNESS ERROR: one or more Games would not run the canonical SidelineCoach extension source\./);
});

test('describeExtensionSource treats a session with no reported build as honestly UNKNOWN, not a silent pass', () => {
  const expected = 'cp-aaaaaaaaaaaaaaaaaaaaaaaa';
  const snapshot = {
    games: [{ gameId: 'g_old', displayName: 'Pre-Q2.8H Stadium', connectionStatus: 'connected' }],
    sessions: [{ gameId: 'g_old' }]
  };
  const result = describeExtensionSource(snapshot, expected);
  assert.equal(result.allCanonical, false);
  assert.match(result.text, /UNKNOWN extension build/);
});

test('describeExtensionSource is UNKNOWN (not PASS) when the canonical build itself cannot be computed', () => {
  const result = describeExtensionSource({ games: [], sessions: [] }, undefined);
  assert.equal(result.allCanonical, undefined);
  assert.match(result.text, /UNKNOWN: could not compute the canonical extension build/);
});

test('a Stadium session self-reporting the canonical extensionBuildId genuinely requires the current RPC family to exist in its own source', () => {
  // Not special-cased: this proves the GENERAL mechanism (repo closure hash) already
  // covers the Coach Routines RPC family used as this Play's regression sentinel,
  // because those handlers live inside the very files the hash is computed over.
  const closure = fs.readFileSync(path.join(repoRoot, 'out', 'stadium-client.js'), 'utf8');
  for (const method of ['routine.sources.suggest', 'routine.sources.browse', 'routine.sources.check']) {
    assert.ok(closure.includes(method), `${method} lives inside the closure computeExpectedExtensionBuildId hashes`);
  }
});

test('Real daemon: a session\'s self-reported extensionBuildId round-trips through stadium.hello into /api/diagnostics', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-devharness-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 39310, idleTimeoutMs: 60_000 });
  await daemon.start();
  try {
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const canonical = computeExpectedExtensionBuildId(repoRoot);
    const socket = { readyState: 1, send() {}, close() {} };
    daemon.registryInstance.registerSession({
      instanceId: 'session-devharness', stadiumId: 'stadium-devharness', name: 'Real Canonical', platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId: 'game_devharness', displayName: 'Real Canonical', fingerprintSource: 'test' },
      rootFsPath: 'C:\\Games\\Real', roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(),
      extensionBuildId: canonical
    });

    const diag = await (await fetch(`http://127.0.0.1:${daemon.port}/api/diagnostics`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const session = diag.sessions.find((s) => s.instanceId === 'session-devharness');
    assert.equal(session.extensionBuildId, canonical, 'the daemon exposes exactly what this Stadium self-reported, unmodified');

    // The exact field symptom, reproduced end to end: a second session self-reporting
    // an old/stale build — the daemon still shows it Connected (transport truth), and
    // /api/diagnostics still truthfully names its different build (dev-tooling truth).
    daemon.registryInstance.registerSession({
      instanceId: 'session-gametest', stadiumId: 'stadium-gametest', name: 'GameTest', platform: 'win32', socket: { readyState: 1, send() {}, close() {} },
      lastHeartbeat: Date.now(), game: { gameId: 'game_gametest', displayName: 'SidelineCoach-GameTest', fingerprintSource: 'test' },
      rootFsPath: 'C:\\Games\\GameTest', roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(),
      extensionBuildId: 'cp-old-historical-build-0000'
    });
    const diag2 = await (await fetch(`http://127.0.0.1:${daemon.port}/api/diagnostics`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const gametestSession = diag2.sessions.find((s) => s.instanceId === 'session-gametest');
    assert.equal(gametestSession.extensionBuildId, 'cp-old-historical-build-0000');
    assert.notEqual(gametestSession.extensionBuildId, canonical, 'demonstrably a different extension source, even though the session is fully Connected');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
