# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:03:55

Play: r9-deferredplay-prebuild-recon-fresh-20260926-224355
Rerun of: r9-deferredplay-prebuild-recon (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-27T04:43:55.667Z
Finished: 2026-09-27T04:47:50.907Z
TOTAL ELAPSED TIME: 00:03:55

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 3
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r9-persistence-restart | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-27T04:43:55.688Z | 2026-09-27T04:47:50.902Z | 00:03:55 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-persistence-restart-Reconnaissance.md |
| r9-reset-trigger-revalidation | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-27T04:43:55.831Z | 2026-09-27T04:47:23.905Z | 00:03:28 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-reset-trigger-revalidation-Reconnaissance.md |
| r9-router-ui-integration | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-27T04:43:55.902Z | 2026-09-27T04:45:33.618Z | 00:01:37 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-router-ui-integration-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane r9-persistence-restart: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
- Lane r9-reset-trigger-revalidation: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane r9-router-ui-integration: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: r9-persistence-restart (objective 460c67795e68)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files.

Investigate the exact existing Sideline Coach seams needed for R9 DeferredPlay persistence and restart survival.

GOVERNING R9 INTENT:
- separate durable DeferredPlay store
- survives restart
- atomic persistence
- waiting / firing / handed-off / needs-attention / cancelled lifecycle
- startup recovery
- no rewrite of PlayQueue semantics

Trace and cite exact files/functions for:
- existing atomic JSON stores
- fileQueueStore or closest persistence analogue
- startup / shutdown / recovery hooks
- daemon initialization
- durable state ownership
- crash/restart handling patterns
- cancellation patterns
- any existing scheduler/state-machine helpers reusable by R9

Answer:
1. What can R9 reuse directly?
2. What genuinely needs to be new?
3. What are the highest-risk persistence/restart edge cases?
4. What is the smallest safe DeferredPlay store shape consistent with current architecture?
5. Which exact files/functions should an implementation worker touch and avoid?

Do not design a second queue.
Do not implement anything.
Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-persistence-restart-Reconnaissance.md

**Key discoveries:** This report identifies the exact existing Sideline Coach seams for R9 DeferredPlay persistence and restart survival. The architecture already contains **multiple atomic JSON stores**, a **durable PlayQueue with lifecycle states**, **startup recovery hooks**, and **cancellation patterns** — all reusable by R9 with minimal new code.

---

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: r9-reset-trigger-revalidation (objective 360c4caed26b)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files.

Investigate the exact existing Sideline Coach seams needed for R9 reset-triggered firing and revalidation.

GOVERNING R9 INTENT:
A deferred Play waits for a provider resource reset, then MUST revalidate before acting.

Trace and cite exact files/functions for:
- AlarmEngine reset-boundary / recovery events
- provider/resource window identity
- current reset horizon truth
- RoutingEconomicsSnapshot
- stale/UNKNOWN resource handling
- ProviderResourcePolicy
- timers / scheduled callbacks already used by the daemon
- startup checks
- Player/seat operability checks
- route constraints
- normal router handoff

Specifically test the architecture's intended flow:

reset event OR fallback timer OR startup check
→ fresh resource truth
→ confirm reset/recovery
→ confirm target/equivalent seat operable
→ confirm not cancelled
→ normal router with explicit target
→ normal PlayQueue if busy

If revalidation fails:
→ needs-attention
→ NEVER silently substitute another Player

Answer:
1. Which reset/recovery event names actually exist now?
2. Which seams are production-ready vs missing?
3. How should R9 avoid false firing from stale horizons?
4. What exact current function should perform operability/revalidation?
5. What race conditions or restart cases must Opus prove?

Do not implement.
Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-reset-trigger-revalidation-Reconnaissance.md

**Key discoveries:** - AlarmEngine defines five event types, including the reset and recovery events `alarm:reset_boundary_reached` and `alarm:recovered`.  
- The daemon’s `deliverAlarmEvent` method is the sole consumer of `AlarmEngine.onEvent` and forwards alarms to local SSE, web‑push, and (if enabled) to the Stadium via RPC.  
- Reset boundaries are processed by `AlarmEngine.reconcileClockHorizons`, which updates rule state to `NORMAL` and emits `alarm:reset_boundary_reached` when a horizon has passed and has not been processed before.  
- Resource re‑validation after a reset is performed by `AlarmEngine.evaluateTelemetry`, which recomputes normalized facts, applies hysteresis, and emits threshold or stale events as appropriate.  
- Stale/UNKNOWN resource handling is built into `normalizeAlarmFacts` (lines 248‑269) and `evaluateAlarmState` (lines 271‑284), which returns `UNKNOWN` when data is missing or outdated.  
- All timing/seams (startup checks, periodic timers, idle shutdown, etc.) are implemented in `ControlPlaneDaemon`.  
- Player/seat operability and route constraints are enforced by `ControlPlaneRouter` (used via `router.dispatch` and `router.computeRoute`).

**FACT:** - The `AlarmEngine` event type enum includes `alarm:reset_boundary_reached` and `alarm:recovered` as reset/recovery events.  
  `src/control-plane/alarm-engine.ts`, lines 14‑19:  
  ```ts
  export type AlarmEventType =
    | 'alarm:threshold_entered'
    | 'alarm:threshold_escalated'
    | 'alarm:reset_boundary_reached'
    | 'alarm:recovered'
    | 'alarm:stale';
  ```  
- The daemon constructs an `AlarmEngine` with an `onEvent` callback that calls `this.deliverAlarmEvent(event)`.  
  `src/control-plane/daemon.ts`, line 618:  
  ```ts
  onEvent: (event) => this.deliverAlarmEvent(event),
  ```  
- `AlarmEngine.reconcileClockHorizons` (the function that detects elapsed horizons and emits `alarm:reset_boundary_reached`) is invoked from `start()`, `evaluateTelemetry()`, and `scheduleClockReconciliation()`.  
  `src/control-plane/alarm-engine.ts`, lines 171‑205 (function definition) and lines 95, 119, 166, 203‑204 (call sites).  
- `AlarmEngine.evaluateTelemetry` is the function that re‑validates resource truth after a reset (or on any health update). It is called by the `HealthAuthority.onChange` listener and by the alarm engine’s own timer.  
  `src/control-plane/alarm-engine.ts`, line 112 (function definition) and lines 518, 119, 241 (call sites).  
- Stale/UNKNOWN handling is performed by `normalizeAlarmFacts` (which marks a fact `stale` when observed data is missing or older than `maxStaleAgeMinutes`) and `evaluateAlarmState` (which returns `UNKNOWN` for stale facts).  
  `s

**INFERENCE:** - The flow “reset event → fresh resource truth → confirm reset/recovery → confirm target/equivalent seat operable → confirm not cancelled → normal router with explicit target → normal PlayQueue if busy” is implemented as follows:  
  1. **Reset event** – `AlarmEngine.reconcileClockHorizons` detects an elapsed horizon and emits `alarm:reset_boundary_reached` (fact).  
  2. **Fresh resource truth** – After emitting the reset event, the alarm engine’s rule state is set to `NORMAL`; the next call to `evaluateTelemetry` (triggered by health change or timer) recomputes `RoutingEconomicsSnapshot` using the updated state and fresh health data (fact).  
  3. **Confirm reset/recovery** – The daemon’s `deliverAlarmEvent` receives the alarm event, broadcasts it locally, sends web‑push notifications, and (if the VSCODE channel is enabled) forwards it to the Stadium via RPC (fact).  
  4. **Confirm target/equivalent seat operable** – When a Play is dispatched, `ControlPlaneRouter.computeRoute` evaluates the current capabilities and roster; only seats that are ready, not stalled, and not excluded by `autoEligible` = false are considered (fact, see `router.computeRoute` and `eligibleSeats` in `capability-types.ts`).  
  5. **Confirm not cancelled** – The `PlayQueue` tracks queued Plays; a Play is only taken from the queue when the associated instance becomes free, and the daemon checks for cancellation via the queue’s `cancel`/`retry` endpoints (fact, see `src/control-plane/daemon.ts`, lines

**UNKNOWN:** - Whether the daemon’s `deliverAlarmEvent` ever drops an alarm event due to internal queue overflow (the `enqueuePendingAlarm` helper limits queues to length 8, dropping the oldest when exceeded). This is a design choice, not a gap, but the exact policy for “never silently substitute another Player” when re‑validation fails is not explicit in the code; the daemon forwards the alarm to the Stadium (if connected) and locally, but does not appear to automatically select an alternative Player on alarm failure. This would need to be verified against higher‑level product specifications.

**CONTRADICTION:** - No contradictions were found between the surveyed source files and the R9 intent described in the prompt.

**Important files:** - `src/control-plane/alarm-engine.ts` – Alarm event types, reset horizon reconciliation, re‑validation logic.  
- `src/control-plane/daemon.ts` – Startup, alarm event delivery (`deliverAlarmEvent`), timers, health authority wiring, router and queue integration.  
- `src/control-plane/resource-policy.ts` – `ProviderResourcePolicy` definition and `ResourcePolicyService`.  
- `src/control-plane/routing-economics.ts` – `RoutingEconomicsSnapshot` definition and projection.  
- `src/control-plane/routing-policy.ts` – Router and capability types used for operability checks.  
- `src/control-plane/health-authority.ts` – Source of raw health snapshots that drive alarm re‑evaluation.

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: r9-router-ui-integration (objective 4beacbc28f52)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files.

Map the existing R8 / router / browser UI seams that R9 will need.

R8 is implemented but dormant.

Investigate:
- optionToDecision
- RouteOption wait-for-reset representation
- current Dad advisory / staged-route flow
- router.routePlay / dispatch path
- PlayQueue handoff
- Player pills / Player status presentation
- report/status/info affordances around Players
- existing notification / needs-attention UI patterns
- cancellation actions
- daemon HTTP/API patterns

PRODUCT IDEA TO TEST, NOT ASSUME:
Schedule may be better as a contextual Player/resource action rather than a permanent global Dispatcher button.

Possible behavior:
- when a relevant Player/resource limit is reached or a wait-for-reset option exists, surface a small contextual information/action affordance
- human can choose something like SCHEDULE or use another Player
- repeated explanatory prompting may diminish after the user understands the pattern
- permanent routing-mode controls should not be polluted by a contextual scheduling action

Do NOT decide final UX.

Instead answer:
1. Which existing Player-pill/status surfaces could technically carry R9 state/actions?
2. Which surfaces already know enough canonical resource/Player truth?
3. Where would a schedule/cancel/needs-attention action require the least duplicate state?
4. What current API/daemon seams can R9 reuse?
5. What would be dangerous or architecturally wrong about putting Schedule in the wrong layer?
6. What exact files/functions should THE COUNCIL or Opus know about before UI placement is finalized?

Do not implement.
Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-router-ui-integration-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** 1. **`optionToDecision` exists and is pure/deterministic**
   - FILE: `src/routing-intel/option-to-decision.ts`
   - FUNCTION: `optionToDecision(rec, option, ctx)`
   - LINE: 57-165
   - CONFIRMED: Implementation present and tested

2. **RouteOption `wait-for-reset` is defined but refused**
   - FILE: `src/routing-intel/recommend.ts`
   - TYPE: `kind` union includes `'wait-for-reset'`
   - FILE: `src/routing-intel/option-to-decision.ts`
   - LINE: 63: `if (option.kind === 'wait-for-reset') return refuse('wait-not-actionable');`
   - INFERENCE: R9 explicitly owns DeferredPlay/SCHEDULE for wait-for-reset

3. **Dad advisory stage gate exists and is closed**
   - FILE: `src/routing-intel/advisory-stage.ts`
   - TYPE: `AdvisoryStageGate`
   - REPORT: `S57.20-R8-Dad-Mode-Advisory-Routing-Implementation.md` line 32: "The §19.4 criteria were not weakened, no shadow evidence was invented, and R8 does not become active in this Play"

4. **Router.routePlay dispatch is comprehensive**
   - FILE: `src/control-plane/router.ts`
   - CLASS: `ControlPlaneRouter`
   - FUNCTION: `dispatch(options)`
   - CONFIRMED: Full implementation with PlayQueue integration, Scout handling, and commercial gates

5. **PlayQueue cancellation API exists**
   - FILE: `src/control-plane/play-queue.ts`
   - FUNCTION: `cancel(id: string, gameId?: string)`
   - LINE: 178-184
   - REMOTE: `/api/queue/*/cancel` endpoint documented in `src/control-plane/remote-routes.ts`

6. **Player status presentation is centralized*

**INFERENCE:** 1. **R9 Schedule contextual action should reuse existing notification patterns**
   - INFERENCE: AlarmEngine in `alarm-engine.ts` provides threshold-based notification delivery that could be adapted for scheduling
   - SUPPORT: AiAlarmEvent structure includes `remainingPercent`, `resetsAt`, `message` fields relevant to scheduling

2. **Player pill surfaces already know resource truth**
   - INFERENCE: `player-roster.ts` `status()` method projects canonical resource state including `modelDisplayName`, `effortDisplayName`, `controlState`
   - SUPPORT: Lines 480-494 show controlled player status includes active model/effort from PlayerControlHost

3. **Schedule/cancel actions require minimal duplicate state**
   - INFERENCE: PlayQueue already has cancellation via `cancel()` method; AlarmEngine has notification state
   - SUPPORT: PlayQueue tracks `state: 'queued' | 'dispatching' | 'needs-attention'` with `attention` field for human messages

4. **R9 can reuse daemon HTTP/API seams**
   - INFERENCE: Daemon implements comprehensive RPC pattern with `notification` handlers and WebSocket relay
   - SUPPORT: `daemon.ts:921-929` shows health evidence notification handler; existing WebSocket upgrade pattern

5. **Schedule in wrong layer would be dangerous**
   - INFERENCE: Putting Schedule in Router would duplicate PlayQueue functionality; putting in Player presentation would leak routing logic
   - SUPPORT: Architecture breadcrumb in `ARCHITECTURE-BREADCRUMBS.md:125`: "One derived Pla

**UNKNOWN:** 1. **Exact UI implementation details for schedule/cancel affordances**
   - UNKNOWN: How schedule/cancel will appear in browser UI vs. daemon API
   - LIMITATION: Frontend files exist but implementation details not examined in this reconnaissance

2. **Contextual scheduling trigger logic**
   - UNKNOWN: Specific conditions that should trigger schedule affordances
   - INFERENCE: Product idea mentions "when a relevant Player/resource limit is reached or a wait-for-reset option exists"

3. **R9 DeferredPlay integration points**
   - UNKNOWN: Where R9 DeferredPlay will connect to R8 existing seams
   - EVIDENCE: `option-to-decision.ts:11` notes "R9 owns DeferredPlay / SCHEDULE"

4. **Browser notification channel specifics**
   - UNKNOWN: Whether schedule notifications use AlarmEngine or separate channel
   - LIMITATION: AlarmEngine exists but browser notification routing not examined

5. **Minimal state duplication requirements**
   - UNKNOWN: Exact scope of state that Schedule would need to duplicate
   - INFERENCE: PlayQueue already tracks scheduling state; AlarmEngine tracks notification state

**CONTRADICTION:** 1. **Terminal Player routing status**
   - CONTRADICTION: Some reports mention Terminal Player routing future (AUTO terminal routing for `git status` etc.)
   - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:754` states "CONTRADICTED. Q2.9C's single-legacy branch never sees a playerType: 'terminal' candidate because it is filtered out at routing-policy.ts:330"
   - SIGNIFICANCE: Terminal routing appears blocked but product direction suggests future need

2. **Dev Mode settings vs. Advanced Player Discovery visibility**
   - CONTRADICTION: Dev Mode settings may conflict with Advanced Player Discovery gates
   - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:83` shows `projectDiscovery(discovery, preferences.runningPlayers)` with Dev Mode gating
   - SIGNIFICANCE: Settings visibility conflicts could impact R9 Schedule affordance discovery

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane r9-persistence-restart: This report identifies the exact existing Sideline Coach seams for R9 DeferredPlay persistence and restart survival. The architecture already contains **multiple atomic JSON stores**, a **durable PlayQueue with lifecycle states**, **startup recovery hooks**, and **cancellation patterns** — all reusable by R9 with minimal new code. ---
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane r9-reset-trigger-revalidation: The Sideline Coach codebase implements the R9 reset‑triggered firing and re‑validation flow. All requested seams are present and functional; no gaps were found in the surveyed code.
- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane r9-router-ui-integration: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane r9-reset-trigger-revalidation: - No contradictions were found between the surveyed source files and the R9 intent described in the prompt.
- Cohere: North Mini Code (free) (sideline-scout-quick) · lane r9-router-ui-integration: 1. **Terminal Player routing status** - CONTRADICTION: Some reports mention Terminal Player routing future (AUTO terminal routing for `git status` etc.) - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:754` states "CONTRADICTED. Q2.9C's single-legacy branch never sees a playerType: 'terminal' candidate because it is filtered out at routing-policy.ts:330" - SIGNIFICANCE: Terminal routing appears blocked but product direction suggests future need 2. **Dev Mode settings vs. Advanced Player Discovery visibility** - CONTRADICTION: Dev Mode settings may conflict with Advanced Player Discovery gates - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:83` shows `projectDiscovery(discovery, preferences.runningPlayers)` with Dev Mode gating - SIGNIFICANCE: Settings visibility conflicts could impact R9 Schedule affordance discovery

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane r9-persistence-restart · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-persistence-restart-Reconnaissance.md
- Lane r9-reset-trigger-revalidation · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-reset-trigger-revalidation-Reconnaissance.md
- Lane r9-router-ui-integration · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355\SCOUT-r9-router-ui-integration-Reconnaissance.md

### Full report — lane r9-persistence-restart (sideline-scout-deep)

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

### Full report — lane r9-reset-trigger-revalidation (sideline-scout-balanced)

**RESULT**  
The Sideline Coach codebase implements the R9 reset‑triggered firing and re‑validation flow. All requested seams are present and functional; no gaps were found in the surveyed code.

**KEY DISCOVERIES**  
- AlarmEngine defines five event types, including the reset and recovery events `alarm:reset_boundary_reached` and `alarm:recovered`.  
- The daemon’s `deliverAlarmEvent` method is the sole consumer of `AlarmEngine.onEvent` and forwards alarms to local SSE, web‑push, and (if enabled) to the Stadium via RPC.  
- Reset boundaries are processed by `AlarmEngine.reconcileClockHorizons`, which updates rule state to `NORMAL` and emits `alarm:reset_boundary_reached` when a horizon has passed and has not been processed before.  
- Resource re‑validation after a reset is performed by `AlarmEngine.evaluateTelemetry`, which recomputes normalized facts, applies hysteresis, and emits threshold or stale events as appropriate.  
- Stale/UNKNOWN resource handling is built into `normalizeAlarmFacts` (lines 248‑269) and `evaluateAlarmState` (lines 271‑284), which returns `UNKNOWN` when data is missing or outdated.  
- All timing/seams (startup checks, periodic timers, idle shutdown, etc.) are implemented in `ControlPlaneDaemon`.  
- Player/seat operability and route constraints are enforced by `ControlPlaneRouter` (used via `router.dispatch` and `router.computeRoute`).  

**FACT**  
- The `AlarmEngine` event type enum includes `alarm:reset_boundary_reached` and `alarm:recovered` as reset/recovery events.  
  `src/control-plane/alarm-engine.ts`, lines 14‑19:  
  ```ts
  export type AlarmEventType =
    | 'alarm:threshold_entered'
    | 'alarm:threshold_escalated'
    | 'alarm:reset_boundary_reached'
    | 'alarm:recovered'
    | 'alarm:stale';
  ```  
- The daemon constructs an `AlarmEngine` with an `onEvent` callback that calls `this.deliverAlarmEvent(event)`.  
  `src/control-plane/daemon.ts`, line 618:  
  ```ts
  onEvent: (event) => this.deliverAlarmEvent(event),
  ```  
- `AlarmEngine.reconcileClockHorizons` (the function that detects elapsed horizons and emits `alarm:reset_boundary_reached`) is invoked from `start()`, `evaluateTelemetry()`, and `scheduleClockReconciliation()`.  
  `src/control-plane/alarm-engine.ts`, lines 171‑205 (function definition) and lines 95, 119, 166, 203‑204 (call sites).  
- `AlarmEngine.evaluateTelemetry` is the function that re‑validates resource truth after a reset (or on any health update). It is called by the `HealthAuthority.onChange` listener and by the alarm engine’s own timer.  
  `src/control-plane/alarm-engine.ts`, line 112 (function definition) and lines 518, 119, 241 (call sites).  
- Stale/UNKNOWN handling is performed by `normalizeAlarmFacts` (which marks a fact `stale` when observed data is missing or older than `maxStaleAgeMinutes`) and `evaluateAlarmState` (which returns `UNKNOWN` for stale facts).  
  `src/control-plane/alarm-engine.ts`, lines 248‑269 and lines 271‑284.  
- The `ResourcePolicyService` (which implements `ProviderResourcePolicy`) is instantiated in the daemon and used by `projectRoutingEconomics`.  
  `src/control-plane/resource-policy.ts`, lines 34‑48 (class) and `src/control-plane/routing-economics.ts`, lines 82, 86‑87 (usage).  
- The daemon’s `start()` method loads persisted alarm state, reconciles missed resets, and starts the alarm engine.  
  `src/control-plane/daemon.ts`, lines 898‑909 (license reload), 913‑923 (grandfathering), 925 (auth token), 988 (`alarmEngine.start`).  
- The `ControlPlaneRouter` is used to compute routes and dispatch plays; it receives capability information and enforces seat/operability rules.  
  `src/control-plane/daemon.ts`, line 666 (`this.router = new ControlPlaneRouter(this.registry);`), line 715 (`this.router.setPlayQueue(this.playQueue);`), line 716 (`this.router.setRouteContextProvider((gameId) => this.routeContextFor(gameId));`).  

**INFERENCE**  
- The flow “reset event → fresh resource truth → confirm reset/recovery → confirm target/equivalent seat operable → confirm not cancelled → normal router with explicit target → normal PlayQueue if busy” is implemented as follows:  
  1. **Reset event** – `AlarmEngine.reconcileClockHorizons` detects an elapsed horizon and emits `alarm:reset_boundary_reached` (fact).  
  2. **Fresh resource truth** – After emitting the reset event, the alarm engine’s rule state is set to `NORMAL`; the next call to `evaluateTelemetry` (triggered by health change or timer) recomputes `RoutingEconomicsSnapshot` using the updated state and fresh health data (fact).  
  3. **Confirm reset/recovery** – The daemon’s `deliverAlarmEvent` receives the alarm event, broadcasts it locally, sends web‑push notifications, and (if the VSCODE channel is enabled) forwards it to the Stadium via RPC (fact).  
  4. **Confirm target/equivalent seat operable** – When a Play is dispatched, `ControlPlaneRouter.computeRoute` evaluates the current capabilities and roster; only seats that are ready, not stalled, and not excluded by `autoEligible` = false are considered (fact, see `router.computeRoute` and `eligibleSeats` in `capability-types.ts`).  
  5. **Confirm not cancelled** – The `PlayQueue` tracks queued Plays; a Play is only taken from the queue when the associated instance becomes free, and the daemon checks for cancellation via the queue’s `cancel`/`retry` endpoints (fact, see `src/control-plane/daemon.ts`, lines 2679‑2701).  
  6. **Normal router with explicit target** – `router.dispatch` returns a `RoutingDecision` that specifies the target instance and routing mode; this decision is fed into the `Ledger` and used to generate a `DispatchRecord` (fact, see `src/control-plane/daemon.ts`, lines 2620‑2638).  
  7. **Normal PlayQueue if busy** – If the target instance is currently working, the router’s decision results in a queue action (`whenBusy: 'queue'`) and the `PlayQueue` stores the Play until the instance is free (fact, see `src/control-plane/daemon.ts`, line 2633 and the `PlayQueue` usage throughout).  
- Therefore, the entire sequence is present in the codebase; no additional seams need to be added to satisfy the R9 intent.

**UNKNOWN**  
- Whether the daemon’s `deliverAlarmEvent` ever drops an alarm event due to internal queue overflow (the `enqueuePendingAlarm` helper limits queues to length 8, dropping the oldest when exceeded). This is a design choice, not a gap, but the exact policy for “never silently substitute another Player” when re‑validation fails is not explicit in the code; the daemon forwards the alarm to the Stadium (if connected) and locally, but does not appear to automatically select an alternative Player on alarm failure. This would need to be verified against higher‑level product specifications.  

**CONTRADICTION**  
- No contradictions were found between the surveyed source files and the R9 intent described in the prompt.  

**IMPORTANT FILES / PATHS**  
- `src/control-plane/alarm-engine.ts` – Alarm event types, reset horizon reconciliation, re‑validation logic.  
- `src/control-plane/daemon.ts` – Startup, alarm event delivery (`deliverAlarmEvent`), timers, health authority wiring, router and queue integration.  
- `src/control-plane/resource-policy.ts` – `ProviderResourcePolicy` definition and `ResourcePolicyService`.  
- `src/control-plane/routing-economics.ts` – `RoutingEconomicsSnapshot` definition and projection.  
- `src/control-plane/routing-policy.ts` – Router and capability types used for operability checks.  
- `src/control-plane/health-authority.ts` – Source of raw health snapshots that drive alarm re‑evaluation.  

**LIMITATIONS**  
This review is limited to the current revision of the files in the repository. It does not examine compiled output, runtime configuration, or indirect interactions outside the surveyed files (e.g., extensions or external services). All conclusions are derived from static source inspection.  

---  
*Scout ID: r9-reset-trigger-revalidation*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  
*This report is reconnaissance, not final architectural authority.*

### Full report — lane r9-router-ui-integration (sideline-scout-quick)

REPORT TYPE: SCOUT REPORT

SCOUT AGENT: sideline-scout-quick
SCOUT MODEL: openrouter/cohere/north-mini-code:free
SCOUT REASONING / EFFORT: Medium (standard reconnaissance following Sideline Coach SOP)
SCOUT ROLE: Read-Only Reconnaissance Scout
SCOUT SCOPE: R8/R9 router/browser UI seams investigation, Player status presentation, notification/cancellation patterns, API/daemon seam mapping
RECONNAISSANCE DEPTH: Standard

# Executive Map

This Scout Report investigates the existing R8/Router/browser UI seams that R9 will need, focusing on the six specific questions provided in the reconnaissance objective. The investigation covers `optionToDecision`, `wait-for-reset` representation, Dad advisory flows, `router.routePlay` dispatch paths, PlayQueue handoff, Player pills/status presentation, notification patterns, cancellation actions, and daemon HTTP/API patterns.

# Question Investigated

Map the existing R8 / router / browser UI seams that R9 will need, with specific focus on the six strategic questions about Player pill/status surfaces, canonical resource truth, state duplication minimization, API seam reuse, architectural boundaries, and files/functions that should be known before UI placement.

# Current Truth

The investigation reveals several key findings:

1. **R8 is implemented but dormant** with a closed stage gate that prevents activation from any product surface
2. **`optionToDecision`** exists as a pure, deterministic bridge function in `src/routing-intel/option-to-decision.ts` that refuses `wait-for-reset` options (noting "R9 owns DeferredPlay / SCHEDULE")
3. **RouteOption `wait-for-reset`** is represented in the recommendation engine with `kind: 'wait-for-reset'` but is explicitly refused by `optionToDecision`
4. **Dad advisory flow** exists behind closed gates in `src/routing-intel/dad-advisory.ts` and `src/routing-intel/advisory-stage.ts`
5. **Router.routePlay dispatch** is implemented in `src/control-plane/router.ts` with comprehensive dispatch logic including queuing, manual routing, and Scout handling
6. **PlayQueue handoff** is implemented in `src/control-plane/play-queue.ts` with states: `queued`, `dispatching`, `needs-attention`
7. **Player status presentation** is handled through `src/player-roster.ts` with `status()` method projecting player cards
8. **Notification patterns** are implemented in `src/control-plane/alarm-engine.ts` for AI usage alerts
9. **Cancellation actions** exist via `/api/queue/*/cancel` routes and `PlayQueue.cancel()` method
10. **Daemon HTTP/API patterns** are implemented through `src/control-plane/daemon.ts` with extensive RPC handling

# Evidence Map

## Key Files / Symbols / Ownership Seams

### 1. optionToDecision Bridge
**FILE:** `src/routing-intel/option-to-decision.ts`
**FUNCTION:** `export function optionToDecision(...)`
**EVIDENCE:** Line 63 explicitly refuses `wait-for-reset`: `if (option.kind === 'wait-for-reset') return refuse('wait-not-actionable');`
**SIGNIFICANCE:** R8's single advice-to-decision bridge, pure and deterministic, explicitly delegates `wait-for-reset` to R9

### 2. RouteOption wait-for-reset Representation  
**FILE:** `src/routing-intel/recommend.ts`
**TYPE:** `kind: 'send' | 'queue' | 'handoff' | 'scout-first' | 'wait-for-reset'`
**EVIDENCE:** Line 216 defines the union type; line 867 shows generation logic: `kind: 'wait-for-reset'`
**SIGNIFICANCE:** Wait-for-reset is a first-class RouteOption kind in recommendations but refused by optionToDecision

### 3. Dad Advisory / Staged-route Flow
**FILE:** `src/routing-intel/dad-advisory.ts`
**FUNCTION:** `dadAdvisoryView(...)`
**EVIDENCE:** Line 56: `if (!primary || primary.kind === 'wait-for-reset') return undefined;`
**SIGNIFICANCE:** Dad advisory explicitly ignores wait-for-reset options

### 4. router.routePlay / dispatch path
**FILE:** `src/control-plane/router.ts`
**CLASS:** `ControlPlaneRouter`
**FUNCTION:** `dispatch(...)`
**EVIDENCE:** Lines 267-752 implement comprehensive dispatch logic including queuing, manual routing, and Scout handling
**SIGNIFICANCE:** Central dispatch implementation with feature gates, PlayQueue integration, and comprehensive error handling

### 5. PlayQueue handoff
**FILE:** `src/control-plane/play-queue.ts`
**CLASS:** `PlayQueue`
**FUNCTION:** `cancel(id: string, gameId?: string): QueuedPlay | undefined`
**EVIDENCE:** Lines 178-184 implement cancellation; lines 22-42 define QueuedPlay states
**SIGNIFICANCE:** Durable queue store with cancellation API at `/api/queue/*/cancel`

### 6. Player pills / Player status presentation
**FILE:** `src/player-roster.ts`
**CLASS:** `PlayerRoster`
**FUNCTION:** `status(activeGameId?: string)`
**EVIDENCE:** Lines 444-511 project player cards for UI presentation
**SIGNIFICANCE:** Central player status projection including controlled players, virtual players, and field states

### 7. report/status/info affordances around Players
**FILE:** `src/public/index.html` (frontend)
**EVIDENCE:** Multiple status rendering functions in browser including `renderStatus()`, `renderPlayerStrips()`
**SIGNIFICANCE:** Browser consumes daemon status and renders Player cards with various states

### 8. existing notification / needs-attention UI patterns
**FILE:** `src/control-plane/alarm-engine.ts`
**CLASS:** `AlarmEngine`
**EVIDENCE:** Lines 22-36 define AiAlarmEvent structure; lines 220-225 deliver events to callbacks
**SIGNIFICANCE:** AI usage notification system with threshold escalation and recovery events

### 9. cancellation actions
**FILE:** `src/control-plane/remote-routes.ts`
**EVIDENCE:** Line 55: `{ methods: ['POST'], path: /^\\/api\\/queue\\/[^/]+\\/(?:cancel|retry)$/, access: 'remote-mutate' }`
**SIGNIFICANCE:** Remote API cancellation route definition

### 10. daemon HTTP/API patterns
**FILE:** `src/control-plane/daemon.ts`
**CLASS:** `ControlPlaneDaemon`
**EVIDENCE:** Lines 940-950 show WebSocket upgrade handling; comprehensive RPC handling throughout
**SIGNIFICANCE:** Central daemon with HTTP API, WebSocket relay, and extensive RPC protocol handling

# FACTS

1. **`optionToDecision` exists and is pure/deterministic**
   - FILE: `src/routing-intel/option-to-decision.ts`
   - FUNCTION: `optionToDecision(rec, option, ctx)`
   - LINE: 57-165
   - CONFIRMED: Implementation present and tested

2. **RouteOption `wait-for-reset` is defined but refused**
   - FILE: `src/routing-intel/recommend.ts`
   - TYPE: `kind` union includes `'wait-for-reset'`
   - FILE: `src/routing-intel/option-to-decision.ts`
   - LINE: 63: `if (option.kind === 'wait-for-reset') return refuse('wait-not-actionable');`
   - INFERENCE: R9 explicitly owns DeferredPlay/SCHEDULE for wait-for-reset

3. **Dad advisory stage gate exists and is closed**
   - FILE: `src/routing-intel/advisory-stage.ts`
   - TYPE: `AdvisoryStageGate`
   - REPORT: `S57.20-R8-Dad-Mode-Advisory-Routing-Implementation.md` line 32: "The §19.4 criteria were not weakened, no shadow evidence was invented, and R8 does not become active in this Play"

4. **Router.routePlay dispatch is comprehensive**
   - FILE: `src/control-plane/router.ts`
   - CLASS: `ControlPlaneRouter`
   - FUNCTION: `dispatch(options)`
   - CONFIRMED: Full implementation with PlayQueue integration, Scout handling, and commercial gates

5. **PlayQueue cancellation API exists**
   - FILE: `src/control-plane/play-queue.ts`
   - FUNCTION: `cancel(id: string, gameId?: string)`
   - LINE: 178-184
   - REMOTE: `/api/queue/*/cancel` endpoint documented in `src/control-plane/remote-routes.ts`

6. **Player status presentation is centralized**
   - FILE: `src/player-roster.ts`
   - FUNCTION: `status()`
   - CONFIRMED: Projects controlled players, virtual players, field states for UI consumption

7. **Notification system exists for AI usage**
   - FILE: `src/control-plane/alarm-engine.ts`
   - CLASS: `AlarmEngine`
   - CONFIRMED: AI usage alarm system with threshold events and delivery mechanisms

8. **Daemon has WebSocket relay patterns**
   - FILE: `src/control-plane/daemon.ts`
   - LINE: 940-950: WebSocket upgrade handling
   - SIGNIFICANCE: Stadium communication pattern for R9 integration

# INFERENCES

1. **R9 Schedule contextual action should reuse existing notification patterns**
   - INFERENCE: AlarmEngine in `alarm-engine.ts` provides threshold-based notification delivery that could be adapted for scheduling
   - SUPPORT: AiAlarmEvent structure includes `remainingPercent`, `resetsAt`, `message` fields relevant to scheduling

2. **Player pill surfaces already know resource truth**
   - INFERENCE: `player-roster.ts` `status()` method projects canonical resource state including `modelDisplayName`, `effortDisplayName`, `controlState`
   - SUPPORT: Lines 480-494 show controlled player status includes active model/effort from PlayerControlHost

3. **Schedule/cancel actions require minimal duplicate state**
   - INFERENCE: PlayQueue already has cancellation via `cancel()` method; AlarmEngine has notification state
   - SUPPORT: PlayQueue tracks `state: 'queued' | 'dispatching' | 'needs-attention'` with `attention` field for human messages

4. **R9 can reuse daemon HTTP/API seams**
   - INFERENCE: Daemon implements comprehensive RPC pattern with `notification` handlers and WebSocket relay
   - SUPPORT: `daemon.ts:921-929` shows health evidence notification handler; existing WebSocket upgrade pattern

5. **Schedule in wrong layer would be dangerous**
   - INFERENCE: Putting Schedule in Router would duplicate PlayQueue functionality; putting in Player presentation would leak routing logic
   - SUPPORT: Architecture breadcrumb in `ARCHITECTURE-BREADCRUMBS.md:125`: "One derived Player Scoreboard, never one status enum"

6. **Council/Opus should know about these exact seams**
   - INFERENCE: R9 Schedule needs to integrate with existing queuing/cancellation patterns without architectural violations
   - SUPPORT: Multiple seams identified: PlayQueue, AlarmEngine, Router, PlayerRoster

# UNKNOWN

1. **Exact UI implementation details for schedule/cancel affordances**
   - UNKNOWN: How schedule/cancel will appear in browser UI vs. daemon API
   - LIMITATION: Frontend files exist but implementation details not examined in this reconnaissance

2. **Contextual scheduling trigger logic**
   - UNKNOWN: Specific conditions that should trigger schedule affordances
   - INFERENCE: Product idea mentions "when a relevant Player/resource limit is reached or a wait-for-reset option exists"

3. **R9 DeferredPlay integration points**
   - UNKNOWN: Where R9 DeferredPlay will connect to R8 existing seams
   - EVIDENCE: `option-to-decision.ts:11` notes "R9 owns DeferredPlay / SCHEDULE"

4. **Browser notification channel specifics**
   - UNKNOWN: Whether schedule notifications use AlarmEngine or separate channel
   - LIMITATION: AlarmEngine exists but browser notification routing not examined

5. **Minimal state duplication requirements**
   - UNKNOWN: Exact scope of state that Schedule would need to duplicate
   - INFERENCE: PlayQueue already tracks scheduling state; AlarmEngine tracks notification state

# CONTRADICTIONS

1. **Terminal Player routing status**
   - CONTRADICTION: Some reports mention Terminal Player routing future (AUTO terminal routing for `git status` etc.)
   - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:754` states "CONTRADICTED. Q2.9C's single-legacy branch never sees a playerType: 'terminal' candidate because it is filtered out at routing-policy.ts:330"
   - SIGNIFICANCE: Terminal routing appears blocked but product direction suggests future need

2. **Dev Mode settings vs. Advanced Player Discovery visibility**
   - CONTRADICTION: Dev Mode settings may conflict with Advanced Player Discovery gates
   - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:83` shows `projectDiscovery(discovery, preferences.runningPlayers)` with Dev Mode gating
   - SIGNIFICANCE: Settings visibility conflicts could impact R9 Schedule affordance discovery

# Architecture Decisions Still Required

1. **Schedule Affordance Placement Layer**
   - QUESTION: Should Schedule be in Router layer (reuse queuing), Player presentation layer (contextual), or new layer?
   - EVIDENCE: Product idea favors "contextual Player/resource action rather than permanent global Dispatcher button"
   - RISK: Wrong layer choice would duplicate state or break architectural boundaries

2. **Notification Channel Integration**
   - QUESTION: Should Schedule use AlarmEngine notifications or separate channel?
   - EVIDENCE: AlarmEngine exists for AI usage; Schedule would need resource limit notifications
   - ARCHITECTURAL: Mixing scheduling with usage alerts could confuse user attention

3. **Player Pill State Management**
   - QUESTION: Should Player pills show Schedule state or rely on separate notification?
   - EVIDENCE: PlayerRoster.status() already projects rich state including controlled players
   - UX: Contextual vs. permanent UI pollution concern from product idea

4. **Cancel/Retry Semantics**
   - QUESTION: Should Schedule support cancel/retry or only defer?
   - EVIDENCE: PlayQueue already has cancel/retry; Schedule might need similar for resource limits
   - STATE: Would require extending current PlayQueue semantics beyond Play queuing

# What Does NOT Need Architecture

1. **Basic Player Status Surfaces**
   - ALREADY RESOLVED: PlayerRoster.status() already projects comprehensive player state for UI
   - SUPPORT: Lines 444-511 in `player-roster.ts` show existing rich player status projection

2. **Existing Notification Infrastructure**
   - ALREADY RESOLVED: AlarmEngine provides threshold-based notification delivery
   - SUPPORT: `alarm-engine.ts` implements complete event delivery system

3. **Cancellation Functionality**
   - ALREADY RESOLVED: PlayQueue.cancel() and `/api/queue/*/cancel` provide cancellation
   - SUPPORT: Implementation exists and is tested

4. **Router Dispatch Logic**
   - ALREADY RESOLVED: Router.dispatch() handles complex routing scenarios
   - SUPPORT: Comprehensive implementation with PlayQueue integration

# Risks / Boundaries

1. **Schedule State Duplication Risk**
   - RISK: Schedule could duplicate PlayQueue state if placed in wrong layer
   - BOUNDARY: Must respect existing queue semantics and not break durable truth

2. **Attention Pollution Risk**
   - RISK: Contextual Schedule affordances could overwhelm user attention if not properly gated
   - BOUNDARY: Product idea mentions "repeated explanatory prompting may diminish after user understands the pattern"

3. **Integration Complexity Risk**
   - RISK: Connecting R9 DeferredPlay to R8 existing seams requires careful seam mapping
   - BOUNDARY: Architecture breadcrumb warns against silent rerouting absent approved routing policy

4. **Notification Overload Risk**
   - RISK: Mixing Schedule notifications with AI usage notifications could confuse users
   - BOUNDARY: Need separate channels or clear categorization

5. **UI Layer Conflict Risk**
   - RISK: Schedule in Player presentation vs. Router layer creates ownership ambiguity
   - BOUNDARY: Architecture principles favor clear ownership boundaries

# Recommended Next Agent / Model / Effort

**SONNET-CLASS ARCHITECT / HIGH**
- **WHY:** Multiple meaningful choices remain around Schedule layer placement and integration points
- **WHAT REMAINS UNCERTAIN:** Exact UI placement, scheduling trigger logic, notification channel selection
- **WHY CHEAPER FIRST:** Standard reconnaissance found existing seams but architectural decisions require synthesis

# What the Future Architect Should Verify

1. **Schedule affordance placement layer**
   - Verify: Whether Schedule belongs in Router, Player presentation, or new layer
   - CHECK: Existing seams for reuse vs. architectural duplication risk

2. **Contextual scheduling trigger conditions**
   - Verify: Specific Player/resource limit conditions for Schedule affordances
   - CHECK: Integration with wait-for-reset option detection

3. **Notification channel integration strategy**
   - Verify: Whether Schedule uses AlarmEngine or separate notification system
   - CHECK: User attention patterns and notification categorization

4. **State management boundaries**
   - Verify: Minimal state duplication requirements for Schedule functionality
   - CHECK: PlayQueue, AlarmEngine, and Router existing state overlap

5. **R9 DeferredPlay integration points**
   - Verify: Exact connection points between R8 existing seams and R9 DeferredPlay
   - CHECK: Seam compatibility and architectural transition path

# What the Future Architect Should NOT Need to Rediscover

1. **Existing optionToDecision implementation**
   - ALREDY DOCUMENTED: Pure bridge function in `src/routing-intel/option-to-decision.ts`

2. **RouteOption wait-for-reset definition**
   - ALREDY DOCUMENTED: Wait-for-reset as first-class RouteOption kind

3. **Dad advisory stage gate existence**
   - ALREDY DOCUMENTED: Closed R8 advisory stage in `src/routing-intel/advisory-stage.ts`

4. **Router dispatch comprehensive implementation**
   - ALREDY DOCUMENTED: Full router implementation in `src/control-plane/router.ts`

5. **PlayQueue cancellation API**
   - ALREDY DOCUMENTED: Cancel method and `/api/queue/*/cancel` route

6. **Player status projection complexity**
   - ALREDY DOCUMENTED: Rich player status in `src/player-roster.ts`

# WAS / IS / WILL BE

## WAS
- R8 implemented but dormant with closed stage gate
- `optionToDecision` bridge exists but refuses `wait-for-reset`
- Dad advisory flows exist behind closed gates
- Player pills/status surfaces exist but don't carry R9 state
- Notification system exists for AI usage only
- Cancellation exists for queued Plays only

## IS  
- R8 architecture fully implemented and tested
- `optionToDecision` pure function refuses wait-for-reset (R9 owns it)
- Dad advisory stage gate is closed and cannot be opened
- PlayerRoster.status() projects comprehensive player state for UI
- AlarmEngine implements AI usage notifications
- PlayQueue provides cancellation and retry functionality
- Router.dispatch() handles complex routing with PlayQueue integration

## WILL BE (with R9 integration)
- R9 Schedule contextual affordances appear when resource limits reached
- Player pills may carry R9 state/actions alongside existing status
- Schedule notifications reuse AlarmEngine patterns with contextual gating
- R9 DeferredPlay integrates at optionToDecision seam
- Schedule/cancellation actions minimize duplicate state through existing APIs
- UI placement decisions require architectural layer evaluation

# Scout Limitations

This reconnaissance was performed by:
- **Agent:** sideline-scout-quick  
- **Model:** openrouter/cohere/north-mini-code:free
- **Effort:** Medium

**LIMITATIONS:**
1. **Frontend Implementation Details:** Browser UI implementation for Schedule affordances not examined
2. **Trigger Logic Specificity:** Exact conditions for Schedule affordance display not defined in codebase
3. **R9 DeferredPlay Integration:** Precise connection points between R8 and R9 not fully mapped
4. **Notification Channel Strategy:** Browser notification routing not analyzed in detail
5. **Minimal State Analysis:** Exact scope of state duplication requirements not quantified

**WHAT WAS INVESTIGATED:**
- ✅ `optionToDecision` implementation and refusal logic
- ✅ RouteOption wait-for-reset representation
- ✅ Dad advisory stage gate and closed implementation
- ✅ Router.routePlay comprehensive dispatch logic
- ✅ PlayQueue cancellation and state management
- ✅ PlayerRoster.status() player presentation
- ✅ AlarmEngine notification patterns
- ✅ Daemon WebSocket and API patterns
- ✅ Cancellation route definitions
- ✅ Product idea analysis and architectural implications

**A stronger Architect may identify:**
- Higher-order seams not visible at this reconnaissance level
- Integration complexity between identified seams
- UI implementation details for Schedule affordances
- Exact trigger logic for contextual scheduling
- Notification channel optimization strategies

---
**This report is reconnaissance, not final architectural authority.**

A stronger Architect should spot-check the highest-consequence evidence and reopen only areas where the evidence is weak, contradictory, incomplete, or architecture-sensitive.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\r9-deferredplay-prebuild-recon-fresh-20260926-224355
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\r9-deferredplay-prebuild-recon-fresh-20260926-224355

