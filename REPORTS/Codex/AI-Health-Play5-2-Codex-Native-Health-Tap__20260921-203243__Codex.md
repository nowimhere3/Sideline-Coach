# AI Health — Play 5.2 · Codex Native Health Tap

## Files changed

- `src/player-control/codex-contract.ts`
- `src/player-control/codex-app-server.ts`
- `src/extension.ts`
- `test/fixtures/fake-codex-app-server.mjs`
- `test/player-control-contract.test.mjs`

## Native read seam

The required Codex compatibility contract now proves the `account/rateLimits/read` client method and its `rateLimits` response field without changing existing turn/item requirements. After compatibility and ChatGPT account validation, each controlled Codex lifecycle performs one non-polling point-in-time read. A valid bounded snapshot emits the existing Play 5.1 Codex evidence envelope; read failure or malformed data does not block control startup.

## Native push seam

The contract now proves the `account/rateLimits/updated` server notification and its `rateLimits` field. The existing app-server notification dispatcher handles the sparse update independently of turn/thread processing. Valid updates merge with the bounded current snapshot at the native top level and within `primary`/`secondary`, preserving known facts without fabricating absent facts.

## Bounded evidence shape

Emitted evidence is exactly `{ provider: 'codex', type: 'account_rate_limits', rate_limits: <bounded native facts> }`. Bounds match the existing health conventions for depth, node count, object keys, arrays, key length, string length, and finite numeric values. Native `usedPercent`, `resetsAt`, `windowDurationMins`, `planType`, and `rateLimitReachedType` survive unchanged when present. Raw app-server frames, stdout/stderr, UUIDs, and unrelated notification properties do not cross. Oversized or malformed snapshots and updates fail closed.

## Forwarding seam

`CodexAppServerFactory` exposes the bounded `onHealthFrame(instanceId, evidence)` callback. The minimal required production wiring in `src/extension.ts` forwards it to the already-existing `StadiumClient.sendHealthEvidence(...)` path. No Authority, store, transport, or daemon ingest path was duplicated.

## Focused tests/results

- `npm run check`: PASS.
- Existing compile command: PASS.
- `node --test test/player-control-contract.test.mjs`: PASS, 16/16.
- Proof covers both contract methods and `rateLimits` fields, initial read, sparse live update, native fact preservation, exclusion of unrelated frame data, fail-closed unbounded evidence, and unchanged progress/completion behavior.
- The full Sideline suite was not run, per the Play 5.2 stop condition.

## Deviations/blockers

One file outside the four primary files was touched: `src/extension.ts`. This is the explicitly permitted smallest callback/wiring change needed to connect the new Codex tap to the existing Stadium health sender. No blocker remains.

## Exact Play 6 handoff

Play 6 can manage any future provider watcher lifecycle around provider-native acquisition while continuing to emit the established bounded `HealthEvidence` union through `StadiumClient.sendHealthEvidence(...)`. Controlled Codex already supplies event-driven `account/rateLimits/updated` plus one initialization read, so Play 6 must not add polling or a duplicate Codex Authority/transport path.

PLAY 5.2 PASS
