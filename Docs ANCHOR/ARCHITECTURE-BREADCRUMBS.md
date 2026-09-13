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

- [WHY: Q2.9 Dadified Game & Player Lifecycle] **The human chooses intent; Coach performs mechanics.**
  1. *Game lifecycle is one state model.* `src/game-lifecycle.ts` derives `known | opening | connected | offline | conflicted | archived` from live session count, archive flag, prior-connection history, and an Opening deadline. Precedence is deliberate: **Archived** outranks everything so a finished Game never reappears, and **Conflicted** outranks **Connected** so exact routing is blocked rather than guessed. Hard invariant: **Offline ≠ Archived** — a closed window or a sleeping Codespace is Offline; only the human declaring the project finished is Archived. `Opening` expires after `OPENING_TIMEOUT_MS` (90 s) and decays to Offline, so a window that never activated can never spin forever.
  2. *Add Game is one complete action.* `POST /api/game/add` runs picker → identity → decision → open → Opening → Connected. The **Control Plane coordinates and decides**; the **Stadium executes the two environment-specific mechanics** (the native `showOpenDialog`, and opening the window). The browser only expresses intent, because it has no Stadium and cannot safely enumerate local paths. `decideAddGame()` is pure, so already-Connected (select, do not duplicate), already-Opening (do not re-open), Conflicted (report, do not choose a window) and unresolved-folder are all provable without a VS Code window.
  3. *Window opening is strategy-selected, and the product path is the plain one.* `chooseOpenStrategy(extensionMode)` returns `vscode-open-folder` for an installed extension — the human's own VS Code, profile and extensions, with VS Code focusing an already-open folder rather than duplicating it. Only `ExtensionMode.Development` uses a separate VS Code instance, because under `--extensionDevelopmentPath` the extension is not installed and a plain window would contain no Coach at all. **The Q2.8G instance-per-Game constraint is development-only and does not apply to the product.**
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

## WAS

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
- **Controlled Player cleanup and presentation invariants.** Remove disposes the exact Coach-managed VS Code terminal/process; adopted processes detach and are never killed; bench retains the session. Stable machine identity remains separate from compact friendly numbering (`Claude`, then `Claude 1 / Claude 2`). A future Play Clock and the Instance Work Ledger/report provenance feed context-aware AUTO routing.
- **Interrupt in the Dispatcher.** `PlayerControl.interrupt()` exists for print adapters (kills the process tree; turn → interrupted, may have partial changes). There is no UI or route yet.
- **Ledger persistence.** It is in memory only; a daemon restart forgets activity (entries rebuild as Unknown or Idle from snapshots). Add an optional per-Game file if history across restarts proves useful.
- **Context affinity + queue-for-owner.** Use `recentPlays` and `reports` to prefer the instance that owns the context, queue for a busy owner, and assess collisions. The Ledger already answers "what is Claude 1 doing / what did Claude 2 just finish / who wrote this report".
- **Explicit report provenance.** Timing attribution is honest but limited. A provenance header written by the Player itself (Game, clientRef, instance, model, effort) would make attribution exact.
- **AntiGravity empty conversations.** Opening a Player, or checking a missing conversation, creates an empty AntiGravity conversation. Consider cleanup or lazy creation.
- **Friendly contiguous numbering.** Stable seat ids stay canonical; a presentation-only renumbering (Codex 1/2 after removing a middle copy) is still open.
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

## WHY

The most expensive defects in this system are not wrong logic; they are correct logic running somewhere other than where it was believed to be running. Three copies of this extension exist on one machine, only one of which is built, and the default port sits inside the OS ephemeral range. Diagnostics exist to make that class of defect visible in a single line.
