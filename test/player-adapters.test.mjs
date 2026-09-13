import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAYER_ADAPTERS, getPlayerAdapter, launchPlan, playerStatus, providerAdapters, transportLabel } from '../out/player-adapters.js';

test('Player adapters use durable commands and existing Coach terminal identities', () => {
  assert.deepEqual(PLAYER_ADAPTERS.map(({ id, terminalName, command }) => ({ id, terminalName, command })), [
    { id: 'codex', terminalName: 'Codex', command: 'codex --yolo' },
    { id: 'claude', terminalName: 'Claude', command: 'claude' },
    { id: 'antigravity', terminalName: 'AntiGravity', command: 'agy' },
    { id: 'terminal', terminalName: 'Terminal', command: '' }
  ]);
});

test('Terminal is its own Player type, never a costume worn by a provider', () => {
  const terminal = getPlayerAdapter('terminal');
  assert.ok(terminal);
  // It starts nothing and needs no installation: that is what makes it the
  // bootstrap Player Coach can always offer.
  assert.equal(terminal.command, '');
  assert.equal(terminal.alwaysAvailable, true);
  assert.equal(terminal.probeCommand, undefined);
  assert.equal(terminal.hasControlledAdapter, undefined);

  // And it is not a provider: install/authentication paths must not apply to it.
  assert.deepEqual(providerAdapters().map((adapter) => adapter.id), ['codex', 'claude', 'antigravity']);
});

test('transport labels use human vocabulary and never leak "legacy"', () => {
  assert.equal(transportLabel({ controlled: true, playerType: 'codex', ownership: 'coach-managed' }), 'Controlled');
  assert.equal(transportLabel({ controlled: false, playerType: 'terminal', ownership: 'coach-managed' }), 'Terminal');
  assert.equal(transportLabel({ controlled: false, playerType: 'antigravity', ownership: 'adopted' }), 'Adopted');
  assert.equal(transportLabel({ controlled: false, playerType: 'claude', ownership: 'external' }), 'External');
});

test('availability never turns a discovered Player type into a phantom bench Player', () => {
  const codex = getPlayerAdapter('codex');
  assert.ok(codex);
  assert.equal(playerStatus(codex, true, []).fieldState, 'not-on-roster');
  assert.equal(playerStatus(codex, true, ['Codex']).fieldState, 'on-field');
  assert.equal(playerStatus(codex, false, []).fieldState, 'not-on-roster');
  assert.equal(playerStatus(codex, false, []).availability, 'not-available');
});

test('launch plan reuses a Player terminal and otherwise creates it with its adapter command', () => {
  const codex = getPlayerAdapter('codex');
  assert.ok(codex);
  assert.deepEqual(launchPlan(codex, ['Codex']), { action: 'reuse', terminalName: 'Codex' });
  assert.deepEqual(launchPlan(codex, []), { action: 'create', terminalName: 'Codex', command: 'codex --yolo' });
});
