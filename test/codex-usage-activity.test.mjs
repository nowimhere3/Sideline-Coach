// Codex live freshness (Claude-Live-Telemetry-And-Scoreboard-Polish).
// Field failure: Dad's normal Codex terminal (session_meta originator "codex-tui",
// NOT a Sideline-controlled Player) used 4% 5H / 1% Weekly; Sideline stayed 100/100
// because nothing outside Sideline-controlled Players ever triggered a Codex read.
// Codex writes its rollout through a HELD-OPEN handle, which fs.watch cannot see on
// Windows — so the mechanism is a local size scan + one bounded authoritative read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { CodexUsageReader, watchCodexActivity } from '../out/control-plane/codex-usage-reader.js';
import { formatRefreshFeedback } from '../out/control-plane/protocol.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r)); };
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-codex-activity-'));

/** Today's (local date) Codex sessions dir, the layout Codex itself uses. */
function todaysSessionDir(sessionsDir) {
  const d = new Date();
  const dir = path.join(sessionsDir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const request = (port, method, route, token) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, method, path: route, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
  });
  req.on('error', reject);
  req.end();
});

function fakeTimers() {
  const all = [];
  return {
    setTimer: (fn, ms) => { const h = { fn, ms, cleared: false, unref() {} }; all.push(h); return h; },
    clearTimer: (h) => { if (h) h.cleared = true; },
    pending: () => all.filter((h) => !h.cleared && !h.fired),
    fire: async (h) => { h.fired = true; h.fn(); await flush(); }
  };
}

test('Codex activity: a burst coalesces into ONE authoritative read after it settles; reads are spaced; stop() cancels', async () => {
  let t = 0;
  let reads = 0;
  const timers = fakeTimers();
  const reader = new CodexUsageReader({
    ingest: () => true,
    readOnceImpl: async () => { reads += 1; return { ok: true, rateLimits: {} }; },
    now: () => t,
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  for (const sec of [10, 12, 20]) { t = sec * 1000; reader.noteCodexActivity(); }
  assert.equal(timers.pending().length, 1, 'one pending read for the whole burst');
  assert.equal(timers.pending()[0].ms, 15_000, 'fires 15s after the last activity');
  t = 35_000;
  await timers.fire(timers.pending()[0]);
  assert.equal(reads, 1);

  t = 40_000; reader.noteCodexActivity();
  assert.equal(timers.pending()[0].ms, 85_000, 'never sooner than 90s after the previous read (t=125s)');
  reader.stop();
  assert.equal(timers.pending().length, 0);
  reader.noteCodexActivity();
  assert.equal(timers.pending().length, 0, 'a stopped reader schedules nothing');
});

test('the rollout scan sees appends through a HELD-OPEN handle (Codex\'s write style) and treats startup as a silent baseline', async () => {
  const sessions = tempDir();
  const dir = todaysSessionDir(sessions);
  const existing = path.join(dir, 'rollout-2026-09-22T21-00-00-old.jsonl');
  fs.writeFileSync(existing, '{"type":"session_meta"}\n');
  let activity = 0;
  const stop = watchCodexActivity(sessions, () => { activity += 1; }, { intervalMs: 20 });
  try {
    await wait(80);
    assert.equal(activity, 0, 'files already present at startup are not activity');
    const fd = fs.openSync(existing, 'a');
    try {
      fs.writeSync(fd, '{"type":"event_msg","payload":{"type":"token_count"}}\n');
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && activity === 0) await wait(10);
      assert.ok(activity > 0, 'growth through a held-open handle is detected');
    } finally {
      fs.closeSync(fd);
    }
    const before = activity;
    fs.writeFileSync(path.join(dir, 'rollout-2026-09-22T22-00-00-new.jsonl'), '{}\n');
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && activity === before) await wait(10);
    assert.ok(activity > before, 'a new session rollout is activity');
  } finally {
    stop();
    fs.rmSync(sessions, { recursive: true, force: true });
  }
});

// Production seam, field numbers: stored Codex 0% / 0% (last pushed by a
// Sideline-controlled Player); external Codex work grows a rollout; the next
// authoritative account/rateLimits/read says 4% / 1%. No manual Refresh.
test('external Codex work converges /api/ai-health to the authoritative 4% 5H / 1% Weekly without Refresh', async () => {
  const dir = tempDir();
  const sessions = path.join(dir, 'codex-sessions');
  const rolloutDir = todaysSessionDir(sessions);
  const rollout = path.join(rolloutDir, 'rollout-2026-09-22T21-57-45-survey.jsonl');
  fs.writeFileSync(rollout, '{"type":"session_meta","payload":{"originator":"codex-tui","source":"cli"}}\n');
  const nowSec = Math.floor(Date.now() / 1000);
  fs.writeFileSync(path.join(dir, 'ai-health-state.json'), JSON.stringify({
    schemaVersion: 1,
    providers: {
      codex: {
        provider: 'codex', evidenceType: 'account_rate_limits',
        rateLimitInfo: {
          primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: nowSec + 4 * 3600 },
          secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: nowSec + 6 * 86400 }
        },
        source: { stadiumId: 's1', instanceId: 'i1', gameId: 'g1', playerInstanceId: 'codex-476a995e' },
        observedAt: new Date((nowSec - 1800) * 1000).toISOString()
      }
    }
  }));

  let authoritative = {
    primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: nowSec + 4 * 3600 },
    secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: nowSec + 6 * 86400 }
  };
  let reads = 0;
  let daemon;
  const reader = new CodexUsageReader({
    ingest: (rateLimits) => daemon.healthAuthorityInstance.ingest({
      stadiumId: 'control-plane', instanceId: 'codex-manual-reader', gameId: 'control-plane', playerInstanceId: 'codex-manual-reader',
      evidence: { provider: 'codex', type: 'account_rate_limits', rate_limits: rateLimits }
    }),
    readOnceImpl: async () => { reads += 1; return { ok: true, rateLimits: structuredClone(authoritative) }; },
    setTimer: (fn) => setTimeout(fn, 25) // compress settle/spacing only; the trigger is still the real scan
  });
  daemon = new ControlPlaneDaemon({
    dir, port: 39723, idleTimeoutMs: 60000,
    claudeUsage: { enabled: false },
    codexUsage: { enabled: true, reader, activityDir: sessions, activityScanMs: 25 }
  });
  const codexFromApi = async (token) => (await request(39723, 'GET', '/api/ai-health', token)).body.health.providers.codex.rateLimitInfo;
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    await wait(100);
    assert.equal(reads, 0, 'daemon startup alone performs no Codex read');
    assert.equal((await codexFromApi(token)).primary.usedPercent, 0);

    // Real Codex work: the authoritative account state moves (reset jitters 3s
    // earlier, as the field rollout showed), and Codex appends via a held-open handle.
    authoritative = {
      primary: { usedPercent: 4, windowDurationMins: 300, resetsAt: nowSec + 4 * 3600 - 3 },
      secondary: { usedPercent: 1, windowDurationMins: 10080, resetsAt: nowSec + 6 * 86400 - 3 }
    };
    const fd = fs.openSync(rollout, 'a');
    try {
      fs.writeSync(fd, '{"type":"event_msg","payload":{"type":"token_count"}}\n');
      const deadline = Date.now() + 5000;
      let limits;
      while (Date.now() < deadline) {
        limits = await codexFromApi(token);
        if (limits.primary.usedPercent === 4 && limits.secondary.usedPercent === 1) break;
        await wait(25);
      }
      assert.equal(limits.primary.usedPercent, 4, '5H converged: 96% left');
      assert.equal(limits.secondary.usedPercent, 1, 'Weekly converged: 99% left');
      assert.ok(reads >= 1, 'an authoritative read was triggered by the Codex activity');
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manual Refresh reports a Codex read the authority did not accept as "retained", never "Refreshed ✓"', async () => {
  const dir = tempDir();
  const nowSec = Math.floor(Date.now() / 1000);
  fs.writeFileSync(path.join(dir, 'ai-health-state.json'), JSON.stringify({
    schemaVersion: 1,
    providers: {
      codex: {
        provider: 'codex', evidenceType: 'account_rate_limits',
        rateLimitInfo: { secondary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: nowSec + 6 * 86400 } },
        source: { stadiumId: 's1', instanceId: 'i1', gameId: 'g1', playerInstanceId: 'codex-1' },
        observedAt: new Date().toISOString()
      }
    }
  }));
  let daemon;
  const reader = new CodexUsageReader({
    ingest: (rateLimits) => daemon.healthAuthorityInstance.ingest({
      stadiumId: 'control-plane', instanceId: 'codex-manual-reader', gameId: 'control-plane', playerInstanceId: 'codex-manual-reader',
      evidence: { provider: 'codex', type: 'account_rate_limits', rate_limits: rateLimits }
    }),
    // A genuinely older Weekly cycle (a day earlier than the stored one) is rejected by the merge.
    readOnceImpl: async () => ({ ok: true, rateLimits: {
      primary: { usedPercent: 4, windowDurationMins: 300, resetsAt: nowSec + 4 * 3600 },
      secondary: { usedPercent: 1, windowDurationMins: 10080, resetsAt: nowSec + 5 * 86400 }
    } })
  });
  daemon = new ControlPlaneDaemon({ dir, port: 39724, idleTimeoutMs: 60000, claudeUsage: { enabled: false }, codexUsage: { enabled: true, reader } });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const res = await request(39724, 'POST', '/api/ai-health/refresh', token);
    assert.equal(res.body.acquisition.codex.outcome, 'retained');
    assert.deepEqual(res.body.acquisition.codex.notReflected, ['secondary']);
    assert.notEqual(formatRefreshFeedback({ codex: res.body.acquisition.codex }), 'Refreshed ✓');
    assert.equal(res.body.health.providers.codex.rateLimitInfo.primary.usedPercent, 4, 'the accepted 5H still updates');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
