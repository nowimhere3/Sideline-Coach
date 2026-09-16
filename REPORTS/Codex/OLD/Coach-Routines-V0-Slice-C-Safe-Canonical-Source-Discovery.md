REPORT FILE:
Coach-Routines-V0-Slice-C-Safe-Canonical-Source-Discovery.md

REPORT TIMESTAMP:
2026-09-14 11:33:25 MDT (America/Edmonton)

# Executive Summary

**COACH ROUTINES V0 SLICE C IMPLEMENTED — AUTHORITATIVE, GAME-BOUNDED CANONICAL SOURCE DISCOVERY AND VERIFICATION IS AUTOMATION-GREEN AT 590/590.**

Sideline Coach now possesses an authoritative bridge between the Coach Routine engine (Slices A+B) and the future Settings / Incoming UI (Slices D+E). 

Filesystem inspection truth is strictly owned by the Stadium / extension host where Game files exist. The Control Plane proxies requests to the exact authoritative Stadium for the requested Game and never guesses or fabricates existence. All filesystem traversal is sealed within the exact Game root; path traversal (`..`), absolute paths, Windows drive paths, UNC shares, and symlinks escaping the Game root are rejected as `blocked`. Secrets (`.git`, `node_modules`, `.env*`, `*.pem`, `*.key`, `*.pfx`, `id_rsa*`, `secrets`, `credentials*`, `.sideline`) are completely blocked and never exposed.

Zero file contents cross the RPC or Control Plane boundary: operations perform metadata and existence inspection only.

Authoritative Stadium check results safely update `RoutineSource.lastCheck` in the routine store for matching configured sources without altering play counters, cadence baselines, delivery records, or due cycles. When a Stadium is offline or disconnected, checks report `unknown` and avoid fabricating `missing` or corrupting durable check records. Routines with no usable sources continue to truthfully project `Needs files`.

# Stadium RPCs

Added three JSON-RPC methods in `src/stadium-client.ts` handled by the Stadium:

### 1. `routine.sources.suggest { gameId }`
- Evaluates deterministic heuristics against directory names and filenames within the Game root up to depth 3.
- Bounded to at most 10 candidate suggestions.
- Returns `{ success: true, gameId, suggestions: Array<{ path, kind: 'file' | 'folder', reason }> }`.
- Read-only; suggestions never alter routine configuration without deliberate human confirmation.

### 2. `routine.sources.browse { gameId, dir? }`
- Returns exactly one directory level within the Game root.
- Bounded to at most 200 entries.
- Filters out blocked files, hidden plumbing, and symlinks escaping the Game root.
- Returns `{ success: true, gameId, dir, entries: Array<{ name, path, kind: 'file' | 'folder' }> }`.
- Sorts folders first (alphabetical), then files (alphabetical).
- Never returns file contents or recursively dumps subtrees.

### 3. `routine.sources.check { gameId, paths: string[] }`
- Authoritatively checks existence and file type for Game-relative paths.
- Returns `{ success: true, gameId, checks: Array<{ path, state: 'file' | 'folder' | 'missing' | 'blocked' | 'unknown' }> }`.
- Resolves realpaths to verify symlinks remain within the Game root.
- Distinguishes legitimate missing files from blocked traversal or escaping symlinks.

All three RPCs enforce Game scoping: if `params.gameId` does not match the Stadium's bound Game identity, the Stadium immediately refuses with an error.

# Control Plane Endpoints

Added authenticated proxy routes on `ControlPlaneDaemon` (`src/control-plane/daemon.ts`):

- `GET /api/routines/sources/suggest?gameId=<exact>` (also accepts `POST`)
  - Validates exact `gameId` against known Games.
  - Proxies to the authoritative Stadium session for that Game.
  - Returns 409 if that Game's Stadium is offline/disconnected.
- `GET /api/routines/sources/browse?gameId=<exact>&dir=<path>` (also accepts `POST`)
  - Validates exact `gameId` and optional directory path.
  - Proxies to the authoritative Stadium session for that Game.
  - Returns 409 if that Game's Stadium is offline/disconnected.
- `POST /api/routines/sources/check` `{ gameId: string, paths: string[] }`
  - Validates exact `gameId` and `paths` array.
  - If the Game's Stadium is offline/disconnected: returns 200 with `{ checks: paths.map(p => ({ path: p, state: 'unknown' })), offline: true }` without fabricating `missing` and without overwriting stored check evidence.
  - If connected: proxies to authoritative Stadium, records check evidence in `CoachRoutineEngine` via `this.routines.recordSourceCheck(gameId, checks)`, and returns 200 with `{ success: true, gameId, checks, projection }`.

Cross-Game routing is strictly isolated: Game A can never browse or check Game B, and missing or unknown `gameId` parameters fail closed with 400 or 404.

# Game-Root Security Model

Implemented in `src/routine-sources.ts`:

- **Path Normalization & Traversal Rejection:**
  - Forward slash normalization (`/`).
  - Strict rejection of empty strings and whitespace.
  - Strict rejection of Windows drive paths (`C:\...`, `d:/...`).
  - Strict rejection of absolute paths (`/...`, `\...`).
  - Strict rejection of UNC shares (`\\...`, `//...`).
  - Strict rejection of `..` segments and parent traversal.
- **Symlink & Realpath Confinement:**
  - Resolves `realRoot = fs.realpath(rootFsPath)`.
  - Verifies that target `realpath` resides strictly within `realRoot` (using platform-aware path containment).
  - For nonexistent targets, inspects existing ancestor directories to ensure an ancestor symlink has not escaped the Game root. Symlink escapes return `blocked`.
- **Deny-List & Secret Protection:**
  - Segments matching `.git`, `node_modules`, `.sideline`, `secrets` are blocked.
  - Segments starting with `credentials` are blocked.
  - Files matching `.env`, `.env.*`, `.env_*`, `.env-*` are blocked.
  - Files ending with `.pem`, `.key`, `.pfx` are blocked.
  - Files starting with `id_rsa` are blocked.
  - Files named `token` or `.token` are blocked.

# Suggestion Heuristics

Deterministic heuristics in `suggestSources` scan up to depth 3 and match canonical documentation terms (case-insensitive):

1. `Docs ANCHOR` folder (`Canonical docs folder`, priority 1)
2. `North Star` files/folders (`North Star rules`, priority 2)
3. `Architecture` files/folders (`Architecture rules`, priority 3)
4. `Breadcrumbs` files/folders (`Architecture breadcrumbs`, priority 4)
5. `SOP` / `Project SOP` files/folders (`Standard operating procedures`, priority 5)
6. `Roadmap` files/folders (`Project roadmap`, priority 6)
7. `AGENTS.md` (`Agent operating guide`, priority 7)
8. `CLAUDE.md` (`Claude instructions`, priority 8)
9. `Operating Manual` files/folders (`Operating manual`, priority 9)
10. `Playbook` files/folders (`Playbook`, priority 10)
11. `README.md` (`Project README`, priority 11)

Deterministic ordering prioritizes canonical documentation anchors and North Star / SOP / Architecture documents, followed by depth, then alphabetical path. Suggestions are capped at 10 items.

# Local vs. Repository Model

Sources are identified by a single Game-root-relative path (e.g. `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`).
No parallel "local source" or "remote repository source" definitions exist in the schema. At envelope construction time, the Control Plane pairs the Game-relative path with the local folder path (if opted-in) and the remote repository locator. The human selects a canonical source once; Sideline resolves locators.

# Offline & Unknown Behavior

If a Game's Stadium is not currently connected to the Control Plane:
- Suggestions are reported as unavailable (409).
- Browsing is reported as unavailable (409).
- Path checks return `state: 'unknown'` (200 with `offline: true`).
- The Control Plane does not fabricate `missing` or `blocked` for unreachable Games.
- `RoutineSource.lastCheck` is updated only when authoritative evidence is received from a live Stadium session.
- Sources with `not-checked` or `unknown` state do not prevent a routine from functioning if otherwise valid.

# Persistence & Engine Interaction

`CoachRoutineEngine.recordSourceCheck(gameId, checks)` safely updates `RoutineSource.lastCheck`:
- Matches checked paths case-insensitively against normalized routine sources.
- Records timestamp and state: `{ at: now, state: check.state }`.
- Emits immediate store save notification.
- Does NOT alter `game.playCount` or `countedRefs`.
- Does NOT alter `routine.cadence`.
- Does NOT alter `routine.board.baselinePlayCount` or `baselineAt`.
- Does NOT alter `routine.board.lastDelivered` or `manualDue`.
- Does NOT alter `cycle` tokens.
- When all sources for a routine are authoritatively checked as `missing` or `blocked`, `view()` evaluates `hasUsableSources = false`. The routine truthfully projects `needs: 'sources'` (`Needs files — add what to reread`) and remains not due, ensuring no empty or broken envelope is manufactured.

# Tests and Validation

Created `test/coach-routine-sources.test.mjs` containing 24 focused automated proofs covering all prompt requirements:

1. `suggest finds likely canonical docs` — PASS
2. `suggest is deterministic and bounded` — PASS
3. `suggestions do not automatically alter routine configuration` — PASS
4. `browse returns one level only` — PASS
5. `browse is bounded` — PASS
6. `file is reported as file` — PASS
7. `folder is reported as folder` — PASS
8. `nonexistent source is missing` — PASS
9. `blocked path is blocked` — PASS
10. `offline/unavailable Stadium is unknown` — PASS
11. `.. traversal rejected` — PASS
12. `absolute path rejected` — PASS
13. `Windows drive path rejected` — PASS
14. `UNC path rejected` — PASS
15. `symlink escape blocked` — PASS
16. `.git blocked` — PASS
17. `node_modules blocked` — PASS
18. `secrets/credentials blocked` — PASS
19. `no file contents cross the RPC/Control Plane boundary` — PASS
20. `Game A cannot browse/check Game B` — PASS
21. `wrong/unknown Game fails safely` — PASS
22. `authoritative check updates lastCheck` — PASS
23. `check does not change cadence/delivery/count state` — PASS
24. `routine with no valid source remains Needs files` — PASS

### Test Suite Execution
```text
node --test test/coach-routines-engine.test.mjs test/coach-routines-daemon.test.mjs test/coach-routine-sources.test.mjs
✔ 49 tests passed (0 failed) in 1.005s

npm run check
✔ PASS (tsc -p ./ --noEmit)

npm run compile
✔ PASS (tsc -p ./)

npm test
✔ 590 tests passed (0 failed) in 15.303s

git diff --check
✔ PASS (no whitespace or line-ending errors)
```

# Compatibility

- Slices A+B semantics, types, and APIs remain intact and green.
- Q2.10F.4.1 execution UX, friendly labels, and work ledger remain untouched.
- No changes made to `src/public/index.html`.
- No git commit or push was executed.

# Recommended Next Play

Evaluate combining:
- **Slice D — Incoming handoff injection** (banner above Preview, Copy concatenation, delivered recording)
- **Slice E — Dadified Dev Mode Settings UI** (Settings toggle, routine sentence editor, suggestion chips, directory picker)

Now that authoritative source discovery, browsing, and verification plumbing are fully functional and tested, Slices D and E are the remaining browser-side components that complete Coach Routines V0. Combining them into one UI-focused play avoids touching `src/public/index.html` across multiple handoffs.

REPORT: Coach-Routines-V0-Slice-C-Safe-Canonical-Source-Discovery.md
TIMESTAMP: 2026-09-14 11:33:25 MDT (America/Edmonton)
