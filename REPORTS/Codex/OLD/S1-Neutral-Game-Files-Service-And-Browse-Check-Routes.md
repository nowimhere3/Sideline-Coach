# S1 — Neutral Game Files Service + Neutral Browse/Check Routes

## 1. VERDICT

S1 is implemented and automated proof is green. Sideline now has a neutral, Stadium-owned, Game-scoped filesystem service for metadata-only Browse/Check; Coach Routines remains compatible through its existing wrappers and legacy HTTP/RPC routes. Neutral Browse exposes truthful truncation, and mixed-version Stadiums advertise/require `game.files.v1`.

No Search, Browse Game UI, `+ PATH`, absolute-path resolution, GameFilesystemContract, Bootstrap, report-root mutation, or `Reports-SLC` creation was implemented.

## 2. AUTHORITATIVE ARCHITECTURE USED

Implementation followed `REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md`, specifically Slice S1 and sections 12.1–12.3, 20, 21, 23, 24, and 29.

## 3. WORKTREE STATE / SAFETY

Branch confirmed: `q2.8-multigame-field-debug`.

The worktree was already substantially dirty. Pre-existing changes included `src/control-plane/daemon.ts`, `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, Add Game/freshness work, report moves/deletions, and unrelated UI/tests. Those changes were preserved. S1 edited only its expected source/test seams plus one precisely scoped breadcrumb line and this report. No reset, restore, stash, clean, commit, or push was performed.

## 4. FILES CREATED

- `src/game-files.ts`
- `test/game-files.test.mjs`
- `test/game-files-wire.test.mjs`
- `REPORTS/Codex/S1-Neutral-Game-Files-Service-And-Browse-Check-Routes.md`

## 5. FILES MODIFIED

- `src/routine-sources.ts`
- `src/stadium-client.ts`
- `src/control-plane/daemon.ts` (contained pre-existing user changes before S1)
- `src/control-plane/coach-routines.ts`
- `src/control-plane/protocol.ts`
- `src/control-plane/stadium-registry.ts`
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` (contained pre-existing user changes; S1 added one scoped IS bullet)

## 6. NEUTRAL GAME FILES SERVICE

`src/game-files.ts` now owns:

- `GameFileEntry`
- `GamePathState`
- `browseGameDirectory()` returning `{ dir, entries, truncated }`
- `checkGamePaths()`
- Game-root-relative validation
- blocked segment/file/path policy
- lexical root containment
- realpath containment
- ancestor symlink/junction escape detection
- bounded Browse scanning (1,000 raw entries; 200 returned entries)

Browse sorts folders before files, then case-insensitively by name. It exposes metadata only and reports `truncated: true` when either the raw scan or visible result cap is reached.

## 7. COACH ROUTINES COMPATIBILITY

`src/routine-sources.ts` retains `suggestSources()` and its documentation heuristics. Its public `browseSources()` and `checkSources()` now delegate to the neutral Game Files service. The compatibility Browse wrapper intentionally returns the legacy `{ dir, entries }` shape without adding a new field.

`RoutineSourceState` in `src/control-plane/coach-routines.ts` is now a type alias of neutral `GamePathState`, removing the Stadium filesystem module's dependency on Control Plane Coach Routines.

All existing `/api/routines/sources/{suggest,browse,check}` and `routine.sources.*` RPCs remain present and green.

## 8. EXACT-GAME RPC / HTTP ROUTES

Added Stadium RPCs:

- `game.files.browse { gameId, dir? }`
- `game.files.check { gameId, paths }`

Added Control Plane HTTP routes:

- `GET /api/games/files/browse?gameId&dir`
- `POST /api/games/files/check`

`StadiumClient.withExactGame()` validates the requested `gameId` against the Stadium's own Game before resolving the root from its authoritative binding. `ControlPlaneDaemon.proxyExactGameRpc()` validates known Game, authoritative connected Stadium, feature support, and echoed response `gameId`, then reshapes metadata before HTTP egress. The Control Plane never receives or accepts a filesystem root and never walks the Game filesystem.

## 9. SECURITY / CONTAINMENT PRESERVED

Neutral Browse/Check reject traversal, absolute/drive/UNC paths, blocked locations/files, and realpath escapes. `.git`, `node_modules`, `.sideline`, `secrets`, `credentials*`, `.env*`, `*.pem`, `*.key`, `*.pfx`, `id_rsa*`, `token`, and `.token` remain undiscoverable. Inaccessible/stale entries are skipped or reported truthfully; file content is never returned.

Player execution authority was not changed.

## 10. FEATURE CAPABILITY / VERSION SKEW

Stadium hello now advertises `features: ['game.files.v1']`. The Control Plane stores the feature list on the exact Stadium session and projects it on connected Game items. Neutral routes return `409` with `status: 'unsupported'` when a connected Stadium lacks the feature; they do not guess or fall through to legacy RPCs.

## 11. TESTS ADDED / CHANGED

New `test/game-files.test.mjs` covers FS-1 through FS-8: ordering, path rejection, symlink/junction escape, blocked entries, missing/inaccessible truth, raw/result truncation, metadata-only responses, and Coach Routine wrapper equivalence.

New `test/game-files-wire.test.mjs` covers WI-1, WI-3, WI-4, WI-5, WI-6, and WI-7: authoritative routing, Stadium mismatch rejection before filesystem access, wrong-Game response rejection, offline behavior, legacy route survival, and unsupported older Stadium behavior.

No existing test was weakened or deleted.

## 12. TARGETED TEST RESULTS

Command:

`node --test test/game-files.test.mjs test/game-files-wire.test.mjs test/coach-routine-sources.test.mjs`

Result: **41 tests passed, 0 failed, 0 skipped**.

Typecheck/compile:

- `npm.cmd run check` — passed.
- `npm.cmd run compile` — passed.

## 13. FULL SUITE RESULT

Command: `npm.cmd test`

Result: **725 tests passed, 0 failed, 0 skipped**.

`git diff --check` passed. Its output contained only existing Windows LF→CRLF notices, not whitespace errors.

## 14. RUNTIME PROOF

Machine-observable in-process/real-wire tests passed through an actual Control Plane daemon and Stadium client.

The live Control Plane at port 3100 reported selected/connected Game:

- Game: `Ai Usage - Real Time`
- Game ID: `game_git_3b85b965`
- State: Connected

The currently loaded live process predates S1: its status exposes no `game.files.v1`, and `/api/games/files/browse` returns 404. Therefore the new neutral live endpoint could not truthfully be claimed active without restarting/reloading the running product.

The live legacy endpoint was machine-proved against that exact Game root: `/api/routines/sources/browse` returned HTTP 200, exact `gameId`, root-relative metadata, and four entries including `Onboarding-SOP/`, `Reports/`, `.gitattributes`, and `README.md`. A requested `dir=src` truthfully returned `Directory not found: src` because that selected Game has no `src` folder.

## 15. HUMAN FIELD PROOF — NOT YET / PENDING

Not claimed. After a fresh Control Plane restart and Stadium reload, re-run neutral Browse against the selected connected Game and compare it with the legacy route. UI/phone proof belongs to later slices.

## 16. BREADCRUMB CHANGE

Added one S1-only IS statement under the existing P0.2 architecture amendment: neutral exact-Game Browse/Check exists, Coach Routines is a compatibility consumer, and all later Search/UI/Bootstrap/report-root work remains unimplemented.

## 17. KNOWN CONSTRAINTS

- The running live environment must reload before `game.files.v1` and neutral endpoints are available.
- V1 remains bound to the current Game's first workspace root, matching existing architecture.
- Browse has no pagination; it truthfully reports truncation.
- Check remains capped at 20 paths.
- Legacy Coach Routine Browse does not expose truncation because its response shape is preserved.
- Search and absolute-path resolution are intentionally absent.

## 18. EXACT NEXT SLICE

S2 from the Opus architecture: bounded Game-scoped filename/folder Search RPC + HTTP route over the neutral Game Files service. S2 was not started.
