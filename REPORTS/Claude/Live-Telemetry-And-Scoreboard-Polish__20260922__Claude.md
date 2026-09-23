# Live Telemetry (Codex) + Surgical Scoreboard Polish

**Player:** Claude Code (Opus 5.5, high) · **Date:** 2026-09-22 ~22:30 MDT · continues `Claude-Usage-Accuracy-And-Live-Freshness__20260922__Claude.md` · **No commit, no push.**

## 1. Codex live-freshness root cause

Nothing in Sideline could see Codex work done outside a Sideline-controlled Codex Player.
- **Survey session was Dad's own Codex terminal.** Its rollout file
  (`~/.codex/sessions/2026/09/22/rollout-2026-09-22T21-57-45-….jsonl`) has
  `session_meta.originator = "codex-tui"`, `source = "cli"`.
  - The Sideline-launched sessions from the same days say `originator = "sideline_coach"`.
- **The automatic Codex feeds are all tied to Sideline-controlled app-server Players:**
  - the `account/rateLimits/updated` notification;
  - the post-turn `account/rateLimits/read`, pushed through the Stadium.
- **The global `CodexUsageReader` is manual only.** It has no start, no cadence, and no trigger; only
  `POST /api/ai-health/refresh` calls it.

## 2. First broken boundary

**Acquisition trigger.** The authoritative value existed on disk the whole time:
- the survey's rollout recorded 13 `token_count` events whose `rate_limits` ended at
  `primary.used_percent 4` and `secondary.used_percent 1` (04:02:48Z);
- that is AI Usage Real Time's 96 / 99.

Sideline's last Codex evidence was the 03:34:13Z push from Sideline Player `codex-476a995e` (0 / 0).
Nothing after that point ever asked for a new read.

## 3. Mechanism implemented

- **Why not a file watcher.** The Claude-style `fs.watch` cannot work for Codex. I probed it on this
  machine:

  | writer | appends | `fs.watch` events |
  |---|---|---|
  | held-open handle (how Codex writes; the survey rollout's mtime stayed at 21:58:03 while content ran to 22:02:48) | 6 | **0** |
  | open-append-close (how Claude Code writes) | 6 | 6 |

  `stat().size` *is* exact for the held-open file.
- **`watchCodexActivity`** (`codex-usage-reader.ts`) does a **local** size scan every 10 s of today's and
  yesterday's `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
  - It reads no file content and makes no network call or process spawn.
  - The first scan is a silent baseline.
- **`CodexUsageReader.noteCodexActivity()`** turns growth into **one** authoritative
  `account/rateLimits/read`.
  - This is the same zero-inference app-server read that manual Refresh and AI Usage Real Time use.
  - It fires once activity has been quiet for 15 s, or after at most 2 min of continuous work, and never
    sooner than 90 s after the previous read. These are the same bounds as the Claude path.
- **Wiring:** the daemon starts and stops it alongside the reader. Production entry option:
  `codexUsage.activityDir`. Kill switch: `SIDELINE_CODEX_ACTIVITY=0`.
- **Codex reset jitter.** Codex rollouts show a cycle's reset jittering by **3 s, 4 s and 13 s**. The Codex
  merge still had the strict `incoming < stored ⇒ stale` rule, which would have frozen Codex exactly as it
  froze Claude Weekly. It now uses the same 15-minute same-cycle tolerance, shared helper `sameResetCycle`.
- **Truthful Codex Refresh.** The endpoint now reports `retained` with `notReflected` when the authority did
  not accept a Codex read (`codexWindowsNotReflected`). The button never says "Refreshed ✓" over it.

## 4. Why the survey turn stayed 100/100 while authoritative data became 96/99

The turn ran in the Codex TUI. Sideline's only Codex triggers are Sideline-Player pushes and a manual
Refresh, and neither occurred. So the 03:34 Sideline-Player value (0 / 0, that is 100 / 100) stayed as
last-known truth.

## 5. Claude live mechanism status

It is working in the field. Daemon PID 26684 (started 03:34Z, current build) made activity-driven reads
throughout this Opus turn:

`04:15:03, 04:17:08, 04:18:39, 04:20:32, 04:22:02, 04:23:48, 04:25:18, 04:26:53, 04:28:23 Z`

- The spacing is about 90–110 s, which is the activity path's minimum spacing, not the 5-minute cadence.
- There were no 429s in that span.
- Earlier today, 04:15:03 came off-cadence, since the scheduled read was 04:17:25.

## 6. Tests

**Across all 12 related test files: 225/225 pass.** That covers AI health, both readers, the scoreboard,
settings, stadium and player-control.

New in `test/codex-usage-activity.test.mjs`:
- **Reader bounds:** a burst gives one read, 90 s spacing is respected, and `stop()` cancels.
- **Scan:** it detects appends through a **held-open handle** (Codex style) and a new rollout. Startup is a
  silent baseline.
- **Production seam, field numbers:**
  - stored Codex 0 / 0;
  - a held-open append to a dated rollout;
  - `/api/ai-health` converges to **4% / 1%** with no Refresh.
  - The authoritative reset is jittered 3 s earlier.
- **Refresh truthfulness:** an older-cycle Codex Weekly gives `retained` / `notReflected: ['secondary']`,
  never "Refreshed ✓".

**Negative controls,** run in compiled output only and then recompiled:
- with the scan wiring off, the seam test fails;
- with the Codex same-cycle rule off, the seam test fails.

## 7. Compile

`npm run compile` (tsc) is clean.

## 8. UI files and areas changed

`src/public/index.html` only:
- the compact telemetry CSS block;
- one new narrow-screen `@media (max-width: 619px)` block scoped to the scoreboard;
- `aiScoreboardCompactReset` (`timeOnly` option) and its two 5H call sites.

Tests changed:
- `test/ai-usage-scoreboard-ui.test.mjs`: SB-18 and SB-39 were updated from asserting the old CSS text,
  including the `translateX(3ch)` hack, to the corrected contract. SB-41, SB-42 and SB-43 are new.

## 9. Desktop polish, before and after

Measured in headless Edge rendering the **real** `index.html` stylesheet with the exact compact DOM, at
card width 732 px. Renders are in `REPORTS/Claude/Live-Telemetry-And-Scoreboard-Polish__renders/`.

**Root cause found while measuring**

- **Placement.** The divider (`.ai-scoreboard-sep`) had only a `grid-row`.
  - CSS grid's row-locked auto-placement put it in **rail 2**, the 5H window rail.
  - That pushed the whole 5H cluster one rail right. The 5H time landed in a **24 px** rail, which produced
    "W… AM" and "1… PM".
  - `translateX(3ch)` only painted the divider elsewhere.
  - The per-row `grid-row` was also declared on `display: contents` boxes, where it is ignored.
- **Stretch.** Grid stretched every `auto` track, including the reset-time tracks.

**Fix:** every cell is pinned to its rail (5H 2–7, divider 8, WK 9–14); rows are set on the cells; the
transform is removed; reset-time rails are `minmax(0, max-content)`. Leftover width now goes only to the
provider rail and the divider, the two intended breathing points.

| item | before | after |
|---|---|---|
| **1. Provider → 5H gap** | Claude 62.1 px, Codex 66.9 px | Claude **46.1 px**, Codex **50.9 px**: 16 px ≈ **2 characters** tighter (provider padding 10 → 3 px, with the rail still content-sized plus the shared stretch; no fixed rail) |
| **2. Weekly dot** (gap to %, gap to time) | Claude 7.2 / **36.8**, Codex 7.2 / **33.5** | Claude **7.3 / 8.8**, Codex **7.3 / 5.5**. The `translateX` is gone from the effective cascade. |
| **3. Compact 5H reset** | "W… AM" / "1… PM" (clipped) | **"1:39 AM" / "10:58 PM"**. Time only; UNKNOWN when the reset is null. |

- The Weekly cluster, 14 rails, row order, Zone 3, colors, header and the Expanded view are otherwise unchanged.
- **One visible side effect to flag:** the design's own dim │ divider between 5H and WK is now visible and
  centered. Before, the misplacement parked it under the 5H cluster. If Dad prefers it hidden, it is a
  one-line `visibility: hidden` on `.ai-scoreboard-sep`.

## 10. Mobile result

**Implemented.** Below 620 px the same DOM reflows:
- each provider's Weekly drops beneath its 5H on the **same rails 2–7**;
- rows run Claude 5H / Claude WK / Codex 5H / Codex WK;
- the divider is hidden and Zone 3 gets no width.

Before, at a 390 px body, both reset times were **clipped to nothing** (the time rails measured 3 px and 0 px).
After, all four reset times are visible and unclipped, with no horizontal overflow. Desktop at 620 px and
above is untouched.

**Breadcrumb.** This Node environment formats time with the `en-CA` locale ("1:39 a.m."). The existing
AM/PM splitter only recognizes "AM"/"PM", so in such a locale the meridiem stays in the time rail. Dad's
browser uses "AM"/"PM" and is unaffected. The test is locale-independent.

## 11. Safety snapshot

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Safety-Snapshot__Live-Telemetry-And-Scoreboard-Polish__20260922-221423\`

It holds exact pre-change copies, with `SHA1SUMS.txt`, of:
- `src/public/index.html`
- `src/control-plane/{daemon,codex-usage-reader,claude-usage-reader,health-authority,protocol}.ts`
- `test/{ai-usage-scoreboard-ui,claude-usage-reader-daemon,ai-health-freshness-hardening}.test.mjs`

To roll back, copy them back. `test/codex-usage-activity.test.mjs` is new and can simply be deleted.

## 12. Dad verification (no reload first)

**A. Claude live test, right now, with no reload of anything.** The running daemon already has the Claude
watcher.
1. Open official Claude Usage and note 5H and Weekly.
2. Refresh AI Usage Real Time.
3. Leave Sideline untouched. Wait about 20–30 s after this Opus turn ends.
4. Compare the Sideline Claude 5H and Weekly against both. They should match.
   - `~/.sideline/logs/control-plane.log` shows `[claude-usage-reader] shape:` lines roughly every 90 s
     while Claude works.

**B. Only after A: pick up the new build.**

5. Do one Developer Reload, then refresh the browser. This is required once, because the Codex activity
   scan and the UI polish are new code.
6. Use Codex normally in a terminal (a real task, not one made up for this). Do not press Sideline Refresh.
7. About 15–30 s after Codex finishes, compare with AI Usage Real Time (refreshed). The Sideline Codex
   5H and Weekly should match.
   - The log shows `[codex-usage-reader] Codex activity observed; reading account rate limits.`
8. Look at the collapsed Scoreboard:
   - tighter Claude/Codex → 5H;
   - 5H shows a plain time such as "1:39 AM";
   - the Weekly "·" is evenly spaced on both rows.
   - On a phone, each provider shows 5H over WK with both reset times readable.
9. Optional: press Refresh. Expect "Refreshed ✓", or a truthful "… not updated" / "… rate-limited".

## Remaining risk

- **Claude OAuth budget.** The activity path reads about every 90 s during active Claude work. That budget
  is shared with AI Usage Real Time and Claude Code's `/usage`. There were no 429s tonight, and
  Retry-After is always honored.
- **Codex rollout layout.** The Codex scan relies on the rollout directory layout
  (`sessions/YYYY/MM/DD/rollout-*.jsonl`, local date). If Codex changes it, the scan finds nothing and Codex
  falls back to Sideline-Player pushes plus manual Refresh; it never shows wrong data.
- **Untracked files.** `claude-usage-reader.ts`, `codex-usage-reader.ts`, `health-authority.ts` and the
  reader tests are still untracked. A checkpoint commit is recommended.

---

## Delta: mobile one-row-per-provider (supersedes §10)

The four-row mobile reflow is **replaced**. Only `src/public/index.html` CSS inside `@media (max-width: 619px)` changed, plus UI test SB-44, which replaces the old narrow-screen test. There were no telemetry, daemon, desktop or Expanded changes.

**CSS/DOM behavior (mobile only)**

- **Layout:** it is the same DOM and the same single 14-rail grid, with the desktop rail pins and rows unchanged, so there are **exactly two telemetry rows**: `Claude | 5H … reset | │ | WK … reset` and the same for Codex.
- **Width:** `.ai-scoreboard-compact` becomes one full-width column (`minmax(0, 1fr)`) and is a size container (`container-type: inline-size`). `.ai-scoreboard-zone-3` gets `display: none`, so telemetry uses the full card width.
- **Rails:** the telemetry rails are content-sized: `auto`, then `max-content` ×4, `minmax(0, max-content)`, `max-content`, then `auto`, then the same six again.
  - Leftover width still goes only to the provider and divider rails.
- **Type:** it scales with the scoreboard's own width.
  - Metrics use `clamp(.62rem, 3.7cqw, .88rem)`; provider names use `clamp(.66rem, 4cqw, .95rem)`.
  - An `@container (max-width: 290px)` step goes one size smaller for the narrowest phones.
  - Small em-based cell paddings apply to the window label, dot, meridiem and divider.
  - The later desktop rule `.ai-scoreboard-metric { font-size: .88rem }` can no longer override mobile, because the block now sits after it in the cascade.
- **Spacing:**
  - `.ai-scoreboard-header { margin-bottom: 10px }` sets the gap between the controls and the telemetry (desktop is 6px).
  - `.ai-scoreboard { padding: 10px 14px 8px }` sets the bottom padding.
  - The old card padding added `env(safe-area-inset-bottom)` (and the top inset) **on top of** the container margin, which already includes it. On a phone that double inset was the empty footer cavity.

**Measured** in headless Edge from the real stylesheet, with body widths 320, 360, 390 and 430 px, using the field values and a worst case (100% on every window, "12:58 PM", "Wed 12:58 PM"):

| width | rows | 5H + WK on one row | any reset clipped | overflow | header gap | bottom gap | metric font |
|---|---|---|---|---|---|---|---|
| 320 | 2 | yes | no (worst case also no) | none | 10 px | 9 px | 9.2 px |
| 360 | 2 | yes | no | none | 10 px | 9 px | 11.2 px |
| 390 | 2 | yes | no | none | 10 px | 9 px | 12.3 px |
| 430 | 2 | yes | no | none | 10 px | 9 px | 13.8 px |

**Desktop (900 px viewport, 732 px card)** re-measured **identical** to the accepted polish:
- the same 14 track widths;
- Provider → 5H gap 46.1 / 50.9 px;
- Weekly dots 7.3 / 8.8 and 7.3 / 5.5 px;
- 5H resets "1:39" and "10:58" unclipped.

Renders: `…__renders/mobile-one-row-390.png` and `mobile-one-row-320-worst-case.png`.

**Tests:** focused UI tests (`ai-usage-scoreboard-ui`, `ai-scoreboard-settings-daemon`) pass **54/54**, and `npm run compile` is clean. SB-44 checks, against the page source:
- the mobile block has no row or rail remap, so there are two rows with 5H and WK together;
- it has 14 content-sized rails with no fixed px;
- time rails are `minmax(0, max-content)`, type is cqw-scaled and the `@container` step exists;
- Zone 3 is `display: none` and there is no overflow or transform;
- the 10 px header gap and `10px 14px 8px` padding are present;
- the desktop templates, padding, 6 px header gap and 3 px provider padding are unchanged, and the desktop is never a size container.

Headless-browser measurements, rather than the vm harness, are the layout proof.

---

## Delta: mobile Expanded four-pane dashboard (2 × 2)

Only mobile Expanded changed (< 620 px). `src/public/index.html` carries:
- one new CSS block at the end of the stylesheet;
- mobile-only date formatting in the Expanded renderer.

There were no telemetry, daemon, compact or desktop changes.

**Pre-change snapshot:** `REPORTS\Claude\Safety-Snapshot__Mobile-Expanded-Four-Pane__20260922-234523\` holds `index.html` and the UI test, with `SHA1SUMS.txt`. The earlier snapshot is untouched.

### 1. Responsive layout

- **Grids:** `.ai-scoreboard-provider-cards` and `.ai-scoreboard-secondary-cards` both become `minmax(0, 1fr) minmax(0, 1fr)` with a 6 px gap. Row 1 is **Codex | Claude**, row 2 is **Local Time | Actions**.
- **No scroll:** `.ai-scoreboard-expanded` is `max-height: none; overflow: visible`. The 50vh cap and its internal scrollbar are gone on phones, and the panel sizes to its content. There is no new scroll region; the Game region remains the only scroller.
- **× close:** on phones, Top placement's × moves to the Claude pane's free top-right corner, the same spot Bottom placement already uses. In the 2 × 2, the old bottom-right spot was on top of the Refresh button; measured, it overlapped Refresh in Top placement.

### 2. Mobile-only formatting

Dates are the only content that changed:

| field | desktop (unchanged) | mobile Expanded |
|---|---|---|
| reset | `Wednesday, September 23 at 2:58 AM` | `WED · SEP 23` / `2:58 AM` (two lines) |
| Observed | `Observed: Wednesday, … at …` | `Observed: WED · SEP 23` / `11:47 PM` |
| local date | `Tuesday, September 22, 2026` | `TUE · SEP 22, 2026` |

Everything else is kept verbatim:
- % left, % used and countdown for 5H and Weekly;
- Plan and timezone;
- Copy Complete Context and Refresh, with truthful Refresh feedback.

The format is chosen with `matchMedia('(max-width: 619px)')`, the same breakpoint as the CSS. Because the Scoreboard re-renders every second, a rotation switches format within 1 s.

### 3. Dimensions, fonts and padding (mobile Expanded only)

- **Panes:** pane padding goes 12 → 7/8 px and radius 12 → 10 px; the panel gap goes 10 → 6 px.
- **Type sizes:**

  | element | desktop | mobile |
  |---|---|---|
  | big % | 1.9rem | 1.45rem (23 px) |
  | reset | .8rem | .72rem |
  | used, countdown | ~.77rem | .7rem |
  | window label | .68rem | .6rem |
  | meta | .76rem | .64rem |
  | clock | 1.7rem | 1.25rem |
  | pane title | .78rem | .7rem |

  Provider percentages remain the largest element.
- **Vertical spacing:** tighter line-heights, and the divider margin goes 8 → 4 px.
- **Action buttons:** 40 px minimum height, .78rem text.

### 4. Proof: real page in headless Edge

The real `index.html` script ran against a stubbed backend, in true device viewports emulated through DevTools-protocol metrics, with Expand clicked and then measured. Both placements were checked.

| viewport | 4 panes, 2 × 2 (Codex beside Claude, Time beside Actions) | all panes in viewport | internal scroll | horizontal overflow | clipped reset/countdown/%/meta | × collides with a button | Game region left |
|---|---|---|---|---|---|---|---|
| 320 × 640 | yes | yes | none | none | none | no | 128 px bottom / 120 px top |
| 360 × 740 | yes | yes | none | none | none | no | 242 / 228 px |
| 390 × 844 | yes | yes | none | none | none | no | 359 / 345 px |
| 430 × 932 | yes | yes | none | none | none | no | 450 / 436 px |

Before (390 × 844): the panes were stacked, Expanded was capped at 422 px with an internal scroll, and Claude, Local Time and Actions sat at y = 687–1275, below the fold.

Renders are in `…__renders/`:
- `mobile-expanded-{bottom,top}-{320x640,390x844}.png`
- `mobile-expanded-BEFORE-{bottom,top}-390x844.png`

### 5. No internal Scoreboard scrolling

The computed `max-height` is `none`, `scrollHeight` is at most `clientHeight` at every size in both placements, and all four panes sit fully inside the viewport.

### 6. Compact mobile unchanged

I diffed the pre-change snapshot against the new file at 320, 360, 390 and 430 in both placements. The compact card rectangle, telemetry rectangle, row text and every cell's position are **identical**.

### 7. Desktop unchanged

At 1000 × 900 in both placements, the pre vs post diff is **identical** for:
- compact;
- Expanded pane rectangles;
- the Expanded panel box, including its 50vh cap and `overflow-y: auto`;
- the × position;
- every field and meta text, still the long "Wednesday, September 23 at …" form.

### Tests and compile

- `npm run compile` is clean.
- Focused UI tests (`ai-usage-scoreboard-ui`, `ai-scoreboard-settings-daemon`) pass **56/56**.
- The UI harness gains a `mobile` option, its `matchMedia` stub.
- New test SB-46 checks:
  - the 2 × 2 CSS contract, no height cap and the × rule;
  - that the desktop Expanded rules are unchanged;
  - that on phones every 5H and Weekly % left, % used, reset and countdown is kept, with short two-line dates, and that Plan, Observed, local date and timezone are kept;
  - that desktop keeps the long "… at …" string.

### Breadcrumb

The new file `Project SOP/Breadcrumbs/Roster-Workflow-UI-Formations.md` records that B-Team / worker formation and Scout formation still need explicit representation in the roster/workflow UI. Not implemented.

---

## Delta: mobile Expanded visual contract, "two parallel instruments" (supersedes the 2 × 2 styling above)

Visual contract: `TEMP/89801cb0-….png`. Before reference: `TEMP/1000020235.png`, Dad's phone.

Mobile Expanded only (< 620 px). Changes are all in `src/public/index.html`:
- the mobile-Expanded CSS block was rewritten;
- mobile date strings are pinned to en-US;
- a new `is-unknown` class marks a section with no data.

No telemetry, compact or desktop changes.

**Pre-change snapshot:** `REPORTS\Claude\Safety-Snapshot__Mobile-Expanded-Symmetry__20260923-002108\` holds `index.html` and the UI test, with `SHA1SUMS.txt`. The earlier snapshots are untouched.

### 1–2. Layout, and how the target was translated

The existing DOM is reused; no new elements.

- **Provider card:**
  - header (dot + provider name) with a **rule underneath**;
  - **5-HOUR** section, then the existing section rule, then the **WEEKLY** section;
  - quiet **Plan / Observed** footer.
- **Each section is `USAGE | RESET`:** `.ai-scoreboard-window-block` becomes a 2-column grid.
  - Usage rail (left): label, big %, % used.
  - Reset rail (right): date and time (one element spanning rows 1–2, `white-space: pre`), countdown (row 3, level with "% used").
  - The **vertical rule** is a `::before` grid item spanning the reset column's three rows.
- **Local Time | Actions:** one shared panel (single border and background), split by a **center rule**, which is the Actions pane's left border. As in the target.
- **Kept:** Codex | Claude side by side, no height cap, no internal scroll.
- **Pinned for fit:** the expanded panel gains 6 px per side (`margin: … -6px`), so the instruments use the card's side padding. The compact card is unaffected.
- **× close:** 22 px, in the free top-right corner of the Claude header row in both placements.
- **Kept from the design, adapted to real content:** the mock's type is larger than a 360 px phone can hold with worst-case strings. Type therefore scales to each card's width. The hierarchy stays the same: big % strongest, then reset, then % used, then labels, with the metadata quietest.

### 3. Shared rails: SYMMETRY

- **Fixed split:** `grid-template-columns: minmax(0, 40fr) minmax(0, 60fr)` is **never content-sized**. Both cards share width, padding, row structure and fonts, so every rail is a function of card width alone and lands identically in both cards.
- **Type:** it uses container units (`container-type: inline-size` on each card, sizes in `cqw`), so it also scales identically.
- **No re-wrapping:**
  - Reset text is `pre` and the countdown is `nowrap`, so nothing can re-wrap into an extra line in one card only.
  - **Observed reserves two lines** (`min-height: 2.6em`), so a stamp that fits on one line in one card cannot make that card shorter.
- **Missing data:** a section with no data gets `is-unknown`, which sizes "UNKNOWN" to the usage rail instead of letting it spill across the rule.

Measured rails, relative to each card (Bottom placement; Top is identical):

| width | vertical rule x (Codex 5H / Claude 5H / Codex WK / Claude WK) | 5H section y/h | WK section y/h | section rule y | Plan y | Observed y | card h | center rules (provider gap / Time-Actions rule) |
|---|---|---|---|---|---|---|---|---|
| 320 | 55.2 × 4 | 35/51 both | 99/51 both | 92 both | 157 both | 167.4 both | 197.2 both | 137 / 137 |
| 360 | 63.2 × 4 | 37/57.2 both | 107.2/57.2 both | 100.2 both | 171.3 both | 182.1 both | 212.6 both | 157 / 157 |
| 390 | 69.2 × 4 | 39/62.5 both | 114.5/62.5 both | 107.5 both | 184 both | 195.9 both | 228.8 both | 172 / 172 |
| 430 | 77.2 × 4 | 40/69.3 both | 122.3/69.3 both | 115.3 both | 198.7 both | 212.2 both | 248.2 both | 192 / 192 |

An automated comparison of **every** rail (header, labels, %, used, date/time, countdown, rules, Plan, Observed; x, y and height) found **zero** Codex-vs-Claude differences above 1 px at every width, in both placements, with both field values and the worst case.

### 4. Mobile reset formatting

It is pinned to the target's US style, so a phone's own locale can't reshape the rails. Dad's phone had rendered "23 SEPT" / "21:58". The local time zone is kept.

- **Resets:** `WED · SEP 23` / `2:58 AM`, then the countdown on the next row (`in 3h 1m`, `in 6d 22h 1m`).
- **Observed** is one quiet line: `Observed: TUE · SEP 22, 11:54 PM`.
- **Local time:** `TUE · SEP 22, 2026` / `11:56:21 PM`.
- **Desktop** keeps "Wednesday, September 23 at 2:58 AM".

### 5. Typography and padding (all `cqw`, clamped)

| element | 320 | 360 | 390 | 430 |
|---|---|---|---|---|
| big % (15.4cqw) | 18.2 px | 21.3 px | 23.6 px | 26.6 px |
| reset / countdown (7.7cqw) | 9.1 px | 10.6 px | 11.8 px | 13.1 px |
| % used (7cqw) | 8.3 px | 9.7 px | 10.7 px | 12.1 px |

- **Smaller text:** labels are 6.2cqw, the provider name 7.6cqw and metadata 6cqw.
- **Card padding:** 7 px. Sections have 3 px vertical padding, a 1 px row gap and a line-height of 1.4; the section rule has a 6 px margin.
- **Buttons:** at least 36 px tall.

The sizes are the largest that still fit the worst case ("100%", "100% used", "WED · MAY 30 / 12:58 PM", "in 6d 23h 59m") at 320 px.

### 6. Proof on the real page

The real `index.html` ran in headless Edge with a stubbed backend and true device viewports (DevTools-protocol metrics), then Expand was clicked. There were 16 runs: two placements × four widths, each with field values and with the worst case injected. Every run passed every check:

| check | 320 / 360 / 390 / 430 |
|---|---|
| Codex beside Claude; Local Time beside Actions; bottom pair below | ✓ ✓ ✓ ✓ |
| all four vertical rules aligned; horizontal rules aligned | ✓ ✓ ✓ ✓ |
| rail mismatches > 1 px | 0 0 0 0 |
| glyphs crossing a rule or leaving a card (clipping) | 0 0 0 0 |
| Plan and Observed visible | ✓ ✓ ✓ ✓ |
| horizontal overflow | none |
| Expanded internal scroll | none (`max-height: none`, scrollHeight ≤ clientHeight) |
| all panes inside the viewport | ✓ (Game region keeps ≥ 247 px even at 320 × 640) |

Renders are `…__renders/mobile-instruments-{top,bottom}-{320x640,360x740,390x844,430x932}.png`.

### 7. No Expanded internal scrolling

This is confirmed at every size in both placements.

### 8. Compact mobile unchanged

I diffed the pre-change snapshot against the new file at 320, 360, 390 and 430 in both placements. The compact card, telemetry rectangle, row text and all cell positions are **identical**.

### 9. Desktop unchanged

At 1000 × 900 in both placements, the snapshot vs new diff is **identical**: compact, Expanded pane rectangles, the panel box (50vh cap, `overflow-y: auto`), the × position, and all texts ("… at …").

### Tests and compile

- `npm run compile` is clean.
- Focused UI tests (`ai-usage-scoreboard-ui`, `ai-scoreboard-settings-daemon`) pass **58/58**.
- **SB-47** (replacing my earlier SB-46 mobile 2 × 2 test) checks:
  - the instrument CSS contract: fixed 40 | 60 split, `::before` rule, rails, header rule, shared panel with center rule, Observed reservation, no clipping;
  - that the desktop Expanded rules are unchanged;
  - on phones, every field is kept with the en-US short formats, and `is-unknown` marks a section with no data;
  - desktop keeps the long strings.
- **SB-44**'s "desktop is never a size container" check now removes *every* phone-only `@media` block by brace matching. It had falsely flagged the new mobile-Expanded containers.
- Another agent's new test, "SB-46. Desktop compact header controls…", was already in the file and is untouched and passing.

**Note:** this `index.html` had a few LF-only lines from earlier edits, and one `sed` run here converted the whole file to LF. I restored uniform CRLF. Git's autocrlf makes this invisible in diffs either way.
