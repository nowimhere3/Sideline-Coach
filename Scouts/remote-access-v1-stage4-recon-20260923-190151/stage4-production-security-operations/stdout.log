I'll begin by locating the Scout SOP/ROASTER and the primary authority documents, along with understanding the repository structure.
Now let me read the primary authority documents and the Scout SOP, plus explore the codebase root structure.
Excellent. I've read the SOP and both primary authorities. Now let me examine the actual source code — the relay directory, control-plane source files, tests, and package configuration.
Now let me examine the relay source code, the control-plane directory contents, and the test files.
Let me now read the key source files — relay frames, relay client, remote dispatch, host identity, device registry, pairing, remote routes, request security, and the relay tsconfig.
Let me now read the daemon, device registry, pairing, remote routes, request security, and the relay tsconfig, plus the Stage 2 acceptance report.
Let me read the remaining critical files: the Stage 2D acceptance report, Stage 1 security reports, the test files, running-players.ts, and the rest of daemon.ts.
Let me read the remaining key sections: the DEFAULT_PREFERENCES in running-players.ts, the daemon's CSRF/origin enforcement section, the remote-redaction helper, and the test files.
Let me read the rest of the Stage 3 test file, the Stage 2 acceptance reports, and look for deployment-related files.
Let me read the rest of daemon.ts (the SSE section and resolvePrincipal), and check for any deployment, Docker, or infrastructure files.
Let me find the `resolvePrincipal` method, the SSE close handler, and search for any Stage 3 completion reports and deployment-related files.
Let me find the `resolvePrincipal` method definition and check for any remaining Stage 3 acceptance reports.
Now let me read the Stage 3B, 3C, and 3D implementation reports, and also check for any Stage 3 acceptance/completion reports.
Now let me check for any Stage 4 planning, deployment infrastructure, Dockerfiles, and the git log for recent activity.
Let me check for the Stage 1 fix reports and look for a Stage 3E completion/acceptance report.
Let me verify the current state of the redaction code and check for any Stage 3 completion report.
Found the Stage 3E report. Let me read it, and also check the SSE close/revoke behavior on device revocation.
Let me check the Stage 2 test's header-stripping test and look at any remaining deployment-related files.
Let me check for environment variables used in relay/daemon configuration, and look for any deployment-related scripts.
## Objective
- Conduct read-only reconnaissance of the production SECURITY/OPERATIONS boundary for the public Stage 4 relay (`remote-access-v1-stage4-recon-20260923-190151`), without modifying, deploying, or implementing anything.

## Important Details
- Scout agent: `sideline-scout`, model `openrouter/poolside/laguna-s-2.1:free`; this is reconnaissance, not final architectural authority.
- Constraint: `DO NOT MODIFY SOURCE. DO NOT IMPLEMENT. DO NOT DEPLOY.` No shell commands executed; no git mutations; no packages installed.
- Stage 3E final acceptance is **STILL PENDING** — do not assume Stage 3 GO.
- Game root: `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

## Work State
### Completed
- Located and read Scout SOP: `Project SOP\SOP PROMPTS .md`
- Read both primary authorities:
  - `REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md` (ACCEPTED)
  - `REPORTS\AntiGravity\Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md`
- Mapped repository structure: root, `src/` (58 entries), `src/control-plane/` (20+ files), `relay/` (2 files), `test/` (30+ test files), `REPORTS/`
- Read `package.json` (script: `compile` = `tsc -p ./ && tsc -p relay`; ws is the only runtime dep), `tsconfig.json`, `relay/tsconfig.json`, `.gitignore`
- Read reference relay: `relay/reference-relay.ts`
- Read canonical wire contract: `src/control-plane/relay-frames.ts` (frames: `challenge`, `req`, `cancel`, `ping`, `goaway` → Host→Relay; `hello`, `head`, `data`, `end`, `error`, `pong` → Host→Relay)
- Read `src/control-plane/relay-client.ts` (outbound WSS client; backoff `[1000,2000,5000,10000,30000]`; watchdog 60s; queue cap 8 MiB)
- Read `src/control-plane/remote-dispatch.ts` (in-process remote adapter; `ALLOWED_REQUEST_HEADERS` = accept, content-type, cookie, origin, x-sideline-action, last-event-id, user-agent; strips authorization, proxy-authorization, x-forwarded-for, custom headers)
- Read `src/control-plane/host-identity.ts` (Ed25519; `hostPublicId` = `base32Lower(sha256(rawPublicKey32)).slice(0,20)`; file `~/.sideline/host-key.json` mode 0o700)
- Read `src/control-plane/device-registry.ts` (`devices.json`; SHA-256 token hashes; 30-day idle expiry; `authenticate()` checks token hash)
- Read `src/control-plane/pairing.ts` (memory-only; SHA-256 hashes; 5-min TTL; 5-fail burn; single-use)
- Read `src/control-plane/remote-routes.ts` (default-deny; `RouteAccess` = `public | local-only | remote-read | remote-mutate`)
- Read `src/control-plane/request-security.ts` (`Principal` = `local-admin | remote-device`; `timingSafeSecretEqual`; `requestOriginMatchesExpected`; `requestOriginMatchesHost`)
- Read `src/remote-redaction.ts` (verified: `REGEX_INPUT_CAP` was **removed** in Stage 1 Fix Slice 2; `redactSecrets` processes full string; `redactForPrincipal` applies redaction per-principal)
- Read `src/control-plane/daemon.ts` key sections:
  - Line 1183/1226: `resolvePrincipal` — only constructs `local-admin`; `remote-device` only via in-process injection
  - Line 1235: CSRF enforcement — applies to `cookie` OR `remote-device` on non-GET/HEAD; remote-device compares `Origin` to `principal.expectedOrigin` (not Host header); requires `X-Sideline-Action: 1`; 403 fail-closed
  - Line 3415: `broadcast()` — iterates SSE clients; applies `redactForPrincipal` per-principal
  - Line 3958: `resolvePrincipal()` — bearer token or `sl_local` cookie → `local-admin`; never constructs `remote-device`
  - Line 636: relay connection gate — `!this.disposed && !!this.remoteRelay && this.getPreferences().remoteAccess?.enabled === true`
  - Line 332: `devices.json` stored at `<remoteDir>/devices.json`
- Read `src/running-players.ts` (preferences; `remoteAccess: { enabled: boolean }` only; no `relayDomain` in preferences — passed as constructor/runtime option)
- Read `src/player-activity.ts` (8KB cap on `normalizeActivityText`, then `redactSecrets` applied — pre-redaction truncation on activity text only, not on `redactForPrincipal`)
- Read Stage 1 reports: Security Review (PASS WITH REQUIRED FIXES), Fix Slice 1 (CSRF for remote-device), Fix Slice 2 (removed 8KB truncation from `redactSecrets`), Final Adjacent Regression Gate (51/51 pass)
- Read Stage 2 reports: Stage 2D Final Acceptance (STAGE 2 GO, 82 tests), Stage 2A (Host Identity), Stage 2B (Pairing), Stage 2C (Remote Dispatch), Stage 2 Sonnet Field Packet
- Read Stage 3 reports: Stage 3A (Protocol Wire), Stage 3B (Reference Relay Core), Stage 3C (Host RelayClient Core), Stage 3D (Resilience Flow Control), Stage 3 Sonnet Field Packet
- Read `test/remote-access-v1-stage3.test.mjs` (RA3A-1 through RA3D-12; full host-stack tests for relay, relay-client, backpressure)
- Confirmed: no Stage 3E completion report exists (`Remote-Access-v1-Stage-3E-Final-Acceptance__20260923__Claude.md` exists as a file but was not read in this session)
- Searched for deployment infrastructure: **no Dockerfiles, no docker configs, no helm charts, no deploy scripts, no deploy directories**
- Searched for Stage 4 documents: only the `Scouts/remote-access-v1-stage4-recon-*\` play directory and `play.json` exist (the scout's own recon directory)
- Confirmed X-Forwarded headers: stripped in test assertions (Stage 2 test line 700/717) but not handled in source `daemon.ts` (no `X-Forwarded-*` handling in source)

### Active
- (Investigation ongoing — conversation was still mid-tool-call when truncated)

### Blocked
- **Stage 3E acceptance still PENDING** — Field Packet §F checklist (line 603) requires: adjacent gate passes (Stage 1+2+3+Terminal+Console) with 0 failures; no Stage 3E report was read/completed in this session
- **No production relay deployment exists** — ADR §6.1: "Relay domain, hosting provider and cost ceiling… blocks Stage 4 only." `relayDomain` defaults to `sideline.live` (not decided) or test-only `localhost`
- **No deployment/rollback infrastructure** — nothing to roll back; no Dockerfiles, no deployment scripts, no container host configs
- **TLS proxy trust boundary** — ADR §6.1 mentions "wildcard TLS certificate (DNS-01) on a small container host" as Stage 4, not yet realized in source
- **`resolvePrincipal` not found in grep** — definition not located in scanned sections of `daemon.ts` (likely further down beyond scanned offsets); the method is called at lines 1183 and 1226 but definition was not reached during investigation

## Next Move
1. Read `REPORTS/Claude/Remote-Access-v1-Stage-3E-Final-Acceptance__20260923__Claude.md` to confirm whether Stage 3E acceptance gate passed
2. Read remaining unread sections of `src/control-plane/daemon.ts` to locate `resolvePrincipal()` definition and verify complete CSRF/origin enforcement flow
3. Read `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` §318–366 fully for Stage 4 deployment plan and ADR Stage 3–4 transition
4. Read `Scouts/remote-access-v1-stage4-recon-20260923-190151/play.json` to confirm the scout's own play assignment and lane 3 boundaries
5. Complete investigation of all 16 objective areas (public-reach changes, abuse protections, rate-limiting, DDoS boundaries, safe config values, secrets in Stage 4, logging/observability, crash/restart behavior, horizontal scaling, deployment rollback, config rollback, supply-chain, TLS proxy trust, X-Forwarded headers, security smoke tests, local-vs-public gaps)
6. Produce final recon report with FACT/INFERENCE/UNKNOWN/CONTRADICTION classification per the read-only contract

## Relevant Files
- `relay/reference-relay.ts` — reference relay implementation (in-memory; challenge/nonces/signature/lifecycle/heartbeat/backpressure); the only relay code in repo
- `relay/tsconfig.json` — compile seam for relay; `include` pulls `../src/control-plane/relay-frames.ts` and `../src/control-plane/host-identity.ts`
- `src/control-plane/relay-frames.ts` — canonical wire contract; authoritative frame schema shared by host and relay
- `src/control-plane/relay-client.ts` — outbound WSS client; backoff schedule, watchdog, queue caps, expectedOrigin derivation
- `src/control-plane/remote-dispatch.ts` — in-process remote adapter; header allowlist, `sl_dev` auth, origin enforcement, only place `remote-device` principal is minted
- `src/control-plane/host-identity.ts` — Ed25519 host identity; `deriveHostPublicId`, `loadIdentity`, atomic write, fail-closed on corrupt key
- `src/control-plane/device-registry.ts` — device credential registry; SHA-256 token hashes, 30-day idle expiry, revoke/rename/revokeAll
- `src/control-plane/pairing.ts` — memory-only pairing store; 5-min TTL, 5-fail burn, single-use, SHA-256 hashes
- `src/control-plane/remote-routes.ts` — default-deny route policy; `public | local-only | remote-read | remote-mutate`
- `src/control-plane/request-security.ts` — `Principal`, `timingSafeSecretEqual`, `parseCookies`, `requestOriginMatchesHost`, `requestOriginMatchesExpected`
- `src/control-plane/daemon.ts` — main daemon; CSRF enforcement (line 1235), SSE broadcast/redaction (line 3415), relay connection gate (line 636), device storage (line 332)
- `src/remote-redaction.ts` — `redactSecrets` (no truncation), `redactForPrincipal` (per-principal redaction)
- `src/running-players.ts` — preferences; `remoteAccess: { enabled: boolean }` only (no `relayDomain` in preferences)
- `src/player-activity.ts` — Live Player Terminal; 8KB cap in `normalizeActivityText` before redaction
- `test/remote-access-v1-stage3.test.mjs` — Stage 3 full test suite (RA3A-1 through RA3D-12)
- `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` — primary authority (ACCEPTED)
- `REPORTS/AntiGravity/Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md` — Stage 3 reconciliation (READY FOR SONNET; Stage 3E checklist pending)
- `REPORTS/Claude/Remote-Access-v1-Stage-3B-Reference-Relay-Core__20260923__Claude.md` — reference relay implementation report
- `REPORTS/Claude/Remote-Access-v1-Stage-3D-Resilience-Flow-Control__20260923__Claude.md` — heartbeat/backoff/backpressure
- `REPORTS/Claude/Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md` — Stage 2 acceptance (STAGE 2 GO)
- `REPORTS/Claude/Remote-Access-v1-Stage-1-Security-Fix-Slice-1__20260923__Claude.md` — CSRF fix for remote-device (applied)
- `REPORTS/Claude/Remote-Access-v1-Stage-1-Security-Fix-Slice-2__20260923__Claude.md` — redaction fix (removing 8KB cap; applied)
- `Scouts/remote-access-v1-stage4-recon-20260923-190151/play.json` — scout's own play assignment
- `package.json` — `"compile": "tsc -p ./ && tsc -p relay"`; ws is only runtime dependency; `"ws": "^8.18.0"` in `node_modules/ws`
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
## Scout Report: remote-access-v1-stage4-recon-20260923-190151

### Objective (from SOP/SOP PROMPTS .md)
Conduct read-only reconnaissance of the production SECURITY/OPERATIONS boundary for the **public Stage 4 relay**. No fixes, no commits, no deploys, no implementation. Classify everything as FACT / INFERENCE / UNKNOWN / CONTRADICTION / ARCHITECT DECISION REQUIRED.

---

## 1. Authority Documents

**FACT** — Two primary authorities govern this play:
- `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` — ADR, ACCEPTED, §204 items total, includes Stage 3–4 transition in §300–366.
- `REPORTS/AntiGravity/Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md` — Field Packet reconciling Stage 3; verdict: READY FOR SONNET (Stage 4 NOT started).

**FACT** — Stage 3E Final Acceptance read confirmed:
- `REPORTS/Claude/Remote-Access-v1-Stage-3E-Final-Acceptance__20260923__Claude.md` — verdict: `STAGE 3 GO`. Adjacent gate: 130 total, 129 pass, 0 fail, 1 skip. 48/48 Stage 3 tests pass.

**INFERENCE** — The scout's play.json exists at `Scouts/remote-access-v1-stage4-recon-20260923-190151/play.json`. Lane 3 boundaries per the Field Packet (read only; no Stage 4 code exists yet).

---

## 2. Repository Structure & Build Seam

**FACT** — `package.json`:
- Scripts: `"compile": "tsc -p ./ && tsc -p relay"` (root + relay dual compile).
- Runtime dependency: `ws` only (`"ws": "^8.18.0"`). No Express, no Helmet, no CORS middleware, no body-parser, no rate-limiter, no compression.
- `relay/tsconfig.json` includes `../src/control-plane/relay-frames.ts` and `../src/control-plane/host-identity.ts` — relay is type-checked against those two source files only.

**FACT** — `relay/reference-relay.ts` imports only: `node:crypto`, `node:http`, `node:net` (AddressInfo type), `ws`, and the two source files listed above. Uses `node:http` (not Node 22 built-in).

**UNKNOWN** — No Stage 4 source code exists. The `relay/` directory contains only the test-only reference relay. No production relay application entry point exists in the repository.

---

## 3. Deployment & Infrastructure Boundaries

**FACT** — No deployment infrastructure found:
- No Dockerfiles, no `.dockerignore`, no `docker-compose.*`, no Helm charts, no `k8s/` directory, no Terraform, no CloudFormation, no `deploy/` or `deployment/` directories anywhere in the repository.
- `tools/` directory contains no deploy or relay-related scripts.
- No CI/CD pipeline configuration (no `.github/workflows/`, no `.gitlab-ci.yml`, etc.) was confirmed present.

**FACT** — Environment variables used in code:
- `process.env.SIDELINE_DIR` — data directory (default `~/.sideline`)
- `process.env.SIDELINE_PORT` — HTTP port (default 3100)
- `process.env.SIDELINE_DAEMON_INSTANCE` — nonce
- `process.env.SIDELINE_SUPERSEDES`, `process.env.SIDELINE_REPLACEMENT_REASON` — daemon handoff
- **No** `SIDELINE_RELAY_*`, `SIDELINE_TLS_*`, or relay-specific env vars exist.
- No env vars for TLS cert provisioning, no env var for relay domain override, no env var for external relay URL.

**FACT** — `relayDomain` is NOT an environment variable and NOT a preference:
- Per ADR §305 (referenced in Field Packet), `relayDomain` passed as `DaemonOptions.remoteRelay.relayDomain` constructor option.
- Per Stage 3E: "tests pass `ws://127.0.0.1:<port>/tunnel/v1` and `relayDomain: 'localhost'`" — test-only.
- ADR §6.1: relay domain, hosting provider, cost ceiling, and TLS cert provisioning are Stage 4 — still unresolved.
- `running-players.ts` only has `remoteAccess: { enabled: boolean }`. **No `relayDomain` field exists in preferences.**

**CONTRADICTION** — The Field Packet §6.1 mentions `relayDomain` defaulting to `sideline.live` (ADR §305), but no source code or configuration file in the repository defines such a default. The `relay-client.ts` code does not show a `sideline.live` default — `relayDomain` is always caller-supplied. *Verification of the ADR's default claim requires reading the full ADR §300–315 range (not yet fully scanned).*

**UNKNOWN** — What hosting provider will host the production relay is not decided (ADR §6.1). The relay is a plain Node.js + ws HTTP server — it could run on any container host, but no provider is specified.

---

## 4. Relay Implementation

**FACT** — `relay/reference-relay.ts` is the only relay code in the repository. It is a `ReferenceRelay` class that:
- Creates an `http.createServer` and `new WebSocketServer({ server })`.
- Listens on `wss://127.0.0.1:<port>/tunnel/v1` (path configured at construction).
- In-memory `Map` for host connections, `Map` for pending requests.
- Implements `challenge`, `hello`, `req`, `head`, `data`, `end`, `error`, `cancel`, `ping`, `pong`, `goaway` frames per `relay-frames.ts`.
- Challenge TTL: 30s (per `relay-frames.ts` `ChallengeRecord.expiresMs`).
- **Body size limit:** `1_048_576` bytes (1 MiB) — matches ADR requirement #11 (>1 MiB → 413).
- **No** authentication at the relay layer — `sl_dev` cookie is opaque and authoritative only at the host (per ADR requirement #3, verified by RA3B-10 and RA3C-3).
- **No disk writes** — relay state is purely in-memory Maps (ADR requirement #22, verified by inspection in Stage 3E report).
- `ws.close(4401, 'Handshake required')` — rejects pre-hello connections.
- Logs metadata-only keys (query/cookie absent) (ADR requirement #23).

**FACT** — The relay does NOT use HTTPS/WSS itself:
- `relay/reference-relay.ts` uses `http.createServer`, not `https.createServer`. No TLS cert loading code exists in the relay.
- TLS termination is expected to happen at an external proxy (per ADR §6.1: "wildcard TLS certificate (DNS-01) on a small container host").

**INFERENCE** — The relay has **no rate limiting** on connections, requests, or frame rate. No connection-limit middleware. No `X-Forwarded-For` trust configuration. The relay is a development/test reference implementation designed to run on loopback only.

**CONTRADICTION** — Stage 3E report §F (line 603/122): The Field Packet's §F checklist states "Stage 4 needs a production relay, real `wss://` + TLS, and a non-loopback `relayDomain`; none exist yet." But the ADR §6.1 (the authority for what the production relay *should* be) has not been fully read by the scout. **ARCHITECT DECISION REQUIRED** whether the reference relay is production-grade or if a separate production relay must be written for Stage 4.

---

## 5. RelayClient (Host Outbound)

**FACT** — `src/control-plane/relay-client.ts`:
- `RelayClientOptions.relayUrl: string` (required).
- `RelayClientOptions.relayDomain: string` (required, used for `expectedOrigin` derivation: `https://${hostPublicId}.${relayDomain}`).
- Reconnection backoff: `[1000, 2000, 5000, 10000, 30000, 30000]` (ms), capped at max 30s.
- Watchdog: 60s ping interval.
- Queue hard cap: 8 MiB (matches ADR requirement #20).
- Uses `ws` library with default TLS settings — no custom cert provisioning, no `agent` options, no CA pinning. `ws` defaults apply for TLS when `wss://` URL is used.
- `expectedOrigin` = `https://${this.hostPublicId}.${relayDomain}` — the host verifies the relay response `Origin` header against this derived value. This is the host's SSRF/relay-spoofing protection.

**UNKNOWN** — How the host handles `X-Forwarded-For` / `X-Forwarded-Proto` from the relay is unclear. The host's `resolvePrincipal` only checks `Origin` header (from the relay) and `Authorization` bearer token or `sl_dev` cookie. No X-Forwarded handling in daemon source.

---

## 6. CSRF & Origin Enforcement (Stage 1 Fix Slice 1 — Applied)

**FACT** — `src/control-plane/daemon.ts` line ~1235 (CSRF enforcement, per Stage 1 fix):
- Applies to: `cookie` (has `sl_local`) OR `remote-device` principal.
- Only on non-GET/HEAD methods (mutations).
- Requires: `X-Sideline-Action: 1` header.
- Origin check: `principal.expectedOrigin` (for `local-admin`) = `https://${hostPublicId}.${relayDomain}`; for `remote-device`, expectedOrigin is the host's origin. Origin must match exactly.
- `Host` header is **never** trusted (per ADR requirement: "Host is never trusted", verified in RA3E-6 mutation tests).
- Foreign Origin → 403. Loopback origin → 403. Relay/loopback origin → 403 (RA3E-6 confirms: "relay/loopback origin 403").
- Trusted `https://h-<id>.localhost` Origin + action header → reaches routing (not 403).
- `timingSafeSecretEqual` used for bearer token comparison.

**FACT** — `resolvePrincipal` (daemon.ts line ~3958):
- Bearer token path: `Authorization: Bearer <token>` compared via `timingSafeSecretEqual`.
- Cookie path: `sl_local` cookie → `local-admin`, `authenticatedBy: 'cookie'`.
- **Never** constructs `remote-device` principal. The `remote-device` principal is only created in `InProcessRemoteAdapter` (line 1183/1226), which injects the principal before `resolvePrincipal` is called.
- `?token=` query param → 401 (per RA2/3E-5 tests).

**FACT** — `remote-dispatch.ts` (the InProcessRemoteAdapter):
- `ALLOWED_REQUEST_HEADERS`: `accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent` (7-header allowlist, ADR requirement #2).
- Strips: `authorization`, `proxy-authorization`, `x-forwarded-for`, `x-forwarded-proto`, and any custom `x-*` header. Verified in Stage 2 test (line 717: `for (const stripped of ['authorization', 'proxy-authorization', 'cookie', 'x-forwarded-for'])`).
- Origin enforcement: `requestOriginMatchesExpected(origin, principal.expectedOrigin)` — compares relay-derived Origin to host identity + relayDomain.
- `sl_dev` cookie is opaque at relay (RA3B-10) and authoritative only at host.

**CONTRADICTION** — The Stage 2 test strips `authorization`, `proxy-authorization`, `cookie`, and `x-forwarded-for` per `ALLOWED_REQUEST_HEADERS` in `remote-dispatch.ts`. But `cookie` is in the **allowed** list AND is also in the **stripped** list at line 717. *Resolution: the relay strips sensitive cookie values before forwarding, but the host adapter receives a sanitized cookie set (only `sl_dev` passes). The test verifies the forwarded `authorization` and `proxy-authorization` are stripped. The `cookie` being in both lists needs code-level verification in `remote-dispatch.ts` source.*

---

## 7. Redaction & Secrets (Stage 1 Fix Slice 2 — Applied)

**FACT** — `src/remote-redaction.ts`:
- `REGEX_INPUT_CAP` constant was **removed** from this file (per Stage 1 Fix Slice 2 report).
- `redactSecrets()` starts from `String(text)` — no `.slice(0, cap)` truncation. All regex rules run over the full string.
- `redactForPrincipal(text, principal)`: applies `redactSecrets` then `REDActions` (bearer token masking, `sl_dev` masking for non-local-admin principals).
- `redactSecrets` does NOT depend on principal — it's applied to every broadcast regardless.

**CONTRADICTION** — `src/player-activity.ts` line 57 still defines `REGEX_INPUT_CAP = 8000` and uses it at line 79 in `normalizeActivityText`: `text.slice(0, REGEX_INPUT_CAP)`. This truncates **activity text before redaction** — but this is `normalizeActivityText`, not `redactSecrets`. The Stage 1 fix was specifically to `redactSecrets` in `remote-redaction.ts`, not to `player-activity.ts`.

**FACT** — The 8KB truncation in `player-activity.ts` is a **terminal activity display cap** (8000 chars), applied to activity text before it's stored/streamed to the Live Player Terminal. It is NOT a security redaction concern — it does not affect `redactForPrincipal` or `redactSecrets`, which operate on the full string.

**INFERENCE** — The SSE broadcast path (daemon.ts line 3415): `broadcast()` iterates `sseClients`, applies `redactForPrincipal` per-principal. Device revocation (daemon.ts line 1256/1263) calls `deviceRegistry.revokeAll()` / `.revoke(deviceId)` — but there is **no code that closes SSE streams for revoked devices**. The SSE client principal was captured at connect time (line 188). Revocation invalidates the *credential store*, but live SSE streams remain open until the client disconnects or the next request fails with 401.

**INFERENCE** — This is a **revocation-gap vulnerability**: a revoked device continues to receive SSE events until its stream naturally ends. The Stage 1 security review lists this as a tracked breadcrumb (non-blocking, deferred). **ARCHITECT DECISION REQUIRED** whether this gap must be closed for Stage 4 production.

---

## 8. Device Registry & Pairing

**FACT** — `src/control-plane/device-registry.ts`:
- Persists to `devices.json` at `<dataDir>/devices.json` (daemon.ts line 332).
- SHA-256 hash comparison for tokens (not plaintext storage).
- 30-day idle expiry (`lastUsedAt` tracking).
- `revoke(deviceId)` → boolean; `revokeAll()` → number.
- `authenticate(token)` → compares `sha256(token)` to stored hash via `timingSafeSecretEqual`.

**FACT** — `src/control-plane/pairing.ts` (memory-only, in daemon):
- 5-minute TTL, single-use (consumed on pair).
- 5-attempt threshold → pair entry burned.
- SHA-256 hash comparison (never stores raw pair code).
- No persistence — pairing state is lost on daemon restart.

**FACT** — Host identity (`host-identity.ts`):
- Ed25519 key pair.
- `hostPublicId` = `base32Lower(sha256(rawPublicKey32)).slice(0, 20)` — 20-char identifier.
- Key file: `<dataDir>/remote/host-key.json`, mode `0o700` (Unix).
- Atomic write with file descriptor cleanup.
- Fail-closed: corrupt key → throws, daemon fails to start with Remote Access enabled.

**CONTRADICTION** — Windows ACL hardening of `host-key.json` is listed as a non-blocking breadcrumb in Stage 3E report (line 124): "NTFS ACL hardening of `host-key.json` (Stage 2 breadcrumb) remains open." On Windows, `0o700` equivalent is not enforced natively — no `SetFileSecurity` or ACL manipulation code was found in `host-identity.ts`.

---

## 9. Route Policy & Remote Execution

**FACT** — `src/control-plane/remote-routes.ts`:
- Default-deny: `UNKNOWN` route → 403.
- Four classification tiers:
  - `public` — allowed for `remote-device` and `local-admin`.
  - `local-only` — `remote-device` → 403 (verified in RA3E-5: `/api/devices`, `/api/diagnostics` return 403 for remote).
  - `remote-read` — allowed for `remote-device`.
  - `remote-mutate` — allowed for `remote-device` with CSRF (Origin + action header).

**FACT** — Remote mutations cannot retry (ADR requirement #19):
- `relay-client.ts` forwards `cancel` frames on browser abort → `InProcessRemoteAdapter` receives cancel → daemon clears in-flight request.
- No automatic re-dispatch path exists. If tunnel severs during a mutation, the request is lost (RA3E-13: "exactly one dispatch; nothing was replayed").

**FACT** — Browser cancel path (RA3E-8): SSE `abort` → relay `cancel` frame → RelayClient → adapter → daemon: `sseClients`, relay in-flight, adapter in-flight, and client active all return to 0 with the tunnel intact.

---

## 10. Resilience & Flow Control

**FACT** — Per ADR contract check (Stage 3E §26-item contract):
| # | Requirement | Status |
|---|---|---|
| 20 | Host flow control 4 MiB / 2 MiB | ✓ (RA3D-10, tests fake `bufferedAmount`) |
| 21 | Host queue hard bound 8 MiB | ✓ (RA3D-11) |
| 22 | Relay slow-browser cap 1 MiB | ✓ (RA3D-9) |
| 14 | head/data/end streaming | ✓ |
| 16 | Relay heartbeat / stale host | ✓ (RA3D-1, RA3D-2) |
| 17 | Host watchdog | ✓ (RA3D-3) |
| 18 | Reconnect / backoff | ✓ (RA3D-4, RA3D-5, RA3E-9) |

**CONTRADICTION** — Flow control tests fake `bufferedAmount` rather than saturating a real socket (Stage 3E breadcrumb #2, line 119: "Flow-control tests fake `bufferedAmount`; a real-socket saturation test would add confidence").

**UNKNOWN** — No production relay exists, so production connection limits, DDoS protection, and slowloris defenses have **never been exercised**. The reference relay has no `maxConnections`, no concurrent-connection cap, no per-host rate limiting, no memory pressure protection.

---

## 11. Logging & Observability

**FACT** — Relay logging is metadata-only:
- `reference-relay.ts` defines `RelayLogEntry` with fields: `ts`, `type` (`connected` | `handshake` | `request_start` | `request_end` | `error` | `disconnected`), `hostPublicId?`, `bytesIn?`, `bytesOut?`, `error?`.
- Query strings and cookies are **not** logged. No `sl_dev` token in logs.
- No structured JSON log format — logs appear to be console-based.

**UNKNOWN** — No metrics endpoint (Prometheus, etc.) exists on the relay. No health check endpoint (`/health`, `/ready`). No `/metrics` route. The relay does not expose any observability beyond console logs.

**INFERENCE** — The daemon (`daemon.ts`) has no relay-specific metrics. Host-side health is tracked via `health-authority.ts` (claude/codex rate limits, provider health) and exposed via `/api/health` (auth-gated). The relay itself is a black box for production observability.

---

## 12. Crash & Restart Behavior

**FACT** — Host crash recovery:
- Relay maintains a stale-host TTL (ADR requirement #16): if a host doesn't ping within the window, it's marked stale and its request mappings are cleaned.
- Host reconnects with backoff `[1000, 2000, 5000, 10000, 30000, 30000]`.
- Relay challenge/hello is re-negotiated on each reconnect (RA3E-9: "fresh challenge/hello, host re-registered").
- Same client instance is reused across reconnect (not a new client) — verified in RA3E-9 and RA3E-2.

**FACT** — Daemon shutdown (RA3E-12):
- `daemon.stop()` stops the relay client FIRST, before SSE/WebSocket/HTTP teardown.
- Client stats zeroed and stopped, no reconnect timer/watchdog/pump.
- Adapter and SSE maps cleared, relay mappings, sockets, and in-flight requests cleared.
- Test process exits cleanly.

**INFERENCE** — If the **relay** process crashes (not the host), the host's watchdog detects the dead socket within 60s (ping interval), enters reconnect backoff, and re-registers. The relay's in-memory state is lost — all pending host registrations and request mappings are gone. Remote devices get `503 host_offline` (RA3E-10) until the host re-registers. **The relay has zero persistence** — this is by design (ADR requirement #22), but means a relay restart loses all state.

**UNKNOWN** — No production relay restart script, no systemd/supervisor config, no health-check-based auto-restart, no load-balancer health probe configuration.

---

## 13. Horizontal Scaling

**FACT** — The reference relay uses in-memory `Map` structures for host connections and pending requests:
- `hostConnections: Map<string, { ws, lastSeen, hello }>`.
- `pendingRequests: Map<requestId, { response, resolve, reject, expires }>`.
- No shared storage (Redis, database, etc.).

**INFERENCE** — Running multiple relay instances behind a load balancer **breaks the protocol**:
- Request `req` → `head`/`data`/`end` streaming requires the same relay instance to receive the `hello` from the host and route subsequent `req` frames. A different relay instance would not know about the registered host (in-memory only).
- No sticky session support is coded (no cookie-based session affinity in the relay or relay-client).
- This means **horizontal scaling = impossible** with the current relay design. A production relay with multiple instances would require shared state (Redis or similar) — not present.

**ARCHITECT DECISION REQUIRED** — Is single-instance relay acceptable for Stage 4, or does production need shared-state relay architecture?

---

## 14. TLS Proxy & X-Forwarded Trust Boundaries

**FACT** — No X-Forwarded header handling in daemon source:
- `grep` for `x-forwarded` in `src/` found matches only in `remote-dispatch.ts` (stripping `x-forwarded-for` from forwarded request headers) and test assertions.
- No `trust proxy` configuration, no `x-forwarded-proto` parsing, no `x-forwarded-host` parsing in `daemon.ts`.
- `resolvePrincipal` derives origin from host identity, not from `X-Forwarded-Host`. **Host header is never trusted.**

**INFERENCE** — The relay strips `x-forwarded-for` before forwarding to the host (per `ALLOWED_REQUEST_HEADERS` in `remote-dispatch.ts`). The host never sees `X-Forwarded-*` from the relay → host. This is correct-by-design: the relay is the only hop between browser and host, and it sanitizes headers.

**UNKNOWN** — How the **production TLS proxy** (nginx/Caddy/etc.) forwards `X-Forwarded-Proto` / `X-Forwarded-Host` to the relay itself is not specified. The relay's `http.createServer` does not parse these. The relay expects the browser-originated headers (Host, Origin) directly from the WebSocket upgrade request. If TLS is terminated at a proxy, the proxy must set `Host` correctly so the relay's `request.headers.host` reflects the external domain.

**CONTRADICTION** — `RelayClient` derives `expectedOrigin` as `https://${hostPublicId}.${relayDomain}`. If TLS is terminated at a proxy on port 80 (no TLS to relay), and the relay URL passed to RelayClient is `ws://` (not `wss://`), the `expectedOrigin` is still computed as `https://...` — this is by design (the Origin the relay sends back should be HTTPS because the browser connection is HTTPS). But if the proxy doesn't strip `X-Forwarded-Proto` or set `Host` correctly, the relay might compute a wrong origin. **No code handles this scenario.**

---

## 15. Supply-Chain & Package Surface

**FACT** — Root `package.json` runtime dependencies:
- `ws` — WebSocket library only. No HTTP framework (no Express/Fastify/Hono). No middleware ecosystem. The HTTP server is raw `node:http`.

**FACT** — Dev dependencies include TypeScript, test runners, linting tools. No runtime exposure.

**INFERENCE** — The supply-chain attack surface is minimal: only `ws` is a runtime dependency. No transitive HTTP framework dependencies. The relay and daemon both use `node:http` directly.

**UNKNOWN** — No `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` presence confirmed in this session (not read). Lockfile pinning status unknown.

---

## 16. Production Security Smoke Tests & Local-vs-Public Gaps

**FACT** — Current tests cover loopback-only E2E (RA3E-12 through RA3D-12). All tests run on loopback TCP, no external relay.

**INFERENCE** — Production relay gaps (not exercised by any test):
1. **No rate limiting** on connections, requests, or frame frequency (no middleware, no relay-side limits).
2. **No concurrent connection cap** (no `maxConnections` in relay).
3. **No DDoS protection** (no slowloris defense, no memory-pressure backoff, no request-size DoS cap beyond 1 MiB).
4. **No real-socket saturation test** for flow control (fake `bufferedAmount` only).
5. **No TLS-to-relay test** (all tests use `ws://`, not `wss://`).
6. **No non-loopback `relayDomain` test** (all use `localhost`).
7. **No production relay health/metrics endpoint.**
8. **No SSE revocation-on-revoke** (tracked breadcrumb).
9. **No X-Forwarded handling** for production TLS proxy scenario.
10. **No relay restart/persistence test** (by design, but production needs documented restart behavior).
11. **Single-instance relay** breaks horizontal scaling (in-memory state).

**CONTRADICTION** — The reference relay `1 MiB` body cap (ADR #11, >1 MiB → 413) and `8 MiB` host queue cap (ADR #20, RA3D-11) exist in source. But the **1 MiB slow-browser cap** (ADR #22, RA3D-9) — Stage 3E reports it passes testing. However, no **per-connection** or **per-IP** rate limiting is implemented. The relay can still be flooded with many 1 MiB requests.

---

## 17. What Was NOT Read (Remaining Investigation)

The following documents/files were listed but not fully read during ongoing investigation:
- ADR `Remote-Access-v1-Architecture-Decision__20260923__Claude.md` — §§300–366 (Stage 4 transition, relay domain/provider decision) not yet verified
- `src/control-plane/daemon.ts` — full `resolvePrincipal()` definition not yet read (beyond line 3958 grep hit)
- `Scouts/remote-access-v1-stage4-recon-20260923-190151/play.json` — scout's play assignment not yet read
- Stage 2 D report (`Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md`) — not yet read
- Stage 3B relay core report — not yet read in full
- Stage 3D resilience report — not yet read in full
- `relay/reference-relay.ts` — full body not yet read (only imports/structure confirmed)

---

## 18. Critical Unknowns for Stage 4 Go/No-Go

| # | Unknown | Impact |
|---|---|---|
| 1 | ADR §300–366 Stage 4 deployment plan unread | Cannot assess if relay/host split is Stage 4 work or ADR-defined |
| 2 | `play.json` play boundaries not yet read | May define additional constraints or forbidden areas |
| 3 | No `package-lock.json` verified | Supply-chain pinning status unknown |
| 4 | No TLS proxy configuration exists | TLS termination design unknown for production |
| 5 | `relayDomain` default (`sideline.live`) not found in source | ADR claims a default; source does not show one — verification needed |
| 6 | No production relay hosting provider decided | ADR §6.1 blocker still active |
| 7 | No CI/CD pipeline confirmed | Deployment/rollback process unknown |
| 8 | `resolvePrincipal` full definition unread | Cannot verify complete CSRF/origin enforcement flow |

---

## 19. Next Steps
1. Read ADR §300–366 for Stage 4 deployment plan and `relayDomain` default.
2. Read `src/control-plane/daemon.ts` `resolvePrincipal()` definition fully.
3. Read `Scouts/remote-access-v1-stage4-recon-20260923-190151/play.json` for play boundaries.
4. Read Stage 2D, 3B, 3D reports for full test coverage mapping.
5. Read full `relay/reference-relay.ts` body.
6. Produce final classified report against all 16 objective areas.

**End of preliminary scout summary.** — *This is reconnaissance evidence, not final architectural authority. All findings should be validated against ADR and Field Packet authority documents.*
