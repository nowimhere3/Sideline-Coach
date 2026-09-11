# Sideline Coach — Stage 1.13 Fix Collapsible Roster Body

## Result

PASS WITH CONSTRAINTS. The actual Player-row container now hides when the Roster collapses. The requested small live-browser confirmation remains outstanding.

## Observed Stage 1.12 human failure

The Stage 1.12 chevron changed state and hid the Check Roster badge, but the Player rows, statuses, and Put on Field / Add another controls remained visible. The card therefore did not recover meaningful vertical space.

## Root cause

`setRosterCollapsed()` correctly set `#roster.hidden`, and `#roster` is the same container that `renderStatus()` populates with Player rows. However, the author stylesheet's `.roster { display: grid; }` overrode the browser user-agent `[hidden] { display: none; }` declaration, so the hidden attribute did not visually hide that grid.

## Exact files changed

- `src/public/index.html`
- `test/browser-live-state-reconnection.test.mjs`
- `REPORTS/Codex/Stage-1.13-Fix-Collapsible-Roster-Body.md`

## Smallest fix

Added the explicit author-level rule:

```css
.roster[hidden] { display: none; }
```

No DOM ownership, rendering behavior, Player state, server state, dispatch behavior, or synchronization path changed. The existing collapse function still toggles only the real `#roster` body's `hidden` property. While collapsed, `renderStatus()` continues rebuilding that hidden body and updating the visible live summary; expanding exposes the current rows and controls again without reload.

## Strengthened test

The focused collapse test now proves all of the required relationship:

- the disclosure control targets `#roster`;
- collapse sets that container's `hidden` property;
- `.roster[hidden]` explicitly resolves to `display: none` despite the normal grid rule;
- `renderStatus()` clears and appends dynamically created `.player` rows to that same `#roster` container.

This would have failed for the Stage 1.12 condition where the body was marked hidden but CSS continued displaying it as a grid.

## Automated verification

```text
npm run check       # passed
npm run compile     # passed
npm test            # 22 passed, 0 failed
git diff --check    # passed
npm run diagnostics # completed
```

Diagnostics again reported the pre-existing unrelated `A6` port-in-ephemeral-range condition and `A5` duplicate-copy warning. No presentation-state diagnostic work was added.

## Required human verification

Required, not completed in this implementation environment:

1. Open Coach with Roster expanded.
2. Click collapse.
3. Confirm all Player rows disappear and the card becomes compact.
4. Confirm `Players · N On Field` remains visible.
5. Expand again and confirm all Player rows and controls return.

## Breadcrumb Impact

None. Stage 1.12's existing Roster principle remains correct; this play makes implementation behavior match it.

## Diagnostic Impact

None. This is browser presentation behavior only.

## Recommended next Play

Perform the five-step live Roster check, then proceed only after the compact-body behavior is field-confirmed.

REPORT NAME: Stage-1.13-Fix-Collapsible-Roster-Body.md
STAGE: Stage 1.13
WHAT IT IS: Fix Collapsible Roster Body
TIMESTAMP: 2026-09-10 21:03 MDT
