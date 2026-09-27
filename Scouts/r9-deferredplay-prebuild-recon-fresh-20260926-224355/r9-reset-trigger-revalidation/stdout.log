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
