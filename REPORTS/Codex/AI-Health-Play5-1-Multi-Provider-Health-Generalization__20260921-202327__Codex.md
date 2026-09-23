# AI Health — Play 5.1 · Multi-Provider Health Generalization

## Files changed

- `src/control-plane/protocol.ts`
- `src/control-plane/health-authority.ts`
- `src/control-plane/daemon.ts`
- `src/stadium-client.ts`
- `test/health-authority.test.mjs`
- `test/health-authority-daemon.test.mjs`

## Protocol generalization

The common `HealthEvidence` union now contains the existing Claude `rate_limit_event` evidence and Codex `account_rate_limits` evidence. Codex evidence carries bounded provider-native facts in `rate_limits`, including native primary/secondary window facts, `usedPercent`, `resetsAt`, `windowDurationMins`, `planType`, and `rateLimitReachedType` when supplied. No health classification or threshold was added.

## Authority generalization

The single global `HealthAuthority` now supports independent `providers.claude` and `providers.codex` entries in one snapshot. Claude behavior and shape remain unchanged. Codex ingest changes only its provider entry, exact replay suppression is provider-specific, and material Codex changes do not overwrite Claude facts. Both entries retain their own observation timestamp and source provenance.

## Persistence compatibility

Schema version remains 1 because the provider map generalization is additive: an existing valid v1 file with only `providers.claude` remains valid and restores unchanged. New v1 files may additionally contain `providers.codex`. Both providers persist and restore together through the existing atomic store.

## Daemon validation

The existing `health.evidence` receive path now performs provider-specific structural validation for Claude and Codex while sharing the same bounded JSON limits. Codex requires exactly `provider: 'codex'`, `type: 'account_rate_limits'`, and bounded `rate_limits`. Extra or malformed Codex fields fail closed. Valid evidence continues through the same single global Authority.

## Stadium sender change

`StadiumClient.sendHealthEvidence(...)` now accepts the common `HealthEvidence` union. It retains the same `health.evidence` notification and `health.evidence.v1` feature; no second sender or transport was introduced.

## Focused test results

- `npm run check`: PASS.
- Existing compile command: PASS.
- `node --test test/health-authority.test.mjs test/health-authority-daemon.test.mjs`: PASS, 7/7.
- Proof covers unchanged Claude ingest, Codex creation, coexistence, independent updates, Codex replay suppression, joint persistence/restore, valid daemon Codex ingest, malformed fail-closed handling, multi-provider HTTP output, and existing Claude daemon behavior.
- The full Sideline suite was not run, per the Play 5.1 stop condition.

## Deviations/blockers

None.

## Exact Play 5.2 handoff seam

Play 5.2 can translate native `account/rateLimits/read` and `account/rateLimits/updated` results into `{ provider: 'codex', type: 'account_rate_limits', rate_limits: <bounded native facts> }` and call the existing `StadiumClient.sendHealthEvidence(playerInstanceId, evidence)`. The current `health.evidence.v1` transport, daemon validation, single Authority ingest, persistence, authenticated HTTP projection, and SSE distribution require no additional provider-specific path.

PLAY 5.1 PASS
