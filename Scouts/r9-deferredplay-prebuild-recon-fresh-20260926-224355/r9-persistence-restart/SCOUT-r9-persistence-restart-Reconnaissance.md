Now I have a thorough understanding of the codebase. Let me compile the complete reconnaissance report.

---

# SCOUT REPORT: R9 DeferredPlay Persistence & Restart Survival Reconnaissance

**Play ID:** r9-deferredplay-prebuild-recon-fresh-20260926-224355  
**Scout ID:** r9-persistence-restart  
**Assigned Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Status:** RECONNAISSANCE ONLY — not final architectural authority

---

## RESULT

This report identifies the exact existing Sideline Coach seams for R9 DeferredPlay persistence and restart survival. The architecture already contains **multiple atomic JSON stores**, a **durable PlayQueue with lifecycle states**, **startup recovery hooks**, and **cancellation patterns** — all reusable by R9 with minimal new code.

---

## KEY DISCOVERIES

### 1. Existing Atomic JSON Store Pattern (FACT)

**Location:** `src/control-plane/play-queue.ts:50-62`, `src/control-plane/alarm-state-store.ts:40-70`, `src/control-plane/coach-routines.ts:163-188`, `src/control-plane/game-filesystem-coordinator.ts:43-81`, `src/control-plane/health-authority.ts:68-109`, `src/control-plane/scout-continuation.ts:76-88`

All durable stores follow the **identical atomic write pattern**:
```typescript
const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
fs.renameSync(temp, file);  // atomic on POSIX/Windows
```

**Load** handles `ENOENT` gracefully (returns `undefined`), invalid JSON is quarantined to `.bak`, and **save** is best-effort with in-memory truth preserved.

---

### 2. fileQueueStore / PlayQueue — Closest Persistence Analogue (FACT)

**Location:** `src/control-plane/play-queue.ts:1-189`

| Aspect | Current Implementation |
|--------|------------------------|
| **States** | `queued` \| `dispatching` \| `needs-attention` (3 states) |
| **Persistence** | `fileQueueStore(path)` → atomic JSON at `~/.sideline/play-queue.json` |
| **Schema** | `{ version: 1, items: QueuedPlay[] }` |
| **Startup Recovery** | Constructor loads file; `dispatching` items → `needs-attention` with explicit message: *"Coach can't tell whether this queued Play started before Coach restarted. Check the Player, then send it again or cancel it."* (line 93-95) |
| **Cancellation** | `cancel(id, gameId?)` — only allowed when NOT `dispatching` (line 178-184) |
| **Human Retry** | `retry(id, gameId?)` — only clears `needs-attention` (line 169-176) |
| **FIFO per Instance** | `head(gameId, playerInstanceId)` returns next item; blocked head blocks tail |
| **Sequence** | Monotonic `seq` for ordering across restarts |

**R9 Gap:** PlayQueue has no `waiting` (time-gated), `firing` (in-flight with known turnRef), `handed-off` (Scout continuation bound), or `cancelled` (terminal) states.

---

### 3. Startup / Shutdown / Recovery Hooks (FACT)

**Daemon Startup** (`src/control-plane/daemon.ts:889-1001`):
1. `ensureInstallIdentity()` — creates/recover install identity (line 900-903)
2. `licenseSource.reload()` — binds license to identity (line 909)
3. **Grandfathering** active Games from Ledger history (line 914-923)
4. `PlayQueue` constructed with `fileQueueStore` — **auto-recovers** queued items (line 641)
5. `WorkLedger.restore()` from `work-ledger.json` (line 679)
6. `HealthAuthority` + `AlarmEngine.start()` — reconciles clock horizons (line 988)
7. `RemoteMinuteMeter.readEpisode()` — restores grace episode so **restart never grants fresh grace** (line 122, `remote-minute-meter.ts:274-283`)
8. `TelemetryOutbox.load()` — recovers pending events (line 174-198)

**Daemon Shutdown** (`src/control-plane/daemon.ts:1044-1115`):
1. `syncRelayClient()` — stops tunnel first
2. Flushes: routines, health, telemetry outbox (`whenIdle()`), Claude/Codex usage readers
3. Closes SSE, WS, HTTP servers
4. Removes discovery record **only if owns it** (line 1188-1200)

**Signal Handlers** (`src/control-plane/daemon.ts:1225-1243`):
- `SIGINT`/`SIGTERM` → flush routines, health, remove discovery, `process.exit(0)`

---

### 4. Daemon Initialization & Durable State Ownership (FACT)

**Single Source of Truth:** `ControlPlaneDaemon` owns all durable stores as private fields, constructed in constructor (lines 489-686):
- `playQueue` → `play-queue.json`
- `ledger` → `work-ledger.json` (in-memory only, serialized on change)
- `routines` → `coach-routines.json`
- `healthAuthority` → `ai-health-state.json`
- `alarmEngine` → `alarm-state.json`
- `gameFilesystem` → `game-filesystem.json`
- `scoutContinuations` → `scout-continuations.json`
- `deviceRegistry` → `remote/devices.json`
- `webPush` → `web-push/` directory
- `remoteMeter` → `entitlement/remote-meter.json`
- `telemetryOutbox` → `telemetry/outbox.jsonl`

**Freshness Guard** (`daemon.ts:260-266, 501-508`): `buildId` (hash of daemonScriptPath), `instanceNonce`, `supersedes[]`, `replacementReason` — successor daemon reads same files.

---

### 5. Crash/Restart Handling Patterns (FACT)

| Component | Restart Behavior |
|-----------|-----------------|
| **PlayQueue** | `dispatching` → `needs-attention` with explanatory message; `queued` items preserved in order |
| **WorkLedger** | `currentPlay` → `recentPlays` with `recoveryCandidate: true` + `outcome: 'unknown'` (line 402-403); `workState` → `'unknown'` (line 419) |
| **AlarmEngine** | `reconcileClockHorizons()` audits missed resets, adopts current health **without replaying old threshold alarms** (line 95-96) |
| **RemoteMinuteMeter** | `readEpisode()` restores grace episode; `mark()` fills ≤2 min gaps only (line 237-240) |
| **ScoutContinuationLedger** | `dispatching` → `unknown` with note; `awaiting-scout` without `scoutTurnRef` → `unknown` (lines 107-113) |
| **GameFilesystemCoordinator** | Keeps last durable decision; re-reconciles on Stadium reconnect (line 204-205) |
| **TelemetryOutbox** | Loads pending events, deduplicates by `eventId`, drops >7 days / >5000 / >2MB (lines 179-198) |

---

### 6. Cancellation Patterns (FACT)

| Pattern | Location | Behavior |
|---------|----------|----------|
| **PlayQueue.cancel()** | `play-queue.ts:178-184` | Only if NOT `dispatching`; returns cancelled item |
| **Queue HTTP API** | `daemon.ts:2679-2691` | `POST /api/queue/:id/cancel` → `playQueue.cancel()` + ledger mutation |
| **ScoutContinuation.stopContinuation()** | `scout-continuation.ts:188-194` | Sets `state='stopped'` with note |
| **RelayClient.cancel()** | `relay-client.ts:296-302` | Cancels in-flight frames, adapter emits `end` |
| **RemoteMinuteMeter.clearEpisode()** | `remote-minute-meter.ts:262-266` | Deletes grace file when allowance restored |
| **TelemetryOutbox.discardPending()** | `outbox.ts:128-133` | Clears records + deletes file on consent OFF |

**Key Principle:** Cancellation is **explicit human action** or **definitive failure** — never automatic on restart.

---

### 7. Scheduler / State-Machine Helpers Reusable by R9 (FACT)

| Helper | Location | Reusable For R9 |
|--------|----------|-----------------|
| **Atomic Store Factory** | `fileQueueStore`, `fileAlarmStateStore`, `fileCoachRoutineStore`, `fileGameFilesystemStore`, `fileHealthStateStore`, `fileScoutContinuationStore` | ✅ Direct pattern — copy for `fileDeferredPlayStore` |
| **Ledger `onChange` + Debounced Persist** | `daemon.ts:5004-5034` (`scheduleLedgerSave`, `scheduleRoutineSave`, `scheduleHealthSave`) | ✅ Pattern: `setTimeout(250ms)` + `unref()` |
| **AlarmEngine Timer Scheduling** | `alarm-engine.ts:227-245` | ✅ `setTimer`/`clearTimer` seams for time-gated transitions |
| **RemoteMinuteMeter Checkpoint Timer** | `remote-minute-meter.ts:139, 161, 268-272` | ✅ 60s interval with `unref()` |
| **DrainQueue Concurrency Guard** | `daemon.ts:5046-5048` (`drainingQueues` Set) | ✅ Prevents re-entrant processing per `(gameId, instanceId)` |
| **ScoutContinuation State Machine** | `scout-continuation.ts:17-27` (11 states) | ✅ Reference for `waiting→firing→handed-off→completed/failed` |

---

## ANSWERS TO BOUNDED QUESTIONS

### 1. What can R9 reuse directly? (FACT)

| Reusable Component | How R9 Uses It |
|-------------------|----------------|
| **Atomic JSON store pattern** | `fileDeferredPlayStore(file)` — identical to `fileQueueStore` |
| **PlayQueue lifecycle + persistence** | Extend `QueuedPlayState` to add `waiting` \| `firing` \| `handed-off` \| `cancelled`; reuse constructor recovery logic |
| **Daemon constructor store initialization** | Add `this.deferredPlays = new DeferredPlayStore(fileDeferredPlayStore(...))` |
| **Startup recovery** | `DeferredPlayStore` constructor loads file; map legacy states per R9 rules |
| **Debounced persist (`scheduleXxxSave`)** | `scheduleDeferredPlaySave()` — 250ms debounce, `unref()` |
| **Cancellation API pattern** | `POST /api/deferred-play/:id/cancel` mirroring queue cancel |
| **Drain/processing guard** | `drainingDeferredPlays` Set per `(gameId, playerInstanceId)` |
| **AlarmEngine timer seam** | For `waiting` → `firing` time-gated transitions (reuse `setTimer`/`clearTimer` test seams) |
| **ScoutContinuation bindQueueRelease** | For `handed-off` → `firing` when queue releases |

---

### 2. What genuinely needs to be new? (INFERENCE)

| New Component | Reason |
|---------------|--------|
| **`DeferredPlay` type** | Distinct from `QueuedPlay`: adds `fireAt`, `scheduleId`, `idempotencyKey`, `parentPlayId?`, `handoffTarget?` |
| **`DeferredPlayState` enum** | `waiting` \| `firing` \| `handed-off` \| `needs-attention` \| `cancelled` (5 states vs 3) |
| **`DeferredPlayStore` class** | New state machine: time-gated `waiting→firing`, dispatch → `firing`, queue release → `handed-off`, terminal → `cancelled`/`needs-attention` |
| **Time-gated scheduler** | Background timer that scans `waiting` items where `fireAt <= now` → marks `firing` + dispatches |
| **Idempotency key dedupe** | Prevents duplicate scheduling from retries/restarts (store `idempotencyKey` in record) |
| **Startup recovery rules for new states** | `firing` → `needs-attention` (unknown dispatch outcome); `handed-off` → `waiting` (re-queue) or `needs-attention` |
| **HTTP API endpoints** | `POST /api/deferred-play` (schedule), `POST /api/deferred-play/:id/cancel`, `GET /api/deferred-play` |
| **Integration with Router** | `router.dispatch({ ..., deferredPlayId, fireAt? })` — router returns `turnRef` for `handed-off` binding |

---

### 3. Highest-Risk Persistence/Restart Edge Cases (INFERENCE / ARCHITECT DECISION REQUIRED)

| Edge Case | Risk | Mitigation |
|-----------|------|------------|
| **`firing` item at restart** | Coach cannot know if dispatch succeeded (same as PlayQueue `dispatching`) | Map to `needs-attention` with explicit message; **require human retry/cancel** |
| **`handed-off` item at restart** | Queue item exists but turnRef not yet bound | On startup: if `continuationQueueItemId` exists but no `turnRef` → re-scan PlayQueue; if queue item gone → `needs-attention` |
| **Clock skew / suspended laptop** | `fireAt` in past by hours/days | **Do NOT** fire immediately; treat as `needs-attention` with "scheduled time passed while Coach was offline" |
| **Duplicate scheduling** | Human clicks "Schedule" twice; restart replays scheduling | **Idempotency key** (hash of `gameId+playerInstanceId+prompt+fireAt`) deduped at store level |
| **Grace episode + DeferredPlay interaction** | Remote access grace expires while DeferredPlay waiting | DeferredPlay is **local-only**; remote grace irrelevant — but document clearly |
| **Schema migration** | Future R9 state additions | **Versioned schema** (`{ version: 1, items: ... }`) like PlayQueue; constructor handles `version !== 1` gracefully |
| **Concurrent daemon replacement** | Freshness Guard starts new daemon before old stops | Discovery record ownership check (`pid` + `instanceNonce`) prevents double-write; stores use `process.pid` in temp filename |

---

### 4. Smallest Safe DeferredPlay Store Shape (FACT / INFERENCE)

```typescript
// File: ~/.sideline/deferred-plays.json
{
  "version": 1,
  "items": [
    {
      "id": "dp_abc123",
      "scheduleId": "sched_xyz789",           // human-readable, stable across restarts
      "idempotencyKey": "sha256(gameId|instanceId|prompt|fireAt)",
      "gameId": "game_1",
      "playerInstanceId": "inst_1",
      "playerType": "controlled",
      "prompt": "Refactor the auth module...",
      "model": "claude-3.5-sonnet",
      "effort": "high",
      "playLabel": "Auth refactor",
      "reason": "Scheduled for 2026-09-27 09:00",
      "context": { "reportPath": "/path/report.md", "preamble": "..." },
      "fireAt": 1790518800000,                // epoch ms
      "queuedAt": 1790432400000,
      "seq": 42,
      "state": "waiting",                     // waiting | firing | handed-off | needs-attention | cancelled
      "attention": undefined,
      "turnRef": undefined,                   // set when firing → dispatch acknowledged
      "continuationQueueItemId": undefined,   // if handed-off to PlayQueue
      "parentPlayId": undefined,              // if spawned from a Play
      "createdAt": 1790432400000,
      "updatedAt": 1790432400000
    }
  ]
}
```

**Store Interface** (mirrors `QueueStore`):
```typescript
interface DeferredPlayStore {
  load(): { version: 1; items: DeferredPlay[] } | undefined;
  save(items: readonly DeferredPlay[]): void;
}
```

**Constructor Recovery Rules:**
| Persisted State | Startup Mapping |
|-----------------|-----------------|
| `waiting` | `waiting` (if `fireAt > now`) / `needs-attention` (if `fireAt <= now`) |
| `firing` | `needs-attention` — *"Coach restarted while this DeferredPlay was being dispatched. Check the Player, then retry or cancel."* |
| `handed-off` | Scan PlayQueue for `continuationQueueItemId`; if found & `turnRef` missing → `waiting` (re-queue); if gone → `needs-attention` |
| `needs-attention` | `needs-attention` (preserved) |
| `cancelled` | **Not persisted** — cancelled items removed from store |

---

### 5. Exact Files/Functions Implementation Worker Should Touch / Avoid (FACT)

#### TOUCH — Primary Implementation Targets

| File | Function/Class | Purpose |
|------|----------------|---------|
| `src/control-plane/play-queue.ts` | `fileQueueStore`, `PlayQueue` | **Reference only** — copy atomic pattern, extend state machine |
| `src/control-plane/daemon.ts` | Constructor (lines 489-686), `start()` (889-1001), `stop()` (1044-1115) | Add `deferredPlayStore` field, construct `DeferredPlayStore`, wire `scheduleDeferredPlaySave` |
| `src/control-plane/daemon.ts` | `drainQueue` (5046-5118) | **Reference** — model `drainDeferredPlays` after this |
| `src/control-plane/daemon.ts` | HTTP handlers (2679-2701) | Add `/api/deferred-play/*` endpoints mirroring queue API |
| `src/control-plane/scout-continuation.ts` | `ScoutContinuationLedger`, `bindQueueRelease` | **Reference** — model `handed-off` → `firing` binding |
| `src/control-plane/alarm-engine.ts` | `setTimer`/`clearTimer` seams (lines 85-87, 227-245) | **Reuse** for time-gated `waiting→firing` scheduler |
| `src/control-plane/remote-minute-meter.ts` | `readEpisode`/`writeEpisode` (274-295) | **Reference** — grace episode persistence pattern |

#### TOUCH — New Files to Create

| New File | Contents |
|----------|----------|
| `src/control-plane/deferred-play.ts` | `DeferredPlay`, `DeferredPlayState`, `DeferredPlayStore`, `fileDeferredPlayStore`, `DeferredPlayScheduler` |
| `src/control-plane/deferred-play-scheduler.ts` | Background timer scanning `waiting` items, marking `firing`, calling `router.dispatch()` |

#### AVOID — Do Not Modify

| File | Reason |
|------|--------|
| `src/control-plane/play-queue.ts` | **Do not change** `QueuedPlayState` or `PlayQueue` semantics — R9 mandate: "no rewrite of PlayQueue semantics" |
| `src/control-plane/router.ts` | Router changes only via new `deferredPlayId`/`fireAt` fields in dispatch input — no core logic changes |
| `src/control-plane/daemon.ts` | Do not modify existing store initialization order or shutdown sequence — only **add** new store |
| `src/telemetry/outbox.ts` | Telemetry unchanged |
| `src/commercial/*` | Entitlement/licensing unchanged |

---

## EPISTEMIC LABELS SUMMARY

| Claim | Label |
|-------|-------|
| Atomic JSON store pattern exists in 6+ stores | **FACT** |
| PlayQueue has 3 states, recovers `dispatching`→`needs-attention` | **FACT** |
| Daemon startup recovers all durable stores automatically | **FACT** |
| `drainQueue` is the queue processing model | **FACT** |
| AlarmEngine timer seams are testable/reusable | **FACT** |
| R9 needs new `DeferredPlay` type + 5-state machine | **INFERENCE** |
| `firing`→`needs-attention` on restart is correct mapping | **INFERENCE** |
| Idempotency key prevents duplicate scheduling | **INFERENCE** |
| Clock skew handling requires Architect decision | **ARCHITECT DECISION REQUIRED** |
| Schema migration strategy for future states | **ARCHITECT DECISION REQUIRED** |
| Whether `handed-off` re-queues or needs-attention | **ARCHITECT DECISION REQUIRED** |

---

## LIMITATIONS

1. **Read-only reconnaissance** — no code executed, no tests run, no integration verified
2. **Daemon.ts is 5457 lines** — some private methods may have been missed in grep scans
3. **No Scout SOP/ROASTER found at expected path** — `Project SOP/Scout SOP and ROASTER/` contains `Sideline-Coach-Free-Scout-Selection-and-Invocation-SOP.md` and `Scout-V1` directory; followed general Scout principles
4. **R9 "DeferredPlay" not yet in codebase** — this is pre-build reconnaissance for a not-yet-implemented feature
5. **Cross-process locking not examined** — atomic `renameSync` is POSIX/Windows atomic but no advisory locking for concurrent daemons

---

## IMPORTANT FILES / PATHS

| Path | Role |
|------|------|
| `src/control-plane/play-queue.ts` | Primary reference for atomic store + lifecycle |
| `src/control-plane/daemon.ts` | Daemon lifecycle, store wiring, HTTP API, `drainQueue` |
| `src/control-plane/scout-continuation.ts` | Reference for `handed-off` binding pattern |
| `src/control-plane/alarm-engine.ts` | Reference for timer-based state transitions |
| `src/control-plane/remote-minute-meter.ts` | Reference for grace episode persistence |
| `src/control-plane/alarm-state-store.ts` | Minimal atomic store template |
| `src/control-plane/coach-routines.ts` | Template for Game-scoped durable state with debounced persist |
| `~/.sideline/play-queue.json` | Runtime location of PlayQueue (for manual inspection) |
| `~/.sideline/control-plane.json` | Freshness Guard discovery record |
| `~/.sideline/work-ledger.json` | Instance Work Ledger history |

---

**End of Reconnaissance Report**  
*Scout evidence is reconnaissance, not final architectural authority.*
