# SCOUT PLAY - READ-ONLY RECONNAISSANCE

**Play ID**: ai-health-freshness-recon-20260922-152433  
**Scout ID**: codex-restart-vs-refresh  
**Assigned Model**: openrouter/nvidia/nemotron-3-super-120b-a12b:free  

---

## CURRENT BEHAVIOR

### Startup Path (Development Host Reload)
1. Extension reactivates, `playerControlHost` creates/restores Codex control via `CodexAppServerFactory`.
2. During `open()` or `restore()`, `readRateLimits()` is called (invokes `account/rateLimits/read` RPC).
3. `readRateLimits()` sends initial health frame via `onHealthFrame` → `stadiumClient.sendHealthEvidence()` → `health.evidence` WS notification to daemon.
4. Daemon ingests via `HealthAuthority.ingest()`, updating Codex health state.
5. Health authority change triggers SSE/UI update.

### Manual-Refresh Path (POST /api/ai-health/refresh)
1. Handler in `daemon.ts` invokes `claudeUsageReader.refresh()` only.
2. No Codex acquisition is triggered; Codex health state remains unchanged.
3. Only Claude usage reader performs a forced read; Codex relies solely on native events or session restart.

---

## FACT / INFERENCE / UNKNOWN / CONTRADICTION

| Claim                                                                 | Label         | Evidence                                                                                                                                 |
|-----------------------------------------------------------------------|---------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Codex health updates via `account/rateLimits/read` at session start   | FACT          | `codex-app-server.ts`: `readRateLimits()` called in `open()` and `restore()` paths, sends health frame (lines 351, 453, 743-746). |
| Codex health updates via `account/rateLimits/updated` native push     | FACT          | `codex-app-server.ts`: notification handler for `account/rateLimits/updated` merges and sends health frame (lines 644-649).          |
| Manual `/api/ai-health/refresh` invokes Claude usage reader only      | FACT          | `daemon.ts`: handler exclusively calls `this.claudeUsageReader.refresh()` (lines 1069-1090).                                          |
| No Codex acquisition occurs during manual refresh                     | FACT          | No reference to Codex in refresh handler; Codex health authority untouched.                                                              |
| Development Host reload triggers Codex health refresh                 | INFERENCE     | Reload re-activates extension → new Codex control sessions → `readRateLimits()` called (same as startup path).                        |
| Codex health can stale without native events or restart               | INFERENCE     | No periodic reader for Codex; health authority only updates on ingested evidence (native event or session restart).                   |
| HealthAuthority deduplicates Codex facts by rateLimitInfo equality    | FACT          | `health-authority.ts`: Codex unchanged check compares `JSON.stringify` of facts excluding `observedAt` (line 144).                   |
| SSE/UI updates follow health authority changes                        | FACT          | `health-authority.ts`: `onChange` callback invoked on state change (line 152); daemon broadcasts state over SSE (implied by HTTP/WS). |

---

## IMPORTANT FILES / FUNCTIONS

- `src/player-control/codex-app-server.ts`  
  - `readRateLimits()`: performs `account/rateLimits/read` and sends initial health frame.  
  - Notification handler for `account/rateLimits/updated`: processes native push and sends health frame.  
- `src/control-plane/health-authority.ts`  
  - `ingest()`: processes Codex evidence, dedupes by rateLimitInfo equality.  
  - `getSnapshot()`: exposes current health state for SSE/UI.  
- `src/control-plane/daemon.ts`  
  - Manual refresh handler (`/api/ai-health/refresh`): Claude-only invocation.  
  - `health.evidence` WS notification handler: routes evidence to health authority.  
- `src/extension.ts`  
  - Codex/Claude control factories: `onHealthFrame` wired to `stadiumClient.sendHealthEvidence`.  

---

## ROOT CAUSE

The Development Host reload triggers a full Codex session restart (via `open()`/`restore()`), which includes an immediate `account/rateLimits/read` and health frame emission. The manual refresh button exclusively invokes the Claude usage reader (`ClaudeUsageReader.refresh()`) and contains no Codex acquisition logic. This asymmetry exists because Codex health relies solely on session-bound native events (or session restart) for updates, while Claude has a separate global usage reader that can be manually triggered.

---

## SMALLEST REPAIR SEAM

To make the manual Refresh button update both providers, extend the `/api/ai-health/refresh` handler to also trigger a Codex health read. The simplest approach is to:

1. Reuse the existing `readRateLimits()` logic via the active Codex control (if any) for the current Game.
2. If no Codex control exists, the refresh could be a no-op for Codex (or require a session restart, which is out of scope for a manual refresh).

**Seam**: Modify the `POST /api/ai-health/refresh` handler in `src/control-plane/daemon.ts` to, after the Claude refresh, attempt to read Codex rate limits from the active Codex player control (via the `playerControlHost` or `StadiumClient`) and ingest the result.

However, note that the daemon does not have direct access to the player control host. A cleaner seam is to introduce a lightweight "refresh health" RPC to the Stadium (similar to `health.evidence` but request-based) that the Stadium can forward to the active Codex control, which would then perform `readRateLimits()` and emit a health frame. This avoids tight coupling and leverages existing paths.

Given the read-only constraint, we identify the seam without implementing:

- **Target**: `src/control-plane/daemon.ts`, manual refresh handler.  
- **Action**: After Claude refresh, invoke a new internal method (or extend existing) to prompt Codex health read for the selected Game’s active Codex instance (if any).  
- **Leverage**: Existing `readRateLimits()` function and `onHealthFrame` pathway in the Codex app server.

---

## FOCUSED TEST CONTRACT

To verify the repair without implementation:

1. **Precondition**:  
   - Codex app server running with known stale rate limits (e.g., manually set via mock).  
   - Health authority snapshot shows stale Codex utilization.  

2. **Stimulus**:  
   - Send `POST /api/ai-health/refresh` (manual refresh).  

3. **Expected Post-Condition**:  
   - Codex health authority snapshot shows updated rate limits (matching a fresh `account/rateLimits/read`).  
   - Claude health authority snapshot also updated (existing behavior).  
   - SSE/UI publishes updated health state for both providers.  
   - No extraneous side effects (e.g., no thread restart, no Play disruption).  

4. **Negative Case**:  
   - If no Codex control exists for the selected Game, Codex health state remains unchanged (acceptable seams).  

---  

**Limitation**: Reconnaissance did not examine SSE broadcast mechanics in detail; assumes existing health authority change propagation works for Codex as it does for Claude.  
**Status**: Reconnaissance complete for bounded objective.  

---  
*Report generated by sideline-scout-balanced using openrouter/nvidia/nemotron-3-super-120b-a12b:free. This is reconnaissance, not final architectural authority.*
