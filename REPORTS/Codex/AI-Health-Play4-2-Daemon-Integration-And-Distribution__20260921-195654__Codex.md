# AI Health — Play 4.2 · Daemon Integration + Distribution

## Files changed

- `src/control-plane/daemon.ts`
- `test/health-authority-daemon.test.mjs`

## Daemon ownership seam

`ControlPlaneDaemon` constructs exactly one Sideline-global `HealthAuthority` using `fileHealthStateStore(path.join(this.dir, 'ai-health-state.json'))`. The Authority is daemon-scoped rather than Game-scoped. Narrow read-only test/integration accessors expose the single instance and its defensive canonical snapshot.

## Ingest seam

The existing validated `health.evidence` notification path retains its Play 3 per-Game latest-evidence compatibility seam and also passes the same valid bounded `HealthEvidenceParams` to the global Authority. Provider-native facts are not reinterpreted and no routing, threshold, or CONSERVE semantics were added. Exact replay is suppressed by the Authority and therefore causes no false SSE broadcast or persistence schedule.

## Persistence lifecycle

Material Authority changes schedule one debounced save. Normal daemon `stop()` cancels any pending timer and flushes the current canonical snapshot. The clean SIGINT/SIGTERM handler also flushes before removing daemon discovery state and exiting. Authority persistence failures remain non-destructive to in-memory health through the existing Play 4.1 `flush()` contract.

## `/api/ai-health`

The existing authenticated API router now serves `GET /api/ai-health` as `{ success: true, health: <canonical snapshot> }`. Requests without valid existing Control Plane authorization receive the normal HTTP 401 response.

## `ai-health` SSE

The existing `/api/events` stream emits an initial `event: ai-health` containing the current canonical snapshot. Each material Authority change broadcasts `event: ai-health` with the latest snapshot through the existing SSE client set. No additional endpoint or streaming subsystem was created.

## Focused test results

- `npm run check`: PASS.
- `node --test test/health-authority-daemon.test.mjs`: PASS, 1/1.
- `node --test test/stadium-bridge.test.mjs`: PASS, 31/31, including the existing Play 3 health evidence transport test.
- Focused proof covers single daemon ownership, Play 3 ingest, replay suppression for broadcast/save, authorized and unauthorized HTTP behavior, initial and changed SSE events, stop-time flush, and restart restoration.
- The entire Sideline suite was not run, per the Slice 4.2 stop condition.

## Deviations/blockers

None.

## Exact Play 5 handoff seam

Play 5 provider acquisition can produce bounded `HealthEvidenceParams` and enter through the existing validated daemon ingest path, or a future daemon-owned acquisition adapter can call the same single `HealthAuthority.ingest(...)` seam. Canonical distribution and durability are already supplied by `getSnapshot()`, Authority `onChange`, debounced flush, `GET /api/ai-health`, and `ai-health` SSE. Play 5 must preserve provider-native facts and add no duplicate Authority.

PLAY 4.2 PASS
