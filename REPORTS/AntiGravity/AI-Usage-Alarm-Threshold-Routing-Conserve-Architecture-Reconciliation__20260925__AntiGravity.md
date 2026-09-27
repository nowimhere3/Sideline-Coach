# ANTIGRAVITY ARCHITECTURE RECONCILIATION
## AI Usage Alarms · Thresholds · Routing · CONSERVE · Schedule Later

**Target Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Date:** September 25, 2026  
**Agent:** AntiGravity (Architecture & Decision Layer)  
**Formation Source Reports Reconciled:**
1. `SCOUT-telemetry-clock-source-Reconnaissance.md`
2. `SCOUT-notification-runtime-capability-Reconnaissance.md`
3. `SCOUT-alarm-threshold-conserve-domain-Reconnaissance.md`

**Status:** ARCHITECTURAL RECONCILIATION & DECISION SPECIFICATION (Zero code modified, read-only)

---

## 1. EXECUTIVE VERDICT

**VERDICT: ARCHITECTURAL GO (SAFE WITH SPECIFIED SEAMS)**

The Scouts correctly mapped the factual telemetry pipeline (`HealthAuthority` as singleton authority, canonical Unix-second `resetsAt`, fractional `utilization`), but left critical reconciliation gaps around **clock-driven reset transitions**, **sleep/wake survival**, **alarm notification delivery in Phase 1**, and the **IA boundary between Observational Scoreboard telemetry and Prescriptive Routing/Alarms**.

### Core Reconciled Architecture
1. **The Pipeline is a Nervous System, Not a Timer:**
   `Canonical Telemetry (or Clock Horizon) → Resource Policy Evaluation → State Transition → Domain Event → Multi-Consumer Dispatch`
2. **Two Decoupled Trigger Classes:**
   - **Class A (Telemetry-Driven):** Triggered reactively by `HealthAuthority.onChange`. Evaluates remaining usage % against Dad's thresholds (`NORMAL → LOW → CRITICAL`). Fires strictly on state change (deduplicated).
   - **Class B (Clock-Driven Reset Horizon):** Triggered by an absolute timestamp boundary (`now >= resetsAt`) evaluated by a daemon-level **Clock Horizon Engine**. Does NOT wait for Anthropic/OpenAI telemetry to arrive. Fires immediately when the reset boundary is reached (even when offline, sleeping, or idle).
3. **Settings IA Consolidation:**
   The existing planned Settings card **"Routing"** is renamed **"Routing & Alarms"**. Observational telemetry remains strictly in the Scoreboard card; prescriptive behavioral policies (Thresholds, Alarms, CONSERVE, AUTO Routing, Schedule Later) live in "Routing & Alarms".
4. **Phase 1 Delivers a Working Alarm:**
   Contrary to the Deep Scout's suggestion to exclude notifications from Phase 1, Phase 1 delivers **both** the core event/state engine **and** a genuine user-visible alarm path via the existing VS Code Notification channel + Webview Banner.

---

## 2. SOURCE-OF-TRUTH MAP

| Concept | Authority / Owner | Source File | Representation / Format | Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Canonical Usage & Resets** | `HealthAuthority` | `src/control-plane/health-authority.ts` | `CanonicalClaudeWindow` (utilization: `0..1`, resetsAt: Unix sec `null \| number`), `CanonicalCodexWindow` (`usedPercent`, `resetsAt`, `windowDurationMins`) | **FACT.** Single global authority. Persisted to `~/.sideline/ai-health-state.json`. Deduplicated. Never scraped from UI. |
| **Telemetry Ingestion (Claude)** | `ClaudeUsageReader` + Stadium Push | `src/control-plane/claude-usage-reader.ts` | HTTPS OAuth GET `/api/oauth/usage` + native `rate_limit_event` | **FACT.** Cadence floor 3m (avoids 429). File activity debounced. |
| **Telemetry Ingestion (Codex)** | `CodexUsageReader` + App-Server Push | `src/control-plane/codex-usage-reader.ts` | `account/rateLimits/read` RPC + native `account/rateLimits/updated` | **FACT.** Session-bound + manual refresh. |
| **Threshold & Alarm Preferences** | `CoachPreferences` | `src/running-players.ts` | `AlarmPreferences` sub-tree in `~/.sideline/preferences.json` | **DECISION.** Dad is the sole authority over thresholds. Default numbers are defaults only. |
| **Alarm State & Transition Memory** | `AlarmEngine` / State Store | `src/control-plane/alarm-engine.ts` | `Record<RuleId, RuleTransitionState>` persisted to `~/.sideline/alarm-state.json` | **DECISION.** In-memory state with minimal durable sidecar to survive restart and prevent duplicate firings. |
| **Clock Horizon (Next Reset)** | `AlarmEngine` Clock Watcher | `src/control-plane/alarm-engine.ts` | Absolute Unix seconds array `resetsAt[]` | **DECISION.** Evaluated against wall-clock time; resilient to sleep/wake. |
| **CONSERVE Routing State** | `ResourcePolicyService` | `src/control-plane/resource-policy.ts` | Canonical `ProviderResourcePolicy` object (not raw %) | **DECISION.** Routing policy reads canonical conserve state, never Scoreboard DOM. |
| **Durable Schedule Later** | `PlayQueue` | `src/control-plane/play-queue.ts` | `QueuedPlay` with `deferredUntilReset` condition | **DECISION.** Persisted in `queue.json`; activated on reset domain event. |

---

## 3. THRESHOLD EVENT ARCHITECTURE (TRIGGER CLASS A)

### Mechanism
When new provider evidence is accepted into `HealthAuthority`:
1. `HealthAuthority.ingest*()` updates its canonical snapshot and calls `onChange(snapshot)`.
2. `AlarmEngine.evaluateTelemetry(snapshot)` evaluates active rules against the canonical windows.
3. For each provider and window (`claude:five_hour`, `claude:seven_day`, `codex:primary`, `codex:secondary`):
   - Computes `remaining = 1.0 - utilization`.
   - Compares against Dad's configured `low` and `critical` thresholds.
   - Evaluates against the previous persisted state for that rule.
4. **State Transition Detection:**
   - If `currentState !== previousState`, a transition has occurred.
   - A structured domain event (`AiUsageAlarmEvent`) is instantiated.
   - The engine updates its in-memory and durable transition record (`enteredAt`, `lastFiredState`, `lastFiredAt`).
   - The event is dispatched to all registered adapters.
5. **Deduplication Guarantee (Zero Spam):**
   - If `currentState === previousState`, **no event is emitted**.
   - Repeated snapshots at 24% remaining (or 23%, 22% while still in `LOW`) produce zero notifications.
   - Escalation (`LOW → CRITICAL`) produces exactly one `alarm:critical` event.

```
HealthAuthority.onChange
  ↓
Extract Canonical Windows (utilization 0..1, resetsAt Unix sec)
  ↓
Compare with Configured Rule Thresholds
  ↓
Transition Detected? (currentState != previousState)
  ├─ NO  → No-Op (Deduplicated; zero spam)
  └─ YES → Update RuleTransitionState → Emit Domain Event → Dispatch to Consumers
```

---

## 4. ABSOLUTE RESET-TIME ALARM ARCHITECTURE (TRIGGER CLASS B)

### The Fundamental Requirement
> *"Claude 5H resetsAt = 10:37 AM. At 10:37 AM, Sideline Coach must recognize that the reset boundary has passed EVEN IF no new provider telemetry arrives at that exact moment."*

`HealthAuthority.onChange` alone is completely blind to this because Anthropic does not push data when user is idle. Relying on a naive `setTimeout()` fails during computer sleep.

### The Reconciled Clock Horizon Architecture
`AlarmEngine` implements an **Absolute Timestamp Boundary Watcher**:

1. **Horizon Extraction:**
   On every telemetry ingestion and on daemon startup, `AlarmEngine` collects all distinct, future canonical `resetsAt` timestamps:
   `activeHorizons = [ { provider: 'claude', window: 'five_hour', resetsAt: 1727282220 }, ... ]`
2. **Next Boundary Scheduling:**
   Finds the nearest boundary: `nextTarget = min(activeHorizons.map(h => h.resetsAt))`.
   Calculates `delayMs = Math.max(0, (nextTarget * 1000) - Date.now())`.
   Sets a short-range, drift-safe timer: `clampedDelay = Math.min(delayMs, MAX_HEARTBEAT_MS)` (where `MAX_HEARTBEAT_MS = 60_000` / 1 minute).
3. **Coalesced Clock Heartbeat:**
   Every minute (or on clamped timer expiration), the engine runs `reconcileClockHorizons()`:
   - For each tracked horizon where `nowSec >= resetsAt`:
     - Checks whether this specific reset cycle was already processed:
       `if (ruleState.lastFiredResetCycle === resetsAt) continue;`
     - If not processed:
       - **Fires `alarm:reset_boundary_reached` event.**
       - Transitions state from `LOW` / `CRITICAL` back to `NORMAL`.
       - Emits `alarm:recovered` event.
       - Records `ruleState.lastFiredResetCycle = resetsAt` in persistent state.
4. **Subsequent Telemetry Arrival (Graceful Convergence):**
   When the provider eventually returns fresh telemetry (e.g. at 10:41 AM showing 0% utilization and a new future reset at 3:41 PM):
   - The engine observes `resetsAt > oldResetsAt`.
   - Because `lastFiredResetCycle` already recorded the 10:37 AM cycle and state is already `NORMAL`, **no duplicate reset alarm is fired**.
   - The engine simply registers the new 3:41 PM horizon for the next cycle.

---

## 5. SLEEP / WAKE / RESTART RECONCILIATION

| Scenario | What Happens Mechanically | Reconciliation / Defense |
| :--- | :--- | :--- |
| **Daemon running normally** | 60s clamped timer wakes at `resetsAt`. | Event fires at exact boundary second (±1s). State transitions to `NORMAL`. |
| **Browser active** | Webview receives SSE `ai-alarm` event. | UI shows toast/banner; Scoreboard updates without reload. |
| **Browser backgrounded / closed** | Daemon runs in background Node.js process. | Daemon evaluates horizon independently. Fires VS Code notification and updates durable state. |
| **VS Code active, no provider activity** | Telemetry is quiet. Clock Horizon Engine ticks. | Reset event fires right on schedule. VS Code notification displays. |
| **Computer sleeping across reset** | OS suspends Node.js timers. Time jumps forward e.g. 2 hours. | **Immediate Wake Reconciliation:** On OS wake, the 60s clamped heartbeat or any system tick runs. `now >= resetsAt` evaluates `true`. Reset alarm fires within seconds of laptop lid opening. |
| **Daemon restart after reset** | Daemon was stopped before reset, started after. | **Startup Horizon Audit:** During `AlarmEngine.start()`, it loads `alarm-state.json` and compares stored `resetsAt` against `Date.now()`. Recognizes missed reset, emits `alarm:reset_boundary_reached`, updates state to `NORMAL`, persists. |
| **Sideline Coach restart before reset** | Daemon restarts 30m before reset. | `alarm-state.json` restores `RuleTransitionState`. Re-registers future `resetsAt` into the Clock Horizon queue. Timer set. |
| **Late provider telemetry arrival** | 20 minutes after reset, user runs a command. Anthropic sends new usage. | `HealthAuthority` updates. `sameResetCycle()` matches or monotonicity advances. Since cycle was already cleared, no double alert. |

---

## 6. STATE MACHINE DECISION

### Canonical States
```
                    ┌─────────────────────────┐
                    │        UNKNOWN          │
                    │ (no data / stale proof) │
                    └────────────┬────────────┘
                                 │ valid data arrives
                                 ▼
                    ┌─────────────────────────┐
       ┌─────────── │         NORMAL          │ ◄─────────────────────────┐
       │            │  (remaining > lowThr)   │                           │
       │            └────────────┬────────────┘                           │
       │                         │ remaining <= lowThr                    │
       │                         ▼                                        │
       │            ┌─────────────────────────┐                           │
       │            │          LOW            │                           │
       │            │ (conserve recommended)  │                           │
       │            └────────────┬────────────┘                           │
       │                         │ remaining <= critThr                   │
       │                         ▼                                        │
       │            ┌─────────────────────────┐                           │
       │            │        CRITICAL         │                           │
       │            │  (urgent quota alarm)   │                           │
       │            └────────────┬────────────┘                           │
       │                         │                                        │
       │                         │ reset reached (now >= resetsAt)        │
       │                         │ OR telemetry reports utilization dropped│
       │                         ▼                                        │
       │            ┌─────────────────────────┐                           │
       │            │     RESET_REACHED /     │                           │
       │            │        RECOVERED        │ ──────────────────────────┘
       │            │   (TRANSIENT EVENT)     │   (transitions back to NORMAL)
       │            └─────────────────────────┘
       │
       │ telemetry older than maxStaleAgeMinutes (default: 30m)
       └──────────────────────────────────────────────────────────► to UNKNOWN
```

### Key Architectural Rulings:
1. **`RECOVERED` is an EVENT, NOT a Persistent State [DECISION]:**
   A persistent `RECOVERED` state is an architectural anti-pattern (it raises unanswerable questions: how many seconds does it stay recovered? what happens if usage occurs while "recovered"?). In Sideline Coach, once recovered, the resource is factually **`NORMAL`**. When transitioning from `LOW` or `CRITICAL` back to `NORMAL`, the engine emits the transient domain event `alarm:recovered` (or `alarm:reset_boundary_reached`).
2. **`UNKNOWN` vs `STALE` [DECISION]:**
   `UNKNOWN` is the sole canonical state for missing or unproven health. Stale telemetry (where `now - observedAt > maxStaleAgeMinutes`) transitions the rule state to `UNKNOWN` with metadata `reason: 'stale_telemetry'`. Healthy state is never assumed in the dark.
3. **Hysteresis Buffer [DECISION]:**
   A fixed **2% deadband** is applied to threshold exits to prevent boundary jitter (e.g. entering LOW at `≤ 20%`, exiting LOW only when `> 22%` or upon reset). Dad configures only the trigger threshold; the engine handles deadband internally.

---

## 7. PERSISTENCE DECISION

To guarantee durability without creating redundant shadow state:

### 1. User Preferences → `~/.sideline/preferences.json` (Existing Store)
Persisted via existing `savePreferences()` in [`src/running-players.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/running-players.ts):
```typescript
export interface AlarmPreferences {
  enabled: boolean;                      // Master alarm toggle
  notifyOnReset: boolean;                // Notify when window resets
  notifyOnThreshold: boolean;            // Notify when low/critical crossed
  channels: {
    vscode: boolean;                     // VS Code message (Phase 1)
    browser: boolean;                    // Browser Notification API (Phase 2)
  };
  rules: {
    claude_five_hour:  { low: number; critical: number }; // default: 0.20, 0.05
    claude_seven_day:  { low: number; critical: number }; // default: 0.15, 0.05
    codex_five_hour:   { low: number; critical: number }; // default: 0.20, 0.05
    codex_weekly:      { low: number; critical: number }; // default: 0.20, 0.05
  };
  maxStaleAgeMinutes: number;            // default: 30
}
```

### 2. Rule State Memory → `~/.sideline/alarm-state.json` (New Atomic File Store)
Dedicated state store beside `ai-health-state.json`:
```typescript
export interface AlarmDurableState {
  schemaVersion: 1;
  updatedAt: string;
  ruleStates: Record<string, {
    currentState: 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
    enteredAt: string | null;
    lastFiredState: string | null;
    lastFiredResetCycle: number | null; // Unix second of last fired reset
    acknowledgedAt: string | null;
  }>;
}
```
*Rule:* Telemetry percentages are **NOT** duplicated here. Only transition memory and cycle deduplication tokens survive restart.

---

## 8. EVENT CONTRACT

The engine produces a unified, strongly-typed domain event:

```typescript
export type AlarmEventType =
  | 'alarm:threshold_entered'
  | 'alarm:threshold_escalated'
  | 'alarm:reset_boundary_reached'
  | 'alarm:recovered'
  | 'alarm:stale';

export interface AiUsageAlarmEvent {
  eventId: string;                       // UUID
  type: AlarmEventType;
  provider: 'claude' | 'codex';
  windowKey: 'five_hour' | 'seven_day' | 'primary' | 'secondary';
  windowLabel: '5H' | 'Weekly';
  level: 'info' | 'warning' | 'critical';
  previousState: 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
  currentState: 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
  utilization: number;                   // 0..1
  remainingPercent: number;              // 0..100
  thresholdPercent?: number;             // Configured threshold that triggered it
  resetsAt: number | null;               // Absolute Unix seconds
  timestamp: string;                     // ISO
  message: string;                       // Dad-formatted notification string
}
```

*Deterministic Message Formatting:*
- `alarm:threshold_entered` → `"Claude 5H quota low (19% remaining). Resets in 1h 42m."`
- `alarm:threshold_escalated` → `"Claude 5H critical (4% remaining). Resets in 1h 42m."`
- `alarm:reset_boundary_reached` → `"Claude 5H window has reset. Full quota restored."`

---

## 9. NOTIFICATION ADAPTER DECISION

### Reconciled Channel Matrix
1. **VS Code Notification Adapter (`src/extension.ts`) [PHASE 1 - RECOMMENDED FIRST]:**
   - **Why First:** Zero new permission UX. Zero additional packages. Sideline Coach is run inside VS Code; Dad is actively coding in VS Code. `vscode.window.showWarningMessage` and `showInformationMessage` already work reliably across the codebase.
   - **Action Buttons in Toast:** Can include actionable buttons right in the VS Code popup (e.g., `["Switch to Codex", "Copy Context", "Dismiss"]`).
2. **Webview In-App Toast Adapter (`src/public/index.html`) [PHASE 1]:**
   - Broadcast via existing SSE stream (`broadcast('ai-alarm', event)`).
   - Renders a clean non-intrusive toast in the bottom-right of the Sideline webview.
3. **Browser Notification API Adapter (`Notification.requestPermission`) [PHASE 2]:**
   - Gated behind an explicit opt-in toggle under Settings.
   - Triggers standard OS banner via browser process. Requires browser to be open.
4. **Native Host / OS Notification (`node-notifier` / PowerShell / osascript) [PHASE 3 / FUTURE]:**
   - Daemon-level OS push when neither VS Code nor browser is focused.
5. **Remote Phone Push [FUTURE]:**
   - Relayed to paired mobile device via the relay daemon.

---

## 10. SETTINGS — ROUTING & ALARMS IA

The current Settings card **"Routing"** is renamed **"Routing & Alarms"**. Telemetry remains in the Scoreboard; behavioral policies are grouped cleanly below:

```
⚙ Settings
└── Routing & Alarms
    ├── 1. AUTO Routing Mode
    │   └── [ Automatic (Balanced) ▾ ] (Auto / Manual / Locked)
    │
    ├── 2. Alarm Notifications
    │   ├── [✓] Notify when quota is low (Warning)
    │   ├── [✓] Notify when window resets (Reset Alarm)
    │   └── Channel:
    │       ├── [✓] VS Code Popups (Active)
    │       └── [ ] Browser Notifications (Requires Permission)
    │
    ├── 3. Threshold Configuration (Dad's Rules)
    │   ├── Claude 5-Hour Warning:   [ 20% ▾ ] remaining  (Critical: 5%)
    │   ├── Claude Weekly Warning:   [ 15% ▾ ] remaining  (Critical: 5%)
    │   ├── Codex 5-Hour Warning:    [ 20% ▾ ] remaining  (Critical: 5%)
    │   └── Codex Weekly Warning:    [ 20% ▾ ] remaining  (Critical: 5%)
    │
    ├── 4. CONSERVE Policy
    │   ├── [✓] Automatically conserve providers when below warning threshold
    │   └── Behavior: Divert ordinary Plays to secondary provider until reset
    │
    └── 5. Schedule Later (Queue on Reset)
        └── Default policy: [ Ask Dad ▾ ] (Ask Dad / Auto-Schedule / Run Anyway)
```

---

## 11. CONSERVE SEAM

**Architectural Principle:** CONSERVE is routing policy, not raw telemetry.

### The Seam
`AlarmEngine` exports a derived, queryable resource state:
```typescript
export interface ProviderResourcePolicy {
  provider: 'claude' | 'codex';
  isConserveActive: boolean;
  conserveLevel: 'none' | 'low' | 'critical';
  rationale?: string;
  activeResetsAt: number | null;
}
```

### Consumption in `src/routing-policy.ts`:
In `computeAutoRoute()`:
1. Calls `resourcePolicyService.getPolicy(candidate.provider)`.
2. If `policy.isConserveActive === true`:
   - Checks if an alternate non-conserved provider can handle the classified task.
   - If alternate exists: routes to alternate and appends explicit rationale:
     `"Claude 5H is in CONSERVE (14% remaining, resets at 10:37 AM) · Routed to Codex"`.
   - If no alternate exists: prompts Dad or executes with a conservation notice.

---

## 12. COPY CONTEXT SEAM (BREADCRUMB)

### The Seam
`AlarmEngine` emits `alarm:threshold_entered` (`level: 'warning' | 'critical'`).

### Future Action Listener:
```typescript
// Future listener in UI / Extension:
eventBus.on('alarm:threshold_entered', async (event) => {
  if (preferences.autoCopyContextOnLowQuota && isLocalDesktop()) {
    const text = buildAiScoreboardCopyText(currentSnapshot);
    await navigator.clipboard.writeText(text);
    showToast(`Low quota alarm: Context snapshot copied to clipboard.`);
  }
});
```
*Decoupling:* The `AlarmEngine` has zero dependencies on clipboard APIs, text formatters, or DOM structures.

---

## 13. SCHEDULE LATER SEAM

### The Seam
Dad prompt: *"Wait until Claude resets, then run this Play."*

1. **Intent Construction:**
   When Dad selects "Schedule Later" on a blocked or conserved Play:
   - A `QueuedPlay` is created in [`src/control-plane/play-queue.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/play-queue.ts).
   - Tagged with `deferredUntilReset: { provider: 'claude', window: 'five_hour', targetResetsAt: 1727282220 }`.
   - Set to `state: 'queued'`.
2. **Durability:**
   Stored in `queue.json` via existing `fileQueueStore()` ([lines 50–60](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/play-queue.ts#L50-L60)). Survives daemon restarts.
3. **Execution Trigger:**
   When the Clock Horizon Engine emits `alarm:reset_boundary_reached` for `targetResetsAt`:
   - `PlayQueue` checks deferred items matching `provider` and `targetResetsAt <= now`.
   - Dispatches the Play into the active router.

---

## 14. PHASE-1 IMPLEMENTATION SLICE

To satisfy Dad's mandate for **both** the underlying nervous system **and** an immediate user-visible alarm:

### What Ships in Phase 1:
1. **`AlarmEngine` (`src/control-plane/alarm-engine.ts`):**
   - Evaluates telemetry on `HealthAuthority.onChange`.
   - Implements the 60s Clock Horizon loop for absolute reset boundaries.
   - Implements `NORMAL | LOW | CRITICAL | UNKNOWN` state machine with 2% hysteresis.
2. **`AlarmStateStore` (`src/control-plane/alarm-state-store.ts`):**
   - Atomic JSON persistence of `RuleTransitionState` in `~/.sideline/alarm-state.json`.
3. **Preferences Extension (`src/running-players.ts`):**
   - Add default threshold preferences into `CoachPreferences`.
4. **Daemon Integration (`src/control-plane/daemon.ts`):**
   - Wire `AlarmEngine` to `HealthAuthority`.
   - Broadcast `ai-alarm` SSE event over `/api/events`.
   - Send JSON-RPC notification `ai.alarm` to `StadiumClient`.
5. **VS Code Notification Adapter (`src/extension.ts`):**
   - Listen for `ai.alarm` on `StadiumClient`.
   - Display `vscode.window.showWarningMessage` (for LOW/CRITICAL) and `showInformationMessage` (for RESET).
6. **Webview Toast (`src/public/index.html`):**
   - Listen to SSE `ai-alarm` and display visible toast.

### Explicitly Excluded from Phase 1:
- Browser `Notification.requestPermission` integration (Phase 2).
- Automatic CONSERVE rerouting in `routing-policy.ts` (Phase 2).
- Schedule Later PlayQueue automation (Phase 3).
- Settings UI sliders for custom thresholds (Phase 2 - Phase 1 uses sensible defaults with preferences on disk).

---

## 15. FOLLOW-ON PHASES

* **Phase 2 (Settings Controls, CONSERVE Routing, Browser Notifications):**
  - Settings UI card "Routing & Alarms" with interactive threshold controls.
  - Opt-in Browser Notification API integration.
  - `computeAutoRoute()` checks `ProviderResourcePolicy.isConserveActive`.
* **Phase 3 (Schedule Later Execution & Copy Context Integration):**
  - "Wait for Reset" UI button on conserved Plays.
  - `PlayQueue` deferred reset dispatcher.
  - Context auto-copy action listener.
* **Phase 4 (Remote Mobile Alarms):**
  - Alarm forwarding over relay daemon to paired mobile devices.

---

## 16. RISKS / FAILURE MODES

| Risk | Mitigation |
| :--- | :--- |
| **Notification Spam Storm** | Transition-only firing (`currentState !== previousState`). Identical snapshots never emit events. |
| **Sleep / Lid-Close Missed Reset** | Clamped 60s heartbeat evaluates `now >= resetsAt` on immediate wake-up. Emits reset alert immediately upon wake. |
| **Double Reset Alerts (Clock vs Telemetry)** | `lastFiredResetCycle` token records the exact Unix second of the reset cycle. When telemetry arrives later, it recognizes the cycle is already cleared. |
| **Stale / Frozen Provider Data** | If `now - observedAt > maxStaleAgeMinutes`, state transitions to `UNKNOWN`. Alarms do not falsely clear or spam while blind. |
| **Long-Running setTimeout Overflow** | Timers are capped at 60,000ms maximum. No multi-hour timers in JavaScript memory. |
| **Scraping Regressions** | Strict zero-scraping architectural rule. AlarmEngine reads only typed `HealthAuthority` snapshots. |

---

## 17. EXACT IMPLEMENTATION SEAMS / FILES

| Component | Target File | Action |
| :--- | :--- | :--- |
| Core Alarm Engine | `src/control-plane/alarm-engine.ts` | **NEW FILE.** Pure evaluation logic, clock horizon scheduler, transition detector. |
| Alarm State Persistence | `src/control-plane/alarm-state-store.ts` | **NEW FILE.** Atomic JSON serializer for `RuleTransitionState`. |
| Resource Policy Contract | `src/control-plane/resource-policy.ts` | **NEW FILE.** Exposes `ProviderResourcePolicy` for routing and alarms. |
| Preferences Schema | `src/running-players.ts` | **MODIFY.** Add `AlarmPreferences` to `CoachPreferences`. |
| Daemon Lifecycle & SSE | `src/control-plane/daemon.ts` | **MODIFY.** Wire `AlarmEngine` to `HealthAuthority.onChange`, clock heartbeat, and SSE broadcast. |
| VS Code Notification Channel | `src/extension.ts` | **MODIFY.** Handle `ai.alarm` JSON-RPC from daemon; show VS Code popups. |
| Webview Toast Channel | `src/public/index.html` | **MODIFY.** Handle `ai-alarm` SSE event in UI. |

---

## 18. ACCEPTANCE TEST MATRIX

* [ ] **AT-1 (Threshold Transition Firing):** When Claude 5H utilization increases such that remaining % drops from 22% to 19% (threshold 20%), an `alarm:threshold_entered` event fires with `level: 'warning'`.
* [ ] **AT-2 (Deduplication / No Spam):** Consecutive snapshots reporting 19%, 18%, 17% remaining emit zero additional warning events.
* [ ] **AT-3 (Critical Escalation):** When remaining % drops below 5%, an `alarm:threshold_escalated` event fires with `level: 'critical'`.
* [ ] **AT-4 (Absolute Reset Boundary Detection):** With Claude 5H `resetsAt` set to T+5s and zero incoming telemetry, the engine fires `alarm:reset_boundary_reached` at T+5s and transitions state to `NORMAL`.
* [ ] **AT-5 (Sleep / Wake Reconciliation):** An engine initialized with `resetsAt` in the past (simulating computer sleep across the boundary) immediately fires the reset alarm on its first tick.
* [ ] **AT-6 (Restart Persistence):** Daemon restarts while in `LOW` state; on startup, state is restored as `LOW` without re-firing the entry alert.
* [ ] **AT-7 (Late Telemetry Ingestion):** Telemetry arriving after clock reset transition does not refire the reset alarm.
* [ ] **AT-8 (VS Code Delivery):** Fired alarm events trigger `vscode.window.showWarningMessage` with Dad-formatted text and action buttons.

---

## 19. BREADCRUMBS TO CREATE

1. `Project SOP/Breadcrumbs/AI-USAGE-ALARM-THRESHOLD-ROUTING-CONSERVE.md`
2. `Docs ANCHOR/ROUTING_AND_ALARMS_SETTINGS_SPEC.md`
3. `Docs ANCHOR/CLOCK_HORIZON_ENGINE_SPEC.md`

---

## 20. FINAL GO / NO-GO

# **FINAL VERDICT: GO**

The architectural boundaries are reconciled. The two trigger classes (telemetry vs clock) are formally decoupled. The sleep/wake failure mode is mitigated via the 60s clamped Horizon Heartbeat. Phase 1 is sized to deliver a genuine, working alarm in VS Code while establishing the exact canonical seams required for CONSERVE and Schedule Later.
