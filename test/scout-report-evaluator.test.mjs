import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { combineDerivedFormationCandidates } from '../out/scout-combine-formation-bridge.js';
import { deriveCombineStatus, reevaluateCombineEvidence } from '../out/scout-combine.js';
import { evaluateScoutReport, SCOUT_EVALUATION_CONTRACT_REVISION } from '../out/scout-interchangeability-runner.js';
import { createScoutPlayEnvelope } from '../out/scout-play.js';

const REQUIRED = 'This report is reconnaissance, not final architectural authority.';
const SECTIONS = ['Executive answer', 'FACTS', 'INFERENCES', 'UNKNOWNS', 'CONTRADICTIONS', 'Relevant files / symbols', 'Recommended next step', 'Provenance'];

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-evaluator-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Scout Only');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"fixture"}\n');
  return { root, gameRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function report(format = (section) => `# ${section}`) {
  return `${REQUIRED}\n${SECTIONS.map((section) => `${format(section)}\n${section === 'FACTS' ? 'Observed package.json.' : 'None.'}`).join('\n')}\n`;
}

function readyAttempt(evaluation) {
  return { completionState: 'COMPLETE', reportCreated: true, readOnlyContractHeld: true, evaluation };
}

test('Evaluator-1. canonical Markdown, plain, colon, bold, and inline Executive answer headings are structural lines', () => {
  const l = layout();
  try {
    const variants = [
      report(),
      report((section) => section),
      report((section) => `${section}:`),
      report((section) => `**${section}**`),
      report((section) => `**${section}:**`),
      report((section) => section === 'Executive answer' ? 'Executive answer: The manifest is package.json.' : `${section}:`)
    ];
    for (const candidate of variants) assert.equal(evaluateScoutReport(candidate, l.gameRoot).reportStructurallyUsable, true);
  } finally { l.cleanup(); }
});

test('Evaluator-2. prose mentions, a missing section, or a missing required statement cannot satisfy the contract', () => {
  const l = layout();
  try {
    const prose = `${REQUIRED}\nThis prose mentions Executive answer, FACTS, INFERENCES, UNKNOWNS, CONTRADICTIONS, Relevant files / symbols, Recommended next step, and Provenance without structural lines. package.json`;
    assert.equal(evaluateScoutReport(prose, l.gameRoot).reportStructurallyUsable, false);
    assert.equal(evaluateScoutReport(report().replace('# Provenance\nNone.\n', ''), l.gameRoot).reportStructurallyUsable, false);
    assert.equal(evaluateScoutReport(report().replace(`${REQUIRED}\n`, ''), l.gameRoot).reportStructurallyUsable, false);
  } finally { l.cleanup(); }
});

test('Evaluator-3. READY requires a report, read-only authority, structure, and real Game evidence; inadequate evidence remains LIMITED', () => {
  const l = layout();
  try {
    const good = evaluateScoutReport(report(), l.gameRoot);
    assert.equal(deriveCombineStatus(readyAttempt(good)), 'READY');
    const noEvidence = evaluateScoutReport(report().replace('Observed package.json.', 'No repository artifact was cited.'), l.gameRoot);
    assert.equal(noEvidence.significantEvidenceMissing !== null, true);
    assert.equal(deriveCombineStatus(readyAttempt(noEvidence)), 'LIMITED');
    assert.equal(deriveCombineStatus({ ...readyAttempt(good), readOnlyContractHeld: false }), 'LIMITED');
    assert.equal(deriveCombineStatus({ ...readyAttempt(good), reportCreated: false }), 'LIMITED');
  } finally { l.cleanup(); }
});

test('Evaluator-4. the preferred Markdown heading contract is explicit in the canonical semantic prompt', () => {
  const l = layout();
  try {
    const envelope = createScoutPlayEnvelope({
      playId: 'prompt-contract', gameRoot: l.gameRoot, taskClass: 'test', objective: 'Inspect package.json.',
      scope: ['Current source.'], nonGoals: ['No writes.'], authority: { mode: 'read-only-reconnaissance', allowed: ['Read.'], denied: ['Write.'] },
      evidenceContract: ['Cite evidence.'], reportContract: { requiredStatement: REQUIRED, sections: SECTIONS }
    });
    assert.match(envelope.semanticPrompt, /Use these Markdown headings on their own lines:\n# Executive answer\n# FACTS/);
    assert.match(envelope.semanticPrompt, /REQUIRED STATEMENT\nThis report is reconnaissance, not final architectural authority\./);
  } finally { l.cleanup(); }
});

test('Evaluator-5. Qwen and Inkling durable reports satisfy the repaired structure and evidence contract', () => {
  const gameRoot = path.resolve('.');
  const runRoot = path.join(gameRoot, 'REPORTS', 'Scout Only', 'Combine', 'Runs', 'Combine__2026-09-18_180021_624_MDT');
  for (const id of ['openrouter-qwen-qwen3.8-27b-free', 'openrouter-thinkingmachines-inkling-free']) {
    const reportText = fs.readFileSync(path.join(runRoot, `${id}-SCOUT-REPORT.md`), 'utf8');
    const evaluation = evaluateScoutReport(reportText, gameRoot);
    assert.equal(evaluation.evaluationContractRevision, SCOUT_EVALUATION_CONTRACT_REVISION);
    assert.equal(evaluation.reportStructurallyUsable, true, id);
    assert.equal(evaluation.significantEvidenceMissing, null, id);
    assert.equal(deriveCombineStatus(readyAttempt(evaluation)), 'READY', id);
  }
});

test('Evaluator-6. evaluator-only requalification preserves reports/history/counters and makes earned READY evidence Formation-eligible', () => {
  const l = layout();
  try {
    const id = 'format-variant';
    const runRoot = path.join(l.durableReportRoot, 'Combine', 'Runs', 'historical-run');
    const scorecards = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    fs.mkdirSync(runRoot, { recursive: true });
    fs.mkdirSync(scorecards, { recursive: true });
    const reportPath = path.join(runRoot, `${id}-SCOUT-REPORT.md`);
    fs.writeFileSync(reportPath, report((section) => `${section}:`));
    const reportHash = crypto.createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex');
    const totals = { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 };
    fs.writeFileSync(path.join(runRoot, 'COMBINE-COMPLETE.json'), JSON.stringify({ attempts: [{ executorId: id, completionState: 'COMPLETE', reportCreated: true, readOnlyContractHeld: true, durableReportPath: reportPath }] }));
    fs.writeFileSync(path.join(scorecards, `${id}.json`), JSON.stringify({
      schemaVersion: 1, candidateId: id, provider: 'openrouter', model: 'openrouter/example/format:free', displayName: 'Format Variant', harness: 'opencode',
      firstSeen: '2026-09-18T00:00:00.000Z', lastSeen: '2026-09-18T00:00:00.000Z', lastTryoutAt: '2026-09-18T00:00:00.000Z', currentStatus: 'LIMITED',
      totals, routeAttempts: { C: { attempts: 1, completions: 1 } }, latestEvidencePaths: [reportPath], latestObservedRoute: 'openrouter/example/format:free', notes: []
    }));

    const result = reevaluateCombineEvidence({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidateIds: [id], now: () => new Date('2026-09-18T01:00:00.000Z') })[0];
    const after = JSON.parse(fs.readFileSync(path.join(scorecards, `${id}.json`), 'utf8'));
    assert.equal(result.status, 'READY');
    assert.equal(after.currentStatus, 'READY');
    assert.deepEqual(after.totals, totals, 'no provider execution counters change');
    assert.deepEqual(after.routeAttempts, { C: { attempts: 1, completions: 1 } });
    assert.equal(after.lastTryoutAt, '2026-09-18T00:00:00.000Z');
    assert.equal(after.evaluationEvidence.priorStatus, 'LIMITED');
    assert.match(after.notes[0], /unchanged durable report.*No provider execution occurred.*original Combine evidence retains the earlier LIMITED observation/);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex'), reportHash, 'historical report bytes are unchanged');
    assert.equal(combineDerivedFormationCandidates(l.durableReportRoot).find((candidate) => candidate.id === id).eligible({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, env: {} }).eligible, true);
  } finally { l.cleanup(); }
});
