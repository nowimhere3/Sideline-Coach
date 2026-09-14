// Q2.10F.3 — North-Star Dad-mode projection + friendly label repair.
//
// Lifecycle rendering is exercised with the production page in the updated Slice C/E/F
// suites. This file locks the shared identity/presentation contract and the field-failure
// seams that cut across daemon, router, roster and browser code.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { friendlyInstanceNames, projectFriendlyRoster } from '../out/player-display-labels.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const page = read('src/public/index.html');
const daemon = read('src/control-plane/daemon.ts');
const router = read('src/control-plane/router.ts');
const rosterSource = read('src/player-roster.ts');
const labelsSource = read('src/player-display-labels.ts');

const roster = (name, instances) => [{ name, instances }];

test('F.3-1. Friendly labels are generic, contiguous current-roster presentation', () => {
  assert.deepEqual([...friendlyInstanceNames(roster('Claude', [{ instanceId: 'c1', seat: 8 }]))], [['c1', 'Claude']]);
  assert.deepEqual([...friendlyInstanceNames(roster('Claude', [{ instanceId: 'c2', seat: 9 }, { instanceId: 'c1', seat: 3 }]))], [['c1', 'Claude 1'], ['c2', 'Claude 2']]);
  assert.deepEqual([...friendlyInstanceNames(roster('AntiGravity', [
    { instanceId: 'a3', seat: 17 }, { instanceId: 'a1', seat: 2 }, { instanceId: 'a2', seat: 11 }
  ]))], [['a1', 'AntiGravity 1'], ['a2', 'AntiGravity 2'], ['a3', 'AntiGravity 3']]);
  assert.deepEqual([...friendlyInstanceNames(roster('Future Player', [{ instanceId: 'f9', seat: 99 }, { instanceId: 'f2', seat: 2 }]))], [['f2', 'Future Player 1'], ['f9', 'Future Player 2']]);
});

test('F.3-2. Removing or adding siblings recompacts names without changing exact identity', () => {
  const initial = [{ instanceId: 'a-old', seat: 2 }, { instanceId: 'a-middle', seat: 7 }, { instanceId: 'a-new', seat: 12 }];
  assert.deepEqual([...friendlyInstanceNames(roster('AntiGravity', initial)).values()], ['AntiGravity 1', 'AntiGravity 2', 'AntiGravity 3']);
  const withoutFirst = initial.slice(1);
  assert.deepEqual([...friendlyInstanceNames(roster('AntiGravity', withoutFirst))], [['a-middle', 'AntiGravity 1'], ['a-new', 'AntiGravity 2']]);
  const withoutMiddle = [initial[0], initial[2]];
  assert.deepEqual([...friendlyInstanceNames(roster('AntiGravity', withoutMiddle))], [['a-old', 'AntiGravity 1'], ['a-new', 'AntiGravity 2']]);
  const added = [...withoutFirst, { instanceId: 'a-latest', seat: 41 }];
  assert.deepEqual([...friendlyInstanceNames(roster('AntiGravity', added))], [['a-middle', 'AntiGravity 1'], ['a-new', 'AntiGravity 2'], ['a-latest', 'AntiGravity 3']]);
  assert.deepEqual(added.map((item) => item.instanceId), ['a-middle', 'a-new', 'a-latest'], 'presentation never mutates machine identity');
});

test('F.3-3. Projected labels are Game-local and do not mutate Stadium roster truth', () => {
  const gameA = [{ name: 'Claude', instances: [{ instanceId: 'shared-looking-a', seat: 4, fieldLabel: 'Claude 4' }, { instanceId: 'a2', seat: 9, fieldLabel: 'Claude 9' }] }];
  const gameB = [{ name: 'Claude', instances: [{ instanceId: 'shared-looking-b', seat: 4, fieldLabel: 'Claude 4' }] }];
  const projectedA = projectFriendlyRoster(gameA);
  const projectedB = projectFriendlyRoster(gameB);
  assert.deepEqual(projectedA[0].instances.map((item) => item.displayName), ['Claude 1', 'Claude 2']);
  assert.deepEqual(projectedB[0].instances.map((item) => item.displayName), ['Claude']);
  assert.equal(gameA[0].instances[0].displayName, undefined);
  assert.equal(gameA[0].instances[0].fieldLabel, 'Claude 4');
  assert.equal(projectedA[0].instances[0].instanceId, 'shared-looking-a');
});

test('F.3-4. One shared label projection feeds daemon, router, roster and browser exact-id lookup', () => {
  assert.match(daemon, /projectFriendlyRoster\(this\.registry\.getRosterForGame\(selectedGameId\)\)/);
  assert.match(router, /friendlyInstanceNames\(session\.roster\)\.get\(targetPlayerInstanceId/);
  assert.match(rosterSource, /private displayLabel\(instanceId: string\)/);
  assert.match(rosterSource, /friendlyInstanceNames\(roster\)\.get\(instanceId\)/);
  assert.match(page, /currentPlayerDisplayLabel\(attempt\.playerInstanceId, attempt\.playerName\)/);
  assert.match(page, /lastInstanceNames\.get\(instanceId\)/);
  assert.doesNotMatch(page, /instances\.length > 1 \? `\$\{base\} \$\{index \+ 1\}`/, 'browser no longer owns a competing compaction algorithm');
  assert.match(labelsSource, /stable seats only order siblings/i);
});

test('F.3-5. Dad-mode policy hides terminal history but preserves current live/actionable states', () => {
  const headerPolicy = page.slice(page.indexOf('const renderTeamHeader ='), page.indexOf('const setRosterExpanded ='));
  assert.match(page, /const NEEDS_YOU_STATES = new Set\(\['needs-you'\]\)/);
  assert.match(page, /case 'couldnt-finish':[\s\S]*case 'unknown':[\s\S]*return null/);
  assert.match(page, /case 'finished':[\s\S]*!isRichFinished\(view\)[\s\S]*return null/, 'Finished is bounded by canonical time, not persistent history');
  assert.match(page, /const quietAdjunctText = \(\) => ''/);
  assert.ok(headerPolicy.length > 0);
  assert.doesNotMatch(headerPolicy, /REPORT READY/);
  assert.match(page, /case 'starting':[\s\S]*case 'working'/);
  assert.match(page, /case 'queued'/);
  assert.match(page, /case 'needs-you'/);
  assert.match(page, /setInterval\(tickElapsedClocks, 1_000\)/);
});

test('F.3-6. Dispatch has one inline acknowledgement and no blocking provider-success toast', () => {
  const submit = page.match(/const submitDispatch = async \(\) => \{[\s\S]*?\n      \};\n\n      \$\('dispatchBtn'\)/)[0];
  assert.match(page, /head: `✓ Play sent to \$\{name\}`/);
  assert.match(page, /View \$\{currentName\}/);
  assert.doesNotMatch(submit, /showToast\(reply\.message|Play sent to \$\{name\}|Dispatch accepted/);
  assert.doesNotMatch(page, /Dispatch accepted by Stadium provider/);
  assert.doesNotMatch(router, /Dispatch accepted by Stadium provider/);
  assert.match(page, /\.toast \{[\s\S]*?pointer-events: none;/);
  assert.match(page, /id="executionAnnouncer"[^>]*aria-live="polite"/, 'removing toast duplication keeps accessible transition acknowledgement');
});

test('F.3-7. Managed terminal names use current presentation labels without becoming identity', () => {
  assert.match(rosterSource, /createTerminal\(\{ name: this\.displayLabel\(record\.instanceId\)/);
  assert.match(rosterSource, /createControlledPresentation\(record\.instanceId, displayLabel/);
  assert.match(rosterSource, /createControlledPresentation\(record\.instanceId, this\.displayLabel\(record\.instanceId\)/);
  assert.doesNotMatch(rosterSource, /terminal\.name\s*=/, 'VS Code Terminal.name is read-only; live Players are never recreated for cosmetics');
  assert.match(rosterSource, /private readonly controlledByInstance = new Map<string, ControlledPresentation>/, 'routing remains exact-id based');
});
