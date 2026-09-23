# Claude 5H Freshness — Surgical Correctness Repair

**Agent:** Claude Code
**Model:** Claude Sonnet 5
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Grounding:** `Reports\AntiGravity\Claude-5H-Freshness-Seam-Validation__20260922-063800__AntiGravity.md`

No commit. No push.

---

## WAS

`HealthAuthority.mergeClaudeRateLimitInfo()` copied any window missing from incoming
evidence forward from `previous` unconditionally, with no check against
`now >= previous.resetsAt`. When Anthropic's OAuth usage endpoint temporarily
omitted `five_hour` around a reset boundary (while `seven_day` stayed valid),
the previous session's expired `five_hour` (26% used, reset already passed)
was retained as current truth indefinitely — surviving both the automatic
10s poll and manual Refresh, because dedupe saw no structural change and
suppressed the SSE broadcast. There was also no reset-cycle monotonicity
check: an out-of-order older `rate_limit_event` push could overwrite a newer
stored reset cycle. The Scoreboard had no independent defense against
rendering an already-expired window as current.

## IS

- **Rule A (expiry):** a window missing from incoming evidence is preserved
  only while `previous.resetsAt > now`. Once expired with no fresh
  replacement, it is dropped — the key becomes absent (UNKNOWN), never
  retained indefinitely.
- **Rule B (no fabrication):** unchanged — canonical parsing in
  `claude-usage-reader.ts` already never fabricates zero or a reset time;
  this repair never invents values either, it only decides what to keep vs.
  drop.
- **Rule C (monotonicity):** an incoming window whose `resetsAt` is strictly
  older than the stored window's `resetsAt` for the same key is rejected as
  a stale replay; the newer stored cycle remains authoritative (itself still
  subject to Rule A's expiry check).
- **UI defense-in-depth (Claude only):** `aiScoreboardNormalize` in
  `index.html` now accepts an opt-in `checkExpiry` flag; the Claude 5H/Weekly
  mapping passes it, so an already-expired window that somehow still reaches
  the frontend renders through the existing UNKNOWN path instead of a stale
  percentage + `in 0m`. Codex is untouched (not in scope; also the shared
  `aiScoreboardNormalize` is called without the flag for Codex).
- **Reader diagnostics:** `ClaudeUsageReader.applyOutcome()` logs one
  redacted structural line per successful acquisition —
  `[claude-usage-reader] shape: five_hour_present=<bool> seven_day_present=<bool>`
  — no token, header, credential, or raw payload content.

## WILL BE (deferred / out of scope, per the Play)

- Richer same-reset-cycle precedence (OAuth vs. push provenance /
  `observedAt` ordering when `resetsAt` is *equal*) was explicitly
  breadcrumbed by AntiGravity as a larger state-model change and is **not**
  implemented here. Current behavior for equal `resetsAt`: incoming
  overwrites, same as before this repair (Rule C only rejects *strictly
  older* cycles).
- Codex windows are not covered by the UI expiry defense-in-depth (out of
  scope per the Play; Codex health behavior was explicitly excluded).

---

## Exact files changed

- `src/control-plane/health-authority.ts`
  - `ingest()` and `ingestClaudeUsage()`: read `this.now()` exactly once per
    call (previously implicit single read after dedupe; now read up front
    since the merge itself needs current time) and reuse it for both the
    merge's `nowUnixSeconds` and `observedAt`.
  - `mergeClaudeRateLimitInfo(previous, incoming, nowUnixSeconds)`: new
    third parameter; rewritten to merge per-key with expiry (Rule A) and
    reset-cycle monotonicity (Rule C), replacing the old unconditional
    `{ ...prevWindows, ...incomingWindows }` spread.
  - New helper `windowResetsAt()`.
- `src/control-plane/claude-usage-reader.ts`
  - `applyOutcome()`: one added redacted structural diagnostic log line on
    successful acquisition (Seam 2).
- `src/public/index.html`
  - `aiScoreboardNormalize()`: new optional `{ checkExpiry }` param; when
    true and `resetsAt <= Date.now()`, returns `undefined` (UNKNOWN).
  - `aiScoreboardClaudeWindows()`: passes `{ checkExpiry: true }` for both
    Claude windows.
- `test/health-authority.test.mjs`
  - Added 4 new focused tests (see below).
  - Adjusted 4 pre-existing tests whose fixture `resetsAt` values (tiny
    placeholder numbers like `111`/`999`, real-clock defaults) collided with
    the two new invariants — see "Pre-existing test fixture adjustments"
    below for the exact reasoning per test.
- `test/ai-usage-scoreboard-ui.test.mjs`
  - Added 1 new focused test (`SB-31`).
  - Changed `T0` from a fixed calendar date to `Date.now() + 3600_000` (see
    below).

## Contract implemented

See "IS" above — Rules A, B (already true), C, plus UI defense-in-depth and
redacted reader diagnostics, matching the AntiGravity validation report's
seams 1–3 and the Play's contract.

## Tests added/changed

**`test/health-authority.test.mjs`** — 4 new tests matching the Play's
required scenarios exactly:
1. `expired five_hour with no fresh replacement is dropped, not retained as
   stale current truth` — Test 1 (expired-missing eviction; also asserts the
   eviction itself is a real change that triggers `onChange`).
2. `fresh (not-yet-expired) missing window is still preserved` — Test 2
   (protects the still-useful "temporarily missing, not yet expired"
   preservation behavior).
3. `an older reset cycle cannot overwrite a newer stored reset cycle (stale
   replay rejected)` — Test 3 (monotonicity).
4. `a legitimate new reset (valid zero, future resetsAt) is ingested even
   when the old cycle just expired` — Test 4 (zero is never refused/dropped
   when it's real provider evidence for a fresh cycle).

**`test/ai-usage-scoreboard-ui.test.mjs`** — 1 new test:
- `SB-31. An already-expired Claude window renders UNKNOWN, never a stale
  percentage, even if still present in the payload` — proves the UI
  defense-in-depth path.

**Pre-existing test fixture adjustments** (all in `health-authority.test.mjs`,
all caused directly by the two new invariants, not by unrelated drift):

- *`partial incoming Claude window...preserves the other last-known
  unifiedWindows window`*: default `evidence()` uses `resetsAt: 123456` /
  `654321` (tiny placeholder Unix-seconds values, effectively already
  "expired" against any real wall-clock `now`). The follow-up
  `flatFiveHour` fixture used `resetsAt: 111`, which is *older* than the
  stored `123456` — under the new Rule C this was rejected as a stale
  replay (defeating the test's actual intent: proving an update overwrites
  and the other window survives). Fixed by (a) pinning the authority's
  `now` to `new Date(0)` so none of these placeholder timestamps are
  "expired" relative to it, and (b) bumping `flatFiveHour`'s `resetsAt` from
  `111` to `200000` so it's a legitimate newer cycle, not a stale replay.
- *`Claude replay dedupes on canonical windows...`*: already injected a
  2-entry `now()` sequence (`times.shift()`). The merge now needs to read
  `now` before the dedupe check (previously `now` was only read after
  passing dedupe), so a 3rd ingest attempt (an exact replay, still needing
  one clock read) drained the array. Added one more timestamp entry; no
  fixture/assertion changed.
- *`Claude retains both five_hour and seven_day...`*: same root cause as the
  first item — real-clock `now` treated the placeholder `resetsAt` values
  as already expired the moment a window went briefly missing from one
  ingest. Fixed by pinning `now: () => new Date(0)`.
- *`ingestClaudeUsage with a changed factual window...`*: same root cause;
  the test's `resetsAt: 999` update was also *older* than the seeded
  `123456`, triggering Rule C. Fixed by pinning `now: () => new Date(0)` and
  bumping the updated `resetsAt` to `200000`.

None of these four adjustments change what the tests are actually verifying
(dual-window preservation, replay dedup, independent per-window updates) —
each was a collision between arbitrary small placeholder timestamps (never
designed to represent a real chronology) and the two new correctness
invariants those timestamps now participate in.

**`test/ai-usage-scoreboard-ui.test.mjs` — `T0` change:** this test harness
runs the real, un-mocked `Date` (`ctx.Date = Date`), so the previous fixed
`T0 = Date.UTC(2026, 8, 21, 20, 0, 0)` (Sep 21 2026 20:00 UTC) silently drifts
into the past as real time passes — confirmed pre-existing: `SB-13` already
fails on `main`/this branch before any of my changes, for exactly this
reason (a hardcoded historical field-repro timestamp, unrelated to `T0`,
already past). Adding the Claude expiry defense-in-depth check made this
drift immediately fatal for ~10 more `T0`-anchored tests (all of which are
about mapping/rendering correctness, not freshness). Changed `T0` to
`Date.now() + 3600_000` so it (and everything computed relative to it) stays
in the future regardless of when the suite runs. Verified no test asserts a
specific weekday/month string derived from `T0` (only the separate
`FIELD_*` constants in `SB-12/13/14` do, and those are untouched).

## Commands run

```
npm run compile                                    # tsc -p ./  (clean)
npx tsc --noEmit -p .                               # clean
node --test test/health-authority.test.mjs          # 18/18 pass
node --test test/ai-usage-scoreboard-ui.test.mjs    # 31/32 pass (1 pre-existing unrelated failure)
node --test test/*.test.mjs                         # 1590/1598 pass
```

## Test results

- `test/health-authority.test.mjs`: **18/18 pass** (14 pre-existing + 4 new).
- `test/ai-usage-scoreboard-ui.test.mjs`: **31/32 pass** (30 pre-existing +
  `SB-31` new; `SB-13` fails, pre-existing and unrelated — see below).
- Full suite (`test/*.test.mjs`): **1590/1598 pass**. All 8 failures are
  pre-existing on this branch and unrelated to this repair:
  - `SB-13` (`ai-usage-scoreboard-ui.test.mjs`) — pre-existing Codex
    field-repro timestamp clock drift, fails identically before any of my
    changes.
  - `10. Switching Game updates selected gameId...`, `P26-P27 provider
    allowlist...`, `Q2.10C-13...`, `Q2.10C-U3...`, `E-24...`, `C-18...`,
    `F.3-6...` — all in `extension.ts` / terminal-player / ticker /
    dispatch-toast areas already modified and in-progress on this branch
    per the session's starting `git status` (unrelated files: `daemon.ts`,
    `router.ts`, `codex-app-server.ts`, `structured-print.ts`,
    `running-players.ts`, `extension.ts`, etc.). None reference
    `health-authority`, `claude-usage-reader`, or the AI Scoreboard.
- I did **not** modify any of these 8 unrelated failing tests or their
  source, per the Play's instruction not to fix unrelated failures.

## Field verification instructions

**Expired-window test:** force (or wait for) a real Claude 5H reset while
Sideline is running. If the OAuth endpoint temporarily omits/delays
`five_hour` around the boundary, Sideline's Scoreboard should show
`Claude 5H: UNKNOWN` — never the old percentage, never `in 0m`, never a
fabricated `100%`. Check the daemon log for
`[claude-usage-reader] shape: five_hour_present=false seven_day_present=true`
around that window (Seam 2 diagnostic).

**New-provider-window test:** once the OAuth endpoint returns
`five_hour: { utilization: 0, resets_at: <future> }`, the very next
automatic poll (no manual Refresh required) should update the Scoreboard to
`100% left / 0% used` for 5H, without any stale-window resurrection.

**Freshness-precedence test:** if a stale/out-of-order `rate_limit_event`
push (older reset cycle) arrives after a newer OAuth-acquired cycle, the
newer cycle must remain displayed — verified deterministically by the new
"older reset cycle cannot overwrite..." unit test; no special manual repro
needed beyond normal operation.

## Deferred breadcrumb

Richer same-reset-cycle (`resetsAt` equal) precedence using OAuth
provenance vs. `observedAt` ordering, as proposed by AntiGravity, was
intentionally not implemented — it requires a larger state-model change
(per-window provenance/observation tracking) than this surgical Play scopes
for. Current behavior for equal `resetsAt` is unchanged from before this
repair (incoming overwrites).

## Confirmation

No commit. No push. Compile is green. Focused tests are green. No unrelated
redesign was introduced.
