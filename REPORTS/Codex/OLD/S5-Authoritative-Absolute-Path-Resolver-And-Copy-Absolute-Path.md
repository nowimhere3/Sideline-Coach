# S5 — Authoritative Absolute Path Resolver And Copy Absolute Path

## 1. VERDICT

S5 is implemented and automated proof is green. Absolute paths are resolved only by the exact Game's authoritative Stadium, disclosed only after the human opens a path action surface, and copied through the existing clipboard plumbing. Browse/Search rows and Play insertion remain Game-relative.

Human phone/desktop field proof remains pending and is not claimed.

## 2. ARCHITECTURE USED

Implementation follows Section 19 and Slice S5 of `REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md`:

- Stadium RPC: `game.files.resolveAbsolute { gameId, path }`.
- Control Plane HTTP: `POST /api/games/files/absolute-path`.
- `game.files.v1` remains the additive feature family.
- Copy Absolute Path prefetches when the existing action surface opens, keeping the later clipboard write inside a direct user gesture.
- The returned coordinate is the contained lexical path a human sees in that Stadium's editor/terminal, not the target realpath.

## 3. WORKTREE SAFETY

The expected branch `q2.8-multigame-field-debug` was confirmed. The worktree already contained substantial active modified, deleted, and untracked work, including S1–S4. All unrelated work was preserved. No reset, restore, stash, clean, branch switch, commit, push, report rename, or architecture rewrite was performed.

## 4. FILES CREATED

- `REPORTS/Codex/S5-Authoritative-Absolute-Path-Resolver-And-Copy-Absolute-Path.md` — this report.

## 5. FILES MODIFIED

- `src/game-files.ts` — pure authoritative absolute resolver and shared malformed-path validation.
- `src/control-plane/protocol.ts` — resolver RPC parameter/result types.
- `src/stadium-client.ts` — exact-Game resolver RPC and Stadium environment projection.
- `src/control-plane/daemon.ts` — authenticated exact-Game HTTP proxy and response shaping.
- `src/extension.ts` — supplies the Stadium's actual workspace scheme and VS Code remote name.
- `src/public/index.html` — shared prefetched Copy Absolute Path action.
- `test/game-files.test.mjs` — resolver/security tests.
- `test/game-files-wire.test.mjs` — exact-Game RPC/HTTP/proxy tests.
- `test/browse-game-path-actions.test.mjs` — Browse/Search action, clipboard, skew, isolation, and no-leakage tests.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — proven S5 truth.

These files already included active prerequisite work; only bounded S5 additions were made.

## 6. ABSOLUTE PATH AUTHORITY CONTRACT

The authority chain is:

```text
Browser → Control Plane → exact Game's authoritative Stadium
        → shared Game Files validation/containment
        → Stadium-native lexical absolute path
```

The browser sends only `gameId` and a Game-relative path. It never reads or joins `rootFsPath`. The Control Plane never receives a caller-supplied root and never performs a filesystem join. The absolute coordinate exists only in the resolver response/action closure and clipboard operation.

## 7. STADIUM RESOLVER

`resolveAbsoluteGamePath` supports files, folders, normalized separators, and `.` for Game root. It reuses the neutral path validator, blocklist, `checkGamePaths`, realpath containment, and lexical containment helpers.

After the target is proven to be a visible file/folder, the resolver returns `path.resolve(rootFsPath, ...relativeSegments)` using the Stadium process's native path implementation. Realpath is not returned because Opus specifies the lexical editor/terminal coordinate.

The Stadium receives `workspaceScheme`, `remoteName`, and `process.platform`. It returns `pathStyle`, local/remote environment, and a bounded friendly remote label when relevant.

## 8. CONTROL PLANE PROXY

The Control Plane:

- validates request shape;
- normalizes relative-path correlation text only;
- selects the exact authoritative session through the existing proxy helper;
- requires `game.files.v1`;
- sends only `{ gameId, path }`;
- verifies echoed `gameId` and normalized path;
- validates the availability/result shape;
- strips injected root/content/extra metadata.

It does not join paths, inspect the filesystem, accept a root, select a sibling Game, or use a legacy fallback.

## 9. FEATURE / VERSION-SKEW CONTRACT

Absolute resolution is additive under the architecture's existing `game.files.v1` feature family.

- A Stadium without `game.files.v1` receives the existing truthful HTTP 409 `unsupported` result.
- An intermediate Stadium advertising `game.files.v1` but lacking the new RPC returns an RPC failure; the action becomes disabled as “unavailable right now.”
- The browser never fabricates a fallback coordinate.

## 10. SECURITY / CONTAINMENT

Automated proof covers traversal, POSIX absolute input, Windows drive paths, UNC paths, malformed control characters, blocked directories, blocked files, missing targets, invalid/inaccessible target structure, symlink/junction escape, virtual workspaces, and wrong-Game requests.

Blocked, missing, unknown, escaped, and virtual paths return no `absolutePath`. Exact Game identity is checked by the Stadium before the resolver seam or filesystem helper can run.

## 11. BROWSE ACTION INTEGRATION

`Copy absolute path` is added to the existing OUTGOING and GENERIC action providers after Copy Game-relative path. No second menu or entry model exists.

Opening an action surface starts one ephemeral resolver prefetch. The action displays `resolving…` disabled, then enables only after a correlated available result. Browse directory state and prompt/routing state are not mutated.

The resolver supports `.` for Game root. The current S3/S4 UI hides its current-folder action button at Game root, so S5 does not introduce a new root UI affordance; non-root directory header actions and item actions use the shared resolver.

## 12. SEARCH ACTION INTEGRATION

Search rows use the same provider, `copyAbsolutePathAction`, endpoint, prefetch, and clipboard path as Browse rows. There is no Search-specific resolver logic.

Open containing folder and folder Open remain unchanged.

## 13. CLIPBOARD / ERROR UX

The action is disabled while resolving. On success it copies the exact returned `absolutePath` using the existing secure Clipboard API/hidden-textarea fallback and reports `✓ Absolute path copied`.

Resolver unavailability leaves the action disabled with a truthful short reason. Clipboard failure keeps Browse/action UI open and reports `Copy failed · Try again`; it never claims success. Successful copy closes Browse consistently with existing Copy Game-relative behavior.

Remote results render `Copy absolute path (on WSL/SSH/Dev Container/Remote)` with a title noting that the path is on the remote machine.

## 14. GAME-RELATIVE VS ABSOLUTE PATH INVARIANT

Game-relative paths remain the portable/default representation:

- Insert path into Play still calls the unchanged S3 helper and inserts backticked Game-relative text.
- Copy Game-relative path is unchanged.
- Browse and Search entries remain `{ name, path, kind }` only.

Copy Absolute Path is clipboard-only. Tests prove unchanged prompt payload, AUTO/MANUAL mode, Player, model, effort, staged route, Browse directory, and Search query.

## 15. REMOTE ENVIRONMENT SEMANTICS

The copied path is authoritative inside the Stadium environment:

- local Windows returns a Windows-native path;
- local macOS/Linux returns a POSIX-native path;
- WSL, Remote SSH, and Dev Containers return the remote-native path meaningful to Players/terminals there;
- virtual/non-file workspaces report unavailable.

No conversion is based on the browser or phone platform.

## 16. NO-DISCLOSURE / NO-LEAKAGE PROOF

Absolute paths are not added to Browse responses, Search responses, status, reports, browser rows, controller result state, or persistent contracts. No resolver call occurs merely by opening Browse/Search or rendering rows. Disclosure begins only when the human opens the `⋯` action surface for one item/current non-root folder.

The Control Plane response shaper discards injected `rootFsPath`, content, and unrelated fields.

## 17. OUT-OF-SCOPE CONFIRMATION

S5 did not add parent navigation above Game root, drive/Documents/sibling browsing, arbitrary absolute input, Go to path, whole-machine access, Player authority, Bootstrap, GameFilesystemContract, Reports-SLC, Reports/SOP Settings, report lanes, watcher migration, multi-select, or S6 work.

The existing `WILL BE / V2 / PROPOSED` multi-select breadcrumb remains unchanged and unimplemented.

## 18. TESTS ADDED

New coverage proves:

- file, folder, normalized, root, native-style, local, and remote resolution;
- all required rejection/containment classes with no coordinate disclosure;
- exact authoritative Stadium routing and wrong-Game rejection before filesystem access;
- offline/unsupported behavior, wrong echoed Game/path rejection, sibling-Game isolation, and no caller root;
- metadata-only response shaping;
- Browse and Search shared action presence and prefetch;
- pending/unavailable/remote labels;
- exact clipboard value, success toast, resolver failure, and clipboard failure;
- prompt/routing/Browse/Search isolation;
- no absolute data in normal rows or result state.

No existing test was weakened.

## 19. TARGETED TEST RESULTS

Commands:

```text
npm.cmd run compile
node --test test/game-files.test.mjs test/game-files-search.test.mjs test/game-files-wire.test.mjs test/browse-game-path-actions.test.mjs
```

Result: **53 tests, 53 passed, 0 failed, 0 skipped, 0 cancelled**.

## 20. FULL SUITE RESULT

- `npm.cmd run check` — passed.
- `npm.cmd run compile` — passed.
- `npm.cmd test` — **767 tests, 767 passed, 0 failed, 0 skipped, 0 cancelled**.
- `git diff --check` — passed with no whitespace errors; Git emitted only existing LF/CRLF working-copy notices.

The full suite includes S1–S4, Coach Routines, routing/dispatch, multi-Game isolation, and browser responsiveness.

## 21. LIVE / MACHINE PROOF

A bounded local-machine probe against the compiled resolver returned:

```text
path: src/server.ts
available: true
absolutePath: C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\server.ts
pathStyle: windows
environment: local
```

Real daemon/Stadium wire tests also prove the RPC/HTTP authority chain. No claim is made that a separately running VS Code Stadium/page was refreshed to S5 during this implementation session.

## 22. HUMAN FIELD PROOF STATUS

**PENDING.** The human has not yet copied and pasted an S5 absolute path from a freshly compiled/reloaded phone or desktop UI. This report does not claim human field proof.

## 23. BREADCRUMB IMPACT

The central Game Files/Browse breadcrumb now records as IS only that absolute resolution is explicit, ephemeral, Stadium-authoritative, exact-Game confined, and shared by Browse/Search Copy Absolute Path. It also records that normal results and Play insertion remain Game-relative.

Parent filesystem access, Bootstrap, Reports-SLC, Settings, and multi-select were not promoted to IS.

## 24. KNOWN CONSTRAINTS

- Human clipboard/path field proof is still required on fresh runtime code.
- Clipboard compatibility remains the existing S3/S4 plumbing; prefetch follows the Opus mobile gesture design.
- A current-folder action is not exposed at Game root by the present S3/S4 UI, although the resolver itself supports `.`.
- An older Stadium that advertises `game.files.v1` but predates the resolver cannot advertise method-level support; it fails truthfully as unavailable rather than being fabricated.

## 25. EXACT NEXT SLICE

Per the authoritative architecture, the next filesystem slice is **S6 — GameFilesystemContract store + evidence + read-only detection**. It was not started here.
