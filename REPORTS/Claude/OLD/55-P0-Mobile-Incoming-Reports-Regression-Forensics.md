REPORT FILE:
P0-Mobile-Incoming-Reports-Regression-Forensics.md

REPORT TIMESTAMP:
2026-09-13 00:34 MDT

# P0 — Mobile Incoming Reports Regression: Forensics and Repair

Principal Architect: Claude (Opus 5)

## Verdict

**ROOT CAUSE PROVEN · SMALLEST FIX IMPLEMENTED AND TESTED · READY FOR HUMAN MOBILE PROOF AFTER A GAME HOST RELOAD**

The report disappears at the **first boundary: inside the Trend and Tap Assist Stadium, before anything reaches the Control Plane.** Two defects stacked there. Neither was the glob.

1. **Wrong-Game filter.**
   - The Stadium's report snapshot calls the legacy local `CoachServer.scanReports(10, true)` with no Game.
   - That function filters by `CoachServer.selectedGameId`, which is loaded from VS Code `globalState`.
   - `globalState` is shared by every window of the profile. Live value: **`game_git_042782b8` (GS3)**.
   - Every Trend report carries `gameId game_git_ede05e94`, so every one was discarded and the Stadium published **0 reports**.
2. **No change publication.**
   - The Stadium publishes reports only once, in `announceGameAndState()` at connect.
   - `StadiumClient.sendReportChanged()` has **no caller** anywhere.
   - The only report watchers live in `CoachServer.installWatchers()`, reached only from `CoachServer.start()`, which the detached architecture **never calls**. Those watchers also only broadcast to the retired local SSE server.
   - So a report written after the Stadium connected never left the Stadium, even with a correct filter.

**Scope:** system-wide for the detached multi-Game report pipeline, not specific to Trend and Tap Assist or to `Reports/**`.
- **New reports:** never delivered in any Game, because defect 2 affects every Stadium.
- **Existing reports:** delivered only in the one Game whose id happens to equal the shared legacy selection. Live, that was GS3, the only session with `reportCount 10`.

## Working-tree safety

- Forensics ran first, with no source edits, while Codex's Q2.10C.1 was still active.
- After the amendment, I reviewed `git status` / `git diff --stat` and built on top of the Q2.10C.1 state: Full Autonomy authority, `player-authority.ts`, the adapters and the fixtures.
- No authority file was touched.
- No reset, clean, restore, stash, checkout, commit or push was run.
- **Files I created and removed:**
  - My one forensic probe report (`Reports/Claude/ZZ-Forensic-Probe__P0-Incoming__DELETE-ME.md`), created and removed; `Test-Path` confirms it is gone.
  - A read-only copy of VS Code `state.vscdb`, in the session scratchpad only.

## Pipeline trace (boundary by boundary)

| # | Boundary | Finding | Evidence |
|---|---|---|---|
| 1 | Game filesystem | ✅ Reports exist | `Reports\Claude\Stage-00-SOP-Onboarding-Adoption__2026-09-13_00-02_MDT__Claude.md` (00:02:24, 7136 B); `Reports\AntiGravity\Onboarding-Read-Report__2026-09-13_00-18_MDT__AntiGravity.md` (00:20:18, 14938 B) |
| 2 | `coach.reportGlobs` reaches the Stadium | ✅ Correct and live | The Trend window has **no** `.vscode/settings.json`; the glob is in **User** settings `%APPDATA%\Code\User\settings.json` (`"**/Reports/**/*.{md,txt}"`, saved 00:11:40). The Trend Extension Development Host is PID 18800 with `--user-data-dir=%APPDATA%\Code`, the same profile, and it reconnected at 00:12:05 (after the save). `getReportGlobs()` reads it on every scan; nothing caches it. |
| 3 | Stadium scanner (existing report) | ❌ **FIRST BREAK** | `reportsGetter → server.scanReports(10, true)`; `effectiveGameId = this.selectedGameId` = GS3 from shared `globalState` (read from a copy of `state.vscdb`: `local.sideline-coach → sidelineCoach.selectedGameId: game_git_042782b8`). The Trend report `gameId` is `game_git_ede05e94` → `continue`. |
| 4 | Stadium watcher (new report) | ❌ **SECOND BREAK** | `grep sendReportChanged` → definition only. `CoachServer.start()` is never called by `extension.ts`. Live probe: a new `.md` under `Reports\Claude\` at 00:29:10 → still `reportCount 0` after 20 s. |
| 5 | Stadium Bridge → `report.snapshot` / `report.changed` | Carries whatever it is given (0) | Snapshot sent at connect with an empty list |
| 6 | Control Plane `reports-updated` → per-Game state | ✅ Correct association | `registry.updateReports(instanceId)` stores by session; that session's Game is `game_git_ede05e94`. No cross-association seen. |
| 7 | Selected Game → `/api/reports` | ✅ Returns what it holds (0) | `selectedGameId game_git_ede05e94`, `/api/reports` count **0** |
| 8 | SSE → browser → Incoming | ✅ Not at fault | A registry `change` broadcasts `status`; the browser's `status` listener calls `refresh()`, which fetches `/api/reports`. It rendered the true empty state. |

**Ledger versus Incoming:** they share **one** canonical stream. The Q2.10C Instance Work Ledger is fed from the same `reports-updated` registry event and `getReportsForGame()` as Incoming, so both received the same zero. They did not diverge; they starved together.

## Answers to the investigation questions

1. **Is `coach.reportGlobs` read by the correct host?** Yes. It comes from User settings in the same VS Code profile the Trend host runs under, and is read at scan time.
2. **Did discovery split during Q2.7/Q2.8?** **Yes.**
   - Glob configuration is still shared: `CoachServer.getReportGlobs()`.
   - Watching stayed inside the old `CoachServer.start()`, which the detached path never runs.
   - The detached Stadium borrowed the old scanner together with its legacy `selectedGameId` scoping.
3. **Does a `coach.reportGlobs` change rebuild watchers?** Before the fix there were no live watchers at all, only a scan at connect. After the fix, the watchers rebuild on the configuration change and republish immediately.
4. **Is an existing report published on Stadium reload?** Scanned, yes, but discarded by the wrong-Game filter unless the legacy selection equalled the Stadium's Game.
5. **Is a new file in `Reports\Claude\` or `Reports\AntiGravity\` detected?** No. The probe proved it.
6. **Does the Stadium emit toward the Control Plane?** Only the connect-time snapshot, and it was empty.
7. **Does the Control Plane receive `reports-updated` for the correct `gameId`?** Yes, on connect, carrying 0 reports.
8. **Stored under the wrong Game?** No. Associated with Trend correctly; the payload was empty.
9. **Does `/api/reports` return Trend's reports when Trend is selected?** It returned the stored 0. After the fix it also honours an explicit `?gameId=`, which the browser already sends.
10. **Is SSE at fault?** No.
11. **Scope:** system-wide, for every Game of the detached multi-Game report pipeline (see Verdict).

## Runtime freshness

- **Stale daemon found.**
  - Control Plane PID 21064 had been running since 19:51.
  - `out/control-plane/daemon.js` was rebuilt at 23:46 (Q2.10C.1) and again for this fix.
  - Stale daemon code was **not** the cause: the `/api/reports` path is identical in old and new code.
  - I replaced it after compiling: new PID **33332**. All three Stadiums reconnected (Trend, GameTest, GS3).
- **Stale Stadiums:** the Game hosts still run pre-fix extension code.
  - After the daemon restart, Trend again published 0 reports (the old filter, reproduced on reconnect).
  - `POST /api/reports/rescan` returned **502**, because the old Stadium does not implement `report.rescan` (JSON-RPC -32601).
  - This is expected and is the reason a Game host reload is required.

## Implementation performed (smallest correct fix)

1. **Stadium scans its own Game.**
   - `CoachServer.scanReportsForGame(gameId, limit)` is new.
   - The `reportsGetter` in `extension.ts` resolves the Stadium's own Game (`resolveGameContextSync`) and scans only that Game.
   - An `unknown` Game returns `[]`; it never returns another Game's reports.
   - The legacy shared selection is no longer consulted for Stadium-published reports.
2. **Stadium report watcher.**
   - `src/report-publisher.ts` (`ReportPublisher`, with the host injected so it is testable) watches each configured glob.
   - It publishes on create, change or delete, debounced at 500 ms, through `StadiumClient.publishReportsChanged()` (canonical rescan → `report.changed`).
   - A change to `coach.reportGlobs` or `coach.maxReportBytes` rebuilds the watchers and republishes, with no reload.
   - Publish failures never crash the Stadium; the next event or rescan retries.
3. **Refresh Incoming (recovery only).**
   - Browser: a quiet **Refresh Incoming** button on the Incoming card.
   - Daemon: `POST /api/reports/rescan {gameId}` → that Game's authoritative Stadium → `report.rescan` RPC → canonical republish.
   - Messages: "Incoming refreshed · N reports" or "no reports found for this Game". An offline Game gets 409 and is never answered with another Game's data.
4. **`/api/reports` honours `?gameId=`**, reading only that Game's authoritative Stadium.
5. **Agent label:** the agent is now taken from the folder under `Reports/` as well as `Docs REPORT/` (for example "Claude", "AntiGravity"), never from the filename.

**Automatic convergence without refresh** uses the existing path: Stadium `report.changed` → registry `reports-updated` → daemon `status` SSE → browser `refresh()` → `/api/reports`.

## Files changed

- `src/report-publisher.ts` (new): Stadium report watcher and publisher.
- `src/extension.ts`: Game-scoped `reportsGetter`; `ReportPublisher` wiring with configuration-change rebuild.
- `src/server.ts`: `scanReportsForGame()`, `reportGlobs()`, agent derivation for `Reports/`.
- `src/stadium-client.ts`:
  - `sendReportSnapshot()` returns a count and takes the method name;
  - new `publishReportsChanged()`;
  - handles the `report.rescan` RPC.
- `src/control-plane/daemon.ts`: `/api/reports?gameId=`; `POST /api/reports/rescan`.
- `src/public/index.html`: Refresh Incoming button, handler and style.
- `test/p0-incoming-reports.test.mjs` (new).
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`: IS lesson, WAS entry, P0 Incoming follow-ups.

## Automated tests

`npm run check` passes · `npm run compile` passes · **`npm test`: 347 / 347 pass** (340 existing + 7 new) · `git diff --check` clean.

- **P0-1:** a report file event republishes automatically, and a burst publishes once (debounce); a disposed publisher is silent.
- **P0-2:** a `coach.reportGlobs` change disposes the old watchers, watches the new contract and republishes, with no reload.
- **P0-3:** a failed publish never breaks later publishing.
- **P0-4:** real `ControlPlaneDaemon` plus two real `StadiumClient`s (Trend and GS3):
  - **existing-report proof:** published at connect under `game_trend`;
  - **Game isolation:** Trend sees only Trend, GS3 sees only GS3;
  - **new-report proof:** `publishReportsChanged()` delivers without reconnecting;
  - **Refresh Incoming:** rescans the named Game's Stadium (count 3);
  - **offline Game:** 409.
- **P0-5:** source contract.
  - The Stadium scans with `scanReportsForGame(gameId, 10)` resolved from its own context; the unscoped `scanReports(10, true)` is gone.
  - `ReportPublisher` is started, rebuilds on `affectsConfiguration('coach.reportGlobs')`, and publishes through `publishReportsChanged()`.
  - An unknown Game returns `[]`.
  - The Stadium handles `report.rescan`.
- **P0-6:** the Refresh Incoming button posts a rescan for `currentGameId` and reloads that Game's reports; the automatic `status` SSE → `refresh()` path is preserved.
- **P0-7:** the agent comes from the report folder, never the filename.

**Honest test note:** P0-4 exercises the Control Plane and bridge, which were not broken. The two broken boundaries sit in `extension.ts` wiring, which needs the `vscode` API, and are guarded by the P0-5 source contract plus the P0-1..3 behavioural publisher tests.

## Live proofs

- **Existing-report proof (defect, live):**
  - The Trend Stadium reconnected at 00:12:05, after the glob was saved, with the Claude report already on disk.
  - `/api/diagnostics` showed `game_git_ede05e94 reports=0` while `game_git_042782b8` (GS3, equal to the shared selection) showed `reports=10`.
  - Reproduced again after the 00:3x daemon restart: Trend 0, GS3 10.
- **New-report proof (defect, live):** probe file created 00:29:10 in `Reports\Claude\`; after 20 s, Trend `reportCount 0` and `/api/reports?gameId=game_git_ede05e94` count 0. The probe was removed.
- **Game-isolation proof:**
  - The Control Plane associated the Trend session with `game_git_ede05e94` (root `c:\Users\dmcal\Documents\GitHub\Trend and Tap Assist`).
  - Nothing was cross-associated: GS3's 10 reports stayed on GS3's session only.
  - The filter that dropped Trend's reports was the same guard that stops cross-association. It compared against the wrong Game.
- **API / Control Plane proof:**
  - `selectedGameId` was `game_git_ede05e94` and `/api/reports` returned `[]`, faithful to the empty Stadium payload.
  - The fresh daemon (PID 33332) serves the new routes. `/api/reports/rescan` reaches the Stadium (502 only because the Stadium is stale).
- **Fixed-pipeline proof:** automated (P0-4) with real daemon and bridge sockets. **Live proof with the fixed Stadium needs the Game host reload below.**

## Is Refresh Incoming worthwhile?

Yes, as a quiet recovery and diagnostic control.
- It forces a canonical rescan of exactly one Game's Stadium and reports the count, which separates "no reports match this Game's contract" from "the watcher missed an event".
- It never replaces the watcher. The product invariant stays automatic.

## Human mobile proof

1. **Reload the Trend and Tap Assist Game host** (Developer: Reload Window in that Extension Development Host), and GS3 / GameTest if you use them. The daemon is already fresh (PID 33332). Nothing else needs restarting.
2. **Existing report:** on the phone, select **Trend and Tap Assist**. Incoming → Latest Report shows the newest report (AntiGravity `Onboarding-Read-Report…`, agent **AntiGravity**), and Recent reports also lists the Claude `Stage-00-SOP-Onboarding-Adoption…`. No refresh should be needed.
3. **New report, the full loop:** dispatch a small Play to Claude (or AntiGravity), for example "Write a one-paragraph report to `Reports/Claude/Phone-Loop-Proof.md`". Keep the phone on the page. Within a few seconds of the file landing, Latest Report changes to it by itself.
4. **Game isolation:** switch the phone to GS3. Incoming shows GS3's reports only, never the Trend proof report. Switch back: Trend's reports return.
5. **Recovery:** tap **Refresh Incoming**. The toast says "Incoming refreshed · N reports" and the list is unchanged. The button is optional; steps 2–3 must work without it.

## Known constraints

- The Game hosts must be reloaded to run the fixed Stadium code; stale hosts keep the old behaviour. The Stadium build is not visible in diagnostics (breadcrumbed).
- Each publish sends up to 10 full reports over the bridge (payload-size follow-up breadcrumbed).
- `coach.copyLatestReport` and the retired local server routes still use the legacy shared selection (breadcrumbed; outside the Incoming loop).
- File watchers depend on VS Code's workspace watcher. A report written outside the workspace folder is not a Game report and is correctly ignored.

## Breadcrumbs

`Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`:
- **IS:** "Outbound dispatch and inbound reporting are one product contract. A Play is not operationally complete for the human until its result can return through Incoming." — the Stadium owns the report return loop; each Stadium scans only its own Game.
- **Preserved rule:** "Unknown is valid. Automatic report discovery must never fabricate or cross-associate reports between Games."
- **WAS:** how discovery split in Q2.7/Q2.8 and the field evidence.
- **P0 Incoming Follow-ups:** retire the legacy selection from Stadium paths; report payload size; Stadium freshness in diagnostics.

REPORT: P0-Mobile-Incoming-Reports-Regression-Forensics.md
TIMESTAMP: 2026-09-13 00:34 MDT
