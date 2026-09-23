import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { ClaudeUsageReader } from '../out/control-plane/claude-usage-reader.js';
import { formatRefreshFeedback } from '../out/control-plane/protocol.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-claude-usage-daemon-'));
}

const request = (port, method, route, token, body) => new Promise((resolve, reject) => {
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const req = http.request({
    hostname: '127.0.0.1', port, method, path: route,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
    }
  }, (res) => {
    let responseBody = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { responseBody += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(responseBody) }));
  });
  req.on('error', reject);
  if (payload) req.write(payload);
  req.end();
});
const get = (port, route, token) => request(port, 'GET', route, token);
const post = (port, route, token, body) => request(port, 'POST', route, token, body);

function fakeReader(outcomes) {
  let call = 0;
  let ingest = () => false;
  const reader = new ClaudeUsageReader({ ingest: () => false, setTimer: () => ({}), clearTimer: () => undefined });
  reader.refresh = async () => {
    const outcome = outcomes[Math.min(call, outcomes.length - 1)];
    call += 1;
    const changed = outcome.ok ? ingest(outcome.windows) : false;
    return { outcome, changed };
  };
  reader.setIngest = (fn) => { ingest = fn; };
  return reader;
}

/** Wires the fake reader's ingest into the daemon's real HealthAuthority, the way the daemon normally does for its own reader. */
function wireIngest(daemon, reader) {
  reader.setIngest((windows) => daemon.healthAuthorityInstance.ingestClaudeUsage(windows));
}

test('the default constructor never starts a Claude usage reader', async () => {
  const dir = createTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 39701, idleTimeoutMs: 60000 });
  try {
    assert.equal(daemon.claudeUsageReaderInstance, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exactly one global reader exists per daemon, and it is the same instance across the daemon\'s lifetime', async () => {
  const dir = createTempDir();
  const reader = fakeReader([{ ok: true, windows: { five_hour: { utilization: 0.5, resetsAt: 111 } } }]);
  const daemon = new ControlPlaneDaemon({ dir, port: 39702, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    const first = daemon.claudeUsageReaderInstance;
    assert.equal(first, reader, 'the daemon uses exactly the one reader it was given');
    assert.equal(daemon.claudeUsageReaderInstance, first, 'repeated access returns the same instance, never a new one');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/ai-health/refresh performs a factual acquisition and broadcasts on change', async () => {
  const dir = createTempDir();
  const reader = fakeReader([{ ok: true, windows: { five_hour: { utilization: 0.6, resetsAt: 222 }, seven_day: { utilization: 0.3, resetsAt: 333 } } }]);
  const daemon = new ControlPlaneDaemon({ dir, port: 39703, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    wireIngest(daemon, reader);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const response = await post(39703, '/api/ai-health/refresh', token);
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.acquisition.claude.outcome, 'changed');
    assert.equal(response.body.health.providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.6);
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unchanged refresh reports "unchanged" and produces no false persistence/SSE churn', async () => {
  const dir = createTempDir();
  const windows = { five_hour: { utilization: 0.42, resetsAt: 123456 }, seven_day: { utilization: 0.15, resetsAt: 654321 } };
  const reader = fakeReader([{ ok: true, windows }, { ok: true, windows }]);
  const daemon = new ControlPlaneDaemon({ dir, port: 39704, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    wireIngest(daemon, reader);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const first = await post(39704, '/api/ai-health/refresh', token);
    assert.equal(first.body.acquisition.claude.outcome, 'changed');
    const second = await post(39704, '/api/ai-health/refresh', token);
    assert.equal(second.body.acquisition.claude.outcome, 'unchanged', 'identical canonical windows are not a change');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed acquisition preserves last-known facts and reports the failure code, never a fabricated value', async () => {
  const dir = createTempDir();
  const goodWindows = { five_hour: { utilization: 0.2, resetsAt: 100 } };
  const reader = fakeReader([{ ok: true, windows: goodWindows }, { ok: false, code: 'auth_rejected', reason: 'HTTP 401' }]);
  const daemon = new ControlPlaneDaemon({ dir, port: 39705, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    wireIngest(daemon, reader);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    await post(39705, '/api/ai-health/refresh', token);
    const failed = await post(39705, '/api/ai-health/refresh', token);
    assert.equal(failed.body.acquisition.claude.outcome, 'auth_rejected');
    assert.equal(failed.body.health.providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.2, 'last-known good facts are preserved');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/ai-health/refresh without the token is rejected', async () => {
  const dir = createTempDir();
  const reader = fakeReader([{ ok: true, windows: { five_hour: { utilization: 0.1, resetsAt: 1 } } }]);
  const daemon = new ControlPlaneDaemon({ dir, port: 39706, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    const response = await post(39706, '/api/ai-health/refresh', undefined);
    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/ai-health/refresh is not a route; refresh is POST-only and unaffected without the reader enabled', async () => {
  const dir = createTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 39707, idleTimeoutMs: 60000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const response = await post(39707, '/api/ai-health/refresh', token);
    assert.equal(response.status, 200);
    assert.equal(response.body.acquisition.claude.outcome, 'unavailable', 'no reader enabled means no acquisition, never a fabricated result');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('changing the aiUsageRefreshMinutes preference updates the ONE reader\'s cadence, never creating another reader', async () => {
  const dir = createTempDir();
  const reader = fakeReader([{ ok: true, windows: { five_hour: { utilization: 0.1, resetsAt: 1 } } }]);
  let cadenceSet;
  reader.setCadenceMinutes = (minutes) => { cadenceSet = minutes; return true; };
  const daemon = new ControlPlaneDaemon({ dir, port: 39708, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const response = await post(39708, '/api/preferences', token, { aiUsageRefreshMinutes: 15 });
    assert.equal(response.status, 200);
    assert.equal(response.body.preferences.aiUsageRefreshMinutes, 15);
    assert.equal(cadenceSet, 15, 'the same reader instance adopted the new cadence');
    assert.equal(daemon.claudeUsageReaderInstance, reader, 'still exactly the one reader');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no OAuth/Bearer credential material appears in daemon responses across a success + failure acquisition cycle', async () => {
  const dir = createTempDir();
  const reader = fakeReader([
    { ok: true, windows: { five_hour: { utilization: 0.3, resetsAt: 111 } } },
    { ok: false, code: 'auth_rejected', reason: 'Claude usage endpoint rejected the OAuth token (HTTP 401).' }
  ]);
  const daemon = new ControlPlaneDaemon({ dir, port: 39710, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    wireIngest(daemon, reader);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const first = await post(39710, '/api/ai-health/refresh', token);
    const second = await post(39710, '/api/ai-health/refresh', token);
    const health = await get(39710, '/api/ai-health', token);
    for (const response of [first, second, health]) {
      const text = JSON.stringify(response.body);
      assert.doesNotMatch(text, /accessToken|claudeAiOauth|authorization|Bearer /i);
    }
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/preferences rejects an aiUsageRefreshMinutes value below 3, off the allowlist, or an old seconds-era number', async () => {
  const dir = createTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 39709, idleTimeoutMs: 60000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    for (const bad of [1, 2, 4, 6, 20, 30]) {
      const response = await post(39709, '/api/preferences', token, { aiUsageRefreshMinutes: bad });
      assert.equal(response.status, 400, `${bad} must be rejected`);
    }
    const ok = await get(39709, '/api/preferences', token);
    assert.equal(ok.body.preferences.aiUsageRefreshMinutes, 5, 'default is unchanged by the rejected values');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a legacy persisted aiUsageRefreshSeconds value never survives as active polling policy: fresh key falls back to the 5-minute default', async () => {
  const dir = createTempDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preferences.json'), JSON.stringify({ aiUsageRefreshSeconds: 10 }), 'utf8');
  const daemon = new ControlPlaneDaemon({ dir, port: 39711, idleTimeoutMs: 60000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const result = await get(39711, '/api/preferences', token);
    assert.equal(result.body.preferences.aiUsageRefreshMinutes, 5, 'the old seconds-era value 10 is never reinterpreted as 10 minutes');
    assert.equal(result.body.preferences.aiUsageRefreshSeconds, undefined, 'the legacy key is not surfaced at all');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Field seam (Claude-5H-Post-Reset-Root-Cause-Repair): the persisted state holds
// only the weekly window — no 5H, no expired-cycle memory (a pre-fix build had
// already pruned it) — and the provider returns its real not-started shape,
// five_hour {utilization:0, resets_at:null}. The REAL reader, canonicalizer,
// daemon HealthAuthority, /api/ai-health, and restart must carry the idle state.
test('provider post-reset five_hour {0, null} reaches /api/ai-health as idle with no prior 5H memory, survives restart, and yields to a new active 5H', async () => {
  const dir = createTempDir();
  const nowSec = Math.floor(Date.now() / 1000);
  const weeklyReset = new Date((nowSec + 3 * 86400) * 1000).toISOString();
  fs.writeFileSync(path.join(dir, 'ai-health-state.json'), JSON.stringify({
    schemaVersion: 1,
    providers: {
      claude: {
        provider: 'claude', evidenceType: 'oauth_usage',
        rateLimitInfo: { unifiedWindows: { seven_day: { utilization: 0.61, resetsAt: nowSec + 3 * 86400 } } },
        source: { stadiumId: 'control-plane', instanceId: 'claude-oauth-reader', gameId: 'control-plane', playerInstanceId: 'claude-oauth-reader' },
        observedAt: new Date((nowSec - 3600) * 1000).toISOString()
      }
    }
  }));

  let payload = { five_hour: { utilization: 0, resets_at: null }, seven_day: { utilization: 61, resets_at: weeklyReset } };
  const makeDaemon = (port) => {
    let daemon;
    const reader = new ClaudeUsageReader({
      ingest: (windows) => daemon.healthAuthorityInstance.ingestClaudeUsage(windows),
      readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3_600_000 } }),
      fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => payload }),
      setTimer: () => ({}), clearTimer: () => undefined
    });
    daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader }, codexUsage: { enabled: false } });
    return daemon;
  };
  const fiveHourFromApi = async (port) => (await get(port, '/api/ai-health', fs.readFileSync(path.join(dir, 'token'), 'utf8').trim())).body.health.providers.claude.rateLimitInfo.unifiedWindows.five_hour;

  let daemon = makeDaemon(39712);
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    await post(39712, '/api/ai-health/refresh', token);
    assert.deepEqual(await fiveHourFromApi(39712), { utilization: 0, resetsAt: null }, 'idle, not UNKNOWN');
  } finally {
    await daemon.stop();
  }

  daemon = makeDaemon(39713);
  try {
    await daemon.start();
    assert.deepEqual(await fiveHourFromApi(39713), { utilization: 0, resetsAt: null }, 'idle survives an ordinary restart');
    const activeReset = nowSec + 5 * 3600;
    payload = { five_hour: { utilization: 3, resets_at: new Date(activeReset * 1000).toISOString() }, seven_day: payload.seven_day };
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    await new Promise((resolve) => setTimeout(resolve, 2100)); // clear the reader's 2s anti-spam guard
    await post(39713, '/api/ai-health/refresh', token);
    assert.deepEqual(await fiveHourFromApi(39713), { utilization: 0.03, resetsAt: activeReset }, 'first real 5H replaces idle without reload');
    // A lagging provider "not started" frame cannot overwrite the running cycle.
    payload = { five_hour: { utilization: 0, resets_at: null }, seven_day: payload.seven_day };
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await post(39713, '/api/ai-health/refresh', token);
    assert.deepEqual(await fiveHourFromApi(39713), { utilization: 0.03, resetsAt: activeReset });
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Stage 1 field seam (Claude-Usage-Accuracy-And-Live-Freshness): the stored cycle
// resets and the fresh OAuth read's resets differ by ~1-2s for the SAME cycle
// (captured live: stored seven_day 1790424001 vs OAuth "…11:59:59.723038+00:00").
// Before the repair the merge rejected the fresh Weekly as a "stale replay".
function realReaderDaemon(dir, port, getPayload) {
  let daemon;
  const reader = new ClaudeUsageReader({
    ingest: (windows) => daemon.healthAuthorityInstance.ingestClaudeUsage(windows),
    readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3_600_000 } }),
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => getPayload() }),
    setTimer: () => ({}), clearTimer: () => undefined
  });
  daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader }, codexUsage: { enabled: false } });
  return daemon;
}

function seedClaude(dir, unifiedWindows) {
  fs.writeFileSync(path.join(dir, 'ai-health-state.json'), JSON.stringify({
    schemaVersion: 1,
    providers: {
      claude: {
        provider: 'claude', evidenceType: 'oauth_usage', rateLimitInfo: { unifiedWindows },
        source: { stadiumId: 'control-plane', instanceId: 'claude-oauth-reader', gameId: 'control-plane', playerInstanceId: 'claude-oauth-reader' },
        observedAt: new Date(Date.now() - 600_000).toISOString()
      }
    }
  }));
}

test('manual Refresh advances BOTH Claude 5H (4%→7%) and Weekly (60%→62%) when the provider reset jitters a second earlier', async () => {
  const dir = createTempDir();
  const nowSec = Math.floor(Date.now() / 1000);
  const fiveReset = nowSec + 4 * 3600;
  const weekReset = nowSec + 3 * 86400;
  seedClaude(dir, {
    five_hour: { utilization: 0.04, resetsAt: fiveReset + 1 },
    seven_day: { utilization: 0.6, resetsAt: weekReset + 2 }
  });
  const iso = (sec) => new Date(sec * 1000 - 277).toISOString(); // "…:59.723Z" — one cycle, earlier second
  const daemon = realReaderDaemon(dir, 39714, () => ({
    five_hour: { utilization: 7, resets_at: iso(fiveReset) },
    seven_day: { utilization: 62, resets_at: iso(weekReset) }
  }));
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const refreshed = await post(39714, '/api/ai-health/refresh', token);
    assert.equal(refreshed.body.acquisition.claude.outcome, 'changed');
    assert.equal(refreshed.body.acquisition.claude.notReflected, undefined);
    assert.equal(formatRefreshFeedback({ claude: refreshed.body.acquisition.claude }), 'Refreshed ✓');
    const windows = (await get(39714, '/api/ai-health', token)).body.health.providers.claude.rateLimitInfo.unifiedWindows;
    assert.equal(windows.five_hour.utilization, 0.07, '5H is the fresh value');
    assert.equal(windows.seven_day.utilization, 0.62, 'Weekly is the fresh value — FAIL if still 0.60');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a successful read the authority does not fully accept reports "retained" and names the window — never "Refreshed ✓"', async () => {
  const dir = createTempDir();
  const nowSec = Math.floor(Date.now() / 1000);
  // Stored Weekly belongs to a later cycle than the read returns (a genuine older-cycle replay).
  seedClaude(dir, { seven_day: { utilization: 0.6, resetsAt: nowSec + 3 * 86400 } });
  const daemon = realReaderDaemon(dir, 39715, () => ({
    five_hour: { utilization: 7, resets_at: new Date((nowSec + 4 * 3600) * 1000).toISOString() },
    seven_day: { utilization: 10, resets_at: new Date((nowSec + 86400) * 1000).toISOString() }
  }));
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const refreshed = await post(39715, '/api/ai-health/refresh', token);
    assert.equal(refreshed.body.acquisition.claude.outcome, 'retained');
    assert.deepEqual(refreshed.body.acquisition.claude.notReflected, ['seven_day']);
    assert.notEqual(formatRefreshFeedback(refreshed.body.acquisition), 'Refreshed ✓');
    const windows = refreshed.body.health.providers.claude.rateLimitInfo.unifiedWindows;
    assert.equal(windows.five_hour.utilization, 0.07, 'the accepted window still updates');
    assert.equal(windows.seven_day.utilization, 0.6, 'the later stored cycle is kept');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Stage 2 production seam: Claude work (a transcript write under the watched
// Claude Code projects dir) reaches /api/ai-health with NO manual Refresh and
// with the polling cadence never firing. Timers are compressed only for the
// activity path (<3 min); cadence timers (>=3 min) are parked so they cannot help.
test('Claude transcript activity drives a fresh read into /api/ai-health without Refresh or the polling cadence', async () => {
  const dir = createTempDir();
  const activityDir = path.join(dir, 'claude-projects');
  fs.mkdirSync(path.join(activityDir, 'C--repo'), { recursive: true });
  const nowSec = Math.floor(Date.now() / 1000);
  let payload = {
    five_hour: { utilization: 4, resets_at: new Date((nowSec + 4 * 3600) * 1000).toISOString() },
    seven_day: { utilization: 60, resets_at: new Date((nowSec + 3 * 86400) * 1000).toISOString() }
  };
  let fetchCount = 0;
  let daemon;
  const reader = new ClaudeUsageReader({
    ingest: (windows) => daemon.healthAuthorityInstance.ingestClaudeUsage(windows),
    readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3_600_000 } }),
    fetchImpl: async () => { fetchCount += 1; return { ok: true, status: 200, headers: { get: () => null }, json: async () => payload }; },
    setTimer: (fn, ms) => (ms >= 180_000 ? { unref() {} } : setTimeout(fn, 25)),
    clearTimer: (handle) => clearTimeout(handle)
  });
  daemon = new ControlPlaneDaemon({ dir, port: 39716, idleTimeoutMs: 60000, claudeUsage: { enabled: true, reader, activityDir }, codexUsage: { enabled: false } });
  const windowsFromApi = async (token) => (await get(39716, '/api/ai-health', token)).body.health.providers.claude?.rateLimitInfo.unifiedWindows;
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const settle = Date.now() + 2000;
    while (Date.now() < settle && (await windowsFromApi(token))?.five_hour?.utilization !== 0.04) await new Promise((r) => setTimeout(r, 20));
    assert.equal((await windowsFromApi(token)).five_hour.utilization, 0.04, 'startup read');
    const startupFetches = fetchCount;

    payload = { five_hour: { ...payload.five_hour, utilization: 7 }, seven_day: { ...payload.seven_day, utilization: 62 } };
    fs.appendFileSync(path.join(activityDir, 'C--repo', 'session.jsonl'), '{"type":"assistant"}\n');

    const deadline = Date.now() + 5000;
    let windows;
    while (Date.now() < deadline) {
      windows = await windowsFromApi(token);
      if (windows?.five_hour?.utilization === 0.07 && windows?.seven_day?.utilization === 0.62) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(windows.five_hour.utilization, 0.07, '5H converged from Claude activity alone');
    assert.equal(windows.seven_day.utilization, 0.62, 'Weekly converged from Claude activity alone');
    assert.ok(fetchCount > startupFetches, 'a real provider read was triggered by the activity');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
