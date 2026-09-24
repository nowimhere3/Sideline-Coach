**COMPLETED:** 2026-09-23 11:05 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 4D · Real Cellular Acceptance

# VERDICT: `4D GREEN FOR 4E` (with two explicit scope notes below)

No commit, no push, no Stage 4E, no Stage 5. Never included here: enrollment key, pairing codes, device tokens, any raw public IP.

## Scope notes (read first)
1. **Client device.** Android Chrome converts a typed `javascript:` pairing line into a Google search, so end-user pairing on the phone was impossible without Stage 5 UI. By Dad's decision the real cellular transport test used a **Chromebook connected to the Android phone's cellular hotspot** (Wi-Fi to hotspot only, no other network). The Android phone itself was used on **cellular only** for the TLS/host-origin check (Android Chrome loaded the `h-<id>` origin with a padlock and no warning, and showed the expected `Unauthorized` JSON). **The Android end-user pairing UX test is deferred to Stage 5.**
2. **Evidence limits (honest):** Fly's log buffer only returns the latest ~100 lines, so the log audit covers the final window plus a fresh sentinel burst, not the entire 3-hour session; some checks (local-only, CSRF, size cap, matrix) were run from the desktop against the same production relay/host path rather than from the Chromebook; HttpOnly cookie refresh cannot be observed by page JavaScript.

## Files changed (4D)
- MOD `relay/reference-relay.ts` — `clientIpSource: 'socket' | 'fly'` resolver
- MOD `relay/index.ts` — `CLIENT_IP_SOURCE` env (default `socket`; invalid value or `fly` + `TRUST_PROXY=true` refused), logged in the startup line
- MOD `relay/fly.toml` — `CLIENT_IP_SOURCE = "fly"`, `TRUST_PROXY = "false"`
- MOD `test/remote-access-v1-stage4-hardening.test.mjs` — allowed startup-log field list gains `clientIpSource`
- NEW `test/remote-access-v1-stage4d-client-ip.test.mjs` (4 tests)
- NEW `REPORTS/Claude/Remote-Access-v1-Stage-4D-Phone-Field-Test-Instructions__20260923__Claude.md`
- Deployed to Fly (one Machine, `d8d2e5ec975128`, still `started`, health 1/1).

## Fly client-IP resolution
`CLIENT_IP_SOURCE=fly`: limiter identity is ONLY the `Fly-Client-IP` header, accepted only if a syntactically valid IPv4/IPv6 (`net.isIP`); missing/invalid → socket peer. It is never forwarded (not in the 7-header allowlist, verified in a test with a live host frame), never logged raw (only the existing 12-hex hash appears; tested with an address that is asserted absent from events). Generic `TRUST_PROXY` remains `false`.

## Spoof-resistance (empirical, production)
130 requests, each forging a different `Fly-Client-IP` **and** `X-Forwarded-For`: exactly 120 were served and requests 121–130 were `429`; an honest request afterwards was also `429`; every logged `rate_limit` event carried the **same** hashed client. So Fly overwrote the client-supplied header (not attacker-selectable), and spoofed XFF/Fly-Client-IP cannot change the bucket.
**Proof the header is the real client and not just the edge address:** while the desktop's bucket was exhausted (its next authenticated request returned `429`), the Chromebook on cellular kept polling and all **130/130 polls returned 200** — distinct identities.

## Rate-limit behaviour
- Independent identities: desktop exhausted, cellular client unaffected (above).
- Normal use: ~137 polls + page requests in ~8 min ≈ 17–20 requests/min, far below 120/min; limits were **not** raised.
- Handshake limit: 14 correct-key upgrade attempts in a minute → 10 accepted, then `429` ×4. Consecutive-failure ban not triggered (test sequence kept ≤ 4 failures and used a successful registration to reset).
- Pairing bucket verified in 4A tests; pairing semantics unchanged.

## Enrollment-key rotation
A new 256-bit key was generated, imported to Fly via stdin (`fly secrets import --stage`, then deployed), never printed. The same session value fed the test daemon environment. **The local session copy, throwaway daemon home, logs and scratch files were deleted at the end**; the value now exists only in Fly (unreadable). It was never written to Sideline preferences/device files (scanned) or to any log (checked: 0 matches in Fly logs and daemon logs). Repeat rotation is needed before the real desktop is bootstrapped (breadcrumb).

## Pairing test mechanism
Existing protocol only: operator created a 5-minute single-use code via the local-only API; Dad exchanged it from the Chromebook DevTools Console (`fetch('/api/pairing/exchange', …)`). Result: `PAIR STATUS 200`, then the authenticated Sideline UI loaded over the hotspot ("Coach Online" green; Game Unknown/Offline is expected for the throwaway daemon). One code was accidentally sent to a search engine by a typo; it was unused and expired.

## Cellular results
| Item | Result |
|---|---|
| RA4D-1 TLS / host origin | Valid Let's Encrypt wildcard, no warning, correct host routing on Android Chrome (cellular) and Chromebook (hotspot) |
| RA4D-2 device auth | Authenticated UI and `/api/status` → 200 (137/137-style polls all 200 except deliberate outages); no credential → 401, invalid credential → 401 (production, desktop). Sliding cookie: observed server-side in 4C, not observable client-side (HttpOnly) |
| RA4D-3 local-only isolation | `/api/devices` 403; admin Bearer + cookie on local-only 403; Bearer alone 401; `?token=` 401 (production, desktop path) |
| RA4D-4 mutation security | wrong Origin 403; missing action header 403; correct Origin + action reaches routing (404 for a non-existent queue item — no real work performed) |
| RA4D-5 SSE 10+ min | **795 s (13.25 min)** continuous over the hotspot: first events (hello, status, ai-health, execution) at **136 ms**; **52 heartbeats, every 15.0 s (gaps 14.9–15.1 s)**; stream never ended, no error, one measuring stream (plus the page's own), no reconnect loop, no buffering. A parallel desktop stream over the same production path: 47 heartbeats at 15 s over 12 min, never closed |
| RA4D-6 live state change | 4 deliberate local changes (timeFormat toggles) each reached the phone-network client as a `status` event with a constant ≈12.7–13.1 s offset that equals the client/script start skew, i.e. sub-second latency; one additional `status` at 54 s coincided with my security-matrix pairing |
| RA4D-7 desktop offline | Test daemon stopped → public host returned `503 host_offline` within 1 s; Chromebook poll recorded `503 host_offline` at 43 s; its SSE ended with a network error (expected) |
| RA4D-8 desktop returns | Daemon restarted with the same identity/config → outbound WSS reconnect, fresh challenge/hello, host live again **2 s** after daemon start; Chromebook polls returned `200` again at 69 s **without re-pair** |
| RA4D-9 network transition | Chromebook Wi-Fi off ≈29 s then back on hotspot: polls `ERR` 168–197 s then `200`; a new stream opened afterwards worked (hb=2 chunks=4); desktop relay state unaffected (host stayed registered; no leaked in-flight requests) |
| RA4D-10 relay restart | `fly machine restart` while connected: relay drained and exited cleanly, restarted, host re-registered; public host serving **11 s** after the command began; local Sideline `200` before and after; the client's SSE ended with a network error at the restart and a re-opened stream worked (`status 200`, hb=3, still open) with no re-pair. The status poll did not record a gap during the restart (poll cadence was sparse — 137 polls in 495 s — so this phase rests on the SSE end/re-open evidence plus my server-side timings) |

## Production security matrix (real relay, bounded counts)
1 missing enrollment key → `403`; 2 wrong key → `403`; 3 forged Ed25519 signature → close `4403`; 4 replay → second hello on a consumed nonce `4401`, replay on a fresh challenge `4403`; 5 malformed host (`h-short`, `foo.`) → `404`; 6 well-formed unknown host → `503 host_offline`; 7 Host A/B isolation → B never received A's request and could not answer it; 8 wrong/missing Origin, missing action → `403`; 9 Bearer elevation → `403`/`401`; 10 `?token=` → `401`; 11 body > 1 MiB → `413`; 12 malformed frame → close `1002` (unknown frame pre-handshake `4401`); 13 handshake flood → 10 accepted then `429`; 14 HTTP limit → 121st request `429`; 15 limiter independence (desktop vs cellular) → proven; 16 secrets absent from logs → see audit. **All passed.** No DoS load (max 130 requests/burst).

## Resource observation (Machine `shared-cpu-1x` / 256 MB)
Sampled at start, +8 min, +11.7 min from inside the Machine: node RSS **65 → 63 → 63 MB**, `MemAvailable` **134–135 of 207 MB**, load average **0.00–0.01**, relay uptime advanced continuously (2355 s → 3057 s, no restarts except the deliberate one). Conclusion: 256 MB / shared-cpu-1x is comfortably sufficient; not scaled.

## Log audit
Latest 100 Fly log lines after the full field test plus a fresh sentinel burst (cookie, Authorization, query strings, request body): **0 matches** for the real enrollment key, `SENTINEL*`, `sl_dev`, `Bearer`, `authorization`, `cookie`, `token=`, `secret`. Only `0.0.0.0` and `127.0.0.1` appear (Fly proxy error text); **no public/client IP addresses**, no query strings. Fields seen: `ts, event, hostPublicId, method, path (no query), status, bytes, durationMs, client (12-hex hash), scope, code, phase`. The daemon's own logs and the Sideline data directory contain no key.

## Local tests
- `npm run compile`: clean.
- 4D client-IP (4) + 4C bootstrap (3) + 4A hardening (13) + Stage 3 (48): **68 tests, 68 pass, 0 fail, 0 skipped, 0 cancelled**.
- Stage 1 + 2 (rerun as a precaution): 40 tests, 39 pass, 0 fail, 1 expected Windows POSIX skip.

## Dad-facing friction
| Friction | Class |
|---|---|
| Pairing needed a hand-typed DevTools/`javascript:` command; Android Chrome cannot run it | **STAGE 5 UI WILL REMOVE THIS** (Send to Phone + QR/link pairing page) |
| No browser pairing route (`/pair#secret` does not exist) | **STAGE 5 UI WILL REMOVE THIS** |
| Unauthenticated origin shows raw `{"success":false,"message":"Unauthorized"}` | **STAGE 5 UI WILL REMOVE THIS** (friendly landing/pair page) |
| 5-minute pairing-code window is tight for hand-driven steps | Stage 5 UI removes it (instant scan) |
| No client-side reconnect UI: streams end on network loss / relay restart until the page reloads | Mostly Stage 5 UX (auto-reconnect and status banner); transport recovers on its own within seconds, so **not a transport problem** |
| **The desktop daemon exits after 30 min idle when no Stadium/VS Code session is connected, taking Remote Access offline** (happened to the test daemon; remote traffic does not count as activity) | **TRANSPORT / ARCHITECTURE PROBLEM** — decide for 4E/Stage 5 whether remote clients or Remote Access being enabled should hold the daemon alive |
| Fly log retention (~100 lines) limits after-the-fact audits | Operator tooling note, not Dad-facing |

## Dad zero-setup invariant
Fly, DNS, TLS, relay URL, enrollment secret, environment variables, hotspots and DevTools steps were operator/test work only. None of it is a product step: Dad's target flow stays Enable Sideline Coach → Run Plays → Send to Phone → Connect.

## Breadcrumbs for 4E / Stage 5
1. Rotate the enrollment key again (Fly-only now) before bootstrapping Dad's real desktop; supply it to the daemon environment without persisting it.
2. Decide the daemon idle-timeout policy vs Remote Access (see friction table).
3. Shared enrollment key is private-beta only; before broad distribution replace with per-installation, server-authorized enrollment that keeps zero-setup.
4. Run the final rollback proof (4E); capture Fly logs continuously (tail to file) for the final audit.
5. Native Android end-user pairing test belongs to Stage 5 UX acceptance.

**COMPLETED:** 2026-09-23 11:05 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-4D-Real-Cellular-Acceptance__20260923__Claude.md
