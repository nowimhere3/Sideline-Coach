# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION PARTIAL · 2/3 lanes completed · 0 substitutions · elapsed 00:17:38

Play: codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337
Rerun of: codex-telemetry-stale-recon-20260929-0936 (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-29T15:43:37.103Z
Finished: 2026-09-29T16:01:15.941Z
TOTAL ELAPSED TIME: 00:17:38

Scouts requested: 3
Completed: 2
Failed: 1
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 1
Total receiver attempts: 3
Substitutions: 0
Outcome: PARTIAL

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| codex-source-truth | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T15:43:37.131Z | 2026-09-29T15:48:32.369Z | 00:04:55 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\SCOUT-codex-source-truth-Reconnaissance.md |
| codex-refresh-path | 1 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T15:43:37.287Z | 2026-09-29T16:01:15.932Z | 00:17:38 | FAILED | FAILED [unknown] | — | none |
| claude-vs-codex-live-diff | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-29T15:43:37.332Z | 2026-09-29T15:47:22.492Z | 00:03:45 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\SCOUT-claude-vs-codex-live-diff-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane codex-source-truth: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane codex-refresh-path: Poolside: Laguna S 2.1 (free) (sideline-scout) → FAILED
    - Poolside: Laguna S 2.1 (free) (sideline-scout) benched: FAILED — Ended without a completed report for a reason that cannot be identified from runtime evidence; not auto-replaced. (> sideline-scout · poolside/laguna-s-2.1:free)
- Lane claude-vs-codex-live-diff: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: codex-source-truth (objective cf9e23ce99be)
- Objective: READ-ONLY reconnaissance. Do not refresh, restart, clear caches, mutate telemetry, edit files, commit, or push. Current observed defect: Sideline AI Usage Global shows Codex 5-hour 96% remaining and Weekly 96% remaining, while Codex's own VS Code usage surface shows approximately 75% 5-hour and 93% Weekly. Sideline previously surfaced a Codex stale warning. Map the exact Codex usage telemetry source-of-truth path from provider acquisition through normalization, persistence/cache, freshness timestamps, Health/usage authority, API projection, and AI Usage Global rendering. Identify the exact symbols/files that determine when Codex data becomes stale and whether stale data is still allowed to render as current. Return SOURCE TRUTH, STALENESS SEMANTICS, EXACT SEAM, and likely failure hypotheses ranked by evidence. Do not propose implementation beyond the smallest seam description.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\SCOUT-codex-source-truth-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** 1. **UNKNOWN**: Exact UI rendering logic for AI Usage Global vs VS Code surface
2. **UNKNOWN**: Whether Health Authority's `pruneExpired` is called frequently enough  
3. **UNKNOWN**: Full scope of Codex activity detection limitations on Windows
4. **UNKNOWN**: How much stale data is actually present vs what's reported as current

---

**CONTRADICTION:** **CONTRADICTION**: Claude and Codex use fundamentally different approaches to freshness:

1. **Claude**: Uses "successful acquisition" flag to generate post-reset idle state (`{ utilization: 0, resetsAt: null }`)
2. **Codex**: Lacks equivalent "not started" state handling; preserves expired windows indefinitely
3. **Expected Consistency**: Both should have symmetric stale→UNKNOWN transition behavior

---

**Important files:** UNKNOWN

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: claude-vs-codex-live-diff (objective cb4c41bd364b)
- Objective: READ-ONLY cross-provider reconnaissance. Do not refresh or mutate runtime state. Compare the complete live-usage pipelines for Claude and Codex specifically to explain why Claude appears current while Codex can remain stale. Identify provider-specific readers, polling cadence, timestamps, reset-clock handling, caching, stale thresholds, retry/recovery behavior, health authority integration, and UI projection differences. Look for a regression or asymmetry that would permit Codex AI Usage Global to show 96%/96% while Codex's native VS Code surface shows roughly 75%/93%. Determine whether the correct invariant should be stale→automatic reacquisition, stale→UNKNOWN until reacquired, or another existing architecture already specifies this. Return PROVIDER DIFF, ROOT-CAUSE CANDIDATES, GOVERNING INVARIANTS, and exact files/symbols AGY should inspect next. No implementation and no architecture redesign.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\SCOUT-claude-vs-codex-live-diff-Reconnaissance.md

**Key discoveries:** - **ClaudeUsageReader** implements a periodic polling loop (setTimeout chain) with a configurable cadence (default 5 min, allowed values [3,5,10,15] min) and an activity‑driven early‑read path (`watchClaudeActivity`). It honors provider‑directed gates (Retry‑After) and an internal Sideline fallback gate, and tracks a `rate_limited` state.  
  - *Evidence*: `src/control-plane/claude-usage-reader.ts` lines 24‑26 (cadence rationale), line 27‑30 (cadence constants), lines 320‑355 (`start()` and scheduling), lines 340‑367 (`noteClaudeActivity`).  

- **CodexUsageReader** has **no periodic polling loop**; it only provides manual `refresh()` and activity‑driven reads via `watchCodexActivity` (size‑based scan of session rollout files). It lacks provider‑directed gate handling (no `rate_limited` state) and its status model only includes `idle`, `ok`, `unavailable`.  
  - *Evidence*: `src/control-plane/codex-usage-reader.ts` lines 1‑6 (comment stating “provides manual Refresh … without … background polling loop”), lines 176‑179 (activity constants), lines 196‑237 (`watchCodexActivity`), lines 285‑301 (`noteCodexActivity`), absence of any `setInterval`/`setTimeout`‑based polling logic.  

- Both readers feed the **HealthAuthority** (`ingestClaudeUsage` for Claude, `ingest` for Codex) which updates `observedAt` and `rateLimitInfo`. The `/api/ai‑health` endpoint returns the acquisition status for each provider, showing that Claude can report `rate_limited` while Codex cannot.  
  - *Evide

**FACT:** - ClaudeUsageReader contains a scheduled polling loop (`setTimeout` chain) that runs at least every 3 minutes (configurable).  
- CodexUsageReader contains no scheduled polling loop; it only reads on manual `refresh()` or when `watchCodexActivity` detects file‑size growth.

**INFERENCE:** - The observed staleness of Codex usage (global AI Usage showing 96 %/96 % while the VS Code surface shows lower percentages) is most likely caused by missing background polling for Codex, allowing its usage data to age when there is no recent Codex activity to trigger the watcher.  
- The VS Code surface may be reflecting usage from a more transient source (e.g., a live Player terminal or a per‑Game read) that updates more frequently, whereas the Global AI Usage reflects the slower‑to‑update HealthAuthority state.

**UNKNOWN:** - Whether the `watchCodexActivity` size‑scanner is failing in practice on Windows (due to anti‑virus, file‑system latency, or timezone‑directory mismatches) cannot be confirmed without runtime observation.  
- The exact UI path that yields the “Codex native VS Code surface” percentages (75 %/93 %) is not visible in the current source tree; it may reside in a webview or extension UI not included in the provided files.

**CONTRADICTION:** - No direct contradiction was found; the code consistently shows Claude with polling and Codex without.

**Important files:** - `src/control-plane/claude-usage-reader.ts` – Claude periodic polling and activity‑driven read logic.  
- `src/control-plane/codex-usage-reader.ts` – Codex manual‑refresh‑only design and activity watcher.  
- `src/control-plane/daemon.ts` – `/api/ai‑health` endpoint that surfaces acquisition status for both providers.  
- `src/control-plane/health-authority.ts` – Ingestion functions that store usage windows and `observedAt`.

## COMBINED FORMATION FINDINGS

2 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane codex-source-truth: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane claude-vs-codex-live-diff: The live‑usage pipelines for Claude and Codex are asymmetric: Claude runs a background polling loop (with activity‑driven early reads) that keeps its usage fresh even when Claude is used outside Sideline, whereas Codex has no background polling and relies solely on manual refresh or activity‑driven reads. This asymmetry explains why Claude appears current while Codex can become stale, producing th

## FAILED / BLOCKED ATTEMPTS

- Lane codex-refresh-path · attempt 1 · Poolside: Laguna S 2.1 (free) (sideline-scout) · openrouter/poolside/laguna-s-2.1:free: FAILED [FAILED] · elapsed 00:17:38 — Ended without a completed report for a reason that cannot be identified from runtime evidence; not auto-replaced. (> sideline-scout · poolside/laguna-s-2.1:free)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\codex-refresh-path\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\codex-refresh-path\stdout.log

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane codex-source-truth: **CONTRADICTION**: Claude and Codex use fundamentally different approaches to freshness: 1. **Claude**: Uses "successful acquisition" flag to generate post-reset idle state (`{ utilization: 0, resetsAt: null }`) 2. **Codex**: Lacks equivalent "not started" state handling; preserves expired windows indefinitely 3. **Expected Consistency**: Both should have symmetric stale→UNKNOWN transition behavior ---
- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane claude-vs-codex-live-diff: - No direct contradiction was found; the code consistently shows Claude with polling and Codex without.

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

These lanes returned no completed report. Absence is not success, and nothing in this report speaks for them:

- codex-refresh-path: FAILED. Objective: READ-ONLY reconnaissance. Preserve the current stale Codex runtime state. Do NOT click/invoke Refresh, restart the daemon, clear state, edit files, commit, or push. Trace every Codex usage refresh/reacquisition path: UI Refresh control, timers/pollers, provider readers, stale detection, health/clock logic, retries, startup acquisition, and any automatic refresh behavior. Determine what is supposed to happen when Codex telemetry is stale, what actually triggers a new authoritative read, whether stale detection currently triggers reacquisition, and whether a failed/expired read can remain indefinitely. Pay special attention to prior fixes or tests around live Codex usage. Return EXECUTION PATH, STALE→REFRESH BEHAVIOR, MISSING OR BROKEN TRIGGER, TEST COVERAGE, and the smallest plausible repair seam. No implementation.

## CHILD REPORTS

- Lane codex-source-truth · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\SCOUT-codex-source-truth-Reconnaissance.md
- Lane claude-vs-codex-live-diff · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337\SCOUT-claude-vs-codex-live-diff-Reconnaissance.md

### Full report — lane codex-source-truth (sideline-scout-quick)

# SIDELINE COACH — SCOUT REPORT
## SCOUT PLAY: codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337
## SCOUT ID: codex-source-truth
## AGENT: sideline-scout-quick  
## MODEL: openrouter/cohere/north-mini-code:free
## REPORT TYPE: SCOUT REPORT
## AGENT: sideline-scout-quick
## MODEL: openrouter/cohere/north-mini-code:free
## REASONING EFFORT: Standard
## SCOUT DEPTH: STANDARD
## COVERAGE: Exact-instance live execution identity + source-of-truth mapping + stale semantics analysis
## LIMITATIONS: Read-only reconnaissance; did not test live runtime behavior; examined source code only

---

## EXECUTIVE MAP

This Scout has mapped the complete Codex usage telemetry source-of-truth pipeline to identify why Sideline AI Usage Global shows 96%/96% remaining while Codex's native VS Code surface shows 75%/93%, indicating stale data is rendering as current.

---

## QUESTIONS INVESTIGATED

1. **What is the exact Codex usage telemetry source-of-truth path?**
2. **What symbols/files determine when Codex data becomes stale?**
3. **Is stale data allowed to render as current?**
4. **What are the failure hypotheses ranked by evidence?**
5. **What are the exact seams for repair?**

---

## FACT - SOURCE TRUTH PATH

**CODES USAGE TELEMETRY FLOW:**

1. **Provider Acquisition**: `src/control-plane/codex-usage-reader.ts` → reads via `account/rateLimits/read` RPC to Codex's app-server protocol
2. **Activity Detection**: Uses rollout file size monitoring (`watchCodexActivity`) to detect Codex work without polling
3. **Ingestion**: `HealthAuthority.ingest()` stores in `~/.sideline/ai-health-state.json` 
4. **Stale Detection**: `HealthAuthority.pruneExpired()` removes expired windows, `AlarmEngine` flags stale telemetry
5. **UI Rendering**: `/api/ai-health` endpoint reads from health authority, AI usage scoreboard renders remaining percentages

**EXACT SOURCE-OF-TRUTH FILE**: `src/control-plane/health-authority.ts`

**ENTRYPOINT**: `HealthAuthority.ingestClaudeUsage()` (line 164) vs `HealthAuthority.ingest()` (line 122) for Codex

---

## FACT - ARCHITECTURE SEAMS

**SEAM 1: Codex Merge Logic vs Claude Merge Logic**
- File: `src/control-plane/health-authority.ts` lines 450-509 (`mergeCodexRateLimitInfo`)
- Claude: Sophisticated window validation, reset cycle detection, explicit stale replay rejection
- Codex: Simple merge preserving previously known windows even when expired

**SEAM 2: Activity Detection Limitations**
- File: `src/control-plane/codex-usage-reader.ts` lines 169-237 (`watchCodexActivity`)
- Windows limitation: fs.watch reports NOTHING for appends through held-open handles
- Field-probed: 6 appends, 0 events; relies on local `stat().size` check only

**SEAM 3: Stale Data Rendering**
- File: `src/control-plane/alarm-engine.ts` lines 257-277 (`evaluateTelemetry`)
- UI may render cached data without validation when HealthAuthority shows non-stale but expired windows

**SEAM 4: Health Authority Pruning**
- File: `src/control-plane/health-authority.ts` lines 190-219 (`pruneExpired`)
- Calls `pruneCodexRateLimitInfo()` which deletes expired windows but preserves others indefinitely

---

## INFERENCE - STALENESS SEMANTICS

**FACTUALLY OBSERVED BEHAVIOR:**
1. **Codex usage reader** uses activity detection via rollout file size monitoring
2. **Claude usage reader** uses periodic polling (3/5/10/15 minute cadence) plus activity detection
3. **Health Authority merge** differs significantly between Claude and Codex

**INFERRED STALENESS SEMANTICS:**

1. **PRIMARY INFERENCE**: Codex data becomes stale when:
   - Windows have expired (`resetsAt <= nowUnixSeconds`) but merge logic preserves them
   - Activity detection fails to trigger reads due to Windows fs.watch limitations
   - Health Authority `pruneExpired()` fails to clean up sufficiently

2. **SECONDARY INFERENCE**: Stale data CAN render as current because:
   - Health Authority stores raw percentages without validation of freshness
   - UI rendering checks `providerState.observedAt` but may accept "not stale" data
   - Alarm engine can flag stale data but UI may still display it

3. **TERTIARY INFERENCE**: The discrepancy between AI Usage Global (96%/96%) and VS Code surface (75%/93%) indicates:
   - AI Usage Global reads from Health Authority (possibly stale but not flagged)
   - VS Code surface reads from direct provider (current but different scope)

---

## UNKNOWN - CRITICAL GAPS

1. **UNKNOWN**: Exact UI rendering logic for AI Usage Global vs VS Code surface
2. **UNKNOWN**: Whether Health Authority's `pruneExpired` is called frequently enough  
3. **UNKNOWN**: Full scope of Codex activity detection limitations on Windows
4. **UNKNOWN**: How much stale data is actually present vs what's reported as current

---

## CONTRADICTION - ARCHITECTURE INCONSISTENCY

**CONTRADICTION**: Claude and Codex use fundamentally different approaches to freshness:

1. **Claude**: Uses "successful acquisition" flag to generate post-reset idle state (`{ utilization: 0, resetsAt: null }`)
2. **Codex**: Lacks equivalent "not started" state handling; preserves expired windows indefinitely
3. **Expected Consistency**: Both should have symmetric stale→UNKNOWN transition behavior

---

## IMPORTANT FILES / PATHS

**PRIMARY SEAMS TO INSPECT:**

1. `src/control-plane/health-authority.ts`
   - Lines 450-509: `mergeCodexRateLimitInfo()` (primary issue)
   - Lines 190-219: `pruneExpired()` (secondary issue)
   - Lines 539-591: `resolveCodexWindows()` (data resolution logic)

2. `src/control-plane/codex-usage-reader.ts` 
   - Lines 169-237: `watchCodexActivity()` (activity detection)
   - Lines 175-166: `readCodexUsageOnce()` (authoritative reads)

3. `src/control-plane/alarm-engine.ts`
   - Lines 257-320: `evaluateTelemetry()` (stale detection)
   - Lines 365: Stale alarm message formatting

4. `src/control-plane/codex-app-server.ts`
   - Lines 749-758: `readRateLimits()` (Codex rate limits extraction)

5. `src/commercial/meters.ts`
   - Usage accounting and state management

**EVIDENCE FILES:**
- `test/codex-usage-activity.test.mjs` (field-proven behavior)
- `test/ai-usage-alarm-engine.test.mjs` (stale detection logic)
- `src/control-plane/codex-usage-reader.ts:172` (Windows fs.watch limitation comment)

---

## ROOT-CAUSE CANDIDATES (RANKED BY EVIDENCE)

**RANK 1: Codex Merge Logic Lacks Claude's Robust Stale Detection**
- **EVIDENCE**: Claude merge has explicit stale replay detection, Codex merge preserves expired windows within reset cycle tolerance
- **LOCATION**: `src/control-plane/health-authority.ts:477-485`
- **IMPACT**: Allows expired windows to render as current
- **PROBABILITY**: High (direct code difference)

**RANK 2: Activity Detection Limitations on Windows**
- **EVIDENCE**: Field-probed 6 appends, 0 events; relies on stat().size check only  
- **LOCATION**: `src/control-plane/codex-usage-reader.ts:169-172`
- **IMPACT**: Missed Codex activity → no authoritative reads → stale data persists
- **PROBABILITY**: Medium-High (documented limitation)

**RANK 3: Health Authority Pruning Insufficient**
- **EVIDENCE**: `pruneCodexRateLimitInfo` deletes only explicitly expired windows, not "stale" ones
- **LOCATION**: `src/control-plane/health-authority.ts:512-526`
- **IMPACT**: Stale data accumulates beyond expiration
- **PROBABILITY**: Medium (depends on pruning frequency)

**RANK 4: UI Rendering Without Validation**
- **EVIDENCE**: UI may render cached data without checking freshness timestamps
- **LOCATION**: Control-plane API layer (not fully mapped)
- **IMPACT**: Even fresh health authority can show stale percentages
- **PROBABILITY**: Medium (architectural uncertainty)

---

## ARCHITECT DECISION REQUIRED

**DECISION 1: Codex vs Claude Symmetrization**
- Should Codex adopt Claude's post-reset idle state handling?
- Should both providers have consistent "not started" state representation?

**DECISION 2: Stale Data Rendering Policy** 
- Should stale data be blocked from rendering until fresh data arrives?
- Should UI show stale warnings alongside data?

**DECISION 3: Activity Detection Fallback**
- Should Codex add polling as backup to activity detection on Windows?
- Should multiple detection methods be used for robustness?

---

## RECOMMENDED NEXT MOVE

**IMMEDIATE**: Inspect `src/control-plane/health-authority.ts:450-509` (`mergeCodexRateLimitInfo`)
- Compare with `mergeClaudeRateLimitInfo()` (lines 365-445)
- Identify the specific merge logic that allows stale preservation
- Document the exact conditions under which expired windows are kept

**FOLLOW-UP**: Examine `test/codex-usage-activity.test.mjs:108-183`
- Understand the field failure scenario that exposed this issue
- Extract the precise sequence that allowed external Codex work to converge

---

## LIMITATIONS

This Scout was limited to **read-only source code examination**. Cannot verify:
- Live runtime behavior of activity detection on current Windows system
- Actual frequency of Health Authority pruning operations
- UI rendering validation logic for AI Usage Global vs VS Code surface
- Real-world Codex write patterns and their detection

**The Scouts buy information cheaply so Architects can spend intelligence on decisions.**

---

**SCOUT COMPLETED** - Reconnaissance focused on bounded objective of mapping Codex telemetry source-of-truth and staleness semantics.

### Full report — lane claude-vs-codex-live-diff (sideline-scout-balanced)

**RESULT**  
The live‑usage pipelines for Claude and Codex are asymmetric: Claude runs a background polling loop (with activity‑driven early reads) that keeps its usage fresh even when Claude is used outside Sideline, whereas Codex has no background polling and relies solely on manual refresh or activity‑driven reads. This asymmetry explains why Claude appears current while Codex can become stale, producing the observed discrepancy where the global AI Usage (reflecting the last successful Codex read) shows high usage (≈96 %) while the VS Code surface (which may be driven by a more immediate source or a different code path) shows lower usage (≈75 %/93 %).  

**KEY DISCOVERIES**  

- **ClaudeUsageReader** implements a periodic polling loop (setTimeout chain) with a configurable cadence (default 5 min, allowed values [3,5,10,15] min) and an activity‑driven early‑read path (`watchClaudeActivity`). It honors provider‑directed gates (Retry‑After) and an internal Sideline fallback gate, and tracks a `rate_limited` state.  
  - *Evidence*: `src/control-plane/claude-usage-reader.ts` lines 24‑26 (cadence rationale), line 27‑30 (cadence constants), lines 320‑355 (`start()` and scheduling), lines 340‑367 (`noteClaudeActivity`).  

- **CodexUsageReader** has **no periodic polling loop**; it only provides manual `refresh()` and activity‑driven reads via `watchCodexActivity` (size‑based scan of session rollout files). It lacks provider‑directed gate handling (no `rate_limited` state) and its status model only includes `idle`, `ok`, `unavailable`.  
  - *Evidence*: `src/control-plane/codex-usage-reader.ts` lines 1‑6 (comment stating “provides manual Refresh … without … background polling loop”), lines 176‑179 (activity constants), lines 196‑237 (`watchCodexActivity`), lines 285‑301 (`noteCodexActivity`), absence of any `setInterval`/`setTimeout`‑based polling logic.  

- Both readers feed the **HealthAuthority** (`ingestClaudeUsage` for Claude, `ingest` for Codex) which updates `observedAt` and `rateLimitInfo`. The `/api/ai‑health` endpoint returns the acquisition status for each provider, showing that Claude can report `rate_limited` while Codex cannot.  
  - *Evidence*: `src/control-plane/daemon.ts` lines 1928‑1938 (GET `/api/ai‑health` returns `acquisition.claude` and `acquisition.codex`).  

- The UI (e.g., status bar, AI Usage Global) ultimately derives usage percentages from the HealthAuthority snapshot (via the `/api/ai‑health` endpoint). If Codex is not refreshed, its windows become stale, causing the displayed percentages to lag.  

**FACT**  
- ClaudeUsageReader contains a scheduled polling loop (`setTimeout` chain) that runs at least every 3 minutes (configurable).  
- CodexUsageReader contains no scheduled polling loop; it only reads on manual `refresh()` or when `watchCodexActivity` detects file‑size growth.  

**INFERENCE**  
- The observed staleness of Codex usage (global AI Usage showing 96 %/96 % while the VS Code surface shows lower percentages) is most likely caused by missing background polling for Codex, allowing its usage data to age when there is no recent Codex activity to trigger the watcher.  
- The VS Code surface may be reflecting usage from a more transient source (e.g., a live Player terminal or a per‑Game read) that updates more frequently, whereas the Global AI Usage reflects the slower‑to‑update HealthAuthority state.  

**UNKNOWN**  
- Whether the `watchCodexActivity` size‑scanner is failing in practice on Windows (due to anti‑virus, file‑system latency, or timezone‑directory mismatches) cannot be confirmed without runtime observation.  
- The exact UI path that yields the “Codex native VS Code surface” percentages (75 %/93 %) is not visible in the current source tree; it may reside in a webview or extension UI not included in the provided files.  

**CONTRADICTION**  
- No direct contradiction was found; the code consistently shows Claude with polling and Codex without.  

**IMPORTANT FILES / PATHS**  
- `src/control-plane/claude-usage-reader.ts` – Claude periodic polling and activity‑driven read logic.  
- `src/control-plane/codex-usage-reader.ts` – Codex manual‑refresh‑only design and activity watcher.  
- `src/control-plane/daemon.ts` – `/api/ai‑health` endpoint that surfaces acquisition status for both providers.  
- `src/control-plane/health-authority.ts` – Ingestion functions that store usage windows and `observedAt`.  

**GOVERNING INVARIANTS (as specified by current architecture)**  
- **Claude**: usage should be kept current via automatic periodic reacquisition (polling) supplemented by activity‑driven early reads (stale→automatic reacquisition).  
- **Codex**: usage should be updated only on manual refresh or when activity is detected (stale→manual refresh or activity‑driven read); the architecture explicitly states there is **no background polling loop**.  

Thus, the existing architecture already specifies different invariants per provider; to eliminate the staleness discrepancy one would either ensure the Codex activity watcher is reliable (or replace it with a polling loop) or accept that Codex usage will remain stale until the next manual refresh or activity trigger.  

---  
*Scout ID: claude-vs-codex-live-diff*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  
*This is reconnaissance, not final architectural authority.*

## Recommended next step

Review the surviving Scout reports above; decide whether the unfilled lanes justify a new Scout Play before forwarding to an Architect.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\codex-telemetry-stale-recon-20260929-0936-fresh-20260929-094337

