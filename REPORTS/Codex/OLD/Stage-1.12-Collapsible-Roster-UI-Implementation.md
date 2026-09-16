# Sideline Coach — Stage 1.12 Collapsible Roster UI Implementation

## Result

PASS WITH CONSTRAINTS. The Roster now has a compact browser-only collapsed presentation with a live canonical `Players · N On Field` summary. The requested small live-browser human check remains outstanding.

## Starting state

Stage 1.11's human-proven browser reconnect contract was already present: an SSE `hello` triggers canonical status and report rendering before the browser becomes Connected. The working tree was already dirty with prior-stage work; this stage was limited to the Roster's presentation, focused browser source-contract coverage, the owning master breadcrumb, and this report. No commit or push was made.

## Exact files changed

- `src/public/index.html`
- `test/browser-live-state-reconnection.test.mjs`
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
- `REPORTS/Codex/Stage-1.12-Collapsible-Roster-UI-Implementation.md`

## Collapse interaction

The existing Roster header now contains a compact real button with a chevron, accessible name/title, `aria-controls="roster"`, and accurate `aria-expanded` state. It uses normal button keyboard activation.

Expanded is the default and keeps the existing Roster rows and their Put on Field / Add another controls unchanged. Collapsing hides only the Roster body and header badge, leaving a small card containing `Players · N On Field` and the disclosure control. Expanding restores the same rendered body without navigation or a modal.

Collapsed/expanded is page-local browser presentation state only. It is not sent to CoachServer, PlayerRoster, dispatch, or Game state, and no persistence or polling system was added.

## Summary derivation

Every `renderStatus(status)` computes the summary directly from `status.players`: it sums `instances.length` only for Player entries whose current `fieldState` is `on-field`.

This counts Player instances rather than types: Claude, Codex, and Codex 2 produce `Players · 3 On Field`. A Ready on Bench Player contributes zero. There is no second stored counter and no assumption about the number or identity of future Player types.

## Live update behavior

The summary is rewritten during the existing canonical `renderStatus` path. Existing status SSE events already call `refresh()`, and Stage 1.11's reconnect `hello` refresh also reaches the same path before Connected. Consequently an on-field instance added or closed while the Roster is collapsed updates the visible number without browser refresh, including after reconnect convergence.

Stage 1.8 exact Player-instance selection behavior and the expanded Put on Field/Add another actions remain in their existing code paths.

## Mobile behavior

No separate mobile variant was introduced. The card remains within the existing responsive shell; when collapsed it removes all Roster rows and setup actions, reduces padding, suppresses the eyebrow/badge, and retains only the summary and a 36px disclosure button. This materially returns vertical space to Incoming and Play Dispatcher on narrow layouts.

## Automated verification

Focused coverage in `test/browser-live-state-reconnection.test.mjs` verifies:

- normal expanded Roster body is controlled by the collapse interaction and restored on expand;
- compact control semantics, label/title, `aria-expanded`, and collapsed layout behavior;
- summary derivation from live on-field Player instance arrays rather than types, excluding Ready on Bench;
- status SSE refresh reaches the same live summary projection;
- existing Stage 1.11 reconnect ordering and Stage 1.8 exact-instance target-preservation contracts still pass.

Commands run successfully:

```text
npm run check       # passed
npm run compile     # passed
npm test            # 22 passed, 0 failed
git diff --check    # passed
npm run diagnostics # completed
```

Diagnostics reported its existing unrelated `A6` configured-port ephemeral-range condition and `A5` duplicate-copy warning. It reported a current build and did not identify a new collapse-state runtime boundary.

## Human verification

Required, not completed in this implementation environment. Please perform one tiny live check:

1. Confirm the Roster looks normal expanded.
2. Click the chevron to collapse it.
3. Confirm the compact header says `Players · N On Field` with the correct count.
4. Put a Player on field or close one and confirm the number changes automatically.
5. Expand again and confirm normal Roster controls remain available.

## Breadcrumb Impact

Updated the owning master product breadcrumb with the requested WAS / IS / WILL BE:

- **WAS:** setup controls permanently occupied vertical space after assembly.
- **IS:** the Roster collapses into a compact live Player-instance summary while expanded mode retains setup controls.
- **WILL BE:** setup-heavy surfaces should yield attention after setup; future status/footer/settings surfaces may apply the principle without authorizing a redesign now.

The roadmap working board now records Collapsible Roster UI as complete.

## Diagnostic Impact

None. Collapse state is browser presentation only, so no diagnostic collection, storage, or telemetry was added.

## Remaining known unknowns

- The live browser interaction and live instance add/close update await the single requested human check.
- No browser-layout automation exists in this zero-dependency project; the implementation is intentionally validated by focused DOM/source contracts plus that narrow human visual check.

## Recommended next Play

Perform the five-step live Roster check, then continue the next bounded product Play after recording its outcome.

REPORT NAME: Stage-1.12-Collapsible-Roster-UI-Implementation.md
STAGE: Stage 1.12
WHAT IT IS: Collapsible Roster UI Implementation
TIMESTAMP: 2026-09-10 20:57 MDT
