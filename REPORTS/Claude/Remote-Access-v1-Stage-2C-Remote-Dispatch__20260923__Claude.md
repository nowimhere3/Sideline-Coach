**COMPLETED:** 2026-09-23 5:48 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 · Stage 2C — In-Process Remote Dispatch Adapter

**Agent:** Claude Code (Sonnet 5, medium) · No commit, no push.

## Files changed
- `src/control-plane/remote-dispatch.ts` (new)
- `src/control-plane/daemon.ts` (one public method, `dispatchRemoteRequest`)
- `test/remote-access-v1-stage2.test.mjs` (RA2C-1…8 appended)

## Adapter architecture
`InProcessRemoteAdapter({ daemon, deviceRegistry, expectedOrigin })` with `dispatch(frame, onFrame)` and `cancel(id)`. It is the only code that mints a `remote-device` Principal. `FrameReq` / `FrameRes` are exactly the Field Packet shapes (no WSS machinery). It builds a minimal request shim (a `Readable` with method/url/headers/socket, body pushed up front, `autoDestroy`/`emitClose` off so `close` is emitted only on cancel) and a minimal response shim (`headersSent`, `statusCode`, `setHeader/getHeader/removeHeader`, `writeHead`, `write`, `end`, `flushHeaders`, no-op `on/once/off`).

## Daemon seam
`public async dispatchRemoteRequest(req, res, principal: Extract<Principal, { kind: 'remote-device' }>)` → `handleHttpRequest(req, res, principal)`. `handleHttpRequest` stays private; the compiler restricts this seam to `remote-device`.

## Device authentication flow
1. Not `POST /api/pairing/exchange`: read `sl_dev` from the frame `Cookie`, `DeviceRegistry.authenticate(raw)` (timing-safe, 30-day idle check, slides `lastSeenAt`).
2. Missing/invalid/revoked/expired → emit `head 401` + `data` + `end`; **daemon routing is never entered** (test proves the seam is not called).
3. Valid → Principal `{ kind:'remote-device', deviceId, authenticatedBy:'in-process', expectedOrigin }` → `dispatchRemoteRequest`.
4. Exactly `POST /api/pairing/exchange` (query allowed, any other method/path is not exempt) is dispatched with no `sl_dev`, using a placeholder principal (`deviceId: 'unpaired'`); the daemon answers that route in its early block before reading the principal, so it is still secret-gated by the pairing store.

## expectedOrigin flow
Supplied only in adapter options (trusted host config), copied into each minted Principal, compared by the Stage 1 guard (`requestOriginMatchesExpected`). Never read from request headers/Host; not stored in `DeviceRegistry`.

## Header filtering
Incoming `authorization`, `proxy-authorization`, `cookie` (already consumed) and `x-forwarded-for` are dropped; remaining names are lowercased. `?token=` is left in the URL so the daemon's existing check answers 401. No header can select the principal.

## Frame translation
`writeHead` → `head` (status + merged `setHeader`/`writeHead` headers, lowercase keys); `write` → one `data` frame per write; `end(data?)` → optional `data`, then `end`; implicit head is emitted if `write`/`end` runs first. Dispatch exceptions before completion → `{ t:'error', code:'dispatch_failed' }`; a bad path → `{ t:'error', code:'bad_path' }`.

## SSE behavior
Daemon SSE code is unchanged. `/api/events` yields `head` (200, `text/event-stream`, `cache-control: no-cache, no-transform`) then a separate `data` frame per write (`hello`, `status`, `ai-health`, `execution`; heartbeat frames pass through the same way). The stream stays open until cancelled.

## Cancellation behavior
`cancel(id)` emits `close` on the request shim (daemon's existing `req.on('close')` calls `removeSseClient`, clearing the heartbeat) and then emits a single `end` frame. Verified: `sseClients.size` 1 → 0, nothing streams after cancel (a broadcast produces no frame), and a second `cancel` is a no-op.

## Sliding-cookie behavior
On every request whose device authenticated, the head gets `Set-Cookie: sl_dev=<same raw token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`, merged with the daemon's own headers (not added if the daemon already set a cookie). The raw token exists only in memory for that request (taken from the incoming cookie); it is never written to disk (test greps `devices.json`). Invalid/revoked/expired devices get no cookie; pairing exchange is unchanged. It is also refreshed on an authenticated 403/404 because the device itself is still valid.

## Windows compatibility
Pure in-memory Node streams; no filesystem or POSIX assumptions. Everything ran on Windows.

## Tests and counts
`npm run compile` — clean.
`node --test test/remote-access-v1-stage2.test.mjs` — 20 tests: 19 pass, 0 fail, 1 skipped (RA2A-4, POSIX file mode on Windows).
`node --test test/remote-access-v1-stage1.test.mjs` — 9 tests: 9 pass, 0 fail.
Slice 2C tests: RA2C-1 valid auth + frames · 2 invalid/revoked/expired 401, no cookie, daemon not entered · 3 local-only 403, Bearer / `?token=` cannot elevate · 4 CSRF (no action header, foreign Origin, spoofed Host, missing Origin, matching origin reaches routing) · 5 cookie refresh + header preservation + slide + no raw token on disk · 6 exchange bootstrap through adapter · 7 SSE frames + cancel · 8 loopback `sl_dev` still 401.

## Deviations from the Field Packet
1. Exchange bootstrap uses a placeholder `remote-device` principal (`deviceId:'unpaired'`) because the typed seam requires one; safe because it is used only for exactly `POST /api/pairing/exchange`, which the daemon fully handles before principal use.
2. `POST /api/control-plane/shutdown` from a remote principal returns **401** (existing freshness-handler behavior), not 403; still refused. Other local-only routes return 403. Also `/stadium` is a 404 to remote (non-`/api/` paths never reach classification).
3. Frame headers are single-valued (`Record<string,string>`), so multi-value headers are comma-joined; only one `Set-Cookie` is ever present on these paths.
4. Refresh cookie is also issued on authenticated 403/404 responses (device valid).

## Verdict
**Slice 2C is GREEN for Slice 2D.**

**COMPLETED:** 2026-09-23 5:48 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-2C-Remote-Dispatch__20260923__Claude.md
