# AI Health — Play 3 · Claude Live Tap + Forwarding

## Files changed

- `src/player-control/structured-print.ts`
- `src/control-plane/protocol.ts`
- `src/stadium-client.ts`
- `src/control-plane/daemon.ts`
- `test/fixtures/fake-print-cli.mjs`
- `test/q2-10c-controlled-print.test.mjs`
- `test/stadium-bridge.test.mjs`

## Live tap

`StructuredPrintControl.startTurn` recognizes Claude `rate_limit_event` stdout JSON frames and invokes the optional `onHealthFrame` callback. The frame does not enter or alter `PrintSignal` parsing, so ordinary init, progress, tool, denial, result, and turn completion behavior remains unchanged.

## Bounded payload

The callback receives the Player instance identity and only `{ provider: 'claude', type: 'rate_limit_event', rate_limit_info }`. The `rate_limit_info` object is copied through bounded JSON limits for depth, node count, object keys, arrays, key length, string length, and finite numbers. Claude percentages are preserved as reported. `uuid`, `session_id`, raw stdout, and unrelated frame properties do not cross the seam.

## Stadium notification seam

Stadium hello now advertises `health.evidence.v1`. `StadiumClient.sendHealthEvidence(...)` uses the existing `sendNotification(...)` path with method `health.evidence` and includes the current Stadium id, Stadium session instance id, current Game id, Player instance id, and bounded provider-native evidence.

## Daemon receive seam

`ControlPlaneDaemon.handleWsNotification` accepts `health.evidence` only for the current known session, matching Stadium identity, advertised `health.evidence.v1`, exact current Game binding, a non-empty Player instance id, and a bounded exact Claude evidence envelope. Unknown fields, malformed data, mismatched identity/Game, and missing feature fail closed. Valid evidence is retained in memory as the latest evidence for its Game; no persistence or Health Authority semantics were added.

## Tests/results

- TypeScript compile: PASS.
- Focused tests (`q2-10c-controlled-print` and `stadium-bridge`): PASS, 47/47.
- Proof covers callback invocation, exclusion of `uuid`/`session_id`/raw stdout/unrelated fields, unchanged normal PrintSignal behavior, feature advertisement, Stadium notification delivery, valid daemon receipt, malformed evidence rejection, and missing-feature rejection.
- Existing Sideline suite was run once as required: 1510/1511 passed, 1 failed.
- Sole suite failure: unrelated `F.3-6. Dispatch has one inline acknowledgement and no blocking provider-success toast` in `test/q2-10f-3-dad-mode-projection-friendly-labels.test.mjs`; its pre-existing source-shape regex returned `null` while reading `src/public/index.html`. No Play 3 file or behavior participates in that assertion.

## Deviations/blockers

The full existing suite is not green because of the unrelated F.3-6 failure above. Per instruction, the suite was not rerun and unrelated UI code was not changed. No commit or push was performed.

## Deferred Play 4 work

Health Authority interpretation, provider-limit semantics, normalization, policy decisions, consumer behavior, and persistence remain deferred to Play 4.

PLAY 3 BLOCKED
