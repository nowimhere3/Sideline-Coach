# Remote Access v1 — Stage 5E Mobile Resilience + SSE Reconnect

**Completed:** 2026-09-24 12:27 MDT  
**Timezone:** America/Edmonton · Calgary, Alberta  
**Agent:** Codex  
**Scope:** Stage 5E only

## Outcome

The paired-phone browser now actively owns SSE recovery through one bounded reconnect manager. It closes failed streams before replacement, converges through `hello → refresh current truth`, reacts immediately to online/foreground wake signals, guards stale streams at an approximately 45-second horizon, and preserves simple product-facing connection language.

The existing mobile layout was hardened at the narrowest phone widths without redesigning it. Wide report/code/terminal content remains bounded inside local scroll containers, and existing safe-area handling was extended to horizontal content padding and modal edges.

## Files changed

- `src/public/index.html`
  - Replaced passive EventSource failure handling with the bounded Stage 5E reconnect manager.
  - Added online/offline and visibility wake handling.
  - Added the 45-second browser watchdog.
  - Added narrow-header, overflow-containment, and safe-area CSS guards.
  - Preserved the existing current-state refresh, Stage 5C pairing reconciliation, and all event handlers.
- `test/remote-access-v1-stage5e-mobile-reconnect.test.mjs` (new)
  - Added bounded functional tests for stream ownership, backoff, wake signals, watchdog behavior, hello resync, narrow layout, safe areas, and security boundaries.

No backend, relay, protocol, daemon-heartbeat, pairing, device-token, Settings-authority, `pair.html`, or Design F production file was changed.

## Reconnect state machine

The browser keeps one authoritative `eventSource` plus one reconnect timer and one watchdog timer.

1. `connectEvents()` clears the prior reconnect/watchdog state, closes any previous EventSource, and creates exactly one replacement.
2. A stream is not healthy merely because its constructor succeeded. Only its existing `hello` event marks it healthy.
3. `hello` resets the retry attempt to zero, clears pending retry state, arms the watchdog, and calls the existing `synchronizeAfterHello()` seam.
4. `synchronizeAfterHello()` uses the existing `refresh()` path to fetch/render current status and reports, refresh AI health, backfill any expanded terminals, and invoke the Stage 5C one-shot pairing reconciliation.
5. `onerror` retires the exact failed source, marks the presentation Reconnecting/Offline, notifies the Stage 5C disconnect seam, and schedules one retry.
6. Events from a retired source are ignored by identity comparison.

EventSource's browser-owned automatic retry no longer competes with the product loop because the failed source is explicitly closed before the product retry is scheduled.

## Exact backoff behavior

The reconnect delays are:

```text
1,000ms → 2,000ms → 4,000ms → 8,000ms → 15,000ms → 15,000ms …
```

- Delay never exceeds 15 seconds.
- Only one reconnect timer may exist.
- Only one EventSource remains active.
- Duplicate error callbacks from a retired source are ignored.
- A successful `hello` resets the next failure to the 1-second delay.
- An immediate wake attempt clears a pending backoff timer first.
- Repeated wake signals do not replace an already healthy stream or an already connecting stream.

## Heartbeat watchdog

The watchdog horizon is exactly `45_000ms`.

Every observable named SSE event resets the watchdog. The daemon's existing 15-second heartbeat is an SSE comment; native EventSource intentionally does not expose comment frames to JavaScript. Therefore the watchdog uses the browser's `EventSource.OPEN` state as the browser-visible evidence that the comment-heartbeat-backed stream remains live. At the watchdog horizon:

- `OPEN` is retained and watched for another bounded horizon, preventing false reconnects on a healthy but product-idle stream;
- `CONNECTING` or `CLOSED` is treated as stale, closed, and sent through the normal bounded reconnect path.

The daemon heartbeat protocol was not changed.

## Online and visibility behavior

- `window.online` immediately preempts a pending backoff and reconnects when unhealthy.
- `window.online` does nothing while healthy.
- `window.offline` retires the active stream and renders `Coach Offline`; normal bounded retry remains ready for recovery.
- `document.visibilitychange` reconnects immediately when the page becomes visible and the stream is unhealthy.
- Backgrounding alone does not reconnect; it retains the existing outgoing-acknowledgement dismissal behavior.

## Post-hello resynchronization

Recovery is exactly:

```text
replacement EventSource → hello → existing synchronizeAfterHello() → existing refresh()
```

This catches up current game state, reports, status, AI health, and expanded-terminal state. No SSE history replay, IndexedDB synchronization, service worker, offline cache, or parallel state store was added.

## User-facing connection state

The existing product language remains:

- `Coach Online`
- `Reconnecting…`
- `Coach Offline`

Temporary transport failures no longer falsely open the authentication card. Only an authoritative HTTP `401` does that. No EventSource, relay, WSS, retry, DNS, or hosting jargon is displayed.

## Responsive/mobile fixes

- Below `380px`, the existing header wraps into two clean rows:
  - brand/game information occupies the first row;
  - connection badge and Settings remain reachable in a full-width action row.
- The application root and sole game scroll region are width-bounded and prevent page-level horizontal drift.
- `pre`/report content uses local `overflow-x: auto`, a 100% maximum width, and contained horizontal overscroll.
- the live terminal body is width-bounded and may scroll horizontally inside itself rather than widening the page.
- the existing `<620px` mobile architecture and hidden Design F behavior are unchanged.
- `#gameScrollRegion` retains top/bottom safe areas and now also honors left/right safe-area insets.
- modal backdrops honor all four safe-area insets.
- the existing fullscreen terminal header/footer safe areas and Scorecard safe-area behavior remain intact.

## Security verification

- Stage 5D remote Settings presentation remains read-only.
- No local-admin controls or device APIs were added to the reconnect manager.
- Device-management route authority was not changed.
- No `sl_dev` read/delete behavior was added.
- Pairing security and current-session authentication were not changed.
- No offline credential or response persistence was introduced.
- `pair.html` was not touched.

## Verification results

1. `npm run compile`
   - PASS (application and relay TypeScript projects)
2. `node --test test/remote-access-v1-stage5e-mobile-reconnect.test.mjs`
   - Total 7; passed 7; failed 0; skipped 0; cancelled 0; todo 0
3. `node --test test/s55-0-settings-hierarchy.test.mjs`
   - Total 22; passed 22; failed 0; skipped 0; cancelled 0; todo 0
4. `node --test test/remote-access-v1-stage5c-pairing-modal.test.mjs`
   - Total 13; passed 13; failed 0; skipped 0; cancelled 0; todo 0
5. `node --test test/remote-access-v1-stage5d-settings.test.mjs`
   - Total 6; passed 6; failed 0; skipped 0; cancelled 0; todo 0
6. `node --test test/ai-usage-scoreboard-ui.test.mjs`
   - Total 55; passed 55; failed 0; skipped 0; cancelled 0; todo 0
7. `node --test test/live-player-console-first-down.test.mjs`
   - Total 32; passed 32; failed 0; skipped 0; cancelled 0; todo 0
8. `node --test test/incoming-reports-copy-repeatability.test.mjs`
   - Total 12; passed 12; failed 0; skipped 0; cancelled 0; todo 0
9. `npm run package`
   - PASS
   - VSIX: 438 entries, 1.09 MB
   - VSIX content audit: PASS; required runtime assets present; developer evidence absent

Aggregate tests: **147 total; 147 passed; 0 failed; 0 skipped; 0 cancelled; 0 todo.**

## Deviations

None. The change remained entirely within the expected shared frontend production file plus the new bounded Stage 5E test. The daemon's comment heartbeat is intentionally unchanged; its browser-visible liveness signal is the native EventSource OPEN state because comment frames are not dispatched as JavaScript events.

## Verdict

**STAGE 5E COMPLETE — GREEN FOR 5F**
