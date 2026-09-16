# 5-5-5 — Fix Report Path Contract

## 1. Original task

Repair the narrow Player → Report → Incoming contract mismatch. The real Trend and Tap Assist Game writes reports under `Reports/<Agent>/**/*.{md,txt}`, while Sideline Coach's canonical configuration default and runtime fallback watched only `Docs REPORT/<Agent>/**/*.{md,txt}`. The requested compatibility direction was to discover both modern `Reports` and legacy `Docs REPORT` layouts without redesigning reporting.

## 2. Investigation performed

- Confirmed the repository branch was `q2.8-multigame-field-debug`.
- Inspected the working tree before editing and found substantial pre-existing user changes. In particular, `src/extension.ts` and `test/p0-incoming-reports.test.mjs` were already modified; those existing edits were preserved.
- Located `coach.reportGlobs` in `package.json` and the private `CoachServer.getReportGlobs()` fallback in `src/server.ts`.
- Traced report scanning through `scanReportsForGame()` and `scanReports()`, both of which obtain their globs from `getReportGlobs()`.
- Traced watcher setup through `CoachServer.reportGlobs()` → `ReportPublisher.getGlobs()` → `vscode.workspace.createFileSystemWatcher()` in `src/extension.ts`.
- Confirmed watcher events call `StadiumClient.publishReportsChanged()`, allowing the Stadium to republish its reports to the Control Plane and therefore Incoming.
- Confirmed the parser in `src/server.ts` already recognizes both `Docs REPORT` and `Reports` when deriving the agent/provider folder.
- Searched Sideline Coach workspace JSON/workspace files and the Trend and Tap Assist workspace for `coach.reportGlobs`. No workspace-level override was found in either workspace.
- Verified the destination for this final report did not already exist before creating it.

## 3. Conclusions

The field diagnosis was correct: the canonical default and defensive runtime fallback were out of date. Scanning and watching already shared the same effective contract, and downstream Stadium/Control Plane/Incoming plumbing was already present. The smallest correct repair was therefore to add the modern glob to both default owners while retaining the legacy glob.

The effective default is now:

```json
[
  "**/Docs REPORT/**/*.{md,txt}",
  "**/Reports/**/*.{md,txt}"
]
```

Because an explicitly configured non-empty `coach.reportGlobs` array replaces the default, any user-level, remote-level, or workspace-level custom value containing only the legacy glob would still need to be updated manually. No workspace-level override was found for Trend and Tap Assist, but live VS Code user/remote settings were not inspected through the running application.

## 4. Source/configuration files changed in this thread

### `package.json`

Added `**/Reports/**/*.{md,txt}` to the contributed `coach.reportGlobs` default while retaining `**/Docs REPORT/**/*.{md,txt}`. This is the user-visible canonical VS Code configuration default.

### `src/server.ts`

Updated `CoachServer.getReportGlobs()` so its defensive fallback returns both legacy and modern report globs. This keeps the runtime fallback consistent with the manifest default and feeds both scanning and watcher construction.

No other source/configuration file was directly edited for this Play. Compilation may have refreshed ignored generated JavaScript under `out/`; no generated file was manually edited or added to the tracked diff.

## 5. Test files changed or created

### `test/p0-incoming-reports.test.mjs`

Added `P0-8`, which verifies:

- the manifest default contains both exact globs;
- the runtime fallback contains both exact globs; and
- the extension's watcher host consumes `server.reportGlobs()`, the same runtime contract used by scanning.

This test file already contained unrelated user changes before this Play. They were preserved. No test file was created.

## 6. Documentation, breadcrumb, and report files changed

### `README.md`

Updated the report-loop overview, default glob documentation, example layout, agent-folder explanation, configuration example, and feedback-loop instructions to describe modern `Reports` plus legacy `Docs REPORT` compatibility.

### Breadcrumbs

No breadcrumb file was edited by this Play. `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` was already modified in the working tree and was left untouched.

### Earlier report rename in this thread

In response to an ambiguous request to number “this report,” the existing Claude report:

`REPORTS/Claude/P0-Mobile-Incoming-Reports-Regression-Forensics.md`

was renamed to:

`REPORTS/Claude/55-P0-Mobile-Incoming-Reports-Regression-Forensics.md`

That rename was not required for the report-path implementation and did not change the report contents. Later requests correctly prohibited touching Claude reports; no further Claude report change was made. Several subsequent requests asked to rename a just-created Codex report to `5-5-5.md`, but no Codex report had been created by the immediately preceding Play, so the rename was refused rather than guessing or renaming a historical report.

### This report

Created only this final report:

`REPORTS/Codex/5-5-5-Fix-Report-Path-Contract.md`

## 7. What was actually implemented

- Modern `Reports/<Agent>/**/*.{md,txt}` discovery was added to the manifest default.
- Legacy `Docs REPORT/<Agent>/**/*.{md,txt}` discovery was retained.
- The server fallback was synchronized with the manifest default.
- Regression coverage was added for exact default/fallback parity and watcher consumption of that contract.
- README documentation was synchronized with the implemented behavior.

The runtime chain after the change is:

`coach.reportGlobs` → `CoachServer.getReportGlobs()` → `scanReports()` and `CoachServer.reportGlobs()` → `ReportPublisher.getGlobs()` → VS Code filesystem watchers → `StadiumClient.publishReportsChanged()` → Control Plane → Incoming.

## 8. Proposed but not implemented

The following were deliberately not implemented:

- Game Setup or Game Bootstrap changes;
- automatic report-folder creation;
- a manual report-folder picker;
- new report configuration UI;
- reporting architecture redesign;
- removal of legacy `Docs REPORT` compatibility;
- automatic merging of built-in defaults into an explicit custom `coach.reportGlobs` value;
- any commit or push.

## 9. Tests and verification run

- `npm.cmd run compile` — passed TypeScript compilation.
- `node --test test/p0-incoming-reports.test.mjs` — 8/8 passed, including the new P0-8 regression.
- First `npm.cmd test` run — 713/714 passed. The sole failure was an unrelated loopback `ECONNRESET` in Coach Routines B4.
- `node --test test/coach-routines-daemon.test.mjs` — 9/9 passed on isolated rerun, including B4.
- Second `npm.cmd test` run — 714/714 passed.
- `git diff --check` — passed; only line-ending warnings were emitted.
- Rechecked the relevant final diff and confirmed the implementation remained limited to the intended manifest default, runtime fallback, regression test, and README contract updates, alongside pre-existing unrelated worktree changes.

## 10. Runtime or human verification still required

Automated verification proves the configuration and wiring contracts, but this thread did not perform a live VS Code field test. Human/runtime proof should confirm that, in a running Trend and Tap Assist Stadium:

1. an existing `Reports/Codex/*.md` report appears in Incoming after Stadium connection/republish;
2. creating or changing a report under `Reports/<Agent>/` triggers automatic Incoming republishing without manual refresh;
3. a legacy report under `Docs REPORT/<Agent>/` still appears; and
4. the Incoming agent badge is derived from the folder immediately below the recognized report root.

## 11. Live activation, rebuild, reload, and freshness requirements

TypeScript was compiled successfully during this thread. To activate the change in a live development environment, every affected Game's Stadium must run the newly compiled canonical Sideline Coach extension source. Reload or relaunch the Extension Development Host/VS Code Stadium so it loads the updated manifest and compiled extension code, rebuild first if the local `out` directory is subsequently stale, and allow the Stadium to reconnect to the Control Plane. Connection triggers report publication, while the rebuilt `ReportPublisher` installs watchers for both globs.

No Control Plane architecture or protocol change was made for this fix, so this Play alone does not require a daemon schema migration. However, the working tree contained unrelated Control Plane changes; the existing freshness guard should be allowed to reconcile/restart that daemon as required by the complete current build. A packaged/installed extension must be rebuilt, repackaged/reinstalled, and reloaded before the new manifest default can take effect.

## 12. Remaining issues and uncertainty

- Live field behavior in Trend and Tap Assist remains to be human-verified.
- A higher-scope VS Code user or remote setting for `coach.reportGlobs` was not inspected in the live application. If explicitly set to only the legacy glob, it will override the new default and must be amended to include `Reports`.
- The worktree contained many unrelated pre-existing modifications and untracked files. They were not reverted, committed, or included as work performed by this Play.
- The earlier Claude report rename described above remains present and was not reversed because later instructions explicitly prohibited touching Claude reports.
