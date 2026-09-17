REPORT TYPE: SCOUT REPORT
SCOUT: Claude Code / Sonnet 5 / Medium
RECONNAISSANCE DEPTH: Deep

# Executive terrain map

Sideline currently runs **three structurally different control transports**, and the evidence does not support one universal "Pause" verb across them:

1. **Codex** — one long-lived `codex app-server` process per instance, spoken to over JSON-RPC on stdio (`src/player-control/codex-app-server.ts`). A "turn" is a request/response exchange (`turn/start`) inside that persistent process. **There is no `interrupt()` implemented for Codex** — the `PlayerControl.interrupt?()` contract member is simply absent from `CodexAppServerControl`.
2. **Claude / AntiGravity (Controlled)** — one **new child process per Play**, spoken to over stdin/stdout stream-JSON (`src/player-control/structured-print.ts`). `interrupt()` exists and is implemented as **hard process-tree termination** (`taskkill /T /F` on Windows, `SIGTERM` elsewhere) — there is no softer "finish this step, then stop" signal in the provider CLI contract Coach has certified.
3. **Terminal (raw shell) and Adopted/External processes** — VS Code `Terminal` objects (`src/player-roster.ts`), owned by the OS shell, not by Coach's control protocol at all. Coach can `sendText()` into them and, when VS Code Shell Integration is present, observe a single command's start/end/exit-code — but it never reads command output text, and it has no kill/pause verb over the underlying process other than closing the terminal itself.

None of the three exposes a true OS-level suspend (`SIGSTOP`/`SIGCONT` or Windows `SuspendThread`) anywhere in the codebase. "Pause" as the human might imagine it (freeze the AI mid-thought, thaw it later, exact same state) **does not exist today for any provider.**

# Why "Pause" is ambiguous

The word "Pause" could mean any of nine different things, all with different truth values in this codebase today:

| # | Concept | Exists today? | Where |
|---|---|---|---|
| 1 | OS/process suspension (freeze, no CPU, resumable in place) | **No** — never implemented | n/a |
| 2 | Sending an interrupt (kill the current turn's process/request) | **Yes**, Claude/AntiGravity only | `StructuredPrintControl.interrupt()` |
| 3 | Asking the AI interactively to stop at a safe boundary | **No** — no such message is ever sent to a provider | n/a |
| 4 | Asking the AI to write a checkpoint/report | **Partially** — Coach can `deliver()` any text Play, including "write a checkpoint report," to any Controlled provider, but there is no dedicated verb, timeout, or acknowledgement protocol for it | `PlayerControl.deliver()` |
| 5 | Preserving terminal/session transcript | **Partial, in-memory only, capped** — `eventHistory` (50 events) replayed to new listeners; not persisted to disk | `StructuredPrintControl.eventHistory` / `CodexAppServerControl.eventHistory` |
| 6 | Preserving provider conversation/session identity | **Yes, for Controlled Claude/AntiGravity/Codex** — `sessionRef`/`threadId` persisted via VS Code `workspaceState` | `ControlledBindingRecord`, `WorkspaceStateBindingStore` |
| 7 | Terminating a process | **Yes**, all transports, via `close()` / terminal close | see per-provider sections |
| 8 | Restarting/reconnecting | **Yes**, for Controlled providers (`restore()`), not modeled for Terminal | `PlayerControlFactory.restore()` |
| 9 | Resuming the SAME session vs. starting a new one | **Yes, distinguished explicitly** — `historyExpected` + provider session-check (`checkSession`) decide "present" / "missing" / "unknown" | `structured-print.ts`, `bindings.ts` |

# Current process/session topology

**Player TYPE vs Player INSTANCE vs Ownership** are three separately-tracked axes (`src/player-adapters.ts`, `src/player-instances.ts`):

- `PlayerId`: `'claude' | 'codex' | 'antigravity' | 'terminal'` — catalog identity only.
- `PlayerOwnership`: `'coach-managed' | 'adopted' | 'external'` — governs what Coach is allowed to destroy. FACT (`player-adapters.ts:14-18`): "Coach must never infer this from a terminal's name."
- `PlayerInstanceRecord` (`player-instances.ts`): `instanceId`, `seat`, `ownership`, `onField` (bench vs. active — a distinct concept from "paused"; benching never touches the underlying process).

Two disjoint identity systems coexist for "is this still the same process/session":

- **Terminal-shell provenance** (legacy/adopted/raw Terminal): `PlayerProvenance { instanceId, playerType, seat, shellPid, shellStartedAt }`. `decidePendingMatch()` (`player-instances.ts:52`) proves identity by exact PID **and** exact process start-time match — a reused PID with a different start time is correctly treated as `'dead'`, never silently adopted.
- **Controlled-provider session identity**: `ControlledBindingRecord { instanceId, adapter, sessionRef, historyExpected, pendingPlay, gameId }`, persisted through VS Code `workspaceState` (`workspace-state-binding-store.ts`), independent of any OS PID. This is what survives a VS Code window reload even though the underlying child process for that Play is already dead by the time a Play finishes (Claude/AntiGravity spawn one process per Play, not a standing process).

# Claude findings

- **Transport**: one child process **per Play**, spawned fresh via `claude -p --input-format stream-json --output-format stream-json --verbose ...` (`structured-print.ts:125`). No standing Claude process exists between Plays.
- **Session identity**: `--session-id <uuid>` on the first Play (Coach mints the UUID before anything runs, since Claude only persists a session to disk after its first Play), then `--resume <uuid>` on every subsequent Play in the same instance.
- **Hard pause possible?** No true pause. **Interrupt possible**: `interrupt()` kills the active child's process tree (`taskkill /PID <pid> /T /F` on Windows; `child.kill('SIGTERM')` elsewhere). This is a hard kill of the OS process, not a cooperative stop signal understood by the Claude CLI itself.
- **Safe?** Evidence-qualified, not guaranteed: on interrupt Coach emits `{ kind: 'turn', state: 'interrupted', summary: 'Interrupted — it may have made partial changes' }` (`structured-print.ts:503`). The code's own comment on the `interrupt` contract member says it plainly: "A stopped Play may have made partial changes." There is no transactional guarantee, no pre-interrupt "are you between tool calls" check.
- **Checkpoint request possible?** Yes as an ordinary Play — Coach can `deliver("write a checkpoint report")` like any other Play, since Claude honors normal prompts. Nothing distinguishes a checkpoint ask from a regular task at the protocol layer.
- **Session preservation possible?** Yes — `sessionRef` is a Claude-CLI-native session id, restorable via `--resume`, and Coach's `checkSession()` calls `claude ... --resume <ref>` with empty stdin to cheaply prove the session still exists before spending a real Play on it (`structured-print.ts:154-163`).
- **Resume same session possible?** Yes, and explicitly distinguished from "start fresh": `checkSession` returns `'present' | 'missing' | 'unknown'`; `'missing'` with `historyExpected=true` (a Play had already run) is a hard stop — `restore()` returns `needs-decision`, Coach will **not** silently start a new session under the same instance identity once real history existed (`structured-print.ts:604`).
- **Reliable?** The whole control contract is verified against the installed CLI's own `--help` text before any session opens (`verifyContract()`, `structured-print.ts:631`) — an update that silently drops a required flag fails closed as `needs-verification`, never silently degrades authority. This is a strong reliability property, but it is about **authority correctness**, not about interrupt safety.
- **Unknown**: whether a Claude Play, once interrupted mid-tool-call, leaves the local `--resume`-able session in a state Claude itself considers "clean" for the next Play. Not tested/asserted anywhere in this codebase.

# Codex findings

- **Transport**: one **long-lived** `codex app-server` process per instance (`codex-app-server.ts`), speaking a small JSON-RPC dialect over stdio (`REQUEST_ALLOWLIST`: `initialize`, `thread/start`, `turn/start`, `account/read`, `thread/read`, `thread/resume`, `thread/turns/list`, `model/list`). A `thread` persists across many `turn/start` calls in the same process.
- **Hard pause possible?** No. **CONTRADICTION worth flagging**: the `PlayerControl` contract advertises an optional `interrupt?()` member specifically for "stop the running Play where the provider mechanism truly supports it" — but `CodexAppServerControl` does not implement it at all. Grep for `interrupt(` in `codex-app-server.ts` returns nothing. **Today, for Codex, there is no way to stop a running turn short of killing the whole app-server process with `close()`.**
- **Safe?** `close()` calls `closeOwnedProcess()` → `taskkill /T /F` / `SIGTERM` on the entire app-server, which necessarily also destroys the RPC channel used for every other turn on that thread, not just the running one.
- **Checkpoint request possible?** Same as Claude — an ordinary `turn/start` with checkpoint-asking text; no dedicated verb.
- **Session preservation possible?** Yes — `thread.id` is Codex's own persisted identity, restorable via `thread/resume`.
- **Resume same session possible?** Yes, with an extra wrinkle: Codex's own error surface includes `"active writer"` (`codex-app-server.ts:429`) — Codex itself refuses a second process from attaching to a thread that another process still holds open. Coach surfaces this as `needs-decision: 'Previous Codex process is still running for this conversation.'` This is a **provider-native single-writer lock**, unlike Claude (which allows separate `--resume` invocations freely, being one-process-per-Play by construction) or AntiGravity (see below).
- **Reliable?** `restoreSlots`/`maxConcurrentRestores = 3` in `PlayerControlHost` throttles how many Controlled restores run at once (`host.ts:21,27`) — a fleet-level safety property, unrelated to pause.
- **ARCHITECT DECISION REQUIRED**: if a future "Pause" button is ever offered for Codex, it can only mean "kill the app-server process." Product copy must never imply anything softer for Codex specifically, since no cooperative interrupt exists in the certified contract (`CERTIFIED_VERSION = '0.154.0'`).

# AntiGravity findings

- **Transport**: like Claude, one child process **per Play**, via `agy --input-format stream-json --output-format stream-json --conversation <id> ...` (`structured-print.ts:219`). AntiGravity's own `--print-timeout` defaults to 5 minutes and is explicitly overridden to `24h` by Coach (`structured-print.ts:228`) — Coach, not the provider, owns Play-duration liveness.
- **CONTRADICTION/gotcha already documented in-code**: AntiGravity 1.2.2 silently starts a **new** conversation (with only a stderr warning) if `--conversation <id>` is unrecognized. Coach defends against this by waiting for the provider's own `init` frame to echo back the conversation id **before** writing the prompt to stdin (`promptAfterInit: true`) — if the echoed id doesn't match, Coach kills the child and marks the session `'lost'` rather than silently running the Play in the wrong conversation (`structured-print.ts:454-461`).
- **Hard pause possible?** No. **Interrupt possible?** Yes, same shared `interrupt()` implementation as Claude (`StructuredPrintControl` is shared runtime code — the dialect object is the only thing that differs between Claude and AntiGravity). Same hard-kill semantics, same "may have partial changes" caveat.
- **Session preservation / resume**: same shared `checkSession` pattern as Claude, but AntiGravity's own semantics differ — `checkSession` re-opens with `--conversation <ref>` and compares the echoed conversation id; a mismatch yields `{ kind: 'missing', replacementRef }`, i.e., AntiGravity can hand Coach a *different* conversation id it decided to use instead, which Coach then treats as "missing, and only reusable if no history was expected yet."
- **Model/effort per-Play switching without touching human config** is proven for both Claude and AntiGravity via **filesystem hash comparison before/after** (`provider-control.ts:56-61`, dated evidence in-code): `~/.claude/settings.json` and `~/.gemini/antigravity-cli/settings.json` are SHA-256-identical before and after a session-scoped model switch. This is unrelated to pause but is the closest existing precedent in this codebase for "prove a provider behavior with hash evidence before trusting it" — the same evidentiary bar a future pause/checkpoint claim should be held to.
- **UNKNOWN** (per task instructions, not probed live): AntiGravity is currently capacity-blocked in real human use; no live quota-consuming probe of interrupt/checkpoint behavior on a *running* AntiGravity Play was attempted, consistent with the scout's constraints.

# Terminal findings

Terminal (`src/terminal-player.ts`, `src/player-roster.ts`) is architecturally the **odd one out**: it is not a reasoning Player, has no provider protocol, and Coach's relationship to it is "own or observe a VS Code `Terminal` object," not "own a session."

- **Coach-managed Terminal** (`addTerminalPlayer`, `player-roster.ts:479`): `vscode.window.createTerminal(...)`, tagged with `ID_MARKER`/`SEAT_MARKER` env vars so Coach can re-identify it later. `sendText()` puts text into the shell; for a single-line command **with VS Code Shell Integration available**, Coach uses `shell.executeCommand()` and tracks the resulting `TerminalShellExecution` in `runningCommands`, resolving with an exit code via `onDidEndTerminalShellExecution` (`player-roster.ts:210-211, 548-552`). For multi-line text or when Shell Integration is absent, Coach just calls `sendText()` and the outcome is explicitly `Unknown` — **FACT, from the code's own comment**: "No completion evidence available: send exactly, claim nothing about the outcome."
- **Terminal output capture — FACT**: Coach **never reads `execution.read()`** (the VS Code API that would stream a running command's actual output text). Only the **exit code** is captured (`describeTerminalExit()`, `terminal-player.ts:58`). This means: **raw terminal output text is never copied into Coach's memory, ledger, or reports for Terminal Players** — a real (if presumably intentional) security boundary, not an oversight, given the module's own docstring: "Terminal is on the Team, but it is not a reasoning Player... what the human approves is what the shell receives, byte for byte."
- **Adopted / External processes** (`adoptTerminal`, `adoptExternalPlayer`, `player-roster.ts:593,784`): Coach matches a human-named terminal to a shell PID and proves identity via exact PID + exact process-start-timestamp match (`decidePendingMatch`), never by terminal title. Ownership becomes `'coach-managed'`, `'adopted'`, or stays `'external'` — this governs **whether Coach is even allowed to attempt to kill/close it** (`PlayerOwnership` doc comment, `player-adapters.ts:14-18`). External processes are explicitly outside Coach's destroy authority.
- **Hard pause / interrupt possible?** No verb exists at all for a Terminal Player beyond closing the whole VS Code terminal (`onDidCloseTerminal`/`retireTerminal`, which is a **removal**, not a pause, and is driven by the human closing it, `TerminalExitReason.User` check at `player-roster.ts:915`).
- **Checkpoint request possible?** Not applicable — Terminal has no reasoning layer to ask.
- **Session preservation / resume**: Not modeled as "resume the same session" — a closed Terminal is gone; only re-adoption of a still-alive shell PID is supported, which is closer to concept #9's "starting a new one" than concept #6.

# Safe checkpoint/report seams

- The only existing seam for "ask the AI to write something before stopping" is the **generic `deliver(play, clientRef, options)`** call on `PlayerControl`, identical in shape to any other Play. There is no dedicated `checkpoint()` verb, no reserved prompt template, and no protocol-level acknowledgement distinct from a normal turn `result`.
- The **existing Report machinery** (`/api/reports`, `report.snapshot`/`report.changed` RPC methods, `daemon.ts:705-707,1162`) is a filesystem-report-discovery feature (Coach watches a Game's report files and lists them), **not** a mechanism Coach uses to *request* a report from a Player. It is a plausible target to reuse (a checkpoint Play could simply be "write your report to the Game's reports folder"), but this is an ARCHITECT DECISION, not an existing seam.
- **INFERENCE**: A future "Checkpoint" button is most naturally: deliver a reserved Play text ("please write a checkpoint report and stop") to a Controlled provider, and treat the resulting `result`/`turn completed` event as the checkpoint signal — no new provider-level plumbing required, only new UI/verb naming and probably a timeout+fallback-to-interrupt policy on top of the existing `deliver`/`interrupt` primitives.

# Session preservation seams

- **What's persisted, where, surviving what:**
  - `ControlledBindingRecord` (session/thread/conversation ref + `historyExpected` + `pendingPlay`) → VS Code `workspaceState`, via `WorkspaceStateBindingStore`. Survives **VS Code window reload / Stadium restart**. Does **not** survive "uninstall/reset extension state" or a different machine.
  - `eventHistory` (last 50 `ControlEvent`s per instance) → **in-memory only**, inside the `StructuredPrintControl`/`CodexAppServerControl` object. Lost on Stadium restart; a fresh restore starts a Player with an empty history even though the provider's own conversation history is intact.
  - Work Ledger (`control-plane/work-ledger.ts`) → persists Play/turn *metadata* to disk on every mutation (`recordReports`, and other record* calls), inside the daemon process. This is a truth ledger, not a transcript store — no evidence it stores raw provider stdout text.
  - Control Plane daemon itself → auto-shuts down after 30 minutes idle with zero connected Stadiums (`daemon.ts:143`), and is otherwise supersede-and-replace managed via the election-lock protocol in `launcher.ts`. The daemon holds routing/queue state, not provider session identity — that identity lives in the **Stadium's** `workspaceState`, a different process/lifetime entirely.
- **CONTRADICTION worth flagging for product copy**: "Session preserved" as a Dad Mode phrase would be true for Controlled Claude/AntiGravity/Codex (provider-native session id survives) but **false in spirit** for the moment-to-moment transcript the human was watching (capped at 50 events, in memory, gone on Stadium restart) — a resumed Player has its *provider conversation* back but not necessarily its *on-screen scrollback*.

# Resume semantics

Distinguishing "resume the same session" from "start a new one from a checkpoint" is **already a first-class, explicit decision** in this codebase, not something to invent:

- `planControlledRestores()` (`bindings.ts:48`) sorts every stored binding into `restore | needs-verification | needs-decision`, with **duplicate instance ids** and **duplicate provider sessions across two Coach records** both hard-quarantined as `needs-decision` before any provider call is made.
- Each `PrintDialect.checkSession()` cheaply (no real inference call) proves `present | missing | unknown` before a real Play is risked, and the `historyExpected` boolean is the load-bearing flag deciding whether "missing" is recoverable (silently open fresh, since nothing of value existed yet) or fatal to that instance identity (`needs-decision`, human must choose — Coach never silently reincarnates an instance under a new session once real history existed).
- Codex adds a provider-native wrinkle: `thread/resume` can fail with "active writer," which is not a "missing" state at all — it's "present, but currently held by another process," a fourth outcome bucket the shared `SessionCheck` type does not fully model for Claude/AntiGravity's dialects (they have no such concept since they're one-process-per-Play).

# Security/privacy risks

- **FACT, verified in code**: Terminal Player output text (stdout/stderr of arbitrary shell commands) is **never captured** by Coach — only exit codes. This is the single most important existing safeguard against secrets/tokens/paths leaking into Coach's memory/ledger/reports from raw shell activity, and it appears intentional (explicit module docstring in `terminal-player.ts`), not accidental.
- **By contrast**, Controlled Claude/AntiGravity/Codex **do** stream full assistant message text, tool-call summaries, and command lines into `ControlEvent`s (`{ kind: 'progress', category: 'command', summary: ... }` includes the literal command line, `structured-print.ts:198`) — these events are what a UI or a future "Write report"/"Preserve session" feature would have available to persist. **ARCHITECT DECISION REQUIRED**: if checkpoint/report text is ever auto-copied from a Controlled Player's event stream into a durable report file, it inherits whatever secrets a tool call surfaced (e.g., a `bash` command line containing a flag with an embedded token) — there is currently no redaction/scrubbing layer between provider stdout and Coach's in-memory event history.
- **UNKNOWN**: whether the Work Ledger or Reports subsystem, once report-writing seams are built out, would persist any of this event/progress text to disk long-term (as opposed to the current UI-only in-memory stream). Not enough of `work-ledger.ts`/`daemon.ts` reports-persistence path was read to confirm either way — flagged as a follow-up question, not answered here.

# WAS / IS / WILL BE

- **WAS**: Earlier control era (referenced in comments, e.g. `player-authority.ts` "Q2.10C.1 human authority amendment") had a plain `accept-edits` permission value and less proven session-scoping; Q2.10B's hash-comparison evidence work was what unlocked per-Play model/effort switching being trusted at all.
- **IS**: Three genuinely different control surfaces (Codex app-server, Claude/AntiGravity structured-print-per-Play, Terminal/adopted raw VS Code terminals) share one `PlayerControl` interface with an *optional* `interrupt?()`, which Codex simply doesn't implement. Session identity is durable (workspaceState) and carefully three-way-disambiguated (present/missing/unknown, with quarantine for duplicates); on-screen transcript is not durable (in-memory, capped).
- **WILL BE** (per this task's stated human goal, not yet built): a Dev Mode row of verbs — Checkpoint / Pause after current step / Resume / Write report / Preserve session / Stop — plus possible automation that checkpoints ahead of a capacity boundary. None of these has a dedicated protocol seam yet; all would currently have to be built out of the two existing primitives (`deliver()` for anything cooperative, `interrupt()`/`close()` for anything forcible), which are honest about being "immediate deliver" and "hard kill," nothing in between.

# FACT / INFERENCE / UNKNOWN / CONTRADICTION (consolidated)

FACT:
- `PlayerControl.interrupt?()` is optional in the contract and is genuinely unimplemented for Codex; implemented as hard process-tree kill for Claude/AntiGravity.
- No OS-level suspend/resume (SIGSTOP/SIGCONT or platform equivalent) exists anywhere in this codebase.
- Terminal Player command output text is never read by Coach; only exit codes are captured.
- Session identity (`sessionRef`/`threadId`/`conversation_id`) is durable across Stadium restarts via VS Code `workspaceState`; on-screen event history (`eventHistory`, cap 50) is not durable and is lost on Stadium restart.
- Per-Play model/effort switching without mutating the human's global provider settings is proven with before/after file-hash evidence for Claude and AntiGravity (Q2.10B), not asserted on faith.
- Duplicate/ambiguous restored session identities are hard-quarantined (`needs-decision`) rather than guessed.

INFERENCE:
- A future "Checkpoint" verb can be built entirely from the existing `deliver()` primitive plus a reserved prompt convention and a timeout/fallback policy — no new provider protocol work is strictly required to get a first version working.
- A future "Pause after current step" is not currently truthful for any provider as a *cooperative* mid-turn pause; the honest current implementation would be "wait for the turn to finish naturally, then don't send the next Play" (a queue-level pause, not a provider-level one).

UNKNOWN:
- Whether an interrupted Claude/AntiGravity/Codex session's on-disk conversation state is left in a form the provider itself considers safe to `--resume`/`thread/resume` immediately afterward — not tested in this codebase.
- Whether Work Ledger / Reports persistence would, if extended, write Controlled-Player event/progress text (including literal command lines) to durable storage — the persistence path was not fully traced.
- Live AntiGravity interrupt/checkpoint behavior under a real running Play — not probed, per this scout's explicit instruction not to consume AntiGravity quota.

CONTRADICTION:
- The `PlayerControl` contract's `interrupt?()` doc comment reads as if it's a general capability ("where the provider mechanism truly supports it") but in practice today it is binary: fully implemented (hard kill) for two of three reasoning providers, entirely absent for the third (Codex). Any Dev Mode UI that shows a uniform "Stop" affordance across all three Players would be asserting a capability Codex does not have wired up.
- "Session preserved" as a single Dad Mode phrase would be true for provider identity and false for visible transcript continuity in the same resume event — these two truths can diverge and a single sentence cannot honestly cover both.

# Architect decisions required

1. Should Codex get an `interrupt()` implementation (e.g., a Codex-native turn-cancel RPC method, if one exists in the app-server protocol) before any UI exposes a "Stop" button uniformly across Players — or should the UI explicitly show Codex's Stop as "ends the whole Codex Player" (a bigger blast radius than Claude/AntiGravity's per-Play kill)?
2. Should "Checkpoint" be a reserved, distinctly-labeled Play (with its own turnRef namespace / UI treatment), or an ordinary Play the human types themselves? This affects whether Coach can ever distinguish a checkpoint's `result` from a normal task's `result` in the Ledger/Reports.
3. Should Controlled-Player event/progress text (which can contain literal shell command lines) ever be allowed to flow automatically into a persisted report, or must a human always approve/see it first, given there is currently no redaction layer between provider stdout and Coach's stored event history?
4. Should the on-screen `eventHistory` cap (50) and its in-memory-only lifetime be upgraded to a durable, bounded transcript store as part of building "Preserve session," given today a Stadium restart silently drops visible scrollback even though the provider's own conversation is intact?
5. For Terminal Players, is "Pause" ever meant to apply at all, or should Dev Mode explicitly exclude Terminal from every verb in this row except Stop (close terminal) and Preserve session (re-adopt by PID/start-time)?

# Scout limitations

- Codex app-server's *full* RPC surface (beyond the `REQUEST_ALLOWLIST` Coach currently uses) was not independently verified against Codex's own `--help`/protocol docs — only Coach's certified allowlist was read. If Codex's app-server protocol has an uncalled cancel/interrupt method, this report would not surface it; it only reports what Coach currently uses.
- `daemon.ts` is 2,393 lines; only the report/reports-endpoint and idle-timeout regions were read directly (grep-located). Its full shutdown-request handling (`/api/control-plane/shutdown`) and Work Ledger's on-disk schema were not read end-to-end.
- No live process was started, interrupted, or restarted during this reconnaissance — every claim above is read from source code and its own in-line evidence comments (e.g., the Q2.10B hash-comparison notes), never freshly reproduced.
- AntiGravity's real-world interrupt/checkpoint behavior under load was intentionally not probed, per instructions (capacity-blocked, no quota consumption).

# Coverage

Covered directly, by reading source: `player-adapters.ts`, `player-authority.ts`, `provider-control.ts`, `player-instances.ts`, `terminal-player.ts`, `control-plane/launcher.ts`, `player-control/contract.ts`, `player-control/structured-print.ts` (Claude + AntiGravity dialects, full runtime), `player-control/codex-app-server.ts` (partial — control lifecycle, deliver, close, notification handling; not full file), `player-control/bindings.ts`, `player-control/host.ts` (partial), `player-roster.ts` (partial — terminal creation, adoption, command execution, shell-integration capture), `controlled-player-presentation.ts` (partial), `workspace-state-binding-store.ts` (existence/role only), `control-plane/daemon.ts` (partial — idle timeout, reports endpoints), `control-plane/work-ledger.ts` (partial — persistence trigger only).

Not covered: `control-plane/protocol.ts`, `control-plane/execution-projection.ts`, `control-plane/play-queue.ts`, `control-plane/route-constraints.ts`, `control-plane/router.ts`, `control-plane/stadium-registry.ts`, `control-plane/context-affinity.ts`, `control-plane/freshness.ts`, `control-plane/coach-routines.ts`, `src/server.ts`, `src/stadium-client.ts`, `src/routing-policy.ts`, `src/play-analyzer.ts`, `src/player-discovery.ts`, `src/routine-sources.ts`, `src/public/index.html` (UI-side rendering of any of this).

# Recommended next route

A follow-up Scout (or the same one, resumed) should read, in this order:
1. `control-plane/play-queue.ts` and `control-plane/execution-projection.ts` — to find where a queue-level "pause after current step" would actually slot in (this is likely the *real* home for "Pause after current step," since it's a scheduling decision, not a provider one).
2. `control-plane/daemon.ts`'s `/api/control-plane/shutdown` handler and Work Ledger's on-disk schema in full — to answer the still-open question of whether any provider transcript text is ever persisted to disk today.
3. Codex's actual app-server protocol reference (external to this repo) — to determine definitively whether a cancel/interrupt RPC method exists that Coach simply hasn't wired up yet, versus genuinely not existing in Codex's app-server at all.

DOES NOT NEED ARCHITECTURE

(Reasoning: this Scout's job was reconnaissance of what already exists and what verbs are truthful — it found a workable, well-evidenced current state and clear seams to extend, but no ambiguity that blocks forward planning without a synthesis/architecture pass first. The five ARCHITECT DECISIONS above are real, but they are UI/product/policy decisions layered on solid existing primitives, not unresolved technical unknowns that require an architecture document before anyone can proceed.)

REPORT: SCOUT-B-Pause-Checkpoint-Resume-And-Session-Preservation.md
TIMESTAMP: 2026-09-14 18:35 MDT
