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

## WAS

- [WHY: Stage 1.15 / 1.16] Sideline Coach first treated a Player's VS Code terminal as both its presentation surface and its control transport. Stage 1.15 proved the public terminal API cannot guarantee one atomic multiline Play and one separate submit, because extensions cannot select bracketed paste. Stage 1.16 found the same failure one layer lower: on Windows, ConPTY does not forward bracketed-paste mode to the host terminal, and the Codex TUI groups pasted keystrokes by timing, treating an Enter inside a burst as a newline. Keystroke or paste injection into a provider TUI is therefore not a control contract, even when Coach owns the PTY. Timing delays were rejected as proof.

- [WHY: Stage 1.17] Legacy terminal transport was the only runtime dispatch path. It remains available and explicitly uncertified while the controlled path earns field proof; no Player is silently redirected between them.

- [WHY: Stage 1.19] The controlled Player's Sideline-to-provider-thread binding existed only in activation memory. Reload destroyed that association even though provider conversation history survived.

- [WHY: Stage 1.7] Stage 1.4 assumed a terminal could carry its own identity in `TerminalOptions.env`. VS Code discards `creationOptions.env` on persistent-terminal reconnect and can revive tabs by name after a full restart with fresh shells. Terminal-carried markers therefore cannot survive reload, and names cannot safely stand in for provenance. Minimal proof-only persistence was earned by that observed failure.

- [WHY: Stage 1] Runtime truth previously existed only as transient state and human memory. Establishing which copy of the extension was built, which was launched, whether activation occurred, and whether the port was available required manual archaeology across multiple directories, the OS TCP table, and VS Code's logs, repeated once per investigation.

- [WHY: Stage 1.19 / Stage 1.8 / Stage 1.21] Controlled reload persistence (Stage 1.19) and legacy re-adoption safety (Stage 1.8) were verified by unit and contract automation but lacked authoritative human field proof. Human field testing in Stage 1.21 established both as FIELD-PROVEN.

- [WHY: Stage 1 / Stage 2 Boundary] The Stage 1 roadmap item historically termed "multi-agent Play loop / touchdown" was ambiguously positioned between multi-instance and multi-provider execution. Stage 1 closed on field-proven multi-instance controlled execution; certified multi-provider orchestration belongs strictly to Stage 2.

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

- [WHY: Stage 2 / Routing-1] **Routing Modes: AUTO and MANUAL.** AUTO is the default intended end-user experience: Coach stages Player, Model, and Effort/reasoning level from available context (current Play, previous report, task type, human policy/priorities, active Players, live provider capabilities, capacity/cost signals). Human inspects the decision without forced configuration. Principle: *AUTO hides configuration, not intelligence.* Coach explicitly communicates what it staged (e.g. `Codex 2 · GPT-5.6 Sol · High`). MANUAL enforces a strict dependency chain: Player → available models → valid effort levels (not three independent stale dropdowns). Invalid routing combinations are impossible to select rather than rejected after SEND.

- [WHY: Stage 2 / Routing-2] **Live Capability Discovery.** Model choices and effort options derive dynamically from the selected Player's actual capabilities via provider adapters translating live discovery into a common Sideline capability shape. Coach avoids permanently hardcoded model catalogs that drift from live provider truth.

- [WHY: Stage 2 / UI-1] **Persistent Bottom Scoreboard / Toolbar.** A compact, glanceable persistent awareness surface displays canonical Game, Current Play, Player, Model, Effort, and Execution Status (and eventually capacity, connection, and Stadium info). Principle: *Dispatcher = decision surface. Bottom bar = awareness surface.* Both render the same canonical runtime truth without independent state owners. Reinforced by Q2.1 human field use: transient button lifecycle is valuable, but a persistent scoreboard is needed so the human can look away, return later, and immediately understand what just happened.

- [WHY: Stage 2 / UI-2] **Duplicate Controlled Presentation Label Cleanup.** Controlled presentation displayed duplicate suffix wording (e.g. `CODEX 2 · CONTROLLED · CONTROLLED`). Minor Stage 2 UI cleanup. *(FIELD-PROVEN in Q2.1).*

- [WHY: Stage 2 / Orchestration-1] **Certified Multi-Provider Orchestration.** Expand the certified Player Control Contract beyond Codex to Claude, AntiGravity (AGY), and ACP adapters. The human-facing invariant remains: *Everything goes through Coach.*

## WHY

The most expensive defects in this system are not wrong logic; they are correct logic running somewhere other than where it was believed to be running. Three copies of this extension exist on one machine, only one of which is built, and the default port sits inside the OS ephemeral range. Diagnostics exist to make that class of defect visible in a single line.
