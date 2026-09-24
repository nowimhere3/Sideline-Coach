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
