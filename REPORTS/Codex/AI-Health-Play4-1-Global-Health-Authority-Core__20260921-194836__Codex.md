# AI Health — Play 4.1 · Global Health Authority Core

## Files changed

- `src/control-plane/health-authority.ts`
- `test/health-authority.test.mjs`

## Authority state shape

The global schema-v1 snapshot contains an optional global `updatedAt` and a provider map. Claude state retains the provider, native evidence type, unchanged bounded `rateLimitInfo`, factual `observedAt`, and source provenance: Stadium id, Stadium session instance id, Game id, and Player instance id. It contains no routing classification, CONSERVE decision, threshold, or invented health status.

## Ingest behavior

`HealthAuthority.ingest()` accepts valid bounded `HealthEvidenceParams`, defensively copies provider-native facts, and replaces the canonical Claude observation when facts or source provenance materially change. Exact replay returns `false`, does not advance timestamps, and does not invoke `onChange`. A material change returns `true` and invokes `onChange` with a defensive snapshot. `getSnapshot()` also returns a defensive copy.

## Persistence behavior

`fileHealthStateStore()` defaults to `~/.sideline/ai-health-state.json`. Missing state starts clean. Current valid schema restores. Corrupt JSON and unsupported/malformed schemas are quarantined to a `.bak` file and start clean. Saves use a unique same-directory temporary file followed by rename; failed saves remove only their own temporary file. `flush()` reports failure without changing valid in-memory Authority state.

## Focused test results

- `npm run check`: PASS.
- `node --test test/health-authority.test.mjs`: PASS, 5/5 tests.
- Coverage proves all twelve requested behaviors: missing state, valid Claude ingest, unchanged provider facts, neutral/no invented policy, replay suppression, factual replacement, defensive snapshots, atomic valid JSON, restore, corrupt quarantine, newer-schema fail-closed quarantine, and persistence-failure memory safety.
- The TypeScript output required by the focused Node test was compiled; the entire Sideline suite was not run, per Slice 4.1 instructions.

## Deviations/blockers

None.

## Exact Slice 4.2 handoff seam

Slice 4.2 can construct one daemon-owned `HealthAuthority` with `fileHealthStateStore()`; pass each daemon-validated `health.evidence` notification to `ingest(params)`; call `flush()` according to daemon durability lifecycle; use `onChange(snapshot)` to drive the future SSE projection; and use `getSnapshot()` for the future `GET /api/ai-health` response. No Game-scoped Authority or provider interpretation is required.

PLAY 4.1 PASS
