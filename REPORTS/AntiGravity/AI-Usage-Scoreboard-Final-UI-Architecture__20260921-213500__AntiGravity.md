# AI USAGE SCOREBOARD — FINAL UI ARCHITECTURE & SEAM VALIDATION REPORT

**Date:** 2026-09-21  
**Agent:** AntiGravity  
**Role:** UI Architect + Seam Validator + Scope Pack Compiler  
**Target Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Formation Intelligence:** `C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\FORMATION-RESULT.md`

---

## 1. VERIFIED CURRENT UI SEAM

* **Single Page Shell:** [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html) houses the entire browser client.
  * Shell root: `<main class="shell">` (L929) with CSS padding:
    `calc(18px + env(safe-area-inset-top)) 14px calc(32px + env(safe-area-inset-bottom))` (L43–L47).
  * Chrome Header: `<header>` (L930–L954) containing brand title, Game selector dropdown, Stadium badge, connection status, and `#settingsBtn`.
  * Primary Workflow: `<div id="mainWorkflow">` (L956–L1126) holding active workflow cards (`authCard`, `recruitCard`, `rosterCard`, `incomingCard`, `manualTurnCard`).
  * Full-Screen Settings Overlay: `<section id="settingsView" class="settings-view" hidden>` (L1128–L1410). Toggled via `openSettings()` / `closeSettings()` (L5382–L5399).
* **Current AI Health UI Footprint:** **ZERO**. The frontend currently consumes none of the AI Health endpoints or SSE events.

---

## 2. VERIFIED HEALTH DATA SEAM

* **HTTP Read Seam:** `GET /api/ai-health` in [`src/control-plane/daemon.ts:1020-1023`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L1020-L1023).
  * Returns: `{ success: true, health: HealthAuthoritySnapshot }`.
  * Auth: Standard Bearer token via `isAuthorized(req)`.
* **SSE Push Seam:** `event: ai-health` broadcast on `/api/events` in [`src/control-plane/daemon.ts:222`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L222) and [`src/control-plane/daemon.ts:2968`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2968).
  * Pushed immediately upon SSE client connection (initial snapshot).
  * Pushed whenever `HealthAuthority.onChange` fires (on factual evidence ingest).
* **Frontend SSE Reception:** `connectEvents()` in [`src/public/index.html:4457-4502`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L4457-L4502) handles `hello`, `reports`, `status`, `execution`, `activity`.
  * **Integration Seam:** Adding an `eventSource.addEventListener('ai-health', ...)` listener.
* **Canonical Snapshot Structure:** [`src/control-plane/health-authority.ts:39-43`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L39-L43):
  ```typescript
  interface HealthAuthoritySnapshot {
    schemaVersion: 1;
    updatedAt?: string; // ISO timestamp
    providers: {
      claude?: ClaudeProviderHealthState;
      codex?: CodexProviderHealthState;
    };
  }
  ```

---

## 3. VERIFIED PREFERENCES SEAM

* **Backend Preference Schema:** `CoachPreferences` in [`src/running-players.ts:18-48`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/running-players.ts#L18-L48).
* **Validation & Allowlist:** In [`src/control-plane/daemon.ts:2075-2128`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2075-L2128), `POST /api/preferences` checks exact property names (`runningPlayers`, `devMode`, `livePlayerConsole`, `advancedPlayerDiscovery`, `terminalRetention`, `timeFormat`). Any unrecognized property is ignored or rejected.
* **Implication:**
  * **Scoreboard preferences CANNOT persist to `/api/preferences` without extending `CoachPreferences` and the daemon allowlist.**
  * In **UI Play 1**, presentation defaults are hardcoded or persisted client-side (`localStorage`), allowing immediate UI functionality without backend schema changes.
  * In **UI Play 2**, `CoachPreferences` is cleanly extended with an allowlisted `scoreboard` preferences object.

---

## 4. VERIFIED TEAM CONFIGURATION SOURCE OF TRUTH

* **Roster Truth:** Stored in the Control Plane daemon and projected via `status.players` -> `player.instances` ([`src/public/index.html:4161-4172`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L4161-L4172)).
* **A-Team Definition:**
  * Canonical default A-Team is **Claude** and **Codex**.
  * The Scoreboard projects these two primary providers by default.
  * If a provider is not yet recruited or running in the current Game, it still appears on the Scoreboard with state derived from the global `HealthAuthority` (or `UNKNOWN` if no health evidence exists).
* **B-Team Definition:**
  * Documented in architecture breadcrumbs as user-configurable role projections.
  * There is currently no secondary "B-Team" roster table in code; B-Team is a future extension slot.
* **Scouts Definition:**
  * Auto-selected by `ScoutBootstrapService` and represented as Virtual Player `SCOUT_PLAYER_INSTANCE_ID = 'virtual_scout'`.
  * Available via `status.scout` / `status.capabilities`.

---

## 5. EXACT CLAUDE NATIVE FIELD MAPPING

From [`src/player-control/structured-print.ts:485-491`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L485-L491) and [`test/fixtures/fake-print-cli.mjs:75`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/fixtures/fake-print-cli.mjs#L75):

```json
{
  "status": "allowed",
  "utilization": 0.42,
  "rateLimitType": "five_hour",
  "resetsAt": 1726950000
}
```

* **5-Hour Used %:** `Math.round(utilization * 100)` -> `42%` (when `rateLimitType === 'five_hour'`).
* **5-Hour Left %:** `100 - usedPercent` -> `58%`.
* **5-Hour Reset:** `resetsAt` (Unix timestamp in seconds -> multiplied by 1000 for JS `Date`).
* **Weekly Window:**
  * In captured provider stdout frames, Claude emits window-specific rate limit events (`five_hour` or `seven_day`).
  * If only 5-hour evidence is in state, **weekly is truthfully `UNKNOWN`**.
  * Do not invent or fabricate weekly numbers for Claude unless a matching weekly/seven_day field exists.

---

## 6. EXACT CODEX NATIVE FIELD MAPPING

From local `codex-cli 0.155.1` generated schema and [`src/player-control/codex-app-server.ts:644-649, 741-750`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L644-L649):

```json
{
  "primary": {
    "usedPercent": 30,
    "resetsAt": 1726950060,
    "windowDurationMins": 300
  },
  "secondary": {
    "usedPercent": 95,
    "resetsAt": 1727011500,
    "windowDurationMins": 10080
  },
  "planType": "pro",
  "rateLimitReachedType": null
}
```

* **5-Hour Window Verification:** Confirmed by `primary.windowDurationMins === 300` (300 mins = 5 hours).
  * **5-Hour Used %:** `primary.usedPercent` -> `30%`.
  * **5-Hour Left %:** `100 - primary.usedPercent` -> `70%`.
  * **5-Hour Reset:** `primary.resetsAt` (Unix timestamp in seconds -> multiplied by 1000 for JS `Date`).
* **Weekly Window Verification:** Confirmed by `secondary.windowDurationMins === 10080` (10,080 mins = 7 days).
  * **Weekly Used %:** `secondary.usedPercent` -> `95%`.
  * **Weekly Left %:** `100 - secondary.usedPercent` -> `5%`.
  * **Weekly Reset:** `secondary.resetsAt` (Unix timestamp in seconds -> multiplied by 1000 for JS `Date`).
* **Plan Badge:** `planType` (e.g. `'pro'`, `'plus'`, `'team'`).

---

## 7. PRESENTATION TRANSFORMATION CONTRACT

### A. LEFT vs USED
* **LEFT (Default):**
  * Codex: `100 - usedPercent`
  * Claude: `100 - Math.round(utilization * 100)`
* **USED:**
  * Codex: `usedPercent`
  * Claude: `Math.round(utilization * 100)`
* **Rule:** If the raw metric is undefined, null, or non-numeric, both modes display `UNKNOWN`.

### B. ABSOLUTE vs COUNTDOWN
* `resetsAtMs = resetsAt < 1e11 ? resetsAt * 1000 : resetsAt`.
* **ABSOLUTE (Default):**
  * Same calendar day: `12:21 AM` (or 24h `00:21` if `timeFormat === '24h'`).
  * Within 6 days: `Tue 5:05 PM`, `Sat 6:00 AM`.
  * Beyond 6 days: `Sep 28, 5:05 PM`.
* **COUNTDOWN:**
  * Calculated as `diff = resetsAtMs - Date.now()`.
  * `diff <= 0`: `now`.
  * `diff >= 86,400,000` (≥1 day): `in Xd Yh` (e.g. `in 4d 8h`).
  * `diff >= 3,600,000` (<1 day, ≥1 hour): `in Xh Ym` (e.g. `in 2h 57m`, `in 19h 41m`).
  * `diff < 3,600,000` (<1 hour): `in Ym` (e.g. `in 25m`).
  * `diff < 60,000` (<1 min): `in <1m`.

### C. Reset Markers
* **PLAIN (Default):** `·` (e.g. `5H 70% · 12:21 AM`).
* **SYMBOL:** `↻` (e.g. `5H 70% ↻ 12:21 AM`).

### D. Timezone & Rounding
* Uses local browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
* Math: Always `Math.round()`. No decimals in Compact view.

---

## 8. COPY COMPLETE CONTEXT CONTRACT

* **Deterministic Plain Text Formatter:** Formats directly from the canonical data model; never scrapes DOM elements.
* **Clock Rules:**
  * **CURRENT LOCAL TIME:** Evaluated via `new Date()` at the exact moment of copy.
  * **TIME UNTIL RESET:** Calculated at the exact moment of copy against the canonical `resetsAt`.
  * **USAGE DATA LAST REFRESHED:** Uses `snapshot.updatedAt` (or `Math.max(observedAt)`). Never set to copy-time.
* **Exact Contract Format:**

```text
AI USAGE SCORECARD

Current local time:
Monday, September 21, 2026
9:23 PM
Timezone: America/Edmonton

CODEX
5-hour: 70% left | 30% used
Resets: Tuesday, September 22 at 12:21 AM
Time until reset: in 2h 57m
Weekly: 5% left | 95% used
Resets: Tuesday, September 22 at 5:05 PM
Time until reset: in 19h 41m

CLAUDE
5-hour: 100% left | 0% used
Resets: Tuesday, September 22 at 12:39 AM
Time until reset: in 3h 16m
Weekly: 57% left | 43% used
Resets: Saturday, September 26 at 5:59 AM
Time until reset: in 4d 8h 36m

Usage data last refreshed:
Monday, September 21, 2026 at 9:23 PM
```

---

## 9. LIVE UPDATE CONTRACT

1. **Hydration:**
   * In `refresh()`: parallel `Promise.all([api('/api/status'), api('/api/reports'), api('/api/ai-health')])`.
   * Immediately renders initial health state before first turn or SSE event.
2. **SSE Streaming:**
   * In `connectEvents()`:
     ```javascript
     eventSource.addEventListener('ai-health', (event) => {
       try {
         const snapshot = JSON.parse(event.data);
         updateAiHealth(snapshot);
       } catch (err) {}
     });
     ```
3. **Reconnect Stability:**
   * On disconnect/error: existing health state in memory is **preserved**.
   * On reconnect: SSE automatically re-delivers the authoritative `ai-health` snapshot, refreshing data seamlessly.
4. **Local Countdown Ticking:**
   * A single `setInterval(tickCountdowns, 60000)` updates relative time labels in place. No network requests are made.

---

## 10. SCOREBOARD DOM / LAYOUT DECISION

* **Real Layout Flow (No Floating Overlays):**
  * The Scoreboard wrapper `<div id="aiScoreboardContainer" class="ai-scoreboard-container" data-position="top">` is inserted as a direct child of `<main class="shell">`.
  * **TOP Position:** Inserted directly after `<header>` and before `<div id="mainWorkflow">`.
  * **BOTTOM Position:** Inserted directly after `<div id="mainWorkflow">` and before `<section id="settingsView">`.
* **Zero View Hacks:**
  * By living inside `<main class="shell">`, it automatically inherits shell safe-area padding (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`).
  * Does not use `position: fixed` or `position: absolute`. Consumes genuine vertical layout space.

---

## 11. VISUAL SCOREBOARD DECISION

* **Visual Identity:** Dark instrumentation panel consistent with Sideline's dark theme:
  * Background: `#111622` (slightly darker than `--card-bg: #141b27`).
  * Border: `1px solid #232c3d`.
  * Typography: Monospace numerical tabular digits (`font-variant-numeric: tabular-nums`), crisp uppercase provider headers (`letter-spacing: .06em; font-weight: 700`).
  * Dividers: Crisp vertical separator `│` (`#2e384b`).
  * Subtle scoreboard pill/capsule badges for windows (`5H`, `WK`).

---

## 12. EXPANDED SCOREBOARD STRUCTURE

Expanding Compact reveals a collapsible section containing:
1. **Header Row:** "CURRENT CAPACITY · AI Usage Scorecard" + Collapse button.
2. **Provider Cards Grid (A-Team):**
   * **Codex Provider Card:** Large prominent `% left`, secondary `% used`, 5H window row with absolute reset and countdown, Weekly window row with absolute reset and countdown, Plan badge (`pro`/`plus`), and observed timestamp.
   * **Claude Provider Card:** Large prominent `% left`, secondary `% used`, 5H window row with absolute reset and countdown, Weekly window row (or UNKNOWN), and observed timestamp.
3. **Dashboard Footer Grid:**
   * **Local Time Card:** Full local date, large live clock, and timezone name.
   * **Action Card:** "Copy Complete Context" button (primary) + "Rehydrate Health" button (calls `GET /api/ai-health`, zero inference).

---

## 13. SETTINGS CARD + ALL SUB-CARDS

Dedicated card in `<section id="settingsView">`:
* **Card Heading:** `AI USAGE SCOREBOARD`
* **Sub-Card 1: Placement & Visibility:**
  * `Show AI Usage Scoreboard` (checkbox)
  * `Position`: `TOP` | `BOTTOM` (radio/segmented)
* **Sub-Card 2: Compact Scoreboard:**
  * `Percentage Display`: `LEFT / REMAINING` | `USED`
  * `Reset Display`: `ABSOLUTE` | `COUNTDOWN`
  * `Reset Marker Style`: `PLAIN (·)` | `SYMBOL (↻)`
  * `Density`: `Standard` | `Tight`
* **Sub-Card 3: Team Display:**
  * Explains A-Team active configuration; links/references active Roster.
* **Sub-Card 4: Expanded Scoreboard:**
  * Toggles for optional card items (show plan type, show refresh timestamp).
* **Sub-Card 5: Copy & Context:**
  * Explains that standardized canonical copy format is preserved regardless of Compact settings.
* **Sub-Card 6: Appearance:**
  * Visual density toggle preview.

---

## 14. FUTURE B-TEAM / SCOUT / ROUTER EXTENSION SEAMS

* **B-Team Seam:** Dedicated slot `<div id="scoreboardBTeamSection" hidden>` inside Expanded Scoreboard. Ready to receive B-Team provider cards when a B-Team roster table is introduced.
* **Scouts Seam:** Dedicated slot `<div id="scoreboardScoutsSection" hidden>` displaying virtual Scout pool status from `status.scout`.
* **Router Seam:** Dedicated slot `<div id="scoreboardRouterSection" hidden>` for active routing policy and capacity recommendations, kept cleanly isolated from factual health data.

---

## 15. IMPLEMENTATION SLICE DECISION

* **DECISION: TWO BOUNDED SLICES.**
  * **UI Play 1 — Visible Live Scoreboard Core:**
    * Focus: Immediate user-visible value ("TOUCHDOWN" moment).
    * Delivers: Compact Scoreboard in shell (default TOP), live SSE + initial hydration, Claude & Codex A-Team capacity, Expand/Collapse drawer, Expanded Provider Cards, Local Time Card, Copy Complete Context action, local minute ticker.
    * No backend settings dependencies; pure presentation.
  * **UI Play 2 — Scoreboard Settings & Layout Extension:**
    * Focus: Customization, persistence, and layout positions.
    * Delivers: Backend allowlist in `CoachPreferences`, full Settings Card with Sub-Cards 1–6 in `settingsView`, TOP/BOTTOM positioning switch, LEFT/USED, ABSOLUTE/COUNTDOWN, PLAIN/↻ preferences, future B-Team/Scout slots.

---

## 16. SMALLEST EXECUTABLE FIRST WORKER PACKET (UI PLAY 1)

```yaml
pack_id: ai-health-ui-scoreboard-play1
target_repo: C:\Users\dmcal\Documents\GitHub\SidelineCoach
primary_file: src/public/index.html
test_file: test/ai-usage-scoreboard-ui.test.mjs
```

### Worker Instructions for UI Play 1:
1. **Data Hydration & SSE:**
   * In `src/public/index.html`:
     * Add `aiHealthSnapshot` state variable.
     * In `refresh()`: add `api('/api/ai-health')` to the initial parallel hydration fetch.
     * In `connectEvents()`: register `eventSource.addEventListener('ai-health', (e) => { ... })`.
2. **DOM Insertion:**
   * Insert `<div id="aiScoreboardContainer" class="ai-scoreboard-container">` directly below `<header>` inside `<main class="shell">`.
   * Structure contains `#aiScoreboardCompact` and `#aiScoreboardExpanded` (hidden by default).
3. **Compact View Implementation:**
   * Render two lines for current A-Team:
     * `CLAUDE   5H <left>% · <reset>   │   WK <left>% · <reset>`
     * `CODEX    5H <left>% · <reset>   │   WK <left>% · <reset>`
   * Header row has `[Copy]` button and `[Expand ▾]` button.
4. **Copy Complete Context Implementation:**
   * Clicking `[Copy]` executes the deterministic plain-text formatter matching the exact format specified in Section 8.
   * Provide visual button feedback (`Copied ✓`) for 1.5 seconds.
5. **Expanded View Implementation:**
   * Clicking `[Expand ▾]` toggles `#aiScoreboardExpanded`.
   * Displays Codex Provider Card, Claude Provider Card, Local Time Card, and Action Card.
6. **Local Minute Tick:**
   * Implement a 60-second ticker updating countdown and clock text locally.
7. **Automated Test:**
   * Create `test/ai-usage-scoreboard-ui.test.mjs` verifying:
     * Compact scoreboard HTML renders both A-Team providers.
     * Normalized values correctly calculate LEFT vs USED for Claude and Codex.
     * Copy Complete Context string matches the exact target format.
     * Missing provider or window safely renders `UNKNOWN`.

---

## 17. SECOND-SLICE HANDOFF (UI PLAY 2)

* **Prerequisite:** UI Play 1 complete and verified.
* **Scope for Play 2:**
  1. Extend `CoachPreferences` in `src/running-players.ts` and `src/control-plane/daemon.ts` with `scoreboard` preference object.
  2. Implement full Settings Card in `src/public/index.html` within `#settingsView`.
  3. Wire TOP vs BOTTOM position toggling in DOM.
  4. Wire presentation preferences (LEFT/USED, ABSOLUTE/COUNTDOWN, PLAIN/↻, density).
  5. Mount future placeholder extension slots for B-Team and Scouts.

---

## 18. AMENDMENT: CLAUDE DUAL-WINDOW RETENTION BLOCKER & REPAIR

### 1. Current Behavior
* **State in `HealthAuthority`:** [`src/control-plane/health-authority.ts:9-20`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L9-L20) defines `ClaudeProviderHealthState` with a single `rateLimitInfo: Record<string, unknown>`.
* **Ingest Behavior:** [`src/control-plane/health-authority.ts:130-137`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L130-L137) executes:
  ```ts
  this.state = {
    ...this.state,
    providers: { ...this.state.providers, [provider]: { ...factual, observedAt } }
  };
  ```
  where `factual.rateLimitInfo` is replaced wholesale with incoming `evidence.rate_limit_info`.
* **Outcome:** Claude emits window-specific frames (`rateLimitType: 'five_hour'` or `'seven_day'`). When a `seven_day` event arrives, it completely overwrites the prior `five_hour` state, and vice versa.
* **Finding:** **Option B is the current source truth.**

### 2. Blocker: YES
* **Status:** **BLOCKER for Compact Scoreboard and Complete Copy Context.**
* **Impact:** Without a repair, the frontend cannot display Claude 5H and WK simultaneously because the backend state only holds the single most recent window frame.

### 3. Exact Repair
In [`src/control-plane/health-authority.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts), add a neutral window-merging helper for Claude inside `ingest()` (mirroring Codex's multi-window coexistence):
```typescript
function mergeClaudeRateLimits(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const windowKey = typeof incoming.rateLimitType === 'string' && incoming.rateLimitType ? incoming.rateLimitType : undefined;
  if (!windowKey) return { ...(current ?? {}), ...incoming };
  return {
    ...(current ?? {}),
    ...incoming,
    [windowKey]: incoming
  };
}
```
* **Schema Compatibility:** Preserved. `rateLimitInfo` remains `Record<string, unknown>`, schema version stays `1`, existing tests expecting top-level fields continue passing without disruption.
* **Neutrality:** Factual evidence is stored verbatim under its window key without synthetic scoring.
* **Replay Suppression:** Preserved. If an identical window frame arrives, the merged object matches `previous.rateLimitInfo`, returning `false`.
* **Persistence:** Preserved. Atomic save and bounded copy handle nested window objects within limits.
* **Zero Polling:** Preserved. Strictly event-driven.

### 4. Exact Files & Tests
* **Files to Touch:**
  * [`src/control-plane/health-authority.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/health-authority.ts#L122): Use `mergeClaudeRateLimits` during Claude ingestion.
* **Tests to Add:**
  * [`test/health-authority.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/health-authority.test.mjs):
    * Ingest Claude `five_hour` event -> verified in snapshot.
    * Ingest Claude `seven_day` event -> verify both `rateLimitInfo.five_hour` and `rateLimitInfo.seven_day` coexist simultaneously in snapshot.
    * Re-ingest identical `seven_day` event -> verify replay suppressed (`false`).

### 5. Recommended Play Order
* **Step 1: Prerequisite Backend Seam Fix (Play 5.3 / Play 6.1 — Claude Dual-Window Retention):**
  * Execute this tiny, self-contained backend repair first (1 file, ~15 lines, 1 unit test).
  * Keeps the UI worker packet 100% focused on presentation and DOM implementation without touching Control Plane TypeScript.
* **Step 2: UI Play 1 (Visible Live Scoreboard Core):**
  * Proceeds with full confidence that both Claude windows (5H and WK) and both Codex windows are canonically present in `HealthAuthoritySnapshot`.

