import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SCOUT_OPENROUTER_SECRET_KEY,
  ScoutOpenRouterCredentialStore,
  createScoutExecutionEnvironment
} from '../out/scout-openrouter-credential.js';
import { createCombineExecutor, runScoutCombine } from '../out/scout-combine.js';
import { runScoutFormation } from '../out/scout-formation.js';
import { StadiumClient } from '../out/stadium-client.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { projectExecution } from '../out/control-plane/execution-projection.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const fakeOpenCode = path.join(testDir, 'fixtures', 'fake-opencode-cli.mjs');

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-scout-credential-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Reports', 'Scout Only');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"credential-fixture"}\n');
  return { root, gameRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function gameContext() {
  return {
    game: { gameId: 'game-credential', displayName: 'Credential Game', fingerprintSource: 'test' },
    stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId: 'game-credential', stadiumId: 'stadium', rootFsPath: 'unused', boundAt: Date.now(), isPrimary: true, status: 'bound' }
  };
}

test('Credential-1. Save/replace/disconnect use only the secure secret abstraction and return boolean state', async () => {
  const values = new Map();
  const operations = [];
  const secure = {
    async get(key) { operations.push(['get', key]); return values.get(key); },
    async store(key, value) { operations.push(['store', key]); values.set(key, value); },
    async delete(key) { operations.push(['delete', key]); values.delete(key); }
  };
  const store = new ScoutOpenRouterCredentialStore(secure);
  const firstSecret = 'fixture-secret-first';
  const replacementSecret = 'fixture-secret-replacement';

  assert.deepEqual(await store.status(), { configured: false });
  const saved = await store.save(firstSecret);
  assert.deepEqual(saved, { configured: true });
  assert.equal(JSON.stringify(saved).includes(firstSecret), false, 'save response never returns the secret');
  assert.equal(await store.resolveForExecution(), firstSecret);

  const replaced = await store.save(replacementSecret);
  assert.deepEqual(replaced, { configured: true });
  assert.equal(JSON.stringify(replaced).includes(firstSecret), false, 'replace never reveals the old secret');
  assert.equal(await store.resolveForExecution(), replacementSecret);

  assert.deepEqual(await store.disconnect(), { configured: false });
  assert.deepEqual(await store.status(), { configured: false });
  assert.deepEqual(operations.filter(([operation]) => operation === 'store').map(([, key]) => key), [SCOUT_OPENROUTER_SECRET_KEY, SCOUT_OPENROUTER_SECRET_KEY]);
  assert.equal(operations.some(([operation, key]) => operation === 'delete' && key === SCOUT_OPENROUTER_SECRET_KEY), true);
});

test('Credential-2. Runtime credential wins, CLI environment remains the fallback, and absence stays absent', () => {
  const runtime = createScoutExecutionEnvironment('runtime-secret', { OPENROUTER_API_KEY: 'cli-secret', SAFE: 'yes' });
  assert.equal(runtime.env.OPENROUTER_API_KEY, 'runtime-secret');
  assert.deepEqual(runtime.secretValues, ['runtime-secret']);

  const cli = createScoutExecutionEnvironment(undefined, { OPENROUTER_API_KEY: 'cli-secret' });
  assert.equal(cli.env.OPENROUTER_API_KEY, 'cli-secret');
  assert.deepEqual(cli.secretValues, ['cli-secret']);

  const missing = createScoutExecutionEnvironment(undefined, { SAFE: 'yes' });
  assert.equal(missing.openRouterCredentialConfigured, false);
  assert.equal(Object.hasOwn(missing.env, 'OPENROUTER_API_KEY'), false);
});

test('Credential-3. The shared execution environment reaches the spawned OpenCode process without exposing its value', async () => {
  const l = layout();
  try {
    const invocationLog = path.join(l.root, 'invocation.jsonl');
    const execution = createScoutExecutionEnvironment('spawn-only-secret', {
      FAKE_OPENCODE_MODE: 'complete',
      FAKE_OPENCODE_LOG: invocationLog
    });
    const executor = createCombineExecutor({
      candidateId: 'openrouter-fixture', provider: 'openrouter', model: 'openrouter/fixture/model:free', displayName: 'Fixture',
      harness: 'opencode', discoveredAt: new Date().toISOString(), advertisedFree: true, supportsTools: true, sourceEvidence: 'fixture'
    }, 'credential handoff proof', { opencodeExecutable: process.execPath, prefixArgs: [fakeOpenCode], env: execution.env });
    const outcome = await executor.execute(
      { semanticPrompt: 'go', play: { playId: 'credential-proof' }, playHash: 'hash', semanticPromptHash: 'prompt-hash' },
      { gameRoot: l.gameRoot, playerPath: path.join(l.root, 'attempt') }
    );
    assert.equal(outcome.state, 'COMPLETE');
    const invocation = JSON.parse(fs.readFileSync(invocationLog, 'utf8').trim());
    assert.equal(invocation.openRouterCredentialPresent, true);
    assert.equal(JSON.stringify(invocation).includes('spawn-only-secret'), false, 'fixture observes presence only');
  } finally { l.cleanup(); }
});

test('Credential-3b. Combine resolves the trusted runtime credential through the same environment seam and redacts durable evidence', async () => {
  const l = layout();
  const secret = 'combine-runtime-secret';
  const invocationLog = path.join(l.root, 'combine-invocation.jsonl');
  const previousLog = process.env.FAKE_OPENCODE_LOG;
  process.env.FAKE_OPENCODE_LOG = invocationLog;
  let resolverCalls = 0;
  try {
    const prospect = {
      candidateId: 'openrouter-runtime', provider: 'openrouter', model: 'openrouter/fixture/runtime:free', displayName: 'Runtime Fixture',
      harness: 'opencode', discoveredAt: new Date().toISOString(), advertisedFree: true, supportsTools: true, sourceEvidence: 'fixture'
    };
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot,
      durableReportRoot: l.durableReportRoot,
      discovery: {
        discoveredAt: new Date().toISOString(), prospects: [prospect],
        sources: [{ id: 'openrouter', available: true, count: 1 }, { id: 'opencode-hosted', available: false, count: 0, error: 'fixture disabled' }]
      },
      budget: { maxTryouts: 1, maxConcurrency: 1 }, route: 'C',
      opencodeExecutable: process.execPath, opencodePrefixArgs: [fakeOpenCode],
      resolveOpenRouterApiKey: async () => { resolverCalls += 1; return secret; }
    });
    assert.equal(resolverCalls, 1);
    assert.equal(completion.tryoutsCompleted, 1);
    assert.equal(completion.scorecardUpdates.at(-1).status, 'READY');
    assert.equal(JSON.parse(fs.readFileSync(invocationLog, 'utf8').trim()).openRouterCredentialPresent, true);
    const durableFiles = fs.readdirSync(completion.durablePath, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
      .join('\n');
    assert.equal(durableFiles.includes(secret), false);
    assert.equal(JSON.stringify(completion).includes(secret), false);
  } finally {
    if (previousLog === undefined) delete process.env.FAKE_OPENCODE_LOG;
    else process.env.FAKE_OPENCODE_LOG = previousLog;
    l.cleanup();
  }
});

test('Credential-4. Formation resolves the runtime credential at execution, passes it through the Combine executor context, and redacts artifacts', async () => {
  const l = layout();
  const secret = 'formation-runtime-secret';
  let resolverCalls = 0;
  try {
    const candidate = {
      id: 'openrouter-formation', player: 'OpenRouter Formation', provider: 'OpenRouter',
      eligible(context) {
        return { eligible: Boolean(context.env.OPENROUTER_API_KEY), reason: 'credential presence only' };
      },
      createExecutor(context) {
        assert.equal(context.env.OPENROUTER_API_KEY, secret);
        return {
          id: 'openrouter-formation', player: 'OpenRouter Formation', harness: 'OpenCode', provider: 'OpenRouter',
          async execute() {
            return {
              state: 'COMPLETE',
              stdout: `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${secret}\n# FACTS\npackage.json\n# INFERENCES\nNone\n# UNKNOWNS\nNone\n# CONTRADICTIONS\nNone\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone\n# Provenance\npackage.json\n`,
              stderr: `provider diagnostic ${secret}\n`, model: 'openrouter/fixture/model:free', exitCode: 0, signal: null, readOnlyContractHeld: true
            };
          }
        };
      }
    };
    const completion = await runScoutFormation({
      objective: 'Prove secure Formation credential handoff.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates: [candidate], players: [candidate.id],
      resolveOpenRouterApiKey: async () => { resolverCalls += 1; return secret; }
    });
    assert.equal(completion.outcome, 'COMPLETE');
    assert.equal(resolverCalls, 1);
    const evidence = fs.readFileSync(completion.attempts[0].stdoutPath, 'utf8') + fs.readFileSync(completion.attempts[0].stderrPath, 'utf8');
    assert.equal(evidence.includes(secret), false);
    assert.match(evidence, /\[REDACTED\]/);
    assert.equal(JSON.stringify(completion).includes(secret), false, 'secret is not provenance/completion state');
  } finally { l.cleanup(); }
});

test('Credential-5. Stadium RPC exposes configured/available only across save, replace, status, and disconnect', async () => {
  let stored;
  const sent = [];
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: gameContext,
    scoutAvailable: () => true,
    scoutOpenRouterCredential: {
      status: async () => ({ configured: Boolean(stored) }),
      save: async (value) => { stored = value; return { configured: true }; },
      disconnect: async () => { stored = undefined; return { configured: false }; }
    }
  });
  client.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
  client.connected = true;

  const first = 'rpc-first-secret';
  const replacement = 'rpc-replacement-secret';
  await client.handleIncomingRequest({ id: 1, method: 'scout.openrouterCredential.save', params: { gameId: 'game-credential', apiKey: first } });
  await client.handleIncomingRequest({ id: 2, method: 'scout.openrouterCredential.save', params: { gameId: 'game-credential', apiKey: replacement } });
  await client.handleIncomingRequest({ id: 3, method: 'scout.openrouterCredential.status', params: { gameId: 'game-credential' } });
  assert.equal(stored, replacement);
  for (const response of sent) {
    const serialized = JSON.stringify(response);
    assert.equal(serialized.includes(first), false);
    assert.equal(serialized.includes(replacement), false);
    assert.equal(typeof response.result.configured, 'boolean');
    assert.equal(typeof response.result.available, 'boolean');
  }
  await client.handleIncomingRequest({ id: 4, method: 'scout.openrouterCredential.disconnect', params: { gameId: 'game-credential' } });
  assert.equal(stored, undefined);
  assert.equal(sent.at(-1).result.configured, false);
});

test('Credential-6. Dad Mode HTTP bridge returns only safe state and does not persist the credential in Control Plane files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-credential-http-'));
  const gameId = 'game-credential-http';
  const daemon = new ControlPlaneDaemon({ dir, port: 42600 + Math.floor(Math.random() * 300), idleTimeoutMs: 60_000 });
  let stored;
  try {
    await daemon.start();
    const socket = {
      readyState: 1,
      send(raw) {
        const frame = JSON.parse(String(raw));
        if (frame.method === 'scout.openrouterCredential.save') stored = frame.params.apiKey;
        if (frame.method === 'scout.openrouterCredential.disconnect') stored = undefined;
        daemon.handleWsResponseForTest(frame.id, {
          success: true, gameId, configured: Boolean(stored), available: true,
          message: stored ? 'API key saved securely.' : 'OpenRouter disconnected.'
        });
      },
      close() {}
    };
    daemon.registryInstance.registerSession({
      instanceId: 'credential-session', stadiumId: 'credential-stadium', name: 'Credential', platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId, displayName: 'Credential', fingerprintSource: 'test' }, rootFsPath: repoRoot,
      roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: ['scout.openrouter-credential.v1']
    });
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const api = async (url, init = {}) => {
      const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
      });
      return { status: response.status, body: await response.json() };
    };
    const secret = 'http-bridge-secret';
    const save = await api('/api/scout/openrouter-credential', { method: 'POST', body: JSON.stringify({ gameId, apiKey: secret }) });
    assert.equal(save.status, 200);
    assert.deepEqual({ configured: save.body.configured, available: save.body.available }, { configured: true, available: true });
    assert.equal(JSON.stringify(save.body).includes(secret), false);
    const status = await api(`/api/scout/openrouter-credential?gameId=${encodeURIComponent(gameId)}`);
    assert.equal(status.body.configured, true);
    assert.equal(JSON.stringify(status.body).includes(secret), false);
    const persisted = fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
      .join('\n');
    assert.equal(persisted.includes(secret), false, 'Control Plane remains a transient bridge, never a credential store');
    const disconnected = await api('/api/scout/openrouter-credential', { method: 'DELETE', body: JSON.stringify({ gameId }) });
    assert.equal(disconnected.body.configured, false);
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Credential-7. Dad Mode markup never persists or repopulates the key and keeps entitlement separate', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  const player = fs.readFileSync(path.join(repoRoot, 'src', 'scout-player.ts'), 'utf8');
  assert.match(html, /id="scoutOpenRouterApiKey" type="password"/);
  assert.match(html, /input\.value = ''/);
  assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)[^\n]*OpenRouter/i);
  assert.doesNotMatch(html, /indexedDB[^\n]*OpenRouter/i);
  assert.match(html, /&#10003; Credential configured/);
  assert.match(html, /id="scoutFormationOperator"/);
  assert.match(html, /body: JSON\.stringify\(\{ gameId: currentGameId, receiverId, objective \}\)/, 'operator payload carries receiver/objective only');
  assert.match(player, /enabled\(\)/, 'commercial/dev visibility remains the existing capability seam');
  assert.match(player, /secure storage\/execution contract/, 'breadcrumb keeps entitlement separate from credential ownership');
});

test('Scout lifecycle registers the exact Formation parent, carries aggregate telemetry, and stays report-ready until acknowledgement', async () => {
  const l = layout();
  try {
    const formationDir = path.join(l.durableReportRoot, 'Formations', 'formation-exact');
    const parentPath = path.join(formationDir, 'FORMATION-RESULT.md');
    const childPath = path.join(formationDir, 'Receivers', 'qwen.md');
    fs.mkdirSync(path.dirname(childPath), { recursive: true });
    fs.writeFileSync(parentPath, '# Formation result\nParent artifact.\n');
    fs.writeFileSync(childPath, '# Receiver evidence\nSubordinate artifact.\n');
    const frames = [];
    const scoutPlayer = {
      capability: () => ({ state: 'ready' }),
      async execute(objective, gameRoot, options) {
        assert.equal(objective, 'Investigate the exact report handoff.');
        assert.equal(gameRoot, 'unused');
        options.onSelected({ count: 3, candidateIds: ['a', 'b', 'c'] });
        return {
          outcome: 'PARTIAL',
          formation: {
            formationId: 'formation-exact', outcome: 'PARTIAL', resultPath: parentPath,
            scoutsRequested: 3, scoutsCompleted: 2, scoutsFailed: 1, scoutsBlocked: 0,
            scoutsInterrupted: 0, scoutsUnknown: 0, endedAt: '2026-09-18T12:00:05.000Z'
          }
        };
      }
    };
    const client = new StadiumClient({
      autoReconnect: false,
      gameContextGetter: gameContext,
      scoutPlayer,
      reportsGetter: async () => [{ gameId: 'game-credential', project: 'Credential Game', agent: 'Qwen', filename: 'qwen.md', path: childPath, mtime: 1, content: 'child' }]
    });
    client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
    client.connected = true;
    await client.deliverScout({
      clientRef: 'scout-play-exact', stadiumId: client.stadiumId, gameId: 'game-credential',
      playerInstanceId: 'scout', prompt: 'Investigate the exact report handoff.'
    });

    const turns = frames.filter((frame) => frame.method === 'turn.changed').map((frame) => frame.params.turn);
    const started = turns.find((turn) => turn.state === 'started' && turn.activitySummary);
    assert.equal(started.activitySummary, '3 Scouts running');
    assert.equal(started.promptSummary, 'Investigate the exact report handoff.');
    const terminal = turns.find((turn) => turn.state === 'partial');
    assert.equal(terminal.reportPath, parentPath);
    assert.equal(terminal.summary, 'Formation partial · 2 of 3 Scouts completed');

    const reports = frames.filter((frame) => frame.method === 'report.changed').at(-1).params.reports;
    const parent = reports.find((report) => report.path === parentPath);
    assert.ok(parent, 'exact Formation parent is registered even though it is outside the active Game report scan');
    assert.equal(parent.filename, 'FORMATION-RESULT.md');
    assert.equal(parent.provenance.clientRef, 'scout-play-exact');
    assert.equal(parent.provenance.playerInstanceId, 'scout');
    assert.ok(reports.some((report) => report.path === childPath), 'subordinate evidence remains available but is not selected as the parent');

    let now = 100;
    const ledger = new InstanceWorkLedger(() => now++);
    ledger.recordDispatch({ gameId: 'game-credential', playerInstanceId: 'scout', playerType: 'scout', clientRef: 'scout-play-exact', promptSummary: 'Investigate the exact report handoff.' });
    for (const turn of turns) ledger.recordTurn('game-credential', turn);
    ledger.recordReports('game-credential', reports);
    let view = projectExecution({ instanceId: 'scout', entry: ledger.get('game-credential', 'scout'), executionType: 'scout-formation', now: Date.now() + 86_400_000 });
    assert.equal(view.state, 'finished', 'an arbitrary timeout does not clear an unacknowledged Formation report');
    assert.equal(view.report.path, parentPath);
    assert.equal(view.detail, 'Formation partial · 2 of 3 Scouts completed');
    assert.equal(ledger.acknowledge({ gameId: 'game-credential', instanceId: 'scout', playRef: 'scout-play-exact', reportPath: parentPath }).changed, true);
    view = projectExecution({ instanceId: 'scout', entry: ledger.get('game-credential', 'scout'), executionType: 'scout-formation', now: Date.now() + 86_400_001 });
    assert.equal(view.state, 'idle');
  } finally { l.cleanup(); }
});

test('Dev Mode operator accepts exactly one canonical READY receiver and reuses the extension Scout runtime without returning a credential', async () => {
  const frames = [];
  const calls = [];
  let credentialChecks = 0;
  const scoutPlayer = {
    capability: () => ({ state: 'ready' }),
    availability: () => ({ considered: [
      { id: 'openrouter-qwen-qwen3.8-27b-free', player: 'Qwen', provider: 'OpenRouter', eligible: true, reason: 'READY' },
      { id: 'not-ready', player: 'Bench', provider: 'OpenRouter', eligible: false, reason: 'LIMITED' }
    ], eligibleIds: ['openrouter-qwen-qwen3.8-27b-free'] }),
    execute(objective, gameRoot, options) {
      calls.push({ objective, gameRoot, players: options.players });
      options.onSelected({ count: 1, candidateIds: options.players });
      return new Promise(() => {});
    }
  };
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: gameContext,
    scoutPlayer,
    scoutOpenRouterCredential: {
      status: async () => { credentialChecks += 1; return { configured: true }; },
      save: async () => ({ configured: true }),
      disconnect: async () => ({ configured: false })
    }
  });
  client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
  client.connected = true;

  await client.handleIncomingRequest({ id: 80, method: 'scout.formation.receivers', params: { gameId: 'game-credential' } });
  const listed = frames.find((frame) => frame.id === 80).result;
  assert.deepEqual(listed.receivers.map((receiver) => receiver.id), ['openrouter-qwen-qwen3.8-27b-free']);
  await client.handleIncomingRequest({ id: 81, method: 'scout.formation.run', params: {
    gameId: 'game-credential', receiverId: 'not-ready', objective: 'Read only.'
  } });
  assert.equal(frames.find((frame) => frame.id === 81).result.success, false);
  await client.handleIncomingRequest({ id: 82, method: 'scout.formation.run', params: {
    gameId: 'game-credential', receiverId: 'openrouter-qwen-qwen3.8-27b-free', objective: 'Inspect package.json without modifying files.'
  } });
  assert.deepEqual(calls, [{
    objective: 'Inspect package.json without modifying files.', gameRoot: 'unused', players: ['openrouter-qwen-qwen3.8-27b-free']
  }]);
  assert.equal(credentialChecks, 1);
  const response = frames.find((frame) => frame.id === 82).result;
  assert.equal(response.success, true);
  assert.equal(JSON.stringify(response).includes('API'), false, 'no raw credential crosses the operator response');
});
