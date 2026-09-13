import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/public/index.html', import.meta.url), 'utf8');
const rosterSource = await readFile(new URL('../src/player-roster.ts', import.meta.url), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const styles = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

test('Q2.9A-1 Recruit, Roster, Incoming, and Dispatcher are separate ordered workflow sections', () => {
  const recruit = page.indexOf('id="recruitCard"');
  const roster = page.indexOf('id="rosterCard"');
  const incoming = page.indexOf('id="incomingCard"');
  const dispatcher = page.indexOf('Play Dispatcher');
  assert.ok(recruit >= 0 && recruit < roster && roster < incoming && incoming < dispatcher);
  assert.doesNotMatch(page, /Check Roster/);
});

test('Q2.9A-2 discovered types cannot create phantom roster cards', () => {
  // Q2.10B: still derived only from real instances; a second pass adds seat-numbered names.
  assert.match(script, /const rawInstances = \(status\.players \|\| \[\]\)\.flatMap\(\(player\) =>\s*\(player\.instances \|\| \[\]\)/);
  assert.match(script, /const instances = rawInstances\.map\(/);
  assert.match(script, /if \(rosterSynchronizing && instances\.length === 0\)[\s\S]*?else if \(instances\.length === 0\)[\s\S]*?No Players added yet/);
  assert.match(script, /for \(const instance of instances\)[\s\S]*?roster\.appendChild\(row\)/);
  assert.doesNotMatch(script, /for \(const player of status\.players \|\| \[\]\)[\s\S]{0,500}?roster\.appendChild/);
});

test('Q2.9A-3 Recruit cards merge running candidates and suppress actions for rostered types', () => {
  assert.match(script, /const rosterTypes = new Set\(instances\.map\(\(instance\) => instance\.playerType\)\)/);
  assert.match(script, /const candidate = onRoster \? undefined : candidatesByType\.get\(entry\.playerType\)/);
  assert.match(script, /makePlayerText\(entry\.displayName, 'Running', candidate\.terminalName\)/);
  assert.match(script, /makeActionButton\('Add to Roster'\)[\s\S]*?'\/api\/players\/adopt'/);
  assert.match(script, /onRoster \? 'on-roster'/);
  assert.doesNotMatch(script, /adopt-banner|Adopt \$\{/);
});

test('Q2.9A-4 one instance has one name-first card with textual and visual field state', () => {
  assert.match(script, /row\.dataset\.instanceId = instance\.instanceId/);
  assert.match(script, /row\.appendChild\(indicator\);[\s\S]*?makePlayerText\(playerDisplayName\(instance\), onField \? 'On Field' : 'On Bench', playerCapability\(instance\)\)/);
  assert.match(script, /text\.appendChild\(name\);[\s\S]*?text\.appendChild\(state\)/);
  assert.match(styles, /data-field-state="on-field"[\s\S]*?background: #22c55e/);
  assert.match(styles, /data-field-state="on-bench"[\s\S]*?border: 3px solid #eab308/);
});

test('Q2.9A-5 field and remove actions share the instance card and hide transport plumbing', () => {
  assert.match(script, /makeActionButton\(onField \? 'Put on Bench' : 'Put on Field'\)[\s\S]*?makeActionButton\('Remove Player'/);
  assert.match(script, /\/bench`[\s\S]*?\/field`[\s\S]*?\/remove`/);
  assert.doesNotMatch(page, /Put Controlled on Field|Take Off Field/);
  assert.doesNotMatch(page, />\s*Legacy\s*</);
});

test('Q2.9A-6 removal uses the ownership-aware Sideline Coach modal, never native confirm', () => {
  assert.match(page, /id="confirmModal"[\s\S]*?role="alertdialog"[\s\S]*?aria-modal="true"/);
  assert.match(script, /Coach created this terminal\. Removing this Player will also close it\./);
  assert.match(script, /will leave your roster[\s\S]*?existing terminal will stay open/);
  assert.match(script, /confirmAction\([\s\S]*?\/remove`/);
  assert.doesNotMatch(script, /window\.confirm|\bconfirm\(/);
  assert.match(script, /event\.key === 'Escape'/);
});

test('Q2.9A-7 Done and chevrons collapse only their own workflow section', () => {
  const finishRecruit = script.match(/const finishRecruit = \(\) => \{([\s\S]*?)\n\s*\};/)?.[1] ?? '';
  const finishRoster = script.match(/const finishRoster = \(\) => \{([\s\S]*?)\n\s*\};/)?.[1] ?? '';
  assert.match(finishRecruit, /setRecruitCollapsed\(true\)/);
  assert.doesNotMatch(finishRecruit, /setRosterCollapsed|api\(|runPlayer/);
  assert.match(finishRoster, /setRosterCollapsed\(true\)/);
  assert.doesNotMatch(finishRoster, /setRecruitCollapsed|api\(|runPlayer/);
  assert.match(script, /recruitToggle'\)\.addEventListener[\s\S]*?rosterToggle'\)\.addEventListener|rosterToggle'\)\.addEventListener[\s\S]*?recruitToggle'\)\.addEventListener/);
});

test('Q2.9A-8 workflow defaults favor Recruit only when the canonical roster is empty', () => {
  assert.match(script, /workflowDefaultsGameId !== currentGameId[\s\S]*?setRecruitCollapsed\(instances\.length > 0\)[\s\S]*?setRosterCollapsed\(false\)/);
});

test('Q2.9A-9 Recruit and Roster use one card system with narrow-width wrapping', () => {
  assert.match(styles, /One card design system for Recruit cards and Roster cards/);
  assert.match(script, /const renderRecruit[\s\S]*?row\.className = 'player'/);
  assert.match(script, /One actual Player instance = one Roster card[\s\S]*?row\.className = 'player'/);
  assert.match(styles, /@media \(max-width: 460px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(styles, /overflow-wrap: anywhere/);
});

test('Q2.9A-10 setup remains human-controlled and carries no credential or trust custody', () => {
  assert.match(script, /makeActionButton\('Continue Setup'\)/);
  assert.match(script, /purpose: 'authenticate'/);
  assert.doesNotMatch(script, /accept.*trust|store.*credential/i);
});

test('Q2.9A-11 removal destruction remains ownership-gated', () => {
  assert.match(rosterSource, /if \(ownership === 'coach-managed'\) \{[\s\S]*?terminal\.dispose\(\)/, 'Coach-owned terminals close');
  assert.match(rosterSource, /if \(adoptedFrom && ownership !== 'coach-managed'[\s\S]*?withRestoredCandidate/, 'adopted processes remain alive and recruitable');
  assert.match(rosterSource, /Coach detached from it and left the terminal running/);
});
