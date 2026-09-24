# SIDELINE COACH SCOUT PLAY REPORT

**SCOUT PLAY ID:** `Scout-Formation__2026-09-17_075321_685_MDT`  
**CANONICAL PLAY HASH:** `sha256:7fc5915d2cd4ef8236dddfad796456ba5e7241839ddac053a6072bf24131ea18`  
**TASK CLASS:** `formation-reconnaissance`  
**GAME ROOT:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**REQUIRED STATEMENT:** This report is reconnaissance, not final architectural authority.

---

## Executive Answer

Reports appear reliably in **Trend and Tap Assist** because its filesystem layout (`Reports/<Agent>/*.md`) matches every discovery layer simultaneously: the S7 canonical anchored root (`Reports`), the default glob pattern (`**/Reports/**/*.{md,txt}`), case-sensitive ripgrep walks, and the legacy fallback agent-extraction regex (`'reports'`).

In contrast, reports have historically been absent or inconsistent in other mature Games due to an intersection of four distinct bottlenecks across the discovery pipeline:

1. **Vocabulary Mismatch & Case Sensitivity (Glob Discovery):**  
   The built-in recognized vocabulary is hardcoded to `['Reports-SLC', 'Reports', 'Docs REPORT']` ([`src/game-filesystem-contract.ts#L24`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-filesystem-contract.ts#L24)). Games with unlisted root names (such as `gallerytest`'s `Reports and Docs/`) or spaced/nested variations (`Docs/REPORT`) are never matched by default globs or auto-adopted by contract reconcile. Furthermore, prior to the S7.1 hardening ([`src/report-glob-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/report-glob-policy.ts)), a single configured `coach.reportGlobs` (e.g., `**/Reports/**`) completely erased the defaults across all Games on the machine, while Windows ripgrep case-sensitivity caused uppercase `REPORTS/` (e.g., `SidelineCoach-GameTest` and `SidelineCoach`) to return 0 files.
2. **S7 Anchored Root Readiness Gate:**  
   The S7 anchored `RelativePattern` ([`src/server.ts#L738-L749`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L738-L749)) bypasses glob quirks, but it only activates if a Game's Stadium advertises `game.filesystem.apply.v1` and the Control Plane successfully reconciles and applies a `ready` contract. Stale Extension Hosts or Games with unresolvable/conflicted identities never receive an applied contract and are thrown back entirely onto legacy globs.
3. **Identity Resolution & Collision Vulnerability:**  
   Both Stadium report scanning ([`src/server.ts#L727-L730`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L727-L730)) and report publishing ([`src/extension.ts#L170-L171`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts#L170-L171)) rely on synchronous identity resolution ([`src/game-identity.ts#L298-L395`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-identity.ts#L298-L395)). If a Git repository has no remote origin, `resolveGameContextSync` returns `gameId: 'unknown'`, which short-circuits `scanReportsForGame('unknown')` to an immediate empty array `[]`. Additionally, checkouts sharing the same remote URL (such as `SidelineCoach` and `SidelineCoach-GameTest`) produce identical `game_git_<hash>` IDs; if open concurrently, the registry marks them `conflicted`, blocking evidence inspection and rescan.
4. **Agent-Extraction Fallback Gap:**  
   When the S7 contract cache is not populated, legacy agent extraction ([`src/server.ts#L831`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L831)) only checks for folder segments named `'docs report'` or `'reports'`. It omits `'reports-slc'`. Consequently, any uncontracted Game using `Reports-SLC` attributes all reports to `'Unknown Agent'`.

---

## FACTS

### 1. Actual Paths and Patterns Scanned
- In [`src/server.ts#L738-L750`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L738-L750), `reportPatterns()` constructs the active search patterns from two sources:
  1. **Canonical Anchored Root:** If `this.filesystemContract.current?.reportsReady` is true, it prepends `new vscode.RelativePattern(joinPath(folder.uri, ...reportsPath.split('/')), '**/*.{md,txt}')`.
  2. **Glob Compatibility List:** Appends `this.getReportGlobs()`.
- [`src/report-glob-policy.ts#L37-L74`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/report-glob-policy.ts#L37-L74) (`buildReportGlobs` / `recognizedReportRootGlobPatterns`):
  - On `win32` and `darwin`, emits exact, uppercase, and lowercase glob patterns for each recognized root in `RECOGNIZED_REPORT_ROOT_NAMES`:
    - `**/Reports-SLC/**/*.{md,txt}`, `**/REPORTS-SLC/**/*.{md,txt}`, `**/reports-slc/**/*.{md,txt}`
    - `**/Reports/**/*.{md,txt}`, `**/REPORTS/**/*.{md,txt}`, `**/reports/**/*.{md,txt}`
    - `**/Docs REPORT/**/*.{md,txt}`, `**/DOCS REPORT/**/*.{md,txt}`, `**/docs report/**/*.{md,txt}`
  - Non-blank user-configured patterns from `coach.reportGlobs` are appended (deduplicated).
  - On `linux`, only exact casing is emitted.
- [`src/server.ts#L763-L817`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L763-L817) (`scanReports`):
  - Executes `vscode.workspace.findFiles(glob, '**/{.git,node_modules}/**', 500)`.
  - Filters matches with `fs.stat` (`FileType.File`) and enforces `maxReportBytes` (default 2,097,152 bytes / 2 MB).
  - Filters out candidates where `effectiveGameId && report.gameId && report.gameId !== 'unknown' && report.gameId !== effectiveGameId`.
  - `scanReportsForGame(gameId, limit)` caps results to `limit` (default 10 in `extension.ts:171`).

### 2. Game-Specific Report Configuration
- **Repository-Committed Marker:** [`src/game-identity.ts#L276-L293`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-identity.ts#L276-L293) parses `.sideline/game.json`. It only recognizes `gameId` and `displayName`. There is no schema or handling for report paths in `game.json`.
- **VS Code Settings:** A Game workspace can set `"coach.reportGlobs"` in `.vscode/settings.json`. Under `buildReportGlobs`, configured globs extend the default recognized root globs.
- **Control Plane State:** A human choice can be durably recorded in `~/.sideline/game-filesystem.json` via [`GameFilesystemCoordinator.recordHumanChoice`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/game-filesystem-coordinator.ts#L248) (`provenance: 'human'`, `state: 'ready'`), which projects to the Stadium on connection.

### 3. Legacy / Default Patterns vs. Mature Game Structures
- `RECOGNIZED_REPORT_ROOT_NAMES` is defined in [`src/game-filesystem-contract.ts#L24`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-filesystem-contract.ts#L24) as `['Reports-SLC', 'Reports', 'Docs REPORT'] as const`.
- `Docs REPORT` contains a literal space. The pattern `**/Docs REPORT/**/*.{md,txt}` matches folders literally named `Docs REPORT`. It does not match `Docs/REPORT` or `docs/reports` as parent/child folders.
- `Reports and Docs` (used by `gallerytest`, documented in [`REPORTS/Claude/Opus-Multi-Game-Report-Discovery-Regression-Root-Cause.md#L80-L88`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/Claude/Opus-Multi-Game-Report-Discovery-Regression-Root-Cause.md#L80-L88)) is not in `RECOGNIZED_REPORT_ROOT_NAMES`. `recognizeReportRootName('Reports and Docs')` returns `undefined`. It produces 0 matches unless explicitly configured.
- In [`src/server.ts#L830-L835`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L830-L835):
  ```ts
  const docsIndex = segments.findIndex((part) => part.toLowerCase() === 'docs report' || part.toLowerCase() === 'reports');
  const canonicalAgent = this.filesystemContract.canonicalAgent(relativePath);
  const agent = canonicalAgent
    ?? (docsIndex >= 0 && docsIndex + 1 < segments.length - 1 ? segments[docsIndex + 1] : 'Unknown Agent');
  ```
  `part.toLowerCase() === 'reports-slc'` is omitted. If `canonicalAgent` is undefined, reports in `Reports-SLC` receive agent `'Unknown Agent'`.

### 4. Game Identity and Root Resolution
- [`src/game-identity.ts#L298-L395`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-identity.ts#L298-L395) (`resolveGameContextSync`):
  - Tier 1: `.sideline/game.json` marker.
  - Tier 2: Git remote `origin` from `.git/config` (`game_git_<sha256(normalizeGitUrl)>[:8]`).
  - Tier 3: Local registry in memento (`game_reg_<random>`) only when `!isGit`.
  - Fallback: If `isGit` is true but no `origin` remote exists, it returns `gameId: 'unknown'`.
- [`src/server.ts#L727-L730`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L727-L730):
  ```ts
  async scanReportsForGame(gameId: string, limit = 10): Promise<CoachReport[]> {
    if (!gameId || gameId === 'unknown') return [];
    return this.scanReports(limit, true, gameId);
  }
  ```
  If `gameId` is `'unknown'`, `scanReportsForGame` immediately returns `[]`.
- [`src/control-plane/stadium-registry.ts#L176-L187`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/stadium-registry.ts#L176-L187): If multiple connected windows share the same `gameId`, `getAuthoritativeSessionForGame` returns `status: 'conflicted'`. In `daemon.ts:210-212`, `evidenceProvider` refuses to inspect conflicted Games, returning `undefined`.

### 5. UI Projection and Filtering
- In [`src/public/index.html#L3480-L3490`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3480-L3490), `refresh()` calls `api('/api/reports')` without query parameters.
- In [`src/control-plane/daemon.ts#L1551-L1553`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L1551-L1553), `GET /api/reports` defaults to `requestUrl.searchParams.get('gameId') || this.registry.getSelectedGameId()`.
- In [`src/control-plane/daemon.ts#L2721-L2771`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2721-L2771) (`buildStatus`), `status.reports` is projected strictly for `selectedGameId`.
- In [`src/public/index.html#L1761-L1772`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L1761-L1772) (`renderReports`), the UI performs no client-side filtering; it populates `reportSelect` with whatever array the backend provides.

---

## INFERENCES

1. **Trend and Tap Assist Succeeded as the "Golden Path":**  
   Because TTA used lowercase `Reports/` and had a connected, up-to-date Extension Host that reconciled to `path: "Reports"`, it succeeded under every glob and contract permutation, concealing failures in repositories with alternate casing, custom names, or stale Extension Hosts.
2. **Ai Usage - Real Time Was Misclassified:**  
   As documented in forensic reports, `Ai Usage - Real Time` had 0 report files written on disk; its lack of reports was an authoring absence, not a discovery defect.
3. **Absence in Uncontracted `Reports-SLC` Layouts:**  
   Games newly created or bootstrapped with `Reports-SLC` that have not yet had their contract applied by the Control Plane will discover files via globs, but will display them with the agent label `'Unknown Agent'` due to the omission in `server.ts:831`.

---

## UNKNOWNS

1. **Current Extension Host Process Age Across User's Machines:**  
   Whether other active VS Code windows on the user's workstation have been reloaded since commit `17836db` (the introduction of `game.filesystem.apply.v1`) cannot be proven without examining live process runtime memory.
2. **Intent for Custom Folder Names:**  
   Whether non-standard folder names such as `Reports and Docs/` in `gallerytest` were intended as permanent bespoke structures or are candidates for standard adoption via `recordHumanChoice` remains a project-owner decision.

---

## CONTRADICTIONS

- **Contract Vocabulary vs. Legacy Agent Extraction Fallback:**  
  [`src/game-filesystem-contract.ts#L24`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-filesystem-contract.ts#L24) defines canonical root names as `['Reports-SLC', 'Reports', 'Docs REPORT']`. However, the fallback agent extractor in [`src/server.ts#L831`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L831) tests only `part.toLowerCase() === 'docs report' || part.toLowerCase() === 'reports'`, contradicting the presence of `Reports-SLC` in the canonical list when `canonicalAgent` is unavailable.

---

## Relevant Files / Symbols

| File | Exact Symbols / Locations | Relevance |
|---|---|---|
| [`src/server.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts) | `reportPatterns` (L738), `scanReports` (L763), `describeReport` (L819), `getReportGlobs` (L863) | Core report scanning and agent extraction |
| [`src/report-glob-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/report-glob-policy.ts) | `recognizedReportRootGlobPatterns` (L37), `buildReportGlobs` (L64) | Generates case-tolerant default globs and merges user globs |
| [`src/game-filesystem-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-filesystem-contract.ts) | `RECOGNIZED_REPORT_ROOT_NAMES` (L24), `recognizeReportRootName` (L220), `decideReportsRoot` (L381) | Canonical report root names and reconciliation decision rules |
| [`src/game-files.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-files.ts) | `inspectGameFilesystemEvidence` (L633), `deriveNestedReportRoots` (L610) | Collects on-disk candidate evidence from Game root |
| [`src/stadium-filesystem-contract.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-filesystem-contract.ts) | `StadiumFilesystemContractCache` (L35), `canonicalAgent` (L85) | In-memory projection of contract and lane-to-agent mapping |
| [`src/game-identity.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-identity.ts) | `resolveGameContextSync` (L298), `readGitRemoteOriginFromConfig` (L246), `readGameMarker` (L276) | Synchronous Game identity resolution |
| [`src/report-publisher.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/report-publisher.ts) | `ReportPublisher` (L29), `rebuild` (L91) | File system watcher lifecycle and debounced republish |
| [`src/extension.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/extension.ts) | `reportsGetter` (L168), `reportPathsGetter` (L174), `filesystemContractApplier` (L176) | Bridges VS Code extension host to StadiumClient |
| [`src/control-plane/daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts) | `/api/reports` (L1548), `/api/status` (L915), `buildStatus` (L2693), `evidenceProvider` (L209) | Coordinates reports across connected Stadiums |
| [`src/control-plane/stadium-registry.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/stadium-registry.ts) | `getAuthoritativeSessionForGame` (L171), `getReportsForGame` (L368) | Tracks active sessions and detects conflicts |
| [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html) | `renderReports` (L1761), `renderReport` (L1738), `fetchReports` (L3109), `refresh` (L3477) | Web UI presentation of reports |

---

## Recommended Next Step

When authorized for implementation, the smallest truthful repairs should be executed in this sequence without modifying Game repositories:

1. **Update Fallback Agent Extraction ([`src/server.ts#L831`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/server.ts#L831)):**  
   Change the segment check from:
   ```ts
   const docsIndex = segments.findIndex((part) => part.toLowerCase() === 'docs report' || part.toLowerCase() === 'reports');
   ```
   to use `recognizeReportRootName(part)`:
   ```ts
   const docsIndex = segments.findIndex((part) => Boolean(recognizeReportRootName(part)));
   ```
   This ensures `Reports-SLC` (and any other recognized root) correctly extracts the `<Lane>` folder name as the agent even when the contract cache is not active.
2. **Harden Synchronous Identity for Origin-less Git Repositories ([`src/game-identity.ts#L362`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/game-identity.ts#L362)):**  
   Allow local registry fallback (`game_reg_<id>`) in `resolveGameContextSync` when a Git repository has no remote origin, preventing `gameId: 'unknown'` from silencing `scanReportsForGame`.
3. **Preserve Current Game in UI Refresh ([`src/public/index.html#L3482`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3482)):**  
   Update `refresh()` to call `api(currentGameId ? `/api/reports?gameId=${encodeURIComponent(currentGameId)}` : '/api/reports')`, eliminating reliance on daemon-level selection fallback during periodic UI sync.
4. **Register Bespoke Mature Roots via Existing Human Choice Plumbing:**  
   For mature Games with non-standard names (e.g. `gallerytest`'s `Reports and Docs/`), invoke `recordHumanChoice` or place a workspace-scoped `"coach.reportGlobs"` in `.vscode/settings.json`.

---

## Provenance

- Read-only static analysis conducted on `C:\Users\dmcal\Documents\GitHub\SidelineCoach` on 2026-09-17.
- Zero files created, modified, deleted, or renamed.
- No terminal commands executed; no git mutations performed.
