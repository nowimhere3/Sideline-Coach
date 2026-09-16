# S2 — Bounded Game-Scoped File And Folder Search

## 1. VERDICT

COMPLETE. Sideline now has bounded, deterministic, metadata-only file/folder Search in the neutral Stadium-owned Game Files service. Exact-Game RPC and HTTP wiring, truthful truncation, cooperative supersession, response correlation, and compatibility proof are in place. No S3 or later-slice work was implemented.

## 2. ARCHITECTURE USED

Implementation followed `REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md`, especially §12, §14, §24, §27, §28, and the S2 slice definition. S1's `game-files.ts`, `withExactGame()`, `proxyExactGameRpc()`, and `game.files.v1` contract were reused rather than creating another filesystem authority.

## 3. WORKTREE SAFETY

The expected branch `q2.8-multigame-field-debug` was retained. The repository already contained substantial unrelated modified, deleted, and untracked work. No reset, restore, stash, clean, checkout, commit, push, or unrelated rewrite was performed.

## 4. FILES CREATED

- `test/game-files-search.test.mjs` — focused S2 search behavior, security, bounds, ranking, and supersession proof.
- This implementation report.

## 5. FILES MODIFIED

- `src/game-files.ts` — neutral bounded search engine and search result/options vocabulary.
- `src/stadium-client.ts` — exact-Game Search RPC and per-Game supersession tracking.
- `src/control-plane/daemon.ts` — neutral Search HTTP route and authoritative RPC proxy shaping.
- `src/control-plane/protocol.ts` — Search RPC parameter/result types.
- `test/game-files-wire.test.mjs` — Search wire, isolation, version-skew, response-shaping, and supersession tests.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — S2-only IS statement after proof.

No Coach Routines source/UI, report configuration, bootstrap, Settings, Outgoing, Player authority, or Game identity code was changed for S2.

## 6. SEARCH SERVICE CONTRACT

`searchGameFiles(rootFsPath, query, options, isSuperseded)` performs a breadth-first walk from the authoritative Game root. It returns normalized `query`, `GameFileEntry[]` results (`name`, Game-relative `path`, `kind`), `truncated`, optional `limitReason`, `moreMatches`, and optional `superseded`. It reads filesystem metadata only and never reads or returns file contents.

Queries are trimmed, whitespace-collapsed, lowercased, slash-normalized, and bounded to 120 characters. Matching is case-insensitive substring matching with whitespace-tokenized AND semantics across filename or normalized Game-relative path. Empty, whitespace-only, and ordinary one-character queries return immediately without walking.

## 7. MATCHING / RANKING

Deterministic rank order is:

1. Exact filename or exact filename stem.
2. Filename starts with the first token and contains every token.
3. Filename contains every token.
4. Relative path contains every token.

Ties resolve folders before files, then shallower paths, then case-insensitive Game-relative path. Scores are internal and are not exposed.

## 8. BOUNDS / TRUNCATION

Defaults and hard maxima follow Opus: 20,000 scanned entries, 2,000 visited directories, depth 8, 1,500 ms, a cooperative `setImmediate` yield every 250 entries, 50 returned results by default, and 100 maximum. The retained best-candidate set is bounded to `limit × 4`, capped at 200.

Early termination returns `truncated: true` with `limitReason: entries | directories | depth | time`. Additional matches beyond the requested result count return `moreMatches: true` without falsely marking the scan truncated.

## 9. SECURITY / GAME ISOLATION

Search reuses the S1 Browse/Check visibility contract: lexical containment, root realpath containment, per-entry realpath containment, visited-real-directory protection, and the existing blocked directory/file policy. `.git`, `.sideline`, `node_modules`, secrets, credential directories/files, `.env*`, keys/certificates, tokens, inaccessible/stale entries, non-file/non-folder entries, and symlink/junction escapes do not surface.

The caller cannot supply a filesystem root. The Stadium derives it only from its own exact Game binding. A mismatched `gameId` is rejected before any search helper runs, and the Control Plane verifies the Stadium's echoed Game identity.

## 10. RPC / HTTP ROUTES

- Stadium RPC: `game.files.search { gameId, query, limit?, searchId }`.
- Control Plane HTTP: `GET /api/games/files/search?gameId=<id>&q=<query>&limit=<optional>`.

The Control Plane validates inputs, selects the exact Game's authoritative Stadium, proxies only to it, verifies echoed `gameId`, normalized query, and `searchId`, caps/shapes results back to metadata, and never walks the Game filesystem itself. Offline, unknown, unsupported, mismatched, and malformed cases fail truthfully.

## 11. FEATURE VERSIONING

Search is additive under the architecture's existing `game.files.v1` Stadium capability; no second feature flag was invented. A Stadium without `game.files.v1` returns the existing explicit unsupported response. A stale S1-only runtime that advertises the capability but lacks the new method fails as an RPC error rather than falling through to Coach Routine suggestions or another Game.

## 12. COACH ROUTINES COMPATIBILITY

`suggestSources()` remains the Coach Routines documentation heuristic. No generic Search substitution or Coach Routines UI migration occurred. All legacy Suggest/Browse/Check surfaces remained intact, and the complete existing 30-test Coach Routine filesystem suite passed in targeted and full runs.

## 13. TESTS ADDED

Search regressions cover exact file and folder matches, case-insensitive matching, Game-relative path matching, multi-token AND, backslash normalization, deterministic ranking across repeated runs, empty/short/no-result behavior, file/folder typing, metadata-only responses, blocked files/directories, symlink/junction escape, entry/directory/depth/time budgets, result caps, truthful `truncated`/`limitReason`/`moreMatches`, and cooperative supersession.

Wire regressions cover exact authoritative Stadium routing, Game/query/search correlation, injected-content stripping, wrong response rejection, two-Game isolation, offline/unsupported behavior, mismatched Stadium rejection before filesystem access, and newer-search supersession of an older walk.

## 14. TARGETED TEST RESULTS

Commands:

- `npm.cmd run check` — PASS.
- `npm.cmd run compile` — PASS.
- `node --test test/game-files-search.test.mjs test/game-files.test.mjs test/game-files-wire.test.mjs test/coach-routine-sources.test.mjs` — PASS, 54/54 tests, 0 failed, 0 skipped.

## 15. FULL SUITE RESULT

`npm.cmd test` — PASS, 738/738 tests, 0 failed, 0 skipped.

`git diff --check` — PASS; only existing line-ending conversion warnings were printed.

## 16. LIVE / RUNTIME PROOF

Automated real-wire proof passed through a real `ControlPlaneDaemon` and mocked connected Stadium sockets, including exact authoritative routing and a second connected Game that could not satisfy the first Game's search.

Live-machine proof was not possible against current S2 code without a reload/restart. Live status showed no connected SidelineCoach Game. The selected live Game was `game_git_3b85b965` (`Ai Usage - Real Time`), and its live Control Plane returned HTTP 404 for `/api/games/files/search`, proving that runtime is pre-S2/stale. No live process was restarted merely to manufacture proof.

## 17. HUMAN FIELD PROOF STATUS

NOT YET / PENDING. There is intentionally no Search UI in S2. Human phone/desktop field proof belongs after the later Browse Game/Search UI slices.

## 18. KNOWN CONSTRAINTS

- Search is on-demand and bounded; it is not indexed, fuzzy, semantic, or content-aware.
- Only names and Game-relative paths are searched.
- Ordinary one-character requests return no results; the architecture's future explicit-Enter exception remains a later UI-contract concern.
- A live Stadium/Control Plane must load the compiled S2 code before the route exists.
- The current live environment remains stale and no connected SidelineCoach Game was available for the architecture report's `daemon` field probe.

## 19. BREADCRUMB IMPACT

The architecture breadcrumb now states only the proven S2 truth: the neutral Stadium-owned Game Files service serves bounded exact-Game metadata Search, shares Browse's visibility boundary, reports incomplete scans, and supersedes older searches. It does not claim Browse Game UI, `+ PATH`, absolute paths, filesystem contracts, Bootstrap, or `Reports-SLC` creation.

## 20. EXACT NEXT SLICE

S3 — Browse Game sheet + contextual action providers + Outgoing `+ PATH`, exactly as sequenced by the authoritative Opus architecture. Search UI integration remains S4. This implementation stops at S2.
