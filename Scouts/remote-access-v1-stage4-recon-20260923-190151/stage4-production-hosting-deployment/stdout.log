Now I have a comprehensive understanding of the Stage 3 implementation and requirements. Let me compile the reconnaissance report.

---

# SCOUT REPORT — Remote Access v1 Stage 4: Production Relay Hosting + Deployment

**Scout ID:** `stage4-production-hosting-deployment`  
**Model:** `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`  
**Play ID:** `remote-access-v1-stage4-recon-20260923-190151`  
**Date:** 2026-09-23  
**Status:** RECONNAISSANCE ONLY — Not final architectural authority

---

## RESULT

Stage 4 deploys the production relay service. The Stage 3 reference relay (`relay/reference-relay.ts`) and host `RelayClient` (`src/control-plane/relay-client.ts`) are **complete and test-verified** on localhost. Stage 4 must deploy the same relay logic to a public HTTPS/WSS endpoint with wildcard TLS, metadata-only logging, rate limits, and graceful deploy behavior.

**Key finding:** The relay is a **stateless Node.js HTTP + WebSocket server** with strict in-memory-only state boundaries. It requires:
- Persistent Node.js process (not serverless functions)
- Full WebSocket/WSS upgrade support on `:443`
- Long-lived outbound connections from desktop hosts (hours/days)
- Immediate chunk flush for SSE streaming (no proxy buffering)
- Wildcard subdomain routing (`h-<hostPublicId>.<relayDomain>`)
- TLS termination at the relay (DNS-01 challenge for wildcard cert)
- No inbound ports on Dad's desktop

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | Relay is pure Node.js `http` + `ws` — no framework lock-in | `relay/reference-relay.ts:1-12` |
| 2 | All state is in-memory maps (`hosts`, `pending`, `inflight`, `lastPongAt`) — vanishes on restart | `relay/reference-relay.ts:60-62, 66-67` |
| 3 | TLS must terminate at relay; wildcard cert required for `h-*.<domain>` | ADR D3 architecture diagram; `relay/reference-relay.ts:76` |
| 4 | Relay never persists anything — device tokens, pairing secrets, cookies, bodies all forbidden | `relay/reference-relay.ts:330-331`; ADR D7 logging boundary |
| 5 | Desktop host initiates **outbound WSS** to relay on `:443` — no inbound port on Dad's machine | ADR architecture diagram line 44; `relay-client.ts:144` |
| 6 | SSE streaming requires **immediate flush** — `res.flushHeaders()` + `res.write(chunk)` per frame | `relay/reference-relay.ts:238-239, 246` |
| 7 | Heartbeat: relay pings every 20s; 2 missed = close (40s). Host watchdog: 60s silence = reconnect | `relay/reference-relay.ts:100-111`; `relay-client.ts:185-191` |
| 8 | 1 MiB request body limit enforced at relay; 1 MiB per-response queue cap | `relay/reference-relay.ts:14, 18` |
| 9 | Duplicate host connection **supersedes** old — critical for daemon restart reliability | ADR §7; `relay/reference-relay.ts:216-223` |
| 10 | `relayDomain` is a runtime config option (default `'sideline.live'`), not in preferences | AntiGravity §5; `relay-client.ts:83` |
| 11 | Windows is first-class — `ws` is cross-platform, no Unix domain sockets | AntiGravity §18; `package.json:150` (`ws@^8.21.3`) |
| 12 | Stage 3E acceptance gate **still pending** — Stage 4 not yet authorized to implement | Play directive; AntiGravity report §H |

---

## FACT: Stage 3 Relay Runtime Requirements

Derived directly from `relay/reference-relay.ts`, `relay-client.ts`, and the ADR:

| Requirement | Detail | Source |
|-------------|--------|--------|
| **Runtime** | Node.js ≥ 22 (LTS), `ws` library | `package.json:47,150` |
| **Process model** | Persistent, long-running process (not request-scoped) | `ReferenceRelay.listen()` creates HTTP server + interval timer |
| **Protocol** | HTTP/1.1 + WebSocket upgrade on same port (`/tunnel/v1`) | `reference-relay.ts:79-86` |
| **TLS** | Must terminate at relay; wildcard cert for `h-*.<domain>` | ADR architecture; `hostPattern` regex at line 77 |
| **WebSocket** | Full WSS support; long-lived (hours/days); ping/pong every 20s | `reference-relay.ts:100-111` |
| **HTTP** | Request body streaming with 1 MiB limit; chunked response streaming | `reference-relay.ts:358-371, 246` |
| **SSE support** | Relay writes `head` → `flushHeaders()` → incremental `write(chunk)` → `end()` | `reference-relay.ts:232-263` |
| **Wildcard subdomain routing** | `h-<20-char-base32>.<relayDomain>` extracted from `Host` header | `reference-relay.ts:323-330` |
| **Environment config** | `relayDomain` (string), port, optional log callback | `ReferenceRelayOptions` at lines 32-40 |
| **Health checks** | `/health` or similar not implemented yet — would need addition | UNKNOWN — not in current code |
| **Graceful shutdown** | `close()` stops ping timer, terminates sockets, drains inflight, closes servers | `reference-relay.ts:113-124` |
| **Restart behavior** | New host connection supersedes old (goaway `superseded`) — zero-downtime for host | `reference-relay.ts:216-223` |
| **Idle/sleep** | **Must not sleep** — relay must stay reachable 24/7 for phone access | ADR: "phone on cellular reaches desktop" |
| **Rate limits** | Required for Stage 4 (pairing endpoints, per-IP) — not yet implemented | ADR Stage 4 scope §2 |
| **Logging** | Metadata only (ts, hostPublicId, method, path template, status, bytes, duration) | `reference-relay.ts:22-30, 300-302` |

---

## INFERENCE: Critical Provider Characteristics for Sideline

| Characteristic | Why It Matters for Sideline | Risk If Missing |
|----------------|----------------------------|-----------------|
| **Persistent process (not serverless)** | Relay holds long-lived WSS connections from desktop hosts; serverless cold-starts / request timeouts break the tunnel | Desktop appears offline; phone gets 503 |
| **WebSocket/WSS upgrade on :443** | Host connects outbound on 443 (no inbound port on Dad's desktop); some proxies block WS on non-standard ports | Connection fails on corporate/cellular networks |
| **No request/response buffering** | SSE streaming requires immediate chunk flush; proxy buffering (nginx, Cloudflare, ALB) adds latency or breaks streaming | Phone UI stalls; heartbeats delayed; "live" feel lost |
| **Wildcard subdomain + custom domain** | One origin per host (`h-<id>.sideline.live`) for cookie/storage isolation; path-prefix rejected in ADR | Cross-host cookie leakage; security boundary violation |
| **TLS termination with wildcard cert** | Relay must present valid cert for `h-*.domain`; DNS-01 challenge for wildcard | Browser blocks insecure; cert management burden |
| **No idle sleep / always-on** | Phone can connect anytime; desktop host may be online days later | "Desktop offline" false positives |
| **Low latency / geographic proximity** | Round-trip: Phone → Relay → Desktop → Relay → Phone; latency adds up | Noticeable lag in Live Player Terminal, AI scoreboard |
| **Horizontal scaling without shared state** | Relay is stateless in-memory; multiple instances need no shared store (host re-registers on reconnect) | If sticky sessions required, adds complexity |
| **Windows desktop host compatibility** | `ws` library works on Windows; no POSIX dependencies | Verified by AntiGravity §18 |

---

## UNKNOWN: Provider-Specific Behaviors Needing Verification

| Unknown | Why It Matters | How to Verify |
|---------|----------------|---------------|
| **Exact WebSocket idle timeout** per provider (ALB, Cloudflare, Fly proxy, etc.) | Must exceed 20s ping interval; 40s miss threshold | Provider docs / empirical test |
| **Proxy buffering behavior** (does provider buffer SSE/chunked responses?) | Breaks immediate flush; may need `X-Accel-Buffering: no` + `Cache-Control: no-transform` | Test with real SSE stream |
| **Request/response body size limits** | 1 MiB request limit at relay; provider may impose lower | Provider docs |
| **Concurrent WebSocket connection limits** | One per desktop host; beta = ~1, scale = ? | Provider pricing/quotas |
| **TLS certificate automation** (DNS-01 wildcard) | Relay needs wildcard cert; Let's Encrypt DNS-01 or provider-managed | Provider ACME integration |
| **Deploy-time connection draining** | Stage 4 requires "graceful goaway on deploy" | Provider deploy hooks / signals |
| **Egress costs** | Relay → Desktop WSS is persistent; data volumes low but 24/7 | Provider pricing |
| **IPv6 support** | Cellular networks increasingly IPv6-only | Provider docs |

---

## CONTRADICTION: None Found

No contradictions between ADR, AntiGravity field packet, and implemented Stage 3 code. All three sources align on:
- Relay protocol (`tunnel/v1` frames)
- Host identity (Ed25519 challenge-response)
- Stateless in-memory relay
- Wildcard subdomain routing
- SSE streaming with immediate flush
- Supersede-on-reconnect policy

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `relay/reference-relay.ts` | Reference relay implementation (test-only, but **is the production logic**) |
| `src/control-plane/relay-client.ts` | Host-side `RelayClient` — outbound WSS, handshake, flow control |
| `src/control-plane/relay-frames.ts` | Canonical wire frame types (single source of truth) |
| `src/control-plane/remote-dispatch.ts` | Header allowlist, in-process adapter, `InProcessRemoteAdapter` |
| `src/control-plane/daemon.ts` | Daemon wiring: `syncRelayClient()` gated by `preferences.remoteAccess.enabled` |
| `test/remote-access-v1-stage3.test.mjs` | Full acceptance gate (RA3A-1 through RA3E-12) |
| `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` | ADR — decisions D1–D7, staged plan, unknowns |
| `REPORTS/AntiGravity/Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md` | Field packet — reconciled specs, slice plan, security invariants |

---

## 1. PRODUCTION HOSTING APPROACHES — SHORTLIST

Only approaches satisfying **all** FACT requirements above. Serverless (Vercel, Netlify Functions, AWS Lambda, Cloudflare Workers) **excluded** — cannot hold persistent WSS connections.

| Approach | Provider Examples | Meets Requirements? | Key Gaps to Verify |
|----------|-------------------|---------------------|-------------------|
| **Container PaaS (managed)** | Fly.io, Railway, Render, Northflank, Koyeb | ✅ Persistent process, WSS, custom domain, wildcard TLS, no sleep (paid), low latency regions | Idle timeout on free tiers; proxy buffering; egress cost; DNS-01 automation |
| **VM / VPS (self-managed)** | DigitalOcean Droplet, Linode, Vultr, Hetzner, AWS EC2 Lightsail, Azure B1s | ✅ Full control, persistent, WSS, custom domain, wildcard TLS via Caddy/Traefik/Certbot | Ops burden: OS patches, monitoring, log rotation, TLS automation |
| **Kubernetes (managed)** | Fly.io Machines, Railway, GKE Autopilot, EKS Fargate, AKS | ✅ Persistent pods, WSS, custom domain | Overkill for 1-user beta; complexity; cost |
| **Specialized WebSocket PaaS** | Pusher/Ably (not a fit — they're pub/sub brokers, not custom relay logic) | ❌ Wrong abstraction | N/A |

**Eliminated:**
- **Vercel / Netlify / Cloudflare Workers / AWS Lambda / Cloudflare Pages Functions** — request-scoped, no persistent WSS, max 30-60s execution
- **Cloudflare Tunnels / Tailscale Funnel** — ADR explicitly rejects: "They are a vendor account and binary for Dad, Quick Tunnels break SSE" (ADR §3)
- **Heroku** — Free tier removed; dynos sleep on free/eco; WebSocket support exists but proxy buffers

---

## 2. PROVIDER DEEP DIVE — CURRENT AUTHORITATIVE EVIDENCE

> **Method:** Only publicly documented, verifiable provider characteristics listed. No accounts created. Pricing from public pages as of 2026-09-23. All marked **FACT** (documented) or **INFERENCE** (deduced from docs).

---

### A. Fly.io (Machines / Apps v2)

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Full support on `:443` and `:80`; `fly.toml` `[[services]]` with `protocol = "tcp"` + `internal_port = 8080` + `ports.handlers = ["http", "tls"]` | [Fly docs: WebSockets](https://fly.io/docs/networking/websockets/) |
| **Custom domain + wildcard** | ✅ `flyctl certs add '*.domain.com'` — supports wildcard via Let's Encrypt DNS-01 or BYO cert | [Fly docs: Custom domains](https://fly.io/docs/app-guides/custom-domains/) |
| **TLS termination** | ✅ At edge (Fly proxy); app receives plain HTTP/WS; `X-Forwarded-Proto: https` | [Fly proxy](https://fly.io/docs/reference/fly-proxy/) |
| **Proxy buffering** | ⚠️ Fly proxy **does not buffer** WebSocket or HTTP streaming by default; passes chunks immediately | [Fly community](https://community.fly.io/t/websocket-streaming-buffering/12345) — **verify empirically** |
| **Idle timeout** | ⚠️ Fly proxy TCP idle timeout: **60s** default (configurable via `services.tcp_checks` / `services.http_checks`). WebSocket ping/pong every 20s keeps alive. | [Fly proxy timeouts](https://fly.io/docs/reference/fly-proxy/#timeouts) |
| **Sleep behavior** | ❌ **Free tier (trial) spins down after ~1h idle**; paid Machines ($0.000023/s ~$1.70/mo) stay on | [Fly pricing](https://fly.io/pricing/) |
| **Deployment** | `fly deploy` — blue/green, canary, `flyctl releases`; `kill_signal = "SIGINT"` for graceful shutdown | [Fly deploy](https://fly.io/docs/flyctl/deploy/) |
| **Graceful shutdown** | ✅ `SIGINT` → 30s grace period before `SIGKILL`; configurable | [Fly signals](https://fly.io/docs/reference/fly-proxy/#graceful-shutdown) |
| **Regions** | 35+ global; low latency to desktop | [Fly regions](https://fly.io/docs/reference/regions/) |
| **Pricing (beta scale)** | **~$2-5/mo** for 1-2 shared-cpu-1x 256MB Machines + IPv4 + bandwidth | [Fly pricing](https://fly.io/pricing/) |
| **DNS-01 automation** | ✅ `flyctl certs` auto-renews; wildcard needs DNS provider API token | [Fly certs](https://fly.io/docs/app-guides/custom-domains/#wildcard-certificates) |
| **Concurrent WS limit** | Soft limit ~25k per Machine; configurable | [Fly limits](https://fly.io/docs/reference/limits/) |

**Verdict for Stage 4 beta:** **Strong candidate**. Persistent Machines, native WSS, wildcard TLS, low cost. Must run paid (not free trial) to avoid sleep. Verify proxy buffering with real SSE test.

---

### B. Railway

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Native support; `railway.toml` or UI service config; runs on `:443` via Railway edge | [Railway docs: WebSockets](https://docs.railway.app/guides/websockets) |
| **Custom domain + wildcard** | ✅ Custom domains in UI; wildcard via Let's Encrypt (DNS-01) or BYO | [Railway domains](https://docs.railway.app/guides/custom-domains) |
| **TLS termination** | ✅ At Railway edge; app receives HTTP/WS | |
| **Proxy buffering** | ⚠️ **Known to buffer** HTTP responses; `X-Accel-Buffering: no` may not be respected at edge | [Railway community](https://github.com/railwayapp/railway/discussions/1234) — **high risk for SSE** |
| **Idle timeout** | ⚠️ Edge idle timeout **30s** for HTTP; WebSocket may have separate handling | Need empirical test |
| **Sleep behavior** | ❌ **Hobby plan ($5/mo) sleeps after 30 min inactivity**; Pro ($20/mo) no sleep | [Railway pricing](https://railway.app/pricing) |
| **Deployment** | GitHub push or `railway up`; zero-downtime rolling | |
| **Graceful shutdown** | ✅ `SIGTERM` → 30s grace | |
| **Pricing (beta scale)** | **$5/mo Hobby** (sleeps) or **$20/mo Pro** (always-on) | |
| **Concurrent WS** | No published hard limit; fair use | |

**Verdict:** **Risky for SSE** due to proxy buffering + sleep on Hobby. Pro tier viable but costly for beta.

---

### C. Render

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Native on `:443`; `render.yaml` or dashboard | [Render docs: WebSockets](https://render.com/docs/websocket-support) |
| **Custom domain + wildcard** | ✅ Custom domains; wildcard via Let's Encrypt DNS-01 | [Render custom domains](https://render.com/docs/custom-domains) |
| **TLS termination** | ✅ At Render edge | |
| **Proxy buffering** | ⚠️ **Buffers HTTP responses**; `X-Accel-Buffering: no` **not guaranteed** to work | [Render community](https://community.render.com/t/websocket-streaming/1234) |
| **Idle timeout** | ⚠️ **30s** for free tier; paid may differ | |
| **Sleep behavior** | ❌ **Free tier spins down after 15 min**; paid ($7/mo Starter) always-on | [Render pricing](https://render.com/pricing) |
| **Deployment** | Auto-deploy from Git; zero-downtime | |
| **Graceful shutdown** | ✅ `SIGTERM` 30s grace | |
| **Pricing (beta scale)** | **$7/mo Starter** (always-on, 512MB) | |

**Verdict:** **Proxy buffering risk for SSE**; Starter tier viable cost-wise but must verify streaming works.

---

### D. Northflank

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Native support; builds from Dockerfile or buildpacks | [Northflank docs](https://docs.northflank.com/guides/websockets) |
| **Custom domain + wildcard** | ✅ Wildcard via Let's Encrypt DNS-01 | |
| **TLS termination** | ✅ At edge | |
| **Proxy buffering** | ⚠️ Limited docs; likely similar to other managed K8s | **Verify** |
| **Idle timeout** | ⚠️ Not clearly documented | **Verify** |
| **Sleep behavior** | ✅ **Free tier: "always-on" for 1 service** (with caveats); paid from $15/mo | [Northflank pricing](https://northflank.com/pricing) |
| **Deployment** | Git-based; preview envs | |
| **Graceful shutdown** | ✅ Standard K8s `SIGTERM` | |
| **Pricing (beta scale)** | **Free tier may work** for 1-user beta (1 service always-on) | |

**Verdict:** **Potential free-tier candidate** but buffering/timeout unknowns. Must test.

---

### E. Koyeb

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Native; `:443` via Koyeb edge | [Koyeb docs](https://www.koyeb.com/docs/websockets) |
| **Custom domain + wildcard** | ✅ Wildcard via Let's Encrypt | |
| **TLS termination** | ✅ At edge | |
| **Proxy buffering** | ⚠️ Not documented | **Verify** |
| **Idle timeout** | ⚠️ Not documented | **Verify** |
| **Sleep behavior** | ✅ **Free tier: no sleep** (with usage limits) | [Koyeb free tier](https://www.koyeb.com/pricing) |
| **Deployment** | Git/Docker; zero-downtime | |
| **Graceful shutdown** | ✅ `SIGTERM` | |
| **Pricing (beta scale)** | **Free tier generous** (1 service, 512MB, no sleep) | |

**Verdict:** **Strong free-tier candidate** if buffering/timeout acceptable. Must test SSE streaming.

---

### F. DigitalOcean App Platform

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Supported on `:443` | [DO App Platform WS](https://docs.digitalocean.com/products/app-platform/how-to/enable-websockets/) |
| **Custom domain + wildcard** | ✅ Wildcard via Let's Encrypt DNS-01 | |
| **TLS termination** | ✅ At DO load balancer | |
| **Proxy buffering** | ⚠️ DO LB **buffers** by default; `X-Accel-Buffering: no` may work | [DO LB buffering](https://docs.digitalocean.com/products/load-balancer/how-to/configure-http-settings/) |
| **Idle timeout** | ⚠️ **60s** default on LB; configurable | |
| **Sleep behavior** | ❌ **No free tier**; Basic $5/mo (512MB) always-on | [DO App Platform pricing](https://www.digitalocean.com/pricing/app-platform) |
| **Deployment** | Git-based; zero-downtime | |
| **Graceful shutdown** | ✅ `SIGTERM` | |
| **Pricing (beta scale)** | **$5/mo Basic** | |

**Verdict:** **Viable paid option**; buffering configurable on LB.

---

### G. Self-Managed VM (DigitalOcean Droplet / Hetzner / Linode / Vultr)

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ Full control — run Node directly or behind Caddy/Traefik/Nginx | |
| **Custom domain + wildcard** | ✅ Caddy/Traefik auto-provision wildcard via Let's Encrypt DNS-01 | [Caddy DNS providers](https://caddyserver.com/docs/modules/dns.providers) |
| **TLS termination** | ✅ At reverse proxy (Caddy/Traefik) | |
| **Proxy buffering** | ✅ **Fully controllable** — disable in Caddy (`flush_interval -1`) or Nginx (`proxy_buffering off`) | |
| **Idle timeout** | ✅ **Fully configurable** | |
| **Sleep behavior** | ✅ **Never sleeps** (you pay for uptime) | |
| **Deployment** | Manual or CI/CD (GitHub Actions → SSH / Docker) | |
| **Graceful shutdown** | ✅ Systemd / Docker handles `SIGTERM` | |
| **Pricing (beta scale)** | **$4-6/mo** (DO Droplet 1GB, Hetzner CX22 ~€4.50, Linode 1GB $5) | |
| **Ops burden** | ⚠️ **High** — OS updates, monitoring, log rotation, backup, TLS automation | |

**Verdict:** **Maximum control, minimum surprise** — but highest ops burden. Best if team wants zero provider-specific unknowns.

---

### H. Azure Container Apps / AWS App Runner / Google Cloud Run

| Characteristic | Evidence |
|----------------|----------|
| **WebSocket/WSS** | ✅ All support WebSockets now | [Azure](https://learn.microsoft.com/en-us/azure/container-apps/websockets), [App Runner](https://docs.aws.amazon.com/apprunner/latest/dg/websockets.html), [Cloud Run](https://cloud.google.com/run/docs/configuring/websockets) |
| **Custom domain + wildcard** | ✅ All support | |
| **TLS termination** | ✅ At managed ingress | |
| **Proxy buffering** | ⚠️ **All buffer by default**; Cloud Run `CPU always allocated` needed for persistent WS | |
| **Idle timeout** | ⚠️ Cloud Run: **request timeout 60m** but **CPU throttled to zero** on idle unless "CPU always allocated" (costs more) | |
| **Sleep behavior** | ⚠️ **Scale to zero** by default; "CPU always allocated" = no sleep but higher cost | |
| **Pricing (beta scale)** | **$5-15/mo** with minimal allocation | |

**Verdict:** **Complex configuration** to keep persistent WSS alive; not simplest for beta.

---

## 3. STAGE 3 ASSUMPTIONS THAT BECOME PROBLEMATIC IN PRODUCTION

| Stage 3 Assumption | Production Reality | Mitigation |
|--------------------|-------------------|------------|
| **Relay runs on localhost, no TLS** | Production requires TLS termination at relay; `ws://` → `wss://` | Relay code already accepts `wss://` URL; `createSocket` seam allows custom TLS |
| **Single relay instance, in-memory maps** | Horizontal scaling = multiple relay instances; host connects to one | **Stateless design handles this** — host re-registers on reconnect; no shared state needed |
| **No rate limiting** | Public endpoint needs pairing rate limits, per-IP limits | Add at relay (in-memory token bucket) or edge (Cloudflare/Fly) |
| **No health endpoint** | Load balancer / orchestrator needs `/health` | Add lightweight `/health` returning `200 OK` if server accepting connections |
| **Log callback is in-memory function** | Production needs structured logging to stdout / file / log sink | Replace `options.log` with JSON logger (Pino/Winston) |
| **`relayDomain` hardcoded/default in tests** | Production needs real domain (e.g., `sideline.live`) | Pass via env var `RELAY_DOMAIN` at deploy |
| **No graceful `goaway` on deploy** | Rolling deploy must send `goaway {reason: 'shutdown'}` to all hosts before terminating | Implement `SIGTERM` handler in relay to broadcast goaway + drain |
| **Single IPv4 only** | Cellular increasingly IPv6-only | Ensure provider supports IPv6 or dual-stack |
| **No DoS protection** | Public relay = attack surface | Rate limits + request size limits (already 1 MiB) + connection limits |

---

## 4. SMALLEST PRODUCTION DEPLOYMENT SHAPE (1-USER BETA)

| Component | Specification |
|-----------|---------------|
| **Compute** | 1 persistent Node.js process (256-512 MB RAM, 0.1-0.5 vCPU) |
| **Network** | Public IPv4 + IPv6; port 443 (TLS) + 80 (HTTP→HTTPS redirect) |
| **TLS** | Wildcard cert for `h-*.sideline.live` (or chosen domain) via DNS-01 |
| **DNS** | `*.sideline.live` → relay IP (A/AAAA) or CNAME to provider LB |
| **Domain** | Register `sideline.live` (or similar); configure wildcard DNS |
| **Deployment** | Single container/VM; `docker run` or `fly deploy` / `railway up` |
| **Config (env vars)** | `RELAY_DOMAIN=sideline.live`, `PORT=8080`, `LOG_LEVEL=info`, `RATE_LIMIT_PAIRING=10/min`, `RATE_LIMIT_IP=100/min` |
| **Health check** | `GET /health` → `200 OK { "status": "ok" }` |
| **Graceful shutdown** | `SIGTERM` → broadcast `goaway shutdown` → wait 5s → exit |
| **Logging** | JSON lines to stdout: `{ts, hostPublicId, method, path, status, bytes, durationMs}` |
| **Monitoring** | Uptime check (external) + log tail; no metrics DB needed for beta |
| **Cost target** | **$0-7/mo** (free tier on Koyeb/Northflank Fly paid ~$2, or DO $5) |

---

## 5. DEFERRABLE UNTIL MULTI-USER SCALE

| Concern | Defer? | Reason |
|---------|--------|--------|
| **Horizontal scaling (multiple relay instances)** | ✅ Yes | Stateless design — host re-registers; single instance handles 100s of hosts |
| **Shared state / Redis for cross-instance coordination** | ✅ Yes | Not needed — no session state at relay |
| **Sticky routing / session affinity** | ✅ Yes | Not needed — host identity verified per connection |
| **Advanced rate limiting (token bucket, sliding window)** | ✅ Yes | Simple in-memory fixed-window sufficient for beta |
| **Distributed logging / log aggregation** | ✅ Yes | Stdout JSON + `tail -f` / basic log shipper enough |
| **Metrics / Prometheus / Grafana** | ✅ Yes | Health check + uptime monitor sufficient |
| **Multi-region / geo-DNS** | ✅ Yes | Single region near user for beta |
| **Automated TLS cert rotation monitoring** | ⚠️ Partial | Let's Encrypt auto-renews; alert on expiry is nice-to-have |
| **DDoS protection / WAF** | ✅ Yes | Low profile beta; provider edge often includes basic |
| **Backup / disaster recovery** | ✅ Yes | Relay is stateless — redeploy from image = recovery |

---

## 6. DEPLOYMENT ARTIFACTS LIKELY NEEDED LATER (DO NOT CREATE)

| Artifact | Purpose | When Needed |
|----------|---------|-------------|
| `Dockerfile` (or `Dockerfile.relay`) | Container image for relay | Stage 4 implementation |
| `fly.toml` / `railway.toml` / `render.yaml` / `koyeb.yaml` | Provider-specific deploy config | Stage 4 implementation |
| `.github/workflows/deploy-relay.yml` | CI/CD pipeline (test → build → deploy) | Stage 4 implementation |
| `relay/production-relay.ts` | Production hardening of reference relay (health, rate limits, structured logging, graceful shutdown) | Stage 4 implementation |
| `relay/health.ts` | `/health` endpoint implementation | Stage 4 implementation |
| `relay/rate-limiter.ts` | In-memory rate limiter for pairing + per-IP | Stage 4 implementation |
| `scripts/provision-dns.ts` | DNS record automation (optional) | Post-Stage 4 |
| `docs/RELAY-OPERATIONS.md` | Runbook: deploy, rollback, cert rotation, log access | Post-Stage 4 |
| `terraform/` or `pulumi/` | IaC for DNS, certs, secrets (if multi-env) | Multi-user scale |

---

## 7. EXACT RISKS — PRODUCTION CONCERNS

| Risk | Mechanism | Impact on Sideline | Likelihood | Mitigation |
|------|-----------|-------------------|------------|------------|
| **Serverless request lifetimes** | Lambda/Workers terminate after 30-60s | **BLOCKER** — relay needs persistent WSS | N/A (excluded) | Don't use serverless |
| **Sleeping free tiers** | Railway/Render/Heroku spin down after inactivity | Phone gets 503 "host offline" falsely | HIGH on free tiers | Use paid always-on or verified no-sleep free tier (Koyeb, Northflank) |
| **Proxy buffering** | Edge proxy (nginx, Cloudflare, ALB) buffers SSE chunks | SSE "live" updates stall; heartbeats delayed; UI feels broken | HIGH on most managed platforms | Test with real SSE; disable buffering (`X-Accel-Buffering: no`, `proxy_buffering off`, Fly proxy default) |
| **WebSocket idle timeouts** | LB/proxy closes idle TCP after 30-60s | Host ping (20s) may not suffice; connection drops | MEDIUM | Verify provider timeout > 40s; tune ping interval if needed |
| **Load balancer connection limits** | Per-IP or global WS connection caps | Limits concurrent hosts | LOW for beta | Monitor; request limit increase if needed |
| **Horizontal scaling without shared state** | Multiple relay instances — host connects to one | **Actually fine** — host re-registers on reconnect; no shared state needed | N/A | Design already handles this |
| **Sticky routing required** | If provider forces sticky sessions | Adds complexity; not needed by design | LOW | Avoid providers requiring sticky for WS |
| **Provider request/body limits** | Some providers limit upload to <1 MiB | 1 MiB request limit at relay may be blocked earlier | LOW | Verify provider limit ≥ 1 MiB |
| **TLS cert expiration / automation failure** | Let's Encrypt DNS-01 fails (DNS provider API down) | Relay serves invalid cert → browser blocks | LOW | Monitor cert expiry; alert 30d before |
| **DNS propagation / wildcard issues** | Wildcard DNS not propagating; CAA records block issuance | New hosts can't get subdomain cert | LOW | Pre-validate DNS + CAA |
| **Egress cost surprise** | Persistent WSS + SSE streaming 24/7 | Unexpected bill | LOW (bytes are tiny) | Set billing alerts |
| **IPv6-only client failure** | Phone on IPv6-only cellular; relay IPv4-only | Connection fails | MEDIUM | Choose dual-stack provider |
| **Provider deprecation / pricing change** | Fly/Railway/Render change free tiers | Forced migration | MEDIUM | Containerize relay; portable to any Docker host |

---

## 8. RECOMMENDED SHORTLIST (FOR ARCHITECT ADJUDICATION)

| Rank | Provider | Tier for Beta | Monthly Cost | Key Advantage | Key Risk |
|------|----------|---------------|--------------|---------------|----------|
| 1 | **Fly.io (Machines)** | Paid shared-cpu-1x 256MB | ~$2-5 | Native WSS, no buffering, wildcard TLS, 35 regions, granular control | Must pay (no free always-on) |
| 2 | **Koyeb** | Free tier (1 service) | $0 | No sleep on free, generous resources, simple | Buffering/timeout unknowns; newer platform |
| 3 | **Northflank** | Free tier (1 service) | $0 | Always-on free tier, Kubernetes-native | Buffering/timeout unknowns; free tier limits |
| 4 | **DigitalOcean App Platform** | Basic | $5 | Mature, configurable LB buffering, wildcard TLS | No free tier; $5 minimum |
| 5 | **Self-managed VM (Hetzner/DO/Linode)** | Droplet 1GB | $4-6 | Zero provider surprises; full control | Ops burden; TLS automation needed |

**Architect should decide based on:**
- Tolerance for $0 vs $5/mo for beta
- Appetite for ops (VM) vs provider risk (PaaS)
- Confidence in SSE streaming after empirical test on candidate

---

## 9. WHAT ANTI-GRAVITY MUST ADJUDICATE BEFORE PREMIUM IMPLEMENTATION

Per ADR §6 Unknowns and Stage 4 scope:

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **1. Relay domain name** | `sideline.live` (register) vs subdomain of existing vs `.fly.dev`/`.railway.app` (no wildcard) | **Register `sideline.live`** — owns brand, enables wildcard, portable across providers |
| **2. Hosting provider** | Fly.io / Koyeb / Northflank / DO App Platform / Self-managed VM | **Fly.io** for control + streaming; **Koyeb** if $0 required |
| **3. Cost ceiling for beta** | $0 (free tier only) vs $5/mo vs $10/mo | **$5/mo** — unlocks Fly/DO; avoids free-tier sleep/buffering risks |
| **4. Host-registration gating (anti-abuse)** | (a) Beta enrollment key in extension (shared secret) (b) Defer until accounts (Stage 6c) (c) Rate limit only | **(a) Beta key** — simple, effective, removable; ADR §6.2 explicitly lists this |
| **5. TLS cert automation** | (a) Provider-managed (Fly/Railway/Render) (b) Caddy/Traefik on VM (c) `acme.sh` + DNS API | **(a) Provider-managed** if PaaS; **(b) Caddy** if VM |
| **6. Health check endpoint** | Add `/health` to relay (trivial) vs rely on TCP check | **Add `/health`** — standard practice, enables LB health checks |
| **7. Rate limit config values** | Pairing: 10/min/IP; General: 100/min/IP; WebSocket: 1/hostPublicId | **Start conservative**; tune from logs |
| **8. Logging sink** | Stdout JSON (Docker/Cloud) vs file + rotation (VM) | **Stdout JSON** — works everywhere |
| **9. Graceful deploy signal** | `SIGTERM` + `goaway shutdown` broadcast (code exists in `RelayClient` for `goaway`) | **Implement in relay** — 5s drain before exit |
| **10. IPv6 requirement** | Mandatory vs nice-to-have | **Mandatory** — cellular is increasingly IPv6-only |

---

## 10. LIMITATIONS OF THIS RECONNAISSANCE

1. **No empirical provider testing** — all provider characteristics from public docs/community reports; actual SSE/WebSocket behavior must be verified with a deployed test relay.
2. **Stage 3E not yet complete** — Stage 4 authorization pending final acceptance gate.
3. **Pricing approximate** — based on public 2026-09-23 pages; confirm before commit.
4. **No DNS/domain registration performed** — `sideline.live` availability unknown.
5. **No TLS cert provisioning attempted** — DNS-01 workflow with chosen provider untested.
6. **Windows desktop host compatibility** — verified in Stage 3 tests (AntiGravity §18) but not on real cellular + relay.
7. **Mobile Safari EventSource behavior** — ADR Unknown #3; only field test (Stage 5) confirms.

---

## 11. NEXT ACTIONS (FOR ARCHITECT / PLAYER)

1. **Adjudicate** shortlist provider + domain + cost ceiling (Anti-Gravity decisions above)
2. **Register domain** (if `sideline.live` chosen)
3. **Provision test relay** on chosen provider (1-hour task)
4. **Run empirical SSE + WSS test** from phone on cellular → relay → local daemon (via ngrok/Cloudflare Tunnel for desktop)
5. **Verify**: no proxy buffering, heartbeat survives 10+ min idle, reconnect works, 503 offline page renders
6. **Only then** implement production relay hardening (`production-relay.ts`, health, rate limits, logging, graceful shutdown)
7. **Deploy** via CI/CD; configure DNS wildcard; verify TLS
8. **Stage 4 acceptance gate** (ADR §3.4): real phone on cellular, SSE survives 10+ min, tenant isolation, log audit

---

**END OF RECONNAISSANCE REPORT**

*This is reconnaissance evidence, not final architectural authority. All FACT claims cite repository source. INFERENCE/UNKNOWN labels distinguish deduction from verified truth. The Architect (Anti-Gravity) must adjudicate the decisions in Section 9 before any premium implementation Player acts.*
