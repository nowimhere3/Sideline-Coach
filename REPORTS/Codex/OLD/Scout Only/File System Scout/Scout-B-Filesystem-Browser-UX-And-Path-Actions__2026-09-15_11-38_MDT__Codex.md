# SCOUT B — FILESYSTEM BROWSER UX + PATH ACTIONS

Execution: 2026-09-15 11:38 MDT  
Branch: `q2.8-multigame-field-debug`  
Scope: read-only product/interaction reconnaissance; no implementation

## 1. VERDICT

The lowest-friction V1 is one neutral, action-configurable “Browse Game” surface reused from three entry points: Game Setup, Outgoing’s `+ PATH`, and Coach Routines. Keep the proven one-directory lazy model. On a phone, open it as a full-height sheet/modal with a sticky relative-path header and a visible `⋯` action affordance on every row; long-press is an accelerator, not the discovery mechanism. On desktop, use the same action menu from right-click, `⋯`, and keyboard Menu/Shift+F10.

For the primary Head Coach flow, the action should be optimized for one tap after one browse decision:

`Outgoing → + PATH → open folder → tap file/folder → Insert path into Play`

The selected item should not be silently inserted merely because it was tapped. Tap a row to navigate folders or select/highlight an item; expose a clear action menu. In the Outgoing context, make `Insert path into Play` the first/primary action and close the browser after success. In Settings, make `Use as Reports folder` or `Use as SOP folder` primary. In Coach Routines, preserve the current checkbox/multi-select workflow.

The current routine browser is a good interaction foundation, not a generic product surface unchanged. Reuse its loading/error/empty/list/back primitives and mobile sizing, while removing `routineId`, checkboxes, and routine-specific labels from the neutral mode. Do not create a second tree widget, Explorer clone, or separate mobile/desktop action model.

## 2. CURRENT UI PRIMITIVES WORTH REUSING

Evidence is in `src/public/index.html`:

- Existing browser CSS is `.routine-browse` through `.routine-browse-actions` (lines 301–315). Rows have a 44px minimum height, 22px checkboxes, wrapped names, a 260px scroll viewport, and mobile-safe flex sizing.
- `routineBrowse` state at line 3711 stores Game, routine, directory, entries, status, and selected paths. The render key flattens its `Map` selection at lines 3753–3759.
- `openRoutineBrowse()` at lines 3941–3955 already has loading, response, supersession, error, toast, and rerender behavior.
- `renderRoutineBrowsePanel()` at lines 3966–4065 already has root/Back, current-directory display, empty/loading/error states, rows, and folder Open buttons.
- `copyText()` at lines 3374–3389 uses `navigator.clipboard.writeText()` in a secure context and a hidden textarea/`execCommand('copy')` fallback.
- `showToast()` is the existing short-lived status/error primitive (`index.html:1089–1116`).
- `focusElement()` and focus-return patterns are at `index.html:1649` and the settings/modal transitions at lines 3606–3617 and 1692–1707.
- The Game menu is an existing anchored absolute menu (`.game-dropdown-menu`, CSS lines 94–108) with outside-click dismissal (`index.html:3402–3405`), useful as a visual reference but too narrow for a file action menu.
- The confirmation modal is a full-screen backdrop with focus handling, Escape, Tab cycling, and return focus (`index.html:595–609`, `4571–4592`). A browser sheet can reuse the same focus and dismissal conventions.
- Buttons already use `secondary`, `quiet`, visible focus rings, and minimum touch sizing. Toasts report both successful and failed clipboard operations.

Do not reuse unchanged: `routineBrowse`’s `routineId`, `selected: Map` as the generic default, checkbox labels such as “Use … as a reference,” `addRoutineSources()`, or the Dev Mode/Coach Routines card lifecycle (`index.html:3899–3918, 4317–4424`).

## 3. GENERIC BROWSER EXPERIENCE

### Container

Use one reusable browser controller and one visual container:

- **Mobile:** full-height or near-full-height bottom sheet/modal inside the existing page, with a clear title (“Browse Game”), close button, and normal-flow action sheet/menu. A sheet preserves context and leaves enough room for long names and a 200-entry list.
- **Desktop:** centered modal or right-side drawer at a comfortable width. Keep the same markup and action menu; only CSS placement changes at the existing `620px` breakpoint (`index.html:426`, `462–469`, and `584–594`).
- **Settings:** launch the same browser as a modal/sheet from the planned Game Setup card rather than embedding a second tree inline.
- **Outgoing:** `+ PATH` launches the same browser with the Outgoing action provider.

The current Coach Routines inline panel remains appropriate for that specialized card because the human is already editing references. It should be the first consumer migrated to the neutral controller, not a separate generic UX.

### Navigation

- Preserve one-directory-at-a-time lazy loading. It is predictable on a phone, avoids huge payloads, and already matches the backend contract.
- Keep a sticky header showing `Browse Game` and the Game-relative current directory. At root show `Game root`; below root show a single `‹ Back` control plus the relative directory. Do not show `.sideline`, machine roots, or raw backend identifiers.
- Folder rows navigate through an explicit Open affordance or row click only when the row has no conflicting action. The action menu must remain discoverable without navigation.
- File and folder rows share a common structure: type icon/label, name/path truncated with wrapping, and `⋯` actions. Folders add an `Open` affordance. Do not make a folder tap both navigate and select.
- Root has no parent. Back from a child computes the parent using the current relative path, matching `index.html:3978–3980`.
- Show “Nothing here” for empty directories, with a close/back action still available.

### Selection

Generic V1 should select one item at a time for path actions. This is faster and keeps the action menu unambiguous. Coach References may retain its existing multi-select mode because it has a real batch-add use case. The controller should accept `selectionMode: 'single' | 'multiple'` rather than forcing checkboxes into every consumer.

## 4. OUTGOING + PATH DESIGN

The exact Outgoing markup is `src/public/index.html:875–942`:

- `.routing-mode-bar` lines 884–891 contains AUTO, MANUAL, and `↻ Refresh`.
- Prompt textarea is `#promptInput` lines 929–932.
- Dispatch is `#dispatchBtn` line 934.

### Placement and label

Put a compact `+ PATH` button in `.routing-mode-bar`, next to the AUTO/MANUAL group. Keep Refresh as the right-side secondary control. At phone widths, allow the row to wrap rather than compressing the two mode buttons below a usable tap size; the existing flex/grid responsive rules are the right precedent.

`+ PATH` is preferable to `Browse` or `Files`: it states the outcome and remains short beside AUTO/MANUAL. The button’s accessible label should be “Browse Game files to insert a path.” A visible `+` communicates additive insertion rather than changing routing mode.

### Selection behavior

`+ PATH` should open the generic browser directly in `OUTGOING` context. On an item, the first action is `Insert path into Play`; secondary actions are Copy relative and Copy absolute. Do not immediately insert on row tap: an accidental touch on a file should not mutate a drafted Play.

After successful insertion, close the browser, show a short “Path inserted” toast, return focus to `#promptInput`, and preserve the existing Play draft and route controls. If insertion fails, leave the browser open and show an error toast so the action can be retried.

## 5. INSERT PATH INTO PLAY

### Default representation

Default to the Game-relative path. It is portable, understandable in a Game, and matches the existing entry shape (`entry.path`). Do not silently expose a Windows machine path in a prompt sent to a Player unless the human explicitly chooses Copy absolute.

Use a code-style delimiter around the inserted path, e.g. `` `Reports/Codex/result.md` `` or `` `Project SOP` ``. This makes spaces and punctuation unambiguous. Keep the stored path slash-normalized (`/`) even on Windows; prompts and common CLIs accept it, and it remains portable. Absolute-path formatting, if chosen, should be an explicit action with backend/platform policy still unresolved.

### Exact text behavior

1. Capture `selectionStart` and `selectionEnd` from `#promptInput`.
2. Replace the selected substring with the formatted path; if there is no selection, insert at the caret. If the control has no usable selection, append with one separating space.
3. Add one space before/after only when adjacent text does not already provide whitespace; never create doubled spaces.
4. Set the textarea value and dispatch the same `input` event path used by the existing prompt listener (`index.html:3501–3514`).
5. Close the browser and focus `#promptInput`; restore the caret immediately after the inserted token.
6. AUTO preview recomputes through the existing debounced `requestRoutePreview()` flow. No new dispatch API or routing state is needed.
7. Leave AUTO/MANUAL, target Player, model, effort, route choice, and current report context untouched. Only the prompt text changes.

The closest existing insertion pattern is `src/public/index.html:1275–1280`, which assigns prompt text, dispatches input, and focuses the prompt. `submitDispatch()` at lines 4642–4700 already sends the resulting prompt unchanged through the normal route/dispatch contract.

## 6. COPY RELATIVE / ABSOLUTE PATH

### Action labels and hierarchy

In the item action menu:

1. `Insert path into Play` (OUTGOING only; primary action).
2. `Copy Game-relative path` (always available; primary copy option).
3. `Copy absolute path` (available only when absolute path is authoritative and permitted).

In Settings contexts, replace the first action with `Use as Reports folder` or `Use as SOP folder`. In Coach References, replace it with `Add as Coach Reference`; retain batch selection there.

Use explicit labels, not “Copy path,” because relative versus absolute has materially different meaning. A current-directory/root action can be offered as `Copy current folder path` only when the user invokes the directory header menu; root itself should be represented as `.` for relative copy and should not produce an ambiguous empty string.

On success, close the action menu and browser, call `copyText()`, then show `✓ Relative path copied` or `✓ Absolute path copied`. On failure, keep the browser open and show `Copy failed · Try again`; never claim success. Copying should close after success because the task is complete, but not after failure.

### Absolute-path caveat

Scout A established that `games[].rootFsPath` already reaches the browser, while the browse response itself returns only relative paths. UX can present Copy absolute as a deliberate option, but backend architecture must decide whether to join client-side or have the Stadium return an authoritative absolute value. Disable or omit Copy absolute when the value is unavailable, remote semantics are unclear, or policy disallows machine-path disclosure. Do not fall back to a fabricated local path.

## 7. MOBILE LONG-PRESS EXPERIENCE

Long-press should open the same action sheet as every other input method, but it must not be the only discoverability path.

Recommended behavior:

- Keep a visible `⋯` button on every row with a minimum 44px hit target. This is the primary accessible/mobile discovery path.
- Add Pointer Events to the row/action controller: start a roughly 500ms timer on `pointerdown`; cancel on `pointerup`, `pointercancel`, `pointerleave`, scrolling, or movement beyond about 8–10px.
- On long-press, prevent the subsequent click from navigating/activating, optionally call `navigator.vibrate(10)` only when available, and open the bottom action sheet focused on the first action.
- Suppress the browser-native context menu for the browser surface only when a deliberate long-press is recognized; do not globally disable context menus.
- A normal tap on `⋯` opens the same sheet immediately. A normal tap on a folder’s Open affordance navigates and does not open actions.
- Keep the current directory header and sheet within the viewport; do not anchor a menu below an item if it would be clipped near the bottom edge.
- When the user scrolls, cancel all pending long-press timers. Never turn a scroll gesture into an action menu.

This is an enhancement over current code: no `pointerdown`, `touchstart`, `contextmenu`, or long-press abstraction exists in `src/public/index.html` today.

## 8. DESKTOP RIGHT-CLICK EXPERIENCE

Use `contextmenu` on an item to open the same action model used by mobile long-press and `⋯`. Prevent the native menu only for recognized browser entries. Keep `⋯` visible on desktop as a discoverability and keyboard target; do not make right-click mandatory.

Menu placement should use the pointer coordinates but clamp to the modal/sheet viewport. If the user right-clicks a folder, offer both Open and actions. Escape closes the menu first, then the browser; clicking outside closes the menu. After an action, return focus to the originating row or the prompt after insertion.

Do not maintain separate desktop and mobile menus. The input adapters should dispatch one `openItemActions(entry, context, anchor)` operation to one action sheet/popover component.

## 9. ACCESSIBILITY / KEYBOARD EXPERIENCE

- Every row needs a name, type, relative path, and an `aria-label` that describes the item and its menu button.
- `⋯` must be a real `<button>` with `aria-haspopup="menu"`, `aria-expanded`, and an accessible label such as “Actions for Reports/Codex.”
- Menu actions must be keyboard reachable in a predictable order; focus the first action on open.
- Escape closes the action menu and restores focus to its invoker. A second Escape closes the browser.
- Support the Menu key and Shift+F10 as keyboard equivalents for right-click.
- Use `role="menu"`/`role="menuitem"` only if the implementation supplies correct roving focus; otherwise use a labelled action list of buttons. Do not fake a menu role.
- Preserve the existing modal focus-return conventions (`index.html:1692–1707`) and visible `:focus-visible` outline (`index.html:609`).
- Do not encode meaning in color or icon alone; files/folders and disabled/unavailable actions need text.
- Toasts are status feedback, not the only error channel. Inline unavailable/disabled reasons should remain visible when an action cannot run.

## 10. SETTINGS / GAME SETUP EXPERIENCE

The planned Game Setup card is `src/public/index.html:983–991`; Settings opens/closes at lines 3606–3617. It is the right human-facing home for canonical path choices, not the Coach Routines card.

Recommended card:

```text
Game Setup
  Reports folder
    Reports  ·  Automatically selected
    [Browse / Change]
  SOP / onboarding folder
    Onboarding-Docs  ·  Automatically selected
    [Browse / Change]
```

UX rules:

- Show a friendly Game-relative path, never `.sideline`, raw registry IDs, or filesystem implementation terms.
- Show provenance: `Automatically selected`, `Using existing folder`, `Chosen by you`, `Not set`, or `Needs attention`.
- `Browse / Change` opens the same browser in folder-only selection mode. It should not expose file actions that cannot apply to the setting.
- `Use this folder` is a deliberate confirmation in the browser action sheet; navigating into a folder does not silently select it.
- After save, return to the card and show `Saved` only after authoritative validation and refresh. Offer `Change` and `Restore detected folder` where appropriate.
- Recognized existing names (`Reports-SLC`, `Reports`, `Docs REPORT`) can be displayed as friendly canonical choices, but automatic detection/creation/bootstrap is outside this Scout.
- If none exists, show `Not set — choose a folder` rather than implying Sideline created anything. Future Bootstrap may offer `Create Reports-SLC`, but that is a separate product decision.
- Settings values should be Game-scoped and stored as relative paths for portability; validation should occur through the Stadium against the active Game root.

Do not put Reports/SOP path settings under `coach.reportGlobs` or inside a routine’s source list. Those are different contracts: globs discover report files; canonical folder settings identify human-managed roots.

## 11. ACTION-PROVIDER / CONTEXT MODEL

Use one browser with a small action-provider configuration rather than four hard-coded browsers:

```text
BrowseContext: OUTGOING
  primary: Insert path into Play
  secondary: Copy Game-relative path, Copy absolute path

BrowseContext: SETTINGS_REPORTS
  primary: Use as Reports folder
  secondary: Copy relative, Copy absolute

BrowseContext: SETTINGS_SOP
  primary: Use as SOP folder
  secondary: Copy relative, Copy absolute

BrowseContext: COACH_REFERENCES
  selection: multiple
  primary: Add as Coach Reference
  secondary: Copy relative, Copy absolute
```

The provider should declare item eligibility (`file`, `folder`, or both), single/multiple selection, action labels, and action callbacks. The browser owns navigation, loading, errors, current directory, focus, and input adapters; the context owns what an action does. This prevents Outgoing, Settings, and Coach Routines from drifting into separate path semantics.

## 12. EDGE CASE UX

| Situation | Recommended UX |
|---|---|
| Empty folder | Surface “Nothing here” with Back/Close; not an error. |
| Game offline/disconnected | Disable/close browser with “Game unavailable — reconnect and try again”; do not browse another Game. Retry after reconnect. |
| Game disconnects while open | Keep the current view briefly, mark it stale, disable filesystem actions, and offer Retry/Close. Never claim a selection was applied. |
| More than 200 returned / truncated listing | Surface a non-alarming “Showing the first 200 items” notice and offer narrower navigation; do not silently imply completeness. A future pagination contract is separate. |
| Inaccessible/blocked item | Prefer hiding unsafe entries as today. If an expected configured path becomes blocked, show `Can’t use this location` in Settings/routine validation. |
| Stale/out-of-order response | Ignore superseded response by request generation + Game + directory; keep the latest loading state. Never render a result into a different folder. |
| Clipboard failure | Keep browser/menu open; show `Copy failed · Try again`; no false success. |
| Absolute path unavailable | Disable or omit Copy absolute with a short explanation; relative copy remains available. |
| No canonical Reports/SOP folder | Show `Not set` / `Choose a folder`; never auto-create in this UX. |
| Deleted/renamed directory or selected item | Show a retriable error, return to nearest valid parent if possible, and do not persist the stale path. |
| Root directory action | Allow Copy relative as `.` only if explicitly requested; no empty-path insertion. |

## 13. V1 — RECOMMENDED EXPERIENCE

1. **Entry points:** add `+ PATH` beside AUTO/MANUAL in Outgoing; add `Browse / Change` to future Game Setup Reports/SOP rows; migrate Coach Routines to the same controller behind its existing `+ Add references` entry.
2. **Container:** full-height mobile sheet and centered desktop modal/drawer using existing card/button/modal/toast/focus styling.
3. **Navigation:** sticky `Browse Game` header, Game-relative breadcrumb/current directory, Back at child levels, one-directory lazy requests, folder-first rows, “Nothing here” state.
4. **Rows:** type/name/path plus visible `⋯`; folder rows additionally have Open. Generic mode selects one item; Coach References retains multiple selection.
5. **Actions:** context provider supplies primary action; Outgoing’s first action is Insert path into Play, followed by Copy relative/absolute. Settings primary is Use as folder. Coach References primary is Add as reference.
6. **Mobile:** visible `⋯` opens the action sheet; optional 500ms pointer long-press is an accelerator with movement/scroll cancellation and no accidental navigation.
7. **Desktop:** right-click opens the same action sheet; `⋯`, Menu key, Shift+F10, Escape, outside click, and focus restoration all use the same action model.
8. **Insert:** default Game-relative path in backticks, inserted at the caret/selection with whitespace normalization; dispatch input event, recompute AUTO preview through existing debounce, focus prompt, preserve route controls, close on success.
9. **Copy:** explicit relative/absolute labels, truthful toast, close on success and remain open on failure; absolute availability remains policy/backend-dependent.
10. **Settings:** Game-scoped friendly relative values with provenance and explicit Browse/Change; no raw `.sideline`, no implicit bootstrap.

This achieves: “I’m on my phone, I know roughly where something is, and I have its exact path in my Play in seconds.”

## 14. DEFER FROM V1

- File content preview or editing.
- Delete, rename, move, upload, drag/drop, or any mutation of Game files.
- Arbitrary parent-drive browsing or a file-picker that escapes the Game root.
- Full-text file search, fuzzy search, filters, favorites, recents, or tree virtualization.
- Recursive full-tree loading or infinite-scroll redesign before pagination is needed.
- Reports/SOP folder creation/bootstrap and `.sideline` management.
- Automatic report-glob migration or changes to `coach.reportGlobs`.
- Player write authority or provider-specific file actions.
- Separate native desktop browser and separate mobile browser.
- Gesture-only discovery, hover-only actions, or a foreign third-party Explorer UI.

## 15. EXACT UI SOURCE FILES / FUNCTIONS FOR OPUS

Read these locations before implementation:

1. `src/public/index.html:301–315` — browser row/list CSS and touch sizing.
2. `src/public/index.html:595–609` — modal backdrop, modal, action sizing, focus outline.
3. `src/public/index.html:647–684` — Outgoing routing bar and AUTO/MANUAL button styling.
4. `src/public/index.html:875–942` — Outgoing/Play Dispatcher markup.
5. `src/public/index.html:945–1040` — Settings/Game Setup planned card.
6. `src/public/index.html:1649–1707` — focus and modal return/focus behavior.
7. `src/public/index.html:3034–3045, 3391–3405` — existing anchored menu and outside-click pattern.
8. `src/public/index.html:3374–3389` — `copyText()`.
9. `src/public/index.html:3606–3617` — Settings open/close.
10. `src/public/index.html:3711, 3941–4065` — browse state, lazy request, panel renderer.
11. `src/public/index.html:4317–4424` — Coach References integration and current action model.
12. `src/public/index.html:4642–4756` — `submitDispatch()` and dispatch button semantics.
13. `src/routine-sources.ts:180–272` — authoritative one-directory browser contract.
14. `src/stadium-client.ts:604–631` — exact-Game Stadium browse RPC.
15. `src/control-plane/daemon.ts:929–971` — HTTP browse proxy and response shaping.

## 16. QUESTIONS OPUS MUST DECIDE

1. Is a full-height mobile sheet or centered modal/drawer the preferred shared container at the smallest supported phone width?
2. Should a normal file-row tap open actions, select/highlight, or perform the context primary action? This Scout recommends explicit `⋯`/action sheet to avoid accidental prompt mutations.
3. Is `+ PATH` the final Outgoing label, or should the product use `Browse` for less technical Dad-facing language?
4. Should generic browsing allow one selection only while Coach References keeps multiple, as recommended here?
5. May Copy absolute expose the Stadium machine path already present in `games[].rootFsPath`, especially for remote/SSH/container Games?
6. Should absolute path be joined in the browser or returned authoritatively by the Stadium?
7. Are backticks the canonical prompt representation, and should relative paths always use `/` on Windows?
8. What exact provenance vocabulary should Settings use for automatically detected versus human-selected Reports/SOP roots?
9. Should hidden blocked entries remain invisible, or should an advanced surface explain why a name is unavailable?
10. Is a 500ms long-press worth V1 complexity, given a visible `⋯` button already solves discoverability and accessibility?
11. What truncation/pagination contract is needed once a Game directory exceeds the current 200-entry cap?
12. Should a disconnected browser freeze its current list for context, or immediately replace it with a reconnect state?

## 17. FINAL SCOUT VERDICT

Sideline’s best UX is one simple Game-relative browser with context-provided actions—not separate Reports, SOP, Coach References, and Outgoing browsers. Keep navigation lazy and familiar; make actions explicit; make `+ PATH` insert a relative path at the caret and return focus to the prompt; use the same action sheet for mobile long-press, visible `⋯`, desktop right-click, and keyboard invocation.

The interaction surface can be added without changing dispatch payloads or inventing filesystem discovery. The only genuinely architectural decision is absolute-path authority/disclosure, plus the future Game-scoped persistence/bootstrap rules for canonical Reports and SOP folders. Everything else is a small extraction of existing `routineBrowse`, `copyText`, modal/focus, toast, and Outgoing layout primitives.

No implementation was performed.
