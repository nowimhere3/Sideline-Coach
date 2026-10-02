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
