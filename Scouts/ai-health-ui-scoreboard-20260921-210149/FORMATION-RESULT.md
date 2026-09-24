# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:08:07

Play: ai-health-ui-scoreboard-20260921-210149
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-22T03:01:54.862Z
Finished: 2026-09-22T03:10:02.426Z
TOTAL ELAPSED TIME: 00:08:07

Scouts requested: 2
Completed: 2
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 2
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scoreboard-shell-settings | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T03:01:54.882Z | 2026-09-22T03:06:07.983Z | 00:04:13 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\SCOUT-scoreboard-shell-settings-Reconnaissance.md |
| scoreboard-health-data-client | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T03:01:55.062Z | 2026-09-22T03:10:02.420Z | 00:08:07 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\SCOUT-scoreboard-health-data-client-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane scoreboard-shell-settings: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane scoreboard-health-data-client: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: scoreboard-shell-settings (objective 1751e02b423b)
- Objective: AI Health UI Scoreboard reconnaissance only. The AI Health backend is complete: ONE global HealthAuthority, Claude/Codex native evidence, persistence, GET /api/ai-health, and ai-health SSE. Map the CURRENT Sideline frontend shell, main layout, persistent chrome, Settings UI, settings persistence, and CSS/layout seams needed for a compact AI Health banner that can be configured TOP or BOTTOM. Determine how to reserve real layout space so application content never hides beneath the banner. Identify exact files, symbols, DOM/layout containers, settings storage patterns, tests, and any existing reusable banner/status components. Also map the cleanest expand/collapse interaction for a compact banner opening a fuller scorecard. FACT / INFERENCE / UNKNOWN / CONTRADICTION only. Do not implement. Do not redesign the app. Do not add routing policy, AUTO, CONSERVE, acquisition logic, or backend health changes.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\SCOUT-scoreboard-shell-settings-Reconnaissance.md

**Key discoveries:** - **Shell & Layout:** The main container is `<main class="shell">` with top/bottom padding that respects safe areas. Inside, a `<header>` (persistent chrome) and `<div id="mainWorkflow">` hold the primary UI.
- **Settings UI:** A full-screen overlay `<section id="settingsView" class="settings-view">` is toggled by `#settingsBtn` (header) and `#settingsBackBtn`. It contains all user-configurable options.
- **Settings Persistence:** Changes to settings (e.g., Dev Mode, time format) are saved via `POST /api/preferences` and loaded via `GET /api/status` (which includes `status.preferences`). Synchronization functions (e.g., `syncTimeFormatSetting`) update UI elements from the latest status.
- **Existing Banner/Components:** 
  - Toast (`#toast.toast`): fixed-bottom overlay for transient messages.
  - Coach handoff banner (`#coachHandoffBanner.coach-handoff-banner`): flex banner inside `#incomingCard`.
  - Coach brief disclosure (`#coachBriefDisclosure.coach-brief-disclosure`): similar flex banner.
  - Badge (`.badge`): used for connection status, agent labels, etc.
- **Layout Seams for Banner:** The shell’s top/bottom padding, header’s margin-bottom, and the flow between header and mainWorkflow provide natural seams to insert a layout-reserved banner (non-overlay) at top or bottom without causing content to be hidden.

---

**FACT:** - The shell element is `<main class="shell>` with CSS padding: `calc(18px + env(safe-area-inset-top)) 14px calc(32px + env(safe-area-inset-bottom))` (lines 43-47 in `src/public/index.html`).  
- The header is a direct child of shell (line 930) and contains the settings button (`#settingsBtn`, line 952).  
- The main workflow container is `<div id="mainWorkflow">` (line 956) and holds all workflow sections (auth, recruit, roster, incoming, etc.).  
- Settings view is `<section id="settingsView" class="settings-view" hidden>` (line 1128) and is shown/hidden via `openSettings()`/`closeSettings()` (lines 5382-5399).  
- Settings are saved via `POST /api/preferences` (e.g., line 5779 for runningPlayers preference, line 5808 for devMode).  
- Settings are loaded via `GET /api/status` in the `refresh()` function (line 4425) and applied to UI by sync functions (e.g., `syncTimeFormatSetting` at line 5871, called from `renderStatus` at line 4398).  
- The toast (`#toast`) is a fixed-position element at the bottom (lines 508-526 CSS, line 1422 HTML).  
- Coach handoff banner (`#coachHandoffBanner`) and coach brief disclosure (`#coachBriefDisclosure`) are defined in CSS (lines 363-375) and used in the incoming card (lines 1046, 1032).  
- Tests exist for settings hierarchy (e.g., `test/s55-0-settings-hierarchy.test.mjs`) and UI components.

**INFERENCE:** - To reserve real layout space for a non-overlay AI Health banner (TOP or BOTTOM), the shell’s padding can be increased by the banner’s height, or a margin can be added to the header/mainWorkflow. For example, inserting a banner between the header and mainWorkflow would push the workflow downward, ensuring content does not hide beneath it.  
- The banner could be implemented as a flex container (similar to coach-handoff-banner) and placed as a sibling to the header (or within the shell but outside mainWorkflow) to persist across workflow state changes.  
- Settings persistence for banner position (TOP/BOTTOM) would follow the existing pattern: a new preference key (e.g., `aiHealthBannerPosition`) saved via `POST /api/preferences` and synced via a dedicated sync function in `renderStatus`.  
- Existing tests for settings and UI components can be extended to cover the new banner’s behavior and placement.

**UNKNOWN:** - The exact height/spacing requirements for the AI Health banner (compact vs. expanded) are not defined in the current codebase.  
- Whether the backend (`/api/preferences`) would accept a new preference key for banner position without modification is unknown (requires API inspection, which is out of scope for frontend-only reconnaissance).  
- Potential interactions with safe-area-inset variables (e.g., on iOS/Android) when adding banner space have not been tested.

**CONTRADICTION:** - No contradictions found; the current architecture supports adding persistent UI elements via the established settings and layout patterns.

**Important files:** - `src/public/index.html` – Contains the shell, header, mainWorkflow, settings view, toast, banner definitions, and embedded JavaScript for settings synchronization and UI toggling.  
- `src/public/index.html` (CSS lines) – Shell padding (43-47), header (49-55), toast (508-526), coach-handoff-banner (363-366), coach-brief-disclosure (372-375).  
- `src/public/index.html` (JS lines) – Settings toggle (5382-5399), settings persistence (5776-5785, 5800-5816, etc.), sync functions (5715-5920), refresh/renderStatus (4421-4445, 4058-4408).  
- `test/s55-0-settings-hierarchy.test.mjs` – Example test for settings behavior.

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: scoreboard-health-data-client (objective 69909f48019b)
- Objective: AI Health UI Scoreboard reconnaissance only. Map the CURRENT frontend data path for Control Plane HTTP/SSE consumption and determine the smallest UI integration seam for canonical AI Health. Verify GET /api/ai-health, existing /api/events EventSource/SSE handling, event dispatch/state patterns, reconnect behavior, initial hydration patterns, and relevant frontend tests. Determine how the UI should render Claude/Codex provider-native facts, UNKNOWN, last-known/freshness, reset timing, and provider availability without inventing health classifications or recalculating canonical facts. Identify exact files, symbols, state objects, event names, tests, and whether compact + expanded scorecard should be one component or small component pair. FACT / INFERENCE / UNKNOWN / CONTRADICTION only. Do not implement. Do not alter HealthAuthority, provider acquisition, persistence, AUTO, CONSERVE, routing policy, or backend architecture.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\SCOUT-scoreboard-health-data-client-Reconnaissance.md

**Key discoveries:** The current Sideline Coach codebase exposes **canonical AI Health data via two Control Plane seams** that are fully implemented in the daemon (`src/control-plane/daemon.ts`) but **has zero frontend UI consumption** for this data in `src/public/index.html`. The smallest integration seam is adding an `ai-health` SSE event listener + a one-time `GET /api/ai-health` hydration call, feeding a compact scorecard component pair (compact inline + expanded drawer/modal).

---

**FACT:** | # | Claim | Evidence |
|---|-------|----------|
| F1 | `GET /api/ai-health` exists and returns `{ success: true, health: HealthAuthoritySnapshot }` | `daemon.ts:1020-1023` |
| F2 | SSE `/api/events` broadcasts `event: ai-health` with full snapshot on every change | `daemon.ts:222`, `health-authority.ts:138` |
| F3 | Initial SSE connection delivers `ai-health` snapshot immediately (before any evidence) | `health-authority-daemon.test.mjs:55-56` |
| F4 | Frontend `connectEvents()` handles `hello`, `reports`, `status`, `execution`, `activity` — **no `ai-health` listener** | `index.html:4463-4497` |
| F5 | Frontend `refresh()` hydrates from `/api/status` + `/api/reports` only — **no `/api/ai-health` call** | `index.html:4424-4430` |
| F6 | Provider facts in `rateLimitInfo` are **opaque, provider-native, never classified by backend** | `health-authority.ts:119-122, 196-208` |
| F7 | `HealthAuthority` is **single global instance per daemon** (not per-Game) | `daemon.ts:145` |
| F8 | Deduplication: identical factual payload (excl. `observedAt`) suppresses broadcast & save | `health-authority.ts:131` |
| F9 | State persists to `~/.sideline/ai-health-state.json` and restores on daemon restart | `health-authority.ts:58, 156-165`, `daemon.ts:523, 682` |
| F10 | Frontend connection states: `connected` | `reconnecting` | `offline` — controls `data-live-action` element enablement | `index.html:1833-1851` |
| F11 | Reconnect flow: `onerror` → `reconnecting` → `hello` → `synchronizeAfterHe

**INFERENCE:** | # | Inference | Basis |
|---|-----------|-------|
| I1 | UI should render **provider-native facts verbatim** (utilization %, usedPercent, resetsAt, planType) — no "healthy/degraded" badges invented | F6, bounded objective forbids inventing classifications |
| I2 | **Absence of a provider** in `providers` = `UNKNOWN` (not "healthy", not "unavailable") | F1 snapshot shape shows optional `claude?`, `codex?` |
| I3 | `observedAt` is the **sole freshness signal** — UI should show "last updated X ago" or timestamp | F1, F9 |
| I4 | **Compact + Expanded should be a small component pair**: compact inline in header/status bar (provider pills with utilization), expanded drawer/modal on click showing full `rateLimitInfo` JSON + provenance (`source`, `observedAt`) | F3 initial snapshot available immediately; F10 connection state already drives header UI |
| I5 | One-time `GET /api/ai-health` on page load + `ai-health` SSE listener = complete data path | F2, F4, F5 |
| I6 | Reconnect `hello` should **not** reset AI Health UI — SSE `ai-health` event will redeliver current snapshot | F3, F11 |
| I7 | Provider availability = presence in `providers` object; `UNKNOWN` = absent; never infer from other signals | F1, F7 |

---

**UNKNOWN:** | # | Question | Why Unknown |
|---|----------|-------------|
| U1 | Exact desired visual design for compact scorecard (pills? badges? single line?) | No UI spec in repository |
| U2 | Whether expanded view should be a modal, drawer, or inline accordion | No UI spec |
| U3 | Whether `rateLimitInfo` keys are stable across provider versions (e.g., Claude always sends `utilization`, `resetsAt`) | Backend treats as opaque `Record<string, unknown>` |
| U4 | Whether UI should show `source` provenance (stadiumId, instanceId, gameId, playerInstanceId) in expanded view | Bounded objective says "render provider-native facts... provenance" but no design |
| U5 | Whether a "stale" threshold (e.g., >5 min since `observedAt`) should be surfaced visually | No policy in codebase |
| U6 | Whether `updatedAt` on snapshot (optional) differs from latest provider `observedAt` | Schema allows both; not observed in tests |

---

**CONTRADICTION:** | # | Claim | Evidence |
|---|-------|----------|
| C1 | None found — backend seams exist and are tested; frontend has zero consumption | F1–F12 consistent |

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/daemon.ts` | HTTP `/api/ai-health` (L1020), SSE broadcast `ai-health` (L222), HealthAuthority instantiation (L216–225) |
| `src/control-plane/health-authority.ts` | `HealthAuthoritySnapshot` type (L39–43), provider state types (L9–35), `ingest()` deduplication (L131), persistence (L58, L146–154) |
| `src/public/index.html` | Frontend SSE `connectEvents()` (L4457–4502), `refresh()` hydration (L4421–4445), connection state machine (L1833–1851), `renderStatus()` (L4058–4408) |
| `test/health-authority-daemon.test.mjs` | Canonical test for `/api/ai-health` + `ai-health` SSE — shows expected shapes and dedup behavior |
| `test/health-authority.test.mjs` | Unit tests for `HealthAuthority` validation, persistence, quarantine |

---

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane scoreboard-shell-settings: Mapped the Sideline frontend shell, main layout, persistent chrome, Settings UI, settings persistence, and identified CSS/layout seams for inserting a compact AI Health banner (configurable TOP or BOTTOM) while reserving layout space so application content does not hide beneath it. Found existing reusable banner/status components (toast, coach-handoff-banner, coach-brief-disclosure, badge) and set
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane scoreboard-health-data-client: The current Sideline Coach codebase exposes **canonical AI Health data via two Control Plane seams** that are fully implemented in the daemon (`src/control-plane/daemon.ts`) but **has zero frontend UI consumption** for this data in `src/public/index.html`. The smallest integration seam is adding an `ai-health` SSE event listener + a one-time `GET /api/ai-health` hydration call, feeding a compact s

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane scoreboard-shell-settings: - No contradictions found; the current architecture supports adding persistent UI elements via the established settings and layout patterns.
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane scoreboard-health-data-client: | # | Claim | Evidence | |---|-------|----------| | C1 | None found — backend seams exist and are tested; frontend has zero consumption | F1–F12 consistent | ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane scoreboard-shell-settings · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\SCOUT-scoreboard-shell-settings-Reconnaissance.md
- Lane scoreboard-health-data-client · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149\SCOUT-scoreboard-health-data-client-Reconnaissance.md

### Full report — lane scoreboard-shell-settings (sideline-scout-balanced)

**Scout Report**  
**Scout ID:** scoreboard-shell-settings  
**Agent:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Type:** Read-Only Reconnaissance (not final architectural authority)  

---

### RESULT
Mapped the Sideline frontend shell, main layout, persistent chrome, Settings UI, settings persistence, and identified CSS/layout seams for inserting a compact AI Health banner (configurable TOP or BOTTOM) while reserving layout space so application content does not hide beneath it. Found existing reusable banner/status components (toast, coach-handoff-banner, coach-brief-disclosure, badge) and settings storage via `/api/preferences`.

### KEY DISCOVERIES
- **Shell & Layout:** The main container is `<main class="shell">` with top/bottom padding that respects safe areas. Inside, a `<header>` (persistent chrome) and `<div id="mainWorkflow">` hold the primary UI.
- **Settings UI:** A full-screen overlay `<section id="settingsView" class="settings-view">` is toggled by `#settingsBtn` (header) and `#settingsBackBtn`. It contains all user-configurable options.
- **Settings Persistence:** Changes to settings (e.g., Dev Mode, time format) are saved via `POST /api/preferences` and loaded via `GET /api/status` (which includes `status.preferences`). Synchronization functions (e.g., `syncTimeFormatSetting`) update UI elements from the latest status.
- **Existing Banner/Components:** 
  - Toast (`#toast.toast`): fixed-bottom overlay for transient messages.
  - Coach handoff banner (`#coachHandoffBanner.coach-handoff-banner`): flex banner inside `#incomingCard`.
  - Coach brief disclosure (`#coachBriefDisclosure.coach-brief-disclosure`): similar flex banner.
  - Badge (`.badge`): used for connection status, agent labels, etc.
- **Layout Seams for Banner:** The shell’s top/bottom padding, header’s margin-bottom, and the flow between header and mainWorkflow provide natural seams to insert a layout-reserved banner (non-overlay) at top or bottom without causing content to be hidden.

---

### FACT
- The shell element is `<main class="shell>` with CSS padding: `calc(18px + env(safe-area-inset-top)) 14px calc(32px + env(safe-area-inset-bottom))` (lines 43-47 in `src/public/index.html`).  
- The header is a direct child of shell (line 930) and contains the settings button (`#settingsBtn`, line 952).  
- The main workflow container is `<div id="mainWorkflow">` (line 956) and holds all workflow sections (auth, recruit, roster, incoming, etc.).  
- Settings view is `<section id="settingsView" class="settings-view" hidden>` (line 1128) and is shown/hidden via `openSettings()`/`closeSettings()` (lines 5382-5399).  
- Settings are saved via `POST /api/preferences` (e.g., line 5779 for runningPlayers preference, line 5808 for devMode).  
- Settings are loaded via `GET /api/status` in the `refresh()` function (line 4425) and applied to UI by sync functions (e.g., `syncTimeFormatSetting` at line 5871, called from `renderStatus` at line 4398).  
- The toast (`#toast`) is a fixed-position element at the bottom (lines 508-526 CSS, line 1422 HTML).  
- Coach handoff banner (`#coachHandoffBanner`) and coach brief disclosure (`#coachBriefDisclosure`) are defined in CSS (lines 363-375) and used in the incoming card (lines 1046, 1032).  
- Tests exist for settings hierarchy (e.g., `test/s55-0-settings-hierarchy.test.mjs`) and UI components.  

### INFERENCE
- To reserve real layout space for a non-overlay AI Health banner (TOP or BOTTOM), the shell’s padding can be increased by the banner’s height, or a margin can be added to the header/mainWorkflow. For example, inserting a banner between the header and mainWorkflow would push the workflow downward, ensuring content does not hide beneath it.  
- The banner could be implemented as a flex container (similar to coach-handoff-banner) and placed as a sibling to the header (or within the shell but outside mainWorkflow) to persist across workflow state changes.  
- Settings persistence for banner position (TOP/BOTTOM) would follow the existing pattern: a new preference key (e.g., `aiHealthBannerPosition`) saved via `POST /api/preferences` and synced via a dedicated sync function in `renderStatus`.  
- Existing tests for settings and UI components can be extended to cover the new banner’s behavior and placement.  

### UNKNOWN
- The exact height/spacing requirements for the AI Health banner (compact vs. expanded) are not defined in the current codebase.  
- Whether the backend (`/api/preferences`) would accept a new preference key for banner position without modification is unknown (requires API inspection, which is out of scope for frontend-only reconnaissance).  
- Potential interactions with safe-area-inset variables (e.g., on iOS/Android) when adding banner space have not been tested.  

### CONTRADICTION
- No contradictions found; the current architecture supports adding persistent UI elements via the established settings and layout patterns.  

### IMPORTANT FILES / PATHS
- `src/public/index.html` – Contains the shell, header, mainWorkflow, settings view, toast, banner definitions, and embedded JavaScript for settings synchronization and UI toggling.  
- `src/public/index.html` (CSS lines) – Shell padding (43-47), header (49-55), toast (508-526), coach-handoff-banner (363-366), coach-brief-disclosure (372-375).  
- `src/public/index.html` (JS lines) – Settings toggle (5382-5399), settings persistence (5776-5785, 5800-5816, etc.), sync functions (5715-5920), refresh/renderStatus (4421-4445, 4058-4408).  
- `test/s55-0-settings-hierarchy.test.mjs` – Example test for settings behavior.  

### LIMITATIONS
- Reconnaissance is limited to the frontend shell, layout, settings, and visible components. No inspection of backend API routes or model changes was performed.  
- The report is based on the current state of the repository as of the commit visible in the working directory; it does not predict future changes.  
- Only files under `src/public` (frontend) were examined; internal TypeScript sources (`.ts` files) were not reviewed directly because the embedded HTML contains the compiled/runtime representation.  

---  
**End of Report**

### Full report — lane scoreboard-health-data-client (sideline-scout-deep)

Now I have a complete picture. Let me compile the reconnaissance report.

---

# SCOUT REPORT: AI Health UI Scoreboard Reconnaissance

**Play ID:** ai-health-ui-scoreboard-20260921-210149  
**Scout ID:** scoreboard-health-data-client  
**Assigned Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  

**Status:** RECONNAISSANCE ONLY — Not final architectural authority  
**Epistemic Labels:** FACT / INFERENCE / UNKNOWN / CONTRADICTION used throughout

---

## RESULT

The current Sideline Coach codebase exposes **canonical AI Health data via two Control Plane seams** that are fully implemented in the daemon (`src/control-plane/daemon.ts`) but **has zero frontend UI consumption** for this data in `src/public/index.html`. The smallest integration seam is adding an `ai-health` SSE event listener + a one-time `GET /api/ai-health` hydration call, feeding a compact scorecard component pair (compact inline + expanded drawer/modal).

---

## KEY DISCOVERIES

### 1. Backend HTTP API — `GET /api/ai-health` (FACT)
- **File:** `src/control-plane/daemon.ts` lines 1020–1023
- **Response:** `{ success: true, health: HealthAuthoritySnapshot }`
- **Auth:** Bearer token required (standard `isAuthorized` check)
- **Snapshot shape** (from `src/control-plane/health-authority.ts` lines 39–43):
  ```typescript
  interface HealthAuthoritySnapshot {
    schemaVersion: 1;
    updatedAt?: string;           // ISO timestamp of last change
    providers: {
      claude?: ClaudeProviderHealthState;
      codex?: CodexProviderHealthState;
    };
  }
  ```
- **Provider state** (lines 9–35):
  ```typescript
  interface ClaudeProviderHealthState {
    provider: 'claude';
    evidenceType: 'rate_limit_event';
    rateLimitInfo: Record<string, unknown>;  // provider-native facts
    observedAt: string;                       // ISO timestamp
    source: ProviderHealthSource;             // stadiumId, instanceId, gameId, playerInstanceId
  }
  interface CodexProviderHealthState {
    provider: 'codex';
    evidenceType: 'account_rate_limits';
    rateLimitInfo: Record<string, unknown>;
    observedAt: string;
    source: ProviderHealthSource;
  }
  ```

### 2. Backend SSE — `/api/events` broadcasts `ai-health` events (FACT)
- **File:** `src/control-plane/daemon.ts` line 222 — `this.broadcast('ai-health', snapshot)` on every `HealthAuthority.onChange`
- **Event frame format** (server.ts lines 912–921 / daemon.ts line 919):
  ```
  event: ai-health
  data: {"schemaVersion":1,"updatedAt":"...","providers":{"claude":{...},"codex":{...}}}
  ```
- **Initial snapshot** sent immediately on SSE connect (tested in `test/health-authority-daemon.test.mjs` line 56)
- **Deduplication:** `HealthAuthority.ingest()` returns `false` and does not broadcast when factual fields (excluding `observedAt`) are unchanged (health-authority.ts line 131)

### 3. Frontend SSE Handling — `connectEvents()` in index.html (FACT)
- **File:** `src/public/index.html` lines 4457–4502
- **EventSource** created with `?token=` query param
- **Current listeners:** `hello`, `reports`, `status`, `execution`, `activity`
- **Missing:** No `ai-health` listener
- **Connection state machine:** `offline` → `reconnecting` (on connect/error) → `connected` (after `synchronizeAfterHello()` completes)
- **Reconnect behavior:** `eventSource.onerror` → `setConnectionState('reconnecting')` → `synchronizeAfterHello()` on next `hello`

### 4. Frontend Initial Hydration — `refresh()` (FACT)
- **File:** `src/public/index.html` lines 4421–4445
- **Parallel fetch:** `Promise.all([api('/api/status'), api('/api/reports')])`
- **On success:** `renderStatus()`, `renderReports()`, `hideAuth()`, `setConnectionState('connected')`
- **No current call to `/api/ai-health`**

### 5. Provider-Native Facts — No Classification in Backend (FACT)
- `rateLimitInfo` is a `Record<string, unknown>` — **backend never interprets, classifies, or thresholds** these values (health-authority.ts lines 119–122, 196–208)
- **Claude:** `rate_limit_info` (e.g., `{ status: 'allowed', utilization: 0.42, resetsAt: 123456 }`)
- **Codex:** `rate_limits` (e.g., `{ primary: { usedPercent: 17, resetsAt: 777, windowDurationMins: 300 }, planType: 'pro' }`)
- **Validation only:** bounded copy (max 100 nodes, depth 4, string ≤500, array ≤20, object ≤30 keys)

### 6. State Persistence & Reset Timing (FACT)
- **Persisted to:** `~/.sideline/ai-health-state.json` (health-authority.ts line 58)
- **Restored on:** daemon construction (line 112) → `restore()` (lines 156–165)
- **Flushed on:** `HealthAuthority.flush()` called during `daemon.stop()` (line 523) and SIGINT/SIGTERM (line 682)
- **Reset = daemon restart** — state survives restart; only explicit `quarantine()` clears it

---

## FACT

| # | Claim | Evidence |
|---|-------|----------|
| F1 | `GET /api/ai-health` exists and returns `{ success: true, health: HealthAuthoritySnapshot }` | `daemon.ts:1020-1023` |
| F2 | SSE `/api/events` broadcasts `event: ai-health` with full snapshot on every change | `daemon.ts:222`, `health-authority.ts:138` |
| F3 | Initial SSE connection delivers `ai-health` snapshot immediately (before any evidence) | `health-authority-daemon.test.mjs:55-56` |
| F4 | Frontend `connectEvents()` handles `hello`, `reports`, `status`, `execution`, `activity` — **no `ai-health` listener** | `index.html:4463-4497` |
| F5 | Frontend `refresh()` hydrates from `/api/status` + `/api/reports` only — **no `/api/ai-health` call** | `index.html:4424-4430` |
| F6 | Provider facts in `rateLimitInfo` are **opaque, provider-native, never classified by backend** | `health-authority.ts:119-122, 196-208` |
| F7 | `HealthAuthority` is **single global instance per daemon** (not per-Game) | `daemon.ts:145` |
| F8 | Deduplication: identical factual payload (excl. `observedAt`) suppresses broadcast & save | `health-authority.ts:131` |
| F9 | State persists to `~/.sideline/ai-health-state.json` and restores on daemon restart | `health-authority.ts:58, 156-165`, `daemon.ts:523, 682` |
| F10 | Frontend connection states: `connected` | `reconnecting` | `offline` — controls `data-live-action` element enablement | `index.html:1833-1851` |
| F11 | Reconnect flow: `onerror` → `reconnecting` → `hello` → `synchronizeAfterHello()` → `refresh()` → `connected` | `index.html:4449-4455, 4498-4501` |
| F12 | No frontend tests for AI Health UI; backend tests cover daemon HTTP/SSE only | `test/health-authority-daemon.test.mjs` |

---

## INFERENCE

| # | Inference | Basis |
|---|-----------|-------|
| I1 | UI should render **provider-native facts verbatim** (utilization %, usedPercent, resetsAt, planType) — no "healthy/degraded" badges invented | F6, bounded objective forbids inventing classifications |
| I2 | **Absence of a provider** in `providers` = `UNKNOWN` (not "healthy", not "unavailable") | F1 snapshot shape shows optional `claude?`, `codex?` |
| I3 | `observedAt` is the **sole freshness signal** — UI should show "last updated X ago" or timestamp | F1, F9 |
| I4 | **Compact + Expanded should be a small component pair**: compact inline in header/status bar (provider pills with utilization), expanded drawer/modal on click showing full `rateLimitInfo` JSON + provenance (`source`, `observedAt`) | F3 initial snapshot available immediately; F10 connection state already drives header UI |
| I5 | One-time `GET /api/ai-health` on page load + `ai-health` SSE listener = complete data path | F2, F4, F5 |
| I6 | Reconnect `hello` should **not** reset AI Health UI — SSE `ai-health` event will redeliver current snapshot | F3, F11 |
| I7 | Provider availability = presence in `providers` object; `UNKNOWN` = absent; never infer from other signals | F1, F7 |

---

## UNKNOWN

| # | Question | Why Unknown |
|---|----------|-------------|
| U1 | Exact desired visual design for compact scorecard (pills? badges? single line?) | No UI spec in repository |
| U2 | Whether expanded view should be a modal, drawer, or inline accordion | No UI spec |
| U3 | Whether `rateLimitInfo` keys are stable across provider versions (e.g., Claude always sends `utilization`, `resetsAt`) | Backend treats as opaque `Record<string, unknown>` |
| U4 | Whether UI should show `source` provenance (stadiumId, instanceId, gameId, playerInstanceId) in expanded view | Bounded objective says "render provider-native facts... provenance" but no design |
| U5 | Whether a "stale" threshold (e.g., >5 min since `observedAt`) should be surfaced visually | No policy in codebase |
| U6 | Whether `updatedAt` on snapshot (optional) differs from latest provider `observedAt` | Schema allows both; not observed in tests |

---

## CONTRADICTION

| # | Claim | Evidence |
|---|-------|----------|
| C1 | None found — backend seams exist and are tested; frontend has zero consumption | F1–F12 consistent |

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/daemon.ts` | HTTP `/api/ai-health` (L1020), SSE broadcast `ai-health` (L222), HealthAuthority instantiation (L216–225) |
| `src/control-plane/health-authority.ts` | `HealthAuthoritySnapshot` type (L39–43), provider state types (L9–35), `ingest()` deduplication (L131), persistence (L58, L146–154) |
| `src/public/index.html` | Frontend SSE `connectEvents()` (L4457–4502), `refresh()` hydration (L4421–4445), connection state machine (L1833–1851), `renderStatus()` (L4058–4408) |
| `test/health-authority-daemon.test.mjs` | Canonical test for `/api/ai-health` + `ai-health` SSE — shows expected shapes and dedup behavior |
| `test/health-authority.test.mjs` | Unit tests for `HealthAuthority` validation, persistence, quarantine |

---

## SMALLEST UI INTEGRATION SEAM (INFERENCE)

**Files to touch (read-only reconnaissance — not implementing):**
1. `src/public/index.html` — add in `connectEvents()`:
   ```js
   eventSource.addEventListener('ai-health', (event) => {
     aiHealthSnapshot = JSON.parse(event.data);
     renderAiHealthScoreboard(aiHealthSnapshot);
   });
   ```
2. `src/public/index.html` — in `refresh()` or `synchronizeAfterHello()`:
   ```js
   const health = await api('/api/ai-health').catch(() => null);
   if (health) renderAiHealthScoreboard(health.health);
   ```

**Component pair (INFERENCE):**
- **Compact** — inline in header near connection dot: `Claude: 42% · Codex: 17%` (or `Claude: UNKNOWN · Codex: 17%`)
- **Expanded** — click compact → drawer/modal showing per-provider:
  - Provider-native `rateLimitInfo` as formatted JSON / key-value list
  - `observedAt` (human relative + ISO)
  - `source` provenance (stadiumId, instanceId, gameId, playerInstanceId)
  - `UNKNOWN` badge when provider absent

**State object (INFERENCE):**
```js
let aiHealthSnapshot = null; // HealthAuthoritySnapshot | null
```

**No new stores, no polling, no classification logic** — pure projection of canonical backend truth.

---

## LIMITATIONS

- Reconnaissance only — did not inspect any Figma, design docs, or product specs outside the codebase
- Did not verify browser compatibility of `EventSource` (assumed supported per existing usage)
- Did not test actual frontend rendering — only traced code paths
- Provider-native fact schemas (`rateLimitInfo` keys) observed only via test fixtures; real provider shapes may vary
- No accessibility / i18n requirements captured

---

**End of Report**

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-ui-scoreboard-20260921-210149
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\ai-health-ui-scoreboard-20260921-210149

