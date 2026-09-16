REPORT FILE: Coach-Routines-V0.2-Human-Field-Reconciliation-And-Dad-Mode-Consolidation.md
REPORT TIMESTAMP: 2026-09-14 17:43 MDT (America/Edmonton)

# Coach Routines V0.2 — Human Field Reconciliation and Dad-Mode Consolidation

## Phase 1 — Reconciliation

**Old human mental model** (what field testing showed Dad actually had to understand): a permanently-expanded per-routine editor with every control always visible; a manual "Add to next report" button implying he had to remember to trigger refreshes himself; a large blue "Coach Refresh is due / Not this time" decision card demanding he re-approve something he'd already configured; plumbing-heavy Copy success text ("· with Coach Refresh"); disconnected toast-only save confirmation; an eagerly-fetched wall of "Suggested references"; a duplicated "Dev Mode" label; a "Queue for Codex" button that could linger with nothing meaningful to queue; and a raw Git-flavored report exposing commit hashes when he opened the wrong historical report.

**New human mental model**: "I configured this once — Sideline handles the rest and only interrupts me for a real decision." Concretely: named, collapsed routine cards he expands only when he wants to change something, with one explicit "Done" that only ever confirms real success; cadence alone drives when a routine is due; Copy just says "Report copied", with a small "✓ AI Assistant Coach brief included" note as the only due-related signal; report preview opens on the actual Player report, not Sideline's wrapper; every save shows its own Saving…/Saved ✓/failure right where he's looking; suggestions stay out of the way until he asks for them; Dev Mode reads once; Queue only appears when queueing is the real next action.

**Plumbing preserved (never destroyed), only hidden from Dad Mode:**
- Manual due (`POST /api/routines/:id/due`, `CoachRoutineEngine.markDue`) — endpoint, engine method, and every direct backend/API-level test (`coach-routines-engine.test.mjs` A8/A10, `coach-routines-daemon.test.mjs` B4/B5) are untouched. Only the UI button was removed from the ordinary routine card.
- "Not this time" skip/defer (`skippedHandoffReportKey`, `#coachHandoffSkipBtn`, `#coachHandoffBanner`) — the entire subtree, listener, and its effect on `eligibleCoachHandoff` remain in the code, fully functional if invoked. `syncIncomingCoachHandoff` now unconditionally keeps `#coachHandoffBanner` hidden instead of removing it, so Dad Mode never surfaces it, but nothing was deleted. No new advanced/Dev surface was built to host it (per the explicit instruction not to build one solely for this Play).
- All queue infrastructure (durable queue, exact-instance queueing, context-owner queue behavior, endpoints, restart/interrupt survival) — completely untouched; only `refreshDispatchControls()`'s `offer` calculation gained two extra conditions (a real prompt payload, and re-evaluation on every prompt keystroke).
- Canonical Player report content — never modified, sanitized, or rewritten anywhere in this Play. The "Commit and Push Report" field evidence is preserved as a breadcrumb (Dev Mode → Git Activity, below), not "fixed" by touching Player-authored text.

**Plumbing genuinely removed from the Dad-facing surface (not the backend):** the `markDue` button element in the routine card; the large `#coachHandoffBanner`/"Not this time" visual surface (element retained, permanently hidden); the eager, render-time `ensureRoutineSuggestions` auto-fetch call; the duplicate "Dev Mode" text node; the "· with Coach Refresh" Copy-success suffix.

**No requested behavior contradicted existing architecture.** Everything requested was UX consolidation over already-correct plumbing (Copy → delivery acknowledgement → backend reconvergence → due-cycle clear was never touched, and none of the STOP CONDITIONS in Section 20 were triggered — no cadence architecture rewrite, no Git automation, no Game bootstrap, no queue rewrite, no report mutation).

## Exact implementation

### 1. Collapsed routine cards (`src/public/index.html`)

- New per-routine UI state: `routineExpanded` (Map, default collapsed), `routineMutationInFlight` (Map of the in-flight mutation Promise Done awaits), `routineSuggestionsOpen` (Map, see §10). All three reset on Game switch (`resetCoachRoutinesUiState`) and participate in the render-memoization key.
- `renderRoutineCard`: the head (name/title + ON/OFF toggle) always renders. If not expanded, a one-line summary (`{cadenceLabel} · {N} reference(s)`) plus an `Edit` button render, and the function returns early — none of cadence/target/source/instruction/last-refresh/Delete render while collapsed.
- The editable name `<input>` (for non-`canonical-refresh` routines) now renders only while expanded; collapsed always shows plain text, satisfying "do not display large editing controls while collapsed."
- `+ Add Coach Refresh` creates the routine via the existing `POST /api/routines`, then immediately marks the new routine's id `expanded = true` — it opens already editable, with no separate "create mode" screen.
- `runRoutineMutation` gained a wrapper, `triggerRoutineMutation`, that also records the mutation's own Promise in `routineMutationInFlight`. All 8 existing per-field mutation call sites now go through it.
- **Done**: always rendered while expanded (not only after a save). On click it `await`s any pending `routineMutationInFlight` entry first; if the resulting save state is `'error'`, it stays expanded with the failure already shown beside the card; otherwise it collapses the card, closes transient browse/info/suggestion state, and clears the save-state row. It never triggers the routine and never navigates away from Settings — "Back to Sideline" is untouched.
- **Delete**: unchanged endpoint/confirmation flow, now reachable only while expanded (matches "keep an obvious Delete routine action while editing"). Deleting the last routine still returns to the same zero-routine state (`CoachRoutineEngine.remove` sets `defaultsInitialized = true`, unchanged), and nothing is silently recreated.

### 2. Manual due removed from the ordinary card

The `markDue` button and its click handler were deleted from `renderRoutineCard`. `POST /api/routines/:id/due`, `CoachRoutineEngine.markDue`, and their engine/daemon tests are unchanged. No UI in this Play calls that endpoint anymore.

### 3 / 4. Due/"Not this time" card removed; compact disclosure added

- `syncIncomingCoachHandoff` now always sets `#coachHandoffBanner` (the large card) `hidden = true`, and separately drives a new element, `#coachBriefDisclosure` (`✓ AI Assistant Coach brief included` + a `View brief` button), from the exact same backend truth (`eligibleCoachHandoff`) the old banner used. `#coachHandoffTitle`'s text is still kept converged (dead but harmless) so the retained internal banner never shows stale text if some future surface ever re-enables it.
- No new "advanced" surface was built for "Not this time" — the skip button/handler remain wired but unreachable in Dad Mode, per the explicit instruction not to build a large new advanced UI solely for this Play.

### 5. Report preview positions at the canonical Player report

- `#reportPreview` (`<pre>`) now contains two child nodes: `#reportPreviewBrief` (the Assistant Coach envelope text, `hidden` by default) and `#reportPreviewBody` (the canonical, unmutated `humanReportContent(report.content)`). The full payload is inspectable in the same viewer — no second, separately-rendered copy of the report is created anywhere.
- `renderReportPreview` (called on report selection) always resets the brief to collapsed for the newly selected report; `syncIncomingCoachHandoff` (called on every status refresh) keeps only the brief's *content* converged with backend truth, never its open/closed state — so a background status poll never re-collapses a brief the human deliberately opened.
- `#viewBriefBtn` (`View brief`, inside the new disclosure) reveals the brief and opens the `<details id="reportPreviewDetails">` wrapper.
- Without a due handoff, behavior is unchanged: the brief stays empty/hidden and the body is the entire preview, exactly as before this Play.

### 6. Copy language

`#copyReportBtn` default/aria-label text: `Copy Report to Clipboard` → `Copy Report`. Success text: `✓ Report Copied` / `✓ Report Copied · with Coach Refresh` → `✓ Report copied` (one string regardless of whether a brief was included — Dad already saw the disclosure). Failure text (`Copy Failed · Try Again`) and the underlying truthfulness contract (clipboard success is distinct from delivery acknowledgement; a failed acknowledgement shows a compact truthful toast and never fabricates success) are unchanged — the already-fixed Copy → delivered acknowledgement → backend reconvergence → due-cycle-clear contract (Field Corrective, prior Play) is verified unchanged by `FC-2`/`FC-3` in this Play's validation run.

### 7. Save feedback locality

- Routine mutations: unchanged mechanism (`routineSaveState` + the save row beside the card), now integrated with collapse — the row (and Done) live inside the expanded card only.
- Repository URL: new local state `repoUrlSaveState` (`null|'saving'|'saved'|'error'`) rendered into a new `#coachRepoUrlSaveText` element directly beside the input. `Saved ✓` fades automatically after 2.5s (superseded safely by a newer save via a generation counter) unless another save is in flight. A global toast still exists for the failure case but is no longer the only evidence a save succeeded.

### 8. Repository field polish

Label changed to `GitHub repository (optional)`; helper text unchanged (`Used by your AI Assistant Coach when it cannot access this Game's local files.`); it remains Game-level metadata above the routine list, not owned by any one routine. No Git call, no authentication, no remote validation was added — `CoachRoutineEngine.setRepositoryUrl`'s format-only check from V0.1 is unchanged.

### 9. Zero-state spacing

Added `.coach-repo-section` (margin/border separating the repository field from the routine list) and `.coach-routines-list`/`.coach-routines-empty` (spacing for the list and its empty-state paragraph) so the three layers — repository field, empty-state text, `+ Add Coach Refresh` — read as distinct sections.

### 10. Suggested references on demand

- The eager `ensureRoutineSuggestions(gameId)` call at the top of `renderRoutineCard` was removed. Suggestions are now fetched only when the human clicks the new `Suggest references` button (which also flips `routineSuggestionsOpen` for that routine and reveals the (still-cached-per-Game) list); a `Hide suggestions` button collapses it again without refetching. `+ Add references` (deliberate browsing) is unchanged.
- The underlying suggestion/discovery algorithm (`/api/routines/sources/suggest`, `fetchRoutineSuggestions`, its per-Game cache) was not rewritten — only its trigger point moved from render-time to click-time.
- The future "`Coach/` folder becomes the primary suggestion scope" idea is breadcrumbed (below), not implemented.

### 11. Dev Mode single label

The redundant `<label class="choice dev-mode-row">…<span>Dev Mode</span>…</label>` wrapper was removed; the checkbox now sits directly in the card's title row (which already has `justify-content: space-between`), with `aria-label="Dev Mode"` carrying the accessible name instead of a second visible text node. The heading `<h3>Dev Mode</h3>` plus its description paragraph are unchanged.

### 12. Queue visibility, contextual only

`refreshDispatchControls`'s MANUAL "offer" computation gained `hasPrompt = Boolean($('promptInput')?.value?.trim())` as an additional required condition (alongside the pre-existing busy-target check), and the `promptInput` `input` listener now also calls `refreshDispatchControls()` so visibility reacts live to typing/clearing, not only to Player-selection or execution-state changes. AUTO mode's own "Queue for …" route-preview text was already gated on a non-empty prompt (via `requestRoutePreview`'s early return) and needed no change. No queue infrastructure, endpoint, or test was touched.

### 13 / 14 / 15. Breadcrumbs only (not implemented)

Added a new `### Coach Routines V0.2 Follow-ups` section to `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, and updated the existing V0.1 AI-Assistant-Coach-terminology bullet to note the disclosure is now shipped. Covers: progressive-disclosure teaching + Settings glossary (deferred); a future Dev-Mode-only "Git Activity" diagnostics surface for Sideline's *own* future Coach-source-sync operations (explicitly distinct from, and never touching, canonical Player-authored reports); the `Coach/` + `Reports-SLC/` bootstrap and its bounded, no-push-on-every-Play sync/freshness-preflight policy; and future Player-side standing-knowledge injection once "Send to Players" is enabled. None of these were implemented — Git automation, Game bootstrap, and Player-side delivery remain entirely out of scope per the STOP CONDITIONS.

## Tests

Two categories of change:

**Updated existing suites** (to match the new, intentional behavior — not regressions): `coach-routines-v0-slice-d-settings.test.mjs` (routine cards now require an `Edit` click to reach per-field controls; suggestions are on-demand; the manual-due button and its old test were replaced with an explicit "manual due is not a Dad-facing action anymore" assertion), `coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs` (the large due card is now asserted to stay hidden; a new `disclosureVisible()` helper checks the compact disclosure; Copy success text updated), `coach-routines-human-field-polish.test.mjs` (Done now collapses the card; save-state assertions target the text node, not the whole row, since Done itself is always present once expanded), `coach-routines-field-corrective-banner-clear.test.mjs` (same disclosure/copy-text updates, preserving the exact field-corrective regression proof), and three non-Coach-Routines suites that read `#reportPreview.textContent` directly or asserted the old Copy strings (`dispatcher-reliability-ux.test.mjs`, `q2-10f-2-completion-report-ready-acknowledgement.test.mjs`, `q2-10f-2-lifecycle-e2e.test.mjs`) — updated to read `#reportPreviewBody.textContent` and the new Copy language.

**New focused coverage**, `test/coach-routines-v0.2-dad-mode-consolidation.test.mjs` (8 tests): report-preview positioning (zero envelope lines in the initial viewport; `View brief` reveals the full payload without mutating the report node; ordinary behavior unchanged without a brief); repository-field local Saving…/Saved ✓/failure feedback; the single "Dev Mode" label; zero-state layering CSS; and Queue's contextual visibility (hidden with an empty prompt, hidden for an idle target, visible only for a real prompt against a genuinely busy exact Controlled Player, and hidden again once the prompt clears). Collapse/Edit/Done, on-demand suggestions, and manual-due removal are covered in the updated Slice D/Human-Field-Polish suites above rather than duplicated here.

Existing-contract regression (all re-run, all passing, per §16): per-Game routine persistence, multiple independent routines, Add/Edit/Enable-Disable/Delete, cadence counting, source selection, custom instruction, per-Game repository URL and its handoff fallback/local-path lines, canonical report content, manual-due and "Not this time" plumbing (internally), successful/failed Copy delivery acknowledgement, due-cycle clear, Game isolation, Dev Mode gating, Incoming report selection, Work Ledger/exact-instance semantics, queue durability, and routing hierarchy.

## Final full-suite count

- `npm run check` — clean.
- `npm run compile` — clean.
- Coach Routines + Incoming/report-reader + Dispatcher/queue/routing suites (13 files) — **173/173 passed**.
- `npm test` (full repository suite) — **671 passed, 0 failed** (baseline 663 + 8 new V0.2 tests).
- `git diff --check` — exit 0; only pre-existing LF/CRLF `autocrlf` informational warnings on files this Play touched, no whitespace-error findings.

## Human retest

1. Settings → Coach Routines: click `Edit` on an existing routine; change the "GitHub repository" field and confirm `Saving…` then `Saved ✓` appear right beside the field (not just a toast).
2. Click `+ Add Coach Refresh`; confirm it opens already expanded and editable. Rename it, set cadence to every 1 Play, add a reference. Click `Suggest references` — confirm the list stays hidden until this click. Click `Done` — confirm the card collapses to `{name} · ON · Every 1 Play · N references`.
3. Dispatch 1 qualifying Play (cadence every 1 Play is the smallest practical test cadence — no "Add to next report" button exists anymore).
4. Confirm Incoming does **not** show a large "Coach Refresh is due / Not this time" card — only a small `✓ AI Assistant Coach brief included` line with `View brief`.
5. Open "Preview report": confirm the first visible line is the actual Player report content, not the Assistant Coach wrapper. Click `View brief` and confirm the wrapper is now visible above it (scroll up if needed) — full payload, same viewer.
6. Click `Copy Report`; confirm success says simply `✓ Report copied`.
7. Confirm the disclosure disappears automatically within normal convergence time (no reload) — the due cycle cleared.
8. With Codex/AntiGravity mid-Play, type a new prompt in MANUAL mode targeting that same busy instance — confirm `Queue for …` appears; clear the prompt — confirm it disappears.
9. Settings: confirm "Dev Mode" reads once, not twice.

## Breadcrumbs added/updated

`Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`: updated the V0.1 AI-Assistant-Coach-terminology bullet (disclosure now shipped; teaching/glossary still deferred), and added `### Coach Routines V0.2 Follow-ups` covering progressive-disclosure teaching + Settings glossary, a future Dev-Mode "Git Activity" diagnostics surface, the `Coach/` + `Reports-SLC/` bootstrap with its bounded no-push-on-every-Play sync/freshness-preflight policy, and future Player-side standing-knowledge injection. None implemented.

## Deliberately deferred (per explicit instruction)

Coach Routines cadence architecture rewrite; automatic Git commit/push; a new Git credential/auth system; Game bootstrap implementation; `Coach/` folder migration; `Reports-SLC/` implementation; Player-side Coach Routine delivery; queue architecture rewrite; canonical report mutation (the Git-heavy historical report was read, never touched); broad Incoming redesign beyond the specific field findings above; the 3–5-exposure progressive teaching counter and Settings glossary (noted as "essentially free" only if an obvious seam existed — none did, so both are breadcrumbed instead).

## STOP CONDITIONS assessment

None triggered. Every change in this Play was a bounded Dad-facing visibility/consolidation change over already-correct, already-tested backend plumbing — no architecture was rewritten.

## Is Coach Routines ready for final human closure after this pass?

Yes, pending the human retest above. The mechanical contract (create/edit/delete, cadence-driven due, delivery acknowledgement, due-cycle clearing, Game isolation, Dev Mode gating) was already correct going into this Play; this pass specifically closes the human-field gap between "works mechanically" and "reads as a normal, trustworthy product surface" — collapsed cards, no plumbing-heavy manual controls, no re-litigated due decisions, truthful and local save feedback, and a report preview that opens on the human's actual report. The only remaining softness noted anywhere in this pass is optional polish explicitly deferred as breadcrumbs (teaching/glossary, Git Activity diagnostics, Coach-source sync) — none of it blocks calling V0.2 field-ready.

REPORT: Coach-Routines-V0.2-Human-Field-Reconciliation-And-Dad-Mode-Consolidation.md
TIMESTAMP: 2026-09-14 17:43 MDT (America/Edmonton)
