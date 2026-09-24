**COMPLETED:** 2026-09-24 12:59 AM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 5A · Pairing Route & Landing Page

# VERDICT: `GREEN FOR 5B`

No commit, no push, no deployment, no QR/Send to Phone/Settings UI/bootstrap work, and nothing from 5B+ was started. Only the Stage 5A portions of the Field Packet were read.

## Files changed
- MOD `src/control-plane/remote-routes.ts` — two public GET routes
- MOD `src/control-plane/remote-dispatch.ts` — pair-page bootstrap exemption + friendly HTML 401 for the app root
- MOD `src/control-plane/daemon.ts` — `servePairPage()` and its route hook
- NEW `src/public/pair.html`
- NEW `test/remote-access-v1-stage5a-pairing-route.test.mjs` (8 tests)
- Deviation (needed): `package.json` `files` now also lists `src/public/pair.html`, otherwise the packaged extension would not ship the page. (`package.json` already had unrelated uncommitted changes; only this one line was added.)

## Exact route-policy changes
Added to `DAEMON_ROUTE_POLICIES` as `public`: `GET /pair` and `GET /pair.html`. Test RA5A-1 pins the complete public set to exactly `GET /`, `GET /index.html`, `GET /pair`, `GET /pair.html`, `GET /api/health`, `POST /api/pairing/exchange`; `POST/PUT/DELETE /pair`, `/pair/x`, `/pairing`, `/pair.htm` remain unroutable. `POST /api/pairing/create` and device management stay `local-only`; everything else is unchanged default-deny.

## Serving and remote dispatch
- `InProcessRemoteAdapter`: an unauthenticated `GET /pair` or `/pair.html` is treated like the existing exchange bootstrap (no cookie required, no device identity granted, no `Set-Cookie`). Every other unauthenticated path still gets 401; `POST /pair`, `/pair/extra` and `?token=` are still refused (`/pair?token=…` → 401 by the daemon's existing check).
- Daemon: serves the file (works from `out/`, `src/` or cwd like the index page) with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a strict CSP computed from the page's own inline script/style SHA-256 hashes: `default-src 'none'; script-src <hash>; style-src <hash>; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`. The full 482 KB `index.html` is not loaded before pairing; `pair.html` is small (< 20 KB, tested).

## `pair.html` behaviour
Self-contained, mobile-first, no third-party assets/CDN/analytics/external requests. Viewport `width=device-width, initial-scale=1, viewport-fit=cover`; code input is 1.125rem (≥ 16px, no iOS zoom); light/dark, safe-area padding, reduced-motion respected. States: working, code entry, generic failure, network error (with retry).

## Fragment secrecy
On load it reads `location.hash`, immediately calls `history.replaceState(null, '', '/pair')`, clears its local copies, and only then starts the exchange. The secret lives in one closure variable (kept only so a transport failure can be retried), is sent solely in the JSON body of `POST /api/pairing/exchange`, and is never placed in a query string, URL, header, cookie, storage or console. On success it calls `window.location.replace('/')`; JavaScript never sees the device token (the `sl_dev` cookie is HttpOnly and set by the response).

## Fallback code entry
`/pair` without a fragment shows a form for `XXXX-XXXX`; the value is trimmed/uppercased and sent to the same `POST /api/pairing/exchange` as `{ code }`, then `location.replace('/')`. No second authentication mechanism; no server pairing semantics were touched (secret hashing, TTL, single-use burn, attempt burn and cookie are as in Stage 2).

## Generic failure UX
Any non-OK response other than 429 shows the same card: "Connection unavailable / This connection link is no longer valid. / Create a new Send to Phone connection from Sideline Coach." The page has no wording about expiry, prior use or attempts (asserted). A 429 (relay rate limit) and a network error get separate, non-verdict transport messages. Server side, unknown, reused and burned secrets return the identical `401 {"success":false,"message":"Pairing could not be verified."}` (asserted).

## Friendly unpaired root
For `GET /` or `/index.html` with no valid device cookie and an `Accept` containing `text/html`, the remote adapter answers `401` with a small HTML page ("Device Not Paired — Use Send to Phone on your Sideline Coach computer to connect this device."), `no-store`, no cookie. Callers sending `application/json`, `*/*` or no Accept still get the existing JSON 401. API routes (e.g. `GET /api/status`, `/api/events`, `/api/devices`) return the JSON 401 even with a browser `Accept: text/html`.

## Security invariants (unchanged)
Presentation is not authorization: the `Principal` + route policy remain authoritative; `/pair` grants nothing; pairing creation is local-only (401 unauthenticated, 403 for a paired device); `/api/devices` is 403 for a paired device; the fresh device cookie works for `/api/status`; the raw token never appears in a response body; no route other than the two static GETs became reachable without a device credential.

## Tests
- `npm run compile`: clean.
- **Stage 5A suite: 8 tests, 8 pass, 0 fail.** RA5A-1 route policy · 2 remote dispatch + headers/CSP + local serving · 3 friendly root · 4 API 401 preserved · 5 exchange semantics preserved (secret, code, single-use, generic/burned failures, local-only creation) · 6 static page safety (no storage/eval/external loads/analytics/query-secret construction/logging; viewport; ≥ 16px input; scrub-before-exchange ordering) · 7 and 8 **browser flow with the real page script executed in a Node `vm` sandbox with stubbed `window/document/fetch`** (hash captured, `replaceState` is the first action, then a single POST of `{secret}` to `/api/pairing/exchange`, secret absent from URL/headers/redirect, `location.replace('/')` on success, identical failure view for 401/403/404/410/500, no navigation on failure, fallback code → `{code:'ABCD-EFGH'}`, network error → retry view).
- **Regression** (Stage 1 + 2 + 3 + 4A hardening + 4C bootstrap + 4D client-IP + 4E liveness + 5A in one run): **122 total, 121 passed, 0 failed, 1 skipped (expected Windows POSIX skip), 0 cancelled, 0 todo, ≈ 23.3 s.**

## Deviations / notes
- `package.json` `files` addition (above).
- No real-browser (Playwright) harness exists in the repo, and none was added. The fragment behaviour is proven at script level in a sandbox (RA5A-7/8), which cannot prove true browser behaviours such as the address bar/history entry actually being rewritten, `HttpOnly`/`Secure` cookie storage, CSP enforcement, or mobile rendering.
- **Breadcrumb for the Stage 5 browser acceptance suite:** a real-browser test of `/pair#<secret>` (URL and history scrubbed, no secret in any request line/log, cookie set, redirect to `/`, code fallback, layout at < 380 px, CSP not blocking the page) on the actual production origin with the real Android device.
- The friendly HTML applies only via the remote adapter (the remote surface); a local browser hitting the daemon directly still gets the existing local behaviour.

## Verdict
**5A is GREEN. `GREEN FOR 5B`.** Stopped before 5B.

**COMPLETED:** 2026-09-24 12:59 AM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-5A-Pairing-Route-Landing__20260924__Claude.md
