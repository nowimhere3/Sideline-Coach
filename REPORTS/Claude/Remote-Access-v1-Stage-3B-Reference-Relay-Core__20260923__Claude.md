**COMPLETED:** 2026-09-23 6:37 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 3B · Reference Relay Core

**Agent:** Claude Code (Sonnet 5, MEDIUM). No commit, no push.

## Files changed
- NEW `relay/reference-relay.ts` — `ReferenceRelay` (Node `http` + `ws`, in-memory only)
- NEW `relay/tsconfig.json` — compile seam (see Deviations)
- MOD `package.json` — `compile` is now `tsc -p ./ && tsc -p relay`
- MOD `test/remote-access-v1-stage3.test.mjs` — added RA3B-1…13

No production host code touched.

## Challenge lifecycle
WebSocket upgrades are accepted only on `/tunnel/v1` (others get 404 and the socket is destroyed). On connect the relay sends `challenge` with a 32-byte `crypto.randomBytes` nonce (base64url), stored in `Map<WebSocket,{nonce,expiresAt}>` with a 30 s TTL (`challengeTtlMs` option exists for tests). The challenge is deleted on the FIRST `hello` attempt, valid or not, so it is single-use.

## Signature verification
Order: pending unexpired challenge (else close `4401`) → `v === 1` and string fields → `publicKey` matches `/^[0-9a-f]{64}$/` → `deriveHostPublicId(rawKey) === hostPublicId` → Ed25519 key imported via JWK (`x` = base64url raw key) → `crypto.verify(null, rawNonceBytes, key, sig)`. Any failure closes `4403`. Non-JSON / non-object frames close `1002`; non-hello frames before verification close `4401`.

## Host registration / supersede
`Map<hostPublicId, WebSocket>`, memory only. A second verified hello for the same id replaces the old socket: old gets `{t:'goaway',reason:'superseded'}`, its in-flight requests are released (503 host_offline if no head yet, otherwise the stream is cut), then it is closed with code `4000`. Socket close/error also removes the mapping and releases in-flight requests.

## Browser request routing
Target host comes ONLY from the `Host` header shape `h-<20 base32>.<relayDomain>[:port]` (strict regex; anything else → 404, never routed). Relay mints `crypto.randomUUID()` ids, reads the body up to 1 MiB (UTF-8 → `body`, non-round-trippable bytes → `bodyB64`), and sends a canonical `req` frame (`path` includes query) to the exact verified socket. `sl_dev` is never parsed.

## Response streaming
Host frames are honoured only from the socket that owns the request id (another host answering someone else's id is ignored). `head` → `writeHead` + `flushHeaders`; `data` → `res.write` immediately (`chunk` or `chunkB64`); `end` → finish; `error` before head → bounded `502 {"code":…}`, after head → connection cut. Test proves chunks arrive ≥100 ms apart rather than buffered.

## Offline behavior
No verified/open host: `/api/*` or `Accept: application/json` → 503, `content-type: application/json`, `cache-control: no-store`, body exactly `{"code":"host_offline","message":"Desktop host is offline"}`. Otherwise 503 static `Desktop Offline - Sideline Coach` HTML page (`text/html; charset=utf-8`, `no-store`).

## Request-size enforcement
Declared `Content-Length` > 1 MiB → 413 immediately; streamed bodies over 1 MiB → 413 and buffered data discarded. Neither is ever forwarded (test asserts the host receives zero frames). Exactly 1 MiB is forwarded.

## Header allowlist
Relay forwards only `accept, content-type, cookie, origin, x-sideline-action, last-event-id, user-agent` (lowercased). `authorization`, `proxy-authorization`, `x-forwarded-for`, custom and `x-*` headers are dropped. `cookie` and `origin` pass as opaque strings.

## Cross-host isolation
Routing keyed strictly by subdomain → verified socket. Tests: host B never sees host A traffic; B answering A's request id is ignored; unknown subdomain and a forged `X-Sideline-Host`/`Origin` header both yield 503 without reaching either host; dropping A leaves B connected.

## Logging / privacy boundary
Optional `log(entry)` receives only `{ts, hostPublicId, method, path (pathname only), status, bytes, durationMs}`. Test proves query string and cookie values never appear. Relay stores no cookies, bodies (beyond in-flight buffering), pairing secrets, or keys, and never touches disk.

## Windows compatibility
Plain TCP `http` + `ws` on `127.0.0.1`; no Unix sockets or POSIX assumptions. All tests ran on Windows.

## Tests (exact counts)
- `npm run compile`: clean (`tsc -p ./` then `tsc -p relay`).
- `remote-access-v1-stage3.test.mjs`: 16 tests, 16 pass, 0 fail (3× 3A + 13× 3B).
- Stage 1 + Stage 2: 40 tests, 39 pass, 0 fail, 1 skipped (expected Windows POSIX-permission skip).

## Deviations
- Root `tsconfig.json` has `rootDir: src`, so `relay/` could not compile under it. Added `relay/tsconfig.json` (extends root, `rootDir: ..`, output `out/relay-build/`, already git-ignored under `out/`) and chained it into `npm run compile`. Tests import `out/relay-build/relay/reference-relay.js`. This is the "compile seam" the slice permitted; no `src/` code changed.
- Close code `4000` (one of the two Field Packet options) used for supersede; `1002` for malformed frames; `4401` for missing/expired challenge or pre-handshake frames.
- 3B intentionally omits ping/heartbeat, browser-disconnect `cancel` frames and per-response 1 MiB queue caps (Slice 3D).

## Verdict
Slice 3B is **GREEN** for Slice 3C.

**COMPLETED:** 2026-09-23 6:37 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-3B-Reference-Relay-Core__20260923__Claude.md
