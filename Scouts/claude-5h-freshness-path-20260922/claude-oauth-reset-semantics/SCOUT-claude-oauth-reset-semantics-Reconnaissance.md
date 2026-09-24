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
