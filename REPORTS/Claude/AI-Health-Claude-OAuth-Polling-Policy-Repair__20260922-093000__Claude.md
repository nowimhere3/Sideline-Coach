# AI Health — Claude OAuth Polling Policy Repair

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

## Field evidence that triggered this Play

Live Control Plane health capture: a successful Claude acquisition at ~`2026-09-22T13:08:17.959Z`, followed by another attempt ~10 seconds later at ~`13:08:28.055Z` that returned HTTP 429 (`state: rate_limited`, `code: rate_limited`). This confirmed the reader/scheduler were working correctly — the 10-second cadence itself was the problem, not a bug in the scheduling machinery.

## Note on concurrent work

Before starting, I found `src/control-plane/health-authority.ts` and `src/control-plane/claude-usage-reader.ts` already contained an unrelated repair (reset-boundary window-expiry logic in `mergeClaudeRateLimitInfo`, a `five_hour_present`/`seven_day_present` structural log line) done in a separate session — presumably the "Claude 5H freshness repair" the Play references as already complete. I left that logic untouched, as instructed, and built this Play's changes on top of it.

## WAS → IS → WILL BE

**WAS:** `ClaudeUsageReader` scheduled at `CLAUDE_USAGE_CADENCE_SECONDS = [10,15,20,25,30]`, default 10s. On failure it backed off `30s → 60s → 120s → 300s cap`. The `aiUsageRefreshSeconds` preference (same allowlist) drove it via `daemon.ts`.

**IS:**
- `ClaudeUsageReader` now schedules at `CLAUDE_USAGE_CADENCE_MINUTES = [3,5,10,15]`, default **5 minutes**, floor **3 minutes**. Internally this is still one `setTimeout` chain on the same reader (`cadenceMinutes * 60_000` ms) — no second scheduler, no new class.
- On failure/429 it backs off `5m → 10m → 20m → 40m → 60m cap` (`BACKOFF_MS = [5,10,20,40,60].map(m => m*60_000)`), using the exact same `backoffIndex` ladder mechanism as before — only the minute values changed.
- The `aiUsageRefreshSeconds` preference is **renamed** to `aiUsageRefreshMinutes` (type `3|5|10|15`, default `5`) in `running-players.ts`. This is a rename, not a reinterpretation: `loadPreferences()` only ever reads the new key. An old preferences file's `aiUsageRefreshSeconds: 10` is never read, never reinterpreted as "10 minutes", and simply falls straight through to the 5-minute default — the entire migration is "look for a different key," which is deterministic by construction and needed no numeric special-casing (this also sidesteps the fact that `10` and `15` are members of both the old seconds-set and the new minutes-set, which would have made numeric reinterpretation genuinely ambiguous).
- `daemon.ts`'s `POST /api/preferences` validates/persists `aiUsageRefreshMinutes` and calls the renamed `reader.setCadenceMinutes(...)` on the one existing daemon-owned reader — same wiring pattern as before, new names.
- `src/public/index.html`'s Settings → AI Usage Scoreboard → "Refresh every" fieldset now shows four radios labeled `3 min / 5 min / 10 min / 15 min`, backed by the same `/api/preferences` POST with the new field name. The old `10/15/20/25/30 seconds` radios are gone entirely — verified by a test asserting `name="aiUsageRefreshSeconds"` no longer appears anywhere in the page.
- **Manual Refresh vs. the rate-limit gate:** unchanged code path, freshly verified by a new test. `ClaudeUsageReader.refresh()` calls the same private `read()` the scheduler uses, and `read()` already short-circuits without making a network request whenever `rateLimitedUntilMs` is still in the future — so this was already correct before this Play; I added a test making the guarantee explicit and permanent (`manual refresh does not bypass an active provider rate-limit gate`).
- **Success resets backoff:** unchanged code path (`scheduleNext` sets `backoffIndex = -1` on `outcome.ok`; `applyOutcome` clears `rateLimitedUntilMs` on success) — freshly re-verified against the new minute-scale ladder.
- **Retry-After honored:** unchanged code path (`readClaudeUsageOnce` parses the `retry-after` header into `retryAfterMs`; `scheduleNext` uses it when it exceeds the computed backoff step) — freshly re-verified with a Retry-After value (900s) that exceeds the new 5-minute first-step backoff.
- **Singleton ownership:** untouched. `ControlPlaneDaemon` still constructs exactly one `ClaudeUsageReader`; existing tests (`the default constructor never starts a Claude usage reader`, `exactly one global reader exists per daemon...`) already cover this and needed no changes — reused rather than duplicated, per the Play's instruction.

**WILL BE (breadcrumb for the next UI Play):** see below — `observedAt` vs. `lastSuccessAt` need a real design pass on the Compact surface; not solved here.

## Files changed

- `src/control-plane/claude-usage-reader.ts` — cadence type/constants renamed seconds→minutes (`CLAUDE_USAGE_CADENCE_MINUTES`, `ClaudeUsageCadenceMinutes`, `DEFAULT_CLAUDE_USAGE_CADENCE_MINUTES`, `isClaudeUsageCadenceMinutes`); `ClaudeUsageReaderOptions.initialCadenceMinutes`; `ClaudeUsageReader.cadenceMinutes`/`getCadenceMinutes()`/`setCadenceMinutes()`; `BACKOFF_MS` now `[5,10,20,40,60]` minutes; `scheduleNext()` computes `cadenceMinutes * 60_000`; added the `observedAt`-vs-`lastSuccessAt` breadcrumb comment on `ClaudeUsageStatus`.
- `src/running-players.ts` — `aiUsageRefreshSeconds` → `aiUsageRefreshMinutes` (type `3|5|10|15`, default `5`); `AI_USAGE_REFRESH_SECONDS_VALUES`/`DEFAULT_AI_USAGE_REFRESH_SECONDS`/`isAiUsageRefreshSeconds` → `AI_USAGE_REFRESH_MINUTES_VALUES`/`DEFAULT_AI_USAGE_REFRESH_MINUTES`/`isAiUsageRefreshMinutes`; `DEFAULT_PREFERENCES` and `loadPreferences()` updated (the migration: only the new key is ever read).
- `src/control-plane/daemon.ts` — import renamed to `isAiUsageRefreshMinutes`; reader construction passes `initialCadenceMinutes`; `POST /api/preferences` validates/persists `aiUsageRefreshMinutes` and calls `setCadenceMinutes(...)`; validation message updated to "Choose 3, 5, 10, or 15 minutes."; saved-message branch variable renamed.
- `src/public/index.html` — Settings fieldset relabeled to 4 minute-based radios (`aiUsageRefresh3/5/10/15`, `name="aiUsageRefreshMinutes"`); `AI_USAGE_REFRESH_INPUTS` map and its sync/POST wiring updated to the new field/values; help text updated to describe the endpoint as a background reconciliation check rather than implying near-real-time.
- `test/claude-usage-reader.test.mjs` — cadence/backoff/allowlist tests rewritten to minutes; added explicit tests for default-is-5-minutes, the 429-specific backoff ladder, a Retry-After that exceeds the first backoff step, and manual-refresh-respects-the-gate.
- `test/claude-usage-reader-daemon.test.mjs` — cadence-preference test renamed/updated to minutes; added a legacy-migration test (`aiUsageRefreshSeconds: 10` on disk → `aiUsageRefreshMinutes: 5`, old key not surfaced).
- `test/q2-10a-provider-control.test.mjs`, `test/s55-1-finished-state-and-time-format.test.mjs` — default-preferences/UI-settings assertions updated to the new field name and minute values; added a test confirming the seconds-based `name="aiUsageRefreshSeconds"` radio group is gone entirely, and that 3 minutes (not 1 or 2) is the floor.

## 429 / Retry-After behavior (exact)

1. `read()` checks `rateLimitedUntilMs` before any fetch; while still gated it returns `{ code: 'rate_limited' }` locally with zero network calls — applies to both the scheduler and `refresh()`.
2. On an actual 429 response, `readClaudeUsageOnce` parses `retry-after` (seconds) into `retryAfterMs` when present and positive.
3. `scheduleNext()`: on failure, advances `backoffIndex` (capped at the last rung) through `[5m,10m,20m,40m,60m]`; if the outcome carried a `retryAfterMs` larger than that computed step, the larger value wins.
4. `applyOutcome()`: on a 429 outcome with `retryAfterMs`, sets `rateLimitedUntilMs = now + retryAfterMs`, which is what makes step 1 actually gate subsequent reads (scheduled or manual) until it elapses.
5. On the next successful read, `rateLimitedUntilMs` is cleared and `backoffIndex` resets to `-1`, returning cadence to the configured minutes value.

## Timestamp semantics — confirmed unchanged, correctly distinct

- `ClaudeProviderHealthState.observedAt` (health-authority.ts) — the last time the **stored canonical facts** actually changed.
- `ClaudeUsageStatus.lastSuccessAt` (claude-usage-reader.ts) — the last time the **reader itself** successfully completed a check, whether or not it changed anything.
- Both are still exposed distinctly (`GET /api/ai-health` → `health.providers.claude.observedAt` and the sibling `acquisition.claude` status). I did not touch how the Scoreboard labels either of them — the "Observed:" label in `index.html` still reads only `observedAt`, which is correct behavior, just potentially confusing when a recent successful-but-unchanged acquisition doesn't move it. See the **BREADCRUMB** below.

## Tests

- `test/claude-usage-reader.test.mjs` — 22/22 (was 22, net +5 new: default-cadence, 429-ladder, Retry-After-exceeds-backoff, manual-refresh-respects-gate, cadence-allowlist rewritten for minutes).
- `test/claude-usage-reader-daemon.test.mjs` — 10/10 (added the legacy-migration test).
- `test/q2-10a-provider-control.test.mjs`, `test/s55-1-finished-state-and-time-format.test.mjs`, `test/s54-4-terminal-success-retention.test.mjs`, `test/ai-scoreboard-settings-daemon.test.mjs` — all green with the renamed field.
- `npm run compile` — clean.
- `npm test` (full suite): **1604/1612 passing**. The 8 failures are the identical pre-existing, unrelated baseline failures present before this Play (same names, same count, verified before/after): extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, and the one wall-clock-dependent Codex countdown test.

## Commands run

```
npm run compile
node --test test/claude-usage-reader.test.mjs
node --test test/claude-usage-reader-daemon.test.mjs test/q2-10a-provider-control.test.mjs \
  test/s55-1-finished-state-and-time-format.test.mjs test/s54-4-terminal-success-retention.test.mjs \
  test/ai-scoreboard-settings-daemon.test.mjs
npm test
```

## BREADCRUMB — AI Usage timestamp semantics (for a future Scoreboard polish Play)

The product distinguishes three real, different concepts that a future UI Play needs to design around, not collapse:
1. **`observedAt`** — last time the stored canonical Claude facts changed (push or reader).
2. **`lastSuccessAt`** — last time the reader itself successfully checked, changed or not.
3. **acquisition state** — e.g. `rate_limited`, with its own `reason`/`code`.

Field example that exposed the gap: `observedAt` ~7:03 AM, `lastSuccessAt` ~7:08 AM — a real acquisition happened 5 minutes after the last change, but the Compact/Expanded "Observed:" label only shows the older timestamp. This is not a bug — both timestamps are factually correct for what they represent — but it can read as "stale" when it isn't. Deciding how (or whether) to surface `lastSuccessAt` and acquisition state alongside `observedAt` without cluttering the Compact row is a design question for the next UI Play, not resolved here. Left as an in-code comment on `ClaudeUsageStatus` in `claude-usage-reader.ts` pointing future readers at this report.

## Confirmation

No commit. No push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Health-Claude-OAuth-Polling-Policy-Repair__20260922-093000__Claude.md
