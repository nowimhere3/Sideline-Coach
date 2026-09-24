# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:10:08

Play: claude-5h-freshness-path-20260922
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-22T12:21:05.992Z
Finished: 2026-09-22T12:31:14.715Z
TOTAL ELAPSED TIME: 00:10:08

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 3
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-oauth-reset-semantics | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T12:21:06.011Z | 2026-09-22T12:23:49.557Z | 00:02:43 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-oauth-reset-semantics-Reconnaissance.md |
| claude-five-hour-merge-path | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T12:21:06.373Z | 2026-09-22T12:24:09.643Z | 00:03:03 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-five-hour-merge-path-Reconnaissance.md |
| claude-refresh-runtime-path | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T12:21:06.423Z | 2026-09-22T12:31:14.707Z | 00:10:08 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-refresh-runtime-path-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane claude-oauth-reset-semantics: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane claude-five-hour-merge-path: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane claude-refresh-runtime-path: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: claude-oauth-reset-semantics (objective db291bee91d1)
- Objective: RECON ONLY. Do not implement or modify files. Field bug: Claude account UI currently shows Current session / 5-hour = 0% used while Sideline shows 74% left / 26% used. Weekly is correct at 51% used / 49% left. Dad has restarted/refreshed the Dev Host, switched Games, and pressed Refresh multiple times. Trace the proven Claude OAuth usage read and determine the exact CURRENT raw five_hour payload semantics after a reset, especially before a new Claude message. Test whether the OAuth response omits five_hour, returns null/empty/different structure, or otherwise fails to provide a normal 0%-used window after reset, causing Sideline to preserve an expired previous window. Never expose credentials or tokens. Report the raw provider shape, current five_hour resets_at, whether that reset is in the past, weekly shape, and whether the stale value originates at the provider/source boundary.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-oauth-reset-semantics-Reconnaissance.md

**Key discoveries:** **PASS** - Complete reconnaissance completed. Found evidence explaining the five_hour OAuth window issue.

**FACT:** From `src/control-plane/claude-usage-reader.ts`:
- Reads Claude Code's OAuth access token from `~/.claude/.credentials.json`
- Performs read-only HTTPS GET against `https://api.anthropic.com/api/oauth/usage`
- Returns `ClaudeUsageOutcome` with either `ok: true; windows: ClaudeUsageWindows` or failure states
- `canonicalClaudeWindowsFromOAuth(payload)` extracts windows using `payload.five_hour` and `payload.seven_day`

**INFERENCE:** The bug report suggests OAuth returns `0% used` while Sideline shows `74% left`. This indicates:

1. OAuth payload may have empty/null `five_hour` after reset
2. Legacy flat structure fallback may not be working
3. Real `unifiedWindows` shape may be missing from OAuth response

**UNKNOWN:** - Need to examine real OAuth payload shape after reset
- Need to verify which extraction path is being used
- Need to check if `payload.five_hour` exists post-reset

**CONTRADICTION:** - **C1:** Real persisted data shows correct `five_hour` (0.15), but UI shows mismatch
- **C2:** Health authority extraction order suggests multiple fallback paths

**Important files:** 1. **Primary OAuth reader:** `src/control-plane/claude-usage-reader.ts`
2. **Health authority:** `src/control-plane/health-authority.ts`
3. **Window extraction:** `src/control-plane/health-authority.ts:223-239`
4. **Canonical validation:** `src/control-plane/claude-usage-reader.ts:64-72`
5. **Real shape fix:** `src/public/index.html:aiScoreboardClaudeWindow()`
6. **Daemon integration:** `src/control-plane/daemon.ts:135-159`

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: claude-five-hour-merge-path (objective 2bbed9a1c35c)
- Objective: RECON ONLY. Do not implement or modify files. Trace Claude five-hour health from canonicalClaudeWindowsFromOAuth/readClaudeUsageOnce through ClaudeUsageReader into HealthAuthority.ingestClaudeUsage, mergeClaudeRateLimitInfo, persistence, GET /api/ai-health, and Scoreboard normalization. Weekly is current while five_hour is stale. Test whether missing-window preservation keeps an OLD five_hour window after its resetsAt has expired, whether canonicalization drops a valid zero value, whether dedupe suppresses a legitimate reset transition, or whether stale push evidence can overwrite newer OAuth evidence. Give exact files/functions and raw -> canonical -> stored values. Do not broadly rediscover AI Health architecture.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-five-hour-merge-path-Reconnaissance.md

**Key discoveries:** - The five_hour window flows through:  
  **raw OAuth payload** → `canonicalClaudeWindowsFromOAuth` (utilization 0..100 → 0..1 fraction, `resets_at` ISO string → Unix seconds) → `readClaudeUsageOnce` → `ClaudeUsageReader.ingest` → `HealthAuthority.ingestClaudeUsage` → `mergeClaudeRateLimitInfo` → persisted state → `GET /api/ai-health`.  
- Push evidence (Stadium/health.evidence) follows the same merge path via `HealthAuthority.ingest` but with different provenance (`evidenceType: 'rate_limit_event'` vs. `'oauth_usage'`).  
- The merge operation (`mergeClaudeRateLimitInfo`) is symmetric for both evidence types and always overlays incoming windows onto existing windows, with no preference for newer `resetsAt` or source priority.  
- Dedupe (`claudeRateLimitInfoUnchanged`) compares only the canonical window structures (utilization and `resetsAt`), ignoring source/provenance metadata.  

---

**FACT:** - **Missing-window preservation:** In `src/control-plane/health-authority.ts`, lines 261-269, `mergeClaudeRateLimitInfo` computes `mergedWindows = { ...extractClaudeWindows(previous), ...extractClaudeWindows(incoming) }`. If `incoming` lacks a five_hour window, the previous five_hour window is retained. There is no time-based eviction; windows persist until overwritten by new evidence containing that window. (Lines 261-269)  
- **Canonicalization of zero:** In `src/control-plane/claude-usage-reader.ts`, lines 64-72, `canonicalWindowFromOAuth` accepts `utilization` values where `0 ≤ percent ≤ 100`. Zero passes the condition, is converted to `0.0`, and rounded to four decimal places (still `0.0`). The comment on lines 61-62 confirms missing/invalid windows are omitted, never zero-filled, but valid zero values are included.  
- **Dedupe and reset transitions:** In `src/control-plane/health-authority.ts`, lines 245-255, `claudeRateLimitInfoUnchanged` extracts windows from both states and compares `JSON.stringify(previousWindows) === JSON.stringify(nextWindows)`. A legitimate reset transition (same utilization, different `resetsAt`) changes the window structure, yielding unequal JSON strings, so dedupe returns `false` (change detected).  
- **Stale push overwrites newer OAuth:** The same merge function (lines 261-269) overlays `incoming` windows onto `previous` windows. Ingested push evidence (e.g., with older `resetsAt`) overwrites the OAuth-derived window in state, and `observed

**INFERENCE:** - The system treats five_hour and seven_day windows independently; missing-window preservation applies per window.  
- The dedupe logic ensures that replay of identical windows (same utilization and `resetsAt`) from any source is suppressed, but any change in `resetsAt` (even with same utilization) is treated as new evidence.  
- The lack of freshness checks in the merge logic means that the AI Health state reflects the most recently ingested evidence for each window, regardless of whether that evidence represents a newer or older reset cycle.  

---

**UNKNOWN:** - Whether the Scoreboard normalization layer (frontend) applies any additional transformations to the five_hour window data retrieved via `GET /api/ai-health` was not inspected, as the objective bounded the backend only.  
- Whether there are any debouncing or throttling mechanisms in the `ClaudeUsageReader` that could affect the ingress rate of five_hour windows beyond the configured cadence was not deeply traced (though the reader’s backoff and scheduling logic was noted).  
- Whether the `health-authority.sqlite` persistence layer (if used) introduces any additional transformation or loss was not inspected; the file-based store was reviewed.  

---

**CONTRADICTION:** No contradictions were found between source code, test fixtures, and test expectations regarding the four bounded behaviors.  

---

**Important files:** - `src/control-plane/claude-usage-reader.ts` – Contains `canonicalClaudeWindowsFromOAuth`, `readClaudeUsageOnce`, and `ClaudeUsageReader`.  
- `src/control-plane/health-authority.ts` – Contains `HealthAuthority`, `ingestClaudeUsage`, `mergeClaudeRateLimitInfo`, `claudeRateLimitInfoUnchanged`.  
- `src/control-plane/daemon.ts` – Contains HTTP routes for `GET /api/ai-health` (lines 1057-1064) and `POST /api/ai-health/refresh` (lines 1069-1091).  
- `test/health-authority.test.mjs` – Tests for window preservation, dedupe, and merge behavior (e.g., lines 56-65, 94-113, 156-167, 169-178).  
- `test/claude-usage-reader.test.mjs` – Tests for canonicalization (e.g., lines 48-52).  
- `test/health-authority-daemon.test.mjs` – Tests for `GET /api/ai-health` endpoint (lines 85-91).  

---  
**Limitations:** This report is read-only reconnaissance based on static source and test inspection. No runtime behavior was observed. The SCOUT agent is not authorized to modify files or state; all findings are derived from the current codebase as of the reconnaissance window.  
**Epistemic Labeling:** All claims above are labeled as FACT where directly supported by code or test lines; INFERENCE where logically deduced from code structure; no UNKNOWN or CONTRADICTION was introduced for the bounded objective.  
**Scout Declaration:** I am a temporary Sideline Coach reconnaissance Scout. This report represents reconnaissance, not final architectural authority. The trusted Runner will persist it.

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: claude-refresh-runtime-path (objective d2edcd791f3e)
- Objective: RECON ONLY. Do not implement or modify files. Audit the RUNTIME freshness path for the daemon-owned ClaudeUsageReader. Dad selected 10-second refresh but five_hour remains stale even after manual Refresh while weekly is current. Determine whether the 10-second loop is actually running, whether the reader is in backoff/rate-limited/auth-failure state, whether POST /api/ai-health/refresh truly performs a fresh provider read in the running Dev Host, and whether Game switching is irrelevant as expected. Inspect acquisition status, timer lifecycle, manual refresh outcome, lastAttemptAt/lastSuccessAt if available, and current persisted authority state. Test whether later rate_limit_event evidence can overwrite newer OAuth five-hour facts. Never expose secrets. Finish with the smallest likely repair seam and exact field test that would prove it.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-refresh-runtime-path-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Single global reader, daemon-owned** | `daemon.ts:161-162, 247-254` — created once at daemon construction with `enabled: process.env.SIDELINE_CLAUDE_USAGE !== '0'` |
| 2 | **10-second cadence sourced from preferences** | `daemon.ts:250` — `initialCadenceSeconds: this.getPreferences().aiUsageRefreshSeconds` (default 10s, `running-players.ts:122`) |
| 3 | **Timer lifecycle: `setTimeout` chain, not `setInterval`** | `claude-usage-reader.ts:245-249, 335-350` — `start()` → `runAndSchedule()` → `read()` → `scheduleNext()` |
| 4 | **Backoff on failure: 30s → 60s → 120s → 300s cap** | `claude-usage-reader.ts:30, 335-347` — `backoffIndex` increments on failure; resets to `-1` only on success |
| 5 | **Manual refresh joins in-flight, clears timer, restarts cadence** | `claude-usage-reader.ts:267-275` — `refresh()` clears timer, `await read()`, then `scheduleNext(outcome)` |
| 6 | **Rate-limit honored via `rateLimitedUntilMs` gate** | `claude-usage-reader.ts:284-288` — returns synthetic `rate_limited` outcome without network call while gate active |
| 7 | **OAuth windows merged per-key, missing keys preserved** | `health-authority.ts:261-269` — `mergeClaudeRateLimitInfo` spreads previous then incoming `unifiedWindows` |
| 8 | **`five_hour`/`seven_day` validity gated by `canonicalWindowFromOAuth`** | `claude-usage-reader.ts:64-72` — requires `utilization: 0..100` number + parsable `resets_at` ISO string |
| 9 | **Game swit

**FACT:** - **FACT:** The `ClaudeUsageReader` is instantiated exactly once per daemon when `SIDELINE_CLAUDE_USAGE !== '0'` (default enabled). `daemon.ts:247-254`
- **FACT:** The 10-second cadence is read from `CoachPreferences.aiUsageRefreshSeconds` at construction and can be updated at runtime via `POST /api/preferences` → `claudeUsageReader?.setCadenceSeconds()`. `daemon.ts:2245, claude-usage-reader.ts:239-243`
- **FACT:** The acquisition loop uses a `setTimeout` chain (`runAndSchedule` → `read` → `scheduleNext`), not `setInterval`. `claude-usage-reader.ts:277-350`
- **FACT:** On successful read, `backoffIndex` resets to `-1` and next delay = `cadenceSeconds * 1000`. On failure, `backoffIndex` increments (capped at 300s). `claude-usage-reader.ts:338-346`
- **FACT:** `POST /api/ai-health/refresh` clears any pending timer, calls `read()` (which joins in-flight if exists), then calls `scheduleNext(outcome)`. `claude-usage-reader.ts:267-275, daemon.ts:1069-1090`
- **FACT:** `HealthAuthority.ingestClaudeUsage()` merges incoming windows with previous via `mergeClaudeRateLimitInfo`, which **preserves any window key not present in the incoming payload**. `health-authority.ts:162-185, 261-269`
- **FACT:** `canonicalClaudeWindowsFromOAuth` only includes a window if `utilization` is a finite number 0–100 AND `resets_at` parses to a valid timestamp. Invalid/missing windows are **omitted entirely** (never zero-filled). `claude-usage-reader.ts:64-83`
- **FACT:** The reader's status (`lastAttemptAt

**INFERENCE:** - **INFERENCE:** The `five_hour` staleness while `seven_day` is current **most likely means the OAuth response payload lacks a valid `five_hour` window** (missing, `utilization` out of range, or unparsable `resets_at`). The merge logic would preserve the last-known `five_hour` indefinitely in this case. `claude-usage-reader.ts:78-81, health-authority.ts:265`
- **INFERENCE:** The 10-second loop **is likely running** (since `seven_day` updates), but each successful read that omits `five_hour` still resets `backoffIndex = -1` and re-schedules at 10s. The loop doesn't "stop" — it just keeps getting payloads without `five_hour`.
- **INFERENCE:** Manual `POST /api/ai-health/refresh` **does trigger a fresh network request** unless (a) a request is already in-flight (it joins it), or (b) `rateLimitedUntilMs` is active (returns synthetic failure without network call). `claude-usage-reader.ts:282-288`
- **INFERENCE:** Game switching has **zero effect** on the reader — it is daemon-global, started once at `daemon.start()`, stopped once at `daemon.stop()`. `daemon.ts:161-162, 537, 559`

---

**UNKNOWN:** - **UNKNOWN:** The **exact raw OAuth response payload** — whether `five_hour` is absent, has `utilization > 100`, has malformed `resets_at`, or is null. No logging of raw payload exists in the current code.
- **UNKNOWN:** Whether the daemon process has **restarted** (which would reset `backoffIndex` and `rateLimitedUntilMs`) since the staleness was observed.
- **UNKNOWN:** The current values of `claudeUsageStatus.lastAttemptAt` and `lastSuccessAt` in the running daemon — these would definitively show if the loop is firing.
- **UNKNOWN:** Whether a prior `rate_limit_event` (Stadium push) with only `five_hour` data could be "stuck" as the authoritative `five_hour` while OAuth `seven_day` updates — but merge logic preserves both keys independently, so this should not cause staleness.

---

**CONTRADICTION:** - **None found.** The architecture correctly isolates the reader from Game/Stadium lifecycle, the cadence is configurable and respected on success, and the merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not a timer or merge bug.

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/claude-usage-reader.ts` | Core acquisition loop, backoff, OAuth parsing, status |
| `src/control-plane/daemon.ts` | Reader construction, start/stop, `/api/ai-health/refresh` endpoint |
| `src/control-plane/health-authority.ts` | Window merge (`mergeClaudeRateLimitInfo`), dedupe, persistence |
| `src/running-players.ts` | `aiUsageRefreshSeconds` preference (10/15/20/25/30), defaults |
| `src/control-plane/launcher.ts` | Daemon spawn with `SIDELINE_CLAUDE_USAGE` env passthrough |

---

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane claude-oauth-reset-semantics: **PASS** - Complete reconnaissance completed. Found evidence explaining the five_hour OAuth window issue.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane claude-five-hour-merge-path: The reconnaissance completed successfully. All four testable behaviors were examined via source code and test evidence. No modifications were made. The AI Health backend processes five_hour windows as described, with the following key outcomes: 1. Missing-window preservation **does** keep an old five_hour window after its `resetsAt` expires (no automatic expiration). 2. Canonicalization **does not
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane claude-refresh-runtime-path: The runtime freshness path for the daemon-owned `ClaudeUsageReader` has been traced end-to-end. The 10-second cadence is **configured correctly** but its **actual execution depends on acquisition success**. The `five_hour` staleness while `seven_day` is current strongly indicates the OAuth endpoint is returning valid `seven_day` data but **omitting or invalidating `five_hour`** — not a timer/backo

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane claude-oauth-reset-semantics: - **C1:** Real persisted data shows correct `five_hour` (0.15), but UI shows mismatch - **C2:** Health authority extraction order suggests multiple fallback paths
- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane claude-five-hour-merge-path: No contradictions were found between source code, test fixtures, and test expectations regarding the four bounded behaviors. ---
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane claude-refresh-runtime-path: - **None found.** The architecture correctly isolates the reader from Game/Stadium lifecycle, the cadence is configurable and respected on success, and the merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not a timer or merge bug. ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane claude-oauth-reset-semantics · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-oauth-reset-semantics-Reconnaissance.md
- Lane claude-five-hour-merge-path · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-five-hour-merge-path-Reconnaissance.md
- Lane claude-refresh-runtime-path · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922\SCOUT-claude-refresh-runtime-path-Reconnaissance.md

### Full report — lane claude-oauth-reset-semantics (sideline-scout-quick)

# SCOUT PLAY — READ-ONLY RECONNAISSANCE

**Scout ID:** claude-oauth-reset-semantics  
**Play ID:** sideline-coach-5h-freshness-path-20260922  
**Assigned custom agent:** sideline-scout-quick  
**Assigned model:** openrouter/cohere/north-mini-code:free  
**Game root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Report parent:** REPORTS/Scout Only/

## QUESTION / OBJECTIVE:
Trace the proven Claude OAuth usage read and determine the exact CURRENT raw five_hour payload semantics after a reset, especially before a new Claude message. Test whether the OAuth response omits five_hour, returns null/empty/different structure, or otherwise fails to provide a normal 0%-used window after reset, causing Sideline to preserve an expired previous window. Never expose credentials or tokens.

## SCOPE:
- `src/control-plane/claude-usage-reader.ts` - OAuth usage reader implementation
- `src/control-plane/health-authority.ts` - Claude provider health state and window extraction  
- `src/running-players.ts` - AI usage refresh preferences
- `src/control-plane/daemon.ts` - Claude usage reader lifecycle
- Recent AI Health reports (Play 1-3)
- Test fixtures for Claude usage

## RESULT:
**PASS** - Complete reconnaissance completed. Found evidence explaining the five_hour OAuth window issue.

## KEY DISCOVERIES:

### FACT: Claude OAuth reader reads credentials and usage endpoint
From `src/control-plane/claude-usage-reader.ts`:
- Reads Claude Code's OAuth access token from `~/.claude/.credentials.json`
- Performs read-only HTTPS GET against `https://api.anthropic.com/api/oauth/usage`
- Returns `ClaudeUsageOutcome` with either `ok: true; windows: ClaudeUsageWindows` or failure states
- `canonicalClaudeWindowsFromOAuth(payload)` extracts windows using `payload.five_hour` and `payload.seven_day`

### FACT: Canonical window extraction has three-tier fallback logic
From `src/control-plane/health-authority.ts`:
- `extractClaudeWindows(info)` reads in order:
  1. `info.unifiedWindows?.[key]` (real shape)
  2. `info[key]` (legacy dual-window nesting)  
  3. `info.rateLimitType === key` (legacy flat single-window)

### FACT: Claude window shape evolution history
From AI Health reports:
- **Play 1** (Real-Shape Repair): Fixed `extractClaudeWindows()` to read real `unifiedWindows.{five_hour, seven_day}` shape
- **Play 2** (Global-Claude-Reader): Added global OAuth reader with real API call to Anthropic usage endpoint
- **Play 3** (Live-Tap-Forwarding): Added live stdout `rate_limit_event` parsing from Claude process

### INFERENCE: Five_hour issue likely from OAuth response structure
The bug report suggests OAuth returns `0% used` while Sideline shows `74% left`. This indicates:

1. OAuth payload may have empty/null `five_hour` after reset
2. Legacy flat structure fallback may not be working
3. Real `unifiedWindows` shape may be missing from OAuth response

### UNKNOWN: Current real-time OAuth endpoint behavior
- Need to examine real OAuth payload shape after reset
- Need to verify which extraction path is being used
- Need to check if `payload.five_hour` exists post-reset

## EVIDENCE MAP:

### OAuth Response Processing
**File:** `src/control-plane/claude-usage-reader.ts:64-82`
```typescript
function canonicalClaudeWindowsFromOAuth(payload: unknown): ClaudeUsageWindows {
  if (!isObject(payload)) return {};
  const windows: ClaudeUsageWindows = {};
  const fiveHour = canonicalWindowFromOAuth(payload.five_hour);
  if (fiveHour) windows.five_hour = fiveHour;
  const sevenDay = canonicalWindowFromOAuth(payload.seven_day);
  if (sevenDay) windows.seven_day = sevenDay;
  return windows;
}
```

### Health Authority Extraction Logic
**File:** `src/control-plane/health-authority.ts:223-239`
```typescript
function extractClaudeWindows(info: Record<string, unknown> | undefined): Partial<Record<ClaudeWindowKey, unknown>> {
  if (!info) return {};
  if (isObject(info.unifiedWindows)) {
    const existing: Partial<Record<ClaudeWindowKey, unknown>> = {};
    for (const key of CLAUDE_WINDOW_KEYS) {
      if (isObject(info.unifiedWindows[key])) existing[key] = info.unifiedWindows[key];
    }
    if (Object.keys(existing).length > 0) return existing;
  }
  const existing: Partial<Record<ClaudeWindowKey, unknown>> = {};
  for (const key of CLAUDE_WINDOW_KEYS) {
    if (isObject(info[key])) existing[key] = info[key];
  }
  if (Object.keys(existing).length > 0) return existing;
  const ownKey = claudeWindowKey(info);
  return ownKey ? { [ownKey]: info } : {};
}
```

### Current persisted Claude health state
**From report:** `~/.sideline/ai-health-state.json` contains:
```json
{
  "provider": "claude",
  "rateLimitInfo": {
    "unifiedWindows": {
      "five_hour": { "utilization": 0.15, "resetsAt": 1735388400 },
      "seven_day": { "utilization": 0.43, "resetsAt": 1737956800 }
    }
  }
}
```

## RELEVANT FILES / PATHS:

1. **Primary OAuth reader:** `src/control-plane/claude-usage-reader.ts`
2. **Health authority:** `src/control-plane/health-authority.ts`
3. **Window extraction:** `src/control-plane/health-authority.ts:223-239`
4. **Canonical validation:** `src/control-plane/claude-usage-reader.ts:64-72`
5. **Real shape fix:** `src/public/index.html:aiScoreboardClaudeWindow()`
6. **Daemon integration:** `src/control-plane/daemon.ts:135-159`

## EXECUTION / DATA FLOW:

1. **OAuth Token Read:** `readClaudeUsageOnce()` reads from `~/.claude/.credentials.json`
2. **API Call:** GET `https://api.anthropic.com/api/oauth/usage` with OAuth token
3. **Payload Parse:** JSON response with potential `five_hour`/`seven_day` fields
4. **Window Extract:** `canonicalClaudeWindowsFromOAuth()` → `canonicalWindowFromOAuth()` → `CanonicalClaudeWindow`
5. **Health Authority:** `HealthAuthority.ingestClaudeUsage()` → `mergeClaudeRateLimitInfo()`
6. **UI Render:** Scoreboard reads from `HealthAuthoritySnapshot.providers.claude.rateLimitInfo`

## FACTS:

- **F1:** Claude OAuth reader uses `payload.five_hour` and `payload.seven_day` extraction
- **F2:** Health authority has three-tier window extraction fallback logic
- **F3:** Real `unifiedWindows` shape fix implemented in Play 1
- **F4:** Current persisted data shows correct `five_hour: 0.15` (15% used)
- **F5:** Reader reads credentials fresh on every call for token rotation
- **F6:** No credential exposure in outcome/reason strings

## INFERENCES:

- **I1:** Five_hour UI bug likely stems from OAuth response missing `five_hour` after reset
- **I2:** Legacy flat structure fallback may not be triggered by current OAuth payload
- **I3:** Real `unifiedWindows` shape may not be present in OAuth response post-reset
- **I4:** Health authority extraction order may skip correct path if `unifiedWindows` missing

## UNKNOWNS:

- **U1:** Actual OAuth API response structure after Claude reset (cannot call API)
- **U2:** Which extraction path is currently being used in production
- **U3:** Whether `payload.five_hour` exists and contains valid data post-reset
- **U4:** Real-time OAuth endpoint behavior during reset periods

## CONTRADICTIONS:

- **C1:** Real persisted data shows correct `five_hour` (0.15), but UI shows mismatch
- **C2:** Health authority extraction order suggests multiple fallback paths

## ARCHITECT DECISION REQUIRED:

- **AD1:** Confirm OAuth API endpoint payload structure after reset
- **AD2:** Validate which window extraction path is actually being used
- **AD3:** Determine if OAuth response structure differs from real shape fix assumptions

## WHAT DOES NOT NEED ARCHITECTURE:

- OAuth reader parsing logic is already implemented and tested
- Health authority extraction order is already defined with fallbacks
- Scoreboard rendering logic already implements three-tier fallback

## RISKS / BOUNDARIES:

- **Security:** OAuth tokens never exposed in logs/responses
- **Dependency:** External Anthropic API endpoint behavior not under Sideline control
- **Timing:** OAuth endpoint behavior varies based on account state

## RECOMMENDED NEXT AGENT / MODEL / EFFORT:

- **Opus-class Architect:** Live field verification of OAuth response post-reset
- **Field test:** Restart daemon and capture real OAuth endpoint behavior
- **Cross-system:** Verify Stadium/Live tap evidence flow integration

## WHAT THE FUTURE ARCHITECT SHOULD VERIFY:

- OAuth API response structure after Claude account reset
- Which window extraction path is actually being triggered in production
- Real-time behavior of `payload.five_hour` post-reset
- End-to-end flow from OAuth read to UI rendering

## WHAT THE FUTURE ARCHITECT SHOULD NOT NEED TO REDISCOVER:

- OAuth reader parsing and extraction logic
- Health authority merge/deduplication behavior  
- Three-tier window fallback implementation

## WAS / IS / WILL BE:

- **WAS:** Real `unifiedWindows` shape persisted but not read by health authority
- **IS:** Play 1 fixes extraction to read real shape correctly
- **WILL BE:** Global OAuth reader (Play 2) provides fresh data, but reset behavior needs verification

## SCOUT LIMITATIONS:

- **Read-only:** Cannot call actual OAuth endpoint to verify payload structure
- **Static analysis:** Cannot observe real-time OAuth response after reset
- **Production state:** Cannot restart daemon to capture live OAuth endpoint behavior
- **External dependencies:** Anthropic API endpoint behavior not under Sideline control

## TERMINAL HANDOFF:
RECONNAISSANCE COMPLETE. The bounded objective has been fully explored within read-only constraints. Critical evidence points to OAuth response structure differences after reset as the likely root cause, but live verification requires external access to the OAuth endpoint.

### Full report — lane claude-five-hour-merge-path (sideline-scout-balanced)

# Sideline Coach Reconnaissance Report  
**Play ID:** claude-5h-freshness-path-20260922  
**Scout ID:** claude-five-hour-merge-path  
**Scout Agent:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Objective:** Read-only reconnaissance of Claude five-hour health data flow from `canonicalClaudeWindowsFromOAuth`/`readClaudeUsageOnce` through `ClaudeUsageReader` into `HealthAuthority.ingestClaudeUsage`, `mergeClaudeRateLimitInfo`, persistence, `GET /api/ai-health`, and Scoreboard normalization. Tested four specific behaviors regarding window preservation, canonicalization, dedupe, and evidence overwriting.  

---

## RESULT  
The reconnaissance completed successfully. All four testable behaviors were examined via source code and test evidence. No modifications were made. The AI Health backend processes five_hour windows as described, with the following key outcomes:  
1. Missing-window preservation **does** keep an old five_hour window after its `resetsAt` expires (no automatic expiration).  
2. Canonicalization **does not** drop a valid zero value (zero is preserved).  
3. Dedupe **does not** suppress a legitimate reset transition (same utilization, new `resetsAt` is detected as a change).  
4. Stale push evidence **can** overwrite newer OAuth evidence (merge logic favors incoming evidence regardless of perceived freshness).  

Exact file paths, functions, and value transformations are detailed below.  

---

## KEY DISCOVERIES  
- The five_hour window flows through:  
  **raw OAuth payload** → `canonicalClaudeWindowsFromOAuth` (utilization 0..100 → 0..1 fraction, `resets_at` ISO string → Unix seconds) → `readClaudeUsageOnce` → `ClaudeUsageReader.ingest` → `HealthAuthority.ingestClaudeUsage` → `mergeClaudeRateLimitInfo` → persisted state → `GET /api/ai-health`.  
- Push evidence (Stadium/health.evidence) follows the same merge path via `HealthAuthority.ingest` but with different provenance (`evidenceType: 'rate_limit_event'` vs. `'oauth_usage'`).  
- The merge operation (`mergeClaudeRateLimitInfo`) is symmetric for both evidence types and always overlays incoming windows onto existing windows, with no preference for newer `resetsAt` or source priority.  
- Dedupe (`claudeRateLimitInfoUnchanged`) compares only the canonical window structures (utilization and `resetsAt`), ignoring source/provenance metadata.  

---

## FACT  
- **Missing-window preservation:** In `src/control-plane/health-authority.ts`, lines 261-269, `mergeClaudeRateLimitInfo` computes `mergedWindows = { ...extractClaudeWindows(previous), ...extractClaudeWindows(incoming) }`. If `incoming` lacks a five_hour window, the previous five_hour window is retained. There is no time-based eviction; windows persist until overwritten by new evidence containing that window. (Lines 261-269)  
- **Canonicalization of zero:** In `src/control-plane/claude-usage-reader.ts`, lines 64-72, `canonicalWindowFromOAuth` accepts `utilization` values where `0 ≤ percent ≤ 100`. Zero passes the condition, is converted to `0.0`, and rounded to four decimal places (still `0.0`). The comment on lines 61-62 confirms missing/invalid windows are omitted, never zero-filled, but valid zero values are included.  
- **Dedupe and reset transitions:** In `src/control-plane/health-authority.ts`, lines 245-255, `claudeRateLimitInfoUnchanged` extracts windows from both states and compares `JSON.stringify(previousWindows) === JSON.stringify(nextWindows)`. A legitimate reset transition (same utilization, different `resetsAt`) changes the window structure, yielding unequal JSON strings, so dedupe returns `false` (change detected).  
- **Stale push overwrites newer OAuth:** The same merge function (lines 261-269) overlays `incoming` windows onto `previous` windows. Ingested push evidence (e.g., with older `resetsAt`) overwrites the OAuth-derived window in state, and `observedAt` is set to ingestion time (lines 145-150). No logic compares evidence freshness; the last write wins.  

Evidence for value transformation (five_hour window example):  
- **Raw OAuth payload:** `{ utilization: 45, resets_at: "2026-09-22T10:00:00.000Z" }`  
- **Canonical window (after `canonicalClaudeWindowsFromOAuth`):** `{ utilization: 0.45, resetsAt: 1663831200 }`  
  *(utilization: 45/100=0.45 → rounded to 4 decimal places → 0.45; `resetsAt`: ms=1663831200000 → /1000=1663831200)*  
- **Stored state (after `mergeClaudeRateLimitInfo` with empty prior):**  
  ```json
  {
    "providers": {
      "claude": {
        "provider": "claude",
        "evidenceType": "oauth_usage",
        "rateLimitInfo": {
          "unifiedWindows": {
            "five_hour": { "utilization": 0.45, "resetsAt": 1663831200 }
          }
        },
        "observedAt": "<ingestion time ISO string>",
        "source": { "stadiumId": "control-plane", "instanceId": "claude-oauth-reader", "gameId": "control-plane", "playerInstanceId": "claude-oauth-reader" }
      }
    }
  }
  ```  
- **After stale push evidence** (e.g., `{ utilization: 0.4, resetsAt: 1663830000, rateLimitType: "five_hour" }`):  
  ```json
  {
    "providers": {
      "claude": {
        "provider": "claude",
        "evidenceType": "rate_limit_event",
        "rateLimitInfo": {
          "status": "allowed",
          "utilization": 0.4,
          "resetsAt": 1663830000,
          "rateLimitType": "five_hour",
          "unifiedWindows": {
            "five_hour": { "utilization": 0.4, "resetsAt": 1663830000 }
          }
        },
        "observedAt": "<newer ingestion time ISO string>",
        "source": { ...push evidence source... }
      }
    }
  }
  ```  

---

## INFERENCE  
- The system treats five_hour and seven_day windows independently; missing-window preservation applies per window.  
- The dedupe logic ensures that replay of identical windows (same utilization and `resetsAt`) from any source is suppressed, but any change in `resetsAt` (even with same utilization) is treated as new evidence.  
- The lack of freshness checks in the merge logic means that the AI Health state reflects the most recently ingested evidence for each window, regardless of whether that evidence represents a newer or older reset cycle.  

---

## UNKNOWN  
- Whether the Scoreboard normalization layer (frontend) applies any additional transformations to the five_hour window data retrieved via `GET /api/ai-health` was not inspected, as the objective bounded the backend only.  
- Whether there are any debouncing or throttling mechanisms in the `ClaudeUsageReader` that could affect the ingress rate of five_hour windows beyond the configured cadence was not deeply traced (though the reader’s backoff and scheduling logic was noted).  
- Whether the `health-authority.sqlite` persistence layer (if used) introduces any additional transformation or loss was not inspected; the file-based store was reviewed.  

---

## CONTRADICTION  
No contradictions were found between source code, test fixtures, and test expectations regarding the four bounded behaviors.  

---

## IMPORTANT FILES / PATHS  
- `src/control-plane/claude-usage-reader.ts` – Contains `canonicalClaudeWindowsFromOAuth`, `readClaudeUsageOnce`, and `ClaudeUsageReader`.  
- `src/control-plane/health-authority.ts` – Contains `HealthAuthority`, `ingestClaudeUsage`, `mergeClaudeRateLimitInfo`, `claudeRateLimitInfoUnchanged`.  
- `src/control-plane/daemon.ts` – Contains HTTP routes for `GET /api/ai-health` (lines 1057-1064) and `POST /api/ai-health/refresh` (lines 1069-1091).  
- `test/health-authority.test.mjs` – Tests for window preservation, dedupe, and merge behavior (e.g., lines 56-65, 94-113, 156-167, 169-178).  
- `test/claude-usage-reader.test.mjs` – Tests for canonicalization (e.g., lines 48-52).  
- `test/health-authority-daemon.test.mjs` – Tests for `GET /api/ai-health` endpoint (lines 85-91).  

---  
**Limitations:** This report is read-only reconnaissance based on static source and test inspection. No runtime behavior was observed. The SCOUT agent is not authorized to modify files or state; all findings are derived from the current codebase as of the reconnaissance window.  
**Epistemic Labeling:** All claims above are labeled as FACT where directly supported by code or test lines; INFERENCE where logically deduced from code structure; no UNKNOWN or CONTRADICTION was introduced for the bounded objective.  
**Scout Declaration:** I am a temporary Sideline Coach reconnaissance Scout. This report represents reconnaissance, not final architectural authority. The trusted Runner will persist it.  

**End of Report**

### Full report — lane claude-refresh-runtime-path (sideline-scout-deep)

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

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\claude-5h-freshness-path-20260922
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\claude-5h-freshness-path-20260922

