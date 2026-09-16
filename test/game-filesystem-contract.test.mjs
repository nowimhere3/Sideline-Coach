/**
 * S6 — GameFilesystemContract: pure decision algorithm, durable store, and the
 * precedence invariant that an explicit human choice outranks automatic evidence.
 *
 * Nothing in this file touches a Game filesystem: detection decisions are pure.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GAME_FILESYSTEM_SCHEMA_VERSION,
  applyEvidenceToContract,
  createEmptyContract,
  decideReportsRoot,
  decideSopRoot,
  pathsToVerify,
  projectGameSetup,
  recognizeReportRootName,
  recognizeSopRootName,
  sanitizeGameFilesystemEvidence
} from '../out/game-filesystem-contract.js';
import { GameFilesystemCoordinator, fileGameFilesystemStore } from '../out/control-plane/game-filesystem-coordinator.js';

const NOW = '2026-09-15T18:00:00.000Z';
const GAME = 'game_s6';

function evidence(overrides = {}) {
  return {
    gameId: GAME,
    rootResolvable: true,
    reportRootEntries: [],
    nestedReportRoots: [],
    sopRootEntries: [],
    checks: [],
    observedAt: NOW,
    truncated: false,
    ...overrides
  };
}

function reportEntry(name, options = {}) {
  return {
    name,
    recognized: options.recognized ?? name,
    kind: options.kind ?? 'folder',
    safety: options.safety ?? 'ok',
    reportFiles: options.reportFiles ?? 0,
    reportFilesTruncated: options.reportFilesTruncated ?? false
  };
}

function sopEntry(name, options = {}) {
  return { name, recognized: options.recognized ?? name, kind: options.kind ?? 'folder', safety: options.safety ?? 'ok' };
}

const emptyReports = () => createEmptyContract(GAME).reports;
const emptySop = () => createEmptyContract(GAME).sop;

// --- Name recognition ---

test('S6-1 recognizes report root names case-insensitively and rejects look-alikes', () => {
  assert.equal(recognizeReportRootName('Reports-SLC'), 'Reports-SLC');
  assert.equal(recognizeReportRootName('REPORTS'), 'Reports');
  assert.equal(recognizeReportRootName('docs report'), 'Docs REPORT');
  assert.equal(recognizeReportRootName('Reporting'), undefined);
  assert.equal(recognizeReportRootName('Reports-SLC-old'), undefined);
});

test('S6-2 recognizes SOP root names across separator styles only', () => {
  assert.equal(recognizeSopRootName('Onboarding-SOP'), 'Onboarding-SOP');
  assert.equal(recognizeSopRootName('onboarding_docs'), 'Onboarding-Docs');
  assert.equal(recognizeSopRootName('Project SOP'), 'Project SOP');
  assert.equal(recognizeSopRootName('sop'), 'SOP');
  assert.equal(recognizeSopRootName('Onboarding'), undefined);
  assert.equal(recognizeSopRootName('SOP Archive'), undefined);
});

// --- Reports adoption (architecture §7.3) ---

test('S6-3 adopts a lone empty Reports-SLC', () => {
  const decision = decideReportsRoot(emptyReports(), evidence({ reportRootEntries: [reportEntry('Reports-SLC')] }), NOW);
  assert.equal(decision.folder.path, 'Reports-SLC');
  assert.equal(decision.folder.provenance, 'adopted');
  assert.equal(decision.folder.state, 'ready');
  assert.equal(decision.pendingAction, undefined);
});

test('S6-4 adopts a populated Reports', () => {
  const decision = decideReportsRoot(emptyReports(), evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 12 })] }), NOW);
  assert.equal(decision.folder.path, 'Reports');
  assert.equal(decision.folder.provenance, 'adopted');
  assert.equal(decision.folder.verifiedAt, NOW);
});

test('S6-5 adopts legacy Docs REPORT', () => {
  const decision = decideReportsRoot(emptyReports(), evidence({ reportRootEntries: [reportEntry('Docs REPORT', { reportFiles: 3 })] }), NOW);
  assert.equal(decision.folder.path, 'Docs REPORT');
  assert.equal(decision.folder.state, 'ready');
});

test('S6-6 no candidate records the deferred creation intent but never claims a folder', () => {
  const decision = decideReportsRoot(emptyReports(), evidence(), NOW);
  assert.equal(decision.folder.path, undefined);
  assert.equal(decision.folder.state, 'not-set');
  assert.equal(decision.folder.provenance, 'none');
  assert.equal(decision.pendingAction, 'create-reports-slc');
});

test('S6-7 two populated candidates are ambiguous, never guessed', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 4 }), reportEntry('Docs REPORT', { reportFiles: 9 })] }),
    NOW
  );
  assert.equal(decision.folder.state, 'needs-choice');
  assert.equal(decision.folder.path, undefined);
  assert.deepEqual(decision.folder.candidates, ['Docs REPORT', 'Reports']);
});

test('S6-8 an empty folder does not compete with a populated one', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 4 }), reportEntry('Docs REPORT')] }),
    NOW
  );
  assert.equal(decision.folder.path, 'Reports');
  assert.equal(decision.folder.state, 'ready');
});

test('S6-9 a truncated count is never treated as empty', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({
      reportRootEntries: [
        reportEntry('Reports', { reportFiles: 0, reportFilesTruncated: true }),
        reportEntry('Docs REPORT', { reportFiles: 2 })
      ]
    }),
    NOW
  );
  assert.equal(decision.folder.state, 'needs-choice');
});

test('S6-10 Reports-SLC wins only among empty candidates', () => {
  const allEmpty = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports-SLC'), reportEntry('Reports')] }),
    NOW
  );
  assert.equal(allEmpty.folder.path, 'Reports-SLC');

  const legacyPopulated = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports-SLC'), reportEntry('Docs REPORT', { reportFiles: 40 })] }),
    NOW
  );
  assert.equal(legacyPopulated.folder.path, 'Docs REPORT', 'a working legacy root outranks an empty newer name');
});

test('S6-11 two empty non-canonical candidates need a human choice', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports'), reportEntry('Docs REPORT')] }),
    NOW
  );
  assert.equal(decision.folder.state, 'needs-choice');
});

test('S6-12 all three recognized names, one populated, adopt the populated root', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({
      reportRootEntries: [reportEntry('Reports-SLC'), reportEntry('Reports', { reportFiles: 7 }), reportEntry('Docs REPORT')]
    }),
    NOW
  );
  assert.equal(decision.folder.path, 'Reports');
});

test('S6-13 a nested report-bearing root is adopted instead of proposing creation', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({ nestedReportRoots: [{ path: 'docs/Reports', reportFiles: 5 }] }),
    NOW
  );
  assert.equal(decision.folder.path, 'docs/Reports');
  assert.equal(decision.folder.provenance, 'adopted');
  assert.equal(decision.pendingAction, undefined);
});

test('S6-14 a file named Reports-SLC is a collision, never adopted or overwritten', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports-SLC', { kind: 'file' })] }),
    NOW
  );
  assert.equal(decision.folder.state, 'needs-attention');
  assert.equal(decision.folder.attention.code, 'name-collision');
  assert.equal(decision.pendingAction, undefined, 'creation is never proposed over an existing name');
});

test('S6-15 an escaping candidate is not adoptable and the valid sibling still decides', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({
      reportRootEntries: [reportEntry('Reports', { safety: 'escapes-game' }), reportEntry('Docs REPORT', { reportFiles: 2 })]
    }),
    NOW
  );
  assert.equal(decision.folder.path, 'Docs REPORT');
});

test('S6-16 an inaccessible lone canonical candidate becomes Needs Attention', () => {
  const decision = decideReportsRoot(
    emptyReports(),
    evidence({ reportRootEntries: [reportEntry('Reports-SLC', { safety: 'inaccessible' })] }),
    NOW
  );
  assert.equal(decision.folder.state, 'needs-attention');
  assert.equal(decision.folder.attention.code, 'inaccessible');
});

test('S6-17 unresolvable Game root never invents absence', () => {
  const decision = decideReportsRoot(emptyReports(), evidence({ rootResolvable: false }), NOW);
  assert.equal(decision.folder.state, 'unknown');
  assert.equal(decision.pendingAction, undefined);
});

// --- Precedence and vanished roots (architecture §7.3 A/B) ---

test('S6-18 a human choice is never overwritten by new automatic evidence', () => {
  const current = { ...emptyReports(), path: 'Agent Output', provenance: 'human', state: 'ready' };
  const decision = decideReportsRoot(
    current,
    evidence({
      reportRootEntries: [reportEntry('Reports', { reportFiles: 99 }), reportEntry('Reports-SLC', { reportFiles: 5 })],
      checks: [{ path: 'Agent Output', state: 'folder' }]
    }),
    NOW
  );
  assert.equal(decision.folder.path, 'Agent Output');
  assert.equal(decision.folder.provenance, 'human');
  assert.equal(decision.folder.state, 'ready');
});

test('S6-19 a vanished human root becomes Needs Attention with no silent fallback', () => {
  const current = { ...emptyReports(), path: 'Agent Output', provenance: 'human', state: 'ready' };
  const decision = decideReportsRoot(
    current,
    evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 12 })], checks: [{ path: 'Agent Output', state: 'missing' }] }),
    NOW
  );
  assert.equal(decision.folder.path, 'Agent Output');
  assert.equal(decision.folder.state, 'needs-attention');
  assert.equal(decision.folder.attention.code, 'missing');
});

test('S6-20 an adopted root replaced by a file becomes Needs Attention', () => {
  const current = { ...emptyReports(), path: 'Reports', provenance: 'adopted', state: 'ready' };
  const decision = decideReportsRoot(current, evidence({ checks: [{ path: 'Reports', state: 'file' }] }), NOW);
  assert.equal(decision.folder.state, 'needs-attention');
  assert.equal(decision.folder.attention.code, 'not-a-folder');
});

test('S6-21 unknown evidence for a configured root keeps the last decision', () => {
  const current = { ...emptyReports(), path: 'Reports', provenance: 'adopted', state: 'ready', verifiedAt: '2026-09-01T00:00:00.000Z' };
  const decision = decideReportsRoot(current, evidence({ checks: [{ path: 'Reports', state: 'unknown' }] }), NOW);
  assert.equal(decision.folder.state, 'ready');
  assert.equal(decision.folder.verifiedAt, '2026-09-01T00:00:00.000Z');
});

test('S6-22 a vanished Sideline-created root proposes re-creation only when nothing competes', () => {
  const current = { ...emptyReports(), path: 'Reports-SLC', provenance: 'created', state: 'ready' };
  const alone = decideReportsRoot(current, evidence({ checks: [{ path: 'Reports-SLC', state: 'missing' }] }), NOW);
  assert.equal(alone.folder.state, 'needs-attention');
  assert.equal(alone.pendingAction, 'create-reports-slc');

  const contested = decideReportsRoot(
    current,
    evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 3 })], checks: [{ path: 'Reports-SLC', state: 'missing' }] }),
    NOW
  );
  assert.equal(contested.folder.state, 'needs-attention');
  assert.equal(contested.pendingAction, undefined);
  assert.deepEqual(contested.folder.candidates, ['Reports']);
});

// --- SOP (architecture §9) ---

test('S6-23 one strong SOP candidate is detected, several are ambiguous, none is normal', () => {
  const single = decideSopRoot(emptySop(), evidence({ sopRootEntries: [sopEntry('Onboarding-Docs')] }), NOW);
  assert.equal(single.folder.path, 'Onboarding-Docs');
  assert.equal(single.folder.provenance, 'detected');
  assert.equal(single.folder.state, 'ready');

  const several = decideSopRoot(
    emptySop(),
    evidence({ sopRootEntries: [sopEntry('Onboarding-SOP'), sopEntry('Onboarding-Docs')] }),
    NOW
  );
  assert.equal(several.folder.state, 'needs-choice');
  assert.deepEqual(several.folder.candidates, ['Onboarding-Docs', 'Onboarding-SOP']);

  const none = decideSopRoot(emptySop(), evidence(), NOW);
  assert.equal(none.folder.state, 'not-set');
  assert.equal(none.folder.attention, undefined, 'a Game without SOP docs is not an error');
});

test('S6-24 an invalid SOP candidate is not detected and a vanished SOP root needs attention', () => {
  const invalid = decideSopRoot(emptySop(), evidence({ sopRootEntries: [sopEntry('SOP', { kind: 'file' })] }), NOW);
  assert.equal(invalid.folder.state, 'not-set');
  assert.equal(invalid.folder.path, undefined);

  const current = { path: 'Onboarding-SOP', provenance: 'human', state: 'ready' };
  const vanished = decideSopRoot(current, evidence({ checks: [{ path: 'Onboarding-SOP', state: 'missing' }] }), NOW);
  assert.equal(vanished.folder.state, 'needs-attention');
  assert.equal(vanished.folder.path, 'Onboarding-SOP');
});

// --- Contract application and projection ---

test('S6-25 applying evidence keeps lanes, records inspection, and never creates lanes', () => {
  const contract = createEmptyContract(GAME);
  const next = applyEvidenceToContract(contract, evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 1 })] }), NOW);
  assert.equal(next.schemaVersion, GAME_FILESYSTEM_SCHEMA_VERSION);
  assert.deepEqual(next.reports.lanes, {}, 'S6 creates no Player report lanes');
  assert.equal(next.lastInspectedAt, NOW);
  assert.deepEqual(pathsToVerify(next), ['Reports']);
});

test('S6-26 the Dad-facing projection exposes folder, provenance and attention only', () => {
  const contract = applyEvidenceToContract(
    createEmptyContract(GAME),
    evidence({ reportRootEntries: [reportEntry('Reports', { reportFiles: 2 })], sopRootEntries: [sopEntry('Onboarding-SOP')] }),
    NOW
  );
  const view = projectGameSetup(contract, true);
  assert.equal(view.reports.label, 'Reports');
  assert.equal(view.reports.provenance, 'Using existing folder');
  assert.equal(view.sop.provenance, 'Automatically selected');
  assert.equal(view.canChange, true);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes('.sideline'), 'no plumbing paths reach the human projection');
  assert.ok(!serialized.includes('revision'));
  assert.ok(!serialized.includes(GAME));
});

test('S6-27 attention states carry one human sentence', () => {
  const contract = createEmptyContract(GAME);
  contract.reports = { ...contract.reports, path: 'Reports', provenance: 'human', state: 'needs-attention', attention: { code: 'missing' } };
  const view = projectGameSetup(contract, false);
  assert.equal(view.reports.state, 'needs-attention');
  assert.match(view.reports.attention, /missing/);
  assert.equal(view.canChange, false);
});

test('S6-28 malformed or foreign evidence is rejected rather than believed', () => {
  assert.equal(sanitizeGameFilesystemEvidence(GAME, undefined), undefined);
  assert.equal(sanitizeGameFilesystemEvidence(GAME, { gameId: 'other_game', rootResolvable: true }), undefined);
  const sanitized = sanitizeGameFilesystemEvidence(GAME, {
    gameId: GAME,
    rootResolvable: true,
    reportRootEntries: [reportEntry('Reports'), { name: 'Nope' }, reportEntry('Whatever', { recognized: 'Whatever' })],
    nestedReportRoots: [{ path: 'Reports', reportFiles: 3 }, { path: 'docs/Reports', reportFiles: 2 }],
    checks: [{ path: 'Reports', state: 'folder' }, { path: 'x', state: 'nonsense' }],
    observedAt: NOW
  });
  assert.equal(sanitized.reportRootEntries.length, 1);
  assert.equal(sanitized.nestedReportRoots.length, 1, 'a root-level path is not a nested root');
  assert.equal(sanitized.checks.length, 1);
});

// --- Durable store ---

function storeHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-store-'));
  const file = path.join(dir, 'game-filesystem.json');
  const warnings = [];
  return {
    dir,
    file,
    warnings,
    store: () => fileGameFilesystemStore(file, (message) => warnings.push(message)),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

function coordinator(harness, evidenceByGame, options = {}) {
  return new GameFilesystemCoordinator(harness.store(), {
    now: () => new Date(NOW),
    warn: (message) => harness.warnings.push(message),
    evidenceProvider: async ({ gameId, checkPaths }) => {
      const provide = evidenceByGame[gameId];
      return typeof provide === 'function' ? provide(checkPaths) : provide;
    },
    ...options
  });
}

test('S6-29 absent state loads cleanly and each Game keeps its own contract', async () => {
  const harness = storeHarness();
  try {
    const coach = coordinator(harness, {
      game_a: evidence({ gameId: 'game_a', reportRootEntries: [reportEntry('Reports', { reportFiles: 2 })] }),
      game_b: evidence({ gameId: 'game_b', reportRootEntries: [reportEntry('Docs REPORT', { reportFiles: 1 })] })
    });
    assert.equal(coach.get('game_a'), undefined);
    await coach.reconcile('game_a');
    await coach.reconcile('game_b');
    assert.equal(coach.get('game_a').reports.path, 'Reports');
    assert.equal(coach.get('game_b').reports.path, 'Docs REPORT');

    const persisted = JSON.parse(fs.readFileSync(harness.file, 'utf8'));
    assert.equal(persisted.schemaVersion, GAME_FILESYSTEM_SCHEMA_VERSION);
    assert.deepEqual(Object.keys(persisted.games).sort(), ['game_a', 'game_b']);
  } finally {
    harness.cleanup();
  }
});

test('S6-30 contracts survive a Control Plane replacement and do not depend on selection', async () => {
  const harness = storeHarness();
  try {
    const first = coordinator(harness, { game_a: evidence({ gameId: 'game_a', reportRootEntries: [reportEntry('Reports', { reportFiles: 3 })] }) });
    await first.reconcile('game_a');
    const revision = first.get('game_a').revision;

    const replacement = coordinator(harness, {});
    assert.equal(replacement.get('game_a').reports.path, 'Reports');
    assert.equal(replacement.get('game_a').revision, revision);
  } finally {
    harness.cleanup();
  }
});

test('S6-31 an unchanged decision does not burn a revision; a real change does', async () => {
  const harness = storeHarness();
  try {
    let current = evidence({ gameId: 'game_a', reportRootEntries: [reportEntry('Reports', { reportFiles: 3 })] });
    const coach = coordinator(harness, { game_a: () => current });
    const first = await coach.reconcile('game_a');
    assert.equal(first.changed, true);
    assert.equal(first.contract.revision, 1);

    const second = await coach.reconcile('game_a');
    assert.equal(second.changed, false);
    assert.equal(second.contract.revision, 1);

    current = evidence({ gameId: 'game_a', checks: [{ path: 'Reports', state: 'missing' }] });
    const third = await coach.reconcile('game_a');
    assert.equal(third.changed, true);
    assert.equal(third.contract.revision, 2);
    assert.equal(third.contract.reports.state, 'needs-attention');
  } finally {
    harness.cleanup();
  }
});

test('S6-32 unusable evidence keeps the durable answer instead of guessing', async () => {
  const harness = storeHarness();
  try {
    const coach = coordinator(harness, {
      game_a: evidence({ gameId: 'game_a', reportRootEntries: [reportEntry('Reports', { reportFiles: 1 })] })
    });
    await coach.reconcile('game_a');

    const offline = coordinator(harness, { game_a: undefined });
    const result = await offline.reconcile('game_a');
    assert.equal(result.inspected, false);
    assert.equal(result.reason, 'no-evidence');
    assert.equal(result.contract.reports.path, 'Reports');
  } finally {
    harness.cleanup();
  }
});

test('S6-33 evidence answered for another Game is discarded', async () => {
  const harness = storeHarness();
  try {
    const coach = coordinator(harness, {
      game_a: evidence({ gameId: 'game_b', reportRootEntries: [reportEntry('Reports', { reportFiles: 9 })] })
    });
    const result = await coach.reconcile('game_a');
    assert.equal(result.reason, 'wrong-game');
    assert.equal(result.contract.reports.path, undefined);
    assert.ok(harness.warnings.some((message) => message.includes('Discarded')));
  } finally {
    harness.cleanup();
  }
});

test('S6-34 a human choice survives later detection, and Use automatic restores detection', async () => {
  const harness = storeHarness();
  try {
    const coach = coordinator(harness, {
      game_a: evidence({ gameId: 'game_a', reportRootEntries: [reportEntry('Reports', { reportFiles: 5 })], checks: [{ path: 'Agent Output', state: 'folder' }] })
    });
    await coach.reconcile('game_a');
    assert.equal(coach.get('game_a').reports.provenance, 'adopted');

    coach.recordHumanChoice('game_a', 'reports', 'Agent Output');
    await coach.reconcile('game_a');
    assert.equal(coach.get('game_a').reports.path, 'Agent Output');
    assert.equal(coach.get('game_a').reports.provenance, 'human');

    coach.clearChoice('game_a', 'reports');
    await coach.reconcile('game_a');
    assert.equal(coach.get('game_a').reports.path, 'Reports');
    assert.equal(coach.get('game_a').reports.provenance, 'adopted');
  } finally {
    harness.cleanup();
  }
});

test('S6-35 unreadable state is quarantined instead of crashing the daemon', async () => {
  const harness = storeHarness();
  try {
    fs.writeFileSync(harness.file, '{ not json', 'utf8');
    const coach = coordinator(harness, { game_a: evidence({ gameId: 'game_a' }) });
    assert.equal(coach.get('game_a'), undefined);
    assert.ok(fs.existsSync(`${harness.file}.bak`));
    const result = await coach.reconcile('game_a');
    assert.equal(result.contract.reports.state, 'not-set');
  } finally {
    harness.cleanup();
  }
});

test('S6-36 an unsupported schema is quarantined and names the human choices that must be re-made', () => {
  const harness = storeHarness();
  try {
    fs.writeFileSync(
      harness.file,
      JSON.stringify({ schemaVersion: 99, games: { game_a: { gameId: 'game_a', reports: { provenance: 'human', path: 'Agent Output' } } } }),
      'utf8'
    );
    const coach = coordinator(harness, {});
    assert.equal(coach.get('game_a'), undefined);
    assert.ok(harness.warnings.some((message) => message.includes('game_a')));
  } finally {
    harness.cleanup();
  }
});

test('S6-37 concurrent reconciles for one Game coalesce', async () => {
  const harness = storeHarness();
  try {
    let inspections = 0;
    const coach = coordinator(harness, {
      game_a: () => {
        inspections += 1;
        return evidence({ gameId: 'game_a', reportRootEntries: [reportEntry('Reports', { reportFiles: 1 })] });
      }
    });
    await Promise.all([coach.reconcile('game_a'), coach.reconcile('game_a'), coach.reconcile('game_a')]);
    assert.ok(inspections <= 2, `expected coalesced inspections, saw ${inspections}`);
    assert.equal(coach.get('game_a').reports.path, 'Reports');
  } finally {
    harness.cleanup();
  }
});
