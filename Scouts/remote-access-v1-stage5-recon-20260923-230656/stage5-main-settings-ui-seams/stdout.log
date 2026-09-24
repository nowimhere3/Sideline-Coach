**RESULT**  
The Sideline Coach UI is a single‑page application contained in `src/public/index.html`. The main page (the scrollable region `<main id="gameScrollRegion">`) consists of a header followed by a sequence of cards: **authCard** (Access), **recruitCard** (Scouting), **rosterCard** (Roster), **incomingCard** (Latest Report), and **outgoingCard** (Play Dispatcher). The Settings UI is a hidden `<section id="settingsView">` that presents a vertical list of disclosable cards (mode‑settings, live‑player‑terminal, scout‑intelligence, coach‑routines, game‑setup, routing, players‑providers, usage‑budgets, stadiums, github‑repositories, time‑format, ai‑usage‑scorecard). The AI Usage Scoreboard (`<div id="aiScoreboardContainer">`) is a flex sibling of the main scroll region.

**KEY DISCOVERIES**  
- The page already provides a generic modal seam (`#confirmModal`) used for confirmation dialogs (lines 2023‑2032) and a reusable browsing sheet (`#gameBrowserSheet`) for file‑folder selection (lines 1994‑…).  
- The central refresh routine `refresh()` (lines 5801‑5826) polls `/api/status` and `/api/reports`, updates UI, hides auth, and reconciles connection state.  
- Settings cards follow a uniform pattern: a `<div class="settings-card settings-disclosure">` with a header button (`settings-disclosure-header`) and a collapsible body (`settings-disclosure-body`).  
- No existing Remote Access API endpoints appear in the script; all current endpoints relate to reports, dispatch, preferences, routines, and health telemetry.  
- The visual header already contains a connection indicator and a Settings button in `.header‑actions`; adding a third button there would preserve the existing layout and visual hierarchy.

**FACT**  
- The main page hierarchy is: `body > main#gameScrollRegion > header`, then sequentially `section#authCard`, `section#recruitCard`, `section#rosterCard`, `section#incomingCard`, `section class="card"` (outgoing Play Dispatcher) – all visible within the scrollable region (lines 1430‑1626).  
- The Settings UI is hidden by default (`settings-view[hidden]` CSS) and revealed via `$('#settingsBtn').click()` → `openSettings()` (lines 7113‑7127).  
- The generic confirmation modal is defined by `.modal-backdrop` and `.modal` CSS (lines 746‑760) and instantiated as `<div id="confirmModal" class="modal-backdrop" hidden> … </div>` (lines 2023‑2032).  
- The `refresh()` function (lines 5801‑5826) performs `await Promise.all([api('/api/status'), api('/api/reports')])`, then calls `renderStatus`, `renderReports`, `fetchAiHealth`, `hideAuth`, and updates connection state.  
- Settings cards are constructed using the pattern seen in `modeSettingsCard` (lines 1639‑1649), `livePlayerConsoleCard` (lines 1661‑1714), etc., each with a header button and a collapsible body.  
- The following API endpoints are invoked in the script: `/api/status`, `/api/reports`, `/api/events` (SSE), `/api/session`, `/api/work/acknowledge`, `/api/player-activity`, `/api/scout/*`, `/api/preferences`, `/api/routines/*`, `/api/games/filesystem/*`, `/api/dispatch`. No endpoints related to remote access (pairing, device list, toggle) are present.  
- The visual header actions are located in `<div class="header-actions">` (lines 1451‑1454) and currently contain a `.connection` element and the `#settingsBtn` button.  

**INFERENCE**  
- A “Send to Phone” button would fit naturally as a third element in `.header‑actions`, aligned with the existing Settings button, because the header already groups compact actions (connection status, settings) and the main page is intended to expose a single outcome action (SEND TO PHONE) without becoming a dashboard.  
- The QR pairing dialog could reuse the existing `#confirmModal` markup and styling (modal backdrop + centered modal) – the same pattern used for the “Remove Player” confirmation – by replacing its title/body/actions with QR‑code display and a Cancel button.  
- Remote Access state can be derived from a combination of `connectionState` (`connected`/`reconnecting`/`offline`) and a new preference flag (e.g., `remoteAccessEnabled`) stored via `/api/preferences`. The UI would reflect:  
  - *Unavailable*: `connectionState !== 'connected'`  
  - *Available*: `connectionState === 'connected'` & `remoteAccessEnabled === false`  
  - *Pairing ready*: `remoteAccessEnabled === true` & no active pairing  
  - *Waiting for phone*: after user taps “Send/Pair another device” and QR displayed  
  - *Paired*: after phone scans QR and reports success via `/api/remote-access/pair`  
  - *Phone connected*: when a device shows active session in `/api/status`  
  - *Desktop/relay offline*: `connectionState === 'offline'`  
  - *Error*: non‑OK response from remote‑access APIs  
- The Settings IA already supports a new card; a logical place for Remote Access is after the Mode Settings card (Dad Mode) and before the Live Player Terminal card, preserving the top‑to‑bottom flow of account‑related → device‑related → advanced‑feature sections.  
- Device‑list updates would arrive via the existing status‑refresh mechanism (`refresh()`) or SSE `status`/`reports` events, because the Control Plane would expose paired devices in `/api/status` (or a dedicated `/api/remote-access/status`) which `renderStatus` already consumes.  
- Since no remote‑access endpoints are observed, implementing the feature would require adding new API routes in the Control Plane (e.g., `/api/remote-access/*`). The UI layer would only need to call those endpoints and update state accordingly.  
- Adding the button, modal, settings card, and wiring their click handlers to the new endpoints would be the smallest viable slices, each of which can be tested independently.  

**UNKNOWN**  
- Whether the Control Plane already exposes remote‑access related data in `/api/status` or `/api/reports` under a different key (no evidence found).  
- The exact shape of the pairing payload (e.g., whether a QR code is represented as a data‑URL or a base64 string) and which endpoint delivers it.  
- Whether the existing `connectionState` transitions already reflect relay‑only versus phone‑connected states, or whether a distinct `remoteAccessState` is needed.  
- The precise naming and default values for the new preference(s) that would gate Remote Access (e.g., `remoteAccess.enabled`, `remoteAccess.relayUrl`).  

**CONTRADICTION**  
- None observed within the scoped UI code; all patterns are consistent and extensible.

**IMPORTANT FILES / PATHS**  
- `src/public/index.html` – the sole UI source; modifications would be confined to this file for the button, modal, settings card, and associated event listeners.  
- (Backend API contracts are out of scope for this read‑only reconnaissance; any required endpoint additions would reside in the Control Plane TypeScript files under `src/control-plane/`.)  

---  
**Scout ID:** stage5-main-settings-ui-seams  
**Assigned model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note:** This report is reconnaissance, not final architectural authority.  

---  
*End of report.*
