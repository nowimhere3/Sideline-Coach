**Scout Agent**: scout-a-remote-transport-auth  
**Model**: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note**: This is reconnaissance, not final architectural authority.

# RESULT
The existing Sideline remote access seam (WebSocket tunnel via `relay.remote.mysidelinecoach.com`) could be extended to expose exactly one active Game-owned PreviewEndpoint to Dad's authenticated remote phone session by adding a new proxied HTTP endpoint (e.g., `/api/games/preview/content`) that forwards preview requests to the Stadium (or daemon's static preview server) and marking it as `remote-read` in `remote-routes.ts`. This would reuse the authenticated transport, avoiding a parallel system.

# KEY DISCOVERIES
- The daemon's `/api/games/preview` endpoint returns `available: false` with reason `remote-viewer` for remote principals, intentionally withholding the actual preview URL (which is Stadium-localhost-only).
- Remote authentication is handled via the `sl_dev` cookie verified by the `DeviceRegistry` in the `InProcessRemoteAdapter`.
- The daemon already proxies many Stadium‑hosted resources (files, reports, etc.) via `proxyExactGameRpc` over the Stadium‑to‑daemon WebSocket session.
- The static preview server (`StaticPreviewServer`) binds to `127.0.0.1:dynamic` and is started by the daemon on demand.
- The Stadium communicates with the daemon over a persistent WebSocket (stadium.hello, etc.) and exposes features like `game.preview.v1` for preview resolution.
- The remote phone loads the Sideline web app (served by the daemon's public directory) and uses the same WebSocket tunnel for API calls.

# FACT
- The CoachServer (`src/server.ts`) binds to `127.0.0.1` only (line 108).  
- The ControlPlaneDaemon (`src/control-plane/daemon.ts`) binds to `127.0.0.1` only (line 1194).  
- The daemon's `/api/games/preview` handler returns `{ success: true, gameId, available: false, endpoints: [], reason: 'remote-viewer' }` when `principal.kind === 'remote-device'` (lines 2205‑2207).  
- For local principals, the daemon proxies to the Stadium via `proxyExactGameRpc(res, gameId, 'game.preview.v1', 'game.preview.resolve', ...)` (lines 2213‑2215).  
- Remote authentication uses the `sl_dev` cookie validated by `DeviceRegistry.authenticate(rawToken)` in `InProcessRemoteAdapter.dispatch` (lines 81‑97).  
- The relay configuration defaults to `wss://relay.remote.mysidelinecoach.com/tunnel/v1` and domain `remote.mysidelinecoach.com` (`src/control-plane/remote-bootstrap.ts`, lines 4‑6).  
- The daemon serves static files (`index.html`, `pair.html`, `sw.js`) from `src/public` for the remote app (lines 1815‑1828).  
- The `proxyExactGameRpc` function is used to proxy RPCs to the Stadium (e.g., for game files) and requires a Stadium feature (e.g., `game.files.v1`) (lines 3788‑3823).  
- The preview RPC uses feature `game.preview.v1` and method `game.preview.resolve` (line 2213).  
- Remote‑access route classification is defined in `remote-routes.ts` (e.g., `/api/games/preview` is `remote-read` line 35).  

# INFERENCE
- The remote phone can obtain preview metadata (e.g., that a preview exists) via the `/api/games/preview` endpoint but cannot access the actual preview URL because it is a Stadium‑localhost URL (e.g., `http://localhost:3000`) that is not routable to the remote phone.  
- The existing WebSocket tunnel (relay) could carry preview HTTP traffic if a new proxied endpoint (e.g., `/api/games/preview/content`) were added, similar to existing proxied endpoints like `/api/games/files/*`.  
- The Stadium could act as a reverse proxy for its preview HTTP server over the WebSocket tunnel, or the daemon could forward requests to its own `StaticPreviewServer`.  
- Reusing the authenticated remote transport (the WebSocket tunnel) avoids creating a parallel system and leverages the existing session/device authentication.  

# UNKNOWN
- Whether the Stadium's preview endpoint (e.g., a Vite dev server) supports being proxied via a generic HTTP reverse proxy without breaking features like Hot Module Replacement (HMR) or websocket fallbacks.  
- If the daemon's `StaticPreviewServer` can safely handle concurrent requests from multiple remote phones while preserving correctness and security.  
- Whether the existing `proxyExactGameRpc` mechanism can be extended to stream arbitrary HTTP responses (including binary assets and streaming) without buffering limits.  
- Whether the remote phone's web app would need modification to use the new proxied preview URL instead of the Stadium‑localhost URL.  

# CONTRADICTION
- No contradictions found; all evidence aligns with the current design where remote principals are deliberately excluded from accessing the preview endpoint for security/isolation reasons.  

# ARCHITECT DECISION REQUIRED
- Whether to expose the preview endpoint via a new proxied HTTP route (e.g., `/api/games/preview/content`) under the existing remote‑access seam, or to alter the preview endpoint resolution to return a relay‑proxied URL (requiring changes in both daemon and Stadium).  
- If a new route is added, what path should be used (e.g., `/api/games/preview/content`, `/_preview/*`) and what HTTP methods should be allowed (likely `GET` for static assets).  
- How to handle caching, compression, and security headers for proxied preview content to prevent leakage of unrelated Stadium resources.  
- Whether to restrict the proxied preview endpoint to only the active Game's preview endpoint (ensuring exactly one active Game-owned PreviewEndpoint is exposed) and how to enforce that restriction (e.g., by validating the `gameId` parameter against the daemon's selected game).  

# IMPORTANT FILES / PATHS
- `src/server.ts` – CoachServer (local API, binds to 127.0.0.1)  
- `src/control-plane/daemon.ts` – ControlPlaneDaemon (handles HTTP, preview logic, proxyExactGameRpc, static preview server integration)  
- `src/control-plane/remote-routes.ts` – Defines route access levels (e.g., `remote-read` for `/api/games/preview`)  
- `src/control-plane/remote-dispatch.ts` – Processes inbound WebSocket frames, authenticates remote principals via `sl_dev` cookie  
- `src/control-plane/relay-client.ts` – Manages WebSocket tunnel to `relay.remote.mysidelinecoach.com`  
- `src/control-plane/remote-bootstrap.ts` – Defines product relay URL and domain  
- `src/preview-discovery.ts` – Contains `projectPreviewResolution` and static preview discovery logic  
- `src/static-preview.ts` – Implements `StaticPreviewServer` (binds to 127.0.0.1:dynamic)  
- `src/public/index.html` – Entry point for the remote phone web app  
- `src/control-plane/protocol.ts` – Defines RPC shapes (e.g., `game.preview.v1`, `game.preview.resolve`)  

---  
*End of reconnaissance report.*  
*No files were modified, and no commands were executed.*  
*All evidence is derived from read‑only inspection of the current repository.*  
*This report is intended for architectural consideration only.*
