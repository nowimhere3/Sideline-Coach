# Remote Access v1 — Stage 5C Final Frame Anchoring Fix

**COMPLETED:** 2026-09-24 11:58 AM MDT  
**TIMEZONE:** America/Edmonton · Calgary, Alberta  
**AGENT:** Codex  
**SCOPE:** Final bounded Stage 5C visual defect only  
**VERDICT:** **STAGE 5C COMPLETE — GREEN FOR 5D**

## Files changed

- `src/public/index.html`
  - Replaced the single aspect-ratio-driven Viewfinder SVG frame with four independently edge-anchored corner marks.
- `test/remote-access-v1-stage5c-pairing-modal.test.mjs`
  - Tightened bounded assertions for top/bottom anchoring and representative desktop widths.
- `REPORTS/Codex/Remote-Access-v1-Stage-5C-Final-Frame-Anchoring-Fix__20260924__Codex.md`
  - This report.

No backend, daemon, relay, pairing, QR, enrollment, device-registry, bootstrap, `pair.html`, controller, modal, or mobile-IA production file changed.

## Exact frame DOM change

The former frame was one SVG with a `155 × 114` view box. Although its CSS specified top and bottom, the rendered corner drawing retained the SVG aspect ratio derived from its responsive width. That allowed the visible bottom path to move relative to the tile at changing aspect ratios.

It is now a neutral wrapper containing four independent marks:

```html
<span class="send-to-phone-frame" aria-hidden="true">
  <span class="send-to-phone-corner top-left"></span>
  <span class="send-to-phone-corner top-right"></span>
  <span class="send-to-phone-corner bottom-left"></span>
  <span class="send-to-phone-corner bottom-right"></span>
</span>
```

Each corner remains a fixed `16px × 16px` shape with the existing 2px neutral line treatment and 4px outer radius. The corner geometry is not stretched or distorted as the tile changes width or natural height.

## Exact anchoring model

The wrapper uses the already accepted responsive inset on all four edges:

```css
.send-to-phone-frame {
  position: absolute;
  inset: var(--remote-frame-inset);
}
```

Its children anchor directly to their corresponding edges:

```text
top-left:     top: 0;    left: 0
top-right:    top: 0;    right: 0
bottom-left:  bottom: 0; left: 0
bottom-right: bottom: 0; right: 0
```

Because the wrapper uses one `inset` value, top equals bottom and left equals right by construction. Bottom placement no longer depends on SVG width, SVG height, a view box, an aspect ratio, or a transform.

The waiting-state pulse still targets the frame wrapper, so all four marks pulse together without changing their positions.

## Responsive-height preservation

The accepted tile sizing strategy is unchanged:

- `height: auto`;
- `align-self: stretch`;
- no fixed 130px height;
- natural row height follows the Copy Context + Refresh stack (~104px wide state and ~124px wrapped state).

Tile colors, label wrapping, icon sizing, `Copy Context`, outer Scorecard seams, and the 620px mobile breakpoint are unchanged.

## Representative-width verification

The bounded suite checks the unchanged outer 50/50 seams and responsive inner Utility split at each human-reviewed viewport width:

- **832px:** all four fixed-size marks fit inside the symmetric inset wrapper at both accepted natural tile heights.
- **699px:** the previously good state remains inside the same explicit edge anchors.
- **645px:** bottom marks use `bottom: 0`; no width-derived downward drift is possible.
- **627px:** immediately above the existing mobile breakpoint, left/right and top/bottom geometry still fits inside the tile with no overflow or deformation.

For each representative width, the test derives the available Design F track from the unchanged outer grids and asserts that twice the responsive inset plus the fixed 16px corner size remains inside both tile width and the 104px/124px natural height states.

Below 620px, `.send-to-phone-tile` remains hidden and the existing mobile Scorecard rules remain unchanged.

## Functional freeze

No functional Stage 5C code changed. The following remain on their accepted paths:

- `SendToPhoneController`;
- Remote Access auto-enable;
- pairing creation;
- QR/modal/code/countdown;
- strict SSE pairing correlation;
- one-shot reconciliation;
- expiry and new-code behavior;
- cancel and copy-code behavior;
- connected state and auto-close;
- pairing security and relay/bootstrap behavior.

## Verification results

1. `npm run compile`
   - PASS (`tsc -p ./` and `tsc -p relay`).
2. `node --test test/remote-access-v1-stage5c-pairing-modal.test.mjs`
   - total 13; passed 13; failed 0; skipped 0; cancelled 0; todo 0.
3. `node --test test/ai-usage-scoreboard-ui.test.mjs`
   - total 55; passed 55; failed 0; skipped 0; cancelled 0; todo 0.

Aggregate: **68 total; 68 passed; 0 failed; 0 skipped; 0 cancelled; 0 todo.**

The source change is shipped in the VSIX, so the existing packaging audit was also rerun:

4. `npm run package`
   - prepublish compile PASS;
   - VSIX rebuilt with 438 archive entries;
   - `VSIX content audit PASS: 438 archive entries; required runtime assets present; developer evidence absent.`

The existing informational warnings about the missing manifest `repository` field and extension bundling remain unchanged and did not affect the audit.

## Final verdict

**STAGE 5C COMPLETE — GREEN FOR 5D**

Top and bottom Viewfinder marks now use identical direct-edge anchoring. The frame remains inside the naturally sized tile at 832px, 699px, 645px, and 627px; no width/aspect-ratio path can move the bottom corners; mobile and all Stage 5C behavior remain green.
