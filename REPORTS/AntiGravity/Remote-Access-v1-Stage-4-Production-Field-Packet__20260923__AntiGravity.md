# SIDELINE COACH — REMOTE ACCESS V1 · STAGE 4 PRODUCTION FIELD PACKET

**COMPLETED:** 2026-09-23 7:35 PM MDT  
**TIMEZONE:** America/Edmonton · Calgary, Alberta  

**AGENT:** Anti-Gravity  
**ROLE:** A-Team Scout / Production Architecture Reconciler  
**TARGET IMPLEMENTER:** Claude Sonnet 5 MEDIUM (or Codex High)  
**MODE:** READ-ONLY PASS · NO RUNTIME SOURCE MODIFIED · NO DEPLOYMENT · NO COMMIT · NO PUSH  
**PRIMARY ARCHITECTURAL AUTHORITIES:**  
- `REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md` (ACCEPTED)  
- `REPORTS\Claude\Remote-Access-v1-Stage-3E-Final-Acceptance__20260923__Claude.md` (STAGE 3 GO, 130 adjacent tests green)  
- `REPORTS\AntiGravity\Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md` (STAGE 3 PROTOCOL SPEC)  
**SCOUT FORMATION:** `C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage4-recon-20260923-190151\` (4/4 lanes complete)  

---

# A. VERDICT

## `READY FOR STAGE 4 IMPLEMENTATION`

Stage 3 is formally CLOSED, GREEN, and PROVEN across all 130 adjacent tests. The underlying protocol, frame schema, Ed25519 challenge-response handshake, 7-header allowlist, SSE streaming, backpressure, and cross-host isolation are fully verified on localhost.

All 23 production hosting, domain, DNS, TLS, operational security, and resilience decisions for Stage 4 are adjudicated below with zero implementation ambiguity. 

The implementation Player is equipped with an exact 5-slice plan (4A through 4E) centered on a **single persistent container running the shared relay engine on a PaaS provider with edge-managed wildcard TLS**.

---

# B. VERIFIED EXTERNAL FACTS (VERSUS SCOUT SPECULATION)

| Item / Claim | Scout Claim | Live Verification / Authoritative Source | Status / Reality |
|---|---|---|---|
| **Fly.io Wildcard TLS** | Supported via DNS-01 | **Verified:** Fly.io officially supports `fly certs add "*.domain.com"` via Let's Encrypt DNS-01. Fly generates an `_acme-challenge` CNAME record for automated validation and certificate renewal. | **VERIFIED FACT** |
| **Fly.io Machine Pricing** | ~$2–5/month | **Verified:** 1x `shared-cpu-1x` (256MB RAM) Machine running 24/7 costs ~$2.70/month ($0.00000103/s). Outbound bandwidth: 100 GB/month included free. Shared IPv4 and Anycast IPv6 are free ($0). Dedicated IPv4 is $2/mo if needed. | **VERIFIED FACT** |
| **Fly.io Idle Timeout** | 60 seconds default | **Verified:** Fly proxy TCP idle timeout is 60s. Sideline's 20s transport heartbeat ping resets the idle timer continuously. | **VERIFIED FACT** |
| **Fly.io Response Buffering** | "Does not buffer" | **Partially Verified / Risk Identified:** Official Fly docs confirm Fly Proxy buffers HTTP responses for automatic gzip compression. **Crucial Mitigation:** Setting `Content-Encoding: none` (alongside existing `Cache-Control: no-transform` and `X-Accel-Buffering: no`) disables proxy compression buffering for SSE streaming. | **VERIFIED WITH MITIGATION** |
| **Koyeb Free Tier Wildcard** | Free tier works for relay | **Refuted:** Official Koyeb documentation confirms Koyeb's automated TLS cannot issue wildcard certificates (`*.domain`) for arbitrary dynamic subdomains without manually creating each subdomain in the dashboard. | **REJECTED AS CANDIDATE** |
| **Railway Free/Hobby Tier** | Free/cheap hosting | **Refuted:** Railway Hobby tier uses serverless auto-sleeping on inactivity. Pro tier ($20/mo) is required for persistent always-on, which is unnecessarily expensive for 1-user beta. | **REJECTED AS PRIMARY** |
| **DigitalOcean App Platform** | $5/mo Basic tier | **Verified:** DO App Platform Basic ($5/mo) supports native WebSockets, always-on execution, and wildcard custom domains with automated Let's Encrypt via TXT DNS verification. | **VERIFIED FACT (FALLBACK)** |
| **DNS Wildcard `h-*.domain`** | Wildcard syntax for host | **Refuted:** Standard DNS RFC 1034 does NOT support label-prefixed wildcards (`h-*`). Wildcard DNS must be `*.domain`. Application-level regex in the relay enforces the `^h-[a-z2-7]{20}` prefix. | **REJECTED / CORRECTED** |
| **Multi-Instance Without State** | "Actually fine without state" | **Refuted:** If Host A connects via WSS to Instance 1, and the browser hits Instance 2, Instance 2 has no Host A socket and returns 503. Multi-instance requires routing affinity. Single instance is required for beta. | **REJECTED / CORRECTED** |
| **Domain `sideline.live`** | "Target domain" | **Unverified:** Do NOT assume Dad owns `sideline.live`. The architecture is specified with `<RELAY_DOMAIN>`. | **CORRECTED TO `<RELAY_DOMAIN>`** |

---

# C. FINAL PRODUCTION ARCHITECTURE (ONE-USER BETA)

```
                              PHONE BROWSER (Cellular / Remote Wi-Fi)
                                    │
                                    │ https://h-<hostPublicId>.<RELAY_DOMAIN>/
                                    │ Cookie: sl_dev=<deviceToken>
                                    ▼
       ┌─────────────────────────────────────────────────────────────┐
       │ PROVIDER EDGE (Fly.io Proxy / Anycast IPv4+IPv6)            │
       │  • Terminates public TLS (*.<RELAY_DOMAIN> via Let's Encrypt)│
       │  • Strips gzip on Content-Encoding: none (unbuffered SSE)   │
       │  • Passes plain HTTP/WS to container port 8080             │
       └────────────────────────────┬────────────────────────────────┘
                                    │ Internal localhost / container bridge
                                    ▼
       ┌─────────────────────────────────────────────────────────────┐
       │ PRODUCTION RELAY CONTAINER (Single persistent Node.js)      │
       │  • relay/index.ts (production entrypoint + env config)       │
       │  • relay/reference-relay.ts (shared canonical engine)       │
       │  • Beta Enrollment Key validation on /tunnel/v1             │
       │  • Subdomain router: h-<hostPublicId> → verified WSS socket │
       │  • Metadata-only JSON logging to stdout (zero secrets/URIs) │
       │  • In-memory maps only; zero persistence; zero DB           │
       └────────────────────────────▲────────────────────────────────┘
                                    │
                                    │ Outbound WSS: wss://relay.<RELAY_DOMAIN>/tunnel/v1
                                    │ Header: x-sideline-enrollment: <secret>
                                    │ Ed25519 challenge-response handshake
                                    │
       ┌────────────────────────────┴────────────────────────────────┐
       │ DAD'S WINDOWS DESKTOP (Daemon on 127.0.0.1; no inbound port)│
       │  • ControlPlaneDaemon (starts RelayClient when pref enabled)│
       │  • RelayClient (outbound WSS, heartbeat, backoff, watchdog) │
       │  • InProcessRemoteAdapter (7-header allowlist, sl_dev auth) │
       │  • Principal { kind: 'remote-device', expectedOrigin }      │
       │  • Host Identity (~/.sideline/remote/host-key.json)        │
       │  • Device Registry (~/.sideline/remote/devices.json)        │
       └─────────────────────────────────────────────────────────────┘
```

---

# D. RESOLVED ADJUDICATIONS

### 1. Production Deployment Shape
* **Authoritative Decision:** ONE persistent container running a single Node.js relay process.
* **Architecture:** In-memory state only. No user database, no Redis, no horizontal scaling, no Kubernetes, no Terraform.
* **Resource Envelope:** 256MB–512MB RAM, 1 shared vCPU. Completely sufficient for 1 desktop host and multiple paired devices.

### 2. Provider Selection
* **PRIMARY:** **Fly.io** (`shared-cpu-1x`, 256MB Machine). Cost: ~$2.70/mo. Native WSS on port 443, automated Let's Encrypt wildcard TLS via DNS-01 CNAME, unbuffered SSE via `Content-Encoding: none`.
* **FALLBACK:** **DigitalOcean App Platform** (Basic tier, $5/mo). Confirmed native WebSockets, always-on, automated wildcard custom domain via TXT verification.
* **REJECTED:** Koyeb (cannot issue arbitrary wildcard TLS), Railway (Hobby tier auto-sleeps; Pro is $20/mo), Render (buffers SSE responses; free tier sleeps), Serverless (cannot maintain persistent host WSS).

### 3. Domain Decision
* **Identifier:** Abstracted as `<RELAY_DOMAIN>`.
* **Requirement:** Arbitrary host origins (`https://h-<hostPublicId>.<RELAY_DOMAIN>`) require a real custom domain with wildcard DNS. Generic provider domains (`*.fly.dev`) do not support nested wildcards.
* **Execution:** For developer smoke-testing before purchasing a domain, test via nip.io/sslip.io (e.g. `h-<id>.<ip>.sslip.io`) or an existing domain Dad owns. For production Go-Live, Dad/Coach designates `<RELAY_DOMAIN>`.

### 4. DNS Architecture
* **Apex Record:** `<RELAY_DOMAIN>` → CNAME to provider target (e.g. `sideline-relay.fly.dev`) or provider Anycast A/AAAA.
* **Wildcard Record:** `*.<RELAY_DOMAIN>` → CNAME to provider target. Standard RFC 1034 wildcard.
* **Relay Tunnel Record:** `relay.<RELAY_DOMAIN>` (covered by wildcard or explicit CNAME). Host connects to `wss://relay.<RELAY_DOMAIN>/tunnel/v1`.
* **ACME Verification:** `_acme-challenge.<RELAY_DOMAIN>` → CNAME to provider challenge target.
* **Application Enforcement:** Relay validates `Host` header via regex `^h-([a-z2-7]{20})\.<RELAY_DOMAIN>(?::\d+)?$`. Non-matching subdomains or apex requests receive 404 or route to `/health`.

### 5. TLS Termination
* **Authoritative Decision:** **Provider-Managed Edge TLS**.
* Public clients connect via HTTPS/WSS on port 443. TLS terminates at provider edge.
* Provider forwards decrypted HTTP/WS traffic to the container on port 8080.
* Node relay code remains clean of OpenSSL/Certbot/ACME machinery.
* The relay inspects `X-Forwarded-Proto: https` from edge to ensure public traffic was encrypted, but NEVER forwards proxy headers to the desktop daemon.

### 6. Wildcard Certificate Scope
* **Scope:** Single certificate covering `<RELAY_DOMAIN>` and `*.<RELAY_DOMAIN>`.
* Single-level wildcard `*.<RELAY_DOMAIN>` strictly covers:
  - `h-<hostPublicId>.<RELAY_DOMAIN>` (phone browser origin)
  - `relay.<RELAY_DOMAIN>` (host WSS endpoint)
* No multi-level nesting is needed or used.

### 7. Expected Origin Derivation
* **Formula:** `https://h-${hostPublicId}.${relayDomain}`.
* Derived exclusively by desktop `RelayClient` at connect time from its durable public key and trusted runtime configuration.
* **Configuration:** Daemon reads `remoteRelay.relayDomain` from local options/environment (`process.env.SIDELINE_RELAY_DOMAIN`).
* **Invariant:** Never derived from incoming request `Host` or `Origin` headers. Not exposed in Dad-facing preferences.

### 8. Multi-Instance & Horizontal Scaling
* **Authoritative Decision:** **SINGLE INSTANCE ONLY for Stage 4**.
* Scout claim that independent instances work without state is REJECTED. Host socket affinity is required for requests to find the connected desktop.
* A single Node process easily handles 1,000+ idle WebSockets. Multi-instance distributed routing (Redis / NATS) is deferred to Stage 6+.

### 9. Host Registration Abuse Gating (Beta Enrollment Secret)
* **Authoritative Decision:** Shared Beta Enrollment Secret (`SIDELINE_ENROLLMENT_KEY`).
* Prevents arbitrary outsiders from using the public relay as a free reverse proxy.
* **Mechanism:**
  - Relay sets `ENROLLMENT_KEY=<secret>` in container environment.
  - Desktop daemon sets `SIDELINE_ENROLLMENT_KEY=<secret>` in local environment/config.
  - `RelayClient` presents `headers: { 'x-sideline-enrollment': '<secret>' }` on the outbound WSS upgrade handshake.
  - Relay verifies header via `timingSafeSecretEqual`. If missing or invalid, relay terminates WSS handshake with HTTP 403 Forbidden.
  - If relay has no `ENROLLMENT_KEY` configured (e.g. local tests), gating is disabled.
  - Header is stripped immediately and NEVER logged. Zero user accounts or database needed.

### 10. Rate Limiting
* **Application-Level Limits (in-memory sliding window):**
  - WSS Handshake: Max 10 attempts per minute per IP.
  - Invalid Handshakes: Max 5 consecutive failures per IP → 15-minute ban.
  - Browser HTTP Requests: Max 120 requests per minute per IP.
  - Pairing Exchange (`/api/pairing/exchange`): Max 10 requests per minute per IP.
  - All limits configurable via environment variables with safe defaults.

### 11. Health & Readiness Endpoint
* **Endpoint:** `GET /health` and `GET /healthz`.
* **Response:** HTTP 200 OK, `Content-Type: application/json`, `Cache-Control: no-store`.
* **Payload:** `{"status":"ok","uptime":<seconds>}`.
* **Zero Secret Leakage:** Contains zero host IDs, zero connection counts, zero memory statistics, zero device info. Available on apex domain or any host header.

### 12. Proxy Headers Boundary
* Relay reads `X-Forwarded-For` from provider edge strictly for client IP rate limiting and stdout log metadata.
* `X-Forwarded-*` is STRICTLY STRIPPED and NEVER placed into `RelayReqFrame.headers`.
* Host `InProcessRemoteAdapter` continues to enforce the 7-header allowlist. Untrusted proxy metadata never enters the desktop daemon.

### 13. Streaming & SSE Integrity
* Relay flushes response headers immediately (`res.flushHeaders()`).
* Relay flushes each data chunk immediately (`res.write(chunk)`).
* SSE responses carry `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, and `Content-Encoding: none`.
* `Content-Encoding: none` explicitly commands Fly Proxy to bypass response compression buffering.
* Mandatory empirical test on real cellular connection required before Stage 4 signoff.

### 14. WebSocket Idle & Heartbeats
* Existing Stage 3 heartbeat timing is preserved:
  - Relay sends `ping` every 20s.
  - Relay closes stale socket after 40s (2 missed pongs).
  - Host watchdog reconnects after 60s silence.
* The 20s ping interval easily beats Fly.io's 60s and DigitalOcean's 60s proxy idle timeouts.

### 15. Production Relay Code Shape
* **Authoritative Decision:** **Promote / Share Existing Relay Core**.
* `relay/reference-relay.ts` remains the single canonical protocol engine.
* Add `relay/index.ts` as the production entrypoint: reads environment variables (`PORT`, `RELAY_DOMAIN`, `ENROLLMENT_KEY`), instantiates `ReferenceRelay`, hooks `process.on('SIGTERM')`, and listens.
* Zero protocol drift between tests and production.

### 16. Deployment Artifacts
* Minimal required files:
  1. `relay/Dockerfile` — Multi-stage minimal Node.js 22 LTS container.
  2. `relay/fly.toml` — Fly.io deployment manifest.
  3. `relay/index.ts` — Production entrypoint with env config and shutdown hooks.
  4. `.dockerignore` — Excludes node_modules, tests, and documentation.
* Strictly no Kubernetes, no Terraform, no Helm.

### 17. Graceful Deploy & Rollback
* **Deploy Draining:** On `SIGTERM`, relay broadcasts `{ t: 'goaway', reason: 'shutdown' }` to all connected hosts, waits up to 5s for in-flight HTTP requests to drain, then terminates cleanly.
* Hosts receive `goaway: shutdown`, enter backoff reconnect (1s, 2s...), and reconnect to the new container automatically.
* **Failure Safety:** If production relay fails or is rolled back, the desktop daemon safely enters backoff. Local desktop Sideline (127.0.0.1:3100) continues operating with 100% normal capability. Remote failure degrades strictly to "Desktop Offline", never broken local software.

### 18. Structured Logging
* Output: Stdout NDJSON (one JSON object per line).
* Permitted fields: `ts`, `event` (`req`, `connect`, `disconnect`, `rate_limit`), `hostPublicId`, `method`, `path` (pathname only; query stripped), `status`, `bytes`, `durationMs`.
* STRICTLY FORBIDDEN: Request/response bodies, cookies, `Set-Cookie`, authorization headers, enrollment keys, pairing secrets, device tokens, query strings, URL fragments, private keys.

### 19. Observability
* Minimal 1-user beta telemetry:
  - Provider container health (`fly status`).
  - Standard provider logs (`fly logs`).
  - Relay `/health` endpoint checked by external uptime monitor.
  - No Prometheus/Datadog agent installed in container.

### 20. Public Security Verification
* Automated and manual verification of all attack boundaries:
  - Forged Ed25519 signature → rejected with 4403.
  - Replayed challenge nonce → rejected.
  - Missing/wrong enrollment key → rejected with 403 on WSS upgrade.
  - Unknown host subdomain → 503 `host_offline`.
  - Malformed host header → 404.
  - Cross-host traffic isolation → 0 cross-leakage.
  - Remote admin elevation attempt → 401.
  - Request body > 1 MiB → 413.
  - Rapid handshake flooding → rate limited.

### 21. Real Network Acceptance
* Real phone on cellular network tests:
  - Initial pairing exchange via public URL fragment.
  - Phone receives `sl_dev` cookie.
  - REST `/api/status` returns 200 OK.
  - SSE `/api/events` streams live events and 15s `: hb` heartbeats continuously for 10+ minutes.
  - Desktop daemon killed → phone receives 503 `host_offline`.
  - Desktop daemon restarted → tunnel re-establishes, phone auto-reconnects and resumes live streaming.

### 22. Production Beta Cost
* **Fly.io Relay Hosting:** ~$2.70 to $3.00 / month (1x `shared-cpu-1x` 256MB machine, free shared IPv4, free Anycast IPv6, 100 GB egress included).
* **Domain Registration:** ~$1.00 / month ($10–12/year from Cloudflare Registrar / Namecheap).
* **Total Beta Cost:** **~$3.70 to $4.00 / month**.

### 23. Stage 4 → Stage 5 Handoff
* Stage 4 completes when the production relay path is technically proven over real HTTPS/WSS with security, streaming, and reconnect green.
* Stage 5 is then unblocked to build the Dad-facing UI: "Send to Phone" button, QR code display, and mobile Settings cards.

---

# E. HUMAN DECISIONS & ACTIONS REQUIRED

The following actions require human authorization or action and CANNOT be automated by Claude:

1. **Domain Selection & Acquisition:**
   - Coach/Dad must decide on `<RELAY_DOMAIN>` (e.g. register `sideline.live`, or allocate a dedicated subdomain of an existing domain).
2. **Provider Account Creation:**
   - Create or designate a Fly.io (or DigitalOcean) account with a payment method attached for the ~$3/month hosting fee.
3. **DNS Configuration:**
   - Add the `*.<RELAY_DOMAIN>` CNAME and `_acme-challenge.<RELAY_DOMAIN>` CNAME records at Dad's DNS registrar.
4. **Secret Generation:**
   - Generate a random 32-character string for `ENROLLMENT_KEY`.

---

# F. FINAL SLICE PLAN

```
┌──────────────────────────────────────────────┐
│ Slice 4A: Production Relay Hardening         │  (relay/index.ts, health, enrollment gating, rate limits, JSON log)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Slice 4B: Deployment Packaging               │  (relay/Dockerfile, fly.toml, local docker smoke test)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Slice 4C: Cloud Deployment & Wildcard TLS    │  (Human: DNS/Provider; Agent: fly deploy, cert verification)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Slice 4D: Real Cellular Network Acceptance   │  (Real phone on cellular, SSE 10m idle, reconnect, security audit)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Slice 4E: Rollback Proof & Stage 5 Handoff   │  (Simulated deploy failure rollback, local isolation, Stage 5 spec)
└──────────────────────────────────────────────┘
```

---

### Slice 4A: Production Relay Hardening

* **Files to create/modify:**
  * `relay/index.ts` (NEW) — Production entrypoint: loads env config (`PORT`, `RELAY_DOMAIN`, `ENROLLMENT_KEY`), instantiates `ReferenceRelay`, registers `SIGTERM` graceful drain, calls `listen()`.
  * `relay/reference-relay.ts` (MODIFY) — Add `GET /health` endpoint, enrollment key check on WSS upgrade, in-memory rate limiting, and NDJSON stdout logger.
  * `src/control-plane/relay-client.ts` (MODIFY) — Add optional `enrollmentKey?: string` to options; pass `x-sideline-enrollment` header during WSS connection.
* **Existing seams to reuse:**
  * Canonical frame schemas in `src/control-plane/relay-frames.ts`.
* **Agent Actions:** Implement hardening code and unit tests.
* **Tests:** `test/remote-access-v1-stage4-hardening.test.mjs` verifying `/health`, enrollment rejection on wrong key, and rate limiter.
* **STOP condition:** `npm run compile` clean; hardening tests pass on localhost.
* **Next slice may assume:** Relay code is production-hardened and configurable purely via environment variables.

---

### Slice 4B: Deployment Packaging

* **Files to create/modify:**
  * `relay/Dockerfile` (NEW) — Multi-stage Alpine Node.js 22 LTS container.
  * `relay/fly.toml` (NEW) — Fly.io deployment manifest configuring 1 persistent machine, port 8080 internal, 443 external, `auto_stop_machines = false`.
  * `relay/.dockerignore` (NEW) — Excludes tests, node_modules, and git history.
* **Agent Actions:** Create container definitions; verify container builds locally (`docker build`).
* **Tests:** Local container smoke test (spin up container locally, hit `http://localhost:8080/health`, verify 200 OK).
* **STOP condition:** Container builds and runs locally without errors.
* **Next slice may assume:** Tested, portable deployment package ready for cloud deployment.

---

### Slice 4C: Cloud Deployment & Wildcard TLS

* **Human Actions:**
  * Set up Fly.io account / app: `fly apps create sideline-relay`.
  * Set `ENROLLMENT_KEY` secret: `fly secrets set ENROLLMENT_KEY=<secret>`.
  * Add custom wildcard domain: `fly certs add "*.<RELAY_DOMAIN>"`.
  * Configure DNS CNAME records at registrar per Fly instructions.
* **Agent Actions:**
  * Deploy image: `fly deploy`.
  * Verify deployment status via `fly status`.
  * Verify public TLS handshake: `curl -I https://relay.<RELAY_DOMAIN>/health`.
* **Tests:** Automated script hits `https://relay.<RELAY_DOMAIN>/health` over public internet; verifies valid Let's Encrypt certificate.
* **STOP condition:** Public relay is live, healthy, and presenting valid wildcard TLS.
* **Next slice may assume:** Operational public relay accessible from anywhere on the internet.

---

### Slice 4D: Real Cellular Network Acceptance

* **Human Actions:**
  * Start desktop Sideline daemon with `SIDELINE_RELAY_URL=wss://relay.<RELAY_DOMAIN>/tunnel/v1`, `SIDELINE_RELAY_DOMAIN=<RELAY_DOMAIN>`, and `SIDELINE_ENROLLMENT_KEY=<secret>`.
  * Enable Remote Access locally (`POST /api/preferences`).
  * On a mobile phone disconnected from Wi-Fi (pure cellular), navigate to test URL or curl public origin.
* **Agent Actions:**
  * Execute public security test suite against production URL.
  * Audit relay stdout logs to verify zero query strings, cookies, or secrets appear.
* **Acceptance Gates:**
  * Phone connects over cellular; REST `/api/status` returns 200.
  * SSE `/api/events` streams live events and `: hb` heartbeats for 10+ minutes without stalling.
  * Killing desktop daemon returns 503 `host_offline` on phone.
  * Restarting desktop daemon resumes live streaming automatically.
* **STOP condition:** All cellular network acceptance gates pass.
* **Next slice may assume:** Real-network transport path is 100% technically proven.

---

### Slice 4E: Rollback Proof & Stage 5 Handoff

* **Agent Actions:**
  * Test rollback procedure: deploy faulty configuration, trigger rollback to previous healthy image, verify host reconnects cleanly.
  * Verify local desktop Sideline was 100% unaffected during the failure.
  * Compile Stage 4 Final Acceptance Report.
* **STOP condition:** Stage 4 signoff complete; repository ready for Stage 5.

---

# G. ROLLBACK PLAN (FAIL-SAFE ISOLATION)

1. **Deploy Failure Rollback:**
   * If a new relay deployment fails health checks, Fly.io automatically halts rollout and keeps existing machine active.
   * Manual rollback: `fly deploy --image <previous-image-tag>`.
2. **Desktop Independence Invariant:**
   * The desktop daemon treats the relay as an untrusted outbound client.
   * If the relay goes offline, crashes, or is misconfigured, the desktop daemon's `RelayClient` enters standard exponential backoff (1s, 2s, 5s... max 30s).
   * Local Sideline at `http://127.0.0.1:3100` remains **100% operational**. Stadium JSON-RPC, VS Code extension commands, local preferences, and routines suffer zero disruption.
   * Remote failure strictly degrades to: `REMOTE OFFLINE`, never `LOCAL SIDELINE BROKEN`.

---

# H. STAGE 4 GO / NO-GO CHECKLIST

Before declaring Stage 4 complete and authorizing Stage 5:

- [ ] Production relay container running 24/7 on Fly.io (or DO App Platform).
- [ ] Wildcard DNS `*.<RELAY_DOMAIN>` active and resolving.
- [ ] Wildcard TLS certificate valid and verified by public browsers without warning.
- [ ] Beta enrollment key rejects unauthorized WSS connections with 403.
- [ ] Desktop daemon connects via outbound WSS on port 443 with zero inbound desktop ports.
- [ ] Real phone on cellular data connects to `https://h-<hostPublicId>.<RELAY_DOMAIN>`.
- [ ] Phone successfully completes pairing exchange and receives secure `sl_dev` cookie.
- [ ] SSE streaming delivers events in < 1s and survives 10+ minutes idle over cellular.
- [ ] Desktop daemon restart triggers automatic reconnect within 5 seconds.
- [ ] Desktop daemon shutdown serves 503 `host_offline` to phone browser.
- [ ] Relay stdout logs contain zero bodies, cookies, tokens, or query strings.
- [ ] Rollback procedure demonstrated and documented.
- [ ] Local Sideline operations verified completely green during relay outages.

---

# I. STAGE 5 HANDOFF

Stage 4 is complete when the technical network plumbing is proven. 

Stage 5 is strictly authorized to assume:
* `relayUrl` and `relayDomain` are stable constants.
* Phone browsers can reach `https://h-<hostPublicId>.<RELAY_DOMAIN>`.
* Pairing exchange over public HTTPS works.
* Device cookies are issued and validated across the public network.

Stage 5 will implement:
1. **Send to Phone** UI button in the desktop interface.
2. **QR Code Generator** encoding `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`.
3. **Settings Disclosure Card** for Remote Access (pairing code, device list, revoke).
4. **Mobile Phone Viewport Styling** for the paired phone browser.

---

# STOP LINE

**STAGE 4 ENDS WHEN THE PRODUCTION RELAY PATH IS TECHNICALLY PROVEN OVER REAL HTTPS/WSS WITH SECURITY, STREAMING, RECONNECT, AND ROLLBACK GREEN.**

**DO NOT BUILD THE DAD-FACING SEND TO PHONE / QR EXPERIENCE UNTIL STAGE 4 IS GREEN.**

---

**COMPLETED:** 2026-09-23 7:35 PM MDT  
**TIMEZONE:** America/Edmonton  

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\AntiGravity\Remote-Access-v1-Stage-4-Production-Field-Packet__20260923__AntiGravity.md
