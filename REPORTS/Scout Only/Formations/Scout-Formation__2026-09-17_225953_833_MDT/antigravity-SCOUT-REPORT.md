### Executive Answer

Persistence and resumption of Scout-to-Coach continuation across Control Plane replacement is jointly owned by:
1. **Durable Persistence Owner**: [`ScoutContinuationLedger`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L88) via [`fileScoutContinuationStore`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L72), which atomically persists state to `scout-continuations.json` in the Control Plane directory (`this.dir`, default `~/.sideline`).
2. **Orchestration & Resumption Owner**: [`ControlPlaneDaemon`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L126), specifically through:
   - Startup record restoration in [`ScoutContinuationLedger.constructor`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L91-L114), which preserves in-flight Scout turns (`state: 'awaiting-scout'`) if `scoutTurnRef` was acknowledged.
   - Incoming turn notification dispatch in `handleWsNotification` for method `'turn.changed'` ([`daemon.ts#L834-L850`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L834-L850)), which triggers [`continueAfterScout`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2916-L2970) when `turn.instanceId === SCOUT_PLAYER_INSTANCE_ID`.
   - Re-evaluating the current live Team via [`continuationCandidateEvidence`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2972-L3003) and re-dispatching through [`ControlPlaneRouter.dispatch`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L368) with the Scout evidence preamble ([`buildScoutContinuationPreamble`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L248)).

---

### FACTS

1. **Dedicated Atomic File Store**:
   - In [`src/control-plane/daemon.ts#L207-L209`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L207-L209), `this.scoutContinuations` is initialized with `new ScoutContinuationLedger(fileScoutContinuationStore(path.join(this.dir, 'scout-continuations.json')))`.
   - In [`src/control-plane/scout-continuation.ts#L72-L84`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L72-L84), `fileScoutContinuationStore` performs atomic writes by writing to a temporary file (`${file}.${process.pid}.${randomHex}.tmp`) and renaming it to `scout-continuations.json`.
   - Every mutation in `ScoutContinuationLedger` (`stage`, `acceptScout`, `failScoutDelivery`, `recordScoutOutcome`, `beginContinuation`, `stopContinuation`, `recordContinuationDispatch`, `recordContinuationOutcome`) invokes `this.persist()`, immediately writing to disk ([`scout-continuation.ts#L234-L246`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L234-L246)).
   - Bounded retention is enforced at 50 records (`RECORD_LIMIT = 50`, [`scout-continuation.ts#L86`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L86)).

2. **Restart / Replacement Recovery Rules in `ScoutContinuationLedger`**:
   - In [`src/control-plane/scout-continuation.ts#L95-L114`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L95-L114), the constructor reads existing records from disk and applies strict recovery transitions:
     - If `restored.state === 'dispatching'`: transitioned to `'unknown'` with note: *"Coach restarted while continuation dispatch was in flight; delivery outcome is Unknown and was not retried."*
     - If `restored.state === 'awaiting-scout' && !restored.scoutTurnRef`: transitioned to `'unknown'` with note: *"Coach restarted before the Scout turn identity was acknowledged; no automatic continuation was attempted."*
     - If `restored.state === 'awaiting-scout' && restored.scoutTurnRef`: the record **remains in `'awaiting-scout'`**.
     - If `restored.state === 'received'` or `'queued'`: the record retains its state.

3. **Resumption Code Path in `ControlPlaneDaemon`**:
   - In [`src/control-plane/daemon.ts#L841-L849`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L841-L849), when `turn.changed` arrives:
     ```ts
     if (instanceId === SCOUT_PLAYER_INSTANCE_ID) {
       setImmediate(() => void this.continueAfterScout(gameId, p.turn));
     } else if (typeof turn.turnRef === 'string') {
       this.scoutContinuations.recordContinuationOutcome(gameId, turn.turnRef, String(turn.state), turn.summary);
     }
     ```
   - In [`src/control-plane/daemon.ts#L2916-L2970`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2916-L2970), `continueAfterScout`:
     - Calls `this.scoutContinuations.recordScoutOutcome(...)` with `gameId`, `turnRef`, and `outcome`.
     - Validates that `record.state === 'awaiting-scout'` and `record.scoutReportPath` exists.
     - Collects `candidates` from current live registry capabilities via `this.continuationCandidateEvidence(gameId)`.
     - Calls `this.scoutContinuations.beginContinuation(record.id, candidates)`.
     - Dispatches continuation via `this.router.dispatch(...)`.
     - Records dispatch outcome via `this.scoutContinuations.recordContinuationDispatch(record.id, ...)`.

4. **Comparison with Other Control Plane Stores**:
   - **`PlayQueue`** ([`src/control-plane/play-queue.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/play-queue.ts)): Persists to `play-queue.json`. Synchronous atomic writes on mutation. Reconciles `dispatching` to `needs-attention` on restart. Drained explicitly by `drainQueue()` when instances become ready.
   - **`InstanceWorkLedger`** ([`src/control-plane/work-ledger.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/work-ledger.ts)): Persists to `work-ledger.json` via a debounced 250ms timer ([`daemon.ts#L3026-L3038`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L3026-L3038)). Restored on startup via `this.ledger.restore(...)` ([`daemon.ts#L244`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L244)). Activity history is best-effort and in-memory first.
   - **`CoachRoutineEngine`** ([`src/control-plane/coach-routines.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/coach-routines.ts)): Persists to `coach-routines.json`. Debounced 250ms save timer, flushed on immediate changes or shutdown.
   - **`GameFilesystemCoordinator`** ([`src/control-plane/game-filesystem-coordinator.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/game-filesystem-coordinator.ts)): Persists to `game-filesystem.json`. Synchronous atomic file writes on mutation.
   - **`StadiumRegistry`** ([`src/control-plane/stadium-registry.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/stadium-registry.ts)): In-memory only; repopulated dynamically when Stadiums reconnect via `stadium.hello`, `roster.snapshot`, `capability.snapshot`, and `report.snapshot`.

5. **Existing Automated Test Coverage**:
   - [`test/scout-continuation.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/scout-continuation.test.mjs) tests in-memory and live daemon execution of Scout continuation, but **does not test Control Plane replacement or restart mid-flight**.
   - [`test/q2-10d-context-aware-auto.test.mjs#L401`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/q2-10d-context-aware-auto.test.mjs#L401) (`Q2.10D-15`) specifically tests daemon replacement survival for `PlayQueue` (`daemon.stop()`, instantiate replacement daemon on same directory, verify queue item survives and delivers upon reconnect).
   - No test exists in the repository testing `ScoutContinuationLedger` survival across `daemon.stop()` and replacement.

---

### INFERENCES

1. The architecture was deliberately designed for Scout continuation to survive Control Plane replacement:
   - Staging persists before dispatching to the Stadium.
   - Turn acceptance (`scoutTurnRef`) persists immediately upon `dispatch.accepted`.
   - On replacement, records with `awaiting-scout` and a recorded `scoutTurnRef` are kept intact rather than aborted or expired.
2. If replacement occurs while Scout is executing in the Stadium (after `dispatch.accepted` but before `turn.changed`), the replacement daemon is ready to receive `turn.changed` from the reconnected Stadium and complete the continuation without human intervention.

---

### UNKNOWNS

1. **Socket Disconnect Turn Drop**:
   In [`src/stadium-client.ts#L351-L360`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L351-L360):
   ```ts
   sendTurnChanged(turn: unknown): void {
     if (!this.isConnected) return;
     ...
   }
   ```
   If the Scout formation finishes in the Stadium *during the exact disconnection window* while the Control Plane is replacing (before `StadiumClient.reconnect()` establishes the new WebSocket), static code indicates the `turn.changed` notification is silently dropped. Whether the Stadium buffers or retries terminal Scout turns cannot be proven statically because no turn queue exists on `StadiumClient`.
2. Whether real-world replacement timing (typically 50–500ms in tests) causes dropped Scout completions in practice or whether Scout formations (which typically take multiple seconds) virtually always complete while connected.

---

### CONTRADICTIONS

None identified in the static code. The contracts between `router.ts`, `scout-continuation.ts`, `daemon.ts`, and `stadium-client.ts` are internally consistent in data types and lifecycle states.

---

### Relevant Files / Symbols

- [`src/control-plane/scout-continuation.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts):
  - [`ScoutContinuationLedger`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L88)
  - [`fileScoutContinuationStore`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L72)
  - [`ScoutContinuationRecord`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L38)
  - [`buildScoutContinuationPreamble`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/scout-continuation.ts#L248)
- [`src/control-plane/daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts):
  - [`ControlPlaneDaemon`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L126) (constructor lines 207–209)
  - [`continueAfterScout`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2916)
  - [`continuationCandidateEvidence`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2972)
  - `handleWsNotification` (`case 'turn.changed'`, lines 834–853)
- [`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts):
  - `scout-continuation-staged` (line 402)
  - `scout-continuation-accepted` (line 551)
  - `scout-continuation-delivery-failed` (lines 432, 585)
- [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts):
  - [`deliverScout`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L981)
  - [`sendTurnChanged`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L351)
  - [`reconnect`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L501)
- [`test/scout-continuation.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/scout-continuation.test.mjs)
- [`test/q2-10d-context-aware-auto.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/q2-10d-context-aware-auto.test.mjs#L401) (Reference replacement test pattern)

---

### Recommended Next Step

Add a single bounded automated integration test modeled directly after `test/q2-10d-context-aware-auto.test.mjs` test `Q2.10D-15`:
1. Initialize `ControlPlaneDaemon` (Daemon 1) on a temporary directory with a connected `StadiumClient` containing a pending/unresolved Scout formation promise.
2. Dispatch an AUTO Play requiring Scout (`IMPLEMENT_AFTER_RECON`), confirming `scout-continuation-staged` and `scout-continuation-accepted` occur, and verifying `scout-continuations.json` is written with state `'awaiting-scout'` and a valid `scoutTurnRef`.
3. Stop Daemon 1 (`await daemon1.stop()`).
4. Start Daemon 2 (`ControlPlaneDaemon`) targeting the exact same directory.
5. Reconnect `StadiumClient` to Daemon 2, ensuring capabilities are re-announced.
6. Resolve the Scout formation with `COMPLETE` and valid `resultPath`.
7. Assert that Daemon 2 processes `turn.changed`, calls `continueAfterScout`, and delivers the continuation prompt to the non-Scout Player with the durable evidence preamble.

---

### Provenance

- **Play ID**: `Scout-Formation__2026-09-17_225953_833_MDT`
- **Canonical Play Hash**: `sha256:fe86316ceb1daf39cc4d0932e720fdce5225027ddcc8a75b9066ee3343460cfb`
- **Methodology**: Read-only static code and test inspection of `C:\Users\dmcal\Documents\GitHub\SidelineCoach`. No files modified or executed.

---

This report is reconnaissance, not final architectural authority.
