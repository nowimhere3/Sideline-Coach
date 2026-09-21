This report is reconnaissance, not final architectural authority.

# Executive answer
The Q2.14 Scout Player Card capability/card seam lives across three distinct layers:
1. **Backend Capability & Adapter Layer** ([`src/scout-player-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player-contract.ts) and [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L65-L121)): Exposes Scout's logical identity (`instanceId: 'scout'`, `playerType: 'scout'`, `executionType: 'scout-formation'`) via `ScoutPlayerAdapter.capability()`, returning `undefined` if disabled or if zero Formation receivers are proven ready.
2. **Stadium Delivery & Notification Layer** ([`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L989-L1038)): Manages client-initiated Scout dispatches via `deliverScout()`. It intercepts execution selection via the `onSelected` callback from `runScoutFormation()` to fire a `started` turn notification carrying `summary: "${count} Scout${count === 1 ? '' : 's'} running"` prior to receiver execution.
3. **Frontend Presentation Seam** ([`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3337-L3368)): Discovers Scout by matching `executionType === 'scout-formation'` in `status.routing.capabilities`. It renders Scout as a synthetic Team card (not in `PlayerInstanceBook`, non-benchable, omitted from candidate dropdowns) and attaches to the standard Play strip (`renderPlayerStrips()`) via `rosterRows.get('scout')`.

The **work-ledger seam** ([`src/control-plane/work-ledger.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/work-ledger.ts#L255-L262)) accommodates client-initiated Scout dispatches—which bypass the router and thus lack an initial dispatch-time `promptSummary`—by filling `entry.currentPlay.promptSummary` from `turn.summary` when `state === 'started'` **only if** `promptSummary` is currently empty. This permits the truthful receiver count ("*N* Scouts running") to populate the working-phase summary without overwriting standard router-dispatched Plays or restarting the elapsed execution timer.

---

# FACTS
1. **Identity and Transport Contract**:
   - `SCOUT_PLAYER_INSTANCE_ID = 'scout'` and `SCOUT_PLAYER_TYPE = 'scout'` are defined in [`src/scout-player-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player-contract.ts#L1-L4).
   - In [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L103-L120), `ScoutPlayerAdapter.capability()` returns a `PlayerRoutingCapability` with `instanceId: 'scout'`, `playerType: 'scout'`, `transport: 'controlled'`, `fieldLabel: 'Scout'`, `state: this.active ? 'busy' : 'ready'`, `executionType: 'scout-formation'`, `autoEligible: false`, and `supportsQueue: false`.
   - If `this.options.enabled?.() === false` or `inspectScoutFormationAvailability().eligibleIds.length === 0`, `capability()` returns `undefined` ([`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L95-L101)).

2. **Truthful Receiver Count Dispatch Wiring**:
   - In [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L1012-L1023), `deliverScout()` invokes `scout.execute(prompt, ctx.binding.rootFsPath, { onSelected: (info) => { ... } })`.
   - When `onSelected` fires synchronously after formation candidate selection, `deliverScout()` dispatches a turn event:
     ```typescript
     this.sendTurnChanged({
       instanceId: SCOUT_PLAYER_INSTANCE_ID,
       turnRef,
       state: 'started',
       summary: `${count} Scout${count === 1 ? '' : 's'} running`,
       at: Date.now()
     });
     ```
   - Before `run` finishes, `deliverScout()` sends an unconditional fallback `started` turn event ([`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L1036)).

3. **Work-Ledger Working-Phase Summary Seam**:
   - In [`src/control-plane/work-ledger.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/work-ledger.ts#L241-L263), `InstanceWorkLedger.recordTurn(gameId, turn)` handles `state === 'accepted' || state === 'started'`.
   - Line 252–254 sets `entry.currentPlay.executionStartedAt` once when entering `started` (and does not overwrite if already set).
   - Lines 260–262 guard summary assignment:
     ```typescript
     if (state === 'started' && entry.currentPlay && turn.summary && !entry.currentPlay.promptSummary) {
       entry.currentPlay = { ...entry.currentPlay, promptSummary: turn.summary };
     }
     ```
   - If a dispatch previously set `promptSummary` via `recordDispatch()`, `!entry.currentPlay.promptSummary` is false, preventing turn event summaries from overwriting router-originating Play summaries.

4. **Projection and UI Consumption**:
   - [`src/control-plane/execution-projection.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/execution-projection.ts#L81-L89) projects `entry.currentPlay.promptSummary` into `ExecutionView.summary` when `entry.workState === 'working'`.
   - [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3346-L3368) identifies Scout via `(status.routing?.capabilities || []).find((c) => c.executionType === 'scout-formation')`.
   - When present, it registers `SCOUT_INSTANCE_ID` in `rosterRows`.
   - [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2173-L2186, #L2348-L2371) uses `renderPlayerStrips()` to read `executionStore.views.get('scout')`, displaying `◉ Working · ${summary}` along with `executionStartedAt` in the aggregate timer.

---

# INFERENCES
1. **Decoupling from Formation internals**: The front end and work ledger never poll individual sub-receiver streams. The `onSelected` callback in `ScoutPlayerAdapter.execute` / `runScoutFormation` isolates the aggregate count calculation from UI concerns, ensuring the UI remains truthful without inventing unproven per-receiver telemetry.
2. **Idempotency against Fallbacks**: Emitting an unconditional fallback `started` turn in `stadium-client.ts` followed by an `onSelected` enriched `started` turn is designed so that even if `runFormation` does not implement `onSelected`, the ledger still advances to `working`; when `onSelected` does fire, it enriches the empty `promptSummary` and retains the original `executionStartedAt` timestamp.

---

# UNKNOWNS
1. **Entitlement Layer Mechanics**: Comments in [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts#L87-L92) note a planned future commercial entitlement layer (rendering a locked card with "Unlock Scout" rather than hiding the card entirely when `capability()` returns `undefined`). Current static evidence does not indicate where that future entitlement gate will be evaluated.

---

# CONTRADICTIONS
- None. The implementation in `scout-player.ts`, `stadium-client.ts`, `work-ledger.ts`, and `index.html` aligns strictly with test specifications in [`test/q2-14-scout-player-card.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/q2-14-scout-player-card.test.mjs) and [`test/q2-10f-2-completion-report-ready-acknowledgement.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/q2-10f-2-completion-report-ready-acknowledgement.test.mjs#L534-L582).

---

# Relevant files / symbols
- [`src/scout-player-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player-contract.ts): `SCOUT_PLAYER_INSTANCE_ID`, `SCOUT_PLAYER_TYPE`
- [`src/scout-player.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-player.ts): `ScoutPlayerAdapter.capability()`, `ScoutPlayerAdapter.execute()`
- [`src/scout-formation.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/scout-formation.ts): `runScoutFormation()`, `inspectScoutFormationAvailability()`
- [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts): `StadiumClient.deliverScout()`, `onSelected` callback hook
- [`src/control-plane/work-ledger.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/work-ledger.ts): `InstanceWorkLedger.recordTurn()`, empty `promptSummary` fill seam
- [`src/control-plane/execution-projection.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/execution-projection.ts): `projectExecution()`, `ExecutionView`
- [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html): `SCOUT_INSTANCE_ID`, synthetic card row generation (L3337–L3368), `renderPlayerStrips()`, `stripCopy()`
- [`test/q2-14-scout-player-card.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/q2-14-scout-player-card.test.mjs): Regression test suite validating tests B1 through B7 for truthful receiver count and ledger filling.

---

# Recommended next step
Retain this reconnaissance as baseline evidence for any upcoming Scout entitlement/gating modifications. If modifying capability exposure or dispatch summaries, run the test suite `node --test test/q2-14-scout-player-card.test.mjs` to ensure the work-ledger fill contract is preserved.

---

# Provenance
- Target Workspace: `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
- Scope: Objective-bounded read-only static source inspection.
