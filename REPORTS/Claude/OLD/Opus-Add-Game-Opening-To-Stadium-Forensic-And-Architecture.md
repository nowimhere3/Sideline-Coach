REPORT TYPE: LIVE FORENSIC + BOUNDED REPAIR
AGENT: Claude Code · Claude Opus 5 · High
BRANCH: `q2.8-multigame-field-debug`
WINDOW: 2026-09-15 06:02–06:20 MDT (America/Edmonton)

# Add Game: Opening → Stadium Forensic and Architecture

## 1. EXECUTIVE DECISION

**The human hypothesis is partly right and the control-tower hypothesis is partly right. Neither names the actual break.**

- **Hypothesis: Add Game has no mechanism to launch a development Stadium.** Disproven. Add Game already detects Extension Development Host mode (`extensionMode === 2`). It already builds the correct canonical launch plan: `--extensionDevelopmentPath=<the spawning host's own extension source>` + a per-Game `--user-data-dir` + the chosen folder. It spawns `Code.exe` with that plan.
- **Hypothesis: the new window lacks the canonical dev source.** Disproven. The plan carries it correctly.
- **What is proven:** the spawn happens **inside a VS Code extension host**, and that process's environment contains **`ELECTRON_RUN_AS_NODE=1`** plus VS Code's internal `VSCODE_*` wiring.
  - The child `Code.exe` inherited it and booted as plain Node.
  - It rejected `--user-data-dir` as a bad option and exited **in 35 ms with code 9**.
  - With `stdio: 'ignore'`, nobody saw it. `spawn()` returned normally, so `game.open` reported success.
  - The Game sat in Opening until the 90 s bound expired to "Not connected".
  - The dev harness never hit this because it runs from an ordinary terminal.

**First failed boundary:** B8, spawned process → VS Code instance boots.

**Repair (implemented, bounded, inside the existing architecture):**
1. Scrub inherited VS Code process variables from the development-host environment.
2. Confirm the child did not die on boot before reporting `opened`, so failure is truthful.

No contract changed.

**Proof:**
- Real-child-process regression tests pass. Full suite: **700 / 700**.
- **Live:** the compiled fix, executed inside the real GS3 Stadium extension host (which has `ELECTRON_RUN_AS_NODE=1`), launched gallerytest.
  - Its Stadium arrived and bound to `game_git_7b79a141` within ~9 s, reporting **Connected** with the **current canonical `extensionBuildId`**.
  - The three existing Games remained connected with unchanged sessions.

Status: **FIXED + LIVE/AUTOMATED PROOF — HUMAN UI PROOF PENDING.** One deployment step remains: the existing Stadiums still run pre-fix code (§20).

---

## 2. HUMAN FIELD EVIDENCE

- Add Game from connected GS3 → picker opened → Ai Usage - Real Time and gallerytest selected → browser showed `Game: <name> · Opening… · Stadium: Local Control Plane`; gallerytest listed `Opening…` beside three Connected Games.
- Neither progressed to Connected, and no new VS Code window appeared.

Machine corroboration from `~/.sideline/logs/control-plane.log` (UTC):

```
11:57:14.061 Add Game: registered Ai Usage - Real Time (game_git_3b85b965) from picker result
11:57:14.063 Add Game: published Opening status for Ai Usage - Real Time (game_git_3b85b965)
11:57:14.079 Add Game: opening Ai Usage - Real Time … via inst_…_p23100_… (GS3 Stadium)
12:01:28.750 Add Game: registered gallerytest (game_git_7b79a141) from picker result
12:01:28.751 Add Game: published Opening status for gallerytest (game_git_7b79a141)
12:01:28.768 Add Game: opening gallerytest … via inst_…_p23100_…
(no Registered Stadium session for either Game follows)
```

"opening … via" is logged **only after `game.open` returned `success: true`** (`daemon.ts:1705-1718`).

---

## 3. CURRENT END-TO-END FLOW

```text
Browser  POST /api/game/add
Daemon   handleAddGame → sendRpcToStadium(host, 'game.pick')            [human-paced lifetime]
Stadium  extension.ts pickGameFolder → vscode.window.showOpenDialog → resolveGameContextSync → {folderPath, game}
Daemon   registry.recordKnownGameFromPicker → decideAddGame → markOpening + setSelectedGameId → broadcastStatus
Daemon   sendRpcToStadium(host, 'game.open', {gameId, folderPath, displayName})   [5 s RPC]
Stadium  stadium-client.ts:528 → extension.ts openGameWindow
           chooseOpenStrategy(context.extensionMode)
             1/3 → vscode.openFolder(forceNewWindow)                       [installed product path]
             2   → buildDevelopmentInstancePlan(extensionSourcePath = context.extensionPath, folder, gameId,
                                                devHostsDir = ~/.sideline/dev-hosts)
                   mkdir profile → child_process.spawn(Code.exe, plan.args, {detached, stdio:'ignore'})   ← defect
New host Code.exe boots → Extension Development Host → Coach activates (canonical out/extension.js)
           → ensureControlPlaneRunning (Freshness Guard) → StadiumClient stadium.hello {gameId, extensionBuildId}
Daemon   registerSession → bind gameId → deriveGameState: activeSessionCount 1 ⇒ connected → broadcast
```

---

## 4. BOUNDARY PASS/FAIL MAP

| # | Expected boundary | Actual evidence | Result |
|---|---|---|---|
| B1 | Picker opens on a Stadium | log "repository picker requested … p23100" | **PASS** |
| B2 | Human selection returns path + identity | log "resolved after 18106ms (selected)" | **PASS** |
| B3 | Game identity resolved | `game_git_7b79a141` (git-remote), `game_git_3b85b965` | **PASS** |
| B4 | Registry records Game | log "registered … from picker result"; `/api/games` lists gallerytest | **PASS** |
| B5 | Opening + selected published | log "published Opening status"; browser showed Opening | **PASS** |
| B6 | `game.open` delivered to Stadium and strategy chosen | profile dirs `~/.sideline/dev-hosts/game_git_7b79a141` + `game_git_3b85b965` created at the Add Game times (05:57, 06:01 MDT); these are created only on the `development-instance` branch (`extension.ts:361-362`) | **PASS** (dev strategy, correct) |
| B7 | Launch plan carries canonical implementation + chosen workspace | `buildDevelopmentInstancePlan` uses `context.extensionPath` (GS3 host launched with `--extensionDevelopmentPath=C:\Users\dmcal\Documents\GitHub\SidelineCoach`) and `params.folderPath` | **PASS** |
| **B8** | **Spawned `Code.exe` boots as a VS Code instance** | both new profiles contain **only the two directories Coach created**; zero files written by VS Code (a live host profile, `trend`, has 210 entries); no `Code.exe` process with either profile existed | **FAIL (first)** |
| B9 | Coach activates in new host | cannot occur (B8) | not reached |
| B10 | `stadium.hello` + gameId binding | no "Registered Stadium session" for either gameId | not reached |
| B11 | `extensionBuildId` canonical | not reached | not reached |
| B12 | Opening → Connected | Opening expired after `OPENING_TIMEOUT_MS` (90 s) → `known` ("Not connected") | consequence of B8 |
| B6′ | `game.open` reports failure truthfully when launch fails | reported `success: true`; daemon logged "opening" | **FAIL (masking)** |

---

## 5. FIRST FAILED BOUNDARY

**B8.** `child_process.spawn()` returned without throwing, but the child process never became VS Code. B6′ (truthful failure) also failed, and that failure hid B8 from every layer above it.

---

## 6. ROOT CAUSE

### 6.1 Live environment of the process that ran `game.open`

The GS3 Stadium extension host is PID 23100: the `p23100` in the log, and the target of every Add Game RPC. Read-only `Runtime.evaluate` through its own `--inspect-extensions=9229` returned:

```json
{"pid":23100,"execPath":"C:\\Users\\dmcal\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
 "ELECTRON_RUN_AS_NODE":"1",
 "keys":["CHROME_CRASHPAD_PIPE_NAME","ELECTRON_RUN_AS_NODE","VSCODE_CRASH_REPORTER_PROCESS_TYPE","VSCODE_CWD",
         "VSCODE_ESM_ENTRYPOINT","VSCODE_GIT_ASKPASS_MAIN","VSCODE_GIT_ASKPASS_NODE","VSCODE_GIT_IPC_HANDLE",
         "VSCODE_HANDLES_UNCAUGHT_ERRORS","VSCODE_INJECTION","VSCODE_INSPECTOR_OPTIONS","VSCODE_IPC_HOOK",
         "VSCODE_L10N_BUNDLE_LOCATION","VSCODE_NLS_CONFIG","VSCODE_PID","VSCODE_PYTHON_AUTOACTIVATE_GUARD"]}
```

`spawn(executable, args, { detached, stdio: 'ignore' })` with no `env` passes all of it to the child.

### 6.2 Controlled reproduction (same `Code.exe`, same argument shape, scratch profile + scratch folder, no Coach)

| Environment | Result |
|---|---|
| Inherited (`ELECTRON_RUN_AS_NODE=1` + `VSCODE_*`) | `EXIT 9 after 35 ms · Code.exe: bad option: --user-data-dir=…` · profile entries after 12 s: **0** (identical to the live field signature) |
| Same env, scrubbed | VS Code booted · profile entries after 12 s: **24** (`agent-host, Backups, blob_storage, Cache, …, code.lock, Crashpad`) |

The scratch instance was closed afterwards by exact profile-path match (9 processes → 0).

### 6.3 Why pre-launched Games worked

`tools/dev/launch-games.mjs` spawns the identical plan from a terminal shell, which has no `ELECTRON_RUN_AS_NODE`. Same plan, different parent environment.

### 6.4 Latent secondary defect

The asynchronous `'error'` event (e.g. `ENOENT`) had no listener, so a bad executable path would have thrown an unhandled error inside the extension host instead of failing the open.

---

## 7. DEVELOPMENT VS INSTALLED EXTENSION CONTRACT (frozen)

The Dad-facing flow is identical in both environments: **Choose folder → Opening → Stadium arrives → Connected**. Only the plumbing differs.

| | **A: Installed / production** | **B: Extension Development Host** |
|---|---|---|
| Selected by | `context.extensionMode` 1 or 3 | `context.extensionMode` 2 |
| Mechanism | `vscode.openFolder(folder, {forceNewWindow})` in the human's own VS Code; the installed Coach activates by itself | spawn a **separate VS Code instance**: `--user-data-dir=<~/.sideline/dev-hosts/<gameId>>` `--extensions-dir=…` `--disable-workspace-trust` `--extensionDevelopmentPath=<spawning host's context.extensionPath>` `<chosen folder>` |
| Environment | handled by VS Code | **child env must have `ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ATTACH_CONSOLE`, `CHROME_CRASHPAD_PIPE_NAME`, `VSCODE_*` removed** |
| Implementation identity | the installed extension | canonical dev source = the implementation already serving the Stadium that performs the open; never the Game folder |
| Content identity | chosen folder | chosen folder |
| `game.open` success means | VS Code accepted the open command | the host process survived the boot-confirmation window (2.5 s) **or** handed off to an already-running instance for that profile (exit 0) |
| Connected means | a `stadium.hello` bound to the gameId | same, plus `extensionBuildId` = canonical (dev evidence) |
| Launch failure | `game.open` fails → Opening cleared → truthful message | same |
| No Stadium after a successful launch | Opening expires at 90 s → Not connected / Offline | same |

---

## 8. CURRENT ROLE OF dev-games.json

**Answer A: a developer convenience list for the harness launcher only.**
- No file under `src/` references it.
- Add Game's development path neither reads nor needs it. Per-Game profiles are derived from `gameId` under `~/.sideline/dev-hosts/`.
- Newly added Games must **not** be written into it.

Current content still points the `gs3` entry at `../Ai Usage - Real Time` while the connected GS3 host is `../GS3`. That drift is real but **unrelated** to this defect: it affects only the next full `npm run dev:games`. Left untouched.

---

## 9. CURRENT ROLE OF host-launch-plan

`tools/dev/host-launch-plan.mjs` builds harness plans from `dev-games.json` and always derives `extensionDevelopmentPath` from the repo root. It is **not** used by Add Game. `src/game-window-opener.ts` is the in-extension equivalent, and it reuses the Q2.8G shape: separate `--user-data-dir` per host, canonical dev path. The two agree on shape.

This fix does not merge them. The harness runs in a terminal and never needed env scrubbing.

---

## 10. game.open FINDINGS

- The RPC is delivered to the same Stadium that showed the picker, with a 5 s ordinary RPC timeout.
- The daemon already clears Opening and returns a failure on `success:false` or on RPC error (`daemon.ts:1692-1716`, test E6). That behaviour was correct but never triggered, because the Stadium reported success for a dead launch.
- After the fix, the Stadium can return `failed` with `The development host exited immediately (code N)` or an `ENOENT` message. The existing E6 path then clears Opening immediately instead of after 90 s.

---

## 11. vscode.openFolder FINDINGS

- It is used only when `extensionMode !== 2`. It is **correct for the installed product** and **correctly avoided in development**: a plain window from an Extension Development Host would contain no Coach.
- The fix does not touch this path. It is not exercised by the current field setup (all Stadiums are dev hosts) and remains **unproven live** for a packaged install.

---

## 12. CANONICAL DEV SOURCE IMPLICATIONS

- The new host's implementation is the **spawning Stadium's** `context.extensionPath`. If an Add Game were performed from a stale or non-canonical Stadium, the new host would inherit that source path.
  - All current hosts use `C:\Users\dmcal\Documents\GitHub\SidelineCoach`.
  - The host loads `out/` **as it exists on disk at launch**, so a Game added after a compile gets the newest build, even when older Stadiums lag.
- Live: gallerytest reports `cp-9ad907ddbc5004c02fa2068d` = the current canonical build. GS3/GameTest/Trend report `cp-5ee797ded1d03adaf1a61f2b` (compiled before this fix) and are correctly flagged `WRONG EXTENSION SOURCE` by `dev:verify`.
- Game-local `.vscode/launch.json` plays no part: the plan passes the implementation explicitly.

---

## 13. SMALLEST CORRECT REPAIR

`src/game-window-opener.ts` (VS Code-free, testable):

1. **`buildDevelopmentInstanceEnv(parentEnv)`** returns a copy without `ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ATTACH_CONSOLE`, `CHROME_CRASHPAD_PIPE_NAME`, `VSCODE_*`. Everything else is preserved, and the parent is never mutated.
2. **`launchDevelopmentInstance({spawn, executable, plan, parentEnv, confirmMs = 2500})`** spawns detached with the scrubbed env and resolves:
   - `started`: still alive after the window;
   - `handed-off`: exit 0, meaning an instance for that profile already runs and took the folder;
   - `failed`: async `'error'`, non-zero exit or signal inside the window, or a synchronous throw.

   The 2.5 s window stays inside the 5 s `game.open` RPC; the observed failure takes 35 ms. **Started is not Connected**: only `stadium.hello` makes a Game Connected.

`src/extension.ts` `openGameWindow` (development branch) uses `launchDevelopmentInstance` and returns `failed` truthfully. The product branch is unchanged.

**Not changed:**
- daemon;
- registry;
- Opening lifecycle;
- `decideAddGame`;
- picker lifetime;
- harness;
- `dev-games.json`;
- Game repositories.

---

## 14. FILES CHANGED

| File | Change |
|---|---|
| `src/game-window-opener.ts` | + `buildDevelopmentInstanceEnv`, `launchDevelopmentInstance`, `DEVELOPMENT_LAUNCH_CONFIRM_MS`, `SpawnLike`, `DevelopmentLaunchOutcome` |
| `src/extension.ts` | development open branch uses the confirmed, env-scrubbed launcher; import |
| `test/add-game-development-host-launch.test.mjs` | new (DH1–DH6) |
| `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` | WHY rule (§19) |
| this report | new |

The pre-existing dirty files (`daemon.ts`, `index.html`, several tests, prior reports) were left untouched.

---

## 15. AUTOMATED PROOF

`test/add-game-development-host-launch.test.mjs` uses **real `child_process.spawn`**. Only the executable is redirected to a stand-in that behaves like `Code.exe`: as Node under `ELECTRON_RUN_AS_NODE=1`, otherwise as the app. The parent env is the live-observed extension host shape.

| Test | Proves |
|---|---|
| DH1 | scrub removes `ELECTRON_RUN_AS_NODE`, `CHROME_CRASHPAD_PIPE_NAME`, all `VSCODE_*`; keeps `PATH`, `SIDELINE_DIR`; parent not mutated |
| DH2 | **former failure reproduced:** the old spawn shape exits 9 with an empty profile |
| DH3 | launch from the extension-host env boots: profile written, no inherited VS Code vars, exactly one `--extensionDevelopmentPath` = canonical source, last arg = chosen Game folder |
| DH4 | real Node with the real plan args (`bad option`, code 9) → `failed`, never `opened` |
| DH5 | missing executable → `failed` (`ENOENT`), no unhandled error |
| DH6 | exit 0 hand-off to a running instance → `handed-off`, not failure |

Daemon-level convergence is already covered by `add-game-endpoint.test.mjs`:
- E2: Opening → Connected on Stadium hello;
- E3: already-connected selects rather than duplicates;
- E6: failed open clears Opening;
- E12–E14: picker lifetime / serialization.

Results:
- Targeted: DH1–6 + E1–14 = **20/20**.
- Full `npm test`: **700 pass / 0 fail**.

---

## 16. LIVE MACHINE-OBSERVABLE PROOF

**Before** (06:11 MDT):
- GS3 / GameTest / Trend connected.
- gallerytest `known`, selected, no host process.

**Action:** the compiled fix (`out/game-window-opener.js`) was loaded **inside the real GS3 Stadium extension host (PID 23100, `ELECTRON_RUN_AS_NODE=1`)** via its inspector. It ran `launchDevelopmentInstance` with `process.execPath` (Code.exe), `process.env`, and the plan for gallerytest with canonical source.

This is the exact code path `openGameWindow` now executes, in the exact environment that failed. The daemon's `game.open` RPC was not re-driven, because the running Stadium still has pre-fix code loaded and re-driving it requires the human picker.

**Disclosure:**
- My first attempt had a probe-script path-escaping error: arguments `C:UsersdmcalDocuments…`.
- It still booted, confirming the env scrub, but with an invalid workspace.
- That instance was closed by exact profile-path match (9 processes → 0) before the correct launch.

**Result:**

```
outcome: {"kind":"started"}   parent ELECTRON_RUN_AS_NODE: "1"
args: --user-data-dir=C:\Users\dmcal\.sideline\dev-hosts\game_git_7b79a141\user-data
      --extensions-dir=…\game_git_7b79a141\extensions --disable-workspace-trust
      --extensionDevelopmentPath=C:\Users\dmcal\Documents\GitHub\SidelineCoach
      C:\Users\dmcal\Documents\GitHub\gallerytest
log 12:12:27.444Z Registered Stadium session: inst_stadium_win32_9500f2f1ed7b_p48396_1789474347429_1
log 12:12:27.446Z Stadium session … bound to Game: gallerytest (game_git_7b79a141)
/api/games: gallerytest connectionStatus "connected" (first poll, ≈9 s after launch)
session extensionBuildId: cp-9ad907ddbc5004c02fa2068d == canonical expected cp-9ad907ddbc5004c02fa2068d
/api/routines/sources/browse?gameId=game_git_7b79a141 → 200, entries: Reports and Docs, src, tools, index.html, README.md … (gallerytest's own tree)
GS3 p23100, GameTest p14184, Trend p53744: still connected, sessions unchanged
dev:verify --expect=4: 4 connected; gallerytest ✓ canonical; other three ✗ pre-fix build (expected, §12)
```

The gallerytest development host window was **left running**. It is the Game the human asked to add.

---

## 17. HUMAN FIELD PROOF — PENDING

Not claimed. Human UI proof requires the Stadium that serves the picker to run the fixed code (§20).

1. Start with three connected Games (after the reload in §20).
2. Click **+ Add Game** and choose a fourth real repository not currently connected. gallerytest is already connected now; Ai Usage - Real Time or another repo works.
3. Observe **Opening…**.
4. Without touching VS Code: a new VS Code window opens on that repository, Coach activates, and the Stadium connects.
5. The Game changes to **Connected**.
6. Switch among all Games; existing Games stay Connected; the new Game stays registered and usable (e.g. Coach Refresh → Add references browses its own files).
7. No refresh, launch.json edit, config edit, manual dev-host start, or Remove/Add.

Passing statement: *"I chose the folder, Sideline opened the Game, and it became Connected by itself."*

---

## 18. REMAINING RISKS

- **Existing Stadiums run pre-fix code** until reloaded. An Add Game served by them still fails exactly as before.
- **Installed-product `vscode.openFolder` path** is unchanged and unproven live (no packaged install in use).
- **Hand-off heuristic:** exit 0 inside 2.5 s is treated as "instance for this profile already running". If a future VS Code release changed that semantics, a failed hand-off would surface as Opening timeout rather than a message. This is bounded, not silent-forever.
- **Opening timeout UX:** after 90 s the Game shows "Not connected" rather than an explicit "couldn't open" message. That is truthful but terse; a separate Dad copy question.
- **Implementation inheritance:** a new dev host inherits the spawning Stadium's `extensionPath`. The Add Game serving Stadium must itself be canonical; `dev:verify` remains the guard.
- **Ai Usage - Real Time (`game_git_3b85b965`)** is not in the active `/api/games` list now and has an empty dev profile from the failed attempt. It should be retried via Add Game after the reload.
- **`dev-games.json` GS3 drift** (§8), unrelated; it affects only full harness launches.
- **`server.ts` legacy path:** not involved in Add Game.

---

## 19. FROZEN DECISIONS

1. **Game registration ≠ Game opening ≠ Stadium creation.** Registration makes a Game known. Opening is a launch attempt with a bounded lifetime. Only a `stadium.hello` bound to the gameId creates Connected. Nothing upstream may manufacture Connected.
2. **A spawn call returning is not a launch.** An open succeeds only if the host survives a bounded boot window or hands off to an existing instance; otherwise `game.open` fails truthfully and Opening clears.
3. **Anything a Stadium spawns that must boot as VS Code/Electron gets a scrubbed environment.** No `ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ATTACH_CONSOLE`, `CHROME_CRASHPAD_PIPE_NAME`, `VSCODE_*`. Extension hosts carry `ELECTRON_RUN_AS_NODE=1`; a terminal does not, so harness success never proves in-extension launches.
4. **Development open = separate instance, canonical implementation, chosen content.** `--extensionDevelopmentPath` comes from the serving host's own extension source; the chosen folder is content only; per-Game profile under `~/.sideline/dev-hosts/<gameId>`.
5. **Installed open = `vscode.openFolder`.** Selected by `extensionMode`, never by folder contents.
6. **`dev-games.json` is harness tooling, not a Game registry.** Added Games are never written into it.

---

## 20. EXACT NEXT HUMAN ACTION

1. In each of the three existing Game windows (GS3, SidelineCoach-GameTest, Trend and Tap Assist), run **Developer: Reload Window** once. This loads the fixed extension into the Stadiums that serve Add Game.
   - Controlled Players resume their sessions across reload (field-proven Stage 1.19/1.21).
2. Optional check: `npm run dev:verify -- --expect=4` should show all four ✓ canonical.
3. Perform the §17 field proof with a repository that is not currently connected (e.g. **Ai Usage - Real Time**).

REPORT: Opus-Add-Game-Opening-To-Stadium-Forensic-And-Architecture.md
TIMESTAMP: 2026-09-15 06:20 MDT (America/Edmonton)
