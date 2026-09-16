# SCOUT E — GAME FILE/FOLDER SEARCH

## 1. VERDICT

V1 search is **SMALL**: the existing Stadium-owned bounded walker can be generalized without introducing an index or a second filesystem authority. `browseSources()` already performs the exact safety checks needed for a one-directory browser, while `suggestSources()` supplies the strongest existing bounded recursive walk. Reuse their shared validation/blocklist/realpath logic and replace documentation heuristics with deterministic case-insensitive filename/path matching.

Search must run only in the exact selected Game's Stadium/root. It should return both files and folders as `{ name, path, kind }`, with a bounded result list and a `truncated` flag. A debounced query with generation-token stale-result suppression is the safest phone-friendly V1. Search results should use the same action-provider menu as Browse Game; no dispatch API change is needed for inserting a Game-relative path.

## 2. EXISTING SEARCH / WALK PRIMITIVES

- `src/routine-sources.ts:browseSources()` uses `fs.promises.opendir()` for one directory, validates the Game root, rejects blocked names, checks lexical containment and realpath containment, stats each entry, and returns files/folders as `{ name, path, kind }`.
- `src/routine-sources.ts:suggestSources()` is a bounded breadth-first walk. It uses `opendir`, `realpath`, `stat`, a visited-real-directory set, a maximum of 1,000 entries and 100 directories, and depth <= 3. It already returns both file and folder candidates with Game-relative paths.
- `src/routine-sources.ts:checkSources()` validates known relative paths and performs the same containment/symlink/blocklist checks.
- `src/server.ts:scanReports()` uses `vscode.workspace.findFiles()` with excludes and a 500-result cap, but it is report-specific, file-only, and not the right generic Game search authority.
- No other generic repository search primitive is stronger than these; do not add a parallel crawler or index for V1.

## 3. suggestSources() REUSE ANALYSIS

`suggestSources()` starts at the Game root, resolves `realRoot`, queues directories, counts entries/directories, skips blocked segments/files, rejects lexical escapes, resolves each entry, rejects realpath escapes, stats only regular files/directories, and avoids revisiting the same real directory. Its `HEURISTICS` array is the documentation-specific part: names such as North Star, SOP, README, Architecture, and Playbook receive reasons/priorities.

Therefore the safe walking engine can be reused almost unchanged by replacing `HEURISTICS` matching and ranking with a generic query matcher. Search should preserve `isBlockedSegment`, `isBlockedFile`, `validateRelativeSourcePath`, `isPathInsideRoot`, realpath containment, and visited-real-directory behavior. The current walker has depth 3 and 1,000/100 bounds; generic search may need a separately agreed depth/entry budget but should not remove safety checks.

## 4. RECOMMENDED V1 MATCHING SEMANTICS

Use case-insensitive substring matching against the basename and normalized Game-relative path. Tokenize the query on whitespace and require every token to occur in either the name or path. This handles `report`, `player roster`, `src/server`, `onboarding`, `package.json`, and `.md` without fuzzy-search complexity.

Prefix and exact matches should rank higher, but not change eligibility. Do not add fuzzy distance, embeddings, semantic search, or content matching. Empty/whitespace query returns no search results (or restores browsing) rather than walking the entire Game.

## 5. FILE / FOLDER RESULT CONTRACT

`BrowseSourceEntry` in `src/routine-sources.ts` is the correct base shape:

```text
{ name: string, path: string, kind: 'file' | 'folder' }
```

The full relative `path` provides parent context, `name` supports display, and `kind` controls folder navigation/action eligibility. A search response can add only envelope metadata such as `gameId`, normalized `query`, and `truncated`; match score/type need not be exposed to the UI. Parent can be derived from `path` and is not required in V1.

## 6. GAME-SCOPED AUTHORITY

Existing Stadium RPC handlers in `src/stadium-client.ts` compare `params.gameId` with `gameContextGetter().game.gameId` before calling `suggestSources()` or `browseSources()`. They use that exact Stadium binding's `rootFsPath`; mismatches fail explicitly. A future search RPC should copy this pattern and never accept a caller-supplied root.

If the selected Game is offline, conflicted, or its Stadium is unavailable, return unavailable/retry. Do not fall back to another connected Stadium, a parent GitHub directory, sibling Games, Documents, or another drive. The Control Plane may proxy the request, but the Stadium selected for that exact `gameId` remains the only filesystem authority.

## 7. SECURITY / VISIBILITY POLICY

Search must share the Browse policy, not bypass it. `isBlockedSegment()` excludes `.git`, `node_modules`, `.sideline`, `secrets`, and credential-prefixed directories. `isBlockedFile()` excludes `.env*`, `.pem`, `.key`, `.pfx`, `id_rsa*`, `token`, and `.token`. `browseSources()` and `suggestSources()` also reject traversal and realpath/symlink/junction escapes, inaccessible entries, and non-file/non-directory types.

The generic search walker should call the same helpers. If Browse hides an entry, Search must hide it too. A separate hidden-file policy is a product decision only if it remains at least as restrictive as Browse.

## 8. PERFORMANCE / SEARCH BOUNDS

Bounded on-demand search is adequate for V1. Recommended starting bounds are the existing suggest budget (maximum 1,000 entries, 100 directories, depth 3) plus a maximum result count such as 50 or 100. A search must stop at the first budget and return `truncated: true`; the UI should say results are limited rather than implying completeness.

For 500-file Games it is straightforward; 5,000-file Games remain acceptable with a bounded scan; 50,000-file or generated/node_modules-heavy Games should terminate at the budget because blocked directories are skipped. Do not index, watch, or persist a search database in V1. A future indexed search can be considered only after measured usage demonstrates that bounded traversal is inadequate.

## 9. SEARCH REQUEST BEHAVIOR

Use a debounced hybrid: update the query field immediately, issue search after roughly 250–350 ms of inactivity, and also search on Enter. Do not issue a Stadium walk on every keystroke. Carry a client request-generation token containing Game ID and query; only the newest generation may update results. AbortController is optional and should not be required unless the transport already supports cancellation.

## 10. BROWSE GAME SEARCH UX

Put `[ Search files & folders… ]` at the top of the existing mobile sheet/desktop modal. While a query is nonempty, temporarily replace directory rows with result rows; show each result's full Game-relative path beneath its name. Clearing the query restores the exact prior directory and scroll position where practical. Folder results remain openable; file results remain selectable.

Each result gets the same visible `⋯` affordance and contextual action menu as normal browse rows. `Open containing folder` is useful and cheap: derive the parent relative path, then call the existing lazy browse operation. Search should remain whole-Game scoped, while the prior current-directory context remains available when the query is cleared.

## 11. RESULT ACTIONS

Search has no new action architecture. It supplies the same result object to the context-aware provider:

- OUTGOING: Insert path into Play, Copy Game-relative path, Copy absolute path.
- SETTINGS_REPORTS: Use as Reports folder, Copy relative, Copy absolute; folder-only eligibility.
- SETTINGS_SOP: Use as SOP folder, Copy relative, Copy absolute; folder-only eligibility.
- COACH_REFERENCES: Add as Coach Reference, Copy relative, Copy absolute.
- GENERIC: Copy relative, Copy absolute.

File/folder eligibility is a context policy over the same result shape, not a second Search action system.

## 12. OPEN CONTAINING FOLDER

Include in V1 as a low-cost action. For `src/server.ts`, compute `src` from the relative path and call the existing `browseSources(root, 'src')`; no new filesystem capability is required. For a root-level result, containing folder is the root. If a parent is blocked or stale, return the same browse error and keep the search result visible.

## 13. RESULT RANKING

Use deterministic ranking only:

1. exact case-insensitive filename;
2. filename starts with the query;
3. filename contains all query tokens;
4. relative path contains all query tokens;
5. folders before files, then shorter relative path, then case-insensitive alphabetical path.

No AI or semantic ranking. Ranking is presentation only; every result remains a real validated entry.

## 14. API / RPC SEAM

A neutral Stadium RPC such as `routine.sources.search` or `game.files.search` is sufficient. It should accept `gameId` and `query` (plus optional bounded limit), enforce exact Game identity in Stadium, and return `gameId`, normalized query, `results: BrowseSourceEntry[]`, and `truncated`/scan metadata. Control Plane should proxy/authorize the request but must not walk the filesystem itself. The response must never include a different Game's results or an unvalidated absolute root.

## 15. STALE REQUESTS / CANCELLATION

The minimum safe mechanism is a UI generation counter: increment for every query/Game change, capture `{generation, gameId, query}`, and discard any response that does not match the latest tuple. This solves `rep`/`report`/`reports` races without requiring Stadium cancellation. Transport cancellation is an optimization, not a correctness requirement.

## 16. CONTENT SEARCH — DEFER OR INCLUDE

Defer full-text search. Current safe walkers are metadata-only by design and never read file contents. VS Code `workspace.findTextInFiles` or an external index could support a future content-search feature, but it raises size, binary, encoding, secret-disclosure, and performance questions. V1 should search filename, folder name, and relative path only.

## 17. SETTINGS INTEGRATION

Settings Browse/Change can use the same search request and action-provider. The Settings context simply filters selectable results to `kind === 'folder'` and validates the chosen relative path through the Stadium before persistence. There is no need for a Reports-specific or SOP-specific search implementation.

## 18. OUTGOING + PATH INTEGRATION

The intended phone flow works without a dispatch API change: Outgoing `+ PATH` opens the neutral browser, Search returns `src/server.ts`, and Insert Path uses the already proposed client-side textarea insertion with the Game-relative `path`. Route/model/effort selections remain untouched; only the prompt text changes. The new work is browser/search RPC plumbing, not dispatch semantics.

## 19. REQUIRED TEST SURFACE

Future tests should cover exact filename, folder matches, case-insensitive and path-segment matching, file/folder typing, empty/no-result states, exact Game isolation, offline/unavailable Games, blocked names, traversal, symlink/junction escapes, inaccessible entries, entry/result caps, truncation, stale response suppression, search clearing, Open containing folder, Outgoing relative-path insertion, and Settings folder-only eligibility. Include generated-heavy and large-tree budget tests. Verify that a second connected Stadium or sibling Game can never satisfy a search for the first Game.

## 20. RECOMMENDED V1

One neutral Browse Game surface gains a debounced Search field. Search runs in the selected Game's Stadium using the generalized `suggestSources()` bounded walk, shared safety helpers, case-insensitive token/substring matching, deterministic ranking, a 50–100 result cap, and a truncation indicator. Results show name, kind, and full Game-relative path; folders open; `⋯` exposes the same contextual actions; Open containing folder reuses lazy browse. A request generation token suppresses stale responses. Content search, indexing, fuzzy matching, parent-root/Dev Mode scope, and remote Explorer behavior are deferred.

## 21. COMPLEXITY VERDICT

**SMALL.** Pure reuse: Game-root binding, RPC exact-Game checks, `BrowseSourceEntry`, blocklists, traversal validation, realpath containment, and action-provider results. Generalization: extract/adapt the safe recursive walk from `suggestSources()` and replace heuristics with matching/ranking. New code: one bounded search RPC, client debounce/stale suppression, and result rendering. No index, new authority model, or dispatch API is required.

## 22. EXACT SOURCE FILES / FUNCTIONS OPUS SHOULD READ

- `src/routine-sources.ts`: `BrowseSourceEntry`, `isBlockedSegment`, `isBlockedFile`, `validateRelativeSourcePath`, `isPathInsideRoot`, `checkAncestorSymlinkEscape`, `browseSources`, `suggestSources`.
- `src/stadium-client.ts`: `routine.sources.suggest`, `routine.sources.browse`, and `routine.sources.check` RPC handling plus `gameContextGetter`/root binding.
- `src/server.ts`: `scanReports`/`vscode.workspace.findFiles` as a report-specific comparison.
- `src/public/index.html`: existing browse/add-reference UI, clipboard/action patterns, and future Outgoing `+ PATH` integration seam.
- `src/control-plane/daemon.ts`: exact Game selection/authoritative Stadium routing patterns.
- `src/control-plane/coach-routines.ts`: path normalization and blocked-source persistence validation.

## 23. QUESTIONS OPUS MUST DECIDE

1. Exact entry/result budgets and whether depth 3 is enough for typical Games.
2. Whether an empty query restores Browse immediately or requires an explicit clear action.
3. Whether token matching should require every token or accept any token.
4. Whether full-Game search should include hidden non-secret files omitted by the current browser.
5. Whether `Open containing folder` belongs in the first action menu or a later release.
6. Which neutral RPC name and Control Plane proxy shape best fit the existing protocol.

## 24. FINAL SCOUT VERDICT

Search should be a small extension of the existing safe Game-scoped discovery system, not a new filesystem browser. Generalize the bounded `suggestSources()` walker, retain every browse visibility restriction, return the existing metadata shape, and reuse the same actions. A bounded on-demand filename/path search is sufficient for V1 and supports the desired phone flow—rough name, exact Game-relative path, immediate insertion into Play—without exposing broader filesystem authority.
