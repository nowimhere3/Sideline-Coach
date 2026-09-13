/**
 * Q2.10B — Unified Player control, multi-instance Roster, smart Dispatcher.
 *
 * Section 1 reproduces the field regression exactly: Codex app-server 0.154.0
 * answers "thread not loaded" to thread/read in a fresh process for ANY thread,
 * so restore must let thread/resume decide, and a restore that cannot finish must
 * never erase the provider's model and effort truth.
 */

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexAppServerFactory } from '../out/player-control/codex-app-server.js';
import { PlayerControlHost } from '../out/player-control/host.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-q210b-'));
after(async () => { await rm(scratch, { recursive: true, force: true }); });
let sequence = 0;

class MemoryStore {
  constructor(value = []) { this.value = structuredClone(value); }
  load() { return structuredClone(this.value); }
  async save(records) { this.value = structuredClone(records); }
}

const nextLog = (name) => join(scratch, `${++sequence}-${name}.jsonl`);
const request = (instanceId) => ({ instanceId, playerType: 'codex', seat: 1, gameRoot: repoRoot, authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' } });
const binding = (instanceId, extra = {}) => ({ instanceId, playerType: 'codex', seat: 1, adapter: 'codex-app-server', sessionRef: `session-${instanceId}`, historyExpected: true, pendingPlay: null, ...extra });
const factory = (logPath, mode) => new CodexAppServerFactory({
  command: process.execPath, args: [fixture], shell: false, closeGraceMs: 100, requestTimeoutMs: 1_000, retryDelayMs: 5,
  resumeRetryDelaysMs: [5, 5, 5], env: { FAKE_LOG_PATH: logPath, FAKE_MODE: mode }
});
const methods = async (logPath) => {
  try { return (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse).filter((e) => e.method).map((e) => e.method); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
};

test('Q2.10B-1. "thread not loaded" no longer blocks restore: resume reopens the SAME conversation, no fresh thread, no Play', async () => {
  const record = binding('codex-0a6eab81');
  const store = new MemoryStore([record]);
  const log = nextLog('not-loaded');
  const host = new PlayerControlHost(store);
  host.register('codex', factory(log, 'resume-not-loaded'));
  host.planRestores();
  const outcome = await host.restore(request(record.instanceId));
  assert.equal(outcome.kind, 'ready', 'field state was needs-decision: "thread not loaded: <id>"');
  assert.equal(outcome.openedFresh, false);
  assert.equal(outcome.control.providerSessionRef, record.sessionRef, 'exact same conversation');
  const calls = await methods(log);
  assert.ok(calls.includes('thread/read') && calls.includes('thread/resume'));
  assert.equal(calls.filter((m) => m === 'thread/start').length, 0);
  assert.equal(calls.filter((m) => m === 'turn/start').length, 0);
  assert.equal(store.value[0].sessionRef, record.sessionRef, 'binding untouched');
  await host.dispose();
});

test('Q2.10B-2. Truly missing history still stops honestly — and keeps the provider model/effort truth', async () => {
  const record = binding('codex-11112222');
  const log = nextLog('not-loaded-missing');
  const host = new PlayerControlHost(new MemoryStore([record]));
  host.register('codex', factory(log, 'resume-not-loaded-missing'));
  host.planRestores();
  const outcome = await host.restore(request(record.instanceId));
  assert.equal(outcome.kind, 'needs-decision');
  assert.match(outcome.message, /conversation is no longer available/);
  assert.ok(outcome.capabilities, 'a lost conversation must not erase which models the provider offers');
  assert.equal(outcome.capabilities.provider, 'codex');
  assert.ok(outcome.capabilities.models.length > 0, 'real model list survives');
  assert.ok(outcome.capabilities.models.some((m) => m.supportedEfforts.length > 0), 'real effort list survives');
  assert.equal((await methods(log)).filter((m) => m === 'thread/start').length, 0, 'never silently replaces a conversation with history');
  await host.dispose();
});

test('Q2.10B-3. Missing history with nothing expected still opens fresh exactly once', async () => {
  const record = binding('codex-33334444', { historyExpected: false });
  const store = new MemoryStore([record]);
  const log = nextLog('not-loaded-empty');
  const host = new PlayerControlHost(store);
  host.register('codex', factory(log, 'resume-not-loaded-missing'));
  host.planRestores();
  const outcome = await host.restore(request(record.instanceId));
  assert.equal(outcome.kind, 'ready');
  assert.equal(outcome.openedFresh, true);
  assert.equal((await methods(log)).filter((m) => m === 'thread/start').length, 1);
  await host.dispose();
});

test('Q2.10B-4. The roster records capability truth from a restore that needs a decision', async () => {
  const roster = await readFile(join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  const failed = roster.slice(roster.indexOf('binding.state = outcome.kind;'), roster.indexOf('this.changed.fire();', roster.indexOf('binding.state = outcome.kind;')));
  assert.match(failed, /if \(outcome\.capabilities\) this\.capabilityService\.record\(outcome\.capabilities\);/);
});
