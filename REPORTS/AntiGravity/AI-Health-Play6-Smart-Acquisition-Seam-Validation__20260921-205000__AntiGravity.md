# AI HEALTH PLAY 6 — SMART ACQUISITION SEAM VALIDATION REPORT

**Date:** 2026-09-21  
**Agent:** AntiGravity  
**Role:** Architect, Seam Validator & Scope Pack Compiler  
**Target Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Formation Intelligence:** `C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\FORMATION-RESULT.md`

---

## 1. VERIFIED CURRENT STATE

Sideline already has an established, working end-to-end AI health pipeline:
* **One Global Authority:** `HealthAuthority` in [`src/control-plane/health-authority.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts) instantiated as a daemon-level singleton in [`src/control-plane/daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L216-L224).
* **Unified Wire Transport:** Protocol method `'health.evidence'` using feature flag `health.evidence.v1` in [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts#L417-L425) and handled in [`src/control-plane/daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L921-L930).
* **Bounded Evidence Union:** `HealthEvidence` = `ClaudeHealthEvidence` (`rate_limit_event`) | `CodexHealthEvidence` (`account_rate_limits`) defined in [`src/control-plane/protocol.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/protocol.ts#L148-L160).
* **Durability & Read Surfaces:** Persistence via `ai-health-state.json`, HTTP `GET /api/ai-health`, and SSE event stream `ai-health`.
* **Factual Replay Suppression:** Built into `HealthAuthority.ingest()` (`health-authority.ts:131`), suppressing duplicate persistence and SSE broadcasts when identical factual content arrives.

### Current Provider Acquisition Paths

1. **Codex Path (Fully Wired):**
   * **Startup Read:** Zero-inference native read `account/rateLimits/read` in [`src/player-control/codex-app-server.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L741-L750) upon open/restore.
   * **Rolling Push:** Sparse push notifications `account/rateLimits/updated` in [`src/player-control/codex-app-server.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L644-L649).
   * **Forwarding Callback:** Invokes `this.onHealthFrame?.(this.instanceId, { provider: 'codex', type: 'account_rate_limits', rate_limits: merged })`.
   * **Registration Seam:** Wired in [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L57-L59):
     ```ts
     playerControlHost.register('codex', new CodexAppServerFactory({
       onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)
     }));
     ```

2. **Claude Path (Tap Built, Extension Registration Missing):**
   * **Turn Tap:** Structured-print stdout stream-json line parser in [`src/player-control/structured-print.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L485-L491) catches `frame.type === 'rate_limit_event'` during active turns and calls `this.options.onHealthFrame?.(this.instanceId, { provider: 'claude', type: 'rate_limit_event', rate_limit_info: rateLimitInfo })`.
   * **Registration Seam:** In [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L60):
     ```ts
     playerControlHost.register('claude', createClaudeControlFactory());
     ```
     `createClaudeControlFactory()` is called with **no options**, leaving `options.onHealthFrame` undefined in production.

---

## 2. SCOUT ADJUDICATIONS

| Issue | Scout 1 (health-acquisition-lifecycle) | Scout 2 (health-freshness-dedup-watchers) | Ground Truth Adjudication |
|---|---|---|---|
| **Claude `onHealthFrame` wiring in `extension.ts`** | Reported **missing**: `createClaudeControlFactory()` is called with no options at line 60. | Reported **wired**: claimed `onHealthFrame` is wired at line 58 for both factories. | **Scout 1 is FACTUALLY TRUE. Scout 2 misread line 58.** Line 58 only configures `CodexAppServerFactory`. Line 60 omits options for Claude. |
| **Need for "Watchers"** | Concluded no global watcher exists; acquisition is per-control instance. | Inferred Play 6 should add "one watcher per provider/surface" to manage lifecycle. | **Both Scouts over-assumed the word "Watcher."** The established architecture is event-driven. Codex already has startup read + push; Claude emits stdout frames. Neither needs a long-lived polling process or background timers. |
| **Deduplication Scope** | Noted Authority aggregates globally by provider. | Suggested a new "watcher registry" keyed by provider/surface. | **Scout 2's registry is unnecessary.** `HealthAuthority` is already keyed globally by provider (`providers: { claude?, codex? }`). Replay suppression operates on incoming facts. |
| **Contradictions** | Identified the genuine contradiction between Play charter and code for Claude wiring. | Reported "None found." | **Scout 1 correctly flagged the missing Claude wiring.** |

---

## 3. SEAM VALIDATION & ARCHITECTURAL DECISIONS

### Question 1: Claude Wiring Contradiction
* **Inspection Result:** [`src/extension.ts:60`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L60) registers Claude without options:
  ```ts
  playerControlHost.register('claude', createClaudeControlFactory());
  ```
  While [`src/player-control/structured-print.ts:719`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L719) declares:
  ```ts
  export function createClaudeControlFactory(options?: PrintLaunchOptions): StructuredPrintFactory
  ```
* **Smallest Repair:** Pass the identical callback already used for Codex:
  ```ts
  playerControlHost.register('claude', createClaudeControlFactory({
    onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)
  }));
  ```

### Question 2: Does Play 6 Need "Watchers"?
* **Decision: NO LONG-LIVED WATCHERS, NO POLLING, NO TIMERS.**
* **Rationale:**
  * **Acquisition hierarchy:** Native provider push → piggyback on active provider control → one zero-inference read where needed → last-known factual evidence → UNKNOWN.
  * **Codex:** Has native push (`account/rateLimits/updated`) + one startup zero-inference read (`account/rateLimits/read`) via the active app-server connection. Adding polling would waste resources and violate the event-driven contract.
  * **Claude:** Emits native stdout `rate_limit_event` frames during active turns. Claude CLI has no zero-inference rate-limit inspection command (only `--model` and `--effort` probes). Polling Claude would require synthetic prompt executions that consume user quota.
  * Both providers are already satisfied by native push and active piggybacking. No separate watcher processes or polling intervals are required.

### Question 3: Coordinator Ownership
* **Decision: MINIMAL DESIGN DIRECTLY IN `HealthAuthority` / `ControlPlaneDaemon` — NO `HealthAcquisitionCoordinator`.**
* **Rationale:**
  * Testing against the 5 criteria:
    1. *Singleton ownership:* Already held by `HealthAuthority` inside `ControlPlaneDaemon`.
    2. *Lifecycle:* Already deterministic, bound to daemon startup/shutdown and WebSocket sessions.
    3. *Duplicate prevention:* Already built into `HealthAuthority.ingest()`.
    4. *Future provider extensibility:* Handled cleanly by adding variants to `HealthEvidence` and `providers` map.
    5. *Focused testing:* `HealthAuthority` already has isolated, ultra-fast unit tests (`test/health-authority.test.mjs`).
  * Because there are no background processes, child forks, or polling loops to supervise, a `HealthAcquisitionCoordinator` would be a hollow, ceremonial pass-through wrapper.

### Question 4: Freshness / Last-Known / Disconnection
* **Decision: SEPARATE FACTUAL EVIDENCE FROM DERIVED READ-TIME AVAILABILITY.**
* **Rules:**
  1. `observedAt` is recorded at ingestion time (`this.now().toISOString()`). It is NEVER provider `resetsAt`.
  2. Factual provider evidence (`rateLimitInfo`) is retained indefinitely as last-known until newer factual evidence replaces it.
  3. Disconnection of a Player or Stadium session does **NOT** convert evidence to "unhealthy" or mutate provider facts.
  4. Derived read projection can optionally indicate source availability (`sourceConnected: boolean`) by verifying whether `source.instanceId` is currently active in `StadiumRegistry`.
  5. No synthetic routing thresholds (no "healthy", "degraded", "critical" enums) are introduced.

### Question 5: Duplication
* **Decision: REUSE AND PRESERVE EXISTING FACTUAL REPLAY SUPPRESSION.**
* **Details:**
  * `HealthAuthority.ingest()` suppresses exact duplicates:
    ```ts
    const previous = this.state.providers[provider];
    if (previous && JSON.stringify({ ...previous, observedAt: undefined }) === JSON.stringify({ ...factual, observedAt: undefined })) return false;
    ```
  * Because `factual.source` includes `playerInstanceId`, if Player B observes and emits the same rate limit info after Player A, it is acknowledged and updates the source attribution without being discarded as a stale replay.
  * If the same Player instance emits the exact same payload consecutively, it is safely suppressed.
  * No secondary registry is needed.

### Question 6: Backoff / Retry
* **Decision: NO RETRY OR BACKOFF LOOP.**
* **Rationale:** There is no separate acquisition process that can fail independently. Claude frames arrive over stdout of active turns; Codex notifications arrive over the active app-server JSON-RPC connection. Process crashes are handled by turn/app-server lifecycles, not a health loop.

### Future Providers
* AntiGravity and future providers will join via their own dialect/transport when concrete native seams are proven. No AntiGravity acquisition logic is designed or added in Play 6.

---

## 4. EXACT IMPLEMENTATION SCOPE

Only two source files and two test files must be touched:

### Source Files
1. [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L60)
   * Wire `onHealthFrame` in `createClaudeControlFactory({ onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence) })`.
2. [`src/control-plane/health-authority.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts)
   * Ensure `getSnapshot()` documentation and types maintain clean separation between factual evidence and read-time provenance.

### Test Files
1. [`test/health-authority.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/health-authority.test.mjs)
   * Add test verifying that independent Player instances emitting valid facts are both recorded cleanly and that factual replay from the same Player is suppressed.
   * Add test verifying that `observedAt` reflects ingestion timestamp rather than provider `resetsAt`.
2. [`test/stadium-bridge.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/stadium-bridge.test.mjs) (or new focused test)
   * Verify that Claude factory registered in `extension.ts` has `onHealthFrame` configured and forwards through `StadiumClient.sendHealthEvidence`.

---

## 5. FOCUSED TEST PLAN

1. **Claude Registration Verification:**
   * Test verifies `extension.ts` wires `onHealthFrame` to `stadiumClient.sendHealthEvidence` for both `'claude'` and `'codex'` registrations.
2. **No Polling / No Timers:**
   * Static/lifecycle test verifies no `setInterval`, `setTimeout`, or background pollers are registered for health acquisition in either `StadiumClient` or `ControlPlaneDaemon`.
3. **Factual Replay Suppression:**
   * Verify identical consecutive payloads from the same Player instance return `false` on ingest, emit no `onChange`, and trigger no persistence save.
4. **Multi-Player Integrity:**
   * Verify that when Player A (`claude-1`) emits evidence and later Player B (`claude-2`) emits evidence, the Authority updates without improper cross-player suppression.
5. **Neutral Last-Known Durability:**
   * Verify that evidence persisted in `ai-health-state.json` restores cleanly on restart and remains tagged with original factual `observedAt`.
6. **No Routing Interpretation:**
   * Verify snapshots contain no synthetic health ratings or threshold classifications.

---

## 6. SLICE DECISION

* **DECISION: ONE BOUNDED PLAY 6 SLICE.**
* **Justification:** The entire scope consists of wiring one missing callback in `extension.ts`, verifying clean read-time neutrality in `health-authority.ts`, and adding focused regression tests. Splitting into 6.1/6.2 would be ceremonial overhead.

---

## 7. WORKER SCOPE PACK

```yaml
pack_id: ai-health-play6-smart-acquisition
slice: 1 of 1 (single bounded slice)
target_repo: C:\Users\dmcal\Documents\GitHub\SidelineCoach
primary_files:
  - src/extension.ts
  - src/control-plane/health-authority.ts
test_files:
  - test/health-authority.test.mjs
  - test/stadium-bridge.test.mjs
```

### Exact Task List for Worker:
1. **Wire Claude Callback:**
   In `src/extension.ts` line 60, update:
   ```ts
   playerControlHost.register('claude', createClaudeControlFactory({
     onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)
   }));
   ```
2. **Verify Multi-Player Ingest Behavior:**
   In `src/control-plane/health-authority.ts`, verify that `ingest()` correctly admits updates from distinct `playerInstanceId`s while preserving replay suppression for identical repeats from the same source.
3. **Execute & Expand Tests:**
   * Add a test in `test/health-authority.test.mjs` asserting:
     * Player A emits -> accepted (`true`).
     * Player A re-emits exact same -> suppressed (`false`).
     * Player B emits with same provider -> accepted (`true`, updates `source`).
     * Snapshot contains no synthetic health status or routing policies.
   * Run test suite: `node --test test/health-authority.test.mjs test/stadium-bridge.test.mjs`.

### Acceptance Criteria:
* `createClaudeControlFactory` in `src/extension.ts` is provided with `onHealthFrame`.
* No polling loops, timers, or background watcher processes are introduced.
* Existing Codex and Claude native push paths remain intact.
* Replay suppression and multi-player update semantics are covered by passing tests.
* HealthAuthority remains pure factual evidence without routing policy.
