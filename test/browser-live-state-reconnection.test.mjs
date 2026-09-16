import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/public/index.html', import.meta.url), 'utf8');

test('hello synchronizes canonical status and reports before Connected', () => {
  assert.match(page, /eventSource\.addEventListener\('hello', \(\) => void synchronizeAfterHello\(\)\)/);
  assert.match(page, /const synchronizeAfterHello = async \(\) => \{[\s\S]*?await refresh\(\)[\s\S]*?setConnectionState\('connected'\)/);
  assert.match(page, /Promise\.all\(\[[\s\S]*?api\('\/api\/status'\)[\s\S]*?api\('\/api\/reports'\)/);
  assert.match(page, /renderStatus\(status\);[\s\S]*?renderReports\(reportItems\);/);
});

test('unverified connection disables every live Player mutation and disconnect returns to reconnecting', () => {
  assert.match(page, /const canMutateLiveState = \(\) => connectionState === 'connected'/);
  assert.match(page, /querySelectorAll\('\[data-live-action\]'\)[\s\S]*?control\.disabled = state !== 'connected'/);
  assert.match(page, /id="dispatchBtn" data-live-action/);
  assert.match(page, /button\.dataset\.liveAction = '';/);
  assert.match(page, /eventSource\.onerror = \(\) => \{[\s\S]*?setConnectionState\('reconnecting'\)/);
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
  assert.match(page, /eventSource\.addEventListener\('status', \(event\) => \{[\s\S]*?renderStatus\(status\);[\s\S]*?void refresh\(\);/);
});
