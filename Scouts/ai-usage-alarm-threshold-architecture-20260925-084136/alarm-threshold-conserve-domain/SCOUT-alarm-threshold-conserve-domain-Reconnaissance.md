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
