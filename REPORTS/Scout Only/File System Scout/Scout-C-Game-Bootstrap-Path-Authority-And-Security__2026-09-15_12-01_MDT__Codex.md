# SCOUT C — GAME BOOTSTRAP, PATH AUTHORITY & SECURITY

## 1. VERDICT

Sideline has a clean seam for bootstrap, but no bootstrap service exists today. Keep Game identity/adoption separate from filesystem setup. The safest design is a Game-scoped `GameFilesystemContract` owned by Control Plane for durable orchestration state, with Stadium owning all filesystem reads and mutations. Store portable Game-relative paths, preserve explicit human choices, adopt existing valid folders, and create `Reports-SLC` only when no unambiguous candidate exists. Current Player authority is provider/CLI authority, not a Game-root sandbox; browsing visibility must not be presented as write authority.

## 2. ADD GAME / BOOTSTRAP INTEGRATION SEAM

- `src/extension.ts:pickGameFolder()` opens a folder picker, calls `adoptGameFolder()`, resolves identity with `resolveGameContextSync()`, and registers through `registerGameInRegistry()`.
- `src/extension.ts:addGame()` is the command-native equivalent: picker → identity resolution → registry → selected Game/server.
- `src/control-plane/daemon.ts:handleAddGame()` (`/api/game/add`) asks a Stadium for `game.pick`; `decideAddGame()` records the opening Game and sends `game.open` with `gameId`/`folderPath`.
- `src/control-plane/stadium-registry.ts:recordKnownGameFromPicker()` and `recordKnownGame()` register known roots and connection metadata. No post-adoption initialization hook currently exists.
- `src/stadium-client.ts:announceGameAndState()` sends `game.connected` plus root, roster, capabilities, discovery, and reports snapshots.

The smallest safe seam is after identity has been resolved and the Game has connected—Stadium activation/`announceGameAndState()` or an explicit Control Plane request to that Stadium. Do not call bootstrap from `resolveGameContextSync()` or `adoptGameFolder()`: identity must remain marker/repository based, while bootstrap is a separate, retryable contract.

## 3. CURRENT GAME-SCOPED PERSISTENCE OPTIONS

- `src/game-identity.ts` stores `GameRecord` and registry state in VS Code `globalState` (`sidelineCoach.gameRegistry.v1`, selected Game keys). This is profile/window state, not a shared multi-Stadium authority, and is not suitable as the sole canonical path store.
- `src/control-plane/stadium-registry.ts` keeps connected sessions and `KnownGameRecord` in memory. It has `knownRootFsPaths`, but no bootstrap/path fields and no durable registry record by itself.
- `src/control-plane/daemon.ts` persists selected/daemon state and the work ledger under the Control Plane data directory, using atomic JSON patterns. This is the right durability pattern for a separate Game-keyed filesystem-contract record.
- `.sideline/game.json` is written atomically by `src/game-adoption.ts` and is identity/marker state. Do not casually add mutable product settings there.
- `src/control-plane/coach-routines.ts:fileCoachRoutineStore()` is durable, atomic, and Game-related, but intentionally stores routines, not filesystem authority.
- `src/workspace-state-binding-store.ts` is workspace-local binding state and is not appropriate for settings shared by multiple Stadiums.

Recommended owner: an atomic Control Plane record keyed by stable `gameId`, containing schema/version, relative `reportsRoot`/`sopRoot`, provenance, timestamps, and last error. It survives daemon replacement and can be projected to every Stadium. Relative paths survive a Game folder move; absolute paths and `knownRootFsPaths` remain discovery hints only.

## 4. REPORTS ROOT DETECTION / ADOPTION CONTRACT

Candidate names are `Reports-SLC`, `Reports`, and legacy `Docs REPORT`, but names alone are insufficient. Stadium should validate that a candidate is a directory, is inside the current Game realpath, is accessible, and is not a symlink/junction escape.

Contract:

1. An explicit human-selected `reportsRoot` wins.
2. With no explicit value, detect recognized candidates inside the Game only.
3. Adopt one candidate when evidence is unambiguous.
4. If multiple meaningful candidates exist, return `unknown/needs choice`; never silently rename, merge, or prefer a newer name over a working legacy root.
5. A recognized name that is a file, inaccessible, or outside the Game is not adoptable and must produce attention/diagnostic state.
6. If no candidate exists and the Game root is writable, create `Reports-SLC` through Stadium; creation is idempotent and never overwrites a file.

An empty-versus-nonempty tie-break may be made deterministic only if product explicitly accepts that policy; human choice is safer when two roots contain reports. Existing working folders are adopted, not moved.

## 5. SOP ROOT DETECTION / ADOPTION CONTRACT

`src/routine-sources.ts:suggestSources()` uses bounded heuristics (`SOP`, `README`, `Operating Manual`, `Docs ANCHOR`, etc.) to suggest documentation. It is a candidate finder, not a canonical-settings owner. `Onboarding-SOP`, `Onboarding-Docs`, `Project SOP`, and similar names may be candidates, but the list is not exhaustive.

Use the same relative-path contract: explicit choice first; auto-adopt only one strong, valid candidate; otherwise expose `unknown` and ask the human. Do not infer canonical SOP ownership merely because a file was suggested by Coach Routines. Do not auto-create a missing human-selected SOP folder in V1.

## 6. PLAYER REPORT LANES / ROSTER INTEGRATION

Authoritative roster snapshots live in connected Stadium sessions (`StadiumRegistry.roster`, `getRosterForGame`, and `rosterSynchronized`). `src/control-plane/daemon.ts:buildStatus()` projects the roster; `rosterInstanceIds()` extracts exact instance IDs. `src/player-roster.ts` owns Player lifecycle, including allocation, controlled starts, restores, and retirement. Retirement does not delete files.

Lane creation belongs in a Stadium-side bootstrap service after authoritative roster synchronization, not in a browser projection. Ensure idempotently under the selected reports root, creating lanes only for current provider types. Recruit can create a missing lane; removal must leave historical lanes intact.

Use stable allowlisted provider keys (`Codex`, `Claude`, `AntiGravity`) rather than display labels, model names, or instance IDs. Two instances of one provider therefore share a lane; separate same-provider lanes would require a new stable identity decision.

## 7. REPORT DISCOVERY MIGRATION PATH

Current `src/server.ts:scanReportsForGame()`/`scanReports()` and ReportPublisher watcher globs remain the compatibility layer. `describeReport()` already recognizes both `Docs REPORT` and `Reports`. Eventually, a canonical Game `reportsRoot` should generate effective watcher/scanner globs, while explicit `coach.reportGlobs` remains an advanced/backward-compatible override for legacy/custom layouts.

Changing a canonical root must rebuild watchers and immediately rescan/republish. If a selected root disappears, mark the contract `needs attention`; do not silently create a replacement or switch roots. Preserve historical reports and existing custom globs.

## 8. BOOTSTRAP STATE OWNERSHIP

Do not turn `.sideline/game.json` into a mixed identity/settings document. Add a separately versioned GameFilesystemContract/GameBootstrapState record under the Control Plane durable state area, keyed by `gameId`. Stadium owns evidence and mutation; Control Plane owns orchestration, persistence, and status projection. Include `schemaVersion`, relative roots, provenance (`auto`, `adopted`, `human`), and diagnostic timestamps/errors.

## 9. VISIBILITY VS PLAYER AUTHORITY

Coach browse safety in `src/routine-sources.ts` is metadata visibility: root confinement, traversal rejection, and symlink/junction escape protection. It grants no Player write capability.

Player processes are launched with Game-root cwd (`src/player-roster.ts` terminal and controlled starts; `src/player-control/structured-print.ts` ProcessRunner). Authority flags are provider-specific (`src/player-control/contract.ts`, structured-print controls): AcceptEdits/full-autonomy and Codex `dangerFullAccess` can permit broader filesystem access. There is no OS-level Game-root sandbox in current code. The field observation of access to a sibling development folder is therefore consistent with current authority modes.

Sideline can truthfully guarantee Game routing, cwd/request identity, and selected authority mode—not confinement of a full-autonomy provider to the Game root. Browse and Copy Path must never imply execution authority.

## 10. AUTHORIZED DEVELOPMENT ROOTS

No trusted-parent/development-root model exists today. `knownRootFsPaths` records roots previously associated with a Game; it is not a parent authorization. Keep V1 Browse Game confined to the exact Game root. A future authorized development root must be a separate discovery permission and must not grant Player mutation authority.

## 11. ABSOLUTE PATH AUTHORITY

`games[].rootFsPath` is exposed in status, while browse entries are Game-relative. Client-side joining is simple but mishandles remote/WSL/container semantics, stale roots, separators, and path disclosure. The clean boundary is a dedicated Stadium action, requested explicitly for Copy Absolute Path: validate the current Game, resolve and realpath-check the relative path, then return an ephemeral platform-native absolute path. The browser should not treat status metadata as authority. Relative paths should remain the default for Play insertion and settings.

## 12. FILESYSTEM MUTATION AUTHORITY

Use Node filesystem APIs in Stadium, consistent with `src/game-adoption.ts` atomic marker writes and the real filesystem location. A future abstraction may wrap `vscode.workspace.fs` for virtual/remote workspaces, but it must preserve the same checks.

Mutations must be idempotent: resolve the Game root, reject traversal and realpath escapes, use recursive mkdir, verify directory type, never replace a file, and report permission/errors as retryable `unknown/needs attention`. Bootstrap is deterministic plumbing, not an AI Play.

## 13. SETTINGS OVERRIDE CONTRACT

The planned Game Setup card is in `src/public/index.html` around the Game Setup card (`983-991`), with settings open/close wiring around `3606-3617`. It should project the durable contract and provenance. Browse/Change sends `gameId` plus a Game-relative folder to Control Plane; the authoritative Stadium validates existence, containment, and accessibility before Control Plane persists it.

V1 should require an existing folder for human selection. A separate explicit create action can be considered later. A saved choice becomes authoritative after successful validation. Offline Games show saved state but disable mutation. Reports changes rebuild watchers and trigger rescan; a vanished explicit path becomes attention state rather than an automatic fallback.

## 14. MIGRATION / BACKWARD COMPATIBILITY

Adopt `Reports` and `Docs REPORT` where they already work; never rename or move them merely because `Reports-SLC` is newer. New Games use `Reports-SLC` only when no valid recognized root exists. Preserve report parsing, historical files, explicit `coach.reportGlobs`, and existing watchers during migration.

## 15. REPORT LANE NAMING

Current vocabulary is provider/playerType (`codex`, `claude`, `antigravity`, terminal), with provenance also carrying `playerInstanceId`. For the current report contract, lane names should be a fixed provider mapping with deterministic casing and no user-controlled path characters. Do not use model, field label, or instance ID as the lane key unless product explicitly chooses per-instance history.

## 16. REQUIRED PRODUCT INVARIANTS

- Game identity is separate from bootstrap state.
- Path choices are Game-scoped and portable where possible.
- Explicit human choice outranks detection.
- Unknown/needs-attention is valid; ambiguity is never guessed.
- Bootstrap and lane creation are idempotent.
- Existing content is never overwritten, renamed, or deleted for conformity.
- Existing working Reports roots are adopted.
- Stadium owns filesystem truth and mutation; Control Plane owns orchestration/persistence.
- Filesystem visibility does not imply Player mutation authority.
- Removing a Player never deletes historical report lanes.
- Incoming and Player report destinations resolve through one canonical coordinate.

## 17. RECOMMENDED IMPLEMENTATION SLICES

1. Define and persist the versioned GameFilesystemContract.
2. Add Stadium-side safe candidate detection/validation without mutation.
3. Add idempotent Reports-SLC creation only for the no-candidate case.
4. Make report scanning/watchers consume the contract while retaining explicit globs.
5. Add roster-synchronized provider-lane creation (never deletion).
6. Add Game Setup read/change validation and watcher rescan behavior.
7. Add explicit Stadium absolute-path resolution for Copy Absolute Path.
8. Expose the neutral Browse Game/Outgoing actions after the contract is stable.

## 18. RISKS / UNKNOWN

- Multiple recognized roots need a product-approved ambiguity policy.
- Remote Extension Hosts, WSL, Dev Containers, and virtual workspaces may require a `workspace.fs` adapter.
- Control Plane durable-state location and multi-daemon locking need confirmation.
- Same-provider multiple-instance lane semantics are currently undefined.
- Full-autonomy provider sandbox guarantees cannot be claimed without a separate authority architecture.
- Human-selected missing-folder creation, and exact SOP candidate names, remain product decisions.

## 19. EXACT SOURCE FILES / FUNCTIONS OPUS SHOULD READ

- `src/extension.ts`: `pickGameFolder`, `addGame`, Stadium construction, ReportPublisher setup.
- `src/control-plane/daemon.ts`: `handleAddGame`, `decideAddGame`, `buildStatus`, `rosterInstanceIds`, game RPC routing.
- `src/control-plane/stadium-registry.ts`: `StadiumSession`, `KnownGameRecord`, `recordKnownGame`, `getGames`.
- `src/stadium-client.ts`: `announceGameAndState`, `sendHello`.
- `src/game-identity.ts`, `src/game-adoption.ts`: identity, marker, and registry persistence.
- `src/server.ts`: `scanReportsForGame`, `scanReports`, `describeReport`, legacy add/select flow.
- `src/routine-sources.ts`: `browseSources`, `suggestSources`, path safety heuristics.
- `src/player-roster.ts`, `src/player-control/contract.ts`, `src/player-control/structured-print.ts`: roster lifecycle, cwd, provider authority.
- `src/report-provenance.ts`: provider/instance report metadata.
- `src/control-plane/coach-routines.ts`, `src/workspace-state-binding-store.ts`: persistence boundaries.
- `src/public/index.html`: Game Setup card and settings shell.

## 20. QUESTIONS OPUS MUST DECIDE

1. When two recognized report roots are non-empty, must the UI always require a human choice?
2. Is a selected missing folder ever auto-created, or is creation a separate explicit action?
3. What exact SOP candidate set and evidence qualifies for auto-adoption?
4. Which Control Plane durable file/locking strategy is authoritative across daemon instances?
5. Should same-provider instances share a lane permanently?
6. What remote-environment contract supports absolute paths and which contexts should hide the action?
7. Is a future OS/provider sandbox required, or are authority-mode disclosures sufficient for V1?

## 21. FINAL SCOUT VERDICT

Implement bootstrap as a small, explicit, Stadium-executed filesystem contract coordinated and persisted by Control Plane. Keep roots relative, adopt before creating, preserve legacy report layouts, and make ambiguity visible. Treat absolute paths as an explicit Stadium-resolved capability and treat Player authority as a separate provider/security problem. This gives Opus a safe path to Reports-SLC, roster lanes, Settings, and Incoming migration without conflating identity, browsing, or execution authority.
