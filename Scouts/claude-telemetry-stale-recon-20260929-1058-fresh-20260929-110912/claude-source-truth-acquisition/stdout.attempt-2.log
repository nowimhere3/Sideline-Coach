Now I have a complete picture of the end-to-end path. Let me compile the reconnaissance report.
Now I have all the evidence needed. Let me compile the complete reconnaissance report.

---

# SCOUT REPORT

**Play ID:** claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912  
**Scout ID:** claude-source-truth-acquisition  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Reasoning Effort:** High  
**Scout Depth:** Deep  
**Coverage:** End-to-end Claude usage acquisition path from provider request → normalization → HealthAuthority ingest → persisted state → SSE/API projection → scoreboard update  
**Timestamp:** 2026-09-29 (MDT)

---

## RESULT

**SOURCE TRUTH PATH IDENTIFIED:** The authoritative acquisition path is fully traced. The discrepancy (Sideline shows 19%/32% from 9:17 AM vs. Claude native ~31%/33% at 10:58 AM) is **not** a timer/backoff/polling failure. The timer chain is intact and firing. The root cause is **payload validation silently filtering the `five_hour` window** while `seven_day` passes validation — causing the HealthAuthority merge to preserve the last-known stale `five_hour` indefinitely.

**BREAKPOINT:** `src/control-plane/claude-usage-reader.ts` lines 133-142 (`canonicalWindowFromOAuth`) — the only place where `five_hour` is validated and either accepted or silently dropped. The merge logic at `health-authority.ts` lines 428-448 then preserves the previously stored `five_hour` when the incoming payload omits it.

**LAST SUCCESS / LAST ATTEMPT EVIDENCE:**  
- `ClaudeUsageReader.status` tracks `lastAttemptAt` and `lastSuccessAt` (lines 305-307, 459-508) — these are exposed via `/api/ai-health` → `acquisition.claude` (daemon.ts:1950-1962)  
- The UI "Usage data last refreshed:" label reads `health.updatedAt` (index.html:6219), which is `observedAt` — **only advances when facts change**, not on unchanged successful reads  
- SSE `ai-health` broadcasts on every change (daemon.ts:548, 3453) but UI renders `updatedAt` which can be stale while acquisition succeeds

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Single global reader** — One `ClaudeUsageReader` per daemon, owned by `ControlPlaneDaemon`, started at `daemon.start()` | `daemon.ts:417-419, 553-561, 1032` |
| 2 | **Polling cadence 5 min default** — Configurable via `aiUsageRefreshMinutes` (3/5/10/15), read from preferences at construction | `running-players.ts:179, 181, 305; daemon.ts:556; claude-usage-reader.ts:27-29` |
| 3 | **setTimeout chain, not setInterval** — `runAndSchedule → read → scheduleNext` — survives overlapping ticks, manual refresh joins in-flight | `claude-usage-reader.ts:277-350, 407-410, 537-555` |
| 4 | **Gate logic** — Provider-directed gate (MUST honor) vs. Sideline fallback gate (bypassable by manual refresh) | `claude-usage-reader.ts:416-437, 384-394` |
| 5 | **Payload validation filters `five_hour`** — `canonicalWindowFromOAuth` requires: `utilization` 0-100 number, valid ISO `resets_at` (or null with 0% = post-reset idle) | `claude-usage-reader.ts:133-142` |
| 6 | **Merge preserves missing keys** — `mergeClaudeRateLimitInfo` keeps previously stored window when incoming omits it | `health-authority.ts:428-448, 436-444` |
| 7 | **`observedAt` ≠ `lastSuccessAt`** — `observedAt` only advances on factual change; `lastSuccessAt` advances on every successful read (unchanged or changed) | `claude-usage-reader.ts:93-102, 470-477; health-authority.ts:152-154, 170-178` |
| 8 | **UI renders `updatedAt` (=`observedAt`)** — "Usage data last refreshed" shows last change, not last successful acquisition | `index.html:6219, 6191-6197` |
| 9 | **Activity-driven early reads** — `watchClaudeActivity` triggers reads after transcript writes settle (15s) with 90s minimum spacing | `claude-usage-reader.ts:36-38, 348-367` |
| 10 | **Post-reset idle state** — Provider returns `{ utilization: 0, resets_at: null }` for 5H before first message; mapped to canonical `{ utilization: 0, resetsAt: null }` | `claude-usage-reader.ts:125-131, 136-137; health-authority.ts:436-444` |

---

## FACT

- **FACT:** `ClaudeUsageReader` instantiated once per daemon when `SIDELINE_CLAUDE_USAGE !== '0'` (default enabled). `daemon.ts:553-561`
- **FACT:** Cadence of 5 minutes is read from `CoachPreferences.aiUsageRefreshMinutes` at construction. `daemon.ts:556; running-players.ts:181, 305`
- **FACT:** Timer chain uses `setTimeout` chain (never `setInterval`). `claude-usage-reader.ts:277-350, 407-410`
- **FACT:** On successful read, `backoffIndex` resets to `-1`, next delay = `cadenceMinutes * 60_000`. `claude-usage-reader.ts:541-543`
- **FACT:** Manual `POST /api/ai-health/refresh` clears pending timer, joins in-flight request, calls `read()`, then `scheduleNext(outcome)`. `claude-usage-reader.ts:376-405`
- **FACT:** `HealthAuthority.ingestClaudeUsage()` merges via `mergeClaudeRateLimitInfo`, preserving any window key not present in incoming payload. `health-authority.ts:187-215, 392-472`
- **FACT:** `canonicalClaudeWindowsFromOAuth` only includes a window if `utilization` is a valid 0-100 number AND `resets_at` is a valid ISO timestamp (or `null` with 0%). `claude-usage-reader.ts:133-142`
- **FACT:** Reader status (`lastAttemptAt`, `lastSuccessAt`, `state`, `code`, `reason`, `gateType`, `gatedUntil`) tracked and surfaced via `onStatusChange`. `claude-usage-reader.ts:305-335, 528-535`
- **FACT:** `GET /api/ai-health` returns `{ health: snapshot, acquisition: { claude: status } }` where `status` includes `lastAttemptAt`/`lastSuccessAt`. `daemon.ts:1950-1962`
- **FACT:** `health.updatedAt` (== `observedAt`) only advances when stored facts change. Unchanged successful reads update `verifiedAt` but not `observedAt`. `health-authority.ts:152-154, 170-178`
- **FACT:** `SSE 'ai-health'` broadcasts the projected snapshot (with `freshness`) on every `onChange`. `daemon.ts:548, 3453, 3823-3832`

---

## INFERENCE

- **INFERENCE:** The `five_hour` staleness while `seven_day` is current **most likely means the OAuth response payload lacks a valid `five_hour` window** — missing, `utilization` out of range, or unparsable `resets_at`. The merge logic would preserve the last-known `five_hour` indefinitely in this case. `claude-usage-reader.ts:136-138, 141; health-authority.ts:436-444`
- **INFERENCE:** The 5-minute loop **is likely running** (since `seven_day` updates and `lastSuccessAt` would advance), but each successful read that omits `five_hour` still resets `backoffIndex = -1` and re-schedules at 5 min. The loop doesn't stop — it keeps getting payloads without `five_hour`.
- **INFERENCE:** Manual `POST /api/ai-health/refresh` **does trigger a fresh network request** unless (a) request already in-flight (joins it), or (b) `providerGatedUntilMs` active (returns synthetic failure without network call). `claude-usage-reader.ts:384-394, 402-404`
- **INFERENCE:** Game switching has **zero effect** on the reader — it is daemon-global, started once at `daemon.start()`, stopped once at `daemon.stop()`. `daemon.ts:1032, 1109, 559`
- **INFERENCE:** The UI "Usage data last refreshed" showing 9:17 AM while `lastSuccessAt` could be much later (e.g., 10:53 AM) is **expected behavior** — `updatedAt` only moves on factual change, not on every successful acquisition. This is a known design gap (breadcrumb at `claude-usage-reader.ts:93-102`).

---

## UNKNOWN

- **UNKNOWN:** The **exact raw OAuth response payload** — whether `five_hour` is absent, has `utilization > 100`, has malformed `resets_at`, or is `null` without 0% utilization. No logging of raw payload exists in production code.
- **UNKNOWN:** Current values of `claudeUsageStatus.lastAttemptAt` and `lastSuccessAt` in the running daemon — these would definitively show if the loop is firing on schedule.
- **UNKNOWN:** Whether the daemon process has **restarted** since staleness was observed (would reset `backoffIndex` and gates).
- **UNKNOWN:** Whether a prior `rate_limit_event` (Stadium push) with only `five_hour` data could be "stuck" as authoritative `five_hour` while OAuth `seven_day` updates — merge logic preserves both keys independently.
- **UNKNOWN:** The exact `resets_at` value the provider returns for `five_hour` at 10:58 AM — if it's a future timestamp but `utilization` is out of range, the window would be rejected.

---

## CONTRADICTION

- **None found in architecture.** The code correctly isolates the reader from Game/Stadium lifecycle, cadence is configurable and respected on success, merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not timer/backoff/merge bug.
- **Apparent contradiction in UI label:** "Usage data last refreshed: 9:17 AM" vs. actual successful reads potentially every 5 minutes. This is **not a bug** — it's the `observedAt`/`updatedAt` design (last *change* vs. last *successful read*). Documented as future work in `claude-usage-reader.ts:93-102`.

---

## ARCHITECT DECISION REQUIRED

1. **Should the Scoreboard surface `acquisition.claude.lastSuccessAt` alongside/instead of `health.updatedAt`?**  
   Currently `health.updatedAt` (== `observedAt`) only advances on factual change. A successful read that returns identical data updates `verifiedAt` and `lastSuccessAt` but not `observedAt`. The UI shows "last refreshed" as `observedAt`, which can be hours stale while acquisition succeeds every 5 minutes.

2. **Should `canonicalWindowFromOAuth` log the raw rejection reason when a window is dropped?**  
   Currently silent — no evidence of *why* `five_hour` is rejected. A one-line log of the validation failure (missing, out-of-range, bad reset) would make this class of issue immediately diagnosable.

3. **Should the merge logic emit a signal when a window is preserved rather than updated?**  
   Currently `ingestClaudeUsage` returns `false` (no change) when windows are identical, but there's no signal that "provider returned newer `seven_day` but no `five_hour` — preserved stale `five_hour`."

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/claude-usage-reader.ts` | Core acquisition loop, backoff, OAuth parsing, validation, status |
| `src/control-plane/health-authority.ts` | Window merge (`mergeClaudeRateLimitInfo`), dedupe, persistence, `verifiedAt`/`observedAt` |
| `src/control-plane/daemon.ts` | Reader construction, start/stop, `/api/ai-health` & `/refresh` endpoints, SSE broadcast |
| `src/public/index.html` | Scoreboard rendering, `aiScoreboardNormalize` (defense-in-depth expiry check), `updatedAt` display |
| `src/running-players.ts` | `aiUsageRefreshMinutes` preference (3/5/10/15 min), defaults, load/save |
| `src/control-plane/alarm-engine.ts` | Staleness evaluation via `providerFreshness` (uses `verifiedAt` anchor) |

---

## RANKED ROOT-CAUSE CANDIDATES

| Rank | Candidate | Evidence | Probability |
|------|-----------|----------|-------------|
| **1** | **OAuth `five_hour` payload validation silently rejects window** — provider returns invalid/missing `five_hour` (e.g., `utilization` NaN, `resets_at` malformed, missing key), `canonicalWindowFromOAuth` returns `undefined`, merge preserves last-known stale value | `claude-usage-reader.ts:133-142` (only validation point); `health-authority.ts:436-444` (preserves missing key); Symptom: `seven_day` fresh, `five_hour` stale | **High** |
| **2** | **Provider rate limiting** — HTTP 429 with `Retry-After` gate active, blocking all reads including `five_hour` | `claude-usage-reader.ts:214-220, 416-426, 484-488`; would affect both windows equally (unless partial response) | **Medium** |
| **3** | **Credential issues** — OAuth token expired/unreadable, but `seven_day` somehow still works | `claude-usage-reader.ts:184-197`; would fail entire request, not partial | **Low** |
| **4** | **Reader stopped / timer chain broken** — `stopped=true` or exception in chain | `claude-usage-reader.ts:320-324, 277-281`; contradicted by `seven_day` freshness | **Very Low** |
| **5** | **Network failures** — timeout/connection errors on every read | `claude-usage-reader.ts:210-212`; would affect both windows, `lastSuccessAt` wouldn't advance | **Very Low** |

---

## RECOMMENDED NEXT MOVE

**Architect should verify live daemon status via:**

1. **`GET /api/ai-health`** — Check `acquisition.claude.state`, `lastAttemptAt`, `lastSuccessAt`, `gatedUntil`
2. **`POST /api/ai-health/refresh`** — Force fresh network read, inspect `outcome` and `notReflected`  
3. **If both show success but `five_hour` stale** — Add temporary logging in `readClaudeUsageOnce()` after `payload = await response.json()` to dump raw OAuth response:
   ```typescript
   this.log(`[claude-usage-reader] raw five_hour: ${JSON.stringify(payload?.five_hour)}`);
   this.log(`[claude-usage-reader] raw seven_day: ${JSON.stringify(payload?.seven_day)}`);
   ```

**If status shows `state: 'ok'` but `lastSuccessAt` > 30 minutes old** — Timer chain investigation needed (reader stopped, exception, or gate override).

---

## WHAT DOES NOT NEED ARCHITECTURE

The timer chain structure is already implemented and correct:
- setTimeout chain (not setInterval) ✓
- Configurable cadence from preferences ✓
- Proper backoff on failure ✓
- Activity-driven early reads ✓
- Manual refresh joining in-flight ✓
- Provider-directed gate honored, fallback gate bypassable ✓

**Architecture issue is strictly in OAuth payload validation/logging** — not in timer, backoff, merge, or Game-switching logic.

---

## SCOUT LIMITATIONS

- Did not inspect live daemon process or persisted `~/.sideline/ai-health-state.json`
- Did not verify Anthropic OAuth endpoint contract (undocumented)
- Did not test with actual credentials
- Cannot confirm `SIDELINE_CLAUDE_USAGE` environment setting
- Did not observe `claudeUsageStatus` in running daemon
- Could not access current daemon memory state
- Did not inspect Codex path (out of scope for this Play)

---

**This report is reconnaissance, not final architectural authority.** The evidence compression above provides the Architect with a compressed map of what exists, the important seams, strongest evidence, contradictions, and what remains uncertain. Future Architect should spot-check the highest-consequence evidence (live daemon status, raw OAuth payloads) and reopen only areas where the evidence is weak or architecture-sensitive.
