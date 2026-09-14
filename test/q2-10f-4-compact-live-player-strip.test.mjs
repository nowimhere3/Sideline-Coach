// Q2.10F.4 — compact exact-Player live strip + transient Incoming bridge.
//
// Dynamic lifecycle/report behavior is exercised against the production page in the
// Slice C and E harnesses. These focused guards lock the presentation policy and keep
// future CSS/markup edits from quietly rebuilding the old two-line strip.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizePlayContext } from '../out/play-summary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'src', 'public', 'index.html'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src', 'control-plane', 'router.ts'), 'utf8');
const daemon = fs.readFileSync(path.join(root, 'src', 'control-plane', 'daemon.ts'), 'utf8');
const css = page.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];

test('F.4-1. Live strip is one state | flexible summary | protected right-slot row', () => {
  assert.match(css, /\.play-strip-row \{[^}]*grid-template-columns: max-content minmax\(0, 1fr\) max-content;/);
  assert.match(css, /\.play-strip-summary \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.play-strip-right \{[^}]*justify-content: flex-end;[^}]*white-space: nowrap;/);
  assert.match(script, /row\.appendChild\(state\)[\s\S]*row\.appendChild\(summary\)[\s\S]*row\.appendChild\(right\)[\s\S]*strip\.appendChild\(row\)/);
});

test('F.4-2. Task reminder filters routing front matter deterministically', () => {
  const extraction = script.slice(script.indexOf('const SUMMARY_METADATA_LABELS'), script.indexOf('/** State → human copy'));
  for (const label of ['agent', 'player', 'model', 'effort', 'thinking / reasoning effort', 'role', 'task difficulty', 'thread', 'repository']) {
    assert.match(extraction, new RegExp(`['\"]${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`));
  }
  assert.match(extraction, /const playerTaskSummary = \(value\) =>/);
  assert.doesNotMatch(extraction, /fetch\(|api\(|dispatch|model\/|summari[sz]e/i, 'no model/network summarizer');
});

test('F.4-3. Canonical Working owns the one prominent elapsed ticker', () => {
  assert.match(css, /\.play-strip-elapsed \{[^}]*font-size: 1rem;[^}]*font-variant-numeric: tabular-nums;[^}]*font-weight: 750;[^}]*text-align: right;/);
  assert.equal((script.match(/setInterval\(tickElapsedClocks, 1_000\)/g) || []).length, 1);
  assert.match(script, /clock\.dataset\.elapsedSince = String\(copy\.elapsedSince\)/);
});

test('F.4-4. Finished bridge is canonical-time bounded and reuses exact Incoming acknowledgement', () => {
  assert.match(script, /const isRichFinished = \(view\) =>[\s\S]*age >= 0 && age < RICH_FINISHED_MS/);
  assert.match(script, /case 'finished':[\s\S]*!isRichFinished\(view\)[\s\S]*action: isReportReady\(view\) \? 'view-report'/);
  assert.match(script, /const viewReport = async \(view\) =>[\s\S]*openReportByPath\(path\)[\s\S]*acknowledgeWork\(\{ reportPath: path, instanceId: view\.instanceId, playRef: view\.playRef \}\)/);
  const team = script.slice(script.indexOf('const renderTeamHeader ='), script.indexOf('const setRosterExpanded ='));
  assert.doesNotMatch(team, /REPORT READY/);
});

test('F.4-5. Narrow layout protects the right slot without a floating or overflowing strip', () => {
  assert.match(css, /\.play-strip \{[^}]*overflow: hidden;/);
  assert.match(css, /@media \(max-width: 460px\)[\s\S]*?\.play-strip \{ padding-right: 7px; \}[\s\S]*?\.play-strip-row \{ gap: 8px; \}/);
  const stripRules = css.split('}').filter((rule) => /\.play-strip/.test(rule)).join('}');
  assert.doesNotMatch(stripRules, /position:\s*(fixed|sticky|absolute)/);
});

test('F.4.1-1. Server summary skips routing front matter and never leaves known work blank', () => {
  const prompt = `# AGENT ASSIGNMENT

**AGENT:** Codex
**MODEL:** GPT-5.6 Sol
**THINKING / REASONING EFFORT:** Medium
**ROLE:** Implementation Engineer

# PLAY

Implement:

**Repair the compact Player strip summary.**`;
  assert.equal(summarizePlayContext(prompt), 'Repair the compact Player strip summary.');
  assert.match(router, /promptSummary: summarizePlayContext\(humanPrompt, options\.incomingReportPath \?\? decision\?\.context\?\.reportPath\)/);
});

test('F.4.1-2. Exact known report filename outranks generic prompt text', () => {
  assert.equal(
    summarizePlayContext('Edit the most recent human field proof.', 'REPORTS/Codex/Q2.10F.4-Human-Field-Proof.md'),
    'Q2.10F.4-Human-Field-Proof.md'
  );
  assert.equal(summarizePlayContext('AGENT: Codex\nMODEL: Sol\nEdit the most recent report.'), 'Edit the most recent report.');
  assert.match(daemon, /incomingReportPath: head\.context\?\.reportPath/, 'queued exact report context survives dispatch release');
});

test('F.4.1-3. Thirty-second bridge, restrained focus, and wide View action are presentation policy', () => {
  assert.match(script, /const RICH_FINISHED_MS = 30_000/);
  assert.match(css, /\.play-strip:focus-visible \{[^}]*outline: 1px solid[^}]*box-shadow:/);
  assert.match(css, /\.player\.player-reveal \{[^}]*outline: 2px solid[^}]*box-shadow:/, 'intentional navigation highlight remains stronger');
  assert.match(css, /\.outgoing-ack \.outgoing-ack-view \{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*justify-self: stretch;/);
});
