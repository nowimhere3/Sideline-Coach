**COMPLETED:** 2026-09-23 7:07 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 3E · Daemon Wiring + Final Acceptance

**Agent:** Claude Code (Sonnet 5, MEDIUM). No commit, no push.

# VERDICT: `STAGE 3 GO`

Stage 4 was NOT started.

## Production files changed (whole of Stage 3)
- NEW `src/control-plane/relay-frames.ts` (3A)
- NEW `src/control-plane/relay-client.ts` (3C, reworked 3D)
- NEW `relay/reference-relay.ts`, `relay/tsconfig.json` (3B, extended 3D; test/reference relay only)
- MOD `src/control-plane/remote-dispatch.ts` (3A: frame aliases + 7-header allowlist)
- MOD `src/running-players.ts` (3A: `remoteAccess.enabled`, default false)
- MOD `package.json` (`compile` also builds `relay/`)
- MOD `src/control-plane/daemon.ts` (**3E only**, see below)

Slice 3E touched only `daemon.ts` and, as a small test aid, a `connectionCount` counter in `relay/reference-relay.ts`.

## Test files changed
`test/remote-access-v1-stage3.test.mjs` (new; 48 tests: 3 × 3A, 13 × 3B, 7 × 3C, 12 × 3D, 13 × 3E). No Stage 1/2 test edited.

## Daemon RelayClient lifecycle
- `DaemonOptions.remoteRelay?: { relayUrl, relayDomain, tuning? }`. `syncRelayClient()` reconciles the daemon-owned client with `preferences.remoteAccess?.enabled === true` **and** a configured `remoteRelay`.
- Calls are serialised on a promise chain, so rapid toggles cannot create a second client, socket or timer.
- Enable: the durable identity is loaded with `HostIdentityManager.ensureIdentity(<dir>/remote)` (lazily, so nothing is generated while Remote Access is off), a new `RelayClient` is built with the existing `deviceRegistry`, and started.
- Disable / shutdown: the client is stopped and discarded. A stopped `RelayClient` is never reused (its stop semantics are unchanged); the next enable builds a fresh one.
- `daemon.start()` syncs once after listening; `daemon.stop()` stops the tunnel FIRST, before SSE/WebSocket/HTTP teardown.
- `POST /api/preferences` (already local-only) accepts `{ "remoteAccess": { "enabled": boolean } }` (strict boolean, else 400), persists it, awaits the sync, and answers "Remote Access is on/off." No UI added.

## Runtime configuration seam
Only the constructor option `remoteRelay` (tests pass `ws://127.0.0.1:<port>/tunnel/v1` and `relayDomain: 'localhost'`). `relayDomain` is not a preference. Unset (the default) means the daemon never opens a relay connection even if the preference is true, so normal startup cannot reach an external relay. No env vars, DNS, TLS, provider or secrets were added.

## Enable / disable / re-enable
RA3E-2: one client, one socket, correct hostPublicId; repeated enables change nothing. RA3E-3: disable → client `stopped`, stats all clear, relay mapping and socket gone, zero reconnects after 200 ms, local API healthy. RA3E-4: re-enable → different client instance, exactly one new connection (2 total), request path works; a 4-way concurrent flap ends with exactly one socket.

## Complete E2E path
Browser-shaped HTTP → ReferenceRelay → outbound WS → RelayClient → InProcessRemoteAdapter → ControlPlaneDaemon → streamed frames → RelayClient → ReferenceRelay → browser, all through a real `ControlPlaneDaemon` that owns its client.

## REST / auth / security results (RA3E-5, 6)
- Valid `sl_dev`: `/api/status` 200 with sliding cookie. No credential / invalid credential: 401.
- Local-only `/api/devices`, `/api/diagnostics`: 403. Remote `POST /api/preferences` (to turn Remote Access off): 403 and the setting stays on.
- Admin Bearer alone: 401; Bearer + cookie on a local-only route: 403; `?token=`: 401.
- Mutations: missing action header 403; missing Origin 403; foreign Origin 403; relay/loopback origin 403; trusted `https://h-<id>.localhost` Origin + action header reaches routing (not 403). `Host` is never trusted.

## SSE / cancel (RA3E-7, 8)
`/api/events` delivered hello/status/ai-health/execution, first event < 1 s, a later broadcast arrived live while the stream stayed open (not buffered), and the 15 s `: hb` crossed the tunnel (test waits for it in real time). Browser abort → relay `cancel` → RelayClient → adapter → daemon: `sseClients`, relay in-flight, adapter in-flight and client active all return to 0 with the tunnel intact.

## Relay loss / recovery (RA3E-9)
Relay closed with SSE open: in-flight work cleaned, local API stays 200, client enters reconnect. Relay restarted on the same port: fresh challenge/hello, host re-registered, request succeeds, the SAME client instance is in use, exactly one socket.

## Host offline (RA3E-10)
Daemon up, no tunnel: API request → exact 503 `host_offline` JSON with `no-store`; document request → 503 Desktop Offline page; local API still 200.

## Two-host isolation (RA3E-11)
Two real daemons/identities on one relay: each origin is answered by its own daemon (different bodies); each side's device cookie is 401 on the other; B's Origin cannot authorize a mutation on A (403); disabling A leaves B serving and A answering 503.

## Shutdown cleanup (RA3E-12)
`daemon.stop()` with Remote Access on and an SSE stream open: client stats zeroed and stopped, no reconnect timer / watchdog / pump, adapter and SSE maps empty, relay mapping, sockets and in-flight requests gone, no reconnect afterwards; the test process exits cleanly.

## No automatic mutation retry (RA3E-13)
A mutation dispatched to the daemon, then a severed tunnel and reconnect: the daemon saw exactly one dispatch; nothing was replayed.

## 26-item contract check
| # | Requirement | Evidence |
|---|---|---|
| 1 | Canonical wire schema | `relay-frames.ts`; RA3A-1 |
| 2 | 7-header allowlist at relay AND host | RA3B-10 (relay), RA3A-2 (host adapter) |
| 3 | `sl_dev` opaque to relay, authoritative at host | RA3B-10 (opaque cookie), RA3C-3, RA3E-5 |
| 4 | expectedOrigin from hostPublicId + relayDomain | `RelayClient.expectedOrigin`; RA3C-1, RA3E-2, RA3E-6 |
| 5 | Disabled by default | RA3A-3, RA3E-1 |
| 6 | Ed25519 challenge/hello | RA3B-1, RA3C-1/1b, RA3E-2 |
| 7 | Forged signature denied | RA3B-2 |
| 8 | Replay denied | RA3B-4 |
| 9 | Key/id mismatch denied | RA3B-3 |
| 10 | Duplicate host replacement | RA3B-6, RA3D-7 |
| 11 | Request ids relay-generated | RA3B-11 |
| 12 | > 1 MiB → 413 | RA3B-9 |
| 13 | Cross-host isolation | RA3B-12, RA3E-11 |
| 14 | head/data/end streaming | RA3B-13, RA3C-5, RA3E-7 |
| 15 | Browser cancel | RA3D-8, RA3E-8 |
| 16 | Relay heartbeat / stale host | RA3D-1, RA3D-2 |
| 17 | Host watchdog | RA3D-3 |
| 18 | Reconnect / backoff | RA3D-4, RA3D-5, RA3E-9 |
| 19 | No automatic mutation retry | RA3E-13 (plus no re-dispatch path in code) |
| 20 | Host flow control 4 MiB / 2 MiB | RA3D-10 (with faked `bufferedAmount`) |
| 21 | Host queue hard bound 8 MiB | RA3D-11 |
| 22 | Relay slow-browser cap 1 MiB | RA3D-9 |
| 23 | Relay state memory-only | Design: relay writes nothing to disk; maps cleaned (RA3D-12); no `fs` use in `reference-relay.ts` |
| 24 | Relay logs no secrets | RA3B-13 (query/cookie absent, metadata-only keys) |
| 25 | Windows first-class | All tests run on Windows; no POSIX-only code |
| 26 | Stage 1/2 contracts green | Adjacent gate below |

No item is unproven; item 20's tests fake `bufferedAmount` rather than saturating a real socket, and item 23 is demonstrated by inspection of the relay plus map-cleanup assertions rather than a dedicated filesystem test (see breadcrumbs).

## Exact test counts
- `npm run compile`: clean.
- `node --test test/remote-access-v1-stage3.test.mjs`: 48 tests, 48 pass, 0 fail (also 47/47 on three earlier runs before RA3E-13 was added; ~23 s).
- Preference-related suites (17 files that touch `/api/preferences` or `DEFAULT_PREFERENCES`) run after the daemon change: 361 tests, 360 pass, 0 fail, 1 skip.

## Final adjacent gate
`stage1 + stage2 + stage3 + live-player-terminal-v02-transport + live-player-console-first-down`
- total **130**
- passed **129**
- failed **0**
- skipped **1** (expected Windows POSIX-permission assertion)
- cancelled **0**
- todo **0**
- elapsed **≈ 23.5 s** (23,529.7 ms)

## Windows result
Everything ran on the Windows development machine; loopback TCP only, no Unix sockets or new POSIX assumptions.

## Remaining NON-BLOCKING breadcrumbs
1. `RelayClient` cannot carry binary request bodies (`bodyB64` non-UTF-8 → `unsupported_body`).
2. Flow-control tests fake `bufferedAmount`; a real-socket saturation test would add confidence.
3. Relay statelessness (no disk writes) is verified by inspection, not an automated filesystem-watch test.
4. `daemon.ts` loads the relay client only at `start()` and preference changes; there is no runtime config reload for `remoteRelay`.
5. Stage 4 needs a production relay, real `wss://` + TLS, and a non-loopback `relayDomain`; none exist yet (and `RelayClient` uses `ws` defaults for TLS).
6. `POST /api/preferences` accepts `remoteAccess` for the future Stage 5 UI; no UI or extension command exists.
7. NTFS ACL hardening of `host-key.json` (Stage 2 breadcrumb) remains open.

**STAGE 3 ENDS WHEN THE REAL PROTOCOL PASSES END-TO-END THROUGH THE LOCAL/REFERENCE RELAY.** It does. Stage 4 was not started; nothing was deployed, committed or pushed.

**COMPLETED:** 2026-09-23 7:07 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-3E-Final-Acceptance__20260923__Claude.md
