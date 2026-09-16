# Sideline Coach — Stage 1.11 Browser Live-State Reconnection Contract Implementation

## Result

PASS WITH CONSTRAINTS. The browser now treats an SSE connection as transport only, and marks itself Connected only after the current Coach runtime's canonical status and report list have been fetched and rendered.

## Starting state

The workspace was already dirty with prior-stage work, including the Player-instance UI and server changes. This stage was limited to the browser reconnect contract, its focused automated coverage, the architecture breadcrumb, and the narrow diagnostics contract clarification. No commit or push was made.

## Files inspected

- `REPORTS/AntiGravity/Stage-1.10-Browser-Live-State-Reconnection-Forensics.md`
- `src/public/index.html`
- `src/server.ts`
- `test/player-instances.test.mjs`
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
- `Diagnostics/CONTRACT.md`
- `package.json` and `tsconfig.json`

## Files changed

- `src/public/index.html`
- `test/browser-live-state-reconnection.test.mjs`
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
- `Diagnostics/CONTRACT.md`
- this report

## Exact reconnect bug repaired

Previously, the SSE `hello` handler immediately called `setConnected(true)`. After an automatic EventSource reconnection to a new Coach runtime, this allowed old DOM to be presented as Connected when that runtime had emitted no later mutation event.

`hello` now invokes `synchronizeAfterHello()`. It keeps the UI Reconnecting while the existing `refresh()` performs its `/api/status` and `/api/reports` requests, renders both results, and only then transitions to Connected. A synchronization generation prevents an in-flight refresh begun before an error or replacement connection from certifying the browser afterward.

## Connection-state implementation

The page has explicit `connected`, `reconnecting`, and `offline` states. Reconnecting uses the existing compact connection indicator with a warning-colored dot and `Reconnecting…` text. EventSource errors immediately enter Reconnecting. A canonical-refresh failure enters Offline. No server API or SSE payload shape changed.

## Canonical refresh and report behavior

The pre-existing `refresh()` remains the single synchronization path. It fetches status and reports together, renders current Player state first, and refreshes Incoming reports in the same successful synchronization. Existing `reports` and `status` SSE listeners remain intact. No report watcher issue was found and no report architecture was changed.

## Stale-action disabling

The Dispatch Play control and dynamically rendered Put on Field / Add another controls are marked as live actions. They are disabled whenever state is not Connected; handlers also reject a race-time invocation while unverified. Stale information can remain visible while reconnecting, but cannot invite live Player mutations as if it were confirmed state. Server-side stale-ID rejection is unchanged.

## Target preservation

The selected `playerInstanceId` is retained only when the freshly rendered status contains that exact ID. If absent, it is cleared and the selector displays its placeholder rather than choosing a sibling. This preserves Stage 1.8's identity rule and closes the hidden stale-selection path.

## Automated verification

Added focused source-contract coverage in `test/browser-live-state-reconnection.test.mjs` for:

- hello → canonical status and reports refresh → render → Connected ordering;
- error/disconnect transition to Reconnecting;
- disabled live mutators until verified fresh state;
- exact-ID retention, missing selection clearing, and no first-sibling substitution.

Commands run:

```text
npm test       # 20 passed, 0 failed
npm run check  # passed
```

## Human verification requirement/result

Required, not completed in this implementation environment. Start Coach, put a Player on field, keep the browser open, restart the GS3 test Stadium so that Player is gone, and do not manually refresh the browser. Verify Reconnecting while unverified, then fresh `Codex Ready on Bench`, fresh Incoming state, Connected, and no actionable stale Player.

## Breadcrumb Impact

Updated the owning master product breadcrumb with WAS / IS / WILL BE. It now records that Connected means current canonical status and reports were fetched and rendered, and protects the broader no-manual-refresh product rule for future live state.

## Diagnostic Impact

Updated `Diagnostics/CONTRACT.md` narrowly to state the browser freshness contract and name possible future browser-state diagnostics. No Stage B diagnostics, collection, or telemetry was implemented.

## Remaining known unknowns

- The irreducible end-to-end Stadium restart test remains for a human with the live VS Code / GS3 environment.
- This stage does not add a browser-visible timestamp or runtime generation diagnostic.
- Future live-state sources still need to adopt this contract at their own appropriate data seams.

## Recommended next Play

Perform the single live restart verification, then use this synchronization contract when adding the next dynamic live-state surface.
REPORT NAME: Stage-1.11-Browser-Live-State-Reconnection-Contract-Implementation.md
STAGE: Stage 1.11
WHAT IT IS: Browser Live-State Reconnection Contract Implementation
TIMESTAMP: 2026-09-10 20:35 MDT
