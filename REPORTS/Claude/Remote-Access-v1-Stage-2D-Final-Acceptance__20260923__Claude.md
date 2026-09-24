**COMPLETED:** 2026-09-23 5:56 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 · Stage 2D — Final Acceptance & Regression Gate

**Agent:** Claude Code (Sonnet 5, medium) · No commit, no push.

## Verdict: **STAGE 2 GO**
Stage 3 was NOT started (no RelayClient, `ws`, WSS, relay, UI, or extension work).

## Production files changed
**None.** No Stage 2 defect was exposed by the acceptance tests.

## Test file changes
`test/remote-access-v1-stage2.test.mjs` — added `fileURLToPath` import and RA2D-1…RA2D-11 (11 tests) on top of 2A/2B/2C.

## Acceptance results (all PASS)
| Category | Items | Proven by |
| :--- | :--- | :--- |
| Host identity | 1–5 | RA2A-1…4 (generate once, stable reload, corrupt fails closed and untouched, runs on Windows; POSIX mode assertion conditional/skipped on Windows) |
| Pairing | 6–18 | RA2B-1…5, RA2D-1, RA2D-2: local-admin-only create; 16-byte secret (200 samples, unique); code = 8 chars from the approved 30-char alphabet, drawn from its own `randomBytes`, not derived from the secret; no raw secret/code in any file under the daemon dir; single use; reuse fails; expiry (injectable clock); 5th failure burns the whole pairing (both methods); memory-only (nothing after daemon restart); new pairing supersedes the old; every failure returns the identical generic 401 body `Pairing could not be verified.` with no cookie |
| Device registry | 19–29 | RA2B-6…8, RA2D-3: device minted on exchange; raw 256-bit token never on disk; record keys exactly `deviceId, tokenHash, label, createdAt, lastSeenAt`; `list()` has no hash; rename / revoke / revoke-all; 30-day idle rejection; `lastSeenAt` slides; reload keeps valid devices; corrupt/malformed file honors no credential (old credential stays dead after replacement) |
| Loopback isolation | 30–32 | RA2B-6, RA2C-8, RA2D-4: loopback `sl_dev` → 401 on `/api/status` and `/api/events`; Bearer and `sl_local` unchanged (valid 200, wrong/forged 401); source check that the daemon never constructs `remote-device` and `resolvePrincipal` mentions neither `sl_dev` nor `remote-device` |
| Adapter auth | 33–37 | RA2C-1, RA2C-2, RA2D-4: valid authenticates; invalid/revoked/expired → 401 with the daemon seam never called; `remote-device` constructed only in `remote-dispatch.ts`, seam typed to `Extract<Principal,{kind:'remote-device'}>`, `handleHttpRequest` private |
| Bootstrap exception | 38–42 | RA2C-6, RA2D-5: only exactly `POST /api/pairing/exchange` (query allowed, no broadening) enters without `sl_dev`; GET/PUT/DELETE, trailing slash, sub-path, wrong case, `%2F`, query-embedded exchange path, `pairing/create`, `devices`, `dispatch` all get 401 without reaching the daemon; exchange with a wrong secret stays 401; the `'unpaired'` placeholder only appeared on the exchange dispatch and never on any authenticated route (all others carry the real device id) |
| Auth elevation | 43–46 | RA2C-3, RA2D-6: valid admin Bearer / `proxy-authorization` cannot elevate (local-only stays 403; Bearer alone 401); those headers plus `cookie` and `x-forwarded-for` are stripped before the daemon sees the request; `?token=` (admin token) → 401; forged `x-sideline-principal`, `x-principal-kind`, `x-remote-device`, `sl_local` cookie, `?principal=` / `?deviceId=` have no effect (principal is always the adapter's, with the registry's device id) |
| Route policy | 47–50 | RA2C-1, RA2C-3, RA2D-7 (status codes below) |
| CSRF / origin | 51–55 | RA2C-4: no action header 403; foreign Origin 403; missing Origin 403; spoofed Host + matching-looking Origin 403; trusted `expectedOrigin` + action header reaches routing (404 for an unknown work id) |
| Redaction | 56–58 | RA2D-8 end-to-end through the adapter: an `sk-ant-…` key and a Bearer line in a report are `[redacted]` for the remote device, verbatim for local-admin, and still redacted after enabling `remoteSensitiveTerminalOutput`; ordinary text preserved. (RA1-7 covers the >8 KB and terminal-path cases.) |
| Response framing | 59–61 | RA2C-1, RA2D-9: `head`,`data`,`end`; status and headers preserved incl. `content-type` |
| Sliding cookie | 62–66 | RA2C-5, RA2C-6, RA2D-9: refresh is exactly `sl_dev=<same token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`; no file under the daemon dir contains the raw token; invalid/revoked/expired get none; an authenticated 404/403 refreshes; exchange still issues its single cookie |
| SSE | 67–70 | RA2C-7, RA2D-10: head `text/event-stream`; `hello`, `status`, `ai-health`, `execution` as separate data frames; a `: hb` heartbeat frame arrives after ~15 s; stream stays open |
| Cancellation | 71–75 | RA2C-7, RA2D-10: `cancel(id)` emits request `close`; `sseClients` 1 → 0 (subscriber + heartbeat cleared); no data after cancel even on broadcast; repeat cancel is a no-op |
| Route classification | — | RA1-3 / RA1-4 (Stage 1) plus RA2D-11: every `/api/...` literal in `daemon.ts` is classified; unlisted methods/paths (`GET /api/pairing/exchange`, `PUT /api/devices`, trailing slash) are denied |

## Actual deny-path status codes (through the adapter, valid device cookie)
| Request | Status |
| :--- | :--- |
| GET `/api/status`, GET `/api/preferences` (remote-read) | 200 |
| POST `/api/queue/x/cancel` without `X-Sideline-Action` (remote-mutate) | 403 |
| POST `/api/queue/x/cancel` with action + trusted Origin | 404 (reached routing) |
| GET `/api/diagnostics`, GET `/api/devices`, DELETE `/api/devices`, POST `/api/preferences`, POST `/api/session`, POST `/api/pairing/create`, POST `/api/games/files/absolute-path`, POST `/api/scout/openrouter-credential`, POST `/api/players/p1/field`, POST `/api/game/add` (local-only) | 403 |
| POST `/api/control-plane/shutdown` (local-only) | **401** (freshness handler answers non-local principals with 401) |
| GET `/stadium` | **404** (non-`/api/` paths never reach classification) |
| No/invalid/revoked/expired `sl_dev` | 401 |
| `?token=` | 401 |

In every deny case the remote-device gained no capability.

## Test counts
- `npm run compile` — clean.
- `node --test test/remote-access-v1-stage2.test.mjs` — **31 tests: 30 pass, 0 fail, 1 skipped** (RA2A-4, POSIX mode, Windows).
- `node --test test/remote-access-v1-stage1.test.mjs` — **9 tests: 9 pass, 0 fail**.
- Final adjacent gate (`npm run compile; node --test` stage1 + stage2 + live-player-terminal-v02-transport + live-player-console-first-down) — **82 total, 81 passed, 0 failed, 1 skipped, 0 cancelled, 0 todo; duration ~16.5 s**.

## Windows compatibility
Full suite runs on Windows. Only the POSIX permission-bit assertion is skipped (expected). No POSIX-only runtime assumptions were added.

## Remaining non-blocking breadcrumbs
1. NTFS ACL hardening for `host-key.json` / `devices.json` (Node modes don't map to ACLs on Windows).
2. Remote `POST /api/control-plane/shutdown` returns 401 and remote `/stadium` returns 404 (refused via different layers than 403); consider harmonizing later, not a security gap.
3. Authenticated remote 403/404 responses refresh the device cookie (permitted by design).
4. Frame headers are single-valued (`Record<string,string>`); multi-value headers are comma-joined.
5. Pairing failures are counted against the single active pairing (a wrong guess can't be attributed to a pairing), so a stray failed exchange attempt counts toward the 5-failure burn.
6. `POST /api/pairing/exchange` has no origin/CSRF check (public, secret-gated by design); revisit when the real transport defines the origin story.
7. Stage 3 items (RelayClient/WSS, backpressure, reconnect, relay-domain `expectedOrigin`) intentionally untouched.

## Gate decision
2A, 2B, 2C contracts green; all Stage 2 acceptance tests green; Stage 1 security green; terminal/console adjacent suites green; no unresolved security blocker.

**STAGE 2 GO**

**COMPLETED:** 2026-09-23 5:56 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md
