/**
 * P0 — Incoming report return loop.
 *
 * Field regression: Controlled Players wrote reports into "Trend and Tap Assist",
 * but Incoming stayed empty. Two defects stacked at the Stadium boundary:
 *   1. The Stadium's report snapshot filtered by the retired local CoachServer's
 *      persisted selectedGameId (globalState, shared across windows). With GS3
 *      selected anywhere, every other Stadium published ZERO reports.
 *   2. Reports were published only once, at connect. `sendReportChanged` had no
 *      caller and the old watchers lived in CoachServer.start(), which the detached
 *      architecture never runs — so a new report never left the Stadium.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ReportPublisher } from '../out/report-publisher.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, ms = 3_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return true; await wait(20); }
  return false;
}

function fakeHost(globs) {
  const host = {
    globs: [...globs],
    watchers: [],
    configListeners: [],
    getGlobs: () => host.globs,
    createWatcher: (glob, onEvent) => {
      const watcher = { glob, fire: onEvent, disposed: false, dispose() { this.disposed = true; } };
      host.watchers.push(watcher);
      return watcher;
    },
    onReportConfigurationChanged: (listener) => { host.configListeners.push(listener); return { dispose() {} }; }
  };
  return host;
}

// ---------------------------------------------------------------------------
// Stadium report watcher
// ---------------------------------------------------------------------------

test('P0-1. A report landing in the Game is republished automatically; a burst of file events publishes once', async () => {
  const host = fakeHost(['**/Reports/**/*.{md,txt}']);
  const published = [];
  const publisher = new ReportPublisher(host, (reason) => published.push(reason), 30);
  publisher.start();
  assert.deepEqual(host.watchers.map((w) => w.glob), ['**/Reports/**/*.{md,txt}']);

  host.watchers[0].fire(); host.watchers[0].fire(); host.watchers[0].fire();
  assert.equal(published.length, 0, 'debounced, not per event');
  assert.ok(await until(() => published.length === 1));
  await wait(60);
  assert.deepEqual(published, ['report-file-changed']);
  publisher.dispose();
  host.watchers[0].fire();
  await wait(60);
  assert.equal(published.length, 1, 'a disposed publisher is silent');
});

test('P0-2. Changing coach.reportGlobs rebuilds the watchers and republishes — no window reload required', async () => {
  const host = fakeHost(['**/Docs REPORT/**/*.{md,txt}']);
  const published = [];
  const publisher = new ReportPublisher(host, (reason) => published.push(reason), 20);
  publisher.start();
  const original = host.watchers[0];
  host.globs = ['**/Reports/**/*.{md,txt}'];
  host.configListeners.forEach((listener) => listener());
  assert.equal(original.disposed, true, 'old contract no longer watched');
  assert.deepEqual([...publisher.globs], ['**/Reports/**/*.{md,txt}']);
  assert.ok(await until(() => published.includes('report-config-changed')), 'existing reports under the new contract are published');
  host.watchers.at(-1).fire();
  assert.ok(await until(() => published.includes('report-file-changed')));
  publisher.dispose();
});

test('P0-3. A failing publish never breaks later publishing', async () => {
  const host = fakeHost(['**/Reports/**/*.md']);
  let calls = 0;
  const publisher = new ReportPublisher(host, () => { calls += 1; if (calls === 1) throw new Error('offline'); }, 10);
  publisher.start();
  host.watchers[0].fire();
  assert.ok(await until(() => calls === 1));
  await publisher.publishNow('rescan');
  assert.equal(calls, 2);
  publisher.dispose();
});

// ---------------------------------------------------------------------------
// Stadium → Control Plane → API, with Game isolation
// ---------------------------------------------------------------------------

function gameContext(gameId, displayName, stadiumId) {
  return {
    game: { gameId, displayName, fingerprintSource: 'git-remote', repoUri: `https://github.com/example/${gameId}.git` },
    stadium: { stadiumId, name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId, stadiumId, rootFsPath: `C:\\Projects\\${displayName}`, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  };
}
const report = (gameId, file, agent, mtime) => ({ gameId, project: gameId, agent, filename: file, path: `Reports/${agent}/${file}`, mtime, content: `# ${file}` });

test('P0-4. Existing + new reports reach the correct Game in the Control Plane; other Games never see them; Refresh Incoming rescans', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-p0-reports-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 39180, idleTimeoutMs: 60_000 });
  await daemon.start();
  const port = daemon.port;
  const tokenFile = path.join(dir, 'token');
  const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '';
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return { status: response.status, body: await response.json() };
  };
  const stadiumId = getDurableStadiumId(dir);
  const trendReports = [report('game_trend', 'Stage-00-SOP-Onboarding.md', 'Claude', 1000)];
  const gs3Reports = [report('game_gs3', 'GS3-report.md', 'Codex', 500)];
  const trend = new StadiumClient({ port, dir, instanceId: `inst_${stadiumId}_trend`, gameContextGetter: () => gameContext('game_trend', 'Trend and Tap Assist', stadiumId), reportsGetter: async () => [...trendReports] });
  const gs3 = new StadiumClient({ port, dir, instanceId: `inst_${stadiumId}_gs3`, gameContextGetter: () => gameContext('game_gs3', 'GS3', stadiumId), reportsGetter: async () => [...gs3Reports] });
  try {
    assert.ok(await trend.connect());
    assert.ok(await gs3.connect());

    // EXISTING REPORT PROOF: published at connect, under the right Game.
    assert.ok(await until(async () => (await api('/api/reports?gameId=game_trend')).body.length === 1), 'existing report published at connect');
    assert.equal((await api('/api/reports?gameId=game_trend')).body[0].filename, 'Stage-00-SOP-Onboarding.md');

    // GAME ISOLATION PROOF.
    const gs3View = (await api('/api/reports?gameId=game_gs3')).body;
    assert.deepEqual(gs3View.map((r) => r.filename), ['GS3-report.md'], 'GS3 sees only GS3');
    assert.ok(!(await api('/api/reports?gameId=game_trend')).body.some((r) => r.gameId !== 'game_trend'), 'Trend sees only Trend');

    // NEW REPORT PROOF: the Stadium watcher publishes a change without reconnecting.
    trendReports.unshift(report('game_trend', 'Onboarding-Read-Report.md', 'AntiGravity', 2000));
    await trend.publishReportsChanged();
    assert.ok(await until(async () => (await api('/api/reports?gameId=game_trend')).body.length === 2), 'new report reaches the Control Plane');
    assert.equal((await api('/api/reports?gameId=game_trend')).body[0].agent, 'AntiGravity');
    assert.equal((await api('/api/reports?gameId=game_gs3')).body.length, 1, 'still isolated');

    // REFRESH INCOMING: canonical rescan of the named Game's own Stadium.
    trendReports.unshift(report('game_trend', 'Missed-By-Watcher.md', 'Claude', 3000));
    const rescan = await api('/api/reports/rescan', { method: 'POST', body: JSON.stringify({ gameId: 'game_trend' }) });
    assert.equal(rescan.status, 200);
    assert.equal(rescan.body.count, 3);
    assert.match(rescan.body.message, /Incoming refreshed · 3 reports/);
    assert.ok(await until(async () => (await api('/api/reports?gameId=game_trend')).body.length === 3));

    const offline = await api('/api/reports/rescan', { method: 'POST', body: JSON.stringify({ gameId: 'game_not_connected' }) });
    assert.equal(offline.status, 409, 'Unknown is valid: an offline Game is never answered with another Game\'s reports');
  } finally {
    trend.dispose();
    gs3.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Stadium wiring contracts
// ---------------------------------------------------------------------------

test('P0-5. The Stadium scans its OWN Game, never the legacy shared selection, and wires the report watcher', () => {
  const extension = source('src/extension.ts');
  const getter = extension.slice(extension.indexOf('reportsGetter:'), extension.indexOf('addGame:'));
  assert.match(getter, /server\.scanReportsForGame\(gameId, 10\)/);
  assert.match(getter, /resolveGameContextSync\(/);
  assert.doesNotMatch(extension, /scanReports\(10, true\)/, 'the unscoped scan filtered by globalState selectedGameId is gone');
  assert.match(extension, /new ReportPublisher\(/);
  assert.match(extension, /affectsConfiguration\('coach\.reportGlobs'\)/);
  assert.match(extension, /stadiumClient\?\.publishReportsChanged\(\)/);
  assert.match(extension, /reportPublisher\.start\(\)/);

  const server = source('src/server.ts');
  const scoped = server.slice(server.indexOf('async scanReportsForGame'), server.indexOf('reportGlobs(): string[]'));
  assert.match(scoped, /if \(!gameId \|\| gameId === 'unknown'\) return \[\];/, 'unknown Game → no reports, never someone else\'s');
  assert.match(scoped, /this\.scanReports\(limit, true, gameId\)/);

  const client = source('src/stadium-client.ts');
  assert.match(client, /req\.method === 'report\.rescan'/);
});

test('P0-6. Refresh Incoming is a quiet recovery button that rescans the selected Game and reloads its reports', async () => {
  const page = source('src/public/index.html');
  assert.match(page, /id="refreshIncomingBtn"[^>]*>Refresh Incoming</);
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const handler = script.slice(script.indexOf("$('refreshIncomingBtn').addEventListener"), script.indexOf("$('refreshIncomingBtn').addEventListener") + 700);
  assert.match(handler, /api\('\/api\/reports\/rescan', \{ method: 'POST', body: JSON\.stringify\(\{ gameId: currentGameId \|\| undefined \}\) \}\)/);
  assert.match(handler, /await fetchReports\(currentGameId\)/);
  // Normal convergence stays automatic: a Control Plane status event already refreshes reports.
  assert.match(script, /eventSource\.addEventListener\('status', \(\) => void refresh\(\)\)/);
  assert.match(script, /api\('\/api\/reports'\)/);
  assert.ok(vm);
});

test('P0-7. Report agent comes from the folder under Reports/ (or Docs REPORT/), never from the filename', () => {
  const server = source('src/server.ts');
  assert.match(server, /part\.toLowerCase\(\) === 'docs report' \|\| part\.toLowerCase\(\) === 'reports'/);
  assert.match(server, /docsIndex \+ 1 < segments\.length - 1/);
});
