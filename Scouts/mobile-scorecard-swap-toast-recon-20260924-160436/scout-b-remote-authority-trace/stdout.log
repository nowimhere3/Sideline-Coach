**RESULT:** STALE UX GUARD

**KEY DISCOVERIES:**
- The toast message originates from `src/control-plane/daemon.ts` lines 1324‑1326, which is the generic unauthorized‑access handler for local‑only routes when accessed by a non‑local‑admin principal (e.g., a remote device).
- The POST `/api/preferences` endpoint is marked `access: 'local-only'` in `src/control-plane/remote-routes.ts` line 62.
- Remote‑device principals are only permitted `remote‑read` or `remote‑mutate` access (see `principalMayAccess` in `src/control-plane/remote-routes.ts` lines 81‑83); therefore they cannot mutate preferences via this endpoint.
- The client‑side `aiScoreboardTogglePlacement` function in `src/public/index.html` (lines 6087‑6097) optimistically updates the UI and `lastStatus` before persisting the preference via `POST /api/preferences`. On failure, it shows a toast with the error message from the server.
- When a remote device toggles the AI Usage Scorecard position, the UI updates immediately (optimistic), the persistence request is rejected with 403 and the message “This action is available only on the local Sideline,” and the toast is shown—creating a mismatch between the warning and the successful visual update.

**FACT:**
- File `src/control-plane/daemon.ts` lines 1324‑1326 contain the exact string: `this.sendJson(res, 403, { success: false, message: 'This action is available only on the local Sideline.' });`
- File `src/control-plane/remote-routes.ts` line 62 defines: `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' },`
- File `src/control-plane/remote-routes.ts` lines 81‑83 define the `principalMayAccess` function that restricts non‑local‑admin principals to `remote‑read` or `remote‑mutate` access.
- File `src/public/index.html` lines 6087‑6097 show the optimistic update and error‑toast logic for the scoreboard placement toggle.
- Field evidence confirms that on the remote Android surface, tapping the scoreboard position switch moves the scorecard (optimistic update) and displays the toast.

**INFERENCE:**
- The toast is a stale UX guard because the underlying action (moving the scoreboard) succeeds from the user’s perspective due to optimistic UI update, while the warning incorrectly implies the action is blocked entirely. The real authorization guard (local‑only preference mutation) remains intact and is enforced by the server (the API call fails), but the warning does not distinguish between the visual effect and the persistence step.
- The preference `aiScoreboardPlacement` likely does not guard a sensitive security boundary, as it is a UI‑only setting, making the warning overly restrictive for this specific action.

**UNKNOWN:**
- Whether other `local‑only` preference mutations (e.g., `remoteAccess.enabled`, `devMode`) could pose a security risk if allowed from remote devices—this would require examining each preference’s sensitivity.
- Whether the optimistic update pattern is intentional for all preference toggles or only for the scoreboard placement.

**IMPORTANT FILES / PATHS:**
- `src/control-plane/daemon.ts` – contains the toast‑message handler (lines 1324‑1326)
- `src/control-plane/remote-routes.ts` – defines route access policies (line 62 for `/api/preferences`)
- `src/public/index.html` – client‑side logic for scoreboard toggle and toast display (lines 6087‑6097)
- `src/control-plane/remote-routes.ts` – defines `principalMayAccess` (lines 81‑83)
