import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';

const waitFor = async (predicate, timeoutMs = 2500) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
};

const get = (port, route, token) => new Promise((resolve, reject) => {
  const req = http.get({ hostname: '127.0.0.1', port, path: route, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
  });
  req.on('error', reject);
});

const context = (gameId, stadiumId) => ({
  game: { gameId, displayName: 'Health Game', fingerprintSource: 'git-remote', repoUri: 'https://example.test/health.git' },
  stadium: { stadiumId, name: 'Health Stadium', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId, stadiumId, rootFsPath: 'C:\\Health', boundAt: Date.now(), isPrimary: true, status: 'bound' }
});

test('daemon owns, distributes, deduplicates, flushes, and restores one global HealthAuthority', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-health-daemon-'));
  const port = 39204;
  const gameId = 'game-health-daemon';
  const stadiumId = getDurableStadiumId(dir);
  let daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
  assert.equal(daemon.healthAuthorityInstance, daemon.healthAuthorityInstance, 'one daemon-scoped Authority');
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  let stream = '';
  const sse = http.get(`http://127.0.0.1:${port}/api/events?token=${encodeURIComponent(token)}`, (res) => {
    res.on('data', (chunk) => { stream += chunk.toString(); });
  });
  const client = new StadiumClient({
    port, dir, instanceId: 'health-window-1', gameContextGetter: () => context(gameId, stadiumId)
  });

  try {
    await waitFor(() => stream.includes('event: ai-health'));
    assert.match(stream, /event: ai-health\ndata: \{"schemaVersion":1,"providers":\{\}\}/, 'initial SSE health snapshot');
    await client.connect();
    const first = { provider: 'claude', type: 'rate_limit_event', rate_limit_info: { status: 'allowed', utilization: 0.42, resetsAt: 123456 } };
    client.sendHealthEvidence('claude-health01', first);
    await waitFor(() => daemon.getHealthSnapshot().providers.claude?.rateLimitInfo.utilization === 0.42);
    await waitFor(() => (stream.match(/event: ai-health/g) ?? []).length === 2);
    await waitFor(() => fs.existsSync(path.join(dir, 'ai-health-state.json')));
    const savedBeforeReplay = fs.readFileSync(path.join(dir, 'ai-health-state.json'), 'utf8');
    const broadcastsBeforeReplay = (stream.match(/event: ai-health/g) ?? []).length;

    client.sendHealthEvidence('claude-health01', first);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal((stream.match(/event: ai-health/g) ?? []).length, broadcastsBeforeReplay, 'exact replay does not broadcast');
    assert.equal(fs.readFileSync(path.join(dir, 'ai-health-state.json'), 'utf8'), savedBeforeReplay, 'exact replay does not save');

    client.sendHealthEvidence('codex-health01', { provider: 'codex', type: 'account_rate_limits', rate_limits: { primary: { usedPercent: 17 }, planType: 'pro' }, unrelated: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(daemon.getHealthSnapshot().providers.codex, undefined, 'malformed Codex evidence fails closed');
    const codex = { provider: 'codex', type: 'account_rate_limits', rate_limits: { primary: { usedPercent: 17, resetsAt: 777, windowDurationMins: 300 }, secondary: null, planType: 'pro', rateLimitReachedType: null } };
    client.sendHealthEvidence('codex-health01', codex);
    await waitFor(() => daemon.getHealthSnapshot().providers.codex?.rateLimitInfo.primary.usedPercent === 17);
    const codexBroadcasts = await waitFor(() => {
      const count = (stream.match(/event: ai-health/g) ?? []).length;
      return count > broadcastsBeforeReplay ? count : undefined;
    });
    client.sendHealthEvidence('codex-health01', codex);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal((stream.match(/event: ai-health/g) ?? []).length, codexBroadcasts, 'Codex replay does not broadcast');

    const authorized = await get(port, '/api/ai-health', token);
    assert.equal(authorized.status, 200);
    assert.deepEqual(authorized.body, { success: true, health: daemon.getHealthSnapshot() });
    assert.ok(authorized.body.health.providers.claude && authorized.body.health.providers.codex, 'HTTP exposes one multi-provider snapshot');
    const unauthorized = await get(port, '/api/ai-health');
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.body.success, false);

    client.sendHealthEvidence('claude-health01', { ...first, rate_limit_info: { status: 'allowed', utilization: 0.73, resetsAt: 654321 } });
    await waitFor(() => daemon.getHealthSnapshot().providers.claude?.rateLimitInfo.utilization === 0.73);
    await waitFor(() => (stream.match(/event: ai-health/g) ?? []).length === codexBroadcasts + 1);
    client.dispose();
    sse.destroy();
    await daemon.stop();
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'ai-health-state.json'), 'utf8'));
    assert.equal(persisted.providers.claude.rateLimitInfo.utilization, 0.73, 'stop flushes pending state');
    assert.equal(persisted.providers.codex.rateLimitInfo.primary.usedPercent, 17);

    daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000 });
    assert.equal(daemon.getHealthSnapshot().providers.claude.rateLimitInfo.utilization, 0.73, 'restart restores state');
    assert.equal(daemon.getHealthSnapshot().providers.codex.rateLimitInfo.primary.usedPercent, 17);
    await daemon.start();
  } finally {
    client.dispose();
    sse.destroy();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
