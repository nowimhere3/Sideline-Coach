# SIDELINE COACH — AI HEALTH FRESHNESS HARDENING REPORT

**Date:** 2026-09-22  
**Agent:** AntiGravity  
**Role:** Bounded implementation worker  
**Game:** Sideline Coach  
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  

---

## 1. EXECUTIVE SUMMARY

We have completed the AI Health Freshness Hardening implementation. The system now enforces strict factual freshness guarantees across both Claude and Codex:
1. **Live Native Evidence:** Verified that Claude structured print forwards native `rate_limit_event` frames (including the production nested `unifiedWindows.five_hour` and `unifiedWindows.seven_day` shape) directly to `HealthAuthority` via `stadiumClient.sendHealthEvidence`.
2. **Codex Completed Turn Freshness:** Added an authoritative zero-inference `readRateLimits()` call immediately upon `turn/completed` on the existing Codex app-server session. This emits via the existing `onHealthFrame` pathway without any new model turns, thread restarts, or background polling.
3. **Claude Reconciliation Policy:** Capped Sideline's internal fallback gate to the configured refresh cadence (default 5 minutes), removing the legacy self-escalating ladder (5m -> 10m -> 20m -> 40m -> 60m). The system explicitly distinguishes between `provider-directed gate` (honoring explicit `Retry-After`) and `Sideline fallback gate`.
4. **Manual Refresh Dual-Provider Acquisition:** Hardened `POST /api/ai-health/refresh` to trigger factual acquisitions for **both** Claude (via the daemon-owned OAuth reader) and Codex (via a zero-inference app-server session in `CodexUsageReader`) concurrently.
5. **Truthful Feedback:** Implemented `formatRefreshFeedback` returning truthful, compact per-provider status (`Refreshed ✓`, `Codex refreshed · Claude rate-limited`, `Claude refreshed · Codex unavailable`, `Refresh failed`).

---

## 2. SEAMS & ARCHITECTURAL IMPLEMENTATION

### A. Claude Live Evidence Forwarding (`src/extension.ts`)
- **Inspection:** Verified that `createClaudeControlFactory` in [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts) is registered with:
  ```typescript
  playerControlHost.register('claude', createClaudeControlFactory({
    onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)
  }));
  ```
- **Live Ingest:** When Claude emits `rate_limit_event` during controlled turns, the bounded `rate_limit_info` (with nested `unifiedWindows`) is pushed immediately to `HealthAuthority`, updating provider facts synchronously with 0ms polling delay.

### B. Codex Post-Turn Rate Limit Acquisition (`src/player-control/codex-app-server.ts`)
- **Seam:** In `CodexAppServerControl.notification()`, when handling `method === 'turn/completed'`:
  ```typescript
  void readRateLimits(this.rpc, { onHealthFrame: this.onHealthFrame }, this.instanceId).then((limits) => {
    if (limits) this.rateLimits = limits;
  });
  ```
- **Properties:**
  - Operates on the existing child process JSON-RPC channel.
  - Exactly one `account/rateLimits/read` call per completed turn.
  - Zero model turns (`turn/start`), zero inference calls, zero thread restarts.
  - Emits through the registered `onHealthFrame` callback to update `HealthAuthority`.

### C. Claude Fallback Policy Hardening (`src/control-plane/claude-usage-reader.ts`)
- **Eliminated Artificial Escalation:** Removed the hardcoded `BACKOFF_MS = [5m, 10m, 20m, 40m, 60m]` progression.
- **Provider vs Sideline Gating:**
  - `provider-directed gate`: Active when the HTTP 429 response includes a valid `Retry-After` header. Schedules the next attempt according to the provider header. Manual refresh strictly blocks and honors this gate.
  - `Sideline fallback gate`: Active when HTTP 429 lacks a `Retry-After` header. Delay is capped at the configured cadence (`cadenceMinutes * 60_000ms`, default 5m). It never self-escalates to 10m, 20m, 40m, or 60m.
- **Manual Bypass:** Manual `refresh()` bypasses the `Sideline fallback gate` to attempt a fresh acquisition, protected by a 2000ms rapid button-spam guard.

### D. Daemon-Owned Global Codex Usage Reader (`src/control-plane/codex-usage-reader.ts`)
- **Created `CodexUsageReader`:** Daemon-owned, manual-refresh-only reader for Codex.
- **Protocol:** Launches `codex app-server`, performs JSON-RPC handshake (`initialize` -> `initialized` -> `account/rateLimits/read`), passes rate limits to `HealthAuthority`, and terminates gracefully.
- **Guarantees:**
  - Zero background polling.
  - Deduplicates concurrent manual refresh requests to a single in-flight process.
  - Returns `CodexUsageOutcome` (`ok`, `code`, `reason`, `rateLimits`).

### E. Dual-Provider Refresh Route (`src/control-plane/daemon.ts`)
- Updated `POST /api/ai-health/refresh` to refresh Claude and Codex concurrently via `Promise.all`:
  ```typescript
  const [claudeResult, codexResult] = await Promise.all([claudePromise, codexPromise]);
  ```
- Generates truthful per-provider outcomes:
  - Claude: `changed` | `unchanged` | `rate_limited` | `auth_rejected` | `unavailable` | `failed`
  - Codex: `changed` | `unchanged` | `unavailable` | `failed`
- Returns unified JSON response:
  ```json
  {
    "success": true,
    "health": { ... },
    "acquisition": {
      "claude": { "outcome": "changed", "checkedAt": "..." },
      "codex": { "outcome": "unchanged", "checkedAt": "..." }
    }
  }
  ```

### F. Refresh Truthfulness Formatting (`src/control-plane/protocol.ts`)
- Implemented `formatRefreshFeedback(acquisition)` helper ensuring truthful feedback:
  - Both good: `Refreshed ✓`
  - Claude rate-limited, Codex refreshed: `Codex refreshed · Claude rate-limited`
  - Claude failed, Codex refreshed: `Codex refreshed · Claude failed`
  - Codex unavailable, Claude refreshed: `Claude refreshed · Codex unavailable`
  - Codex failed, Claude refreshed: `Claude refreshed · Codex failed`
  - Claude rate-limited, Codex unavailable: `Claude rate-limited · Codex unavailable`
  - Failure: `Refresh failed`

---

## 3. VERIFICATION & FOCUSED TEST SUITE

### New Focused Test Suite: `test/ai-health-freshness-hardening.test.mjs`
Created a comprehensive 9-test proof suite testing every required contract point:
1. `Production Claude factory forwards onHealthFrame to stadiumClient`: Proves production wiring and factory callback acceptance.
2. `Real unifiedWindows Claude event reaches HealthAuthority and changes health immediately without waiting for OAuth polling`: Validates synchronous ingest and `onChange` firing for real Claude event payloads.
3. `Default 5-minute fallback cannot silently escalate to 10/20/40/60 minutes without provider Retry-After`: Proves fallback gate remains fixed at configured cadence across repeated failures.
4. `Explicit Retry-After is still honored under provider-directed gate`: Proves that a 900s `Retry-After` header creates an explicit provider-directed gate.
5. `Manual Refresh can bypass internal fallback gate but NOT explicit provider Retry-After`: Verifies manual refresh makes a network call under Sideline fallback gate, but short-circuits under provider-directed gate.
6. `Manual Refresh performs real Codex account/rateLimits/read via CodexUsageReader`: Verifies zero-inference Codex refresh and HealthAuthority ingest.
7. `Codex turn/completed performs exactly one final zero-inference readRateLimits read on existing session`: Verifies app-server `turn/completed` triggers rate limit read with zero model turns.
8. `Refresh feedback truthfully states outcomes for both providers`: Verifies compact truthful feedback formatting across all combination states.
9. `POST /api/ai-health/refresh refreshes both providers and converges to HealthAuthority persistence`: Verifies full daemon endpoint handling and dual-provider acquisition.

### Test Execution Results
All AI Health test suites pass cleanly:
```
✔ test/ai-health-freshness-hardening.test.mjs (9/9 pass)
✔ test/claude-usage-reader.test.mjs (22/22 pass)
✔ test/claude-usage-reader-daemon.test.mjs (11/11 pass)
✔ test/health-authority.test.mjs (18/18 pass)
✔ test/health-authority-daemon.test.mjs (1/1 pass)
✔ test/q2-10c-controlled-print.test.mjs (16/16 pass)
-------------------------------------------------------
Total Passing Tests: 77 / 77
TypeScript Compilation: 0 errors
```

---

## 4. FIELD ACCEPTANCE CHECKLIST

1. **Claude In-Turn Live Health:**
   - Run a controlled Claude turn.
   - Verify `stadiumClient.sendHealthEvidence` receives native `rate_limit_event` frames.
   - Confirm `HealthAuthority` updates Claude capacity in real-time during the turn.
2. **Reconciliation Cadence:**
   - Verify Claude OAuth reconciliation runs at the configured 5-minute cadence.
   - If a 429 response is received without `Retry-After`, confirm that the next automatic poll is scheduled after exactly 5 minutes (never 10/20/40/60m).
3. **Manual Dual Refresh:**
   - Trigger `POST /api/ai-health/refresh` via the Refresh button.
   - Observe that both Claude OAuth and Codex app-server acquisitions run concurrently.
   - Confirm UI displays truthful status reflecting both providers.
4. **Codex Post-Turn Update:**
   - Execute a Codex turn.
   - When the turn finishes (`turn/completed`), observe that `account/rateLimits/read` executes immediately without starting a new model turn or restarting the Dev Host.

---

## 5. REPOSITORY INTEGRITY

- **No commits or git pushes performed.**
- **No changes to UI Scoreboard layout or visual styling.**
- **Compilation verified:** Clean (`tsc -p ./` exits 0).

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\AntiGravity\AI-Health-Freshness-Hardening__20260922-172649__AntiGravity.md`
