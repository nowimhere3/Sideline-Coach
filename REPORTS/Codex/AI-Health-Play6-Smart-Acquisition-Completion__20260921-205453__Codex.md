# AI Health — Play 6 · Smart Acquisition Completion

## Files changed

- `src/extension.ts`
- `test/health-authority.test.mjs`
- `test/stadium-bridge.test.mjs`

## Claude production wiring

The production Claude registration now supplies `onHealthFrame` to `createClaudeControlFactory(...)` and forwards each bounded native frame through the same existing `stadiumClient?.sendHealthEvidence(instanceId, evidence)` seam already used by Codex. No sender, transport, daemon path, Authority, coordinator, or persistence path was added.

## Acquisition architecture preserved

Claude remains native-push-only through structured-print `rate_limit_event`. Codex remains event-driven through `account/rateLimits/updated` plus its single zero-inference `account/rateLimits/read` during control initialization. Focused source proof confirms neither provider health path introduces acquisition polling, a health watcher, or a watcher manager. Existing persistence debounce timers are unaffected and were not treated as acquisition polling.

## Authority verification

The existing `HealthAuthority.ingest()` already satisfies the required semantics, so `src/control-plane/health-authority.ts` was not modified. Focused proof confirms Player A evidence is accepted, exact same-source replay is suppressed, identical provider facts from a distinct Player/source are accepted, provider facts remain neutral, last-known `resetsAt` remains provider-native, and `observedAt` is Authority ingestion time rather than provider reset time. No synthetic healthy/degraded/critical state or routing policy appears.

## Tests/results

- `npm run check`: PASS.
- Existing compile command: PASS.
- `node --test test/health-authority.test.mjs test/stadium-bridge.test.mjs`: PASS, 39/39.
- Proof includes both Claude and Codex production registrations using the same Stadium sender, existing Play 3 transport behavior, same-source replay suppression, distinct-source acceptance, neutral factual retention, and no health acquisition polling/watcher construction.
- The full Sideline suite was not run, per the Play 6 stop condition.

## Deviations/blockers

None.

## Final AI Health system handoff

Sideline now has one global Health Authority fed by Claude native push and Codex native push plus one initialization read, using one bounded `HealthEvidence` transport, daemon validation, durable last-known factual state, authenticated HTTP projection, and existing SSE distribution. When no native evidence has been observed, absence remains UNKNOWN. Future policy or UI work can consume the canonical snapshot but must remain separate from acquisition and must not reinterpret or replace provider-native facts inside the Authority.

PLAY 6 PASS
