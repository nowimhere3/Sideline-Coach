/**
 * S57.2 Commercial Foundation Batch — C0 + C1 + C2 + C3.
 *
 *   C0  durable install identity (~/.sideline/install.json)
 *   C1  capability catalogue, built-in profiles, entitlement authority, read-only gate
 *   C2  check-only gates at the verified choke points (unlimited default = zero behavior change)
 *   C3  usage store + count / minutes / ceiling meters, periods, stacking, journal
 *
 * Everything time-dependent uses an injected clock and a fixed local offset.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureInstallIdentity, parseInstallIdentity, INSTALL_IDENTITY_FILE } from '../out/control-plane/install-identity.js';
import {
  CAPABILITY_IDS,
  CAPABILITY_CATALOGUE,
  BUILT_IN_PROFILES,
  DEFAULT_PROFILE,
  EntitlementAuthority,
  FeatureGate,
  UsageStore,
  capabilitiesWithoutGrant,
  isGrantCompatible,
  periodKey,
  periodEnd,
  rollingDayKeys,
  anchoredCycle,
  fixedLocalOffset,
  planCountCharge,
  planMinuteCharge,
  emptyUsageState,
  foldReceipts,
  USAGE_STATE_FILE,
  USAGE_JOURNAL_FILE
} from '../out/commercial/index.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';
import { StadiumClient } from '../out/stadium-client.js';
import { SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player-contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `sideline-s57-2-${label}-`));
const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };

// Calgary (MDT, UTC−6) as a fixed offset so day/month boundaries are deterministic.
const CALGARY = fixedLocalOffset(-360);
const at = (iso) => Date.parse(iso);
const PLAN_WORDS = /\b(pro|free|founder|premium|tier|plan|stripe|paddle|price|pricing|sku|dad|developer)\b/i;
// The daemon binds a fixed port and walks upward on EADDRINUSE; each harness takes its own.
let nextPort = 39_760;
const port = () => { nextPort += 3; return nextPort; };

// ═════════════════════════════════════════════════════════════════════════════
// C0 — INSTALL IDENTITY
// ═════════════════════════════════════════════════════════════════════════════

test('C0-1. first run creates a valid 128-bit install identity with mode-safe contents', () => {
  const dir = scratch('c0-1');
  try {
    const result = ensureInstallIdentity(dir, { now: () => 1_790_000_000_000 });
    assert.equal(result.status, 'created');
    assert.match(result.identity.installId, /^[a-z2-7]{26}$/);
    assert.equal(result.identity.createdAt, 1_790_000_000_000);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, INSTALL_IDENTITY_FILE), 'utf8'));
    assert.deepEqual(onDisk, { v: 1, installId: result.identity.installId, createdAt: 1_790_000_000_000 });
    assert.deepEqual(fs.readdirSync(dir), [INSTALL_IDENTITY_FILE], 'no temp files left behind');
  } finally { rm(dir); }
});

test('C0-2. restart preserves the exact identity (loaded, never rewritten)', () => {
  const dir = scratch('c0-2');
  try {
    const first = ensureInstallIdentity(dir);
    const bytes = fs.readFileSync(path.join(dir, INSTALL_IDENTITY_FILE), 'utf8');
    const second = ensureInstallIdentity(dir, { now: () => 42 });
    assert.equal(second.status, 'loaded');
    assert.deepEqual(second.identity, first.identity);
    assert.equal(fs.readFileSync(path.join(dir, INSTALL_IDENTITY_FILE), 'utf8'), bytes, 'file untouched');
  } finally { rm(dir); }
});

test('C0-3a. a concurrent winner is loaded, not overwritten (deterministic EEXIST race)', () => {
  const dir = scratch('c0-3a');
  try {
    const winner = { v: 1, installId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa', createdAt: 1 };
    let injected = false;
    const result = ensureInstallIdentity(dir, {
      randomBytes: (size) => {
        // Another process publishes its identity between our read and our link.
        if (!injected) { injected = true; fs.writeFileSync(path.join(dir, INSTALL_IDENTITY_FILE), JSON.stringify(winner)); }
        return Buffer.alloc(size, 7);
      }
    });
    assert.equal(result.status, 'loaded');
    assert.deepEqual(result.identity, winner);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, INSTALL_IDENTITY_FILE), 'utf8')), winner);
  } finally { rm(dir); }
});

test('C0-3b. eight simultaneous processes converge on exactly one identity', async () => {
  const dir = scratch('c0-3b');
  const modulePath = path.join(here, '..', 'out', 'control-plane', 'install-identity.js').replace(/\\/g, '/');
  const script = `const m = require(${JSON.stringify(modulePath)}); process.stdout.write(m.ensureInstallIdentity(process.argv[1]).identity.installId);`;
  try {
    const ids = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('exit', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    })));
    assert.equal(new Set(ids).size, 1, `all processes agree: ${ids.join(',')}`);
    assert.equal(parseInstallIdentity(fs.readFileSync(path.join(dir, INSTALL_IDENTITY_FILE), 'utf8')).installId, ids[0]);
    assert.deepEqual(fs.readdirSync(dir), [INSTALL_IDENTITY_FILE], 'no temp files survive the race');
  } finally { rm(dir); }
});

test('C0-4. malformed or foreign identity files are quarantined deterministically, never silently overwritten', () => {
  for (const [label, content] of [['garbage', '{not json'], ['bad-id', JSON.stringify({ v: 1, installId: 'NOT-VALID', createdAt: 1 })], ['bad-version', JSON.stringify({ v: 2, installId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa', createdAt: 1 })], ['empty', '']]) {
    const dir = scratch(`c0-4-${label}`);
    try {
      fs.writeFileSync(path.join(dir, INSTALL_IDENTITY_FILE), content);
      const result = ensureInstallIdentity(dir);
      assert.equal(result.status, 'recovered', label);
      assert.ok(result.quarantined, label);
      assert.equal(fs.readFileSync(path.join(dir, result.quarantined), 'utf8'), content, `${label}: original bytes preserved aside`);
      assert.match(result.identity.installId, /^[a-z2-7]{26}$/);
      const again = ensureInstallIdentity(dir);
      assert.equal(again.status, 'loaded', label);
      assert.equal(again.identity.installId, result.identity.installId, `${label}: stable after recovery`);
    } finally { rm(dir); }
  }
});

test('C0-5/6. a daemon with Remote disabled still gets the identity; nothing exposes or depends on it', async () => {
  const dir = scratch('c0-5');
  const daemon = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 60_000 });
  try {
    assert.equal(daemon.getInstallIdentity(), undefined, 'created at start(), not construction');
    await daemon.start();
    const identity = daemon.getInstallIdentity();
    assert.ok(identity);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, INSTALL_IDENTITY_FILE), 'utf8')), identity);
    assert.equal(fs.existsSync(path.join(dir, 'remote', 'host-key.json')), false, 'Remote host identity is not required or created');
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    for (const route of ['/api/health', '/api/status']) {
      const text = await (await fetch(`http://127.0.0.1:${daemon.port}${route}`, { headers: { Authorization: `Bearer ${token}` } })).text();
      assert.equal(text.includes(identity.installId), false, `${route} never carries the install id`);
    }
  } finally {
    await daemon.stop();
    rm(dir);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// C1 — COMMERCIAL CORE
// ═════════════════════════════════════════════════════════════════════════════

test('C1-1. CI guard: every CapabilityId has a grant in the unlimited profile', () => {
  assert.deepEqual(capabilitiesWithoutGrant(BUILT_IN_PROFILES.unlimited), [], 'add an unlimited grant for every new capability');
  assert.deepEqual([...CAPABILITY_CATALOGUE.keys()].sort(), [...CAPABILITY_IDS].sort(), 'catalogue and id list agree');
  for (const profile of Object.values(BUILT_IN_PROFILES)) {
    for (const grant of profile.grants) assert.equal(isGrantCompatible(grant), true, `${profile.id}:${grant.capability}`);
  }
});

test('C1-2. the default profile is unlimited and every capability is entitled without limit', () => {
  assert.equal(DEFAULT_PROFILE, 'unlimited');
  const snapshot = new EntitlementAuthority().snapshot(at('2026-10-01T12:00:00Z'));
  assert.equal(snapshot.profileLabel, 'Full access');
  assert.equal(snapshot.authority, 'built-in');
  for (const id of CAPABILITY_IDS) {
    assert.equal(snapshot.capabilities[id].entitled, true, id);
    assert.equal(snapshot.capabilities[id].unlimited, true, id);
  }
  const gate = new FeatureGate(new EntitlementAuthority(), { onUnknownCapability: 'throw' });
  for (const id of CAPABILITY_IDS) assert.equal(gate.check(id).allowed, true, id);
});

test('C1-3. facets inherit the parent grant unless they carry their own', () => {
  const profile = (grants) => ({ id: 'test', label: 'Test', grants });
  const parentOnly = new EntitlementAuthority({ profile: profile([{ grantId: 'g1', capability: 'routing.intelligent', allowance: { kind: 'enabled' }, source: 'override' }]) });
  assert.equal(parentOnly.capabilityState('routing.intelligent.economics').entitled, true, 'inherits parent');
  assert.equal(parentOnly.capabilityState('routing.intelligent.nextBest').entitled, true);

  const facetOnly = new EntitlementAuthority({ profile: profile([{ grantId: 'g2', capability: 'routing.intelligent.nextBest', allowance: { kind: 'enabled' }, source: 'promo' }]) });
  assert.equal(facetOnly.capabilityState('routing.intelligent.nextBest').entitled, true, 'own grant');
  assert.equal(facetOnly.capabilityState('routing.intelligent.economics').entitled, false, 'sibling facet not granted');
  assert.equal(facetOnly.capabilityState('routing.intelligent').entitled, false, 'a facet never grants its parent');

  const expired = new EntitlementAuthority({
    now: () => 2_000,
    profile: profile([
      { grantId: 'parent', capability: 'routing.intelligent', allowance: { kind: 'enabled' }, source: 'override' },
      { grantId: 'facet-expired', capability: 'routing.intelligent.economics', allowance: { kind: 'enabled' }, validUntil: 1_000, source: 'promo' }
    ])
  });
  assert.equal(expired.capabilityState('routing.intelligent.economics').entitled, true, 'an expired own grant falls back to the parent');
});

test('C1-4. unknown capability ids throw in tests and allow-with-warning in production', () => {
  const strict = new FeatureGate(new EntitlementAuthority(), { onUnknownCapability: 'throw' });
  assert.throws(() => strict.check('mystery.feature'), /Unknown capability/);
  const warnings = [];
  const lenient = new FeatureGate(new EntitlementAuthority({ profile: 'core' }), { warn: (message) => warnings.push(message) });
  const decision = lenient.check('mystery.feature');
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'unknown-capability');
  assert.equal(warnings.length, 1);
});

test('C1-5. reserved capabilities are defined for packaging, flagged reserved, and never gate anything yet', () => {
  const reserved = [...CAPABILITY_CATALOGUE.values()].filter((definition) => definition.reserved).map((definition) => definition.id).sort();
  assert.deepEqual(reserved, [
    'alerts.advanced', 'autofill', 'routing.autonomous', 'routing.intelligent', 'routing.intelligent.confidence',
    'routing.intelligent.economics', 'routing.intelligent.nextBest', 'routing.intelligent.scorecards', 'routing.schedule',
    'scout.formation.wide', 'wires'
  ]);
  const core = new FeatureGate(new EntitlementAuthority({ profile: 'core' }), { onUnknownCapability: 'throw' });
  for (const id of reserved) {
    const decision = core.check(id);
    assert.equal(decision.allowed, true, id);
    assert.equal(decision.reason, 'reserved', id);
    assert.equal(decision.state.reserved, true, id);
    assert.equal(decision.state.entitled, false, `${id}: the snapshot still tells the truth about grants`);
  }
  for (const id of ['games.active', 'remote.access', 'scout.play', 'scout.maintenance', 'routines']) {
    assert.equal(CAPABILITY_CATALOGUE.get(id).reserved, undefined, `${id} is a verified gate point`);
  }
});

test('C1-6. denials name the capability, never a plan, price, billing provider or person', () => {
  const core = new FeatureGate(new EntitlementAuthority({ profile: 'core' }), { onUnknownCapability: 'throw' });
  for (const id of ['remote.access', 'scout.play', 'scout.maintenance']) {
    const decision = core.check(id);
    assert.equal(decision.allowed, false, id);
    assert.equal(decision.reason, 'not-entitled');
    assert.ok(decision.dadMessage.startsWith(CAPABILITY_CATALOGUE.get(id).dadName), decision.dadMessage);
    assert.doesNotMatch(decision.dadMessage, PLAN_WORDS);
  }
  for (const definition of CAPABILITY_CATALOGUE.values()) assert.doesNotMatch(definition.dadName, PLAN_WORDS, definition.id);
  assert.equal(core.check('games.active').allowed, true, 'the core architecture profile keeps Games usable');
  assert.equal(core.check('routines').allowed, true);
});

test('C1-7. commercial modules contain no billing, plan or person branching', () => {
  const dir = path.join(here, '..', 'src', 'commercial');
  for (const file of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(stripe|paddle|app ?store|google ?play|sku|devMode|isDad|founder)\b/i, file);
    assert.doesNotMatch(code, /===\s*['"](pro|free|founder|premium)['"]/i, file);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// C2 — CHECK-ONLY GATES
// ═════════════════════════════════════════════════════════════════════════════

const NOTHING = { id: 'nothing', label: 'Nothing', grants: [] };
const GS3 = { gameId: 'game_s57_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' };
const GALLERY = { gameId: 'game_s57_gallery', displayName: 'Gallery', fingerprintSource: 'git-remote' };

async function daemonHarness(profile, { stadium = false } = {}) {
  const dir = scratch('c2');
  const daemon = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 120_000, ...(profile ? { entitlements: { profile } } : {}) });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const calls = { pick: 0 };
  let client;
  if (stadium) {
    client = new StadiumClient({
      port: daemon.port, dir, token, instanceId: 'inst_s57', autoReconnect: false,
      gameContextGetter: () => ({
        game: GS3,
        stadium: { stadiumId: 'stadium_s57', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
        binding: { gameId: GS3.gameId, stadiumId: 'stadium_s57', rootFsPath: 'C:\\repos\\GS3', boundAt: Date.now(), isPrimary: true, status: 'bound' }
      }),
      pickGame: async () => { calls.pick++; return { success: true, folderPath: 'C:\\repos\\Gallery', game: GALLERY }; },
      openGame: async () => ({ success: true, outcome: 'opened', message: 'Opening' })
    });
    assert.equal(await client.connect(), true);
  }
  const api = async (pathname, init = {}) => {
    const res = await fetch(`http://127.0.0.1:${daemon.port}${pathname}`, {
      method: 'POST', body: '{}', ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  };
  const stop = async () => { client?.dispose(); await daemon.stop(); rm(dir); };
  return { daemon, dir, token, api, calls, stop };
}

async function remoteGet(daemon, pathname) {
  const adapter = new InProcessRemoteAdapter({ daemon, deviceRegistry: daemon.deviceRegistry, expectedOrigin: 'https://h-test.localhost' });
  const { rawToken } = daemon.deviceRegistry.createDevice('S57 phone');
  const frames = [];
  await adapter.dispatch({ id: `req-${pathname}`, method: 'GET', path: pathname, headers: { cookie: `sl_dev=${rawToken}`, accept: 'application/json' } }, (frame) => frames.push(frame));
  const head = frames.find((frame) => frame.t === 'head');
  const body = frames.filter((frame) => frame.t === 'data').map((frame) => frame.chunk ?? '').join('');
  return { status: head?.status, body };
}

test('C2-0. unlimited default: status projects Full access and every capability is allowed', async () => {
  const h = await daemonHarness();
  try {
    const status = (await h.api('/api/status', { method: 'GET', body: undefined })).body;
    assert.equal(status.entitlements.profileLabel, 'Full access');
    for (const id of CAPABILITY_IDS) assert.equal(status.entitlements.capabilities[id].unlimited, true, id);
    assert.doesNotMatch(JSON.stringify(status.entitlements), PLAN_WORDS);
  } finally { await h.stop(); }
});

test('C2-1/2/3. remote.access gates the tunnel, QR pairing and every non-public remote request — only when not entitled', async () => {
  for (const [label, profile, allowed] of [['unlimited', undefined, true], ['core', 'core', false]]) {
    const h = await daemonHarness(profile);
    try {
      // 2. Pairing QR on the desktop.
      const pairing = await h.api('/api/pairing/create');
      if (allowed) {
        assert.equal(pairing.status, 200, label);
        assert.equal(pairing.body.success, true, label);
      } else {
        assert.equal(pairing.status, 403, label);
        assert.equal(pairing.body.code, 'capability-unavailable');
        assert.equal(pairing.body.capability, 'remote.access');
        assert.match(pairing.body.message, /^Mobile Remote: not included/);
        assert.equal(fs.existsSync(path.join(h.dir, 'remote', 'host-key.json')), false, 'denied before any pairing/identity work');
      }
      // 3. Remote requests: public bootstrap untouched; everything else gated.
      const health = await remoteGet(h.daemon, '/api/health');
      assert.equal(health.status, 200, `${label}: public health stays public`);
      const status = await remoteGet(h.daemon, '/api/status');
      assert.equal(status.status, allowed ? 200 : 403, `${label}: remote status`);
      if (!allowed) assert.equal(JSON.parse(status.body).capability, 'remote.access');
    } finally { await h.stop(); }
  }
});

test('C2-1b. syncRelayClient never opens a tunnel when remote.access is not entitled', async () => {
  const dir = scratch('c2-relay');
  const logs = [];
  const daemon = new ControlPlaneDaemon({
    dir, port: port(), idleTimeoutMs: 60_000, entitlements: { profile: 'core' },
    remoteRelay: { relayUrl: 'ws://127.0.0.1:9/tunnel/v1', relayDomain: 'localhost' }
  });
  const originalLog = daemon.log.bind(daemon);
  daemon.log = (message) => { logs.push(message); originalLog(message); };
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const res = await fetch(`http://127.0.0.1:${daemon.port}/api/preferences`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ remoteAccess: { enabled: true } })
    });
    assert.equal(res.status, 200, 'the preference itself is still saved');
    await daemon.relaySync;
    assert.equal(daemon.relayClient, undefined, 'no RelayClient, no socket');
    assert.ok(logs.some((line) => /Remote Access not started: Mobile Remote: not included/.test(line)));
  } finally {
    await daemon.stop();
    rm(dir);
  }
});

test('C2-4. the AUTO candidate enricher removes a non-entitled Scout; unlimited keeps AUTO identical', async () => {
  const claude = {
    instanceId: 'claude-11111111', playerType: 'claude', transport: 'controlled', fieldLabel: 'Claude', state: 'ready',
    capability: { provider: 'claude', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'opus', models: [{ id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }] }
  };
  const scout = {
    instanceId: SCOUT_PLAYER_INSTANCE_ID, playerType: 'scout', transport: 'controlled', fieldLabel: 'Scout', state: 'ready',
    capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'live' },
    executionType: 'scout-formation', autoEligible: false, supportsQueue: false
  };
  const prompt = 'Scout this play, investigate whether the parser is safe.';
  for (const [label, profile] of [['unlimited', undefined], ['core', 'core']]) {
    const h = await daemonHarness(profile);
    try {
      // The exact seam AUTO and the staged preview share.
      const enriched = h.daemon.router.candidateEnricher('game_s57_auto', [claude, scout]);
      if (label === 'unlimited') {
        assert.deepEqual(enriched, [claude, scout], 'identical candidates (no ledger entries to layer)');
      } else {
        assert.deepEqual(enriched.map((candidate) => candidate.instanceId), [claude.instanceId], 'Scout is not an AUTO candidate');
        const result = h.daemon.router.computeRoute('game_s57_auto', prompt, [claude, scout]);
        assert.notEqual(result.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, 'even an explicit directive cannot stage Scout');
      }
    } finally { await h.stop(); }
  }
});

test('C2-5. router.dispatch refuses explicit and AUTO-resolved Scout before anything reaches the Stadium', async () => {
  const GAME = 'game_s57_router';
  const scout = {
    instanceId: SCOUT_PLAYER_INSTANCE_ID, playerType: 'scout', transport: 'controlled', fieldLabel: 'Scout', state: 'ready',
    capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'live' },
    executionType: 'scout-formation', autoEligible: false, supportsQueue: false
  };
  const harness = (gate) => {
    const frames = [];
    const registry = new StadiumRegistry();
    registry.registerSession({
      instanceId: 'stadium-session', stadiumId: 'stadium', name: 'Test', platform: 'win32',
      socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
      game: { gameId: GAME, displayName: 'S57 Game', fingerprintSource: 'test' }, rootFsPath: 'C:/S57Game',
      roster: [], capabilities: [scout], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
    });
    const router = new ControlPlaneRouter(registry);
    if (gate) router.setFeatureGate(gate);
    return { router, frames };
  };
  const coreGate = new FeatureGate(new EntitlementAuthority({ profile: 'core' }));
  for (const options of [
    { routingMode: 'manual', playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, prompt: 'Investigate the parser.' },
    { routingMode: 'auto', prompt: 'Scout this play, investigate the parser.' }
  ]) {
    const { router, frames } = harness(coreGate);
    const result = await router.dispatch({ gameId: GAME, ...options });
    assert.equal(result.success, false, options.routingMode);
    assert.equal(result.statusCode, 403, options.routingMode);
    assert.match(result.message, /^Scout Plays: not included/);
    assert.equal(frames.length, 0, `${options.routingMode}: nothing dispatched`);
  }
  // Unlimited (or no gate at all): the explicit Scout path reaches the Stadium exactly as before.
  for (const gate of [new FeatureGate(new EntitlementAuthority()), undefined]) {
    const { router, frames } = harness(gate);
    const pending = router.dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, prompt: 'Investigate the parser.' });
    await new Promise((resolve) => setImmediate(resolve));
    const frame = frames.find((entry) => entry.method === 'dispatch.request');
    assert.ok(frame, 'dispatched to the Stadium');
    router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium', gameId: GAME, playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, turnRef: 'turn', acceptedAt: Date.now() });
    assert.equal((await pending).success, true);
  }
});

test('C2-6/7. Scout Formation runs and Scout bench refresh are gated before any Stadium RPC; reads stay open', async () => {
  for (const [label, profile] of [['unlimited', undefined], ['core', 'core']]) {
    // Dev Mode is saved per known Game, so a connected Stadium supplies one.
    const h = await daemonHarness(profile, { stadium: true });
    try {
      assert.equal((await h.api('/api/preferences', { body: JSON.stringify({ gameId: GS3.gameId, devMode: true }) })).status, 200);
      const run = await h.api('/api/scout/formation-run', { body: JSON.stringify({}) });
      const refresh = await h.api('/api/scout/bootstrap', { body: JSON.stringify({ gameId: 'game_absent', action: 'refresh' }) });
      const authorize = await h.api('/api/scout/bootstrap', { body: JSON.stringify({ gameId: 'game_absent', action: 'authorize' }) });
      const statusRead = await h.api('/api/scout/bootstrap', { body: JSON.stringify({ gameId: 'game_absent', action: 'status' }) });
      const decline = await h.api('/api/scout/bootstrap', { body: JSON.stringify({ gameId: 'game_absent', action: 'decline' }) });
      const receivers = await h.api('/api/scout/formation-receivers?gameId=game_absent', { method: 'GET', body: undefined });
      if (label === 'unlimited') {
        assert.equal(run.status, 400, 'existing validation answers first (Missing gameId)');
        for (const res of [refresh, authorize]) assert.notEqual(res.body.code, 'capability-unavailable');
      } else {
        assert.equal(run.status, 403);
        assert.equal(run.body.capability, 'scout.play');
        for (const res of [refresh, authorize]) {
          assert.equal(res.status, 403);
          assert.equal(res.body.capability, 'scout.maintenance');
        }
      }
      for (const res of [statusRead, decline, receivers]) assert.notEqual(res.body?.code, 'capability-unavailable', `${label}: reads stay ungated`);
    } finally { await h.stop(); }
  }
});

test('C2-8/9. routine creation, Add Game and dispatch are gated only when the capability is absent', async () => {
  const unlimited = await daemonHarness(undefined, { stadium: true });
  try {
    const created = await unlimited.api('/api/routines', { body: JSON.stringify({ gameId: GS3.gameId, name: 'Refresh', template: 'custom', instruction: 'Refresh the map.', cadence: { kind: 'plays', every: 3 } }) });
    assert.notEqual(created.status, 403, 'unlimited never refuses routines');
    const added = await unlimited.api('/api/game/add');
    assert.equal(added.status, 200);
    assert.notEqual(added.body.status, 'capability-unavailable');
  } finally { await unlimited.stop(); }

  const nothing = await daemonHarness(NOTHING, { stadium: true });
  try {
    const created = await nothing.api('/api/routines', { body: JSON.stringify({ gameId: GS3.gameId, name: 'Refresh', template: 'custom', instruction: 'Refresh the map.', cadence: { kind: 'plays', every: 3 } }) });
    assert.equal(created.status, 403);
    assert.equal(created.body.capability, 'routines');
    const routines = await nothing.api(`/api/routines?gameId=${GS3.gameId}`, { method: 'GET', body: undefined });
    assert.equal(routines.body.definitions.length, 0, 'nothing was created');

    const added = await nothing.api('/api/game/add');
    assert.equal(added.status, 403);
    assert.equal(added.body.capability, 'games.active');
    assert.equal(nothing.calls.pick, 0, 'C5 (Q5): refused before the picker opens');
    const games = (await nothing.api('/api/status', { method: 'GET', body: undefined })).body.games.map((game) => game.gameId);
    assert.equal(games.includes(GALLERY.gameId), false, 'the refused Game was not registered');

    const dispatched = await nothing.api('/api/dispatch', { body: JSON.stringify({ gameId: GS3.gameId, prompt: 'Run the tests.' }) });
    assert.equal(dispatched.status, 403);
    assert.match(dispatched.body.message ?? '', /^Active Games: /);
  } finally { await nothing.stop(); }
});

// ═════════════════════════════════════════════════════════════════════════════
// C3 — USAGE STORE + METERS
// ═════════════════════════════════════════════════════════════════════════════

const quota = (grantId, capability, limit, period, extra = {}) => ({ grantId, capability, allowance: { kind: 'quota', limit, period }, source: 'override', ...extra });

function meterRig(grants, { start = at('2026-10-15T18:00:00Z'), dir = scratch('c3'), journalMaxBytes } = {}) {
  let now = start;
  const clock = () => now;
  const store = new UsageStore({ dir, now: clock, ...(journalMaxBytes ? { journalMaxBytes } : {}) });
  const authority = new EntitlementAuthority({ profile: { id: 'test', label: 'Test', grants }, usage: store, now: clock, localOffset: CALGARY });
  const gate = new FeatureGate(authority, { usage: store, onUnknownCapability: 'throw' });
  return { store, authority, gate, dir, setNow: (value) => { now = typeof value === 'string' ? at(value) : value; }, cleanup: () => rm(dir) };
}

test('C3-1. count charge is idempotent; release is idempotent; a released key may be charged again', () => {
  const rig = meterRig([quota('base', 'scout.play', 5, { kind: 'lifetime' })]);
  try {
    assert.equal(rig.gate.charge('scout.play', 'scout.play:ref-1').allowed, true);
    assert.equal(rig.gate.charge('scout.play', 'scout.play:ref-1').allowed, true, 'duplicate is allowed');
    assert.equal(rig.authority.capabilityState('scout.play').used, 1, 'but charged once');
    rig.gate.release('scout.play', 'scout.play:ref-1');
    rig.gate.release('scout.play', 'scout.play:ref-1');
    assert.equal(rig.authority.capabilityState('scout.play').used, 0, 'released once');
    rig.gate.charge('scout.play', 'scout.play:ref-1');
    assert.equal(rig.authority.capabilityState('scout.play').used, 1, 're-charge after release');
    assert.equal(rig.store.journal().length, 3, 'charge, release, charge — duplicates wrote nothing');
  } finally { rig.cleanup(); }
});

test('C3-2. lifetime quota never resets and exhausts with a no-date message', () => {
  const rig = meterRig([quota('trial', 'scout.play', 2, { kind: 'lifetime' })]);
  try {
    rig.gate.charge('scout.play', 'a');
    rig.setNow('2027-06-01T00:00:00Z');
    rig.gate.charge('scout.play', 'b');
    const denied = rig.gate.charge('scout.play', 'c');
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'allowance-exhausted');
    assert.equal(denied.state.resetsAt, undefined);
    assert.equal(denied.dadMessage, 'Scout Plays: allowance used up.');
    assert.equal(rig.gate.check('scout.play').allowed, false);
  } finally { rig.cleanup(); }
});

test('C3-3. daily boundary follows local (Calgary) midnight', () => {
  const period = { kind: 'daily' };
  assert.equal(periodKey(period, at('2026-10-16T05:59:00Z'), CALGARY), 'd2026-10-15', '23:59 MDT is still Oct 15');
  assert.equal(periodKey(period, at('2026-10-16T06:00:00Z'), CALGARY), 'd2026-10-16');
  assert.equal(periodEnd(period, at('2026-10-15T20:00:00Z'), CALGARY), at('2026-10-16T06:00:00Z'));
  const rig = meterRig([quota('day', 'scout.play', 1, period)], { start: at('2026-10-16T05:59:00Z') });
  try {
    assert.equal(rig.gate.charge('scout.play', 'late').allowed, true);
    assert.equal(rig.gate.charge('scout.play', 'later').allowed, false, 'same local day');
    rig.setNow('2026-10-16T06:00:00Z');
    assert.equal(rig.gate.charge('scout.play', 'next-day').allowed, true, 'new local day');
  } finally { rig.cleanup(); }
});

test('C3-4. calendar monthly boundary follows the local month', () => {
  const period = { kind: 'monthly', anchor: 'calendar' };
  assert.equal(periodKey(period, at('2026-11-01T05:59:59Z'), CALGARY), '2026-10', 'Oct 31 23:59 MDT');
  assert.equal(periodKey(period, at('2026-11-01T06:00:00Z'), CALGARY), '2026-11');
  assert.equal(periodEnd(period, at('2026-10-15T12:00:00Z'), CALGARY), at('2026-11-01T06:00:00Z'));
  const rig = meterRig([quota('month', 'scout.play', 1, period)], { start: at('2026-11-01T05:00:00Z') });
  try {
    assert.equal(rig.gate.charge('scout.play', 'oct').allowed, true);
    assert.equal(rig.gate.check('scout.play').allowed, false);
    rig.setNow('2026-11-01T06:00:00Z');
    assert.equal(rig.gate.charge('scout.play', 'nov').allowed, true);
  } finally { rig.cleanup(); }
});

test('C3-5. anchored monthly cycles clamp to month length and reset at the anchor time', () => {
  const anchor = at('2026-01-31T15:00:00Z');
  const period = { kind: 'monthly', anchor };
  assert.equal(anchoredCycle(anchor, at('2026-02-28T14:59:59Z')), 0);
  assert.equal(anchoredCycle(anchor, at('2026-02-28T15:00:00Z')), 1, 'Feb has no 31st: clamps to the 28th');
  assert.equal(periodEnd(period, at('2026-02-10T00:00:00Z')), at('2026-02-28T15:00:00Z'));
  assert.equal(periodEnd(period, at('2026-03-01T00:00:00Z')), at('2026-03-31T15:00:00Z'));
  assert.equal(periodKey(period, at('2026-04-30T15:00:00Z')), 'c3');
  const rig = meterRig([quota('cycle', 'scout.play', 1, period)], { start: at('2026-02-28T14:00:00Z') });
  try {
    assert.equal(rig.gate.charge('scout.play', 'a').allowed, true);
    assert.equal(rig.gate.check('scout.play').state.resetsAt, at('2026-02-28T15:00:00Z'));
    assert.equal(rig.gate.check('scout.play').allowed, false);
    rig.setNow('2026-02-28T15:00:00Z');
    assert.equal(rig.gate.check('scout.play').allowed, true, 'next billing cycle');
  } finally { rig.cleanup(); }
});

test('C3-6. rolling N-day windows sum the last N local days and free capacity as days drop out', () => {
  assert.deepEqual(rollingDayKeys(3, at('2026-10-15T18:00:00Z'), CALGARY), ['d2026-10-15', 'd2026-10-14', 'd2026-10-13']);
  const rig = meterRig([quota('roll', 'scout.play', 2, { kind: 'rolling', days: 7 })], { start: at('2026-10-01T18:00:00Z') });
  try {
    rig.gate.charge('scout.play', 'day1');
    rig.setNow('2026-10-05T18:00:00Z');
    rig.gate.charge('scout.play', 'day5');
    rig.setNow('2026-10-07T18:00:00Z');
    assert.equal(rig.gate.check('scout.play').allowed, false, 'day 7 still counts day 1 and day 5');
    assert.equal(rig.gate.check('scout.play').state.used, 2);
    rig.setNow('2026-10-08T18:00:00Z');
    assert.equal(rig.gate.check('scout.play').state.used, 1, 'day 1 dropped out on day 8');
    assert.equal(rig.gate.charge('scout.play', 'day8').allowed, true);
  } finally { rig.cleanup(); }
});

test('C3-7. unlimited dominates: never exhausts, yet usage is still recorded for later packaging', () => {
  const rig = meterRig([
    quota('tiny', 'scout.play', 1, { kind: 'lifetime' }),
    { grantId: 'unl', capability: 'scout.play', allowance: { kind: 'unlimited' }, source: 'profile' }
  ]);
  try {
    for (let index = 0; index < 25; index++) assert.equal(rig.gate.charge('scout.play', `k${index}`).allowed, true);
    const state = rig.gate.check('scout.play').state;
    assert.equal(state.unlimited, true);
    assert.equal(state.remaining, undefined);
    assert.equal(rig.store.state.buckets['scout.play'].unl.lifetime.used, 25, 'recorded under the unlimited grant');
    assert.equal(rig.store.state.buckets['scout.play'].tiny, undefined, 'the quota grant was never drawn');
    const minutes = rig.gate.chargeMinutes('remote.access', 100, 159);
    assert.equal(minutes.decision.allowed, false, 'remote.access has no grant in this rig');
  } finally { rig.cleanup(); }
});

test('C3-8. quota exhaustion math aggregates remaining across grants and dates the reset', () => {
  const rig = meterRig([quota('m', 'scout.play', 2, { kind: 'monthly', anchor: 'calendar' })], { start: at('2026-10-15T18:00:00Z') });
  try {
    assert.deepEqual(
      (({ limit, used, remaining }) => ({ limit, used, remaining }))(rig.gate.check('scout.play').state),
      { limit: 2, used: 0, remaining: 2 }
    );
    rig.gate.charge('scout.play', 'a');
    rig.gate.charge('scout.play', 'b');
    const denied = rig.gate.charge('scout.play', 'c');
    assert.equal(denied.reason, 'allowance-exhausted');
    assert.equal(denied.state.remaining, 0);
    assert.equal(denied.state.resetsAt, at('2026-11-01T06:00:00Z'));
    assert.match(denied.dadMessage, /^Scout Plays: allowance used up until Nov 1\.$/);
    assert.equal(rig.store.journal().length, 2, 'a denied charge records nothing');
    assert.throws(() => planCountCharge(emptyUsageState(), 'scout.play', 'x', 0, [], 0), /positive integer/);
  } finally { rig.cleanup(); }
});

test('C3-9. ceiling meters are sets: idempotent admission, ceiling reached, release frees a slot', () => {
  const rig = meterRig([{ grantId: 'slots', capability: 'games.active', allowance: { kind: 'ceiling', limit: 2 }, source: 'override' }]);
  try {
    assert.equal(rig.gate.charge('games.active', 'game_a').allowed, true);
    assert.equal(rig.gate.charge('games.active', 'game_b').allowed, true);
    assert.equal(rig.gate.charge('games.active', 'game_a').allowed, true, 'an admitted member is always allowed');
    const full = rig.gate.charge('games.active', 'game_c');
    assert.equal(full.allowed, false);
    assert.equal(full.reason, 'ceiling-reached');
    assert.equal(full.dadMessage, "You're using all 2 active Game slots. Archive a Game to make room.");
    assert.equal(rig.gate.check('games.active', { member: 'game_a' }).allowed, true, 'check honours membership');
    assert.equal(rig.gate.check('games.active', { member: 'game_c' }).allowed, false);
    rig.gate.release('games.active', 'game_a');
    rig.gate.release('games.active', 'game_a');
    assert.equal(rig.authority.capabilityState('games.active').used, 1);
    assert.equal(rig.gate.charge('games.active', 'game_c').allowed, true, 'the freed slot is reusable');
  } finally { rig.cleanup(); }
});

test('C3-10. stacked grants drain expiring-first (promo → monthly base → lifetime trial) and remaining aggregates', () => {
  const start = at('2026-10-15T18:00:00Z');
  const rig = meterRig([
    quota('trial', 'scout.play', 10, { kind: 'lifetime' }),
    quota('base', 'scout.play', 5, { kind: 'monthly', anchor: 'calendar' }),
    quota('promo', 'scout.play', 3, { kind: 'lifetime' }, { validUntil: start + 3 * 86_400_000, source: 'promo' })
  ], { start });
  try {
    assert.equal(rig.gate.check('scout.play').state.remaining, 18);
    for (let index = 0; index < 9; index++) rig.gate.charge('scout.play', `k${index}`);
    const buckets = rig.store.state.buckets['scout.play'];
    assert.equal(buckets.promo.lifetime.used, 3, 'promo (expires in 3 days) first');
    assert.equal(buckets.base['2026-10'].used, 5, 'then the monthly base (resets Nov 1)');
    assert.equal(buckets.trial.lifetime.used, 1, 'the lifetime trial last');
    assert.equal(rig.gate.check('scout.play').state.remaining, 9);
    rig.setNow(start + 4 * 86_400_000);
    assert.equal(rig.gate.check('scout.play').state.limit, 15, 'an expired promo drops out of the aggregate');
    // A multi-unit charge may span grants and releases exactly what it took.
    rig.setNow('2026-11-02T18:00:00Z');
    rig.gate.charge('scout.play', 'bulk', 7);
    assert.equal(rig.store.state.buckets['scout.play'].base['2026-11'].used, 5);
    assert.equal(rig.store.state.buckets['scout.play'].trial.lifetime.used, 3);
    rig.gate.release('scout.play', 'bulk');
    assert.equal(rig.store.state.buckets['scout.play'].base['2026-11'].used, 0);
    assert.equal(rig.store.state.buckets['scout.play'].trial.lifetime.used, 1);
  } finally { rig.cleanup(); }
});

test('C3-11. minutes are a set: re-charging and overlapping ranges never double count; exhaustion is reported', () => {
  const start = at('2026-10-15T18:00:00Z');
  const minute = Math.floor(start / 60_000);
  const rig = meterRig([quota('mins', 'remote.access', 30, { kind: 'monthly', anchor: 'calendar' })], { start });
  try {
    assert.equal(rig.gate.chargeMinutes('remote.access', minute, minute + 9).charged, 10);
    const again = rig.gate.chargeMinutes('remote.access', minute + 5, minute + 14);
    assert.deepEqual({ charged: again.charged, duplicate: again.duplicate }, { charged: 5, duplicate: 5 });
    assert.equal(rig.authority.capabilityState('remote.access').used, 15);
    assert.deepEqual(rig.store.state.minuteSets['remote.access'], [[minute, minute + 14]], 'merged interval');
    const over = rig.gate.chargeMinutes('remote.access', minute + 15, minute + 34);
    assert.deepEqual({ charged: over.charged, exhausted: over.exhausted }, { charged: 15, exhausted: 5 });
    assert.equal(over.decision.allowed, false);
    assert.throws(() => planMinuteCharge(emptyUsageState(), 'remote.access', 10, 5, [], 0), /Invalid minute range/);
    assert.throws(() => rig.gate.charge('remote.access', 'nope'), /chargeMinutes/);
  } finally { rig.cleanup(); }
});

test('C3-12. a crash between journal append and state save is repaired by replay at next load', () => {
  const dir = scratch('c3-replay');
  try {
    const grants = [quota('base', 'scout.play', 5, { kind: 'lifetime' })];
    const rig = meterRig(grants, { dir });
    rig.gate.charge('scout.play', 'a');
    const savedState = fs.readFileSync(path.join(dir, USAGE_STATE_FILE), 'utf8');
    rig.gate.charge('scout.play', 'b');
    fs.writeFileSync(path.join(dir, USAGE_STATE_FILE), savedState, 'utf8'); // simulate: state save for 'b' never happened
    const reopened = new UsageStore({ dir });
    assert.equal(reopened.loadStatus, 'replayed');
    assert.equal(reopened.state.buckets['scout.play'].base.lifetime.used, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, USAGE_STATE_FILE), 'utf8')).seq, 2, 'fast path rewritten after replay');
    assert.equal(new UsageStore({ dir }).loadStatus, 'loaded');
  } finally { rm(dir); }
});

test('C3-13. a corrupt fast path is rebuilt from the journal; torn and duplicated journal lines never double-charge', () => {
  const dir = scratch('c3-rebuild');
  try {
    const grants = [quota('base', 'scout.play', 10, { kind: 'lifetime' }), { grantId: 'slots', capability: 'games.active', allowance: { kind: 'ceiling', limit: 3 }, source: 'override' }];
    const rig = meterRig(grants, { dir });
    rig.gate.charge('scout.play', 'a');
    rig.gate.charge('scout.play', 'b');
    rig.gate.release('scout.play', 'a');
    rig.gate.charge('games.active', 'game_x');
    rig.gate.chargeMinutes('remote.access', 1000, 1004); // not granted: records nothing
    const expected = JSON.parse(JSON.stringify(rig.store.state));

    const journalFile = path.join(dir, USAGE_JOURNAL_FILE);
    const lines = fs.readFileSync(journalFile, 'utf8').trim().split('\n');
    fs.appendFileSync(journalFile, `${lines[1]}\n${lines[1]}\n{"seq": 99, "id": "torn`); // duplicate receipts + torn tail
    fs.writeFileSync(path.join(dir, USAGE_STATE_FILE), '{corrupt', 'utf8');

    const rebuilt = new UsageStore({ dir });
    assert.equal(rebuilt.loadStatus, 'rebuilt');
    assert.deepEqual(rebuilt.state, expected, 'identical to the pre-crash state');
    assert.equal(rebuilt.state.buckets['scout.play'].base.lifetime.used, 1);
    assert.deepEqual(foldReceipts([...rebuilt.journal(), ...rebuilt.journal()]), expected, 'folding the same receipts twice is idempotent');

    fs.rmSync(path.join(dir, USAGE_STATE_FILE));
    assert.deepEqual(new UsageStore({ dir }).state, expected, 'missing fast path rebuilds too');
  } finally { rm(dir); }
});

test('C3-14. the journal rotates at its size bound, keeps three generations, and rebuild spans them', () => {
  const dir = scratch('c3-rotate');
  try {
    const rig = meterRig([quota('base', 'scout.play', 1000, { kind: 'lifetime' })], { dir, journalMaxBytes: 400 });
    for (let index = 0; index < 40; index++) rig.gate.charge('scout.play', `key-${index}`);
    const files = fs.readdirSync(dir).filter((name) => name.startsWith(USAGE_JOURNAL_FILE)).sort();
    assert.deepEqual(files, [USAGE_JOURNAL_FILE, `${USAGE_JOURNAL_FILE}.1`, `${USAGE_JOURNAL_FILE}.2`, `${USAGE_JOURNAL_FILE}.3`]);
    assert.equal(new UsageStore({ dir }).state.buckets['scout.play'].base.lifetime.used, 40, 'fast path is authoritative');
    fs.rmSync(path.join(dir, USAGE_STATE_FILE));
    const rebuilt = new UsageStore({ dir });
    assert.equal(rebuilt.loadStatus, 'rebuilt');
    const used = rebuilt.state.buckets['scout.play'].base.lifetime.used;
    assert.ok(used > 0 && used <= 40, `rotated-away history under-counts (${used}), never over-counts`);
  } finally { rm(dir); }
});

test('C3-15. a store that cannot write never blocks the feature: the use is allowed and simply not recorded', () => {
  const dir = scratch('c3-unwritable');
  try {
    const rig = meterRig([quota('base', 'scout.play', 5, { kind: 'lifetime' })], { dir });
    const warnings = [];
    const gate = new FeatureGate(rig.authority, { usage: { get state() { return rig.store.state; }, commit() { throw new Error('disk full'); } }, warn: (message) => warnings.push(message) });
    assert.equal(gate.charge('scout.play', 'a').allowed, true);
    assert.equal(rig.authority.capabilityState('scout.play').used, 0, 'under-counts rather than blocks');
    assert.match(warnings[0], /disk full/);
  } finally { rm(dir); }
});

test('C3-16. meters are not wired into the daemon yet: an unlimited daemon creates no usage files', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/pairing/create');
    assert.equal(fs.existsSync(path.join(h.dir, 'entitlement')), false);
  } finally { await h.stop(); }
});
