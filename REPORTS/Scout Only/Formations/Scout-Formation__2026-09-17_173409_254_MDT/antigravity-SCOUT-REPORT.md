This report is reconnaissance, not final architectural authority.

# Executive answer

1. **Strongest source-backed evidence that MANUAL Scout routing converges on the existing Formation engine:**
   - **Direct execution convergence:** When a human selects Scout in MANUAL mode and clicks dispatch, `ControlPlaneRouter.dispatch` in [`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L217-L244) intercepts `targetPlayerInstanceId === SCOUT_PLAYER_INSTANCE_ID` (`'scout'`), validates that `targetCapability.executionType === 'scout-formation'`, clears model/effort overrides, and sends a standard JSON-RPC `dispatch.request` to Stadium ([`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L430-L441)). In [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L901-L905), incoming requests targeting `SCOUT_PLAYER_INSTANCE_ID` bypass terminal and roster resolution and branch directly into `deliverScout()`, which calls `scout.execute(prompt, ctx.binding.rootFsPath)`. `ScoutPlayerAdapter.execute()` in [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L104-L124) directly calls `(this.options.runFormation ?? runScoutFormation)({...})`—which is the existing Formation engine in [`src/scout-formation.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-formation.ts#L432). No secondary executor or duplicate routing engine exists.
   - **Unified candidate & eligibility truth:** `ScoutPlayerAdapter.capability()` in [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L75-L102) determines Scout availability by calling `inspectScoutFormationAvailability()` in [`src/scout-formation.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-formation.ts#L301-L330). It evaluates the exact same candidate universe (`DEFAULT_FORMATION_CANDIDATES` and `combineDerivedFormationCandidates`) against the exact same `candidate.eligible(context)` predicates used by Formation's `selectFormation()`. If no candidates are proven `READY`, Scout capability is omitted from the snapshot and cannot be routed.
   - **Automated verification proof:** [`test/scout-player-routing.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/scout-player-routing.test.mjs#L96-L157) contains end-to-end unit and integration tests confirming that `ScoutPlayerAdapter` delegates to `runScoutFormation`, isolates provider failures, preserves `PARTIAL` outcomes, creates durable formation evidence, and responds to standard `router.dispatch` requests.

2. **Smallest remaining architectural risk:**
   - **In-memory single-flight lock (`private active = false`) with `supportsQueue: false` and lack of cancellation (`AbortSignal`):**
     In [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L66), `active` is a simple memory-only boolean flag. While a Formation is running, `capability()` sets `state: 'busy'`, and `execute()` throws if called again. Because Scout advertises `supportsQueue: false` ([`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L100)), any subsequent MANUAL dispatch attempt while a Formation is active is rejected immediately with HTTP 400 (`Scout is unavailable...`). Because `runScoutFormation` does not accept an `AbortSignal` or cancellation handle, if a subordinate Scout process hangs or stalls until runner timeout (e.g. 5 minutes), the logical Scout Player remains locked in `'busy'`, cannot be queued for, and cannot be canceled by the user without restarting the extension host.

---

# FACTS

- **Canonical Identity:** [`src/scout-player-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player-contract.ts#L2-L3) exports `SCOUT_PLAYER_INSTANCE_ID = 'scout'` and `SCOUT_PLAYER_TYPE = 'scout'`.
- **Extension Wiring:** [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L58-L60) instantiates `const scoutPlayer = new ScoutPlayerAdapter({ enabled: () => vscode.workspace.getConfiguration('coach').get<boolean>('scout.enabled', true) })` and passes it to `new StadiumClient({ scoutPlayer, ... })` ([`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L170)).
- **Capability Snapshot:** In [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L288-L300), `sendCapabilitySnapshot()` queries `this.options.scoutPlayer?.capability(ctx.binding.rootFsPath)` and appends the resulting `PlayerRoutingCapability` to the published capabilities array.
- **Availability Predicates:** [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L75-L101) invokes `inspectScoutFormationAvailability()`. If `availability.eligibleIds.length === 0`, it returns `undefined`. If eligible, it returns a capability with `executionType: 'scout-formation'`, `autoEligible: false`, `supportsQueue: false`, and `state: this.active ? 'busy' : 'ready'`.
- **Manual UI Presentation:** In [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2913-L2932), `updateManualModelAndEffort()` checks `candidate?.executionType === 'scout-formation'`. When true, model and effort selectors are disabled and set to `'Formation managed'`, and a notice is displayed: `"Scout uses the current eligible Formation. Combine remains the scorecard authority."`
- **Control Plane Dispatch:** In [`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L217-L244), when `routingMode === 'manual'` and `targetPlayerInstanceId === SCOUT_PLAYER_INSTANCE_ID`:
  - It validates `targetCapability.executionType === 'scout-formation'` and `targetCapability.state === 'ready'`.
  - It sets `targetModel = undefined` and `targetEffort = undefined`.
  - It creates a manual decision object with `provider: 'scout'`, `modelDisplayName: 'Scout Formation'`, and `action: 'dispatch'`.
  - In lines [328-330](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L328-L330), it excludes `scout-formation` from `isControlledReasoningPlay`, preventing reasoning provenance and destination instructions from being appended to the prompt.
  - In lines [428-444](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L428-L444), it dispatches the JSON-RPC request `'dispatch.request'` with `playerInstanceId: 'scout'`.
- **Stadium Delivery:** In [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L901-L905), `executeDispatch()` branches on `playerInstanceId === SCOUT_PLAYER_INSTANCE_ID` to `deliverScout(params)`.
- **Execution Invocation:** In [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L981-L1037), `deliverScout()` executes `scout.execute(prompt, ctx.binding.rootFsPath)`, sends notifications `'dispatch.accepted'`, `'turn.changed'` (`accepted`, `started`), sends a capability snapshot (`busy`), awaits completion, emits `'turn.changed'` (`completed`, `partial`, or `failed` with `result.outcome` and report path), publishes report changes, and sends a final capability snapshot (`ready`).
- **Engine Delegation:** In [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L112-L119), `execute()` invokes `(this.options.runFormation ?? runScoutFormation)({ objective, gameRoot, durableReportRoot, ... })`.
- **Exclusion from AUTO Routing:** In [`src/routing-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L229), candidates with `candidate.autoEligible === false` are filtered out from automatic selection. Scout sets `autoEligible: false` ([`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L99)), so AUTO never selects Scout unless explicitly constrained.

---

# INFERENCES

- MANUAL Scout routing converges on the exact same engine and evidence path as the CLI/SOP Scout Formation dispatcher; there is zero duplicated execution logic or independent health storage.
- The boundary between tryout film (Combine) and real game film (Formation) is preserved during manual dispatch: Formation execution writes reports to `REPORTS/Scout Only/Formations/<formationId>`, leaving `Combine/Scorecards/` intact.
- The logical Scout Player pattern successfully collapses an arbitrary formation of 1 to 3 concurrent model runners into one unified Controlled Player interface on the Sideline Team roster.

---

# UNKNOWNS

- Whether any client timeout could occur if `inspectScoutFormationAvailability()` experiences disk I/O latency when reading large numbers of scorecard JSON files during `sendCapabilitySnapshot()` in repositories with heavy disk activity.
- The future policy for handling quota/capacity exhaustion at runtime (as flagged in `src/scout-player.ts:35-41`), since static scorecard evidence marking a model `READY` does not reflect real-time provider rate limits.

---

# CONTRADICTIONS

- **None observed.** The implementation in `src/scout-player.ts`, `src/stadium-client.ts`, `src/control-plane/router.ts`, `src/routing-policy.ts`, and `src/public/index.html` strictly matches the test assertions in `test/scout-player-routing.test.mjs` and the architectural breadcrumbs in `src/scout-formation.ts`.

---

# Relevant files / symbols

- [`src/scout-player-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player-contract.ts): `SCOUT_PLAYER_INSTANCE_ID`, `SCOUT_PLAYER_TYPE`
- [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts): `ScoutPlayerAdapter`, `ScoutPlayerAdapter.capability()`, `ScoutPlayerAdapter.execute()`
- [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts): `StadiumClient.deliverScout()`, `StadiumClient.executeDispatch()`, `StadiumClient.sendCapabilitySnapshot()`
- [`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts): `ControlPlaneRouter.dispatch()`, manual routing guard for `SCOUT_PLAYER_INSTANCE_ID`
- [`src/routing-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts): `isOperableControlled()`, `constrainedCandidates()`, `autoEligible` handling
- [`src/scout-formation.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-formation.ts): `inspectScoutFormationAvailability()`, `runScoutFormation()`, `selectFormation()`
- [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts): ScoutPlayerAdapter initialization and StadiumClient binding
- [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html): `updateManualModelAndEffort()`
- [`test/scout-player-routing.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/scout-player-routing.test.mjs): Regression and convergence unit/integration tests

---

# Recommended next step

Equip `ScoutPlayerAdapter.execute()` and `runScoutFormation()` with an optional `AbortSignal` parameter (and propagate it to `ScoutPlayExecutor.execute()`). This provides a clean mechanism to cancel in-flight Formation runs and reset `this.active = false` without leaving background CLI runner processes orphaned or locking out future dispatches.

---

# Provenance

- Performed static read-only analysis of repository source files, test fixtures, and documentation in `C:\Users\dmcal\Documents\GitHub\SidelineCoach` on 2026-09-17.
