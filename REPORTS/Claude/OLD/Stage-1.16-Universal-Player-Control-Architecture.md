REPORT FILE:
Stage-1.16-Universal-Player-Control-Architecture.md

REPORT TIMESTAMP:
2026-09-11 01:28 MDT

---

# SIDELINE COACH — STAGE 1.16 UNIVERSAL PLAYER CONTROL ARCHITECTURE

**Type:** Architecture, forensics, research, and decision. No runtime source modified. No commit, no push.
**Role:** Senior Systems / Integration Architect (Claude Opus 5)
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`
**Stadium:** Sideline Coach Dev Stadium (Windows 11 26200, VS Code 1.136, Node 24.12.0)

**Scope note:** the human corrected this stage's scope mid-play. The target moved from "a Codex transport" to **universal Player control**. Codex remains the first proof case. All Codex research is kept below and now serves the universal design.

**Working tree:** preserved. This stage changed:
* **New:** this report.
* **Edited:** `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`. It gains new WAS, IS, and WILL BE entries, including the two product invariants the human asked to add (§42).
* No other repository file changed. The one disposable experiment ran only in the session scratchpad and was deleted afterwards (§5.3).

**Baseline (run during this play):** `npm run check` PASS. `npm test` PASS, 25 of 25. `git status` unchanged apart from the two files above.

**Evidence labels used throughout:**

| Label | Meaning |
|---|---|
| **[OFFICIAL]** | Current provider documentation, or the protocol schema the provider's own binary generates |
| **[LOCAL]** | Observed on this machine during this stage (CLI help, processes, probe results) |
| **[SOURCE]** | Read from provider source code or shipped bundles. An implementation detail, not a contract |
| **[COMMUNITY]** | Third-party issue, blog, or forum report |
| **[INFERENCE]** | Architectural reasoning from the evidence above |

---

## 1. VERDICT

# GO WITH CONSTRAINTS.

**Sideline Coach can own a reliable Player control channel.**

The seam is not the terminal. It is a **Sideline-owned Player Control Contract**. Each Player type gets an adapter that implements the contract through the best channel that Player offers:

* a **provider-native structured channel** where one exists;
* a **Sideline-owned terminal stack** where none does.

**For Codex, that channel exists today:** `codex app-server` over a private stdio pipe. It is the channel OpenAI's own VS Code extension uses on this machine. A zero-cost probe during this stage showed that a Coach-spawned app-server:

* runs on the human's **existing ChatGPT Plus login**, with no API key;
* creates addressable threads;
* reports 5-hour and weekly usage;
* echoes the working directory, model, effort, sandbox, and approval policy;
* **refuses** a turn aimed at an unknown thread;
* exits cleanly when its input closes, leaving nothing on disk.

**Beyond Codex:**
* Claude Code and AntiGravity (AGY) both expose long-lived structured stdio modes.
* Gemini CLI and more than thirty other agents speak the Agent Client Protocol (ACP).
* For a TUI-only Player, Coach can own the PTY, run a headless terminal emulator, and verify each state transition itself.

### Constraints

| # | Constraint |
|---|---|
| **K1** | The **Player Control Contract** (§14.1) is the product boundary. A Player combination (type, provider version range, Stadium family) is **certified** only after its adapter passes the contract conformance suite (§40). SEND carries the contract's promise only for certified Players. |
| **K2** | The Codex proof uses the app-server **stdio** transport and the **stable API surface only**: no `experimentalApi` opt-in, no WebSocket listener, no daemon, no `remote-control`. |
| **K3** | Adapters use the human's **existing provider login**. They never supply API keys and never request tokens. **Separately billed API usage is never a silent default for any Player.** |
| **K4** | Adapter and control-host code is **VS Code-free** (plain Node), so it can later move out of the extension host into a Stadium Bridge without changing the contract. |
| **K5** | **Exactly once, or Unknown.** Coach never resends a Play automatically unless the provider has *proved* the Play did not run. Codex's `-32001` ingress rejection is the one known case. |
| **K6** | Adapters send only an **allowlisted** set of provider methods. Coach clients (browser, phone) never reach a provider protocol. This matters because app-server also exposes `fs/*` and `command/exec`. |
| **K7** | The Codex proof keeps the authority today's Codex Player already has: `codex --yolo`, which is approval policy `never` plus sandbox `danger-full-access`. The human may choose a narrower sandbox for the proof. Coach has no permission UX yet, so any approval request would otherwise stall the Player. |
| **K8** | A **Claude adapter** that runs on a claude.ai subscription is gated by a human/legal decision on Anthropic's published authentication terms (§8B). |
| **K9** | The legacy `Terminal.sendText` dispatch path stays untouched in Stage 1.17. It is labelled **uncertified** and is not removed. |

### Why STOP does not apply

The corrected stop bar says: STOP only if Coach cannot build a reliable seam *even by owning the process, PTY, helper, or Bridge layer*. The evidence is the opposite:

* **Codex:** a documented, first-party semantic protocol exists (§6).
* **Claude Code and AGY:** structured stdio modes exist (§9A).
* **Future agents:** ACP gives many of them a common structured protocol (§9A).
* **TUI-only agents:** Coach can build a verified terminal stack (§11), with honest limits.

Provider differences are real. None of them is a blocker.

---

## 2. EXACT STAGE 1.15 BOUNDARY

**Accepted, and confirmed against current code:**
* `CoachServer.dispatch()` resolves the exact Player instance through `PlayerRoster`.
* It then calls `terminal.sendText(modelSwitch, true)` (`src/server.ts:303`) and `terminal.sendText(prompt, true)` (`src/server.ts:305`).
* The extension API offers only text plus a `shouldExecute` flag. An extension cannot select bracketed paste.

**What Stage 1.16 adds: the failure is deeper than VS Code.** On Windows, two further layers turn a paste into timing-dependent keystrokes:

1. **ConPTY.** ConPTY does not forward a program's bracketed-paste enable sequence (`ESC[?2004h`) to the host terminal. So an xterm.js host, such as VS Code's terminal or Orca's, never wraps pastes. **[COMMUNITY]** stablyai/orca #5274.
2. **The Codex TUI.** Codex's own source says: *"On some platforms (notably Windows), pastes often arrive as a rapid stream of `KeyCode::Char` and `KeyCode::Enter` key events rather than as a single 'paste' event."* It compensates with burst timing: at most 8 ms between characters, at least 3 characters, a 60 ms idle flush on Windows. **Enter inside a burst becomes a newline.** **[SOURCE]** `codex-rs/tui/src/bottom_pane/paste_burst.rs`. The underlying crossterm library reports that bracketed paste is not implemented for the legacy Windows API. **[COMMUNITY]** crossterm docs and issues.

**Independent confirmation from another product:**
* Orca owns its PTY and injects Plays into Codex on Windows. It hit the Stage 1.15 failure exactly: a ~4.5 KB payload plus Enter in one PTY write "never submits". **[COMMUNITY]** orca #11343, Codex 0.146.
* Orca's fix is a 50 ms delay before a separate Enter. That is timing, not proof.
* The Codex Windows paste/newline problem recurs across releases. **[COMMUNITY]** openai/codex #13729, #2006, #10065, #20580.

**The boundary, stated precisely:**

> Keystroke or paste injection into a provider's TUI is not a control contract. Owning the PTY moves the problem inside Coach. For Codex on Windows it does not remove it.

This is consistent with Stage 1.15 and narrows what it means. **The current transport seam is insufficient.** **Coach can still control Codex** (§5).

---

## 3. HUMAN-FACING NON-NEGOTIABLE

> **Choose Game → choose Player → SEND → the Player works.**

Everything below that line is plumbing, and plumbing is hidden. The human never operates:
* a provider's remote product;
* a terminal, PTY, helper, daemon, port, or tunnel;
* a provider's command syntax.

Internal components are part of Sideline Coach when Coach installs, owns, versions, and hides them. This report's architecture puts every such component on the Coach side of that line.

---

## 4. WHY EXTERNAL REMOTE PRODUCTS ARE NOT FOUNDATIONAL

**Every current Player ships its own remote-control relay.** **[LOCAL]** CLI help on this machine:

| Player | Remote-control surface |
|---|---|
| Codex | `codex remote-control` (marked experimental) |
| Claude Code | `claude --remote-control` |
| AGY | `agy remote-control` (a background daemon) |

**Building on them would mean three control planes, three identities, and three apps. None of them would be ours.** Specifically:

* **Codex's relay** runs through OpenAI's infrastructure and the ChatGPT mobile app. Workspace admins can disable it, and Windows-to-macOS pairing is unsupported. **[COMMUNITY]** Codex remote-control article, June 2026. The daemon behind it is *"experimental and its lifecycle contract may change"*. **[OFFICIAL]** `app-server-daemon` README.
* **None of these relays knows** about Games, Plays, reports, multiple Players, or Coach policy. Their failure domain is not ours to fix. The human has already experienced reliability problems there.

**Decision.** They stay optional conveniences outside Sideline. Coach never depends on them and never enables them.

**One useful fact came from studying them.** OpenAI's remote and desktop clients drive Codex through the *same app-server* this report recommends. That is strong evidence the app-server is the seam OpenAI intends for control. **Sideline uses the seam, not the relay.**

---

## 5. LOCAL CODEX CAPABILITIES DISCOVERED

Everything in this section was observed without modifying Codex: no logout, no upgrade, no config change.

### 5.1 Installation and identity [LOCAL]

| Fact | Observed value |
|---|---|
| Version | `codex-cli 0.154.0` (latest per `~/.codex/version.json`) |
| Install | npm global `@openai/codex` 0.154.0. Its platform package `@openai/codex-win32-x64` ships the native `codex.exe`, `codex-code-mode-host.exe`, and a bundled `rg.exe` |
| Command resolution | `codex` → `%APPDATA%\npm\codex.ps1` / `codex.cmd` → `node …\bin\codex.js` → the vendor `codex.exe` |
| Other copies | The OpenAI VS Code extension (`openai.chatgpt` 26.903.x and 26.908.31457) ships its own `codex.exe` |
| Auth | `codex login status` → "Logged in using ChatGPT" |
| Config | model `gpt-5.6-terra`, effort `medium`, `[windows] sandbox = "elevated"`, project trust entries (including SidelineCoach and GS3) |
| Shared daemon | Not running. `codex app-server daemon version` could not reach `~/.codex/app-server-control/app-server-control.sock` |

### 5.2 Control-relevant surfaces in the CLI [LOCAL]

| Surface | What it does | Relevance |
|---|---|---|
| `codex` (interactive TUI) | Today's Player (`codex --yolo`). `--remote <ws:// \| wss:// \| unix://>` attaches the TUI to an app-server | Presentation attach for the hybrid (§13) |
| `codex exec [PROMPT \| -]` | Non-interactive run. With `-`, the prompt comes from stdin. `--json` streams JSONL events. Also `-C` (cwd), `-s` (sandbox), `-m` (model), `--ephemeral`, `-o` (last-message file) | Process-per-Play option (§10) |
| `codex exec resume <id> [-]` | Continues a stored session by id, prompt from stdin | Continuity for process-per-Play |
| **`codex app-server`** | JSON-RPC server, marked **[experimental]**. `--listen stdio://` (default), `unix://`, `ws://IP:PORT`, `off`. WebSocket auth options exist for non-loopback listeners | **The recommended Codex seam, over stdio** |
| `codex app-server daemon …` | start, stop, restart, bootstrap, version, enable-remote-control for a shared local daemon | Not needed (§12) |
| `codex app-server generate-ts` / `generate-json-schema` | Emit the protocol bindings for the installed version | Protocol-drift check in CI (§31) |
| `codex agents`, `codex queue --thread <id> --message <text>` | Browse sessions on the shared daemon; queue a message to an existing session | Noted; daemon-dependent and experimental |
| `codex resume <id> [--remote …]` | Resume a session in the TUI, optionally attached to a remote app-server | Hybrid presentation (§13) |
| `codex remote-control` | OpenAI relay | **Excluded** (§4) |
| `codex features list` | Shows `tui_app_server` as "removed … true" | Read together with the daemon README, which says *"the TUI starts an embedded server instead"*: **the interactive TUI is itself an app-server client** [LOCAL + OFFICIAL + INFERENCE] |

### 5.3 Codex processes running on this machine [LOCAL]

* **OpenAI's VS Code extension** spawns `codex.exe -c features.code_mode_host=true app-server --analytics-default-enabled`. The parent is the VS Code extension host (`Code.exe --type=utility --utility-sub-type=node.mojom.NodeService`), and four such app-servers are running, one per extension-host window. The extension bundle logs *"Spawning codex app-server"* at that call site [SOURCE].
* **Coach's own Codex Player:** `node …codex.js --yolo` (PID 33632) → `codex.exe --yolo` (PID 14004) → `codex-code-mode-host.exe`. **Not touched.**
* **Memory:** the extension's app-servers use 23–43 MB private each. The interactive TUIs use 113–149 MB private.

**Conclusion.** An extension host spawning a private stdio app-server is not a speculative pattern. **OpenAI ships exactly that on this machine today.**

### 5.4 The one disposable experiment: a zero-cost app-server probe [LOCAL]

**Why it was run.** The brief demands proof, not guesses, on authentication and billing. It also needed confirmation that a *Coach-spawned* app-server works on this Stadium.

**What it deliberately did not do.** It ran **no model turn** and spent none of the human's quota. The live large-Play turn is Stage 1.17's job.

**Method.** A scratchpad Node script spawned the vendor `codex.exe app-server` over stdio, with a scratch directory as its working directory. It exchanged JSON-RPC, then closed stdin. Output was redacted: no email, no token.

| Step | Result |
|---|---|
| `initialize` | OK in 325 ms. userAgent `sideline_coach_probe/0.154.0 (Windows 10.0.26200; x86_64) vscode/1.136.0`. codexHome `~/.codex`. Platform `windows` |
| `account/read` | Account type **`chatgpt`**, plan **`plus`** |
| `getAuthStatus` (includeToken false) | authMethod **`chatgpt`**. No token returned |
| `account/rateLimits/read` | ordinaryUsageAllowed `true`. Primary window 300 min, **19 % used**. Secondary window 10,080 min (weekly), **82 % used**. Both carry `resetsAt`. Limit id `codex` |
| `model/list` | 5 models (`gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`), each with supported efforts (low … ultra) and a default effort |
| `thread/start` (ephemeral) | UUIDv7 thread id issued. `ephemeral: true`, no disk path, status `idle`. **cwd echoed exactly.** Model `gpt-5.6-terra`, effort `medium`, approval `on-request`, sandbox `readOnly` |
| `thread/loaded/list` | Returned that thread id |
| `turn/start` on an unknown thread id | **Refused:** `-32600 thread not found`. The payload contained a newline; nothing started |
| Close stdin | Process exited with code 0 inside the 10 s window. No leftover process |

**Side effects checked before and after:**
* `~/.codex/sessions` held 27 files before and after.
* `session_index.jsonl` held 38 lines before and after.
* `auth.json` was not rewritten.
* The only notifications were `thread/started`, `mcpServer/startupStatus/updated`, and `remoteControl/status/changed` (status only). There were no server-initiated requests and stderr was empty. The whole run took 1.16 s.

**Cleanup.** The probe script, scratch directory, result file, and generated protocol bindings were deleted after this report was written. None was ever inside the repository.

**Honest note.** The probe's `msAfterStdinClose` field recorded an absolute timestamp rather than a delta (a script bug). The clean exit is still proven, because the exit event fired before the 10-second fallback timer.

**Architectural notes from the probe:**
* The thread's `source` came back as `vscode` only because the probe ran from a VS Code-hosted shell. Codex infers it from the environment, so it **must never be used as identity** [INFERENCE].
* The refusal on an unknown thread is the provider-level equivalent of Coach's "that Player has left the field": **no silent fallback turn**.

---

## 6. SUPPORTED CODEX SEMANTIC INTERFACES

### 6.1 The app-server protocol, stable surface of 0.154.0

Sources: the schema generated locally by the installed binary [OFFICIAL], plus the current app-server documentation [OFFICIAL].

**Transport and handshake:**
* Newline-delimited JSON over stdio is the default.
* Handshake: `initialize {clientInfo, capabilities}`, then an `initialized` notification.
* The docs: *"Omit `capabilities` (or set `experimentalApi` to `false`) to stay on the stable API surface, and the server rejects experimental methods/fields."*
* The stable surface generates 711 type files. Opting into experimental adds 136 more (847 in total).

**Methods Coach needs:**
* Threads: `thread/start`, `thread/resume`, `thread/read`, `thread/turns/list`, `thread/loaded/list`, `thread/unsubscribe`.
* Turns: `turn/start`, `turn/interrupt`, and later `turn/steer`.
* Discovery and account: `model/list`, `account/read`, `account/rateLimits/read`.

**Methods on the same stable surface that Coach must never expose** (K6): `fs/readFile`, `fs/writeFile`, `fs/remove`, `command/exec`, `thread/shellCommand`, `config/value/write`, `plugin/install`, and others.

**`turn/start`:**
* Params: `threadId` and `input: UserInput[]`. A text item is `{type: "text", text, text_elements}`; image, audio, skill, and mention items also exist.
* Optional overrides: `clientUserMessageId`, `cwd`, `approvalPolicy`, `sandboxPolicy`, `model`, `effort`, `summary`, `personality`, `outputSchema`.
* Overrides apply *"for this turn and subsequent turns."*
* The response is `{turn}`, with a UUIDv7 turn id.

**Other turn and thread semantics:**
* **`turn/steer`** requires `expectedTurnId`. *"The request fails when it does not match the currently active turn."* That is a built-in precondition against steering the wrong turn.
* **`turn/interrupt`** takes `{threadId, turnId}`.
* **`thread/resume`** says: *"load the thread from disk by thread_id and resume it … If thread_id identifies a running thread, app-server rejoins that thread."*
* **Loaded threads:** *"the server keeps the thread loaded until it has no subscribers and no thread activity for 30 minutes."*

**Lifecycle notifications:**
* `thread/status/changed` with statuses `notLoaded`, `idle`, `systemError`, or `active`. An active thread carries `activeFlags`: `waitingOnApproval`, `waitingOnUserInput`.
* `turn/started` and `turn/completed`. Completion status is `completed`, `interrupted`, or `failed`, with `error` set when failed.
* Item events: `item/started`, `item/completed`, `item/agentMessage/delta`.
* Also: `thread/tokenUsage/updated`, `account/rateLimits/updated`, `model/rerouted`, `thread/settings/updated`, `serverRequest/resolved`, `thread/closed`, `error`.

**Server-initiated requests (approvals):**
* Kinds: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request`.
* Decisions include `accept`, `acceptForSession`, `decline`, and `cancel`.

**Backpressure:** *"When request ingress is full, the server rejects new requests with JSON-RPC error code `-32001` … Clients should retry with an exponentially increasing delay and jitter."* A rejection at ingress proves the request did not run. That makes it the one safe automatic retry (K5).

**Instability marker:** `Thread.path` is marked **[UNSTABLE]** in the schema. Coach must not depend on it.

### 6.2 Answers to the Option A questions (Codex app-server)

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | One complete multiline Play as one semantic input? | **Yes.** One `turn/start` carries one text item. Newlines are JSON string content | [OFFICIAL] schema |
| 2 | Bypasses terminal key and paste semantics entirely? | **Yes.** There is no TTY; it is JSONL on a private pipe | [OFFICIAL] + [LOCAL] probe |
| 3 | Same Player keeps context across Plays? | **Yes, by contract:** turns accumulate on one `threadId`. Live proof comes in Stage 1.17 | [OFFICIAL] |
| 4 | Persistent provider thread identity? | **Yes.** `thread.id` is a UUIDv7 | [OFFICIAL] + [LOCAL] |
| 5 | Can Coach create and resume it? | **Yes:** `thread/start`, and `thread/resume` by `threadId` | [OFFICIAL] |
| 6 | Can Coach hold that id as Player runtime state? | **Yes.** It is an opaque string, mapped from `instanceId` | [INFERENCE] |
| 7 | Survives a Coach restart? | **History yes** (a non-ephemeral thread is stored on disk and resumable by id). **An in-flight turn is interrupted.** Proof in Stage 1.18 | [OFFICIAL] |
| 8 | Survives a Stadium restart? | **History yes**, from the same on-disk store. An in-flight turn is lost | [OFFICIAL] + [INFERENCE] |
| 9 | Resumes after disconnect? | **Yes.** It rejoins a still-running thread, or reloads from disk. Over stdio, a disconnect means process exit, so resume is from disk | [OFFICIAL] |
| 10 | Several Codex Players at once? | **Yes:** one app-server per Player, or several threads per server | [OFFICIAL] + [LOCAL] (four app-servers and two TUIs coexisting) |
| 11 | Coach observes the turn lifecycle? | **Yes:** `turn/started`, `item/*`, `turn/completed` with a status | [OFFICIAL] |
| 12 | Coach can cancel a turn? | **Yes:** `turn/interrupt` | [OFFICIAL] |
| 13 | Coach detects failures? | **Yes:** a failed turn carries `TurnError`; there is also the `error` notification, the `systemError` thread status, and process exit | [OFFICIAL] |
| 14 | Coach detects permission requests? | **Yes:** server requests plus the `waitingOnApproval` flag | [OFFICIAL] |
| 15 | Model control? | **Yes**, per thread and per turn. `model/list` enumerates the models | [OFFICIAL] + [LOCAL] |
| 16 | Reasoning-effort control? | **Yes**, per turn. Each model lists its supported efforts | [OFFICIAL] + [LOCAL] |
| 17 | Sandbox and approval-policy control? | **Yes**, per thread and per turn | [OFFICIAL] + [LOCAL] echo |
| 18 | Working-directory control? | **Yes**, per thread and per turn | [OFFICIAL] + [LOCAL] exact echo |
| 19 | Report writing stays normal? | **Yes.** The Player runs in the Game directory under the chosen sandbox and writes files as it does today. Proof in Stage 1.17 | [INFERENCE] |
| 20 | Reuses the human's existing auth? | **Yes, proven:** a Coach-spawned app-server reports `chatgpt` / `plus`, and no key was supplied | **[LOCAL]** |

### 6.3 Other Codex candidates

* **`codex exec` plus `exec resume`** (process per Play). Covered in §10.
* **`@openai/codex-sdk` 0.154.0 (TypeScript).**
  * The docs say it *"spawns the CLI and exchanges JSONL events over stdin/stdout"* [OFFICIAL].
  * The source shows it runs `exec --experimental-json` (plus `resume <id>`), writes the prompt to stdin, then closes stdin [SOURCE].
  * It sets `CODEX_API_KEY` *only when an apiKey is provided*, and forwards an `AbortSignal` to the spawn [SOURCE].
  * Limits: one process per turn, no approval callbacks, and it depends on a hidden experimental flag.
* **`openai-codex` (Python).** The docs say it *"controls the local Codex app-server over JSON-RPC"*, that *"Existing Codex authentication is reused automatically"*, and that it is *"available as a stable release"* [OFFICIAL]. Coach will not use Python, but this is **OpenAI endorsing app-server with existing auth as a programmatic pattern.**
* **`codex queue`, the daemon, and `--remote`.** Experimental; covered in §12–13.

---

## 7. SUPPORT / STABILITY CLASSIFICATION

| Candidate | Classification | Basis |
|---|---|---|
| **app-server, stdio, stable surface** | **EXPERIMENTAL BUT INTENTIONAL** | CLI help says "[experimental]". The docs say *"The app-server command and WebSocket transport are experimental and aren't supported for production workloads."* The same docs call it *"the interface Codex uses to power rich clients"*, intended for *"deep integration inside your own product"*. It keeps an explicit stable/experimental API split. OpenAI's own IDE extension runs it on this machine [LOCAL], and OpenAI's stable Python SDK wraps it |
| app-server methods behind `experimentalApi` | EXPERIMENTAL | Opt-in only; Coach does not opt in |
| app-server WebSocket listener | INTERNAL / UNSUITABLE | *"experimental and unsupported"*, and it opens a network surface |
| Unix-socket listener, daemon, `--remote`, `agents`, `queue` | EXPERIMENTAL BUT INTENTIONAL | Windows daemon support merged 2026-09-03 (openai/codex PR #42405). The daemon's *"lifecycle contract may change"* |
| `remote-control` | UNSUITABLE | A provider relay product (§4) |
| `codex exec`, `exec resume`, `--json` | SUPPORTED PUBLIC | Documented non-interactive mode, with no experimental label |
| `@openai/codex-sdk` (TypeScript) | SUPPORTED PUBLIC package | Internally relies on the hidden `exec --experimental-json` flag [SOURCE] |
| `openai-codex` (Python) | SUPPORTED PUBLIC | *"available as a stable release"* |
| TUI keystroke or paste input | INTERNAL / UNSUITABLE as control | No contract, and paste regressions recur (§2) |
| `generate-ts`, `generate-json-schema` | EXPERIMENTAL tooling | Still useful for drift checks |
| `Thread.path` | INTERNAL | Marked `[UNSTABLE]` in the schema |

**The single most important caveat** is that app-server is labelled experimental and not supported for production workloads. For Sideline that means four things:

1. **Treat the Codex protocol as a versioned dependency.** The Codex adapter declares the Codex version range it was certified against. Coach reads the running version at `initialize`. An untested version shows the Player as **Needs verification** rather than dispatching silently. This is Unknown stated honestly.
2. **Stay on the stable surface.** No experimental opt-in, no WebSocket listener, no daemon.
3. **Detect drift in CI.** Regenerate the schema for each new Codex release and diff only the methods and fields the adapter uses.
4. **Keep a supported fallback.** If app-server ever changes incompatibly, Codex still has a fully supported degraded route: process-per-Play through `codex exec resume` (§10). Codex is therefore never left without a certified path.

[INFERENCE] OpenAI's own IDE client, desktop and remote clients, and stable Python SDK all depend on app-server. Abrupt removal is therefore unlikely, though not impossible, and the fallback covers it.

---

## 8. AUTHENTICATION IMPLICATIONS

### 8A. Codex

**How the login is shared.**
* Every Codex route reads the same `CODEX_HOME` credential store (`auth.json`, or the OS keyring via `cli_auth_credentials_store`).
* *"The CLI and extension share the same cached login details."* [OFFICIAL]
* Proven for a Coach-spawned app-server [LOCAL §5.4].
* `exec` uses the same binary and store [INFERENCE]. Its `--ignore-user-config` help text says *"auth still uses `CODEX_HOME`"* [LOCAL].

**What Coach must never do:** read `auth.json`, request tokens (`includeToken` is always `false`), or pass an API key.

**Signing in when needed.** Always through the provider's native flow: `codex login` in a browser, or `codex login --device-auth` on a headless Stadium [OFFICIAL]. The app-server also offers `account/login/start`. A later stage could use it to *start* OpenAI's own flow from a Coach button without touching any credential.

**Expiry.** Detectable through the `account/updated` and `modelProvider/authRecoveryStarted` / `Completed` notifications, and through failed-turn errors. Coach shows **Needs sign-in**. It never guesses.

### 8B. Claude Code: technical reuse is proven, product terms need a decision

**Local state [LOCAL].** `claude auth status` reports `loggedIn: true`, `authMethod: "claude.ai"`, `subscriptionType: "pro"`.

**Technical behaviour [OFFICIAL].**
* Headless and stream-json runs use that same login.
* The exception is `--bare`, which *"never reads OAuth credentials or the system keychain"* and requires `ANTHROPIC_API_KEY`.
* `--bare` therefore means **separate API billing**.

**Anthropic's published terms, quoted verbatim [OFFICIAL]:**
* Agent SDK overview: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."*
* Legal and compliance: *"Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens."*
* The same page, on the other side: *"Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code."* For products that run Claude Code, it also requires that *"The Claude Code binary must not be modified"* and that *"Each end user must authenticate with their own … Claude subscription plan credentials."*
* *"Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."*

**How this reads [INFERENCE, not legal advice].**
* The closest permitted case: Coach drives the user's own unmodified `claude` binary, which the user signed into through Anthropic's own flow, on the user's own Stadium, without Coach ever touching credentials.
* The complication: Anthropic describes programmatic `claude -p` as *"the Agent SDK via the CLI"*, and restricts third-party products from offering claude.ai login or plan rate limits.
* **For a distributed Sideline product, the text does not settle where the line falls.**

**Decision (K8).**
* The human's personal dogfood on their own machine is the human's own use.
* **Before Sideline distributes a Claude adapter that runs on claude.ai subscriptions, the human must make a product/legal decision or obtain Anthropic's approval.**
* An API-key Claude mode is permitted, but it is separately billed, so it must be an explicit opt-in.

### 8C. AntiGravity (agy)

* **Login.** Google Sign-In, cached in the OS keyring, with Application Default Credentials for headless use [COMMUNITY]. No `auth status` subcommand exists [LOCAL].
* **Reuse.** The CLI's own login is reused [INFERENCE]. Print-mode specifics are UNKNOWN.
* **Billing.** Preview free limits, G1 credits, or a billing-enabled GCP project [COMMUNITY]. Classification: **unclear.**

---

## 9. SUBSCRIPTION / API BILLING IMPLICATIONS

| Candidate | Authentication | Billing |
|---|---|---|
| **Codex app-server (stdio)**, the recommended path | Existing ChatGPT/Codex login, **proven**. An API key applies only if the user logged in with one | **Existing subscription usage, proven:** Plus plan limits reported in-band |
| `codex exec` / `exec resume` | Either (same store) | Subscription by default. API only if the user's Codex login is an API key |
| `@openai/codex-sdk` | Either. It injects `CODEX_API_KEY` only when `apiKey` is passed | Subscription unless `apiKey` is passed. **Coach never passes one by default** |
| Codex TUI (today's Player) | Existing login | Subscription |
| Claude `-p` / stream-json | Either. claude.ai unless `--bare` | Subscription by default, but **constrained by Anthropic's terms (§8B)**. `--bare` means **separate API billing** |
| Claude Agent SDK library | Either | Anthropic directs third-party products to API keys unless approved: **separate API billing** |
| Claude TUI in a Coach-owned PTY | Existing login | Subscription. Unmodified binary, the user's own sign-in; terms reading as in §8B |
| AGY print / stream-json | Google login or Application Default Credentials | Unclear |
| ACP agents | Per agent | Per agent |

> **Nothing in the recommended Stage 1.17 path uses API billing.** Every route that would (Claude `--bare`, an SDK `apiKey`) is labelled here and requires the human's explicit opt-in. It can never become a silent default.

---

## 9A. BEYOND CODEX: OTHER PLAYERS' CONTROL SEAMS

### 9A.1 Claude Code 2.1.268 [LOCAL help + OFFICIAL docs]

**Structured mode:** `claude -p --input-format stream-json --output-format stream-json --verbose`.
* Anthropic calls streaming input *"the **preferred** way"*.
* *"It allows the agent to operate as a long lived process that takes in user input, handles interruptions, surfaces permission requests, and handles session management."*
* Each Play is one JSON line: `{"type":"user","message":{"role":"user","content":…}}`. The whole Play is one JSON string, so it is **atomic by construction**.

**Turn signals:**
* **Payload accepted:** `--replay-user-messages` *"Re-emit[s] user messages from stdin back on stdout for acknowledgment."*
* **Turn ended:** a `result` message carrying the session id, usage, and a success or error subtype.

**Session identity:**
* `--session-id <uuid>` lets Coach **choose** the provider session id up front.
* `--resume <id>` works from any directory (v2.1.223 and later).
* Sessions live under `~/.claude/projects/<encoded-cwd>/*.jsonl`. Related flags: `--fork-session`, `--no-session-persistence`.

**Permissions:**
* `--permission-prompts host` (the default) routes prompts to *"the SDK host or --permission-prompt-tool"*. `none` denies them.
* `--permission-mode` offers manual, acceptEdits, auto, dontAsk, plan, and bypassPermissions. `--allowedTools` narrows further.

**Stopping a turn:**
* The SDK's `interrupt()`, or SIGINT, ends the turn.
* After SIGTERM, *"Claude Code continues the turn that SIGTERM left unfinished"* on resume.
* The raw-CLI wire format for interrupt control messages is documented only through the SDK: **UNKNOWN** for a hand-written adapter.

**Other capabilities:**
* **Feature detection:** `system/init` carries a `capabilities` array: *"Check it to feature-detect instead of comparing version strings."*
* **Model and effort:** `--model` and `--effort` at spawn. `/model` and `/effort` accept arguments in `-p` mode (v2.1.205 and later).
* **Presentation attach [LOCAL]:** `claude --bg`, `claude attach <id>`, `claude agents`, `claude logs`. This is Anthropic's analogue of Codex `--remote`.

**Caveat.** `-p` skips the workspace trust dialog. It runs project hooks and MCP servers *"even in a folder you've never trusted"*. Coach must therefore start Claude Players only in Games the human has set up. `--bare` avoids this but forces API-key auth.

**Verdict:** a Tier S seam. Technically strong; commercially gated by K8.

### 9A.2 AntiGravity CLI (agy) 1.2.0 [LOCAL help]

**Structured mode:**
* `--input-format stream-json` *"reads one NDJSON message per line from stdin and runs a turn for each; it requires --output-format stream-json"*.
* That makes it long-lived, with one line per Play: **atomic by construction.**

**Flags:**
* Continuity: `--conversation <id>` resume, `--continue`.
* Model and effort: `--model`, `--effort low|medium|high`.
* Authority: `--mode accept-edits|plan`, `--sandbox`, `--dangerously-skip-permissions`.
* **`--print-timeout` defaults to 5 minutes.** A long Play would be cut off unless the adapter raises it.

**Unknowns.** The stream-json message schema, whether a conversation id is emitted, whether permission requests reach a host, and how to cancel a turn. The official docs pages checked are silent on all four.

**Community signal.** google-antigravity/antigravity-cli issue #31 (open, May 2026, filed against v1.0.0) requests ACP. It says the existing modes cannot give an external orchestrator *"mid-turn approval pauses, session cancellation"*. Version 1.2.0 has since added stream-json input [LOCAL], so the issue is partly stale. Approval surfacing remains UNKNOWN.

**Verdict:** a Tier S *candidate*, pending a small schema spike. Tier H (one `agy -p --conversation <id>` per Play) is likely viable. Tier T is the fallback.

### 9A.3 The Agent Client Protocol, for future Players [OFFICIAL agentclientprotocol.com]

**What it is.** JSON-RPC over stdio between a client and a coding agent. The site compares it to how *"the Language Server Protocol (LSP) standardized language server integration."*

**A prompt turn:**
* `session/prompt {sessionId, prompt: ContentBlock[]}` starts it.
* Progress arrives as `session/update`: plan, agent_message_chunk, tool_call, tool_call_update, usage_update.
* It ends with a stop reason: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, or `cancelled`.
* Also defined: `session/cancel` and `session/request_permission`.

**Adoption:**
* The ACP agent list names more than 35 agents, including Cursor, GitHub Copilot, Goose, OpenCode, Cline, Junie, Kiro, Qwen Code, and OpenHands.
* Claude and Codex are listed via adapters.
* Gemini CLI supports it natively with `--acp` [OFFICIAL Gemini CLI docs].
* `@agentclientprotocol/sdk` 1.4.0 is published on npm [LOCAL].

**Why it matters here.** ACP maps almost one-to-one onto the Player Control Contract (§14.1). **One generic ACP adapter could admit many future Players at once.** ACP is third-party and still evolving, so it is one adapter family, never the contract itself.

### 9A.4 Seam summary

| Player | Best seam today | Tier (§14.2) | Continuity handle | Permissions reach Coach? | Gate or key unknown |
|---|---|---|---|---|---|
| **Codex** | `codex app-server` over stdio | S | `threadId` | Yes | Experimental label (§7) |
| **Claude Code** | long-lived `claude -p` stream-json | S | Session id, which Coach can choose | Yes (host) | Anthropic terms (K8); raw interrupt format |
| **AGY** | long-lived `agy -p` stream-json | S candidate, or H | Conversation id | UNKNOWN | Schema; the 5-minute print timeout |
| **Gemini CLI and other ACP agents** | ACP | S | `sessionId` | Yes | Per-agent maturity |
| **Any TUI-only agent** | Coach-owned PTY with verification | T | The live process, plus the provider's resume flag | Via screen reading | Per-provider certification |

---

## 10. DIRECT PROCESS-CONTROL FINDINGS (Tier H: process per Play)

### A pipe is not a terminal

When Coach spawns a CLI with plain pipes, there is **no TTY**:
* no line discipline;
* no keystroke interpretation;
* no paste detection.

Bytes are simply data. Whether the CLI treats stdin as *one prompt* is a property of its non-interactive contract:

| CLI | Non-interactive stdin contract |
|---|---|
| `codex exec -` | Reads the prompt from stdin to end-of-file [LOCAL help] |
| `claude -p` | Reads piped stdin [OFFICIAL] |
| `agy -p` | Text-mode stdin behaviour UNKNOWN; its stream-json mode is line-framed [LOCAL] |

### What process-per-Play gives

| Property | Result |
|---|---|
| Exact instance | **Strong.** Coach spawns the process for exactly one instance, bound to that instance's session id |
| Semantic input | **Strong.** The whole Play goes to stdin, followed by end-of-file |
| Output | **Good.** JSONL events (`codex exec --json`, `claude --output-format stream-json`) |
| Lifecycle | **Good.** A live process means working; the exit code gives the outcome |
| Cancellation | **Mixed.** It means killing the process. Windows has no SIGINT for non-console children, so it is a tree kill. Claude distinguishes SIGINT (ends the turn) from SIGTERM (turn left unfinished) |
| Working directory | **Strong.** Spawn `cwd`, or `-C` |
| Session continuation | **Good.** `codex exec resume <id> -`, `claude -p --resume <id>`, `agy -p --conversation <id>`. Context reloads from disk for every Play |
| Multiple instances | **Strong** |
| Permissions | **Weak to mixed.** `codex exec` has no interactive approval channel, so it runs under a preset policy. Claude stream-json can use a permission host |
| Liveness between Plays | **None.** No process exists between Plays; "On Field" means "session bound" |

**Cost.** A cold start for every Play. The Codex app-server `initialize` alone measured 325 ms [LOCAL]. That is acceptable for Plays that run for minutes.

**Exactly-once.** One spawn means one run. If Coach dies mid-run, the child may keep running or die; either way the outcome is **Unknown**, to be reconciled from the provider's session history. It is never re-sent automatically.

**Role:** the **universal degraded-but-safe route** for any CLI that has a non-interactive prompt mode and resume by id. It is also Codex's supported fallback if the app-server changes (§7).

---

## 11. PTY / ConPTY FINDINGS (Tier T: Coach-owned terminal)

### What owning the PTY does and does not give

**It gives Coach:**
* the exact bytes and the exact write boundaries;
* pacing;
* all output;
* process lifecycle and resizing;
* the power to wrap every paste in bracketed-paste markers, *whether or not* ConPTY forwarded mode 2004. This was Orca's fix for Claude on Windows [COMMUNITY #5274].

**It does not give Coach:** control over **how the TUI interprets those bytes.**

### What each platform does

* **Codex on Windows.** The TUI receives individual key events and groups them by timing: an 8 ms gap, 3 characters, a 60 ms idle flush on Windows. An Enter inside a burst is a newline [SOURCE]. Even a Coach-owned ConPTY can only deliver a paste to Codex by timing: burst, wait, then Enter. Orca's shipped fix is a 50 ms delay [COMMUNITY #11343]. **Not certifiable to this brief's standard, and unnecessary, because Codex has Tier S.**
* **Claude Code on Windows.** It works in Windows Terminal, which handles bracketed paste end to end. Orca's fix forces bracketed paste on Windows [COMMUNITY #5274]. So Claude's TUI appears to parse bracketed paste through ConPTY. **Tier T is plausible for Claude, but unproven.**
* **Linux and macOS.** Real PTYs pass `ESC[200~ … ESC[201~` through to the child unchanged, so a TUI that enabled mode 2004 receives a single paste event [INFERENCE from PTY semantics]. **Tier T is considerably stronger there.**

> **Answer to the brief's PTY warning.** Owning the PTY does not by itself make delivery atomic; §2's evidence proves that. Only **verification against the TUI's observed state** turns PTY writes into something the contract can accept. For Codex on Windows, even that stays timing-based, because of the TUI's own design.

### What Sideline would build: the Terminal Player Bridge

This is the answer for TUI-only Players.

1. **PTY ownership.**
   * Use node-pty: ConPTY on Windows, forkpty on Unix. `node-pty` 1.1.0 needs a native build; prebuilt forks exist, such as `@lydell/node-pty` 1.2.0-beta.15 [LOCAL npm].
   * **The agent binary is spawned directly in the PTY, with no shell.** When the agent exits, the PTY closes, so no keystroke can ever reach a shell. That removes Stage 1.7's "revived plain shell" hazard by construction.
2. **A headless terminal emulator.** `@xterm/headless` 6.0.0 [LOCAL npm], fed by the PTY. Coach holds the exact screen state and can mirror it into a VS Code tab (§13).
3. **A screen grammar per provider, in its adapter.** Recognisers for:
   * ready for input;
   * the composer holding the whole paste (Codex, for example, shows `[Pasted Content N chars]` [COMMUNITY]);
   * working;
   * waiting for approval;
   * idle.
4. **A verified input state machine:**
   ```text
   screen shows READY?                                          else → Refused (busy / unknown)
   write payload (bracketed if certified for this provider; else burst-aware)
   screen shows the whole payload in the composer?             else → Unknown
   write exactly ONE submit
   screen shows the working indicator within T?                else → Unknown
   → Accepted
   ```
   Coach never retries blindly. It never sends a second submit on its own; a second submit is only ever a human's explicit choice.
5. **Optional "Pointer Play."**
   * Coach writes the Play to a file it owns, then sends a single line: *"Execute the Play in `<path>`."* That removes multiline paste entirely.
   * The single line still needs a verified submit.
   * Trade-offs: the content now enters the context through a file-read tool; the Player needs read permission; and a file artifact is left behind.
   * **Use only when a TUI's paste path cannot be verified.**
6. **Certification per (provider, version range, Stadium family).** A TUI update can break the grammar, so this needs a version gate plus the conformance suite (§40).

**Verdict.** Tier T is buildable, and it is how Sideline supports Players that have no structured seam. It is the most expensive tier and the least robust. **It is not the Codex path.**

---

## 12. STADIUM BRIDGE FINDINGS

**Definition.** A Sideline-owned process, one per Stadium, that hosts the Player Control Host (adapters, child processes, PTYs) outside the VS Code extension host.

### What it would buy

* **Players and in-flight turns survive a VS Code reload or close.** Today, extension-host death closes the stdio pipe, and a closed pipe makes the app-server exit [LOCAL §5.4].
* **One owner per Stadium** across several VS Code windows and Games.
* **A remote-access anchor.** The Bridge dials *out* to a future Sideline relay, so the phone can reach Players with no editor open.
* **Headless Stadiums:** a Codespace or cloud VM with no editor window.

### What it costs

* A second process lifecycle: start, health, upgrades, version skew.
* A local IPC surface that must be secured.
* Crash recovery.

### IPC options

| Mechanism | Verdict |
|---|---|
| stdio (the extension spawns the Bridge) | Simplest and private, with no ports. **But the Bridge dies with its parent**, so the survival benefit is lost. Fine for a first extraction |
| **Named pipe (Windows) / Unix domain socket (Linux, macOS)**, with an OS-user ACL plus a per-install secret | **Recommended for a surviving Bridge.** No TCP port, no port collisions (the path is per user), not reachable from the network, and the OS enforces user isolation. Codex's own daemon already uses AF_UNIX on Windows [OFFICIAL PR #42405] |
| localhost HTTP / WebSocket | Workable but weaker. Ports collide (Coach's own default port, 49152, already sits in the Windows ephemeral range; diagnostic A6). Any local process can connect, so it needs token auth. Browser DNS-rebinding-class risks. **Avoid for the Bridge** |

### Remaining concerns

| Concern | Handling |
|---|---|
| Version mismatch | A handshake carrying the contract version. The extension refuses or upgrades an incompatible Bridge |
| Multiple windows | One Bridge per OS user per Stadium; windows are clients |
| Multiple Games | Every Player binding carries its Game; the Bridge enforces each Game's working directory |
| Crash | The Bridge restarts. Tier S Players resume from their provider stores. In-flight Plays become **Unknown** |

**Comparison with Codex's daemon.** Codex's own shared daemon is a provider-specific Bridge: AF_UNIX discovery and `codex agents`. It is experimental and Codex-only. Sideline's Bridge is provider-neutral, and could host Codex's app-server as one child among many.

**Verdict.** This is the right long-term portability seam and the future home of the Player Control Host. It is **not needed to prove the contract.** It must be *earned* by one of three triggers:
* turns must survive a VS Code reload;
* the phone must control Players with no editor window open;
* one owner must span several windows or Games.

Stage 1.17 builds none of it. K4 (VS Code-free adapter code) keeps the later move cheap.

### Is a separate "Stadium Adapter" layer warranted?

**Not now.** Stadium differences are real but small, and they are orthogonal to provider differences: OS, PTY backend, process-tree kill, command resolution, and credential-store locations. They belong in a thin **Stadium platform layer** inside the Player Control Host (spawn, resolve, kill, PTY factory), not in a second adapter hierarchy.

One existing Stadium assumption must be generalised later: `PlayerRoster`'s availability and process-identity probes treat every non-Windows Stadium as not available or unknown (`src/player-roster.ts:172` and `:195`).

---

## 13. HYBRID FINDINGS (control is not presentation)

Once control is structured, presentation becomes a free choice. There are three options.

**H1 — A Sideline transcript mirror in a VS Code tab. Recommended first.**
* The public API `window.createTerminal({ name, pty: Pseudoterminal, isTransient: true })` lets Coach own the stream while VS Code only renders it. `ExtensionTerminalOptions`, `Pseudoterminal`, and `isTransient` are all present in the installed `@types/vscode` [LOCAL].
* Coach writes: the Play received, agent messages, tool and command summaries, and turn outcomes.
* The tab has **no shell** (`processId` is undefined). `PlayerRoster`'s provenance funnel therefore never adopts it (it returns on a missing PID, `src/player-roster.ts:98`), and the tab can never become a keystroke-injection target.
* `isTransient` stops VS Code reviving a dead tab after reload.

**H2 — The provider's own TUI attached to Coach's channel. A later stage.**
* Codex: `codex resume <threadId> --remote unix://…`, against a Coach-owned app-server listening on a Unix socket.
* Claude: `claude attach <id>` for background sessions.
* This gives the human the familiar UI on the *same* thread. But:
  * it needs the app-server on a socket rather than stdio, which is the experimental transport;
  * it creates two writers on one thread. That needs an explicit rule: Coach refuses a Play while a turn is active, and turns the human types appear as ordinary thread events.

**H3 — A Coach UI transcript** in the browser and phone. The same event stream, rendered by Coach itself. Needed for the phone regardless.

### What becomes of today's `codex --yolo` terminal (the brief's options A–E)

**Answer: D for control, C for presentation first and B later, and E across providers.**

* **D.** For Codex, the structured app-server thread **becomes the actual Player.**
* **C.** The interactive TUI becomes **presentation only**, first as the H1 mirror.
* **B, later.** The real Codex TUI can be attached to that same thread through `--remote`. One provider conversation is then driven programmatically *and* watchable interactively.
* **A is rejected** (keeping the standalone TUI as the Player and adding a side channel). The only side channels into a running standalone TUI are keystrokes, or `codex queue` through the experimental shared daemon. The daemon route would make Codex's daemon, not Coach, the owner of the Player.
* **E: yes, modes differ by provider.**
  * Codex: structured.
  * Claude: structured (stream-json), or Tier T, depending on K8.
  * AGY: stream-json, or Tier H or T.
  * TUI-only agents: Tier T, where the Coach-owned PTY is both control and presentation. It is authoritative precisely because Coach owns it.

Today's TUI Codex Players keep working, labelled uncertified, until the human retires them.

---

# LEVEL 1 — UNIVERSAL PLAYER CONTROL

## 14. RECOMMENDED ARCHITECTURE

```text
Human — phone / browser / VS Code
   │   Game → Player → Play → SEND
   ▼
Coach Server         canonical runtime truth · validation · Play outcome · policy
   │                 PlayerRoster: Sideline identity + authorization (unchanged owner)
   ▼
PLAYER CONTROL CONTRACT   (Sideline-owned interface · VS Code-free)
   ▼
Player Control Host   Stage 1.17: inside the extension host
   │                  Later, when earned: a Sideline Stadium Bridge process (§12)
   ├─ CodexAdapter     Tier S   codex app-server over stdio JSON-RPC
   ├─ ClaudeAdapter    Tier S   long-lived claude -p stream-json      [K8 gate]
   ├─ AgyAdapter       Tier S/H long-lived agy -p stream-json          [schema spike]
   ├─ AcpAdapter       Tier S   any ACP agent (Gemini CLI, …)
   ├─ Exec adapters    Tier H   one process per Play + resume by id    [fallback]
   └─ TerminalAdapter  Tier T   Coach PTY + headless VT + verification
   ▼
Provider runtimes — the user's installed, unmodified CLIs, on the user's own credentials

Presentation (separate from control): VS Code mirror tab · provider TUI attach · Coach UI transcript
```

### 14.1 The Player Control Contract

**Addressing.**
* The contract is addressed **only** by the Sideline `instanceId`.
* Each adapter privately binds `instanceId` → control handle (process, PTY, or connection) → provider session id.
* Neither of those ever becomes Coach identity.

**Operations (Coach → adapter):**

| Operation | Purpose | Results |
|---|---|---|
| `open(instance, game, authority)` | Start or re-attach the Player's control channel in the Game directory, under an explicit authority (sandbox and approval policy) | Ready · Failed(reason) · NeedsSignIn · NeedsVerification (untested provider version) |
| `deliver(instanceId, play)` | Deliver **one complete Play**: the full multiline text, plus optional model and effort | **Accepted(turnRef) · Refused(busy / closed / unknown / invalid / capacity) · Unknown(reason)** |
| `cancel(instanceId, turnRef)` | Ask the active turn to stop | Requested · NotRunning · Unknown |
| `answer(instanceId, requestRef, decision)` | Reply to a permission or input request (future UX) | Applied · Stale · Unknown |
| `close(instanceId)` | Leave the field | Closed |

**Events (adapter → Coach).** These are observations only; policy stays in Coach (North Star §11).
* Channel: `ready`, `exited(code)`, `lost`.
* Turn: `accepted`, `started`, `progress` (message and tool summaries), `waitingForPermission(request)`, `waitingForInput(request)`, `completed`, `failed(error)`, `interrupted`, `unknown(reason)`.
* Telemetry: `settings(model, effort)`, and `usage(limits)` where the provider exposes it.

**Guarantees:**

| # | Guarantee |
|---|---|
| **G1 Target** | Only the addressed instance. Never a fallback to a sibling, a type, a name, or a "most recent" session |
| **G2 Fidelity** | The Play's text arrives unchanged, and newlines are content. Coach's existing validation still applies first: empty Plays refused, the size limit enforced, NUL characters stripped |
| **G3 Atomicity** | One Play is one provider input unit: one user message, one turn. Never split, never interleaved |
| **G4 Exactly once, or Unknown** | The provider's start primitive is invoked at most once per SEND. Once a request may have reached the provider, nothing is resent automatically. Only *proven* non-execution permits a retry |
| **G5 Continuity** | Successive Plays to one instance land in the same provider session, unless the human explicitly chooses a fresh start. A lost session is reported, never silently replaced |
| **G6 Lifecycle truth** | For every Play, Coach can say Accepted, Started, then Completed, Failed, or Interrupted — or Unknown |
| **G7 Return** | Status returns to Coach as events. Reports keep flowing through the existing file watcher |
| **G8 Busy** | A Play sent to a Player with an active turn is Refused(busy) by default. Queueing and steering are later, explicit human choices |
| **G9 Bounded authority** | The adapter applies the authority Coach chose, never widens it, and exposes no provider capability beyond Play delivery (K6) |

**Certification.**
* **Supported** means the adapter passes the conformance suite (§40) for a given (Player type, provider version range, Stadium family, tier).
* **Uncertified** Players may still be On Field, but SEND carries no promise for them. Today's `sendText` path lives here.

### 14.2 Transport tiers

| Tier | Mechanism | Where atomicity comes from | Examples |
|---|---|---|---|
| **S — Semantic** | The provider's own structured session protocol | One JSON string field in one request | Codex app-server; Claude stream-json; ACP agents; AGY stream-json (candidate) |
| **H — Headless** | One non-interactive process per Play, plus resume by id | stdin read to end-of-file | `codex exec resume`, `claude -p --resume`, `agy -p --conversation` |
| **T — Terminal** | A Coach-owned PTY, a headless emulator, and a verified state machine | Verification against the observed TUI state | TUI-only agents |
| **X — Uncertified** | Keystrokes into a terminal Coach does not own | Nothing | Today's `Terminal.sendText` |

**Preference order: S, then H, then T. Tier X is never certified.**

### 14.3 Ownership

| Component | Owns | Never owns |
|---|---|---|
| **Coach Server** | Validation, SEND handling, the Play outcome projection, policy (autonomy, busy rules), UI and SSE | Provider protocols; processes |
| **PlayerRoster** | Sideline identity, seats, labels, authorization, and the registry binding each instance to its control handle | Transport details |
| **Player Control Host** | Child processes and PTYs, the adapter registry, the Stadium platform layer, and **transport truth** | Game policy; UI |
| **Player Adapter** | Provider mapping, provider-session binding, event normalisation, the version gate, the method allowlist | Credentials; identity |
| **Provider runtime** | The agent loop, credentials, and the provider's session store | Anything Sideline owns |

---

## 15. WHY IT WINS

* **It meets the human contract for Codex today.** The channel is first-party and is the one OpenAI's own clients use. No timing, no keystrokes.
* **It frees Coach from any single provider.** Each provider gets its best seam, and providers without one get a Sideline-built tier. Behaviour is uniform at the Coach boundary while the technology below varies, exactly as the corrected scope requires.
* **Its state is honest.** Every tier reports Unknown rather than guessing.
* **Execution and credentials stay local.** That makes it scale by distribution (§32) and keeps it inside provider terms.
* **It moves cleanly.** The host can move from the extension host to a Stadium Bridge without touching the contract or the Coach UI.
* **It is cheap to start.** Stage 1.17 needs one adapter (a JSON-RPC client over one child process) and one presentation tab.

**Rejected, in one line each:**
* `sendText`: Stage 1.15.
* PTY-first for Codex: timing-based on Windows (§11).
* Codex daemon or remote-control: not ours (§4, §12).
* Central execution: provider terms and cost (§32).
* Codex TypeScript SDK as the primary seam: a process per turn, no approvals, and a hidden experimental flag (§6.3).

---

## 16. ATOMIC MULTILINE MECHANISM

**Tier S, Codex.**
* One JSON line on the app-server's stdin: `turn/start { threadId, input: [{ type: "text", text: <the entire Play>, text_elements: [] }] }`.
* JSON escapes every newline inside the string. The frame delimiter is the single newline after the object.
* **No terminal, no line discipline, and no paste detection exist anywhere on this path.**

**Tier S, other Players.**
* Claude: one NDJSON line, `{"type":"user","message":{…}}`.
* ACP: one `session/prompt` carrying one text content block.

**Tier H.** The whole Play is written to stdin, then stdin is closed.

**Tier T.** A bracketed or burst-aware write, then verification (§11).

**Validation rules carried over from today's dispatch** apply before any adapter: empty Plays refused, `coach.maxPromptChars` enforced (default 100,000), NUL characters stripped (`src/server.ts:305`).

**Model switches.**
* Today, `coach.modelSwitches` types commands such as `/model opus` into the terminal (`src/server.ts:302-304`).
* For structured Players these become typed `model` and `effort` options, never typed text.
* In Stage 1.17, a non-empty model switch sent to a controlled Player is refused with a clear message.

---

## 17. SUBMIT / TURN MECHANISM

**Tier S, Codex: the `turn/start` request *is* the submit.** There is no separate Enter to lose.

| Signal | Meaning |
|---|---|
| `turn/start` response received (turn id and status) | **Accepted** |
| `turn/started` notification, or turn status `inProgress` | **Started** |
| Pipe broke after the write but before any response | **Unknown** |

**Exactly-once in Stage 1.17:**
* One `turn/start` per SEND.
* The adapter tracks "turn active" from `turn/started` until `turn/completed`, and refuses new Plays in between (G8).
* The browser should keep SEND disabled while a dispatch is in flight.
* The adapter sets Codex's `clientUserMessageId` to a Coach-minted value for each SEND, so the Play can be recognised later in thread history. Whether Codex persists or de-duplicates by that value is **UNKNOWN**; Stage 1.17 observes it.

**Play IDs.** The roadmap says: *"Do not introduce Play IDs solely because they might someday be useful."* Stage 1.17 needs nothing beyond that per-SEND correlation value. A persisted Play ledger with idempotency keys becomes necessary at one specific moment: when SEND first travels over an unreliable network (phone or relay). That is its earning event.

**Other Players:**
* **Claude:** writing the NDJSON user message is the submit. The `--replay-user-messages` echo means Accepted, and a `result` message ends the turn.
* **AGY:** one line is one turn, per its help text.

---

## 18. PLAYER SESSION CONTINUITY MODEL

| Layer | What represents it | Where it lives | Lifetime |
|---|---|---|---|
| Sideline Player | `instanceId` | `PlayerRoster` at runtime; per-Game `workspaceState` once persisted | The Player's time on the field |
| Provider context | Codex `threadId` · Claude session id · AGY conversation id · ACP `sessionId` | The provider's own store (`~/.codex/sessions`, `~/.claude/projects`, …) | Until the user deletes or archives it |
| Control channel | Child process, PTY, or connection | Player Control Host memory | The process's lifetime |

**Rules:**
* **Same Player, same provider session**, always, unless the human chooses a fresh start.
* **Restart** (of Coach, VS Code, or the Stadium):
  * Tier S and H resume by id from the provider's store.
  * Tier T: the live process *is* the context. If it died, the adapter resumes through the provider's own resume flag where one exists; otherwise the Player reports **context lost**. Never a silent fresh start.
* **Missing provider session** (deleted, archived, or on another machine): `thread/resume` fails, and the Player asks in human words: *"Can't pick up where Codex 2 left off — start fresh?"*
* **Game working directory.** Fixed at `open`. Every resume passes the Game root as the working directory, and the adapter checks that the provider-reported directory matches. A mismatch is a contradiction, and a contradiction is a veto (North Star §8).
* **Stage 1.17 keeps the binding in memory only.** Persisting it is earned by the reload test in Stage 1.18.

---

## 19. SIDELINE INSTANCE → PROVIDER SESSION MAPPING

```text
instanceId  (Sideline · opaque · immutable)          e.g. codex-7f3a91c2
  └─ control binding  (runtime, Player Control Host)
       ├─ channel:          app-server child / PTY / connection   (never identity, never persisted as identity)
       └─ providerSession:  { provider: "codex", threadId: "01a08f35-…" }
```

**Persisted form, from Stage 1.18:**
* Per Game, in `workspaceState`: machine-local, never synced, never committed.
* Key `sidelineCoach.playerSessions.v1`, holding `[{ instanceId, playerType, providerSessionId }]`.
* **A separate key from provenance.** Stage 1.7's K2 keeps provenance proof-only.
* It never holds transcripts, prompts, models, or labels.

**Rules:**
* **Provider ids are capabilities of this machine's provider store** (North Star §13). They are never portable truth and are never sent to any central service.
* Claude lets Coach *choose* the session id (`--session-id <uuid>`). The binding is then known before the first turn, but it is still a separate value from `instanceId`.
* **One provider session binds to at most one instance.** A second binding attempt is a contradiction and is refused.

---

## 20. MULTIPLE-INSTANCE BEHAVIOUR

**Stage 1.17: one app-server child per Codex Player.**
* **Isolation:** a crash, hang, approval request, cancellation, or failure touches only that Player, and a process exit maps unambiguously to one Player.
* **Cost:** about 23–43 MB private per idle app-server [LOCAL]. Fine for ten or so Players.

**Later option:** one shared app-server per Stadium, with one thread per Player (supported via `thread/loaded/list`). Every event is scoped by `threadId`, so demultiplexing stays exact. Adopt it only if resource pressure is actually observed.

**Unchanged from Stages 1.5 and 1.8:** seats, labels, and retirement. Closing one Player never redirects its Plays (G1).

**Other Players:** one long-lived process per Claude Player and per AGY Player; one PTY per Tier T Player.

---

## 21. THE VISIBLE TERMINAL'S FUTURE ROLE

**Presentation by default:**
* H1, a mirror tab, now;
* H2, the provider's own TUI attached, later;
* H3, the Coach UI transcript, for the phone.

**Authoritative for input only where Coach owns the PTY (Tier T).**
* The human's keystrokes in that tab reach the Pseudoterminal's `handleInput`, and Coach forwards them to the PTY. The human can use it like any terminal.
* Coach's own Play delivery first checks that the screen shows READY (G8), so a Play never collides with the human's typing.

**Stage 1.17's Tier S mirror is read-only.** Typing into it shows a one-line hint: *"Send Plays through Coach."*

**Unchanged:** terminal names and labels are presentation, never identity. Generic terminals never become Players.

---

## 22. MODEL / EFFORT IMPLICATIONS

**Codex:**
* **Control:** per thread (`thread/start.model`) and per turn (`turn/start.model`, `turn/start.effort`). Overrides apply *"for this turn and subsequent turns."*
* **Discovery:** `model/list` returned 5 models, each with its supported efforts (low … ultra) and a default effort [LOCAL].
* **Observation:**
  * `thread/start` echoes the configured model and effort (`gpt-5.6-terra` / `medium`) [LOCAL].
  * `thread/settings/updated` reports later changes.
  * **`model/rerouted` announces a provider-side reroute.** Coach must show the model actually in use, not the one it asked for.
  * `Thread.model` is *"not per-turn execution telemetry"* [OFFICIAL]. So labels show the configured model, updated whenever a reroute is announced.
* **Result:** `Codex 2 · Terra · Medium` can come from **observed** state rather than from what Coach typed.

**Other Players:**
* **Claude:** `--model` and `--effort` at spawn; `/model` and `/effort` with arguments inside `-p` (v2.1.205 and later). `system/init` reports the model.
* **AGY:** `--model` and `--effort low|medium|high` at spawn. Whether they can change mid-session is unknown.
* **Tier T:** only typed slash commands, which need verification. **Weak.**

**Routing** stays out of scope. The contract already carries an optional model and effort per Play, so routing can arrive later without any transport change.

---

## 23. PERMISSIONS IMPLICATIONS

**Codex, mapped onto the protected human policies:**

| Human policy | Codex mechanism | Where the policy lives |
|---|---|---|
| **ASK ME** | Approval policy `on-request` (or `untrusted`). Coach answers each server request with the human's decision. Thread status `waitingOnApproval` shows as "Waiting for Permission" | Coach |
| **APPROVE FOR THIS PLAY** | Coach auto-accepts requests while *this Play's* turn is active and stops at turn end. **Codex's `acceptForSession` is scoped to the provider session (the thread), not the Play, so Coach must not use it for a Play-scoped policy** | Coach |
| **AUTONOMOUS WITHIN PLAY FENCE** | Approval policy `never`, plus sandbox `workspace-write` (with explicit writable roots) or a `granular` policy. Codex's guardian `approvalsReviewer` is another option | Coach chooses; the provider enforces |

**What a request carries.** The command, working directory, reason, file changes, and permission scope. That is enough to render *"Codex 2 wants to run `npm test` in GS3."*

**Stale requests.** `serverRequest/resolved` tells Coach when a request was answered somewhere else, for example by the human in an attached TUI, so Coach can remove stale buttons.

**Stage 1.17:** approval policy `never`, with today's authority (K7). Any request that still arrives is declined and surfaced. None is expected.

**Other Players:**
* **Claude:** a permission host (`--permission-prompts host`, the SDK's `canUseTool`, or `--permission-prompt-tool`), plus `--permission-mode`. Denials appear in the stream as `permission_denied`.
* **AGY:** UNKNOWN.
* **ACP:** `session/request_permission`.
* **Tier T:** the prompt is drawn in the TUI; Coach reads it through the screen grammar and answers by keystroke, only with verification. Lowest confidence.

---

## 24. STATUS / LIVENESS IMPLICATIONS

**Codex evidence, mapped to Coach states.** The adapter reports observations; the mapping is Coach policy.

| Coach state | Codex evidence |
|---|---|
| Ready on Bench | `codex` discovered; no channel open |
| On Field | App-server alive, thread loaded, status `idle` |
| Actively Working | Status `active` or `turn/started`, with item events flowing |
| Waiting for Permission | `active` with `waitingOnApproval` |
| Waiting for Human Input | `active` with `waitingOnUserInput` |
| Quiet / Stale | `active`, but no item events for N minutes (N is Coach policy) |
| Complete | `turn/completed` with status `completed` |
| Failed | `turn/completed` with status `failed` (plus `TurnError`), status `systemError`, or process exit |
| Unknown | Channel lost, or outcome unobserved |

**What changes.** Structured control turns most of these states into observed facts. Through `sendText`, none of them can be observed at all.

**Other Players:**
* **Claude:** stream events and `result` messages.
* **AGY:** stream-json events; schema unknown.
* **Tier T:** screen grammar.

**Bonus.** The roadmap's on-field timer (§21 of the roadmap) gets a real start (`turn/started`) and stop (`turn/completed`) *for the instance*. Instance-level attribution becomes evidence, not inference.

---

## 25. USAGE / CAPACITY IMPLICATIONS

**Codex.**
* **Sources:**
  * `account/rateLimits/read` and `account/rateLimits/updated`. The probe saw [LOCAL]: 5-hour window 19 % used, weekly window 82 % used, each with `resetsAt`.
  * Also: `ordinaryUsageAllowed`, `rateLimitReachedType`, `credits`, `account/usage/read`, and `thread/tokenUsage/updated` per turn.
* **Unknown is built in.** The schema itself says: *"Null means unavailable; clients must not infer recovery from percentages or reset times."*
* **The footer can be fed directly:** `Codex 5h 19% · wk 82% · resets 51m` needs only structured data. It is a read-only account method with no model usage.
* **It is per account, not per thread.** A Coach-owned app-server can read limits even when no controlled Player exists.

**Other Players:**
* **Claude:** result messages carry usage and `total_cost_usd` (a client-side estimate). `system/api_retry` events expose `rate_limit` errors. Plan-window percentages are UNKNOWN through the structured channel.
* **AGY:** `/usage` and `/quota` exist inside the TUI [COMMUNITY]. Structured access is UNKNOWN.
* **Tier T:** screen scraping only. Weak.

---

## 26. REPORT-LOOP COMPATIBILITY

**Unchanged.**
* The Player runs with the Game root as its working directory; the probe saw it echoed exactly.
* It writes report files with its normal tools.
* The watcher (`coach.reportGlobs`) and Incoming are unaffected.

**The sandbox must allow writing to the report location.** Stage 1.17 keeps today's authority (K7), so nothing changes. If the human narrows the sandbox to `workspace-write`, report paths inside the Game still work.

**New evidence, available but not used yet.** `item/fileChange` events together with turn ids could later attribute a report to the instance that wrote it. Roadmap §22 asks for exactly that: evidence, not inference. Not part of Stage 1.17.

---

## 27. WINDOWS IMPLICATIONS

* **Tier S Codex is proven** to start, authenticate, and create threads when spawned the way Coach would spawn it [LOCAL].
* **Stopping.** Closing stdin gives a clean exit [LOCAL]. A hard kill needs a process-tree kill (`taskkill /T`) or a Job Object, because the npm command runs as node → `codex.exe` → `codex-code-mode-host.exe`. Launching through the shell shim (`codex.cmd`) adds `cmd.exe` to that tree. Recommendation: resolve the command the way Player Discovery does, and kill by tree.
* **Codex's own Windows sandbox** is configured as `elevated` [LOCAL]. The adapter passes sandbox and approval policy explicitly and never edits the config.
* **ConPTY makes Tier T weakest on Windows** (§11).
* **For a future Bridge,** named pipes and AF_UNIX are both available. The A6 diagnostic (the default port sits in the ephemeral range) is one more reason the Bridge should avoid TCP.

---

## 28. CODESPACES / LINUX IMPLICATIONS

* **Codex ships linux-x64 and linux-arm64 binaries** in the same npm package [LOCAL]. App-server over stdio is platform-neutral. Headless login is `codex login --device-auth` [OFFICIAL].
* **Where the extension runs.** In Codespaces, VS Code runs the extension host inside the Codespace, so an in-extension control host would spawn Players inside the Stadium naturally. [INFERENCE] The manifest declares no `extensionKind`; verify this when Codespaces is first tested.
* **An existing gap, outside Stage 1.17's scope.** The availability and process-identity probes are Windows-only (`src/player-roster.ts:172` and `:195`), so no Player is discoverable on a Linux Stadium today.
* **Tier T is strongest on Linux**, because real PTYs pass bracketed paste through.
* **A Codespace with no editor window open** is one of the Stadium Bridge's earning triggers (§12).

---

## 29. GOOGLE CLOUD IMPLICATIONS

* **Control is the same as Linux.** Cloud Workstations and Cloud Shell are Linux with a browser-hosted Code-OSS, so §28 applies.
* **UNKNOWN, but none of it affects stdio control:** whether provider login flows work there (device code is expected to), where the extension host runs, and browser-preview networking.
* **Phone access.** A future relay that the Stadium dials *out* to avoids each cloud's own port-forwarding differences.
* **AGY's Google auth** (Application Default Credentials) fits GCP Stadiums naturally [COMMUNITY].

---

## 30. MOBILE / REMOTE IMPLICATIONS

**The phone only ever talks to Coach.** The contract hides every provider protocol, so a SEND from the phone does not depend on which transport sits underneath.

**Dogfood touchdown, possible after Stage 1.17:**
* phone → the existing token-protected `coach.publicUrl` tunnel → Coach → CodexAdapter → Codex.
* It works while a VS Code window is open, because the control host lives in the extension host.

**The product path:**
* phone → a Sideline relay (the Stadium Bridge connects out to it; end-to-end encrypted) → Bridge → adapter → Player.
* This is where the Play ledger with idempotency keys becomes necessary (§17).
* It is also where "away from the computer, with VS Code closed" becomes true.

**Not built now.** Nothing in Stage 1.17 blocks it, provided two constraints hold:
* **K4:** adapter code has no VS Code dependency;
* **K6:** no provider protocol is ever exposed to a client.

---

## 31. INSTALLATION / DISTRIBUTION IMPLICATIONS

| Piece | How it reaches users |
|---|---|
| **Coach extension** | A VSIX, via the Marketplace, Open VSX, or GitHub Releases |
| **Tier S / H adapters** | TypeScript inside the extension; no native dependencies |
| **Tier T stack** (only once a certified Player needs it) | Prebuilt node-pty per platform plus `@xterm/headless`, shipped as platform-specific VSIX builds |
| **Stadium Bridge** (when earned) | A Node script inside the extension, run with the extension host's own runtime (`process.execPath` with `ELECTRON_RUN_AS_NODE`), so no extra runtime install. A standalone package (npm, GitHub Release, or a single binary) only for Stadiums with no editor |
| **Provider CLIs** | Installed by the user. Coach detects presence and version. Guided install comes later, through each provider's official installer and with explicit human authorization (roadmap §13) |
| **Provider auth** | Provider-native flows only: `codex login`, Claude's own sign-in, Google sign-in. Coach may *start* a flow; it never intermediates credentials |
| **Protocol drift** | CI regenerates provider schemas for each new release (for example `codex app-server generate-json-schema`) and diffs the fields the adapters use. Adapters declare their certified version ranges |

**GitHub's role:** source, releases, versioning, update manifests, Codespaces devcontainer features that preinstall Coach and the Bridge, and Game identity. **Not the live message bus.**

**What the user sees:** Install → Coach detects the Stadium → discovers Players → the provider's own sign-in → verification (the certification check) → **Ready on Bench**. The user never configures ports, pipes, PATH, PTYs, or provider commands.

---

# 32. SCALABILITY TO 100K USERS

*Architectural foresight, not an implementation mandate.*

### 32.1 The twelve scale questions

| # | Question | Answer |
|---|---|---|
| 1 | What runs per **user**? | Coach clients (VS Code, browser, phone) and the user's provider accounts, whose credentials live on the user's Stadiums. Later, an optional Sideline identity |
| 2 | What runs per **Stadium**? | One Player Control Host (in the extension host now, a Stadium Bridge later), the provider CLIs, and the provider credential stores |
| 3 | What runs per **Game**? | Coach runtime state in the Game's `workspaceState` (roster provenance now, session bindings later), the report watcher, and the Game root as every Player's working directory |
| 4 | What runs per **Player**? | One control channel (an app-server child, a stream-json process, or a PTY) and one provider session |
| 5 | What eventually runs **centrally**? | Something optional and thin: identity, device pairing and discovery, an encrypted relay between phone and Stadium, push notifications, and update/compatibility manifests. **No Player execution. No provider credentials. No Play content at rest** |
| 6 | Is each user's Player work naturally isolated? | **Yes.** Players are processes on the user's own machine or Codespace, under the user's OS account and provider login |
| 7 | Can adding users scale horizontally? | **Yes.** Each new user brings their own Stadium and its compute. The relay is connection routing keyed by Stadium id, sharded by user |
| 8 | Are provider credentials kept local? | **Yes, always,** in the provider-native stores on the Stadium. Anthropic's terms require this for Claude (§8B) |
| 9 | Does a central service need raw provider credentials? | **No, never** |
| 10 | Is there a single throughput bottleneck? | **No.** Model traffic goes straight from the Stadium to the provider. The relay carries only small control messages and event summaries, and only for remote use |
| 11 | Could 100,000 users each run an independent Stadium Bridge? | **Yes.** Bridges share nothing. Each dials out, so it is NAT-friendly with no inbound ports, and each is scoped to one OS user |
| 12 | What changes between phases? | See §32.3 |

### 32.2 Required topics

* **Distributed execution.** Players execute where the Game lives, and provider cost stays on the user's own plan.
  * The alternative is a central service running everyone's agents. It would need everyone's provider credentials (Anthropic's terms forbid this for subscriptions; the other providers' terms don't address it). It would carry all model traffic, and it would need sandboxes.
  * It is the most expensive and least compliant shape. **Rejected.**
* **Bridge deployment.** One per OS user per Stadium. It ships inside the extension (standalone only for headless Stadiums), Coach starts it, and it is versioned with Coach.
* **Version distribution and upgrades.**
  * Extension updates carry the adapters.
  * The extension upgrades the Bridge: a contract-version handshake, then drain in-flight turns (or refuse), then restart.
  * Provider CLIs update independently. Certified version ranges and the Needs verification state absorb the skew.
  * Later, a central compatibility manifest could mark a provider version good or bad without shipping code.
* **Credential locality.** Provider-native stores only. Coach never reads, copies, or transmits credentials.
* **Secure remote routing.** Phone ↔ relay ↔ Bridge, with device pairing and end-to-end encryption. The relay routes messages but cannot read them. Stadiums have no inbound ports. App-server and Bridge sockets are never exposed on a network interface.
* **Isolation.**
  * **User:** the OS user boundary.
  * **Game:** a working directory and `workspaceState` per Game.
  * **Player:** its own process and provider session. One provider session binds to one instance.
* **Connection fan-out.** Each Stadium holds one outbound connection, and each client holds one connection to the relay. Remote clients get event summaries rather than token streams. Fan-out per user is a handful of devices.
* **Stateless where practical.** The relay keeps only soft state (a live connection table). Identity and the device registry are the only durable central state. Play content is never stored centrally; a later, opt-in sync would be encrypted.
* **Horizontal scaling.** Shard the relay by Stadium id, with stateless workers behind a load balancer. Notification fan-out uses standard push services.
* **Failure domains.**
  * A Player crash affects one Player.
  * A Bridge crash affects one Stadium.
  * A relay outage affects only remote access; local Coach keeps working.
  * A provider outage affects that provider's Players and nothing else.

### 32.3 Phases

| Phase | Shape |
|---|---|
| **Local dogfood** (now through Stages 1.17–1.18) | Localhost Coach. Control host inside the extension host. A personal, token-protected tunnel for the phone |
| **Early beta** | A Stadium Bridge process with versioned adapters. Signed GitHub releases. Device pairing. A Play ledger with idempotency keys. An opt-in relay, possibly self-hostable |
| **Larger deployment** | A hosted relay with identity and push. The compatibility manifest. Opt-in telemetry. Written terms positions from OpenAI, Anthropic, and Google on third-party control |

### 32.4 Scaling dead ends to avoid, and where today's code stands

| Dead end | Status |
|---|---|
| Central execution or central custody of credentials | Avoided by design |
| Keystroke injection into terminals Coach does not own | This is today's dispatch. Retired progressively as adapters are certified |
| Player identity tied to terminal names or PIDs beyond one machine | Avoided. Stage 1.7 provenance is machine-local by design |
| Bridge or provider sockets on network interfaces (for example app-server `--listen ws://`) | Forbidden (K2, §34) |
| Dependence on provider remote relays | Forbidden (§4) |
| Coach state that assumes one Game and one window | A current assumption. The Bridge plus per-Game bindings are the way out |
| Adapter code bound to the `vscode` API | Prevented by K4 |
| Play content stored centrally | Never |
| Provider terms | **The one non-technical scaling risk.** OpenAI has no explicit statement on third-party app-server clients using ChatGPT login (§44 U5). Anthropic restricts subscription use by third-party products (§8B) |

**The one severe dead end in today's recommended shape** is keeping the control host inside the extension for remote use: it ties a Player's lifetime to a VS Code window. That is acceptable for Stage 1.17 and for dogfood. It is exactly what the Stadium Bridge exists to remove, and K4 keeps that move cheap.

---

## 33. LOCAL VS CENTRAL RESPONSIBILITY

| Responsibility | Stadium (local) | Central (future, optional) |
|---|---|---|
| Player execution | ✔ | Never |
| Provider credentials and billing | ✔ (provider stores) | Never |
| Provider sessions and transcripts | ✔ (provider stores) | Never. At most a later, opt-in encrypted sync |
| Play content | ✔ | Passes through the relay encrypted, in transit only. Never at rest |
| Player identity and roster | ✔ (per Game) | Device-level summaries only, if any |
| Human identity and device pairing | — | ✔ |
| Remote routing | The Bridge dials out | ✔ Relay |
| Notifications | Coach raises the event | ✔ Push delivery, which does not own state (roadmap §25) |
| Updates and compatibility | Coach and the Bridge apply them | ✔ Manifests |

**Recommendation.** The brief's preferred shape is sensible and consistent with provider terms:
* **Stadium:** the Game, Players, credentials, the Bridge, and heavy execution.
* **Optional central service:** auth, discovery, relay, notifications, sync, versions.
* **Phone:** a Coach client.

---

## 34. SECURITY BOUNDARY

| Question | Stage 1.17 | Later |
|---|---|---|
| Who can dispatch a Play? | Holders of the Coach access token (unchanged), and only to `PlayerRoster`-authorized instances | An authenticated Sideline identity on a paired device |
| How does the Bridge trust Coach? | There is no Bridge; control is in-process | A stdio parent-child pipe, or a named pipe / Unix socket restricted to the OS user plus a per-install secret, with a contract-version handshake |
| Does the helper bind to localhost only? | The app-server uses **stdio only**. It has no listener at all | The Bridge never uses non-loopback TCP, and preferably no TCP at all |
| Does remote traffic need authentication? | The existing token, over the user's own tunnel | Relay device pairing plus end-to-end encryption |
| Do provider credentials leave the Stadium? | **No.** Coach never reads them (`includeToken: false`) | **No, never** |
| Is arbitrary shell execution accidentally exposed? | **No.** Adapters allowlist their provider methods: `initialize`, `thread/start`, `thread/resume`, `thread/read`, `thread/turns/list`, `turn/start`, `turn/interrupt`, `model/list`, `account/read`, `account/rateLimits/read`. `command/exec`, `fs/*`, `thread/shellCommand`, and `config/*` writes are never sent, and clients never see the provider protocol (K6) | Same. Tier T spawns the agent directly in the PTY, never a shell |
| How do Player permissions stay scoped? | An explicit authority per Player, set at `open` (K7). Coach never widens it | A per-Play policy owned by Coach (§23), with the sandbox enforced by the provider |

**Two further notes:**
* **Capability is not authority.** Parity with `--yolo` preserves today's capability. Task authority still comes from the Play the human approved (North Star).
* **Claude.** `claude -p` runs a project's hooks and MCP servers without a trust dialog. Coach must start Claude Players only in Games the human has set up.

---

## 35. FAILURE / RECOVERY MODEL (recommended path: Codex, Tier S)

| Event | What Coach shows | What Coach does | What Coach never does |
|---|---|---|---|
| **Player (app-server) crashes** | Player exited; the in-flight Play is **Unknown** | Takes the Player off the field and offers Resume. From Stage 1.18, that means a new app-server plus `thread/resume`, and `thread/turns/list` reveals the last turn's real status | Resend the Play |
| **Helper crashes** (in Stage 1.17, the extension host itself) | As for an extension reload | As for an extension reload | Resend |
| **Extension reload** | Controlled Players leave the field; in-flight Plays are **Unknown** | The stdio pipe closes, so each app-server reads end-of-file and exits [LOCAL behaviour]. From Stage 1.18, Coach re-opens Players by resuming their persisted thread ids | Adopt any running app-server by name or PID |
| **VS Code closes** | As for reload | As for reload | As for reload |
| **Network drop between phone and Coach** | The phone shows *"Sent? Unknown — checking"* | On reconnect, the phone re-reads canonical status (the existing Stage 1.11 contract). Once the relay exists, the Play ledger answers definitively | Auto-resubmit from the phone |
| **Provider session disappears** | *"Can't resume Codex 2 — start fresh?"* | The human chooses: Fresh (a new thread bound to the same instance) or Leave | Start a new thread silently |
| **Player unavailable, or an incompatible version** | Not available / Needs verification | Offers an update, or the legacy mode | Dispatch to an untested version as if it were certified |
| **Duplicate SEND** | Refused: *"Codex 2 is still working"* | The busy rule (G8); SEND is disabled while a dispatch is in flight | Start a second turn |
| **Delivery uncertain** (request written, no response) | **Unknown** | After re-attaching, reads thread history for the Play: the turn list, and `clientUserMessageId` if Codex keeps it. If found, shows it. Otherwise stays Unknown and asks the human | Resend automatically |
| **`-32001` overload** | Briefly, *"Codex is busy — retrying"* | Retries with backoff. That rejection proves the Play never ran | Retry after any other error |
| **Provider authentication expires** | Needs sign-in | Starts the provider's own sign-in flow. The Play is Refused, not queued | Touch credentials |
| **Rate limit reached** | Capacity reached, with the reset time | Refuses new Plays for that Player and shows the limits | Switch provider or model silently |

**Unknown is a first-class state throughout this table.**

---

## 36. MINIMUM REQUIRED PERSISTENCE

| When | What | Where |
|---|---|---|
| **Stage 1.17** | Nothing new. Bindings live in memory only | — |
| **Stage 1.18**, earned by the reload test | `sidelineCoach.playerSessions.v1`: `[{instanceId, playerType, providerSessionId}]` | The Game's `workspaceState`: machine-local, never synced, never committed |
| **When the phone uses a relay**, earned then | A Play ledger, `{playId, instanceId, state, timestamps}`, for idempotent SEND and outcome lookup | Coach runtime, per Game, with bounded retention |
| **Never** | Transcripts, prompts, provider credentials, or model choices used as identity | — |

**The provider stores already persist the context. Coach stores only pointers to it.**

---

## 37. MIGRATION PATH FROM THE CURRENT ARCHITECTURE

1. **Stage 1.17: Codex Tier S proof, alongside today's paths.** A Codex Player can be put on the field as *controlled* (app-server). Existing TUI Players and the `sendText` path stay untouched and uncertified.
2. **Stage 1.18:** persist the session binding, resume after reload, and reconcile uncertain outcomes.
3. **Make controlled Codex the default Codex Player** (a human decision), shown through the H1 mirror. Optionally add H2 TUI attach once its transport is acceptable.
4. **The contract conformance suite becomes the certification gate,** and legacy Players are labelled uncertified in the UI.
5. **Other adapters:**
   * a ClaudeAdapter after the K8 decision;
   * an AGY schema spike, then an AgyAdapter;
   * a generic AcpAdapter for future Players.
6. **The Terminal Player Bridge (Tier T),** only when a Player the human wants has no Tier S or H seam.
7. **Extract the Stadium Bridge** when one of the §12 triggers occurs. The most likely one is phone control with VS Code closed.
8. **Retire legacy dispatch** — the `sendText` path and the legacy terminal-name route — once every Player the human uses has a certified adapter. A human decision; Stage 1.7 already flagged the name route.

---

## 38. DECISION MATRIX

**Columns:**
1. First-party Codex semantic control (app-server over stdio, Tier S)
2. Coach-owned direct process, one per Play (Tier H)
3. Coach-owned PTY / ConPTY (Tier T)
4. Stadium Bridge / sidecar
5. Hybrid: semantic control plus separate presentation
6. Current VS Code `sendText` (Tier X)
7. **Universal contract with tiered adapters: the recommendation**

**Reading notes:**
* Column 4 is a *host*, not a transport. Its ratings assume Tier S or H adapters running inside it.
* Column 7 is the combination: 1 now, 2 as the fallback, 3 where needed, 4 when earned, 5 for presentation.
* The scale is STRONG / GOOD / MIXED / WEAK / BLOCKED / UNKNOWN.

| Criterion | 1 · S | 2 · H | 3 · T | 4 · Bridge | 5 · Hybrid | 6 · sendText | **7 · Contract** |
|---|---|---|---|---|---|---|---|
| Atomic multiline safety | STRONG | STRONG | MIXED | STRONG | STRONG | BLOCKED | **STRONG** |
| Reliable submit | STRONG | STRONG | MIXED | STRONG | STRONG | BLOCKED | **STRONG** |
| Session continuity | STRONG | GOOD | GOOD | STRONG | STRONG | GOOD | **STRONG** |
| Exact instance addressing | STRONG | STRONG | STRONG | STRONG | STRONG | GOOD | **STRONG** |
| Auth reuse | STRONG | GOOD | STRONG | STRONG | STRONG | STRONG | **STRONG** |
| Subscription compatibility | STRONG | MIXED | GOOD | STRONG | STRONG | STRONG | **MIXED** |
| Separate API billing risk (STRONG = low risk) | STRONG | GOOD | STRONG | STRONG | STRONG | STRONG | **GOOD** |
| Model control | STRONG | GOOD | WEAK | STRONG | STRONG | WEAK | **STRONG** |
| Effort control | STRONG | GOOD | WEAK | STRONG | STRONG | WEAK | **STRONG** |
| Permission control | STRONG | MIXED | WEAK | STRONG | STRONG | BLOCKED | **GOOD** |
| Structured progress | STRONG | GOOD | WEAK | STRONG | STRONG | BLOCKED | **GOOD** |
| Cancellation | STRONG | MIXED | MIXED | STRONG | STRONG | WEAK | **GOOD** |
| Multiple instances | STRONG | STRONG | STRONG | STRONG | STRONG | GOOD | **STRONG** |
| Windows | STRONG | GOOD | WEAK | GOOD | GOOD | BLOCKED | **GOOD** |
| Codespaces / Linux | GOOD | GOOD | GOOD | STRONG | GOOD | BLOCKED | **GOOD** |
| Google Cloud | GOOD | GOOD | GOOD | GOOD | GOOD | BLOCKED | **GOOD** |
| Mobile future | STRONG | GOOD | MIXED | STRONG | STRONG | WEAK | **STRONG** |
| Installability | STRONG | STRONG | MIXED | GOOD | GOOD | STRONG | **GOOD** |
| Security | GOOD | GOOD | MIXED | GOOD | GOOD | WEAK | **GOOD** |
| Failure recovery | GOOD | GOOD | WEAK | STRONG | GOOD | WEAK | **GOOD** |
| Provider support / stability | MIXED | GOOD | WEAK | GOOD | MIXED | GOOD | **GOOD** |
| 100K-user scalability | STRONG | STRONG | GOOD | STRONG | STRONG | WEAK | **STRONG** |
| Implementation complexity (STRONG = simplest) | GOOD | STRONG | WEAK | MIXED | MIXED | STRONG | **GOOD** |

**Why the key cells score as they do:**
* **Atomicity and submit.** S and H are safe by construction: a JSON string, or stdin read to end-of-file. The S request *is* the submit; for H, the spawn is. T depends on the TUI and the platform, and Codex on Windows is timing-based (§11). X is the Stage 1.15 finding.
* **Continuity.**
  * S keeps a thread in a live process and can resume by id.
  * H cold-resumes for every Play.
  * T holds context only while the process lives, and needs a provider resume flag after restart.
  * X keeps context in the TUI; delivery, not continuity, is its problem.
* **Auth and subscription.** S reuse is **proven** [LOCAL]. H and column 7 score MIXED on subscription only because of Claude's terms for programmatic use (§8B). Claude `--bare` forces an API key.
* **Permissions and progress.** S carries structured server requests and events. H mostly runs under a preset policy; Claude's permission host is the exception. T relies on reading the screen.
* **Stability.** S is labelled experimental but is used by OpenAI's own first-party clients, and it has a supported fallback (§7). H is documented. T suffers from TUI churn.
* **Windows.** S is proven here [LOCAL]. T is weakest here (ConPTY). Column 7 is GOOD rather than STRONG because each adapter must be certified per Stadium.
* **Complexity.** H is simplest. S is a small JSON-RPC client. T needs a PTY, an emulator, a screen grammar, and verification.

### 38.1 The brief's per-candidate evidence questions

| Question | Codex · S | Claude · S | AGY · S/H | Any agent · T | sendText · X |
|---|---|---|---|---|---|
| Can Coach own it? | Yes (child process) | Yes | Yes | Yes | No. VS Code owns the terminal I/O |
| Can Coach install or bundle it? | Nothing extra needed | Nothing extra | Nothing extra | A native PTY per platform | n/a |
| Can normal UX hide it? | Yes | Yes | Yes | Yes | Partly |
| Does it identify the exact Player? | Yes | Yes | Yes | Yes | Yes, via `PlayerRoster` |
| Does it carry a large multiline Play safely? | **Yes (contract)** | **Yes (contract)** | Likely: line-framed JSON, schema unknown | Conditional: per TUI and platform, with verification | **No** |
| Does it submit exactly once? | **Yes** | **Yes** | Likely | Verified, or Unknown | **No** |
| Does it preserve context? | Yes | Yes | Yes (conversation id) | While the process lives | Yes |
| Can Coach observe liveness? | Yes: process and thread status | Yes: process and stream | Partly | Process plus screen | Terminal only |
| Can it work remotely later? | Yes, via Bridge and relay | Yes | Yes | Yes | No |
| Does it work across Stadium families? | Yes: Windows, Linux, and macOS binaries | Yes | Likely | Yes. Strongest on Linux, weakest on Windows | VS Code only |
| Does another person get the same capability by installing Coach? | Yes, with Codex installed and signed in | Yes, subject to K8 | Yes | Yes, per certified provider | — |
| Does it scale beyond one developer? | Yes (distributed) | Yes | Yes | Yes | No |

---

# LEVEL 2 — FIRST PROOF (CODEX)

## 39. SMALLEST STAGE 1.17 PROOF

**Target:** ONE Game · ONE Codex Player · ONE Sideline-owned control route · ONE large multiline Play · ONE SEND · Codex starts with no human Enter · then a SECOND Play to the same Player shows retained context.

### 39.1 What gets built (minimal)

1. **`src/player-control/codex-app-server.ts`**, with no `vscode` import (K4). It:
   * spawns the Stadium's `codex app-server`, resolving the command the same way Player Discovery does, with no hard-coded paths;
   * runs a newline-delimited JSON-RPC client covering requests, responses, notifications, and server requests;
   * enforces the method allowlist (K6);
   * sends `initialize` with `clientInfo {name: "sideline_coach"}` and `capabilities: null`, staying on the stable surface (K2);
   * records the Codex version from `userAgent`.
2. **Open.** `thread/start { cwd: <Game root>, approvalPolicy: "never", sandbox: "danger-full-access" }`. That is parity with today's `codex --yolo` (K7); the human may choose `workspace-write` instead. The `threadId` is kept in memory.
3. **Deliver.**
   * Refused if a turn is already active (G8) or the channel is gone.
   * Otherwise exactly one `turn/start { threadId, input: [{ type: "text", text, text_elements: [] }], clientUserMessageId }`.
   * **Accepted** when the response arrives; **Unknown** if the pipe breaks first.
   * No retries, except after `-32001`.
4. **Server requests.** Answer with `decline` (commands, file changes) or `cancel`, and surface the event. None is expected under approval policy `never`.
5. **Close.** End stdin. If the process is still alive after a short grace period, kill the process tree. Process exit takes the Player off the field.
6. **`PlayerRoster` stays the single owner.**
   * A *controlled* Codex instance registers its control binding and its presentation tab instead of a shell terminal.
   * `resolve()` returns that binding.
   * Seats, labels, and retirement are unchanged.
7. **Dispatch.**
   * `CoachServer.dispatch()` routes a controlled instance to the adapter.
   * The response states Accepted, Refused (busy or closed), or Unknown, in plain words.
   * A non-empty model switch to a controlled Player is refused.
   * The legacy terminal branch and the name route are untouched.
8. **Presentation.** One read-only `Pseudoterminal` tab per controlled Player, created with `isTransient: true`. It shows:
   * the Play received (character and line counts);
   * the agent's message text;
   * one-line command and tool summaries;
   * the turn outcome.

   Typing into the tab shows a hint.
9. **Put on Field.** The smallest visible way to add a *controlled* Codex Player: for example, a second action or a setting. No Roster redesign.

**Explicitly not built in Stage 1.17:**
* persistence or reload resume;
* permission UX or a cancel button;
* model/effort UI;
* TUI attach;
* the Stadium Bridge;
* Claude, AGY, or ACP adapters;
* a Play ledger;
* remote access;
* multi-Game support.

### 39.2 What this proves beyond Codex

Stage 1.17 proves the *universal* seam, not just a Codex integration:
* **The contract boundary.** Coach → `PlayerRoster` → contract → adapter, addressed only by `instanceId`. Outcomes are Accepted, Refused, or Unknown; events are observations.
* **The host pattern.** A Coach-owned child process per Player, speaking a structured stdio protocol. Its lifecycle is coupled through the pipe, it has a method allowlist, and it touches no credentials.
* **Control is not presentation.** The visible surface is an extension-owned Pseudoterminal.
* **Certification.** The conformance suite (§40) is written against the *contract*, not against Codex. It becomes the harness every later adapter must pass.

**How later Players plug into the same seam:**

| Player | Same seam, different adapter |
|---|---|
| **Claude Code** | The same host pattern: one long-lived child per Player, `claude -p --input-format stream-json --output-format stream-json --verbose --replay-user-messages --session-id <uuid> --permission-prompts host`. One NDJSON user message per Play; a `result` message ends the turn; resume with `--resume`. **Gated by K8** |
| **AGY** | The same host pattern: one child per Player, `agy -p --input-format stream-json --output-format stream-json [--conversation <id>]`, with a raised `--print-timeout`. One NDJSON line per Play. A spike must first pin down the message schema, id emission, and permission behaviour. Falls back to Tier H |
| **ACP agents** (Gemini CLI and others) | One generic AcpAdapter: `session/new` ↔ `open`, `session/prompt` ↔ `deliver`, `session/cancel` ↔ `cancel`, `session/request_permission` ↔ `answer`, `session/update` ↔ events, `session/load` ↔ resume |
| **TUI-only agents** | A TerminalAdapter behind the same contract: a Coach-owned PTY, a headless emulator, and the verified state machine. Its Pseudoterminal tab is interactive, because Coach owns the PTY |

**Rule for Stage 1.17's code:** the word "Codex" should appear only inside the Codex adapter module.

---

## 40. AUTOMATED VERIFICATION REQUIRED (Stage 1.17)

**Approach.**
* A scripted **fake app-server**: a small Node script speaking the JSON-RPC subset over stdio.
* It drives deterministic tests with **no model usage**, using `node:test` and no new dependencies.
* The suite is written against the *contract*, so later adapters reuse it with their own fakes. **This is the certification harness.**

| # | Test | Proves |
|---|---|---|
| C1 | Two controlled instances. A Play sent to B reaches only B's fake server | Exact target |
| C2 | A Play of more than 10,000 characters arrives **byte-identical, as one text item** (after the existing NUL rule). It contains LF and CRLF line endings, blank lines, tabs, leading spaces, Unicode and emoji, lines starting with `/`, `!`, or `$`, a line reading exactly `/model opus`, and a trailing newline | Payload preservation |
| C3 | Exactly one `turn/start` per SEND, and no text written to the pipe outside JSON frames | Multiline atomicity; one submit |
| C4 | The fake starts exactly one turn per SEND | One turn |
| C5 | A second Play reuses the same `threadId`; no second `thread/start` is sent | Session continuity |
| C6 | Sequential Plays arrive in order. A Play sent during an active turn is Refused (busy) | Ordering; busy rule |
| C7 | A Play to a retired instance returns 404. A Play to a Player whose process exited is Refused. A sibling never receives either | Closed-Player refusal |
| C8 | The fake crashes after receiving `turn/start` but before replying. The outcome is **Unknown**, and after restart no second `turn/start` is sent | Transport failure; no silent retry |
| C9 | Request counts are asserted on every failure path. Only `-32001` produces one backed-off retry | No silent retry |
| C10 | The process dies mid-turn. The Player leaves the field, the Play is Unknown, and later Plays are refused | Provider or process death |
| C11 | `thread/start` carries the Game root as `cwd`. If the provider reports a different directory, the Play is refused | Game working directory |
| C12 | A server-initiated approval request is declined and surfaced, without hanging | Approvals under `never` |
| C13 | The adapter never sends a method outside its allowlist, even when asked to | K6 |
| C14 | The adapter module imports nothing from `vscode` | K4 |
| C15 | The existing 25 tests pass. The legacy `sendText` branch and the name route are unchanged. `npm run check`, `npm run compile`, `npm test`, and `git diff --check` all pass | Regression |

**Optional, gated behind an environment flag.** A live test that runs the real `codex app-server` on a scratch Game for C2–C5. It costs a small amount of usage, so it is not run by default.

---

## 41. SMALLEST HUMAN TEST

**Setup:** one Game, Coach running, Codex signed in (already true on this machine).

1. Put one **controlled** Codex Player on the field.
2. Select it in Coach.
3. Paste one very large multiline Play: roughly 10,000 characters, dozens of lines, with blank lines and lists.
4. Press **SEND once.** Do nothing else: no Enter, no terminal.

**PASS:**
* Coach answers **Accepted**.
* The Codex tab shows the Play received, with its full character and line count.
* Codex starts working on its own.
* Exactly one turn runs, and nothing executes line by line.

**Then:**

5. Send: *"What was the primary goal of the Play I just sent?"*

**PASS:** the same Player answers correctly from the first Play.

**FAIL signals:**
* a second turn starts;
* the Play arrives truncated or split;
* SEND needs an Enter;
* the answer shows no memory of the first Play;
* any Play reaches a different Player.

---

## 42. BREADCRUMB IMPACT

**YES.**

### Written by this stage, as the human instructed

`Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` gained:
* **IS** `[WHY: Stage 1.15 / 1.16]`: dispatch still uses `Terminal.sendText` and is **uncertified**. The boundary has been *decided*, not implemented. Stage 1.17 is the first proof.
* **WAS** `[WHY: Stage 1.15 / 1.16]`: the terminal was both presentation and control. Records Stage 1.15's finding, plus the ConPTY and Codex TUI findings. Timing delays were rejected as proof.
* **WILL BE** `[WHY: Stage 1.16]`, five entries:
  1. **Player Control Contract**, the human's sentence verbatim.
  2. **Coach-built transport**, the human's sentence verbatim.
  3. **Control is not presentation.**
  4. **Coach owns the experience.** Helpers are part of Coach, provider relays are never a dependency, and localhost is a proving environment.
  5. **Distributed execution.** Credentials and billing stay local, any central service stays thin, and API billing is never a silent default.

**No breadcrumb claims the new transport is implemented.**

### Proposed, not edited

These are for the owner of the product roadmap document:
* Restate **Master roadmap §24, "Safe Multiline Play Transport"** as:
  > Every Play is delivered through the Player Control Contract: one complete Play, one input unit, started exactly once or reported Unknown. Adapters use the provider's structured channel (Tier S), a process per Play (Tier H), or a Coach-owned verified terminal (Tier T). Keystroke injection into a terminal Coach does not own is never certified.
* Add to the working board: `[ ] Stage 1.17 — Codex controlled-Player proof`.

---

## 43. DIAGNOSTIC IMPACT

**YES, architecturally. Nothing was built.**

**The owner of transport truth is the Player Control Host**, through each adapter. Only it can know each of these facts:

| Fact | Source |
|---|---|
| Player resolved | `PlayerRoster` |
| Transport owner available | Host and adapter registered |
| Transport connected | Child process alive and `initialize` complete |
| Payload accepted | Response to `turn/start` |
| Turn started | `turn/started` |
| Player working | Thread status `active` |
| Transport failed | Process exit, or an error |
| Result unknown | Channel lost with the outcome unobserved |

**Consumers:**
* Coach Server consumes a projection of those facts, and the browser only renders it.
* The RM-1 preflight collector cannot see any of it (it is in-process state).
* A future in-extension collector must reuse the host's projection rather than re-derive it. That is the same rule `PlayerRoster` already follows.

**Stage 1.17** should add exactly one line to `Diagnostics/CONTRACT.md`, naming the Player Control Host as the owner of transport truth, and nothing else.

**Diagnostics observe. They never retry, resend, or cancel.**

---

## 44. REMAINING UNKNOWNS

| # | Unknown | How it gets resolved |
|---|---|---|
| U1 | App-server compatibility across Codex releases, given its experimental label | Version gate, CI schema diff, and the exec fallback (§7) |
| U2 | Live proof that a large multiline Play is one turn, and that context continues across two Plays | Stage 1.17 |
| U3 | Whether `thread/resume` after an app-server restart restores full context | Stage 1.18 |
| U4 | Whether Codex persists or de-duplicates by `clientUserMessageId` | Observe in Stage 1.17 |
| U5 | **OpenAI's position on a distributed third-party client driving ChatGPT-login Codex through app-server.** No explicit statement was found, and an OpenAI engineer declined to interpret the terms [COMMUNITY discussion #8338]. On the other side, OpenAI positions app-server for *"deep integration inside your own product"*, and its Python SDK reuses existing auth | Product/legal review before public distribution. Not a blocker for dogfood |
| U6 | Anthropic's terms for Sideline driving `claude -p` on claude.ai subscriptions (§8B) | A human/legal decision, or Anthropic's approval (K8) |
| U7 | AGY's stream-json schema, id emission, permission surfacing, and cancellation | A small AGY spike |
| U8 | Claude's raw-CLI interrupt wire format (documented only through the SDK) | A Claude spike; SIGINT as the fallback |
| U9 | Tier T reliability for each TUI and platform (Codex on Windows is known to be weak) | Per-provider certification |
| U10 | Behaviour in Codespaces and Google Cloud: extension-host placement and login flows | The first remote-Stadium test |
| U11 | Whether an app-server child can outlive a hard-killed extension host on Windows | Observe in Stage 1.17. Stdio end-of-file behaviour suggests it cannot |
| U12 | Resource cost with many Players (23–43 MB private per idle app-server observed) | Measure; pooled mode later if needed |
| U13 | Codex's thread `source` is inferred from the environment (it reported `vscode`) | Never use it as identity |
| U14 | The legacy name-dispatch route and today's TUI Players remain uncertified | The retirement decision (§37, step 8) |

---

## 45. RECOMMENDED NEXT PLAY

```text
TASK:              Stage 1.17 — Codex controlled-Player proof
                   (Player Control Contract, first adapter)
RECOMMENDED AGENT: Codex
REASONING:         High
TASK DIFFICULTY:   Medium-High
WHY THIS ROUTE:    The contract, tiers, ownership, allowlist, failure rules, presentation, and
                   tests are specified here. What remains is bounded: a JSON-RPC client over one
                   child process, one PlayerRoster binding, one dispatch branch, and one
                   Pseudoterminal tab.
SCOPE:             §39.1 items 1–9 under constraints K1–K9; tests C1–C15; one
                   Diagnostics/CONTRACT.md line (§43).
MUST NOT TOUCH:    The legacy sendText branch and the name route, TUI Player launch, the provenance
                   table, report scanning, ports, diagnostics tooling. No persistence, Bridge,
                   Claude/AGY/ACP adapters, permission UI, or remote access. Preserve all
                   uncommitted prior work and the Project SOP files.
ESCALATE ONLY IF:  the extension host cannot spawn `codex app-server` over stdio on Windows;
                   initialize or thread/start demands an API key or the experimental opt-in;
                   turn/start rejects or splits a large multiline text item;
                   a second turn on the same thread shows no context.
                   Send only that blocker.
```

**Human decisions requested. None of them blocks Stage 1.17.**
1. **K7, the authority for the proof:** parity with `--yolo` (the default), or `workspace-write`.
2. **K8:** how to proceed with Claude on subscriptions before any distribution.
3. **During the proof,** does the controlled Codex Player appear as a separate "add" action, or replace Put on Field for Codex? The default is a separate action, leaving the legacy path untouched.

---

## SOURCES

**OpenAI / Codex**
* [Codex App Server](https://learn.chatgpt.com/docs/app-server) (redirected from developers.openai.com/codex/app-server)
* [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
* [Codex authentication](https://learn.chatgpt.com/docs/auth)
* [app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
* [app-server-daemon README](https://github.com/openai/codex/blob/main/codex-rs/app-server-daemon/README.md)
* [TypeScript SDK exec.ts](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts)
* [Python SDK README](https://github.com/openai/codex/blob/main/sdk/python/README.md)
* [TUI paste_burst.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/paste_burst.rs)
* [PR #42405: Windows daemon support](https://github.com/openai/codex/pull/42405)
* Issues [#13729](https://github.com/openai/codex/issues/13729), [#2006](https://github.com/openai/codex/issues/2006), [#10065](https://github.com/openai/codex/issues/10065), [#20580](https://github.com/openai/codex/issues/20580)
* [Discussion #8338](https://github.com/openai/codex/discussions/8338)

**Anthropic / Claude Code**
* [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
* [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
* [Streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
* [Sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
* [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)

**Google / AntiGravity**
* [Managing conversations](https://antigravity.google/docs/cli/conversations/)
* [CLI reference](https://antigravity.google/docs/cli/reference/)
* [antigravity-cli issue #31](https://github.com/google-antigravity/antigravity-cli/issues/31)
* Community tutorials: [Real Python](https://realpython.com/antigravity-cli/), [DataCamp](https://www.datacamp.com/tutorial/antigravity-cli)

**Agent Client Protocol**
* [Introduction](https://agentclientprotocol.com/overview/introduction)
* [Agents](https://agentclientprotocol.com/overview/agents)
* [Prompt turn](https://agentclientprotocol.com/protocol/prompt-turn)
* [Gemini CLI ACP mode](https://geminicli.com/docs/cli/acp-mode/)

**Terminals and PTYs**
* [crossterm EnableBracketedPaste](https://docs.rs/crossterm/latest/crossterm/event/struct.EnableBracketedPaste.html)
* stablyai/orca [#11343](https://github.com/stablyai/orca/issues/11343), [#5274](https://github.com/stablyai/orca/issues/5274)

**Community**
* [Codex CLI remote control and mobile pairing](https://codex.danielvaughan.com/2026/06/06/codex-cli-remote-control-mobile-pairing-app-server-v2-remodex/)

---

────────────────────────────────────────

REPORT FILE:
Stage-1.16-Universal-Player-Control-Architecture.md

REPORT TIMESTAMP:
2026-09-11 01:28 MDT

────────────────────────────────────────
