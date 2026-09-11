# Sideline Coach — Stage 1.14 Live Incoming Reports Implementation

## Result

PASS WITH CONSTRAINTS. Incoming reports now use last-request-wins canonical rendering, so an older overlapping report refresh cannot overwrite a newer report discovery. The one requested live browser test remains outstanding.

## Starting state

The repository already had report discovery, five-item report history, preview, clipboard copy, report filesystem watchers, SSE report events, and Stage 1.11 canonical browser refresh/reconnect behavior. The working tree was already dirty with prior-stage work. This stage was limited to the Incoming stale-state seam, focused tests, the owning roadmap breadcrumb, and this report. No commit or push was made.

## Current report architecture inspected

- Report directories are configured by `coach.reportGlobs`, defaulting to `**/Docs REPORT/**/*.{md,txt}`, scoped through the current VS Code workspace.
- `CoachServer` owns filesystem watchers. `start()` installs one watcher per configured glob before opening the HTTP server; server disposal disposes those watcher subscriptions.
- Each watcher emits the existing `reports` SSE event for create, change, and delete. A filesystem rename is represented by the platform watcher as delete/create transitions.
- The watcher is signal-only. `/api/reports` is the canonical current projection: `scanReports(5, true)` searches the configured workspace globs, URI-deduplicates overlapping glob results, stats files, skips oversized/unreadable candidates, sorts by descending mtime, and reads the newest five.
- `/api/reports/latest` uses the same scan with a limit of one. Recent history is therefore the current five-item projection; existing reports remain available until outside that established bound.
- Browser `reports` SSE events already call the Stage 1.11 canonical `refresh()` path, which fetches both `/api/status` and `/api/reports`, then rerenders Incoming, Latest Report, selection/history, preview, and copy source.
- An SSE reconnect emits `hello`; Stage 1.11's existing synchronization performs the same status-and-reports refresh before Connected.

## Exact stale-report cause

The server watcher/event/scanner path was fundamentally sound. The browser allowed multiple asynchronous canonical `refresh()` requests to render in completion order. If an earlier report scan completed after a newer report-event refresh, it could overwrite the newly rendered Incoming projection with an older report list, leaving Latest Report and history stale.

## Exact files changed

- `src/public/index.html`
- `test/live-incoming-reports.test.mjs`
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
- `REPORTS/Codex/Stage-1.14-Live-Incoming-Reports-Implementation.md`

## Smallest fix and live behavior

`refresh()` now takes a monotonically increasing browser-local refresh generation. Only the latest requested successful canonical response may call `renderStatus()` and `renderReports()`. A superseded response returns without changing the DOM; a superseded failure cannot falsely mark the current UI Offline.

No report cache, second report-state owner, polling loop, server API, watcher ownership, report identity, or Player architecture was added. A reports SSE event continues to request the existing canonical refresh. A successful current refresh while reconnecting establishes Connected only after canonical status and reports have rendered, preserving Stage 1.11's freshness rule.

## Report history, duplication, and partial writes

History remains the existing five newest reports ordered by descending filesystem mtime. The scan's URI map means a file matching more than one configured glob appears once; repeated watcher events trigger refreshes but cannot create duplicate history rows because the browser replaces its projection from the URI-deduplicated current scan.

No write-settling/debounce mechanism was added. The current watcher already announces later change events during writes, and last-request-wins ensures a later current projection cannot be overwritten by an earlier partial/older scan. No evidence showed a distinct incomplete-write failure that would justify adding a queue or delay in this bounded stage.

## Automated verification

Added `test/live-incoming-reports.test.mjs` coverage for:

- watcher setup during server startup across configured report globs;
- create/change/delete report transitions emitting the existing `reports` SSE signal;
- URI deduplication, descending-mtime ordering, newest report selection, and five-item history projection;
- reports SSE flowing through canonical refresh, latest report selection, and last-request-wins rendering;
- reconnect-safe transition to Connected only after a current canonical render.

Existing Stage 1.11 reconnect, Stage 1.8 exact Player target, and Stage 1.13 Roster contracts remain green.

```text
npm run check       # passed
npm run compile     # passed
npm test            # 25 passed, 0 failed
git diff --check    # passed
npm run diagnostics # completed
```

Diagnostics reported only its pre-existing `A6` configured-port ephemeral-range condition and `A5` duplicate-copy warning. The report watcher surfaced no new diagnostic runtime boundary requiring implementation in this stage.

## Human verification

Required, not completed in this implementation environment. Perform one small live check:

1. Keep Sideline Coach open on Incoming without refreshing the browser.
2. Cause one legitimate test report to be written into an existing supported report folder.
3. Confirm Latest Report updates automatically, the new report appears once in Recent reports, old history remains available, and preview/copy still work.

## Breadcrumb Impact

Updated the master roadmap with the requested WAS / IS / WILL BE live-Incoming rule:

- **WAS:** Incoming could remain stale until a later refresh, restart, or manual synchronization.
- **IS:** new valid reports automatically propagate through the canonical Coach scan to the open browser; Latest Report and Recent reports update without refresh while history remains available.
- **WILL BE:** all live Coach information updates at its appropriate data seam; no-manual-refresh is a product contract rather than a Player-only exception.

## Diagnostic Impact

NO implementation impact. The stale condition was a browser canonical-refresh ordering race, not a new durable diagnostics boundary. Existing diagnostics were run and their unrelated findings are recorded above.

## Remaining known unknowns

- The requested live end-to-end watcher test remains needed in the actual VS Code/Game runtime.
- Equal filesystem mtimes retain the scan's existing discovery ordering; no evidence ties such a tie to the observed stale report behavior.
- This stage deliberately does not attribute reports to individual Player instances.

## Recommended next Play

Perform the single live Incoming report test, then record whether the current watcher path is field-proven before widening report behavior.

REPORT NAME: Stage-1.14-Live-Incoming-Reports-Implementation.md
STAGE: Stage 1.14
WHAT IT IS: Live Incoming Reports Implementation
TIMESTAMP: 2026-09-11 00:00 MDT
