**COMPLETED:** 2026-09-23 11:24 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 4E · Final Acceptance

# FINAL VERDICT: `STAGE 4 GO`

**STAGE 4 ENDS HERE.** Stage 5 was not started and its Scouts were not read. No commit, no push. This report contains no secrets, pairing codes, device tokens or raw public IPs.

## Files changed (4E)
- MOD `src/control-plane/daemon.ts` — idle-liveness lease + `exitProcess` test seam
- NEW `test/remote-access-v1-stage4e-idle-liveness.test.mjs` (6 tests)
- Fly: no config change; four new releases were created for the rollback proof (see below). Final state = the current 4D image.

## The defect and the fix
**Defect (found in 4D):** the daemon exits after 30 min idle when no Stadium/VS Code session is connected, and remote traffic never counted, so a paired phone could find `503 host_offline` after Dad had been away.
**Fix (existing seam `checkIdleTimeout`):** a `remoteAccessHoldsDaemon()` lease = `preferences.remoteAccess?.enabled === true`. The idle countdown now starts only when there is **no active Stadium session AND Remote Access is OFF**.

### Exact liveness semantics
- ON → no countdown, whether or not any Stadium is present, any remote request arrives, an SSE stream is open, or the relay is reachable/reconnecting. No remote keep-alive traffic is required.
- ON while a countdown is running → the timer is cancelled ("Remote Access enabled. Idle shutdown timer cancelled.").
- OFF with no Stadium → one fresh, full countdown starts (never an immediate exit, never a duplicate: the timer is only created when none exists).
- The expiry callback re-checks liveness and does nothing if a lease or Stadium session appeared, so a stale timer cannot kill a leased daemon.
- Preference changes call the check synchronously before the relay sync, so rapid toggles are deterministic; `stop()` still clears the timer.
- Remote Access disabled = the previous behaviour exactly (idle shutdown is NOT abolished, the process is not immortal).
- Test seam: `DaemonOptions.exitProcess` (default `process.exit`) so the exit is observable; tests use a 300 ms idle window instead of 30 real minutes.

### Durable product invariant
**REMOTE ACCESS ENABLED = DESKTOP SIDELINE REMAINS AVAILABLE FOR REMOTE RETURN.** Dad can leave for hours and later open a paired device with no manual VS Code/Stadium restart and no keep-alive traffic.

## Bounded liveness tests (`stage4e`, 6/6 pass)
RA4E-1 OFF + no owner → exits at ≥ 0.8× window (existing policy intact) · RA4E-2 ON + no owner survives 4× window with no countdown and no remote requests · RA4E-3 ON with relay unreachable survives 4× window while RelayClient keeps retrying (attempt ≥ 4, not stopped) · RA4E-4 enable at 0.4× window cancels the pending exit, survives past the old deadline · RA4E-5 disable restores a full countdown (no exit at 0.4×, exit after the window) · RA4E-6 five concurrent toggles → coherent state, no premature exit, exactly one exit when finally OFF, no leaked timer.

## Production rollback / failure-isolation proof
**Fly tooling finding:** this CLI (v0.4.107) has no `fly releases rollback` command (`fly releases` is list-only). The supported procedure is redeploying an earlier release's image: `fly deploy --config relay/fly.toml --image <earlier release image> -a mysidelinecoach-relay --ha=false`, with image refs from `fly releases --image`. That is what was used.

**Procedure actually used:**
1. Rotated the private-beta enrollment key with `fly secrets import` (stdin, never printed) → healthy release **v4** (harmless redeploy of the current image). Key held only in a session scratch file and deleted at the end.
2. Started a throwaway desktop daemon (same production relay, new key), enabled Remote Access, paired a device, opened an SSE stream, and started continuous non-blocking pollers: local API every 0.4 s, public host origin with the device cookie every 1 s.
3. **Rollback:** redeployed the **v2 image** (the earlier 4C release, which pre-dates the client-IP resolver) → release **v5**. Log proof it really ran the older code: its startup line lacks the `clientIpSource` field.
4. **Roll forward:** redeployed the current image → **v6**.
5. Repeated the rollback/forward cycle a second time with fully non-blocking measurement → **v7 / v8**. (The first cycle's local poller showed 2 failed samples out of 63; the cause was my own driver blocking its event loop during the synchronous deploy call. A no-deploy baseline run had 158/158 healthy and the non-blocking rerun 167/167, so it was a harness artifact, not a Sideline fault.)
Release history: v1 failed (Fly rejected deprecated region), v2 good, v3 client-IP, v4 secret rotation, v5 rollback to v2 image, v6 forward, v7 rollback, v8 forward (final, healthy, 1 Machine).

### Local health during interruption (non-blocking cycle)
- Local `/api/status`: **167 samples, 0 failures** across both relay interruptions.
- `preferences.json`, the local token and the host key: **byte-identical** before/after; daemon stayed alive; `remoteAccess.enabled` still true; no data or source touched (throwaway home, real Sideline data never involved).

### Remote recovery
- Public host origin: `503 host_offline` for **≈2 s** (rollback) and **≈3 s** (forward) at 1 Hz sampling; relay-side logs show signal → host reconnected in ≈6–10 s worst case (includes the bounded 5 s drain when an SSE stream is open).
- After each interruption: host re-authenticated by **fresh challenge/hello** (exactly one `connect` per relay boot), the **same `sl_dev` cookie returned 200 with no re-pair**, an unauthenticated request still 401, a **new SSE stream opened** (`200`, `hello` event received), no reconnect storm (no `rate_limit`, `handshake_failed` or `enrollment_rejected` events).

## Continuous log capture and audit
`fly logs` was tailed to a local temp file for both cycles (408 lines, well past the ~100-line retrospective buffer). Audit result: **0** occurrences of the enrollment key, `sl_dev`, `Bearer`, `authorization`, `cookie`, `token=`, `secret`, pairing-code patterns or the device label; **0** query strings in request paths; **no public/client IP addresses** (only Fly-internal `fdaa:` addresses and `0.0.0.0/127.0.0.1` in proxy text). Event mix: `connect/disconnect/listening/req/shutdown/signal` only. Capture files, throwaway daemon home and the key were deleted afterwards; daemon logs also contained 0 key occurrences.

## 35-item final acceptance ledger
| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Production container builds | PROVEN | Fly remote build, 67 MB (4C) |
| 2 | Relay runs non-root | PROVEN | uid 1000 inside Machine (4C) |
| 3 | Public health endpoint | PROVEN | `/health` 200 via fly.dev and relay hostname (4C, 4E) |
| 4 | Custom domain resolves | PROVEN | `relay.remote…` and `h-<id>.remote…` resolve (4C) |
| 5 | Wildcard DNS | PROVEN | arbitrary `h-` names resolve (4C) |
| 6 | Wildcard TLS valid | PROVEN | Let's Encrypt `*.remote…`, chain authorized, TLS 1.3 (4C) |
| 7 | Real outbound WSS | PROVEN | real daemon → wss 443 (4C, 4D, 4E) |
| 8 | Enrollment gate | PROVEN | missing/wrong 403; correct 101 (4C, 4D) |
| 9 | Ed25519 challenge/hello publicly | PROVEN | registrations + forged/replay rejections (4D matrix) |
| 10 | Browser host routing | PROVEN | `h-<id>` origin served by the right host, A/B isolation (4C, 4D) |
| 11 | `sl_dev` device auth | PROVEN | pairing exchange, 200 with cookie, 401 without/invalid (4C–4E) |
| 12 | Local-only APIs denied remotely | PROVEN | `/api/devices` 403, Bearer/`?token=` no elevation (from the desktop over the same public path; not re-run from the Chromebook) |
| 13 | Mutation Origin/action security | PROVEN | wrong Origin/missing action 403; correct reaches routing (desktop-side) |
| 14 | Unknown host → host_offline | PROVEN | 503 JSON (4C, 4D) |
| 15 | Malformed host denied | PROVEN | 404 (4C, 4D) |
| 16 | SSE without buffering | PROVEN | 110 ms headers, incremental frames, 62 ms broadcast (4C, 4D) |
| 17 | 10+ min real cellular path | PROVEN (scoped) | 13.25 min via Chromebook on the Android phone's cellular hotspot; Android Chrome separately verified TLS/host origin. **Native Android pairing UX deferred to Stage 5 by decision** |
| 18 | 15 s heartbeat over cellular | PROVEN | 52 heartbeats, 15.0 s gaps ±0.1 s (4D) |
| 19 | Desktop state changes reach client live | PROVEN | 4 changes received immediately (4D) |
| 20 | Desktop outage/recovery | PROVEN | 503 host_offline < 1 s; back 2 s after restart; client 200 again, no re-pair (4D) |
| 21 | Network transition recovery | PROVEN | ≈29 s Wi-Fi loss, then requests and new stream recovered (4D) |
| 22 | Relay restart/recovery | PROVEN | 4C, 4D, and 4 more relay interruptions in 4E |
| 23 | No re-pair after outage | PROVEN | same cookie 200 after every recovery (4D, 4E) |
| 24 | Fly client-IP separation | PROVEN | desktop bucket exhausted while cellular client kept 130/130 200 (4D) |
| 25 | Client-IP spoof resistance | PROVEN | 130 forged-header requests: 120 served, then 429, one hashed client (4D) + unit tests |
| 26 | Rate limits independent per client | PROVEN | 4D as above; handshake limit 10 then 429 |
| 27 | Bounded public security matrix | PROVEN | 16-item matrix all passed (4D) |
| 28 | Secret-free production logs | PROVEN | audits in 4C (100 lines), 4D (100 lines + sentinel burst), 4E (408 continuous lines): 0 leaks |
| 29 | 256 MB Machine sufficient | PROVEN | RSS 63–65 MB, 134 MB free, load ≈ 0 over 12 min (4D); unchanged through 4E cycles |
| 30 | Relay failure never breaks local Sideline | PROVEN | 167/167 local, integrity hashes unchanged (4E) |
| 31 | Production rollback path | PROVEN | `fly deploy --image <previous release>` twice; CLI has no dedicated rollback command (documented) |
| 32 | Remote Access enabled prevents idle exit | PROVEN | RA4E-2/3/4/6 |
| 33 | Disabled preserves idle shutdown | PROVEN | RA4E-1/5/6 |
| 34 | Windows first-class | PROVEN | Everything (daemon, relay client, tests, Fly CLI, DevTools flow) ran on Windows; expected POSIX skip only |
| 35 | Dad infrastructure configuration is zero | PROVEN for Stage 4 design | Dad did no Fly/DNS/TLS/relay/port/secret work in the product flow. **Caveat carried to Stage 5:** the desktop still receives relay URL/domain/key only via operator environment variables, so Stage 5 must provision them invisibly |

No item is unproven; scope qualifiers on 12, 13, 17 and 35 are stated above.

## Local regression totals
- `npm run compile`: clean (`tsc -p ./ && tsc -p relay`).
- Stage 4E (6) + 4D client-IP (4) + 4C bootstrap (3) + 4A hardening (13) + Stage 3 (48): **74 total, 74 pass, 0 fail, 0 skipped, 0 cancelled, 0 todo, ≈ 23.8 s**.
- Stage 1 + 2 (rerun because the daemon idle logic is shared daemon code): **40 total, 39 pass, 0 fail, 1 skipped (expected Windows POSIX skip), 0 cancelled, 0 todo, ≈ 16.6 s**.
- Adjacent: live-player terminal transport, live-player console first-down, control-plane roster projection: **53 total, 53 pass, 0 fail**.

## Stage 5 handoff truth (Stage 5 MAY assume)
`remote.mysidelinecoach.com` production is live on one Fly Machine (`mysidelinecoach-relay`, sjc, shared-cpu-1x/256 MB) with wildcard host origins, real HTTPS/WSS, working public relay security, the existing pairing/device protocol, proven cellular transport, automatic reconnect (seconds), a daemon that stays alive while Remote Access is enabled, and a local Sideline that survives relay failure/rollback. Stage 5 can focus on product UX.
Stage 5 MUST remove/replace: DevTools pairing, `javascript:` pairing, manual pairing codes, manually typed host URLs, the raw `Unauthorized` landing page, and the missing reconnect/status UX. Native Android end-user pairing is Stage 5 acceptance.

## Remaining NON-BLOCKING breadcrumbs
1. **Shared beta enrollment secret:** private-beta infrastructure only. Before broad distribution replace it with a per-installation / server-authorized enrollment system that preserves Dad's zero setup. Note the current Fly value exists nowhere locally (deleted); the real desktop needs a rotation + invisible provisioning path.
2. **Desktop provisioning:** relay URL/domain/key currently arrive as env vars read by the daemon launcher; Stage 5 needs an internal, non-Dad-facing way to supply them.
3. **Autostart gap:** the lease keeps a *running* daemon alive, but nothing yet restarts it after a reboot, crash or manual kill (today the extension starts it when VS Code opens). Consider login autostart while Remote Access is enabled.
4. Consider a `fly.toml`/runbook note that Fly has no `releases rollback` command; keep the documented `--image` procedure.
5. Deploys with an open SSE stream take the full 5 s drain by design.
6. Pin the Node base image by digest; consider Fly's dedicated IPv4 only if ever required.
7. NTFS ACL hardening of `host-key.json` (Stage 2 breadcrumb) remains open.
8. Fly log retention is short; keep continuous capture in any future production audit.

## Dad zero-setup invariant
Fly, DNS, TLS, certificates, relay URL, ports, Docker, enrollment secrets, environment variables, hotspots, DevTools and release rollbacks were all operator/test work. None becomes a Dad step. The product flow remains: **Enable Sideline Coach → Run Plays → Send to Phone → Connect → BOOM.**

## Verdict
**`STAGE 4 GO`** — idle-liveness defect closed; rollback and failure isolation proven; full ledger green; no unresolved transport/security blocker; no local regression.

**COMPLETED:** 2026-09-23 11:24 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-4E-Final-Acceptance__20260923__Claude.md
