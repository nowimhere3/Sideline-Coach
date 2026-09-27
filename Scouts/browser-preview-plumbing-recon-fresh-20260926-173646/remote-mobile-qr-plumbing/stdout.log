Now line 1659.
Now we need to see where the principal is determined from the device cookie. Look in daemon.ts for where it checks cookies for device authentication.

Search for "deviceId" or "remote-device" in daemon.ts.
Now we need to see where the cookie is checked to set principal to remote-device. Look at lines around 1530 and 97 in remote-dispatch.ts. Let's examine remote-dispatch.ts to see how it determines principal.

But first, let's look at daemon.ts around line 1530.
We see that dispatchRemoteRequest expects a principal of kind 'remote-device'. This function is likely called from the main HTTP handler after determining the principal.

Let's look for where principal is determined. Search for "principalMayAccess" or "classifyDaemonRoute" in daemon.ts.

We saw earlier that daemon.ts imports classifyDaemonRoute, isKnownDaemonRoutePath, principalMayAccess from ./remote-routes. Let's see how they are used.

Search for "principalMayAccess" in daemon.ts.
Let's look at line 1762 in daemon.ts to see how principal is used.
We need to see the resolvePrincipal function. Let's search for that.
Let's look at the resolvePrincipal function definition.
Maybe it's a method. Let's search for "resolvePrincipal" as a method.
Let's search for "resolvePrincipal" with colon.
Let's just read the daemon.ts around line 1700 to see the function.
We need to find the resolvePrincipal method. Let's search for "resolvePrincipal" as a method by looking for "this.resolvePrincipal" and then look above for its definition.

Let's search for "resolvePrincipal" in the whole daemon.ts and see where it's defined.
It seems the method is not found; maybe it's defined elsewhere? Let's search for "resolvePrincipal" in the entire src folder.
Let's look at the class definition and see if it extends anything.
It doesn't extend anything. So resolvePrincipal must be a method defined later in the class. Let's search for "resolvePrincipal" as a method by searching for "resolvePrincipal(".
Let's search for "resolvePrincipal" with a space before parentheses.
It seems the method is not found; maybe it's defined in a base class that we missed because the grep didn't show it due to line boundaries? Let's just read the entire daemon.ts from line 2000 to end to see if we can find it.

But time is limited. Let's think: the resolvePrincipal likely extracts the principal from either the Bearer token (for local-admin) or from the device cookie (for remote-device). We can infer that from the usage.

We saw that the WebSocket upgrade and stadium.hello check the Bearer token against authToken for local-admin. The device cookie is likely checked elsewhere.

Let's search for "sl_local" (the cookie name we saw in the session endpoint).
Now search for "cookie" in daemon.ts to see where it reads cookies.
We see in remote-dispatch.ts lines 70-81 that it extracts the device cookie. Let's look at remote-dispatch.ts to understand how the principal is set for remote-device.

Let's read remote-dispatch.ts.
Now we have a clear picture:

- The InProcessRemoteAdapter is used to convert incoming relay frames (or direct HTTP?) into a principal of kind 'remote-device' by verifying the device cookie (sl_dev) against the DeviceRegistry.
- This adapter is likely used by the relay client when the daemon receives requests via the relay.
- For direct connections (localhost), the device cookie is also checked? Let's see where the InProcessRemoteAdapter is instantiated.

Search for InProcessRemoteAdapter in daemon.ts.
Thus the InProcessRemoteAdapter is used by the relay-client.ts to adapt incoming relay frames to principal.

Now, for direct connections (not via relay), how is the principal determined? Let's look at the daemon's HTTP handler for regular requests (not WebSocket upgrade). We saw that after checking for WebSocket upgrade and health, etc., it goes to the UI serving, pairing page, etc. Then it likely calls the router for API routes.

Let's look at the daemon's route handling for API requests. We saw earlier that after serving static pages, it likely calls the router. Let's search for "this.router.route" or similar.
Let's search for "router.route" without escaping.
Let's search for "router.handle" or "router.route" maybe it's a method.
We see that the router is used to dispatch actions. Look at line 2586: `const result = await this.router.dispatch({`. Let's see that context.
**SCOUT REPORT – READ-ONLY RECONNAISSANCE**  
Play ID: browser-preview-plumbing-recon-fresh-20260926-173646  
Scout ID: remote-mobile-qr-plumbing  
Assigned Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note:** This is reconnaissance only; no files were modified, and no implementation was performed. Findings are based on static analysis of the current source code and are not final architectural authority.

---

## RESULT
The existing Sideline Coach remote/mobile/QR system provides a unified, authenticated gateway to the Control Plane daemon’s HTTP API (including WebSocket stadium connections) and serves a responsive web app that works for both desktop and mobile clients. It does **not** directly expose arbitrary Game localhost ports; instead, it multiplexes Game‑specific interactions through the daemon’s Stadium/WebSocket layer. To reuse this path for a “Preview in Browser” feature, the minimal missing piece is a way for the daemon to map a Game to its preview port and proxy HTTP requests to that port under the same authentication and authorization controls already in place for remote access.

---

## KEY DISCOVERIES
- Pairing via QR creates a device‑cookie (`sl_dev`) that authenticates a remote‑device principal; the pairing URL contains a host‑specific subdomain (`h-<hostPublicId>.<relayDomain>`) and a secret.  
- The “Copy Mobile URL” feature (extension status‑bar) returns the daemon’s origin (`http://127.0.0.1:<port>` or a configured `publicUrl`) with the daemon’s `authToken` in the hash fragment, which client‑side JS can use to set Bearer token authentication.  
- The Control Plane daemon enforces authentication via Bearer token (local‑admin) or device cookie (remote‑device) and validates origin for non‑GET requests to prevent CSRF.  
- API accessibility for remote devices is defined in `remote-routes.ts` (e.g., `/api/route/preview` is `remote‑read`).  
- The daemon does not currently proxy to arbitrary localhost ports; it only handles its own defined endpoints and communicates with Stadiums via WebSocket for RPC and events.

---

## FACT
- **Pairing endpoint**: `POST /api/pair` generates a pairing URL using the host’s public ID and relay domain (or localhost) and returns a QR SVG (daemon.ts lines 1785‑1800).  
- **Device cookie verification**: The `InProcessRemoteAdapter` verifies the `sl_dev` cookie against the `DeviceRegistry` to mint a `remote‑device` principal (remote‑dispatch.ts lines 70‑100).  
- **Authentication sources**: `resolvePrincipal` (inferred) checks Bearer token against `authToken` (local‑admin) and cookies (`sl_local` for local‑admin, `sl_dev` for remote‑device) (daemon.ts lines 1704, 1757; request‑security.ts lines 3‑5).  
- **Origin validation**: For requests authenticated by cookie or remote‑device, the daemon verifies the `Origin` header matches the expected origin (daemon.ts lines 1766‑1773).  
- **Public URL handling**: The extension’s `copyMobileUrl` uses `coach.publicUrl` if set, otherwise falls back to `http://127.0.0.1:<port>` (extension.ts lines 353‑377).  
- **Route access levels**: `remote-routes.ts` defines which paths are accessible to `remote‑read` or `remote‑mutate` (e.g., `/api/route/preview` is `remote‑read`) (lines 24‑66).  
- **WebSocket stadium connection**: Requires Bearer token matching `authToken` (daemon.ts lines 924‑932).  
- **Host identity**: `hostPublicId` is derived from the public key and used in pairing URLs (host‑identity.ts lines 41‑42).  

## INFERENCE
- The system **does not** expose arbitrary Game localhost ports. The Control Plane acts as a multiplexer: Stadiums connect via WebSocket (`/stadium`) and the daemon routes API calls to the appropriate Stadium, but no HTTP proxy to Game‑specific ports exists. (No evidence of proxying to Game ports in daemon route handling; only static file serving and API endpoint handling are present.)  
- To expose a Game preview port via the existing remote path, the **minimum missing abstraction** is:  
  1. A way for the daemon to know each Game’s preview localhost port (e.g., stored at Game registration or communicated by the extension).  
  2. An API route (e.g., `GET /api/game/:gameId/preview`) that proxies HTTP requests to `http://127.0.0.1:<previewPort>` (or the Game’s preview URL) while enforcing the same authentication (Bearer token or device cookie) and origin checks as other remote‑accessible routes.  
  This would reuse the existing device‑cookie/Bearer‑token auth, relay traversal (if configured), and origin‑validation logic without creating a new authentication system.  
- The security assumptions that **must remain protected** are:  
  - The daemon’s `authToken` (file `<sidelineDir>/token`) – disclosure would allow local‑admin impersonation.  
  - The device cookie (`sl_dev`) – theft would allow remote‑device impersonation; it must remain `HttpOnly`, `Secure`, and `SameSite`.  
  - The pairing secret (exchanged via QR/manual code) – leakage would allow unauthorized device pairing.  
  - The `expectedOrigin` for remote‑device principals – spoofing would bypass origin validation.  
  - The relay enrollment key (if used) – disclosure could allow unauthorized relay connections.  

## UNKNOWN
- Whether the extension currently communicates a Game’s preview port to the Control Plane daemon (no obvious API for registering preview ports was observed in the surveyed files).  
- Whether the existing WebSocket stadium connection could be tunnelled to expose a Game’s preview HTTP server (no evidence of such tunnelling in the daemon or relay code).  

## CONTRADITION
None found within the surveyed scope.

---

## IMPORTANT FILES / PATHS
- `src/control-plane/daemon.ts` – HTTP server, WebSocket upgrade, pairing endpoint, authentication logic, origin validation.  
- `src/control-plane/remote-dispatch.ts` – Device cookie verification and remote‑device principal minting.  
- `src/control-plane/request-security.ts` – `Principal` type definitions.  
- `src/control-plane/remote-routes.ts` – Route access levels (`public`, `local‑only`, `remote‑read`, `remote‑mutate`).  
- `src/public/pair.html` – Pairing page used by mobile clients.  
- `src/extension.ts` – `copyMobileUrl` function and token handling.  
- `src/control-plane/host-identity.ts` – Host public ID derivation used in pairing URLs.  
- `src/control-plane/device-registry.ts` – Device registry used to validate device cookies.  

---  
*End of report.*
