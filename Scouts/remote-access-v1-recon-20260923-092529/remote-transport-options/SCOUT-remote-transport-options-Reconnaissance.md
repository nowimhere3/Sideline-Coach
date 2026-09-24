# Sideline Coach Remote Access v1 Transport Reconnaissance  
**Scout Agent:** remote-transport-options  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note:** This is reconnaissance, not final architectural authority.  

## KEY DISCOVERIES (FACT from repo)  
- The Sideline Coach extension runs a local HTTP server (`src/server.ts`) bound exclusively to `127.0.0.1` (line 108).  
- The server provides:  
  * HTTP API endpoints under `/api/` (e.g., `/api/status`, `/api/reports`, `/api/dispatch`).  
  * Server-Sent Events (SSE) at `/api/events` for real‑time updates (report changes, terminal status, AI health).  
  * Serves the mobile UI (`src/public/index.html`) at root and `/index.html`.  
- Authentication uses a Bearer token (or `?token=` for SSE) obtained via `getAccessToken()` (extension.ts lines 119‑137). The token is stored in the OS secret storage or a file under `$HOME/.sideline/token`.  
- The README (lines 11‑12, 103‑113, 145‑155) states that remote phone access is intended to go through an HTTPS reverse proxy such as **Tailscale Serve** or **Cloudflare Tunnel**, and that the `coach.publicUrl` setting should be set to the proxy’s base URL.  
- The `coach.publicUrl` is treated as sensitive: it is only ever recorded as “set”/“unset” plus scheme (diagnostics logs).  
- The extension already has a dependency on `ws` (WebSocket library) in `package.json` (line 150), indicating WebSocket capability is available.  
- The Control Plane (Stadium) architecture uses a persistent local TCP connection between the extension and a daemon (control‑plane/launcher.ts) for coordination, showing familiarity with outbound/inbound local proxies.  

## CANDIDATE A: Sideline‑owned outbound WebSocket / relay gateway  
*Build a custom relay service that the Sideline host connects to via an outbound WebSocket (or TCP) tunnel; the relay exposes a public HTTP/WebSocket endpoint for phones.*  

| Criterion | Assessment |  
|-----------|------------|  
| **1. Desktop/host changes required** | FACT: Need to add a background client (could be integrated into the extension) that maintains an outbound connection to a relay server. No change to the existing server binding (can stay `127.0.0.1:49152`). The client would receive relay‑initiated requests (e.g., over the WebSocket) and forward them to the local Coach server via `localhost:49152`, then return responses over the same outbound channel. |  
| **2. Hosted infrastructure required** | FACT: A publicly accessible relay server (WebSocket or TCP) that accepts connections from clients and forwards traffic. Must support sticky connections per client to enable isolation. Could be a simple Node.js/Go server. |  
| **3. Phone/browser connection model** | FACT: Phone connects to the relay’s public URL (e.g., `https://relay.example.com/<client-id>`). The relay uses the outbound channel to reach the specific Sideline host. The phone sees a standard HTTP/SSE endpoint (the relay can terminate TLS and forward clear‑text HTTP to the client, or tunnel raw TCP). |  
| **4. HTTP + live‑stream compatibility** | FACT: If the relay transports raw TCP (like a tunneled port), HTTP and SSE work transparently. If using WebSocket message‑based proxying, the relay must explicitly translate HTTP requests/responses and SSE events into WebSocket frames and back (doable but adds complexity). |  
| **5. Reconnect behavior** | FACT: The outbound client must implement exponential backoff reconnection on failure (standard for WebSocket/TCP clients). The relay should buffer or drop inbound requests while disconnected; phone will see connection failures and can retry (the UI already shows reconnection UI for SSE). |  
| **6. Latency implications** | INFERENCE: Adds one extra hop (phone → relay → Sideline host). If the relay is geographically close to the user, latency added is modest (tens of milliseconds). WebSocket‑based proxying may add slight framing overhead vs raw TCP tunneling. |  
| **7. Authentication integration** | FACT: The existing Bearer token mechanism works unchanged because the relay forwards the `Authorization` header (or token query param) transparently. No need to modify auth logic. End‑to‑end confidentiality depends on trusting the relay (if it terminates TLS) or using end‑to‑end encryption (not currently in place). |  
| **8. Multi‑user / multi‑host isolation** | FACT: Each Sideline host runs its own outbound client with a unique identifier (e.g., a random ID or token). The relay routes incoming requests to the correct client based on that ID (e.g., via subdomain, path, or WebSocket multiplexing). Isolation is straightforward if the relay enforces per‑client channels. |  
| **9. Operational complexity** | INFERENCE: Moderate. Requires operating a relay server (monitoring, updates, scaling). However, the relay is stateless aside from connection tracking and can be run as a simple service. Using a managed platform (e.g., Fly.io, Railway) reduces ops burden. |  
| **10. Approximate production cost shape** | INFERENCE: Low to moderate. A small VM (e.g., $5‑10/month) can handle many concurrent clients if using efficient WebSocket multiplexing. Bandwidth cost depends on usage (reports are small; dispatch prompts are small; SSE is intermittent). |  
| **11. Vendor lock‑in** | FACT: Low if self‑hosted; you can move the relay to any provider. If using a PaaS, lock‑in is to that platform but still portable. |  
| **12. Major security concerns** | FACT: The relay sees all traffic in clear text if it terminates TLS (to then forward HTTP to the client). Must ensure the relay is trustworthy and hardened. The existing token protects against unauthorized use of the Coach API, but token leakage via the relay is a risk if the relay is compromised. Mitigation: run the relay in a trusted environment, enforce mutual TLS between client and relay (then the relay cannot see inner HTTP), or use end‑to‑end encryption (beyond scope). |  
| **13. Works without users understanding networking?** | FACT: Yes. The extension could provide a button “Enable Remote Access” that starts the outbound client, displays a generated URL (e.g., `https://relay.example.com/<token>`), and copies it to clipboard. No user‑side networking knowledge needed. |  

## CANDIDATE B: Managed tunnel / relay products (e.g., Cloudflare Tunnel, localhost.run, etc.)  
*Use a third‑party service that provides an outbound tunnel client (e.g., `cloudflared`) which the user runs locally; the service exposes a public URL that forwards to the local Coach server.*  

| Criterion | Assessment |  
|-----------|------------|  
| **1. Desktop/host changes required** | FACT: None to the Coach server itself (can stay bound to `127.0.0.1`). The user must run the tunnel client (e.g., `cloudflared tunnel --url http://localhost:49152`) or have it started automatically by the extension (would require bundling or downloading the client binary). No changes to server code. |  
| **2. Hosted infrastructure required** | FACT: The managed service provides the public edge nodes and relay infrastructure (no user‑hosted servers needed). |  
| **3. Phone/browser connection model** | FACT: Phone connects to the service‑provided HTTPS URL (e.g., `https://abcd1234.trycloudflare.com` for Cloudflare Quick Tunnel, or a permanent CNAME if using a trusted tunnel). The service forwards traffic via the outbound tunnel to `localhost:49152`. |  
| **4. HTTP + live‑stream compatibility** | FACT: These tools tunnel raw TCP (or HTTP) transparently, so HTTP and SSE work without modification. Cloudflare Tunnel also supports HTTP‑specific features (like request/response buffering) but operates at the TCP level for simplicity. |  
| **5. Reconnect behavior** | FACT: The tunnel client automatically reconnects on network loss (standard for `cloudflared`, `localhost.run`, etc.). The phone sees temporary downtime and can retry (the Coach UI already handles SSE reconnection). |  
| **6. Latency implications** | INFERENCE: Adds one hop (phone → service edge → tunnel client → localhost). If the service has points of presence near the user, latency added is low. Cloudflare’s global network typically adds <50ms edge‑to‑origin. |  
| **7. Authentication integration** | FACT: Unchanged. The tunnel forwards the `Authorization` header (or token query param) transparently. The service does not need to know the token. |  
| **8. Multi‑user / multi‑host isolation** | FACT: Each tunnel client is bound to a specific local port and thus a specific Sideline instance. The service assigns a unique URL (or subdomain) per tunnel, ensuring isolation. For services like Cloudflare Tunnel, you can authenticate the tunnel with a token tied to your account, preventing others from hijacking your URL. |  
| **9. Operational complexity** | FACT: Low for the user if they manually run the tunnel client; zero server‑side ops. If the extension were to automate tunnel client startup/download, it would add some complexity (binary distribution, updates, platform‑specific builds). |  
| **10. Approximate production cost shape** | FACT: Free tiers exist (Cloudflare Tunnel free for basic usage, `localhost.run` free but with rate limits). For production‑grade SLAs or custom domains, may incur cost (e.g., Cloudflare Load Balancing or Argo Tunnel paid tiers). However, the basic tunnel suffices for many users. |  
| **11. Vendor lock‑in** | FACT: Moderate. If you choose Cloudflare Tunnel, you are dependent on Cloudflare’s infrastructure. Switching to another provider would require changing the tunnel client and possibly the public URL format. The Coach extension would need to be updated to support a different client if automation is added. |  
| **12. Major security concerns** | FACT: The tunnel client creates a publicly reachable endpoint that forwards to `localhost:49152`. If the Coach server had any vulnerabilities, they’d be exposed. The existing token protects the API, but the mobile UI itself (served at root) is also exposed—though it does not contain sensitive data by itself (it only shows reports after token auth). The tunnel service sees the clear‑text traffic (if not using end‑to‑end encryption). Quick Tunnel services (like Cloudflare’s `trycloudflare.com`) are intentionally temporary and public; for production, you’d want a trusted tunnel with authentication (e.g., Cloudflare Tunnel with Access policies). |  
| **13. Works without users understanding networking?** | FACT: Partially. The user must obtain and run the tunnel client (e.g., download `cloudflared` and execute a command). If the extension bundles or automatically downloads/installs the client (with user consent), then the user only needs to click a button to enable remote access. Without automation, the user needs basic CLI knowledge. |  

## CANDIDATE C: Other credible outbound reverse‑connection architectures (e.g., ngrok, PageKite, SSH reverse tunnel)  
*Similar to Managed Tunnels but with different trade‑offs.*  

| Criterion | Assessment |  
|-----------|------------|  
| **1. Desktop/host changes required** | FACT: Same as B—no changes to Coach server; requires running a client binary (ngrok, PageKite, or `ssh -R`). |  
| **2. Hosted infrastructure required** | FACT: For ngrok/PageKite, you rely on their servers; for SSH reverse tunnel, you need an SSH server you control (could be a cheap VPS). |  
| **3. Phone/browser connection model** | FACT: Phone connects to the public URL provided by the client (e.g., `https://abcd1234.ngrok.io` or your SSH server’s port). |  
| **4. HTTP + live‑stream compatibility** | FACT: These tools tunnel raw TCP, so HTTP and SSE work transparently. |  
| **5. Reconnect behavior** | FACT: Clients like ngrok and PageKite auto‑reconnect; SSH tunnels can be made persistent with autossh or similar. |  
| **6. Latency implications** | INFERENCE: Depends on the provider’s edge locations. Self‑hosted SSH reverse tunnel latency depends on your VPS location relative to the user. |  
| **7. Authentication integration** | FACT: Unchanged; token forwarded transparently. |  
| **8. Multi‑user / multi‑host isolation** | FACT: Each client instance gets its own URL/tunnel, preventing cross‑talk. For SSH, you’d forward different local ports to different remote ports or use separate SSH connections. |  
| **9. Operational complexity** | FACT: Low for ngrok/PageKite (just run the binary); moderate for self‑hosted SSH tunnel (need to manage the SSH server). |  
| **10. Approximate production cost shape** | FACT: ngrok has a free tier with limitations; PageKite offers free tier; self‑hosted SSH tunnel costs are the VPS price (e.g., $5/month). |  
| **11. Vendor lock‑in** | FACT: High for ngrok/PageKite if you rely on their branded URLs and infrastructure; low for self‑hosted SSH (you control both ends). |  
| **12. Major security concerns** | FACT: Same as B—public endpoint exposes local port. SSH reverse tunnel adds encryption of the tunnel itself (SSH encrypts traffic between client and your SSH server), so the relay (your SSH server) sees clear text only after decryption on your server. If you do not trust your own SSH server, this is moot. Ngrok/PageKite TLS terminate at their edge, so they see clear text. |  
| **13. Works without users understanding networking?** | FACT: Same as B—requires user to run a client unless automated. |  

## COMPARISON & RECOMMENDATION  

| Aspect | A (Self‑hosted WebSocket Relay) | B (Managed Tunnel, e.g., Cloudflare) | C (Other Tunnels: ngrok/PageKite/SSH) |  
|--------|----------------------------------|--------------------------------------|----------------------------------------|  
| **Desktop changes** | Moderate (add outbound client) | None (if user runs client) / Low (if auto‑download) | None / Low |  
| **Hosted infra** | You operate relay | None (service‑provided) | None / You operate SSH server |  
| **Isolation** | Built‑in via client ID | Natural per‑tunnel URL | Natural per‑tunnel/port |  
| **Latency** | Low‑moderate (depends on relay location) | Low (global edge) | Variable |  
| **Ops complexity** | Moderate (run relay) | Low (service) | Low‑moderate |  
| **Cost** | Low‑moderate (VM) | Free tier available | Free‑tier + possible VPS |  
| **Vendor lock‑in** | Low | Medium (to tunnel provider) | High (ngrok/PageKite) / Low (self‑SSH) |  
| **Security** | Must trust relay or add mTLS | Must trust tunnel provider; see clear text | Must trust tunnel provider or SSH server |  
| **User‑friendliness** | High (one‑click enable in extension) | Medium (requires client install unless automated) | Medium (same as B) |  

**RECOMMENDED TRANSPORT FOR REMOTE ACCESS v1:**  
**Candidate B (Managed Tunnel) using Cloudflare Tunnel (or similar) with automation** is the best balance for a production‑friendly v1. It requires zero changes to the Coach server, leverages a globally distributed, low‑latency edge, offers free tier, and provides secure tunneling (TCP‑level) with optional authentication via Cloudflare Access. The extension can automate the tunnel client download/start (similar to how it already launches the Control Plane daemon) and generate a stable URL for the user.  

If the project prefers zero third‑party dependency and full control, **Candidate A (self‑hosted WebSocket relay)** is a strong alternative, though it adds operational overhead.  

## SMALLEST PROOF‑OF‑CONCEPT  
1. **Modify `extension.ts`** to optionally start a tunnel client (e.g., `cloudflared`) when a new setting `coach.remoteAccessEnabled` is true.  
2. Bundle or download the `cloudflared` binary for the host platform at first run (or rely on user‑installed `cloudflared`).  
3. After the tunnel is ready, retrieve the public URL (from `cloudflared`’s stdout or via its API) and store it in `coach.publicUrl` (or a temporary setting) so that the existing `Coach: Copy Mobile URL` command works.  
4. No changes to `server.ts` or the UI are needed—they already use `coach.publicUrl` and the token‑based auth.  
**Files touched:** `src/extension.ts` (add tunnel logic, new setting), possibly `src/server.ts` (if we want to log tunnel status), and `package.json` (add any needed dependencies for downloading binaries).  

## EXACT SIDELINE CODE SEAMS LIKELY TOUCHED  
- **`src/extension.ts`**:  
  * Add a new configuration property `coach.remoteAccessEnabled` (boolean).  
  * In `activate()`, if enabled, launch/download the tunnel client (similar to `ensureControlPlaneRunning`).  
  * Obtain the public URL from the client (e.g., parse stdout or query its local API) and update `coach.publicUrl` via `vscode.workspace.getConfiguration().update()`.  
  * Provide a command `coach.toggleRemoteAccess` to start/stop the tunnel and show the URL.  
- **`src/server.ts`**: No changes required (continues to listen on `127.0.0.1`).  
- **`src/public/index.html`**: No changes required (uses `coach.publicUrl` from extension).  

## OPEN QUESTIONS REQUIRING ARCHITECT JUDGMENT  
1. **Should the tunnel client be bundled or downloaded at runtime?** Bundling increases extension size; downloading ensures up‑to‑date binaries but adds first‑run complexity.  
2. **How to handle tunnel client updates and platform‑specific binaries (Windows, macOS, Linux)?**  
3. **What level of authentication should be applied to the tunnel itself?** For Cloudflare Tunnel, one can use a token tied to a Cloudflare Account Team, restricting tunnel creation to authorized users. For a self‑hosted relay, mutual TLS between client and relay could be considered.  
4. **Should the extension attempt to fallback to Tailscale if installed, or make the managed tunnel the primary recommended method?** The README currently promotes Tailscale; a v1 might shift to a zero‑install‑required tunnel (like Cloudflare) as the default.  
5. **How to expose tunnel status/errors in the UI?** Could reuse existing status bar or add a new indicator.  
6. **What are the rate limits and abuse considerations of the public tunnel service?** Must ensure the Coach server does not inadvertently become an open proxy (the token protects the API, but the UI is publicly reachable without token—though it only shows UI, not data).  

---  
**Report produced by Scout Agent: remote-transport-options using model openrouter/nvidia/nemotron-3-super-120b-a12b:free.**  
**End of reconnaissance.**  
**No files were modified.**
