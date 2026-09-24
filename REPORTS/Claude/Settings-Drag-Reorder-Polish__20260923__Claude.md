# Settings Drag/Reorder Polish

**Player:** Claude Code (Opus 5.5, medium) · **Date:** 2026-09-23 · **No commit, no push.**

Reordering a Settings card is now a physical drag:
- **Pickup:** the real card lifts and follows the finger or cursor.
- **Carry:** a dashed placeholder of the same size shows where it will land, and the neighbouring cards glide out of the way.
- **Drop:** the card settles into place, and nothing temporary is left behind.

Ordering, card IDs, `SETTINGS_CARDS`, normalization and the IndexedDB record are unchanged.

## 1. Files changed

| File | Change |
|---|---|
| `src/public/index.html` | Drag interaction layer: `installSettingsCardHandles`, `moveSettingsCardAtPointer`, `finishSettingsCardDrag`, `clearSettingsDropIndicators`, plus new `startSettingsCardDrag` and `settingsDragFrame`; drag CSS. |
| `test/s55-0-settings-hierarchy.test.mjs` | New ORDER-3, ORDER-4, ORDER-5; the harness gains an optional manual animation-frame queue. |
| `Project SOP/Breadcrumbs/Settings-Information-Architecture.md` | One sentence recording the interaction contract. |

## 2. What moves on screen

The **real card is lifted, not a clone.** These cards contain radios, switches and inputs with IDs; a clone would duplicate them and could steal radio checked state.

On pickup the card:
- becomes `position: fixed` at its exact rectangle and width;
- gets a deep shadow, a blue edge and `scale(1.015)`;
- follows the pointer through `transform`, anchored at the point where it was grabbed.

## 3. Placeholder and layout

- **Size:** a dashed `.settings-drag-placeholder` of exactly the card's height, margins and radius holds the slot. This holds even for a 1,782 px expanded card.
- **Movement:** only the placeholder moves through the list. The real card doesn't change position in the DOM until it is dropped.

## 4. Neighbour animation

- **Neighbours:** when the placeholder moves, displaced cards glide into place with FLIP (160 ms).
- **Drop:** the dropped card settles from where it was carried into its final slot with FLIP (180 ms). The DOM is already final at that point.
- **Reduced motion:** both glides are skipped and the lift scale is dropped. The card still follows the pointer.

## 5. Pointer and performance

- **One pass per frame:** pointer events only record coordinates. Hit-testing, carrying and placeholder placement run at most once per animation frame.
- **Hit-testing:** `elementsFromPoint` looks beneath the lifted card, with an `elementFromPoint` fallback.
- **Midpoints:** they come from transform-free `offsetTop`/`offsetHeight` (the list is `position: relative`), so neighbours mid-glide don't cause flicker.
- **DOM writes:** the DOM is written only when the destination changes.
- **Edge auto-scroll:** holding near the scroller's top or bottom edge scrolls it, at up to 18 px per frame.

## 6. Cleanup and finalization

There is one idempotent `finishSettingsCardDrag`:
- `pointerup` commits and saves;
- `pointercancel` and `lostpointercapture` revert without saving (the card never left its slot).

It clears:
- the placeholder;
- the lifted and dragging classes;
- the body `settings-reordering` state;
- the card's inline styles;
- any pending frame;
- every insertion line.

## 7. Lingering-line fix

- **Sweep:** cleanup now removes `.settings-drop-before` and `.settings-drop-after` from **every** list child, not only the last target.
- **No line needed:** the placeholder replaced the line as the destination cue, so the line is no longer applied during a drag.
- **Invalid targets:** self and hidden targets are ignored and leave nothing behind.

## 8. Touch and mobile

- **Handle only:** `touch-action: none` stays on the handle alone, so Settings still scrolls normally everywhere else.
- **No selection:** `user-select: none` applies while reordering.
- **Controls:** in the browser test the page didn't scroll during a touch drag, and switches, disclosures and inputs still worked afterwards.

## 9. Expanded cards

Tested with the tallest expanded card, AI Usage Scoreboard: 1,537 px on desktop and up to 1,782 px on phones. It lifts, follows, reserves its full height and drops correctly.

## 10. Tests

### Real page in headless Edge, genuine mouse and touch events

| Check | Desktop mouse 1000×900 | Phone touch 390×844 | Phone touch 360×740 |
|---|---|---|---|
| Card follows pointer (expected / actual top) | 144 / 144 | 119 / 119 | 73 / 73 |
| Placeholder = card height | yes (1537 px) | yes (1746 px) | yes (1782 px) |
| Neighbours glide / lines during drag | yes / 0 | yes / 0 | yes / 0 |
| Order commits and survives reload (IndexedDB) | yes | yes | yes |
| Fully clean at drop and after settle | yes | yes | yes |
| Cancel keeps order and cleans up | yes | yes | yes |
| Disclosures and inputs still work / no sideways overflow | yes / yes | yes / yes | yes / yes |

### Unit tests (vm harness)

**ORDER-3** covers the drag from lift to drop:
- pickup lifts the real card over a same-size placeholder;
- 30 pointer events produce one frame and one hit-test;
- the card is carried to the latest pointer position;
- the drop commits and clears a stale line;
- a post-up `lostpointercapture` is a no-op.

**ORDER-4** covers every abort path:
- `pointercancel` and `lostpointercapture` clean up fully, keep the order and don't persist;
- self and hidden targets move nothing;
- hidden Dev-only cards keep their slot;
- the cards themselves own no pointer listeners.

**ORDER-5** checks the CSS and interaction contract:
- handle-only `touch-action`;
- lifted and placeholder styles;
- reduced motion still carries the card;
- `lostpointercapture` is wired.

### Results

| Suite | Result |
|---|---|
| `s55-0-settings-hierarchy` | **22/22** |
| Scoreboard UI regression (`ai-usage-scoreboard-ui`, `ai-scoreboard-settings-daemon`) | **58/58** |

## 11. Compile

`npm run compile` is clean.

## 12. Remaining limitations

- **Cancel behaviour changed.** Cancel now reverts to the original position; previously it saved wherever the card had got to.
- **Coach Routines not exercised.** The headless page has no Game with routines, so Coach Routines was hidden. The same code path is proven on taller cards.
- **No keyboard reordering.** The handle remains a pointer/touch control, as before.
