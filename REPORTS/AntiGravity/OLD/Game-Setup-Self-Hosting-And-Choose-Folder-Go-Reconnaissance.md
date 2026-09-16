REPORT FILE:
Game-Setup-Self-Hosting-And-Choose-Folder-Go-Reconnaissance.md

REPORT TIMESTAMP:
2026-09-14 12:19 MDT (Calgary, Alberta — America/Edmonton)

---

# Game Setup, Self-Hosting, and Choose-Folder-Go Reconnaissance

**Report:** Q2.10-RECON-GAMESETUP  
**Agent:** AntiGravity  
**Mode:** READ-ONLY. No source, tests, docs, settings, or reports modified (except this file).  
**Branch:** `q2.8-multigame-field-debug`  
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

---

## 1. Executive Answer

**Can SidelineCoach safely coach SidelineCoach?**

### Answer: YES WITH CONDITIONS

**Conditions:**
1. The extension must be **packaged/installed** (VSIX). In development mode (`ExtensionMode.Development`) the structural VS Code EDH constraint applies (see §2) and self-hosting requires a separate VS Code instance — identical to how `SidelineCoach-GameTest` was historically used.
2. Players editing SidelineCoach source must understand that **compile + daemon replacement** will affect ALL active Games simultaneously. This is a workflow hazard, not an architectural block.
3. The SidelineCoach source's `gameId` (derived from its git remote SHA-256 hash) must not already be registered in a conflicted state.

**Evidence:**
- `src/game-window-opener.ts:chooseOpenStrategy()` — Production mode returns `vscode-open-folder`; that path has no EDH constraint. Players in the new window activate normally.
- `src/game-identity.ts:resolveGameContextSync()` — SidelineCoach has a git remote; Tier 2 fingerprint is stable and independent of the extension source path.
- `src/game-lifecycle.ts:decideAddGame()` — already-Connected returns `select-existing`, not a crash.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` line 200: "Once packaged, any repository — including SidelineCoach itself, opened intentionally — can be a Game."
- No architectural invariant prevents self-hosting. The Freshness Guard keys on daemon installation path + build identity, never on gameId.

---

## 2. Why SidelineCoach-GameTest Exists

### Exact Cause

VS Code's main process short-circuits `openExtensionDevelopmentHostWindow()`:

```
const existing = findWindowOnExtensionDevelopmentPath(getWindows(), paths);
if (existing) { lifecycleMainService.reload(existing, opts.cli); return; }
```

`getWindows()` is scoped to one VS Code instance (keyed by `--user-data-dir`). Two `extensionHost` debug configurations sharing the same `--extensionDevelopmentPath` in one VS Code instance always reload the first window rather than opening a second. This is why the `launch.json` compounds approach never worked.

### `SidelineCoach-GameTest` Contents

A **full historical copy** of the SidelineCoach source at an earlier stage (pre-Q2.7 architecture). Its README describes the old Stage 1 terminal-allowlist architecture. No `.sideline/game.json` marker. Not a minimal scaffold.

### Does the Limitation Still Exist?

**Yes.** It is a permanent VS Code process-model property. But it applies **only to Extension Development Host topology** (development mode). It does NOT apply to:
- Packaged/installed extensions (`vscode.openFolder` path)
- Any customer installation

### Q2.8G Harness — Is It the Right Seam?

Yes. `tools/dev/launch-games.mjs` + `tools/dev/dev-games.json` (isolating each Game in its own `--user-data-dir` / `--extensions-dir`) is the correct development-mode workaround. `dev-games.json` still references `SidelineCoach-GameTest` as the second game (`"gametest"`, port 9230). Current `launch.json` replaced it with `GS3` + `Trend and Tap Assist` but `dev-games.json` was not updated.

### Is GameTest Still Structurally Necessary?

**No.** The dev harness supersedes it. GameTest is a stale historical artifact. Removing or ignoring it has no product impact.

---

## 3. Current Add Game Pipeline

### Q2.9 Product Path (browser → `POST /api/game/add`)

```
Browser: POST /api/game/add
  ↓
daemon.ts:handleAddGame() [line 1532]
  → pickHostSession(): selected Game's window, or any connected session
  → RPC "game.pick" → Stadium
      ↓
  stadium-client.ts [line 512]
    → options.pickGame() → extension.ts:pickGameFolder() [line 276]
      → vscode.window.showOpenDialog (native folder picker, canSelectFolders)
      → resolveGameContextSync({ workspaceFolder: fakeFolder, memento: globalState })
          Tier 1: .sideline/game.json → game_marker_<id>
          Tier 2: git remote origin → SHA-256[0:8] → game_git_<hash>
          Tier 3: local registry (non-git) → game_reg_<hex>
          Tier 4: 'unknown' → rejected
      → registerGameInRegistry() in globalState (Stadium-local)
      → returns { success, folderPath, game }
      ↓
  daemon.ts:handleAddGame() receives GamePickResult
    → registry.recordKnownGameFromPicker() — known in Control Plane registry
    → decideAddGame() [game-lifecycle.ts:100]
        connected?     → select-existing (switch to it)
        opening?       → already-opening (show progress)
        conflicted?    → conflicted (block, 409)
        unresolved?    → unresolved (error, 400)
        otherwise      → open-window
    → registry.markOpening(gameId) — sets openingSince
    → registry.setSelectedGameId(gameId)
    → broadcastStatus() — SSE fires, browser gets Opening state
    → RPC "game.open" → Stadium
        ↓
    stadium-client.ts [line 525]
      → options.openGame(params) → extension.ts:openGameWindow() [line 320]
        Production (ExtensionMode = 1):
          vscode.commands.executeCommand('vscode.openFolder', Uri.file(path), { forceNewWindow: true })
        Development (ExtensionMode = 2):
          buildDevelopmentInstancePlan() → spawn new VS Code instance
          --user-data-dir + --extensions-dir per gameId
          --extensionDevelopmentPath = extension source
          --disable-workspace-trust
        ↓
    New VS Code window activates
      → extension.ts:activate()
        → resolveGameContextSync() for new workspace
        → registerGameInRegistry() — registers in Stadium's globalState
        → playerControlHost + playerRoster initialized
        → ensureControlPlaneRunning() → Freshness Guard → reuses existing daemon
        → StadiumClient.connect() → outbound WebSocket to daemon on port N
            ↓
    daemon.ts:handleStadiumHandshake()
      → registry.registerSession()
      → registry.setGame() → recordKnownGame() — hasEverConnected=true, openingSince=undefined
      → broadcastStatus() → SSE: Game is now Connected
```

### Automatic vs. Manual — What Happens Today

| Step | Auto | Manual |
|---|---|---|
| Open native folder picker | ✓ | — |
| Resolve Game identity (git remote / marker) | ✓ | — |
| Register in Control Plane registry | ✓ | — |
| Open VS Code window | ✓ | — |
| Activate extension in new window | ✓ | — |
| Connect Stadium to Control Plane | ✓ | — |
| SSE broadcast → browser update | ✓ | — |
| Set up report watchers | ✓ (ReportPublisher on connect) | — |
| Configure `coach.reportGlobs` for non-default paths | — | Human |
| Check Players / recruit Players | — | Human |
| Put Players on Field | — | Human |

### Known Gap — New Game Not Appearing in Browser List

**Documented field failure** (ARCHITECTURE-BREADCRUMBS.md line 401): after `+ Add Game`, the picked repo never appeared in the Game dropdown. Root cause not definitively proved. Hypotheses: dev-mode `development-instance` spawn takes too long before SSE catches the `Opening → Connected` transition; browser game-list rendering does not re-render on the Opening state; stale daemon during the field test masked real behavior. This needs a targeted forensic Play against a known-fresh daemon.

---

## 4. Current Game Contract

### Required for Correctness

| Requirement | Mechanism | Notes |
|---|---|---|
| A folder VS Code can open | `vscode.openFolder` / dev spawn | Any valid filesystem path |
| Git remote OR `.sideline/game.json` | `resolveGameContextSync()` Tiers 1–2 | Without these, gameId = 'unknown' → rejected |
| Stable `gameId` | SHA-256(normalizedGitRemote) or marker | Path-independent across moves |

### Recommended (Better Experience)

| Recommendation | Mechanism |
|---|---|
| Git remote origin | Most portable identity (cross-machine, rename-safe) |
| `.sideline/game.json` | Tier 1 — highest priority, explicit, survives remote changes |
| `coach.reportGlobs` in workspace settings | Map to repo's existing report structure |

### Optional

- Named report subdirectories (Coach reads whatever the glob finds)
- `CONTRIBUTING.md` / `DEVELOPMENT.md` / `ARCHITECTURE.md` (Slice C `suggestSources()` heuristics)
- `.sideline/` local runtime state (never committed; gitignored)

### Future

- Standard Report Contract (`next-play` metadata in reports)
- Coach Brief (compact context summary)
- Game Playbook / SOP contract mapping
- Per-Game `~/.sideline/preferences.json` sections

### What Coach Does NOT Require

- No reorganization of existing folder structure
- No `Docs REPORT/` directory (glob is configurable)
- No commit or push of any Sideline-specific file
- No new branches or tags

---

## 5. Missing Bootstrap Mechanics

| Gap | Severity | Notes |
|---|---|---|
| `+ Add Game` doesn't show new Game in browser list | HIGH | Field-proven failure; open forensic item |
| No auto-suggestion of `coach.reportGlobs` based on repo structure | MEDIUM | Human must configure manually for non-default paths |
| No auto-discovery of existing report directories on Game connect | MEDIUM | `suggestSources()` (Slice C) exists but is not wired to Game-connect event |
| No Player auto-discover on Game first connect | LOW–MEDIUM | Human must click "Check Players" manually |
| No onboarding summary ("Coach found these docs, these report paths") | MEDIUM | No "Coach checks setup…" moment exists yet |
| Git-only repos with no remote → Tier 3 (root commit SHA fallback async) | LOW | `resolveGameContext()` async handles it; sync fallback leaves `unknown` until async completes |
| Non-git repos (no remote, no marker) → Tier 3 registry (path-keyed, breaks on move) | MEDIUM | Marker is the clean answer for non-git repos |

---

## 6. Self-Hosting Hazards

| Hazard | Current Protection | Remaining Gap | Severity |
|---|---|---|---|
| SidelineCoach source repo registered as duplicate Game | `decideAddGame()` returns `select-existing` if already connected | None if packaged; dev-mode requires separate `--user-data-dir` | LOW |
| Players edit extension source → `npm run compile` → daemon replacement | Freshness Guard (P0.1) replaces daemon safely; Stadiums reconnect | All active Games lose their session briefly during replacement; Plays interrupted become Unknown | MEDIUM |
| Players edit `src/control-plane/**` → new daemon binary → Guard replaces live daemon | `closeAllConnections` + hard exit; Stadiums auto-reconnect | Brief interruption of ALL Games, not just SidelineCoach-as-Game | MEDIUM |
| Game identity collision (SidelineCoach source window + SidelineCoach Game window same git remote) | `decideAddGame()` handles `conflicted` state | In dev mode: two EDH windows with same `--extensionDevelopmentPath` → VS Code reload bug applies | LOW (packaged) / HIGH (dev) |
| Report watchers observing source repo files as "reports" | `coach.reportGlobs` limits scope; default glob `**/Docs REPORT/**` won't match `REPORTS/` | Human must verify glob config; auto-suggest on connect would help | LOW |
| Players editing their own control contract (extension source) | No architectural block; ownership is still `coach-managed`; destructive actions require `ownership` gate | Players can delete/modify any file they have permission for | MEDIUM |
| Daemon replacement while a Play is active in SidelineCoach-as-Game | Turn outcome becomes Unknown (existing invariant); no auto-resend | Human must check result manually | LOW |
| `coach.addGame` legacy path (VS Code command) doesn't fully drive Q2.9 lifecycle | Already known; browser `+ Add Game` uses the full path | Legacy command returns early; registered in globalState only | LOW |
| Self-launch loops (extension auto-start coaching itself) | Extension activates on workspace open; `autoStart: true` connects the Stadium; no loop possible — one Stadium, one outbound connection | None | SAFE |
| Development harness recursion | `tools/dev/launch-games.mjs` is dev-only; product path is `vscode.openFolder`; no recursion path | None in product | SAFE |
| SidelineCoach game identity same as SidelineCoach source identity (same `gameId`) | `registerGameInRegistry()` deduplicates by `gameId`; existing record updated, not duplicated | `conflicted` state if both source window and game window claim same `gameId` simultaneously (dev mode only) | LOW (packaged) / MEDIUM (dev) |
| Accidental SidelineCoach-GameTest re-registration | GameTest repo has its own git remote; separate `gameId`; no overlap | GameTest stale reference in `dev-games.json` could open if harness used | TRIVIAL |

---

## 7. Add / Remove Lifecycle

### Current Implemented States

`known → opening → connected → offline → archived` (source: `src/game-lifecycle.ts`)

### Recommended Dad-Facing Semantics (2 Human Actions)

**Add Game** → one action, complete lifecycle:
- Human picks folder → Coach opens it, connects, done.
- Already open? Coach switches to it.

**Remove Game** → one action, two sub-intents:
- "Done for now" (window close / Go for a walk) → **Game goes Offline automatically.** No human action needed; it re-appears as Offline when the human returns.
- "Done with this project" → **Archive** ("Take this Game out of Sideline"). Registry-only; repository untouched; reversible via Restore.

**Verdict: two human-facing concepts, not six.**

| Human says | Mechanic | State |
|---|---|---|
| `+ Add Game` | Pick folder → open window → activate | known → opening → connected |
| Close VS Code window | Automatic | connected → offline |
| Reopen folder / reconnect | Automatic on activation | offline → connected |
| "Take this out of Sideline" / Archive | Registry flag | any → archived |
| Restore | Registry un-flag | archived → offline / connected |

**Constraints:**
- Archive must never delete or modify the repository (already enforced: `StadiumRegistry.archiveGame()` is pure registry).
- Offline ≠ Archived — NEVER collapse them (`game-lifecycle.ts:6`).
- A Game the human deliberately reopened is NOT archived (`recordKnownGame()` line 377–378: `isArchived = false` on reconnect).

---

## 8. Generic Repository Strategy

### Principle

> Map to existing structure. Create only the minimum Sideline-owned state actually required.

### What "Minimum Sideline-Owned" Means

| Item | Where | Committed? | Required? |
|---|---|---|---|
| `.sideline/game.json` | Repo root | Optional | Only for Tier 1 identity (non-git or rename-proof) |
| `~/.sideline/` (Control Plane state, token, stadium-id) | Home dir | Never | Always |
| `~/.sideline/play-queue.json`, `work-ledger.json` | Home dir | Never | Runtime only |
| Report watcher glob config | `.vscode/settings.json` (workspace) | Recommended | No — default glob works for `**/Docs REPORT/**` |
| Runtime provenance marker `<!-- sideline-provenance: … -->` | Inside reports | By Player | Controlled Players only; invisible |

### Generic Repo Identity Resolution

| Repo type | Tier used | Stability |
|---|---|---|
| Has git remote | Tier 2 → `game_git_<hash>` | Excellent — cross-machine, rename-safe |
| Git, no remote | Tier 2 fallback (async) → root commit SHA | Good — breaks only if repo cloned with no history |
| Non-git folder | Tier 3 → `game_reg_<hex>` (path-keyed) | Poor — breaks on folder move; marker recommended |
| `.sideline/game.json` | Tier 1 → `game_marker_<id>` | Best — explicit, portable, stable |

---

## 9. Existing Repo Adoption

### Report Discovery

Current mechanism: `coach.reportGlobs` in VS Code workspace settings. Default: `**/Docs REPORT/**/*.{md,txt}`.

**For a generic repo**, the human configures this to match whatever report structure exists:
- `**/REPORTS/**/*.md` (SidelineCoach style)
- `**/docs/reports/**/*.md` (other style)
- `**/Reports-SC/**/*.md` (future Sideline-owned default)

**Recommendation:** Coach should detect existing report/docs directories on Game connect and suggest glob mappings rather than requiring manual configuration. This is the missing "Coach checks setup…" moment.

### SOP / Docs Discovery

`src/routine-sources.ts:suggestSources(rootFsPath)` scans up to depth 3 using 11 heuristic patterns. The patterns already cover generic repo conventions:
- `README.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, `ARCHITECTURE*.md`
- `docs/**/*.md`, `documentation/**/*.md`
- SidelineCoach-specific: `NORTH-STAR.md`, `SOP*.md`, `breadcrumbs*.md`, `REPORTS/*/`

**This is the right seam for onboarding.** It does not require reorganization.

### Reports-SC Question

A Sideline-owned report root (`<GAME ROOT>/Reports-SC/`) is not required but has a use:

| Approach | Pros | Cons |
|---|---|---|
| Configurable glob (current) | Zero repo pollution; maps to existing structure | Human must configure for non-default paths |
| Standard `Reports-SC/` | Predictable; Players know where to write; no glob config | Adds Sideline structure to every repo; reorganization pressure |
| Coach creates `Reports-SC/` only when no report contract found | Best of both; minimal footprint | Requires detection logic; adds a bootstrap step |

**Recommendation (principles, not decision):**
- If existing report directories are found → map them (glob auto-suggest).
- If none found → offer `Reports-SC/` creation as an opt-in step, not automatic.
- Players learn the report destination via the Coach Provenance footer (Q2.10E-A) + per-Play instructions — not from static folder convention.

---

## 10. Coach Routines Integration Seam

### What Exists (Slice C)

- `src/routine-sources.ts:suggestSources(rootFsPath)` — heuristic scan up to depth 3
- `src/routine-sources.ts:browseSources(rootFsPath, dir?)` — manual directory browse
- `src/routine-sources.ts:checkSources(rootFsPath, paths[])` — validate + security-check paths
- Security boundary: deny-list enforced (`.git`, `node_modules`, `.env*`, `*.pem`, `*.key`, secrets, `.sideline`)
- RPC endpoints wired: `routine.sources.suggest`, `routine.sources.browse`, `routine.sources.check`

### What Is Not Yet Wired

`suggestSources()` is available as an RPC but is **not called automatically on Game connect**. There is no "Coach checks setup…" moment.

### Recommended Seam (future, not now)

On Game first connect (when `hasEverConnected` flips from false to true):
1. Auto-run `suggestSources(rootFsPath)` — non-blocking, Stadium-side
2. Surface result as a one-time suggestion: "Coach found these docs — add them to Coach Refresh?"
3. Human confirms, skips, or picks differently
4. Sources added to the Game's Coach Routines

**This must remain advisory.** Coach never silently reads or sends arbitrary repository contents.

---

## 11. Diagnostics Integration Seam

### Current Architecture

`Diagnostics/CONTRACT.md`: preflight collector observes build, launch, port, copy identity from OUTSIDE the extension host. It does NOT import VS Code APIs. It writes only `Diagnostics/local/CURRENT.md`. It never acts.

`PLAYERS` and `Player Control Host` sections are explicitly unknown to the external preflight collector — they live in `workspaceState` which is VS Code-internal.

### What Game Setup Should Do

**Nothing mandatory.** Diagnostics observe; they do not participate in Game setup.

Reasonable future seam: after a Game connects, the browser could offer "Run Diagnostics" as an optional deep-check action — not part of the bootstrap flow. This keeps diagnostics as a diagnostic, not a gatekeeper.

**What Game Setup must NOT do:**
- Run the preflight collector as a prerequisite for Add Game
- Block Play Ball on any diagnostic assertion
- Install, configure, or modify Diagnostics for a newly added Game

---

## 12. Player Recruitment Boundary

### Principle (from NORTH-STAR.md §9: Explicit Human Choice Outranks Inference)

> Automation fills a vacuum. It does not overwrite deliberate human choice.

### Current Boundary

| Action | Automatic | Human |
|---|---|---|
| Player discovery (installed? authenticated? running?) | ✓ (Stadium-scoped probe) | Triggered by "Check Players" click |
| Offer "Add to Roster" for discovered Players | ✓ (shown in Scouting) | Human clicks Add |
| Adopt running Players | Option: auto-add (preference `auto-add`) | Human confirms by preference choice |
| Put Player on Field | — | Human clicks Put on Field |
| Launch controlled Player | ✓ (Coach manages process) | Human clicks Add / recruits |

### For Game Bootstrap

Game Setup should:
1. **Not** automatically discover Players on Game add — too aggressive; user intent unclear
2. **Offer** a "Check Players" prompt or button after Game connects — surfaces what's available
3. **Never** silently put Players on Field
4. **Never** silently launch reasoning agents because a folder was added

**Recommended bootstrap sequence for Players:**
```
Game Connected → "Ready. Check Players?" [button] → Human clicks → Discovery runs → 
"Claude available / Codex available / Terminal available" → Human recruits → Play ball
```

---

## 13. Minimum Viable Game Bootstrap

### Smallest Implementation That Creates Real Value

**Fix the one confirmed field failure first:** new Game not appearing in browser list after `+ Add Game`. Without this, nothing else matters.

**After that, in order:**

1. **Auto-suggest `coach.reportGlobs`** — detect existing report/docs directories on Game first connect; suggest glob in UI ("Coach found reports at `REPORTS/`. Connect them? [Yes] [Configure]")

2. **One-time `suggestSources()` on Game first connect** — surface Slice C result as "Coach found these docs for refresh" — human confirmation only; no auto-read

3. **"Check Players" prompt after Game connects** — single button or inline prompt; does not auto-recruit

4. **Unified "Coach checks setup…" status display** — not a gating flow; a transparent status pass after Game connects

### What That Looks Like (Sketch)

```
+ Add Game → [folder picker] → Opening… → Connected ✓

Coach checks setup:
  ✓ Game identity: GS3 (git remote)
  ✓ Reports: found at REPORTS/**/*.md [Connect] [Skip]
  ✓ Project docs: README.md, ARCHITECTURE.md found [Add to Coach Refresh] [Later]
  ○ Players: not checked yet [Check Players]

[ Play Ball ]
```

**What decisions genuinely require the human:**
- Which report directory to use (if ambiguous or non-default)
- Which docs to add to Coach Refresh (Coach suggests; human approves)
- Which Players to recruit (Coach shows availability; human chooses)
- Whether to archive vs. just close (human intent)

**Everything else Coach performs or truthfully shows.**

---

## 14. Recommended Architecture Questions

Questions the next Sonnet 5 / Opus 5 architect actually needs to decide:

1. **Fix `+ Add Game` first or design full bootstrap first?** The field failure is blocking. The bootstrap design is desirable. They are independent — fix can happen in isolation.

2. **Where does the "Coach checks setup" moment live?** Options: (a) on Game connect event in daemon, (b) on first browser open after Game connects, (c) explicit user trigger. Decision affects SSE event shape and daemon changes.

3. **Should report glob auto-suggest be a daemon-side capability or a Stadium-side scan?** Stadium owns the filesystem; daemon owns the broadcast. Same seam as Slice C but for report directories.

4. **Standard `Reports-SC/` or glob auto-suggest?** Two independent product decisions. Neither blocks the other. Choose which to implement first.

5. **Should `suggestSources()` run on every Game connect or only on first connect?** `hasEverConnected` is the discriminator. First-connect-only is less disruptive but misses when docs are added later.

6. **Should `.sideline/game.json` marker creation be offered as an action?** Offers Tier 1 stability for non-git repos. Zero repo change without human opt-in. Could be part of "Coach checks setup."

7. **Dev harness stale reference:** `dev-games.json` still points to `SidelineCoach-GameTest`. Should the harness be updated to remove it? (Cosmetic; no product impact.)

8. **Self-hosting in dev mode:** Is a formal dev-mode self-hosting workflow needed? Current pattern (separate VS Code instance) works; documenting it may be enough.

---

## 15. Suggested Implementation Slices

Each slice is small, reversible, and independently provable. No slice depends on later ones.

| Slice | What | Seam | Risk |
|---|---|---|---|
| **S1** | Fix `+ Add Game` game list update | daemon broadcast / browser render | LOW — targeted bug fix |
| **S2** | `suggestSources()` wired to Game first-connect event (advisory only, not blocking) | `StadiumRegistry` `hasEverConnected` flag + SSE event + Slice C RPC | LOW |
| **S3** | Report glob auto-suggest on Game connect | Stadium filesystem scan + daemon broadcast + browser UI | LOW–MEDIUM |
| **S4** | "Coach checks setup" status display in browser after Game connect | SSE event shape + browser render | LOW |
| **S5** | "Check Players" prompt after Game connects | Browser UI only; no lifecycle change | LOW |
| **S6** | `.sideline/game.json` marker creation (opt-in, human-approved) | New daemon endpoint + Stadium file write | MEDIUM — writes to user repo |
| **S7** | Standard `Reports-SC/` creation (opt-in, only when no reports found) | New daemon endpoint + Stadium directory create + glob update | MEDIUM |

**Recommended order:** S1 → S4 → S3 → S2 → S5 → S6/S7 (if desired)

**S1 must be first.** The rest are useless if the user never sees the new Game.

---

## 16. WAS / IS / WILL BE

### WAS

- `SidelineCoach-GameTest`: full repo copy used as second Game target because VS Code EDH reload bug prevents two hosts in one instance. Its `launch.json` had a compound that was architecturally impossible.
- `coach.addGame` VS Code command: simple stub that registered a game in globalState and stopped. No window was opened; no lifecycle was driven; the human had to open VS Code themselves.
- Game identity: per-session local guessing, no stable fingerprint.
- Report discovery: stranded watchers in `CoachServer.start()`, filtered by shared `selectedGameId` — wrong for multi-Game (P0 Incoming regression).

### IS

- `SidelineCoach-GameTest`: stale, not needed. `dev-games.json` references it; `launch.json` does not.
- Q2.9 Add Game: full pipeline — browser → daemon → `game.pick` → Stadium picker → identity resolution (4-tier) → `game.open` → `vscode.openFolder` (product) / spawn (dev) → activation → WebSocket connect → Connected.
- Game lifecycle: 6 states (`known | opening | connected | offline | conflicted | archived`), pure state model in `src/game-lifecycle.ts`, driven by `StadiumRegistry`.
- `chooseOpenStrategy()`: `ExtensionMode.Development → development-instance`; all other modes → `vscode-open-folder`. Clean separation.
- Coach Routines Slice C: `suggestSources()`, `browseSources()`, `checkSources()` exist with full security boundary. Not wired to Game connect event.
- Diagnostics: preflight observer only; never gating; not integrated with Game bootstrap.
- Known gap: `+ Add Game` → new Game not appearing in browser list (open forensic item).

### WILL BE

- "Coach checks setup…" onboarding moment after Game connects (S1–S5 above)
- `suggestSources()` wired to first-connect event → Coach Refresh pre-population
- Report glob auto-suggest from existing repo structure
- "Check Players" prompt on Game connect
- Optional `.sideline/game.json` marker creation (Tier 1 identity upgrade, human opt-in)
- Optional `Reports-SC/` creation if no report contract found (human opt-in)
- Self-hosting (SidelineCoach as Game): naturally achieved once packaged; no special case needed
- Dev harness `dev-games.json` cleanup (cosmetic; drop stale GameTest reference)

---

## 17. Recommended Next Play

### Is Architecture Required?

**For S1 (fix Add Game game list):** No architecture. Forensic + targeted bug fix.

**For S2–S5 (bootstrap UX):** Light architecture — event model for "Game first-connect" trigger, SSE shape for onboarding status, browser render of "Coach checks setup." All additive, no existing contract changes.

**For S6–S7 (marker/report creation):** Moderate architecture — new daemon endpoints, Stadium file-write permissions, human approval flow.

### Recommended Next Play: S1 First

| Attribute | Value |
|---|---|
| **Play** | Forensic: why does `+ Add Game` not surface new Game in browser list |
| **Agent** | Codex or Claude (implementation-capable) |
| **Model** | GPT-5.6 Sol / Claude Sonnet |
| **Reasoning** | Medium |
| **Why** | S1 is a known field failure blocking everything else. The trace is clean (daemon broadcast → SSE → browser render). It is a targeted bug, not an architecture question. Fix it, prove it, then run the bootstrap UX plays. |

### Recommended Second Play: S4 + S3 + S2 Together (Bootstrap UX Bundle)

| Attribute | Value |
|---|---|
| **Play** | Implement "Coach checks setup" display + report glob auto-suggest + suggestSources first-connect wiring |
| **Agent** | Codex or AntiGravity (implementation) |
| **Model** | GPT-5.6 Sol / Gemini Pro family |
| **Reasoning** | Medium |
| **Why** | These three slices share the same first-connect event seam. Implementing them together avoids touching the same seam twice. None changes existing lifecycle contracts. |

### Architecture Required Before S6–S7

Before implementing `.sideline/game.json` marker creation or `Reports-SC/` directory creation, the architect must decide:
- Approval flow: in-browser button, VS Code notification, or silent?
- Who owns the write: Stadium (filesystem) or Control Plane (coordination)?
- What if the write fails (read-only repo, permissions)?

These questions are small but need explicit decisions. A short architecture note (not a full play) is sufficient.

---

## Key File References for Next Architect

| File | Relevant Seam |
|---|---|
| `src/game-lifecycle.ts` | All lifecycle states; `decideAddGame()`; `OPENING_TIMEOUT_MS` |
| `src/game-identity.ts` | 4-tier fingerprint; `resolveGameContextSync()`; `resolveGameContext()` async |
| `src/game-window-opener.ts` | `chooseOpenStrategy()` — product vs. dev path |
| `src/control-plane/daemon.ts:1532` | `handleAddGame()` full pipeline |
| `src/control-plane/stadium-registry.ts` | `recordKnownGameFromPicker()`; `markOpening()`; `clearOpening()`; `hasEverConnected` |
| `src/stadium-client.ts:498–539` | `game.add`, `game.pick`, `game.open` RPC handlers |
| `src/extension.ts:276–365` | `pickGameFolder()`; `openGameWindow()`; `chooseOpenStrategy()` usage |
| `src/extension.ts:426–446` | Legacy `coach.addGame` command (stub; does not drive Q2.9 lifecycle) |
| `src/routine-sources.ts` | `suggestSources()`; security boundary; heuristic patterns |
| `tools/dev/dev-games.json` | Stale `SidelineCoach-GameTest` reference |
| `Diagnostics/CONTRACT.md` | Observer-only contract; never gating |

---

REPORT: Game-Setup-Self-Hosting-And-Choose-Folder-Go-Reconnaissance.md
TIMESTAMP: 2026-09-14 12:30 MDT (Calgary, Alberta — America/Edmonton)
