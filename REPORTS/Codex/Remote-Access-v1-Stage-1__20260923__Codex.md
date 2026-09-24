# Remote Access v1 — Stage 1 Local Security Foundation

Date: 2026-09-23  
Implementation Player: Codex  
Authority: `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md`

## Outcome

Stage 1 is implemented and its focused and adjacent acceptance suites are green. This work does not add a relay, pairing, GitHub integration, or a Remote Access cloud service.

The local browser now exchanges a fragment bootstrap credential for an httpOnly session cookie, every daemon route is covered by a default-deny access classification, cookie mutations have CSRF/origin protection, SSE is hardened, and output crosses a shared remote-redaction boundary. Local extension/CLI Bearer authentication remains available.

Remote terminal/activity presentation is redacted by default. The new Dev-only preference can remove only the additional remote terminal-detail mask; hard secret redaction and all route/file/credential boundaries remain mandatory.

## Files changed for Stage 1

### Runtime and UI

- `package.json` — documents fragment-to-cookie browser bootstrap in the public URL setting.
- `src/control-plane/daemon.ts` — principal resolution, session exchange, route enforcement, cookie mutation checks, principal-aware SSE/output, heartbeat, and preference endpoint support.
- `src/control-plane/request-security.ts` — accepted principal types, timing-safe comparison, cookie parsing, and same-origin comparison.
- `src/control-plane/remote-routes.ts` — exhaustive default-deny daemon route policy.
- `src/remote-redaction.ts` — shared remote-safe redaction boundary and narrow terminal override seam.
- `src/player-activity.ts` — reuses the shared hard-secret redactor instead of owning a duplicate rule set.
- `src/running-players.ts` — persisted `remoteSensitiveTerminalOutput` preference; default `false`.
- `src/public/index.html` — fragment exchange, cookie-authenticated API/SSE, CSRF action header, and the Dev-only terminal-output setting.
- `src/extension.ts` — browser launch/copy URL uses `#token=...` rather than query authentication.
- `src/stadium-client.ts` — trusted local Stadium authentication moved from WebSocket query data to the Authorization header.

### Tests and harness migrations

- `test/remote-access-v1-stage1.test.mjs` — focused Stage 1 acceptance coverage.
- `test/add-game-adoption-and-serving-freshness.test.mjs`
- `test/add-game-endpoint.test.mjs`
- `test/add-game-exact-folder-authority.test.mjs`
- `test/control-plane-roster-projection.test.mjs`
- `test/fixtures/q2-10f-2-lifecycle-trace.mjs`
- `test/health-authority-daemon.test.mjs`
- `test/p0-1-control-plane-freshness.test.mjs`
- `test/q2-10f-2-browser-execution-store.test.mjs`
- `test/q2-10f-2-execution-projection.test.mjs`
- `test/q2-10f-2-lifecycle-e2e.test.mjs`
- `test/s55-0-settings-hierarchy.test.mjs`
- `test/stadium-bridge.test.mjs`

The migrated integration/browser harnesses now perform the same fragment/session-cookie flow as the product instead of appending `?token=`.

### Durable breadcrumbs

- `Project SOP/Breadcrumbs/Remote-Access-Architecture.md`
- `Project SOP/Breadcrumbs/Settings-Information-Architecture.md`
- Source ownership comments in `src/control-plane/remote-routes.ts`, `src/remote-redaction.ts`, `src/player-activity.ts`, and `src/public/index.html`.

## Security contracts implemented

### Principals and authentication

- `local-admin`, authenticated by a trusted Bearer header or local browser session cookie.
- `remote-device`, accepted only as an in-process injected principal for the later relay stage; it cannot be forged from HTTP headers, cookies, or query parameters.
- Secret/token comparisons use `crypto.timingSafeEqual`; unequal lengths take a constant-work SHA-256 comparison path before returning false.
- `POST /api/session` accepts the existing trusted local Bearer token and issues `sl_local`, a random 256-bit session value. Only its SHA-256 digest is held in daemon memory. The cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` with a 30-day maximum age.
- URL query token authentication is explicitly rejected. The page reads `#token`, immediately removes it with `history.replaceState`, exchanges it once, and keeps no browser-readable token copy.
- `EventSource` connects to `/api/events` with the session cookie; its URL contains no token.
- Stadium remains a trusted local Bearer flow, but the Bearer value is no longer in its WebSocket URL.

### Default-deny route policy

`DAEMON_ROUTE_POLICIES` classifies every current route/method as `public`, `local-only`, `remote-read`, or `remote-mutate`. Unknown method/path combinations receive no access classification and cannot reach a handler. A focused test extracts daemon route literals and exact handlers and fails on omissions.

Local-only coverage includes Control Plane lifecycle, session minting, Stadium, diagnostics, Player lifecycle, Scout credential/bootstrap/formation administration, preference mutation, Game lifecycle, absolute-path resolution, and filesystem mutation. A remote principal is allowed only through routes explicitly marked remote-read or remote-mutate.

### Cookie mutation security and CORS

Cookie-authenticated non-GET/HEAD requests require both:

- `X-Sideline-Action: 1`; and
- an `Origin` whose host exactly matches the request `Host`.

Trusted local Bearer flows retain their existing non-browser mutation behavior. Wildcard CORS headers and the old shared wildcard-CORS helper are removed.

### SSE robustness

- 15-second comment heartbeat (`: hb ...`).
- `Cache-Control: no-cache, no-transform`.
- `X-Accel-Buffering: no`.
- Existing `hello` plus initial status/AI-health/execution resync is preserved.
- Heartbeat timers are cleared on disconnect and daemon shutdown.

### Remote redaction and terminal override

The former Player Activity secret-pattern set now lives in `src/remote-redaction.ts` and is shared by the remote boundary. Remote status/SSE payloads, report lists, report bodies, and terminal/activity responses pass through principal-aware redaction where policy requires it. There is no general file-content-serving route in Stage 1; the shared helper is the required seam for the designated-path file-content route planned later by the ADR. Local trusted projections remain unchanged.

`remoteSensitiveTerminalOutput`:

- is persisted through the existing preferences file contract;
- defaults to `false`;
- appears only with advanced Player Terminal settings in Dev Mode;
- affects only authenticated remote terminal/activity presentation;
- is effective only when Dev Mode is also on; and
- when enabled, removes only the extra remote absolute-home-path mask.

Hard secret rules always run first and cannot be disabled. The preference does not affect credential stores, API/provider secrets, SSH/private keys, Git credentials, blocked files/extensions, local-only routes, or protected file-access policy. No unredacted secret twin is stored or transported.

## Acceptance evidence

Focused Stage 1 suite:

```text
node --test test/remote-access-v1-stage1.test.mjs
8 passed, 0 failed
```

The suite proves browser URL/SSE credential removal, timing-safe comparison, complete route classification, remote denial of local-only routes, cookie CSRF/origin enforcement, no wildcard CORS, SSE headers/initial resync/heartbeat, shared redaction behavior, hard-block preservation, and preference default/save/UI gating.

Relevant adjacent suites:

```text
node --test \
  test/live-player-terminal-v02-transport.test.mjs \
  test/live-player-console-first-down.test.mjs \
  test/stadium-bridge.test.mjs \
  test/p0-1-control-plane-freshness.test.mjs \
  test/health-authority-daemon.test.mjs \
  test/q2-10f-2-browser-execution-store.test.mjs \
  test/q2-10f-2-lifecycle-e2e.test.mjs \
  test/q2-10f-2-execution-projection.test.mjs \
  test/s55-0-settings-hierarchy.test.mjs \
  test/ai-usage-scoreboard-ui.test.mjs \
  test/scout-bootstrap.test.mjs \
  test/scout-continuation.test.mjs \
  test/control-plane-roster-projection.test.mjs
245 passed, 0 failed
```

Combined focused/adjacent result: **253 passed, 0 failed**. This includes the Live Player Terminal, mobile Scoreboard coexistence/UI, Stadium bridge, daemon freshness, browser execution/lifecycle, Settings hierarchy, Scout, and roster projection paths.

Compile:

```text
npm run compile
tsc -p ./
exit 0
```

`npm test` was also sampled against the pre-existing dirty worktree. It is not globally green for unrelated/stale expectations already present in that worktree: an AI-health hydration fetch-count expectation, a Player control method-list expectation (plus its cleanup follow-on), one CRLF-sensitive source regex, and intermittent APD/Scout-continuation cases that pass in their focused suites. Stage 1's focused and relevant adjacent suites above are green.

## Remaining risk / next-stage boundary

- The Stage 2 remote frame transport does not exist yet, by design. The in-process `remote-device` entry seam and route/redaction policy are implemented, but full relay/pairing end-to-end enforcement cannot be exercised until that transport is built.
- Local browser sessions are daemon-memory state. A daemon restart invalidates them and requires reopening through a fresh fragment bootstrap; this avoids a second durable credential store.
- Text redaction is defense in depth, not authorization. Hard protection continues to depend on route classification and protected file/credential boundaries; future remote routes must be classified in the same change that introduces them.
- No commit or push was performed.
