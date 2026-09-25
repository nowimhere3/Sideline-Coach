**Sideline Coach Reconnaissance Report**  
**Scout ID:** scout-b-settings-remote-audit  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Assignment:** LANE B — SETTINGS REMOTE CAPABILITY AUDIT (Play ID: remote-mobile-capability-audit-20260924-180939)  
**Note:** This is read‑only reconnaissance; no files were modified, and no implementation was performed.

---

## RESULT
The Settings button itself triggers a GET request to `/api/scout/openrouter-credential?gameId=<id>` when opened, which is marked `local‑only` in the daemon’s route policy. When accessed from a remote device (non‑localhost hostname), the daemon refuses the request with HTTP 403 and the browser shows the toast *“This action is available only on the local Sideline.”*  

Internally, opening Settings also restores browser‑local UI state (card order, disclosure states) from IndexedDB and renders UI based on the last‑known `status` object (cached from prior `/api/status` polls). No other API calls are made on open.

Once the Settings view is visible, most interactive controls (toggles, buttons) either:
- early‑return if `isRemoteDevicePresentation()` is true (e.g., Remote Access toggle, paired‑device controls), **or**
- attempt to POST to `/api/preferences` or other `local‑only` endpoints (e.g., Dev Mode, Live Player Console, Time Format, AI Scoreboard, Players & Providers, etc.) and are rejected by the daemon with the same 403/toast.

A small subset of endpoints are marked `remote‑mutate` (e.g., `/api/route`, `PATCH /api/routines/repository`) and could be safely mutated remotely, but the current Settings UI does not expose those through remote‑friendly event listeners (they either lack remote‑mutation paths or are gated by Dev Mode checks).

Thus, the Settings **experience** cannot be opened remotely without triggering a local‑only request, and many controls inside Settings remain capable of attempting mutations that are blocked, violating the product invariant.

---

## KEY DISCOVERIES
1. **FACT** – The Settings button (`#settingsBtn`) click handler is `openSettings` (inline script, line 7811‑7835).  
2. **FACT** – `openSettings` unconditionally calls `loadScoutOpenRouterCredential()`, which issues a GET request to `/api/scout/openrouter-credential?gameId=<id>` (line 7912).  
3. **FACT** – In `src/control-plane/remote-routes.ts`, the route `{ methods: ['GET'], path: '/api/preferences', access: 'remote-read' }` (line 61) and `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' }` (line 62) show that reading preferences is allowed remotely, but writing preferences is local‑only.  
4. **FACT** – The daemon’s authorisation middleware (lines 1310‑1327 of `daemon.ts`) evaluates route access via `classifyDaemonRoute` and rejects non‑local‑admin principals for `local‑only` routes with the exact message used in the field evidence.  
5. **FACT** – Many Settings controls have event listeners that either:
   - Guard mutation attempts with `if (isRemoteDevicePresentation()) return;` (e.g., Remote Access toggle, paired‑device controls), **or**
   - Lack such a guard and directly call `api('/api/preferences', {method:'POST', …})` (e.g., Dev Mode toggle, Live Player Console toggle, Time Format toggles, AI Scoreboard settings, Players & Providers running preference).  
   Those without the guard still fail because the daemon treats POST `/api/preferences` as `local‑only`.  
6. **FACT** – Browser‑local UI state (settings card order, disclosure expanded/collapsed state) is stored in IndexedDB under the store `sideline-coach-ui`/`settings-disclosure-state` and is read via `restoreSettingsCardOrder` and `restoreSettingsDisclosures` (lines 7591‑7600, 7543‑7561).  
7. **INFERENCE** – The Remote Access toggle is not visually disabled when presented remotely, despite its change listener early‑returning; this deviates from the invariant’s requirement that genuinely local‑only controls must be deliberately represented as non‑working in the remote UI.  
8. **UNKNOWN** – Whether the remote‑mutate endpoints (`/api/route`, `PATCH /api/routines/repository`) are safely exposed elsewhere in the UI (e.g., via hidden or advanced controls) was not exhaustively traced due to time constraints.  

---

## FACT
- **File:** `src/public/index.html`  
  - Line 1584: `<button id="settingsBtn" class="settings-btn" …>⚙ Settings</button>`  
  - Lines 7811‑7835: `openSettings` function definition.  
  - Line 7827: `void loadScoutOpenRouterCredential();`  
  - Lines 7905‑7924: `loadScoutOpenRouterCredential` function (makes GET `/api/scout/openrouter-credential`).  
  - Line 7848: `$('settingsBtn')?.addEventListener('click', openSettings);`  
  - Lines 7319‑7332: `syncRemoteAccessSettings` (uses `lastStatus`, no API call).  
  - Lines 7543‑7561: `restoreSettingsDisclosures` (IndexedDB read).  
  - Lines 7591‑7600: `restoreSettingsCardOrder` (IndexedDB read).  
- **File:** `src/control-plane/remote-routes.ts`  
  - Line 61: GET `/api/preferences` → `remote-read`  
  - Line 62: POST `/api/preferences` → `local-only`  
  - Line 39: PATCH `/api/routines/repository` → `remote-mutate`  
  - Line 52: POST `/api/route` → `remote-mutate`  
- **File:** `src/control-plane/daemon.ts`  
  - Lines 1310‑1327: Route access check and 403 response with message *“This action is available only on the local Sideline.”*  

---

## INFERENCE
- The Settings view can be rendered remotely **if** the call to `/api/scout/openrouter-credential` is avoided or made `remote‑read`. All other data used for initial render (lastStatus, browser‑local UI state) is already available without additional remote‑unsafe requests.  
- The Remote Access toggle’s lack of visual disabling when remote is a deviation from the invariant; the correct remote representation would be to either hide the control or disable it (greyed out) to indicate it is genuinely local‑only.  
- Controls that attempt to mutate `local‑only` endpoints (e.g., Dev Mode) will inevitably trigger the 403/toast when interacted with remotely, regardless of any client‑side guard, because the daemon enforces the policy.  

---

## UNKNOWN
- Whether any Settings control is actually wired to a `remote‑mutate` endpoint (beyond those observed in the route table) was not confirmed; the UI may hide such controls behind feature flags or Dev Mode.  
- The exact fallback behavior when `loadScoutOpenRouterCredential` fails (e.g., default UI state) was not observed in a live remote session, but the code suggests it sets `scoutOpenRouterAvailable = false` and renders accordingly.  
- Whether the remote UI should expose a read‑only version of the Scout Intelligence credential status (configured/available) as a `remote‑read` field was not evaluated for security implications.  

---

## IMPORTANT FILES / PATHS
- `src/public/index.html` – Contains the Settings button handler, `openSettings`, and all Settings UI markup and event listeners.  
- `src/control-plane/remote-routes.ts` – Defines route access levels (`remote-read`, `local-only`, `remote-mutate`).  
- `src/control-plane/daemon.ts` – Implements the access check that returns the 403/toast for `local‑only` routes when the principal is not a local‑admin.  
- `src/public/index.html` (lines 7543‑7600) – Browser‑local persistence of UI state (IndexedDB).  

---

## ANSWERS TO SPECIFIC QUESTIONS

**1. Exact Settings button handler:**  
`openSettings` (inline script in `index.html`, lines 7811‑7835).

**2. What happens immediately on open:**  
- Calls `syncRemoteAccessSettings(lastStatus)` to update Remote Access UI based on cached `lastStatus`.  
- Awaits `restoreSettingsDisclosures()` and `restoreSettingsCardOrder()` (browser‑local UI state).  
- Shows the Settings view (`$('settingsView').hidden = false`) and hides the main workflow.  
- Hides the AI scoreboard container.  
- Renders player strips.  
- Focuses the settings back button.  
- Calls `loadScoutOpenRouterCredential()` (see below).  
- If **not** a remote device presentation (`!isRemoteDevicePresentation()`), additionally:  
  - Calls `loadPairedDevices()` (GET `/api/devices`).  
  - Calls `api('/api/status')` to refresh `lastStatus` and re‑sync remote access settings.

**3. Every endpoint/read/write triggered merely by opening Settings:**  
- **GET** `/api/scout/openrouter-credential?gameId=<id>` (via `loadScoutOpenRouterCredential`).  
- No other API calls are made unconditionally. The conditional `/api/devices` and `/api/status` calls are skipped when `isRemoteDevicePresentation()` is true (i.e., remote access).

**4. Exact request producing the local‑only 403/toast:**  
The GET request to `/api/scout/openrouter-credential?gameId=<id>` (made by `loadScoutOpenRouterCredential`) is classified `local‑only`; the remote‑device principal is denied by the daemon, resulting in HTTP 403 and the toast *“This action is available only on the local Sideline.”*

**5. Whether Settings can safely OPEN remotely without granting mutation authority:**  
**No**, as currently implemented, because opening Settings inevitably triggers the above `local‑only` request. To make the Settings **experience** safe to open remotely, one must either:  
- Change the access of `/api/scout/openrouter-credential` (at least the GET variant) to `remote‑read` in `remote-routes.ts` (after verifying that exposing credential configuration/availability does not leak sensitive data), **or**  
- Skip the call to `loadScoutOpenRouterCredential` when `isRemoteDevicePresentation()` is true and rely on possibly stale `lastStatus` or a neutral UI state.  

Even after fixing the open request, many controls inside Settings (e.g., Dev Mode toggle, Live Player Console toggle, Time Format toggles, AI Scoreboard settings, Players & Providers running preference) will still attempt to mutate `local‑only` endpoints when interacted with remotely, resulting in the same 403/toast. To fully satisfy the invariant, those controls must either:  
- Be visually disabled or hidden when `isRemoteDevicePresentation()` is true, **or**  
- Be remapped to `remote‑mutate` endpoints (where safe) and their event listeners adjusted accordingly.  

**6. All Settings controls currently rendered or reachable on the remote surface:**  
All cards in the Settings view are rendered in the DOM when `$('settingsView').hidden = false`. However, some cards are conditionally hidden based on `lastStatus.preferences.devMode` (e.g., Live Player Console, Advanced Player Discovery) or `isRemoteDevicePresentation()` (Remote Session card is hidden when local, shown when remote). The remote user can see and interact with every control that is not hidden by CSS (`hidden` attribute) or JavaScript.

**7. Classification of representative settings (per the assignment’s focus areas):**  

| Setting / Control | Read Source | Mutation Endpoint | Remote‑Safe? | Classification (per invariant) |
|-------------------|-------------|-------------------|--------------|--------------------------------|
| **Remote Access master toggle** | `lastStatus.preferences.remoteAccess.enabled` (via `syncRemoteAccessSettings`) | POST `/api/preferences` (`local-only`) | ❌ (blocked by daemon) | **GENUINELY LOCAL‑ONLY** (should be hidden/disabled remotely) |
| **Paired‑device management (name, revoke)** | `pairedDevices` (filled by `loadPairedDevices` – skipped remotely) | PATCH/DELETE `/api/devices/:id` (`local-only`) | ❌ (listener early‑returns if remote) | **GENUINELY LOCAL‑ONLY** (hidden/greyed out remotely) |
| **Dev Mode toggle** | `lastStatus.preferences.devMode` (not synced in openSettings; read via listener/refresh) | POST `/api/preferences` (`local-only`) | ❌ (blocked by daemon) | **GENUINELY LOCAL‑ONLY** (should be hidden/disabled remotely) |
| **Live Player Console toggle** | `lastStatus.preferences.livePlayerConsole` | POST `/api/preferences` (`local-only`) | ❌ (blocked by daemon) | **GENUINELY LOCAL‑ONLY** |
| **Terminal Success Retention** | `lastStatus.preferences.terminalRetention` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Show sensitive terminal output on paired devices** | `lastStatus.preferences.remoteSensitiveTerminalOutput` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Advanced Player Discovery** | `lastStatus.preferences.advancedPlayerDiscovery` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Time Format (12h/24h)** | `lastStatus.preferences.timeFormat` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **AI Scoreboard placement, density, etc.** | various `lastStatus.preferences.*` fields | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Players & Providers (Running Players preference)** | `lastStatus.preferences.runningPlayers` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **GitHub repository URL (Coach Routines)** | `lastStatus?.coachRepoUrl` (via `syncCoachRoutinesSettings`) | PATCH `/api/routines/repository` (`remote-mutate`) | ✅ (endpoint is `remote‑mutate`) | **SAFE REMOTE‑MUTATE** (if exposed) |
| **Routing policy (AUTO/MANUAL, manual fallbacks)** | `lastStatus.routingMode`, `lastStatus.manualSelection` | POST `/api/route` (`remote‑mutate`) | ✅ (endpoint is `remote‑mutate`) | **SAFE REMOTE‑MUTATE** (if exposed) |
| **Settings card order, disclosure expanded/collapsed state** | IndexedDB (`sideline-coach-ui` store) | IndexedDB writes (browser‑local) | ✅ (no server involvement) | **BROWSER‑LOCAL** |

**8. Smallest architecture to allow Settings EXPERIENCE to work remotely while preserving local‑admin security boundaries:**  
- **Change the GET variant of `/api/scout/openrouter-credential` to `remote‑read`** (or otherwise avoid the call when remote). This eliminates the 403/toast on Settings open.  
- **For every Setting control that is genuinely local‑only (i.e., mutates host‑state or affects security/Remote Access/Dev Mode/daemon state), either:**  
  - Hide or disable the control when `isRemoteDevicePresentation()` is true, **or**  
  - If the mutation is safe to expose remotely (e.g., certain routing or coach‑routine changes that do not affect host security), remap the control to a `remote‑mutate` endpoint and ensure the daemon’s policy allows it.  
- **Do not globally open POST `/api/preferences`**; instead, evaluate each preference field individually for remote‑mutate suitability (as the daemon already does for specific endpoints like `/api/route` and `PATCH /api/routines/repository`).  

**9. Recommended regression tests:**  
- Verify that opening Settings remotely does **not** result in the local‑only toast.  
- Verify that Remote Access toggle, Dev Mode toggle, Live Player Console toggle, and other genuinely local‑only controls are either hidden/disabled or show a neutral state when presented remotely.  
- Verify that controls mapped to `remote‑mutate` endpoints (e.g., GitHub repo URL in Coach Routines, Routing policy) still function correctly when modified from a remote session.  
- Verify that local‑only mutation attempts (e.g., toggling Dev Mode remotely) are rejected by the daemon with the appropriate 403 response and that the UI reverts the control to reflect the server’s state.  

---

**End of Report**  
*Scout ID: scout-b-settings-remote-audit*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  
*Timestamp: Thu Sep 24 2026*
