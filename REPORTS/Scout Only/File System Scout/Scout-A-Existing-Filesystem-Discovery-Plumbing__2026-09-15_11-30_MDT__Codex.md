# SCOUT A — EXISTING FILESYSTEM DISCOVERY PLUMBING

Execution: 2026-09-15 11:30 MDT  
Branch verified: `q2.8-multigame-field-debug`  
Role: read-only reconnaissance; no feature implementation

## 1. VERDICT

Sideline Coach already has a strong, reusable Game filesystem browser. The Coach Routines source browser is a bounded, Game-root-confined, metadata-only implementation that lists one directory per request and supports both files and folders. It runs where the files exist—the connected Game's Stadium—and is proxied by the detached Control Plane to the browser.

The reusable core is `src/routine-sources.ts:browseSources()`, reached through `routine.sources.browse`. It already supplies the hard parts: Game scoping, relative-path normalization, traversal rejection, blocked-secret filtering, symlink/junction escape checks, bounded enumeration, stable folder-first sorting, and file/folder typing. The current frontend already supplies lazy folder navigation, Back, separate selection/navigation controls, retained multi-selection, loading/error/empty states, accessible tap targets, and a cross-browser clipboard helper.

The current browse response is deliberately narrow: `{ gameId, dir, entries: [{ name, path, kind }] }`. `path` and `dir` are Game-relative. It does **not** include an absolute path, URI, explicit parent, extension, children, or permission/authority fields. However, the ordinary status projection already includes `games[].rootFsPath`, so the browser presently receives the selected Game's absolute root indirectly. Consequently, Copy Game-relative Path is client-only today. Copy Absolute Path could also be client-only by joining the existing root with the returned relative path, but only if architecture explicitly accepts exposing/using that machine path and defines platform-safe joining; a backend-computed absolute path is safer for cross-platform separators and remote Stadium semantics.

Do not create a second filesystem browser. Generalize the existing source-browser naming/contract into a Game filesystem metadata service, retain Stadium authority, and let Coach Routines remain one consumer.

## 2. EXISTING FILESYSTEM SYSTEMS FOUND

### A. Coach Routines source discovery — primary reusable browser

- `src/routine-sources.ts`
  - `BrowseSourceEntry` (lines 21–25): `{ name, path, kind }`.
  - `BrowseSourcesResult` (lines 27–30): `{ dir, entries }`.
  - `validateRelativeSourcePath()` (lines 64–78): length, absolute/UNC/drive, separator normalization, and traversal validation.
  - `isPathInsideRoot()` (lines 80–90): lexical Game-root containment with Windows case folding.
  - `checkAncestorSymlinkEscape()` (lines 92–112): detects escapes through existing ancestors for missing targets.
  - `checkSources()` (lines 114–178): authoritative `file | folder | missing | blocked | unknown` checks.
  - `browseSources()` (lines 180–272): bounded, one-level directory enumeration.
  - `suggestSources()` (lines 296–410): separate bounded breadth-first heuristic discovery for likely canonical documentation.
- `src/stadium-client.ts`
  - `StadiumClientOptions.routineSources` (lines 60–64): injectable `suggest`, `browse`, and `check` seams.
  - `handleIncomingRequest()` branches for `routine.sources.suggest`, `.browse`, and `.check` (lines 575–665).
- `src/control-plane/daemon.ts`
  - HTTP routes `/api/routines/sources/suggest` (lines 888–927), `/browse` (929–971), and `/check` (973–1034).
- `src/public/index.html`
  - browse state `routineBrowse` (line 3711).
  - `openRoutineBrowse()` (lines 3941–3955).
  - `renderRoutineBrowsePanel()` (lines 3966–4065).
  - Coach Routines “+ Add references” integration (lines 4317–4424).

### B. Report filesystem discovery

- `src/server.ts:scanReportsForGame()` and `scanReports()` (lines 724–788) use `vscode.workspace.findFiles()`, `workspace.fs.stat()`, and `workspace.fs.readFile()` over configured report globs.
- `src/server.ts:describeReport()` (lines 790–814) maps VS Code URIs to Game identity and Game-relative report paths.
- This is specialized glob-based report discovery, not an interactive general browser. It uses VS Code's filesystem abstraction and supports multi-root URI attribution better than `routine-sources.ts`, but it reads report content and should not replace the metadata-only browser.

### C. Add Game/native folder pickers

- `src/extension.ts:pickGameFolder()` (lines 281–324) invokes `vscode.window.showOpenDialog()` for exactly one folder, then adopts/resolves/registers the Game.
- `src/extension.ts:addGame()` (lines 455–474) is a second native one-folder picker path for the command flow.
- These choose a repository root; they do not enumerate a tree in the mobile web UI. They are relevant reuse for desktop-native “Choose folder,” but not for phone browsing.

### D. Game identity and repository/root discovery

- `src/game-identity.ts:resolveGameContextSync()` (lines 300–395) derives the Game and authoritative `binding.rootFsPath` from the first workspace folder, using marker, git remote, local registry, then Unknown.
- `src/game-identity.ts:readGameMarker()` and `readGitRemoteOriginFromConfig()` inspect `.sideline/game.json` and `.git/config`.
- `src/game-adoption.ts:adoptGameFolder()` (lines 62–132) validates a chosen Game root and establishes portable identity when appropriate; `findEnclosingRepository()` (135–141) prevents adopting a nested folder as a separate Game.
- These establish identity/root authority. They are not content browsers.

### E. Other filesystem-related discovery

- `src/player-discovery.ts` and discovery code in `src/player-roster.ts` discover Player processes, executables, and terminals. They do not list repository files and should stay separate.
- `tools/diagnostics/collect-preflight.mjs` performs bounded diagnostic walks. It is offline tooling with different disclosure and mutation contracts, not a product browser seam.
- `src/routine-sources.ts:suggestSources()` is a second discovery mode within the same safe module, not a second browser: it recursively searches to depth 3 using documentation heuristics and fixed scan budgets, while `browseSources()` is lazy and one-level.

## 3. PRIMARY REUSABLE IMPLEMENTATION

The strongest implementation is `browseSources(rootFsPath, rawDir, maxEntries)` in `src/routine-sources.ts`.

It accepts the Stadium-resolved Game root plus an optional Game-relative directory. It resolves the real root, validates and normalizes the requested directory, rejects blocked locations, checks lexical containment, checks realpath containment, opens only that directory with `fs.promises.opendir()`, filters each entry, follows each entry through `realpath()` and `stat()`, returns only regular files/directories, sorts folders before files and names case-insensitively, and caps the returned list at 200. It scans no more than 1,000 raw entries for one request (`MAX_BROWSE_SCAN_ENTRIES`, line 35).

Directly reusable behavior:

- relative-path validator and slash normalization;
- blocked segment/file policy;
- lexical and realpath root containment;
- symlink/junction escape protection;
- file/folder metadata model;
- one-level lazy enumeration and bounds;
- folder-first stable sort;
- injectable Stadium service seam;
- exact-Game RPC enforcement;
- Control Plane authoritative-session selection and response shaping.

The main required generalization is naming and policy ownership. `routine-sources.ts`, `routine.sources.browse`, and `/api/routines/sources/browse` describe a workflow even though `browseSources()` itself is generic metadata plumbing. A shared Game-files service should own neutral browse/check types and policy; Coach Routines can call that service without changing its product behavior.

## 4. END-TO-END CALL CHAIN

Proven primary flow:

1. **Browser entry:** `src/public/index.html` builds “+ Add references” at lines 4397–4406. Click calls `openRoutineBrowse(gameId, routine.id, '')`.
2. **Browser request:** `openRoutineBrowse()` at lines 3941–3955 performs `GET /api/routines/sources/browse?gameId=<exact>&dir=<relative>`.
3. **Control Plane HTTP:** `src/control-plane/daemon.ts` lines 929–945 validates `gameId`, requires a known Game, and requires its authoritative connected Stadium.
4. **Control Plane RPC:** daemon lines 947–953 calls `sendRpcToStadium(auth.session, 'routine.sources.browse', { gameId, dir })`.
5. **Stadium exact-Game guard:** `src/stadium-client.ts` lines 604–613 compares the request's `gameId` with `gameContextGetter().game.gameId` and rejects mismatch.
6. **Stadium filesystem authority:** client lines 614–618 takes `ctx.binding.rootFsPath` and calls injected `routineSources.browse(...)` or the default `browseSources(rootFsPath, params.dir)`.
7. **Node filesystem:** `src/routine-sources.ts:browseSources()` lines 180–272 resolves/validates the directory, uses `fs.promises.opendir`, `realpath`, and `stat`, and returns metadata only.
8. **Stadium response:** client lines 619–624 returns `{ success, gameId, dir, entries }`.
9. **Control Plane shaping:** daemon lines 954–966 verifies matching `gameId`, caps to 200, validates each entry, and exposes only `{ name, path, kind }`.
10. **Browser state/render:** `openRoutineBrowse()` stores `result.dir` and `result.entries`; `renderRoutineBrowsePanel()` lines 3966–4065 renders the current folder, Back, file/folder rows, checkboxes, and “Open ›” for folders.
11. **Lazy expansion:** folder Open calls `openRoutineBrowse(..., entry.path)` (line 4029), issuing another one-directory request. No entire tree is loaded.
12. **Selection persistence:** `routineBrowse.selected` is a `Map`; selection survives navigation and is flattened into the render memoization key (lines 3753–3759). “Add N selected” submits the accumulated file/folder references through the routine mutation path.

## 5. DATA ALREADY AVAILABLE TO THE BROWSER

### Browse response

| Field | Available | Evidence / meaning |
|---|---:|---|
| filename | Partial | `entries[].name`; same field serves file and folder names. |
| folder name | Yes | `entries[].name` with `kind: 'folder'`. |
| absolute filesystem path | No, not in browse response | `rootFsPath` stays out of `BrowseSourceEntry`. |
| Game-relative path | Yes | `entries[].path`, normalized to `/`; current `dir` is also relative. |
| URI | No | No URI field crosses this browse path. |
| item type | Yes | `kind: 'file' | 'folder'`. |
| parent | Implicit only | Browser derives parent from `dir.split('/').slice(0, -1)` at `index.html:3978`. |
| extension | No explicit field | Can be inferred client-side from `name`, with normal dotfile/compound-extension caveats. |
| workspace/Game identity | Yes at envelope level | HTTP/RPC response includes exact `gameId`; not repeated per entry. |
| nested children | No | One level only; folders are opened lazily via another request. |
| permissions/authority | No per-entry field | Rejected/skipped items disappear; route-level errors report unavailable/offline. `checkSources()` separately returns state. |

### Absolute path nuance

`src/control-plane/stadium-registry.ts:getGames()` lines 282–322 includes `rootFsPath` in every `GameViewItem`. `src/control-plane/daemon.ts:buildStatus()` returns that `games` array at line 2077. The browser receives and stores status, although current UI does not read `rootFsPath`. Thus absolute root data is already present in the browser's status payload.

**Answer:** Copy Game-relative Path needs no backend change. Copy Absolute Path may need no new backend data, but joining must account for the Stadium platform, separators, remote/container paths, and the policy decision about displaying/copying machine-local absolute paths. A neutral browse response could instead include a Stadium-computed `absolutePath` only when explicitly authorized; that is an architectural choice, not a discovery gap.

## 6. COACH ROUTINES / ADD REFERENCES FINDINGS

- It browses both files and folders (`BrowseSourceEntry.kind`).
- A folder is selectable as a whole through its checkbox, independently of navigation (`index.html:4008–4030`).
- Folders expand lazily. “Open ›” sends another request for that folder; it never selects it automatically.
- It queries one directory at a time, not an entire tree (`browseSources()` and `test/coach-routine-sources.test.mjs` C4, lines 119–141).
- It begins at the exact Game root (`dir=''`). No alternate root is accepted.
- It is strictly Game-scoped twice: the Control Plane chooses the authoritative Stadium for `gameId`, then the Stadium rejects any `gameId` unequal to its own binding (`daemon.ts:929–947`; `stadium-client.ts:604–618`).
- It cannot intentionally browse outside the current Game. Absolute paths, drive paths, UNC paths, `.`/`..`, blocked segments, and realpath escapes are rejected or omitted (`routine-sources.ts:37–90, 198–258`).
- Blocked names include `.git`, `node_modules`, `.sideline`, `secrets`, `credentials*`, `.env*`, `*.pem`, `*.key`, `*.pfx`, `id_rsa*`, and token files (`routine-sources.ts:37–61`).
- Entry contents are never read or returned. Tests C19 explicitly assert no `content`, `body`, or `text` fields (`test/coach-routine-sources.test.mjs:330–352`).
- The browser supports Back, loading, error, empty, selection count, Close, and accessible labels. Rows have a 44px minimum height and checkboxes 22px (`index.html:301–315`), indicating deliberate touch usability.
- The repository has automated mobile-layout proof that Coach Routines controls remain in normal Settings flow (`test/coach-routines-v0-slice-d-settings.test.mjs`, SliceD-23 at line 548). The live field context says the browser worked on mobile. There is no dedicated gesture support.

Components worth reusing directly: `browseSources()`, validators/containment helpers, the Stadium handler pattern, Control Plane authoritative-session proxy pattern, `openRoutineBrowse()` state transitions, folder Back/Open logic, selection `Map`, accessible row construction, and `copyText()`.

## 7. OTHER DISCOVERY IMPLEMENTATIONS

1. **Source suggestions:** `suggestSources()` shares safety helpers but performs bounded BFS with documentation-name heuristics. It is useful for SOP/onboarding recommendations, not generic browsing.
2. **Source checks:** `checkSources()` authoritatively reports file/folder/missing/blocked/unknown and is reusable for validating stored canonical paths.
3. **Routine persistence normalization:** `src/control-plane/coach-routines.ts:normalizeRoutineSourcePath()` lines 198–215 independently repeats path normalization and blocked-location policy before persistence. This duplication is intentional defense-in-depth but is a generalization seam: a future shared path-value type/policy must avoid drift between Control Plane validation and Stadium filesystem validation.
4. **Report scan:** `src/server.ts:scanReports()` is glob-driven, VS Code-URI-based, content-reading discovery specialized for Incoming.
5. **Add Game pickers:** two native folder-picker functions exist in `src/extension.ts` (`pickGameFolder` and command `addGame`). They select roots but do not browse within a Game. There is already duplication in Add Game entry paths; generic browse work should not add a third picker implementation.
6. **Game/root discovery:** `resolveGameContextSync()`, marker/remote readers, `adoptGameFolder()`, and the Stadium registry establish the root against which browsing is authorized.
7. **Player discovery and diagnostics walks:** separate domains; do not reuse as UI filesystem browsing.

## 8. REUSABLE BACKEND COMPONENTS

Can remain behaviorally unchanged:

- `validateRelativeSourcePath()`;
- `isPathInsideRoot()`;
- symlink/realpath containment logic;
- blocked secret/metadata filters, subject to an explicit generic-browser policy review;
- `browseSources()` enumeration, sorting, and bounds;
- `checkSources()` for stored-path validation;
- Stadium's exact-Game guard pattern;
- Control Plane `getAuthoritativeSessionForGame()` routing;
- response validation/capping.

Needs generalization, not reinvention:

- Rename or wrap `routine-sources.ts` as a neutral Game-files service.
- Introduce neutral RPC/HTTP names such as `game.files.browse` and `/api/games/files/browse`, or explicitly bless the current route as shared. Reusing a route named `routines/sources` from Outgoing/Settings would create semantic debt.
- Centralize shared response interfaces instead of repeating inline shapes in `StadiumClientOptions`, the Stadium handler, and daemon casts.
- Decide whether generic browse uses the same blocklist as Coach References. Visibility and eligibility as a routine source may not be identical policies.
- Decide whether an absolute-path action receives an explicit server-computed value or derives it from already-exposed `games[].rootFsPath`.

No new filesystem authority belongs in the detached Control Plane. The Control Plane does not necessarily share the Stadium's filesystem or path semantics; the Stadium already owns the root and filesystem access.

## 9. REUSABLE FRONTEND COMPONENTS

Directly reusable logic in `src/public/index.html`:

- `routineBrowse` state shape and Game/routine supersession guard;
- `openRoutineBrowse()` lazy request/loading/error flow;
- `renderRoutineBrowsePanel()` Back and entry rendering;
- folder/file labels and accessible controls;
- retained selection `Map` across directories;
- `copyText()` (lines 3374–3389), which uses `navigator.clipboard.writeText()` in secure context and falls back to a hidden textarea plus `document.execCommand('copy')`;
- existing toast and focus helpers.

Too workflow-specific to reuse unchanged:

- `routineId` coupling in browse state;
- checkboxes and “Add N selected” as the only action model;
- `addRoutineSources()`, `patchRoutine()`, and source-check persistence;
- labels such as “Use … as a reference” and “What should Coach reread?”;
- rendering nested inside a Coach Routine card and gated by Dev Mode.

A generic browser should extract a neutral panel/controller capable of receiving an action provider or selected-entry callback. Coach Routines can configure “Add as reference”; Settings can configure “Use as Reports/SOP folder”; Outgoing can configure “Insert path”; a generic context action menu can offer copy operations.

## 10. SETTINGS INTEGRATION SEAMS

The current Settings surface is in `src/public/index.html` lines 945–1040. `openSettings()`/`closeSettings()` are at lines 3606–3617. Coach Routines is already a live settings card (`#coachRoutinesCard`, lines 965–981); “Game Setup” is currently a Planned card at lines 983–991.

Likely integration seam:

- Place Game-scoped “Reports Folder” and “SOP / onboarding folder” controls in the Game Setup card, because that card already describes active workspace binding, repository roots, and project detection.
- Reuse the neutralized browser with folder-only action eligibility and the currently selected exact `gameId`.
- Persist settings in Control Plane Game-scoped state, then validate chosen paths authoritatively through the Stadium (`checkSources()`-style semantics).
- Use `suggestSources()` heuristics as optional suggestions for SOP/onboarding roots; Reports roots may need separate heuristics covering `Reports-SLC`, `Reports`, and `Docs REPORT`.
- Keep stored values Game-relative for portability. Resolve them against the connected Stadium's current `rootFsPath` at use time.

No current settings or persistence fields exist for canonical Reports or SOP roots. `package.json` has extension-wide `coach.reportGlobs`, not a Game-scoped folder setting. `CoachRoutines` stores its own Game-scoped source paths but is not the correct owner for general Game settings.

## 11. OUTGOING PLAY DISPATCHER INTEGRATION SEAM

The Outgoing markup is `src/public/index.html` lines 875–942:

- `.routing-mode-bar` at lines 884–891 contains the AUTO/MANUAL toggle group and Refresh button.
- `#modeAutoBtn` and `#modeManualBtn` are lines 887–888.
- `#promptInput` is lines 929–932.
- `#dispatchBtn` is line 934.

Behavior:

- `setRoutingMode()` posts `/api/route` (`index.html:2549–2561`).
- prompt input drives staged preview and dispatch-control state (`3501–3514`).
- `submitDispatch()` captures the exact `promptInput.value`, builds AUTO or MANUAL payload, and posts `/api/dispatch` (`4642–4700`).
- `#dispatchBtn` invokes `submitDispatch()` unless temporarily acting as View Player (`4751–4756`).

Minimum-disruption insertion point for a future `+ PATH` is the `.routing-mode-bar`, adjacent to the existing toggle/control row, if product design confirms it. The path action should modify only `#promptInput.value`, dispatch the same `input` event or call the same preview refresh logic, preserve cursor/selection, and focus the textarea. It should not alter dispatch payload schemas: “Insert path into Play” can be a client-side text insertion followed by the existing `/api/route/preview` and `/api/dispatch` flows.

The browser already contains a comparable text-insertion pattern around `index.html:1275–1280`, which assigns text to `promptInput`, triggers an input event, and focuses it. That pattern is reusable, but insertion at the caret rather than wholesale replacement requires a small dedicated helper using `selectionStart`/`selectionEnd`.

## 12. MOBILE / DESKTOP INTERACTION SUPPORT

Existing support:

- touch-sized routine browser rows/buttons through CSS (`index.html:301–315`);
- normal click/change handlers;
- accessible `aria-label`s for selection, Open, Back, Close, and settings;
- generic clipboard helper `copyText()`;
- existing dropdown menu behavior for Game selection (`index.html:3391–3400`);
- a custom modal with Escape/Tab focus management (`index.html:4571–4592`).

Not found:

- no `pointerdown`, `pointerup`, `pointercancel`, `touchstart`, or `touchend` handlers;
- no `contextmenu` handler;
- no long-press timer/utility;
- no reusable item action popover/context-menu component.

Likely technical path:

- Use Pointer Events for one shared press state across mouse, pen, and touch.
- On touch/pen, start a bounded long-press timer on `pointerdown`; cancel on movement, `pointerup`, `pointercancel`, scrolling, or loss of capture.
- On desktop, handle `contextmenu` for the same entry and open the same accessible action menu.
- Keep ordinary click/Open behavior distinct so long-press does not also navigate.
- Reuse `copyText()` for actions, but show truthful local success/failure feedback.
- Build keyboard access (Menu key/Shift+F10 and an explicit action button) rather than making gestures the only path.

This interaction layer is new frontend work; filesystem discovery itself is not.

## 13. MINIMUM REUSE PATH

1. Extract or wrap `browseSources()` and its types/policy under a neutral Game-files name; keep implementation in the Stadium.
2. Add the smallest neutral browse RPC/HTTP alias that sends exact `gameId` plus relative `dir` and returns the existing shape. Coach Routines may migrate later or immediately share the neutral route.
3. Extract the current browse panel's navigation/loading/error/list logic from routine-specific mutation code.
4. Supply context-specific actions:
   - Copy Game-relative Path: call `copyText(entry.path)` client-side.
   - Copy Absolute Path: architecture chooses browser join using selected `games[].rootFsPath` or a Stadium-returned computed value.
   - Add as Coach Reference: reuse current merge/check/patch flow.
   - Use as Reports/SOP folder: folder-only action, new Game-scoped setting persistence, authoritative check.
   - Insert path into Play: splice the chosen path into `promptInput`, emit/input-refresh, and focus; no dispatch API change.
5. Add an entry point in Settings/Game Setup and, later, in the Outgoing routing bar without duplicating browse state or backend enumeration.

Backend code that can remain unchanged: directory enumeration and containment algorithms. Backend needing generalization: names/types/routes and possibly policy/absolute-path projection. Frontend reusable: lazy panel mechanics, selection/navigation primitives, `copyText`, toast/focus utilities. Frontend workflow-specific: routine mutation and checkbox-only action model.

## 14. RISKS / UNKNOWNS

- **Visibility versus eligibility:** The existing blocklist defines what may be a Coach Routine source. A generic filesystem viewer may need a separately reviewed visibility policy; weakening the current source policy would be unsafe.
- **Absolute path disclosure:** Status already exposes `games[].rootFsPath`, but making absolute paths prominent/copyable on a remotely accessible phone surface is a product/security decision.
- **Remote environments:** `routine-sources.ts` uses Node `fs` in the Extension Host. In SSH/WSL/container scenarios this likely addresses the remote filesystem correctly, but returned absolute paths may be meaningless on the phone or local desktop. This was not runtime-tested.
- **VS Code virtual filesystems:** Node `fs` cannot browse non-`file` workspace providers, whereas report scanning uses `vscode.workspace.fs`. Supporting virtual workspaces would require a VS Code-URI abstraction, not only renaming the service.
- **Multi-root workspaces:** Game identity currently binds `workspaceFolders?.[0]`; generic browsing therefore covers the primary Game root only. Behavior for additional workspace folders is not defined.
- **Symlinks/junctions:** Current realpath containment is strong and deliberately hides escapes. Whether safe in-root links should display their link identity is not represented.
- **Large directories:** scanning stops after 1,000 encountered entries and returns at most 200, without pagination or a truncation flag. Users cannot know more entries exist.
- **Errors/permissions:** unreadable entries are silently skipped; the result carries no per-entry authority or reason.
- **Path identity/case:** comparisons are Windows-case-insensitive in root containment and routine UI dedupe, but persisted/displayed casing and cross-platform semantics need one contract.
- **Stale requests:** current UI guards only by `routineId`, not requested directory or Game in the completion check. A neutral browser should use a request generation/token to prevent out-of-order folder responses.
- **Clipboard restrictions:** secure-context Clipboard API is preferred; fallback uses deprecated `execCommand`. Mobile/browser permission behavior still needs field proof.
- **Dirty worktree:** repository inspection occurred with substantial pre-existing modified/untracked work. This Scout made no attempt to normalize it.

## 15. QUESTIONS OPUS SHOULD ANSWER

1. Is generic browsing strictly Game-root-only, or may a human explicitly authorize parent/external roots?
2. Is the Coach Routine blocklist also the generic visibility policy, or only an action-eligibility policy?
3. May Dad-facing/mobile UI expose absolute machine paths, given remote access and existing `games[].rootFsPath` disclosure?
4. Should absolute paths be computed in the Stadium to preserve OS/remote semantics, or client-joined from existing status data?
5. Does V1 support only the bound first workspace root, or all VS Code workspace folders?
6. Must V1 support virtual/remote filesystem providers through `vscode.workspace.fs`, or is Node/file-scheme support explicit?
7. Should the neutral browser replace the routine-specific route now, or coexist behind a shared service during migration?
8. Does generic browsing show blocked entries disabled with reasons, or continue hiding them?
9. What pagination/truncation UX is required beyond 200 returned/1,000 scanned entries?
10. Where are canonical Reports/SOP settings persisted, and how do they interact with legacy `coach.reportGlobs` and future `Reports-SLC`?
11. Are gestures supplemental only, with a visible action button required for keyboard/accessibility discoverability?
12. Is “Insert path into Play” relative by default, absolute by default, or an explicit action choice?

## 16. EXACT SOURCE FILES / FUNCTIONS OPUS SHOULD READ

Priority order:

1. `src/routine-sources.ts`
   - `BrowseSourceEntry`, `BrowseSourcesResult`
   - `isBlockedSegment()`, `isBlockedFile()`, `isBlockedRelativePath()`
   - `validateRelativeSourcePath()`
   - `isPathInsideRoot()`, `checkAncestorSymlinkEscape()`
   - `checkSources()`
   - `browseSources()`
   - `suggestSources()` and `HEURISTICS`
2. `src/stadium-client.ts`
   - `StadiumClientOptions.routineSources`
   - `handleIncomingRequest()` branches `routine.sources.suggest`, `.browse`, `.check`
3. `src/control-plane/daemon.ts`
   - `/api/routines/sources/suggest`
   - `/api/routines/sources/browse`
   - `/api/routines/sources/check`
   - `buildStatus()` and `games` projection
4. `src/control-plane/stadium-registry.ts`
   - `getGames()` and `rootFsPath` projection
   - `getAuthoritativeSessionForGame()`
5. `src/public/index.html`
   - `.routine-browse*` CSS (lines 301–315)
   - Outgoing markup (875–942)
   - `copyText()` (3374–3389)
   - Settings markup and `openSettings()` (945–1040; 3606–3617)
   - `routineBrowse` state and render key (3711; 3753–3759)
   - `openRoutineBrowse()` (3941–3955)
   - `renderRoutineBrowsePanel()` (3966–4065)
   - Add References integration (4317–4424)
   - `submitDispatch()` and dispatch click (4642–4756)
6. `src/control-plane/coach-routines.ts`
   - `RoutineSource`, `RoutineSourceState`
   - `normalizeRoutineSourcePath()` and source persistence validation
7. `src/extension.ts`
   - `pickGameFolder()`
   - command-path `addGame()`
8. `src/game-identity.ts`
   - `resolveGameContextSync()` and `binding.rootFsPath`
9. `src/game-adoption.ts`
   - `adoptGameFolder()` and root safety checks
10. `src/server.ts`
    - `scanReportsForGame()`, `scanReports()`, `describeReport()` as the separate VS Code-filesystem discovery pattern
11. `test/coach-routine-sources.test.mjs`
    - C4–C19 filesystem/boundary tests and C20–C25 wire/Game-authority tests
12. `test/coach-routines-v0-slice-d-settings.test.mjs`
    - SliceD-11 through D-18 selection semantics and SliceD-23 mobile layout

## 17. FINAL SCOUT VERDICT

Sideline Coach is close to a generic Browse Game feature. The filesystem authority, safe traversal, lazy listing, exact-Game routing, response shaping, mobile-sized list UI, and clipboard primitive already exist. The missing work is primarily product-neutral extraction and action UX—not a new discovery engine.

The smallest credible direction is to preserve Stadium-owned `browseSources()` semantics, expose them through a neutral exact-Game browse contract, extract the routine browser into a configurable panel, and add context-specific actions. Game-relative copy and Play insertion can be browser-only. Absolute copy is technically near-zero backend work because `rootFsPath` already reaches the browser, but it remains an architectural/security/cross-platform decision. Settings needs new Game-scoped persistence for canonical Reports/SOP roots; it does not need new enumeration plumbing.

No implementation was performed.
