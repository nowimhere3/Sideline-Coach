REPORT FILE:
Coach-Routines-V0-Slice-E-Incoming-Copy-Coach-Handoff.md

REPORT TIMESTAMP:
2026-09-14 12:40:02 -06:00 (America/Edmonton)

# Executive Result

**Coach Routines V0 Slice E is complete.** The Coach-side delivery loop is closed: when Dev Mode is on and the selected Game has a genuinely due, deliverable Coach-target routine, Incoming shows a compact `↻ Coach Refresh is due` banner beside Copy. On deliberate Copy, the clipboard payload becomes the Coach handoff envelope, a separator, then the exact canonical report text — captured from the report the human actually selected, never mutated, never a newer report arriving mid-flight. The routine is marked **delivered** only after the clipboard write itself confirms success; nothing else (rendering, selection, refresh, Game switch, a skipped Copy, or a failed write) can trigger it. If the delivery acknowledgement itself fails after a successful copy, the human still sees their real Copy result and the due state simply reappears from the next real status refresh — never a fabricated local "delivered" flag.

No canonical report file was touched. No Player delivery, prompt injection, or second acknowledgement path was built. No stop condition applied — Slice A/B's existing bounded handoff projection and `POST /api/routines/delivered` contract were sufficient for everything this Slice needed.

# Inherited Slice D Baseline

Verified against the running code (not assumed from the prior report) before building:

- `status.preferences.devMode` and `status.routines` (a `RoutinesProjection`, scoped to `selectedGameId`) are already present on every `/api/status` and SSE `status` convergence.
- Settings has a real Dev Mode toggle and a Dev-Mode-only Coach Routines card built entirely from that projection — untouched by this Slice.
- `npm run check` / `npm run compile` / `git diff --check` all passed before any edit; 621 tests passed (the exact count the prior report claimed).

# Architecture Followed

The frozen contract was preserved exactly as specified — verified by reading `src/control-plane/coach-routines.ts` and `src/control-plane/daemon.ts` directly, not assumed:

| Concern | Owner (unchanged) |
|---|---|
| Routine definition, cadence, due evaluation | `CoachRoutineEngine` (Control Plane) |
| Game files / source truth | the exact Game's authoritative Stadium (Slice C) |
| Canonical Incoming report | untouched — the browser only reads `report.content` |
| Coach handoff envelope | `buildStrategyBoardEnvelope`, server-assembled, already merged/bounded for every due Coach-target routine at once |
| Human Copy | the existing deliberate `#copyReportBtn` action, now extended |
| Delivered acknowledgement | `POST /api/routines/delivered`, called once, only after a confirmed successful clipboard write |

`RoutinesProjection.handoff` (`{ text, deliveries: [{routineId, cycle}], names }`) is consumed **as-is** — nothing in the browser recomputes due state, re-derives which routines qualify, or reconstructs the envelope text. This directly answers the "multiple due routines" question the brief raised: the backend already projects one bounded, combined handoff for every genuinely due Coach-target routine, so the browser's job is only to present and deliver that single object.

# Files Changed

| File | Change |
|---|---|
| `src/public/index.html` | Markup: a `#coachHandoffBanner` (title + `Not this time`) inside the Incoming card, above Copy. CSS: `.coach-handoff-*` (compact, informational tone, not alarming). JS: `eligibleCoachHandoff`, `dadifyHandoffTitle`, `syncIncomingCoachHandoff`, `deliverCoachHandoff`, the `#coachHandoffSkipBtn` handler, `skippedHandoffReportKey` state; `resetCoachRoutinesUiState` extended to also clear it on Game switch; `renderReport` extended to clear it on report change and resync the banner; `renderStatus` wired to `syncIncomingCoachHandoff`; the existing `#copyReportBtn` handler extended to build the combined payload and call `deliverCoachHandoff` only after a confirmed successful `copyText`. |
| `test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs` | **new**, 16 tests covering all 25 required proof points (several consolidated per test where they share one scenario) |
| `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` | Coach Routines section: header now names Slice E; a new **IS (Slice E)** paragraph; **WILL BE** trimmed to what's still actually future |
| `REPORTS/Claude/Coach-Routines-V0-Slice-E-Incoming-Copy-Coach-Handoff.md` | this report |

No server file changed — everything needed already existed from Slices A/B. All unrelated dirty-tree work was preserved untouched.

# Incoming Due-State UX

- `#coachHandoffBanner`, rendered inline in the existing Incoming card, directly above the Copy button — not a new panel, not a modal, not a second execution-style surface.
- Shown only when **all** of: `status.preferences.devMode` is true, `status.routines.gameId === currentGameId` (defense against a stale/foreign-Game payload), and `status.routines.handoff` exists (which itself already requires backend-confirmed due + deliverable truth).
- Title: `↻ {Coach Refresh|N Coach Routines} is due` — Dadified from `handoff.deliveries` by cross-referencing each `routineId` against `status.routines.routines` to find its `template`/`name` (the default `canonical-refresh` template always presents as **Coach Refresh**, matching Slice D's convention; a name is shown as-is only for a non-default routine). Multiple distinctly-named due routines fall back to `"N Coach Routines"` rather than fabricating a single misleading name.
- Subtext: the exact copy the brief specified — `It will be added when you copy this report.`
- Visual tone is deliberately calm (a blue informational card, not amber/red), per "this is helpful context, not an error."

# `Not this time` Behavior

- Clicking it sets a transient, browser-local `skippedHandoffReportKey = "{path}:{mtime}"` for the **currently open report only**, then hides the banner. No API call, no routine mutation.
- The exclusion applies to exactly the next Copy of that same report: after any Copy attempt (success or failure) of that report, `skippedHandoffReportKey` is cleared in the handler's `finally` block, so a subsequent Copy defaults back to including a still-due handoff.
- Switching to a different report clears it immediately (`renderReport`'s key-change check) — the exclusion never silently follows the human to a report they didn't skip on.
- A Game switch also clears it (folded into the existing `resetCoachRoutinesUiState`), so no stale skip can survive into a different Game's view.
- `E-9/E-10/E-11` prove: the envelope is excluded from that one Copy, no `delivered` call is ever made, and the routine is proven still due on the very next status refresh.

# Clipboard Composition

```
payload = handoff ? `${handoff.text}\n${reportText}` : reportText
```

- `reportText` is `humanReportContent(report.content)` — the exact existing function that already strips only the invisible provenance line, unchanged.
- `handoff.text` is used verbatim, byte-for-byte, from `status.routines.handoff.text` — never rebuilt, re-templated, or re-worded in the browser. Its existing structure already ends with the `=== END COACH ROUTINE — REPORT FOLLOWS ===` marker plus a blank line; one more `\n` gives clean visual separation before the report.
- `E-12/E-13` prove the payload `startsWith(handoff.text)` and, critically, `endsWith` the **exact, unmutated** report text — proving the canonical report is never altered to manufacture this payload, only concatenated after.
- Both the canonical report object (`report.content`) and the rendered `#reportPreview` are completely untouched by this feature; the combined string exists only inside the local `payload` variable for the duration of the Copy call.

# Exact Delivery Ordering

The handler now follows exactly the order the brief specified:

1. Capture the report and its handoff eligibility **at click time** (`report = currentReport`, `handoff = eligibleCoachHandoff(reportKey)`), before any `await` — so a report that arrives or changes mid-flight cannot retroactively change what gets copied (`E-22`).
2. Build the final payload.
3. `await copyText(payload)`.
4. Only inside the `try` block, after that `await` resolves without throwing, does the handler proceed to (a) the existing Player-report `acknowledgeWork` call and (b) `void deliverCoachHandoff(handoff.deliveries, report.path)` — both fire-and-forget in the established pattern, both gated behind the same confirmed clipboard success.
5. `deliverCoachHandoff` calls `POST /api/routines/delivered { gameId: currentGameId, deliveries, via: 'copy-report', reportPath }`, then unconditionally `await refresh()` to reconverge from real backend truth.

`E-15/E-16` proves this exact order with an instrumented clipboard/delivery pair (`['clipboard', 'delivered']`), and that no test scenario ever produces a `delivered` call before a `clipboard` write.

# Clipboard Failure Semantics

- A thrown `copyText` rejects the `try` block; execution falls to `catch`, which sets the existing truthful `Copy Failed · Try Again` state. `deliverCoachHandoff` is never reached — proven directly by `E-17`, which also confirms the routine is still shown due on the next refresh (nothing was ever recorded server-side, so there is nothing to "leave due" beyond the fact that backend truth never changed).
- The `finally` block still clears `skippedHandoffReportKey` (a fresh attempt starts fresh) and re-enables the button, matching existing Copy-failure UX exactly — no new failure chrome was introduced.

# Acknowledgement Failure Semantics

- `deliverCoachHandoff` wraps the endpoint call in its own `try/catch`. On either an HTTP failure or a `{ success: false }` / missing-`delivered`-and-`alreadyDelivered` reply, it shows a small, explicitly worded toast — `"Coach Refresh copied, but Sideline couldn't confirm it as delivered. It will stay due."` — and always still calls `await refresh()`.
- The Copy button's own success state (`✓ Report Copied · with Coach Refresh`) is never rolled back — the human's real, true Copy result is not hidden behind a bookkeeping failure (`E-18`).
- Because the server's own state was never actually changed on a failed acknowledgement, the subsequent `refresh()` naturally shows the routine still due — no local "pretend it worked" flag exists to diverge from that truth.

# Exact-Game Isolation

- `eligibleCoachHandoff` refuses to use `status.routines.handoff` unless `status.routines.gameId === currentGameId` — the same defensive pattern Slice D already established for the Settings card.
- `deliverCoachHandoff` always sends `gameId: currentGameId` (the presented Game), never inferred from the handoff object or a cached value.
- `resetCoachRoutinesUiState`, called from `switchGame`, now also clears `skippedHandoffReportKey`, so no stale per-report exclusion survives a Game switch.
- `E-8` proves a Game switch alone triggers no delivery call; `E-21` proves Game A's due handoff never appears while Game B is selected, and that copying a report in a Game with nothing due never calls `/api/routines/delivered` at all.

# Report Identity Handling

- The Copy handler captures `report = currentReport` and its `reportKey` synchronously, before the `await copyText(...)` — this is the exact same staleness-guard pattern the pre-existing handler already used for the ordinary (`E-23`-proven-unchanged) Copy path and for the pre-existing `acknowledgeWork` call; Slice E extends it rather than replacing it.
- `E-22` proves directly: starting a Copy, then selecting a *different* report before the (mocked, awaited) clipboard write resolves, still produces the *original* report's exact content in the clipboard — never the newly selected one.

# Dev Mode Behavior

- With Dev Mode off, `status.routines.handoff` is never populated server-side (Slice A/B's own rule: `devMode && due.length`), so `eligibleCoachHandoff` returns `null` unconditionally and the banner never renders (`E-1`).
- Turning Dev Mode off does not call `deliverCoachHandoff`, does not mutate any routine, and does not "erase" a due cycle — it simply stops being shown, exactly matching "Play counting and backend routine state continue according to existing architecture."

# Dadified Wording

Continuing Slice D's vocabulary exactly:

| Internal | Human-facing |
|---|---|
| `template === 'canonical-refresh'` | **Coach Refresh** |
| `handoff` / `strategyBoard` / `via: 'copy-report'` | *(never shown)* — the banner just says a routine "is due" |
| `RoutinesProjection.handoff.deliveries[].cycle` | *(never shown)* |
| successful Copy + delivery | `✓ Report Copied · with Coach Refresh` |
| ordinary Copy | `✓ Report Copied` (unchanged) |

`E-3/E-4` and `E-24` assert none of `Canonical Refresh`, `Strategy Board`, `strategyBoard`, or `targets.players: true` ever reach rendered text or the clipboard payload.

# Security / Privacy

- The clipboard payload contains only: the server-built envelope text (routine instructions, Game/repository locator, configured relative source *paths* — never source contents — exactly as Slice A's `buildStrategyBoardEnvelope` already produces and Slice C's report confirmed) plus the exact canonical report text the human already had on screen.
- `E-14` proves Copy never issues a `/api/routines/sources/*` call — no filesystem scan, no source-content fetch, happens as part of this feature at all; the envelope text was already fully assembled server-side before the browser ever sees it.
- No token, credential, `.env` data, or unrelated-Game content is ever concatenated — the payload is built from exactly two already-vetted strings (`handoff.text`, `reportText`), both already governed by existing, separately-tested truthfulness rules (Slice C for the envelope's source-path listing, the pre-existing `humanReportContent` for the report).

# Live Convergence

Every path that could plausibly change due/delivered state ends in `await refresh()` — the existing SSE/status convergence flow, not a locally-computed next state. `E-19/E-20` proves the banner clears strictly because a subsequent real `/api/status` fetch reflects the server's own recorded delivery, and `E-5–E-8` proves render/selection/refresh/Game-switch alone never call the delivery endpoint at all — matching the exact "no manual browser refresh, but also no premature success" requirement.

# Tests and Exact Counts

`test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs` runs the real `src/public/index.html` script against a mocked-but-contract-shaped backend (`status.routines.handoff` and `POST /api/routines/delivered` shaped exactly as `daemon.ts` returns them).

| # | Proves |
|---|---|
| E-1 | Dev Mode OFF: no banner, ordinary Copy payload unchanged |
| E-2 | Dev Mode ON, nothing due: no banner, ordinary Copy unchanged |
| E-3/E-4 | Due banner shows the exact Dadified title/subtext, never internal vocabulary |
| E-5/E-6/E-7/E-8 | Render, report selection, page refresh, and a Game switch each individually never call `delivered` |
| E-9/E-10/E-11 | `Not this time` excludes the envelope for one Copy, marks nothing delivered, and the routine is still due on the next check |
| E-12/E-13 | Envelope precedes the report; the report's tail is byte-exact and unmutated |
| E-14 | No source-content fetch/embedding occurs during Copy |
| E-15/E-16 | `delivered` fires strictly after a confirmed clipboard write, in that order |
| E-17 | A failed clipboard write never calls `delivered`; still due afterward |
| E-18 | A failed delivery acknowledgement never fabricates a "delivered" UI; still due afterward |
| E-19/E-20 | Successful delivery reconverges the banner away from real backend status, with the exact `gameId`/`deliveries`/`via`/`reportPath` |
| E-21 | Game A's due handoff cannot attach to Game B's report or delivery call |
| E-22 | A stale selected-report identity cannot cause copying a different report |
| E-23 | Ordinary Copy (nothing due) is unchanged, including the pre-existing Player-report acknowledgement |
| E-24 | No Player-delivery vocabulary or behavior appears anywhere in this flow |
| E-25 | Mobile-safe CSS (no fixed/sticky banner) |

```
node --test test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs
16 passed, 0 failed
```

Combined with the full pre-existing Coach Routines + Incoming/Settings regression:

```
node --test test/coach-routine-sources.test.mjs test/coach-routines-engine.test.mjs test/coach-routines-daemon.test.mjs test/coach-routines-v0-slice-d-settings.test.mjs test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs
96 passed, 0 failed
```

# Validation Results

| Command | Result |
|---|---|
| `npm run check` | PASS |
| `npm run compile` | PASS |
| `node --test test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs` | 16 passed, 0 failed |
| `node --test` (Coach Routines A+B+C+D+E combined) | 96 passed, 0 failed |
| `node --test` (Q2.10F.2 completion/Incoming suite + dispatcher regression, spot-checked before/after) | 58 passed, 0 failed |
| `npm test` (final run) | **637 passed, 0 failed, 0 skipped, 0 cancelled** (621 before this Slice + 16 new) |
| `git diff --check` | PASS; only pre-existing LF/CRLF notices |

No test-only workarounds were needed for a production defect this time; the two harness-fidelity issues hit while writing tests (static HTML not being tree-walkable in the minimal DOM stub) were fixed in the **test file**, not in production code, since they reflect a stub limitation rather than a browser-observable behavior — verified by reading exactly what real HTML parsing would produce and asserting against the equivalent id-based/`pageSource`-based checks instead.

# Compatibility Notes

- `#copyReportBtn`'s success label is the only visible change to existing behavior, and only when a handoff was actually included (`✓ Report Copied · with Coach Refresh` vs. the unchanged `✓ Report Copied`). `E-23` proves the ordinary path is byte-identical to before.
- The pre-existing Player-report `POST /api/work/acknowledge` call (Q2.10F.2 Slice E) is untouched and still fires on every successful Copy, independent of the new Coach handoff — the two acknowledgement paths coexist without interfering.
- No change to `/api/routines*`, `/api/preferences`, `/api/reports`, dispatch, execution, or Work Ledger contracts.

# Known Constraints

- **The banner's title collapses to `"N Coach Routines"` for multiple, differently-named due routines** rather than listing every name — judged the smallest truthful, non-cluttered Dad-facing summary; the full list still exists in the actual envelope text the human copies.
- **`Not this time`'s exclusion is purely in-memory** (a JS variable) — a page reload before copying loses the skip and the banner reappears. This matches the brief's explicit permission for "browser-local/transient... if that is the smallest truthful implementation," and a reload is itself a form of leaving the interaction.
- **No visual regression / real-browser screenshot proof** — all tests exercise the real script logically, not rendered pixels.

# Smallest Human Field Test

1. Open Settings → turn Dev Mode ON.
2. In Coach Routines, set **Send every** to `1` **Play**, and add one confirmed reference (e.g. `NORTH-STAR.md` via Browse or a suggestion).
3. Use the existing safe **Refresh now** action to make it due (no need to dispatch a real Play).
4. Open one real Incoming report.
5. Confirm the banner reads `↻ Coach Refresh is due`.
6. Tap **Copy Report to Clipboard**.
7. Paste into any harmless text box and confirm: the Coach Refresh instructions appear first, the report's own content follows immediately after with nothing altered in it.
8. Return to (or stay on) Incoming and confirm the due banner is gone — with no manual page refresh.

Optionally, once more: trigger due again, tap **Not this time**, confirm the banner hides and the copied clipboard text has no envelope, then reopen the report (or wait for the next natural status refresh) and confirm `Coach Refresh is due` still shows.

# WAS / IS / WILL BE

## WAS

Coach Routines had a real, human-configurable Settings surface (Slice D) but no way to actually act on a due cycle — the backend could compute `handoff` and accept a `delivered` call, but nothing in the browser ever showed it or called it.

## IS

Incoming shows a due Coach Refresh truthfully and unobtrusively beside Copy, offers a one-time, non-destructive way to skip it, and — only after a real, confirmed clipboard write — prepends the exact server-built handoff to the exact canonical report text the human chose, then records delivery through the real, idempotent, exact-Game/exact-cycle endpoint. The canonical report is never touched. Nothing is ever marked delivered by looking, selecting, refreshing, or switching Games — only by a human successfully copying.

## WILL BE

The next work is V0 human field proof of this completed Coach-side loop end to end (Settings → due → Copy → cleared). Downstream and still explicitly not started: optional exact-instance Player routine delivery (`Send to Players` stays `Coming soon`), routine renaming, multi-routine creation UI, and Play-type-triggered routines.

# Recommended Next Play

**Coach Routines V0 — Human Field Proof / V0 Closure.**

Implementation evidence gives no reason to deviate: the full Coach-side loop (configure → due → copy → deliver → clear) is now real and automation-proven end to end. After that field proof, the broader Sideline roadmap has a prepared Game Setup reconnaissance result waiting for Strategy Board review — but that is explicitly out of scope for this Play and is not begun here.

# Commit / Push Status

No commit was created. Nothing was pushed.

REPORT: Coach-Routines-V0-Slice-E-Incoming-Copy-Coach-Handoff.md
TIMESTAMP: 2026-09-14 12:40:02 -06:00 (America/Edmonton)
