import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ControlPlaneDaemon, resolveRemoteRelayBootstrap } from '../out/control-plane/daemon.js';
import { ensureControlPlaneRunning, isProcessAlive } from '../out/control-plane/launcher.js';
import {
  MACHINE_ENROLLMENT_RELATIVE_PATH,
  PRODUCT_RELAY_DOMAIN,
  PRODUCT_RELAY_URL,
  productRemoteRelayBootstrap
} from '../out/control-plane/remote-bootstrap.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../out/running-players.js';
import { listZipEntries } from '../tools/dev/zip-entries.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remoteVariables = ['SIDELINE_RELAY_URL', 'SIDELINE_RELAY_DOMAIN', 'SIDELINE_ENROLLMENT_KEY'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (fn, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(25);
  }
  return Boolean(await fn());
};
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra5p-'));
const bearer = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const writeMachineCredential = (dir, enrollmentKey, mode = 0o600) => {
  const file = path.join(dir, MACHINE_ENROLLMENT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, enrollmentKey }), { mode });
  return file;
};

const withoutRemoteEnvironment = async (fn) => {
  const saved = Object.fromEntries(remoteVariables.map((name) => [name, process.env[name]]));
  for (const name of remoteVariables) delete process.env[name];
  try { return await fn(); }
  finally {
    for (const name of remoteVariables) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
};

const deadPort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

test('RA5P-1. zero Remote Access environment resolves authoritative production relay defaults', async () => {
  const dir = tempDir();
  try {
    await withoutRemoteEnvironment(async () => {
      const result = resolveRemoteRelayBootstrap(process.env, dir);
      assert.equal(result.source, 'product-defaults');
      assert.deepEqual(result.problems, []);
      assert.deepEqual(result.config, { relayUrl: PRODUCT_RELAY_URL, relayDomain: PRODUCT_RELAY_DOMAIN });
      assert.equal(PRODUCT_RELAY_URL, 'wss://relay.remote.mysidelinecoach.com/tunnel/v1');
      assert.equal(PRODUCT_RELAY_DOMAIN, 'remote.mysidelinecoach.com');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('RA5P-2. a complete explicit development override supersedes product defaults and machine provisioning', () => {
  const dir = tempDir();
  const machineKey = crypto.randomBytes(24).toString('base64url');
  const overrideKey = crypto.randomBytes(24).toString('base64url');
  try {
    writeMachineCredential(dir, machineKey);
    const result = resolveRemoteRelayBootstrap({
      SIDELINE_RELAY_URL: 'ws://127.0.0.1:48999/tunnel/v1',
      SIDELINE_RELAY_DOMAIN: 'localhost',
      SIDELINE_ENROLLMENT_KEY: overrideKey
    }, dir);
    assert.equal(result.source, 'environment');
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.config, {
      relayUrl: 'ws://127.0.0.1:48999/tunnel/v1',
      relayDomain: 'localhost',
      enrollmentKey: overrideKey
    });
    assert.notEqual(result.config.enrollmentKey, machineKey);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('RA5P-3. the normal extension launcher starts a product-configured daemon with no Dad-provided relay variables', async () => {
  const dir = tempDir();
  const daemonScriptPath = path.join(repoRoot, 'out', 'control-plane', 'daemon.js');
  const disabledUsageVariables = ['SIDELINE_CLAUDE_USAGE', 'SIDELINE_CLAUDE_ACTIVITY', 'SIDELINE_CODEX_USAGE', 'SIDELINE_CODEX_ACTIVITY'];
  const savedUsage = Object.fromEntries(disabledUsageVariables.map((name) => [name, process.env[name]]));
  let record;
  try {
    for (const name of disabledUsageVariables) process.env[name] = '0';
    await withoutRemoteEnvironment(async () => {
      for (const name of remoteVariables) assert.equal(process.env[name], undefined);
      record = await ensureControlPlaneRunning({
        dir,
        daemonScriptPath,
        requestedPort: 48200 + Math.floor(Math.random() * 500),
        idleTimeoutMs: 60_000,
        timeoutMs: 12_000
      });
    });
    assert.equal((await fetch(`http://127.0.0.1:${record.port}/api/health`)).status, 200);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const preferences = await (await fetch(`http://127.0.0.1:${record.port}/api/preferences`, { headers: bearer(token) })).json();
    assert.equal(preferences.preferences.remoteAccess.enabled, false);
    const extensionSource = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
    assert.match(extensionSource, /ensureControlPlaneRunning\(\{[\s\S]*daemonScriptPath/);
    assert.equal(remoteVariables.some((name) => extensionSource.includes(name)), false, 'extension launch requires no relay variables');
    const shutdown = await fetch(`http://127.0.0.1:${record.port}/api/control-plane/shutdown`, {
      method: 'POST', headers: bearer(token), body: JSON.stringify({ instanceId: record.instanceId, reason: 'ra5p-test-complete' })
    });
    assert.equal(shutdown.status, 200);
    assert.ok(await waitUntil(() => !isProcessAlive(record.pid)), 'launcher-owned daemon exits cleanly');
  } finally {
    if (record && isProcessAlive(record.pid)) { try { process.kill(record.pid); } catch {} }
    for (const name of disabledUsageVariables) {
      if (savedUsage[name] === undefined) delete process.env[name];
      else process.env[name] = savedUsage[name];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RA5P-4. machine-local enrollment is restricted and absent from preferences, APIs, logs, frontend, and package inputs', async () => {
  const dir = tempDir();
  const enrollmentKey = crypto.randomBytes(32).toString('base64url');
  const credentialFile = writeMachineCredential(dir, enrollmentKey, 0o666);
  const bootstrap = productRemoteRelayBootstrap(dir);
  assert.equal(bootstrap.enrollmentStatus, 'available');
  assert.equal(bootstrap.enrollmentKey, enrollmentKey);
  assert.deepEqual(bootstrap.problems, []);
  const resolved = resolveRemoteRelayBootstrap({}, dir);
  assert.equal(resolved.source, 'product-defaults');
  assert.equal(resolved.config.enrollmentKey, enrollmentKey, 'machine credential reaches the daemon RelayClient config seam');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(credentialFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(credentialFile)).mode & 0o077, 0);
  }

  const daemon = new ControlPlaneDaemon({
    dir,
    port: 48700 + Math.floor(Math.random() * 400),
    idleTimeoutMs: 60_000,
    remoteRelay: {
      relayUrl: resolved.config.relayUrl,
      relayDomain: resolved.config.relayDomain,
      enrollmentKey: resolved.config.enrollmentKey
    }
  });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const surfaces = [
      await (await fetch(`http://127.0.0.1:${daemon.port}/api/preferences`, { headers: bearer(token) })).text(),
      await (await fetch(`http://127.0.0.1:${daemon.port}/api/status`, { headers: bearer(token) })).text(),
      fs.readFileSync(path.join(dir, 'logs', 'control-plane.log'), 'utf8'),
      fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8'),
      fs.readFileSync(path.join(repoRoot, 'src', 'public', 'pair.html'), 'utf8'),
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ];
    for (const surface of surfaces) assert.equal(surface.includes(enrollmentKey), false);
    assert.equal(JSON.stringify(loadPreferences(path.join(dir, 'preferences.json'))).includes(enrollmentKey), false);
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RA5P-5. product bootstrap leaves fresh Remote Access disabled', () => {
  const dir = tempDir();
  try {
    assert.equal(DEFAULT_PREFERENCES.remoteAccess.enabled, false);
    assert.equal(loadPreferences(path.join(dir, 'preferences.json')).remoteAccess.enabled, false);
    assert.deepEqual(resolveRemoteRelayBootstrap({}, dir).config, {
      relayUrl: PRODUCT_RELAY_URL,
      relayDomain: PRODUCT_RELAY_DOMAIN
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('RA5P-6. enabled Remote Access remains the liveness lease and disabling restores idle shutdown', async () => {
  const dir = tempDir();
  const relayPort = await deadPort();
  savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, remoteAccess: { enabled: true } });
  const exits = [];
  const daemon = new ControlPlaneDaemon({
    dir,
    port: 49100 + Math.floor(Math.random() * 300),
    idleTimeoutMs: 150,
    exitProcess: (code) => exits.push(code),
    remoteRelay: {
      relayUrl: `ws://127.0.0.1:${relayPort}/tunnel/v1`,
      relayDomain: 'localhost',
      tuning: { backoffScheduleMs: [20] }
    }
  });
  try {
    await daemon.start();
    await sleep(500);
    assert.deepEqual(exits, []);
    assert.equal(daemon.idleTimer, undefined);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const disabled = await fetch(`http://127.0.0.1:${daemon.port}/api/preferences`, {
      method: 'POST', headers: bearer(token), body: JSON.stringify({ remoteAccess: { enabled: false } })
    });
    assert.equal(disabled.status, 200);
    assert.ok(await waitUntil(() => exits.length === 1, 2_000));
    assert.deepEqual(exits, [0]);
  } finally { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('RA5P-7. packaging allowlist and VSIX audit exclude machine enrollment credentials', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.files.some((entry) => /beta-enrollment\.json/i.test(entry)), false);
  const audit = fs.readFileSync(path.join(repoRoot, 'tools', 'dev', 'audit-vsix.mjs'), 'utf8');
  assert.match(audit, /beta-enrollment\\\.json/);
  assert.match(audit, /Enrollment credential assets/);

  const vsix = path.join(repoRoot, `${manifest.name}-${manifest.version}.vsix`);
  if (fs.existsSync(vsix)) {
    const archive = fs.readFileSync(vsix);
    const entries = listZipEntries(archive);
    assert.equal(entries.some((entry) => /beta-enrollment\.json$/i.test(entry)), false);
    const machineOnlySentinel = crypto.randomBytes(32).toString('base64url');
    const dir = tempDir();
    try {
      writeMachineCredential(dir, machineOnlySentinel);
      assert.equal(archive.includes(Buffer.from(machineOnlySentinel)), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
