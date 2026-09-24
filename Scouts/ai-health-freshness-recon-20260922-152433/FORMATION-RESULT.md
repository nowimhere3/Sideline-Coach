# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:06:19

Play: ai-health-freshness-recon-20260922-152433
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-22T21:24:57.718Z
Finished: 2026-09-22T21:31:17.062Z
TOTAL ELAPSED TIME: 00:06:19

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
| manual-refresh-path | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T21:24:57.744Z | 2026-09-22T21:27:44.514Z | 00:02:46 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-manual-refresh-path-Reconnaissance.md |
| claude-stale-freshness | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T21:24:58.117Z | 2026-09-22T21:26:29.150Z | 00:01:31 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-claude-stale-freshness-Reconnaissance.md |
| codex-restart-vs-refresh | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T21:24:58.129Z | 2026-09-22T21:31:17.057Z | 00:06:18 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-codex-restart-vs-refresh-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane manual-refresh-path: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane claude-stale-freshness: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane codex-restart-vs-refresh: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: manual-refresh-path (objective 5aad86e7af39)
- Objective: INVESTIGATE ONLY: Sideline Coach AI Usage manual Refresh end-to-end behavior.

FIELD FACT:
Pressing the AI Usage Refresh control appeared to do nothing / did not bring provider facts current.
Later, restarting or refreshing the Sideline Coach Development Host caused Codex usage to update immediately.

Map the exact current manual Refresh path from browser UI to factual provider state.

TRACE:

1. Refresh button event handler.
2. API request/endpoint it calls.
3. Daemon/control-plane handler.
4. Which provider readers are actually invoked.
5. Whether Claude and Codex are both refreshed, only one is refreshed, or neither performs a real provider acquisition.
6. Whether an active rate-limit gate/backoff can make Refresh return without network acquisition.
7. Whether Refresh merely republishes cached HealthAuthority state.
8. Whether a successful acquisition that returns unchanged data avoids updating observedAt.
9. Whether SSE/broadcast/render refresh follows the acquisition.
10. What success/failure feedback the UI receives.
11. Whether the UI can say/appear refreshed while factual provider data remains unchanged.
12. Exact difference between "Refresh AI Usage" and browser page reload / Development Host restart.

RETURN:
CURRENT BEHAVIOR
exact call chain
FACT / INFERENCE / UNKNOWN / CONTRADICTION
IMPORTANT FILES / FUNCTIONS
root-cause candidates ranked by source evidence
smallest likely repair seam
focused test contract

Do not implement.
Do not modify files.
Do not investigate visual Scoreboard layout.
Do not redesign polling policy.
Stop when the manual-refresh path is fully mapped.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-manual-refresh-path-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** The AI Usage Refresh button exists in the browser UI (`aiScoreboardRefreshBtn`) and is wired to call the `/api/ai-health/refresh` POST endpoint.

**INFERENCE:** The refresh button appears to be a "no-op" that doesn't trigger provider state updates due to the Claude usage reader being inactive or the endpoint returning no changes.

**UNKNOWN:** The exact reason provider facts remain unchanged after manual refresh.

**CONTRADICTION:** UNKNOWN

**Important files:** 1. **Frontend UI (`src/public/index.html`)**:
   - `aiScoreboardRefreshBtn` button at lines 5230-5233
   - `aiScoreboardRefreshHealth` function at lines 5406-5430
   - API call: `await api('/api/ai-health/refresh', { method: 'POST' })`

2. **Backend API (`src/control-plane/daemon.ts`)**:
   - `/api/ai-health/refresh` endpoint at lines 1069-1091
   - Calls `this.claudeUsageReader.refresh()`

3. **Claude Usage Reader (`src/control-plane/claude-usage-reader.ts`)**:
   - `refresh()` method at lines 284-292
   - Joins in-flight requests, skips backoff timers
   - `read()` method at lines 299-324
   - Handles rate limiting and credential checks

4. **Health Authority (`src/control-plane/health-authority.ts`)**:
   - `ingestClaudeUsage()` method at lines 163-187
   - `ingest()` method for evidence ingestion

5. **Control Plane Daemon (`src/control-plane/daemon.ts`)**:
   - Health authority and Claude usage reader instantiation
   - `/api/ai-health` GET endpoint at lines 1057-1064

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: claude-stale-freshness (objective 2ef55b2fa2e3)
- Objective: INVESTIGATE ONLY: Claude AI Health factual freshness / stale-data path in Sideline Coach.

FIELD FACT:
Claude official Usage and a separate AI Usage realtime browser reader show fresher Claude usage than Sideline Coach.
Observed field difference has been material, approximately 10 percentage points.
Sideline Coach can remain stale even after pressing its Refresh control.

Do NOT assume polling itself is broken. The existing design includes OAuth usage reconciliation, native push, HealthAuthority, backoff/rate-limit gates, observedAt, lastSuccessAt, and SSE.

TRACE THE COMPLETE CLAUDE PATH:

1. Claude OAuth usage reader.
2. Credential/config source.
3. read() and refresh() behavior.
4. rateLimitedUntil / Retry-After / fallback backoff gate.
5. scheduler cadence.
6. manual refresh interaction with an active gate.
7. parsing of five_hour and seven_day.
8. canonicalization/utilization conversion.
9. HealthAuthority ingest/merge/dedupe.
10. expired/missing-window behavior.
11. source precedence between OAuth facts and native rate_limit_event push.
12. observedAt vs acquisition lastSuccessAt.
13. SSE publication and browser render.
14. any stale-preservation path that could leave an older percentage visible after fresher provider truth exists.

Answer specifically:

* How can another reader reach fresher Claude usage while Sideline remains behind?
* Can our current 429/backoff policy intentionally leave us stale for 5/10/20/40/60 minutes?
* Can manual Refresh be blocked by that gate?
* Can a native push overwrite or preserve an older same-cycle value?
* Can successful unchanged reads hide acquisition freshness from the UI?
* Is there any known source-precedence or monotonicity weakness remaining?

RETURN:
CURRENT BEHAVIOR
FACT / INFERENCE / UNKNOWN / CONTRADICTION
exact IMPORTANT FILES / FUNCTIONS
most likely stale mechanism(s), ranked
what runtime evidence would conclusively distinguish them
smallest repair seam if source already proves one
focused test contract

Do not implement.
Do not modify files.
Do not touch Scoreboard visual layout.
Stop when the Claude freshness seam is mapped.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-claude-stale-freshness-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **ClaudeUsageReader** backs off on HTTP 429 with exponential steps [5,10,20,40,60] minutes and honours a `Retry‑After` header. | `src/control-plane/claude-usage-reader.ts`: lines 34‑36 (BACKOFF_MS), lines 301‑304 (gate short‑circuit), lines 368‑380 (scheduleNext backoff & gate logic). |
| 2 | **Gate blocks manual refresh** – `refresh()` clears any timer but `read()` short‑circuits when `rateLimitedUntilMs` is active, returning a faux `rate_limited` outcome; `scheduleNext` then re‑arms the gate for the remaining time. | `src/control-plane/claude-usage-reader.ts`: lines 284‑292 (refresh), lines 301‑304 (gate short‑circuit), lines 360‑366 (stillGated branch). |
| 3 | **HealthAuthority.observedAt updates only on factual change** – `ingestClaudeUsage` returns `false` when the incoming windows are structurally identical to the stored windows, leaving `observedAt` untouched. | `src/control-plane/health-authority.ts`: lines 162‑186 (ingestClaudeUsage), lines 142‑145 (unchanged early‑return), lines 146‑151 (observedAt set only on change). |
| 4 | **Acquisition freshness (`lastSuccessAt`) advances on every successful read**, even when windows are unchanged. | `src/control-plane/claude-usage-reader.ts`: lines 334‑335 (lastSuccessAt set on ok). |
| 5 | **Push evidence (native `rate_limit_event`) is merged with OAuth usage via the same monotonicity‑aware `mergeClaudeRateLimitInfo`**; older resetsAt are rejected as stale repla

**FACT:** * The Claude usage reader implements a back‑off gate that, once triggered by HTTP 429, prevents any further reads (scheduled or manual) until the gate elapses.  
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

**INFERENCE:** * The observed ~10‑point freshness gap between external readers and Sideline Coach is most likely caused by an active back‑off gate (HTTP 429) that blocks Sideline’s OAuth usage reader while external polls succeed.  
* Pressing the Refresh control during a gate yields a silent no‑op (faux rate‑limited) and does **not** clear the gate, leaving the UI showing stale `observedAt`.  
* The UI’s reliance on `observedAt` (health timestamp) rather than `lastSuccessAt` (acquisition timestamp) can make successful but unchanged reads invisible to the user, contributing to the perception of staleness.  
* No evidence indicates that the merge logic permits older data to overwrite newer data; monotonicity checks appear sound.  

---

**UNKNOWN:** * Whether the production daemon is currently running with `claudeUsage.enabled = true` and what its `initialCadenceMinutes` setting is (environment‑dependent).  
* The exact frequency of HTTP 429 responses from the Anthropic OAuth endpoint in the field (though the back‑off table suggests they occur).  
* Whether any Stadium‑side push (`rate_limit_event`) is being dropped or delayed due to connectivity issues, which could compound staleness when the OAuth reader is gated.  

---

**CONTRADICTION:** * No direct contradiction found in the source. The design explicitly separates acquisition freshness (`lastSuccessAt`) from factual freshness (`observedAt`) and documents this distinction (see comment lines 51‑62 in `claude-usage-reader.ts`).  

---

**Important files:** | File | Purpose |
|------|---------|
| `src/control-plane/claude-usage-reader.ts` | Implements OAuth usage reader, back‑off gate, manual refresh, and acquisition timestamps. |
| `src/control-plane/health-authority.ts` | Merges push and OAuth evidence, updates `observedAt` only on factual change, exposes `HealthAuthoritySnapshot`. |
| `src/control-plane/daemon.ts` | Instantiates and starts the ClaudeUsageReader, wires its `ingest` to HealthAuthority, broadcasts health and acquisition status over SSE and `/api/ai-health`. |
| `src/control-plane/protocol.ts` (referenced) | Defines `CanonicalClaudeWindow` and evidence shapes (not quoted but implied). |

---

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: codex-restart-vs-refresh (objective eeb7a7eb9306)
- Objective: INVESTIGATE ONLY: Codex AI Health refresh-vs-Development-Host-restart behavior.

FIELD FACT:
While Codex was actively consuming quota, pressing Sideline Coach AI Usage Refresh appeared not to update Codex.
Refreshing/restarting the Sideline Coach Development Host caused the Codex percentage to update immediately.

Map WHY those two actions differ.

TRACE:

1. Current Codex health acquisition source(s).
2. account/rateLimits/read path.
3. account/rateLimits/updated/native push path.
4. when the Codex player/session subscribes or re-subscribes.
5. what happens during Development Host startup/reload.
6. whether startup performs an immediate account/rateLimits/read.
7. whether AI Usage manual Refresh invokes any Codex acquisition at all.
8. whether Refresh only targets Claude OAuth reconciliation.
9. whether Codex facts update only through active-player native events or startup/session registration.
10. whether stale Codex state can persist when no new native event is received.
11. how HealthAuthority merges/dedupes Codex facts.
12. SSE/UI publication after Codex updates.

Answer specifically:

* Why would Development Host reload instantly expose fresh Codex usage?
* Why could the Refresh button fail to do the same?
* Is this intentional architecture or a missing manual-refresh seam?
* What is the smallest correct repair if manual Refresh is expected to refresh both providers?

RETURN:
CURRENT BEHAVIOR
exact startup path vs manual-refresh path
FACT / INFERENCE / UNKNOWN / CONTRADICTION
IMPORTANT FILES / FUNCTIONS
root cause
smallest repair seam
focused test contract

Do not implement.
Do not modify files.
Do not investigate visual Scoreboard layout.
Stop when the Codex restart-vs-refresh seam is mapped.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-codex-restart-vs-refresh-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** | Claim                                                                 | Label         | Evidence                                                                                                                                 |
|-----------------------------------------------------------------------|---------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Codex health updates via `account/rateLimits/read` at session start   | FACT          | `codex-app-server.ts`: `readRateLimits()` called in `open()` and `restore()` paths, sends health frame (lines 351, 453, 743-746). |
| Codex health updates via `account/rateLimits/updated` native push     | FACT          | `codex-app-server.ts`: notification handler for `account/rateLimits/updated` merges and sends health frame (lines 644-649).          |
| Manual `/api/ai-health/refresh` invokes Claude usage reader only      | FACT          | `daemon.ts`: handler exclusively calls `this.claudeUsageReader.refresh()` (lines 1069-1090).                                          |
| No Codex acquisition occurs during manual refresh                     | FACT          | No reference to Codex in refresh handler; Codex health authority untouched.                                                              |
| Development Host reload triggers Codex health refresh                 | INFERENCE     | Reload re-activates extension → new Codex control 

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/player-control/codex-app-server.ts`  
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

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane manual-refresh-path: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane claude-stale-freshness: The Sideline Coach Claude health freshness pipeline can become stale when an active HTTP 429 back‑off gate blocks both scheduled and manual reads, while external readers (unaffected by the gate) continue to obtain fresh Anthropic usage data. The health UI (`observedAt`) only updates when the canonical quota windows (`five_hour`/`seven_day`) actually change; a successful read that returns unchanged
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane codex-restart-vs-refresh: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane claude-stale-freshness: * No direct contradiction found in the source. The design explicitly separates acquisition freshness (`lastSuccessAt`) from factual freshness (`observedAt`) and documents this distinction (see comment lines 51‑62 in `claude-usage-reader.ts`). ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane manual-refresh-path · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-manual-refresh-path-Reconnaissance.md
- Lane claude-stale-freshness · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-claude-stale-freshness-Reconnaissance.md
- Lane codex-restart-vs-refresh · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433\SCOUT-codex-restart-vs-refresh-Reconnaissance.md

### Full report — lane manual-refresh-path (sideline-scout-quick)

# SIDELINE COACH SCOUT RECONNAISSANCE REPORT

## REPORT TYPE: SCOUT REPORT
**Scout Agent:** openrouter/cohere/north-mini-code:free  
**Scout Model:** Cohere North Mini Code Free  
**Scout Reasoning/Effort:** Discovery and tracing of the AI Usage manual Refresh end-to-end behavior. Bounded reconnaissance limited to the specific manual refresh path from browser UI to factual provider state.

**This report is reconnaissance, not final architectural authority.**

## SCOUT SCOPE
Investigation of the AI Usage manual Refresh path from browser UI to factual provider state, following the 12 TRACE questions in the Play.

## RECONNAISSANCE DEPTH: Standard

---

# EXECUTIVE MAP

**Question Investigated:** "Pressing the AI Usage Refresh control appeared to do nothing / did not bring provider facts current. Later, restarting or refreshing the Sideline Coach Development Host caused Codex usage to update immediately."

**Current Truth:** The AI Usage Refresh button in the browser UI calls `/api/ai-health/refresh` POST endpoint, but provider facts are not updated unless the Development Host is refreshed.

---

# KEY DISCOVERIES

## FACT
The AI Usage Refresh button exists in the browser UI (`aiScoreboardRefreshBtn`) and is wired to call the `/api/ai-health/refresh` POST endpoint.

## INFERENCE
The refresh button appears to be a "no-op" that doesn't trigger provider state updates due to the Claude usage reader being inactive or the endpoint returning no changes.

## UNKNOWN
The exact reason provider facts remain unchanged after manual refresh.

## ARCHITECT DECISION REQUIRED
Understanding why `/api/ai-health/refresh` POST doesn't update provider facts when the button is pressed.

---

# EVIDENCE MAP

## Relevant Files / Symbols / Ownership Seams

1. **Frontend UI (`src/public/index.html`)**:
   - `aiScoreboardRefreshBtn` button at lines 5230-5233
   - `aiScoreboardRefreshHealth` function at lines 5406-5430
   - API call: `await api('/api/ai-health/refresh', { method: 'POST' })`

2. **Backend API (`src/control-plane/daemon.ts`)**:
   - `/api/ai-health/refresh` endpoint at lines 1069-1091
   - Calls `this.claudeUsageReader.refresh()`

3. **Claude Usage Reader (`src/control-plane/claude-usage-reader.ts`)**:
   - `refresh()` method at lines 284-292
   - Joins in-flight requests, skips backoff timers
   - `read()` method at lines 299-324
   - Handles rate limiting and credential checks

4. **Health Authority (`src/control-plane/health-authority.ts`)**:
   - `ingestClaudeUsage()` method at lines 163-187
   - `ingest()` method for evidence ingestion

5. **Control Plane Daemon (`src/control-plane/daemon.ts`)**:
   - Health authority and Claude usage reader instantiation
   - `/api/ai-health` GET endpoint at lines 1057-1064

## Execution / Data Flow

1. **Browser UI Action**: User clicks AI Usage Refresh button
2. **Frontend API Call**: POST to `/api/ai-health/refresh`
3. **Backend Processing**: Daemon calls `claudeUsageReader.refresh()`
4. **Claude Reader**: Joins any in-flight read, respects rate limits
5. **Health Authority**: `ingestClaudeUsage()` with acquired windows
6. **Provider State Update**: Depends on `ingestClaudeUsage()` returning `true`

---

# FACTS

## FACT 1: Browser UI Refresh Button Exists
The AI Usage Refresh button is implemented in the browser UI with:
- ID: `aiScoreboardRefreshBtn`  
- Click handler: `aiScoreboardRefreshHealth(refreshBtn)` at line 5265
- API endpoint: `POST /api/ai-health/refresh`

## FACT 2: API Endpoint Definition
The `/api/ai-health/refresh` endpoint exists in `daemon.ts`:
```typescript
if (method === 'POST' && requestUrl.pathname === '/api/ai-health/refresh') {
  if (!this.claudeUsageReader) {
    this.sendJson(res, 200, {
      success: true,
      health: this.healthAuthority.getSnapshot(),
      acquisition: { claude: { outcome: 'unavailable', reason: 'The Claude usage reader is not enabled.' } }
    });
    return;
  }
  const { outcome, changed } = await this.claudeUsageReader.refresh();
  this.sendJson(res, 200, {
    success: true,
    health: this.healthAuthority.getSnapshot(),
    acquisition: {
      claude: {
        outcome: outcome.ok ? (changed ? 'changed' : 'unchanged') : outcome.code,
        ...(outcome.ok ? {} : { reason: outcome.reason }),
        checkedAt: new Date().toISOString()
      }
    }
  });
  return;
}
```

## FACT 3: Claude Usage Reader Implementation
The `ClaudeUsageReader.refresh()` method:
- Joins any in-flight request (`this.inFlight`)
- Skips backoff timers if timer exists (line 285-290)
- Calls `read()` method which handles rate limits
- Calls `scheduleNext()` only if not stopped
- Returns `changed` status based on `this.lastChanged`

## FACT 4: Health Authority Ingestion
The `ingestClaudeUsage()` method:
- Bypasses validation: "never a Stadium/network evidence packet, so it bypasses `validHealthEvidence`/`validSource` entirely"
- Calls `mergeClaudeRateLimitInfo()`
- Updates `this.state` if `claudeRateLimitInfoUnchanged` returns false
- Returns `true` if state changed

## FACT 5: Codex Usage Reader Does Not Exist
There is no Codex equivalent of `ClaudeUsageReader` in the codebase.

## FACT 6: Rate Limiting Behavior
The Claude usage reader has:
- Rate limit gate: `rateLimitedUntilMs` prevents provider requests
- Backoff ladder: `[5, 10, 20, 40, 60]` minutes for failures
- Manual refresh "hole": When 429 occurs, gate is `max(fallback backoff rung, valid Retry-After)`

---

# INFERENCES

## INFERENCE 1: Refresh Button Likely Does Nothing
Based on the field fact that "Pressing the AI Usage Refresh control appeared to do nothing / did not bring provider facts current," and given the Rate Limiting Behavior fact, it's likely that:
1. The Claude usage reader is rate-limited when the refresh button is pressed
2. The manual refresh "hole" protection prevents provider requests when rate-limited
3. The API returns `unchanged` outcome without actual provider acquisition

## INFERENCE 2: Development Host Restart Triggers Update
When the Development Host is refreshed, the Claude usage reader restarts:
- `rateLimitedUntilMs` is reset to `undefined`
- The scheduled cadence is restarted from now
- Provider acquisition can occur, updating factual state

## INFERENCE 3: Codex vs Claude Difference
Codex usage updates after Development Host restart, but Claude doesn't, suggesting:
- Claude has rate limiting/protection that Codex doesn't
- Claude usage reader may be disabled or not initialized
- Different acquisition mechanisms between providers

---

# UNKNOWN

## UNKNOWN 1: Claude Usage Reader State
- Is the Claude usage reader enabled and running?
- What is its current `rateLimitedUntilMs` state?
- Has it been stopped or never started?

## UNKNOWN 2: Provider Difference Reason
- Why does Codex update but Claude doesn't after Development Host restart?
- Is there a separate Codex usage reader not shown in the code?

## UNKNOWN 3: Actual Provider State Changes
- Which provider (Claude, Codex, or both) should be refreshed?
- Are there separate Claude and Codex acquisition seams?

---

# CONTRADICTIONS

## CONTRADICTION 1: UI vs Factual State
The UI may appear refreshed (button shows "Refreshed ✓") while factual provider data remains unchanged, creating a user experience contradiction.

---

# ARCHITECTURE DECISIONS STILL REQUIRED

1. **Provider Acquisition Seams**: Need to understand if Claude and Codex have separate acquisition paths or share one.

2. **Rate Limiting Logic**: The manual refresh "hole" protection might be overly conservative, preventing legitimate refresh attempts.

3. **Reader Lifecycle**: Why is the Claude usage reader not running or is it stopped?

---

# WHAT DOES NOT NEED ARCHITECTURE

1. **Button Wiring**: The frontend button wiring is complete and working.
2. **API Endpoint**: The `/api/ai-health/refresh` endpoint is correctly implemented.
3. **Health Authority**: The ingestion logic is sound for when real provider data is acquired.

---

# RISKS / BOUNDARIES

1. **Rate Limiting Risk**: Overly aggressive rate limiting prevents legitimate manual refreshes.
2. **User Experience Risk**: UI suggests refresh completed while factual state unchanged.
3. **Provider Asymmetry Risk**: Different behavior between Claude and Codex creates inconsistency.

---

# RECOMMENDED NEXT AGENT / MODEL / EFFORT

**Bounded Worker:** Focus on the Claude usage reader's lifecycle and rate limiting behavior:
- Investigate why Claude usage reader might be stopped/rate-limited
- Examine the relationship between Claude and Codex provider acquisition
- Test the `/api/ai-health/refresh` endpoint directly with debugging

**Model:** Laguna S 2.1 (Default Scout) - suitable for tracing execution paths.

**Effort:** Medium - requires examining runtime state and rate limiting logic.

---

# WHAT THE FUTURE ARCHITECT SHOULD VERIFY

1. **Reader Status**: Check if `claudeUsageReader` is initialized and running.
2. **Rate Limit State**: Verify current `rateLimitedUntilMs` value.
3. **Provider Acquisition**: Confirm Claude vs Codex acquisition mechanisms.
4. **Manual Refresh Logic**: Test if the refresh bypass logic is causing issues.

---

# WAS / IS / WILL BE

## WAS
- AI Usage Refresh button wired to `/api/ai-health/refresh`
- Claude usage reader with rate limiting and backoff
- Health authority with separate ingestion for OAuth usage

## IS
- AI Usage Refresh button in browser UI
- `/api/ai-health/refresh` endpoint exists
- Claude usage reader implementation with rate limiting

## WILL BE (Required for Fix)
- Claude usage reader properly initialized and running
- Rate limiting allows manual refresh when requested
- Provider facts update on manual refresh

---

# SCOUT LIMITATIONS

1. **Read-Only Scope**: This reconnaissance is read-only and cannot inspect runtime state or modify behavior.
2. **No Execution**: Cannot run the application to test the refresh behavior live.
3. **No Debug Logs**: Limited access to runtime logs that might show why refresh doesn't work.
4. **Static Analysis**: Cannot observe actual provider acquisition attempts or rate limit states.

---

# SMALLEST LIKELY REPAIR SEAM

**File:** `src/control-plane/daemon.ts`  
**Method:** Claude usage reader initialization and lifecycle management  
**Issue:** The Claude usage reader may not be started or may be stopped prematurely

**Test:** Add logging to see if Claude usage reader is initialized and its state during manual refresh

---

# FOCUSED TEST CONTRACT

To verify the manual refresh behavior, test:

1. **Endpoint Test**: Direct POST to `/api/ai-health/refresh` to see actual response
2. **Reader Status Test**: Check if Claude usage reader is running and its state
3. **Rate Limit Test**: Verify if rate limiting is preventing provider acquisition
4. **State Verification**: Confirm if health authority snapshot changes after refresh

---

# CURRENT BEHAVIOR SUMMARY

**User Action:** Clicks AI Usage Refresh button in browser UI  
**Expected:** Provider facts update immediately  
**Actual:** Nothing happens / provider facts unchanged  
**Root Cause Likely:** Claude usage reader rate-limited or stopped  
**Solution Needed:** Fix rate limiting or restart Claude usage reader

---

This reconnaissance has mapped the exact manual refresh path from browser UI to provider state but identified the Claude usage reader's rate limiting as the most likely barrier to provider fact updates. The manual refresh button exists and calls the correct endpoint, but provider acquisition is prevented by the rate limiting protection mechanism.

### Full report — lane claude-stale-freshness (sideline-scout-balanced)

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

### Full report — lane codex-restart-vs-refresh (sideline-scout-balanced)

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

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-freshness-recon-20260922-152433
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\ai-health-freshness-recon-20260922-152433

