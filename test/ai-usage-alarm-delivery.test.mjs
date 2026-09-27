import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { deliverVsCodeAlarm } from '../out/alarm-notification.js';
import { getDurableStadiumId } from '../out/game-identity.js';
import { DEFAULT_ALARM_PREFERENCES } from '../out/running-players.js';

const waitFor = async (predicate, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for alarm delivery');
};

const postJson = (port, route, token, body) => new Promise((resolve, reject) => {
  const payload = JSON.stringify(body);
  const request = http.request({
    hostname: '127.0.0.1', port, path: route, method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (response) => {
    let text = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { text += chunk; });
    response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
  });
  request.on('error', reject);
  request.end(payload);
});

const context = (stadiumId) => ({
  game: { gameId: 'game-alarm', displayName: 'Alarm Game', fingerprintSource: 'git-remote', repoUri: 'https://example.test/alarm.git' },
  stadium: { stadiumId, name: 'Alarm Stadium', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId: 'game-alarm', stadiumId, rootFsPath: 'C:\\Alarm', boundAt: Date.now(), isPrimary: true, status: 'bound' }
});

test('AT-9/10 one domain alarm reaches the Stadium bridge and existing SSE path', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-alarm-delivery-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 39731, idleTimeoutMs: 60_000 });
  const stadiumId = getDurableStadiumId(dir);
  const client = new StadiumClient({ dir, port: 39731, instanceId: 'alarm-window', gameContextGetter: () => context(stadiumId) });
  let stream = '';
  let bridged;
  let request;
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    request = http.get({ hostname: '127.0.0.1', port: 39731, path: '/api/events', headers: { Authorization: `Bearer ${token}` } }, (response) => {
      response.on('data', (chunk) => { stream += chunk.toString(); });
    });
    client.on('ai-alarm', (event) => { bridged = event; });
    await client.connect();
    await waitFor(() => stream.includes('event: ai-health'));

    const resetsAt = Math.floor(Date.now() / 1000) + 7200;
    const evidence = (utilization) => ({
      stadiumId, instanceId: 'alarm-window', gameId: 'game-alarm', playerInstanceId: 'claude-health',
      evidence: { provider: 'claude', type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'five_hour', utilization, resetsAt } }
    });
    daemon.healthAuthorityInstance.ingest(evidence(0.78));
    daemon.healthAuthorityInstance.ingest(evidence(0.81));

    await waitFor(() => bridged?.type === 'alarm:threshold_entered');
    await waitFor(() => stream.includes('event: ai-alarm'));
    assert.equal(bridged.message, 'Claude 5H quota low · 19% remaining · resets in 2h');
    assert.match(stream, /event: ai-alarm\ndata: \{"id":"alarm_[a-f0-9]{20}","type":"alarm:threshold_entered"/);
  } finally {
    client.dispose();
    request?.destroy();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('startup missed-boundary alarm is handed to the first VS Code Stadium after daemon restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-alarm-startup-'));
  const reset = Math.floor(Date.now() / 1000) - 5;
  fs.writeFileSync(path.join(dir, 'alarm-state.json'), JSON.stringify({ schemaVersion: 1, rules: {
    'claude:five_hour': { state: 'LOW', enteredAt: new Date(Date.now() - 3600000).toISOString(), horizonResetsAt: reset }
  } }));
  const daemon = new ControlPlaneDaemon({ dir, port: 39732, idleTimeoutMs: 60_000 });
  const stadiumId = getDurableStadiumId(dir);
  const client = new StadiumClient({ dir, port: 39732, instanceId: 'startup-alarm-window', gameContextGetter: () => context(stadiumId) });
  let received;
  try {
    client.on('ai-alarm', (event) => { received = event; });
    await daemon.start();
    await client.connect();
    await waitFor(() => received?.type === 'alarm:reset_boundary_reached');
    assert.equal(received.message, 'Claude 5H window has reset.');
  } finally {
    client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Stage 1B/1C canonical preference route persists thresholds and the browser delivery channel', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-alarm-settings-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 39733, idleTimeoutMs: 60_000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const alarms = {
      ...DEFAULT_ALARM_PREFERENCES,
      channels: { ...DEFAULT_ALARM_PREFERENCES.channels, browser: true },
      thresholds: {
        claude: { fiveHourLowPercent: 24, fiveHourCriticalPercent: 6, weeklyLowPercent: 19, weeklyCriticalPercent: 4 },
        codex: { fiveHourLowPercent: 23, fiveHourCriticalPercent: 7, weeklyLowPercent: 21, weeklyCriticalPercent: 3 }
      }
    };
    const saved = await postJson(39733, '/api/preferences', token, { alarms });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.preferences.alarms.channels.browser, true);
    assert.deepEqual(saved.body.preferences.alarms, alarms);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'preferences.json'), 'utf8')).alarms, alarms);

    const invalid = structuredClone(alarms);
    invalid.thresholds.claude.fiveHourCriticalPercent = 25;
    const rejected = await postJson(39733, '/api/preferences', token, { alarms: invalid });
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.message, /invalid/i);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'preferences.json'), 'utf8')).alarms, alarms, 'invalid update cannot replace saved policy');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AT-9 VS Code adapter selects warning vs information delivery without re-evaluating alarms', () => {
  const calls = [];
  const window = {
    showInformationMessage: (message) => calls.push(['info', message]),
    showWarningMessage: (message) => calls.push(['warning', message])
  };
  deliverVsCodeAlarm(window, { severity: 'warning', message: 'Claude 5H quota low', id: 'a' });
  deliverVsCodeAlarm(window, { severity: 'info', message: 'Claude 5H window has reset.', id: 'b' });
  assert.deepEqual(calls, [
    ['warning', 'Claude 5H quota low'],
    ['info', 'Claude 5H window has reset.']
  ]);
});

test('AT-9/10 host renderers consume ai-alarm and Settings owns Routing & Alarms', () => {
  const extension = fs.readFileSync(new URL('../src/extension.ts', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../src/public/index.html', import.meta.url), 'utf8');
  assert.match(extension, /stadiumClient\.on\('ai-alarm'/);
  assert.match(extension, /deliverVsCodeAlarm\(vscode\.window, event\)/);
  assert.match(html, /source\.addEventListener\('ai-alarm'/);
  assert.match(html, /showToast\(alarm\.message, alarm\.severity === 'critical', 5000\)/);
  assert.match(html, /<h3>Routing &amp; Alarms<\/h3>/);
});
