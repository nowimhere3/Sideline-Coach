import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { remoteRelayConfigFromEnv } from '../out/control-plane/daemon.js';
import { ReferenceRelay } from '../out/relay-build/relay/reference-relay.js';

const KEY = 'operator-secret-for-tests-0123456789abcdef';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(25);
  }
  return fn();
};

const PROD = {
  SIDELINE_RELAY_URL: 'wss://relay.remote.mysidelinecoach.com/tunnel/v1',
  SIDELINE_RELAY_DOMAIN: 'remote.mysidelinecoach.com',
  SIDELINE_ENROLLMENT_KEY: KEY
};

test('RA4C-1. the private-beta environment maps to the intended DaemonRemoteRelayConfig', () => {
  const { config, problems } = remoteRelayConfigFromEnv(PROD);
  assert.deepEqual(problems, []);
  assert.deepEqual(config, {
    relayUrl: 'wss://relay.remote.mysidelinecoach.com/tunnel/v1',
    relayDomain: 'remote.mysidelinecoach.com',
    enrollmentKey: KEY
  });
  // Domain is normalised; local ws:// stays allowed for dev/reference relay.
  const local = remoteRelayConfigFromEnv({ ...PROD, SIDELINE_RELAY_URL: 'ws://127.0.0.1:9000/tunnel/v1', SIDELINE_RELAY_DOMAIN: 'Remote.MySidelineCoach.com ' });
  assert.equal(local.config.relayUrl, 'ws://127.0.0.1:9000/tunnel/v1');
  assert.equal(local.config.relayDomain, 'remote.mysidelinecoach.com');
});

test('RA4C-2. absent config means no relay; partial or invalid config is refused and errors never echo values', () => {
  assert.deepEqual(remoteRelayConfigFromEnv({}), { problems: [] });
  const cases = [
    [{ SIDELINE_RELAY_URL: PROD.SIDELINE_RELAY_URL }, ['SIDELINE_RELAY_DOMAIN', 'SIDELINE_ENROLLMENT_KEY']],
    [{ ...PROD, SIDELINE_RELAY_URL: 'https://relay.example.com/tunnel/v1' }, ['SIDELINE_RELAY_URL']],
    [{ ...PROD, SIDELINE_RELAY_URL: 'wss://user:pass@relay.example.com/tunnel/v1' }, ['SIDELINE_RELAY_URL']],
    [{ ...PROD, SIDELINE_RELAY_URL: 'not a url' }, ['SIDELINE_RELAY_URL']],
    [{ ...PROD, SIDELINE_RELAY_DOMAIN: 'https://remote.mysidelinecoach.com' }, ['SIDELINE_RELAY_DOMAIN']],
    [{ ...PROD, SIDELINE_ENROLLMENT_KEY: 'shortsecret' }, ['SIDELINE_ENROLLMENT_KEY']]
  ];
  for (const [env, expected] of cases) {
    const result = remoteRelayConfigFromEnv(env);
    assert.equal(result.config, undefined);
    assert.deepEqual(result.problems, expected);
    const text = JSON.stringify(result);
    assert.ok(!text.includes('shortsecret') && !text.includes(KEY) && !text.includes('user:pass'), 'problems name variables, never values');
  }
});

test('RA4C-3. the real daemon process picks the bootstrap up, stays OFF by default, connects only when enabled locally, and never persists or exposes the key', async () => {
  const relayEvents = [];
  const relay = new ReferenceRelay({ relayDomain: 'remote.mysidelinecoach.com', enrollmentKey: KEY, onEvent: (e) => relayEvents.push(e) });
  const relayPort = await relay.listen(0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra4c-'));
  const port = 44900 + Math.floor(Math.random() * 500);
  const entry = fileURLToPath(new URL('../out/control-plane/daemon.js', import.meta.url));
  const child = spawn(process.execPath, [entry, '--dir', dir, '--port', String(port)], {
    env: {
      ...process.env,
      SIDELINE_CLAUDE_USAGE: '0', SIDELINE_CLAUDE_ACTIVITY: '0', SIDELINE_CODEX_USAGE: '0', SIDELINE_CODEX_ACTIVITY: '0',
      SIDELINE_RELAY_URL: `ws://127.0.0.1:${relayPort}/tunnel/v1`,
      SIDELINE_RELAY_DOMAIN: 'remote.mysidelinecoach.com',
      SIDELINE_ENROLLMENT_KEY: KEY
    }
  });
  let output = '';
  child.stdout.on('data', (c) => { output += c; });
  child.stderr.on('data', (c) => { output += c; });
  try {
    assert.ok(await waitUntil(() => fs.existsSync(path.join(dir, 'token'))), 'daemon started');
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const local = (p, init = {}) => fetch(`http://127.0.0.1:${port}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    assert.ok(await waitUntil(async () => { try { return (await local('/api/status')).status === 200; } catch { return false; } }));
    await sleep(300);
    assert.equal(relay.connectionCount, 0, 'configured relay + default-off preference: no connection');
    const enabled = await local('/api/preferences', { method: 'POST', body: JSON.stringify({ remoteAccess: { enabled: true } }) });
    assert.equal(enabled.status, 200);
    assert.ok(await waitUntil(() => relay.hosts.size === 1), 'enabled locally: enrolled host registered through the bootstrap config');
    assert.equal(relayEvents.filter((e) => e.event === 'enrollment_rejected').length, 0, 'enrollment key reached the relay');
    // Exposure / persistence audit.
    for (const p of ['/api/status', '/api/preferences']) assert.ok(!(await (await local(p)).text()).includes(KEY), `${p} does not expose the key`);
    const scan = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((entry2) => (entry2.isDirectory() ? scan(path.join(d, entry2.name)) : [path.join(d, entry2.name)]));
    for (const file of scan(dir)) assert.ok(!fs.readFileSync(file).includes(KEY), `${path.basename(file)} must not contain the key`);
    assert.ok(!output.includes(KEY), 'daemon stdout/stderr never contains the key');
    assert.equal((await local('/api/preferences', { method: 'POST', body: JSON.stringify({ remoteAccess: { enabled: false } }) })).status, 200);
    assert.ok(await waitUntil(() => relay.hosts.size === 0));
  } finally {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    await relay.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
