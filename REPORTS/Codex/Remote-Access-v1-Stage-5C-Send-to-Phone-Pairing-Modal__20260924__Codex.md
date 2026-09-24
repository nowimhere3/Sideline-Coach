# Remote Access V1 — Stage 5C Send to Phone + Pairing Modal

**Date:** 2026-09-24  
**Agent:** Codex  
**Scope:** Stage 5C only  
**Verdict:** **GREEN FOR 5D**

## Continuation basis

This was a same-session delta continuation from green Stages 5A, 5B, and 5P. Per the execution card, no prior Field Packet, Scout report, Stage 4 report, or Stage 5A/5B/5P report was reread.

Design authority consumed from `TEMP`:

- `remote_block_logo_options_173x130.html` — Design F / Viewfinder visual reference.
- `ChatGPT Image Sep 24, 2026, 08_33_54 AM.png` — expanded-scorecard placement reference.

## Files changed

- `src/public/index.html`
  - Added the desktop-only Design F action tile in the expanded AI Usage Scorecard.
  - Added the dedicated `#pairingModal` and its waiting, expired, and success states.
  - Added the production `window.SendToPhoneController`.
  - Added strict `pairing-complete` SSE correlation and one-shot reconnect reconciliation.
- `test/remote-access-v1-stage5c-pairing-modal.test.mjs`
  - Added the bounded nine-test Stage 5C suite.
- `REPORTS/Codex/Remote-Access-v1-Stage-5C-Send-to-Phone-Pairing-Modal__20260924__Codex.md`
  - This report.

No QR, pairing-cryptography, RelayClient, enrollment, device-registry, daemon, extension, or `pair.html` production file was changed in this slice.

## Design F and desktop placement

The production tile uses the approved Design F / Viewfinder language without introducing a new concept:

- exact `173px × 130px` tile geometry;
- four-corner viewfinder frame;
- centered phone/scan icon;
- `Remote` heading;
- blue idle/waiting treatment;
- pulsing frame while waiting;
- muted connected treatment with the approved green dot and in-phone check;
- muted unavailable treatment.

The existing primary seams remain intact:

- `.ai-scoreboard-provider-cards` remains the existing two equal columns for Codex and Claude;
- `.ai-scoreboard-secondary-cards` remains the existing two equal columns for Clock and Utility;
- only `.ai-scoreboard-action-card`, the existing bottom-right Utility quadrant, is subdivided into `minmax(0, 1fr) 173px`;
- its left half contains `Copy Complete Context` and `Refresh`, vertically stacked;
- its right half contains Design F.

The existing Collapse, Copy, position switch, top/bottom placement, provider cards, and clock remain on their prior paths. The complete 55-test Scorecard regression suite is green.

## Mobile unchanged

The existing `620px` breakpoint is reused. No new mobile information architecture or breakpoint was added.

- `.send-to-phone-tile` is `display: none` by default and is displayed only inside `@media (min-width: 620px)`.
- `.ai-scoreboard-action-stack` is `display: contents` below the desktop breakpoint, so the existing mobile Copy Context / Refresh flex layout retains its pre-5C geometry.
- The existing mobile `Local Time | Actions` two-column panel rules were not changed.
- The Stage 5C mobile assertion and the full Scorecard mobile regression tests pass.

## Controller behavior

`window.SendToPhoneController.open()` now:

1. requires a local hostname (`localhost`, `127.0.0.1`, or `[::1]`) and the existing desktop breakpoint;
2. changes the tile to the real waiting state;
3. if needed, enables the existing durable `remoteAccess.enabled` preference through `POST /api/preferences`;
4. captures one local paired-device baseline for possible SSE recovery;
5. records the pairing start time;
6. calls the existing local-only `POST /api/pairing/create` exactly once;
7. validates and renders the returned `pairingId`, `qrSvg`, `code`, and numeric `expiresAt`;
8. starts the local display countdown and waits for verified completion.

The controller does not create a second Remote Access architecture and does not change the relay or pairing protocol.

## Modal states and countdown

The dedicated `#pairingModal` does not use or alter the generic confirmation dialog.

- **Waiting:** locally generated QR SVG, fallback code, Copy Code, and live expiry countdown.
- **Expired:** waiting content is replaced with an explicit expired message and `Get New Code` action.
- **Success:** displays `Phone Connected!`, updates Design F to `Phone Connected`, and auto-closes after 2,500 ms.
- **Cancel / Close:** stops countdown and auto-close timers, closes the modal, and clears only the active browser presentation state.

Countdown authority is the actual daemon-provided `expiresAt`. Each render computes `Math.max(0, expiresAt - Date.now())`, displays `M:SS`, and clamps at `0:00`. Expiry does not create another pairing; only Dad selecting `Get New Code` calls `open()` again.

Cancel does not disable Remote Access, change the liveness lease, revoke a device, or create another pairing.

## SSE correlation and recovery

Primary success authority remains the daemon's `pairing-complete` event. A completion is accepted only when:

```text
event.pairingId === activePairing.pairingId
```

A wrong or stale pairing ID is ignored.

Recovery is bounded and non-polling:

- the controller records device IDs once before pairing creation;
- an SSE error marks the active, visible modal as having experienced a disconnect;
- a subsequent SSE `hello` invokes reconciliation;
- a per-pairing `reconciliationUsed` guard is set before the request, allowing exactly one recovery `GET /api/devices`;
- success requires a device absent from the baseline whose authoritative `createdAt` is at or after the active pairing's recorded start time;
- additional reconnects perform no further device requests;
- no interval or periodic device polling exists.

## Security verification

- Pairing creation and device reconciliation continue to use existing local-only backend routes.
- The browser's local/desktop check is presentation gating only; backend route policy remains authority.
- No route policy was widened and `/api/devices` was not made public.
- No pairing secret, fallback code, device token, `sl_dev`, enrollment credential, or host private key is written to logs by the new code.
- No pairing material is persisted by the browser.
- The fragment-bearing URL is not logged or copied into unrelated browser state; the modal renders only the daemon-returned QR SVG and fallback code.
- Success is never inferred from elapsed time.
- The Stage 5B security/event regression suite remains green, including invalid/expired/burned non-emission and credential-safety coverage.

## Verification

Final commands and exact results:

1. `npm run compile`
   - PASS (`tsc -p ./` and `tsc -p relay`)
   - Also rerun successfully by the final packaging prepublish step.
2. `node --test test/remote-access-v1-stage5c-pairing-modal.test.mjs`
   - total 9; passed 9; failed 0; skipped 0; cancelled 0; todo 0.
3. `node --test test/remote-access-v1-stage5b-qr.test.mjs`
   - total 8; passed 8; failed 0; skipped 0; cancelled 0; todo 0.
4. `node --test test/ai-usage-scoreboard-ui.test.mjs`
   - total 55; passed 55; failed 0; skipped 0; cancelled 0; todo 0.

Aggregate executed tests: **72 total; 72 passed; 0 failed; 0 skipped; 0 cancelled; 0 todo.**

## Packaging audit

`npm run package` rebuilt `sideline-coach-0.1.0.vsix` and passed:

```text
VSIX content audit PASS: 438 archive entries; required runtime assets present; developer evidence absent.
```

The package command emitted the repository's existing informational warnings about a missing manifest `repository` field and extension bundling; neither affected the successful package or audit result.

## Visual evidence

The bounded suite asserts the production source geometry and hierarchy directly:

- unchanged outer provider and secondary 50/50 grids;
- Utility-only `actions | 173px Design F` subdivision;
- approved Viewfinder path and `173px × 130px` dimensions;
- desktop-only display at the existing breakpoint;
- unchanged mobile `Local Time | Actions` structure.

No separate screenshot was generated because the current verification path uses the real production document under a deterministic DOM/backend harness rather than a live authenticated product session. The supplied Design F HTML and placement screenshot were used as the exact visual authorities.

## Deviations

None. The implementation stayed within the expected production surface (`src/public/index.html`) plus the bounded Stage 5C test and report. Stage 5D was not started.

## Verdict

**GREEN FOR 5D**
