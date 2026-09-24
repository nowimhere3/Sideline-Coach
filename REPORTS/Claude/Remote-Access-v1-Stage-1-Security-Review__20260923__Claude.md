# Remote Access v1 · Stage 1 Security Review

**Reviewer:** Claude Code (Opus 5.5, medium) · **Date:** 2026-09-23 · **No runtime source modified. No commit, no push.**

**Reviewed:**
- `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md`
- `REPORTS/Codex/Remote-Access-v1-Stage-1__20260923__Codex.md`
- Stage 1 source seams:
  - `src/control-plane/request-security.ts`, `remote-routes.ts`
  - `src/remote-redaction.ts`
  - `src/control-plane/daemon.ts`, around lines 1057–1160, 1245–1268, 3244–3300, 3833–3847
  - `src/public/index.html` bootstrap and API
  - `src/extension.ts:358`

**Re-verified:**

| Check | Result |
|---|---|
| `npm run compile` | clean |
| `test/remote-access-v1-stage1.test.mjs` | 8/8 |
| wildcard CORS in `src/` | none |
| query-token URLs in the extension, Stadium or page | none |

---

## 1. VERDICT: **PASS WITH REQUIRED FIXES**

Codex implemented Stage 1 faithfully. The two required fixes are **latent**: they only become exploitable once a `remote-device` principal can exist, and none can exist until Stage 2.

**Verified correct:**
- **Principal boundary:**
  - `remote-device` enters only through the private in-process `injectedPrincipal` parameter, and nothing calls it yet. No header, cookie or query value can produce it.
  - An injected phone principal takes priority over any Bearer token the request carries.
- **Query credentials:** any request with a `token` query parameter gets 401. `/stadium` uses the `Authorization` header.
- **Cookie bootstrap:**
  - The page reads `#token` and clears it immediately.
  - It exchanges the token once over a Bearer header at `POST /api/session` (which a remote principal can't reach) for an `sl_local` cookie: 256-bit random, only its SHA-256 held in memory, `HttpOnly; Secure; SameSite=Lax`.
  - There's no `sessionStorage` token, and `EventSource('/api/events')` carries no credential.
- **Timing-safe comparisons:** all secret comparisons go through `timingSafeSecretEqual`. Unequal lengths still do constant work via a hash before returning false.
- **Default-deny:**
  - An unclassified method or path gets 404/405 **before** authentication.
  - Shutdown, session minting, diagnostics, Player lifecycle, Scout credential/bootstrap/formation, preference writes, Game lifecycle, absolute-path lookup and filesystem mutation are all `local-only`.
- **CSRF (local cookie):** cookie non-GET requests need `X-Sideline-Action: 1` plus an Origin matching the Host. This applies even to POST routes classified `remote-read`. The page sends the header on every non-GET request.
- **CORS:** wildcard CORS has been removed.
- **SSE:** cookie-authenticated, with a 15 s `: hb` heartbeat, `no-cache, no-transform`, `X-Accel-Buffering: no`, and the `hello`/status/ai-health/execution resync. Timers are cleared on disconnect.
- **Shared redaction:** `redactForPrincipal` is verbatim for `local-admin` and runs hard secret redaction for phones. Status, reports, the report body, player-activity and SSE broadcasts are all wired through it.

**Required Dev-override invariant: satisfied.**
- **What it can do:** the override only skips the extra home-folder path mask. The hard secret rules always run first.
- **When it applies:** only when all three hold — the principal is `remote-device`, `devMode` is on, and `remoteSensitiveTerminalOutput` is on (default `false`).
- **Who can enable it:** the preference is written only through `POST /api/preferences` (`local-only`), so a phone can't turn it on.
- **What it can't touch:** credential, blocked-file, route and Git/SSH boundaries are enforced upstream and are unaffected.

---

## 2. Required fixes (ranked)

### 1. HIGH (latent): remote principals bypass CSRF/Origin enforcement

`daemon.ts:1151` runs the `X-Sideline-Action` + Origin check only when `principal.authenticatedBy === 'cookie'`.

- The ADR's `remote-device` principal is `authenticatedBy: 'in-process'`, but it comes from a phone browser carrying the `sl_dev` cookie.
- So every phone mutation would skip CSRF protection.
- The current check also compares Origin to the `Host` header. The relay's header allowlist (ADR D3) doesn't forward `Host`, so for remote requests Origin must be compared with the host's known public origin.

**Fix:**
- Enforce the check when `principal.kind === 'remote-device' || principal.authenticatedBy === 'cookie'`.
- For `remote-device`, compare Origin with the expected public origin (`https://h-<hostPublicId>.<relay-domain>`).
- **Test:** a remote mutation missing the header, or with a foreign Origin, gets 403.
- **Must land before any remote dispatch path is connected.**

### 2. MEDIUM: remote redaction silently truncates payloads at 8,000 characters

`redactSecrets` does `String(text).slice(0, REGEX_INPUT_CAP)` with `REGEX_INPUT_CAP = 8000`. `redactForPrincipal` applies it to **every string** in a remote payload, so these are cut off beyond 8 KB:
- remote report bodies (`/api/report`);
- status fields;
- SSE payload strings.

**Fix:** redact the **entire** string without truncating it, using chunked scanning with overlap or bounded-time patterns. Merely scanning the first 8 KB would leak any secret after that point.

**Test:** a report longer than 8 KB with a secret after the 8 KB mark comes back at full length with that secret redacted.

---

## 3. Non-blocking observations

- **Revocation and SSE:** SSE captures its principal at connect. Stage 2 must also close live streams when a device is revoked.
- **Public health endpoint:** `/api/health` is public and returns pid, uptime and instance identity. Consider trimming it for remote principals in Stage 2.
- **False positives:** the 40+ character letter-and-digit redaction rule will also redact git SHAs and long IDs in remote reports. That is an acceptable trade-off.
- **Safari and `Secure` cookies:** the `Secure` cookie on plain `http://127.0.0.1` works in Chromium and Firefox, but older desktop Safari may drop it. The HTTPS dev bridge is unaffected.
- **Local Origin check:** it compares Origin to Host. That is safe today because the cookie is scoped to `127.0.0.1`. A loopback `Host` allowlist would add defence in depth.
- **File browse/search:** remote-read `/api/games/files/browse` and `/search` responses skip `redactForPrincipal`. They return file names, not contents. Decide this explicitly when Stage 2 exposes them.
- **No-token fallback:** `resolvePrincipal` returns `local-admin` when no admin token is configured. This behaviour predates Stage 1, and remote dispatch injects its principal, so it doesn't depend on this.
- **Full test run:** `npm test` isn't globally green, but the failing tests Codex reported are pre-existing and unrelated.

---

## 4. Stage 2 go/no-go

**GO,** on condition that required fixes 1 and 2 are Stage 2's **first** changes, each with its test, before any remote dispatch path is connected.

No `remote-device` principal can exist today, so neither issue is currently exposed.

## 5. Smallest implementation Player

**Codex (medium effort)**, or a Claude Sonnet-class implementer. These are two small, targeted changes in `src/control-plane/daemon.ts` and `src/remote-redaction.ts`, each with one focused test.
