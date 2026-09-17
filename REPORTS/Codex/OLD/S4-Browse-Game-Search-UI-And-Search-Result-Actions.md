# S4 — Browse Game Search UI And Search-Result Actions

## 1. VERDICT

S4 is implemented and automated proof is green. The existing Browse Game surface now provides whole-Game, exact-Game file/folder Search and routes every result through the existing S3 path-action provider. Search-result Insert and Copy reuse the S3 implementations, while Open containing folder and folder Open reuse lazy Browse navigation.

Human phone field proof remains pending and is not claimed.

## 2. ARCHITECTURE USED

Implementation follows `REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md`, specifically the S4 Search controller, stale-response, Search/Browse presentation, result-row, and Open containing folder decisions.

The human-approved Dispatcher hierarchy is unchanged: `AUTO | MANUAL` remains the routing/Player-selection family, `+ PATH` remains a separate Play-composition/filesystem action, and Refresh remains in the header.

## 3. WORKTREE SAFETY

The expected branch `q2.8-multigame-field-debug` was confirmed before editing. The repository already contained substantial modified, deleted, and untracked work, including uncommitted S1/S2/S3 files. All unrelated work was preserved. No reset, restore, stash, clean, branch switch, commit, or push was performed.

## 4. FILES CREATED

- `REPORTS/Codex/S4-Browse-Game-Search-UI-And-Search-Result-Actions.md` — this report.

## 5. FILES MODIFIED

- `src/public/index.html` — Search field, controller state, debounce/correlation, Search rendering, shared Search-result actions, responsive styling, and test diagnostics.
- `src/control-plane/protocol.ts` — optional bounded single-character explicit-Search flag on the existing neutral Search RPC.
- `src/control-plane/daemon.ts` — maps `explicit=1` on the existing Search route to that RPC flag.
- `src/stadium-client.ts` — applies the explicit one-character exception through the existing bounded Search helper.
- `test/browse-game-path-actions.test.mjs` — S4 browser/Search/action/race/responsive regression coverage added to the existing S3 harness.
- `test/game-files-wire.test.mjs` — explicit-Enter one-character wire-contract proof.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — proven S4 truth and the proposed V2 multi-select breadcrumb.

These files already contained active prerequisite/unrelated work; only bounded S4 additions were made.

## 6. SEARCH UI

Browse Game now has a mobile-friendly `type="search"` field with Dad-facing placeholder `Search files & folders...`, a visible Clear control, search keyboard hint, disabled capitalization/autocorrect/spellcheck, and a 120-character input bound.

The field lives inside Browse Game. No Search control was added to Dispatcher routing, and `+ PATH` was not moved into the `AUTO | MANUAL` segmented control.

## 7. SEARCH REQUEST / STALE-RESULT CONTRACT

- Input updates immediately.
- Ordinary queries debounce for 300 ms.
- Enter searches immediately.
- Whitespace is trimmed, repeated whitespace collapses, `\` becomes `/`, and correlation uses the normalized lowercase query.
- Ordinary one-character input shows a lightweight short-query hint and makes no request.
- Explicit Enter uses `explicit=1` on the existing neutral Search route, which enables S2's already-bounded `allowSingleCharacter` helper policy. No second Search API exists.
- Every Search is sent with the browser session's immutable exact `gameId`.
- A response applies only when browser session, Search generation, exact `gameId`, normalized query, echoed response query, and response Game all still match.
- Superseded responses, closed-sheet responses, selected-Game changes, and earlier-query responses are ignored.
- Search never falls through to Coach Routine suggestions or browser-side traversal.

## 8. RESULT RENDERING

Search mode temporarily replaces directory rows without destroying the saved Browse directory. Clearing Search restores the previous directory and captured scroll position without a Browse request.

Each result renders only the shaped `name`, `kind`, and Game-relative `path`, in backend-returned order. Folder paths display a trailing slash for clarity. Long paths wrap without horizontal overflow. Backend-injected content or absolute-root fields are discarded and never rendered.

## 9. RESULT ACTION PROVIDER

Search rows pass the same entry object into the existing S3 provider and action sheet. There are no parallel “Search Insert”, “Search Copy”, or “Search Browse” actions.

Outgoing Search-result actions are:

- Insert path into Play
- Copy Game-relative path
- Open containing folder
- Open folder for folder results

Normal folder-row activation also opens the folder through the same Browse navigation.

## 10. INSERT PATH INTO PLAY

Search insertion calls the unchanged S3 `insertPathIntoPlay` helper. It preserves Game-relative path formatting, backticks, folder trailing slash, caret/selection replacement semantics, surrounding prompt text, input event dispatch, focus restoration, caret placement, AUTO preview behavior, and closing Browse Game only after success.

No Search-specific insertion fork was introduced.

## 11. COPY RELATIVE PATH

Search Copy calls the unchanged S3 relative-path action and clipboard helper. It copies the exact returned Game-relative path, truthfully reports success/failure, leaves the sheet recoverable on failure, performs no filesystem mutation, and constructs no absolute path.

## 12. OPEN CONTAINING FOLDER

Open containing folder derives only the Game-relative parent and calls the existing `/api/games/files/browse` navigation primitive. Root-level files open Game root. Folder Search results also offer Open folder.

Search clears only after the target Browse request succeeds. If the target disappeared or Browse fails, Search remains open with its results and a truthful error toast.

## 13. TRUNCATION / MORE-MATCHES UX

The UI preserves the backend distinction:

- `moreMatches=true`: “More matches exist — refine your search.”
- `truncated=true`: “Searched part of this Game — results may be incomplete. Refine your search.”

The backend `limitReason` is retained in controller diagnostics without exposing backend terminology to Dad-facing UI. Search order is not reranked in the browser.

## 14. MOBILE / DESKTOP BEHAVIOR

The existing responsive component is reused on both form factors. The Search input is 46 px high, Clear and row/action controls meet the existing 44 px touch-target policy, results cannot create horizontal overflow, paths wrap, the list remains independently scrollable, and Close stays in the sticky top structure.

Desktop right-click opens the same result action provider. Escape continues to close the action menu before the browser. No hover-only or separate desktop Search implementation was added.

## 15. ROUTING-STATE ISOLATION

Regression proof captures and compares routing mode, exact Player selection, model, reasoning effort, and staged route choice across Search-result insertion. Only prompt text changes. No AUTO/MANUAL, Player, model, effort, context ownership, or report-context code was changed.

## 16. MULTI-SELECT V2 BREADCRUMB

Adjacent controller code and the central architecture breadcrumb now record:

`WILL BE / V2 / PROPOSED — Browse Game multi-select path mode`

V1 remains single-select. No Dad-facing multi-select UI, state, or behavior was implemented.

## 17. OUT-OF-SCOPE CONFIRMATION

S4 did not add content Search, grep, indexing, embeddings, browser traversal, Copy Absolute Path, root-path joining, Settings folder selection, GameFilesystemContract, Bootstrap, `Reports-SLC`, lane creation, watcher migration, Coach Routine migration, routing-policy changes, Player/model/effort changes, or multi-select.

## 18. TESTS ADDED

Coverage proves:

- Search placement outside routing and mobile-safe CSS;
- 300 ms debounce, immediate Enter, normalized query correlation, exact `gameId`, one-character policy, and empty-query restore;
- older-query, selected-Game, and closed-sheet stale suppression;
- file/folder rendering, relative context, returned order, metadata-only shaping, and no absolute/content leakage;
- loading, short-query, no-result, more-match, truncated, offline, and unsupported states;
- shared Insert and Copy actions;
- Open containing folder, folder Open, root/parent navigation behavior, and recoverable Browse failure;
- routing/Player/model/effort/staged-route isolation;
- touch sizes, wrapping, scrolling, and horizontal-overflow protection;
- the explicit-Enter one-character route/RPC/helper wire path.

No existing test was weakened.

## 19. TARGETED TEST RESULTS

Commands:

```text
npm.cmd run check
node --test test/browse-game-path-actions.test.mjs test/game-files-search.test.mjs test/game-files-wire.test.mjs test/game-files.test.mjs
```

Result: **44 tests, 44 passed, 0 failed, 0 skipped, 0 cancelled**. TypeScript no-emit check passed.

## 20. FULL SUITE RESULT

Commands and results:

- `npm.cmd run check` — passed.
- `npm.cmd run compile` — passed.
- `npm.cmd test` — **758 tests, 758 passed, 0 failed, 0 skipped, 0 cancelled**.
- `git diff --check` — passed with no whitespace errors; Git emitted only existing LF/CRLF working-copy notices.

The full suite includes S1 Browse/Check, S2 Search, S3 path actions, Coach Routine filesystem, route/dispatch, multi-Game isolation, and responsive browser coverage.

## 21. LIVE / MACHINE PROOF

Automated machine proof includes real Control Plane/Stadium wire tests for exact-Game Search, response identity, cross-Game isolation, stale Stadium/offline behavior, Stadium supersession, and the explicit one-character Enter exception. Browser VM proof runs the real page script through Search → result → shared actions → Browse/insert outcomes.

No claim is made that a separately running Stadium/page was refreshed to this S4 build during this implementation session.

## 22. HUMAN FIELD PROOF STATUS

**PENDING.** The human has not yet performed the requested phone flow against a freshly compiled/reloaded Stadium and page. This report does not claim human field proof.

## 23. BREADCRUMB IMPACT

The central breadcrumb records only automated-proven S4 truth as IS: exact-Game neutral Search, metadata-only results, S3 action reuse, Open containing/folder navigation, stale suppression, and truthful incomplete-result states.

Multi-select is recorded only as `WILL BE / V2 / PROPOSED`. Absolute path, Bootstrap, Reports-SLC, Settings, and multi-select were not promoted to IS.

## 24. KNOWN CONSTRAINTS

- Human phone Search/insert/navigation proof is still required on fresh runtime code.
- Clipboard behavior is inherited unchanged from the human-proven S3 path; S4 adds no new clipboard mechanism.
- Search is intentionally name/path metadata only and bounded by S2 scan/result limits.
- V1 is intentionally single-select.

## 25. EXACT NEXT SLICE

Per the authoritative architecture, the next filesystem slice is **S5 — Absolute-path resolver + Copy absolute path**. It was not started here.
