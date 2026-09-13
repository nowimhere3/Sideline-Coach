/**
 * Q2.9 — Dadified Game and Player lifecycle.
 *
 * Everything here is machine-provable: state transitions, ownership rules,
 * Game-scoped routing, discovery scoping, and the browser projection contract.
 * What these tests deliberately do NOT prove is that a real VS Code window
 * opens and activates — that remains human proof, exactly as in Q2.8G.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveGameState,
  decideAddGame,
  describeGameState,
  hasOpeningTimedOut,
  isGameActionable,
  isOpeningActive,
  OPENING_TIMEOUT_MS
} from '../out/game-lifecycle.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import {
  PlayerDiscoveryService,
  classifyDetection,
  collectDescendants,
  findExternalCandidates,
  matchProcessToPlayerType,
  withoutClaimedCandidates,
  withRestoredCandidate
} from '../out/player-discovery.js';
import { getPlayerAdapter, summariseDetection } from '../out/player-adapters.js';
import {
  buildDevelopmentInstancePlan,
  chooseOpenStrategy,
  sanitiseProfileName
} from '../out/game-window-opener.js';
import { computeAutoRoute, CodexRoutingPolicy } from '../out/routing-policy.js';
import { PlayerInstanceBook } from '../out/player-instances.js';
import { StadiumClient } from '../out/stadium-client.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');

const OPEN_SOCKET = { readyState: 1 };
const CLOSED_SOCKET = { readyState: 3 };

function session(instanceId, gameId, displayName, socket = OPEN_SOCKET) {
  return {
    instanceId,
    stadiumId: 'stadium_test',
    name: 'Test Stadium',
    platform: 'win32',
    socket,
    lastHeartbeat: Date.now(),
    game: gameId ? { gameId, displayName, fingerprintSource: 'git-remote' } : undefined,
    rootFsPath: `C:\\repos\\${displayName ?? 'game'}`,
    roster: [],
    capabilities: [],
    reports: [],
    rosterSynchronized: false,
    rosterSyncedAt: 0
  };
}

// =========================================================================
// GAME LIFECYCLE
// =========================================================================

test('G1. Archived outranks every other signal, so a finished Game never reappears', () => {
  const state = deriveGameState({
    activeSessionCount: 2,
    isArchived: true,
    hasEverConnected: true,
    openingSince: Date.now(),
    now: Date.now()
  });
  assert.equal(state, 'archived');
});

test('G2. Offline is not Archived — a closed window is still a live project', () => {
  const now = Date.now();
  const offline = deriveGameState({ activeSessionCount: 0, isArchived: false, hasEverConnected: true, now });
  const known = deriveGameState({ activeSessionCount: 0, isArchived: false, hasEverConnected: false, now });

  assert.equal(offline, 'offline');
  assert.equal(known, 'known', 'a Game that never connected is Known, not Offline');
  assert.notEqual(offline, 'archived');
  assert.equal(describeGameState('offline'), 'Offline');
  assert.equal(describeGameState('archived'), 'Archived');
});

test('G3. Conflicted outranks Connected so exact routing is blocked, never guessed', () => {
  const now = Date.now();
  assert.equal(deriveGameState({ activeSessionCount: 2, isArchived: false, hasEverConnected: true, now }), 'conflicted');
  assert.equal(isGameActionable('conflicted'), false);
  assert.equal(isGameActionable('connected'), true);
  assert.equal(isGameActionable('opening'), false);
});

test('G4. Opening expires rather than spinning forever', () => {
  const now = 1_000_000;
  assert.equal(isOpeningActive(now - 1_000, now), true);
  assert.equal(hasOpeningTimedOut(now - 1_000, now), false);
  assert.equal(hasOpeningTimedOut(now - OPENING_TIMEOUT_MS - 1, now), true);

  const stale = deriveGameState({
    activeSessionCount: 0,
    isArchived: false,
    hasEverConnected: true,
    openingSince: now - OPENING_TIMEOUT_MS - 1,
    now
  });
  assert.equal(stale, 'offline', 'a failed open decays to Offline, not a permanent Opening');
});

test('G5. Offline -> Opening -> Connected is the full Add Game path', () => {
  const registry = new StadiumRegistry();
  const game = { gameId: 'game_gallery', displayName: 'Gallery Media Suite', fingerprintSource: 'git-remote' };

  // Chosen in the picker, never yet connected.
  registry.recordKnownGameFromPicker(game, 'C:\\repos\\Gallery');
  assert.equal(registry.getGameState('game_gallery'), 'known');

  registry.markOpening('game_gallery');
  assert.equal(registry.getGameState('game_gallery'), 'opening');
  assert.equal(registry.getGames().find((g) => g.gameId === 'game_gallery').connectionStatus, 'opening');

  // The window activated and its Stadium connected.
  registry.registerSession(session('inst_gallery', 'game_gallery', 'Gallery Media Suite'));
  assert.equal(registry.getGameState('game_gallery'), 'connected');
  assert.equal(registry.getKnownGame('game_gallery').openingSince, undefined, 'connecting clears Opening');

  // The human closed the window.
  registry.removeSession('inst_gallery');
  assert.equal(registry.getGameState('game_gallery'), 'offline');
});

test('G6. Add Game on an already-Connected Game selects it instead of opening a duplicate', () => {
  const registry = new StadiumRegistry();
  registry.registerSession(session('inst_gs3', 'game_gs3', 'GS3'));

  const decision = decideAddGame({
    gameId: 'game_gs3',
    folderPath: 'C:\\repos\\GS3',
    state: registry.getGameState('game_gs3')
  });

  assert.deepEqual(decision, { kind: 'select-existing', gameId: 'game_gs3' });
});

test('G7. Add Game while Opening does not fire a second open', () => {
  const registry = new StadiumRegistry();
  registry.recordKnownGameFromPicker({ gameId: 'game_a', displayName: 'A', fingerprintSource: 'git-remote' }, 'C:\\a');
  registry.markOpening('game_a');

  const decision = decideAddGame({ gameId: 'game_a', folderPath: 'C:\\a', state: registry.getGameState('game_a') });
  assert.equal(decision.kind, 'already-opening');
});

test('G8. Add Game on a Conflicted Game reports it rather than silently picking a window', () => {
  const registry = new StadiumRegistry();
  registry.registerSession(session('inst_1', 'game_dup', 'Dup'));
  registry.registerSession(session('inst_2', 'game_dup', 'Dup'));
  assert.equal(registry.getGameState('game_dup'), 'conflicted');

  const decision = decideAddGame({ gameId: 'game_dup', folderPath: 'C:\\dup', state: 'conflicted' });
  assert.equal(decision.kind, 'conflicted');
  assert.match(decision.message, /more than one window/i);
});

test('G9. An unidentifiable folder is refused with a human sentence, not a guess', () => {
  const decision = decideAddGame({ gameId: 'unknown', folderPath: 'C:\\somewhere', state: 'known' });
  assert.equal(decision.kind, 'unresolved');
  assert.match(decision.message, /could not identify a Game/i);
  assert.doesNotMatch(decision.message, /Error|stack|undefined/);
});

test('G10. A Game with only a dead socket is Offline, never Connected', () => {
  const registry = new StadiumRegistry();
  registry.registerSession(session('inst_dead', 'game_x', 'X', CLOSED_SOCKET));
  assert.equal(registry.getGameState('game_x'), 'offline');
});

// =========================================================================
// EXIT / ARCHIVE
// =========================================================================

test('G11. Archiving hides a Game from the Sideline and moves selection off it', () => {
  const registry = new StadiumRegistry();
  registry.registerSession(session('inst_a', 'game_a', 'A'));
  registry.registerSession(session('inst_b', 'game_b', 'B'));
  registry.setSelectedGameId('game_a');

  assert.equal(registry.archiveGame('game_a'), true);
  assert.equal(registry.getGames().some((g) => g.gameId === 'game_a'), false, 'archived Games leave the active list');
  assert.equal(registry.getSelectedGameId(), 'game_b', 'selection moves to a surviving Game');
  assert.deepEqual(registry.getArchivedGames().map((g) => g.gameId), ['game_a']);
  assert.equal(registry.archiveGame('game_a'), false, 'archiving twice is not an error path');
});

test('G12. Archive keeps the Game record intact — nothing about the repository is discarded', () => {
  const registry = new StadiumRegistry();
  registry.recordKnownGameFromPicker(
    { gameId: 'game_done', displayName: 'Finished Project', fingerprintSource: 'git-remote', repoUri: 'github.com/x/y' },
    'C:\\repos\\Finished'
  );
  registry.archiveGame('game_done');

  const record = registry.getKnownGame('game_done');
  assert.equal(record.displayName, 'Finished Project');
  assert.equal(record.repoUri, 'github.com/x/y');
  assert.deepEqual(record.knownRootFsPaths, ['C:\\repos\\Finished']);
});

test('G13. Restoring, or simply reopening, brings an archived Game back', () => {
  const registry = new StadiumRegistry();
  registry.recordKnownGameFromPicker({ gameId: 'game_r', displayName: 'R', fingerprintSource: 'git-remote' }, 'C:\\r');
  registry.archiveGame('game_r');

  assert.equal(registry.restoreGame('game_r'), true);
  assert.equal(registry.getGameState('game_r'), 'known');

  registry.archiveGame('game_r');
  // Deliberately reopening a Game is the human saying it is not finished.
  registry.registerSession(session('inst_r', 'game_r', 'R'));
  assert.equal(registry.getGameState('game_r'), 'connected');
});

// =========================================================================
// WINDOW OPENING STRATEGY
// =========================================================================

test('G14. An installed extension uses the product path; only Development uses an instance', () => {
  assert.equal(chooseOpenStrategy(1), 'vscode-open-folder', 'Production');
  assert.equal(chooseOpenStrategy(3), 'vscode-open-folder', 'Test');
  assert.equal(chooseOpenStrategy(2), 'development-instance', 'Development');
});

test('G15. Development hosts get one profile per Game, and a gameId can never escape the profile root', () => {
  const planA = buildDevelopmentInstancePlan({
    extensionSourcePath: 'C:\\src\\SidelineCoach',
    folderPath: 'C:\\repos\\A',
    gameId: 'game_git_aaa',
    devHostsDir: 'C:\\home\\.sideline\\dev-hosts'
  });
  const planB = buildDevelopmentInstancePlan({
    extensionSourcePath: 'C:\\src\\SidelineCoach',
    folderPath: 'C:\\repos\\B',
    gameId: 'game_git_bbb',
    devHostsDir: 'C:\\home\\.sideline\\dev-hosts'
  });

  assert.notEqual(planA.userDataDir, planB.userDataDir, 'a shared user-data-dir would reload one host, not open two');
  assert.ok(planA.args.includes('--extensionDevelopmentPath=C:\\src\\SidelineCoach'));
  assert.equal(planA.args[planA.args.length - 1], 'C:\\repos\\A', 'the folder is the final positional argument');

  // The property that matters is that no traversal or separator survives.
  const hostile = sanitiseProfileName('../../etc/passwd');
  assert.doesNotMatch(hostile, /[\\/]/, 'a path separator would escape the profile root');
  assert.doesNotMatch(hostile, /\.\./, 'traversal must not survive');
  assert.equal(sanitiseProfileName(''), 'game');
  assert.ok(sanitiseProfileName('x'.repeat(300)).length <= 80);
});

// =========================================================================
// PLAYER DISCOVERY
// =========================================================================

test('P1. Detection never fabricates an authentication state', () => {
  const codex = getPlayerAdapter('codex');
  const terminal = getPlayerAdapter('terminal');

  assert.equal(classifyDetection(terminal, undefined), 'available', 'Terminal needs no installation');
  assert.equal(classifyDetection(codex, undefined), 'unknown', 'an unprobeable provider is Unknown, never Ready');
  assert.equal(classifyDetection(codex, false), 'not-installed');
  assert.equal(classifyDetection(codex, true), 'ready', 'installed with no auth probe is Ready, not "auth needed"');
  assert.equal(classifyDetection(codex, true, false), 'authentication-needed');
  assert.equal(classifyDetection(codex, true, true), 'ready');
});

test('P2. Only a genuinely usable Player can be added now', () => {
  const claude = getPlayerAdapter('claude');
  assert.equal(summariseDetection(claude, 'ready').canAddNow, true);
  assert.equal(summariseDetection(claude, 'available').canAddNow, true);
  assert.equal(summariseDetection(claude, 'authentication-needed').canAddNow, false);
  assert.equal(summariseDetection(claude, 'not-installed').canAddNow, false);
  assert.equal(summariseDetection(claude, 'unknown').canAddNow, false);
});

test('P3. Discovery is Stadium-scoped, so one Stadium never speaks for another', async () => {
  const windows = new PlayerDiscoveryService({
    commandAvailable: async (command) => command === 'codex' || command === 'claude'
  });
  const codespace = new PlayerDiscoveryService({
    commandAvailable: async (command) => command === 'codex'
  });

  const onWindows = await windows.discover({ stadiumId: 'stadium_win', gameId: 'game_a', shells: [] });
  const onCodespace = await codespace.discover({ stadiumId: 'stadium_cs', gameId: 'game_a', shells: [] });

  const stateOf = (result, id) => result.catalog.find((entry) => entry.playerType === id).state;

  assert.equal(stateOf(onWindows, 'claude'), 'ready');
  assert.equal(stateOf(onCodespace, 'claude'), 'not-installed', 'the same Game on another Stadium differs');
  assert.equal(onWindows.stadiumId, 'stadium_win');
  assert.equal(onCodespace.stadiumId, 'stadium_cs');
  // Terminal is offerable everywhere, which is what makes it the bootstrap path.
  assert.equal(stateOf(onCodespace, 'terminal'), 'available');
});

test('P4. A provider that is not installed carries install guidance, and nothing else does', async () => {
  const service = new PlayerDiscoveryService({ commandAvailable: async () => false });
  const result = await service.discover({ stadiumId: 's', gameId: 'g', shells: [] });

  const claude = result.catalog.find((entry) => entry.playerType === 'claude');
  const terminal = result.catalog.find((entry) => entry.playerType === 'terminal');

  assert.equal(claude.state, 'not-installed');
  assert.ok(claude.installGuidance?.command, 'the adapter supplies the command, not the browser');
  assert.equal(terminal.installGuidance, undefined);
});

test('P5. A failed process scan is reported as unsupported, never as "nothing running"', async () => {
  const service = new PlayerDiscoveryService({
    commandAvailable: async () => true,
    listProcesses: async () => {
      throw new Error('probe unavailable');
    }
  });

  const result = await service.discover({ stadiumId: 's', gameId: 'g', shells: [{ terminalName: 'x', shellPid: 10 }] });
  assert.equal(result.externalScanSupported, false);
  assert.deepEqual(result.externalCandidates, []);
});

// =========================================================================
// EXISTING PLAYER DISCOVERY AND ADOPTION
// =========================================================================

test('P6. An already-running agent is matched on its executable, never on a terminal name', () => {
  assert.equal(matchProcessToPlayerType({ pid: 2, parentPid: 1, name: 'agy.exe' }), 'antigravity');
  assert.equal(matchProcessToPlayerType({ pid: 2, parentPid: 1, name: 'node.exe', commandLine: 'C:\\bin\\claude --resume' }), 'claude');
  assert.equal(matchProcessToPlayerType({ pid: 2, parentPid: 1, name: 'node.exe', commandLine: '"C:\\a b\\codex" run' }), 'codex');

  // A shell merely NAMED after a provider is not that provider.
  assert.equal(matchProcessToPlayerType({ pid: 2, parentPid: 1, name: 'powershell.exe', commandLine: 'powershell' }), undefined);
});

test('P7. Descendant search is depth-bounded and survives a parent cycle', () => {
  const processes = [
    { pid: 2, parentPid: 1, name: 'shell.exe' },
    { pid: 3, parentPid: 2, name: 'node.exe' },
    { pid: 4, parentPid: 3, name: 'agy.exe' },
    { pid: 1, parentPid: 4, name: 'cycle.exe' }
  ];
  const found = collectDescendants(processes, 1).map((proc) => proc.pid);
  assert.deepEqual(found.sort(), [2, 3, 4]);
});

test('P8. The AntiGravity field failure: a manually launched agent is discovered without closing it', () => {
  // Reproduces the reported case — AntiGravity started by hand in a terminal.
  const shells = [{ terminalName: 'pwsh', shellPid: 100 }];
  const processes = [
    { pid: 101, parentPid: 100, name: 'node.exe', commandLine: 'node' },
    { pid: 102, parentPid: 101, name: 'agy.exe', commandLine: 'agy' }
  ];

  const candidates = findExternalCandidates(shells, processes);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].playerType, 'antigravity');
  assert.equal(candidates[0].shellPid, 100, 'adoption targets a pid, never a terminal name');
  assert.equal(candidates[0].processPid, 102);
});

test('P9. Coach never re-offers a shell it already owns', () => {
  const shells = [
    { terminalName: 'Coach terminal', shellPid: 200 },
    { terminalName: 'my own shell', shellPid: 201 }
  ];
  const processes = [
    { pid: 210, parentPid: 200, name: 'codex.exe' },
    { pid: 211, parentPid: 201, name: 'codex.exe' }
  ];

  const candidates = findExternalCandidates(shells, processes, new Set([200]));
  assert.deepEqual(candidates.map((c) => c.shellPid), [201]);
});

test('P10. Adoption removes the exact running process from discovery, and removal restores it', () => {
  const candidate = {
    playerType: 'claude', displayName: 'Claude', terminalName: 'Claude Code',
    shellPid: 201, processPid: 211, detail: 'Running'
  };
  const discovery = {
    stadiumId: 'stadium_test', gameId: 'game_test', at: Date.now(),
    catalog: [], externalCandidates: [candidate], externalScanSupported: true
  };

  const adopted = withoutClaimedCandidates(discovery, new Set([201]));
  assert.deepEqual(adopted.externalCandidates, [], 'the stale Add to Roster offer must disappear immediately');
  assert.deepEqual(withRestoredCandidate(adopted, candidate).externalCandidates, [candidate], 'removing an adopted Player leaves its process recruitable');
});

test('P11. Check Players after adoption cannot recreate a stale candidate for the claimed shell', () => {
  const shells = [{ terminalName: 'Claude Code', shellPid: 201 }];
  const processes = [{ pid: 211, parentPid: 201, name: 'claude.exe' }];
  assert.deepEqual(findExternalCandidates(shells, processes, new Set([201])), []);
});

// =========================================================================
// BROWSER PROJECTION
// =========================================================================

test('UX1. The browser renders every Game state and never invents a label', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const labelsBlock = script.match(/const GAME_STATE_LABELS = \{([\s\S]*?)\};/);
  assert.ok(labelsBlock, 'the browser needs an explicit Game state label map');

  for (const state of ['connected', 'opening', 'offline', 'conflicted', 'archived', 'known']) {
    assert.match(labelsBlock[1], new RegExp(`${state}:`), `missing browser label for ${state}`);
  }
  assert.match(labelsBlock[1], /Opening…/);
});

test('UX2. "Legacy" is gone as a user-facing Player concept', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  assert.doesNotMatch(html, />\s*Legacy\s*</, 'the human should never be taught an implementation generation');
  assert.match(script, /const playerCapability = \(instance\)/, 'transports are translated into human vocabulary');
});

test('UX3. Put on Bench and Remove Player are separate browser actions with separate endpoints', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  assert.match(script, /\/bench`, \{ method: 'POST' \}/);
  assert.match(script, /\/remove`, \{ method: 'POST' \}/);
  assert.match(script, /Put on Bench/);
  assert.match(script, /Remove Player/);
  assert.doesNotMatch(script, /window\.confirm/);
  assert.match(html, /id="confirmModal"[\s\S]*?role="alertdialog"/);
});

test('UX4. Exiting a Game states plainly that the repository is untouched', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  assert.match(html, /never from disk/i);
  assert.match(html, /\/api\/game\/archive/);
});

test('UX5. Copy Report is a secondary action, distinct from Dispatch', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  assert.match(html, /<button id="copyReportBtn" class="secondary">/);
});

// =========================================================================
// ROUTING SAFETY
// =========================================================================

test('R1. A Terminal Player is a MANUAL shell target only: exact commands, never an AUTO Play target', async () => {
  const html = await readFile(resolve(repoRoot, 'src/player-roster.ts'), 'utf8');
  const body = html.slice(html.indexOf('getRoutingCapabilities'));

  // P0.1: Terminal is a first-class Player, but a shell — it is offered only with
  // direct-shell execution semantics, and AUTO never routes natural language to it.
  assert.match(body, /!projection\.onField\) continue/);
  assert.match(body, /playerType === 'terminal'\) \{[\s\S]*?executionType: 'direct-shell'/);
  const policy = await readFile(resolve(repoRoot, 'src/routing-policy.ts'), 'utf8');
  assert.match(policy, /candidate\.playerType !== 'terminal' && candidate\.executionType !== 'direct-shell'/);
});

test('R2. Routing capabilities carry a human transport label, never a raw "legacy"', async () => {
  const source = await readFile(resolve(repoRoot, 'src/player-roster.ts'), 'utf8');
  const matches = source.match(/transportLabel: transportLabel\(/g) ?? [];
  assert.equal(matches.length, 3, 'controlled, Terminal and terminal-backed provider candidates all need a human label');

  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /instance\.transportLabel \|\| instance\.transport/);
});

// =========================================================================
// Q2.9B CLOSURE: TRANSPORT-AWARE DISPATCH, BENCH RECOVERY, DADIFIED ROUTING, SETTINGS
// =========================================================================

test('Q2.9B-1. Transport-aware dispatch resolves controlled vs legacy terminal in StadiumClient — by exact instance, never by terminal name', async () => {
  let controlledDelivered = false;
  let terminalDelivered = false;
  let terminalTextSent = '';

  const mockControlHost = {
    deliver: async (instanceId, prompt, options) => {
      controlledDelivered = true;
      return { kind: 'accepted', turnRef: 'turn_test_1' };
    }
  };

  const mockRoster = {
    resolve: (id) => {
      if (id === 'codex-inst-1') {
        return {
          state: 'live',
          transport: 'controlled',
          instance: { instanceId: id, playerType: 'codex', seat: 1, fieldLabel: 'Codex 1', ownership: 'coach-managed', onField: true }
        };
      }
      if (id === 'claude-inst-1') {
        return {
          state: 'live',
          transport: 'legacy',
          terminal: { name: 'Claude · Stadium' },
          instance: { instanceId: id, playerType: 'claude', seat: 1, fieldLabel: 'Claude 1', ownership: 'adopted', onField: true }
        };
      }
      if (id === 'reconnecting-inst-1') {
        return { state: 'pending' };
      }
      return { state: 'unknown' };
    },
    sendToProviderTerminal: (instanceId, text) => {
      terminalDelivered = instanceId === 'claude-inst-1';
      terminalTextSent = text;
      return { success: true, message: 'Sent.' };
    }
  };

  const sentNotifications = [];
  let deliveredByName = false;
  const client = new StadiumClient({
    gameContextGetter: () => ({ stadium: { stadiumId: 's1' }, game: { gameId: 'g1' }, binding: {} }),
    playerRoster: mockRoster,
    playerControlHost: mockControlHost,
    sendTerminalText: () => {
      // P0.1: a same-named sibling terminal must never receive another instance's Play.
      deliveredByName = true;
      return true;
    }
  });

  client.sendNotification = (method, params) => {
    sentNotifications.push({ method, params });
  };

  // Dispatch to controlled player
  await client.executeDispatch({
    clientRef: 'ref_1',
    stadiumId: 's1',
    gameId: 'g1',
    playerInstanceId: 'codex-inst-1',
    prompt: 'Implement feature'
  });
  assert.equal(controlledDelivered, true);
  assert.equal(sentNotifications[0].method, 'dispatch.accepted');
  assert.equal(sentNotifications[0].params.turnRef, 'turn_test_1');

  // Dispatch to terminal player (Claude)
  await client.executeDispatch({
    clientRef: 'ref_2',
    stadiumId: 's1',
    gameId: 'g1',
    playerInstanceId: 'claude-inst-1',
    prompt: 'Review architecture'
  });
  assert.equal(terminalDelivered, true);
  assert.equal(terminalTextSent, 'Review architecture');
  assert.equal(deliveredByName, false, 'exact instance, never by visible terminal name');
  assert.equal(sentNotifications[1].method, 'dispatch.accepted');

  // Dispatch to reconnecting player
  await client.executeDispatch({
    clientRef: 'ref_3',
    stadiumId: 's1',
    gameId: 'g1',
    playerInstanceId: 'reconnecting-inst-1',
    prompt: 'Pending test'
  });
  assert.equal(sentNotifications[2].method, 'dispatch.rejected');
  assert.match(sentNotifications[2].params.error.message, /reconnecting/);

  // Dispatch to unknown player
  await client.executeDispatch({
    clientRef: 'ref_4',
    stadiumId: 's1',
    gameId: 'g1',
    playerInstanceId: 'nonexistent-inst',
    prompt: 'Unknown test'
  });
  assert.equal(sentNotifications[3].method, 'dispatch.rejected');
  assert.match(sentNotifications[3].params.error.message, /left the field/);
});

test('Q2.9B-2. Bench -> Put on field lifecycle preserves instanceId and flips onField without duplication', () => {
  const book = new PlayerInstanceBook();
  const record = book.allocate('antigravity', 'adopted');
  const instanceId = record.instanceId;
  assert.equal(record.onField, true);

  // Take off field (bench)
  const benched = book.setOnField(instanceId, false);
  assert.equal(benched, true);
  assert.equal(book.get(instanceId)?.onField, false);
  assert.equal(book.byType('antigravity').length, 1);

  // Put on field (return from bench)
  const returned = book.setOnField(instanceId, true);
  assert.equal(returned, true);
  assert.equal(book.get(instanceId)?.onField, true);
  assert.equal(book.get(instanceId)?.instanceId, instanceId, 'exact same instanceId is preserved');
  assert.equal(book.byType('antigravity').length, 1, 'no duplicate instances created');
});

test('Q2.9B-3 (amended by Q2.9C). AUTO handles empty, single, and multiple terminal-backed Players truthfully', () => {
  const policy = new CodexRoutingPolicy();
  const policies = new Map([['codex', policy]]);

  // 1. Nobody on field
  const emptyRes = computeAutoRoute('g1', 'Help me code', [], policies);
  assert.equal(emptyRes.decision, undefined);
  assert.equal(emptyRes.error, 'No Player is on field. Add a Player or put one on field to continue.');

  // 2. Single non-controlled player (Claude) on field
  const claudeCandidate = {
    instanceId: 'claude-1',
    playerType: 'claude',
    transport: 'legacy',
    fieldLabel: 'Claude',
    state: 'ready',
    capability: { provider: 'claude', freshness: 'unavailable', models: [] }
  };
  const singleRes = computeAutoRoute('g1', 'Help me code', [claudeCandidate], policies);
  // Q2.9C amendment: the only Player on field is AUTO's choice, reached through its terminal.
  assert.equal(singleRes.error, undefined);
  assert.equal(singleRes.decision.playerInstanceId, 'claude-1');
  assert.equal(singleRes.decision.playerLabel, 'Claude');
  assert.equal(singleRes.decision.transport, 'legacy');
  assert.doesNotMatch(JSON.stringify(singleRes), /Add Codex|only available with Codex|No controlled Player/);

  // 3. Multiple non-controlled players (Claude, AntiGravity) on field
  const agCandidate = {
    instanceId: 'ag-1',
    playerType: 'antigravity',
    transport: 'legacy',
    fieldLabel: 'AntiGravity',
    state: 'ready',
    capability: { provider: 'antigravity', freshness: 'unavailable', models: [] }
  };
  const multiRes = computeAutoRoute('g1', 'Help me code', [claudeCandidate, agCandidate], policies);
  // Several terminal Players need the Q2.10 Play Analyzer; until then AUTO names them and never guesses.
  assert.equal(multiRes.decision, undefined);
  assert.equal(
    multiRes.error,
    'Claude and AntiGravity are on field. Choose who gets this Play in Manual — AUTO will pick between several Players in a later update.'
  );
});

test('Q2.9B-4. Header status renders Coach Online and Settings panel shell provides future breadcrumbs', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');

  // Connection pill says Coach Online / Coach Offline
  assert.match(html, /Coach Online/);
  assert.match(html, /Coach Offline/);

  // Settings button affordance
  assert.match(html, /id="settingsBtn"/);
  assert.match(html, /⚙ Settings/);

  // Settings view and return button
  assert.match(html, /id="settingsView"/);
  assert.match(html, /id="settingsBackBtn"/);
  assert.match(html, /← Back to Sideline/);

  // Future breadcrumbs documented
  assert.match(html, /Game Setup/);
  assert.match(html, /Routing/);
  assert.match(html, /Players &amp; Providers/);
  assert.match(html, /Usage &amp; Budgets/);
  assert.match(html, /Stadiums/);
  assert.match(html, /GitHub &amp; Repositories/);
});
