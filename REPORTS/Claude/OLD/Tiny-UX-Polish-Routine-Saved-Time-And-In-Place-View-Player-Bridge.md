REPORT FILE: Tiny-UX-Polish-Routine-Saved-Time-And-In-Place-View-Player-Bridge.md
REPORT TIMESTAMP: 2026-09-14 18:20 MDT (America/Edmonton)

# Tiny UX Polish — Routine Saved Time + In-Place View Player Bridge

## Change 1 — Collapsed routine card: last-saved time

### Saved-time source of truth

`CoachRoutine` (`src/control-plane/coach-routines.ts`) gained a mutable `updatedAt: number` field, alongside the existing immutable `createdAt`:

- `create()` sets `updatedAt = createdAt` (the initial save).
- `update()` sets `routine.updatedAt = this.now()` **only after** `Object.assign(routine, config)` succeeds — i.e. only on a real, validated, persisted mutation. A rejected mutation (`RoutineValidationError`, e.g. an out-of-range cadence) throws before reaching that line, so `updatedAt` never advances.
- `initializeDevModeDefaults()`'s amended default routine also sets `updatedAt = createdAt`.
- `decodeState()` (store reload) preserves a persisted `updatedAt`, falling back to `createdAt` for any pre-existing routine that predates this field — truthful, since that routine's config has not knowingly changed since creation.
- `RoutineView.updatedAt` (the browser-facing projection) is populated directly from `routine.updatedAt` in the private `view()` method — nothing computed or fabricated in the projection layer.

This is the exact durable, per-Game, per-routine persisted mutation timestamp the assignment asked for — no new store, no new field on the wire beyond one number, reusing the existing `RoutineView` contract every routine card already consumes.

### Display

`src/public/index.html`: a new deterministic formatter, `formatSavedTime(ts)`, renders `"5:42 PM"` for today or `"Sep 14, 5:42 PM"` for any earlier date (`toLocaleTimeString`/`toLocaleDateString`, no ticking timer, no new `setInterval`). The collapsed-card summary line changed from:
```
{cadenceLabel} · {N} reference(s)
```
to:
```
{cadenceLabel} · {N} reference(s) · Saved {formatSavedTime(routine.updatedAt)}
```
`routine.updatedAt` is always the real backend value threaded straight through from the last `refresh()`, so:
- A failed save never advances the displayed time (the refetched projection still carries the old `updatedAt`, since the server-side value never changed).
- A plain re-render/reload never fabricates a new time — it just displays whatever the backend's `updatedAt` currently is.
- Two routines carry independent `updatedAt` values (independent `CoachRoutine` records), so their displayed saved times never cross-contaminate.

### Done semantics (unchanged, verified)

`Done` already (from the V0.2 Play) awaits any pending mutation (`routineMutationInFlight`), stays expanded with the real failure shown on error, and collapses only after success — this Play changed nothing about that logic. The only new behavior is that once collapsed, the summary line now includes the just-saved time, because `Done`'s collapse only ever happens after `patchRoutine`'s own `refresh()` has already re-fetched the fresh `updatedAt` from the server.

## Change 2 — Post-dispatch primary CTA bridge

### Post-dispatch bridge source of truth

`src/public/index.html`:
- `DISPATCH_BRIDGE_MS = 12_000` (within the requested ~10–15s window).
- `dispatchBridgeActive(attempt)`: true only when `attempt.phase` is `'sent'` or `'queued'`, `attempt.playerInstanceId` is set (exact identity from the real dispatch reply — never inferred), `attempt.delivery !== 'unknown'` (delivery must be confirmed), and `Date.now() < attempt.bridgeUntil`.
- `attempt.bridgeUntil = Date.now() + DISPATCH_BRIDGE_MS` is set in `submitDispatch()` at the exact same two points the pre-existing `attempt.fullUntil` (Outgoing's own 8s decay) is set — confirmed `'sent'` (not Unknown) and `'queued'`. A companion `scheduleDispatchBridgeEnd()` reuses the exact same single-`setTimeout` pattern as the pre-existing `scheduleOutgoingDecay()` — no second timer architecture, one more bounded one-shot timeout.
- `renderDispatchButton()` checks `dispatchBridgeActive(dispatchAttempt)` first: if true, `#dispatchBtn` renders `View <exact Player> ↑` (from `currentPlayerDisplayLabel`, the same exact-identity helper used everywhere else in this codebase), otherwise it falls through to the pre-existing Dispatch/Queue-for-owner/disabled logic entirely unchanged.
- `#dispatchBtn`'s single click listener now branches: `dispatchBridgeActive` → `viewDispatchedPlayer(dispatchAttempt)` (the exact same `dismissOutgoingAck(); revealPlayer(instanceId);` sequence Outgoing's own View button always used, now factored into one shared function and also used by Outgoing's own `goView`); otherwise → the original `submitDispatch()`.
- The bridge always ends — clearing `bridgeUntil` and re-rendering — on: clicking View (`viewDispatchedPlayer`), a material prompt edit, or leaving Outgoing (all three already funnel through `dismissOutgoingAck()`, which now also clears the bridge), or its own bounded timeout.

Because `viewDispatchedPlayer` calls the exact same `revealPlayer(instanceId)` Outgoing's View button always called, every existing invariant — exact-instance targeting (never "latest provider terminal"), reduced-motion vs. smooth scroll, the ~1.5s highlight, focus-the-strip-or-fallback-to-name, "no target left the Team" graceful handling, zero automatic scroll/focus without a click — is reused verbatim, not reimplemented.

### Duplicate CTA handling

While the bridge is active, `renderOutgoingAcknowledgement()` returns its `hide()` path immediately (checked right after the existing `submitting`/`outgoingDismissed` guards) — the large Outgoing panel renders nothing at all, so there is exactly one visible next action (`#dispatchBtn` itself), never two "View X" buttons on screen simultaneously. This suppression is scoped precisely: it never applies to `phase === 'failed'` (handled in an earlier branch — "Couldn't send" + Try Again renders immediately, unaffected) or `delivery === 'unknown'` (excluded from `dispatchBridgeActive` by design — Outgoing's richer Unknown panel, with its "Recover Play Text" action, renders immediately as before, since an unconfirmed delivery is not something the bridge should imply "View" for). Once the bridge ends (click, edit, leave, or timeout), Outgoing resumes rendering exactly per its own independent `fullUntil` state — if that 8s window has already passed, it reappears already in its compact `"✓ Sent to X · View"` form; the two timers were never coupled beyond both starting at the same dispatch moment.

## Tests

### Saved timestamp

`test/tiny-ux-polish-routine-saved-time-and-dispatch-bridge.test.mjs`, Saved-1 through Saved-7 (real daemon + real `CoachRoutineEngine`, and the real `index.html` script):
1. `create()`/`update()` set/advance a real, backend `updatedAt`.
2. The collapsed card renders the deterministic `Saved <time>` text from that real value.
3. A rejected (invalid) mutation never advances `updatedAt`.
4. Two independent routines keep independent `updatedAt` values.
5. A plain reload/re-render of identical backend truth never fabricates a new save time.
6. `Done` waits for a real successful save before collapsing, and the collapsed card then shows the freshly persisted time.
7. A failed save leaves `Done` expanded with the true failure shown, and the previously-saved time is never advanced.

### Post-dispatch bridge

The existing, much larger `test/q2-10f-2-outgoing-handoff-view-player.test.mjs` (D-1 through D-24, 24 tests — the dedicated Outgoing/View-Player contract suite) was updated in place rather than duplicated, since it already exercises exact-instance targeting, focus, scroll, highlight, reduced motion, accessibility, and mobile CSS in depth; re-pointing its click targets at `#dispatchBtn` during the bridge window (reusing the identical underlying `revealPlayer` action) gives full coverage of the new contract for free:
- D-1/D-4/D-5/D-19: successful dispatch morphs `#dispatchBtn` into `View <exact Player>`, and `#outgoingAck` stays hidden (no duplicate CTA).
- D-2/D-3: the bridge label is stable across execution-state transitions (Starting → Working); execution truth lives on the Player strip, not the bridge.
- D-6/D-7: Failed and Unknown are unaffected — no bridge, Outgoing's existing panel renders exactly as before.
- D-8: the bridge (12s) outlasts Outgoing's own 8s decay; at bridge-end both surfaces correctly resume/revert.
- D-9/D-9b: a material prompt edit or leaving Outgoing ends the bridge immediately.
- D-10: a second dispatch replaces the bridge target immediately.
- D-11/D-12/D-13/D-14/D-15/D-16/D-16b/D-17: clicking the bridge CTA reuses the exact existing View action — navigation, TEAM expansion, exact-target scrolling, reduced-motion behavior, the ~1.5s highlight, focus-the-strip-or-name-fallback, and the graceful "left the Team" message, all unchanged.
- D-18: no auto-scroll anywhere in the lifecycle (unaffected by this Play).
- D-20/D-21/D-22/D-23/D-24: no duplicate ticking path, exactly one interval, accessible naming, mobile-safe layout.

`Bridge-1` (new file) adds the one explicit check not naturally covered by the above: before any dispatch, the primary CTA reads plainly `Dispatch Play`.

### Collateral fixes (not new behavior, existing tests updated for the intentional change)

Five other suites asserted `#dispatchBtn.textContent === 'Dispatch Play'` or read `#outgoingAck` immediately after a confirmed dispatch — `q2-10f-2-browser-execution-store.test.mjs` (B-11, B-12, B-13, B-17) and `q2-10f-2-lifecycle-e2e.test.mjs` (F-1). Updated to expect `View <exact Player> ↑` and, where a test's own helper set `promptInput.value` directly instead of firing a real `input` event (only relevant inside the same test, dispatching a second Play), switched to the already-available `page.type(...)`/`page.typeInPrompt(...)` helpers so the material-edit-ends-the-bridge path is exercised exactly as a real human typing would trigger it.

## Final full-suite count

- `npm run check` — clean.
- `npm run compile` — clean.
- Relevant Coach Routines / Dispatcher / Player-strip / completion-bridge suites (12 files, including the full 24-test Outgoing/View-Player suite) — all passing.
- `npm test` (full repository suite) — **679 passed, 0 failed** (baseline 671 + 8 new: Saved-1..7, Bridge-1).
- `git diff --check` — exit 0; only pre-existing LF/CRLF `autocrlf` informational warnings on files this Play touched, no whitespace-error findings.

## Human retest

**Routine save confidence**
1. `Developer: Reload Window`.
2. Edit an existing Coach Refresh.
3. Change one field.
4. Confirm local Saving/Saved feedback (unchanged from V0.2).
5. Click Done.
6. Confirm the collapsed card now reads e.g. `Every 1 Play · 1 reference · Saved 5:42 PM`.

**Dispatch bridge**
1. Enter a tiny Play.
2. Dispatch to a known Player.
3. Keep the mouse where `Dispatch Play` was.
4. Confirm that same primary CTA becomes `View <exact Player> ↑`.
5. Click it and confirm the exact Player is focused/scrolled into view.
6. Repeat without clicking View and confirm the CTA reverts to `Dispatch Play` on its own after roughly 12 seconds.

## Deliberately deferred

Nothing new was deferred beyond what V0.1/V0.2 already breadcrumbed (progressive teaching, Settings glossary, Git Activity diagnostics, `Coach/` + `Reports-SLC/` sync policy, Player-side standing knowledge) — this Play's two durable UX principles (in-place post-dispatch bridge; truthful local saved-time confidence on collapsed cards) were added to `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` as short, already-implemented (`IS`) entries, not as further deferred work.

REPORT: Tiny-UX-Polish-Routine-Saved-Time-And-In-Place-View-Player-Bridge.md
TIMESTAMP: 2026-09-14 18:20 MDT (America/Edmonton)
