**COMPLETED:** 2026-09-23 7:41 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 4A · Production Relay Hardening

**Agent:** Claude Code (Sonnet 5, MEDIUM). Local code + tests only. No deployment, provider account, DNS, TLS, purchase, commit or push.

## Files changed
- NEW `relay/index.ts` — production entrypoint
- MOD `relay/reference-relay.ts` — health, enrollment gate, rate limits, events, graceful shutdown
- MOD `src/control-plane/relay-client.ts` — optional `enrollmentKey`
- MOD `src/control-plane/daemon.ts` — `DaemonRemoteRelayConfig.enrollmentKey?` passed to RelayClient (2 lines)
- NEW `test/remote-access-v1-stage4-hardening.test.mjs`

No Dockerfile, `fly.toml`, provider code, UI or Stage 4B+ work.

## Production entrypoint (`relay/index.ts`)
Thin wrapper over the shared `ReferenceRelay`; no protocol logic duplicated.
- Env: `PORT` (required, 0–65535), `RELAY_DOMAIN` (required, bare lowercase domain), `ENROLLMENT_KEY` (≥ 16 chars; required unless `ALLOW_OPEN_ENROLLMENT=true`), optional `BIND_HOST` (default 0.0.0.0), `TRUST_PROXY` (true/false, default false), `DRAIN_MS` (1–5000, default 5000), `RATE_HANDSHAKE_PER_MIN`, `RATE_INVALID_BEFORE_BAN`, `BAN_MINUTES`, `RATE_HTTP_PER_MIN`, `RATE_PAIRING_PER_MIN`.
- Invalid config → exit 1 with a single stderr JSON line `{"event":"config_error","message":"<variable name only>"}`; values are never echoed.
- Logs: NDJSON on stdout. SIGTERM/SIGINT call `relay.shutdown(drainMs)`. Exports `loadConfig` and `startRelay` for tests; signal handlers exist only in `main()`.

## Enrollment flow
Relay: with `enrollmentKey` set, the `/tunnel/v1` upgrade must carry `x-sideline-enrollment`. It is compared with SHA-256 digests via `crypto.timingSafeEqual`. Missing/wrong → `403` with empty body, decided BEFORE `handleUpgrade`, so no socket, challenge or pending state exists (RA4A-3 asserts `connectionCount 0`, `pending 0`). The key is never logged, echoed or stored. Unset key → gate off, Stage 3 behaviour unchanged (RA4A-4; the 48 Stage 3 tests still pass). Challenge/hello semantics are untouched (RA4A-2).
Host: `RelayClient` option `enrollmentKey?` adds the header on the outbound upgrade only when set. (If a caller supplies its own `createSocket` test seam, that seam owns the headers.)

## Desktop configuration plumbing
`DaemonRemoteRelayConfig.enrollmentKey?: string` → `RelayClient`. It is runtime configuration only: not a preference, not written to DeviceRegistry/host key/preferences, never logged. RA4A-5 runs three real daemons (right key, wrong key, none) against an enrollment-gated relay: only the correct one registers, the others get repeated 403s while staying locally healthy, and every file written under all daemon dirs plus the preferences API output and relay logs are scanned for the key (absent).
No environment bootstrap for `remoteRelay` exists yet in the desktop/extension. Per the brief I did not search for one; the typed seam is proven and **the production env bootstrap (`SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, `SIDELINE_ENROLLMENT_KEY` → `DaemonRemoteRelayConfig`) is left for 4B/4C**.

## Rate limiting
In-memory sliding windows keyed per client identity; no external service. Defaults (`DEFAULT_RATE_LIMITS`, all overridable, clock injectable via `now`):
| Limit | Default |
|---|---|
| WSS handshakes | 10 / min / identity |
| Consecutive invalid enrollment/hello failures | 5 → 15-minute block (`429` + `Retry-After`) |
| Browser HTTP | 120 / min / identity |
| `POST /api/pairing/exchange` | 10 / min / identity (own bucket, checked before the general one) |
A successful verified hello resets the consecutive-failure count; failed hello signatures count as failures alongside bad enrollment. `/health` is never limited. A sweep in the heartbeat interval drops expired entries. Pairing semantics are unchanged: through a real tunnel the wrong secret still gets the host's 401, a right secret still succeeds, and the fourth exchange in a window gets the relay's 429 even with a valid secret (RA4A-9).

## Client-IP trust boundary
Identity = the socket peer address by default. `X-Forwarded-For` is honoured only with the explicit `trustProxy: true` (`TRUST_PROXY=true`), and then only the RIGHTMOST entry (the one the trusted edge appends); client-forged left parts are ignored. RA4A-10 proves rotating forged XFF values cannot evade the HTTP or handshake limit when untrusted. Independently of that mode, no `X-Forwarded-*`, `Forwarded`, `X-Real-IP` or `Fly-Client-IP` header ever reaches a `RelayReqFrame` (relay allowlist; RA4A-10 checks both modes).

## Health contract
`GET /health` and `/healthz` (any Host header, query ignored): `200`, `application/json`, `Cache-Control: no-store`, body exactly `{"status":"ok","uptime":<int seconds>}`. Other methods → `405` with `Allow: GET` and no state change. While draining it returns `503 {"status":"draining"}`. No host ids, counts, memory, config or secrets.

## Log schema / redaction
Two record kinds, copied field-by-field: `req` → `{ts,event,hostPublicId,method,path (pathname only),status,bytes,durationMs}`; events → `{ts,event,hostPublicId?,scope?,client?,code?,phase?}` for `connect`, `disconnect`, `rate_limit`, `enrollment_rejected`, `handshake_failed`, `shutdown`; plus a startup `listening` line (port, domain, `enrollment: required|open`, trustProxy). `client` is a 12-hex SHA-256 prefix of the identity, never an address. No headers, bodies, query strings or fragments are ever logged. RA4A-11 pushes sentinel values through the real production wrapper (cookie, Set-Cookie, Authorization, Proxy-Authorization, enrollment key incl. a wrong one, query, fragment, request body, response body) and asserts none appears in the captured stdout and that every record only uses allowed fields.

## Shutdown / drain
`relay.shutdown(drainMs ≤ 5000)`: stop accepting (server closed; upgrades and new HTTP get 503/refused), send `{t:'goaway',reason:'shutdown'}` to every verified host, wait until in-flight requests finish or the deadline, then `close()` (aborts leftovers with the offline 503, closes host sockets, clears timers/maps). RA4A-12: (a) an in-flight request completes during the drain and shutdown returns as soon as it does; (b) a stuck request is cut at ~300 ms with 503. Both leave inflight/hosts/pending/wss/limiter maps empty, ping timer cleared and the server closed. The existing `RelayClient` reconnects after a `shutdown` goaway (Stage 3D).
Windows note: `process.kill('SIGTERM')` on Windows is a hard kill and cannot run handlers, so signal handling itself is not tested end to end; the drain logic is exercised through `startRelay().shutdown()`. RA4A-0 does spawn the real entrypoint (fail-fast exit code and a live `/health`).

## Windows compatibility
Node `http`/`ws` on loopback only; no POSIX-only calls. All tests ran on Windows.

## Tests
- `npm run compile`: clean (`tsc -p ./ && tsc -p relay`).
- `remote-access-v1-stage4-hardening.test.mjs`: **13 tests, 13 pass, 0 fail** (RA4A-0 … 12); three consecutive runs green.
- `remote-access-v1-stage3.test.mjs`: **48 tests, 48 pass, 0 fail**.
- Stage 1 + 2 + 3 combined: **88 total, 87 passed, 0 failed, 0 cancelled, 0 todo, 1 skipped** (expected Windows POSIX-permission skip), ≈ 23.1 s.

## Deviations from the Anti-Gravity packet
- Rate limits are applied by the engine only when `rateLimits` is supplied; the production entrypoint always supplies the packet defaults. This keeps Stage 3 loopback tests (many sockets from 127.0.0.1) unaffected.
- The packet says relay reads `X-Forwarded-For` from the provider edge; per the brief this is now opt-in (`TRUST_PROXY`) and uses the rightmost entry, with the socket peer as default.
- Enrollment rejection is a plain `403` on the upgrade as in the packet; consecutive failures beyond the threshold escalate to `429` (block).
- The production entrypoint additionally refuses to start without `ENROLLMENT_KEY` unless `ALLOW_OPEN_ENROLLMENT=true`, so a public relay cannot be launched open by accident (the engine itself still defaults to the gate off).
- Only `/health` uses the "any Host header" rule; the apex/non-host routing remains the Stage 3 404.

## Verdict
Slice 4A is **GREEN** for Slice 4B. Nothing was deployed and Slice 4B was not started.

**COMPLETED:** 2026-09-23 7:41 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-4A-Production-Relay-Hardening__20260923__Claude.md
