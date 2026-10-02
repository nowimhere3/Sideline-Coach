import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/public/index.html', import.meta.url), 'utf8');

const sourceBetween = (start, end) => {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `source marker exists: ${start}`);
  assert.notEqual(to, -1, `source marker exists after ${start}: ${end}`);
  return page.slice(from, to);
};

test('hello synchronizes canonical status and reports before Connected', () => {
  const connectEvents = sourceBetween('const connectEvents = () => {', 'const copyText = async (text) => {');
  assert.match(connectEvents, /const (\w+) = new EventSource\('\/api\/events'\);\s*eventSource = \1;/,
    'the locally-owned stream becomes the canonical EventSource');
  const helloHandler = sourceBetween("source.addEventListener('hello'", "source.addEventListener('reports'");
  assert.match(helloHandler, /noteEventActivity\(source\)/);
  assert.match(helloHandler, /void synchronizeAfterHello\(\)/, 'hello reaches canonical synchronization');
  const synchronization = sourceBetween('const synchronizeAfterHello = async () => {', '// Stage 5E: browser-owned SSE recovery.');
  assert.match(synchronization, /setConnectionState\('reconnecting'\)[\s\S]*?if \(await refresh\(\)[\s\S]*?setConnectionState\('connected'\)/,
    'Connected follows a successful canonical refresh');
  assert.match(page, /Promise\.all\(\[[\s\S]*?api\('\/api\/status'\)[\s\S]*?api\('\/api\/reports'\)/);
  assert.match(page, /renderStatus\(status\);[\s\S]*?renderReports\(reportItems\);/);
});

test('unverified connection disables every live Player mutation and disconnect returns to reconnecting', () => {
  assert.match(page, /const canMutateLiveState = \(\) => connectionState === 'connected'/);
  assert.match(page, /querySelectorAll\('\[data-live-action\]'\)[\s\S]*?control\.disabled = state !== 'connected'/);
  assert.match(page, /id="dispatchBtn" data-live-action/);
  assert.match(page, /button\.dataset\.liveAction = '';/);
  const connectEvents = sourceBetween('const connectEvents = () => {', 'const copyText = async (text) => {');
  assert.match(connectEvents, /source\.onerror = \(\) => handleEventStreamFailure\(source\);/,
    'EventSource errors use the canonical Stage 5E failure path');
  const failureHandler = sourceBetween('const handleEventStreamFailure = (source) => {', 'const armEventWatchdog = (source) => {');
  assert.match(failureHandler, /setConnectionState\([^;]*'offline'\s*:\s*'reconnecting'\)/,
    'an online failed stream becomes reconnecting');
  assert.match(failureHandler, /retireEventSource\(source \|\| eventSource\);[\s\S]*?scheduleEventReconnect\(\);/,
    'failure retires the unverified stream before scheduling recovery');
  assert.match(page, /button\.disabled = !canMutateLiveState\(\);/);
});

test('fresh status retains only the exact selected Player instance and never substitutes a sibling', () => {
  assert.match(page, /instances\.some\(\(instance\) => instance\.instanceId === selectedPlayerInstanceId\)/);
  assert.match(page, /selectedPlayerInstanceId = selectedExists \? selectedPlayerInstanceId : '';/);
  // Synchronizing is a distinct state from empty: a connected Stadium that has not
  // yet published a roster must never be rendered as “No Player on field”.
  assert.match(page, /placeholder\.textContent = instances\.length \? 'Choose a Player' : rosterSynchronizing \? 'Synchronizing roster…' : 'No Player on field';/);
  assert.doesNotMatch(page, /instances\[0\]\.instanceId/);
});

test('roster collapse is browser presentation state with an accessible compact live instance summary', () => {
  assert.match(page, /id="rosterToggle"[\s\S]*?type="button"[\s\S]*?aria-controls="roster"[\s\S]*?aria-expanded="true"/);
  assert.match(page, /const setRosterCollapsed = \(collapsed\) => \{[\s\S]*?\$\('roster'\)\.hidden = collapsed;[\s\S]*?aria-expanded[\s\S]*?Expand roster[\s\S]*?Collapse roster/);
  assert.match(page, /rosterToggle'\)\.addEventListener\('click', \(\) => setRosterCollapsed\(!rosterCollapsed\)\)/);
  assert.match(page, /\.roster\[hidden\] \{ display: none; \}/, 'the actual hidden roster body must override its grid display');
  assert.match(page, /const roster = \$\('roster'\);[\s\S]*?roster\.innerHTML = '';[\s\S]*?row\.className = 'player';[\s\S]*?roster\.appendChild\(row\);/, 'the collapse target must be the container that receives Player rows');
  assert.match(page, /\.roster-card\.is-collapsed \{ padding: 10px 16px; \}/);
  assert.match(page, /\.roster-card\.is-collapsed \.roster-summary \{ display: inline; \}/);
});

// Q2.10F.2-C retired the "Players · N On Field" count: the header is TEAM activity from the
// canonical execution store (On Field stays on each card). Behaviour: q2-10f-2-team-activity-player-strips.
test('collapsed TEAM summary derives from canonical execution and refreshes with canonical status', () => {
  assert.match(page, /summary\.textContent = renderTeamHeader\(executionStore\.views, lastInstanceNames\);/);
  assert.match(page, /summary\.textContent = 'TEAM · Synchronizing…';/);
  const statusHandler = sourceBetween("source.addEventListener('status'", "source.addEventListener('execution'");
  assert.match(statusHandler, /noteEventActivity\(source\)/);
  assert.match(statusHandler, /const status = JSON\.parse\(event\.data\);[\s\S]*?renderStatus\(status\);[\s\S]*?renderReports\([^;]+\);[\s\S]*?return;/,
    'a full canonical status event is rendered atomically');
  assert.match(statusHandler, /void refresh\(\);/, 'a lightweight status invalidation requests canonical refresh');
});
