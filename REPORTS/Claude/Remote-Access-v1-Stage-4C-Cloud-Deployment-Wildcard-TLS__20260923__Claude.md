**COMPLETED:** 2026-09-23 9:45 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 4C · Cloud Deployment & Wildcard TLS

# VERDICT: `4C GREEN FOR 4D`

All 4C acceptance gates passed against the real production relay. No commit, no push, no Stage 4D, no Stage 5. The enrollment secret is not in this report.

## Fly app and Machine
- **App:** `mysidelinecoach-relay` (personal org), `mysidelinecoach-relay.fly.dev`.
- **Machine:** exactly one, `d8d2e5ec975128`, `shared-cpu-1x` / 256 MB, region `sjc` (`sea` is deprecated on Fly), always-running, `TRUST_PROXY=false`, health check `GET /health` passing, single instance (`--ha=false`).
- `relay/fly.toml` now has the real app name and `primary_region = "sjc"`; `fly config validate` → valid. Secrets `ENROLLMENT_KEY` and `RELAY_DOMAIN` live only in Fly (status Deployed).

## Container verification (the 4B gap is closed)
Fly remote Docker build, repo-root context, `relay/Dockerfile` on Node 22: **succeeded, image 67 MB**. The container is running; the relay process runs as **uid 1000 (`node`)**, non-root (checked inside the Machine). Public `/health` returned `200`, `application/json`, `no-store`, `{"status":"ok","uptime":N}`.

## Domain / DNS / TLS
- `RELAY_DOMAIN=remote.mysidelinecoach.com`; tunnel `wss://relay.remote.mysidelinecoach.com/tunnel/v1`; host origins `https://h-<hostPublicId>.remote.mysidelinecoach.com`.
- **DNS records Dad saved** (record types/names only): `A` + `AAAA` for `relay.remote`; `A` + `AAAA` for `*.remote`; `CNAME` `_acme-challenge.remote` → Fly's `flydns.net` validation target. Resolution confirmed for both `relay.remote…` and an arbitrary `h-<id>.remote…` name.
- **Certificates:** both `relay.remote.mysidelinecoach.com` and `*.remote.mysidelinecoach.com` are **Issued / verified and active** (Let's Encrypt, RSA + ECDSA, expiry 2026-12-23). A TLS client (Node, system trust store, no overrides) validated the chain for the relay host and for `h-abcdefghijklmnopqrst.remote…` (SAN `*.remote.mysidelinecoach.com`, TLS 1.3, `authorized: true`).
- `https://relay.remote.mysidelinecoach.com/health` → `200`.

## WSS and enrollment gate (production)
`wss://relay.remote.mysidelinecoach.com/tunnel/v1`: no key → `403`; wrong key → `403`; correct key → `101` + `challenge` (32-byte nonce). The gate applies only to host registration.

## Real production host connection
The real Windows `daemon.js` process was started with the private-beta bootstrap env (`SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, `SIDELINE_ENROLLMENT_KEY`) in a **temporary directory** (not Dad's `~/.sideline`, so a throwaway host identity `bvb6xrfog3gx2xcmexel` was used) and Remote Access was enabled through the local preference. Desktop → outbound WSS 443 → Fly → challenge → Ed25519 hello → verified: the public host origin went from 503 to serving in **≈0.55 s**. No inbound port, Tailscale, port forwarding or networking setup.

## Browser-shaped requests via the public host origin
- No credential → `401`; pairing exchange (secret-gated) → `200` with `sl_dev` cookie; `/api/status` with cookie → `200`, success body, sliding `Max-Age=2592000` cookie.
- `/api/devices` (local-only) → `403`; admin Bearer alone → `401`; `?token=` → `401`.
- Mutations: no `X-Sideline-Action` → `403`; foreign Origin → `403`; trusted Origin + action header → reaches routing (`404` for the fake queue item).
- Unknown but well-formed host → established `503 host_offline`; malformed host (`h-short`) → `404`; non-`h-` host → `404`.

## SSE precheck (production, through the Fly edge)
`/api/events`: `200 text/event-stream`, headers in **110 ms**; `hello`, `status`, `ai-health`, `execution` all delivered (initial burst at ~117 ms); a later broadcast triggered from the local daemon arrived **62 ms** after being sent while the stream was still open; the 15 s `: hb` crossed Fly (**13.2 s** after the preceding step, i.e. on the 15 s cadence). **No buffering observed.** (Full 10+ minute cellular acceptance remains 4D.)

## Controlled restart / reconnect
`fly machine restart` while the daemon, an open SSE stream and a local poller were live. Fly log sequence: signal → `shutdown: draining` → (the open SSE request held the drain for the full 5 s bound, then was cut) → `shutdown: closed` → clean exit 0 → new Machine boot → `listening` → **`connect` for the same hostPublicId ≈1.4 s later (fresh challenge/hello)** → public `/api/status` with the device cookie served `200` again (≈18.5 s total including the 10 s Fly restart command). The desktop RelayClient reconnected on its own; the local daemon returned `200` on all 17 polls throughout. The relay's `disconnect` event was logged on disabling.
Note: `fly machine restart` sends **SIGINT** (relay handles SIGINT and SIGTERM identically); deploys use the configured SIGTERM.

## Log audit (Fly logs after production traffic)
Latest 100 log lines audited (Fly's retention window for `fly logs --no-tail`): zero matches for the enrollment secret (checked against the real value), `sl_dev`, `token=`, `Bearer`, `authorization`, `cookie`, `secret`, `query`. No `?`/query strings in request records. Only metadata fields appear: `ts, event, hostPublicId, method, path, status, bytes, durationMs, scope, client, code, phase, port, relayDomain, enrollment, trustProxy, signal`. Event types seen: `listening, connect, disconnect, enrollment_rejected, rate_limit, req, shutdown, signal`. The daemon's own output also contained neither the key nor the device cookie.

## Local tests
- `npm run compile`: clean.
- `remote-access-v1-stage4c-bootstrap` (3) + `remote-access-v1-stage4-hardening` (13) + `remote-access-v1-stage3` (48) run together: **64 tests, 64 pass, 0 fail, 0 skipped** (re-run after the deploy; earlier 4C-only run: bootstrap 3/3; Stage 1+2: 40 tests, 39 pass, 0 fail, 1 expected Windows skip).

## Human actions performed
Dad: created Fly account/payment method, installed Fly CLI and signed in, saved the DNS records at the registrar.

## Costs / resources created
1 Fly app; 1 shared-cpu-1x/256 MB Machine (the billable item); Fly-allocated shared IPv4 (free) and dedicated IPv6; 2 certificates (relay + wildcard). No dedicated IPv4, no volumes, no extra machines. Exact charges are visible in Fly billing.

## Findings / breadcrumbs for 4D+
1. **Coarse rate limiting is real in production.** With `TRUST_PROXY=false` every visitor shares one limiter identity (the Fly edge peer). My own polling exceeded 120 HTTP requests/min and produced 40 `rate_limit` events. Fine for a one-user beta, but a phone loading a page with many assets could brush the limit. 4D should either raise `RATE_HTTP_PER_MIN` for the beta or empirically determine what Fly puts in client-IP headers and enable an explicit trusted resolver. Do not guess.
2. **Enrollment key handling:** the production secret exists only in Fly (unreadable) — the temporary local copy used for testing was **deleted**. The operator desktop therefore needs a new value before 4D: generate a new 256-bit key, `fly secrets set` it (redeploys), and supply it to the daemon environment without persisting it. Bootstrap variable names are unchanged.
3. **Bootstrap is env-only.** `SIDELINE_RELAY_URL/DOMAIN/ENROLLMENT_KEY` must be present in the environment of the process that launches the real daemon (the extension-spawned Stadium daemon). Internal plumbing only; never Dad-facing.
4. **Shared beta secret:** acceptable only for this private one-user beta; before public distribution replace it with a per-installation / server-authorized enrollment that preserves zero-setup.
5. Fly log retention limits audits to the most recent lines; 4D should tail during the run.
6. The relay's 5 s drain is consumed in full by an open SSE stream; harmless, but deploys with connected phones will always take ~5 s.
7. Consider pinning the Node base image by digest now that a build succeeded.

## Dad zero-setup invariant
Fly, DNS, TLS, certificates, relay URL, ports, Docker, enrollment secret and environment variables were all operator work. Dad's eventual flow stays: Enable Sideline Coach → Run Plays → Send to Phone → Connect.

**COMPLETED:** 2026-09-23 9:45 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-4C-Cloud-Deployment-Wildcard-TLS__20260923__Claude.md
