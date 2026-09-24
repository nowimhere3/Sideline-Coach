**Sideline Coach – Claude AI Health Freshness Reconnaissance**  
*Play ID: ai-health-freshness-recon-20260922-152433*  
*Scout ID: claude-stale-freshness*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  

---

## RESULT  
The Sideline Coach Claude health freshness pipeline can become stale when an active HTTP 429 back‑off gate blocks both scheduled and manual reads, while external readers (unaffected by the gate) continue to obtain fresh Anthropic usage data. The health UI (`observedAt`) only updates when the canonical quota windows (`five_hour`/`seven_day`) actually change; a successful read that returns unchanged windows advances `lastSuccessAt` (acquisition freshness) but leaves `observedAt` stale. No evidence of a monotonicity or source‑precedence flaw that would allow older data to overwrite newer data was found.

---

## KEY DISCOVERIES  

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **ClaudeUsageReader** backs off on HTTP 429 with exponential steps [5,10,20,40,60] minutes and honours a `Retry‑After` header. | `src/control-plane/claude-usage-reader.ts`: lines 34‑36 (BACKOFF_MS), lines 301‑304 (gate short‑circuit), lines 368‑380 (scheduleNext backoff & gate logic). |
| 2 | **Gate blocks manual refresh** – `refresh()` clears any timer but `read()` short‑circuits when `rateLimitedUntilMs` is active, returning a faux `rate_limited` outcome; `scheduleNext` then re‑arms the gate for the remaining time. | `src/control-plane/claude-usage-reader.ts`: lines 284‑292 (refresh), lines 301‑304 (gate short‑circuit), lines 360‑366 (stillGated branch). |
| 3 | **HealthAuthority.observedAt updates only on factual change** – `ingestClaudeUsage` returns `false` when the incoming windows are structurally identical to the stored windows, leaving `observedAt` untouched. | `src/control-plane/health-authority.ts`: lines 162‑186 (ingestClaudeUsage), lines 142‑145 (unchanged early‑return), lines 146‑151 (observedAt set only on change). |
| 4 | **Acquisition freshness (`lastSuccessAt`) advances on every successful read**, even when windows are unchanged. | `src/control-plane/claude-usage-reader.ts`: lines 334‑335 (lastSuccessAt set on ok). |
| 5 | **Push evidence (native `rate_limit_event`) is merged with OAuth usage via the same monotonicity‑aware `mergeClaudeRateLimitInfo`**; older resetsAt are rejected as stale replays, newer resetsAt win. | `src/control-plane/health-authority.ts`: lines 276‑309 (mergeClaudeRateLimitInfo), lines 293‑296 (staleReplay check). |
| 6 | **SSE/UI health snapshot reflects `observedAt` only** – `/api/ai-health` returns both `health` (with `observedAt`) and `acquisition.claude` (with `lastSuccessAt`/`lastAttemptAt`). Typical UI surfaces only the health timestamp. | `src/control-plane/daemon.ts`: lines 1057‑1063 (GET /api/ai‑health), lines 237‑240 (healthAuthority.onChange broadcast). |
| 7 | **External readers are not subject to Sideline’s back‑off gate** – they call the Anthropic OAuth endpoint directly, so they can obtain fresher usage while Sideline is gated. | Field fact (provided) + inference from gate being internal to ClaudeUsageReader only. |

---

## FACT  

* The Claude usage reader implements a back‑off gate that, once triggered by HTTP 429, prevents any further reads (scheduled or manual) until the gate elapses.  
  - `src/control-plane/claude-usage-reader.ts` lines 301‑304, 368‑380.  

* `HealthAuthority.observedAt` is updated **only** when the canonical quota windows actually change; a successful read that returns identical windows does **not** update `observedAt`.  
  - `src/control-plane/health-authority.ts` lines 142‑145, 146‑151.  

* Successful reads always update `lastSuccessAt` (acquisition freshness), regardless of whether windows changed.  
  - `src/control-plane/claude-usage-reader.ts` line 335.  

* The gate interval can be 5, 10, 20, 40, or 60 minutes depending on the back‑off step.  
  - `src/control-plane/claude-usage-reader.ts` lines 34‑36 (BACKOFF_MS).  

* Push evidence cannot overwrite a newer window with an older `resetsAt` because `mergeClaudeRateLimitInfo` rejects stale replays (`incResetsAt < prevResetsAt`).  
  - `src/control-plane/health-authority.ts` lines 293‑296.  

---

## INFERENCE  

* The observed ~10‑point freshness gap between external readers and Sideline Coach is most likely caused by an active back‑off gate (HTTP 429) that blocks Sideline’s OAuth usage reader while external polls succeed.  
* Pressing the Refresh control during a gate yields a silent no‑op (faux rate‑limited) and does **not** clear the gate, leaving the UI showing stale `observedAt`.  
* The UI’s reliance on `observedAt` (health timestamp) rather than `lastSuccessAt` (acquisition timestamp) can make successful but unchanged reads invisible to the user, contributing to the perception of staleness.  
* No evidence indicates that the merge logic permits older data to overwrite newer data; monotonicity checks appear sound.  

---

## UNKNOWN  

* Whether the production daemon is currently running with `claudeUsage.enabled = true` and what its `initialCadenceMinutes` setting is (environment‑dependent).  
* The exact frequency of HTTP 429 responses from the Anthropic OAuth endpoint in the field (though the back‑off table suggests they occur).  
* Whether any Stadium‑side push (`rate_limit_event`) is being dropped or delayed due to connectivity issues, which could compound staleness when the OAuth reader is gated.  

---

## CONTRADICTION  

* No direct contradiction found in the source. The design explicitly separates acquisition freshness (`lastSuccessAt`) from factual freshness (`observedAt`) and documents this distinction (see comment lines 51‑62 in `claude-usage-reader.ts`).  

---

## IMPORTANT FILES / PATHS  

| File | Purpose |
|------|---------|
| `src/control-plane/claude-usage-reader.ts` | Implements OAuth usage reader, back‑off gate, manual refresh, and acquisition timestamps. |
| `src/control-plane/health-authority.ts` | Merges push and OAuth evidence, updates `observedAt` only on factual change, exposes `HealthAuthoritySnapshot`. |
| `src/control-plane/daemon.ts` | Instantiates and starts the ClaudeUsageReader, wires its `ingest` to HealthAuthority, broadcasts health and acquisition status over SSE and `/api/ai-health`. |
| `src/control-plane/protocol.ts` (referenced) | Defines `CanonicalClaudeWindow` and evidence shapes (not quoted but implied). |

---

## MOST LIKELY STALE MECHANISMS (ranked)  

1. **Active 429 back‑off gate blocks reads** – scheduled and manual reads are suppressed; external readers unaffected → stale `observedAt`.  
2. **Successful but unchanged reads** – `lastSuccessAt` advances but `observedAt` does not; UI shows only `observedAt` → perception of staleness despite fresh acquisition.  
3. **Push evidence delayed or missing** – if Stadium push stalls and OAuth reader is gated, no new facts arrive. (Less likely without evidence of push failure.)  

---

## WHAT RUNTIME EVIDENCE WOULD CONCLUSIVELY DISTINGUISH THEM  

| Mechanism | Evidence to Confirm |
|-----------|---------------------|
| **Back‑off gate active** | Query `/api/ai-health` and inspect `acquisition.claude.state` → should be `rate_limited` with a `lastAttemptAt` recent but no new `windows`; also check `claudeUsageReaderInstance?.getStatus()` via debug endpoint (if exposed) or logs showing `[claude-usage-reader] rate_limited: Claude usage endpoint is rate‑limited; waiting for Retry‑After to elapse`. |
| **Unchanged windows despite successful read** | `/api/ai-health` shows `acquisition.claude.state` = `ok` (or `unchanged` after refresh) and `health.providers.claude.observedAt` older than `acquisition.claude.lastSuccessAt`; also logs show `[claude-usage-reader] shape: …` with both windows present and utilization unchanged from prior successful read. |
| **Push missing** | No `health.evidence` notifications arriving in daemon logs (`health.evidence` case in `handleWsNotification`) while `acquisition.claude` shows successful reads; alternatively, enable verbose logging for `registry.on('change')` to see missing `game.connected` or `capabilities-updated` events. |

---

## SMALLEST REPAIR SEAM (if source already proves one)  

If the goal is to make the UI reflect acquisition freshness when windows are unchanged, the smallest change is to surface `lastSuccessAt` (or a derived “last checked” timestamp) alongside `observedAt` in the health summary.  

* **Seam**: Modify the `/api/ai-health` response (or the UI component that consumes it) to include `acquisition.claude.lastSuccessAt` as a secondary timestamp.  
* **File**: `src/control-plane/daemon.ts` lines 1057‑1063 (the health endpoint) – add `acquisition: { claude: this.claudeUsageStatus }` already exists; the UI would need to render `lastSuccessAt` from that object.  
* No change to core logic required; the data is already exposed.  

If instead the aim is to reduce staleness caused by the gate, the smallestseam is to **honour a manual refresh override** that temporarily bypasses the gate (e.g., clear `rateLimitedUntilMs` on refresh). This would require a change in `ClaudeUsageReader.refresh()` to clear the gate before calling `read()`. However, the current design intentionally respects the gate to avoid aggravating the provider; altering it would be a policy change, not a bug fix.  

---

## FOCUSED TEST CONTRACT  

> **Test**: When the ClaudeUsageReader is under an active 429 back‑off gate (`rateLimitedUntilMs` set), a manual `refresh()` call shall not perform an actual HTTP request to the Anthropic usage endpoint and shall leave the gate’s end‑time unchanged.  
> **Setup**: Mock `fetch` to throw if called; set `rateLimitedUntilMs` to future time; call `refresh()`.  
> **Assertions**:  
> 1. The mocked `fetch` is **not** invoked.  
> 2. The returned `outcome` has `{ ok: false, code: 'rate_limited' }` (faux gate outcome).  
> 3. After the call, `reader.getStatus()` still reflects `state: 'rate_limited'` and the same `rateLimitedUntilMs` (or a slightly reduced remainder due to elapsed time).  
> 4. `healthAuthority.getSnapshot().providers.claude.observedAt` remains unchanged from before the call.  

This contract validates the gate‑blocking‑refresh behavior without requiring network access.  

---  

*End of reconnaissance report.*  
*This document reflects read‑only analysis and does not constitute final architectural authority.*
