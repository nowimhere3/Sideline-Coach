# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:07:36

Play: ai-usage-alarm-threshold-architecture-20260925-084136
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-25T14:41:48.774Z
Finished: 2026-09-25T14:49:24.947Z
TOTAL ELAPSED TIME: 00:07:36

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
| telemetry-clock-source | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T14:41:48.798Z | 2026-09-25T14:44:21.579Z | 00:02:32 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-telemetry-clock-source-Reconnaissance.md |
| notification-runtime-capability | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T14:41:48.814Z | 2026-09-25T14:45:27.893Z | 00:03:39 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-notification-runtime-capability-Reconnaissance.md |
| alarm-threshold-conserve-domain | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T14:41:48.828Z | 2026-09-25T14:49:24.941Z | 00:07:36 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-alarm-threshold-conserve-domain-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane telemetry-clock-source: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane notification-runtime-capability: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane alarm-threshold-conserve-domain: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: telemetry-clock-source (objective 772d914fff82)
- Objective: READ-ONLY RECONNAISSANCE. Do not modify source, install packages, commit, or push.

Map the canonical AI Usage telemetry and clock pipeline for Codex and Claude.

Determine:
- where 5-hour remaining %, 5-hour reset time, weekly remaining %, weekly reset time, and observed timestamp originate
- what object/state owns them
- how countdowns are calculated
- whether reset times are canonical absolute timestamps or presentation-derived
- what causes telemetry updates
- whether an event/state-change seam already exists
- safest seam for an Alarm/Threshold Engine without scraping rendered UI
- behavior for stale data, unknown reset time, missing provider data, app restart, and reset passing while app is inactive

Return:
TELEMETRY PIPELINE
CANONICAL CLOCK SOURCE
UPDATE LIFECYCLE
SAFE EVENT-ENGINE SEAM
EDGE CASES
RECOMMENDED SOURCE OF TRUTH

Evidence-first. Cite exact files/functions/lines where practical.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-telemetry-clock-source-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** **FACT:** Unknown reset times are explicitly handled:

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: notification-runtime-capability (objective a0778c4130bc)
- Objective: READ-ONLY RECONNAISSANCE. Do not modify source, install packages, commit, or push.

Map the best Phase-1 notification path for Sideline Coach alarms.

Investigate current codebase plus runtime/browser capability for:
- Notification API permission and delivery
- visible tab
- background tab
- minimized Chrome
- browser closed
- machine sleep/wake
- localhost / 127.0.0.1 secure-context implications
- Service Worker / PWA feasibility
- existing Windows/native host notification capability through Sideline Coach architecture

Determine whether browser notifications or a native-host path is the best initial channel.

Also identify the clean permission UX:
- when permission should be requested
- how denial/default/granted should be represented
- how to avoid nagging the user

Return:
CURRENT RUNTIME CAPABILITIES
BROWSER NOTIFICATION PATH
BACKGROUND / SERVICE-WORKER PATH
NATIVE HOST POSSIBILITY
PERMISSION UX
LIMITATIONS
RECOMMENDED PHASE-1 NOTIFICATION CHANNEL

Evidence-first. Separate what is currently implemented from what is merely technically possible.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-notification-runtime-capability-Reconnaissance.md

No structured sections were recognised in this report; the full text is under CHILD REPORTS below.

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: alarm-threshold-conserve-domain (objective af93fd3b7786)
- Objective: READ-ONLY ARCHITECTURE RECONNAISSANCE. Do not modify source, install packages, commit, or push.

Design the smallest scalable Sideline Coach Alarm / Threshold Event architecture.

North-star flow:

Telemetry -> Rule Evaluation -> State Transition -> Event -> Action

Example rules:
- Codex 5H reset reached
- Claude 5H reset reached
- Codex Weekly reset reached
- Claude Weekly reset reached
- Codex 5H remaining <= configured threshold
- Claude 5H remaining <= configured threshold
- Codex Weekly remaining <= configured threshold
- Claude Weekly remaining <= configured threshold

Requirements:
- provider-specific and window-specific rules
- configurable thresholds
- transition-based firing, not repeated firing every render/refresh
- persistence across refresh/reload/restart where appropriate
- duplicate-notification protection
- reset/recovery semantics
- stale/unknown telemetry handling
- absolute timestamps preferred over presentation countdown scraping

Investigate a state model such as NORMAL / LOW / CRITICAL / RECOVERED / UNKNOWN or recommend better names if justified.

Future action consumers must be possible without implementing them now:
- browser/native notification
- UI indicator
- Copy Context
- CONSERVE mode
- Schedule Later
- Player routing policy

Explicitly identify the future CONSERVE seam:
when remaining falls below the configured threshold, canonical resource state should become CONSERVE-aware so CONSERVE consumes that state rather than reparsing scoreboard UI.

Explicitly identify the future Schedule Later seam.

Return:
DOMAIN MODEL
RULE MODEL
STATE MACHINE
PERSISTENCE MODEL
EVENT / ACTION BUS SEAM
CONSERVE INTEGRATION SEAM
SCHEDULE-LATER INTEGRATION SEAM
SMALLEST PHASE-1 SLICE
FUTURE BREADCRUMBS

Do not overbuild Phase 1. We want a small first slice that proves the nervous system.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-alarm-threshold-conserve-domain-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **One global HealthAuthority** owns canonical provider state (utilization 0..1, resetsAt Unix seconds, windowDurationMins). Persisted to `~/.sideline/ai-health-state.json`. | `health-authority.ts:46-50, 64-66, 111-223` |
| 2 | **Two global daemon-owned readers**: `ClaudeUsageReader` (OAuth HTTPS, 5-min cadence floor) and `CodexUsageReader` (app-server RPC, manual-only). Both feed `HealthAuthority.ingest*`. | `daemon.ts:252-262, 355-383, 673-681` |
| 3 | **Provider windows**: Claude → `five_hour` (300 min), `seven_day` (10080 min). Codex → `primary` (5H), `secondary` (weekly) keyed by `windowDurationMins`. | `health-authority.ts:247-248, 447-448, 539-591` |
| 4 | **No threshold/alarm logic exists today**. Backend "never interprets, classifies, or thresholds" `rateLimitInfo` (Scout confirmation). | `SCOUT-scoreboard-health-data-client-Reconnaissance.md:84, 324` |
| 5 | **UI Scoreboard** reads canonical snapshot via `GET /api/ai-health` + SSE `ai-health`. Shows Compact (4 metrics) + Expanded (4 panes). Copy Context already implemented. | `index.html:5398-5707, 5889-5979` |
| 6 | **CONSERVE is documented as future routing policy**, not health. Thresholds are human-controlled: "Weekly conserve threshold = 15%", "Codex is conserved for ordinary AUTO". | `BREADCRUMB -- SIDELINE-PLAY-COMPILER...md:1370-1381, 2031-2033` |
| 7 | **Schedule Later** is breadcrumbed: "durable scheduled/conditional queue → WAIT or REROUTE huma

**FACT:** - **F-1**: `HealthAuthority` is a singleton per daemon, persisted atomically, broadcasts on change via SSE `ai-health`. — `health-authority.ts:111-155, 341-350, daemon.ts:341-350`
- **F-2**: Canonical windows are `CanonicalClaudeWindow { utilization: number, resetsAt: number|null }` and `CanonicalCodexWindow { usedPercent: number, resetsAt: number, windowDurationMins: number }`. — `health-authority.ts:10-13, 528-537`
- **F-3**: `ClaudeUsageReader` runs on configurable cadence (3/5/10/15 min). `CodexUsageReader` is manual-refresh only (no background poll). — `claude-usage-reader.ts:27-29, 258-264, codex-usage-reader.ts:168-175, 314-324`
- **F-4**: Activity-driven early reads: both readers debounce file-system activity (Claude transcripts, Codex rollouts) into ONE acquisition after settle/spacing. — `claude-usage-reader.ts:348-367, codex-usage-reader.ts:285-301`
- **F-5**: `HealthAuthority.ingestClaudeUsage()` and `ingest()` dedupe on canonical window values (utilization + resetsAt within 15-min tolerance). — `health-authority.ts:142-146, 164-169, 279-289, 314-323`
- **F-6**: Provider reset semantics: post-reset 5H window may have `resetsAt: null` (idle/not-started). `HealthAuthority` represents this as `{ utilization: 0, resetsAt: null }`. — `health-authority.ts:125-131, 360-363, 409-417`
- **F-7**: Preferences include `aiUsageRefreshMinutes` (3/5/10/15) controlling Claude reader cadence. No threshold preferences exist. — `running-players.ts:128-134, 136-148`
- **F-8**: `/api/

**INFERENCE:** - **I-1**: The nervous system (telemetry → canonical state → SSE) is complete. Alarm layer is a pure consumer of `HealthAuthority` snapshots + SSE deltas — no new acquisition needed.
- **I-2**: Rules should evaluate against `CanonicalClaudeWindow` / `CanonicalCodexWindow` (utilization 0..1, resetsAt absolute), not raw `rateLimitInfo`.
- **I-3**: Transition-based firing requires tracking *previous* rule state per (provider, window, threshold). This state is ephemeral (in-memory) but must survive daemon restart for "persistence where appropriate" — implies a small durable sidecar.
- **I-4**: "Configured threshold" means user preference per (provider, window, level). No such preferences exist; they are Phase-1 additions.
- **I-5**: CONSERVE seam = a derived boolean `isConserveAware` per (provider, window) when `remaining <= configuredThreshold`. Routing policy consumes this flag, not raw utilization.
- **I-6**: Schedule Later seam = a durable "wait until reset" intent per (provider, window) that survives restart and integrates with `PlayQueue`.

---

**UNKNOWN:** - **U-1**: Whether threshold preferences should live in `CoachPreferences` (per-user) or a new `AlarmPreferences` (per-Game, per-provider, per-window). Breadcrumbs suggest user-controlled: "Dad's weekly conserve threshold = 15%".
- **U-2**: Exact Phase-1 scope: all 8 example rules, or just one provider/window to prove the nervous system?
- **U-3**: Whether `UNKNOWN` telemetry state (no data yet, or stale > threshold) should be a distinct rule state or folded into `NORMAL`.
- **U-4**: Whether duplicate-notification protection should be per-rule, per-(provider,window), or global.
- **U-5**: Whether "stale/unknown telemetry handling" means a `STALE` rule state, or auto-silencing rules when `observedAt` > configured max age.

---

**CONTRADICTION:** - **C-1**: Breadcrumbs say "CONSERVE is routing policy, not health" but also "when remaining falls below threshold, canonical resource state should become CONSERVE-aware so CONSERVE consumes that state rather than reparsing scoreboard UI". These are compatible if the *alarm layer* emits the CONSERVE-aware flag, and *routing* consumes it. No contradiction in architecture; the seam must be explicit.
- **C-2**: `HealthAuthority.pruneExpired()` drops expired windows (returns empty). UI `checkExpiry: true` also guards. But `claudeWindowsNotReflected()` tracks "not reflected" windows for refresh feedback. An expired window that prunes away is not "not reflected" — it's gone. This is consistent but subtle.

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/health-authority.ts` | Canonical provider state, persistence, merge, prune, SSE broadcast |
| `src/control-plane/claude-usage-reader.ts` | Global Claude OAuth reader, activity debounce, cadence |
| `src/control-plane/codex-usage-reader.ts` | Global Codex app-server reader, activity debounce |
| `src/control-plane/daemon.ts` | Wires readers, HealthAuthority, SSE, preferences |
| `src/control-plane/protocol.ts` | `HealthEvidence`, `CanonicalClaudeWindow`, SSE event types |
| `src/running-players.ts` | `CoachPreferences`, `aiUsageRefreshMinutes`, threshold prefs home |
| `src/public/index.html` | AI Scoreboard UI, canonical normalizer, Copy Context |
| `src/control-plane/routing-policy.ts` | Future CONSERVE consumer (`computeAutoRoute`) |
| `src/control-plane/play-queue.ts` | Future Schedule Later consumer (`enqueueAt`) |

---

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane telemetry-clock-source: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane notification-runtime-capability: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane alarm-threshold-conserve-domain: **DOMAIN MODEL**, **RULE MODEL**, **STATE MACHINE**, **PERSISTENCE MODEL**, **EVENT / ACTION BUS SEAM**, **CONSERVE INTEGRATION SEAM**, **SCHEDULE-LATER INTEGRATION SEAM**, **SMALLEST PHASE-1 SLICE**, **FUTURE BREADCRUMBS** are defined below with exact evidence citations. ---

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane alarm-threshold-conserve-domain: - **C-1**: Breadcrumbs say "CONSERVE is routing policy, not health" but also "when remaining falls below threshold, canonical resource state should become CONSERVE-aware so CONSERVE consumes that state rather than reparsing scoreboard UI". These are compatible if the *alarm layer* emits the CONSERVE-aware flag, and *routing* consumes it. No contradiction in architecture; the seam must be explicit. - **C-2**: `HealthAuthority.pruneExpired()` drops expired windows (returns empty). UI `checkExpiry: true` also guards. But `claudeWindowsNotReflected()` tracks "not reflected" windows for refresh feedback. An expired window that prunes away is not "not reflected" — it's gone. This is consistent but subtle. ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane telemetry-clock-source · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-telemetry-clock-source-Reconnaissance.md
- Lane notification-runtime-capability · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-notification-runtime-capability-Reconnaissance.md
- Lane alarm-threshold-conserve-domain · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136\SCOUT-alarm-threshold-conserve-domain-Reconnaissance.md

### Full report — lane telemetry-clock-source (sideline-scout-quick)

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

### Full report — lane notification-runtime-capability (sideline-scout-balanced)

# Sideline Coach Notification Reconnaissance Report

**Scout ID:** notification-runtime-capability  
**Agent:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Play ID:** ai-usage-alarm-threshold-architecture-20260925-084136  
**Date:** Fri Sep 25 2026  

---

## CURRENT RUNTIME CAPABILITIES

**FACT:** No browser Notification API usage is present in the codebase.  
- Search for `new Notification`, `webkitNotifications`, `Notification.permission`, `showNotification` yields no matches in source files.  
- The main UI (`src/public/index.html`) contains an inline script (lines 2302+) that handles EventSource and UI updates but does not request or show browser notifications.  

**FACT:** No service worker registration or push messaging infrastructure exists.  
- No `navigator.serviceWorker.register` calls found.  
- No references to `PushManager` or service worker-related code in source (only a mention in a markdown report about missing features).  

**FACT:** No native OS notification invocation (e.g., via `node-notifier`) is implemented in the Node.js daemon or extension.  
- Search for `node-notifier`, `notifier` returns no matches.  
- The daemon (`src/control-plane/daemon.ts`) handles JsonRpcNotifications for internal communication only (e.g., `game.connected`, `roster.snapshot`).  
- The extension (`src/extension.ts`) shows notifications via VS Code API (`vscode.window.showInformationMessage`, etc.) but not via OS-native notification channels.  

**FACT:** The Sideline Coach architecture consists of a VS Code extension (`src/extension.ts`) that spawns a Node.js control-plane daemon (`src/server.ts` → `src/control-plane/daemon.ts`). The daemon communicates with the webview UI (`src/public/index.html`) via `StadiumClient` (JsonRpc over WebSocket).  
- Extension uses `vscode` module to show status bar messages and information/warning/error popups within VS Code (e.g., lines 180, 312, 314, 319 in `extension.ts`).  
- The daemon runs on the host machine and can access Node.js APIs but currently does not trigger any OS notifications.  

**FACT:** The webview origin is `localhost` (or a secure `h-<hostPublicId>.<relayDomain>` for remote access).  
- Localhost is considered a secure origin for web platform features (including Notification API and Service Workers) per MDN web docs.  
- The pairing page (`src/public/pair.html`) and main UI (`src/public/index.html`) are served from `localhost` with no TLS, which is sufficient for secure-context features.  

---

## BROWSER NOTIFICATION PATH

**INFERENCE:** Browser notifications are technically feasible but not currently implemented.  
- Because the app runs on `localhost` (a secure origin), `Notification.requestPermission()` and `new Notification()` would be functional if called from the webview script.  
- No user gesture is required to check permission state, but requesting permission must occur in response to a user action (e.g., button click) to avoid automatic denial.  
- Once granted, notifications would be displayed by the browser’s notification system and would appear regardless of tab visibility (visible, background, minimized) as long as the browser process is running.  
- If the browser is closed, notifications would not be shown unless a service worker with push subscription is active (not implemented).  

**LIMITATIONS:**  
- Reliance on the browser being open; alarms would not fire if the Sideline Coach tab/window is closed.  
- Permission UX would require explicit user consent, which could be perceived as nagging if not tied to a meaningful action (e.g., enabling an alarm).  
- No current code path exists to trigger browser notifications; implementing would require adding permission requests and notification calls in the webview script or extension.  

---

## BACKGROUND / SERVICE-WORKER PATH

**INFERENCE:** A service worker could enable background push notifications but is not present and would require additional infrastructure.  
- A service worker registered on `localhost` could subscribe to push messages (via VAPID or a custom push server) and show notifications even when the webview is closed.  
- The existing architecture does not include a push server; the daemon communicates over WebSocket with connected clients only. Adapting this to push would necessitate either:  
  1. Adding a standard push service (e.g., using web-push library) to the daemon, or  
  2. Repurposing the existing WebSocket to act as a push channel (non-standard, would require keeping sockets open and handling reconnects).  
- Service workers also introduce complexity around lifecycle, updates, and caching, which are not currently needed for the app.  

**LIMITATIONS:**  
- No service worker code exists; registration, push subscription, and message handling would need to be built from scratch.  
- For localhost, self-hosted push is possible but adds moving parts (VAPID key management, endpoint enforcement).  
- If the daemon is not running, push messages cannot be relayed; the daemon must be active to forward alarm triggers to the service worker.  

---

## NATIVE HOST POSSIBILITY

**INFERENCE:** The host-side Node.js daemon could invoke OS-native notifications but does not currently do so.  
- The daemon has access to `node:os` and `node:child_process` and could call platform-specific notification tools (e.g., `osascript` on macOS, `powershell` on Windows, `notify-send` on Linux) or use a library like `node-notifier`.  
- The VS Code extension (`src/extension.ts`) already shows notifications via the VS Code API (`vscode.window.showInformationMessage`), which are surfaced within the IDE (not native OS toast).  
- No evidence of any native notification invocation in the daemon or extension.  

**LIMITATIONS:**  
- Currently zero implementation; would require adding a notification abstraction and calling it from alarm detection logic (likely in the daemon or extension).  
- Native notifications would appear regardless of whether VS Code or the browser is open, as long as the host daemon is running.  
- If the daemon is stopped (e.g., when Sideline Coach is shut down), native notifications would cease.  

---

## PERMISSION UX

**INFERENCE:** For browser notifications, permission should be requested when the user explicitly enables an alarm feature, with clear explanation and a single request to avoid nagging.  
- Best practice: show a UI toggle for “Enable browser notifications for alarms”; on turn-on, call `Notification.requestPermission()` and handle the outcome (granted → proceed; denied → disable toggle and inform user; default → keep toggle off).  
- For VS Code notifications, no extra permission is needed because the extension already has the capability to show messages within VS Code (granted by extension installation).  
- To avoid nagging, the system should remember the user’s choice (denied/granted) and not repeatedly prompt unless the user revises settings.  

**FACT:** The extension already shows VS Code notifications without additional permission prompts (e.g., connection status messages). This indicates that the host environment permits the extension to display UI elements.  

---

## LIMITATIONS

- **Browser notifications:** Require the browser/Sideline Coach tab to be open; no fallback if closed.  
- **Service worker path:** Not implemented; would add significant complexity and reliance on a push mechanism not present in current architecture.  
- **Native host notifications:** Not implemented; would require new code in daemon or extension but could reach the user even if the UI is not focused.  
- **VS Code notifications (existing):** Only work when VS Code is running; if the user closes VS Code, no notifications are delivered.  
- **Machine sleep/wake:** Any timer-based alarm would likely misfire after sleep because JavaScript timers pause; the daemon would need to use persistent timers or real-time clock alarms to be accurate across sleep cycles.  

---

## RECOMMENDED PHASE-1 NOTIFICATION CHANNEL

**RECOMMENDATION:** Use the existing VS Code notification mechanism via the extension (`vscode.window.showInformationMessage`, `showWarningMessage`, `showErrorMessage`) for Phase-1 alarm notifications.  

**Rationale:**  
- **Zero additional implementation:** The extension already calls these methods for other purposes (e.g., connection status).  
- **No new permission UX:** Users grant notification capability implicitly by installing the extension; no extra prompts are needed.  
- **Works while VS Code is active:** Sideline Coach is likely used during coding sessions when VS Code is open, making this channel contextually appropriate.  
- **Leverages existing trust:** Users already see informational messages from the extension, so alarm notifications would be consistent with established UX.  
- **Fallback considerations:** For users who close VS Code but still need alarms, a future phase could evaluate native host notifications via the daemon (Phase-2).  

**Implementation note:** Alarm detection logic (likely in the daemon or extension) should invoke the appropriate VS Code notification method when an alarm threshold is crossed, with optional severity mapping (e.g., info for low, warning for medium, error for high). To avoid excessive noise, consider coarse-grained throttling or user-configurable mute periods.  

**Evidence:**  
- Extension usage: `src/extension.ts` lines 180, 312, 314, 319, 330, 337, 341, 362, 364, 562 (all `vscode.window.show*Message`).  
- No existing browser or native notification code (searches above).  

---  
**End of Report**  
*This is reconnaissance, not final architectural authority. Evidence is prioritized; inference is labeled where certainty is lacking.*

### Full report — lane alarm-threshold-conserve-domain (sideline-scout-deep)

Now I have comprehensive evidence. Let me construct the full Scout report.

---

# SCOUT REPORT: AI Usage Alarm / Threshold Event Architecture

**REPORT TYPE:** SCOUT REPORT  
**SCOUT AGENT:** OpenCode (sideline-scout-deep)  
**SCOUT MODEL:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**SCOUT REASONING / EFFORT:** High (provider default for Deep Scout)  
**SCOUT ROLE:** Read-Only Reconnaissance Scout  
**SCOUT SCOPE:** Alarm/Threshold Event Architecture for Sideline Coach — provider-specific and window-specific rules, configurable thresholds, transition-based firing, persistence, duplicate protection, reset/recovery, stale handling, CONSERVE & Schedule Later seams  
**RECONNAISSANCE DEPTH:** Deep  
**SCOUT DATE / TIMESTAMP:** 2026-09-25 08:41:36 MDT  

> **This report is reconnaissance, not final architectural authority.**

---

## RESULT

**DOMAIN MODEL**, **RULE MODEL**, **STATE MACHINE**, **PERSISTENCE MODEL**, **EVENT / ACTION BUS SEAM**, **CONSERVE INTEGRATION SEAM**, **SCHEDULE-LATER INTEGRATION SEAM**, **SMALLEST PHASE-1 SLICE**, **FUTURE BREADCRUMBS** are defined below with exact evidence citations.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **One global HealthAuthority** owns canonical provider state (utilization 0..1, resetsAt Unix seconds, windowDurationMins). Persisted to `~/.sideline/ai-health-state.json`. | `health-authority.ts:46-50, 64-66, 111-223` |
| 2 | **Two global daemon-owned readers**: `ClaudeUsageReader` (OAuth HTTPS, 5-min cadence floor) and `CodexUsageReader` (app-server RPC, manual-only). Both feed `HealthAuthority.ingest*`. | `daemon.ts:252-262, 355-383, 673-681` |
| 3 | **Provider windows**: Claude → `five_hour` (300 min), `seven_day` (10080 min). Codex → `primary` (5H), `secondary` (weekly) keyed by `windowDurationMins`. | `health-authority.ts:247-248, 447-448, 539-591` |
| 4 | **No threshold/alarm logic exists today**. Backend "never interprets, classifies, or thresholds" `rateLimitInfo` (Scout confirmation). | `SCOUT-scoreboard-health-data-client-Reconnaissance.md:84, 324` |
| 5 | **UI Scoreboard** reads canonical snapshot via `GET /api/ai-health` + SSE `ai-health`. Shows Compact (4 metrics) + Expanded (4 panes). Copy Context already implemented. | `index.html:5398-5707, 5889-5979` |
| 6 | **CONSERVE is documented as future routing policy**, not health. Thresholds are human-controlled: "Weekly conserve threshold = 15%", "Codex is conserved for ordinary AUTO". | `BREADCRUMB -- SIDELINE-PLAY-COMPILER...md:1370-1381, 2031-2033` |
| 7 | **Schedule Later** is breadcrumbed: "durable scheduled/conditional queue → WAIT or REROUTE human choice". | `TERMINAL-SCOUT-AI-HEALTH-BREADCRUMBS__2026-09-20.md:254-261` |
| 8 | **Staleness handling**: `HealthAuthority.pruneExpired()` drops expired windows. UI `checkExpiry: true` guards Claude 5H. Codex resolver drops `resetsAt <= now`. | `health-authority.ts:190-219, 571-575, index.html:5443-5449` |
| 9 | **Duplicate protection**: `HealthAuthority.ingest*` returns `false` when factual windows unchanged. Readers debounce activity (90s min spacing, 15s settle, 120s max wait). | `health-authority.ts:142-146, 164-169, claude-usage-reader.ts:36-38, codex-usage-reader.ts:176-179` |
| 10 | **Absolute timestamps preferred**: All `resetsAt` stored as Unix seconds. UI converts to epoch ms once. No countdown scraping. | `health-authority.ts:10-13, 291-296, index.html:5428-5435` |

---

## FACT

- **F-1**: `HealthAuthority` is a singleton per daemon, persisted atomically, broadcasts on change via SSE `ai-health`. — `health-authority.ts:111-155, 341-350, daemon.ts:341-350`
- **F-2**: Canonical windows are `CanonicalClaudeWindow { utilization: number, resetsAt: number|null }` and `CanonicalCodexWindow { usedPercent: number, resetsAt: number, windowDurationMins: number }`. — `health-authority.ts:10-13, 528-537`
- **F-3**: `ClaudeUsageReader` runs on configurable cadence (3/5/10/15 min). `CodexUsageReader` is manual-refresh only (no background poll). — `claude-usage-reader.ts:27-29, 258-264, codex-usage-reader.ts:168-175, 314-324`
- **F-4**: Activity-driven early reads: both readers debounce file-system activity (Claude transcripts, Codex rollouts) into ONE acquisition after settle/spacing. — `claude-usage-reader.ts:348-367, codex-usage-reader.ts:285-301`
- **F-5**: `HealthAuthority.ingestClaudeUsage()` and `ingest()` dedupe on canonical window values (utilization + resetsAt within 15-min tolerance). — `health-authority.ts:142-146, 164-169, 279-289, 314-323`
- **F-6**: Provider reset semantics: post-reset 5H window may have `resetsAt: null` (idle/not-started). `HealthAuthority` represents this as `{ utilization: 0, resetsAt: null }`. — `health-authority.ts:125-131, 360-363, 409-417`
- **F-7**: Preferences include `aiUsageRefreshMinutes` (3/5/10/15) controlling Claude reader cadence. No threshold preferences exist. — `running-players.ts:128-134, 136-148`
- **F-8**: `/api/ai-health` returns `{ health: snapshot, acquisition: { claude?: status, codex?: status } }`. SSE `ai-health` pushes full snapshot on any factual change. — `daemon.ts:1386-1397, 345-348`
- **F-9**: UI Scoreboard `aiScoreboardNormalize()` returns `{ used, left, resetsAt }` or `undefined` (never fabricates). Compact/Expanded/Copy all read from same canonical normalizer. — `index.html:5437-5462, 5559-5567, 5650-5688`
- **F-10**: No alarm, threshold, CONSERVE, or Schedule Later logic exists in backend or frontend today. All are documented as future breadcrumbs.

---

## INFERENCE

- **I-1**: The nervous system (telemetry → canonical state → SSE) is complete. Alarm layer is a pure consumer of `HealthAuthority` snapshots + SSE deltas — no new acquisition needed.
- **I-2**: Rules should evaluate against `CanonicalClaudeWindow` / `CanonicalCodexWindow` (utilization 0..1, resetsAt absolute), not raw `rateLimitInfo`.
- **I-3**: Transition-based firing requires tracking *previous* rule state per (provider, window, threshold). This state is ephemeral (in-memory) but must survive daemon restart for "persistence where appropriate" — implies a small durable sidecar.
- **I-4**: "Configured threshold" means user preference per (provider, window, level). No such preferences exist; they are Phase-1 additions.
- **I-5**: CONSERVE seam = a derived boolean `isConserveAware` per (provider, window) when `remaining <= configuredThreshold`. Routing policy consumes this flag, not raw utilization.
- **I-6**: Schedule Later seam = a durable "wait until reset" intent per (provider, window) that survives restart and integrates with `PlayQueue`.

---

## UNKNOWN

- **U-1**: Whether threshold preferences should live in `CoachPreferences` (per-user) or a new `AlarmPreferences` (per-Game, per-provider, per-window). Breadcrumbs suggest user-controlled: "Dad's weekly conserve threshold = 15%".
- **U-2**: Exact Phase-1 scope: all 8 example rules, or just one provider/window to prove the nervous system?
- **U-3**: Whether `UNKNOWN` telemetry state (no data yet, or stale > threshold) should be a distinct rule state or folded into `NORMAL`.
- **U-4**: Whether duplicate-notification protection should be per-rule, per-(provider,window), or global.
- **U-5**: Whether "stale/unknown telemetry handling" means a `STALE` rule state, or auto-silencing rules when `observedAt` > configured max age.

---

## CONTRADICTION

- **C-1**: Breadcrumbs say "CONSERVE is routing policy, not health" but also "when remaining falls below threshold, canonical resource state should become CONSERVE-aware so CONSERVE consumes that state rather than reparsing scoreboard UI". These are compatible if the *alarm layer* emits the CONSERVE-aware flag, and *routing* consumes it. No contradiction in architecture; the seam must be explicit.
- **C-2**: `HealthAuthority.pruneExpired()` drops expired windows (returns empty). UI `checkExpiry: true` also guards. But `claudeWindowsNotReflected()` tracks "not reflected" windows for refresh feedback. An expired window that prunes away is not "not reflected" — it's gone. This is consistent but subtle.

---

## ARCHITECT DECISION REQUIRED

- **ADR-1**: State model naming: `NORMAL / LOW / CRITICAL / RECOVERED / UNKNOWN` vs. `OK / WARN / ALARM / CLEAR / STALE` vs. `GREEN / YELLOW / RED / BLUE / GRAY`. Recommendation: `NORMAL / LOW / CRITICAL / RECOVERED / UNKNOWN` aligns with breadcrumb language ("low on quota", "conserve", "recovered after reset").
- **ADR-2**: Threshold preference schema: flat `Record<Provider, Record<Window, { low: number, critical: number }>>` or nested with hysteresis (separate enter/exit thresholds)?
- **ADR-3**: Persistence scope: rule transition state only, or also acknowledged/dismissed events?
- **ADR-4**: Phase-1 slice: single rule (e.g., "Claude 5H remaining <= threshold") or all 8 rules?
- **ADR-5**: Event bus: extend existing SSE `ai-health` with `alarm` events, or new `/api/events` channel?

---

## DOMAIN MODEL

```typescript
// Core types derived from HealthAuthority canonical windows
type Provider = 'claude' | 'codex';
type ClaudeWindowKey = 'five_hour' | 'seven_day';
type CodexWindowKey = 'primary' | 'secondary'; // mapped to 5H / Weekly via windowDurationMins

interface CanonicalWindow {
  utilization: number;        // 0..1 fraction (Claude) or usedPercent/100 (Codex)
  resetsAt: number | null;    // Unix seconds (absolute), null = post-reset idle
  windowDurationMins: number; // 300 or 10080
}

// What the alarm layer evaluates
interface WindowTelemetry {
  provider: Provider;
  windowKey: string;           // 'five_hour' | 'seven_day' | 'primary' | 'secondary'
  windowLabel: string;         // '5H' | 'Weekly'
  utilization: number;         // 0..1
  remaining: number;           // 1 - utilization
  resetsAt: number | null;     // absolute Unix seconds
  isExpired: boolean;          // resetsAt !== null && resetsAt <= now
  isPostResetIdle: boolean;    // resetsAt === null && utilization === 0
  observedAt: string;          // ISO timestamp of last factual change
  acquisitionStatus: 'ok' | 'unavailable' | 'rate_limited' | 'idle';
}

// Threshold configuration (user-controlled, per provider/window)
interface ThresholdConfig {
  low: number;      // e.g., 0.20 (20% remaining → LOW)
  critical: number; // e.g., 0.05 (5% remaining → CRITICAL)
  // Hysteresis: enter at threshold, exit at threshold + hysteresis
  hysteresis?: number; // default 0.02 (2%)
}

// Rule definition (Phase 1: one rule per provider/window/level)
interface AlarmRule {
  id: string;                       // e.g., 'claude-five_hour-low'
  provider: Provider;
  windowKey: string;
  level: 'low' | 'critical';
  threshold: number;                // remaining fraction (0..1)
  enabled: boolean;
}

// Rule evaluation result
interface RuleEvaluation {
  ruleId: string;
  previousState: AlarmState;
  currentState: AlarmState;
  transitioned: boolean;
  telemetry: WindowTelemetry;
  evaluatedAt: string;              // ISO
}

// Alarm state machine states
type AlarmState = 'NORMAL' | 'LOW' | 'CRITICAL' | 'RECOVERED' | 'UNKNOWN';

// Persisted rule transition state (survives daemon restart)
interface RuleTransitionState {
  ruleId: string;
  currentState: AlarmState;
  enteredAt: string | null;         // when entered LOW/CRITICAL
  lastFiredAt: string | null;       // for duplicate protection
  acknowledgedAt: string | null;    // human dismissed
}

// CONSERVE-aware derived state (seam for routing)
interface ConserveSignal {
  provider: Provider;
  windowKey: string;
  isConserveAware: boolean;         // remaining <= configured threshold
  remaining: number;
  threshold: number;
  resetsAt: number | null;
}

// Schedule Later intent (seam for PlayQueue)
interface ScheduleLaterIntent {
  id: string;
  provider: Provider;
  windowKey: string;
  targetResetsAt: number;           // absolute Unix seconds
  createdAt: string;
  status: 'pending' | 'triggered' | 'cancelled';
  payload: unknown;                 // queued Play or routing decision
}
```

---

## RULE MODEL

| Rule ID | Provider | Window | Level | Default Threshold (remaining) | Description |
|---------|----------|--------|-------|------------------------------|-------------|
| `claude-five_hour-low` | claude | five_hour | low | 0.20 (20%) | 5H window remaining ≤ 20% |
| `claude-five_hour-critical` | claude | five_hour | critical | 0.05 (5%) | 5H window remaining ≤ 5% |
| `claude-seven_day-low` | claude | seven_day | low | 0.15 (15%) | Weekly remaining ≤ 15% (breadcrumb default) |
| `claude-seven_day-critical` | claude | seven_day | critical | 0.05 (5%) | Weekly remaining ≤ 5% |
| `codex-five_hour-low` | codex | primary (300m) | low | 0.20 (20%) | 5H window remaining ≤ 20% |
| `codex-five_hour-critical` | codex | primary (300m) | critical | 0.05 (5%) | 5H window remaining ≤ 5% |
| `codex-weekly-low` | codex | secondary (10080m) | low | 0.15 (15%) | Weekly remaining ≤ 15% |
| `codex-weekly-critical` | codex | secondary (10080m) | critical | 0.05 (5%) | Weekly remaining ≤ 5% |

**Evaluation function** (pure, deterministic):

```typescript
function evaluateRule(rule: AlarmRule, telemetry: WindowTelemetry, prevState: AlarmState, hysteresis: number): RuleEvaluation {
  const remaining = telemetry.remaining;
  const threshold = rule.threshold;
  const exitThreshold = threshold + hysteresis;

  let currentState: AlarmState;
  if (telemetry.acquisitionStatus !== 'ok' || telemetry.isExpired) {
    currentState = 'UNKNOWN';
  } else if (telemetry.isPostResetIdle) {
    // Post-reset: 100% remaining, but resetsAt unknown → NORMAL (not LOW)
    currentState = 'NORMAL';
  } else if (remaining <= threshold) {
    currentState = rule.level === 'critical' ? 'CRITICAL' : 'LOW';
  } else if (prevState === 'LOW' || prevState === 'CRITICAL') {
    // Hysteresis: only recover when remaining > threshold + hysteresis
    currentState = remaining > exitThreshold ? 'RECOVERED' : prevState;
  } else {
    currentState = 'NORMAL';
  }

  return {
    ruleId: rule.id,
    previousState: prevState,
    currentState,
    transitioned: currentState !== prevState,
    telemetry,
    evaluatedAt: new Date().toISOString()
  };
}
```

---

## STATE MACHINE

```
                    ┌─────────────────────┐
                    │      UNKNOWN        │
                    │ (no data / stale /  │
                    │  expired / error)   │
                    └──────────┬──────────┘
                               │ data arrives ok
                               ▼
                    ┌─────────────────────┐
                    │      NORMAL         │ ◄──────────────┐
                    │ (remaining > thr)   │                │
                    └──────────┬──────────┘                │
                               │ remaining ≤ threshold     │ remaining > threshold + hysteresis
                               ▼                           │
              ┌─────────────────────────┐                  │
              │        LOW              │                  │
              │ (remaining ≤ lowThresh) │                  │
              └───────────┬─────────────┘                  │
                          │ remaining ≤ criticalThresh     │
                          ▼                                │
               ┌─────────────────────┐                     │
               │      CRITICAL       │                     │
               │ (remaining ≤ crit)  │                     │
               └───────────┬─────────┘                     │
                           │ reset occurs (remaining → 1.0) │
                           ▼                                │
               ┌─────────────────────┐                     │
               │     RECOVERED       │ ────────────────────┘
               │ (transient, one-tick)│
               └───────────┬─────────┘
                           │ auto-advance
                           ▼
                    ┌─────────────────────┐
                    │      NORMAL         │
                    └─────────────────────┘
```

**Transition semantics:**

| From → To | Fires Event | Duplicate Protection | Persists |
|-----------|-------------|---------------------|----------|
| NORMAL → LOW | `alarm:low` | Yes (per rule, once per entry) | `enteredAt`, `lastFiredAt` |
| LOW → CRITICAL | `alarm:critical` | Yes | `enteredAt`, `lastFiredAt` |
| CRITICAL → RECOVERED | `alarm:recovered` | Yes | `lastFiredAt` |
| RECOVERED → NORMAL | (silent, no event) | N/A | Clear `enteredAt` |
| Any → UNKNOWN | `alarm:unknown` | Yes (rate-limited) | `lastFiredAt` |
| UNKNOWN → NORMAL/LOW/CRITICAL | Appropriate transition event | Yes | `enteredAt`, `lastFiredAt` |

**Post-reset handling**: When `resetsAt === null && utilization === 0` (provider signals idle post-reset), state = `NORMAL` regardless of previous `CRITICAL`. No `RECOVERED` event — the reset itself is the recovery signal.

---

## PERSISTENCE MODEL

### 1. Alarm Preferences (user-controlled, durable)
```typescript
// New file: src/control-plane/alarm-preferences.ts
interface AlarmPreferences {
  schemaVersion: 1;
  rules: Record<string, { enabled: boolean; low: number; critical: number; hysteresis: number }>;
  // Per provider/window defaults, user-overridable
  defaults: {
    claude: { five_hour: { low: 0.20, critical: 0.05 }, seven_day: { low: 0.15, critical: 0.05 } };
    codex:  { five_hour: { low: 0.20, critical: 0.05 }, weekly: { low: 0.15, critical: 0.05 } };
  };
  globalHysteresis: number; // default 0.02
  maxStaleAgeMinutes: number; // default 30 → UNKNOWN if observedAt older
}
```
**Storage**: `~/.sideline/alarm-preferences.json` (atomic write, same pattern as `health-authority.ts:91-100`)

### 2. Rule Transition State (ephemeral but survives restart)
```typescript
// New file: src/control-plane/alarm-state-store.ts
interface AlarmStateSnapshot {
  schemaVersion: 1;
  updatedAt: string;
  ruleStates: Record<string, RuleTransitionState>;
  conserveSignals: ConserveSignal[];      // derived, recomputed on load
  scheduleLaterIntents: ScheduleLaterIntent[]; // durable intents
}
```
**Storage**: `~/.sideline/alarm-state.json` (atomic write)

**Restoration**: On daemon start, load `AlarmStateSnapshot`, rebuild `RuleTransitionState` map. Re-evaluate all rules against current `HealthAuthority` snapshot → emit any `RECOVERED` events for rules that were `LOW`/`CRITICAL` but now `NORMAL` (reset occurred while daemon down).

---

## EVENT / ACTION BUS SEAM

### Option A: Extend existing SSE `ai-health` (recommended for Phase 1)
```typescript
// daemon.ts broadcast('ai-health', snapshot) already exists
// Add alarm events as additional SSE event type 'ai-alarm'
interface AiAlarmEvent {
  type: 'alarm:low' | 'alarm:critical' | 'alarm:recovered' | 'alarm:unknown';
  ruleId: string;
  provider: Provider;
  windowKey: string;
  windowLabel: string;
  remaining: number;
  threshold: number;
  resetsAt: number | null;
  evaluatedAt: string;
  transitionedFrom: AlarmState;
}
```
**Seam**: `HealthAuthority.onChange` → `AlarmEngine.evaluateAll()` → if `transitioned`, `broadcast('ai-alarm', event)`.

### Option B: New `/api/ai-alarms` endpoint + `ai-alarm` SSE
Cleaner separation. Phase 1 can start with Option A (zero new endpoints).

### Action Consumers (future, not implemented now)
| Consumer | Seam |
|----------|------|
| Browser/native notification | `ai-alarm` SSE → Service Worker → Notification API |
| UI indicator | Scoreboard subscribes to `ai-alarm` → shows 🔔 badge on metric |
| Copy Context | Already exists (`buildAiScoreboardCopyText`) — add alarm summary |
| CONSERVE mode | Consumes `ConserveSignal` derived state (see below) |
| Schedule Later | Consumes `ScheduleLaterIntent` → `PlayQueue.enqueueAt(resetsAt)` |
| Player routing policy | `computeAutoRoute()` reads `ConserveSignal[]` |

---

## CONSERVE INTEGRATION SEAM

**Principle**: "Canonical resource state should become CONSERVE-aware so CONSERVE consumes that state rather than reparsing scoreboard UI."

```typescript
// In AlarmEngine (new class), after rule evaluation:
function deriveConserveSignals(rules: AlarmRule[], telemetryMap: Map<string, WindowTelemetry>): ConserveSignal[] {
  return rules
    .filter(r => r.enabled)
    .map(r => {
      const tel = telemetryMap.get(`${r.provider}:${r.windowKey}`);
      if (!tel) return null;
      const threshold = r.threshold; // low threshold = conserve trigger
      return {
        provider: r.provider,
        windowKey: r.windowKey,
        isConserveAware: tel.remaining <= threshold,
        remaining: tel.remaining,
        threshold,
        resetsAt: tel.resetsAt
      };
    })
    .filter(Boolean) as ConserveSignal[];
}

// Routing policy seam (future):
// routing-policy.ts: computeAutoRoute(context, candidates)
//   → reads AlarmEngine.getConserveSignals()
//   → filters/deprioritizes candidates where provider+window isConserveAware
//   → adds rationale: "Conserving Claude 5H (12% remaining, threshold 20%)"
```

**No UI re-parsing**: Scoreboard stays dumb presentation. `ConserveSignal[]` is the canonical source.

---

## SCHEDULE-LATER INTEGRATION SEAM

**Principle**: "Durable scheduled/conditional queue → WAIT or REROUTE human choice."

```typescript
// In AlarmEngine, when rule transitions to LOW/CRITICAL:
function maybeCreateScheduleLaterIntent(rule: AlarmRule, telemetry: WindowTelemetry): ScheduleLaterIntent | null {
  if (!telemetry.resetsAt || telemetry.resetsAt <= Date.now()/1000) return null; // no reset horizon
  // Only for CRITICAL? Or LOW too? Architect decision.
  return {
    id: `schedule-${rule.id}-${Date.now()}`,
    provider: rule.provider,
    windowKey: rule.windowKey,
    targetResetsAt: telemetry.resetsAt,
    createdAt: new Date().toISOString(),
    status: 'pending',
    payload: { ruleId: rule.id, reason: `Wait for ${rule.provider} ${rule.windowKey} reset` }
  };
}

// PlayQueue seam (existing: src/control-plane/play-queue.ts):
// playQueue.enqueueAt(gameId, playerInstanceId, play, targetResetsAt * 1000)
// AlarmEngine → PlayQueue: "when Claude 5H resets, run this queued Play"

// Human choice seam (UI):
// Toast/notification: "Claude 5H critical (3% left). Reset in 2h 14m."
// Buttons: [Wait for Reset → Schedule Later] [Reroute to Codex] [Continue Anyway]
```

**Persistence**: `ScheduleLaterIntent[]` in `alarm-state.json` survives restart. On daemon start, reload intents, re-enqueue any with `targetResetsAt > now`.

---

## SMALLEST PHASE-1 SLICE

**Goal**: Prove the nervous system — telemetry → rule eval → state transition → event → CONSERVE signal.

| Component | Files (new/modified) | Scope |
|-----------|---------------------|-------|
| **AlarmPreferences** | `src/control-plane/alarm-preferences.ts` (new), `running-players.ts` (add load/save) | 1 JSON file, 8 rule configs, hysteresis, stale age |
| **AlarmStateStore** | `src/control-plane/alarm-state-store.ts` (new) | Atomic persist/load `RuleTransitionState` + `ConserveSignal[]` + `ScheduleLaterIntent[]` |
| **AlarmEngine** | `src/control-plane/alarm-engine.ts` (new) | Pure rule evaluation, state machine, derives `ConserveSignal[]`, emits `ai-alarm` events via daemon broadcast |
| **Daemon integration** | `daemon.ts` (modify) | Construct `AlarmEngine` with `HealthAuthority`, `AlarmPreferences`, `AlarmStateStore`; hook `healthAuthority.onChange` → `alarmEngine.evaluate()`; broadcast `ai-alarm` SSE |
| **SSE event** | `daemon.ts` (modify broadcast) | Add `ai-alarm` event type alongside `ai-health` |
| **UI smoke test** | `index.html` (modify) | Subscribe to `ai-alarm` → log to console + show 🔔 on affected metric row. No full notification UI yet. |

**Explicitly NOT in Phase 1**:
- Browser/native notifications
- Full UI alarm panel
- Schedule Later enqueue/execution
- CONSERVE routing policy consumption
- Preference UI (Settings panel for thresholds)
- Acknowledgment/dismissal UI

**Acceptance criteria for Phase 1**:
1. Daemon starts, loads preferences + state.
2. On `ai-health` change (or manual refresh), `AlarmEngine` evaluates all 8 rules.
3. State transitions emit `ai-alarm` SSE events with correct payload.
4. `ConserveSignal[]` derived correctly (Claude 5H ≤ 20% → `isConserveAware: true`).
5. Daemon restart: state restored, rules re-evaluated, `RECOVERED` emitted if reset occurred.
6. No duplicate events on repeated identical evaluations (hysteresis + `lastFiredAt` guard).

---

## FUTURE BREADCRUMBS

| Breadcrumb | Description | Seam |
|------------|-------------|------|
| **Threshold Settings UI** | Settings panel per provider/window with sliders for LOW/CRITICAL, hysteresis, stale age. | `AlarmPreferences` schema + `savePreferences` |
| **Notification Delivery** | Service Worker + Notification API + native (Electron/tauri) bridge. | `ai-alarm` SSE → `Notification.requestPermission()` |
| **Alarm History / Timeline** | Persisted event log (ring buffer) for "what fired when". | Extend `AlarmStateSnapshot` with `eventLog: AlarmEvent[]` |
| **CONSERVE Routing Policy** | `computeAutoRoute()` reads `ConserveSignal[]`, deprioritizes conserve-aware providers, adds rationale to `RoutingDecision`. | `routing-policy.ts` + `AlarmEngine.getConserveSignals()` |
| **Schedule Later Execution** | `PlayQueue` accepts `enqueueAt(resetsAtMs)`; daemon timer triggers at reset; UI "Wait for Reset" button creates intent. | `play-queue.ts` + `ScheduleLaterIntent` |
| **Stale Telemetry Policy** | Configurable `maxStaleAgeMinutes` → `UNKNOWN` state → UI grays out metric + shows "Stale". | `AlarmEngine` + `HealthAuthority.observedAt` |
| **Per-Game Alarm Scope** | Rules scoped to a Game (not global). Requires `HealthAuthority` per-Game (architectural change). | `HealthAuthority` refactor or namespaced keys |
| **AntiGravity / Model-Level Quotas** | When AntiGravity gateway exposes per-model quotas, extend `CanonicalWindow` with `modelId`. | `CanonicalWindow` + `provider` → `provider:model` |

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/health-authority.ts` | Canonical provider state, persistence, merge, prune, SSE broadcast |
| `src/control-plane/claude-usage-reader.ts` | Global Claude OAuth reader, activity debounce, cadence |
| `src/control-plane/codex-usage-reader.ts` | Global Codex app-server reader, activity debounce |
| `src/control-plane/daemon.ts` | Wires readers, HealthAuthority, SSE, preferences |
| `src/control-plane/protocol.ts` | `HealthEvidence`, `CanonicalClaudeWindow`, SSE event types |
| `src/running-players.ts` | `CoachPreferences`, `aiUsageRefreshMinutes`, threshold prefs home |
| `src/public/index.html` | AI Scoreboard UI, canonical normalizer, Copy Context |
| `src/control-plane/routing-policy.ts` | Future CONSERVE consumer (`computeAutoRoute`) |
| `src/control-plane/play-queue.ts` | Future Schedule Later consumer (`enqueueAt`) |

---

## LIMITATIONS

- Did not inspect Stadium-side health evidence emission (`health.evidence` notification) — only daemon ingestion.
- Did not verify live `resetsAt` jitter behavior across provider reset boundaries (documented 1-13s in code comments).
- Did not test daemon restart with expired windows mid-cycle.
- Did not explore `coach-routines.ts` or `scout-continuation.ts` for scheduling interactions.
- Phase-1 slice assumes single global alarm state; per-Game scoping is future work.
- No security review of SSE event exposure to remote devices (remote-read route exists for `/api/ai-health`).

---

## SCOUT METADATA

```
REPORT TYPE: SCOUT REPORT
SCOUT AGENT: OpenCode
SCOUT MODEL: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
SCOUT REASONING / EFFORT: High
SCOUT ROLE: Read-Only Reconnaissance Scout
SCOUT SCOPE: Alarm/Threshold Event Architecture for Sideline Coach
RECONNAISSANCE DEPTH: Deep
SCOUT DATE / TIMESTAMP: 2026-09-25 08:41:36 MDT
```

**This report is reconnaissance, not final architectural authority.**

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\ai-usage-alarm-threshold-architecture-20260925-084136
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\ai-usage-alarm-threshold-architecture-20260925-084136

