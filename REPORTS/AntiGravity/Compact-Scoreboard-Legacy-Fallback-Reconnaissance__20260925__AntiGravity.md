# SCOUT RECONNAISSANCE — COMPACT SCOREBOARD / LEGACY FALLBACK

**Target Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Date:** September 25, 2026  
**Agent:** AntiGravity  
**Mission:** Read-only architectural reconnaissance of the scoreboard utility stack, evaluating the feasibility of a shared 78px height target and the preservation of Legacy Squadron Expanded.

---

## 1. CURRENT LAYOUT MAP

All scoreboard DOM construction, layout logic, and styling are centralized in [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html).

```
#aiScoreboardContainer.ai-scoreboard [.ai-scoreboard-top | .ai-scoreboard-bottom]
├── .ai-scoreboard-anchor
│   ├── .ai-scoreboard-header (Title + Copy/Expand/Position controls)
│   └── #aiScoreboardCompact.ai-scoreboard-compact (14-rail telemetry + Zone 3)
└── #aiScoreboardExpanded.ai-scoreboard-expanded (Dashboard)
    ├── .ai-scoreboard-provider-cards
    │   ├── #aiScoreboardCodexCard.ai-scoreboard-card.codex
    │   └── #aiScoreboardClaudeCard.ai-scoreboard-card.claude
    └── .ai-scoreboard-secondary-cards [UTILITY LOWER REGION]
        ├── #aiScoreboardLocalTimeCard.ai-scoreboard-card [DATE/TIME AREA]
        │   ├── #aiScoreboardLocalDate.ai-scoreboard-meta-row
        │   ├── #aiScoreboardLocalClock.ai-scoreboard-clock
        │   └── #aiScoreboardLocalTz.ai-scoreboard-meta-row
        ├── #aiScoreboardActionCard.ai-scoreboard-card.ai-scoreboard-action-card
        │   ├── .ai-scoreboard-action-stack
        │   │   ├── button#aiScoreboardExpandedCopyBtn.secondary ("Copy Context")
        │   │   └── button#aiScoreboardRefreshBtn.secondary ("Refresh")
        │   └── button#sendToPhoneTile.send-to-phone-tile [SEND TO PHONE / CENTERPHONE]
        │       ├── span.send-to-phone-frame (corner brackets)
        │       └── div.send-to-phone-middle
        │           ├── div.send-to-phone-icon (centerphone SVG artwork + status dot)
        │           └── div#sendToPhoneLabel.send-to-phone-label ("Send to Phone")
        └── button#aiScoreboardCloseBtn.ai-scoreboard-close ("×")
```

### Exact DOM Nodes & Hierarchy
1. **Scoreboard Outer Container:**
   - HTML Host: `<div id="aiScoreboardContainer" class="ai-scoreboard">` (line 2179).
   - Structural flex sibling to `#gameScrollRegion`. CSS `order: 2` (default bottom) or `order: 0` (top via `body.ai-scoreboard-top`).
2. **Date/Time Area:**
   - Container: `<div id="aiScoreboardLocalTimeCard" class="ai-scoreboard-card">` (lines 5995–6007).
   - Nodes: `#aiScoreboardLocalDate` (date string), `#aiScoreboardLocalClock` (clock digits), `#aiScoreboardLocalTz` (IANA timezone label).
3. **Copy Context Button:**
   - `<button id="aiScoreboardExpandedCopyBtn" type="button" class="secondary">Copy Context</button>` (lines 6014–6018).
4. **Refresh Button:**
   - `<button id="aiScoreboardRefreshBtn" type="button" class="secondary">Refresh</button>` (lines 6019–6023).
5. **Send to Phone Tile:**
   - `<button id="sendToPhoneTile" type="button" class="send-to-phone-tile" data-s="0" data-state="idle" aria-label="Send to Phone">` (lines 6028–6054).
6. **Centerphone Artwork / Block:**
   - Nested inside `#sendToPhoneTile`:
     - Frame: `.send-to-phone-frame` with four corner brackets (`.send-to-phone-corner.top-left`, etc.).
     - Center artwork: `.send-to-phone-icon` containing 48×48 SVG icon (phone outline, screen, buttons, live checkmark) + `.send-to-phone-dot`.
     - Label: `#sendToPhoneLabel.send-to-phone-label` (defaults to `"Send to Phone"`, updates dynamically to `"Waiting for Phone…"`, `"Phone Connected"`, `"Phone Unavailable"`).
7. **Utility Footer / Lower Region:**
   - Outer wrapper: `<div class="ai-scoreboard-secondary-cards">` (lines 6056–6072).
   - On desktop, hosts `aiScoreboardLocalTimeCard` (left column) and `aiScoreboardActionCard` (right column).
   - Proximity close button (`#aiScoreboardCloseBtn`) is appended directly into `secondaryCards`.

---

## 2. RESPONSIVE / BREAKPOINT MAP

| Breakpoint / Query | Scope | Element / Behavior Controlled | Source Reference |
| :--- | :--- | :--- | :--- |
| **`@media (min-width: 560px)`** | Desktop / Tablet | `.ai-scoreboard-provider-cards` and `.ai-scoreboard-secondary-cards` switch from `grid-template-columns: 1fr` to `1fr 1fr`. | `index.html:1408–1411` |
| **`@media (min-width: 620px)`** | Desktop Utility | `.ai-scoreboard-action-card` turns into a 2-column grid (`repeat(2, minmax(0, 1fr))`, gap: 10px). Sets container `scorecard-utility / inline-size`. `.ai-scoreboard-action-stack` flexes column (gap: 8px). Enables `.send-to-phone-tile` (`align-self: stretch`). Buttons allow wrapping (`white-space: normal`). | `index.html:1445–1500` |
| **`@container scorecard-utility (max-width: 280px)`** | Desktop Utility Container | Triggers when the utility card column narrows below 280px. Drops label font to 13px and enforces `.send-to-phone-tile[data-s="0"] .send-to-phone-label { max-inline-size: 7.5ch; }` (forces label into two lines: "Send to" / "Phone"). | `index.html:1496–1499` |
| **`@media (max-width: 619px)`** | Mobile Expanded Only | Merges `secondaryCards` into one card (`border: 1px solid var(--line); gap: 0;`). Divides columns via `border-left: 1px solid var(--line)`. Hides Send to Phone (`.send-to-phone-tile { display: none; }`). Buttons get `min-height: 36px; padding: 6px 8px; font-size: clamp(.62rem, 7.4cqw, .82rem); line-height: 1.15;`. Action card gap becomes `6px`. | `index.html:1518–1571` |
| **`aiScoreboardIsMobile()` JS gate** | Runtime logic (`max-width: 619px`) | Controls short vs long date formatting in cards (line 6191) AND **gates `isLocalDesktop()`** (line 5695). | `index.html:5451–5453` |

---

## 3. WHY THE HEIGHTS DIFFER

### 1. Why Mobile Reaches Exactly 78px
* **CSS Selector:** `.ai-scoreboard-secondary-cards .ai-scoreboard-action-card button` (line 1564).
  * Explicitly sets: `min-height: 36px; padding: 6px 8px; font-size: clamp(.62rem, 7.4cqw, .82rem); line-height: 1.15;`.
* **CSS Selector:** `.ai-scoreboard-secondary-cards > .ai-scoreboard-action-card` (line 1561).
  * Explicitly sets: `gap: 6px;`.
* **Geometry:** `Copy Context` (36px) + `gap` (6px) + `Refresh` (36px) = **78px**.
* `send-to-phone-tile` is `display: none` (line 1443), eliminating any cross-column grid stretching.

### 2. Why Desktop Wide Reaches ~104px
* **CSS Selector:** Global `button, select, input` reset (line 49) enforces `min-height: 48px;`.
* **CSS Selector:** Global `button` (line 543) enforces `padding: 12px 14px; font-weight: 800;`.
* **CSS Selector:** Desktop `.ai-scoreboard-action-stack` (line 1453) enforces `gap: 8px;`.
* Desktop defines **no height or padding overrides** on `.ai-scoreboard-action-stack button`.
* At 739px viewport:
  * Scoreboard width is 711px; `actionCard` is ~310px; `actionStack` track is ~150px.
  * Inner button width = 150px − 30px (padding/border) = 120px.
  * "Copy Context" fits on one line (takes ~95px). Single line + 24px padding + 2px border clamps to `min-height: 48px`.
* **Geometry:** `Copy Context` (48px) + `gap` (8px) + `Refresh` (48px) = **104px**.
* `.send-to-phone-tile` has `align-self: stretch` and stretches to match this 104px height.

### 3. Why Desktop Narrow (~633px) Reaches ~124px
* At 633px viewport:
  * Outer card: 605px; inner card: 577px; `secondaryCards` half-track: 283.5px.
  * `actionCard` inner width (after 24px card padding): 257.5px.
  * `actionStack` column (after 10px grid gap): **123.75px**.
  * Inner button text box = 123.75px − 30px (padding/border) = **93.75px**.
* Text "Copy Context" in 1rem bold requires ~95–100px and **cannot fit on one line** in 93.75px.
* **CSS Selector:** `.ai-scoreboard-action-stack button` has `white-space: normal;` (line 1454).
* "Copy Context" wraps into 2 lines ("Copy" / "Context").
* Line height 1.15 (~19.2px) × 2 lines = ~38.4px + 24px padding + 2px border = **~64–68px** tall.
* Refresh does not wrap (remains 48px).
* **Geometry:** `Copy Context` (~68px) + `gap` (8px) + `Refresh` (48px) = **~124px**.
* Documented in codebase comment (lines 1458–1459):
  `/* Height is grid-stretched from the real button stack: ~104px when both buttons are 48px, ~124px when Copy Context wraps to 68px. */`

---

## 4. 78PX FEASIBILITY

| Viewport | Button Stack (36 + 6 + 36) | "Copy Context" Text Wrapping | Send to Phone Tile Height Constraint | Overall Feasibility |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile (< 620px)** | **78px** (current truth) | Single line (0.82rem clamp) | N/A (`display: none`) | **Feasible (Production baseline)** |
| **~633px (Desktop Narrow)** | **78px** if 36px height + 6px gap applied | Single line **only if** `white-space: nowrap` and font/padding reduced | **Risk:** Icon (38px) + gap (4px) + 2-line label (29px) + padding (16px) = **87px** > 78px | **Feasible WITH conditions** (requires tile tuning) |
| **~739px (Desktop Wide)** | **78px** if 36px height + 6px gap applied | Single line fits easily | Label is 1 line. Icon (38px) + label (16px) + padding (16px) = **74px** ≤ 78px | **Feasible** |
| **≥ 760px (Full Desktop)** | **78px** if 36px height + 6px gap applied | Single line fits easily | Fits cleanly within 78px | **Feasible** |

---

## 5. SEND TO PHONE / CENTERPHONE IMPACT

1. **Grid Stretch Coupling:**
   On desktop, `.ai-scoreboard-action-card` is a 2-column CSS Grid with `align-items: stretch`. `#sendToPhoneTile` has `align-self: stretch; height: auto`.
   * If the button stack is 78px, the Send to Phone tile will be stretched to 78px as well.
2. **The 633px Vertical Deficit:**
   * At container widths ≤ 280px, the container query enforces `max-inline-size: 7.5ch` on `.send-to-phone-label`, breaking `"Send to Phone"` into two lines:
     Line 1: `"Send to"`
     Line 2: `"Phone"`
   * Two-line label height = ~29px.
   * SVG Icon: `clamp(38px, 16cqw, 44px)` = 38px.
   * Frame padding: `clamp(8px, 3cqw, 12px)` top & bottom = 16px.
   * Internal gap: 4px; borders: 2px.
   * Minimum natural height = 38 + 29 + 16 + 4 + 2 = **89px**.
   * If `#sendToPhoneTile` is forced into 78px, its `overflow: hidden` will clip the label or corner frame unless:
     a) Icon is scaled down from 38px to ~28–30px, OR
     b) Tile padding is tightened to 4px–6px, OR
     c) Label is allowed 1 line at slightly reduced font size (e.g., 11.5–12px).
3. **Dynamic State Strings:**
   In state 1 (`waiting`), the label is `"Waiting for Phone…"`. At narrow widths, this can wrap to 3 lines if not sized carefully.

---

## 6. LEGACY SQUADRON EXPANDED PRESERVATION PLAN

To preserve the current 104px/124px desktop layout as **Legacy Squadron Expanded** without creating duplicate DOM, parallel components, or maintenance debt:

1. **Conceptual & Architectural Preservation:**
   * **Do not fork the DOM.** Both compact and expanded desktop layouts share the exact same DOM tree (`aiScoreboardLocalTimeCard`, `aiScoreboardActionCard`, `actionStack`, `sendToPhoneTile`).
   * Preserve the legacy sizing rules under a distinct CSS class selector, e.g.:
     `.ai-scoreboard.legacy-squadron-expanded` (or a dedicated configuration token in state).
2. **Zero-Overhead CSS Tokenization:**
   * The difference between Legacy Squadron and Compact 78px is bounded to 5 properties on desktop:
     ```css
     /* Legacy Squadron Expanded (Reference Geometry) */
     .ai-scoreboard.legacy-squadron-expanded .ai-scoreboard-action-stack button {
       min-height: 48px;
       padding: 12px 14px;
       font-size: 1rem;
       white-space: normal;
     }
     .ai-scoreboard.legacy-squadron-expanded .ai-scoreboard-action-stack {
       gap: 8px;
     }
     ```
3. **Reference Snapshot Anchor:**
   * Archive the full CSS ruleset, bounding dimensions, and visual contract in this scout document and an anchor document in `Docs ANCHOR/` so the exact 104px/124px baseline is permanently recorded and testable without active production execution paths.

---

## 7. RECOMMENDED IMPLEMENTATION SEAM

The smallest, safest implementation seam touches **only CSS within the `@media (min-width: 620px)` block** in [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L1445-L1500).

```
File: src/public/index.html
Lines: ~1448–1500
```

1. **Target `.ai-scoreboard-action-stack button`:**
   * Add:
     * `min-height: 36px; height: 36px;`
     * `padding: 6px 10px;`
     * `font-size: clamp(0.75rem, 3.2cqw, 0.82rem);`
     * `white-space: nowrap;`
     * `line-height: 1.15;`
   * Prevents "Copy Context" from wrapping into two lines at 633px, locking button height at 36px.
2. **Target `.ai-scoreboard-action-stack`:**
   * Change `gap: 8px` to `gap: 6px`.
   * Result: 36px + 6px + 36px = **78px total utility stack**.
3. **Target `.send-to-phone-tile` at container widths ≤ 280px:**
   * Adjust icon clamp from `clamp(38px, 16cqw, 44px)` to `clamp(28px, 12cqw, 34px)`.
   * Tighten tile padding to `padding: 6px 8px`.
   * Allows the tile with its centered icon, status dot, frame corners, and label to fit comfortably inside the 78px grid height without overflow.
4. **Zero JS Changes Required:**
   * No changes to `buildAiScoreboardDom()`, `SendToPhoneController`, or `aiScoreboardIsMobile()`.

---

## 8. RISKS / ACCEPTANCE TESTS

### Structural & Layout Risks
1. **Critical JS Gate Coupling:**
   [`index.html` line 5695](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L5695):
   ```javascript
   const isLocalDesktop = () => {
     const hostname = String(location.hostname || '').toLowerCase();
     const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
     return local && !aiScoreboardIsMobile();
   };
   ```
   *Caution:* If the breakpoint or `aiScoreboardIsMobile()` function is altered to encompass desktop, `isLocalDesktop()` will return `false`, which completely disables Send to Phone pairing. **Do not change `aiScoreboardIsMobile()`.**
2. **Test Regex Assertions in `test/ai-usage-scoreboard-ui.test.mjs`:**
   Test `SB-48` (lines 1112–1130) and `SB-47` assert exact DOM structure and CSS patterns. Any DOM re-parenting or renaming of classes will break existing tests. The implementation must preserve:
   - `actionCard.append(actionStack, sendToPhoneTile);`
   - `secondaryCards.appendChild(closeBtn);`
3. **Local Time Card Height Match:**
   `#aiScoreboardLocalTimeCard` sits alongside `#aiScoreboardActionCard`. If the action card drops to 78px + 24px padding (102px total), the time card (Date + Clock + Timezone) must not overflow. At current desktop typography (date ~16px, clock ~30px, tz ~14px = 60px), it comfortably fits within 102px.

### Acceptance Test Matrix
* [ ] **AC-1 (Mobile Continuity):** Mobile (<620px) retains 36px buttons, 6px gap (78px stack), unified panel, no Send to Phone tile.
* [ ] **AC-2 (Desktop 633px):** At 633px viewport, Copy Context remains on one line; utility stack measures exactly 78px (36px + 6px + 36px).
* [ ] **AC-3 (Desktop 739px):** At 739px viewport, utility stack measures exactly 78px.
* [ ] **AC-4 (Centerphone Fidelity):** At 633px, 739px, and wider, `#sendToPhoneTile` is fully legible, centerphone icon is unclipped, corner brackets align, and states (`idle`, `waiting`, `paired`, `unavailable`) render cleanly.
* [ ] **AC-5 (Pairing Verification):** Send to Phone click handler opens the pairing modal on local desktop (`isLocalDesktop() === true`).
* [ ] **AC-6 (Test Suite):** All 57 tests in `node --test test/ai-usage-scoreboard-ui.test.mjs` pass cleanly without regression.

---

## VERDICT: SAFE WITH CONDITIONS

The 78px utility target is **SAFE WITH CONDITIONS**:
1. **Condition 1:** Do not merge desktop into `aiScoreboardIsMobile()` JS logic (preserves `isLocalDesktop()` and Send to Phone capability).
2. **Condition 2:** Keep changes strictly within the desktop CSS block (`@media (min-width: 620px)`) without restructuring the DOM hierarchy.
3. **Condition 3:** Scale `#sendToPhoneTile`'s icon and padding proportionally so the tile does not vertically overflow or clip when stretched to the 78px grid track at 633px.
