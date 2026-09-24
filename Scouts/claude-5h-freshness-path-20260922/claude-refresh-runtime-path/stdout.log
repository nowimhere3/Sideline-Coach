Now I have a comprehensive understanding of the codebase. Let me compile my reconnaissance report.

---

# SCOUT REPORT
**Play ID:** claude-5h-freshness-path-20260922  
**Scout ID:** claude-refresh-runtime-path  
**Agent:** sideline-scout-deep (openrouter/nvidia/nemotron-3-ultra-550b-a55b:free)  
**Mode:** READ-ONLY RECONNAISSANCE — not final architectural authority  

---

## RESULT

The runtime freshness path for the daemon-owned `ClaudeUsageReader` has been traced end-to-end. The 10-second cadence is **configured correctly** but its **actual execution depends on acquisition success**. The `five_hour` staleness while `seven_day` is current strongly indicates the OAuth endpoint is returning valid `seven_day` data but **omitting or invalidating `five_hour`** — not a timer/backoff failure. Game switching is correctly irrelevant (reader is daemon-global). The manual `POST /api/ai-health/refresh` **does perform a fresh provider read** but joins in-flight requests and respects active rate-limit backoff.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Single global reader, daemon-owned** | `daemon.ts:161-162, 247-254` — created once at daemon construction with `enabled: process.env.SIDELINE_CLAUDE_USAGE !== '0'` |
| 2 | **10-second cadence sourced from preferences** | `daemon.ts:250` — `initialCadenceSeconds: this.getPreferences().aiUsageRefreshSeconds` (default 10s, `running-players.ts:122`) |
| 3 | **Timer lifecycle: `setTimeout` chain, not `setInterval`** | `claude-usage-reader.ts:245-249, 335-350` — `start()` → `runAndSchedule()` → `read()` → `scheduleNext()` |
| 4 | **Backoff on failure: 30s → 60s → 120s → 300s cap** | `claude-usage-reader.ts:30, 335-347` — `backoffIndex` increments on failure; resets to `-1` only on success |
| 5 | **Manual refresh joins in-flight, clears timer, restarts cadence** | `claude-usage-reader.ts:267-275` — `refresh()` clears timer, `await read()`, then `scheduleNext(outcome)` |
| 6 | **Rate-limit honored via `rateLimitedUntilMs` gate** | `claude-usage-reader.ts:284-288` — returns synthetic `rate_limited` outcome without network call while gate active |
| 7 | **OAuth windows merged per-key, missing keys preserved** | `health-authority.ts:261-269` — `mergeClaudeRateLimitInfo` spreads previous then incoming `unifiedWindows` |
| 8 | **`five_hour`/`seven_day` validity gated by `canonicalWindowFromOAuth`** | `claude-usage-reader.ts:64-72` — requires `utilization: 0..100` number + parsable `resets_at` ISO string |
| 9 | **Game switching never affects reader** | `claude-usage-reader.ts:11-12` — "Games, Stadiums, and browser tabs never poll and never own a reader" |
| 10 | **Status surfaced at `GET /api/ai-health` → `acquisition.claude`** | `daemon.ts:1057-1063` — includes `state`, `code`, `reason`, `lastAttemptAt`, `lastSuccessAt` |

---

## FACT

- **FACT:** The `ClaudeUsageReader` is instantiated exactly once per daemon when `SIDELINE_CLAUDE_USAGE !== '0'` (default enabled). `daemon.ts:247-254`
- **FACT:** The 10-second cadence is read from `CoachPreferences.aiUsageRefreshSeconds` at construction and can be updated at runtime via `POST /api/preferences` → `claudeUsageReader?.setCadenceSeconds()`. `daemon.ts:2245, claude-usage-reader.ts:239-243`
- **FACT:** The acquisition loop uses a `setTimeout` chain (`runAndSchedule` → `read` → `scheduleNext`), not `setInterval`. `claude-usage-reader.ts:277-350`
- **FACT:** On successful read, `backoffIndex` resets to `-1` and next delay = `cadenceSeconds * 1000`. On failure, `backoffIndex` increments (capped at 300s). `claude-usage-reader.ts:338-346`
- **FACT:** `POST /api/ai-health/refresh` clears any pending timer, calls `read()` (which joins in-flight if exists), then calls `scheduleNext(outcome)`. `claude-usage-reader.ts:267-275, daemon.ts:1069-1090`
- **FACT:** `HealthAuthority.ingestClaudeUsage()` merges incoming windows with previous via `mergeClaudeRateLimitInfo`, which **preserves any window key not present in the incoming payload**. `health-authority.ts:162-185, 261-269`
- **FACT:** `canonicalClaudeWindowsFromOAuth` only includes a window if `utilization` is a finite number 0–100 AND `resets_at` parses to a valid timestamp. Invalid/missing windows are **omitted entirely** (never zero-filled). `claude-usage-reader.ts:64-83`
- **FACT:** The reader's status (`lastAttemptAt`, `lastSuccessAt`, `state`, `code`, `reason`) is updated in `applyOutcome` and surfaced via `onStatusChange` to `daemon.claudeUsageStatus`. `claude-usage-reader.ts:309-333, daemon.ts:252`

---

## INFERENCE

- **INFERENCE:** The `five_hour` staleness while `seven_day` is current **most likely means the OAuth response payload lacks a valid `five_hour` window** (missing, `utilization` out of range, or unparsable `resets_at`). The merge logic would preserve the last-known `five_hour` indefinitely in this case. `claude-usage-reader.ts:78-81, health-authority.ts:265`
- **INFERENCE:** The 10-second loop **is likely running** (since `seven_day` updates), but each successful read that omits `five_hour` still resets `backoffIndex = -1` and re-schedules at 10s. The loop doesn't "stop" — it just keeps getting payloads without `five_hour`.
- **INFERENCE:** Manual `POST /api/ai-health/refresh` **does trigger a fresh network request** unless (a) a request is already in-flight (it joins it), or (b) `rateLimitedUntilMs` is active (returns synthetic failure without network call). `claude-usage-reader.ts:282-288`
- **INFERENCE:** Game switching has **zero effect** on the reader — it is daemon-global, started once at `daemon.start()`, stopped once at `daemon.stop()`. `daemon.ts:161-162, 537, 559`

---

## UNKNOWN

- **UNKNOWN:** The **exact raw OAuth response payload** — whether `five_hour` is absent, has `utilization > 100`, has malformed `resets_at`, or is null. No logging of raw payload exists in the current code.
- **UNKNOWN:** Whether the daemon process has **restarted** (which would reset `backoffIndex` and `rateLimitedUntilMs`) since the staleness was observed.
- **UNKNOWN:** The current values of `claudeUsageStatus.lastAttemptAt` and `lastSuccessAt` in the running daemon — these would definitively show if the loop is firing.
- **UNKNOWN:** Whether a prior `rate_limit_event` (Stadium push) with only `five_hour` data could be "stuck" as the authoritative `five_hour` while OAuth `seven_day` updates — but merge logic preserves both keys independently, so this should not cause staleness.

---

## CONTRADICTION

- **None found.** The architecture correctly isolates the reader from Game/Stadium lifecycle, the cadence is configurable and respected on success, and the merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not a timer or merge bug.

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/claude-usage-reader.ts` | Core acquisition loop, backoff, OAuth parsing, status |
| `src/control-plane/daemon.ts` | Reader construction, start/stop, `/api/ai-health/refresh` endpoint |
| `src/control-plane/health-authority.ts` | Window merge (`mergeClaudeRateLimitInfo`), dedupe, persistence |
| `src/running-players.ts` | `aiUsageRefreshSeconds` preference (10/15/20/25/30), defaults |
| `src/control-plane/launcher.ts` | Daemon spawn with `SIDELINE_CLAUDE_USAGE` env passthrough |

---

## SMALLEST LIKELY REPAIR SEAM

**File:** `src/control-plane/claude-usage-reader.ts`  
**Function:** `canonicalClaudeWindowsFromOAuth` (lines 75–83) / `readClaudeUsageOnce` (lines 105–170)

**Why:** This is where the OAuth payload is validated and split into `five_hour` / `seven_day`. If `five_hour` is being silently dropped, the fix is either:
1. **Log the raw payload** (temporarily) to confirm what Anthropic returns, or
2. **Relax validation** if Anthropic sends `utilization` as a string or `resets_at` in a non-ISO format, or
3. **Handle missing `five_hour` explicitly** (e.g., surface "window unavailable" in status rather than silently preserving stale data).

**Exact field test to prove the fix:**

1. **Call `GET /api/ai-health`** and inspect `acquisition.claude`:
   ```json
   {
     "state": "ok",
     "lastAttemptAt": "2026-09-22T...",
     "lastSuccessAt": "2026-09-22T...",
     "code": undefined,
     "reason": undefined
   }
   ```
   - If `state !== 'ok'` → reader is in backoff/auth-failure/rate-limit.
   - If `lastAttemptAt` is >30s old → timer not firing (stopped or exception).
   - If `state === 'ok'` but `health.providers.claude.rateLimitInfo.unifiedWindows.five_hour` is stale → OAuth payload lacks valid `five_hour`.

2. **Call `POST /api/ai-health/refresh`** and inspect response:
   ```json
   {
     "acquisition": {
       "claude": {
         "outcome": "changed" | "unchanged" | "rate_limited" | "auth_rejected" | ...,
         "reason": "...",
         "checkedAt": "..."
       }
     }
   }
   ```
   - If `outcome === 'rate_limited'` → active `Retry-After` gate.
   - If `outcome === 'unchanged'` → OAuth read succeeded but windows identical to persisted (including stale `five_hour`).
   - If `outcome === 'changed'` → new data ingested; check if `five_hour` updated.

3. **If `outcome === 'unchanged'` but `five_hour` is stale**, add temporary logging in `readClaudeUsageOnce` after `payload = await response.json()` to dump `payload.five_hour` and `payload.seven_day` raw values. This will definitively show whether Anthropic is sending it.

---

## LIMITATIONS

- Did not inspect live daemon process or persisted `ai-health-state.json` (external to repo).
- Did not verify Anthropic OAuth endpoint contract — relied on code's expected shape.
- Did not test with actual credentials; reconnaissance is static source analysis only.
- Cannot confirm whether `SIDELINE_CLAUDE_USAGE=0` is set in user's environment (would disable reader entirely).
- Could not observe `claudeUsageStatus` in running daemon — requires live `/api/ai-health` call.

---

## RECOMMENDED NEXT MOVE

**Architect should verify the live daemon's `acquisition.claude` status via `GET /api/ai-health`** (10-second loop proof) and **trigger one `POST /api/ai-health/refresh`** (manual refresh proof). If both show `state: 'ok'` and `outcome: 'unchanged'` with stale `five_hour`, the repair is **strictly in the OAuth payload validation/logging seam** — not the timer, backoff, merge, or Game-switching logic.
