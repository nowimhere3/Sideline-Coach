# Remote Access architecture — durable breadcrumb

Decision record: `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` (ADR, 2026-09-23).

## WHAT WAS

- **Mobile access was a dev bridge.** `ControlPlaneDaemon` on `127.0.0.1:3100` was exposed to the phone through a developer bridge (Tailscale serve, or Cloudflare tunnel).
- **One global admin token.** It travelled in URLs: `?token=` was moved into `sessionStorage`, then put back into the SSE URL (`/api/events?token=`). It was compared non-timing-safe, with CORS `*`.
- **No remote/local distinction.** Anyone holding the token had full admin, including daemon shutdown.

## WHAT IS

- **Stage 1 is implemented locally.** Browser admin-token bootstrap is `#token` → `POST /api/session` → httpOnly cookie; the fragment is cleared immediately. Browser requests and `EventSource('/api/events')` contain no credential. Trusted extension/CLI traffic retains Bearer-header auth.
- **Principal-aware, default-deny host router.** Requests resolve to `local-admin` or an in-process-only `remote-device` principal. Every daemon route is classified `local-only`, `remote-read`, or `remote-mutate`; unclassified routes are unreachable. Lifecycle, credentials, protected file controls, Player/Scout administration, `/stadium`, and preference writes stay local-only.
- **Cookie mutation security.** Cookie-authenticated non-GET requests require `X-Sideline-Action: 1` and a matching Origin. Wildcard CORS is gone.
- **Streaming and output boundary.** SSE has a 15-second heartbeat, `no-transform`, and `X-Accel-Buffering: no`. Shared secret redaction applies at the remote report/file/terminal boundary while local trusted output retains its existing behavior.
- **Remote terminal policy.** Paired-device terminal/activity output is redacted by default. A Dev-only, default-off preference may remove only the extra remote terminal-detail mask. Shared hard-secret redaction still runs. The override never weakens blocked paths/files, credential stores, provider/API secrets, SSH/Git material, admin routes, or other hard boundaries.

The later relay/pairing architecture remains decided but is not implemented in Stage 1:

- **Relay:** production Remote Access uses a **Sideline-owned outbound relay**.
  - The daemon (not the Extension Host) owns one outbound WSS tunnel (`tunnel/v1`: JSON frames; SSE is an unfinished response).
  - The daemon stays loopback-only. `/stadium` stays local-only.
- **Identity:** v1 is **accountless**. A phone pairs with one desktop via a desktop-initiated QR or code (single-use, 5-minute secret in the URL fragment). The **host** issues and validates an httpOnly device cookie.
  - The relay routes only, by an Ed25519-verified `hostPublicId`. One origin per host.
- **Requests:** remote requests will enter the router **in-process** as a `remote-device` principal.
  - A default-deny route table applies.
  - Remote-only report redaction applies.
  - Cookie mutations need an `X-Sideline-Action` header plus a matching Origin.
- **GitHub:**
  - human identity **deferred**;
  - Coach Source **optional** (a locator; private repos via the host proxy);
  - local Git **default** (desktop `git` CLI plus existing credentials; nothing crosses the relay);
  - GitHub API **deferred**.
- **Coach Source** = `localRoot` + optional `remote {provider, locator, ref}` + the existing routine `sources[]` as the designated files + optional freshness. Provider-extensible.

## WHAT WILL BE (staged)

1. **Complete:** local security foundation.
2. Pairing, device registry and in-process remote dispatch.
3. RelayClient and reference relay (localhost end-to-end).
4. Production relay (TLS wildcard, metadata-only logs).
5. Pairing UX and the Dad cellular field test: likely a main-page Dad-facing action such as **Use on Phone**, plus a full **Remote Access** Settings card for pairing, devices and revocation. Those surfaces do not belong to Stage 1.
6. Later, each by ADR delta: Coach Source host proxy, remote local-Git controls, Sideline accounts with GitHub as the default linked identity, GitHub App, E2EE.

**Invariants:**
- `SidelineUser ≠ GitHubUser`.
- Provider email is not marketing consent.
- Git credentials and SSH keys never traverse the relay.
- The relay can never mint access.
