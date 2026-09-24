# ADR — Remote Access v1 Architecture Decision

**Player:** Claude Code (Opus 5.5, medium) · **Role:** Architect / Adjudicator · **Date:** 2026-09-23 · **Status:** ACCEPTED (for implementation) · **No runtime source modified.**

**Inputs:**
- `REPORTS/AntiGravity/SCOUT-remote-access-v1-identity-github-coach-source.md`
- `REPORTS/AntiGravity/SCOUT-remote-access-v1-follow-up.md`
- Spot-verification of the seams listed in §0.

**Scope:** make the decisions, then give the staged plan. Stage 1 must be executable without rediscovering architecture.

---

## 0. Verified seams (the facts the decisions rest on)

| Seam | Fact | Where |
|---|---|---|
| Daemon binding | Binds `127.0.0.1` only. | `daemon.ts:678` |
| Auth | One global admin token, compared with plain `===` (not timing-safe). Accepted from `?token=` **or** `Authorization: Bearer`. | `daemon.ts:3755-3758`, `:544` |
| Browser token | `?token=` is moved into `sessionStorage`; SSE then puts it back into a URL (`/api/events?token=…`), because `EventSource` can't set headers. | `index.html:2031-2037`, `:5826` |
| CORS | `Access-Control-Allow-Origin: *` on the API and on SSE. | `daemon.ts:3196`, `:3784` |
| Shutdown | `POST /api/control-plane/shutdown` is guarded by the same global token. | `daemon.ts:1077` |
| Browser transport | HTTP + SSE only. No browser WebSocket. `/stadium` WS is internal JSON-RPC. | Scout, repo fact |
| Host identity | Durable `stadiumId` at `~/.sideline/stadium-id`. | `game-identity.ts` |
| Coach Source pieces | `Game.repositoryUrl` (Settings-editable, https-validated); `RoutineLocator { repoUri, branch, rootFsPath }`; routine `sources[]` (Game-relative, traversal-guarded). | `coach-routines.ts:84-142, 202-205, 413-422` |

---

## 1. Architecture

```
  PHONE BROWSER (normal HTTPS + SSE, no app install)
        │  https://h-<hostPublicId>.<relay-domain>/        ← one ORIGIN per host
        │  cookie: sl_dev=<device token>  (httpOnly, Secure, SameSite=Lax, host-only)
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SIDELINE RELAY  (stateless; no user DB in v1; TLS terminates here)     │
│  • routes by subdomain → hostPublicId → live host socket              │
│  • never validates or mints browser sessions (the HOST does)          │
│  • forwards requests as frames; flushes response chunks immediately   │
│  • host offline → static "Desktop offline" page / 503 JSON            │
│  • logs metadata only (no bodies, no cookies, no auth headers)        │
└──────────────────────────────▲───────────────────────────────────────┘
                               │ outbound WSS  /tunnel/v1   (host-initiated, :443)
                               │ host proves identity: Ed25519 challenge-response
┌──────────────────────────────┴───────────────────────────────────────┐
│ DESKTOP — ControlPlaneDaemon  (still 127.0.0.1-only; no inbound port)  │
│  ┌──────────────────────┐   in-process    ┌─────────────────────────┐ │
│  │ RelayClient (ws)      │ ──────────────► │ HTTP router (existing)   │ │
│  │ frames ⇄ req/res      │  principal =    │ + Principal-aware auth   │ │
│  │ backoff/heartbeat     │  remote-device  │ + remote route allowlist │ │
│  └──────────────────────┘                  │ + remote redaction       │ │
│  DeviceRegistry (~/.sideline/remote/)      │ + CSRF on cookie mutations│ │
│   host key · hashed device tokens · pairing│ SSE /api/events           │ │
│                                            └─────────────────────────┘ │
│  /stadium WS — local only (never reachable through the relay)          │
│  VS Code extension = local UI/commands (enable, QR, devices, revoke)   │
│  local git CLI + existing credentials = Git execution (later stage)    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Final decisions

### D1. Remote identity: accountless host pairing in v1; accounts later, additive

- **v1 has no Sideline or GitHub account.** A phone gains access by pairing with a specific desktop.
  - Pairing uses a **QR code**, or a typed code as the fallback.
  - It can only be started from the desktop, locally. That requires physical or logged-in control of the machine, which is stronger proof than an OAuth login.
- **Why this is the least machinery:**
  - The relay needs **no user database, OAuth app, account linking, email handling or consent storage**. Its only persistent concept is "which socket serves hostPublicId X", and even that lives in memory.
- **No painful migration:**
  - The access principal is `(hostPublicId, deviceId)`. It never references a user or a GitHub ID.
  - When accounts arrive, a `sidelineUserId` **claims** hosts through an extra ownership record. That adds "sign in to see all my desktops"; it does not replace pairing.
  - Existing device tokens keep working.
  - `SidelineUser ≠ GitHubUser` is honoured: GitHub later becomes one `LinkedIdentity`.
- **Rejected:** requiring GitHub or a Sideline account for v1.
  - It adds an OAuth app, a user table, a relay-side session authority, and email and consent obligations.
  - It proves nothing extra about *which desktop* the phone may control. Host pairing is still needed.
- **Rejected:** host-scoped sessions validated by the relay. See D4: validation belongs on the host.

### D2. Relay client ownership: `ControlPlaneDaemon`, with the extension as local UI only

- **The daemon owns the tunnel.**
  - It is the single per-machine process that already owns HTTP, SSE, auth and preferences.
  - It survives VS Code window reloads.
  - It avoids one tunnel per VS Code window.
- **v1 needs nothing from `vscode.authentication` or SecretStorage** (D1 is accountless). The daemon keeps its own host key in `~/.sideline/remote/`, created with owner-only file permissions, like the existing token.
- **The extension** provides commands and UI that talk to the daemon over loopback:
  - "Enable/Disable Remote Access";
  - "Pair a phone" (QR);
  - the device list and revoke.
  - The same controls also appear on a Settings card, **usable only by a local principal**.
- **Dispatch is in-process, not a loopback HTTP re-request.** The RelayClient hands each request to the existing router with an explicit `Principal { kind: 'remote-device', deviceId }`. That principal is set by code, never by a header, so a remote caller can never be mistaken for the local admin.
- **Rejected:** the Extension Host as tunnel owner. The tunnel would die on reload, there would be N windows and N tunnels, and it would need a second route into the daemon anyway.

### D3. Relay protocol: JSON text frames over one WSS; SSE is just an unfinished response

This is `tunnel/v1`. Frames are UTF-8 JSON. Bodies are UTF-8 strings, with `…B64` variants only for binary.

```ts
// relay → host
{ t: 'challenge', nonce }                                     // on connect
{ t: 'req', id, method, path, headers, body?, bodyB64? }      // path incl. query; body ≤ 1 MiB (413 above)
{ t: 'cancel', id }                                           // browser went away
{ t: 'ping', ts } | { t: 'goaway', reason }
// host → relay
{ t: 'hello', v: 1, hostPublicId, publicKey, sig, client }    // sig = Ed25519(nonce)
{ t: 'head', id, status, headers }
{ t: 'data', id, chunk } | { t: 'data', id, chunkB64 }        // any number; SSE = never-ending data
{ t: 'end', id } | { t: 'error', id, code }
{ t: 'pong', ts }
```

- **Request IDs only.** There are no separate stream IDs or stream types. Streaming is a `head` followed by any number of `data` frames. The relay writes each chunk immediately and doesn't compress `text/event-stream`.
- **Heartbeat:** `ping` every 20 s. Two missed `pong`s close the socket. Separately, the host's SSE adds a `: hb` comment every 15 s, plus `Cache-Control: no-transform` and `X-Accel-Buffering: no`.
- **Reconnect:** the host uses backoff 1 / 2 / 5 / 10 / 30 s with ±20% jitter. On disconnect every in-flight `id` is dead: the relay closes browser responses, and `EventSource` reconnects on its own. The existing `hello` → `synchronizeAfterHello()` resync covers state.
- **Cancellation:** browser disconnect → `cancel` → the host aborts the handler or closes the SSE subscription.
- **Backpressure (minimal):** the relay caps each response's queue at 1 MiB and ends that response when it overflows; the browser retries. The host pauses writes while `ws.bufferedAmount` is above 4 MiB.
- **Forwarded headers are an allowlist:** `accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent`.
  - The relay strips `authorization`.
  - The host **ignores `?token=` and `Authorization` from remote principals**, so a leaked admin token is useless remotely.
- **Rejected:** MessagePack or binary framing (premature), separate stream-open/stream-chunk types (redundant), and browser WebSockets (not needed; SSE works).

### D4. Session and pairing security

- **Host identity:**
  - The daemon generates an Ed25519 keypair once, at `~/.sideline/remote/host-key.json` with owner-only permissions.
  - `hostPublicId = base32(sha256(publicKey))[0..20]`.
  - The relay binds `hostPublicId → socket` only after the challenge signature verifies, so an id can't be squatted.
  - `stadiumId` stays a local concept and is not sent.
- **Pairing secret (bootstrap only):**
  - Created on the desktop by a **local principal only**: 128-bit random, single use, **5-minute TTL**, stored hashed.
  - The QR code encodes `https://h-<id>.<relay>/pair#<secret>`. The **fragment is never sent to servers or logs**.
  - The page POSTs the secret in the request body, then calls `history.replaceState` to clear the fragment.
  - Fallback: an 8-character code (typed), 5 attempts per pairing, then burned.
  - This is the *only* URL-borne secret. It is one-time and short-lived, and it is not a session credential.
- **Browser session:**
  - On successful pairing the host creates a device: `deviceId` plus a 256-bit `deviceToken`. The host stores **only** the SHA-256 hash, with a label (UA-derived, renameable), `createdAt` and `lastSeenAt`.
  - Response: `Set-Cookie: sl_dev=<token>; HttpOnly; Secure; SameSite=Lax; Path=/`, host-only on that host's subdomain.
  - Idle expiry is 30 days (sliding on use). After that the phone is re-paired.
- **Validation happens on the host, not the relay.** A compromised relay can still observe traffic in transit (E2EE is deferred), but **cannot mint access**.
- **Revocation:**

  | Situation | Action |
  |---|---|
  | One device | Delete it from the device list (desktop). Its next request gets 401. |
  | Lost phone | Revoke that device. Tokens are opaque, so nothing else changes. |
  | Everything | "Revoke all devices", then "Disable Remote Access", which drops the tunnel so the relay severs every browser at once. |
  | Host offline | The relay serves a static offline page (HTML) or `503 {code:'host_offline'}` (API). No data is cached at the relay. |

- **No public-URL credentials:** the `?token=` path is removed for browsers (Stage 1). The local admin token remains a header-only credential for the extension, `StadiumClient` and CLI.

### D5. GitHub role

| Capability | v1 classification | Notes |
|---|---|---|
| Human identity | **DEFERRED** | v1 is accountless. When accounts arrive, GitHub is the **DEFAULT** sign-in, but never REQUIRED and never the primary key. |
| Connect GitHub | **DEFERRED** | Add it only when a feature needs GitHub cloud. |
| Coach Source | **OPTIONAL** | GitHub is one provider of a locator (D6). Public repos need no auth. Private repos are served by the **host proxy**, with no GitHub App. |
| Local Git | **DEFAULT** (when Git controls ship) | The browser is the control surface, the desktop runs `git`, and existing credentials authenticate. No PAT, OAuth or token plumbing. Credentials and SSH keys never cross the relay. |
| GitHub API (PRs, Issues, Actions, private-source cloud access) | **DEFERRED** | A GitHub App scoped per repository, added only for genuinely cloud features. Device Flow plus Octokit remains a candidate, not a decision. |

Provider email is never marketing consent. Consent becomes relevant only when accounts exist, and is deferred with them.

### D6. Coach Source: a minimal, provider-extensible model

This reuses the existing fields: no new storage concepts, just a named shape.

```ts
interface CoachSource {
  /** Authoritative on the desktop. = RoutineLocator.rootFsPath (never sent to the relay). */
  localRoot: string;
  /** Optional remote coordinate. provider is an open string key ('git' today; 'gdrive' etc. later). */
  remote?: {
    provider: 'git' | string;
    locator: string;            // canonical URL = Game.repositoryUrl (e.g. https://github.com/o/r)
    ref?: string;               // = RoutineLocator.branch; absent = remote default branch
    hostHint?: 'github' | 'gitlab' | 'other'; // derived from locator, only to build web/raw links
  };
  /** Designated Coach Refresh files: the EXISTING routine sources[] (Game-relative, traversal-guarded). */
  designated: Array<{ path: string; kind: 'file' | 'folder' }>;
  /** Optional, local-git-derived; never required. */
  freshness?: { localHeadSha?: string; remoteHeadSha?: string; dirty?: boolean; checkedAt?: number };
}
```

**Resolution order** when an Assistant Coach needs sources remotely:
1. The host is online through the relay → the host serves **only the designated paths**, through the existing game-files blocklist plus remote redaction.
2. Otherwise, if `remote.locator` is publicly reachable → give the AI the locator + ref + paths.
3. Otherwise → a truthful "desktop offline, no reachable remote source" message.

### D7. Remote security gates

| Gate | Resolution | Stage |
|---|---|---|
| Query-token removal | The browser stops putting credentials in URLs. The local bootstrap uses a **fragment** (`#token=`), exchanged once for an httpOnly cookie (`POST /api/session`). SSE authenticates by cookie. The daemon ignores `?token=` for cookie- or remote-origin requests. | 1 |
| Timing-safe compare | `crypto.timingSafeEqual` for the admin token and hashed device and pairing checks. | 1 |
| Principal model | Every request resolves to `local-admin` (loopback + admin token or local cookie) or `remote-device` (in-process from the RelayClient only). | 1 (model), 2 (remote) |
| Route allowlist | A single **default-deny** table classifies every daemon route as `local-only` / `remote-read` / `remote-mutate`. A test asserts **every** route is classified. Always local-only: `/api/control-plane/*`, `/stadium`, pairing and device management, credential writes, preferences that toggle remote access. | 1 |
| Report redaction | For `remote-device`, report bodies and any file-content responses pass through the **existing** player-activity secret-redaction patterns (shared helper). Local stays verbatim. | 1 (helper + wiring), 2 (enforced remotely) |
| CSRF on mutations | Any cookie-authenticated non-GET needs `X-Sideline-Action: 1` **and** an `Origin` equal to the serving origin. All mutating routes are POST (verify none mutate on GET). | 1 |
| CORS | Remove `Access-Control-Allow-Origin: *`. Same-origin only. | 1 |
| Tenant isolation | One origin per host (subdomain), so cookies, storage and IndexedDB are isolated per host. The relay routes strictly by the verified `hostPublicId`, and the host validates the device token itself. | 3–4 |
| Relay logging | Metadata only: ts, hostPublicId, method, route *template*, status, bytes, duration. Never bodies, cookies, auth headers, query strings or fragments. 7-day retention. | 4 |
| SSE robustness | 15 s comment heartbeat, `no-transform`, `X-Accel-Buffering: no`, immediate relay flush, no compression, `hello` resync. | 1 (host), 4 (relay) |
| Secret handling | Host key and device hashes live in `~/.sideline/remote/` (owner-only). Nothing secret is sent to the relay except the device cookie in transit. OpenRouter key, provider creds, `.env*` and SSH/Git creds never leave the host (existing blocklists). | 2 |
| Revocation | D4 table; the device list is local-principal-only. | 2 / 5 |

---

## 3. Rejected alternatives

- **Cloudflare / Tailscale as the product.** They are a vendor account and binary for Dad, Quick Tunnels break SSE, and they bring external policy coupling. They stay **dev bridges only**.
- **Account-required v1 (GitHub OAuth at the relay).** It adds machinery with no extra proof of host control; see D1.
- **Relay-validated sessions / relay as auth authority.** A compromised relay could mint access. The host stays the authority.
- **Path-prefixed multi-host (`/h/<id>/`).** It shares one origin, so storage, IndexedDB and cookies would leak across hosts. Rejected for subdomains.
- **Loopback re-request with a "remote" header.** The remote bit would become a forgeable header. Rejected for in-process principal dispatch.
- **GitHub API for status / branch / commit / push.** Needs broad scopes, can't see the local dirty tree, and puts tokens at the relay. Rejected for local `git` CLI.
- **GitHub App for private Coach Sources in v1.** The host proxy already serves the designated files. Deferred.
- **E2EE in v1.** Worthwhile later; the relay is designed so it can't mint access in the meantime.

---

## 4. Trust boundaries

| Zone | Trusted with | Never trusted with |
|---|---|---|
| Desktop daemon | All local state, admin token, host private key, device hashes, git credentials | — |
| Relay | Routing by verified `hostPublicId`; TLS; transient bytes in flight | Minting or validating sessions, storing bodies or cookies, host private key, any credential at rest |
| Phone browser | Its own httpOnly device cookie for **one** host origin | The admin token, other hosts' cookies, local-only routes |
| Local browser / extension | Admin token (header) or local cookie | — |

---

## 5. Staged implementation plan

Each stage is independently shippable and testable. Stages 1–3 need **no deployed relay**.

### Stage 1 — Local security foundation (daemon + `index.html`; no relay)

**Scope:**
- **Principal and token handling:**
  - `Principal` type and `resolvePrincipal(req)`.
  - `timingSafeEqual`.
  - `POST /api/session`: exchanges an admin token (Bearer) for an httpOnly cookie on loopback.
  - The browser bootstrap reads `#token=` (not `?token=`), exchanges it, then clears the fragment. SSE uses the cookie.
  - `copyMobileUrl` and the extension "open" produce `#token=`.
  - The daemon rejects `?token=` for browser/cookie flows. The Bearer header stays for extension/CLI.
- **Route classification:** `src/control-plane/remote-routes.ts`, a default-deny table plus a test that enumerates daemon routes and fails on any unclassified one.
- **Mutations and CORS:** CSRF guard for cookie-authenticated mutations (`X-Sideline-Action` + Origin). Remove CORS `*`.
- **SSE:** heartbeat and headers.
- **Redaction:** a shared redaction helper, extracted from `player-activity.ts` patterns, with a `redactForPrincipal` hook on reports and file-content routes. It is a no-op for local.

**Player:** Claude Opus-class (or Codex GPT-5-class, high effort), security-careful implementer. Opus review before merge.

**Acceptance gate:**
- **No credentials in URLs:**
  - no browser code path puts a credential in a URL;
  - `EventSource` URL has no `token`;
  - `?token=` bootstrap is rejected.
- **Local UX unchanged:** open from VS Code works; Tailscale dev-bridge still works with the fragment flow.
- **Route and CSRF guards:**
  - every daemon route is classified (test enumerates them);
  - a cookie POST without `X-Sideline-Action` or with a foreign Origin gets 403;
  - CORS header absent.
- **Correctness:**
  - SSE heartbeat is observed within 20 s;
  - timing-safe compare is in place;
  - existing test suites are green;
  - compile is clean.

### Stage 2 — Remote principal, pairing and device registry (daemon; in-process transport)

**Scope:**
- **Host key and IDs:** `~/.sideline/remote/`: host keypair, `hostPublicId`.
- **Pairing:** create (local only), exchange (POST with fragment secret → device cookie).
- **Devices:** DeviceRegistry with hashed tokens and list / rename / revoke / revoke-all (local only). 30-day sliding expiry.
- **Remote dispatch:** `dispatchRemote(frameReq) → frames` adapter (in-process `IncomingMessage`/`ServerResponse` shims) that runs the router as `remote-device`.
- **Enforcement:** the allowlist and remote redaction are enforced, driven by a **fake frame transport in tests**.

**Player:** Codex (high) or Claude Opus-class.

**Acceptance gate:**
- **Pairing:**
  - pairing succeeds once, and fails when reused, expired, or on the 6th wrong code;
  - the device cookie authorizes remote-read routes;
  - a local-only route is 403 for remote.
- **Auth isolation:** Bearer admin token or `?token` from a remote principal is ignored (401).
- **Revocation:** revoke → next request 401; revoke-all works.
- **Redaction:** a report containing a synthetic API key is redacted remotely and verbatim locally.
- **Streaming:** SSE over the fake transport streams chunks and cancel closes the subscription.

### Stage 3 — `tunnel/v1` RelayClient plus in-repo reference relay (tests only)

**Scope:**
- **RelayClient in the daemon (`ws`):**
  - challenge / hello signature;
  - frames per D3;
  - heartbeat, backoff with jitter, cancel, and bufferedAmount backpressure;
  - enable/disable wired to a local-only preference.
- **Reference relay:** `relay/` (plain Node + `ws`) implementing subdomain → host routing, the header allowlist, immediate chunk flush, the per-response 1 MiB cap and the offline page. It is used by integration tests on localhost.

**Player:** Codex (high).

**Acceptance gate:** end-to-end on localhost, browser-shaped HTTP client → reference relay → RelayClient → daemon:
- **Transport:**
  - REST and SSE both work;
  - SSE first event arrives in under 1 s with no buffering;
  - heartbeats flow.
- **Failure handling:**
  - kill the host socket → browser 503 `host_offline` → auto-reconnect → SSE resumes;
  - a 2 MiB body gets 413;
  - a stalled browser does not stall other requests.
- **Host identity:** a forged `hostPublicId` without a valid signature is rejected.

### Stage 4 — Production relay service

**Scope:**
- **Deploy:** the Stage 3 relay deployed with a wildcard TLS certificate (DNS-01) on a small container host.
- **Operations:**
  - logging policy per D7;
  - rate limits (pairing endpoints, per-IP);
  - graceful `goaway` on deploy;
  - host-registration gating (see Unknowns).

**Player:** Codex / Sonnet-class for infra. Opus review of the logging and gating config.

**Acceptance gate:**
- **Real network:** a real phone on cellular reaches the desktop, and SSE survives 10+ minutes idle (heartbeats).
- **Data handling:** logs contain no bodies, cookies, query strings or fragments (log sample audit).
- **Tenant isolation:** two hosts with two phones — cookies and storage are isolated by origin, and cross-host access gets 401.

### Stage 5 — Pairing UX and Dad field test

**Scope:**
- **Settings card:** "Remote Access" — enable toggle, "Pair a phone" (QR + code), device list, rename / revoke / revoke all, "Disable Remote Access".
  - All controls are local-principal only. The card shows a read-only status when viewed remotely.
- **Extension:** commands mirror the card.
- **Phone pages:** the offline page and the pairing page on the phone.

**Player:** Claude Sonnet / Opus-class for UI, following the existing Settings disclosure and drag conventions.

**Acceptance gate:** Dad, on his phone over cellular:
- scans the QR code and is in within 10 s;
- Live Player Terminal and the AI Usage Scoreboard stream live;
- locking the phone for 5 minutes, then reopening, resyncs;
- revoking from the desktop logs the phone out on its next request;
- Disable drops access instantly.

The Scout does an adversarial pass over the Stage 1–4 gates.

### Stage 6+ — Later, each its own ADR delta

- **6a.** Coach Source host proxy: a remote-read route serving only `designated` paths (D6), plus the Assistant Coach resolution order.
- **6b.** Remote local-Git controls: status, branch, commit, push through the desktop `git` CLI. `remote-mutate` class with explicit confirm; no tokens.
- **6c.** Sideline accounts (claim hosts), with GitHub as the default `LinkedIdentity`, email, and the consent model.
- **6d.** GitHub App for PRs, Issues, Actions and private cloud sources.
- **6e.** E2EE (browser ⇄ host).

---

## 6. Remaining true unknowns

1. **Relay domain, hosting provider and cost ceiling.** This is a product and ops choice, and it blocks Stage 4 only.
2. **Host-registration gating before public availability.** Options: a beta enrollment key in the extension, or deferring public relay use until accounts exist (6c). It is needed so the relay can't be abused as a free tunnel. Until then the route allowlist makes it Sideline-only, not general purpose.
3. **Mobile Safari `EventSource` behaviour** on backgrounding and resume over the relay. Heartbeat plus `hello` resync should cover it. This is confirmed only in the Stage 5 field test.

Everything else above is decided.
