# Architecture Breadcrumbs

## IS

- [WHY: Player Discovery V1] Player identity is command-based (`claude`, `codex`, `agy`), while resolved executables, npm shims, and PowerShell wrappers are machine-local runtime evidence. Player launch uses the normal VS Code integrated terminal shell so its configured PATH, profile, aliases, wrappers, and user configuration remain authoritative. Canonical terminal names remain the existing Coach allowlist identities: `Claude`, `Codex`, and `AntiGravity`.

- [WHY: Stage 1.5 / 1.8] Player type, opaque immutable Player instance ID, terminal handle, human seat, and derived field label are distinct. `PlayerRoster` is the sole activation-lifetime owner of live Player-instance and terminal-handle correlation. Coach-created instances, and restored instances proven to be the same shell process (PID plus OS start time) as a Coach-written provenance record in the Game's `workspaceState`, are dispatch-authorized. Terminal names, labels, and env markers never authorize; generic terminals are never Players merely because of a name. The proof-only provenance holds only instance ID, type, seat, shell PID, and shell start time; it is machine-local, per-Game, never synced, and never committed. All terminal evaluation flows through one idempotent `PlayerRoster` funnel fed by the activation snapshot and terminal-open events. Unreconcilable terminals fail safe and are not dispatchable. Seats do not reuse an ordinal while same-type live or pending siblings remain. The existing allowlist and unique-name rules remain only for the separately retained legacy terminal-name dispatch path. Instance identity contains no Game, Stadium, machine, or executable-path identity, preserving those separate concerns for future multi-Game work. Stage 1.8 legacy reload/re-adoption safety is FIELD-PROVEN (Stage 1.21): surviving same-process legacy Player instances (`Codex 2`) safely re-adopt after window reload using provenance; exact seat and browser target remain stable; text routing lands in the surviving legacy terminal; full VS Code restart does not authorize stale/revived terminals merely by name; terminal names never constitute dispatch authority; and the uncertified legacy path fails safe.

- [WHY: Stage 1.17 / 1.18 / 1.19 / 1.21] A VS Code-free Player Control Host and contract implementation exists for controlled Codex Players alongside the retained, uncertified legacy path. Each controlled instance owns one private `codex app-server` stdio child and one provider thread binding; SEND is one semantic `turn/start`, and a read-only transient Pseudoterminal is presentation only. The C1–C15 route is FIELD-PROVEN. Stage 1.19 controlled persistence and safe resume is FIELD-PROVEN (Stage 1.21): minimal per-Game `sidelineCoach.playerSessions.v1` binding is persisted separately from legacy provenance, reconstructs exact Sideline identity and seat synchronously as Resuming, then independently re-proves provider version, ChatGPT auth, Game cwd, authority, and exact thread through a fresh channel before dispatch becomes Ready. A host-minted `clientRef` is durably written before `turn/start`; provider history alone reconciles uncertain pre-reload work, and restore sends zero Plays. Authoritative human field testing with two controlled Codex Players (`Codex · Controlled` and `Codex 2 · Controlled`) confirmed that exact controlled Sideline identity, seat, and browser target survive extension/window reload without browser refresh; provider conversation history and context recall (`MARIGOLD-17`) are preserved across reloads; reload is not Leave Field; explicit human terminal close safely triggers Leave Field; and closed siblings do not resurrect. P1–P28 automated proof and human field tests are complete.

- [WHY: Stage 1] Sideline Coach records runtime truth under RUNTIME MEMORY (RM-1) as a Tier 2 on-demand snapshot only; Journal, Incidents, and Last-Known-Good are not implemented. Two collectors feed one renderer: a zero-dependency preflight tool that observes build, launch, port, and copy identity from outside the extension host, and an in-extension command that observes activation-time truth from inside by reusing `CoachServer.buildStatus()`. The preflight collector exists because Sideline Coach's characteristic failure is a launch or activation failure, which an in-process diagnostic structurally cannot observe. Activation truth is read from VS Code's own `exthost.log` and `tasks.log` rather than produced by new instrumentation. The repository commits only `Diagnostics/README.md`, `CONTRACT.md`, and `.gitignore`; runtime evidence lives in gitignored `Diagnostics/local/` and is never committed. Diagnostics observe and never act, are redacted by allowlist, and never write into the host workspace — that workspace belongs to another project.

- [WHY: Stage 1 Closure / Stage 1.21] **STAGE 1 IS COMPLETE AND FIELD-PROVEN.** The Stage 1 milestone requirement historically worded as "first complete real multi-agent Play loop / touchdown" is formally interpreted as multi-instance controlled Player proof on field. Certified multi-provider orchestration is explicitly defined as Stage 2 work. Stage 1 has established durable field evidence for:
  1. Coach runtime established;
  2. Dynamic Player discovery;
  3. Put on Field;
  4. Multiple same-type Player instances;
  5. Exact Player targeting;
  6. Safe instance identity (provenance-backed, not name-based);
  7. Report discovery / Incoming;
  8. Live browser convergence without manual refresh;
  9. Controlled Codex semantic SEND;
  10. One SEND → one provider turn;
  11. No Enter / paste / terminal-interaction requirement on certified controlled route;
  12. Same-thread controlled continuity;
  13. Controlled reload persistence and context resume;
  14. Controlled Leave Field behavior;
  15. Legacy reload re-adoption safety;
  16. Legacy stale-terminal fail-safe behavior;
  17. Full Coach → Player → work → report → Incoming → next Play loop.

- [WHY: Q2.1 Dispatcher Reliability UX] Outgoing Play Dispatcher button is a canonical status runner reflecting real lifecycle (`Dispatch Play` → `Sending…` → `Received` → `Working…` → `Completed`, with canonical terminal outcomes `Failed`, `Interrupted`, `Unknown`, and legacy route `Sent to terminal`). `Sending…` is local (HTTP in-flight); all other states derive strictly from canonical backend events and status projections. Duplicate clicks during active/in-flight execution are blocked. Prompt composer auto-clears on canonical `Received`, is preserved on pre-acceptance failure (network error, 4xx, 5xx, or refusal), and restores on `Unknown` if composer is empty without overwriting newer user drafts. No automatic resend occurs on `Unknown`. Refresh/reconnect renders current canonical state per player instance. Controlled player presentation and roster projection sanitize field labels so `· CONTROLLED` is never duplicated. Q2.1 is FIELD-PROVEN in `[Extension Development Host] GS3`: controlled Codex received and executed a real Play without terminal interaction, lifecycle transitions were visually observed, active prompt cleared upon canonical `Received`, and end-to-end behavior was successful. Quarter notation `Q2.1` is in active use. Non-blocking feedback: amber Working-state color is captured for future visual polish.

- [WHY: Q2.2 Game Foundation Implementation] **Game ≠ Stadium Invariant & Provider Safety.** A Game is the durable logical project being coached; a Stadium is the physical execution environment/mount/VS Code host running that Game. Game identity resolves via a 4-tier ladder (Tier 1: repo marker `.sideline/game.json`, Tier 2: normalized Git remote origin / root commit SHA fingerprint, Tier 3: Coach local registry in globalState, Tier 4: explicit Unknown). **Critical safety invariant:** `Stable Game identity ≠ automatic provider-session authority; same Game + changed root still requires provider authority re-proof`. If the same Game is moved or opened at a new path, Game identity is recognized, but provider conversation authority is NOT automatically assumed; existing provider cwd checks remain strictly enforced, provider metadata is never rewritten, and contradictory cwd leads to `Needs Decision / unavailable` with zero Plays dispatched. Controlled bindings safely migrate to carry optional `gameId`, cross-Game restores are quarantined, `/api/status` exposes `game` and `stadium`, `/api/dispatch` enforces `gameId` match (`409 Conflict` on mismatch, `400 Bad Request` on Unknown), and the browser UI renders current canonical Game (`Game: GS3`) with Stadium chip (`Stadium: Windows`). Automated proof passed (13 tests in `test/game-foundation.test.mjs`, 86/86 total tests passing). **Q2.2 is FIELD-PROVEN in `[Extension Development Host] GS3`**: Coach identified the current Game correctly (`Game: GS3`), controlled Codex restored normally, restored controlled Codex accepted a real Game-scoped Play, provider returned `GAME VERIFIED`, no cross-Game conflict occurred, and Q2.1 lifecycle remained fully functional.

- [WHY: Q2.4 Routing Intelligence & Live Capability Implementation] **Truthful, Capability-Backed Routing System (AUTO & MANUAL).** Stale prototype model dropdowns are replaced by live capability discovery and deterministic routing policy.
  1. *Core Contracts:* `CapabilityFreshness` (`live` < 60s, `cached` 60s-10m, `stale` > 10m, `unavailable`), `ModelDescriptor`, `ProviderCapabilitySnapshot`, `PlayerRoutingCapability`, `TaskClassification`, `RoutingMode`, `RoutingDecision`. Pure TypeScript, zero VS Code imports.
  2. *Live Capability Discovery & Caching:* `CapabilityService` maintains provider capability cache with freshness tiering and cache invalidation. `CodexAppServerControl.queryCapabilities()` reads `account/read` and `model/list` over JSON-RPC with zero turn consumption.
  3. *Semantic Deliver Options:* `PlayerControl.deliver(play, clientRef, options?: { model?: string, effort?: string })` passes explicit `model` and `effort` params into the `turn/start` frame.
  4. *Abstract Task Classification & Provider Policy:* `classifyTask(prompt)` deterministically classifies tasks (`architecture`, `implementation`, `quick`, `default`) using length and keyword heuristics without model name fossilization. `CodexRoutingPolicy` maps abstract tasks to discovered models and valid reasoning efforts, validating against the live catalog.
  5. *Fail-Safe Failure Semantics:* Critical Amendment 1 enforced: if live capability discovery fails or is unavailable, `MANUAL` falls back to `Provider Default` with warning badge; `AUTO` stops safely (`400 Bad Request`) with `"Live routing capabilities are unavailable. Refresh capabilities or switch to Manual."` (no fabricating models or routing from stale guesses).
  6. *Browser UX:* Outgoing card features `[ AUTO ] [ MANUAL ]` mode toggle group, `↻ Refresh` button, staged route chip (`Codex 1 · Controlled · GPT-5.6-Sol · Medium`), plain-English rationale, warning banner when capabilities unavailable, "Customize" deep link, cascading MANUAL dropdowns (`Target Player → Model → Reasoning Effort`), and legacy terminal badge.
  7. *Verification:* 119/119 tests pass (including 33 unit and browser harness tests in `test/routing-intelligence.test.mjs`). State: AUTOMATED PROOF PASSED / HUMAN FIELD PROOF PENDING in `[Extension Development Host] GS3`.

- [WHY: Q2.6 Multi-Game Foundation Implementation] **Multi-Game Foundation & Safe Isolation (Know Many, Execute One) — FIELD-PROVEN.**
  1. *Game Registry:* Canonical inventory of known games stored in `globalState` (`sidelineCoach.gameRegistry.v1`), tracking `gameId`, `displayName`, `fingerprintSource`, `repoUri`, `knownRootFsPaths`, and timestamps. Auto-registers active workspace Game on activation.
  2. *Single Extension Host Boundary:* Single-folder host enforces `Know Many, Execute One`. Active workspace Game is `Connected`; all other known Games in the registry are truthfully marked `Offline` (dispatch disabled, honest guidance). Multi-root workspaces allow multiple concurrently Connected Games.
  3. *Browser UX:* Header features compact `Game: <Name> ▾` dropdown button, live `Connected` / `Offline` badge, dropdown list of all known Games, and safe `+ Add Game` trigger invoking native VS Code folder picker.
  4. *Switching Lifecycle:* Selecting a different Game updates authoritative `selectedGameId`, atomically invalidates prior target player and staged route, and preserves prompt composer drafts per-game via `promptDraftsByGame`.
  5. *Strict Isolation:* Player roster instances, Incoming reports, and AUTO routing decisions strictly filter by `selectedGameId`. Zero cross-Game leakage.
  6. *Dispatch Protection:* Dispatches to offline Games reject with `400 Bad Request`. Cross-Game dispatches reject with `409 Conflict`.
  7. *Verification & Field Proof:* 23/23 tests pass in `test/multi-game-foundation.test.mjs`; 142/142 tests pass across full suite. **FIELD-PROVEN (2026-09-11):** Human field testing in `[Extension Development Host] GS3` proved that `+ Add Game` registers new projects, non-connected projects display `Offline` with dispatch safely disabled, switching back to `GS3` restores `Connected` status, Roster, Incoming reports, and routing immediately with zero manual browser refresh.

- [WHY: Q2.7 / Q2.7A Local Control Plane & Stadium Bridge Architecture] **Auto-Spawned Detached Control Plane & Outbound Stadium Bridge.**
  1. *Authoritative Topology (Option A True Detached Daemon):* The Control Plane runs as an independent detached Node.js daemon (auto-spawned by the first activating extension host via `process.execPath` with `ELECTRON_RUN_AS_NODE: '1'`). The first extension wakes the daemon but does not own its lifecycle. The daemon survives individual VS Code window closures.
  2. *Outbound Connection Invariant:* Stadium extensions make authenticated, persistent outbound WebSocket connections to the Control Plane (`ws://127.0.0.1:3100/stadium`). Extension hosts bind **zero** listener ports, permanently eliminating `EADDRINUSE` port collisions when multiple VS Code windows are open.
  3. *Single Browser Endpoint:* The Control Plane alone binds the canonical browser port (`http://127.0.0.1:3100`), providing a single unified URL for mobile and desktop dashboards across all open windows.
  4. *Durable Stadium Identity vs Session Identity:* Differentiates stable machine fingerprint (`stadiumId`) from transient window activation (`instanceId`). Multiple open windows are identified as concurrent sessions of the same host Stadium.
  5. *Explicit Routing Coordinates:* Dispatches route by `(stadiumId, gameId, playerInstanceId)`. No display name guessing; no cross-Stadium substitution.
  6. *Two-Phase Ingress Acknowledgement:* Control Plane marks `Received` strictly after the target Stadium logs write-ahead and confirms provider `turn/start` acceptance. Socket drops prior to ingress resolution yield `Unknown` with zero automatic resends.
  7. *Local Authentication:* Control Plane issues a local pairing secret (`~/.sideline/token`) verifying all connecting Stadiums and clients.
  8. *Cloud Evolvability:* Outbound WebSocket architecture is 100% cloud-relay ready with zero throwaway client code. Reports: `REPORTS/AntiGravity/Q2.7-Local-Control-Plane-And-Stadium-Bridge-Architecture.md` and `REPORTS/AntiGravity/Q2.7A-Control-Plane-Architecture-Reconciliation.md`.

- [WHY: Q2.8 Detached Local Control Plane & Stadium Bridge Implementation] **True Detached Control Plane & Stadium Bridge Implemented.**
  1. *Detached Daemon Process:* `src/control-plane/daemon.ts` operates as an independent Node.js process (binding port 3100 or incrementing if occupied), serving the browser UI, SSE stream (`/api/events`), `/api/status`, and WebSocket gateway (`/stadium`).
  2. *Outbound Stadium Client:* `src/stadium-client.ts` connects outbound over WebSocket. Extension hosts bind **zero** listener ports, eliminating all `EADDRINUSE` conflicts across multiple open VS Code windows.
  3. *Auto-Spawn & Atomic Mutual Exclusion:* `src/control-plane/launcher.ts` checks `~/.sideline/control-plane.json`, uses atomic file locking (`~/.sideline/control-plane.lock` with `O_EXCL`), health-checks PID/HTTP, and auto-spawns the detached daemon using `process.execPath` with `ELECTRON_RUN_AS_NODE: '1'`.
  4. *Exact Routing & Ingress Boundaries:* `src/control-plane/router.ts` coordinates exact routing by `(stadiumId, gameId, playerInstanceId)`. Ingress boundary: Control Plane marks `Sending…`, then marks `Received` **only** after Stadium confirms downstream provider ingress; drops prior to confirmation yield `Unknown` with zero automatic resends.
  5. *Window Closure Survival:* Closing a VS Code window (e.g. GS3) transitions that Game to `Offline`, while the Control Plane stays alive, the browser dashboard stays alive, and other windows remain `Connected`.
  6. *Automated Test Matrix:* 30/30 scenarios pass in `test/stadium-bridge.test.mjs`; 172/172 tests pass across the full suite. Report: `REPORTS/AntiGravity/Q2.8-Detached-Local-Control-Plane-And-Stadium-Bridge-Implementation.md`.

- [WHY: Q2.8G Multi-Game Development Harness] **One VS Code instance cannot host two Extension Development Hosts for the same extension source.** VS Code's main process short-circuits `openExtensionDevelopmentHostWindow()`: it calls `findWindowOnExtensionDevelopmentPath()` over `getWindows()` and, on a match, calls `lifecycleMainService.reload(existingWindow, cli)` and returns that window. A second `extensionHost` debug configuration using the same `--extensionDevelopmentPath` therefore *reloads the first host* instead of opening a second one, which is why a `compounds` entry naming two `extensionHost` configurations can never produce two live Games. `getWindows()` is scoped to one VS Code instance, and an instance is keyed by `--user-data-dir`; the development harness (`tools/dev/launch-games.mjs`, config `tools/dev/dev-games.json`) therefore launches **one VS Code instance per Game**, each with its own `--user-data-dir` and `--extensions-dir` under `~/.sideline/dev-hosts/<name>/`, all sharing one `--extensionDevelopmentPath` and one detached Control Plane. This is DEVELOPMENT-ONLY orchestration and is never the product's Add Game path. `tools/dev/verify-multi-game.mjs` asks the live Control Plane how many *distinct* Games are Connected, so two windows on the same Game (correctly reported `conflicted`) can never masquerade as a passing two-Game proof. Report: `REPORTS/Claude/Q2.8G-Multi-Game-Bridge-Field-Forensics-And-Dev-Harness-Repair.md`.

- [WHY: Q2.8H Canonical Extension Source For Every Game] **In development, Game workspace identity and SidelineCoach extension-source identity are independent.** Every debug-launched Game must execute the one canonical current SidelineCoach development source. A Game may contain arbitrary or historical code (even an old copy of this very repository); its contents never determine which SidelineCoach extension implementation serves it. `host-launch-plan.mjs`'s `buildHostLaunchPlan` already structurally enforces this — `--extensionDevelopmentPath` is hard-coded to the canonical repo root and no `dev-games.json` host entry has a field capable of overriding it — but **Connected alone cannot prove which extension build a Stadium is actually running**, so a Stadium launched outside the supported harness (for example, opening a Game-workspace-that-happens-to-contain-its-own-`.vscode/launch.json` directly and pressing F5 inside it) can silently serve stale RPC handlers while appearing identical to a canonical session. `computeControlPlaneBuild` (the same content-hash utility the Control Plane Freshness Guard already uses for the daemon) is now reused over each Stadium's own `out/extension.js` closure, sent as `extensionBuildId` at `stadium.hello`, and compared by `tools/dev/verify-multi-game.mjs`'s `describeExtensionSource` against the canonical repo's own current hash — turning "is this the right extension source" from an inference into a provable, capability-agnostic fact that automatically covers any future RPC method without further code. A **Connected** state proves transport/session presence only; development tooling must additionally prove launch topology and running-build identity before that state is trusted. Development-only, Advanced-only; never surfaced in Dad Mode. Report: `REPORTS/Claude/Dev-Harness-Canonical-SidelineCoach-Source-For-Every-Game.md`.

- [WHY: Q2.9 Dadified Game & Player Lifecycle] **The human chooses intent; Coach performs mechanics.**
  1. *Game lifecycle is one state model.* `src/game-lifecycle.ts` derives `known | opening | connected | offline | conflicted | archived` from live session count, archive flag, prior-connection history, and an Opening deadline. Precedence is deliberate: **Archived** outranks everything so a finished Game never reappears, and **Conflicted** outranks **Connected** so exact routing is blocked rather than guessed. Hard invariant: **Offline ≠ Archived** — a closed window or a sleeping Codespace is Offline; only the human declaring the project finished is Archived. `Opening` expires after `OPENING_TIMEOUT_MS` (90 s) and decays to Offline, so a window that never activated can never spin forever.
  2. *Add Game is one complete action.* `POST /api/game/add` runs picker → identity → decision → open → Opening → Connected. The **Control Plane coordinates and decides**; the **Stadium executes the two environment-specific mechanics** (the native `showOpenDialog`, and opening the window). The browser only expresses intent, because it has no Stadium and cannot safely enumerate local paths. `decideAddGame()` is pure, so already-Connected (select, do not duplicate), already-Opening (do not re-open), Conflicted (report, do not choose a window) and unresolved-folder are all provable without a VS Code window.
  3. *Window opening is strategy-selected, and the product path is the plain one.* `chooseOpenStrategy(extensionMode)` returns `vscode-open-folder` for an installed extension — the human's own VS Code, profile and extensions, with VS Code focusing an already-open folder rather than duplicating it. Only `ExtensionMode.Development` uses a separate VS Code instance, because under `--extensionDevelopmentPath` the extension is not installed and a plain window would contain no Coach at all. **The Q2.8G instance-per-Game constraint is development-only and does not apply to the product.**
     - **[WHY: Q2.10 Add Game Opening → Stadium forensic] Registration ≠ Opening ≠ Stadium.**
       - *Field failure:* Add Game registered the Game and published Opening, and `game.open` returned success, but no Stadium ever arrived. The per-Game dev-host profiles stayed empty.
       - *Cause:* `game.open` runs **inside a VS Code extension host, whose environment carries `ELECTRON_RUN_AS_NODE=1`** plus `VSCODE_*` process wiring. The spawned `Code.exe` inherited it, booted as plain Node, rejected `--user-data-dir` ("bad option", exit 9, ~35 ms), and `stdio:'ignore'` hid it.
       - The terminal-launched harness never hits this, so **harness success never proves an in-extension launch.**
       - *Rules:*
         1. Anything a Stadium spawns that must boot as VS Code/Electron gets a scrubbed env: no `ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ATTACH_CONSOLE`, `CHROME_CRASHPAD_PIPE_NAME`, `VSCODE_*`. See `buildDevelopmentInstanceEnv`.
         2. **A `spawn()` returning is not a launch.** `game.open` succeeds only if the host survives a bounded boot window or hands off (exit 0) to an instance already running for that profile; otherwise it fails truthfully and Opening clears. See `launchDevelopmentInstance`.
         3. Development open = separate instance, `--extensionDevelopmentPath` from the serving Stadium's own extension source (implementation), chosen folder as content only, profile `~/.sideline/dev-hosts/<gameId>`.
         4. Only a bound `stadium.hello` makes Connected, and `extensionBuildId` proves the build.
         5. `tools/dev/dev-games.json` is harness tooling, never a Game registry, and added Games are not written into it.
       - Report: `REPORTS/Claude/Opus-Add-Game-Opening-To-Stadium-Forensic-And-Architecture.md`.
     - **[WHY: Q2 Add Game final contract] A Game needs neither GitHub nor Git; its identity must come from the folder itself.**
       - *Field evidence:* Gallery-Media-Suite is a real local Git repo with commits and no remote. It was refused, because "git identity" meant only the normalized `origin` URL, so every Stadium resolved it `unknown`.
       - *Latent defect:* the Stadium-local registry tier mints a random `game_reg_` id per VS Code profile, and a launched dev host has its own `--user-data-dir`, so it could never bind to the Game the picker registered.
       - **Frozen ladder:** `.sideline/game.json` → Git `origin` remote → **explicit Add Game adopts the folder by writing the marker** (`game_local_<hex>`).
       - Adoption only when no strong identity exists: exclusive create, never overwrite, never in a remote-backed repo or inside another repository, refuse drive root/home.
       - The marker is folder-owned, so move/rename and a later GitHub remote never fork the Game id (marker outranks remote).
       - Stadium-local (`globalState`) identity is never an Add Game identity. Git/GitHub may enrich, never replace, a Game id.
       - Marker creation belongs to identity/adoption. `Coach/`, `Reports-*`, SOP and `.gitignore` policy belong to Game Bootstrap.
       - Dad messages never mention markers.
     - **[WHY: Q2 Add Game final contract] Add Game mechanics run in the serving Stadium's LOADED code, not disk.**
       - FloppyDisk stayed Opening because the selected GS3 Stadium still had the pre-fix launcher in memory while a current Stadium was connected.
       - Diagnose Add Game failures by the serving Stadium's `extensionBuildId` / loaded code first.
       - The daemon skips a known-stale selected Stadium when a current one is connected; staleness never blocks, and unknown builds never switch.
       - After Stadium-side code changes, existing windows need Reload.
       - *Observed, not fixed:* the daemon's known/archived Game registry does not survive a Freshness Guard replacement.
       - Report: `REPORTS/Claude/1.1-Opus-Add-Game-Final-Adoption-And-Launch-Contract.md`.
  4. *Exit / Archive is registry-only.* Archiving sets `KnownGameRecord.isArchived`, hides the Game from the active Sideline, and moves selection to a survivor. It never deletes or modifies a repository, retains the full Game record, and is reversed by Restore or simply by reopening the Game.
  5. *Player discovery is a separate question from the roster.* `PlayerDiscoveryService` (`src/player-discovery.ts`) answers *"who could play here?"*; `PlayerRoster` answers *"who IS playing here?"*. Collapsing them is what previously made a manually-launched agent invisible. Discovery is **Stadium-scoped** — never a global `claudeInstalled` boolean — and imports no `vscode` API, so its rules are unit-testable. It never fabricates authentication: no probe means `ready` (a genuine sign-in failure still surfaces honestly through the existing `needs-sign-in` control outcome), and an unprobeable provider is `unknown`, never a guess.
  6. *Terminal is a first-class Player type.* Not a costume worn by a provider. It starts nothing, needs no installation, is offerable in every Stadium, and is pinned to the Game root `cwd` so a command can never run in the wrong Game. It is the bootstrap path: Coach can reach an environment before any agent exists there. It is explicitly **excluded from Play routing** — dispatching a Play to a shell would type the whole prompt into it.
  7. *Ownership governs destruction.* Every Player instance records `coach-managed | adopted | external`. Coach disposes only what it created, detaches from what it adopted, and never destroys an external process. Terminal names still grant no authority (Stage 1.7/1.8), which is why adoption targets a **shell pid**, and why external agents are matched on executable name or the leading command-line token, never on a terminal's display name.
  8. *Take Off Field, Remove Player and Close Terminal are three different actions.* Benching keeps the instance, its seat and its transport and is reversible; removal ends the instance and cleans bindings subject to ownership; closing a terminal is transport-level. A benched Player is retained but is not a routing candidate.
  9. *Existing agents are discovered, then adopted explicitly.* Coach scans each Game terminal's descendant processes and offers `Adopt`. Adoption is always a human act — Coach never seizes a process it did not start. A failed scan reports `externalScanSupported: false` rather than implying nothing is running.
  10. *"Legacy" is no longer a user concept.* Transports are shown as `Controlled | Terminal | Adopted | External`. The internal `transport: 'controlled' | 'legacy'` field is unchanged for routing policy and persisted contracts; `transportLabel` carries the human wording.
  11. *No manual refresh.* Every Game and Player lifecycle mutation broadcasts status over the existing SSE channel; `playerDiscovery` is always present in `/api/status` and is `null` when not yet checked, which is different from an empty catalog and must not be collapsed into it.
  Report: `REPORTS/Claude/Q2.9-Dadified-Game-And-Player-Lifecycle-Implementation.md`.

- [WHY: Q2.9C] **AUTO chooses WHO; transport decides HOW.** Three independent dimensions must never collapse: roster state (On Field / On Bench), the routing decision (which Player receives this Play), and transport (`Controlled | Terminal | Adopted | External`). With **exactly one** dispatchable Player on field, `computeAutoRoute()` selects it regardless of transport, because there is no choice to make. A terminal-backed Player is reached through its terminal with `model` and `effort` left `undefined`, and the decision carries `transport: 'legacy'` so the browser says *Provider managed* rather than faking a control or labelling a working capability *Off*. Zero Players returns plain guidance. Several terminal-only Players return a plain *choose in Manual* message and never a guess. Mixed rosters keep the Q2.4 Controlled capability-backed path, including its fail-safe stop when live capabilities are unavailable. The superseded `AUTO candidate === Controlled candidate` assumption was Codex-only proof scaffolding; the Terminal Player *type* (a bare shell) remains excluded from routing. Report: `REPORTS/Claude/Q2.9C-Final-Runtime-Forensics-And-Field-Closure.md`.

- [WHY: Q2.9C] **The detached Control Plane outlives Extension Development Hosts, and nothing checks its build.** `ensureControlPlaneRunning()` reuses any daemon that is alive and healthy on the discovery port. The daemon keeps its compiled modules in memory, while it serves `src/public/index.html` from disk on every request. So after a recompile, restarting the Game hosts gives **new Stadiums + a new page + an old in-memory daemon**. Q2.9C proved this live: a daemon running since 11:09 still returned the pre-Q2.9B AUTO string and had no instance-level Put on Field route, while the page and both Stadiums were current. Until a build-freshness guard exists, **after any `npm run compile` that touches `src/control-plane/**`, `src/routing-policy.ts` or anything the daemon imports, stop the daemon PID in `~/.sideline/control-plane.json` and start a fresh one (or simply let the next Game host spawn it)**. Stadiums reconnect on their own within seconds; Players and terminals live in the extension hosts and are unaffected. `/api/diagnostics` `controlPlane.uptimeSeconds` is the one-line freshness check.

- [WHY: Q2.10A] **Transport is plumbing; provider controls are a separate, evidence-backed capability.** `src/provider-control.ts` models what Coach can see and do *to a provider's settings*: `promptDelivery`, `semanticTurns`, and per-setting `model` / `effort` controls with state `available | requires-proof | unavailable | unknown`, a mechanism, options and the provider's reported default. A terminal-backed Claude is **not** an uncontrollable Player. The Claude CLI (2.1.270) reports its controls through LOCAL commands, `claude -p '/model'` and `claude -p '/effort'` (no model call, about 1.5 s). The Stadium probes them through PowerShell, so a leading `/` is never rewritten into a path (Git Bash does, and the "command" then reaches the model as a prompt). It probes from a neutral temp folder, so no Game's hooks run without that Game's trust decision. Parsing is strict: anything else is `unknown`. **Live control is `requires-proof`, not `available`:** the binary persists a model chosen inside a running session to the human's user settings, so switching Claude's model per Play would silently rewrite their default for every future session. Coach shows Claude's real defaults, labelled as Claude's own, and operates nothing until a session-scoped mechanism is proven. Plan entitlement (for example Fable credits) is not discoverable, so option availability stays `unknown`, never claimed.

- [WHY: Q2.10A] **Running Players: this Game, elsewhere, and never an accidental duplicate.** Discovery separates a supported agent running *in this Game's terminals* (offered as *Add to Roster* → adopt) from one running *elsewhere on the computer*, typically another VS Code window (`runningElsewhere`). The elsewhere case is reported but **never adopted**: Coach cannot reach that terminal and its folder is another project. Coach's own extension host is an excluded root, so a controlled Player is never "elsewhere". Provider *Add* re-scans **afresh** at the Stadium and refuses a duplicate: `running-in-game` (use Add to Roster) or `running-elsewhere` (the human confirms *Start new …*). An unsupported scan never blocks, because unknown is not evidence. The **Running Players** preference (`ask` default, `auto-add`, `ignore`) lives in `~/.sideline/preferences.json`, written atomically. `auto-add` adopts through the existing `player.adopt` path only, so ownership stays `adopted` and removal never closes the human's process. `ignore` hides running Players from the view but keeps the cached truth. **Field root cause of the reported duplicate:** the "already running" Claude was the Architect session in the main SidelineCoach window, not in GS3. Discovery was right not to offer it; the UI simply never said so.

- [WHY: Q2.10A.1] **Scouting must never wait for provider introspection.** `PlayerDiscoveryService.discover()` is the fast, Stadium-scoped core path: command availability plus running-process observation only. Provider-specific model, reasoning and version inspection runs through optional `PlayerDiscoveryEnricher` records after the `player.discover` RPC has returned. Enrichment is bounded, cancellable and deduplicated per Game while in flight; failure or timeout produces explicit `unknown` controls without invalidating the catalog. The Stadium publishes the enriched canonical discovery over `player.discovery.changed`, the Control Plane replaces its per-Game discovery cache, and the existing SSE status refresh converges the browser without another Check Players. Claude's PowerShell-launched local probes explicitly close stdin, removing the observed wait for EOF while preserving leading `/model` and `/effort` arguments. *Mistake to avoid:* increasing the bridge RPC timeout to hide a provider probe in the scouting critical path.

- [WHY: Q2.10B] **Codex restore: `thread/resume` is the authority, and a lost conversation never erases provider truth.**
  - **The quirk:** Codex app-server 0.154.0 answers `thread not loaded: <id>` to `thread/read` in a fresh process for *any* thread, including one that exists on disk and one that never existed. `thread/read` is therefore no longer an existence check.
  - **The rule:** restore treats "not loaded" as unverified and calls `thread/resume`, which loads the conversation. `validateAuthorityResponse` re-checks id, ephemerality, Game cwd and authority on the result. Only resume's `no rollout found` is the missing signal, and it keeps the existing rules: history expected → needs-decision; none expected → open fresh once.
  - **Capabilities survive:** a restore that ends non-ready still carries `capabilities` captured from the same authenticated process (bounded to 3 s), and `PlayerRoster` records them. Model/effort discovery (`model/list`) needs no conversation.
  - **Field evidence:** `codex-0a6eab81` sat in needs-decision with that exact message, and MANUAL showed *Provider Default · Live discovery unavailable*.
  - *Mistake to avoid:* tying provider capability to conversation health, or matching provider error text too broadly.

- [WHY: Q2.10B] **One control answer per exact Player instance; transport never decides controllability.**
  - **The single projection:** `projectInstanceControls()` is the Dispatcher's only question for any provider or transport. Source priority: exact live Controlled capability > provider-specific safe discovery (Claude `/model` + `/effort`, AntiGravity `agy models`) > Unknown. The Control Plane attaches it as `capabilities[].controls`.
  - **Session-scoped control is proven for both terminal providers** through structured print mode, with global settings SHA-256-identical before and after:
    - Claude 2.1.270: `claude -p --resume <session> --model sonnet --input-format stream-json` switched haiku → sonnet in one session.
    - AntiGravity 1.2.2: `agy -p --conversation <id> --model gemini-3.7-flash-low` continued one conversation on a new model.
  - **That proof covers Coach-launched Controlled Players only.** A human's live interactive terminal session is never reconfigured (`requires-proof`).
  - **MANUAL:** *Auto* means Coach chooses for this Play, resolved per exact instance by `resolveCoachAuto` and only where Coach can operate the control. *Provider Default* (`default`) means never override. The two are separate values.
  - *Mistake to avoid:* arrow-key menu automation, or replacing an exact instance's live capability with a generic Player-type default.

- [WHY: Q2.10B] **Recruit once, multiply instances; AUTO answers WHO, WHICH INSTANCE, WHAT MODEL, HOW HARD.**
  - **Multiplying:** Scouting recruits a Player *type* once. The Roster offers **+ Add another <Player>**, and that click is the human's explicit permission (`allowDuplicate: true`), distinct from the accidental-duplicate guard.
  - **Naming:** instances are shown as *Claude 1 / Claude 2* by stable seat once a type has more than one. The opaque `playerInstanceId` stays internal, and bench, remove, dispatch and AUTO always address the exact instance, never a sibling.
  - **AUTO eligibility:** only Players that can take a Play (`ready | busy`) are candidates. A Player that needs attention never stalls AUTO for ready teammates and is never called "working" (field evidence: an unavailable Codex produced *currently working* while Claude and AntiGravity were ready).
  - **Rationale:** decisions record `rationale` (player / instance / model / effort) plus one Dadified `summary`.
  - **On Field** means eligible, not idle.

- [WHY: Q2.10C] **If Coach launches the Player, Coach coaches the Player: Claude and AntiGravity are Controlled through structured print, one process per Play, one provider session per instance.**
  - **Mechanism:** `StructuredPrintFactory` (`src/player-control/structured-print.ts`) is shared, with provider syntax kept inside two dialects. For each Play, Coach spawns the CLI in the Game with authority, session and per-Play `--model` / `--effort` flags, sends the prompt as one stream-json message, and maps `init → progress → result` onto the existing turn lifecycle. Per-invocation flags are the Q2.10B-proven path that never rewrites global settings; `/model` is never issued.
  - **Authority (superseded Q2.10C proof): accept edits inside the Game.**
    - Claude: `--permission-mode acceptEdits --permission-prompts none`. Live proof: an edit in the Game was allowed and a read-only command ran; `node -e …` and `git init` were auto-denied with `permission_denials`; no hang.
    - AntiGravity: `--mode accept-edits`. Headless mode soft-denies approval-gated tools (`denied_actions`); `run_command` was denied live.
    - `player-authority.ts` normalises any stored or future value down to accept-edits.
    - Before launch, the installed CLI's `--help` must advertise every flag used, or the Player becomes Needs verification. Coach never falls back to a wider mode.
  - **Q2.10C.1 authority amendment (current human decision): Coach-managed Controlled Players default to Full Autonomy.**
    - Codex keeps its certified `approvalPolicy: never` plus `danger-full-access` authority.
    - Claude 2.1.270 and AntiGravity 1.2.2 both advertise and receive `--dangerously-skip-permissions` on every controlled invocation.
    - This authority applies only where `ownership = coach-managed`; adopted, external, and human-launched sessions never pass through `player-authority.ts`.
    - The durable settings vocabulary is **Full Autonomy / Ask for risky actions / Ask every time** under *Settings -> Players & Providers -> Player Permissions*. Full Autonomy is selected for this profile; the Dispatcher does not expose the flags.
    - Contract verification is fail-closed: if the installed CLI does not advertise the selected authority, the Player reports Needs attention/verification and Coach does not silently launch a restrictive fallback.
  - **Session identity:**
    - Claude: Coach names the session up front (`--session-id <uuid>`) and uses `--resume` afterwards. A session exists on disk only after its first Play, so restore checks existence only when `historyExpected`. `--resume` with empty input exits 0 when the session is present and says "No conversation found" when it is not, with no model call.
    - AntiGravity: a conversation opened with empty input persists. **An unknown `--conversation` id silently starts a NEW conversation** (1.2.2 prints only a stderr warning). `init` arrives before stdin is read, so Coach checks `init.conversation_id` and writes the Play only on a match; on a mismatch it kills the process and refuses ("Nothing was sent").
  - **Model normalisation (AntiGravity):**
    - `agy models` variants `family-low|medium|high` become one family plus reasoning.
    - The adapter translates back to the exact variant id (a family requires an effort; a model without variants rejects `--effort`).
    - A family chosen with Provider Default reasoning uses AntiGravity's own medium variant.
  - **AntiGravity is a live multi-model resource gateway, not a permanent Gemini synonym.** `agy models` is the authority and may expose Gemini, Claude-family, GPT-OSS, or later families. Future AUTO/CONSERVE must reason over execution provider **and** model as separate dimensions, then combine exact instance, reasoning, context affinity, work state, quota/resource pool and route cost. Usage Sentinel supplies scarcity/reset truth. Never hardcode AntiGravity as unlimited, always cheaper, or always the preferred route.
  - **Failure truth:** a process that exits without a `result` is `unknown`, never completed. A provider error is `failed`. A Play in flight across a restart reconciles as Unknown.
  - **Migration:** a pre-Q2.10C Coach-managed terminal Claude or AntiGravity keeps its interactive session (it cannot be taken over safely). The Roster offers **Restart with Coach controls**, which starts a Controlled copy first, then removes the terminal after confirmation. Adopted Players are never converted. New copies ("Recruit", "+ Add another") are Controlled by default.
  - *Mistake to avoid:* one long-lived stream-json process per instance (model is fixed per process, so per-Play model would break), or trusting `--conversation` without checking `init`.

- [WHY: Q2.10C] **The Instance Work Ledger is Control Plane memory of activity, beside eligibility.**
  - **What it is:** `InstanceWorkLedger` (`src/control-plane/work-ledger.ts`), in memory, keyed by Game plus exact `playerInstanceId`.
  - **Inputs (only what Coach knows):**
    - Router `play-dispatched`: exact instance, resolved model/effort, Play label, 80-char first-line summary.
    - Router delivery verdicts.
    - Stadium `turn.changed`.
    - Registry disconnects: `disconnected`, never completed.
    - Capability snapshots: removed instances leave; a reconnected Controlled `ready` instance becomes `idle`, and its lost Play becomes `unknown`.
    - Reports.
  - **Transport rule:** Terminal Players receive `unknown`, because they give no completion signal.
  - **Bounds:** 10 recent Plays and 10 report links per instance.
  - **Report provenance:** attributed as `single-active-play` only when exactly one instance in that Game was running or had just finished a Play when the report was written; otherwise the report stays unattributed.
  - **Consumers:**
    - Status shows `capabilities[].work` plus `workLedger`, and the Roster card shows *On Field · Controlled · Working*.
    - AUTO prefers a known-idle sibling; the router applies the same activity the staged route showed (`setCandidateEnricher`).
    - AUTO picks WHO from an explicit per-Play-type provider table.

- [WHY: P0 Incoming] **Outbound dispatch and inbound reporting are one product contract. A Play is not operationally complete for the human until its result can return through Incoming.**
  - **Who publishes:** the Stadium owns the report return loop. `ReportPublisher` (`src/report-publisher.ts`, wired in `extension.ts`) watches the Game's `coach.reportGlobs` and republishes on create/change/delete (debounced) through `StadiumClient.publishReportsChanged()`. Changing `coach.reportGlobs` rebuilds the watchers and republishes, with no reload.
  - **Scope:** a Stadium scans only its OWN Game (`CoachServer.scanReportsForGame(gameId)`); an unknown Game publishes nothing.
  - **Refresh Incoming** (`POST /api/reports/rescan` → Stadium `report.rescan`) is recovery only.
  - **Unknown is valid:** automatic report discovery must never fabricate reports or cross-associate them between Games. `/api/reports` reads only the named Game's authoritative Stadium.
  - *Mistake to avoid:* scoping any Stadium-published state by the retired local CoachServer's `selectedGameId`. That value lives in `globalState`, is shared by every window of a profile, and names whatever Game was selected last anywhere.

- [WHY: P0.1] **Fresh source automatically meets fresh runtime: the Control Plane Freshness Guard.** (Supersedes the Q2.9C manual rule "stop the daemon PID after compiling daemon code".)
  - **Build identity, never time.** `computeControlPlaneBuild()` (`src/control-plane/freshness.ts`) is a SHA-256 over the daemon's compiled runtime closure: `out/control-plane/daemon.js` plus every module reachable through its relative `require` graph. The page (served from disk) and Stadium-only modules (roster, adapters, stadium-client) sit outside the closure, so they never churn the daemon.
  - **Handshake.** The daemon records `buildId`, `instanceId` (nonce), `daemonScriptPath` and `supersedes` (lineage) in its atomically written manifest and in `/api/health`. A Stadium computes its expected build ONCE at activation, so a later compile on disk can never masquerade as what the window is running.
  - **Verdict** (`assessFreshness`):
    - match → reuse;
    - legacy daemon without identity → Unknown → replace;
    - same installation → a window whose loaded build ≠ disk build is the outdated one and defers;
    - different installation → a build the running daemon already superseded defers.
    - Result: windows running different builds never fight over the daemon.
  - **Ownership before termination.** A daemon counts as ours only when the listener on the manifest port reports the manifest PID (and nonce) through the health API. Step-down is an authenticated, instance-addressed `POST /api/control-plane/shutdown`; termination is a fallback only after re-proving ownership. A reused PID or silent listener is never killed; a new daemon takes another port instead.
  - **Election.** One atomic lock (`control-plane.lock`, holder identified by PID, broken only when that PID is dead) serialises every start and replacement. Losers wait and re-evaluate, so N Stadiums produce exactly one replacement (live-proven with 3 concurrent launchers).
  - **Reconnect.** Every Stadium reconnect re-resolves through the guard (new port or token followed automatically). The human's selected Game persists in `~/.sideline/control-plane-state.json` and is restored when that Game reconnects. Reports republish on connect; the Ledger restarts truthfully (Unknown or Idle, never fabricated work).
  - **Dad Mode** shows only "Coach: Updating…"; builds, instances and lineage appear in `/api/diagnostics`.
  - *Mistakes the field proof exposed and fixed:*
    - A graceful daemon close can hang on keep-alive or SSE sockets (so `closeAllConnections` plus a hard exit for detached daemons).
    - `StadiumClient` re-emitting an unobserved `'error'` event threw and killed the reconnect chain when a connect attempt hit a half-closed daemon.

- [WHY: P0.1] **Terminal is a first-class Player, but a shell — not a reasoning provider.**
  - **Contract** (`src/terminal-player.ts`): execution type `direct-shell`; model, reasoning and provider are not applicable.
  - **Command fidelity:** the exact text the human approved is the command (NUL bytes excepted).
  - **Natural-language guard:** text that plainly reads as a request is refused ("Terminal runs exact commands"). It is a guard, not a parser.
  - **Exact instance** (`PlayerRoster.runTerminalCommand`): refuses benched, removed or closed Terminals and never substitutes a sibling. Terminal-backed provider Players are also delivered through their exact terminal object (`sendToProviderTerminal`), no longer by visible name.
  - **Evidence:**
    - VS Code shell integration (`executeCommand` + `onDidEndTerminalShellExecution`) gives Working → Completed / Failed with the exit code.
    - Without shell integration the command is sent and its outcome stays Unknown.
    - The human's own commands in the same terminal are never recorded as Plays.
  - **Ownership:** a Coach-managed Terminal closes on Remove; a human terminal joins only through explicit "Adopt as Terminal" and is detached, never closed.
  - **Routing:** MANUAL only. AUTO filters Terminal out; Terminal as a zero-token deterministic executor is a WILL BE.
  - **Numbering:** human names ("Terminal 1/2") are contiguous presentation over stable seats.

- [WHY: P0.1] **Dev topology is not Game identity.** `C:\Users\dmcal\Documents\GitHub\SidelineCoach` is currently the extension SOURCE ("build the Coach") window; Games run in separate Extension Development Hosts, which is why `SidelineCoach-GameTest` exists. The Freshness Guard keys on the daemon *installation path + build*, never on a Game. Once packaged, any repository — including SidelineCoach itself, opened intentionally — can be a Game.

- [WHY: Q2.10D] **AUTO understands evidence-backed context ownership, exact-instance affinity, work state, queue-for-owner, and provider-neutral context handoffs.** Routing order is Game → Play intent → context owner → exact instance → work state / queue decision → provider → model → effort → transport.
  - **Follow-up detection** (`src/control-plane/context-affinity.ts`) is conservative. Evidence ranks:
    1. a report of this Game named in the Play;
    2. the report the human is viewing in Incoming (sent with preview and dispatch);
    3. "that report / the recommendation" → the newest report;
    4. "continue / what you just built" → the most recent Play.
    - Wording only *activates* a lookup of recorded evidence. Anything else is new work. Generic shared words never create an owner.
  - **Ownership sources:** explicit report provenance, then the Ledger's single-active-play attribution. Otherwise **Unknown**, which is said out loud; the report still travels as context.
  - **Policy** (`computeContextAwareRoute`):
    - **idle owner** → the owner, even when a sibling is idle;
    - **busy owner:**
      - a Play that changes the Game → **Queue for owner** (collision and continuity risk);
      - an independent read-only Play with a report → **handoff** to an idle sibling with a compact preamble;
      - either way the other option is offered as the ONE alternative, and the human's pick is honoured;
    - **owner with Plays waiting** → queue behind them (FIFO);
    - **owner benched / removed / unavailable / Terminal** → the route says so, then hands off with context, or asks for Manual. Never a silent reroute.
  - **Collision (new work):** the Play names a file another instance is changing (Ledger `touches`) → queue for that instance, with "Run now on …" offered.
  - **Queue** (`src/control-plane/play-queue.ts`):
    - per Game + exact instance, FIFO, persisted atomically to `~/.sideline/play-queue.json`, so it survives freshness replacement;
    - released only after revalidation: Game connected, on Team, On Field, Controlled, ready, not working;
    - a benched, removed, unavailable or unknown-outcome item becomes **needs attention** and blocks the items behind it; only the human retries or cancels;
    - a send interrupted by a restart is never resent automatically;
    - the Ledger persists history and report ownership (`work-ledger.json`); activity is re-learned as Unknown.
  - **Staged = actual:** preview and dispatch both call `ControlPlaneRouter.computeRoute` with the same context and choice.
  - **Handoff package:** provider adapters stay routing-free. The router prepends "[Sideline Coach handoff] You are continuing work previously handled by Claude 1 … Read this report … Previous Play …".
  - **Provenance** (`src/report-provenance.ts`): an optional invisible first line `<!-- sideline-provenance: {…} -->` is parsed by the Stadium and trusted only for instances of the same Game.
  - **Dad Mode:**
    - the staged route reads "Queue for Claude 1 · Reason: owns the current implementation context and is Working.", with one alternative button;
    - the Roster shows "Working · 1 queued" plus queued lines with Cancel / Try again;
    - MANUAL offers "Queue for …" for a busy Controlled Player;
    - a busy previous target never locks Dispatch in AUTO.
  - **Human names** in routes are contiguous presentation names, never seat labels.
  - *Mistakes to avoid:* treating shared vocabulary as context; routing a queued Play to a sibling when its owner disappears; auto-resending a Play whose send outcome is unknown; keeping "working" for a Controlled Player that reports unavailable (it froze the queue — fixed in Q2.10D).

- [WHY: Q2.10E-A] **Controlled report-producing Plays now carry explicit execution provenance from Sideline's authoritative dispatch seam.**
  - The Control Plane appends a provider-neutral report instruction only to Controlled reasoning Players. It supplies the complete invisible `sideline-provenance` marker; the Player copies it near the top of any Markdown report it creates or updates for that Play and is never asked to invent machine identity.
  - **Source of truth remains dimensionally separate:** selected Game → `gameId`; minted dispatch identity → `clientRef`; canonical routing candidate → exact `playerInstanceId` + `playerType`; capability snapshot → execution `provider`; resolved route/manual choice → `model` + `effort`; dispatch clock → ISO timestamp.
  - An explicit model is recorded as its provider-native id. If Coach does not select a model, the marker says `provider-default`; it never guesses the provider's hidden choice. Effort is omitted (Unknown) when it was not explicitly resolved or does not apply.
  - AntiGravity remains the execution provider even when its selected underlying model is Claude-family, Gemini, GPT-OSS, or another discovered family. Provider, model, and effort are never collapsed.
  - When a report later gains explicit provenance, the Ledger removes any older timing-based projection of that path, attaches it to the declared exact same-Game instance, and durably retains the report's provider/model/effort facts. Explicit provenance therefore outranks timing attribution in fact as well as policy.
  - Terminal and adopted/legacy Players receive no provenance prompt footer. Current report paths and globs are unchanged; canonical `Reports-SC` remains separate P0.2 work. Dad Mode stays free of this machine plumbing.

## WAS

- [WHY: Q2.10E-A] Before Q2.10E-A, reports could be attributed by timing and Q2.10D could parse explicit provenance, but Controlled Players did not reliably write that provenance. Provider identity could therefore be known while exact instance/model/effort evidence remained incomplete, and a later explicit marker did not replace an already-recorded timing owner.

- [WHY: Q2.10D] Before Q2.10D:
  - AUTO selected mainly by Play type and provider, and preferred an idle sibling.
  - Context ownership was breadcrumbed but not authoritative, so a busy context owner was simply skipped and its follow-up went to whichever copy was free, without the owner's report.
  - There was no queue: a busy target refused the Play, and in AUTO the Dispatch button stayed locked while the previous target worked.
  - Ledger history and report attribution were lost on every Control Plane replacement.

- [WHY: P0.1] For about two days, fresh Stadium code repeatedly reconnected to a stale detached Control Plane.
  - **Human surgery:** each time the human read `~/.sideline/control-plane.json`, killed the PID by hand and waited for respawn.
  - **Why nothing caught it:** the launcher reused any daemon that answered `/api/health`, and Stadium reconnects only ever re-dialled the old port.
  - **Terminal:** existed as a creatable Player type but was deliberately excluded from routing, so the human could not choose it in the Dispatcher.

- [WHY: P0 Incoming] Report discovery split during the Q2.7/Q2.8 detached migration.
  - **Old watchers stranded:** they lived in `CoachServer.start()` and broadcast only to the local SSE server, which the detached Stadium never starts.
  - **One snapshot only:** the Stadium published reports once, at connect, and `sendReportChanged` had no caller.
  - **Wrong filter:** that single snapshot was filtered by the legacy shared `selectedGameId`. Field evidence, 2026-09-13: selection was GS3, so the Trend and Tap Assist Stadium published 0 reports while two real Player reports sat in `Reports/` and `coach.reportGlobs` was correct.

- [WHY: Q2.10C] Before Q2.10C:
  - Only Codex was a Controlled Player.
  - Claude and AntiGravity had proven session-scoped model/effort control (Q2.10B), yet every Coach-launched copy was a terminal. MANUAL showed "Claude default · Opus 5" and "Provider managed", locked, and AUTO could only display a provider's own settings.
  - Coach knew instances existed but had no memory of what each was doing, so AUTO always took the first free copy.

- [WHY: Q2.10B] Before Q2.10B, each part of the control story lived in its own place:
  - **Controlled Codex:** Coach read its capabilities only after a successful restore, and restore used `thread/read` as an existence check. When Codex 0.154.0 started answering *thread not loaded* for every unloaded thread, a healthy Codex showed *Provider Default · Live discovery unavailable* in MANUAL.
  - **Other providers:** Claude's controls came from a separate discovery path. AntiGravity reported no controls at all.
  - **MANUAL:** used one ambiguous "Auto" that meant the provider's default.
  - **Roster:** a second copy of a Player could only come from the duplicate-warning override. Copies showed identical names.
  - **AUTO:** one unavailable Player could block every ready teammate, and AUTO called it "working".

- [WHY: Q2.9C] AUTO once meant *a Controlled Player only*, which was right for the Codex-only proof. By Q2.9B it told a human with Claude clearly On Field to *add Codex for AUTO*. Separately, a detached daemon that had survived five hours of host restarts served a new page over old routing code. The field saw new UI and old behaviour at once, and source, report and tests were all correct while the runtime was not.

- [WHY: Q2.7 / Q2.7A Control Plane Reconciliation] Q2.7 selected a detached Control Plane architecture but accidentally proposed a leader/follower fallback implementation slice. Q2.7A reconciled one authoritative topology: a true detached local Control Plane with zero extension listener ports.

- [WHY: Q2.7 Stadium Bridge] Sideline Coach previously operated only with an in-extension HTTP server listening on a local port, causing `EADDRINUSE` failures whenever a second VS Code window was opened and preventing simultaneous multi-window coaching.

- [WHY: Q2.6 Multi-Game Foundation] Sideline Coach previously operated only in a single-project model (`Game: GS3` static header) with no persistent awareness of other projects. Switching projects required closing and reopening VS Code windows, and the browser UI had no concept of registered non-connected projects, per-game draft retention, or game-scoped report/player isolation.

- [WHY: Stage 1.15 / 1.16] Sideline Coach first treated a Player's VS Code terminal as both its presentation surface and its control transport. Stage 1.15 proved the public terminal API cannot guarantee one atomic multiline Play and one separate submit, because extensions cannot select bracketed paste. Stage 1.16 found the same failure one layer lower: on Windows, ConPTY does not forward bracketed-paste mode to the host terminal, and the Codex TUI groups pasted keystrokes by timing, treating an Enter inside a burst as a newline. Keystroke or paste injection into a provider TUI is therefore not a control contract, even when Coach owns the PTY. Timing delays were rejected as proof.

- [WHY: Stage 1.17] Legacy terminal transport was the only runtime dispatch path. It remains available and explicitly uncertified while the controlled path earns field proof; no Player is silently redirected between them.

- [WHY: Stage 1.19] The controlled Player's Sideline-to-provider-thread binding existed only in activation memory. Reload destroyed that association even though provider conversation history survived.

- [WHY: Stage 1.7] Stage 1.4 assumed a terminal could carry its own identity in `TerminalOptions.env`. VS Code discards `creationOptions.env` on persistent-terminal reconnect and can revive tabs by name after a full restart with fresh shells. Terminal-carried markers therefore cannot survive reload, and names cannot safely stand in for provenance. Minimal proof-only persistence was earned by that observed failure.

- [WHY: Stage 1] Runtime truth previously existed only as transient state and human memory. Establishing which copy of the extension was built, which was launched, whether activation occurred, and whether the port was available required manual archaeology across multiple directories, the OS TCP table, and VS Code's logs, repeated once per investigation.

- [WHY: Stage 1.19 / Stage 1.8 / Stage 1.21] Controlled reload persistence (Stage 1.19) and legacy re-adoption safety (Stage 1.8) were verified by unit and contract automation but lacked authoritative human field proof. Human field testing in Stage 1.21 established both as FIELD-PROVEN.

- [WHY: Stage 1 / Stage 2 Boundary] The Stage 1 roadmap item historically termed "multi-agent Play loop / touchdown" was ambiguously positioned between multi-instance and multi-provider execution. Stage 1 closed on field-proven multi-instance controlled execution; certified multi-provider orchestration belongs strictly to Stage 2.

- [WHY: Q2.8G] The two-Game bridge appeared broken for several sessions while the Q2.8 Control Plane was in fact correct throughout. Two independent defects stacked: `.vscode/launch.json` had been saved wrapped in ```json markdown fences (VS Code's error-tolerant JSONC parser recovered the object, so the corruption never surfaced as an error), and the `compounds` entry expressed a topology VS Code structurally cannot execute. Repeated launch.json experiments could not have worked, because no arrangement of two `extensionHost` configurations in one VS Code instance can produce two live hosts. Diagnosis was delayed by reading the absent second Game as an application-layer bug rather than a harness-layer impossibility.

- [WHY: Q2.9] `coach.addGame` could identify and register a repository but never completed the human's intent. Choosing a folder produced a Known Game and stopped: no window opened, no Stadium activated, nothing connected, and the human was left to open VS Code themselves. Observed live when the human chose *Gallery Media Suite* after Q2.8G and the Game never became Connected. Separately, Players depended on how they were launched — a manually started AntiGravity was invisible to the roster, so the human had to close it, re-add it through Coach, and put it on the field again purely to make Coach notice it; it was then presented through `Legacy` wording, leaking an implementation generation into the product vocabulary. Terminals existed only as plumbing rather than as a Player type Coach could offer.

## WILL BE

- Player activity and intervention policy will be live instance and Play state, never provenance. Future autonomy choices and scoped nudges must remain separate from the proof that a terminal is the same Player.

- [WHY: Q2.2 Game Foundation Architecture] **Game ≠ Stadium Invariant.** A Game is the logical software project / codebase being coached; a Stadium is the physical execution environment (VS Code window, OS platform, local path, terminal host, container, daemon). Game identity is durably established via a 4-tier resolution ladder (Tier 1: repo marker `.sideline/game.json` -> Tier 2: git remote origin / root commit SHA fingerprint -> Tier 3: Coach local registry -> Tier 4: explicit Unknown). Player control bindings and persistence (P1–P28) are scoped by `gameId` to prevent cross-Game conversation leakage. Mobile/browser UI displays single current canonical Game with Stadium context (Option A), avoiding premature multi-Game switcher complexity. Complete architecture report: `REPORTS/AntiGravity/Q2.2-Game-Foundation-Architecture.md`.

- Sideline Coach will support many Games. Player runtime truth is already per-Game through `workspaceState`; Player IDs deliberately carry no Game, Stadium, machine, or executable-path identity, preserving those separate concerns for future multi-Game work.

- [WHY: Stage 1.16 / 1.17] **Player Control Contract.** Every certified Sideline Coach Player will implement the Player Control Contract through a Tier S, H, or T adapter. The mechanism underneath may be provider-specific or Stadium-specific, but the human-facing Coach contract is invariant.

- [WHY: Stage 1.16] **Coach-built transport.** If an upstream provider does not expose a sufficient control mechanism, Sideline Coach may provide its own Stadium-side transport infrastructure rather than weakening the product contract.

- [WHY: Stage 1.16] **Control is not presentation.** A visible terminal is a presentation surface. It is authoritative for Player input only when Coach owns the process or PTY behind it, never merely because it is visible.

- [WHY: Stage 1.16] **Coach owns the experience.** Every human control action goes through Coach. Helpers, bridges, PTYs, and provider protocols that Coach installs, owns, versions, and hides are part of Sideline Coach. Provider remote-control relays are never a dependency. Localhost is a proving environment, not the product boundary.

- [WHY: Stage 1.16] **Distributed execution.** Players run on the user's own Stadium under the user's own provider credentials and billing. Any future central Sideline service is limited to identity, device routing and relay, notifications, and update coordination; it never executes Players, never holds provider credentials, and is never the throughput path for Player work. Separately billed API usage is never a silent default.

- [WHY: Stage 2 / UX-1] **Outgoing Dispatcher Status Runner.** The primary Dispatch button itself becomes the visible Play lifecycle runner (`Dispatch Play` → `Sending…` → `Received` → `Working…` → `Completed`, alongside canonical failure states `Failed`, `Interrupted`, `Unknown`). Status derives strictly from canonical Coach runtime truth, never a browser-only animation. Core product principle: *The human should never wonder whether Coach actually sent the Play.* *(FIELD-PROVEN in Q2.1; non-blocking visual polish for amber Working-state color is captured for future Q2 styling).*

- [WHY: Stage 2 / UX-2] **Prompt Composer Auto-Clear.** Once canonical provider acceptance (`Received`) is established, the active prompt composer is cleared, because the composer represents the NEXT Play, not history. Composer text is never cleared merely on click; pre-ingress failures and `Unknown` delivery preserve recoverable human text; duplicate SEND actions are guarded while the current SEND state is unresolved. Historical Plays belong in history/state. *(FIELD-PROVEN in Q2.1).*

- [WHY: Stage 2 / Routing-1] **Routing Modes: AUTO and MANUAL.** AUTO is the default intended end-user experience: Coach stages Player, Model, and Effort/reasoning level from available context (current Play, task classification, active Players, live provider capabilities). Human inspects the decision without forced configuration. Principle: *AUTO hides configuration, not intelligence.* Coach explicitly communicates what it staged (e.g. `Codex 2 · GPT-5.6 Sol · Medium`) with a one-sentence plain English rationale. MANUAL enforces a strict cascading dependency chain: Player → available models → valid effort levels (invalid combinations are unselectable). Pre-SEND route revalidation guarantees exact target and Game-scoped invariants. Uncertified legacy terminals are excluded from AUTO by default and badged in MANUAL.

- [WHY: Stage 2 / Routing-2] **Live Capability Discovery & Observation ≠ Policy.** Model choices and effort options derive dynamically from live provider capabilities normalized into a common `ProviderCapabilitySnapshot`. Codex app-server protocol exposes live machine-readable JSON-RPC endpoints (`model/list` with per-model `supportedReasoningEfforts`, `account/read`, and `account/rateLimits/read`) without consuming turns. Claude Code exposes structured JSON auth (`claude auth status --json`) and CLI flags (`--model`, `--effort`), while its model catalog is locally derivable from `~/.claude/settings.json`. Capacity routing is explicitly quarantined in Q2.3 to avoid unmetered or fabricated heuristics. Architecture scouted and documented in `REPORTS/AntiGravity/Q2.3-Routing-Intelligence-And-Capability-Architecture.md`.

- [WHY: Stage 2 / UI-1] **Persistent Bottom Scoreboard / Toolbar.** A compact, glanceable persistent awareness surface displays canonical Game, Current Play, Player, Model, Effort, and Execution Status (and eventually capacity, connection, and Stadium info). Principle: *Dispatcher = decision surface. Bottom bar = awareness surface.* Both render the same canonical runtime truth without independent state owners. Reinforced by Q2.1 human field use: transient button lifecycle is valuable, but a persistent scoreboard is needed so the human can look away, return later, and immediately understand what just happened.

- [WHY: Stage 2 / UI-2] **Duplicate Controlled Presentation Label Cleanup.** Controlled presentation displayed duplicate suffix wording (e.g. `CODEX 2 · CONTROLLED · CONTROLLED`). Minor Stage 2 UI cleanup. *(FIELD-PROVEN in Q2.1).*

- [WHY: Stage 2 / Orchestration-1] **Certified Multi-Provider Orchestration.** Expand the certified Player Control Contract beyond Codex to Claude, AntiGravity (AGY), and ACP adapters. The human-facing invariant remains: *Everything goes through Coach.*

- [WHY: Q2.5 Multi-Game Foundation Architecture] **Multi-Game Foundation & Game Registry.**
  1. *Game Registry:* Canonical inventory of known games stored in `globalState` (`sidelineCoach.gameRegistry.v1`), tracking `gameId`, `displayName`, `fingerprintSource`, `repoUri`, `knownRootFsPaths`, and timestamps.
  2. *Lifecycle Tiers:* Explicit distinction between *Known Game* (in registry), *Connected Game* (active in Stadium/workspace), *Running Game* (connected with active Players/Plays), and *Selected Game* (current UI focus).
  3. *Single Extension Host Reality:* In a single-folder workspace, Coach can *Know Many, Execute One*; non-active registered games are truthfully marked *Offline* (dispatch disabled, honest guidance). In multi-root workspaces, multiple games can be concurrently Connected and Executable.
  4. *Game-Scoped Isolation:* Roster instances, Incoming reports, and Routing decisions strictly filter by `selectedGameId`.
  5. *Exact Target & Cross-Game Safety:* Dispatch enforces active `gameId` match (`409 Conflict` on mismatch; `400 Bad Request` on offline). Staged routes invalidate on Game switch. Provider cwd check (`validateStoredThread`) remains inviolate.
  6. *Architecture Report:* `REPORTS/AntiGravity/Q2.5-Multi-Game-Foundation-Architecture.md`.

- [WHY: Future Product Breadcrumbs Approved in Q2.5]
  1. *Routing Front Door (AUTO / CONSERVE / CUSTOMIZE):* AUTO chooses best fit; CONSERVE protects scarce premium reasoning quota while meeting task needs; CUSTOMIZE exposes the deep routing cockpit (Player, Model, Effort, Rationale, Usage) built on Q2.4 MANUAL.
  2. *Usage / Budget Board Telemetry:* Truthful provider telemetry (/status in Codex, /usage in Claude Code) tracked across provenance tiers (`LIVE STRUCTURED`, `LOCAL PARSED`, `USER PROVIDED`, `UNKNOWN`); never fabricate percentages.
  3. *Player Strengths / Capability Roles:* Routing reasons about functional capability roles (`Architect`, `Implementation Worker`, `Forensics`, `Documentation`, `Quick Bounded Worker`, `High-Risk Reviewer`) rather than permanent provider stereotypes.
  4. *Player Recruitment / Extensible Roster (`RECRUIT PLAYER`):* Standardized adapter lifecycle (`Detect → Install → Authenticate → Discover → Certify → Add to Roster → Put on Field`) allowing new agents to be added without modifying Coach core.
  5. *Game Playbook / SOP Contract:* Durable repository operational knowledge (North Star, SOPs, Report Contract, Debugging policies) mapped directly to existing docs without reorganizing user repos.
  6. *Play Envelope:* Coach wraps user prompt payloads with mechanical Game context, target roles, report naming, and verification constraints.
  7. *Standard Report Contract:* Reports describe *Next Play Requirements* (task class, risk, minimum capability, recommended role) rather than commanding routing decisions.
  8. *Coach Brief:* Compact canonical brief for external strategy/conversational AIs (mobile, voice) avoiding dumping full codebase context.
  9. *Core Future Separation:* "Reports describe requirements. Coach knows resources. Human supplies priorities. Routing policy chooses the route. Players receive only the context required for their Play."

### Q2.8G Deferred Capabilities (Game & Player Lifecycle)

Each entry records *why deferred*, *the seam that enables it*, *the bucket it belongs to*, and *the mistake that would make it harder later*.

- **Add Game as a complete action (Q2.9).** Human picks a repository; Coach detects whether it is already open, opens a VS Code window when it is not, waits for activation, and drives `Known -> Opening -> Connected`. *Deferred* because Q2.8's touchdown is proving the bridge, not redesigning the entry point. *Seam:* `coach.addGame` already resolves Game identity from an arbitrary folder via `resolveGameContextSync` on a synthetic `WorkspaceFolderLike`, and `StadiumRegistry.knownGames` already holds Games with no live session. What is missing is a Control-Plane-side `game/open` that spawns a window, plus an `Opening` state between Known and Connected. *Mistake to avoid:* making Add Game a browser-only registry write — window-opening must be a Control Plane capability, because the browser has no Stadium and the requesting window may not be the one that should host the Game.

- **Game Exit / Archive lifecycle (Q2.9).** `Known -> Opening -> Connected -> Working -> Offline -> Archived`. *Offline is not Finished* — a stopped Codespace is Offline; a completed project is Archived. *Deferred* to keep Q2.8G scoped. *Seam:* `KnownGameRecord.isArchived` already exists and `getGames()` already filters on it; `GameRecord.isArchived` and `archiveGameInRegistry` exist extension-side. What is missing is the Control Plane surface and the browser action. *Mistake to avoid:* implementing Exit Game as anything that touches the repository. Archiving is a Coach-registry operation only; it must never delete or modify project files.

- **Terminal as a first-class Player type (Q2.9).** A Terminal is its own Player type and its own transport — never a costume worn by Codex or Claude. *Deferred* because it needs the Add Player surface to be useful. *Seam:* `StadiumClientOptions.sendTerminalText` already routes text to a named terminal in the correct window, and `PlayerControlHost.register(type, factory)` is already an adapter registry keyed by Player type. *Mistake to avoid:* letting a Terminal Player be identified by terminal *name*. Stage 1.7/1.8 already established that names never authorize; a Terminal Player instance needs the same opaque instance ID and ownership record as any other Player.

- **Terminal to supported Player promotion / adoption (Q2.9+).** A generic Terminal Player used to install and authenticate a CLI should be promotable into a controlled provider Player without losing Game identity. *Deferred* pending the Terminal Player type itself. *Seam:* Player instance IDs deliberately carry no Game, Stadium, machine, or executable-path identity, so an instance can change adapter without changing identity; bindings are already `gameId`-scoped. *Mistake to avoid:* minting a new `playerInstanceId` on promotion — it would break exact routing coordinates and every persisted binding.

- **Player discovery / Check Players (Q2.9).** Report per-provider `Not Installed | Installed | Authentication Needed | Ready` for the *selected Game's Stadium*. *Deferred* because discovery is only actionable once Add Player exists. *Seam:* `CapabilityService` already normalizes live provider capability into a common snapshot, and capability snapshots are already per-session in `StadiumSession.capabilities`. *Mistake to avoid:* a global `claudeInstalled: boolean`. Availability is a property of a Stadium, not of the product — a Player installed on the Windows Stadium says nothing about a Codespace.

- **One-click Player installation and authentication automation (later OT).** First slice is deliberately the path of ease: Coach opens a correct Game-scoped terminal, the human runs the documented install command and authenticates interactively, then presses Check Again. *Deferred* because credential vaults, OAuth brokers, and automated browser auth are a product of their own. *Seam:* the same adapter `detect()` used by Check Players is what makes Check Again cheap. *Mistake to avoid:* hard-coding install instructions into the browser UI instead of the adapter definition.

- **Player ownership semantics (Q2.9).** Every Player instance and terminal records whether it is `coach-managed`, `adopted`, or `external`. *Deferred* only as a durable model; the distinction is already live in behaviour. *Seam:* the existing certified/legacy split already encodes it — Coach owns the `codex app-server` child for controlled Players and merely observes legacy terminals. *Mistake to avoid:* letting Remove Player kill a process Coach did not create. Coach may dispose what it owns, must confirm before closing an adopted terminal, and must only detach from an external one.

- **Take Off Field vs Remove Player vs Close Terminal (Q2.9).** Three distinct actions: Take Off Field is a reversible execution-lifecycle change with the instance retained; Remove Player ends the instance's relationship with this Game and cleans bindings subject to ownership; Close Terminal is a transport-level action that may leave the Player instance intact. *Deferred* pending the Add/Remove Player surface. *Seam:* `fieldState` and instance lifetime are already separate concepts in `PlayerRoster`. *Mistake to avoid:* collapsing Remove Player into Take Off Field — the roster would silently lose the ability to represent a benched Player.

- **Remote terminal lifecycle control (Q2.9, minimal) and output streaming / interactive remote shell (later OT).** The minimal seam is create, send text, know cwd, know alive, close-if-owned. *Deferred:* full PTY-over-WebSocket is materially more complex and security-sensitive, and is not needed to bootstrap a Player. *Seam:* `sendTerminalText` is already the one-way half of this. *Mistake to avoid:* shipping a terminal control API keyed by terminal name rather than by `(stadiumId, gameId, playerInstanceId)` — an install command must never be able to land in the wrong Game.

- **Desktop multi-Game automation and Codespace / remote Stadium aggregation (later OT).** Desktop assumes one VS Code installation and many repo windows against one local Control Plane; Codespaces assumes one primary repo per Codespace with its own CLI environment, auth state, and StadiumClient. *Deferred* to avoid widening Q2.8 into cloud work. *Seam:* `stadiumId` is already durable-per-machine and distinct from per-window `instanceId`, and routing is already `(stadiumId, gameId, playerInstanceId)`, so a second Stadium is additive. *Mistake to avoid:* assuming one Stadium per Control Plane, or letting the browser address a Player by `gameId` alone.

### Q2.9 Deferred Capabilities

Recorded with *why deferred*, *enabling seam*, *bucket*, and *the mistake that would make it harder later*.

- **Automated provider installation (later OT).** Q2.9 deliberately ships the path of ease: Coach opens a Game-scoped terminal and *types* the install command without running it, and the human presses Enter and then Check Again. *Deferred* because running installers on the human's machine unattended is a trust and safety decision, not a convenience. *Seam:* `PlayerAdapter.installGuidance` already owns the command, and `openHelperTerminal` already owns a correctly-scoped terminal. *Mistake to avoid:* hard-coding install commands into the browser UI instead of the adapter — the catalog must stay data-driven.

- **Authentication automation, credential vaults, OAuth brokers (later OT).** *Deferred:* a product of its own, and Q2.9 must not fabricate auth state in the meantime. *Seam:* `DiscoveryProbes.probeAuth` exists and is intentionally unwired — a provider gets `authentication-needed` only when a real probe says so. *Mistake to avoid:* defaulting an unprobed provider to `authentication-needed`, which would train the human to ignore a status that is usually wrong.

- **Workspace trust and setup orchestration without trust or credential custody (later OT).** A discovered Player may truthfully enter `Setup Required`, and Coach may focus or open the correct provider/terminal interaction through a human-facing `Continue Setup` action. *Deferred:* accepting repository trust, provider terms, authentication challenges, or credential prompts is a human security decision and is outside the Q2.9A projection repair. *Seam:* the Recruit workflow already owns setup actions while adapter discovery owns provider-specific state. *Mistake to avoid:* silently accepting workspace trust, bypassing provider trust, or storing credentials merely to make onboarding appear automatic.

- **Terminal → controlled Player promotion (Q2.10).** *Deferred* pending a second controlled adapter to promote into. *Seam:* instance IDs carry no Game, Stadium, machine or executable-path identity, so an instance can change adapter without changing identity; `PlayerAdapter.adopt?` is reserved for it. *Mistake to avoid:* minting a new `playerInstanceId` on promotion — every exact routing coordinate and persisted binding would break.

- **Adapter ecosystem beyond Codex (Q2.10 / OT).** The long-term lifecycle is `Detect → Install → Authenticate → Launch → Adopt → Control → Stop`. Q2.9 implements Detect, the Install/Authenticate helper path, Launch, Adopt and Stop; only Control remains Codex-only. *Seam:* `PlayerControlHost.register(type, factory)` is already an adapter registry keyed by Player type. *Mistake to avoid:* adding speculative required fields to the adapter contract before an implementation exists.

- **Terminal output streaming and interactive remote shell (later OT).** Q2.9 implements create, send text, send Enter, know cwd, know alive, close-if-owned. *Deferred:* full PTY-over-WebSocket is materially more complex and security-sensitive, and is not needed to bootstrap a Player. *Seam:* `player.terminalSend` is the one-way half. *Mistake to avoid:* keying terminal control by terminal name instead of `(stadiumId, gameId, playerInstanceId)` — an install command must never be able to land in the wrong Game.

- **Graceful provider-specific shutdown (Q2.10).** Remove Player currently disposes a Coach-owned terminal and closes a controlled channel. *Deferred:* each provider needs its own clean-stop semantics. *Seam:* `PlayerAdapter.shutdown?`. *Mistake to avoid:* letting Remove Player kill a process Coach did not create — ownership must gate every destructive path.

- **Remote Stadium and Codespaces aggregation (later OT).** Desktop assumes one VS Code installation and many windows against one local Control Plane; a Codespace assumes one primary repo with its own CLI environment, auth state and StadiumClient. *Deferred* to keep Q2.9 local. *Seam:* discovery results already carry `stadiumId`, and routing is already `(stadiumId, gameId, playerInstanceId)`, so a second Stadium is additive. *Mistake to avoid:* assuming one Stadium per Control Plane, or letting the browser address a Player by `gameId` alone.

- **Third-party adapter / plugin ecosystem, marketplace, billing and licensing (later OT).** *Deferred* entirely. *Seam:* the adapter contract plus a data-driven catalog. *Mistake to avoid:* letting the browser learn provider-specific behaviour, which would make every new Player a UI change.

### Q2.9C Follow-ups

- **Add Game does not surface a freshly picked repository (next forensic Play).** Observed live: Game dropdown → `+ Add Game` → native folder picker → choose a new repo → the picker closes, but the repo never appears in the Game list. *Not fixed in Q2.9C.* It may intersect the Development-host open strategy (a separate `--user-data-dir` instance per Game) versus the installed-VSIX `vscode.openFolder` product path, and it may also have been masked by the stale daemon that Q2.9C replaced. *First step:* reproduce against a known-fresh daemon, then compare the Development and packaged-VSIX paths. *Mistake to avoid:* patching the browser list while the Control Plane registry never recorded the Game.

- **Control Plane build-freshness guard (small, Q2.10-adjacent).** Record a build fingerprint (a hash of the compiled daemon closure) in the discovery record and `/api/health`. The launcher then replaces a healthy-but-older daemon only in `ExtensionMode.Development`, so live Stadium sessions are never torn down in a customer install. *Seam:* the discovery record and `checkHealth()` already exist. *Mistake to avoid:* killing a daemon other windows depend on without that mode gate, or comparing wall-clock start times instead of build identity.

- **Q2.10 Resource + Routing Intelligence.** Expand AUTO from *one Player → obvious choice* to *several Players → Play Analyzer → capability / difficulty / preference / resource evaluation → best-fit Player*. Modes: **AUTO** (best fit), **CONSERVE** (best fit while protecting scarce quota), **MANUAL** (the human chooses). Future preferences, such as architecture and high-risk reasoning → Claude, implementation → Codex / AntiGravity, quick → fast and inexpensive, must be **capability and preference data, never hard-coded provider branches**. Includes usage windows, weekly quotas, reset timers and resource protection. *Seam:* `computeAutoRoute()` already separates WHO from HOW, and `RoutingDecision.transport` already carries delivery mechanics. *Mistake to avoid:* re-coupling routing eligibility to transport, or letting provider names become architecture.

- **Play Analyzer (Q2.10).** A first-class pre-dispatch classifier over difficulty, task type, risk, context size, required capabilities and expected resource cost, possibly shown to the human as *Easy / Medium / Hard Play* in the Dispatcher or the status bar. *Seam:* `classifyTask()` is the embryonic version. *Mistake to avoid:* surfacing classifier internals as settings the human must tune.

- **Controlled Claude and Controlled AntiGravity adapters.** When they exist, AUTO keeps selecting the same Player and only its transport changes, so an instance keeps its `playerInstanceId` (see Terminal → controlled promotion above).

- **One reusable status-chip system (polish pass).** Game badge, Coach connection pill and Game dropdown rows should converge on one compact chip, with a **coloured indicator always LEFT of the text**: green *Connected*, yellow *Waiting / Connecting*, red *Offline*. Colour never stands alone. *Not done in Q2.9C* (functionality first).

- **Type-id fallback in `putInstanceOnField` / `takeOffField` (Q2.9B).** Both methods resolve an unknown id as a Player *type* and act on `byType(id)[0]`. Real instance ids (`claude-xxxxxxxx`) can never equal a bare type, so a stale browser target cannot hit it today. It nevertheless contradicts the Stage 1.4 rule *never substitute a sibling*. *Recommended:* restrict both to exact instance ids when the lifecycle API is next touched.

### Q2.10A Follow-ups

- **Prove a session-scoped Claude control mechanism (next Play).** Three options, in order of preference:
  1. **Controlled Claude adapter:** print-mode `claude -p --input-format stream-json --output-format stream-json` with per-launch `--model` / `--effort`, plus `--resume <session-id>` to keep one conversation while settings change between Plays. It is session-scoped by construction, writes no user settings, and yields semantic turn events.
  2. **Live `/model <alias>` and `/effort <level>` typed into the terminal**, only if proven not to persist, or with a one-time plain disclosure the human accepts.
  3. **Rejected:** snapshotting and restoring `~/.claude/settings.json`. Coach must never edit a human's provider configuration.
  *Seam:* `ProviderSettingControl.state` flips to `available`, and MANUAL *Auto / Sonnet / Opus / …* and AUTO model/effort selection light up with no UX redesign. *Mistake to avoid:* arrow-key menu navigation, or treating an unconfirmed keystroke as an applied setting.

- **Routing Settings UI (Q2.10).** *Routing Style:* ○ Coach decides ○ Architect + Workers ○ Custom. Architect + Workers assigns an architect Player with preferred models (for example Claude: Opus, Sonnet fallback) and worker Players (for example Codex, AntiGravity). *Seam:* `ProviderSettingPreference` / `DEFAULT_CLAUDE_PREFERENCE` in `src/play-analyzer.ts` are data, and `recommendProviderSettings()` never invents an option the provider did not list. *Mistake to avoid:* making `architecture === Claude` architecture rather than a human preference.

- **CONSERVE and the Usage Sentinel (Q2.10).** Best fit while protecting scarce quota, for example a hard Play with Claude's weekly quota nearly gone → recommend Sonnet or Codex. The human can always override. Needs a resource service for usage windows, weekly quotas and reset timers.

- **Play Analyzer UX.** `analyzePlay()` already yields task type, difficulty, risk and size, shown as *Easy / Medium / Hard … Play* on the staged route. A small *Why?* affordance can explain a routing decision later, without making the normal UI verbose.

- **Advanced "+ Add another Claude".** A deliberate second instance for advanced users, as a secondary action. The duplicate guard's `allowDuplicate` is already the seam.

### Q2.10B Follow-ups

- **Controlled Claude and Controlled AntiGravity adapters (next implementation Play) — needs one human authority decision first.**
  - **Mechanism, proven in Q2.10B:** one Coach-owned structured session per instance. The first Play has no resume; later Plays pass `--resume <session>` (Claude) or `--conversation <id>` (AntiGravity) with per-Play `--model` / `--effort`. The prompt goes in as stream-json. The provider's session id is persisted exactly like Codex's `sessionRef`. Semantic turn events (init → result) feed the existing turn lifecycle.
  - **Historical decision (superseded by Q2.10C.1):** print mode cannot answer interactive tool-permission prompts, so each adapter needs an explicit permission mode. The human has now selected Full Autonomy as this profile's Coach-managed default; adopted/human sessions remain untouched.
  - *Seam:* `PlayerControlHost.register(type, factory)`, `ProviderControlProfile.sessionScopedControl`, and `projectInstanceControls` flip to `available` with no UI redesign.
  - *Mistake to avoid:* typing `/model` into a human's terminal, or silently falling back from the selected permission mode.

- **Instance Work Ledger (Q2.10C).** A light per-instance record, not a database. Per `playerInstanceId`:
  - the current Play (clientRef, analysis, model/effort, started);
  - work state (Idle / Working / Waiting / Queued / Completed / Unknown / Disconnected);
  - the last N Plays with outcome;
  - report provenance links;
  - the subsystem/files touched when known.

  Sourced from dispatch events, turn lifecycle and report provenance. It feeds **context affinity**: a busy instance that owns the context can beat an idle sibling (*Queue for Claude 1*).

- **Queue (Q2.10C).**
  - **What is queued:** the full staged route (exact instance + model + effort + prompt).
  - **Where:** in the Control Plane, per instance, in memory with an optional per-Game persistence file.
  - **Release:** on semantic completion. Terminal Players have no completion event, so their queue needs report provenance or a human "done".
  - **Human controls:** reorder and cancel.
  - **AUTO:** chooses between *queue for the owner*, *start another instance* or *use another qualified Player* using context affinity and collision risk, and recommends rather than forcing.

- **Collision / parallel-work assessment (Q2.10C+).** Classify each Play pair as parallel-safe / queue-recommended / same-instance-continuation / human-decision from shared files, subsystem, branch and task. Unknown is a valid answer; never pretend perfect prediction.

- **Report provenance (additive).** New reports should carry Game, Play (clientRef), Player type, **Player instance**, provider, model, effort and timestamp, so the Ledger can attribute history to exact instances. Old reports are not migrated.

- **Routing Settings → instance policy.** *When several copies of the same Player are available:* Coach decides (default) / Prefer idle / Prefer existing context / Queue when context matters. Alongside *Routing Style* (Coach decides / Architect + Workers / Custom), CONSERVE, and the Usage Sentinel.

- **Advanced naming.** Friendly instance names (*Claude Architect*, *Codex Worker 1*) as presentation over the stable seat; never identity.

### Q2.10C Follow-ups

- **Permissions setting UI + storage.**
  - **What exists (Q2.10C.1):** the three-choice policy schema and migration normaliser (`player-authority.ts`). Default: Full Autonomy for Coach-managed Codex, Claude and AntiGravity; controlled status projects the selected setting. Adopted/external authority is untouched.
  - **To do:** wire a durable `playerAuthority` key into `~/.sideline/preferences.json`. The daemon's `savePreferences` currently rewrites the whole object, so it must merge, not replace, before any authority key is stored.
  - **Settings UX:** place the choice under *Players & Providers -> Player Permissions*, not in the Dispatcher. This user's Full Autonomy choice is already explicit; future profiles may choose the two more restrictive policies.
- **AntiGravity resource-gateway routing.** Keep execution provider and underlying model separate. Combine the live `agy models` catalog with Usage Sentinel quota/credits/resets before recommending an AntiGravity-hosted Claude/Gemini/GPT-OSS model in AUTO or CONSERVE. No catalog family or resource advantage is permanent.
- **Controlled Player cleanup and presentation invariants.** Remove disposes the exact Coach-managed VS Code terminal/process; adopted processes detach and are never killed; bench retains the session. Stable machine identity remains separate from compact friendly numbering (`Claude`, then `Claude 1 / Claude 2`). Q2.10F.3 now projects those labels contiguously from the current exact-instance roster; the names never become routing authority.
- **Interrupt in the Dispatcher.** `PlayerControl.interrupt()` exists for print adapters (kills the process tree; turn → interrupted, may have partial changes). There is no UI or route yet.
- **Ledger persistence.** It is in memory only; a daemon restart forgets activity (entries rebuild as Unknown or Idle from snapshots). Add an optional per-Game file if history across restarts proves useful.
- **Context affinity + queue-for-owner.** Use `recentPlays` and `reports` to prefer the instance that owns the context, queue for a busy owner, and assess collisions. The Ledger already answers "what is Claude 1 doing / what did Claude 2 just finish / who wrote this report".
- **Explicit report provenance.** Timing attribution is honest but limited. A provenance header written by the Player itself (Game, clientRef, instance, model, effort) would make attribution exact.
- **AntiGravity empty conversations.** Opening a Player, or checking a missing conversation, creates an empty AntiGravity conversation. Consider cleanup or lazy creation.
- **Friendly contiguous numbering (IS · Q2.10F.3).** Stable seat ids stay canonical while one shared presentation projection recompacts current siblings (`Claude`, or `Claude 1 / Claude 2 / …`) after add/remove. Existing VS Code terminal tab titles cannot be renamed through the public API; live sessions are never recreated for cosmetics.
- **Claude plan entitlement.** Fable and other plan-gated models are offered as Claude lists them; a Play on an unavailable model fails truthfully. Discoverable entitlement would let MANUAL mark it in advance.

### P0 Incoming Follow-ups

- **Retire the legacy CoachServer selection from Stadium code paths entirely.**
  - `getLatestReport()` (the `coach.copyLatestReport` command) still uses the shared selection.
  - The local server's own routes do too.
  - The Stadium should use its own Game everywhere.
- **Report payload size.** Every publish sends up to 10 full reports over the bridge. Consider a metadata list plus on-demand content (`/api/report?path=`) if reports grow.
- **Stadium freshness in diagnostics.** ~~Expose the Stadium build stamp~~ — P0.1: each session now reports `expectedControlPlaneBuildId` and `controlPlaneCompatibility` (current / stadium-outdated / unknown). Still open: a Stadium-side build id covering Stadium-only modules, so "this window needs a reload" can be said explicitly.

### P0.1 Follow-ups

- **Browser wording during replacement.** The page shows "Reconnecting…" (it cannot tell a daemon update from a network drop). A daemon could announce `updating` over SSE before stepping down, so the phone can say "Coach updating…".
- **Outdated-window notice.** When the launcher's verdict is `stadium-outdated`, surface "Reload this window to update Sideline Coach" in the VS Code status bar tooltip or diagnostics.
- **Terminal as a zero-token AUTO executor.** Eligible only when the Play is an explicit, fully specified command and a policy (Routing Settings) permits direct execution; natural-language work always goes to reasoning Players.
- **Terminal output return.** Shell integration exposes `execution.read()`. A bounded, opt-in summary (last N lines, exit code) could return to Incoming without becoming a transcript store.
- **Remote/cloud Control Plane.** The same build-identity + owner-verified step-down primitive applies when the Control Plane is not a local child process; ownership proof would move from PID to a lease or credential.

### Routing Invariant — Explicit Human Intent Constrains AUTO (IS · Q2.10E-B/B.1 field-proven · B.2 automated proof)

**Field finding (Q2.10D/E dogfooding):**
- A Play opened with, in substance, "For Stage 1.2, use Codex on GPT-5.6 Sol" and named Codex as the Worker / Implementation Agent.
- AUTO still preferred the owner of the currently selected report.
- Cause: Q2.10D `computeContextAwareRoute` treated context ownership as the top routing signal and had no notion of explicit route constraints. That was a policy gap, not a bug in context detection.
- Q2.10E-B fixes the policy gap in the canonical routing path. Human field proof confirmed that `Use Codex on GPT-5.6 Sol, Medium` stages Codex + Sol + Medium while retaining the selected Claude report as context.
- Q2.10E-B.1 normalizes the Strategy Board's equally explicit `AGENT` / `MODEL` / `THINKING / EFFORT` header and a bounded family of equivalent directives into the same constraints. Human field proof confirmed that plain structured form.
- Q2.10E-B.2 fixes the remaining surface-format boundary: Markdown-decorated labels such as `**AGENT:**`, headings, bullets, case, and harmless label spacing normalize before the same typed parser resolves their values. Automated proof is complete; B.2 human field proof remains pending.

**Core invariant:**
> **AUTO fills in what the human did not specify. AUTO does not overrule what the human explicitly specified.**

AUTO is delegated routing intelligence, not authority above the Head Coach.

**Context is not execution authority:**
> Context ownership answers *"Who knows this?"* Explicit routing intent answers *"Who do I want to do this?"* When the human explicitly answers the second question, AUTO must respect it.

- A selected report establishes relevant context, prior owner, history and handoff material. It does not make its owner the executor.
- Example: Claude wrote the approved architecture report; the human says "Use Codex on GPT-5.6 Sol to implement it". The Claude report becomes the **handoff package** (Q2.10D `contextPreamble`), and **Codex executes**.

**Explicit constraints narrow the choice; AUTO fills the rest:**

| Human says | Constrained | AUTO still chooses |
|---|---|---|
| `Use Codex` | Player = Codex | exact instance, model, effort |
| `Use Codex on GPT-5.6 Sol` | Player, model | exact instance, effort |
| `Use Codex on GPT-5.6 Sol, High` | Player, model, effort | exact instance, queue/wait mechanics |
| `Whoever you think is best, but don't use Opus` | exclusion: model ≠ Opus | everything else within the exclusion |
| `Same Player, cheaper model` | exact instance (context owner) + "cheaper" preference | an appropriate cheaper model |

Partial specification is valid; the human never has to specify everything.

**Routing precedence** (conceptual; implementation may reorder internally, the principle may not change):
1. Human explicit routing constraint / override (MANUAL, AUTO Customize)
2. Play-specified Player
3. Play-specified model
4. Play-specified reasoning effort
5. Relevant context ownership / handoff evidence
6. Task capability
7. Work state / queue policy
8. Provider capacity / Usage Sentinel
9. AUTO defaults

> Lower-priority inference can never silently override higher-priority human intent.

Higher layers **constrain the candidate set**. Lower layers **choose within it** and **supply context** — for example, context ownership still builds the handoff package when a different Player is constrained.

**Where intent comes from:**
- MANUAL controls remain explicit and highest-confidence; AUTO never reparses them.
- Unmistakable natural-language instructions in the Play ("Give this to Codex", "Then send to Codex") are recognized conservatively by Q2.10E-B/B.1.
- Q2.10E-B.1/B.2 recognize bounded structured field dialects for Player/executor (`AGENT`, `PLAYER`, `WORKER`, `IMPLEMENTATION AGENT`, `TARGET PLAYER`, `TARGET AGENT`, `ASSIGNED AGENT`, `EXECUTOR`, `ROUTE TO`, `SEND TO`), model (`MODEL`, `TARGET MODEL`, `MODEL TO USE`), and reasoning (`EFFORT`, `REASONING`, `REASONING EFFORT`, `THINKING`, `THINKING EFFORT`, `THINKING / EFFORT`, `THINKING / REASONING EFFORT`, `REASONING LEVEL`, `THINKING LEVEL`). Every value resolves through the existing live catalog into the same typed `RouteConstraints`.
- **Dad does not learn Sideline syntax. Sideline deterministically understands a bounded family of obvious human routing dialects.**
- **Dad does not learn Sideline syntax. Sideline normalizes harmless human/Markdown formatting variation before interpreting explicit routing intent.**
- **Be forgiving about syntax; strict about resolved identity.** Presentation tolerance applies to the closed field-label vocabulary only. Player, exact-instance, model, and effort values remain catalog-validated and are never fuzzily approximated.
- Source phrases such as `Created by Claude` are context prose, not executor constraints. Report-authored `Suggested next move` / `Recommended next Player` text remains advisory unless the Head Coach restates it as an outgoing routing directive. Provenance remains evidence, not authority over the human.
- Structured Play metadata and a fuller AUTO Customize surface remain future inputs to the same typed constraint contract.
- Rules for turning Play wording into constraints:
  - Dad must never need routing syntax.
  - **No fragile broad NLP parser.** Recognise only unmistakable forms (imperative + a known Player, provider, model or effort from live catalogs, or a known structured field within the first 15 meaningful Play lines).
  - Fenced and Markdown-quoted examples are documentation, not Head Coach instructions. Later implementation prose is outside the bounded structured-field window.
  - One-edit typo tolerance may repair only an unambiguous known field label (for example `AGNET`, `RESONING`, or `THNIKING`). It never applies to values or arbitrary prose.
  - **Ambiguous language stays AUTO inference, never a guessed hard constraint.**
  - Q2.10D follow-up detection is the precedent: wording activates only structured, catalog-validated interpretation.
- **The staged route shows recognised constraints** in plain words (for example, `Codex · GPT-5.6 Sol · High`, with an "as you asked" rationale and context from Claude's report). The existing prompt and MANUAL controls let the human correct the request; a dedicated AUTO Customize control remains future work.

**Human override:** AUTO suggestions stay interceptable. Before dispatch the Head Coach can change Player, exact instance, model, effort, and wait vs reroute, wherever the product exposes those controls.

**Unavailable constrained route — never a silent substitution:**
- Example: "Use Codex Sol", but Codex is unavailable or benched. Coach does **not** silently send the Play to Claude.
- Q2.10E-B surfaces a truthful unavailable-route error. A busy but valid controlled target enters its exact durable queue with the constraints and handoff context intact.
- Dedicated **Wait for Codex** and **Let Coach choose another Player** controls, plus capacity-aware release, remain future work. The constraint stays authoritative until the human relaxes it.
- The same rule applies to the "no longer available" paths of context routing.

**Foundational for:** context-aware AUTO (Q2.10D), Model Scouting, Usage Sentinel, CONSERVE / YOLO, Scheduled Plays and capacity-aware fallback routing. CONSERVE may economise *within* human constraints, never across them.

**Dad Mode:**
> Tell Coach what matters. Coach figures out the rest.

If Dad says "Give this to Codex", he never has to wonder why Coach secretly gave it to Claude.

**WAS:** AUTO could let context ownership dominate even when the Play explicitly requested another known Player or model.
**IS:** Q2.10E-B carries typed Player, exact-instance, model, effort and safe model-exclusion constraints through the shared preview/dispatch route and durable exact-instance queue. Q2.10E-B.1/B.2 expand only the recognition boundary: the one deterministic, catalog-validated normalizer understands the bounded natural and structured dialects above, removes harmless Markdown/list/heading decoration from labels, ignores fenced/quoted examples and later incidental prose, and does not turn source attribution or report advice into execution authority. Tiny typo tolerance is confined to unambiguous known labels; values remain strict. AUTO fills only omitted dimensions. When the requested executor differs from the report owner, the authoritative Q2.10D report handoff remains attached. Dad Mode acknowledges the request in its staged rationale, and unavailable constrained routes fail truthfully instead of substituting another Player. Q2.10E-B natural forms and B.1 plain headers are field-proven; B.2 input normalization has automated proof and awaits human proof.
**WILL BE:** structured Play metadata and dedicated AUTO Customize controls; explicit Wait / Relax choices; capacity-aware release through Usage Sentinel; and safe `Same Player, cheaper model` policy after a truthful cost/capability abstraction exists.

### Provider Capacity as a Routing Dimension — Usage Sentinel → capacity-aware durable queue → WAIT or REROUTE (WILL BE · breadcrumb only)

Surfaced by live usage-limit behaviour during Q2.10D / Q2.10E field use. **Not implemented; does not interrupt that proof.**

**Core invariant:** *Running out of provider capacity should not break the coaching workflow.* Sideline turns `ERROR: usage limit reached` into a human decision — **Wait for Claude** or **Use best available Player now**. The machine handles the plumbing; Dad chooses intent.

**Four separate state dimensions — never collapse them:**

| Dimension | Question | Values |
|---|---|---|
| **Work state** | What is this exact instance doing? | Idle · Working · Queued · Unknown (Ledger) |
| **Context ownership** | Which exact instance owns continuity for this job, report or thread? | Q2.10D evidence, or Unknown |
| **Capability** | Which Player / provider / model suits the task? | routing policy over live catalogs |
| **Capacity** | Can that provider / account execute *now*? | available · approaching limit · limited until a known reset · weekly-constrained · **Unknown** |

A Player can be `Idle · Provider limited`; those are two different facts. Capacity attaches to the **execution provider/account (and model where the provider distinguishes it)**, not to the Player instance.

**Usage Sentinel:**
- **Where providers expose reliable data** (Claude and Codex/ChatGPT first): independent meters per provider — a 5-hour window and a weekly window, shown as separate meters.
- **Where they don't** (AntiGravity or others with insufficient data): show **Unknown**. Never invent usage.
- **Limit detection:** Controlled adapters (and later provider probes) report a structured `provider-limited` signal, with a trustworthy reset time when available (`Claude limited · available ~12:40 PM`), instead of leaving the human to read terminal output.
  - Evidence exists today: Q2.10C.1's Claude live proof hit a session-limit response.
- **Placement:** capacity state lives beside, not inside, the Ledger's work state.

**Limit-aware dispatch UX** (extends the Q2.10D "one alternative" pattern). When the preferred route's provider is limited:
- **A — Wait for the preferred Player:** "Send when Claude is available". The Play is queued for the preferred context owner/provider.
- **B — Continue now:** "Use best available Player". Coach reroutes using context evidence, capability, available models, current capacity, handoff artifacts and routing policy.
- Dad never interprets raw rate-limit errors.

**Scheduled and conditional Plays extend the Q2.10D durable queue** (`play-queue.ts`, persisted, revalidated) — no separate scheduling subsystem.
- **Future per-item fields:** `notBefore`, preferred exact instance, provider-capacity requirement, known reset time, fallback policy, context/report references, selected or resolved model policy, created timestamp, reason.
  - Example intent: *Wait for Claude 1 after its usage window resets, then revalidate and dispatch.*
- **Never fire a stale route because a clock reached 12:41.** At release, revalidate everything: Game exists; Player exists and is still recruited and eligible; context ownership; provider availability; model availability; queue state; collisions; human cancellation; current routing policy. Only then dispatch.
- **Condition over clock:** prefer "Send when Claude becomes available" whenever reliable provider-state detection exists. An authoritative reset time is only the earliest retry point. A small post-reset buffer (for example about one minute) is **policy/configuration**, not hard-coded architecture.
- **Fallback policy travels with the item:**
  - `Preferred: Claude 1 · If unavailable: Wait`
  - `Preferred: Claude 1 · If unavailable: Best capable available Player`
  - future: `Preferred: context owner · Fallback: same model through another provider`

**Identity dimensions still hold** (exact instance ≠ execution provider ≠ model ≠ effort; Q2.10C.1 / Q2.10E-A):
- Native Claude Opus may be capacity-limited while AntiGravity still exposes a Claude-family model. **They are not the same Player.**
- Coach may choose that alternative only under routing policy plus handoff/context evidence (a handoff package, never an assumed shared conversation).

**Future status bar** (compact in Dad Mode). Conceptually `Claude 5h: 73% · resets 12:40` · `Claude week: 46%` · `Codex 5h: 28%` · `Codex week: 61%` — never a cockpit. Per-account and provider diagnostics sit behind expansion / Advanced. Exact UI is future design work.

**CONSERVE / YOLO:**
- **YOLO:** prefer the strongest appropriate capability when capacity permits.
- **CONSERVE:** balance task difficulty, context ownership, model strengths and weaknesses, remaining 5-hour and weekly capacity, latency and cost, and handoff cost.
- **Never** naive "lowest-token model wins". Context continuity and task suitability still matter.

**WAS:** provider usage limits surfaced outside Sideline and could interrupt the human workflow. Q2.10D already provided durable exact-instance queues; Q2.10E preserves exact instance, provider, model and effort provenance.
**IS:** provider capacity is recognised as a separate routing dimension, and the existing durable queue as the natural foundation for delayed and capacity-aware Plays.
**WILL BE:** Usage Sentinel → provider capacity state → status bar → routing policy → durable scheduled/conditional queue → WAIT or REROUTE human choice → CONSERVE / YOLO. Implemented only when explicitly promoted into a Play.

### Dad-Mode UI Polish Pass — Working status + Incoming / Report Reader (IS · Q2.10F.1 automated repair · renewed human field proof pending)

Live desktop and mobile field-test findings, captured during the Q2.10E-A provenance proof. Q2.10F implements the bounded presentation pass without changing provenance, report ownership, watchers, routing, queues or Incoming transport.

**North Star:** hide plumbing by default; reveal technical detail only when it changes the human's decision or the human asks for it.

**Invariants:**
- *Operational state should be obvious without making the interface look disabled, broken, or visually heavy.* The machine may know a dozen internal execution states; Dad sees the few that affect what he can do next.
- *The human reads the report. Coach reads the provenance.*
- *Human actions produce immediate, human-readable acknowledgement* — compact, stateful feedback where the action happened, not toast spam. Examples: Dispatch Play → Working / Queued / Sent; Copy Report → Copied; Refresh Incoming → Incoming refreshed; Recruit Player → Player recruited / On Field.

1. **Working is status, not a disabled button.**
   - Q2.10F.1 field diagnosis found that the first implementation put the status inside the Dispatch button while Q2.10D intentionally restores that button for independent AUTO Plays. The repaired compact green `◉ Working · 0:38` status line is now separate and sits directly below Dispatch, so availability and active-work truth no longer erase each other.
   - The Work Ledger owns active Play lifetime and `currentPlay.startedAt`. Provider/Stadium turn events add transport and completion detail but cannot regress canonically Working to Received. A one-second browser display tick cannot start or prolong Working; refresh/reconnect reconstructs elapsed time from Ledger truth instead of restarting at zero.
   - Controlled structured-print delivery may emit `accepted` and `started` synchronously before `deliver()` resolves. PlayerRoster now synthesizes its accepted fallback only when that exact turn emitted no event, preventing the former `accepted → started → accepted` AntiGravity regression.
   - **Q2.10F.2 forensic correction:** that PlayerRoster fallback runs only on the legacy in-extension server path (`server.ts`); Control Plane dispatch goes `StadiumClient.deliverControlled → PlayerControlHost.deliver` and never calls it. The failed human proof (AntiGravity Plays 16:03–16:15) ran the in-button Q2.10F build, before the Q2.10F.1 edits (16:26–16:30); Q2.10F.1 has had no field exposure. The below-Dispatch status is transitional and is superseded by "Canonical Play Execution — Team projection + Outgoing handoff" below.
   - Text, `aria-live`, `aria-busy`, and the visible `Working` word avoid colour-only communication. Queued / Completed / Failed / Unknown remain distinct.
   - Existing exact-instance duplicate-send guards and Q2.10D AUTO no-lock behaviour are preserved.
2. **Normal report preview eats Sideline provenance.**
   - Normal Incoming preview and Dad-mode Copy now omit the one-line `<!-- sideline-provenance: {…} -->` marker, so the report starts at human-readable content.
   - The raw report object and stored report file remain untouched; provenance stays authoritative for Stadium parsing, Ledger attribution and context routing.
   - Optional future human disclosure, e.g. `Run details · AntiGravity 2 · Claude Opus 4.6 Thinking` (+ effort when known).
   - Raw provenance remains future Advanced / Diagnostics / Raw report detail.
3. **Typography-first report reader.**
   - The shared responsive reader uses 14.5 px / 1.6 on desktop and 16.5 px / 1.65 at narrow widths, retains whitespace, wraps long content, and increases mobile reading height.
   - No expanded/fullscreen reader was built. Field-test this cheap fix first.
4. **Copy Report confirms success.**
   - The button changes to `Copying…` during the real clipboard promise and to green `✓ Report Copied` only after success.
   - Selection or report revision resets the control. Failure becomes `Copy Failed · Try Again`; it never claims success.
5. **Refresh Incoming parity — inspected.**
   - Desktop and mobile already share one DOM element, handler and stylesheet; no responsive rule hides it. The field discrepancy was not a second UI path or transport defect (a stale loaded page or placement/scroll difference remains the likely explanation).
   - The recovery action is now consistently outlined and acknowledges locally with `Checking Incoming…` then `✓ Incoming Refreshed`, or a truthful retry state on failure. Automatic publication remains normal.

**WAS:** a running Play showed as a large disabled "Working…" block. Incoming transported reports, but the preview exposed raw provenance, mobile reading space was cramped, and Copy Report gave little or no visible acknowledgement.
**IS:** Q2.10F.1 projects Ledger-owned working time in a status line directly below Dispatch, preserves AUTO availability independently, and prevents structured-print start from regressing to accepted. Q2.10F continues to hide raw provenance only in human rendering/copy, raise responsive report typography, acknowledge Copy and Refresh at their controls, and use one shared Refresh Incoming path. The field-failure shape now has automated proof; renewed human desktop/mobile proof is pending.
**WILL BE:** if field testing proves typography alone insufficient, add an expanded/fullscreen-ish scrolling report reader with Copy inside and an easy return to Incoming. Optional execution details remain Advanced-only.

### Canonical Play Execution — Team projection + Outgoing handoff (IS · Q2.10F.2 A–F · Q2.10F.3 field-proven · Q2.10F.4.1 strip polish)

Full contract: `REPORTS/Claude/Q2.10F.2-Canonical-Play-Lifecycle-Team-Status-And-Handoff-Architecture.md`. Reproduction: `test/fixtures/q2-10f-2-lifecycle-trace.mjs` (real Control Plane + StadiumClient + `index.html`).

**Proven defects behind the missing Play Clock:** the browser keys execution on `selectedPlayerInstanceId`, so a second Play hides the first Player's clock. It merges `/api/status` snapshots with no ordering, so a lagging roster snapshot brings `Working` back after completion. The daemon's `/api/dispatch` reply (`status: 'received'`) does not match what the browser checks (`outcome: 'accepted'`), so the button flashes "Completed". Any status refresh during the start-up window re-enables Dispatch. The Ledger's `startedAt` is the dispatch time, not when execution started.

**Invariants:**
- *On Field is eligibility, not execution state.*
- *Dispatcher availability and Player execution are independent dimensions.*
- *Capacity and execution are independent dimensions.*
- *Execution truth belongs to exact Player instances within a Game.* The Instance Work Ledger is the only authority; Stadium turn events and capability `busy/ready` are evidence into it; the roster's `turnState` is diagnostic only.
- *Every execution projection carries the Ledger epoch + monotonic revision;* the browser applies a view only if it is newer than the one it already holds. Snapshots and live events share one merge rule, so stale state cannot win.
- *One authoritative clock:* the Control Plane records `executionStartedAt` at the first `started` evidence; browsers render `serverNow`-corrected elapsed time and never originate a start.
- *TEAM summarizes activity; the exact Player card owns human-facing execution detail.*
- *The Player-attached strip is the only canonical visible live timer location.*
- *Player execution strips are cognitive context anchors.* They let the Head Coach recover “who is doing what?” immediately across concurrent Players, Games, interruptions, and devices.
- *The live strip is a compact mini update center:* state → task reminder → current useful right-side information/action. During Working the protected right slot belongs to canonical elapsed time; after report-linked completion it may briefly become View Report.
- *Task reminders describe the work, not its routing envelope.* Deterministic presentation filtering skips Agent/Player/Model/Effort/Role/Repository and equivalent Sideline front matter; Dad never sees routing plumbing as task context.
- *Context priority is evidence-driven:* an exact known artifact/report filename outranks a semantic task reminder; a deliberate trustworthy progress headline may outrank both in a future producer; blank is valid only when none is known. Never parse arbitrary terminal chatter or invent progress phases.
- *Returned reports remain durably owned by Incoming.* A Player completion bridge lasts about 30 seconds from canonical `finishedAt`, never page arrival time, and must retire instead of becoming historical scar tissue. A report arriving after that window cannot resurrect it. An existing report edited by the current Play may use the same bridge only after its provenance is replaced with the current exact Play marker.
- *OUTGOING owns action acknowledgement, not ongoing execution.*
- *INCOMING owns durable returned work.* Report-ready acknowledgement is a field on the existing Ledger report link, not a second database.
- *SCOREBOARD owns capacity/fuel.*
- *Human navigation is explicit; background state changes do not move the viewport.*
- *AUTO fills unspecified routing dimensions but does not change execution-state semantics.*

**WAS:** Q2.10F put the clock inside the Dispatch button, which Q2.10D AUTO correctly frees. Q2.10F.1 moved it below Dispatch but still tied it to the selected Player and to unordered snapshots. Q2.10F.2 A–F then exposed canonical terminal history directly on Player cards, causing five old Unknown/failed outcomes to appear as `TEAM · 5 NEEDS YOU` even though every Player remained healthy and dispatchable. Report Ready was also duplicated in TEAM and on Player cards despite Incoming already owning returned work.

**IS:** the Work Ledger and revisioned `ExecutionView` retain full machine truth, while an explicit Dad-mode presentation policy decides what belongs on ordinary TEAM/Player surfaces. Historical Play uncertainty is not current Player health. `Needs You` means current work is blocked on a trustworthy, actual human action (for example an active sign-in, permission, input, or queue-attention requirement); old Unknown, failed, interrupted, completed, and unacknowledged report records remain quiet. TEAM summarizes only current live/actionable work. Starting, Working, queued/waiting, and genuine current intervention appear beneath the exact Player as one compact row. Working shows a useful front-matter-free task reminder and the sole protected elapsed clock. Completion may briefly reuse that same row for Finished / exact View Report, bounded by canonical `finishedAt`; it then retires completely. Incoming remains the durable report home and TEAM never duplicates Report Ready. Q2.10F.3's clean idle → exact Working clock → quiet Player + Incoming flow is human field-proven.

Human-facing Player numbering is contiguous, mutable presentation over opaque stable `playerInstanceId`. One shared exact-instance label projection feeds roster cards, TEAM names, target selection, AUTO/queue wording, Outgoing/View, dispatch results, and newly created managed terminal titles. Names never become routing authority. The public VS Code `Terminal.name` is read-only after creation, so existing live tabs may retain their creation-time title until naturally recreated; Coach never destroys a Player for cosmetic relabelling.

Human acknowledgement belongs where the human acted. Dispatch success uses the single inline Outgoing acknowledgement and immediately tappable, full-width exact-Player View action; no redundant `accepted by Stadium provider` toast covers it or leaks transport plumbing. Passive toasts remain pointer-transparent. Provider/Stadium acceptance stays machine evidence; Dad sees whether the Play was sent. Accessibility focus remains visible but restrained; the stronger short-lived Player reveal is reserved for an intentional View action.

**Dad Mode / Dev Mode direction:** Dad Mode is the default: just make the thing work, showing only facts that change the next human decision. Dev Mode will be optional and off by default: show me what the thing is doing through richer observability and configuration without silently changing execution semantics. A future exact-instance **View Console / Live Terminal** is read-only by default and uses a bounded rolling output buffer; it never makes terminal noise part of Dad Mode. Future trustworthy progress headlines (`Running tests…`, `Updating report…`) require deliberate structured telemetry, not speculative terminal parsing.

**Coach Routines V0 — Slices A+B+C+D+E, then Human Field Polish (implemented, server-side/Stadium source truth, a field-corrected Dadified Dev Mode Settings UX, and the Incoming/Copy Coach handoff loop; human field proof and Player-target delivery still future):**

> The human should not have to remember when the AI needs to remember.

> Strategy Board first. Players downstream.

**WAS:** Keeping the Strategy Board aligned with North Star, SOPs and architecture depended on the human remembering when to request another canonical reread. Sideline had no durable, Game-scoped routine definitions, cadence counters, due cycles or delivery evidence.

**IS:** Coach Routines are Game-scoped automation rules for canonical context refresh. The Control Plane now owns a versioned atomic `coach-routines.json` store, exact-Game Play counting with bounded reference dedupe, lazy Every-N-Plays / Every-N-days evaluation, routine CRUD/manual-Due/delivery APIs, and a selected-Game Strategy Board handoff projection. A Play belongs to the Game it was dispatched in, not the Game currently being viewed. Due state survives until a deliberate handoff; rendering, refreshing, previewing and report selection do not consume it. Delivered means Sideline recorded that the directive was sent—not that an external AI proved it reread anything. The directive is a Sideline-owned handoff layer and never modifies the Player report.

Dev Mode remains a global opt-in and changes no execution semantics. On the first deliberate OFF → ON transition for a Game with no configured routines, Sideline establishes the first-class default `Canonical Refresh · Strategy Board · Every 5 Plays · Players OFF`. A persisted per-Game initialization marker means deleting it is durable human intent; toggling Dev Mode cannot resurrect it. Until canonical sources are supplied, the default truthfully projects `Needs files` and emits no false handoff envelope. Counting continues while Dev Mode is off, while delivery projection remains paused.

**IS (Slice C):** Canonical source filesystem truth now belongs to the exact Game's authoritative Stadium. Bounded `routine.sources.suggest`, `browse`, and `check` RPCs use Game-root-relative paths, realpath confinement, symlink/junction escape protection, repository/credential exclusions, and metadata-only responses; the Control Plane proxies them by exact `gameId` and never inspects Game files itself. Suggestions remain proposals. Only timestamped authoritative Stadium checks may update persisted `RoutineSource.lastCheck`, and stale check evidence cannot overwrite a newer observation. A canonical refresh remains `Needs files` until every configured source is confirmed safe and matches its declared file/folder kind. Unknown, missing, blocked, unchecked, or wrong-Game evidence never creates a false handoff.

**IS (Slice D, superseded in interaction detail by Human Field Polish below — the ownership/truth model it established is unchanged):** Settings gained a real, human-facing Dev Mode toggle and a Dev-Mode-only Coach Routines card, rendered strictly from `status.routines`/`status.preferences.devMode` — never a second browser-owned truth store, and reconverging live on the existing status/SSE refresh path with no manual reload. Internal vocabulary (`canonical`, `projection`, `lastCheck`, `cadence`, `strategyBoard`, `due`, `Needs files`) stays backend-only. Every Game/routine mutation names its exact `gameId`/`routineId`; a Game switch drops any staged browse/suggestion state and re-renders strictly from the newly selected Game's own projection.

**IS (Human Field Polish):** The first real human field test of Slice D produced authoritative UX evidence — *"Really cool feature, horrible UI"* — naming specific confusions: two entry points ("+ Add files" / "Browse folder") that appeared to do the same thing; no discoverable way to explore a folder after checking it; a "Show suggestions" trigger and chip row that didn't explain themselves; an expandable "Got it" explainer that visibly did nothing when clicked; a "Refresh now" control whose name implied an immediate reread that does not happen; a "Last sent: never · Needs files — add what to reread" status line concatenating two unrelated system states; and no confirmation that configuration was safely saved and the human could leave. All were corrected as presentation-only fixes over the same Slice D/E truth model — no new persistence path, no second draft state, no architecture reopened:
- **One reference entry point**, `+ Add references`, replacing the two. Inside the (redesigned) browser, a checkbox on any listed file or folder — at any level, including a folder's own row without opening it — means *use this as a reference*; a separate `Open ›` control means *look inside*; the two are visually and functionally distinct, each its own full-size tap target, and a checked selection survives navigating deeper and back. The old separate "Use entire folder" step was removed as redundant once the folder's own checkbox does the same thing from wherever it's listed.
- **Suggested references** now load automatically in the background (no click needed to discover them exist) with a one-line explanation of what they are; each item shows one obvious `Add`, or `✓ Added` once truthfully configured — never mutated merely by loading.
- **A "Saved ✓ / Done" confidence affordance**: after any configuration change, the card shows `Saving…` then, only from that mutation's real, converged result, `Saved ✓` (or a truthful failure) alongside `Done`. `Done` is disabled while a save is in flight and, when clicked, closes transient browse/suggestion-info state and returns the card to a calm summary — it never implies completion before persistence is confirmed, and it is not a second save mechanism (every mutation was already saving immediately; this only makes that fact visible).
- **The Send-to-Coach explanation** no longer mentions Players (it previously sat directly above a `Send to Players` control and read as if it covered both): *"Your Coach AI will be reminded what to reread before helping with the next Play,"* with an optional ⓘ-toggled privacy line. The toggle lives outside the checkbox's own `<label>` (nesting it inside had risked also flipping Send to Coach) and reliably opens/closes on a single click each time — replacing the "Got it" button that field evidence showed doing nothing.
- **"Refresh now" is now "Refresh on next Copy,"** with the honest confirmation *"Coach Refresh will be added to your next report Copy"* — it does not reread anything immediately; it marks the routine due for the next eligible Incoming Copy, exactly as before, only truthfully labelled.
- **"Last refresh: Never" / "Last refresh: N Plays/hours/days ago"** stands alone; reference-completeness state ("Add at least one reference") now lives only in the references section, never concatenated onto the same line.
- **Cadence gained Hours** (`Send every [N] [Plays / Hours / Days ▾]`) as a third presentation unit over the same lazy `time` cadence Slice A already evaluates via one `now − last ≥ everyMs` comparison — no scheduler, no cron, no new evaluation path. The one validator change this required was additive and minimal: the existing `time` cadence's minimum moved from a whole day to `HOUR_MS` (1 hour), and its granularity check from "a multiple of a day" to "a multiple of an hour" (a day is already a multiple of an hour, so Days is unaffected); the upper bound (30 days) is unchanged. `cadenceLabel`/`lastSentLabel`/`nextLabel` were made hour-aware for the same reason. UI bounds are 1–100 Plays, 1–72 Hours, 1–30 Days.

**IS (Slice E):** Incoming's Copy action is now the Coach handoff's one and only delivery gate. When Dev Mode is on and the selected Game has a genuinely due, deliverable Coach-target routine, a compact banner beside Copy (`↻ Coach Refresh is due` / `It will be added when you copy this report.`) reads straight from `status.routines.handoff` — the same bounded, already-merged envelope Slices A/B project for every due Coach-target routine at once, never rebuilt or re-derived in the browser. `Not this time` is a transient, per-report, browser-local exclusion for exactly the next Copy; it never touches the routine, never marks anything delivered, and the routine stays due afterward. On Copy, the clipboard payload is the envelope, a separator, then the exact canonical report text, captured from the report the human deliberately selected at click time — never a newer report that arrives mid-flight, and the report file itself is never mutated. `POST /api/routines/delivered` (`via: 'copy-report'`) fires only after the clipboard write actually resolves; a failed write, a skipped Copy, mere rendering, report selection, a page refresh, or a Game switch never call it. If the acknowledgement itself fails after a successful copy, the human still sees their real Copy result, no local delivered state is fabricated, and the due banner reappears from the next real status refresh. Everything is exact-Game scoped end to end.

**Development-process breadcrumb (not a product change):** the first field test's initial symptom — `Add selected` staying disabled after checking a folder — was traced to a stale Extension Development Host, not a Slice D logic defect; `Developer: Reload Window` (and restarting the relevant dev hosts) resolved it and the intended behavior worked. Human field testing against an Extension Development Host must first prove the current compiled build is actually loaded before trusting a negative result. This is a process note, not a Freshness Guard redesign.

**WILL BE:** V0 human field proof of the completed Coach-side loop (Settings configuration → due banner → Copy → cleared due state), now against the field-corrected UX. Optional exact-instance Player routines remain downstream and OFF by default because they consume Player tokens/context — `Send to Players` stays disabled until that slice exists. Source contents remain external canonical references; Coach Routines do not become a repository ingestion system. Routine renaming and multi-routine creation UI remain unexposed in V0 Settings (the CRUD APIs already support them) pending evidence they're needed.

**FUTURE breadcrumb — Dev Mode "Under the Hood" / Live Player Console (product intent only, NOT implemented):** the human has further defined the earlier-breadcrumbed Dev Mode observability idea. Concept: a small, exact-`playerInstanceId`-scoped control near a live Player's strip/timer that opens a read-only, live-scrolling view of that exact instance's terminal/session activity (Claude 1 can never show Claude 2's console), with the Player's own timer remaining visible outside the console content, an adjacent `Copy Session` action, an easy Close, and the same human-facing shape across Claude/Codex/AntiGravity/future Players regardless of underlying provider transport — not a VS Code reimplementation. Paired recovery intent: when a controlled Player unexpectedly terminates, hits a known usage/capacity boundary, stops for permission, or hits another known actionable blocker, Dad Mode should surface a simplified actionable state (e.g. `Claude needs attention · usage limit reached`) with safe next actions such as `Send to next available Player` or `Queue until Claude is available` — routed only through the existing precedence (human explicit constraints → context ownership → exact instance → safe handoff rules → capacity), never a silent reroute absent an approved routing policy. A bounded, read-only session snapshot should survive an unexpected termination/limit so the terminal context isn't lost, exposed afterward via `Copy Session` — never copied to the clipboard automatically, since session output may be sensitive. None of Live Player Console, snapshot persistence, limit-triggered routing, or terminal capture exists yet.

**WILL BE:** field-check the populated compact row, 30-second edit/create View Report bridge, softened focus and wide View action on the real phone without reopening execution authority. Advanced/Dev diagnostics may later expose retained history and the bounded exact-Player console without promoting either into normal roster UX. If report typography remains insufficient on a phone, add the separately breadcrumbed expanded reader.

### P0.2 / V1 Foundation — Automatic Game Bootstrap + Canonical Reports-SC Contract (WILL BE · not implemented)

- **V1 invariant:** *Adding a Game must make it operationally Sideline-ready without requiring the human to configure report folders, globs, SOP paths, or watcher settings.*
- **Canonical report root:** `<GAME ROOT>/Reports-SC/`, with Player subfolders `Reports-SC/Claude/`, `Reports-SC/Codex/`, `Reports-SC/AntiGravity/` (created as needed).
- **Why `Reports-SC` and not `Reports/` or `Docs REPORT/`:**
  - Plain `Reports` is generic and may already exist in a real repository.
  - Sideline's feedback loop depends on knowing exactly where Player reports are written and watched. Field evidence: the P0 Incoming regression and the User-level `**/Reports/**` glob currently matching nothing in GS3 (diagnostics WARN A8).
  - Since Q2.10D, report paths also drive context ownership, handoffs, provenance and routing.
  - An ordinary user should never touch globs or report plumbing.
- **Expected flow:** `+ Add Game` → choose or paste the repository path → validate the Game → establish the Sideline Game contract → create or adopt `Reports-SC/` and the Player subfolders → install or update the minimal Sideline SOP / Game instructions (telling Players where to write) → configure the report pipeline automatically (Stadium watcher scope = the contract, not a human glob) → register the Game → ready to coach.
- **Custom location (Advanced Settings, optional):**
  - The default needs zero configuration.
  - If a custom location is supported, Coach validates it and switches the **whole contract atomically**: SOP instructions, Stadium watchers, Control Plane report scope and provenance expectations. Players and watchers must never disagree about where reports live.
- **Sequencing:** Q2.10E-A now stamps explicit provenance without changing today's report paths. P0.2 will carry that same machine contract into canonical `Reports-SC` bootstrap without migrating or breaking current reports.
- **Migration:** existing `Reports/` and `Docs REPORT/` folders are not renamed or moved by Q2.10D. P0.2 decides adoption vs coexistence explicitly and must not disturb the in-flight human mobile proof.

#### P0.2 amendment — Player lifecycle: installation is not authority

Six distinct stages. None implies the next without evidence or a human decision:

**installation → discovery → availability → recruitment → Game-local infrastructure → On Field / Bench**

1. **Scout / Check Players — evidence only.**
   - Sideline observes the Stadium and discovers supported Player executables and providers (Claude, Codex, AntiGravity; Hermes as the motivating future example).
   - A successful installer command is **not** proof: discovery must independently verify availability afterwards.
2. **Draft Pool.**
   - A discovered, supported Player that has not joined the Team is a candidate ("Hermes · Available"), with actions `Recruit` / `Not now`.
   - The human stays Head Coach.
3. **Recruit — the explicit Team-membership decision.**
   - Only then does Sideline establish the Player's Game-local infrastructure: register the Player; create or adopt `<GAME ROOT>/Reports-SC/<canonical-player-folder>/` (e.g. `Reports-SC/Hermes/`); scope watchers and the report pipeline; update the Game instructions.
   - All of this is **deterministic Sideline infrastructure code with zero model tokens**. An AI model is never used merely to create a directory.
   - AI reasoning is involved only if a Player needs genuinely semantic onboarding that a deterministic adapter cannot perform.
4. **On Field / Bench** (unchanged meanings).
   - Recruitment = on the Team.
   - **On Field** = eligible to receive Plays.
   - **Bench** = retained membership, not routable.
   - These concepts stay distinct from recruitment and from each other.

**Sideline-mediated install:**
- "Install Hermes" runs through Terminal or another explicit installer mechanism.
- On completion Sideline **automatically re-runs discovery**; the human never has to remember Check Players.
- If Hermes is independently proven available, surface "New Player discovered: Hermes · Recruit?".
- Installation never silently recruits.

**External install:**
- The human may install outside Sideline, so discovery must notice environment changes later.
- Bounded triggers:
  - explicit Check Players / Scout Players;
  - Stadium startup;
  - a suitable low-cost lifecycle event such as VS Code window focus;
  - completion of a Sideline-mediated install;
  - another bounded refresh.
- **No aggressive polling.**
- Surface the *delta* ("new Player discovered"), never silently change the Team.

**Dad Mode:**
- "🏈 New Player discovered · Hermes is available on this Stadium. [ Recruit ] [ Not now ]".
- If more configuration is needed, Recruit opens that Player's scouting/recruitment card with the candidate preselected.
- The human never handles executable paths, report directories, report globs, re-running discovery after a Sideline install, or adapter plumbing.

**Historical data:**
- Recruiting creates or adopts `Reports-SC/<Player>/`.
- Removing the Player from the Team **never deletes** that folder or its reports; they remain Game history.
- Re-recruiting safely adopts the existing directory.

**Extensibility invariant:** `Install Player → Auto-Scout → independently discovered → Draft Pool → Coach chooses Recruit → Player registered → Player infrastructure bootstrapped → On Field / Bench` must work for any future Player type without redesigning Game Bootstrap. Claude, Codex and AntiGravity are current examples only.

#### P0.2 amendment — Sideline Report Contract: reports are handoff artifacts

Creating `Reports-SC/` is not enough. Context-aware routing (Q2.10D) needs reports to be predictable **handoff artifacts**, not arbitrary prose. Game Bootstrap installs and updates a lightweight **Sideline Report Contract** as part of the Game's SOP.

**Core invariant:** *Every Player completing a report-producing Play should leave Sideline enough structured evidence to understand what happened, who owns the context, what remains, and how continuation should be approached.*

The contract has two layers:

1. **Machine-owned provenance** (authoritative evidence).
   - Stamped by **Sideline** wherever practical, not invented by the Player. It builds on the Q2.10D `sideline-provenance` seam (`src/report-provenance.ts`, Ledger `explicit-provenance`).
   - Fields: gameId, clientRef / Play identity, exact playerInstanceId, Player type, execution provider, underlying model, effort, timestamp.
   - Never shown to an ordinary human.
2. **Human-readable Player handoff** (advice).
   - The SOP asks reporting Players to finish with a short, predictable `## Sideline Handoff` section:
     - what changed or was learned;
     - current state;
     - recommended next Play;
     - continuity recommendation: *Same Player preferred* / *Any capable Player* / *Specialist or different role recommended*;
     - relevant files and artifacts;
     - open questions or blockers, when applicable.
   - Concise by design; reports must not become bureaucratic paperwork.

**Routing authority — never collapse these:**
- **Sideline provenance = evidence**
- **Player handoff recommendation = advice**
- **Coach routing policy = decision**
- **Human Head Coach = final override**

A Player can never force routing by writing something like `ROUTE_TO=Claude1`. Agent-authored continuation recommendations may *influence* context-aware AUTO (a signal beside Ledger evidence) but are never routing authority. A malformed or adversarial handoff section is simply ignored.

**Report naming:**
- P0.2 designs a canonical Sideline report naming convention: sortable, attributable, collision-resistant, human-readable, easy for Players to reference, and independent of agent habits. The exact pattern is decided in P0.2, not hard-coded here.
- The filename is never the sole source of identity or routing authority; machine provenance remains authoritative.

**Game Bootstrap, amended:** Add Game → establish Game identity → create or adopt `Reports-SC/` → install or update the Sideline SOP → install the Report Contract → discover / recruit Players → create Player report folders dynamically → Players receive the common reporting contract → report watcher and provenance pipeline ready → Game ready to coach.

**Extensibility:** the Report Contract belongs to **Sideline**, not to Claude, Codex or AntiGravity. Future Players such as Hermes inherit the same reporting and handoff contract when recruited; a new Player adapter never requires redesigning report semantics.

**Future memory:** richer persistent-memory systems (for example Hermes) may later consume or augment these reports. Sideline's core context and routing architecture must **not** require an external memory agent to function: `Reports-SC` + provenance + structured handoffs are a lightweight, durable memory layer on their own, alongside the persisted Instance Work Ledger.

**Scope now:** not implemented during Q2.10D or its human proof. No report folder is migrated, and today's reports without a handoff section remain valid (Unknown where evidence is missing).

**Relation to today:**
- Q2.9/Q2.10A already separate Check Players (discovery), Recruit Players (catalog), Roster (Team) and On Field / Bench.
- P0.2 generalises that into the Draft Pool and delta notifications, and moves report-folder bootstrap into recruitment.
- Not implemented in Q2.10D; no current report directory is renamed or migrated.

#### P0.2 amendment — Game Filesystem, Browse, Search & Bootstrap architecture (WILL BE · architecture only · not implemented)

Full blueprint: `REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md` (2026-09-15).
- **Name:** the Sideline-created canonical root is **`Reports-SLC`**, superseding `Reports-SC` above.
- **Precedence:** human choice > one unambiguous existing root (`Reports-SLC` / `Reports` / `Docs REPORT`, or an already-discovered nested report root) > create `Reports-SLC`. Ambiguity = `needs-choice`, never a guess. Nothing is ever renamed, moved, merged or deleted.
- **Ownership:** Game identity (`.sideline/game.json`) stays separate. Control Plane owns a `GameFilesystemContract` in `~/.sideline/game-filesystem.json` (decision, provenance, revision). Stadium owns filesystem evidence, the only two mutations (`mkdir` `Reports-SLC`, `mkdir` lanes), and watchers.
- **Lanes:** keyed by player type (`Codex`, `Claude`, `AntiGravity`), never model or instance. `Reports-SLC/` is created even with an empty roster, but with no speculative child folders. Each lane is created idempotently when its provider joins the Game roster, and never deleted on retirement.
- **One coordinate:** the Stadium watch scope (canonical anchored pattern ∪ legacy `coach.reportGlobs`) and the Controlled-Play report-destination footer derive from the same contract revision.
- **Browse/Search/+ PATH:** one neutral Stadium Game Files service (extracted from `routine-sources.ts`), exact-Game-root only, metadata only. One Browse Game sheet with context action providers. Outgoing `+ PATH` inserts a backticked Game-relative path at the caret.
- **IS (S1):** Sideline has a neutral Stadium-owned Game Files service for exact-Game, metadata-only Browse/Check. Neutral `game.files.browse` / `game.files.check` RPCs and `/api/games/files/browse` / `/api/games/files/check` routes preserve Game-root containment and advertise `game.files.v1`; Coach Routines remains a compatibility consumer through its unchanged legacy routes.
- **IS (S2):** The neutral Game Files service also provides bounded, deterministic file/folder name and Game-relative-path Search through `game.files.search` and `/api/games/files/search`. Search shares Browse's visibility boundary, returns metadata only, reports incomplete scans truthfully, and cooperatively supersedes older Stadium searches.
- **IS (S3):** Outgoing now exposes `+ PATH` as an independent Play-composition/filesystem control, not a routing mode: `AUTO | MANUAL` remains one routing family while `+ PATH` is a separate far-right action. The shared Browse Game sheet consumes exact-Game neutral Browse, supports lazy folder navigation and contextual Copy Game-relative path / Insert path into Play actions, and insertion preserves routing mode, Player, model, effort, and staged route state. Search UI, absolute-path resolution, GameFilesystemContract, Bootstrap, Settings folder selection, and `Reports-SLC` creation remain unimplemented.
- **IS (S4):** Browse Game contains whole-Game, exact-`gameId` Search backed only by the neutral S2 `/api/games/files/search` route. Search remains metadata-only, preserves backend result order, suppresses stale query/Game/session responses, reports partial scans and additional matches truthfully, and feeds the existing S3 Insert / Copy action provider. Search results also support `Open containing folder` and folder `Open folder` through the existing lazy Browse request; no absolute path or content Search is constructed.
- **WILL BE / V2 / PROPOSED:** Browse Game may gain an opt-in multi-select path mode for inserting several file/folder paths into one Play. V1 remains single-select; this is not implemented UI or behavior.
- **IS (S5):** Absolute-path resolution is an explicit, ephemeral action owned by the exact Game's authoritative Stadium. `game.files.resolveAbsolute` and `POST /api/games/files/absolute-path` validate through the shared Game Files visibility policy, prove realpath containment, and return the Stadium-native lexical coordinate only after human action. The shared Browse/Search provider exposes `Copy absolute path` with prefetch, truthful unavailable/version-skew states, and existing clipboard failure handling. Normal Browse/Search results and Play insertion remain Game-relative; no browser or Control Plane path join exists.
- **IS (S6):** Sideline durably knows, per Game, where the Reports and SOP/onboarding roots are and why it believes that. A versioned `GameFilesystemContract` (`~/.sideline/game-filesystem.json`, atomic write, quarantine on corruption) is Game-keyed, independent of the selected Game, survives Control Plane replacement, and stays separate from Game identity — `.sideline/game.json` is untouched. Paths are Game-relative. Every candidate is observed only by the exact Game's authoritative Stadium through read-only `game.filesystem.inspect` (`game.filesystem.v1`), which reuses the S1–S5 containment/visibility policy; evidence naming another Game, a Stadium without the feature, or an offline Game leaves the last durable answer standing rather than guessing. Detection recognizes `Reports-SLC` / `Reports` / `Docs REPORT` at the Game root plus report roots already proven by discovered reports, weighs emptiness as evidence, and records `adopted`, `human`, `not-set`, `needs-choice` or `needs-attention` with provenance; an explicit human choice is never overwritten by later detection, and a configured root that disappears becomes Needs Attention with no silent fallback. Status/`GET /api/games/filesystem` project folder, provenance and one human sentence, with raw evidence behind Dev Mode. **S6 mutates no Game filesystem:** no `Reports-SLC`, no SOP folder, no Player report lane, no rename or move. A no-candidate Game records the deferred `create-reports-slc` intent only.
- **IS (S7):** The Control Plane projects the current Game-keyed contract revision to only that Game's authoritative Stadium through `game.filesystem.apply.v1`. The Stadium cache is memory-only, rejects cross-Game and stale applies, and uses a ready canonical Reports path as an anchored `RelativePattern` for scanning/watching. The canonical pattern is additive with unchanged explicit/default `coach.reportGlobs` compatibility. A root revision disposes obsolete watchers, installs the new set, immediately rescans and republishes Incoming; watcher generations and serialized publishing prevent an obsolete watcher/scan from becoming final state. Agent attribution uses the first segment below the applied canonical root (lane-key normalization when known), then the legacy `Reports` / `Docs REPORT` rule. S7 performs no Game filesystem mutation.
- **Still WILL BE after S7:** `Reports-SLC` creation, Player report-lane creation, the Controlled-Play report-destination footer, and the Dad-facing Game Setup picker. Multi-select Browse remains V2.
- **IS (S7.1):** Field-proven multi-Game regression fix (`REPORTS/Claude/Opus-Multi-Game-Report-Discovery-Regression-Root-Cause.md`): the legacy `coach.reportGlobs` compatibility path (`src/report-glob-policy.ts`, pure/no-vscode) now unions a configured value with the recognized-root defaults instead of replacing them — one Game's custom glob can no longer silence discovery for every other Game on the machine — and, on win32/darwin, emits exact/upper/lower case glob variants for each name in `RECOGNIZED_REPORT_ROOT_NAMES` (imported, not re-declared), because VS Code's own glob include matching is case-sensitive even where the host filesystem is not. This governs only the legacy glob path; the S7 anchored `RelativePattern` (which is already case-correct via on-disk-cased evidence) is unchanged and remains the authoritative path once a Game's contract is ready. S7.1 performs no Game filesystem mutation and recognizes no new canonical root name.
- **IS (S11.1) — Plumbing SLC Game-owned bootstrap:** fresh exact-Game evidence now authorizes a filesystem-unconfigured Game to create one bounded workspace: `Plumbing SLC/Reports/`, `Plumbing SLC/SOP/`, and only roster-required provider lanes beneath Reports. The existing S8 Stadium mutation seam performs a complete read-only preflight before ordered, idempotent creation; safe partial Plumbing structures are completed without rollback deletion, while ambiguity, collisions, escaping links, offline/wrong-Game state, and incomplete preflight authorize no mutation. Existing Reports/SOP coordinates are adopted before creation, mature Games and historical content are never moved or normalized, `Reports-SLC/` remains permanently recognized, and explicit S10 human choices remain authoritative. Schema-v1 `reports.path` / `sop.path` remain sufficient — no `plumbingRoot` or new authority. S7 and S9 consume `Plumbing SLC/Reports` unchanged; S10 projects both created paths through its existing UI. `Plumbing SLC/Diagnostics/` remains future-compatible and uncreated. Proof: 51 focused S8/S11.1 tests, 171 focused S6–S11 tests, and 951 full tests passed. Reports: `REPORTS/Codex/S11.0-Plumbing-SLC-Game-Owned-Bootstrap-Architecture-Amendment.md`, `REPORTS/Codex/S11.1-Plumbing-SLC-Bootstrap-Implementation.md`.
- **IS (S8.0):** the first narrowly authorized filesystem-mutation slice. `game.filesystem.ensure` (Stadium RPC, feature `game.filesystem.ensure.v1`) creates at most one exact Game-relative directory per request through `ensureGameDirectory`/`ensureGameFilesystemStructure` (`src/game-files.ts`): idempotent on an existing folder, truthful `needs-attention` (never an overwrite/delete/rename) on a file collision, escaping symlink/junction, or containment violation, and verified by `stat` after creation. `Reports-SLC` is created only when the durable contract's own decision already reached `create-reports-slc` — S6 already guarantees that means no ambiguity, no existing root, no needs-attention. Provider report lanes (`Codex` / `Claude` / `AntiGravity`, never model, instance ID, or a human label) are ensured only for a type the current roster actually has (`PlayerRoster.status()`'s own `instances` count, Terminal excluded — it authors no reports); duplicate instances of one type still collapse to one lane. `GameFilesystemCoordinator.recordReportsRootCreated` sets provenance `created` (never `adopted`, so a later re-decide can never mistake Sideline's own folder for one it merely found); `recordReportsRootAttention` records a failed/blocked creation truthfully without claiming success; `recordLaneEnsured` is strictly additive — an already-recorded lane (ready or needs-attention) is never touched again, so a roster shrink or a repeated ensure can never delete or rewrite report history. The Control Plane runs the ensure pass only after S7's own reconcile/apply for that exact Game (on `game-connected` and on `roster-updated`), reuses the same `withExactGame` Stadium-side isolation as `game.filesystem.inspect`/`apply`, and republishes through the unchanged S7 apply/watch pipeline once the contract changes. S8.0 performs no rename, merge, migration, or SOP-folder mutation, and implements no Game Setup UI. Report: `REPORTS/Claude/1.2-Reports-SLC-Bootstrap-And-Roster-Provider-Lanes.md`.
- **IS (S9.0):** the convergence slice — `PLAYER WRITES HERE == INCOMING WATCHES HERE`. A Controlled, non-direct-shell Play's dispatch footer (`src/control-plane/router.ts`, via an injected `setReportDestinationResolver`) gains one additional machine-authored clause — `SIDELINE CONTROLLED REPORT DESTINATION` (`src/report-provenance.ts:buildReportDestinationInstruction`) — naming the exact Game-relative `<reportsRoot>/<ProviderLane>/` folder, resolved *only* from the same durable `GameFilesystemContract` (`GameFilesystemCoordinator`, sole owner since S6) S7 already applies/watches for that exact Game and Stadium session. The clause is present only when all of: `contract.reports.state === 'ready'`, the dispatched provider's lane (`getPlayerAdapter(playerType)?.name` — the identical Codex/Claude/AntiGravity vocabulary S8.0 uses, never model/effort/instance/terminal) exists and is `state: 'ready'` in `contract.reports.lanes`, and the exact dispatching session advertises `game.filesystem.apply.v1` (reusing S7's own mixed-version truth — a Stadium that cannot apply the canonical contract is never told its write and Incoming's watch are aligned, because they are not). Any other state (`unknown` / `not-set` / `needs-choice` / `needs-attention`, missing/non-ready lane) silently omits the clause; the Play still dispatches with provenance only, exactly as before S9.0. Destination is resolved from the dispatched `gameId` alone — never `coach.reportGlobs`, filesystem scanning, prompt text (a Play containing `REPORT DESTINATION: …` is delivered verbatim and has no effect), Player cwd, or the browser/Control-Plane-selected Game — so two simultaneously dispatching Games, or a selected-Game change mid-flight, can never cross-contaminate. S9.0 performs no filesystem mutation, adds no field to the machine-readable `sideline-provenance` marker (destination stays a separate human-readable clause), and does not touch S6/S7/S7.1/S8.0's own decision, apply, or ensure logic. Report: `REPORTS/Claude/1.3-Canonical-Controlled-Play-Report-Destination-Wiring.md`.
- **Not IS until each slice (S1–S11 in the report) is proven.**

### Q2.10D Follow-ups (WILL BE)

- **Canonical `Reports-SC` Game Bootstrap + Sideline Report Contract.** Q2.10E-A supplies machine provenance on current report paths; P0.2 standardises the zero-configuration location, watcher scope, naming and human-readable handoff contract.
- **Usage Sentinel + CONSERVE.** Quota, credits and reset windows per execution provider and model. It routes around scarcity (for example AntiGravity → Claude Sonnet when native Claude is exhausted) with explanation and override, and never hardcodes a provider as cheaper.
- **Advanced Settings defaults.** Optional default model per Player/provider, default effort, and task-specific routing preferences. Defaults remain policy inputs and never substitute for recording what actually executed a specific Play.
- **Architect + Workers orchestration.** One owner designs; workers receive handoff packages; the queue serialises coupled work.
- **Richer collision detection.** Repo diff and file events from the Stadium, instead of file names mentioned in Plays.
- **Deterministic Terminal AUTO executor.** Only for an explicit exact command under policy. Natural language never reaches a shell.
- **Queue controls:** reorder, move a queued Play to another instance (as an explicit human act), queue for Terminal-transport Players (needs a completion signal).
- **Advanced routing preferences** (Routing Settings instance policy), cloud/remote Stadiums, distribution and productization.

### Coach Routines V0.1 Follow-ups (WILL BE — do not implement yet)

- **Source freshness is one contract with the refresh instruction.** Sideline should never tell an AI Assistant Coach to reread "current" sources without knowing whether those sources are actually reachable and current. Future Dad-facing states may include `Coach Sources · Up to date ✓`, `Coach Sources · Syncing…`, `Coach Sources · Local changes not published`. Not implemented in V0.1: the per-Game repository URL added there is only ever an explicit, human-entered coordinate — never validated, never synced, never used to detect drift between local and remote.
- **A Game may have a local working-copy identity and a remote repository identity, as two distinct coordinates.** V0.1 adds the remote coordinate (repository URL) as plain optional metadata alongside the existing local `rootFsPath`/`repoUri` auto-detection; it does not unify them into one Game-identity model. Future source delivery may use local access, repository access, embedded source packets, cloud storage, or other transports — GitHub is a powerful delivery method, not a prerequisite for Sideline Coach.
- **AI Assistant Coach terminology.** Human: "Head Coach". Human-chosen conversational AI (ChatGPT, Claude, etc., wherever the human is talking with it): "AI Assistant Coach". Execution agents (Claude Code, Codex, AntiGravity running Plays): "Players". V0.2 shipped the compact `✓ AI Assistant Coach brief included` disclosure (with "View brief") in the report reader. Progressive teaching for the first few exposures, and a collapsible Settings glossary / Sideline Playbook explaining this vocabulary, remain not implemented.

### Coach Routines V0.2 Follow-ups (WILL BE — do not implement yet)

- **Progressive disclosure teaching + Settings glossary.** V0.2 shipped the plain, always-identical `✓ AI Assistant Coach brief included` / "View brief" disclosure (see above). A richer version could soften wording after the first few exposures once the human is presumed to already understand it, and a future collapsible Settings glossary / Sideline Playbook would explain "Head Coach / AI Assistant Coach / Players" and other product vocabulary in one place. Neither is implemented; V0.2 deliberately kept the disclosure "essentially free" and static.
- **Dev Mode → Git Activity.** Human field evidence (V0.2): a selected historical Player report happened to be a "Commit and Push Report" containing commit hashes, branch, and push results — the Player wrote that report and it correctly remains untouched (canonical Player-authored content is never sanitized or rewritten). But the human does not want *Sideline-owned* Git/source-sync mechanics surfacing this way by default going forward. Future: a collapsed, Dev-Mode-only "Git Activity" diagnostics/history surface for Sideline's own future Coach-source-sync operations (see below), separate from and never touching canonical Player reports. Not implemented in V0.2.
- **Coach source freshness + sync policy (do not implement — Git automation is explicitly out of scope until this is designed).** Future canonical Game bootstrap:
  ```text
  <GAME ROOT>/
  ├─ Coach/         durable onboarding / North Star / SOP / breadcrumbs / architecture / Assistant Coach knowledge
  └─ Reports-SLC/   Sideline's canonical Player report return channel
  ```
  A refresh instruction and source freshness are one contract — Sideline must never tell an AI Assistant Coach to reread "current" sources without knowing whether they are actually reachable and current (see the V0.1 breadcrumb above; this refines it with an explicit bounded sync policy):
  - Watch `Coach/` for changes; a changed file becomes "dirty" for that Game.
  - Never commit/push on every Play — a cadence of every 5 Plays must NOT produce 5 Git pushes.
  - Only publish when needed for an actually-due Assistant Coach refresh; if nothing changed, do nothing.
  - A final freshness preflight runs immediately before producing/copying the due handoff.
  - Sync is scoped strictly to bounded `Coach/` knowledge, never unrelated application work.
  - Remote commit/hash plumbing stays out of Dad Mode entirely (see "Dev Mode → Git Activity" above for where it could surface).
  The exact Git safety/branch/credentials/conflict architecture, and the `Coach/` + `Reports-SLC/` bootstrap/migration itself, are deliberately deferred — not designed or implemented here.
- **Future Player-side standing knowledge (failsafe).** Once "Send to Players" is eventually enabled (still disabled/"Coming soon" as of V0.2), Sideline may inject bounded Player-side standing knowledge — breadcrumb conventions, the report contract, canonical project rules, operating SOP requirements — directly into a Play, independent of Coach Routines. This gives a Player-level failsafe even when a particular AI Assistant Coach session omitted something. Not implemented; Player delivery remains entirely unbuilt.

### Durable Dad-facing UX principles (IS — Q2.10F.8 tiny polish)

> Post-dispatch primary-action bridge: after successful dispatch, temporarily replace the Dispatch Play CTA in-place with `View <exact Player>` rather than introducing a second CTA elsewhere. Preserve the same screen position to minimize mouse travel.

> Collapsed durable configuration cards should show truthful local persistence confidence (e.g. a real "Saved `<time>`") when useful, without forcing the human to reopen the editor.

### Dev Mode Player Intelligence & Control (WILL BE · architecture frozen · not implemented)

Full contract: `REPORTS/Claude/Opus-Dev-Mode-Player-Intelligence-Control-Architecture.md` (reconciles Scouts A–D in `REPORTS/Scout Only/Dev-Mode-Player-Control-Recon__2026-09-14/`). This entry extends, and does not replace, "Routing Invariant" and "Provider Capacity as a Routing Dimension" above.

**North Star:** *Coach carries the scoreboard so the Head Coach doesn't have to, and never claims to know what it cannot observe.*

- **[WHY] One derived Player Scoreboard, never one status enum.**
  - Truth about a Player is multidimensional: identity, participation (On Field/Bench), work state, execution detail, context continuity, capability, capacity, session continuity, observability, control capabilities.
  - It is a **derived** projection keyed by exact `(gameId, playerInstanceId)`. Every dimension keeps its existing owner, and nothing is written by the projection.
  - Eligibility is derived as a **list of all applicable reasons** (`now` + `later`), never collapsed.
  - Dad Mode, Dev Mode, AUTO, scheduling, controls, and Under the Hood are projections of it. The "Persistent Bottom Scoreboard" UI idea is one projection, not the model.
  - *Why:* collapsing independent truths into one enum is exactly how "Idle · Provider limited", "Busy vs Benched" and "Connected ⇒ healthy" get lost.
- **[WHY] Evidence = class × freshness; precedence is per question.**
  - Classes: `provider-structured`, `sideline-applied`, `sideline-recorded`, `local-parsed`, `report-attested`, `user-provided`, `inferred`, `unknown`.
  - "What the human asked", "what Sideline sent", "what the provider accepted", and "what the provider reports it ran" are **different questions**. Conflicts are kept side by side, never overwritten.
  - **Report provenance proves attribution (which instance/clientRef wrote it), not which model executed.** Sideline stamps it from its own dispatch facts.
  - Capability `activeModel/activeEffort` is a **sideline-applied** control setting, valid for a turn only when tied to that `turnRef`.
- **[WHY] Identity ≠ execution detail.**
  - `Claude 1` stays the Player. `Opus · High` is `ExecutionView.run` (`requested / sent / applied / observed`), inside the existing revisioned `ExecutionView`, so one epoch/revision orders both. A parallel store would recreate the stale-layer race.
  - The Dad renderer never reads `run`.
  - `provider-default` never shows the catalog's default model name; unknown shows `Model unknown`.
  - Idle Players show no active run label; the last run is Dev history.
- **[WHY] Context affinity is graded continuity evidence, never authority.**
  - Plays carry a `sessionEpoch` that increments when a fresh provider session opens under the same instance.
  - An author whose provider session was not preserved has **authorship-only** affinity, which forces a handoff package even to the same instance.
  - Affinity chooses only within the human-constrained, eligible set; it never overrides constraints, jumps queues, un-benches or bypasses capacity.
  - Token/context size is shown only from provider-structured evidence, otherwise Unknown. Never estimate percentages.
- **[WHY] Capacity ≠ Busy ≠ Bench ≠ Unauthenticated ≠ Needs verification.**
  - Capacity is provider/account(/model)-scoped evidence with a **mandatory `expiresAt`**. **Expiry projects Unknown, never Available.** Unknown capacity never blocks.
  - Capacity **never mutates `onField`**: Bench is human intent, and a limited Player stays On Field with reason `capacity-blocked`.
  - Provider quota windows (5-hour, weekly, …) are evidence labels, not core enums.
  - **Try anyway** is MANUAL-only and capacity-only, and its outcome becomes new evidence. **Marking a provider available is forbidden** (fabrication). User-provided capacity statements are evidence the human can add and clear.
  - Scheduled Plays store conditions and fully re-evaluate at release; never fire on the clock alone and never un-bench.
- **[WHY] Provider-specific control semantics; there is no Pause.**
  - Verbs: **Stop Play** (hard kill of the current turn only, `turnRef`-guarded, partial changes disclosed; Claude/AntiGravity yes, **Codex no until a native turn interrupt is certified, never app-server `close()`**, Terminal no); **Checkpoint** (a reserved Play that ends in a Player-authored report, never interrupting); **Hold/Release** (Sideline-owned queue gate, the only pause-like concept, never called Pause); **Reconnect** (same provider session); **Start Fresh** (human answer to needs-decision only); Bench/On Field; Remove.
  - Session preservation is a reported property, not a button. **Provider session preserved does not mean visible history preserved:** `eventHistory` is live-only (50 events) and lost on Stadium restart, and must be reported that way.
  - Checkpoint/report text is never auto-generated from the activity stream.
- **[WHY] Observation ≠ control, enforced at authority level.**
  - Today one machine token authorizes every route, including `/api/events` SSE. So a read-only authority class must be *introduced*: a short-lived **observe grant** bound to one `(gameId, playerInstanceId)`.
  - It opens only that activity stream and is rejected by every control/dispatch/preferences route. The activity route never accepts the master token, so the token never rides an `EventSource` URL for this feature.
  - **Dev Mode is a presentation preference, never authority.**
- **[WHY] Under the Hood is exact-instance, read-only, redaction-before-egress.**
  - `ControlEvent` → Stadium `ActivityRedactor` (the only producer of `ActivityFrame`; fail closed) → demand-driven WS `player.activity` (forwarded only for subscribed instances) → daemon bounded relay ring + secondary verifier → **per-connection scoped SSE route**.
  - **Never** the shared `/api/events` broadcast, which sends everything to every client. **Never** `server.ts`. No new transport technology.
  - Default content: lifecycle + tool/program names + redacted assistant text. Command arguments are opt-in.
  - Env values, tool inputs/outputs, stderr, diffs, and session refs are never sent.
  - Activity text is never persisted (Ledger, reports, logs, browser storage).
  - Frames carry Stadium-origin `(streamEpoch, seq)`; gaps are explicit, never stitched.
  - "LIVE" describes the observation path (stream + Stadium socket + subscription ack + heartbeat), not work state.
  - Terminal shows "not available" because its output is never read.
  - Ship is gated on the redaction corpus, grant/route matrix, scoped-stream isolation, caps, and log hygiene.
- **[WHY] Freshness is architecture.** Every truth class has a source, owner, freshness rule, expiry, revalidation and failure state (Freshness Matrix in the report). **One "Connected" proves only transport/session presence**, never capability freshness, capacity, session proof or build currency.
- **[WHY] Dad Mode stays boring.**
  - Dad sees label, On Field/Bench, and work state.
  - It gains only a conditional plain reason (`Can't take Plays now · Limit reached · back ~12:40`), shown only when it changes the human's decision.
  - No model/effort, evidence classes, affinity, session proof, control descriptors, or activity. No Dad controls in V1.

**WAS:** exact identity, execution truth, constraints, affinity, queues and session restore existed; activity was Stadium-local; capacity lived in the human's head; one token granted everything.
**IS:** architecture frozen; nothing implemented.
**WILL BE:** Slice 1 = Evidence vocabulary + `ExecutionView.run` projection (no UI), then Dev run adjunct → derived eligibility/Scoreboard → capacity store → capacity-aware dispatch → evidence sources; Hold → Stop Play → Checkpoint; session grading; security gate S1–S4 before any Under the Hood UI. Bounded probes: Codex app-server interrupt/rate-limit/token-usage/model (P1), Claude stream-json model/rate-limit frames (P2), mobile access path (P3).

### A-Team Scout Interchangeability V0.1 (provider-neutral Play seam)

**WAS:** the first Scout Runner manifest correctly proved bounded concurrent OpenCode Scouts, but each assignment coupled semantic reconnaissance intent to an OpenCode agent whose definition also selected a provider/model.

**IS:** `ScoutPlay` owns one normalized, deeply immutable objective/scope/authority/evidence/report contract and one deterministic Play/prompt identity. Sequential Player executors sit below it: direct Google Gemini through a deny-by-default OpenCode Scout agent, and AntiGravity through the existing Structured Print control with its native read-only Plan/Sandbox authority. Player, harness, provider, model, effort, transport and credentials are executor facts, never semantic Play fields. The original OpenCode/OpenRouter Scout Runner remains intact.

**WHY:** Plays belong to Sideline. A future selector may choose an eligible Player without rewriting the route, while each provider adapter keeps its strongest truthful authority and invocation semantics. This is a bounded interchangeability seam, not an automatic router, scorecard, rotation policy or claim that all Players are interchangeable.

### Scout Player Verification V0.2 (one-action readiness truth)

**WAS:** Player readiness required manual provider checks, manual Scout runs, hand-authored Play IDs, and human interpretation of raw telemetry. Capability discovery could be mistaken for a completed reception.

**IS:** `npm run scout:verify -- --player antigravity` creates a fresh provider-neutral verification Play, resolves the existing AntiGravity adapter, runs one useful read-only reception against a real Game, evaluates the common report contract plus lifecycle and real-file evidence, and persists both immutable game film and a reusable latest-verification pointer. Its only human states are READY, NEEDS ATTENTION, and UNKNOWN.

**WHY:** availability and capability should be machine-proven from a real reception once and reused, not repeatedly reconstructed by the human. A future Provider Connection Doctor / Recruit Player flow may consume the same truth, but automatic routing, freshness policy, rotation, scoring, quota scheduling, and databases remain unimplemented.

## WHY

The most expensive defects in this system are not wrong logic; they are correct logic running somewhere other than where it was believed to be running. Three copies of this extension exist on one machine, only one of which is built, and the default port sits inside the OS ephemeral range. Diagnostics exist to make that class of defect visible in a single line.
