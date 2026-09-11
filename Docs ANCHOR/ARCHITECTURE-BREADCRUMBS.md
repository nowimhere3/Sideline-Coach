# Architecture Breadcrumbs

## IS

- [WHY: Player Discovery V1] Player identity is command-based (`claude`, `codex`, `agy`), while resolved executables, npm shims, and PowerShell wrappers are machine-local runtime evidence. Player launch uses the normal VS Code integrated terminal shell so its configured PATH, profile, aliases, wrappers, and user configuration remain authoritative. Canonical terminal names remain the existing Coach allowlist identities: `Claude`, `Codex`, and `AntiGravity`.

- [WHY: Stage 1.5 / 1.8] Player type, opaque immutable Player instance ID, terminal handle, human seat, and derived field label are distinct. `PlayerRoster` is the sole activation-lifetime owner of live Player-instance and terminal-handle correlation. Coach-created instances, and restored instances proven to be the same shell process (PID plus OS start time) as a Coach-written provenance record in the Game's `workspaceState`, are dispatch-authorized. Terminal names, labels, and env markers never authorize; generic terminals are never Players merely because of a name. The proof-only provenance holds only instance ID, type, seat, shell PID, and shell start time; it is machine-local, per-Game, never synced, and never committed. All terminal evaluation flows through one idempotent `PlayerRoster` funnel fed by the activation snapshot and terminal-open events. Unreconcilable terminals fail safe and are not dispatchable. Seats do not reuse an ordinal while same-type live or pending siblings remain. The existing allowlist and unique-name rules remain only for the separately retained legacy terminal-name dispatch path. Instance identity contains no Game, Stadium, machine, or executable-path identity, preserving those separate concerns for future multi-Game work.

- [WHY: Stage 1.17 / 1.18 / 1.19] A VS Code-free Player Control Host and contract implementation exists for controlled Codex Players alongside the retained, uncertified legacy path. Each controlled instance owns one private `codex app-server` stdio child and one provider thread binding; SEND is one semantic `turn/start`, and a read-only transient Pseudoterminal is presentation only. The C1–C15 route is FIELD-PROVEN. Stage 1.19 now persists the minimal per-Game `sidelineCoach.playerSessions.v1` binding separately from legacy provenance, reconstructs exact Sideline identity and seat synchronously as Resuming, then independently re-proves provider version, ChatGPT auth, Game cwd, authority, and exact thread through a fresh channel before dispatch becomes Ready. A host-minted `clientRef` is durably written before `turn/start`; provider history alone reconciles uncertain pre-reload work, and restore sends zero Plays. P1–P28 automated proof passes. Reload/context continuity remains awaiting the human field test.

- [WHY: Stage 1] Sideline Coach records runtime truth under RUNTIME MEMORY (RM-1) as a Tier 2 on-demand snapshot only; Journal, Incidents, and Last-Known-Good are not implemented. Two collectors feed one renderer: a zero-dependency preflight tool that observes build, launch, port, and copy identity from outside the extension host, and an in-extension command that observes activation-time truth from inside by reusing `CoachServer.buildStatus()`. The preflight collector exists because Sideline Coach's characteristic failure is a launch or activation failure, which an in-process diagnostic structurally cannot observe. Activation truth is read from VS Code's own `exthost.log` and `tasks.log` rather than produced by new instrumentation. The repository commits only `Diagnostics/README.md`, `CONTRACT.md`, and `.gitignore`; runtime evidence lives in gitignored `Diagnostics/local/` and is never committed. Diagnostics observe and never act, are redacted by allowlist, and never write into the host workspace — that workspace belongs to another project.

## WAS

- [WHY: Stage 1.15 / 1.16] Sideline Coach first treated a Player's VS Code terminal as both its presentation surface and its control transport. Stage 1.15 proved the public terminal API cannot guarantee one atomic multiline Play and one separate submit, because extensions cannot select bracketed paste. Stage 1.16 found the same failure one layer lower: on Windows, ConPTY does not forward bracketed-paste mode to the host terminal, and the Codex TUI groups pasted keystrokes by timing, treating an Enter inside a burst as a newline. Keystroke or paste injection into a provider TUI is therefore not a control contract, even when Coach owns the PTY. Timing delays were rejected as proof.

- [WHY: Stage 1.17] Legacy terminal transport was the only runtime dispatch path. It remains available and explicitly uncertified while the controlled path earns field proof; no Player is silently redirected between them.

- [WHY: Stage 1.19] The controlled Player's Sideline-to-provider-thread binding existed only in activation memory. Reload destroyed that association even though provider conversation history survived.

- [WHY: Stage 1.7] Stage 1.4 assumed a terminal could carry its own identity in `TerminalOptions.env`. VS Code discards `creationOptions.env` on persistent-terminal reconnect and can revive tabs by name after a full restart with fresh shells. Terminal-carried markers therefore cannot survive reload, and names cannot safely stand in for provenance. Minimal proof-only persistence was earned by that observed failure.

- [WHY: Stage 1] Runtime truth previously existed only as transient state and human memory. Establishing which copy of the extension was built, which was launched, whether activation occurred, and whether the port was available required manual archaeology across multiple directories, the OS TCP table, and VS Code's logs, repeated once per investigation.

## WILL BE

- Player activity and intervention policy will be live instance and Play state, never provenance. Future autonomy choices and scoped nudges must remain separate from the proof that a terminal is the same Player.

- Sideline Coach will support many Games. Player runtime truth is already per-Game through `workspaceState`; Player IDs deliberately carry no Game, Stadium, or machine identity.

- [WHY: Stage 1.16 / 1.17] **Player Control Contract.** Every certified Sideline Coach Player will implement the Player Control Contract through a Tier S, H, or T adapter. The mechanism underneath may be provider-specific or Stadium-specific, but the human-facing Coach contract is invariant.

- [WHY: Stage 1.19] **Controlled reload field proof.** The implemented persistence/resume path must earn human proof with two controlled instances, same-seat and exact-selection restoration, same-thread context recall, and explicit User-close persistence semantics before it is called FIELD-PROVEN.

- [WHY: Stage 1.16] **Coach-built transport.** If an upstream provider does not expose a sufficient control mechanism, Sideline Coach may provide its own Stadium-side transport infrastructure rather than weakening the product contract.

- [WHY: Stage 1.16] **Control is not presentation.** A visible terminal is a presentation surface. It is authoritative for Player input only when Coach owns the process or PTY behind it, never merely because it is visible.

- [WHY: Stage 1.16] **Coach owns the experience.** Every human control action goes through Coach. Helpers, bridges, PTYs, and provider protocols that Coach installs, owns, versions, and hides are part of Sideline Coach. Provider remote-control relays are never a dependency. Localhost is a proving environment, not the product boundary.

- [WHY: Stage 1.16] **Distributed execution.** Players run on the user's own Stadium under the user's own provider credentials and billing. Any future central Sideline service is limited to identity, device routing and relay, notifications, and update coordination; it never executes Players, never holds provider credentials, and is never the throughput path for Player work. Separately billed API usage is never a silent default.

## WHY

The most expensive defects in this system are not wrong logic; they are correct logic running somewhere other than where it was believed to be running. Three copies of this extension exist on one machine, only one of which is built, and the default port sits inside the OS ephemeral range. Diagnostics exist to make that class of defect visible in a single line.
