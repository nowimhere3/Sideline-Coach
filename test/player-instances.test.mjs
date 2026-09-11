import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerInstanceBook, decidePendingMatch, fieldLabel, isPlayerProvenance } from '../out/player-instances.js';

const startedAt = '2026-09-10T18:31:02.1234567Z';
const provenance = (overrides = {}) => ({ instanceId: 'codex-7f3a91c2', playerType: 'codex', seat: 2, shellPid: 34148, shellStartedAt: startedAt, ...overrides });

test('field labels are presentation-only and omit unknown routing', () => {
  assert.equal(fieldLabel('Codex', 1), 'Codex');
  assert.equal(fieldLabel('Codex', 2), 'Codex 2');
  assert.equal(fieldLabel('Codex', 2, { model: 'Luna', effort: 'Medium' }), 'Codex 2 · Luna · Medium');
  assert.equal(fieldLabel('Codex', 2, { model: 'Luna' }), 'Codex 2 · Luna');
  const instance = new PlayerInstanceBook().allocate('codex');
  assert.match(instance.instanceId, /^codex-[0-9a-f]{8}$/);
});

test('process proof restores only the original identity and is independent of terminal names', () => {
  const record = provenance();
  assert.deepEqual(decidePendingMatch([record], 34148, { exists: true, startedAt }), { kind: 'adopt', record });
  assert.equal(decidePendingMatch([], 34148, { exists: true, startedAt }).kind, 'none', 'a fake Codex 2 has no name-based path');
  assert.equal(decidePendingMatch([record], 34148, { exists: true, startedAt: '2026-09-10T18:32:02.0000000Z' }).kind, 'dead', 'recycled PID is rejected');
  assert.equal(decidePendingMatch([record], 34148, { exists: true }).kind, 'pending', 'unknown start time stays pending');
  assert.equal(decidePendingMatch([record], undefined, { exists: true, startedAt }).kind, 'none', 'undefined PID cannot authorize');
});

test('contradictory provenance fails safe and proven dead records are removable', () => {
  const first = provenance();
  const second = provenance({ instanceId: 'codex-00000001', seat: 3 });
  const contradiction = decidePendingMatch([first, second], 34148, { exists: true, startedAt });
  assert.equal(contradiction.kind, 'contradiction');
  assert.deepEqual(contradiction.records.map((record) => record.instanceId).sort(), [first.instanceId, second.instanceId].sort());
  assert.equal(decidePendingMatch([first], 34148, { exists: false }).kind, 'dead');
});

test('pending seats reserve ordinals and high-water never reuses a removed highest seat', () => {
  const book = new PlayerInstanceBook();
  const one = book.allocate('codex');
  const two = book.allocate('codex');
  const three = book.allocate('codex');
  book.retire(three.instanceId);
  assert.equal(book.allocate('codex').seat, 4);
  book.retire(one.instanceId);
  book.retire(two.instanceId);
  const four = book.byType('codex')[0];
  book.retire(four.instanceId);
  assert.equal(book.reservePending(provenance()), true);
  assert.equal(book.allocate('codex').seat, 3, 'pending Codex 2 reserves its seat');
  book.removePending('codex-7f3a91c2');
  const live = book.byType('codex')[0];
  book.retire(live.instanceId);
  assert.equal(book.allocate('codex').seat, 1, 'an empty type resets to seat 1');
});

test('adoption preserves ID and seat, and live instances remain independently addressable', () => {
  const book = new PlayerInstanceBook();
  const record = provenance();
  assert.equal(book.reservePending(record), true);
  const adopted = book.adopt(record.instanceId, record.playerType, record.seat);
  assert.deepEqual(adopted, { instanceId: record.instanceId, playerType: 'codex', seat: 2 });
  const sibling = book.allocate('codex');
  assert.equal(sibling.seat, 3);
  book.retire(adopted.instanceId);
  assert.equal(book.get(adopted.instanceId), undefined);
  assert.equal(book.get(sibling.instanceId)?.seat, 3);
  assert.deepEqual(Object.keys(book.projections()[0]).sort(), ['fieldLabel', 'instanceId', 'playerType', 'seat']);
});

test('persisted provenance contains exactly the approved proof fields and rejects malformed state', () => {
  const record = provenance();
  assert.equal(isPlayerProvenance(record), true);
  assert.deepEqual(Object.keys(record).sort(), ['instanceId', 'playerType', 'seat', 'shellPid', 'shellStartedAt']);
  assert.equal(isPlayerProvenance({ ...record, terminalName: 'Codex 2' }), false);
  assert.equal(isPlayerProvenance({ ...record, playerType: 'claude' }), false);
  assert.equal(isPlayerProvenance({ ...record, shellStartedAt: 'unknown' }), false);
});
