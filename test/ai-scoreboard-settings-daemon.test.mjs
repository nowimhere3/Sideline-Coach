import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-scoreboard-settings-'));
}

const request = (port, method, route, token, body) => new Promise((resolve, reject) => {
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const req = http.request({
    hostname: '127.0.0.1', port, method, path: route, agent: false,
    headers: {
      Connection: 'close',
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

test('AI Usage Scoreboard preferences: each field validates, persists, and rejects out-of-allowlist values', async () => {
  const dir = createTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 39720, idleTimeoutMs: 60000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();

    const cases = [
      { field: 'aiScoreboardPlacement', valid: 'top', invalid: 'left', message: /Top or Bottom/ },
      { field: 'aiScoreboardDefaultExpanded', valid: true, invalid: 'yes', message: /Collapsed or Expanded/ },
      { field: 'aiScoreboardPercentMode', valid: 'both', invalid: 'percent', message: /% Left, % Used, or Both/ },
      { field: 'aiScoreboardResetMode', valid: 'countdown', invalid: 'relative', message: /Absolute, Countdown, or Both/ },
      { field: 'aiScoreboardDensity', valid: 'tight', invalid: 'loose', message: /Standard or Tight/ },
      { field: 'aiScoreboardResetMarker', valid: 'icon', invalid: 'emoji', message: /Plain Separator or Reset Icon/ }
    ];

    for (const { field, valid, invalid, message } of cases) {
      const rejected = await post(39720, '/api/preferences', token, { [field]: invalid });
      assert.equal(rejected.status, 400, `${field} rejects ${JSON.stringify(invalid)}`);
      assert.match(rejected.body.message, message);

      const accepted = await post(39720, '/api/preferences', token, { [field]: valid });
      assert.equal(accepted.status, 200, `${field} accepts ${JSON.stringify(valid)}`);
      assert.equal(accepted.body.preferences[field], valid);

      const persisted = await get(39720, '/api/preferences', token);
      assert.equal(persisted.body.preferences[field], valid, `${field} persists across a fresh GET`);
    }
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AI Usage Scoreboard preferences default to bottom/collapsed/left/absolute/standard/separator', async () => {
  const dir = createTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 39721, idleTimeoutMs: 60000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const result = await get(39721, '/api/preferences', token);
    assert.equal(result.body.preferences.aiScoreboardPlacement, 'bottom');
    assert.equal(result.body.preferences.aiScoreboardDefaultExpanded, false);
    assert.equal(result.body.preferences.aiScoreboardPercentMode, 'left');
    assert.equal(result.body.preferences.aiScoreboardResetMode, 'absolute');
    assert.equal(result.body.preferences.aiScoreboardDensity, 'standard');
    assert.equal(result.body.preferences.aiScoreboardResetMarker, 'separator');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a preferences save across a daemon restart survives (file-backed persistence)', async () => {
  const dir = createTempDir();
  let daemon = new ControlPlaneDaemon({ dir, port: 39722, idleTimeoutMs: 60000 });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    await post(39722, '/api/preferences', token, {
      aiScoreboardPlacement: 'top', aiScoreboardPercentMode: 'used', aiScoreboardDensity: 'tight'
    });
    await daemon.stop();

    daemon = new ControlPlaneDaemon({ dir, port: 39722, idleTimeoutMs: 60000 });
    await daemon.start();
    const restarted = await get(39722, '/api/preferences', token);
    assert.equal(restarted.body.preferences.aiScoreboardPlacement, 'top');
    assert.equal(restarted.body.preferences.aiScoreboardPercentMode, 'used');
    assert.equal(restarted.body.preferences.aiScoreboardDensity, 'tight');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
