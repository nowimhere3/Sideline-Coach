/**
 * Q2.10A.1 — core Player discovery must never wait for optional provider
 * capability enrichment.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlayerDiscoveryService } from '../out/player-discovery.js';
import { claudeControlProfile } from '../out/provider-control.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unknownClaude = () => claudeControlProfile(undefined, undefined, 'test probe unavailable', 10);
const knownClaude = () => claudeControlProfile(
  { currentModelLabel: 'Opus 5', currentEffort: 'high', aliases: ['opus', 'sonnet', 'haiku', 'default'] },
  ['low', 'medium', 'high'],
  'test probe',
  20
);

const coreOptions = {
  stadiumId: 'stadium_win',
  gameId: 'game_gs3',
  shells: [{ terminalName: 'Claude Code', shellPid: 200 }]
};

const runningProcesses = [
  { pid: 200, parentPid: 1, name: 'powershell.exe', commandLine: 'powershell.exe' },
  { pid: 201, parentPid: 200, name: 'claude.exe', commandLine: 'claude' }
];

test('Q2.10A.1-1. Core discovery returns all supported Players without starting a slow provider enricher', async () => {
  let probesStarted = 0;
  const service = new PlayerDiscoveryService({
    commandAvailable: async () => true,
    listProcesses: async () => runningProcesses
  }, [{
    playerType: 'claude',
    probe: async () => {
      probesStarted += 1;
      return await new Promise(() => {});
    },
    unknown: unknownClaude
  }]);

  const discovery = await service.discover(coreOptions);

  assert.equal(probesStarted, 0, 'player.discover never enters optional provider code');
  assert.deepEqual(discovery.catalog.map((entry) => [entry.playerType, entry.summary]), [
    ['codex', 'Ready'],
    ['claude', 'Ready'],
    ['antigravity', 'Ready'],
    ['terminal', 'Available']
  ]);
  assert.equal(discovery.catalog.find((entry) => entry.playerType === 'claude').controls, undefined);
  assert.deepEqual(discovery.externalCandidates.map((candidate) => [candidate.playerType, candidate.shellPid]), [['claude', 200]]);
});

test('Q2.10A.1-2. Async enrichment adds controls and concurrent requests share one provider process set', async () => {
  let probesStarted = 0;
  let finishProbe;
  const service = new PlayerDiscoveryService({ commandAvailable: async () => true }, [{
    playerType: 'claude',
    probe: async () => {
      probesStarted += 1;
      return await new Promise((resolveProbe) => { finishProbe = resolveProbe; });
    },
    unknown: unknownClaude
  }]);
  const core = await service.discover({ ...coreOptions, shells: [] });

  const first = service.enrich(core);
  const second = service.enrich(core);
  assert.equal(probesStarted, 1);

  finishProbe(knownClaude());
  const [enriched, sharedResult] = await Promise.all([first, second]);
  const controls = enriched.catalog.find((entry) => entry.playerType === 'claude').controls;
  assert.equal(controls.model.currentLabel, 'Opus 5');
  assert.equal(controls.effort.currentLabel, 'High');
  assert.equal(sharedResult.catalog.find((entry) => entry.playerType === 'claude').controls.model.currentLabel, 'Opus 5');
  assert.equal(core.catalog.find((entry) => entry.playerType === 'claude').controls, undefined, 'core snapshot stays immutable');
});

test('Q2.10A.1-3. A failed provider probe degrades controls to Unknown without failing discovery', async () => {
  const service = new PlayerDiscoveryService({ commandAvailable: async () => true }, [{
    playerType: 'claude',
    probe: async () => { throw new Error('provider changed its CLI'); },
    unknown: unknownClaude
  }]);
  const core = await service.discover({ ...coreOptions, shells: [] });
  const enriched = await service.enrich(core);
  const controls = enriched.catalog.find((entry) => entry.playerType === 'claude').controls;

  assert.equal(controls.model.state, 'unknown');
  assert.equal(controls.effort.state, 'unknown');
  assert.equal(core.catalog.length, 4, 'the scouting result remains complete');
});

test('Q2.10A.1-4. A timed-out provider probe is aborted and deterministically becomes Unknown', async () => {
  let observedAbort = false;
  const service = new PlayerDiscoveryService({ commandAvailable: async () => true }, [{
    playerType: 'claude',
    timeoutMs: 0,
    probe: async (_adapter, signal) => {
      observedAbort = signal.aborted;
      return await new Promise(() => {});
    },
    unknown: unknownClaude
  }]);
  const core = await service.discover({ ...coreOptions, shells: [] });
  const enriched = await service.enrich(core);
  const controls = enriched.catalog.find((entry) => entry.playerType === 'claude').controls;

  assert.equal(observedAbort, true);
  assert.equal(controls.model.state, 'unknown');
  assert.equal(controls.effort.state, 'unknown');
});

test('Q2.10A.1-5. Stadium enrichment publishes canonical discovery and drives existing SSE convergence', async () => {
  const [roster, stadium, extension, daemon, page] = await Promise.all([
    readFile(resolve(repoRoot, 'src/player-roster.ts'), 'utf8'),
    readFile(resolve(repoRoot, 'src/stadium-client.ts'), 'utf8'),
    readFile(resolve(repoRoot, 'src/extension.ts'), 'utf8'),
    readFile(resolve(repoRoot, 'src/control-plane/daemon.ts'), 'utf8'),
    readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8')
  ]);

  assert.match(roster, /setImmediate\(\(\) => \{ void this\.enrichDiscovery\(result, generation\); \}\)/, 'RPC result is released before enrichment');
  assert.match(roster, /catalog: current\.catalog\.map/, 'only controls merge into the latest reconciled snapshot');
  assert.match(roster, /this\.changed\.fire\(\);\s*\n\s*}\s*\n\s*\/\*\*/, 'enrichment fires the canonical roster change event');
  assert.match(extension, /sendDiscoveryChanged\(\)/);
  assert.match(stadium, /sendNotification\('player\.discovery\.changed'/);
  assert.match(daemon, /case 'player\.discovery\.changed':[\s\S]*?discoveryByGame\.set\(p\.gameId, p\.discovery\);[\s\S]*?broadcastStatus\(\)/);
  assert.match(page, /eventSource\.addEventListener\('status', \(\) => void refresh\(\)\)/, 'browser re-fetches canonical status; no second Check Players');
});

test('Q2.10A.1-6. Claude probes close stdin, retain slash-command-safe PowerShell, and carry bounded timeouts', async () => {
  const roster = await readFile(resolve(repoRoot, 'src/player-roster.ts'), 'utf8');
  assert.match(roster, /child\.stdin\?\.end\(\)/);
  assert.match(roster, /powershell\.exe/);
  assert.match(roster, /claude -p '\/model'/);
  assert.match(roster, /claude -p '\/effort'/);
  assert.match(roster, /timeout: 7_500/);
  assert.match(roster, /timeoutMs: 8_000/);
  assert.doesNotMatch(roster.slice(roster.indexOf('async function probeClaudeControls'), roster.indexOf('export interface AddPlayerOptions')), /20_000/);
});

test('Q2.10A.1-7. The bridge RPC budget remains 5 seconds; timeout inflation is not the fix', async () => {
  const daemon = await readFile(resolve(repoRoot, 'src/control-plane/daemon.ts'), 'utf8');
  const rpc = daemon.slice(daemon.indexOf('private sendRpcToStadium('), daemon.indexOf('private sendRpcToStadium(') + 1200);
  assert.match(rpc, /}, 5000\)/);
  assert.doesNotMatch(rpc, /15000|15_000/);
});
