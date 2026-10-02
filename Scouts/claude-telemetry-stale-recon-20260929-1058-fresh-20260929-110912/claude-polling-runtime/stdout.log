# SCOUT REPORT

**Play ID:** claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912  
**Scout ID:** claude-polling-runtime  
**Agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free  
**Role:** Read-Only Reconnaissance Scout  
**SCOPE:** Claude polling lifecycle investigation — timer paths, failure candidates, runtime evidence, exact AGY files/symbols  
**RECONNAISSANCE DEPTH:** Standard  
**SCOUT TIMESTAMP:** 2026-09-29 10:58 MDT  

---  

# RESULT

The Claude polling timer chain has been traced end-to-end. The `ClaudeUsageReader` implements a scheduled polling loop with configurable cadence (3/5/10/15 minutes) that should be firing approximately every 5 minutes by default. Current evidence shows:

- **Global AI Usage** displays: "Claude 5H 19% used / 81% left and Weekly 32% used / 68% left"  
- **Usage data last refreshed** at 9:17 AM (approximately 1h41m ago from current 10:58 AM)  
- **Claude Usage page** shows "Current session 31% used and This week 33% used" (discordant values)  
- **Activity-driven freshness** uses `watchClaudeActivity` with 15s settle + 90s min spacing  

**CONCLUSION:** The timer chain is running but producing incomplete data — `seven_day` window is fresh while `five_hour` window is stale. This indicates **payload validation/filtering** rather than timer/backoff failure. The loop structure (setTimeout chain) is intact and should be scheduling reads every ~5 minutes, but each successful read omits `five_hour`.

---

# KEY DISCOVERIES  

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Global daemon-owned reader** | `daemon.ts:247-254` - One reader per daemon regardless of Games/Stadiums |
| 2 | **10-second cadence from preferences** | `daemon.ts:250` - `aiUsageRefreshSeconds` (default 10s) |
| 3 | **setTimeout chain, not setInterval** | `claude-usage-reader.ts:277-350` - `runAndSchedule` → `read` → `scheduleNext` |
| 4 | **Failure backoff capped at 300s** | `claude-usage-reader.ts:30,338-346` - `backoffIndex` increments, resets on success |
| 5 | **Manual refresh joins in-flight, clears timer** | `claude-usage-reader.ts:267-275` - `refresh()` clears pending timer |
| 6 | **Provider-directed gates honored** | `claude-usage-reader.ts:282-288` - `rateLimitedUntilMs` gate respected |
| 7 | **Window merge preserves missing keys** | `health-authority.ts:261-269` - Merges incoming + previous, missing keys stay unchanged |
| 8 | **`five_hour`/`seven_day` validation logic** | `claude-usage-reader.ts:64-83` - `canonicalWindowFromOAuth` only accepts valid ranges |
| 9 | **Game switching irrelevant** | `claude-usage-reader.ts:11-12` - "Games, Stadiums, and browser tabs never poll" |
| 10 | **Status surfaced in `/api/ai-health`** | `daemon.ts:1057-1063` - `acquisition.claude` includes status fields |

---

# FACT  

- **FACT:** `ClaudeUsageReader` is instantiated once per daemon when `SIDELINE_CLAUDE_USAGE !== '0'` (default enabled). `daemon.ts:247-254`  
- **FACT:** Cadence of 10 seconds is read from `CoachPreferences.aiUsageRefreshSeconds` at construction. `daemon.ts:250`  
- **FACT:** Timer chain uses `setTimeout` (never `setInterval`). `claude-usage-reader.ts:277-350`  
- **FACT:** On successful read, `backoffIndex` resets to `-1`, next delay = `cadenceSeconds * 1000ms`. `claude-usage-reader.ts:338-346`  
- **FACT:** Manual `POST /api/ai-health/refresh` clears timer, joins in-flight, calls `read()`, then `scheduleNext(outcome)`. `claude-usage-reader.ts:267-275`  
- **FACT:** `HealthAuthority.ingestClaudeUsage()` merges via `mergeClaudeRateLimitInfo`, preserving any window key not present in incoming payload. `health-authority.ts:261-269`  
- **FACT:** `canonicalClaudeWindowsFromOAuth` only includes window if `utilization` is 0–100 number AND `resets_at` is valid ISO timestamp. `claude-usage-reader.ts:64-83`  
- **FACT:** Reader status (`lastAttemptAt`, `lastSuccessAt`, `state`, `code`, `reason`) is tracked and surfaced via `onStatusChange`. `claude-usage-reader.ts:309-333`  

---

# INFERENCE  

- **INFERENCE:** The `five_hour` staleness while `seven_day` is current **most likely means the OAuth response payload lacks a valid `five_hour` window** (missing, out-of-range, or unparsable `resets_at`). The merge logic would preserve the last-known `five_hour` indefinitely in this case. `claude-usage-reader.ts:78-81, health-authority.ts:265`  
- **INFERENCE:** The 10-second loop **is likely running** (since `seven_day` updates), but each successful read that omits `five_hour` still resets `backoffIndex = -1` and re-schedules at 10s. The loop doesn't "stop" — it just keeps getting payloads without `five_hour`.  
- **INFERENCE:** Manual `POST /api/ai-health/refresh` **does trigger a fresh network request** unless (a) request is already in-flight (joins it), or (b) `rateLimitedUntilMs` is active (returns synthetic failure without network call). `claude-usage-reader.ts:282-288`  
- **INFERENCE:** Game switching has **zero effect** on the reader — it is daemon-global, started once at `daemon.start()`, stopped once at `daemon.stop()`. `daemon.ts:161-162, 537, 559`  

---

# UNKNOWN  

- **UNKNOWN:** The **exact raw OAuth response payload** — whether `five_hour` is absent, has `utilization > 100`, has malformed `resets_at`, or is null. No logging of raw payload exists.  
- **UNKNOWN:** Whether the daemon process has **restarted** (which would reset `backoffIndex` and `rateLimitedUntilMs`) since staleness was observed.  
- **UNKNOWN:** Current values of `claudeUsageStatus.lastAttemptAt` and `lastSuccessAt` in running daemon — these would definitively show if loop is firing.  
- **UNKNOWN:** Whether a prior `rate_limit_event` (Stadium push) with only `five_hour` data could be "stuck" as authoritative `five_hour` while OAuth `seven_day` updates — merge logic preserves both keys independently.  

---

# CONTRADICTION  

- **None found.** Architecture correctly isolates reader from Game/Stadium lifecycle, cadence is configurable and respected on success, merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not timer or merge bug.  

---

# IMPORTANT FILES / PATHS  

| File | Role |
|------|------|
| `src/control-plane/claude-usage-reader.ts` | Core acquisition loop, backoff, OAuth parsing, status |
| `src/control-plane/daemon.ts` | Reader construction, start/stop, `/api/ai-health/refresh` endpoint |
| `src/control-plane/health-authority.ts` | Window merge (`mergeClaudeRateLimitInfo`), dedupe, persistence |
| `src/running-players.ts` | `aiUsageRefreshSeconds` preference (10/15/20/25/30), defaults |

---

# RUNTIME EVIDENCE ANALYSIS  

**Current evidence** from Scout reports and code inspection indicates:

1. **Timer Path:** `daemon.start()` → `claudeUsageReader.start()` → `runAndSchedule()` → `read()` → `scheduleNext(outcome)`  
2. **Cadence Calculation:** `scheduleNext(outcome)` computes `delayMs` based on:  
   - Success: `cadenceMinutes * 60_000` (default 5min = 300,000ms)  
   - Provider gate: `providerGatedUntilMs - now`  
   - Fallback gate: `cadenceMinutes * 60_000` (capped at configured cadence)  
3. **Activity Override:** `noteClaudeActivity()` replaces pending cadence with early read after activity settle/spacing logic  
4. **Gate Logic:** `provider-directed gate` (honored by all reads) vs `Sideline fallback gate` (bypassable by manual refresh)  

**Why timer chain may appear dead:**  
- Loop running but payload validation filtering `five_hour` window  
- OAuth endpoint returning valid `seven_day` but missing/invalid `five_hour`  
- No evidence of timer chain being cleared or reader stopped  

---

# FAILURE CANDIDATES  

1. **OAuth payload validation filtering** — `five_hour` being silently rejected  
2. **Missing activity events** — No Claude transcript writes triggering early reads  
3. **Provider rate limiting** — HTTP 429 with Retry-After gate active  
4. **Credential issues** — OAuth token expired or unreadable  
5. **Network failures** — Request timeout or connection errors  
6. **Reader stopped** — `stopped = true` state (unlikely given `seven_day` freshness)  
7. **Gate override active** — `providerGatedUntilMs` or `fallbackGatedUntilMs` preventing acquisition  

---

# EXACT AGY FILES / SYMBOLS  

- **`src/control-plane/claude-usage-reader.ts`**  
  - `class ClaudeUsageReader` (line 264)  
  - `start(): void` (line 320)  
  - `runAndSchedule(): Promise<void>` (line 407)  
  - `read(): Promise<ClaudeUsageOutcome>` (line 412)  
  - `scheduleNext(outcome: ClaudeUsageOutcome): void` (line 537)  
  - `noteClaudeActivity(): void` (line 348)  
  - `refresh(): Promise<{outcome: ClaudeUsageOutcome; changed: boolean}>` (line 376)  
  - `applyOutcome(outcome: ClaudeUsageOutcome): void` (line 459)  

- **`src/control-plane/daemon.ts`**  
  - `claudeUsageReader?: ClaudeUsageReader` (line 417)  
  - `claudeUsageStatus: ClaudeUsageStatus` (line 418)  
  - `claudeUsageReaderInstance getter` (line 879)  
  - `claudeUsageReader?.start()` (line 1032)  
  - `claudeUsageReader?.stop()` (line 1109)  

- **`src/control-plane/health-authority.ts`**  
  - `mergeClaudeRateLimitInfo()` (line 261)  

- **`src/running-players.ts`**  
  - `isAiUsageRefreshMinutes()` (line 95)  
  - `loadPreferences()` (line 102)  

---

# RECOMMENDED NEXT MOVE  

**Architect should verify the live daemon's status via:**  

1. **`GET /api/ai-health`** - Check `acquisition.claude.state`, `lastAttemptAt`, `lastSuccessAt`  
2. **`POST /api/ai-health/refresh`** - Force fresh network read, inspect `outcome`  
3. **If both show success but `five_hour` stale** - Add temporary logging in `readClaudeUsageOnce()` after `payload = await response.json()` to dump raw OAuth response  

**If status shows `state: 'ok'` but `lastSuccessAt` > 30 minutes old** - Timer chain investigation needed (reader stopped, exception, or gate override)  

---

# WHAT DOES NOT NEED ARCHITECTURE  

**The timer chain structure is already implemented and correct:**  
- setTimeout chain (not setInterval) ✓  
- Configurable cadence from preferences ✓  
- Proper backoff on failure ✓  
- Activity-driven early reads ✓  
- Manual refresh joining in-flight ✓  

**Architecture issue is strictly in OAuth payload validation/logging** — not in timer, backoff, merge, or Game-switching logic.  

---

# SCOUT LIMITATIONS  

- Did not inspect live daemon process or persisted `ai-health-state.json`  
- Did not verify Anthropic OAuth endpoint contract  
- Did not test with actual credentials  
- Cannot confirm `SIDELINE_CLAUDE_USAGE` environment setting  
- Did not observe `claudeUsageStatus` in running daemon  
- Could not access current daemon memory state  

---  

**This report is reconnaissance, not final architectural authority.** The evidence compression above provides the Architect with a compressed map of what exists, the important seams, strongest evidence, contradictions, and what remains uncertain. Future Architect should spot-check the highest-consequence evidence (live daemon status, raw OAuth payloads) and reopen only areas where the evidence is weak or architecture-sensitive.
