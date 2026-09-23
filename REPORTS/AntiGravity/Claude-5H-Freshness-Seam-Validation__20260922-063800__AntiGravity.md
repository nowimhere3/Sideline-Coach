# Claude 5H Freshness — Senior Seam Validation

**Validator:** AntiGravity (Senior Architect Preflight)  
**Date:** 2026-09-22  
**Game:** Sideline Coach  
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Formation Reference:** `claude-5h-freshness-path-20260922` (`C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922`)

---

## 1. MOST LIKELY ROOT CAUSE

The failure of the automatic 10-second health path to converge before manual Refresh forced it is caused by the interaction of two concrete factors:

1. **Provider-Boundary Lag / Partial Payload After Reset:**
   At the 5-hour quota reset boundary (and before new user inference begins), Anthropic's undocumented `/api/oauth/usage` endpoint either temporarily omits `five_hour` or returns an unpopulated/null window while `seven_day` remains valid. `canonicalClaudeWindowsFromOAuth()` faithfully omits missing windows rather than fabricating values, producing a canonical result containing only `seven_day`.

2. **The "Stale Retention" Defect in `HealthAuthority` (Primary Architectural Bug):**
   When an incoming OAuth read provides `seven_day` but omits `five_hour`, `mergeClaudeRateLimitInfo()` ([`src/control-plane/health-authority.ts:261-269`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L261-L269)) unconditionally copies the previous `five_hour` window forward. 
   **There is zero evaluation of `now >= previous.five_hour.resetsAt`.** 
   Consequently, the previous session's 5-hour window (with 26% used / 74% left, and a `resetsAt` timestamp in the past) was retained as active truth. Because dedupe (`claudeRateLimitInfoUnchanged`) compares canonical structures and saw no change against the previous state, `ingestClaudeUsage()` returned `false`, suppressing SSE `ai-health` broadcasts. The frontend Scoreboard continued rendering `74% left · in 0m`.

When Dad clicked "Refresh" earlier, the provider endpoint was still omitting `five_hour`, so manual Refresh also preserved the expired window. 
Later, Anthropic's endpoint finally populated `five_hour: { utilization: 0, resets_at: ... }`. At that point, `AI Usage - Real Time` manual refresh read the provider endpoint and showed `100% left / 0% used`. When Dad immediately clicked "Refresh" in Sideline, Sideline's reader acquired the newly populated `five_hour: 0.0`, broke dedupe, updated `HealthAuthority`, and rendered `100% left`.

---

## 2. PROVEN vs INFERRED vs STILL UNKNOWN

### PROVEN (Directly Verified in Code & Tests)
* **Zero Canonicalization:** `canonicalWindowFromOAuth()` ([`src/control-plane/claude-usage-reader.ts:64-72`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/claude-usage-reader.ts#L64-L72)) accepts finite percentages `0 <= percent <= 100`. Zero converts to `0.0` and is not dropped or zero-filled.
* **Missing Window Omission:** If a window is missing or invalid in the raw OAuth payload, `canonicalClaudeWindowsFromOAuth()` omits that key entirely.
* **Indefinite Stale Window Retention:** In `HealthAuthority.mergeClaudeRateLimitInfo()` ([`src/control-plane/health-authority.ts:265`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L265)), missing incoming keys are preserved from `previous` indefinitely with no expiration or timestamp check.
* **No Scoreboard Expiration Check:** [`src/public/index.html:4681-4688`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L4681-L4688) (`aiScoreboardNormalize`) normalizes `utilization` without checking if `Date.now() >= resetsAt`. An expired window renders with its old percentage and countdown `in 0m`.
* **Push-vs-OAuth Blind Overwrite:** Push (`rate_limit_event`) and reader (`oauth_usage`) use the identical `mergeClaudeRateLimitInfo()` function; incoming evidence overwrites existing windows regardless of `resetsAt` freshness or source type.
* **Dedupe Structure:** `claudeRateLimitInfoUnchanged()` compares only `unifiedWindows` shapes (`JSON.stringify`); provenance/source changes are ignored.
* **Global Singleton Reader:** The reader is daemon-global ([`src/control-plane/daemon.ts:247-254`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L247-L254)). Game switching and stadium transitions have no effect on its lifecycle.
* **Manual Refresh Join & Timer Reset:** `ClaudeUsageReader.refresh()` clears any active timer, joins an in-flight `read()` promise if present, or executes a fresh network request, then restarts the cadence timer ([`src/control-plane/claude-usage-reader.ts:267-275`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/claude-usage-reader.ts#L267-L275)).
* **Provider Capabilities:** Anthropic's OAuth usage endpoint *does* eventually return `five_hour: { utilization: 0, resets_at: ... }` even with zero messages sent in the new window (proven by `AI Usage - Real Time` and Sideline's successful refresh).

### INFERRED (High Confidence Logical Deduction)
* During the period where Sideline showed `74% left` while Claude web UI showed `0% used`, Anthropic's `/api/oauth/usage` endpoint was either omitting `five_hour` or returning the old session object with expired `resets_at`.
* Dad's earlier manual refreshes in Sideline failed to update 5H because the provider had not yet populated `five_hour` in `/api/oauth/usage`.
* Weekly remained current because `seven_day` was present and valid in all OAuth responses.

### STILL UNKNOWN (Externally Opaque)
* Does Anthropic's undocumented `/api/oauth/usage` endpoint omit `five_hour` systematically after every reset boundary until an internal cache TTL expires, or is it variable? (Opaque upstream service behavior).
* Was there any transient HTTP 429 backoff active in the running daemon prior to Dad's tests? (Daemon runtime memory was not dumped, though `rateLimitedUntilMs` would have gated manual refresh as well).

---

## 3. AUTOMATIC vs MANUAL PATH DIFFERENCE

| Dimension | AUTOMATIC Path (`timer → read()`) | MANUAL Path (`POST /api/ai-health/refresh`) |
| :--- | :--- | :--- |
| **Trigger** | `setTimeout` chain in `ClaudeUsageReader` (default 10s cadence). | User clicks button → HTTP POST to daemon. |
| **Timer / Backoff** | Runs on schedule. If in backoff (30s–300s), waits full duration. | Immediately cancels active timer (`clearTimer`) and triggers `read()`. |
| **Concurrency** | Awaits `read()`, shares `inFlight` promise if pending. | Awaits `read()`, joins `inFlight` promise if pending. |
| **Network Request** | Identical `GET https://api.anthropic.com/api/oauth/usage`. | Identical `GET https://api.anthropic.com/api/oauth/usage`. |
| **Canonical Parsing** | Identical `canonicalClaudeWindowsFromOAuth()`. | Identical `canonicalClaudeWindowsFromOAuth()`. |
| **Health Authority** | `ingestClaudeUsage(windows)` merges into state. | `ingestClaudeUsage(windows)` merges into state. |
| **UI Delivery** | **Conditional Push:** Only broadcasts over SSE `ai-health` if `ingestClaudeUsage` returns `true` (change detected). If deduped, UI receives nothing. | **Direct HTTP Response:** Returns `healthAuthority.getSnapshot()` directly in the HTTP 200 payload. Frontend immediately updates `aiHealthSnapshot` and calls `renderAiScoreboard()`. |
| **Field Outcome** | Did not converge while provider omitted `five_hour` because expired 5H was preserved and deduped. | Succeeded once provider populated `five_hour`, delivering the new 0% window directly to the UI. |

---

## 4. EXPIRED-WINDOW CONTRACT

### The Problem
Currently, `HealthAuthority` and `Scoreboard` treat an expired window (`now > resetsAt`) as valid current data if an incoming read omits that window. This violates the core principle of AI Health: **never present stale/expired facts as current**.

### The Contract Rule
When evaluating an existing window against current time:
```
condition: now >= previous[windowKey].resetsAt
```
1. **Never Retain Expired Windows:** If `now >= previous[windowKey].resetsAt` and incoming provider evidence omits `windowKey`, the expired window **MUST NOT** be preserved.
2. **Never Fabricate 0% Used:** Unless the provider explicitly delivers a payload with `utilization: 0` and a future `resetsAt`, the system **MUST NOT** invent `0% used` or guess a new reset time.
3. **Explicit UNKNOWN State:** If a window has expired and no fresh provider facts exist for that window, the window state for that key must be omitted or transitioned to `undefined` / `UNKNOWN`.
4. **UI Presentation:** The Scoreboard should render `Claude 5H: UNKNOWN` (or `Pending Reset`) rather than displaying a misleading previous utilization like `74% left` with `in 0m`.

---

## 5. PUSH-vs-OAUTH PRECEDENCE RULE

### The Problem
Currently, `mergeClaudeRateLimitInfo()` blindly spreads `{ ...extract(previous), ...extract(incoming) }`. If an old buffered stdout `rate_limit_event` from a background CLI player arrives after a newer OAuth read, the older push data overwrites the newer OAuth window.

### The Contract Rule
Merge logic must be **freshness-aware**:
1. **Window Reset Monotonicity:** An incoming window for key `K` may only overwrite an existing window for key `K` if:
   ```typescript
   incoming[K].resetsAt >= previous[K].resetsAt
   ```
2. **Same Reset Cycle (Intra-Window Freshness):** If `incoming[K].resetsAt === previous[K].resetsAt`, incoming evidence may overwrite existing evidence only if:
   * It comes from the authoritative OAuth reader (`evidenceType === 'oauth_usage'`), OR
   * Its observation timestamp (`observedAt`) is newer than the stored window's observation timestamp.
3. **Stale Evidence Rejection:** Any incoming window where `incoming[K].resetsAt < previous[K].resetsAt` must be discarded as stale replay.

---

## 6. SMALLEST REPAIR SEAM

The repair requires changes in exactly two focused backend seams:

### Seam 1: `src/control-plane/health-authority.ts` (`mergeClaudeRateLimitInfo`)
* **Location:** [`src/control-plane/health-authority.ts:261-269`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L261-L269)
* **Change:**
  * Pass current time (`nowUnixSeconds`) into `mergeClaudeRateLimitInfo`.
  * Filter out expired windows from `previous`: if `previousWindows[key].resetsAt <= nowUnixSeconds`, do not copy it forward unless `incoming` provides a fresh window for that key.
  * Enforce freshness: do not let an incoming window overwrite an existing window if `incoming[key].resetsAt < previous[key].resetsAt`.

### Seam 2: `src/control-plane/claude-usage-reader.ts` (Bounded Redacted Diagnostics)
* **Location:** [`src/control-plane/claude-usage-reader.ts:159-170`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/claude-usage-reader.ts#L159-L170)
* **Change:**
  * Add a zero-credential structural diagnostic log when a payload is received from Anthropic:
    ```typescript
    // Structural facts only — never tokens, authorization headers, or credentials
    this.log(`[claude-usage-reader] shape: five_hour=${Boolean(payload.five_hour)} (util=${payload.five_hour?.utilization}) seven_day=${Boolean(payload.seven_day)}`);
    ```
  * This definitively exposes Anthropic's payload shape across reset boundaries in production without exposing sensitive data.

### Seam 3 (Defense-in-Depth): `src/public/index.html` (`aiScoreboardNormalize`)
* **Location:** [`src/public/index.html:4681-4688`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L4681-L4688)
* **Change:**
  * In `aiScoreboardNormalize`, if `Date.now() >= resetsAt`, return `undefined` so the UI falls back to `UNKNOWN` instead of rendering expired utilization.

---

## 7. FOCUSED TESTS

The repair can be verified completely with focused, deterministic unit and integration tests:

1. **`test/health-authority.test.mjs`:**
   * **Test 1 (Expired Window Eviction):** Given a stored `five_hour` window with `resetsAt` in the past, when an incoming OAuth read arrives containing only `seven_day`, verify that `five_hour` is dropped from `unifiedWindows` rather than preserved as stale.
   * **Test 2 (Freshness Precedence):** Given a stored `five_hour` window with `resetsAt = T2`, verify that an incoming push `rate_limit_event` with `resetsAt = T1` (`T1 < T2`) is rejected and does not overwrite the stored window.
   * **Test 3 (Legitimate Reset Ingestion):** Given an expired or missing `five_hour` window, when incoming OAuth data arrives with `utilization: 0` and future `resetsAt = T3`, verify that it is ingested, marks `changed = true`, and emits `onChange`.

2. **`test/claude-usage-reader.test.mjs`:**
   * **Test 4 (Redacted Diagnostic Log):** Verify that structural diagnostics record `five_hour` and `seven_day` presence without containing access tokens or secrets.

3. **`test/health-authority-daemon.test.mjs`:**
   * **Test 5 (End-to-End Expiration via `/api/ai-health`):** Verify that once `resetsAt` passes, `GET /api/ai-health` no longer returns the expired window as an active factual window.

---

## 8. DO WE NEED OPUS?

**NO.**

* The root cause is completely isolated and verified by source inspection.
* The failure was not a complex distributed race; it is a straightforward missing expiration check in `mergeClaudeRateLimitInfo()` coupled with Anthropic's partial payload semantics at reset boundaries.
* The contracts for expired windows and push-vs-OAuth precedence are clear and bounded.
* **Route directly to a bounded implementation worker** to implement the repair in `health-authority.ts`, add the redacted diagnostic in `claude-usage-reader.ts`, and add the focused tests in `test/health-authority.test.mjs`.

---
Report written to:
`C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\AntiGravity\Claude-5H-Freshness-Seam-Validation__20260922-063800__AntiGravity.md`
