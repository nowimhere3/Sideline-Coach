/** R4 — behavior-preserving extraction of routing candidate seats. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';
import {
  computeAutoRoute,
  createRoutingPolicies,
  eligibleSeats
} from '../out/routing-policy.js';

const model = (id = 'workhorse') => ({
  id,
  displayName: id,
  isDefault: true,
  supportedEfforts: ['low', 'medium', 'high'],
  defaultEffort: 'medium'
});

function seat(instanceId, playerType, overrides = {}) {
  const { provider = playerType, activeModel, ...rest } = overrides;
  return {
    instanceId,
    playerType,
    transport: 'controlled',
    transportLabel: 'Controlled',
    fieldLabel: playerType,
    state: 'ready',
    executionType: 'reasoning',
    capability: {
      provider,
      authenticated: true,
      observedAt: 1,
      freshness: 'live',
      models: [model(activeModel ?? `${playerType}-model`)]
    },
    ...(activeModel ? { activeModel } : {}),
    ...rest
  };
}

function legacyEligibleIds(candidates, authority, availability) {
  return candidates
    .filter((candidate) => candidate.playerType !== 'terminal' && candidate.executionType !== 'direct-shell')
    .filter((candidate) => authority !== 'auto' || candidate.autoEligible !== false)
    .filter((candidate) => availability !== 'taking-plays' || candidate.state === 'ready' || candidate.state === 'busy')
    .map((candidate) => candidate.instanceId);
}

test('R4-1. extracted seat corpus is order-for-order equivalent to the former eligibility filters', () => {
  const corpus = [
    seat('claude-ready', 'claude'),
    seat('codex-busy', 'codex', { state: 'busy' }),
    seat('future-ready', 'future-player'),
    seat('manual-only', 'future-player', { autoEligible: false }),
    seat('unavailable', 'codex', { state: 'unavailable' }),
    seat('terminal', 'terminal', { transport: 'legacy', executionType: 'direct-shell' }),
    seat('unsupported-shell', 'future-player', { transport: 'legacy', executionType: 'direct-shell' })
  ];

  for (const authority of ['auto', 'context']) {
    for (const availability of ['all', 'taking-plays']) {
      const actual = eligibleSeats(corpus, { authority, availability }).map((candidate) => candidate.instanceId);
      assert.deepEqual(actual, legacyEligibleIds(corpus, authority, availability));
    }
  }
  assert.deepEqual(
    eligibleSeats(corpus, { authority: 'auto', availability: 'taking-plays' }).map((candidate) => candidate.instanceId),
    ['claude-ready', 'codex-busy', 'future-ready'],
    'unavailable, manual-only, Terminal, and unsupported direct-shell entries remain outside ordinary AUTO'
  );
});

test('R4-2. human/context constraints preserve exact seats and live model narrowing', () => {
  const manualOnly = seat('future-manual', 'future-player', {
    autoEligible: false,
    capability: {
      provider: 'future-player', authenticated: true, observedAt: 1, freshness: 'live',
      models: [model('fast'), model('deep')]
    }
  });
  const candidates = [seat('codex', 'codex'), manualOnly];
  const constraints = { source: 'play', playerInstanceId: 'future-manual', model: 'deep', effort: 'high' };

  assert.equal(eligibleSeats(candidates, { authority: 'auto', availability: 'all' }).some((candidate) => candidate.instanceId === manualOnly.instanceId), false);
  const constrained = eligibleSeats(candidates, { authority: 'context', constraints, availability: 'all' });
  assert.equal(constrained.length, 1);
  assert.equal(constrained[0].instanceId, manualOnly.instanceId);
  assert.deepEqual(constrained[0].capability.models.map((candidate) => candidate.id), ['deep']);
});

test('R4-3. resource pool belongs to seat authority, never model branding, and UNKNOWN remains eligible', () => {
  const candidates = [
    seat('claude-direct', 'claude'),
    seat('codex-direct', 'codex'),
    seat('agy-claude-model', 'antigravity', { provider: 'antigravity', activeModel: 'claude-opus-4-6-thinking' }),
    seat('future', 'future-player')
  ];
  const projected = eligibleSeats(candidates, { authority: 'auto', availability: 'taking-plays' });
  assert.deepEqual(projected.map(({ instanceId, resourcePool }) => ({ instanceId, resourcePool })), [
    { instanceId: 'claude-direct', resourcePool: 'claude' },
    { instanceId: 'codex-direct', resourcePool: 'codex' },
    { instanceId: 'agy-claude-model', resourcePool: 'unknown' },
    { instanceId: 'future', resourcePool: 'unknown' }
  ]);
  assert.equal(projected.length, candidates.length, 'unknown/unmetered resource truth is not an eligibility gate');
});

test('R4-4. synthetic supported roster types flow through AUTO without a three-Player assumption', () => {
  const future = seat('future-1', 'future-player');
  const result = computeAutoRoute('game', 'Implement the bounded change', [future], createRoutingPolicies());
  assert.equal(result.error, undefined);
  assert.equal(result.decision?.playerInstanceId, 'future-1');
  assert.equal(result.decision?.provider, 'future-player');
});

test('R4-5. production source has one ordinary reasoning candidate implementation', async () => {
  const mapper = await readFile(resolve('src/routing-candidates.ts'), 'utf8');
  const source = await readFile(resolve('src/routing-policy.ts'), 'utf8');
  const ordinaryFilters = source.match(/candidate\.playerType !== 'terminal' && candidate\.executionType !== 'direct-shell'/g) ?? [];
  assert.equal(ordinaryFilters.length, 1, 'ordinary reasoning admission exists only inside eligibleSeats');
  assert.doesNotMatch(source, /function constrainedCandidates\s*\(/, 'the former parallel constraint path was removed');
  assert.match(source, /eligibleSeats\(everyCandidate/, 'the existing router consumes the extracted seam');
  assert.match(mapper, /resourcePool:\s*resourcePoolForSeat\(candidate\)/, 'RouteSeat uses the R1 seat/pool seam');
});
