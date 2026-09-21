REPORT TYPE: ARCHITECTURE SYNTHESIS (no product implementation)
AGENT: Claude Code · Claude Opus 5 · High
ROLE: Principal Architect
BRANCH: `q2.8-multigame-field-debug`
WINDOW: 2026-09-15 ~12:45–13:15 MDT (America/Edmonton)
INPUTS: `REPORTS/Scout Only/File System Scout/` — Scouts A, B, C, E (Scout D deliberately not read)
PRIOR CONTRACTS HONORED: `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` §"P0.2 / V1 Foundation — Automatic Game Bootstrap" (WILL BE); `REPORTS/Claude/1.1-Opus-Add-Game-Final-Adoption-And-Launch-Contract.md` §13 (Bootstrap boundary); `REPORTS/Codex/5-5-5-Fix-Report-Path-Contract.md` (current report globs)

# Opus — Game Filesystem, Browse, Search & Bootstrap Architecture

## 0. HEAD COACH ARCHITECT DECISIONS (2026-09-15, final)

These decisions close the open questions from the first draft. They are frozen for implementation.

1. **Empty roster: YES, create the root.**
   - Bootstrap creates the canonical `Reports-SLC/` root when §7.3 reaches ENSURE_ROOT, **even if the Game has zero Players**.
   - Bootstrap creates **no** Player/provider child folders.
   - A lane is created idempotently only when its provider joins or synchronizes with that Game's roster:

     ```
     initial bootstrap:     Reports-SLC/
     Codex recruited:       Reports-SLC/Codex/
     Claude recruited:      Reports-SLC/Codex/  Reports-SLC/Claude/
     ```
   - Retiring or removing a Player never deletes its lane or any report.
   - Reflected in §8, §10.2, §24 (S8), §25 and §27.
2. **Phone clipboard: UNCONFIRMED, and it does not block anything.**
   - Implementation uses the existing `copyText()` plumbing (secure-context Clipboard API, then the hidden-textarea fallback), plus the §15.3 prefetch for Copy absolute path.
   - No redesign around this uncertainty.
   - Copy Relative Path and Copy Absolute Path are explicit steps in the phone field proof (§25).
   - If field proof fails, it is logged as a **bounded clipboard/connection compatibility defect**, fixed in its own small Play. The architecture stays as is.
   - Reflected in §15.3, §25 and §27.
3. **Source findings preserved as binding implementation requirements:**
   - **`server.ts:describeReport()` must be updated** so the Incoming agent resolves from the canonical reports root (`Reports-SLC/<Lane>/…` or a human-chosen root) before the legacy `Docs REPORT`/`Reports` rule. Otherwise canonical reports show as "Unknown Agent". See §1.7, §11.3, S7, IN-1.
   - **`src/control-plane/router.ts` dispatch/report instruction is where the canonical destination reaches Players.** The report-provenance footer (`buildReportProvenanceInstruction`, `router.ts:282–291`) carries the Game's canonical report destination, taken from the same contract revision the Stadium watches. See §1.4, §11.4, S9, DF-1…4.

Labels used throughout:

- **[PROVEN]** — verified in current source during this Play.
- **[SCOUT]** — a Scout recommendation.
- **[DECISION]** — an architectural decision made here.
- **[UNKNOWN]** — cannot be answered from source; needs field or product evidence.

---

## 1. EXECUTIVE VERDICT

1. **Build nothing new for filesystem discovery.** The Stadium already has a safe, Game-rooted, metadata-only walker (`src/routine-sources.ts`). Take its engine out of Coach Routines into a neutral **Game Files service** (`src/game-files.ts`). Keep `routine-sources.ts` as a thin compatibility wrapper so Coach Routines keeps working unchanged.
2. **Deliver the phone loop first, bootstrap second.** `+ PATH → Browse/Search → Insert path into Play` needs no durable state and no filesystem mutation. It ships as five small slices (S1–S5) before anything touches report roots.
3. **Bootstrap = Control Plane decides and persists; Stadium observes and mutates.**
   - A new `GameFilesystemContract` record lives in `~/.sideline/game-filesystem.json`, keyed by `gameId`.
   - It is separate from Game identity and never stored in `.sideline/game.json`.
   - Stadium gathers read-only evidence, runs the few allowed `mkdir` calls, and verifies results. A pure decision function in the Control Plane decides.
4. **The report coordinate is one value with two consumers, so they cannot disagree.**
   - The contract's `reports.path` feeds the Stadium watcher/scanner through a new CP→Stadium `game.filesystem.apply` push.
   - The **same value** feeds the dispatch footer that `router.ts` already appends for Controlled Players (`buildReportProvenanceInstruction`). That footer gains a report-destination line.
   - Today Sideline never tells a Player where to write **[PROVEN]**. That missing link is the root cause of "Player writes here, Incoming scans there."
5. **Legacy globs stay, as an additive compatibility layer.** Watch set = canonical root (anchored `RelativePattern`) ∪ effective `coach.reportGlobs`. Nothing that is discovered today stops being discovered.
6. **Name correction:** the canonical Sideline-created root is **`Reports-SLC`**. This replaces `Reports-SC` in the existing P0.2 WILL-BE breadcrumb. It follows the latest human instruction and is consistent with 1.1 §13, which already listed both.
7. **Two defects the Scouts did not report; implementation must handle both:**
   - `server.ts:describeReport()` sets the Incoming agent to the folder under the first `docs report`/`reports` segment only. Any report under `Reports-SLC/…` or a human-chosen root would show as **"Unknown Agent"** **[PROVEN, server.ts:802–804]**.
   - The Control Plane → Stadium RPC timeout is **5 s** (`daemon.ts:160`). Search must enforce its own wall-clock deadline well below that, or phone searches on large Games fail as timeouts rather than returning truncated results.

---

## 2. SCOUTS INGESTED

| Scout | File | Verdict accepted? |
|---|---|---|
| A — Existing filesystem plumbing | `Scout-A-Existing-Filesystem-Discovery-Plumbing__2026-09-15_11-30_MDT__Codex.md` | **Accepted.** All cited seams verified. Absolute path: Scout A's client-join option rejected (§19). |
| B — Browser UX + path actions | `Scout-B-Filesystem-Browser-UX-And-Path-Actions__2026-09-15_11-38_MDT__Codex.md` | **Accepted, with refinements:** folder trailing slash on insert; Game-change closes the browser; absolute-path prefetch on menu open (clipboard gesture rule). |
| C — Bootstrap, authority, security | `Scout-C-Game-Bootstrap-Path-Authority-And-Security__2026-09-15_12-01_MDT__Codex.md` | **Accepted, with refinements:** a concrete ambiguity algorithm, nested report-bearing evidence, `created` versus `adopted` behavior when a root vanishes, and the dispatch footer as the coordinate link. |
| E — Search | `Scout-E-Game-File-And-Folder-Search__2026-09-15_12-29_MDT__Codex.md` | **Accepted, with changes:** a time budget sized to the 5 s RPC timeout, Stadium-side supersession, and deeper default depth. |
| D — AUTO routing metadata | exists in folder | **Not read**, per instruction. |

**Scout disagreements resolved:**

- **Absolute path** (A: client join possible; C: Stadium resolver) → Stadium resolver (§19).
- **Search depth** (E: reuse depth 3) → depth 3 is too shallow for `src/control-plane/daemon.ts`-style paths. Use depth 8, bounded by entries, directories and time (§14).
- **Selected-but-missing folder creation** (B: never; C: undecided) → never auto-create a human-selected folder. The only auto-created root is `Reports-SLC`, only through the §7 algorithm.

---

## 3. CURRENT PROVEN ARCHITECTURE

### 3.1 Filesystem discovery (Stadium) [PROVEN]

- `src/routine-sources.ts`:
  - Policy helpers: `isBlockedSegment`, `isBlockedFile`, `isBlockedRelativePath`, `validateRelativeSourcePath`, `isPathInsideRoot` (Windows case-folded), `checkAncestorSymlinkEscape`.
  - `checkSources` — returns file | folder | missing | blocked | unknown; max 20 per call.
  - `browseSources(root, dir, 200)` — one directory level; scans at most 1,000 raw entries; realpath + stat per entry; folders first; **no truncation flag**.
  - `suggestSources` — breadth-first; 1,000 entries / 100 directories / depth 3; matches against a documentation `HEURISTICS` table.
- The module imports `RoutineSourceState` from `control-plane/coach-routines`. That type coupling must be inverted during extraction.
- `src/stadium-client.ts:575–668`:
  - Three near-identical handlers, `routine.sources.{suggest,browse,check}`.
  - Each checks the exact Game (`params.gameId === gameContextGetter().game.gameId`) and uses `ctx.binding.rootFsPath`.
  - Each has an injectable override through `options.routineSources`.
- `src/control-plane/daemon.ts:888–1034`:
  - Three HTTP proxies, each repeating: `knowsRoutineGame` → `getAuthoritativeSessionForGame` → `sendRpcToStadium` → echo `gameId` check → reshape the response.
- Game root: `gameContextGetter` resolves `vscode.workspace.workspaceFolders?.[0]` (`extension.ts:153–157`). **V1 supports only the first workspace folder.**
- `package.json` has no `extensionKind`, so the extension runs in the **workspace** Extension Host. Under WSL, SSH or Dev Containers, Node `fs` addresses the remote filesystem, where the Game and its Players live. [PROVEN by manifest; not field-tested remotely]

### 3.2 Report discovery (Stadium) [PROVEN]

- Scan: `server.ts:scanReports()` runs `vscode.workspace.findFiles(glob, '**/{.git,node_modules}/**', 500)` per glob, dedupes by URI, sorts by mtime, and `scanReportsForGame(gameId, 10)` returns the newest 10 with content and provenance.
- Globs: `getReportGlobs()` returns the configured non-empty value, else `['**/Docs REPORT/**/*.{md,txt}', '**/Reports/**/*.{md,txt}']`. The manifest default is the same pair.
- Agent label: `describeReport()` takes the folder under the first `docs report`/`reports` segment (case-insensitive). **`Reports-SLC` is not recognized.**
- Watchers: `ReportPublisher` (`src/report-publisher.ts`) creates one `createFileSystemWatcher(glob)` per glob.
  - Report file events trigger a 500 ms debounced republish.
  - A `coach.reportGlobs` or `coach.maxReportBytes` configuration change rebuilds the watchers and republishes.
  - Wired in `extension.ts:196–210`.
- Explicit rescan: the `report.rescan` RPC (`stadium-client.ts:555`) calls `publishReportsChanged()`.

### 3.3 Control Plane [PROVEN]

- Durable data directory: `this.dir = SIDELINE_DIR ?? ~/.sideline` (`daemon.ts:157`).
- Existing files there:
  - `control-plane.json`
  - `control-plane-state.json`
  - `play-queue.json`
  - `coach-routines.json`
  - `work-ledger.json`
- Write pattern: temp file + `renameSync`, with quarantine to `.bak` on corruption (`coach-routines.ts:162–194`).
- Registry change events include `game-connected`, `capabilities-updated`, `reports-updated` and `session-removed` (`daemon.ts:245–267`). Roster arrives through the `roster.snapshot|changed` notifications. `isRosterSynchronizedForGame` exists.
- `buildStatus()` projects `games[]` (including `rootFsPath`) and, for the selected Game, `routines` (which is given `rootFsPath`).
- The RPC timeout is 5 s by default. Human-interaction RPCs get 15 min.
- The dispatch footer is built in `router.ts:282–291`. For Controlled, non-direct-shell Players it appends `buildReportProvenanceInstruction(...)` (`report-provenance.ts:114–122`). **It does not contain a destination.**

### 3.4 Player authority [PROVEN, from Scout C, spot-checked]

- Players launch with the Game root as cwd.
- Codex app-server validates that the provider-reported cwd equals the Game root (`codex-app-server.ts:263–265, 617`).
- No OS-level Game-root sandbox exists. Accept-edits and full-autonomy modes can reach beyond the Game root.

### 3.5 Player/provider vocabulary [PROVEN]

- `src/player-adapters.ts`:
  - `PlayerId = 'claude' | 'codex' | 'antigravity' | 'terminal'`
  - Display names: `Codex`, `Claude`, `AntiGravity`, `Terminal`
  - The module has no imports, so it is safe to import from the Control Plane.
- Roster protocol entries carry `playerType` (`control-plane/protocol.ts:220`).

### 3.6 Browser [PROVEN]

- Outgoing layout (`index.html:885–891`): `.routing-mode-bar` holds the AUTO/MANUAL group and `↻ Refresh`; `#promptInput` is at 931.
- Game Setup is a "Planned" placeholder card (`index.html:983–991`).
- `openRoutineBrowse` guards staleness only by `routineId` (`index.html:3947`). It does not check Game or directory.
- No pointer, long-press or `contextmenu` handlers exist. `copyText()` has an `execCommand` fallback.

---

## 4. PRODUCT INVARIANTS

**Scope and visibility**

- **I1 — Game-scoped visibility.** Browse, Search, Check and Resolve operate only inside the exact selected Game's realpath root, as served by that Game's authoritative Stadium. They never fall back to another Stadium, a parent folder, a sibling Game, or a drive root.
- **I2 — Visibility ≠ authority.** Seeing a path grants no Player permission. Sideline makes no claim that Players are confined to the Game root.
- **I3 — Metadata only.** Browse and Search never read file contents.

**Filesystem mutation**

- **I4 — Only these mutations exist:**
  - `mkdir` of `Reports-SLC` under the §7/§8 conditions;
  - `mkdir` of lane folders directly under a ready reports root.
  - Nothing else: no rename, delete, move, overwrite, or file write.
- **I5 — Idempotent and verified.** Every mutation is safe to repeat, never replaces a non-directory, and is re-verified with `lstat` + realpath after it runs.

**Contract and decisions**

- **I6 — Identity ≠ filesystem contract.** `.sideline/game.json` and `game-identity.ts` stay untouched by bootstrap.
- **I7 — Precedence.** Human choice > unambiguous existing root > create `Reports-SLC`. Ambiguity produces `needs-choice`, never a guess.
- **I8 — No silent re-rooting.** A configured root that disappears produces `needs-attention`. The one exception is re-creating a Sideline-created root when nothing competes with it (§7.3).
- **I9 — One coordinate.** Incoming watch scope and the Player report destination both come from the same stored `reports.path`, projected at the same revision.
- **I10 — Portable storage.** Stored paths are Game-relative, `/`-separated and case-preserving. Absolute paths are computed on demand and never persisted.
- **I11 — Retirement keeps history.** Removing or retiring a Player never deletes a lane or a report.
- **I12 — Tap ≠ mutate.** Tapping a row never edits the Play or a setting. Changes happen only through an explicit action.
- **I13 — Stale responses never render.** A Browse or Search response is applied only if it matches the current browser session, Game, directory or query, and sequence number.

---

## 5. GAMEFILESYSTEMCONTRACT DESIGN

### 5.1 Location [DECISION]

- **File:** `~/.sideline/game-filesystem.json`, next to `coach-routines.json`.
- **Owner:** the Control Plane daemon.
- **Pattern:** temp + rename, with quarantine on corruption. Copy the `fileCoachRoutineStore` pattern into a small generic `fileJsonStore`, or reuse it directly.
- **Why not the alternatives:**
  - `.sideline/game.json` is identity (1.1 §11).
  - VS Code `globalState` is per profile or window and is not shared across Stadiums.
  - `coach-routines.json` belongs to a different domain.
  - A committed file inside the Game would put machine-local decisions into the repository.
- **Multi-daemon:** the Freshness Guard already enforces one live daemon. A replacement inherits the file, like `play-queue.json`. No extra locking in V1. [Risk noted §27.]

### 5.2 Schema [DECISION]

```ts
// src/game-filesystem-contract.ts  (pure; no fs, no vscode — imported by Control Plane and tests)
export const GAME_FS_SCHEMA_VERSION = 1;

export type FolderProvenance =
  | 'none'      // never decided (or human pressed "Use automatic")
  | 'adopted'   // Sideline found one unambiguous existing folder
  | 'created'   // Sideline created it (Reports-SLC only)
  | 'detected'  // SOP only: one strong candidate auto-selected
  | 'human';    // explicitly chosen in Game Setup

export type FolderState =
  | 'unknown'          // never verified (Game offline since decision / not yet inspected)
  | 'ready'            // verified folder, inside root, not blocked
  | 'not-set'          // no value and none required (normal for SOP)
  | 'needs-choice'     // ambiguous candidates; human must pick
  | 'needs-attention'; // configured value is broken or creation failed

export type AttentionCode =
  | 'missing' | 'not-a-folder' | 'blocked' | 'escapes-game' | 'inaccessible'
  | 'name-collision' | 'create-failed' | 'multiple-case-variants';

export interface CanonicalFolder {
  path?: string;                 // Game-relative, '/'-separated, on-disk casing, never '' or '.'
  provenance: FolderProvenance;
  state: FolderState;
  candidates?: string[];         // relative paths, only when state === 'needs-choice' (max 8)
  attention?: { code: AttentionCode; detail?: string };
  decidedAt?: string;            // ISO; when path/provenance last changed
  verifiedAt?: string;           // ISO; last successful Stadium verification
}

export interface ReportLane {
  key: string;                   // canonical lane key, e.g. 'Codex'
  folder: string;                // actual on-disk name (case-preserving match), e.g. 'codex'
  state: 'ready' | 'needs-attention';
  attention?: { code: AttentionCode };
  ensuredAt?: string;
}

export interface GameFilesystemContract {
  schemaVersion: 1;
  gameId: string;
  revision: number;              // +1 on every persisted change; carried on every CP→Stadium apply
  reports: CanonicalFolder & { lanes: Record<string, ReportLane> };
  sop: CanonicalFolder;
  lastInspectedAt?: string;
}

export interface GameFilesystemStoreFile {
  schemaVersion: 1;
  games: Record<string /* gameId */, GameFilesystemContract>;
}
```

**Rules:**

- `revision` increments only when the persisted content changes. It orders every CP→Stadium apply; the Stadium ignores an apply whose revision is lower than the one it holds.
- Unknown `schemaVersion` → quarantine the file and start empty. Every value in it is re-derivable from evidence, except human choices, which are logged on quarantine.
- The contract contains no absolute path, no `.sideline` path, and no instance ID.

### 5.3 Projection [DECISION]

`buildStatus()` gains `gameSetup` for the selected Game. It carries Dad-facing strings and no plumbing:

```ts
gameSetup: {
  reports: { path?: string; label: string /* folder basename or 'Not set' */;
             provenance: 'Using existing folder' | 'Created by Sideline' | 'Chosen by you' | 'Not set';
             state: FolderState; attention?: string /* human sentence */; candidates?: string[];
             lanes: Array<{ key: string; folder: string; ready: boolean }> };
  sop:     { ...same, provenance: 'Automatically selected' | 'Chosen by you' | 'Not set' };
  canChange: boolean;            // false when Game offline / conflicted
}
```

---

## 6. STADIUM / CONTROL PLANE RESPONSIBILITY SPLIT

| Concern | Owner | Mechanism |
|---|---|---|
| Resolve Game root, realpath, containment, blocklist | **Stadium** | `game-files.ts` |
| Browse one directory | **Stadium** | `game.files.browse` |
| Search names/paths | **Stadium** | `game.files.search` |
| Check stored paths | **Stadium** | `game.files.check` |
| Compute absolute path | **Stadium** | `game.files.resolveAbsolute` |
| Gather bootstrap evidence (read-only) | **Stadium** | `game.filesystem.inspect` |
| `mkdir` root and lanes, then verify | **Stadium** | `game.filesystem.ensure` |
| Watcher scope and scanner globs | **Stadium**, from the CP-pushed contract | `game.filesystem.apply` → `ReportPublisher.rebuild()` + `publishNow` |
| Decide adoption, ambiguity, creation (pure function) | **Control Plane** | `decideReportsRoot()`, `decideSopRoot()` in `game-filesystem-contract.ts` |
| Persist contract, revision, provenance | **Control Plane** | `game-filesystem.json` |
| Choose the authoritative session; single-flight per Game | **Control Plane** | `GameFilesystemCoordinator` |
| Validate and persist human Settings choices | **Control Plane** (validation delegated to Stadium check) | `/api/games/filesystem/*` |
| Report-destination footer in Plays | **Control Plane** | `router.ts`, from the persisted contract |
| Lane key mapping | **Shared pure module** | `report-lanes.ts` |
| Browse/Search UI, action providers, clipboard, caret insert | **Browser** | `index.html` |

**Why the decision runs in the Control Plane, not the Stadium:**

- The contract must be the same for every Stadium that serves the Game.
- It must survive Stadium restarts.
- It is what the router reads when building the footer.

Putting the decision in a pure function, fed raw Stadium evidence, makes the whole algorithm unit-testable without a filesystem.

**The Control Plane never touches Game files.** It may not share the Stadium's filesystem at all (remote Extension Hosts).

---

## 7. BOOTSTRAP DETECTION / ADOPTION ALGORITHM

### 7.1 When the coordinator runs [DECISION]

`GameFilesystemCoordinator` (Control Plane) runs `reconcile(gameId)`:

- on the registry `game-connected` event;
- after a Settings change;
- on explicit `POST /api/games/filesystem/reinspect`;
- on `roster.changed` (lanes only, §10).

It runs only when all of these hold:

- `getAuthoritativeSessionForGame(gameId).status === 'connected'`, so a conflicted or offline Game is skipped and its state stays as last persisted;
- no reconcile is already running for this Game (single-flight; a request during a run sets a "rerun" flag);
- the Stadium advertises the `game.filesystem` capability. An older Stadium build is simply not bootstrapped, and legacy behavior continues.

### 7.2 Evidence (Stadium `game.filesystem.inspect`, read-only) [DECISION]

```ts
interface FilesystemEvidence {
  gameId: string;
  rootResolvable: boolean;
  // Root-level entries whose name case-insensitively equals a recognized report-root name:
  //   'Reports-SLC' | 'Reports' | 'Docs REPORT'
  reportRootEntries: Array<{
    name: string;               // on-disk casing
    recognized: 'Reports-SLC' | 'Reports' | 'Docs REPORT';
    kind: 'folder' | 'file' | 'other';
    safety: 'ok' | 'escapes-game' | 'blocked' | 'inaccessible';
    reportFiles: number;        // .md/.txt count, bounded walk (depth ≤ 3, ≤ 500 entries)
    reportFilesTruncated: boolean;
  }>;
  // Report-bearing roots discovered by the CURRENT legacy report globs that are NOT root-level
  // (e.g. 'docs/Reports'); computed from findFiles results: prefix up to and including the
  // recognized segment. Bounded by the existing 500-per-glob cap.
  nestedReportRoots: Array<{ path: string; reportFiles: number }>;
  // Per stored path the CP asks about (reports.path, sop.path, lane folders):
  checks: Array<{ path: string; state: 'file' | 'folder' | 'missing' | 'blocked' | 'unknown' }>;
  // SOP candidates: root-level folders only (see §9)
  sopRootEntries: Array<{ name: string; kind: 'folder' | 'file' | 'other'; safety: 'ok' | 'escapes-game' | 'blocked' | 'inaccessible' }>;
  // Children of reports.path when ready (for lane case matching): folder names only, ≤ 200
  reportsRootChildren?: string[];
}
```

**Why `nestedReportRoots` is included:**

- Scout C considered only root-level names.
- Suppose a Game keeps its working reports under `docs/Reports/`. Root-only detection would find nothing and create `Reports-SLC`, silently splitting new reports away from the working root.
- The legacy scanner already knows where report files live today, so that knowledge is used as evidence.

### 7.3 Decision: `decideReportsRoot(contract.reports, evidence)` [DECISION]

Terms:

- A **valid candidate** is a folder with `safety === 'ok'`.
- A candidate is **non-empty** when `reportFiles > 0 || reportFilesTruncated`.

```
A. Existing decision (provenance ∈ {human, adopted}):
     check(path) == folder            → state ready, verifiedAt = now
     check(path) == missing           → needs-attention{missing}
     check(path) == file              → needs-attention{not-a-folder}
     check(path) == blocked           → needs-attention{blocked | escapes-game}
     check(path) == unknown           → keep previous state, lastInspectedAt only
   Never re-detect. Never switch.

B. Existing decision (provenance == created, path == 'Reports-SLC'):
     folder                           → ready
     missing AND no other valid recognized root entry AND no nestedReportRoots
                                      → action ENSURE_ROOT (re-create; §8)
     missing otherwise                → needs-attention{missing}, candidates = the others
     file/other at that name          → needs-attention{name-collision}

C. No decision (provenance == none):
     V   = valid root entries (any recognized name) ∪ nestedReportRoots
     Vc  = case-variant groups: if two valid entries differ only by case (case-sensitive FS),
           mark each as a separate candidate (they are different folders)
     NE  = members of V that are non-empty

     |NE| == 1                         → adopt NE[0]          (provenance adopted)
     |NE| >  1                         → needs-choice(candidates = NE)
     |NE| == 0 and 'Reports-SLC' ∈ V   → adopt Reports-SLC    (provenance adopted)
     |NE| == 0 and |V| == 1            → adopt V[0]           (provenance adopted)
     |NE| == 0 and |V| >  1            → needs-choice(candidates = V)
     |V|  == 0:
         a root entry named Reports-SLC exists but is not a valid folder
                                       → needs-attention{name-collision} (never touch it)
         otherwise                     → action ENSURE_ROOT('Reports-SLC') → on verified success: provenance created, ready
```

**Notes:**

- Invalid recognized entries do not block an otherwise clear decision. For example, a file named `Reports` next to a valid `Docs REPORT` still gives "adopt Docs REPORT". The invalid entry is returned as a diagnostic and shown in Dev Mode only.
- **Human override:** `POST reports-root` with a validated folder sets `provenance: human` and immediately runs rule A.
- **"Use automatic":** clears the decision to `provenance: none`, then runs rule C. It never deletes anything.
- **While `needs-choice` or `needs-attention`:**
  - Incoming continues on legacy globs (§11);
  - the dispatch footer omits the destination (§11.4);
  - Settings shows the candidates as one-tap choices (§17).
  - No dispatch is blocked.

### 7.4 What counts as ambiguous [DECISION]

Ambiguous means **more than one valid, report-bearing (non-empty) candidate**, or **more than one valid empty candidate with no non-empty candidate and no `Reports-SLC`**.

**Explicitly not ambiguous:**

- one non-empty candidate plus any number of empty ones (an empty folder does not compete);
- `Reports-SLC` empty plus other empty candidates (Sideline's own name wins among empties);
- invalid entries (files, escapes) of any recognized name.

**Explicitly ambiguous even though a human might "know":**

- `Reports-SLC` non-empty **and** `Docs REPORT` non-empty. Rule C never prefers the newer name over a working legacy root, so the human chooses once. After adoption, rule A persists the choice and no re-detection happens.

---

## 8. REPORTS-SLC CREATION CONTRACT

**Trigger:** only the `ENSURE_ROOT` action from §7.3 C (no candidate) or B (a Sideline-created root vanished with no competitor). A human-selected missing folder is **never** created.

**Roster independence [§0 decision 1]:**
- Root creation does **not** wait for the roster. A connected Game with zero Players still gets `Reports-SLC/`.
- The root ensure contains exactly one op, `mkdir-root`. It never includes `mkdir-lane` ops.
- Lanes are a separate, roster-driven ensure (§10).

**Stadium `game.filesystem.ensure({ gameId, revision, ops: [{ op: 'mkdir-root', name: 'Reports-SLC' }] })`:**

1. Check the exact Game (same guard as today), then realpath the Game root.
2. Validate the name: it must be the literal `Reports-SLC`, pass `validateRelativeSourcePath`, and not be blocked.
3. `lstat(root/Reports-SLC)`:
   - it is a directory and its realpath is inside the root → `existing` (idempotent success);
   - it is a symlink or junction → realpath; if it resolves to a directory inside the root → `existing`, otherwise → `escapes-game` (never follow it for creation);
   - it is a file or other type → `name-collision`, no mutation;
   - `ENOENT` → go to step 4.
4. Also list the root's children and match the name case-insensitively. On a case-sensitive filesystem, if `reports-slc` or another case variant exists, return `multiple-case-variants` and do not create a second folder.
5. `fs.promises.mkdir(target)`, **not recursive** (the parent is the verified root):
   - `EEXIST` (race) → re-run step 3;
   - `EACCES`/`EPERM`/`EROFS` → `create-failed{inaccessible}`;
   - anything else → `create-failed`.
6. **Verify:** `lstat` shows a directory, realpath is inside the root, and it is not a symlink. Only then return `created`.
7. Return `{ results: [{ op, outcome: 'created'|'existing'|'name-collision'|'escapes-game'|'multiple-case-variants'|'create-failed', path }] }`.

**Retry:**

- `create-failed` sets `needs-attention{create-failed}`.
- The next `reconcile` (reconnect, reinspect, or Settings "Try again") retries.
- No timed retry loop.

**No files are written.** No README or `.gitkeep`. Git does not track empty folders, so a fresh clone has no `Reports-SLC` until reports are committed. Rule B handles that without drama.

---

## 9. SOP ROOT CONTRACT

**Consumers in V1:** Settings display, the SETTINGS_SOP browser context, and the Copy/Insert actions. No automation depends on `sop.path` in V1. Future consumers (Coach Routines defaults, Assistant Coach onboarding) are deferred.

**Detection (root-level folders only) [DECISION]:**

- Strong names, case-insensitive exact match: `Onboarding-SOP`, `Onboarding-Docs`, `Project SOP`, `SOP`.
- A normalization step treats `-`, `_` and space as equivalent.
- `suggestSources()` heuristics are **not** used for canonical detection. They may appear in Settings as "Suggestions", below the strong candidates, without adoption.

**Decision `decideSopRoot`:**

```
provenance human/detected with path:
    folder  → ready
    missing / file / blocked → needs-attention (never switch)
provenance none:
    exactly one valid strong candidate → detected, ready  ("Automatically selected")
    more than one                      → needs-choice(candidates)
    zero                               → not-set          (normal; NOT attention)
```

- The SOP folder is **never created**.
- `needs-choice` for SOP shows a soft prompt in Game Setup only; it never raises a banner.

---

## 10. PLAYER REPORT LANE CONTRACT

### 10.1 Lane key [DECISION]

New pure module `src/report-lanes.ts`:

```ts
export const REPORT_LANE_BY_PLAYER_TYPE: Readonly<Record<string, string>> = {
  codex: 'Codex',
  claude: 'Claude',
  antigravity: 'AntiGravity'
  // terminal: no lane (Terminal Players do not author reports)
};
export function reportLaneFor(playerType: string): string | undefined;
export const LANE_NAME = /^[A-Za-z][A-Za-z0-9-]{0,31}$/; // asserted in tests for every entry
```

- **The key is the provider/player type.** It is not the model, the display label ("Claude 2"), the instance ID, or the seat.
- Every instance of one type shares a lane. Per-instance history would require a new stable identity decision and is deferred.
- The mapping is an explicit table, not derived from `PlayerAdapter.name`. Renaming a display label must never move a lane.
- A future Player type (for example Hermes) gets a lane only by adding a row. No row means no lane.

### 10.2 Which lanes to ensure [DECISION]

- **Required set** = `{ reportLaneFor(entry.playerType) }` over the Game's **current roster entries** (On Field and Bench; not retired), from `registry.getRosterForGame(gameId)`. The roster must be synchronized (`isRosterSynchronizedForGame`).
- **No speculative lanes [§0 decision 1].**
  - An empty roster means an empty required set, so no lanes. Bootstrap never pre-creates `Codex/`, `Claude/` or `AntiGravity/` "just in case".
  - A lane for a type appears the first time that type is present in a synchronized roster for this Game.
- **Discovered-but-not-recruited** Players get no lane. This matches the P0.2 amendment: recruiting is when a Player's Game-local infrastructure is created.
- **Triggers:**
  - `reports.state` becomes `ready`;
  - `roster.changed` adds a type;
  - `game-connected` (re-ensure is cheap and idempotent).

### 10.3 Ensure semantics (Stadium `ensure` op `mkdir-lane`) [DECISION]

- **Case matching:** under `reports.path`, if any child folder matches the key case-insensitively, reuse it and record `folder` = the on-disk name. If several case variants exist, prefer an exact-case match, else the first by ordinal sort, and set `attention{multiple-case-variants}` in Dev Mode only. Do not create another.
- **Otherwise:** same steps as §8, 3–6, with the parent = verified realpath of `reports.path`. It must still be inside the Game root.
- **File-name collision** (a file called `Codex`): `needs-attention{name-collision}` for that lane only. The root stays ready.
- **Retirement or removal:** no operation. `lanes` entries are never removed from the contract. Lanes for types no longer on the roster stay on disk and in the contract, marked with no special state.
- **Root changed by the human:** lanes are ensured under the new root. Old root lanes are left alone.

---

## 11. INCOMING / REPORT DISCOVERY MIGRATION

### 11.1 Effective watch/scan set [DECISION]

```
effective = canonicalPattern ∪ legacyGlobs
canonicalPattern = reports.state === 'ready'
    ? new vscode.RelativePattern(vscode.Uri.joinPath(workspaceFolder.uri, ...reports.path.split('/')), '**/*.{md,txt}')
    : none
legacyGlobs = getReportGlobs()          // unchanged: explicit coach.reportGlobs, else the two defaults
```

- `RelativePattern` with a `Uri` base avoids glob-escaping folder names such as `Docs REPORT` or `[old] reports`. It also anchors the pattern to the Game root instead of matching any nested `Reports` folder.
- `scanReports` already dedupes by URI, so the union has no duplicates.

### 11.2 Stadium state and apply [DECISION]

- New `StadiumFilesystemContractCache` (in memory) holds `{ gameId, revision, reportsPath?, reportsReady, lanes }`.
- **CP → Stadium RPC `game.filesystem.apply({ gameId, revision, reports: { path?, state }, lanes })`.** It is sent:
  - after every persisted change;
  - after every successful reconcile on `game-connected`, including when nothing changed, so a restarted Stadium re-learns the contract.
- **Stadium handling:**
  - Check the exact Game. Ignore the apply if `revision <` the cached revision.
  - If the effective reports path changed, call `reportPublisher.rebuild()` then `publishNow('report-root-changed')`.
- `ReportWatchHost.getGlobs()` becomes `getPatterns(): Array<string | RelativePattern>`. Tests use strings; the extension host maps both types.
- **No Stadium-side persistence of the contract [DECISION].** Without a Control Plane there is no Incoming, and the legacy globs keep the Stadium correct in the meantime. A second copy would become a second truth.
- **Startup race:**
  - On connect, the Stadium publishes a snapshot using legacy globs;
  - the apply arrives within one round trip;
  - the Stadium republishes;
  - Incoming converges. A custom human root outside the legacy globs appears one publish later. Acceptable.

### 11.3 Agent label [DECISION — required fix]

`describeReport()` must determine the agent this way:

1. The path starts with the cached `reportsPath + '/'` (case-insensitive on win32) → agent = next segment, if one exists before the filename. Normalize it to the lane key when it matches a lane case-insensitively (`codex` → `Codex`).
2. Otherwise → today's legacy rule (first `docs report`/`reports` segment).
3. Otherwise → `Unknown Agent`.

`Reports-SLC` must never show as "Unknown Agent".

### 11.4 Player destination: the by-construction link [DECISION]

Extend `buildReportProvenanceInstruction` with an optional `destination?: string` (a Game-relative folder):

```
[Sideline Coach report provenance]
If this Play creates or updates a Markdown report, write it inside the folder `Reports-SLC/Claude/` in this Game unless this Play explicitly names a different location, and place the following exact HTML comment near the top of that report:
<!-- sideline-provenance: {...} -->
...
```

- `router.ts` computes `destination = contract.reports.state === 'ready' && lane(playerType)?.state === 'ready' ? `${reports.path}/${lane.folder}/` : undefined`.
- The destination comes from the **same persisted record** that produced the Stadium's canonical pattern. Watch and write therefore derive from one value at one revision.
- **"Unless this Play explicitly names a different location":** a human instruction still wins (the human is Head Coach). A human-named location under legacy `Reports/`/`Docs REPORT/` remains discovered by the legacy globs.
- **Not covered:** Terminal-transport and legacy terminal Players receive no footer today (`router.ts:284`). They rely on the Play text or the Game's SOP. Documented as a known limitation (§27).
- **Deferred:** installing or updating SOP files inside the Game (P0.2's "Sideline Report Contract" document install). Writing into human documentation is a larger mutation than `mkdir`.

### 11.5 What stays compatibility vs becomes canonical

| Item | Status after migration |
|---|---|
| `contract.reports.path` | **Canonical product state** |
| Canonical `RelativePattern` watcher | **Canonical** |
| Destination footer | **Canonical** |
| `coach.reportGlobs` explicit value | **Compatibility/advanced.** Honored additively, never rewritten. |
| Manifest default `**/Docs REPORT/**`, `**/Reports/**` | **Compatibility.** Retained in V1. Narrowing the defaults once a canonical root is ready is deferred and needs a field-proven migration Play. |
| Legacy agent rule in `describeReport` | **Compatibility**, second precedence |
| Historical reports in any legacy folder | Always discovered while the legacy globs remain |

### 11.6 Root change flow

Settings POST → Stadium validates → Control Plane persists (`revision+1`) → ensure lanes → `apply` → Stadium rebuilds watchers → `publishNow` → `reports-updated` → Incoming. The HTTP response returns after the `apply` acknowledgement, so the phone sees "Saved" only once the watchers really moved.

---

## 12. NEUTRAL GAME FILES SERVICE

### 12.1 Module layout [DECISION]

```
src/game-files.ts                // Stadium; Node fs; NO vscode import (unit-testable)
  types:  GameFileEntry { name; path; kind: 'file'|'folder' }
          GamePathState 'file'|'folder'|'missing'|'blocked'|'unknown'
  policy: isBlockedSegment, isBlockedFile, isBlockedRelativePath, validateRelativeSourcePath,
          isPathInsideRoot, checkAncestorSymlinkEscape  (moved verbatim)
  ops:    browseGameDirectory(root, dir, { maxEntries }) → { dir, entries, truncated }
          checkGamePaths(root, paths)                      → [{ path, state }]
          searchGameFiles(root, query, opts, isSuperseded) → { query, results, truncated, limitReason? }
          resolveAbsoluteGamePath(root, relPath, env)      → { available, absolutePath?, ... }
          countReportFiles(root, relDir, budget)            // bootstrap evidence
          ensureGameFolder(root, parentRel, name)            // §8 steps 3–6
src/routine-sources.ts          // compatibility wrapper: re-exports policy + browseSources/checkSources
                                // delegating to game-files; keeps suggestSources + HEURISTICS
src/game-filesystem-contract.ts // pure: schema, decideReportsRoot, decideSopRoot, projection strings
src/report-lanes.ts             // pure: lane table
src/control-plane/game-filesystem-coordinator.ts // CP: store, reconcile, single-flight, apply push
```

- `RoutineSourceState` becomes `export type RoutineSourceState = GamePathState` inside `coach-routines.ts`. This removes the Stadium → control-plane type import.

### 12.2 Visibility policy [DECISION]

- V1 Browse and Search use **exactly** the current routine-source blocklist. One policy function (`isHiddenFromCoach`) is the single place it lives.
- Non-secret dotfolders (`.github`, `.vscode`) stay visible, as today.
- Blocked entries are **hidden**, not shown disabled. Showing names such as `.env.production` or `id_rsa` is itself disclosure.
- Future work: a separate eligibility policy for Coach References may be *stricter*, but never looser than visibility.

### 12.3 RPC and HTTP [DECISION]

| Stadium RPC | CP HTTP | Notes |
|---|---|---|
| `game.files.browse {gameId, dir}` | `GET /api/games/files/browse?gameId&dir` | adds `truncated` |
| `game.files.search {gameId, query, limit?, searchId}` | `GET /api/games/files/search?gameId&q&limit` | §14 |
| `game.files.check {gameId, paths}` | `POST /api/games/files/check` | ≤ 20 |
| `game.files.resolveAbsolute {gameId, path}` | `POST /api/games/files/absolute-path` | §19 |
| `game.filesystem.inspect {gameId, paths}` | — (CP internal) | §7.2 |
| `game.filesystem.ensure {gameId, revision, ops}` | — (CP internal) | §8, §10 |
| `game.filesystem.apply {gameId, revision, reports, lanes}` | — (CP internal) | §11.2 |
| — | `GET /api/games/filesystem?gameId` | projection |
| — | `POST /api/games/filesystem/reports-root {gameId, path \| null, expectedRevision}` | `null` = use automatic |
| — | `POST /api/games/filesystem/sop-root {gameId, path \| null, expectedRevision}` | |
| — | `POST /api/games/filesystem/reinspect {gameId}` | "Try again" |

**Implementation rules:**

- `/api/routines/sources/{suggest,browse,check}` **stay** as aliases calling the same service. `routine.sources.*` RPCs stay for Stadium/daemon version skew. Removal is deferred.
- One daemon helper replaces the triplicated proxy logic: `proxyExactGameRpc(res, gameId, method, params, shape)`. It covers known Game → authoritative session → RPC → echo `gameId` → shape.
- One Stadium helper replaces the triplicated handler logic: `withExactGame(req, fn)`.
- Stadium capability advertisement: `hello`/capabilities include `features: ['game.files.v1', 'game.filesystem.v1']`. The browser hides `+ PATH` and Game Setup controls when the selected Game's Stadium lacks them, which prevents 404-style failures during version skew.

---

## 13. BROWSE GAME ARCHITECTURE

### 13.1 Controller state (browser) [DECISION]

```js
gameBrowser = {
  sessionId,            // increments on every open; responses carry it back via closure
  gameId,               // captured at open; immutable for the session
  context,              // 'OUTGOING' | 'SETTINGS_REPORTS' | 'SETTINGS_SOP' | 'COACH_REFERENCES' | 'GENERIC'
  provider,             // action provider object (§15)
  mode: 'browse' | 'search',
  dir, entries, truncated, status: 'loading'|'ready'|'error'|'offline',
  browseSeq,            // increments on every directory request
  query, results, searchTruncated, searchSeq, searchStatus,
  savedBrowse: { dir, scrollTop },   // restored when search clears
  selection: Map (only when provider.selection === 'multiple')
}
```

### 13.2 Staleness rules (I13) [DECISION]

A browse response is applied only if **all** of the following hold:

- `session === gameBrowser.sessionId`
- `gameId === gameBrowser.gameId === response.gameId`
- `seq === gameBrowser.browseSeq`
- `requestedDir === gameBrowser.dir`, where `dir` is set to the pending directory at request time

Search uses the same rule with `searchSeq` and `query`.

**Selected Game changes while the browser is open:** close the browser and toast "Switched Game — browser closed". A path from Game A must never be inserted into a Play for Game B, because Outgoing dispatches to the selected Game.

**Game goes offline while the browser is open** (status `connected: false` for `gameId`):

- set status `offline`;
- keep the rows visible, greyed out, with the banner "Game offline — reconnect to continue";
- disable every action except Close.

### 13.3 Container and navigation [SCOUT B accepted]

- **One DOM component:** a full-height sheet below 620 px, a centered modal at 620 px and above.
- **Sticky header:** "Browse Game · `<Game name>`", a Close button, the search field (§14), then the location line: "Game root" or `‹ Back` plus the relative directory. Long directory paths are middle-truncated, with the full path in `title` and `aria-label`.
- **Rows:**
  - folder rows: icon, name, `Open ›`, `⋯`;
  - file rows: icon, name, `⋯`.
  - Row body tap: on a folder it opens the folder; on a file it opens the action sheet. Tapping a file only opens the menu; nothing changes (I12).
- **Truncation:** "Showing the first 200 items — search or open a subfolder to narrow."
- **Directory header `⋯`** exposes the same actions for the current folder, which lets Settings "Use this folder" work from inside the folder. At Game root, Insert and "Use as…" are unavailable, and Copy relative yields `.`.

---

## 14. SEARCH ARCHITECTURE

### 14.1 Algorithm (Stadium `searchGameFiles`) [DECISION]

- **Walk:** breadth-first from the realpath root, reusing the `suggestSources` loop shape. It keeps:
  - blocked-segment and blocked-file skipping (the same policy as Browse, so Search can never surface a hidden entry);
  - lexical containment;
  - realpath containment for every directory before enqueuing it;
  - the visited-realpath set.
- **Allowed optimization** (search only): for a `Dirent` that is not `isSymbolicLink()`, use `dirent.isFile()`/`isDirectory()` without per-entry realpath + stat. The parent directory is already realpath-verified, so a non-link child cannot escape. Symlinks and junctions (Node reports Windows junctions as symbolic links) keep full realpath + stat. **A mandatory test covers junction and symlink escape.** If that test cannot pass on a platform, fall back to per-entry realpath.
- **Query normalization:** trim, collapse whitespace, lowercase, convert `\` to `/`, maximum 120 characters. Tokens split on whitespace.
- **Minimum query:** 2 characters total (1 is accepted when submitted with Enter).
- **Match rule:** every token appears in `name.toLowerCase()` or `path.toLowerCase()` (AND semantics). Substring only.
- **Rank tier**, lower is better:
  - 0 — exact name (`name === q`, or name without extension === q)
  - 1 — name starts with the first token and the name contains all tokens
  - 2 — name contains all tokens
  - 3 — path contains all tokens
  - then folder before file, then depth ascending, then case-insensitive path.
- **Result retention:** keep a bounded best-K array (K = `limit × 4`, maximum 200) so ranking stays correct without holding everything.
- **Output:** the top `limit` (default 50, maximum 100) as `GameFileEntry[]`. No scores are exposed.

### 14.2 Budgets (implementation constants, not product contracts) [DECISION]

| Budget | Value | Why |
|---|---|---|
| Entries scanned | 20,000 | Typical Games have fewer than 5k visible entries after blocklist |
| Directories visited | 2,000 | |
| Depth | 8 | Depth 3 misses `src/control-plane/x.ts`-class paths in nested repos |
| Wall-clock deadline | 1,500 ms | 5 s CP RPC timeout (`daemon.ts:160`) minus transport and Extension Host contention |
| Yield | `await setImmediate` every 250 entries | Keeps the Stadium Extension Host responsive (Q2.10A lesson) |
| Result limit | 50 (maximum 100) | Phone list |

**Truncation:** `truncated: true` with `limitReason: 'entries'|'directories'|'depth'|'time'` when the walk stopped early, or when any directory was skipped because of depth. Matches beyond `limit` do not set `truncated`; they set `moreMatches: true`.

**UI copy:**

- `truncated` → "Searched part of this Game — results may be incomplete. Open a folder or refine your search."
- `moreMatches` → "Showing the top 50 — refine your search."

### 14.3 Rapid typing [DECISION]

- **Browser:**
  - 300 ms debounce after the last keystroke, or immediately on Enter;
  - `searchSeq++` for every issued request;
  - a response is applied only if `seq`, `query` and `gameId` all match (I13).
- **Stadium:** each request carries `searchId`, and the Stadium keeps `latestSearchIdByGame`. An older walk checks `isSuperseded()` at each yield and returns `{ superseded: true }`. The Control Plane maps that to HTTP 200 `{ superseded: true }`, which the browser ignores. At most one live walk per Stadium; stacked walks cannot starve the Extension Host.
- No `AbortController` or transport cancellation is needed.

### 14.4 Search UX [SCOUT E accepted, refined]

- **Field:** `[ Search files & folders… ]` at the top of the sheet, `type="search"`, `enterkeyhint="search"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`.
- **Non-empty query:**
  - `mode = 'search'`; directory rows are hidden, and `savedBrowse = { dir, scrollTop }` is captured when search begins;
  - result rows show name (bold), a kind icon, and the full Game-relative path on a second line, wrapped and middle-truncated.
- **Clear** (✕ button or empty field): `mode = 'browse'`; restore `savedBrowse`. The cached `entries` render without refetching if they are still for the same directory. **No Stadium call is made to clear a search.**
- **Folder result:** `Open ›` leaves search mode and browses that folder; `savedBrowse` is replaced.
- **`Open containing folder`:** included in V1 as a result-only action. It leaves search and browses the parent (root if the result is at top level). If that browse errors, stay in search mode with the error toast.

### 14.5 Game isolation

- A search goes only through `proxyExactGameRpc` to the authoritative session for `gameId`. The Stadium re-checks the Game.
- The response's `gameId` must equal the request's `gameId`, or the Control Plane returns 502.
- No code path accepts a root, drive, or parent from the client.

---

## 15. PATH ACTION ARCHITECTURE

### 15.1 Provider interface (browser) [DECISION]

```js
/** One provider per context. The browser owns navigation, loading, focus, input adapters. */
const provider = {
  context: 'OUTGOING',
  title: 'Insert a path',                    // sheet subtitle
  selection: 'single',                       // 'multiple' only for COACH_REFERENCES
  eligible: (entry) => true,                 // e.g. Settings: entry.kind === 'folder'
  actions: (entry, where /* 'browse'|'search'|'header' */) => [
    { id: 'insert', label: 'Insert path into Play', primary: true, run: insertPathIntoPlay },
    COPY_RELATIVE, COPY_ABSOLUTE,
    ...(where === 'search' ? [OPEN_CONTAINING] : [])
  ],
  onClose: () => focusElement(promptInput)
};
```

- Shared actions are defined once: `COPY_RELATIVE`, `COPY_ABSOLUTE`, `OPEN_CONTAINING`.
- `run(entry, ctx)` returns `{ ok: true, close: boolean, toast } | { ok: false, toast }`.
- The sheet closes only on `ok && close`. Failure keeps the sheet open (Scout B).

### 15.2 Context matrix

| Context | Primary | Secondary | Eligibility | Selection | Close on success |
|---|---|---|---|---|---|
| OUTGOING | Insert path into Play | Copy relative, Copy absolute, (search) Open containing folder | file + folder, not root | single | Insert: yes. Copy: yes. |
| SETTINGS_REPORTS | Use as Reports folder | Copy relative, Copy absolute, Open containing folder | folder, not root, not blocked | single | yes, after the server confirms |
| SETTINGS_SOP | Use as SOP folder | same | folder, not root | single | yes, after the server confirms |
| COACH_REFERENCES | Add as Coach Reference (batch: "Add N selected") | Copy relative, Copy absolute | file + folder | multiple (checkbox mode preserved) | on batch add |
| GENERIC | Copy relative | Copy absolute, Open containing folder | all | single | yes |

**Ineligible entries:** files in a Settings context still get `⋯` with the Copy actions. The "Use as…" action is absent, and a one-line hint reads "Choose a folder".

### 15.3 Clipboard gesture rule [DECISION]

- Mobile Safari and Chrome require the clipboard write to happen inside a user activation. An `await fetch()` before `writeText` can lose that activation.
- Therefore **Copy absolute path prefetches**: opening the action sheet for an entry fires `resolveAbsolute` immediately.
  - The menu item shows "Copy absolute path · resolving…" (disabled) until it resolves.
  - Tapping it then copies synchronously from the cached value.
- `copyText()`'s hidden-textarea fallback also covers non-secure contexts (plain HTTP on a LAN address).
- **Status: UNCONFIRMED [§0 decision 2].**
  - Phone clipboard behavior on the real mobile/remote connection is not proven.
  - Implementation uses the existing `copyText()` plumbing unchanged, plus prefetch. No alternative clipboard design is planned.
  - The action still reports failure truthfully: the sheet stays open with "Copy failed · Try again", and success is never claimed falsely.
  - A field failure is a bounded clipboard/connection compatibility defect (§27).

---

## 16. OUTGOING + PATH

### 16.1 Placement [SCOUT B accepted]

- Inside `.routing-mode-bar`: `[AUTO|MANUAL]  [+ PATH]  [↻ Refresh]`.
- `id="insertPathBtn"`, class `secondary`, `aria-label="Browse this Game to insert a file or folder path"`.
- At phone width the bar may wrap. The mode buttons keep their minimum tap size.
- The button is disabled with a tooltip or sub-label when the selected Game is offline or its Stadium lacks `game.files.v1`.

### 16.2 Insert algorithm (`insertPathIntoPlay`) [DECISION]

```text
token = formatPlayPath(entry)
  relative path, '/' separators
  folder → trailing '/'            (e.g. `Reports-SLC/Codex/`)
  wrap in single backticks; if path contains '`', wrap in double backticks with inner spaces
start = promptInput.selectionStart, end = promptInput.selectionEnd
  if the textarea was never focused this session (selectionStart === 0 && value non-empty && no stored caret)
     → use the caret captured at the moment + PATH was pressed (stored on pointerdown/focusout)
  if still unavailable → append
before = value[start-1], after = value[end]
prefix = (start > 0 && !/\s/.test(before)) ? ' ' : ''
suffix = (end < value.length && !/\s/.test(after)) ? ' ' : (end === value.length ? ' ' : '')
promptInput.setRangeText(prefix + token + suffix, start, end, 'end')
promptInput.dispatchEvent(new Event('input', { bubbles: true }))   // existing listener → staged preview + dispatch state
close sheet → focusElement(promptInput) → caret after inserted token (setRangeText 'end' already)
toast '✓ Path inserted'
```

**Caret capture:** on a phone, tapping `+ PATH` blurs the textarea, but `selectionStart`/`selectionEnd` survive blur in all major engines. Capture them when `+ PATH` is pressed and restore before `setRangeText`. That makes insertion at the caret reliable.

**Preserved:**

- routing mode, target Player, model, effort, `currentRouteChoice`, `currentReport` context;
- the dispatch payload schema;
- `/api/dispatch` and `/api/route/preview` — unchanged.

**Why `setRangeText`:** it preserves the textarea's native undo stack better than assigning `value` in Chromium. Some engines still reset undo; acceptable.

### 16.3 Why this format

- Backticks make spaces unambiguous (`Docs REPORT/Codex/x.md`).
- `/` works for every current provider CLI on Windows.
- The trailing slash tells a Player "folder" without prose.
- A Game-relative path is correct because every Player's cwd is the Game root [PROVEN §3.4].

---

## 17. SETTINGS / GAME SETUP

### 17.1 Card (replaces the "Planned" placeholder at `index.html:983–991`) [DECISION]

```
Game Setup · <Game name>
  Reports folder
    Reports                       · Using existing folder
    Player folders: Codex ✓  Claude ✓  AntiGravity ✓
    [ Change ]
  SOP / onboarding folder
    Onboarding-SOP                · Automatically selected
    [ Change ]
```

- The card is always visible, not Dev Mode-only. Folder coordinates are Dad-facing product state.
- Lane chips are shown only when `reports.state === 'ready'`.

**State rendering:**

| state / provenance | Label line | Actions |
|---|---|---|
| ready · adopted | `<path>` · Using existing folder | Change |
| ready · created | `Reports-SLC` · Created by Sideline | Change |
| ready · detected (SOP) | `<path>` · Automatically selected | Change |
| ready · human | `<path>` · Chosen by you | Change · Use automatic |
| not-set (SOP) | Not set | Choose folder |
| needs-choice | "Sideline found more than one Reports folder. Which one do your Players use?" + one button per candidate (the relative path) | Browse… |
| needs-attention · missing | "`Reports` is missing — it may have been moved or deleted." | Choose another · Try again |
| needs-attention · not-a-folder / name-collision | "Something that isn't a folder is named `Reports-SLC`." | Choose folder · Try again |
| needs-attention · create-failed | "Sideline couldn't create `Reports-SLC` (no permission)." | Try again · Choose folder |
| unknown / Game offline | `<last path or Not set>` · "Game offline — showing last known" | all disabled |

- `.sideline`, `gameId`, revision and absolute paths are never shown.
- Invalid-candidate diagnostics and lane case variants appear in Dev Mode only.

### 17.2 Authoritative persistence flow [DECISION]

```
Browser: Use as Reports folder (entry.path)
  → POST /api/games/filesystem/reports-root { gameId, path, expectedRevision }
CP:
  1. known Game; authoritative session connected else 409 offline
  2. expectedRevision === contract.revision else 409 { conflict, projection } (another window changed it)
  3. validateRelativeSourcePath(path); not '' / '.'; not blocked            (defense in depth)
  4. RPC game.files.check { paths: [path] } → must be 'folder'              (Stadium authority)
  5. persist { path, provenance: human, state: ready, decidedAt, verifiedAt }, revision+1
  6. ensure lanes under new root (§10)                                      (failures → lane attention, not a rejection)
  7. RPC game.filesystem.apply → await ack (Stadium rebuilt watchers + publishNow)
  8. broadcastStatus(); 200 { projection }
Browser: close sheet → card shows "Chosen by you" → toast "✓ Reports folder saved"
```

- If step 7 fails after step 5 succeeded, the change stays persisted and the response is `200 { projection, warning: 'Saved — Incoming will update when the Game reconnects' }`. The next `game-connected` re-applies it.
- `path: null` means "Use automatic": persist `provenance: none`, run `reconcile`, and return the result.
- SOP uses the same flow without steps 6 and 7.

---

## 18. MOBILE / DESKTOP INTERACTION MODEL

**One operation:** `openItemActions(entry, where, anchor)`. Every input method calls it.

| Input | Behavior |
|---|---|
| `⋯` button (all devices) | Primary, always visible, 44×44 px, `aria-haspopup="true"`, `aria-expanded`, label "Actions for `<path>`" |
| Row tap: file | `openItemActions` (never mutates) |
| Row tap: folder | Open folder |
| Long-press (touch/pen) | Pointer Events; 500 ms; cancel on move > 10 px, `pointerup`, `pointercancel`, or scroll; suppress the following click; optional `navigator.vibrate(10)`. **Accelerator only.** |
| Right-click (mouse) | `contextmenu` on rows inside the sheet only; `preventDefault` there only |
| Keyboard | Row focusable; Enter = the tap behavior; Shift+F10 / ContextMenu key = actions; Escape closes the menu, then the sheet; focus returns to the invoker |

**Action sheet presentation:**

- **Mobile:** a bottom sheet inside the browser sheet, with large buttons and the primary action first.
- **Desktop:** a popover clamped to the modal.
- **Accessibility:** use a labelled list of `<button>`s (not `role="menu"`) unless roving focus is implemented properly (Scout B).

---

## 19. ABSOLUTE PATH AUTHORITY

**Decision: accept Scout C's Stadium-owned resolver, with modifications. Reject client-side joining with `games[].rootFsPath`.**

**Why client-side joining is rejected:**

- The Stadium may be remote (WSL, SSH, container). The browser cannot know the path style.
- `rootFsPath` in `games[]` can be the *last known* root of an offline Game (`stadium-registry.ts:294`), so a join could produce a stale path.
- A join cannot detect a vanished entry, a blocked entry, or a symlink escape.

**`game.files.resolveAbsolute { gameId, path }` (Stadium):**

1. Exact Game check. `path` validated; `'.'` allowed (Game root).
2. Must pass the same checks as `checkGamePaths` and return `file` or `folder`. Otherwise `{ available: false, reason: 'missing'|'blocked'|'unknown' }`.
3. `absolutePath = path.join(rootFsPath, ...rel.split('/'))`. This is the **lexical** path under the bound root, not the realpath: it is the path a human sees in their editor and terminal.
4. `workspaceFolders[0].uri.scheme !== 'file'` → `{ available: false, reason: 'virtual-workspace' }`.
5. Return `{ available: true, absolutePath, pathStyle: process.platform === 'win32' ? 'windows' : 'posix', environment: vscode.env.remoteName ? 'remote' : 'local', remoteLabel?: friendlyRemote(vscode.env.remoteName) }`. The friendly names are "WSL", "SSH", "Dev Container", or "Remote".

**Environment table:**

| Environment | Result | UI |
|---|---|---|
| Windows local | `C:\Users\…\Game\src\x.ts` | "Copy absolute path" |
| macOS/Linux local | `/Users/…/Game/src/x.ts` | same |
| WSL, SSH, Dev Container | a remote-native path, correct for Players and terminals on that host | "Copy absolute path (on WSL)", with the note "This path is on the remote machine" |
| Virtual workspace | unavailable | action shown disabled: "Not available for this Game" |
| Game offline or stale root | unavailable | disabled: "Game offline" |
| Resolver fails | unavailable | disabled; never fabricated |

**Not persisted and not included in browse or search payloads.**

**Existing disclosure:** `games[].rootFsPath` already reaches the browser. That is pre-existing and out of scope. Recommend a later review of whether `buildStatus` needs it at all.

---

## 20. SECURITY / AUTHORITY BOUNDARIES

1. **Visibility boundary:** exact-Game realpath root. Enforced in the Control Plane (authoritative session for `gameId`) **and** the Stadium (Game echo check + `game-files` containment). Two layers, as today.
2. **Secrets:** the blocklist applies identically to Browse, Search, Check, Resolve, and bootstrap names and lanes (a lane can never be named `secrets` or `.git`).
3. **Mutation boundary:** exactly two `ensure` op kinds (`mkdir-root` with the literal name `Reports-SLC`; `mkdir-lane` with a name from the lane table). The Stadium rejects any other op or name. No arbitrary client-supplied name ever reaches `mkdir`. **No HTTP endpoint exposes `ensure` directly;** it is internal to the Control Plane coordinator.
4. **Player authority:** unchanged and not claimed. The destination footer is guidance, not confinement. Settings copy must not say or imply "Players can only write here".
5. **Remote phone access:** every new HTTP route uses the existing daemon auth and origin handling, the same as `/api/routines/sources/*`.
6. **Denial of service:** search budgets and time deadline, Stadium single-flight, browser debounce, and a 20-path check cap.
7. **Path injection into Plays:** inserted tokens are relative paths returned by the Stadium, not free text. Backtick escaping prevents breaking out of the code span. Plays are human-authored anyway.
8. **Future Dev Mode broader visibility:** requires a separate explicit authorization model. Nothing in V1 accepts a root parameter, so V1 cannot be widened by accident.

---

## 21. BACKWARD COMPATIBILITY

| Existing thing | Guarantee |
|---|---|
| Coach Routines browse/suggest/check | Same routes, RPCs, shapes and tests. `routine-sources.ts` exports stay. Migration to the shared browser (S11) preserves multi-select and "Add N selected". |
| `test/coach-routine-sources.test.mjs` | Passes unchanged after S1 |
| Games with `Reports/` or `Docs REPORT/` | Adopted, never renamed or moved. Legacy globs still watch them. |
| Explicit `coach.reportGlobs` | Honored additively. Never rewritten. |
| Historical reports in non-canonical folders | Still discovered |
| Stadium on an older build | No `game.files.v1` feature → `+ PATH` and Game Setup controls disabled; no bootstrap attempted; Incoming as today |
| Control Plane on an older build | New Stadium works with legacy globs; no apply ever arrives |
| Dispatch payloads | Unchanged. Only the footer text of Controlled Plays gains one clause, and only when the contract is ready. |
| `.sideline/game.json` | Untouched |

---

## 22. EDGE CASES / UNKNOWN STATES

| Case | Behavior |
|---|---|
| Two Stadiums for the same Game (conflict) | No reconcile, no browse. Existing 409 "not connected" path. |
| Game root renamed or moved on the same machine | Relative contract still valid. Rule A verifies at the new root. |
| Same `gameId` in two clones (committed marker) | Contract applies to whichever clone is authoritative. `created` root missing in the other clone → rule B re-creates if nothing competes. |
| `Reports-SLC` exists as a file | `needs-attention{name-collision}`; nothing touched |
| `Reports` is a junction to outside the Game | Not adoptable (`escapes-game`); other candidates decide. Dev Mode diagnostic. |
| Case-sensitive filesystem with both `Reports` and `REPORTS` | Two candidates → normal ambiguity rules |
| Human chooses a folder, later deletes it | `needs-attention{missing}`. The footer drops the destination. Legacy globs continue. |
| Human chooses the Game root | Rejected (`path` cannot be `.`) |
| Human chooses a blocked folder | It cannot appear in the browser. The API rejects it anyway. |
| Roster adds Codex while reports are `needs-choice` | No lane until ready; ensured on the transition to ready |
| Lane folder deleted while the root is ready | Re-ensured on the next trigger (lanes are Sideline infrastructure, not human choices) |
| Very large directory (> 1,000 raw entries) | `truncated: true`, UI notice |
| Search during Stadium reconnect | 409 offline → sheet offline state |
| Contract file corrupt | Quarantined `.bak` + log. Detection re-derives; previous human choices are lost and logged; Settings shows the resulting state. |
| `game.filesystem.apply` lost | Next `game-connected` or change re-sends; revision ordering prevents regression |
| Stadium receives apply for a different Game | Rejected by the exact-Game guard |
| VS Code `findFiles` case behavior for `**/Reports/**` versus `REPORTS/` | **[UNKNOWN]** The canonical `RelativePattern` uses on-disk casing, so the canonical path is immune. |
| Multi-root workspace | Only `workspaceFolders[0]` is the Game (existing limit) |

---

## 23. REQUIRED TEST MATRIX

All filesystem tests use real temporary directories (`fs.mkdtemp`), following `test/coach-routine-sources.test.mjs`. Junction and symlink tests are skipped with a reason where the OS disallows them (Windows junctions need no elevation; use `fs.symlink(target, link, 'junction')`).

### Filesystem safety — `test/game-files.test.mjs`

- FS-1 Browse root lists files and folders, folders first
- FS-2 `dir` with `..`, absolute, drive, UNC → rejected
- FS-3 A junction or symlink to outside the Game is omitted from browse; browsing through it is rejected
- FS-4 `.git`, `node_modules`, `.sideline`, `secrets`, `credentials*`, `.env*`, `*.pem`, `id_rsa*`, `token` → never listed
- FS-5 Unreadable directory → error; unreadable entry → skipped
- FS-6 More than 1,000 raw entries → `truncated: true`; more than 200 visible → `truncated: true`
- FS-7 No `content`/`body`/`text` fields anywhere (extends C19)
- FS-8 `routine-sources` re-exports behave identically (C4–C19 run against both)

### Search — `test/game-files-search.test.mjs`

- SE-1 Exact file name ranks first
- SE-2 Folder name match returns `kind: 'folder'`
- SE-3 Case-insensitive
- SE-4 Multi-token AND across path (`control daemon` → `src/control-plane/daemon.ts`)
- SE-5 `\` in the query is normalized
- SE-6 Blocked entries never returned, even when matching (`env`, `secrets`)
- SE-7 Symlink/junction escape never returned; the Dirent fast path is proven safe
- SE-8 Entry budget → `truncated`, `limitReason: 'entries'`
- SE-9 Depth budget → `truncated`, `limitReason: 'depth'`
- SE-10 Deadline (injected clock) → `limitReason: 'time'`
- SE-11 Result limit → `moreMatches`, not `truncated`
- SE-12 Superseded search returns `{ superseded: true }`
- SE-13 Query shorter than 2 characters → empty with no walk
- SE-14 Deterministic order across runs

### Wire / Game isolation — `test/game-files-wire.test.mjs`

- WI-1 HTTP browse/search/check/absolute reach only the authoritative session
- WI-2 Two connected Stadiums (Game A, Game B), search for A containing B-only file names → never returned
- WI-3 Stadium rejects a mismatched `gameId`
- WI-4 Stadium response with a different `gameId` → Control Plane 502
- WI-5 Offline Game → 409
- WI-6 Legacy `/api/routines/sources/*` still work
- WI-7 Stadium without the feature flag → Control Plane reports unsupported

### Bootstrap decision (pure) — `test/game-filesystem-contract.test.mjs`

- BO-1 Only `Reports-SLC` (empty) → adopt
- BO-2 Only `Reports` (non-empty) → adopt
- BO-3 Only `Docs REPORT` → adopt
- BO-4 Nothing → ENSURE_ROOT
- BO-5 `Reports` non-empty + `Docs REPORT` non-empty → needs-choice [both]
- BO-6 `Reports` non-empty + `Docs REPORT` empty → adopt `Reports`
- BO-7 `Reports-SLC` empty + `Reports` empty → adopt `Reports-SLC`
- BO-8 `Reports` empty + `Docs REPORT` empty → needs-choice
- BO-9 Nested `docs/Reports` with reports, no root candidate → adopt `docs/Reports` (no creation)
- BO-10 `Reports-SLC` is a file, no others → needs-attention{name-collision}
- BO-11 Human path present → ready; missing → needs-attention; never switches even if a new candidate appears
- BO-12 Adopted path missing → needs-attention
- BO-13 Created path missing, no competitor → ENSURE_ROOT; with competitor → needs-attention
- BO-14 "Use automatic" resets to rule C
- BO-15 Idempotent: same evidence twice → no revision change
- BO-16 Truncated count counts as non-empty
- BO-17 SOP: one strong candidate → detected; two → needs-choice; zero → not-set; human never switched

### Mutation — `test/game-filesystem-ensure.test.mjs`

- MU-1 Creates `Reports-SLC`, verifies it is a directory
- MU-2 Second run → `existing`, no error
- MU-3 A file at the name → `name-collision`, file bytes unchanged
- MU-4 A junction at the name pointing outside → `escapes-game`, nothing created
- MU-5 Read-only parent → `create-failed`
- MU-6 An unknown op name or arbitrary folder name → rejected
- MU-7 EEXIST race → re-verify → `existing`
- MU-8 Case-variant `reports-slc` on a case-sensitive filesystem → no second folder

### Roster lanes — `test/report-lanes.test.mjs`

- LA-1 Roster {codex, claude, antigravity} → lanes Codex, Claude, AntiGravity
- LA-2 Roster {terminal} → no lane
- LA-3 Two Claude instances → one `Claude` lane
- LA-4 Model or label changes → the same lane
- LA-5 A discovered but not recruited type → no lane
- LA-6 Repeated ensure is harmless
- LA-7 Retire Claude → folder and its reports remain; contract lane retained
- LA-8 Existing `codex` folder → reused, `folder: 'codex'`, no `Codex` created
- LA-9 A file named `Codex` → lane needs-attention, root still ready
- LA-10 Every table entry matches `LANE_NAME` and is not blocked

### Incoming migration — extend `test/p0-incoming-reports.test.mjs`

- IN-1 Canonical `Reports-SLC/Claude/x.md` discovered; agent = `Claude` (fixes Unknown Agent)
- IN-2 Custom human root `Agent Output/Codex/y.md` discovered after apply; watcher rebuilt; `publishNow` called
- IN-3 Legacy `Docs REPORT/Codex/z.md` still discovered with a canonical root set
- IN-4 Explicit custom `coach.reportGlobs` still honored and unioned
- IN-5 A stale-revision apply is ignored
- IN-6 Apply for another `gameId` → rejected
- IN-7 A report under both patterns appears once
- IN-8 Root change → the old root's reports remain visible via legacy globs if matched; otherwise they drop out. Documented, not silently kept.

### Destination footer — extend router tests

- DF-1 Ready contract + ready lane + Controlled Claude → footer contains `` `Reports-SLC/Claude/` ``
- DF-2 needs-choice → footer has no destination; provenance marker unchanged
- DF-3 Terminal/legacy → no footer (unchanged)
- DF-4 The destination string equals the Stadium's apply `reportsPath` + lane folder for the same revision

### Browser — extend the `index.html` harness tests (the pattern used by slice-d settings tests)

- UI-1 `+ PATH` exists in `.routing-mode-bar`, disabled when offline or the feature is missing
- UI-2 Insert at caret; insert replacing a selection; append when there is no caret; whitespace normalization; folder trailing `/`; backtick escaping
- UI-3 Insert dispatches `input`; routing mode, Player, model, effort and route choice unchanged
- UI-4 Stale browse response (older `seq` or different directory) not rendered
- UI-5 Game switch closes the browser
- UI-6 Search debounce: 5 rapid keystrokes → 1 request; out-of-order responses → only the latest renders
- UI-7 Clearing search restores directory and scroll without a fetch
- UI-8 Open containing folder
- UI-9 The action menu opens identically from `⋯`, `contextmenu`, Shift+F10 and simulated long-press; tapping a file does not mutate the Play
- UI-10 Copy relative success toast; copy failure keeps the sheet open
- UI-11 Copy absolute disabled until resolved; "unavailable" renders its reason
- UI-12 Settings contexts: files have no "Use as…"; root cannot be chosen
- UI-13 Game Setup renders every state row from §17.1; no `.sideline`, `gameId` or absolute path in the DOM
- UI-14 Mobile layout at 360 px: no horizontal overflow; sheet full height; tap targets ≥ 44 px

### Settings API — `test/game-filesystem-settings.test.mjs`

- ST-1 Valid folder → persisted human, revision+1, apply sent, 200 after ack
- ST-2 Stadium says file/missing → 422, nothing persisted
- ST-3 Revision mismatch → 409 with the current projection
- ST-4 Offline → 409, nothing persisted
- ST-5 `null` → provenance none + reconcile
- ST-6 Apply failure after persist → 200 with warning; re-applied on reconnect

---

## 24. IMPLEMENTATION SLICES IN ORDER

**Ordering principle:** the phone loop first (read-only, no durable state), then bootstrap in read → adopt → watch → create → lanes → footer → human override order. Every slice is independently shippable and revertible.

### S1 — Neutral Game Files service + neutral browse/check routes

- **Objective:** move the engine to `src/game-files.ts`; make `routine-sources.ts` a wrapper; add `game.files.browse/check` RPCs and HTTP routes, the `truncated` flag, the `proxyExactGameRpc`/`withExactGame` helpers, and the `game.files.v1` feature flag.
- **Depends on:** nothing.
- **Changes:**
  - new `src/game-files.ts`
  - `src/routine-sources.ts`
  - `src/stadium-client.ts`
  - `src/control-plane/daemon.ts`
  - `src/control-plane/coach-routines.ts` (type alias)
  - Stadium hello/capabilities feature list
- **Tests:** FS-1…8, WI-1, 3, 4, 5, 6, 7; the existing coach-routine-sources suite unchanged and green.
- **Runtime proof:** `curl /api/games/files/browse?gameId=<selected>&dir=src` returns entries and `truncated`; `/api/routines/sources/browse` is identical.
- **Rollback:** additive; revert the file set.
- **Does NOT:** change UI, search, or bootstrap.

### S2 — Game-scoped Search backend

- **Objective:** `searchGameFiles`, the `game.files.search` RPC, HTTP, and Stadium supersession.
- **Depends on:** S1.
- **Changes:** `src/game-files.ts`, `src/stadium-client.ts`, `src/control-plane/daemon.ts`.
- **Tests:** SE-1…14, WI-2.
- **Runtime proof:** a search on the real SidelineCoach Game for `daemon` returns `src/control-plane/daemon.ts` in under 1.5 s; a search for a sibling-Game-only file name returns 0.
- **Rollback:** additive.
- **Does NOT:** add UI, content search, or an index.

### S3 — Browse Game sheet + action providers + Outgoing `+ PATH`

- **Objective:**
  - neutral browser controller and sheet; OUTGOING and GENERIC providers; `⋯`/row-tap/contextmenu/keyboard/long-press adapters;
  - Copy relative; Insert path into Play; staleness rules; Game-switch close; offline state.
- **Depends on:** S1.
- **Changes:** `src/public/index.html` only.
- **Tests:** UI-1…5, 9, 10, 14.
- **Runtime proof:** desktop browser at 360 px width: `+ PATH → open src → ⋯ on server.ts → Insert` gives `` `src/server.ts` `` at the caret; the staged route is unchanged.
- **Human field proof:** phone insert once.
- **Rollback:** hide the button.
- **Does NOT:** add search UI, absolute copy, Settings, or Coach Routines migration.

### S4 — Search in Browse Game + Open containing folder

- **Depends on:** S2, S3.
- **Changes:** `src/public/index.html`.
- **Tests:** UI-6, 7, 8.
- **Runtime proof:** type `daem` → result → Insert.
- **Human field proof:** phone search → insert → dispatch.
- **Rollback:** hide the field.
- **Does NOT:** search contents.

### S5 — Absolute-path resolver + Copy absolute path

- **Depends on:** S1, S3.
- **Changes:**
  - `src/game-files.ts` (pure join/check)
  - `src/stadium-client.ts` (`remoteName`, scheme)
  - `src/control-plane/daemon.ts`
  - `src/public/index.html` (prefetch on menu open)
- **Tests:** a unit test for resolve (missing/blocked/root/`.`); UI-11; WI for absolute.
- **Runtime proof:** copy on Windows → paste into Explorer opens the file.
- **Human field proof:** phone copy absolute → paste into notes app shows the full path.
- **Rollback:** remove the action.
- **Does NOT:** persist absolute paths or add them to browse payloads.

### S6 — GameFilesystemContract store + evidence + read-only detection

- **Objective:**
  - `game-filesystem-contract.ts` (schema, `decideReportsRoot`, `decideSopRoot`);
  - `report-lanes.ts`;
  - `game-filesystem-coordinator.ts` (store, single-flight, reconcile on `game-connected`);
  - Stadium `game.filesystem.inspect`;
  - `gameSetup` projection in status.
- **Mutation:** none. The coordinator runs with `allowEnsure: false`, so `ENSURE_ROOT` is recorded as state `unknown` with Dev Mode note "would create `Reports-SLC`".
- **Depends on:** S1.
- **Tests:** BO-1…17, LA-10, store corruption quarantine.
- **Runtime proof:**
  - `~/.sideline/game-filesystem.json` appears.
  - SidelineCoach Game — root `REPORTS` (case-variant of `Reports`, non-empty) — gets `adopted: REPORTS` on Windows.
  - Trend and Tap Assist gets `adopted: Reports`.
- **Rollback:** delete the coordinator wiring; the file is inert.
- **Does NOT:** watch, mkdir, footer, or Settings UI.

### S7 — Canonical report discovery (apply + watcher + agent label)

- **Depends on:** S6.
- **Changes:**
  - `src/report-publisher.ts` (patterns)
  - `src/extension.ts` (RelativePattern host, cache)
  - `src/server.ts` (union scan, `describeReport` lane precedence)
  - `src/stadium-client.ts` (`game.filesystem.apply`)
  - coordinator (send apply)
- **Tests:** IN-1…8.
- **Runtime proof:** with an adopted root, drop a report into it → Incoming shows it with the correct agent; `report.rescan` count unchanged or higher than before.
- **Human field proof:** existing legacy Game Incoming unchanged.
- **Rollback:** the Stadium ignores apply (feature flag).
- **Does NOT:** create folders.

### S8 — `Reports-SLC` creation + roster lanes

- **Depends on:** S7.
- **Changes:** `src/game-files.ts` (`ensureGameFolder`), `src/stadium-client.ts` (`game.filesystem.ensure`), coordinator (`allowEnsure: true`, roster triggers).
- **Tests:** MU-1…8, LA-1…9.
- **Tests, additionally:** LA-11 — a zero-roster Game → `Reports-SLC/` created with zero child folders; then roster adds codex → only `Codex/` created.
- **Runtime proof:** a new empty test Game with no Players → `Reports-SLC/` only; recruit Codex → `Reports-SLC/Codex/`; recruit Claude → `Claude/` added; rerun → no change; retire Claude → folder remains.
- **Rollback:** `allowEnsure: false`.
- **Does NOT:** delete or rename anything, or write files.

### S9 — Report destination footer

- **Depends on:** S8.
- **Changes:** `src/report-provenance.ts`, `src/control-plane/router.ts` (contract provider injected like `setRouteContextProvider`).
- **Tests:** DF-1…4; existing provenance tests updated for the optional clause.
- **Runtime proof:** dispatch to Controlled Claude → the Player's report lands in `Reports-SLC/Claude/` → Incoming shows it.
- **Rollback:** omit the destination.
- **Does NOT:** install SOP files; does not cover Terminal Players.

### S10 — Game Setup card + Settings browser contexts

- **Depends on:** S3, S4, S7 (S8 for lane chips).
- **Changes:** `src/public/index.html` (card, SETTINGS_REPORTS/SOP providers); `src/control-plane/daemon.ts` + coordinator (reports-root, sop-root, reinspect endpoints).
- **Tests:** ST-1…6, UI-12, 13.
- **Runtime proof:** change the root → watchers rebuilt (Dev Mode shows the new pattern) → Incoming republished.
- **Human field proof:** from the phone.
- **Rollback:** hide the card; the API is additive.
- **Does NOT:** create a missing selected folder or migrate reports.

### S11 — Coach Routines Add References on the shared browser

- **Depends on:** S3, S4.
- **Changes:** `src/public/index.html` (COACH_REFERENCES provider with multiple selection; remove `routineBrowse`-specific rendering); optionally point it at `/api/games/files/browse`.
- **Tests:** SliceD-11…18, 23 unchanged and green.
- **Runtime proof:** add references on mobile, as today.
- **Rollback:** restore the old panel.
- **Does NOT:** change routine persistence.

### S12 — Human phone field proof (§25)

---

## 25. HUMAN FIELD-PROOF PLAN

**Preconditions:**

- Build with S1–S10 installed.
- Control Plane restarted by the Freshness Guard.
- Two Games connected in separate windows:
  - **Game A:** a legacy Game with `Reports/` (for example Trend and Tap Assist);
  - **Game B:** a fresh test Game with no report folder.
- The phone is on the Sideline UI.

**Phone steps:**

0. **Empty-roster bootstrap (Game B starts with zero Players).** Connect Game B, then open Settings → Game Setup.
   - ✅ Reports: `Reports-SLC` · Created by Sideline.
   - ✅ No Player folder chips.
   - ✅ On disk, `Reports-SLC/` exists with **no** child folders.
   - Recruit Codex → ✅ `Reports-SLC/Codex/` appears (chip ✓), with no other lane.
   - Recruit Claude → ✅ `Reports-SLC/Claude/` added; `Codex/` untouched.
1. **Select Game B.** Open Settings → Game Setup.
   - ✅ Reports: `Reports-SLC` · Created by Sideline; Player folders show chips only for B's rostered types.
   - ✅ SOP: Not set.
   - ✅ No `.sideline`, ID, or absolute path visible.
2. **Back → Outgoing → `+ PATH`.**
   - ✅ The sheet says "Browse Game · `<Game B>`"; the Game root lists B's files only.
3. **Search for a file name that exists only in Game A.** ✅ No results (sibling isolation).
4. **Search for a partial name of a real Game B file.** ✅ Result with its full relative path. `⋯` → Insert path into Play.
   - ✅ The sheet closes, the path appears in backticks at the caret, keyboard focus returns to the prompt, and the staged AUTO route is still shown.
5. **Clipboard proof, part 1 (UNCONFIRMED until this passes): Copy Relative Path.**
   - Long-press a folder result (or use `⋯`) → Copy Game-relative path → paste into the prompt and into a phone notes app.
   - ✅ The pasted text is the exact relative path, without backticks.
   - ❌ If nothing is pasted, or a "Copy failed" toast appears: record the browser, OS and connection type (LAN HTTP / tunnel / HTTPS) and file it as a bounded clipboard defect. Continue the proof.
6. **Clipboard proof, part 2: Copy Absolute Path.**
   - `⋯` → Copy absolute path → paste into a phone notes app.
   - ✅ The full Stadium path, or the action shown disabled with a truthful "unavailable" reason.
   - A clipboard failure is recorded exactly as in step 5.
7. **Finish the Play** ("Read `<inserted path>` and write a short summary report.") → **Dispatch** to a Controlled Claude.
8. **Wait for completion.**
   - ✅ Incoming shows a new report with agent **Claude** (not Unknown Agent);
   - ✅ opening it shows its path under `Reports-SLC/Claude/`.
9. **Switch to Game A.** Game Setup:
   - ✅ Reports: `Reports` · Using existing folder.
   - ✅ Incoming still lists historical `Reports/…` reports.
   - ✅ If Game A has any `Docs REPORT` history, it is still listed.
10. **Game A → Game Setup → Change → browse to another existing folder → Use as Reports folder.**
    - ✅ "Chosen by you".
    - Dispatch a small Play → ✅ the report lands in the new folder and appears in Incoming without Refresh.
    - Then **Use automatic** → ✅ back to `Reports` · Using existing folder.
11. **Open `+ PATH` on Game A, then switch the selected Game to B on the desktop.** ✅ The phone browser closes with "Switched Game".
12. **Close Game B's window.** On the phone Game Setup: ✅ "Game offline — showing last known"; controls disabled.

**Desktop-only checks:**

- ✅ Right-click a row → same action menu.
- ✅ Shift+F10 → same menu.
- ✅ Paste the copied absolute path into Explorer → it opens.
- ✅ In the Game B folder, retire Claude → `Reports-SLC/Claude/` and its report still exist.

---

## 26. WHAT IS EXPLICITLY DEFERRED

- Dev Mode broader or parent-root visibility; multi-root workspaces; virtual-filesystem (`workspace.fs`) browsing.
- Content search, fuzzy or semantic search, indexing, recents, favorites, preview, edit, rename, delete, move, upload, drag and drop.
- Pagination beyond 200 entries per directory.
- Creating a human-selected missing folder; SOP folder creation.
- Installing or updating SOP or Report Contract documents inside the Game (P0.2 amendment); the canonical report *file naming* convention; the `## Sideline Handoff` section.
- The `Coach/` folder mentioned in 1.1 §13; `.gitignore` policy.
- Narrowing the default `coach.reportGlobs` after canonical adoption.
- Per-instance report lanes.
- Destination guidance for Terminal-transport Players.
- Player filesystem sandboxing or authority redesign.
- Removing the `routine.sources.*` aliases.
- Reviewing whether `games[].rootFsPath` needs to reach the browser at all.

---

## 27. RISKS / OPEN QUESTIONS

1. **Footer compliance [UNKNOWN].** Providers usually follow a footer instruction, but compliance is not guaranteed. Mitigation: legacy globs plus provenance keep reports discoverable wherever they land. Field-prove in S9.
2. **"Unless this Play names a different location."** A human Play that names an unwatched location produces an unwatched report. That is acceptable (human intent), but the only sign is a missing report. Possible future Dev Mode hint.
3. **The first adoption decides quietly.** Suppose a Game's single non-empty candidate is a stale folder while the real work happens elsewhere, unlabeled. Sideline adopts the stale one. Mitigation: Settings shows it plainly; one tap fixes it; nothing is moved.
4. **`REPORTS` casing in SidelineCoach itself.** On Windows it adopts as `REPORTS`, and the footer says `` `REPORTS/Claude/` ``. Correct, but it looks different from `Reports-SLC`. No action needed.
5. **Phone clipboard: UNCONFIRMED [§0 decision 2].**
   - The existing `copyText()` plumbing is used unchanged; its `execCommand` fallback is deprecated.
   - Proven only by §25 steps 5–6 on the real mobile/remote connection.
   - A failure is a bounded clipboard/connection compatibility defect with its own small Play. It does not reopen this architecture.
6. **Search deadline tuning [UNKNOWN].** 1.5 s may still be long on a busy Extension Host. Keep constants in one place and log `limitReason` in Dev Mode diagnostics.
7. **Contract loss on corruption** drops human choices. Acceptable for V1 with a log. A future version could mirror human choices into the `.bak` restore UI.
8. **Freshness Guard replacement mid-write.** Temp + rename is atomic per file; single-flight is per process. A replacement daemon re-runs reconcile idempotently.
9. **Roster type for "discovered, not recruited".** Confirm during S8 that the Control Plane registry roster contains only Team members, not Draft Pool entries. If discovery entries are mixed in, filter by roster membership state.
10. **`PATH_TOKEN` in `context-affinity.ts` does not match paths containing spaces.** Inserted `Docs REPORT/...` paths only partially feed collision detection. Out of scope; noted for Scout D's routing Play.
11. **RESOLVED [§0 decision 1]:** `Reports-SLC` is created at bootstrap even with an empty roster. Lanes are created only as providers join the roster; no speculative lanes.

---

## 28. EXACT SOURCE FILES EXPECTED TO CHANGE

**New:**

- `src/game-files.ts` (S1, S2, S5, S8)
- `src/game-filesystem-contract.ts` (S6)
- `src/report-lanes.ts` (S6)
- `src/control-plane/game-filesystem-coordinator.ts` (S6–S10)
- `test/game-files.test.mjs`, `test/game-files-search.test.mjs`, `test/game-files-wire.test.mjs`, `test/game-filesystem-contract.test.mjs`, `test/game-filesystem-ensure.test.mjs`, `test/report-lanes.test.mjs`, `test/game-filesystem-settings.test.mjs`

**Modified:**

- `src/routine-sources.ts` (S1 wrapper)
- `src/control-plane/coach-routines.ts` (S1 type alias only)
- `src/stadium-client.ts` (S1 helper + RPCs; S2; S5; S6 inspect; S7 apply; S8 ensure; feature flags)
- `src/control-plane/daemon.ts` (S1 proxy helper + routes; S2; S5; S6 coordinator wiring + `gameSetup` projection; S10 endpoints)
- `src/control-plane/protocol.ts` (param/result types for the new RPCs; feature list)
- `src/report-publisher.ts` (S7 patterns)
- `src/extension.ts` (S7 RelativePattern host + contract cache wiring)
- `src/server.ts` (S7 union scan + `describeReport` lane precedence)
- `src/report-provenance.ts` (S9 destination clause)
- `src/control-plane/router.ts` (S9 contract provider)
- `src/public/index.html` (S3, S4, S5, S10, S11)
- `test/p0-incoming-reports.test.mjs` (S7), router/provenance tests (S9), `test/coach-routines-v0-slice-d-settings.test.mjs` (S11, must stay green)
- `README.md` (S7/S10: canonical root + compatibility explanation)
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` (move to IS only per slice, after its proof)

**Must NOT change:** `src/game-identity.ts`, `src/game-adoption.ts`, `.sideline/game.json` format, dispatch HTTP payloads, `package.json` `coach.reportGlobs` default (V1).

---

## 29. BREADCRUMB RECOMMENDATIONS

One small **WILL BE** amendment was added to `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, directly under the existing P0.2 section. It records:

- the name `Reports-SLC` superseding `Reports-SC`;
- the ownership split;
- the pointer to this report.

Nothing is promoted to IS. The rest of the existing file, including its pre-existing uncommitted edits, was preserved.

**Per slice, after its proof:**

- **S1/S2:** IS — "Game Files service (neutral, Stadium-owned) serves Browse/Check/Search; Coach Routines is a consumer."
- **S3/S4:** IS — "Outgoing `+ PATH` → Browse Game → Insert path into Play (Game-relative, backticked)."
- **S6–S8:** IS — "GameFilesystemContract (CP, `game-filesystem.json`); adoption precedence; `Reports-SLC` creation; roster lanes by player type." Move the P0.2 "canonical root" bullet from WILL BE to IS, and keep the SOP-document install as WILL BE.
- **S9:** IS — "Controlled Plays carry the report destination from the same contract revision the Stadium watches."
- **WAS:** "Report discovery relied solely on `coach.reportGlobs` (Q2.8–5-5-5)", recorded once S7 lands.

---

## 30. FINAL ARCHITECTURAL DECISION

**What already exists:**

- A safe, Game-rooted, metadata-only Stadium walker with exact-Game RPC routing.
- A mobile-sized browse panel and a clipboard helper.
- A report watcher/scanner driven by globs.
- An atomic Control Plane state directory.
- A dispatch footer seam for Controlled Players.

**What we reuse:**

- All path-safety helpers, `browseSources`/`checkSources` semantics, and the `suggestSources` loop shape.
- The Stadium handler and Control Plane proxy patterns (deduplicated).
- `ReportPublisher` rebuild/republish.
- `fileCoachRoutineStore`'s atomic pattern.
- `buildReportProvenanceInstruction`.
- `copyText`, toasts, focus and modal conventions.

**What is new:**

- A neutral `game-files.ts` with search and absolute resolve.
- A pure `game-filesystem-contract.ts` and `report-lanes.ts`.
- A Control Plane `GameFilesystemCoordinator` with `game-filesystem.json`.
- Three internal RPCs: inspect, ensure, apply.
- A canonical `RelativePattern` watch and lane-aware agent labels.
- A destination clause in the footer.
- One Browse Game sheet with action providers, `+ PATH`, and the Game Setup card.

**Who owns what:**

- **Stadium** owns filesystem truth and the two `mkdir`s.
- **Control Plane** owns decisions, persistence, revision, footer and projection.
- **Browser** owns interaction only.

**The contract:** Game-relative `reports` and `sop` coordinates with provenance (`none | adopted | created | detected | human`), state (`unknown | ready | not-set | needs-choice | needs-attention`), lanes keyed by player type, and a monotonic revision.

**How bootstrap works:**

- Human choice wins.
- Otherwise exactly one report-bearing folder (root-level or already-discovered nested) is adopted.
- Otherwise `Reports-SLC` wins among empty folders, and a single empty folder is adopted.
- More than one of either kind needs a human choice.
- With nothing present, Sideline creates `Reports-SLC`.
- Nothing is ever moved, renamed, merged or deleted.

**How `Reports-SLC` and legacy coexist:** the canonical root is watched through an anchored pattern, and the legacy globs remain in the union. History stays visible, and the agent label resolves under either root.

**How search works:** an on-demand breadth-first walk in the exact Game's Stadium. Same blocklist and containment as Browse. Case-insensitive AND token substring over name and path, deterministic tiers, budgets for entries, directories, depth and 1.5 s, an honest `truncated` flag, and debounce plus sequence tokens plus Stadium supersession.

**How + PATH works:**

1. The browser captures the caret.
2. Browse or search.
3. `⋯` → Insert path into Play.
4. `setRangeText` inserts the backticked Game-relative path, then an `input` event fires.
5. Focus returns to the prompt.
6. The routing state is untouched and the dispatch API is unchanged.

**How mobile works:** one sheet, visible `⋯` everywhere, a tap on a file opens actions (never mutates), long-press as an accelerator, the absolute path prefetched to keep the clipboard write inside the gesture.

**How we keep it Game-scoped:**

- No API accepts a root.
- The Control Plane routes to the authoritative session for `gameId`.
- The Stadium re-checks the Game and enforces realpath containment.
- The browser discards any response whose session, Game, directory, query or sequence does not match.
- A Game switch closes the browser.

**How we prove it:** a ~90-case automated matrix (§23), a runtime proof per slice (§24), and a 12-step phone field proof across a legacy Game and a fresh Game (§25).

**Send the offense back out with S1.**

No product source was modified in this Play.
