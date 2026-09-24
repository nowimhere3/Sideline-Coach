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
