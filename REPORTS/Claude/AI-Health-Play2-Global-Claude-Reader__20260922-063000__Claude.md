# AI Health — Play 2: Global Claude Reader + Persistent Scoreboard

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Depends on:** Play 1 (real `unifiedWindows` shape repair) — complete and unmodified by this Play.

## Files changed

**New**
- `src/control-plane/claude-usage-reader.ts` — `readClaudeUsageOnce()` (ported from `Ai Usage - Real Time/src/providers/claude.js` `collectClaudeUsage`, ES module / TS, no token refresh path), `canonicalClaudeWindowsFromOAuth()`, and the `ClaudeUsageReader` class (immediate-read-then-`setTimeout`-chain lifecycle, shared in-flight promise, bounded backoff, cadence allowlist).
- `test/claude-usage-reader.test.mjs` — 18 focused tests on the reader/pure functions.
- `test/claude-usage-reader-daemon.test.mjs` — 10 daemon-integration tests (one reader per daemon, refresh endpoint, preference wiring, security).

**Modified**
- `src/control-plane/health-authority.ts` — `ClaudeProviderHealthState.evidenceType` is now `'rate_limit_event' | 'oauth_usage'` (provenance of the most recent accepted change). New `HealthAuthority.ingestClaudeUsage(windows)`: accepts an already-trusted canonical read from the reader (bypasses the wire-evidence validator entirely — it is never reachable from a Stadium/network notification), converges through the exact same `mergeClaudeRateLimitInfo` / `claudeRateLimitInfoUnchanged` used by push, so push and the reader can never become competing truths and identical windows never cause a false SSE/persistence write.
- `src/running-players.ts` — new `aiUsageRefreshSeconds: 10|15|20|25|30` preference, default `10`, validated by `isAiUsageRefreshSeconds`.
- `src/control-plane/daemon.ts` — `DaemonOptions.claudeUsage` (off by default); constructs exactly one `ClaudeUsageReader` when enabled, wired to `healthAuthority.ingestClaudeUsage`; `start()`/`stop()`/`cleanExitHandler` own its lifecycle; `GET /api/ai-health` gains a sibling `acquisition` field; new `POST /api/ai-health/refresh` (token-guarded like every other `/api/*` route) forces a read, joins any in-flight request, and reports `changed | unchanged | <failure code>`; `POST /api/preferences` accepts `aiUsageRefreshSeconds` and calls `reader.setCadenceSeconds(...)` on the same instance — no second reader is ever created; production entry point (`require.main`) enables the reader unless `SIDELINE_CLAUDE_USAGE=0`.
- `src/public/index.html` — persistent bottom Compact Scoreboard, Claude/Codex divider alignment fix, `Rehydrate` → `Refresh Health` (real `POST /api/ai-health/refresh`), and the AI Usage Refresh Frequency settings card.
- `test/health-authority.test.mjs`, `test/q2-10a-provider-control.test.mjs`, `test/s54-4-terminal-success-retention.test.mjs`, `test/ai-usage-scoreboard-ui.test.mjs`, `test/s55-1-finished-state-and-time-format.test.mjs` — updated/extended for the new preference field, `ingestClaudeUsage`, and the Play 2 UI requirements.

## Design simplification vs. the Opus architecture doc

Opus's write-up proposed a `ProviderHealthSource` union (`{kind:'control-plane', reader:'claude-oauth-usage'}`) and a wire-level `oauth_usage` `HealthEvidence` variant in `protocol.ts`. I did not implement that: `ingestClaudeUsage` is a **separate, non-wire entry point** on `HealthAuthority` that the reader's callback invokes directly in-process. This gets the same outcome (one converged store, no competing truth, canonical-window dedupe) with a smaller, lower-risk diff — `protocol.ts`, `stadium-client.ts`, and the Stadium wire contract are completely untouched, and there is no code path by which a Stadium `health.evidence` notification could ever inject `oauth_usage` evidence (the validator for wire evidence still only recognizes `rate_limit_event`/`account_rate_limits`), which was the actual security property Opus's design was protecting.

## Refresh cadence actually configured

- **Default: 10 seconds** (per this Play's product decision, not Opus's original 15s recommendation).
- Allowlist: exactly `10 | 15 | 20 | 25 | 30`; anything else (including any value under 10) is rejected by both `isClaudeUsageCadenceSeconds` (reader) and `isAiUsageRefreshSeconds` (preference validator / `POST /api/preferences`).
- Backoff on failure: `30s → 60s → 120s → 300s` cap, verified by test; HTTP 429 `Retry-After` is honored when it implies a longer wait than the current backoff step.
- Recovery: the very next successful read returns cadence to the user's configured value (test-verified).
- `setTimeout` chain (never `setInterval`); every scheduled timer calls `.unref()` so it can't hold the process open.

## Push + read convergence

Both sources funnel into `HealthAuthority`'s single `providers.claude` slot via the shared `mergeClaudeRateLimitInfo`/`claudeRateLimitInfoUnchanged` helpers from Play 1. Verified by test: push then reader with identical canonical windows produce exactly one change (not two); a changed window from either source produces one change and is visible in the same snapshot the Scoreboard and `GET /api/ai-health` both read; a failed reader acquisition never touches the store — last-known-good facts persist untouched.

## Proof: exactly one global reader

- `ControlPlaneDaemon` holds a single `private readonly claudeUsageReader: ClaudeUsageReader | undefined` field, constructed once in the constructor only when `options.claudeUsage.enabled`.
- Test: the default constructor (no `claudeUsage` option) never creates a reader — `daemon.claudeUsageReaderInstance` is `undefined`.
- Test: `daemon.claudeUsageReaderInstance` returns the identical instance across repeated access and across `start()`/`stop()`.
- Games, Stadiums, and browser tabs never construct a reader of their own — they all read the one daemon-owned `HealthAuthority` snapshot over `GET /api/ai-health` / SSE `ai-health`, exactly as before. Opening additional Game windows or browser tabs cannot multiply provider requests because nothing outside the daemon ever calls the OAuth endpoint.
- `POST /api/preferences` with a new `aiUsageRefreshSeconds` calls `reader.setCadenceSeconds(...)` on that same instance (test-verified) — it never constructs a second reader.

## Proof: no credential leakage

- `readClaudeUsageOnce` reads the token into a local `accessToken` variable used only inside the one `fetch` call's `authorization` header; it is never logged, returned, or included in any outcome/reason string (test: "the OAuth token never appears in any outcome, success or failure").
- Reason strings are fixed, bounded, human-readable text (e.g. `"Claude usage endpoint rejected the OAuth token (HTTP 401)."`) — never string-interpolated with credential material.
- Daemon-level test posts a real success + failure acquisition cycle through `POST /api/ai-health/refresh` and `GET /api/ai-health`, then asserts none of `accessToken|claudeAiOauth|authorization|Bearer ` (case-insensitive) appear anywhere in the JSON responses.
- The reader reads `~/.claude/.credentials.json` (honoring `CLAUDE_CONFIG_DIR`) **fresh on every attempt** — confirmed the resolved path matches the real file already on this machine (`C:\Users\dmcal\.claude\.credentials.json`, exists, 519 bytes) — so Claude Code's own token rotation is picked up automatically. No refresh-token rotation is implemented; an expired token reports `credential_expired` and triggers zero fetch calls (test-verified) rather than attempting to renew it.

## Persistent Scoreboard + alignment

- `.ai-scoreboard` is now `position: fixed; left:0; right:0; bottom:0;` with `max-height: 66vh; overflow-y:auto;` (a true control-room footer, not merely bottom-of-document placement) and `env(safe-area-inset-bottom)` padding for phones.
- `#mainWorkflow` reserves `padding-bottom: var(--ai-scoreboard-bar-height)` (112px collapsed) so the footer never permanently covers the final Game controls; `setAiScoreboardExpanded` toggles a class that raises the reserved space to `66vh` while Expanded.
- Copy and Expand remain available in both states; the Expanded panel keeps its existing structure (no redesign).
- Alignment: `.ai-scoreboard-windows` changed from `display:flex` (content-width columns, so the `│` divider drifted per row depending on text length) to `display:grid; grid-template-columns: 150px 14px 1fr;` — a fixed-width first column, so the divider sits at the identical horizontal position for Claude and Codex regardless of value (`UNKNOWN`, `4%`, `60%`, `100%`).

## Manual refresh

- `Rehydrate` (misleadingly a cached-state re-fetch) is replaced by **Refresh Health**, which `POST`s `/api/ai-health/refresh` (same token-guarded auth as every other `/api/*` route) and renders whatever `health` the response carries — a real forced Claude account read, not a re-request of the same cached snapshot.
- `GET /api/ai-health` is unchanged: still a cached-state read only, now with a sibling `acquisition.claude` status field when the reader is enabled.
- Response shape: `{ success, health, acquisition: { claude: { outcome: 'changed'|'unchanged'|<failure code>, reason?, checkedAt } } }`.

## Tests

- `npm run compile` — clean.
- `test/claude-usage-reader.test.mjs` — 18/18: OAuth percent→fraction, ISO→Unix-seconds, both windows, missing/invalid window omission, `credentials_unreadable`/`credential_expired`/`auth_rejected`/`rate_limited`(+Retry-After)/`malformed_response`/`network_error`, token-never-leaks, cadence allowlist, immediate startup read, cadence-per-value scheduling, cadence change without a second reader, concurrent-read dedupe, backoff ladder + cap + recovery, `stop()` clears timer and aborts in-flight.
- `test/health-authority.test.mjs` — added push+reader convergence (one change, not two), changed-window convergence visible via the same snapshot, empty-window-set no-op, reader source identity (`control-plane` / `claude-oauth-reader`).
- `test/claude-usage-reader-daemon.test.mjs` — 10/10: default-off, exactly-one-reader, refresh performs real acquisition + broadcasts on change, unchanged refresh reports `unchanged`, failure preserves last-known facts, unauthorized refresh → 401, refresh with no reader enabled → `unavailable` (never fabricated), preference change updates the one reader's cadence, preference rejects out-of-allowlist values, no credential material in any response.
- `test/ai-usage-scoreboard-ui.test.mjs` — added SB-16..SB-20: fixed/bottom-pinned CSS present, `mainWorkflow` spacer present, fixed-width alignment grid present, `Refresh Health` POSTs and renders the response, Codex markup/behavior untouched.
- `test/s55-1-finished-state-and-time-format.test.mjs` — AI Usage Refresh Frequency card exists with all five options, defaults to 10s, persists a change, reflects a non-default stored value.
- Fixed a pre-existing test-port collision this Play's new port literals (39301–39310) had with `control-plane-roster-projection.test.mjs`/`q2-10d-context-aware-auto.test.mjs`/`dev-harness.test.mjs`; moved to the unused 39701–39710 range.
- `npm test` (full suite): **1572/1580 passing**. The 8 failures are the same pre-existing, unrelated baseline failures present before this Play (extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, and the one wall-clock-dependent Codex countdown test) — verified identical failure count and names before and after this Play's changes.

## Field behavior (as designed; not live-verified this session)

I did not restart the real production daemon or make a live call to `api.anthropic.com` in this session — doing so was out of scope for a code-authoring pass and risked an uncontrolled external network call. Real credentials already exist on this machine at the exact path the reader resolves (`C:\Users\dmcal\.claude\.credentials.json`, confirmed via `defaultClaudeCredentialPath()`), so per the design:
1. On the next real daemon restart (`SIDELINE_CLAUDE_USAGE` unset or `!= '0'`), the reader performs one immediate acquisition, then a 10s cadence chain.
2. Claude values should converge toward the real account state without running a Claude Play.
3. `Refresh Health` forces an immediate read.
4. Changing the cadence in Settings updates the same reader; no restart needed.

**Recommended follow-up:** restart the real Sideline daemon and confirm this end-to-end in the field, since that step genuinely requires a live process and a live network call this session intentionally did not make.

## Scope discipline

No Codex changes, no routing policy, no full AI Usage workspace, no full settings suite (only the one required setting), no card/color redesign, no per-Game health stores, no per-browser polling, no second Claude reader anywhere. No commit, no push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Health-Play2-Global-Claude-Reader__20260922-063000__Claude.md
