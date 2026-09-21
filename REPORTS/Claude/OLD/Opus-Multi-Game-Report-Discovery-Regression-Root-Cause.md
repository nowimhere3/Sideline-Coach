REPORT FILE:
Opus-Multi-Game-Report-Discovery-Regression-Root-Cause.md

REPORT TIMESTAMP:
2026-09-16 00:48 MDT

REPORT NUMBER / STAGE:
Q2.8 field debug (branch q2.8-multigame-field-debug)

LOCAL SLICE:
Post-S7 field diagnostic

REPORT TITLE:
Multi-Game Report Discovery Regression — Root Cause Proven

# Multi-Game Report Discovery Regression — Root Cause Proven

Principal Architect: Claude (Opus 5)
Mode: READ-ONLY DIAGNOSTIC. No file moved, renamed, created, committed, or reorganized in any Game.

---

## Executive Diagnosis

**The answer is F — a combination — but with one dominant, provable cause and two independent per-Game causes.**

The single fact that explains three of four Games:

```
C:\Users\dmcal\AppData\Roaming\Code\User\settings.json
  "coach.reportGlobs": [ "**/Reports/**/*.{md,txt}" ]
```

This is a **user-scope** setting. `getReportGlobs()` (`src/server.ts:856`) returns `configured` whenever `configured.length > 0`, so this **single** pattern *replaces* the built-in two-pattern fallback for **every Game window on this machine**. Effective discovery for all four Games is exactly one glob: `**/Reports/**/*.{md,txt}`.

Run against each Game with VS Code's own bundled ripgrep (the engine `workspace.findFiles` uses on Windows):

| Game | `**/Reports/**/*.{md,txt}` | `**/Docs REPORT/**/*.{md,txt}` |
|---|---|---|
| Trend and Tap Assist | **19** | 0 |
| gallerytest | **0** | 0 |
| SidelineCoach-GameTest | **0** | 0 |
| Ai Usage - Real Time | **0** | 0 |

That table *is* the field symptom. Nothing else needs to be true for the regression to occur.

The second layer: the S7 anchored report root (`server.reportPatterns()`), which would have rescued the mature layouts, **is not active on three of four Games** because their Extension Hosts are stale builds that never advertise `game.filesystem.apply.v1`. The Control Plane log states this verbatim.

**Answer A is false.** The earlier Opus `selectedGameId` fix is intact and is not implicated.

---

## Known-Good Control — Trend and Tap Assist

- **Repository root** — `C:\Users\dmcal\Documents\GitHub\Trend and Tap Assist` — **FACT**
- **Game identity** — `game_git_ede05e94`, source `git-remote`, from `github.com/nowimhere3/trend-and-tap-assist`. Verified by recomputing `normalizeGitUrl` + sha256 through the compiled `out/game-identity.js`. — **FACT**
- **Actual report folders** — `Reports/` with lanes `AntiGravity/`, `Claude/`, `Codex/`; 19 `.md`/`.txt`. Newest `Reports/Codex/S7-Incoming-Field-Proof__2026-09-15__Codex.md` (2026-09-15 23:04). — **FACT**
- **Effective report globs** — user-scope `**/Reports/**/*.{md,txt}` **plus** the S7 anchored `RelativePattern(<root>/Reports, '**/*.{md,txt}')`. — **FACT**
- **Filesystem/bootstrap state** — the **only** entry in `~/.sideline/game-filesystem.json`:

```json
"game_git_ede05e94": { "revision": 4,
  "reports": { "path": "Reports", "provenance": "adopted", "state": "ready",
               "decidedAt": "2026-09-16T04:46:59.067Z",
               "verifiedAt": "2026-09-16T05:03:04.883Z" },
  "sop": { "path": "Onboarding-Docs", "provenance": "detected", "state": "ready" } }
```

- **Stadium identity** — `inst_..._p38924_1789534983344_1`, bound 2026-09-16T05:03:03Z. Launched **after** the S7 build existed, so it advertises `game.filesystem.apply.v1`. — **FACT**
- **Report watcher state** — two patterns watched: anchored `Reports` root + the user glob. Both resolve to the same files. — **INFERENCE** (from `ReportPublisher.rebuild()` + `reportPatterns()`; not observed live)
- **Scan result** — 19 discoverable; `~/.sideline/work-ledger.json` `seenReports["game_git_ede05e94"]` holds **>=17 real report paths**, all `Reports/<Lane>/...`. — **FACT**
- **Why it works** — it is the **only** Game where the mature on-disk name is literally `Reports`, so it succeeds under *both* the legacy glob **and** the new contract. It is redundantly correct, which is exactly why it masks the failure of the others.

---

## Gallery Test

- **Repository root** — `C:\Users\dmcal\Documents\GitHub\gallerytest` — **FACT**
- **Game identity** — `game_git_7b79a141` (`github.com/nowimhere3/gallerytest`) — **FACT**
- **Actual report folders** — **`Reports and Docs/`**, containing `Codex Reports/`, `Google-Sync/`, `North-Star/`, plus loose reports. 29 `.md`/`.txt`. There is **no** `Reports/`, `Reports-SLC/` or `Docs REPORT/`. — **FACT**
- **Effective report globs** — `**/Reports/**/*.{md,txt}` only. No workspace `.vscode/settings.json` exists. — **FACT**
- **Filesystem/bootstrap state** — **absent**. No entry in `game-filesystem.json`. — **FACT**
- **Stadium identity** — `inst_..._p25752_1789520229060_1`, host process started **2026-09-16T00:57:09Z**, i.e. before commit `17836db` (2026-09-16T04:57:05Z) that introduced S7. Control Plane log, 04:45:35.030Z: `Stadium for game_git_7b79a141 does not support game.filesystem.apply; legacy report discovery remains active.` — **FACT**
- **Report watcher state** — one watcher, on `**/Reports/**/*.{md,txt}`. It can never fire: no path under this repo matches. — **FACT**
- **Scan result** — **0**. `seenReports["game_git_7b79a141"] = []` — Sideline has never seen a report here. — **FACT**
- **Cause** — **two independent failures.**
  1. Stale build -> no S7 contract.
  2. **Even a fresh build would not fix it**: `RECOGNIZED_REPORT_ROOT_NAMES = ['Reports-SLC','Reports','Docs REPORT']` (`src/game-filesystem-contract.ts:19`) and `recognizeReportRootName()` does an exact case-insensitive equality — `"Reports and Docs"` is **not** recognized. The nested-root evidence path (`reportPathsForGame`) reuses the same failing globs, so it yields nothing either. gallerytest would reconcile to `state: not-set` / `pendingReportsAction: create-reports-slc`.

---

## Sideline Coach Test

- **Repository root** — `C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest` — **FACT**
- **Game identity** — `game_git_c3f83b48` from `github.com/nowimhere3/sideline-coach`. **WARNING: this collides with the SidelineCoach development repo**, which has the identical `origin` and therefore the identical Game ID. — **FACT**
- **Actual report folders** — **`REPORTS/`** (uppercase) with lanes `AntiGravity/`, `Claude/`, `Codex/`; **36** `.md` files, present since 2026-09-12 08:37. Structurally identical to TTA's working layout **except for the casing of the root folder name.** — **FACT**
- **Effective report globs** — `**/Reports/**/*.{md,txt}` only. — **FACT**
- **Filesystem/bootstrap state** — **absent** from `game-filesystem.json`. — **FACT**
- **Stadium identity** — `inst_..._p23776_1789477684323_1`, host started **2026-09-15T13:08:04Z**. Log, 04:45:35.038Z: `Stadium for game_git_c3f83b48 does not support game.filesystem.apply; legacy report discovery remains active.` — **FACT**
- **Report watcher state** — one watcher on `**/Reports/**/*.{md,txt}`; cannot fire against `REPORTS/`. — **FACT**
- **Scan result** — **0**. `seenReports["game_git_c3f83b48"] = []` — 36 reports on disk for four days, never once seen. — **FACT**
- **Cause — case sensitivity, proven directly.** Executed against `SidelineCoach-GameTest` using VS Code's own bundled ripgrep (`...\Microsoft VS Code\645f29cc31\resources\app\node_modules.asar.unpacked\@vscode\ripgrep-universal\bin\win32-x64\rg.exe`):

```
-g '**/Reports/**/*.{md,txt}'  ->   0 files
-g '**/REPORTS/**/*.{md,txt}'  ->  36 files
```

  VS Code glob includes are case-sensitive even on Windows, in both the ripgrep file-walk and `vs/base/common/glob` (neither applies the regex `i` flag). `createFileSystemWatcher` shares those semantics, which is why reports never appear *live* either. — **FACT**
- **Note** — a fresh build **would** repair this Game on its own: `recognizeReportRootName('REPORTS')` -> `'Reports'` (case-insensitive), the evidence preserves on-disk casing `REPORTS`, and the anchored `RelativePattern` is built from that exact string. The contract path is already case-correct; only the glob path is not.

---

## AI Usage Real Time

- **Repository root** — `C:\Users\dmcal\Documents\GitHub\Ai Usage - Real Time` — **FACT**
- **Game identity** — `game_git_3b85b965` (`github.com/nowimhere3/ai-usage---real-time`). This is also the value in `~/.sideline/control-plane-state.json` -> `selectedGameId`. — **FACT**
- **Actual report folders** — `Reports/` exists and is **completely empty**. Whole-repo inventory: `.gitattributes`, `README.md`, `Onboarding-SOP/` (5 md + 2 binaries), `Reports/` (0 files). Git history is a single commit, `ed55489 Initial commit`. — **FACT**
- **Effective report globs** — `**/Reports/**/*.{md,txt}` — the glob is **correct** for this Game. — **FACT**
- **Filesystem/bootstrap state** — absent from `game-filesystem.json`. — **FACT**
- **Stadium identity** — `inst_..._p24248_1789477684567_1`, host started 2026-09-15T13:08:04Z. Log, 04:45:35.030Z: same `does not support game.filesystem.apply` line. — **FACT**
- **Report watcher state** — one watcher on `**/Reports/**/*.{md,txt}`, correctly anchored, zero matches. — **FACT**
- **Scan result** — **0**, and `seenReports["game_git_3b85b965"] = []`. — **FACT**
- **Cause — this Game is NOT a discovery failure.** Discovery is configured correctly and would find any report placed in `Reports/`. **No report has ever been written to this repository.** Grouping it with the other two is a misdiagnosis: this is a *report authoring / return* gap (no Player has ever produced a report into this Game), not a Sideline plumbing gap. — **INFERENCE** from complete filesystem + git evidence; **UNKNOWN**: whether a Player attempted to write a report here and wrote it somewhere off-repo. Nothing in the ledger or logs records such an attempt.

---

## Exact Divergence

One variable separates the control from the failures:

> **The on-disk name of the report root, compared case-sensitively and exactly against a single user-scope glob.**

| Game | On-disk root | Matches `**/Reports/**`? | Files present | Files seen |
|---|---|---|---|---|
| Trend and Tap Assist | `Reports` | YES — exact | 19 | 19 |
| SidelineCoach-GameTest | `REPORTS` | NO — casing | 36 | 0 |
| gallerytest | `Reports and Docs` | NO — name | 29 | 0 |
| Ai Usage - Real Time | `Reports` | YES — exact | **0** | 0 |

Trend and Tap Assist is not succeeding because it received more field repair. It is succeeding because it happens to spell its folder the way the glob does. The S7 contract it also holds is a *second*, redundant success path — real, but not what is carrying it today.

---

## Root Cause

**F — a combination of B and C, in that order of weight, plus one non-regression.**

1. **B (primary, 2 of 3 Games).** A user-scope `coach.reportGlobs` of exactly one pattern, `**/Reports/**/*.{md,txt}`, silently *replaces* the fallback pair and is applied uniformly to every Game. It is case-sensitive and name-exact, so it does not match `REPORTS/` or `Reports and Docs/`. Sideline is imposing one Game's spelling on all Games — the inverse of "Sideline adapts to each Game's existing report structure."

2. **C (enabling, 3 of 3 Games).** The newer filesystem/bootstrap intelligence — which *is* case-insensitive and *would* have rescued `REPORTS/` — is populated for **exactly one Game**. The three broken Games run Extension Host processes started before commit `17836db`, so they do not advertise `game.filesystem.apply.v1`, and `applyGameFilesystemContract` (`daemon.ts:2201-2207`) refuses and logs. This is why the new intelligence is not compensating for the old glob. A stale-build condition is a contributing factor here (a dash of **E**), but it is not the root cause: reloading every window still leaves gallerytest broken.

3. **Not a regression at all (1 of 3).** Ai Usage - Real Time has no reports on disk. It was swept into the bug report by symptom similarity.

**Ruled out with evidence:**

- **A — old `selectedGameId` / Stadium publication bug returned.** No. `reportsGetter` (`extension.ts:169-172`) resolves this window's own folder identity; `scanReportsForGame` rejects `'unknown'` and passes `targetGameId`, so `effectiveGameId = targetGameId` and never falls back to `this.selectedGameId`. Additionally, the Control Plane's selected Game is currently `game_git_3b85b965` (Ai Usage) while TTA publishes 19 reports normally — the exact cross-contamination the old bug caused is demonstrably absent.
- **D — report-root state resolved from the wrong Game/Stadium.** No. Every log line shows correct 1:1 session->Game binding, and `game-filesystem.json` holds one correctly-scoped entry.
- **E — stale dev-host behavior as *the* cause.** Contributing, not sufficient. Reloading fixes SidelineCoach-GameTest only.

---

## Whether Earlier Opus Fix Still Holds

**Yes. Intact and verified in current source.**

- `extension.ts:167-172` — `reportsGetter` resolves `resolveGameContextSync(workspaceFolders[0]).game.gameId` for **this** window, then calls `server.scanReportsForGame(gameId, 10)`.
- `server.ts:726-729` — refuses `''`/`'unknown'`, forwards `gameId` as `targetGameId`.
- `server.ts:765` — `const effectiveGameId = targetGameId || this.selectedGameId` — with `scanReportsForGame` the left operand is always truthy.
- `stadium-client.ts:315-326` — publishes exactly what `reportsGetter` returns.
- The comments recording the P0 rationale are still in place at `server.ts:719-724` and `extension.ts:165-167`.

**One residual, not implicated here:** `getLatestReport()` with no argument and the retired in-window `GET /api/reports` without `gameId` (`server.ts:150`, `server.ts:384`) still fall through to `this.selectedGameId`. These are not on the Incoming path and are not causing this regression, but they are the last places the old shared-selection shape survives.

---

## Whether Recent Filesystem Work Contributed

**It did not cause the regression. It created the repair that is not yet reaching three Games.**

- The S6/S7 work is strictly *additive*: `reportPatterns()` **prepends** the anchored root and then spreads `getReportGlobs()` unchanged (`server.ts:735-747`). It removes nothing.
- The contract cache is memory-only and starts empty; `reportsReady` is false until the Control Plane applies a revision, so a Stadium without a contract behaves exactly as it did pre-S7.
- The filesystem work is, however, why the discrepancy became *visible*. TTA received a fresh dev host at 04:46:57Z, reconciled at 04:46:59Z, and gained a second correct discovery path. The other three kept running 13:08Z / 00:57Z hosts and were left on the legacy glob alone. The fleet split into "repaired" and "not yet reloaded," and that split reads as a regression.
- `recognizeReportRootName` is already deliberately case-insensitive and the evidence pipeline already preserves on-disk casing and already carries a `multiple-case-variants` attention code. The design anticipated this. Only the legacy glob path did not.

---

## Minimum Safe Repair

Ordered by ratio of Games fixed to risk taken. **No Game repository is touched by any of these.**

**R1 — Reload the three stale Extension Hosts (zero code).**
Developer: Reload Window in the gallerytest, SidelineCoach-GameTest and Ai Usage windows. Each then advertises `game.filesystem.apply.v1`, reconciles, and gains its anchored root.
Fixes: **SidelineCoach-GameTest** (`REPORTS` is recognized case-insensitively and anchored with on-disk casing). Confirms gallerytest reconciles to `not-set` rather than silently failing. Confirms Ai Usage is empty, not broken.

**R2 — Stop letting one glob list speak for every Game (small, bounded, `src/server.ts`).**
In `getReportGlobs()`, treat configured globs as **additive to**, not a replacement for, the recognized-root defaults, and derive the defaults from `RECOGNIZED_REPORT_ROOT_NAMES` so the two lists cannot drift apart again:

```
['Reports-SLC', 'Reports', 'Docs REPORT'] -> **/<name>/**/*.{md,txt}   UNION   configured
```

This alone restores SidelineCoach-GameTest without a reload *only if* case is also handled — see R3.

**R3 — Make glob discovery case-tolerant on case-insensitive filesystems (small, `src/server.ts`).**
The contract path already is; the glob path is not. Emit case-variant patterns (e.g. `Reports`, `REPORTS`, `reports`) for each recognized root name, or anchor against the actual on-disk entry discovered by evidence. Guard behind `process.platform === 'win32' || 'darwin'`.

**R4 — gallerytest needs a human decision, not code (config only).**
`Reports and Docs` is not, and should not silently become, a recognized canonical name. Two options, both preserving the repo:

- *Preferred:* record a human choice via the existing `recordHumanChoice(gameId, 'reports', 'Reports and Docs')` path (`game-filesystem-coordinator.ts:217`) — this is precisely the mechanism S6 built for mature Games. Persists to `~/.sideline/game-filesystem.json`; moves nothing.
- *Fallback:* add a **workspace-scoped** `.vscode/settings.json` in gallerytest with `"coach.reportGlobs": ["**/Reports and Docs/**/*.{md,txt}"]`. Note this is only safe once R2 lands, since today a workspace value would again *replace* rather than extend.

**R5 — Resolve the `game_git_c3f83b48` identity collision (design decision, do not rush).**
`SidelineCoach` and `SidelineCoach-GameTest` share `origin`, therefore share one Game ID. Today only one is bound, so nothing is broken. But if both windows bind simultaneously, `getAuthoritativeSessionForGame` returns `conflicted` (`stadium-registry.ts:198-203`), which makes the evidence provider return `undefined` and blocks contract apply, report scanning and exact routing for **both**. The intended, non-destructive remedy already exists: a Tier-1 `.sideline/game.json` marker in one of the two. That is a *new file in a Game*, so it needs explicit human authorization — flagging, not doing.

**Bounded-fix verdict:** R1 is free and should be done first. R2 + R3 together are a genuinely small, well-bounded change — roughly one function in `src/server.ts` plus tests — and are the durable fix. **Recommended Worker: Claude Sonnet 5, effort medium**, scoped strictly to `src/server.ts` + `test/`. This does not need an Architect. R4 and R5 are human decisions that must not be folded into that Worker's scope.

---

## What Must NOT Be Changed

- **Do not rename `REPORTS/` -> `Reports/`** in SidelineCoach-GameTest or the SidelineCoach dev repo. 36 and 110 files respectively, four days to months of authoritative field structure. Sideline adapts to the casing; the repo does not adapt to Sideline.
- **Do not rename or split `Reports and Docs/`** in gallerytest. 29 files across `Codex Reports/`, `Google-Sync/`, `North-Star/`. Bind to it; do not reshape it.
- **Do not create `Reports-SLC/` in any existing Game.** `pendingReportsAction: 'create-reports-slc'` is a *recorded intention* that S6 deliberately does not execute. Keep it that way for mature Games.
- **Do not add `'Reports and Docs'` to `RECOGNIZED_REPORT_ROOT_NAMES`.** That constant is a canonical vocabulary, not a catch-all. gallerytest is exactly the case `recordHumanChoice` exists for.
- **Do not delete or "clean" the empty `Reports/` in Ai Usage - Real Time.** It is the correct, already-matching destination for that Game's first report.
- **Do not touch `~/.sideline/game-filesystem.json` by hand.** The Control Plane is its sole durable owner; hand edits will be overwritten on reconcile and can trip the quarantine path.
- **Do not blame or disturb the Scout artifacts.** Formation Alpha wrote correctly to `SidelineCoach\REPORTS\Scout Only\TTA-Full-Sync-Formation-Alpha__2026-09-15_2321_MDT\` (3 files, verified present). The Scouts did nothing wrong. *(Worth noting: because that path is under uppercase `REPORTS`, those Scout reports are subject to the very same casing miss — another reason R3 matters.)*
- **No git operations.** No reset, clean, stash, commit, or push. Nothing was modified during this diagnostic.

---

## Tests Needed

Unit, against `src/server.ts` (`getReportGlobs` / `reportPatterns`) — no VS Code host required:

1. A configured `coach.reportGlobs` **extends** the recognized-root defaults rather than replacing them.
2. `reportPatterns()` emits one pattern per recognized root name, including case variants, on `win32`.
3. The S7 anchored `RelativePattern` is still prepended when `reportsReady`, and the union is order-stable and de-duplicated.
4. A Game whose only report root is unrecognized (`Reports and Docs`) yields zero anchored patterns and **no** silent adoption.
5. `scanReportsForGame('unknown')` -> `[]`; `scanReportsForGame(id)` never consults `this.selectedGameId` (regression lock on the earlier Opus fix).

Contract/coordinator:

6. `recognizeReportRootName('REPORTS' | 'reports' | '  Reports  ')` -> `'Reports'`; `recognizeReportRootName('Reports and Docs')` -> `undefined`.
7. Evidence carrying on-disk name `REPORTS` produces a contract whose `reports.path` is `REPORTS`, not `Reports`.
8. `recordHumanChoice(gameId, 'reports', 'Reports and Docs')` persists and survives a reconcile that finds no recognized candidate.

Integration (ReportPublisher, injected host — no `vscode` import needed):

9. `rebuildAndPublish` on `reportsChanged` installs the new pattern set and publishes exactly once.
10. Generation guard: a watcher from a superseded rebuild cannot schedule a publish.

Fixture-based regression lock:

11. Four synthetic Game trees — `Reports/`, `REPORTS/`, `Reports and Docs/`, empty `Reports/` — asserting discovered counts 19 / 36 / 0-until-bound / 0. This encodes the exact divergence table above so it cannot silently return.

---

## Human Field Proof Needed

Code and logs cannot close this. Required, in order:

1. **Reload Window** in the gallerytest, SidelineCoach-GameTest and Ai Usage windows. Then confirm in `~/.sideline/logs/control-plane.log` that the `does not support game.filesystem.apply` line **no longer appears** for `game_git_7b79a141`, `game_git_c3f83b48`, `game_git_3b85b965`.
2. Confirm `~/.sideline/game-filesystem.json` gains entries for all three. Expect `c3f83b48 -> reports.path: "REPORTS"`, `3b85b965 -> reports.path: "Reports"`, and `7b79a141 -> state: not-set` (or `needs-choice`).
3. **Open Incoming for Sideline Coach Test.** Expect its 36 `REPORTS/` reports to appear. This is the single decisive proof that the casing diagnosis is correct and that the contract path repairs it.
4. Open Incoming for gallerytest. Expect **still zero** — this is the expected, correct outcome pre-R4, and confirms that a stale build was not the whole story.
5. **Write one real report into `Ai Usage - Real Time\Reports\`** and confirm it reaches Incoming within the 500 ms debounce. This separates "empty Game" from "broken Game" definitively.
6. Confirm Trend and Tap Assist still shows its 19 reports throughout — no regression to the control.
7. Confirm all four Games show their own reports **simultaneously**, with the Control Plane's `selectedGameId` parked on a *different* Game. This re-proves the earlier Opus fix under live multi-Game load.

Open question only the human can answer: **is `Reports and Docs` gallerytest's intended permanent report root?** R4's branch depends on the answer, and the answer belongs to the project owner.

---

## WAS / IS / WILL BE

**WAS.** A shared `selectedGameId` in `globalState` leaked one window's Game selection into every other Stadium, so a Game selected anywhere made all other Stadiums publish zero reports. That was repaired: each Stadium now resolves its own workspace folder's Game and calls `scanReportsForGame(gameId)`. That repair is intact today and is not the cause of anything described in this Play.

**IS.** Report *ownership* is correct; report *discovery* is not. A single user-scope `coach.reportGlobs` entry — `**/Reports/**/*.{md,txt}` — replaces the defaults for every Game on the machine and is matched case-sensitively and name-exactly. Trend and Tap Assist survives only because its folder is literally spelled `Reports`. SidelineCoach-GameTest has 36 reports under `REPORTS/` that Sideline has never once seen. gallerytest has 29 under `Reports and Docs/`, likewise never seen. Ai Usage - Real Time has none at all and was never broken. The S6/S7 filesystem contract — which is already case-insensitive and already preserves on-disk casing, and which would repair `REPORTS/` unaided — is live for exactly one Game, because the other three windows still run Extension Hosts from before commit `17836db` and do not advertise `game.filesystem.apply.v1`. A latent identity collision has `SidelineCoach` and `SidelineCoach-GameTest` sharing `game_git_c3f83b48`; it is dormant only because just one of the two is currently bound.

**WILL BE.** Every Game's report root is discovered by its own on-disk name and casing. Configured globs extend the recognized defaults instead of overriding them, so no one Game's spelling can ever again silence the rest of the fleet. Recognized roots — `Reports-SLC`, `Reports`, `Docs REPORT` — resolve regardless of case; unrecognized mature roots like `Reports and Docs` are bound by an explicit, durable human choice rather than by a migration. Mature repositories keep their structure exactly as the field wrote it; the canonical bootstrap standard applies to new Games and to deliberate adoption only. The `c3f83b48` collision is resolved by a Tier-1 marker placed with human authorization, not by renaming a repo. Incoming shows every Game its own reports, at the same time, regardless of which Game the Control Plane has selected.

---

## Evidence Appendix — Sources

All read-only. The only executable invoked outside the repo was VS Code's bundled `rg.exe` in `--files` listing mode, which enumerates filenames and writes nothing.

| Evidence | Source |
|---|---|
| Effective glob | `C:\Users\dmcal\AppData\Roaming\Code\User\settings.json` |
| Game IDs | recomputed via `normalizeGitUrl` + sha256 through `out/game-identity.js` |
| Contract state | `~/.sideline/game-filesystem.json` (1 entry: `game_git_ede05e94`) |
| Selected Game | `~/.sideline/control-plane-state.json` -> `game_git_3b85b965` |
| Feature gate log | `~/.sideline/logs/control-plane.log` @ 2026-09-16T04:45:35Z |
| Reports ever seen | `~/.sideline/work-ledger.json` -> `seenReports` |
| Glob case proof | `@vscode/ripgrep-universal` `rg.exe --files -g ...` against each Game root |
| S7 introduction | `git log -S "game.filesystem.apply.v1"` -> `17836db` (2026-09-15T22:57:05-06:00) |

**Working-tree safety:** `git status` at session start and end is unchanged. No source file was edited. No report, folder, or Game layout was created, moved, renamed, or deleted — other than this report itself, written to the Claude lane at the human's explicit instruction.
