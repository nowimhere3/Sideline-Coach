import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAYER_ADAPTERS, getPlayerAdapter, launchPlan, playerStatus } from '../out/player-adapters.js';

test('Player adapters use durable commands and existing Coach terminal identities', () => {
  assert.deepEqual(PLAYER_ADAPTERS.map(({ id, terminalName, command }) => ({ id, terminalName, command })), [
    { id: 'claude', terminalName: 'Claude', command: 'claude' },
    { id: 'codex', terminalName: 'Codex', command: 'codex --yolo' },
    { id: 'antigravity', terminalName: 'AntiGravity', command: 'agy' }
  ]);
});

test('availability distinguishes ready-on-bench, on-field, and not-available', () => {
  const codex = getPlayerAdapter('codex');
  assert.ok(codex);
  assert.equal(playerStatus(codex, true, []).fieldState, 'ready-on-bench');
  assert.equal(playerStatus(codex, true, ['Codex']).fieldState, 'on-field');
  assert.equal(playerStatus(codex, false, []).fieldState, 'not-available');
});

test('launch plan reuses a Player terminal and otherwise creates it with its adapter command', () => {
  const codex = getPlayerAdapter('codex');
  assert.ok(codex);
  assert.deepEqual(launchPlan(codex, ['Codex']), { action: 'reuse', terminalName: 'Codex' });
  assert.deepEqual(launchPlan(codex, []), { action: 'create', terminalName: 'Codex', command: 'codex --yolo' });
});
