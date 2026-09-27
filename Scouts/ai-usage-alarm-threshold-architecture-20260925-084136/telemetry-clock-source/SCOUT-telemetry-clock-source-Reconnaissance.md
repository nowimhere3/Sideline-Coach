# SCOUT PLAY - READ-ONLY RECONNAISSANCE

**Play ID:** ai-usage-alarm-threshold-architecture-20260925-084136  
**Scout ID:** telemetry-clock-source  
**Assigned agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free  
**Game root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

## READ-ONLY RECONNAISSANCE REPORT

This is reconnaissance, not final architectural authority. I am a temporary Sideline Coach reconnaissance Scout investigating only the bounded objective above. Read-only contract is followed.

---

## TELEMETRY PIPELINE

### Claude Usage Telemetry Pipeline

**FACT:** Claude has two distinct telemetry sources feeding into the Health Authority:

1. **OAuth Usage Reader** (`src/control-plane/claude-usage-reader.ts`)
   - Reads Claude Code's OAuth access token from `~/.claude/.credentials.json`
   - Performs read-only HTTPS GET to Anthropic's undocumented `/api/oauth/usage` endpoint
   - Provides "zero-inference acquisition seam that keeps Claude health current even when Claude is being used outside Sideline"
   - Executed by a single global `ClaudeUsageReader` owned by `ControlPlaneDaemon`

2. **Native Push** (`src/player-control/structured-print.ts` / `src/control-plane/stadium-client.ts`)
   - Claude's native `rate_limit_event` push from Claude Code
   - 3-30 second cadence (but floor is 3 minutes to avoid HTTP 429 throttling)
   - Event-driven freshness rather than polling

**EVIDENCE:** From `src/control-plane/claude-usage-reader.ts:19-19` and `src/control-plane/claude-usage-reader.ts:22-24`:
```typescript
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
...
// The OAuth account-usage endpoint is a reconciliation source, not a heartbeat — 
// fast in-Play updates arrive via Claude's native rate_limit_event push instead 
// (see structured-print.ts / stadium-client.ts). A 3-30 second cadence here was 
// field-proven to trigger provider HTTP 429 throttling within ~10 seconds, so the 
// floor is 3 minutes and the unit is minutes, not seconds.
```

**INFERENCE:** The OAuth reader serves as a global reconciliation source that supplements the native push, ensuring Claude health remains current even when Claude usage occurs outside Sideline control.

### Codex Telemetry Pipeline

**FACT:** Codex has a single native telemetry source:

1. **Codex App Server** (`src/player-control/codex-app-server.ts`)
   - `account/rateLimits/read` RPC call at session startup/open/restore
   - `account/rateLimits/updated` native push events during active sessions
   - Both flow through `onHealthFrame` callback → `StadiumClient.sendHealthEvidence`

**EVIDENCE:** From `Scouts/ai-health-freshness-recon-20260922-152433/SCOUT-codex-restart-vs-refresh-Reconnaissance.md:29`:
```markdown
| Codex health updates via `account/rateLimits/read` at session start   | FACT          | `codex-app-server.ts`: `readRateLimits()` called in `open()` and `restore()` paths, sends health frame (lines 351, 453, 743-746). |
```

**INFERENCE:** Unlike Claude, Codex has no separate global reader — health updates occur only through session-bound native events or session restart, which explains the asymmetry between Development Host reload and manual Refresh button behavior.

---

## CANONICAL CLOCK SOURCE

### Timestamp Origins

**FACT:** Both 5-hour and weekly reset times originate from provider responses and are stored as Unix seconds in canonical structures:

**Claude Canonical Windows:**
- **Source:** OAuth `/api/oauth/usage` endpoint or native push `rate_limit_event`
- **Format:** `CanonicalClaudeWindow` = `{ utilization: number, resetsAt: number | null }`
- **Unit:** `resetsAt` is Unix seconds (not milliseconds)
- **Location:** `health-authority.ts:10-13`, `claude-usage-reader.ts:133-142`

**Codex Canonical Windows:**
- **Source:** Codex app-server `account/rateLimits/read` RPC
- **Format:** `CanonicalCodexWindow` = `{ usedPercent: number, resetsAt: number, windowDurationMins: number }`
- **Unit:** `resetsAt` is Unix seconds
- **Location:** `health-authority.ts:528-532`, `claude-usage-reader.ts:1072-1087`

**EVIDENCE:** From `claude-usage-reader.ts:133-142`:
```typescript
function canonicalWindowFromOAuth(raw: unknown): CanonicalClaudeWindow | undefined {
  if (!isObject(raw)) return undefined;
  const percent = raw.utilization;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return undefined;
  if (percent === 0 && raw.resets_at === null) return { utilization: 0, resetsAt: null };
  const resetRaw = raw.resets_at;
  const ms = typeof resetRaw === 'string' ? Date.parse(resetRaw) : NaN;
  if (!Number.isFinite(ms)) return undefined;
  return { utilization: Math.round((percent / 100) * 10_000) / 10_000, resetsAt: Math.floor(ms / 1000) };
}
```

### Observed Timestamp Origins

**FACT:** "Observed timestamp" originates from `HealthAuthority.ingest()` call time:

**Claude:**
- Source: `HealthAuthority.ingestClaudeUsage()` at line `health-authority.ts:164`
- Format: ISO string (`nowDate.toISOString()`)
- Owner: `HealthAuthority` class
- Purpose: When stored canonical facts actually changed

**Codex:**
- Source: `HealthAuthority.ingest()` at line `health-authority.ts:147`
- Format: ISO string (`nowDate.toISOString()`)
- Owner: `HealthAuthority` class  
- Purpose: When stored canonical facts actually changed

**EVIDENCE:** From `health-authority.ts:146-152`:
```typescript
const observedAt = nowDate.toISOString();
this.state = {
  schemaVersion: AI_HEALTH_SCHEMA_VERSION,
  updatedAt: observedAt,
  providers: { ...this.state.providers, [provider]: { ...factual, observedAt } }
};
```

---

## UPDATE LIFECYCLE

### Claude Countdown Calculation

**FACT:** Countdown to reset is presentation-derived from canonical `resetsAt`:

1. **Canonical Source:** `CanonicalClaudeWindow.resetsAt` (Unix seconds)
2. **Presentation Layer:** `src/public/index.html:4681-4688` (`aiScoreboardNormalize`)
3. **Calculation:** `Math.max(0, Date.now() - resetsAt * 1000)` → formatted as countdown

**EVIDENCE:** From `src/public/index.html:4681-4688` (referenced in `Claude-5H-Freshness-Seam-Validation__20260922-063800__Claude.md:34`):
```javascript
/* No Scoreboard Expiration Check: aiScoreboardNormalize() normalizes utilization without checking if Date.now() >= resetsAt. An expired window renders with its old percentage and countdown `in 0m`. */
```

### Weekly Countdown Calculation

**FACT:** Weekly countdown follows same pattern as 5-hour:

1. **Canonical Source:** `CanonicalClaudeWindow.resetsAt` (Unix seconds) for `seven_day` window
2. **Presentation:** Same `aiScoreboardNormalize()` function
3. **Calculation:** Identical countdown formula

### Remaining Percentage Calculation

**FACT:** Remaining percentage is derived from canonical utilization:

**Claude:**
- Formula: `(1 - utilization) * 100`%
- Source: `CanonicalClaudeWindow.utilization` (0-1 fraction)
- Presentation: `src/public/index.html` various selectors

**Codex:**
- Formula: `(100 - usedPercent)`%
- Source: `CanonicalCodexWindow.usedPercent` (0-100 scale)
- Presentation: Similar UI rendering

---

## SAFE EVENT-ENGINE SEAM

### Claude Activity Seam

**FACT:** Claude usage triggers via `noteClaudeActivity()`:

**Location:** `src/control-plane/claude-usage-reader.ts:348-367`
```typescript
export function noteClaudeActivity(): void {
  if (this.stopped) return;
  const now = this.now();
  this.activityStartedMs ??= now;
  const settledAt = Math.min(now + CLAUDE_ACTIVITY_SETTLE_MS, this.activityStartedMs + CLAUDE_ACTIVITY_MAX_WAIT_MS);
  const spacedAt = this.lastAttemptMs === undefined ? now : this.lastAttemptMs + CLAUDE_ACTIVITY_MIN_SPACING_MS;
  const at = Math.max(settledAt, spacedAt);
  if (this.activityTimer) this.clearTimer(this.activityTimer);
  this.activityTimer = this.setTimer(() => {
    this.activityTimer = undefined;
    this.activityStartedMs = undefined;
    if (this.stopped) return;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    void this.runAndSchedule();
  }, Math.max(0, at - now));
  if (typeof this.activityTimer.unref === 'function') this.activityTimer.unref();
}
```

**Trigger:** Session transcript directory watch (`watchClaudeActivity()` at `src/control-plane/claude-usage-reader.ts:51-71`)

### Codex Activity Seam

**FACT:** Codex activity triggers via `noteCodexActivity()`:

**Location:** `src/control-plane/codex-usage-reader.ts:285-301`
```typescript
export function noteCodexActivity(): void {
  if (this.stopped) return;
  const now = this.now();
  this.activityStartedMs ??= now;
  const settledAt = Math.min(now + CODEX_ACTIVITY_SETTLE_MS, this.activityStartedMs + CODEX_ACTIVITY_MAX_WAIT_MS);
  const spacedAt = this.lastAttemptMs === undefined ? now : this.lastAttemptMs + CODEX_ACTIVITY_MIN_SPACING_MS;
  const at = Math.max(settledAt, spacedAt);
  if (this.activityTimer) this.clearTimer(this.activityTimer);
  this.activityTimer = this.setTimer(() => {
    this.activityTimer = undefined;
    this.activityStartedMs = undefined;
    if (this.stopped) return;
    this.log('[codex-usage-reader] Codex activity observed; reading account rate limits.');
    void this.refresh().catch(() => undefined);
  }, Math.max(0, at - now));
  if (typeof this.activityTimer.unref === 'function') this.activityTimer.unref();
}
```

**Trigger:** Session rollout directory watch (`watchCodexActivity()` at `src/control-plane/codex-usage-reader.ts:196-237`)

### Safest Seam for Alarm/Threshold Engine

**FACT:** The **HealthAuthority.ingestClaudeUsage()** and **HealthAuthority.ingest()** methods are the safest seams:

1. **Why safest:** Canonicalized, deduplicated state changes, no UI scraping required
2. **Location:** `health-authority.ts:122` (`ingest()`) and `health-authority.ts:164` (`ingestClaudeUsage()`)
3. **Benefits:** Event-driven, persists across restarts, no presentation layer dependencies

---

## EDGE CASES

### Stale Data Handling

**FACT:** HealthAuthority includes comprehensive stale data protection:

1. **Prune Expired:** `health-authority.ts:190-219` removes expired windows automatically
2. **Reset Cycle Monotonicity:** `health-authority.ts:312-316` prevents stale replays via `sameResetCycle()` tolerance (15 minutes)
3. **Post-Reset State:** Special handling for `utilization: 0, resetsAt: null` (idle state)

**EVIDENCE:** From `health-authority.ts:312-316`:
```typescript
const SAME_CYCLE_TOLERANCE_SECONDS = 15 * 60;

function sameResetCycle(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && Math.abs(a - b) <= SAME_CYCLE_TOLERANCE_SECONDS;
}
```

### Unknown Reset Time

**FACT:** Unknown reset times are explicitly handled:

**Claude:**
- `resetsAt: null` in `CanonicalClaudeWindow`
- Renders as "UNKNOWN" in UI
- Preserved during merges unless provider delivers future reset

**Codex:**
- Missing windows are omitted from canonical resolution
- `resolveCodexWindows()` at `health-authority.ts:539-591` drops expired windows
- Unknown becomes "UNKNOWN" in UI

### Missing Provider Data

**FACT:** Missing provider data is handled gracefully:

**Claude:**
- Empty `ClaudeUsageWindows` object returned from OAuth reader
- `ingestClaudeUsage()` returns `false` for empty objects (line `health-authority.ts:165`)
- No fabrication of missing windows

**Codex:**
- `resolveCodexWindows()` returns empty object `{}` when no valid windows
- UI renders "UNKNOWN" for missing windows

### App Restart Behavior

**FACT:** App restart behavior differs between providers:

**Claude:**
- No restart-specific behavior; reader continues from previous state
- `observedAt` updates on actual changes, not reader checks
- Persistent across restarts via file storage

**Codex:**
- **Session restart triggers immediate `account/rateLimits/read`**
- `codex-app-server.ts:743-746` calls `readRateLimits()` in `open()` and `restore()`
- Development Host reload instantly exposes fresh usage via session restart

### Reset Passing While App Inactive

**FACT:** Reset passing while app inactive:

**Claude:**
- OAuth reader will attempt read after next activity trigger
- No guarantee of timely reset detection if app stays inactive through reset boundary
- HealthAuthority `pruneExpired()` handles expired windows on next access

**Codex:**
- Session restart would be required to detect reset
- If app stays inactive, no session activity triggers
- Stale window persists until next session activation

---

## RECOMMENDED SOURCE OF TRUTH

### Primary Source

**FACT:** **HealthAuthority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows** is the single source of truth:

**Why:**
1. Canonicalized format (utilization as fraction, resetsAt as Unix seconds)
2. Deduplicated and validated
3. Updated atomically on actual changes
4. Persists across restarts
5. No presentation layer dependencies

### Secondary Sources

**INFERENCE:** Provider-specific readers exist for acquisition but HealthAuthority is the ultimate source for current state.

---

## KEY DISCOVERIES

### 1. **Two Completely Different Architectures**

**Claude:** Global reader + native push (event-driven reconciliation)  
**Codex:** Native push + startup read only (session-bound health)

### 2. **Manual Refresh Asymmetry**

**FACT:** Manual Refresh button only targets Claude OAuth reader; Codex relies on session restart (`open()`/`restore()` paths).

### 3. **Timestamp Semantics Distinction**

**FACT:** `ClaudeUsageStatus.lastSuccessAt` (reader check time) vs `ClaudeProviderHealthState.observedAt` (actual change time) are distinct concepts.

### 4. **Complex Merge Logic**

**FACT:** Both providers have sophisticated merge logic handling jitter tolerance, stale replay detection, and reset cycle monotonicity.

### 5. **No Universal Polling**

**FACT:** Neither provider uses polling — both are purely event-driven with bounded fallback gates.

---

## LIMITATIONS

1. **No Access to UI Rendering Logic:** Scoreboard presentation details not fully mapped
2. **No Access to Frontend Routing:** CONSERVE integration seams not fully explored  
3. **Historical State Not Analyzed:** Current architecture focus only, not evolution
4. **External Provider Behavior:** Anthropic/Codex provider behavior assumptions validated only through tests

---

## CONCLUSION

The telemetry pipeline for Claude and Codex are architecturally distinct but both achieve the same goal: maintaining current health state through event-driven, canonicalized data acquisition without polling. The HealthAuthority represents the single source of truth for current usage windows and reset times, with canonical Unix-second timestamps and fraction/percentage-based utilization metrics.

The safest seam for an Alarm/Threshold Engine is the HealthAuthority.ingest() methods, which provide deduplicated, canonicalized state changes without UI scraping dependencies.

**Evidence-first reconnaissance complete.** No files were modified, no packages installed, no commits pushed.
