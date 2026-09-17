import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateReadiness, freshVerificationPlayId, verificationScoutPlay, verifyScoutPlayer } from '../out/scout-player-verification.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-player-verify-'));
  const gameRoot = path.join(root, 'Game With Spaces');
  const workspaceRoot = path.join(root, 'Scout Workspaces');
  const durableReportRoot = path.join(root, 'Durable Scout Evidence');
  fs.mkdirSync(path.join(gameRoot, 'FILE examples'), { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'FILE examples', 'Skool Chat Test.txt'), 'function createHash(sender, text, timestamp) { return sender.length; }\n');
  return { root, gameRoot, workspaceRoot, durableReportRoot };
}

function report() {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\ncreateHash computes identity.\n# FACTS\nFILE examples/Skool Chat Test.txt defines createHash(sender, text, timestamp).\n# INFERENCES\nThe short hash may collide.\n# UNKNOWNS\nRuntime collision frequency.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nFILE examples/Skool Chat Test.txt — createHash.\n# Recommended next step\nNo action for this verification.\n# Provenance\nCurrent Game file.\n`;
}

function attempt(overrides = {}) {
  return {
    scoutPlayId: 'verify', canonicalPlayHash: 'sha256:x', semanticPromptHash: 'sha256:y', player: 'AntiGravity', executorId: 'antigravity', harness: 'AntiGravity CLI', provider: 'AntiGravity', model: 'gemini-3.8-flash-medium', effort: 'medium', taskClass: 'player-readiness-verification', queuedAt: '2026-09-16T14:00:00.000Z', startedAt: '2026-09-16T14:00:01.000Z', endedAt: '2026-09-16T14:00:02.000Z', durationMs: 1000, completionState: 'COMPLETE', processExitCode: 0, terminationSignal: null, reportCreated: true, readOnlyContractHeld: true, stdoutPath: 'stdout', stderrPath: 'stderr', reportPath: 'report', durableReportPath: 'durable', evaluation: { reportStructurallyUsable: true, significantEvidenceMissing: null, obviousUnsupportedClaim: null, needsDeeperReview: true, existingGameArtifactObserved: 'FILE examples/Skool Chat Test.txt' }, ...overrides
  };
}

test('fresh verification identity is automatic, Calgary-local, and provider-neutral Play stays bounded', () => {
  const l = layout();
  try {
    const id = freshVerificationPlayId('antigravity', new Date('2026-09-16T14:15:16.123Z'));
    assert.equal(id, 'TTA-Scout-Verify-AntiGravity__2026-09-16_081516_123_MDT');
    const play = verificationScoutPlay(id, l.gameRoot);
    assert.equal(play.playId, id);
    assert.equal(play.authority.mode, 'read-only-reconnaissance');
    assert.equal(JSON.stringify(play).includes('gemini'), false);
    assert.match(play.objective, /Skool Chat Test\.txt/);
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('READY requires model, clean lifecycle, authority, real Game evidence, and report contract together', () => {
  assert.equal(evaluateReadiness(attempt()).state, 'READY');
  assert.equal(evaluateReadiness(attempt({ model: undefined })).state, 'UNKNOWN');
  assert.equal(evaluateReadiness(attempt({ completionState: 'FAILED', processExitCode: 1, failureBoundary: 'provider rejected' })).state, 'NEEDS ATTENTION');
  assert.equal(evaluateReadiness(attempt({ completionState: 'UNKNOWN', processExitCode: null })).state, 'UNKNOWN');
  assert.equal(evaluateReadiness(attempt({ evaluation: { ...attempt().evaluation, existingGameArtifactObserved: null } })).state, 'UNKNOWN');
  assert.equal(evaluateReadiness(attempt({ evaluation: { ...attempt().evaluation, reportStructurallyUsable: false } })).state, 'NEEDS ATTENTION');
});

test('one verification action creates a fresh Play, evidence, and reusable latest state', async () => {
  const l = layout();
  const seen = [];
  const executor = {
    id: 'antigravity', player: 'AntiGravity', harness: 'fixture', provider: 'AntiGravity',
    async execute(envelope) {
      seen.push(envelope.play.playId);
      return { state: 'COMPLETE', stdout: report(), stderr: '', model: 'gemini-3.8-flash-medium', effort: 'medium', startedAt: '2026-09-16T14:15:16.000Z', endedAt: '2026-09-16T14:15:17.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
    }
  };
  try {
    const result = await verifyScoutPlayer({ player: 'antigravity', gameRoot: l.gameRoot, workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, executor, now: () => new Date('2026-09-16T14:15:16.123Z') });
    assert.equal(result.state, 'READY');
    assert.equal(result.realGameRead, 'VERIFIED');
    assert.equal(result.scoutAuthority, 'VERIFIED');
    assert.equal(result.lastReception, 'PASS');
    assert.equal(seen[0], result.playId);
    assert.ok(fs.existsSync(path.join(result.evidencePath, 'PLAYER-VERIFICATION.json')));
    const latest = JSON.parse(fs.readFileSync(path.join(l.durableReportRoot, 'Player Verification', 'antigravity.json'), 'utf8'));
    assert.equal(latest.playId, result.playId);
    assert.equal(latest.state, 'READY');
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('verification recreates its owned durable Play directory before artifact writes', async () => {
  const l = layout();
  const executor = {
    id: 'antigravity', player: 'AntiGravity', harness: 'fixture', provider: 'AntiGravity',
    async execute(envelope) {
      // Reproduce the field failure: the Play root existed at launch but was
      // absent when the completed report was ready to persist.
      fs.rmSync(path.join(l.durableReportRoot, envelope.play.playId), { recursive: true, force: true });
      return { state: 'COMPLETE', stdout: report(), stderr: '', model: 'gemini-3.8-flash-medium', effort: 'medium', startedAt: '2026-09-16T14:15:16.000Z', endedAt: '2026-09-16T14:15:17.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
    }
  };
  try {
    const result = await verifyScoutPlayer({ player: 'antigravity', gameRoot: l.gameRoot, workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, executor, now: () => new Date('2026-09-16T14:15:16.123Z') });
    assert.equal(result.state, 'READY');
    assert.ok(fs.existsSync(path.join(result.evidencePath, 'antigravity-SCOUT-REPORT.md')));
    assert.ok(fs.existsSync(path.join(result.evidencePath, 'PLAYER-VERIFICATION.json')));
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});
