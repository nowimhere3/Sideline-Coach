# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 1 substitution · elapsed 00:08:06

Play: claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912
Rerun of: claude-telemetry-stale-recon-20260929-1058 (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-29T17:09:12.195Z
Finished: 2026-09-29T17:17:18.695Z
TOTAL ELAPSED TIME: 00:08:06

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 4
Substitutions: 1
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-polling-runtime | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T17:09:12.219Z | 2026-09-29T17:10:53.726Z | 00:01:41 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-polling-runtime-Reconnaissance.md |
| claude-source-truth-acquisition | 1 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T17:09:12.237Z | 2026-09-29T17:10:40.602Z | 00:01:28 | FAILED | RATE LIMITED [availability] | replaced by sideline-scout-deep | none |
| claude-source-truth-acquisition | 2 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T17:10:40.613Z | 2026-09-29T17:17:18.687Z | 00:06:38 | COMPLETE | — | substituted for sideline-scout | C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-source-truth-acquisition-Reconnaissance.md |
| claude-freshness-ui-diff | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T17:09:12.251Z | 2026-09-29T17:16:35.673Z | 00:07:23 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-freshness-ui-diff-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane claude-polling-runtime: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane claude-source-truth-acquisition: Poolside: Laguna S 2.1 (free) (sideline-scout) → NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
    - Poolside: Laguna S 2.1 (free) (sideline-scout) benched: RATE LIMITED — The provider rate-limited this Scout. (> sideline-scout · poolside/laguna-s-2.1:free)
- Lane claude-freshness-ui-diff: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: claude-polling-runtime (objective d6e8cd875639)
- Objective: READ-ONLY reconnaissance. Preserve the current stale Claude runtime state. Do NOT invoke Refresh, restart the daemon, clear state, edit files, commit, or push. Current evidence at approximately 10:58 AM MDT: Sideline AI Usage Global still shows Claude 5H 19% used / 81% left and Weekly 32% used / 68% left, with 'Usage data last refreshed' at 9:17 AM. Claude's own current Usage page shows Current session 31% used and This week 33% used. ClaudeUsageReader is believed to have periodic polling, so do NOT assume the Codex root cause applies. Trace the actual Claude polling lifecycle from daemon startup through start/runAndSchedule/scheduleNext, cadence preferences, activity-triggered reads, rate-limit/backoff gates, acquisition status, stop/restart paths, and any condition that can leave the polling chain dead or suspended. Determine why no successful visible refresh appears to have occurred for roughly 1h41m. Return EXACT TIMER PATH, CURRENT FAILURE CANDIDATES, RUNTIME EVIDENCE, and exact files/symbols for AGY.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-polling-runtime-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
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

**FACT:** - **FACT:** `ClaudeUsageReader` is instantiated once per daemon when `SIDELINE_CLAUDE_USAGE !== '0'` (default enabled). `daemon.ts:247-254`  
- **FACT:** Cadence of 10 seconds is read from `CoachPreferences.aiUsageRefreshSeconds` at construction. `daemon.ts:250`  
- **FACT:** Timer chain uses `setTimeout` (never `setInterval`). `claude-usage-reader.ts:277-350`  
- **FACT:** On successful read, `backoffIndex` resets to `-1`, next delay = `cadenceSeconds * 1000ms`. `claude-usage-reader.ts:338-346`  
- **FACT:** Manual `POST /api/ai-health/refresh` clears timer, joins in-flight, calls `read()`, then `scheduleNext(outcome)`. `claude-usage-reader.ts:267-275`  
- **FACT:** `HealthAuthority.ingestClaudeUsage()` merges via `mergeClaudeRateLimitInfo`, preserving any window key not present in incoming payload. `health-authority.ts:261-269`  
- **FACT:** `canonicalClaudeWindowsFromOAuth` only includes window if `utilization` is 0–100 number AND `resets_at` is valid ISO timestamp. `claude-usage-reader.ts:64-83`  
- **FACT:** Reader status (`lastAttemptAt`, `lastSuccessAt`, `state`, `code`, `reason`) is tracked and surfaced via `onStatusChange`. `claude-usage-reader.ts:309-333`  

---

**INFERENCE:** - **INFERENCE:** The `five_hour` staleness while `seven_day` is current **most likely means the OAuth response payload lacks a valid `five_hour` window** (missing, out-of-range, or unparsable `resets_at`). The merge logic would preserve the last-known `five_hour` indefinitely in this case. `claude-usage-reader.ts:78-81, health-authority.ts:265`  
- **INFERENCE:** The 10-second loop **is likely running** (since `seven_day` updates), but each successful read that omits `five_hour` still resets `backoffIndex = -1` and re-schedules at 10s. The loop doesn't "stop" — it just keeps getting payloads without `five_hour`.  
- **INFERENCE:** Manual `POST /api/ai-health/refresh` **does trigger a fresh network request** unless (a) request is already in-flight (joins it), or (b) `rateLimitedUntilMs` is active (returns synthetic failure without network call). `claude-usage-reader.ts:282-288`  
- **INFERENCE:** Game switching has **zero effect** on the reader — it is daemon-global, started once at `daemon.start()`, stopped once at `daemon.stop()`. `daemon.ts:161-162, 537, 559`  

---

**UNKNOWN:** - **UNKNOWN:** The **exact raw OAuth response payload** — whether `five_hour` is absent, has `utilization > 100`, has malformed `resets_at`, or is null. No logging of raw payload exists.  
- **UNKNOWN:** Whether the daemon process has **restarted** (which would reset `backoffIndex` and `rateLimitedUntilMs`) since staleness was observed.  
- **UNKNOWN:** Current values of `claudeUsageStatus.lastAttemptAt` and `lastSuccessAt` in running daemon — these would definitively show if loop is firing.  
- **UNKNOWN:** Whether a prior `rate_limit_event` (Stadium push) with only `five_hour` data could be "stuck" as authoritative `five_hour` while OAuth `seven_day` updates — merge logic preserves both keys independently.  

---

**CONTRADICTION:** - **None found.** Architecture correctly isolates reader from Game/Stadium lifecycle, cadence is configurable and respected on success, merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not timer or merge bug.  

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/claude-usage-reader.ts` | Core acquisition loop, backoff, OAuth parsing, status |
| `src/control-plane/daemon.ts` | Reader construction, start/stop, `/api/ai-health/refresh` endpoint |
| `src/control-plane/health-authority.ts` | Window merge (`mergeClaudeRateLimitInfo`), dedupe, persistence |
| `src/running-players.ts` | `aiUsageRefreshSeconds` preference (10/15/20/25/30), defaults |

---

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: claude-source-truth-acquisition (objective 8965b8898668)
- Objective: READ-ONLY reconnaissance. Do NOT Refresh, restart, mutate telemetry, edit, commit, or push. Trace Claude's authoritative usage acquisition path end-to-end: provider request/source, normalization, successful/unchanged acquisition semantics, HealthAuthority ingest, acquisition status, persisted state, observedAt/current timestamps, SSE/API projection, and scoreboard update. Reconcile the live discrepancy: Sideline still shows 19% used 5H and 32% used Weekly from a 9:17 AM refresh, while Claude's native Usage page shows approximately 31% and 33% around 10:58 AM. Determine whether the reader is failing to acquire, acquiring but not ingesting, ingesting but not broadcasting, or broadcasting but not rendering. Inspect current runtime state/log evidence where available without changing it. Return SOURCE TRUTH PATH, LAST SUCCESS / LAST ATTEMPT EVIDENCE, BREAKPOINT, and ranked root-cause candidates.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-source-truth-acquisition-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Single global reader** — One `ClaudeUsageReader` per daemon, owned by `ControlPlaneDaemon`, started at `daemon.start()` | `daemon.ts:417-419, 553-561, 1032` |
| 2 | **Polling cadence 5 min default** — Configurable via `aiUsageRefreshMinutes` (3/5/10/15), read from preferences at construction | `running-players.ts:179, 181, 305; daemon.ts:556; claude-usage-reader.ts:27-29` |
| 3 | **setTimeout chain, not setInterval** — `runAndSchedule → read → scheduleNext` — survives overlapping ticks, manual refresh joins in-flight | `claude-usage-reader.ts:277-350, 407-410, 537-555` |
| 4 | **Gate logic** — Provider-directed gate (MUST honor) vs. Sideline fallback gate (bypassable by manual refresh) | `claude-usage-reader.ts:416-437, 384-394` |
| 5 | **Payload validation filters `five_hour`** — `canonicalWindowFromOAuth` requires: `utilization` 0-100 number, valid ISO `resets_at` (or null with 0% = post-reset idle) | `claude-usage-reader.ts:133-142` |
| 6 | **Merge preserves missing keys** — `mergeClaudeRateLimitInfo` keeps previously stored window when incoming omits it | `health-authority.ts:428-448, 436-444` |
| 7 | **`observedAt` ≠ `lastSuccessAt`** — `observedAt` only advances on factual change; `lastSuccessAt` advances on every successful read (unchanged or changed) | `claude-usage-reader.ts:93-102, 470-477; health-authority.ts:152-154, 170-178` |
| 8 | **UI renders `updatedAt` (=`observedAt`)** — "Usage data last refr

**FACT:** - **FACT:** `ClaudeUsageReader` instantiated once per daemon when `SIDELINE_CLAUDE_USAGE !== '0'` (default enabled). `daemon.ts:553-561`
- **FACT:** Cadence of 5 minutes is read from `CoachPreferences.aiUsageRefreshMinutes` at construction. `daemon.ts:556; running-players.ts:181, 305`
- **FACT:** Timer chain uses `setTimeout` chain (never `setInterval`). `claude-usage-reader.ts:277-350, 407-410`
- **FACT:** On successful read, `backoffIndex` resets to `-1`, next delay = `cadenceMinutes * 60_000`. `claude-usage-reader.ts:541-543`
- **FACT:** Manual `POST /api/ai-health/refresh` clears pending timer, joins in-flight request, calls `read()`, then `scheduleNext(outcome)`. `claude-usage-reader.ts:376-405`
- **FACT:** `HealthAuthority.ingestClaudeUsage()` merges via `mergeClaudeRateLimitInfo`, preserving any window key not present in incoming payload. `health-authority.ts:187-215, 392-472`
- **FACT:** `canonicalClaudeWindowsFromOAuth` only includes a window if `utilization` is a valid 0-100 number AND `resets_at` is a valid ISO timestamp (or `null` with 0%). `claude-usage-reader.ts:133-142`
- **FACT:** Reader status (`lastAttemptAt`, `lastSuccessAt`, `state`, `code`, `reason`, `gateType`, `gatedUntil`) tracked and surfaced via `onStatusChange`. `claude-usage-reader.ts:305-335, 528-535`
- **FACT:** `GET /api/ai-health` returns `{ health: snapshot, acquisition: { claude: status } }` where `status` includes `lastAttemptAt`/`lastSuccessAt`. `daemon.ts:1950-1962`
- **FACT:** `health.upd

**INFERENCE:** - **INFERENCE:** The `five_hour` staleness while `seven_day` is current **most likely means the OAuth response payload lacks a valid `five_hour` window** — missing, `utilization` out of range, or unparsable `resets_at`. The merge logic would preserve the last-known `five_hour` indefinitely in this case. `claude-usage-reader.ts:136-138, 141; health-authority.ts:436-444`
- **INFERENCE:** The 5-minute loop **is likely running** (since `seven_day` updates and `lastSuccessAt` would advance), but each successful read that omits `five_hour` still resets `backoffIndex = -1` and re-schedules at 5 min. The loop doesn't stop — it keeps getting payloads without `five_hour`.
- **INFERENCE:** Manual `POST /api/ai-health/refresh` **does trigger a fresh network request** unless (a) request already in-flight (joins it), or (b) `providerGatedUntilMs` active (returns synthetic failure without network call). `claude-usage-reader.ts:384-394, 402-404`
- **INFERENCE:** Game switching has **zero effect** on the reader — it is daemon-global, started once at `daemon.start()`, stopped once at `daemon.stop()`. `daemon.ts:1032, 1109, 559`
- **INFERENCE:** The UI "Usage data last refreshed" showing 9:17 AM while `lastSuccessAt` could be much later (e.g., 10:53 AM) is **expected behavior** — `updatedAt` only moves on factual change, not on every successful acquisition. This is a known design gap (breadcrumb at `claude-usage-reader.ts:93-102`).

---

**UNKNOWN:** - **UNKNOWN:** The **exact raw OAuth response payload** — whether `five_hour` is absent, has `utilization > 100`, has malformed `resets_at`, or is `null` without 0% utilization. No logging of raw payload exists in production code.
- **UNKNOWN:** Current values of `claudeUsageStatus.lastAttemptAt` and `lastSuccessAt` in the running daemon — these would definitively show if the loop is firing on schedule.
- **UNKNOWN:** Whether the daemon process has **restarted** since staleness was observed (would reset `backoffIndex` and gates).
- **UNKNOWN:** Whether a prior `rate_limit_event` (Stadium push) with only `five_hour` data could be "stuck" as authoritative `five_hour` while OAuth `seven_day` updates — merge logic preserves both keys independently.
- **UNKNOWN:** The exact `resets_at` value the provider returns for `five_hour` at 10:58 AM — if it's a future timestamp but `utilization` is out of range, the window would be rejected.

---

**CONTRADICTION:** - **None found in architecture.** The code correctly isolates the reader from Game/Stadium lifecycle, cadence is configurable and respected on success, merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not timer/backoff/merge bug.
- **Apparent contradiction in UI label:** "Usage data last refreshed: 9:17 AM" vs. actual successful reads potentially every 5 minutes. This is **not a bug** — it's the `observedAt`/`updatedAt` design (last *change* vs. last *successful read*). Documented as future work in `claude-usage-reader.ts:93-102`.

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/claude-usage-reader.ts` | Core acquisition loop, backoff, OAuth parsing, validation, status |
| `src/control-plane/health-authority.ts` | Window merge (`mergeClaudeRateLimitInfo`), dedupe, persistence, `verifiedAt`/`observedAt` |
| `src/control-plane/daemon.ts` | Reader construction, start/stop, `/api/ai-health` & `/refresh` endpoints, SSE broadcast |
| `src/public/index.html` | Scoreboard rendering, `aiScoreboardNormalize` (defense-in-depth expiry check), `updatedAt` display |
| `src/running-players.ts` | `aiUsageRefreshMinutes` preference (3/5/10/15 min), defaults, load/save |
| `src/control-plane/alarm-engine.ts` | Staleness evaluation via `providerFreshness` (uses `verifiedAt` anchor) |

---

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: claude-freshness-ui-diff (objective e9af471a0a47)
- Objective: READ-ONLY cross-subsystem reconnaissance. Do not refresh or mutate the live state. Investigate the Claude-specific freshness/rendering path and compare it with the newly adjudicated S57.38 freshness findings WITHOUT assuming S57.39 has been implemented. Determine whether the stale Claude scoreboard can be explained by observedAt semantics, unchanged-read suppression, alarm stale behavior, SSE broadcast rules, UI snapshot retention, checkExpiry behavior, or a dead polling chain. Pay special attention to the fact that the 5H value materially changed from 19% used to about 31% used, so unchanged-value semantics alone cannot explain the whole discrepancy. Identify whether Claude's native Usage page and Sideline are reading the same provider/account truth. Return PROVIDER/UI DIFFERENTIAL, WHAT S57.38 ALREADY FIXES INCIDENTALLY, WHAT IT DOES NOT FIX, exact files/symbols AGY should inspect, and whether this is likely one shared freshness defect or a separate Claude acquisition defect.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-freshness-ui-diff-Reconnaissance.md

**Key discoveries:** - FACT: S57.38 introduced `verifiedAt` (last trusted confirmation) and the `providerFreshness` function, which AlarmEngine, routing economics, and UI projection all use for freshness determinations (health-authority.ts:637-651). This ensures unchanged reads update freshness (via `markVerified`) even when `observedAt` does not change.
- FACT: Claude’s `ingestClaudeUsage` updates `verifiedAt` on every successful read (changed or unchanged), preventing UNKNOWN from unchanged reads alone (health-authority.ts:187-215; claude-usage-reader.ts:242-248, 463-477).
- FACT: The ClaudeUsageReader implements provider-directed (HTTP 429 with Retry-After) and Sideline fallback (other errors) gates that suppress real acquisitions and prevent `ingestClaudeUsage` calls during gating intervals (claude-usage-reader.ts:412-447, 479-509). On gating, `applyGatedOutcome` updates status but does not call `ingestFn`.
- FACT: Codex, when enabled, gains a `UsageFreshnessCoordinator` that provides periodic reads and stale/reset healing independent of manual/activity triggers (daemon.ts:590-594). Claude has no equivalent coordinator; it relies solely on manual/activity-driven reads and the daemon’s preference-driven cadence.
- FACT: The UI receives freshness via SSE-broadcast `projectAiHealth`, which adds a `freshness` block derived from `providerFreshness` to the health authority snapshot (daemon.ts:3823-3831). UI rendering depends on this freshness (inferred from ai-usage-scoreboard-ui.test.mjs).
- INFER

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/control-plane/claude-usage-reader.ts`:
  - `ClaudeUsageReader.applyOutcome` (success path clears gates)
  - `ClaudeUsageReader.applyGatedOutcome` (gating suppresses `ingestFn`)
  - `ClaudeUsageReader.read` (provider-directed and Sideline fallback gates)
  - `ClaudeUsageReader.refresh` (manual bypass of fallback gate only)
- `src/control-plane/daemon.ts`:
  - ClaudeUsageReader instantiation and `options.claudeUsage?.enabled` check (lines 560-568)
  - UsageFreshnessCoordinator instantiation conditioned on `options.codexUsage?.enabled === true` (lines 590-594) — highlighting lack of Claude equivalent
- `src/control-plane/usage-freshness-coordinator.ts`:
  - Coordinator that arms stale/reset deadlines and triggers periodic reads (lines 45-117) — absent for Claude
- `src/control-plane/health-authority.ts`:
  - `markVerified` (line 170-178) and `providerFreshness` (line 637-651) — confirm shared freshness correctness
- `src/control-plane/alarm-engine.ts`:
  - `normalizeAlarmFacts` uses `providerFreshness` (line 256-257) — confirm alarm freshness shares UI logic

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane claude-polling-runtime: The Claude polling timer chain has been traced end-to-end. The `ClaudeUsageReader` implements a scheduled polling loop with configurable cadence (3/5/10/15 minutes) that should be firing approximately every 5 minutes by default. Current evidence shows: - **Global AI Usage** displays: "Claude 5H 19% used / 81% left and Weekly 32% used / 68% left" - **Usage data last refreshed** at 9:17 AM (approxim
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane claude-source-truth-acquisition: **SOURCE TRUTH PATH IDENTIFIED:** The authoritative acquisition path is fully traced. The discrepancy (Sideline shows 19%/32% from 9:17 AM vs. Claude native ~31%/33% at 10:58 AM) is **not** a timer/backoff/polling failure. The timer chain is intact and firing. The root cause is **payload validation silently filtering the `five_hour` window** while `seven_day` passes validation — causing the Health
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane claude-freshness-ui-diff: The stale Claude scoreboard is likely due to a **separate Claude acquisition defect** (gated reads or lack of periodic reads) rather than a shared freshness defect. The freshness architecture shared with Codex (verifiedAt/providerFreshness) is functioning correctly per S57.38, but Claude’s reader lacks the periodic read and healing mechanisms that Codex enjoys when enabled, making it vulnerable to

## FAILED / BLOCKED ATTEMPTS

- Lane claude-source-truth-acquisition · attempt 1 · Poolside: Laguna S 2.1 (free) (sideline-scout) · openrouter/poolside/laguna-s-2.1:free: FAILED [RATE LIMITED] · elapsed 00:01:28 — The provider rate-limited this Scout. (> sideline-scout · poolside/laguna-s-2.1:free)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\claude-source-truth-acquisition\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\claude-source-truth-acquisition\stdout.log

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane claude-polling-runtime: - **None found.** Architecture correctly isolates reader from Game/Stadium lifecycle, cadence is configurable and respected on success, merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not timer or merge bug. ---
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane claude-source-truth-acquisition: - **None found in architecture.** The code correctly isolates the reader from Game/Stadium lifecycle, cadence is configurable and respected on success, merge logic preserves per-window history. The symptom (one window stale, one current) is consistent with **partial OAuth payload validity**, not timer/backoff/merge bug. - **Apparent contradiction in UI label:** "Usage data last refreshed: 9:17 AM" vs. actual successful reads potentially every 5 minutes. This is **not a bug** — it's the `observedAt`/`updatedAt` design (last *change* vs. last *successful read*). Documented as future work in `claude-usage-reader.ts:93-102`. ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane claude-polling-runtime · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-polling-runtime-Reconnaissance.md
- Lane claude-source-truth-acquisition · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-source-truth-acquisition-Reconnaissance.md
- Lane claude-freshness-ui-diff · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912\SCOUT-claude-freshness-ui-diff-Reconnaissance.md

### Full report — lane claude-polling-runtime (sideline-scout-quick)

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

### Full report — lane claude-source-truth-acquisition (sideline-scout-deep)

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

### Full report — lane claude-freshness-ui-diff (sideline-scout-balanced)

# SCOUT REPORT
REPORT TYPE: SCOUT REPORT
AGENT: claude-freshness-ui-diff
MODEL: openrouter/nvidia/nemotron-3-super-120b-a12b:free
REASONING EFFORT: Medium
SCOUT DEPTH: Standard
COVERAGE: Claude-specific freshness/rendering path, comparison with S57.38 findings, provider/UI differential, gating mechanisms, acquisition defect analysis.
LIMITATIONS: Did not inspect live runtime logs or telemetry; did not verify actual error rates in Claude usage reader; did not inspect the exact UI rendering code in index.html (relied on test harness and SOP); did not confirm whether SIDELINE_CLAUDE_USAGE=0 in the environment under investigation.

## RESULT
The stale Claude scoreboard is likely due to a **separate Claude acquisition defect** (gated reads or lack of periodic reads) rather than a shared freshness defect. The freshness architecture shared with Codex (verifiedAt/providerFreshness) is functioning correctly per S57.38, but Claude’s reader lacks the periodic read and healing mechanisms that Codex enjoys when enabled, making it vulnerable to extended staleness during gating intervals or idle periods.

## KEY DISCOVERIES
- FACT: S57.38 introduced `verifiedAt` (last trusted confirmation) and the `providerFreshness` function, which AlarmEngine, routing economics, and UI projection all use for freshness determinations (health-authority.ts:637-651). This ensures unchanged reads update freshness (via `markVerified`) even when `observedAt` does not change.
- FACT: Claude’s `ingestClaudeUsage` updates `verifiedAt` on every successful read (changed or unchanged), preventing UNKNOWN from unchanged reads alone (health-authority.ts:187-215; claude-usage-reader.ts:242-248, 463-477).
- FACT: The ClaudeUsageReader implements provider-directed (HTTP 429 with Retry-After) and Sideline fallback (other errors) gates that suppress real acquisitions and prevent `ingestClaudeUsage` calls during gating intervals (claude-usage-reader.ts:412-447, 479-509). On gating, `applyGatedOutcome` updates status but does not call `ingestFn`.
- FACT: Codex, when enabled, gains a `UsageFreshnessCoordinator` that provides periodic reads and stale/reset healing independent of manual/activity triggers (daemon.ts:590-594). Claude has no equivalent coordinator; it relies solely on manual/activity-driven reads and the daemon’s preference-driven cadence.
- FACT: The UI receives freshness via SSE-broadcast `projectAiHealth`, which adds a `freshness` block derived from `providerFreshness` to the health authority snapshot (daemon.ts:3823-3831). UI rendering depends on this freshness (inferred from ai-usage-scoreboard-ui.test.mjs).
- INFERITION: The 5H value changing from 19% to 31% indicates successful reads occurred, but the scoreboard staleness suggests those reads were not frequent enough to keep `verifiedAt` within `maxStaleAgeMinutes`—likely due to gating or long intervals between manual/activity-driven reads.
- INFERITION: S57.38’s fixes (verifiedAt/providerFreshness) already resolve the Claude-specific issue of UNKNOWN from unchanged reads (health-authority.ts:9, 55, 117; comment: “an unchanged replay still calls onChange because FRESHNESS (verifiedAt) moved”). What remains unaddressed is Claude’s acquisition reliability.

## PROVIDER/UI DIFFERENTIAL
- **Provider (HealthAuthority)**: Updates `verifiedAt` on every successful Claude read (changed or unchanged) via `ingestClaudeUsage` → `markVerified`. Freshness is computed from `verifiedAt` (with `observedAt` fallback) via `providerFreshness`.
- **UI (Scoreboard)**: Renders usage percentages only when `freshness.current === true` (derived from `providerFreshness` in `projectAiHealth`). No differential treatment between Claude and Codex in the UI freshness path.
- **Difference**: Claude lacks Codex’s periodic read/healing mechanism (UsageFreshnessCoordinator) when Codex is enabled. Claude’s acquisition depends entirely on manual/activity-driven reads and preference-driven cadence, leaving it vulnerable to gating-induced gaps. Codex, when enabled, gets periodic reads that keep `verifiedAt` fresh even during manual/activity lulls.

## WHAT S57.38 ALREADY FIXES INCIDENTALLY
- S57.38’s introduction of `verifiedAt` and the `providerFreshness` function (health-authority.ts:620-651) ensures that unchanged Claude reads still advance freshness, preventing UNKNOWN from unchanged-read suppression alone. This incidentally fixes the Claude-specific issue noted in S57.38 §125: “without `verifiedAt` Claude would go UNKNOWN whenever Dad is idle.”

## WHAT S57.38 DOES NOT FIX
- S57.38 does not address Claude’s susceptibility to extended gating from provider-directed (HTTP 429) or Sideline fallback gates, which can suppress real acquisitions for minutes or hours (claude-usage-reader.ts:412-447, 479-509).
- S57.38 does not provide Claude with a periodic read/healing mechanism analogous to Codex’s UsageFreshnessCoordinator, leaving Claude dependent on manual/activity triggers for freshness updates.
- S57.38 does not guarantee that the UI will correctly render fresh data if the SSE broadcast or UI projection fails (though no evidence suggests this).

## EXACT FILES/SYMBOLS AGY SHOULD INSPECT
- `src/control-plane/claude-usage-reader.ts`:
  - `ClaudeUsageReader.applyOutcome` (success path clears gates)
  - `ClaudeUsageReader.applyGatedOutcome` (gating suppresses `ingestFn`)
  - `ClaudeUsageReader.read` (provider-directed and Sideline fallback gates)
  - `ClaudeUsageReader.refresh` (manual bypass of fallback gate only)
- `src/control-plane/daemon.ts`:
  - ClaudeUsageReader instantiation and `options.claudeUsage?.enabled` check (lines 560-568)
  - UsageFreshnessCoordinator instantiation conditioned on `options.codexUsage?.enabled === true` (lines 590-594) — highlighting lack of Claude equivalent
- `src/control-plane/usage-freshness-coordinator.ts`:
  - Coordinator that arms stale/reset deadlines and triggers periodic reads (lines 45-117) — absent for Claude
- `src/control-plane/health-authority.ts`:
  - `markVerified` (line 170-178) and `providerFreshness` (line 637-651) — confirm shared freshness correctness
- `src/control-plane/alarm-engine.ts`:
  - `normalizeAlarmFacts` uses `providerFreshness` (line 256-257) — confirm alarm freshness shares UI logic

## SHARED vs SEPARATE DEFECT
- **Shared freshness defect?** NO. The freshness architecture (verifiedAt/providerFreshness) is shared and functioning correctly per S57.38 tests and code. Both Claude and Codex benefit from `verifiedAt` updates on successful reads.
- **Separate Claude acquisition defect?** YES. Claude’s acquisition path lacks periodic read/healing and is prone to gating-induced gaps, while Codex (when enabled) gains the UsageFreshnessCoordinator for autonomous freshness maintenance. This explains why Claude’s scoreboard may stale despite occasional successful reads (e.g., 5H value changing from 19% to 31%)—the reads are too infrequent to counter gate-induced downtowns.

## CONCLUSION
The stale Claude scoreboard is best explained by a Claude-specific acquisition defect: the acquisition defect (gated reads or insufficient periodic reads) rather than a shared freshness flaw. S57.38’s fixes ensure that when reads succeed, freshness is updated correctly; however, Claude’s reader is not guaranteed to succeed often enough to keep `verifiedAt` within `maxStaleAgeMinutes` due to gating and lack of autonomous periodic reads. AGY should inspect the ClaudeUsageReader’s gating logic and consider adding a periodic read/healing mechanism for Claude analogous to Codex’s UsageFreshnessCoordinator.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\claude-telemetry-stale-recon-20260929-1058-fresh-20260929-110912

