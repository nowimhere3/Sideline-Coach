# Scout D — Exact-Instance Live Console / Under the Hood

REPORT TYPE: SCOUT REPORT
SCOUT: Claude Code / Sonnet / Medium
RECONNAISSANCE DEPTH: Bounded (single question)
DOES NOT REPEAT: Scout A (identity/execution projection), Scout B (pause/checkpoint/resume/session preservation), Scout C (capacity/eligibility/scheduling)

## Executive Answer

Sideline already has a **sound exact-instance identity chain** (`gameId` → `stadiumId` → `playerInstanceId`, enforced with duplicate/ambiguity refusal, never by name) and it already has **two working browser transports** (Control Plane daemon SSE in `control-plane/daemon.ts`, and a separate per-Stadium legacy SSE server in `server.ts`) that both carry `playerInstanceId`-scoped events today. But **neither transport currently carries anything richer than coarse turn lifecycle** (`sending`/`received`/`completed`/`failed`/`unknown` + a short prompt/result summary). The actual rich, provider-native activity stream — assistant message text, tool/command lines, tool inputs, reasoning/status frames — is produced by `StructuredPrintControl`/`CodexAppServerControl` as `ControlEvent`s, but it is **consumed entirely inside the VS Code extension host** (feeds a local Pseudoterminal + an in-memory 50-event ring buffer) and **is never forwarded across the WebSocket to the daemon, and therefore never reaches SSE or the browser.**

So: the identity plumbing to bind "Claude 1" to one exact live resource is real and trustworthy today. The wire to carry that Player's *actual activity content* to a browser does not exist yet — it would need to be built by extending the existing turn-event pipeline, not by inventing a new transport.

## WAS / IS / WILL BE

- **WAS**: Provider activity (`ControlEvent`) was designed and built as a Stadium-local, human-in-VS-Code concept — it drives a `vscode.Pseudoterminal` (`ControlledPlayerPresentation`) that a human watches by opening that Player's terminal tab inside VS Code itself. It was never designed to leave the extension host.
- **IS**: The browser/mobile-facing surfaces (`control-plane/daemon.ts` SSE, `server.ts` SSE) only carry the Dad-neutral `ExecutionView` projection and coarse `PlayerTurnEvent`s (`{instanceId, state, turnRef, summary}`). Exact-instance identity (`playerInstanceId`, `gameId`, `stadiumId`) is already present on the wire for these coarse events. Ambiguous/duplicate Game↔Stadium bindings are already detected and refused at the registry layer, not silently guessed.
- **WILL BE** (per the human goal, not yet built): a per-instance "Under the Hood / LIVE" view in the browser that shows the same detail the in-VS-Code terminal already shows. This requires forwarding the existing `ControlEvent` stream (already produced, already keyed by `instanceId`) one hop further — Stadium → daemon → SSE → browser — plus a redaction/security decision that does not yet exist anywhere in this codebase.

## Exact Identity Chain

Traced concretely, strongest-evidence-first:

1. **`gameId`** — authoritative Game identity, established via `.sideline/game.json` marker + `game-identity.ts` (not read in depth this pass; referenced by `server.ts` imports). A Game is the unit multiple Stadium windows can claim.
2. **`stadiumId`** — one WebSocket session per Stadium (VS Code window) connecting to the Control Plane daemon (`control-plane/daemon.ts` `handleWsConnection`). `StadiumRegistry.getAuthoritativeSessionForGame(gameId)` explicitly detects and **refuses** ambiguity: "Game '...' binding is conflicted/ambiguous across N active Stadium windows. Exact routing is blocked." (`control-plane/stadium-registry.ts`). This is a real, already-enforced anti-leakage boundary, not a gap.
3. **`playerInstanceId`** — minted by `PlayerInstanceBook.mintId()` (Scout B territory, re-confirmed here) as `${playerType}-${8 hex chars}`, unique per Stadium's in-memory book. Carried explicitly on every coarse turn/status event already broadcast today (`router.ts`: `status-update` payload includes `gameId`, `stadiumId`, `playerInstanceId`, `clientRef`).
4. **`PlayerRoster` / `PlayerControl`** — `PlayerControlHost.resolve(instanceId)` (`player-control/host.ts`) is the single authoritative lookup from `instanceId` to a live `PlayerControl` object; there is exactly one `PlayerControl` per `instanceId`, enforced by the host's own `Map`.
5. **Provider process/thread/conversation** — `providerSessionRef` (Claude session id / AntiGravity conversation id / Codex thread id) is a field directly on the resolved `PlayerControl`, one-to-one with `instanceId`. No name-based lookup exists anywhere in this chain — `player-adapters.ts` explicitly documents "Coach must never infer this from a terminal's name" and `decidePendingMatch` (Scout B) proves adoption identity by exact PID + exact process start-timestamp, never by title.

**Where labels are used instead of exact identity**: nowhere found in the *routing* path. Labels (`fieldLabel`, e.g. "Claude 1 · Opus · High") are presentation-only, derived from `(playerType, seat, routing)` — see `player-instances.ts: fieldLabel()`. They are never used as a lookup key; every mutating/observing call in the daemon and roster takes `instanceId` as its parameter.

**Possible leakage found — SERVER-SIDE FAN-OUT, not identity confusion**: Both `control-plane/daemon.ts` (`sseClients: Set<http.ServerResponse>`) and `server.ts` (its own `sseClients` set) broadcast every event to **every connected browser client**, regardless of which Game or Player that browser is currently displaying. The payload always carries `gameId`/`instanceId` so a correctly-written browser client filters client-side — but the **server does not scope delivery by subscription**. This is not cross-Game *identity* confusion (the IDs are exact and correct), but it is cross-Game/cross-instance **exposure**: any browser holding an SSE connection to a daemon receives every Game's and every Player's coarse events, trusting the client to discard what isn't relevant. This matters more as the payload gets richer (see Security section).

## Provider-by-Provider Observability Matrix

| Data | Claude (Controlled) | Codex (Controlled) | AntiGravity (Controlled) | Terminal / Legacy |
|---|---|---|---|---|
| Process/turn lifecycle (accepted/started/completed/failed/interrupted) | **CAPTURED** (`ControlEvent{kind:'turn'}`, `structured-print.ts`) | **CAPTURED** (`turn/started`,`turn/completed` notifications, `codex-app-server.ts`) | **CAPTURED** (same shared runtime as Claude) | **CAPTURED, coarse** — command start/end + exit code only, via VS Code Shell Integration when present |
| Assistant message text (reasoning/response content) | **CAPTURED, Stadium-local only** (`kind:'message'`, parsed from `assistant`/text blocks) | **AVAILABLE BUT NOT CAPTURED for text** — Codex's app-server protocol includes `turn/started`/`turn/completed`, but this scout did not confirm a streamed message-delta notification is currently parsed/emitted by `CodexAppServerControl` beyond turn state (see Unknowns) | **CAPTURED, Stadium-local only** (`step_type:'agent_response'`, `text_delta`) | **NOT AVAILABLE** — raw shell stdout/stderr is never read by Coach (`terminal-player.ts` docstring + confirmed no `execution.read()` call anywhere) |
| Tool/command invocation + arguments | **CAPTURED, Stadium-local only** (`kind:'command'`/`'tool'`, includes literal command line for bash/powershell) | **UNKNOWN** — not traced this pass whether Codex's notifications surface tool-call detail the same way | **CAPTURED, Stadium-local only** (`run_command` → `CommandLine`, file-edit tools → `TargetFile`) | **NOT AVAILABLE** (see above) |
| Denied/needs-approval actions | **CAPTURED, Stadium-local only** (`kind:'denied'`) | Approval methods exist in protocol (`item/commandExecution/requestApproval`) — **UNKNOWN** whether surfaced as a `ControlEvent` | **UNKNOWN** — dialect has no explicit "denied" signal parsed in the code read this pass (Full Autonomy is Coach's default, so this may be rare in practice) | n/a |
| Provider stdout raw bytes | **EXISTS, NOT CAPTURED beyond parsed JSON frames** — anything outside a recognized frame shape is silently dropped by `parseJson`/`parseClaudeFrame` | Same pattern — unparsed frames are dropped | Same pattern | **NOT AVAILABLE**, never read |
| Session/conversation/thread state | **CAPTURED** (`providerSessionRef`, `historyExpected`) | **CAPTURED** (`thread.id`, thread status) | **CAPTURED** (`conversation_id`) | **CAPTURED, weakly** — only shell PID + start-time, no shell "state" concept |
| Reaching the browser today | **NOT AVAILABLE** (stops at Stadium) | **NOT AVAILABLE** | **NOT AVAILABLE** | **NOT AVAILABLE** (exit-code-only event is Stadium-local too — not traced onto SSE this pass; treat as UNKNOWN whether even that reaches the browser) |

Legend recap: CAPTURED = code already parses/stores it somewhere; "Stadium-local only" is this report's qualifier meaning captured-but-trapped-in-the-extension-host, i.e. the daemon/browser cannot see it without new plumbing.

## Existing Browser Transport

Two independent, coexisting transports were found — this scout did not fully resolve their relationship (both appear live in the tree; likely one is the newer cross-Game Control Plane and one is an older per-Game/per-Stadium direct server that may predate it or serve a different UI surface):

1. **`control-plane/daemon.ts`** — a standalone Node daemon, one per machine (elected via `launcher.ts`'s lock protocol, Scout B territory), holding a `WebSocketServer` for Stadium↔daemon RPC and an `http.ServerResponse`-based SSE broadcast for daemon↔browser. Events: `hello`, `status`, `execution` (the `ExecutionView` projection, revision/epoch-guarded), `turn` (coarse `status-update` payload), `games`, `reports`.
2. **`server.ts` (`CoachServer`)** — runs *inside* the VS Code extension host itself (imports `vscode`), with its own `http.Server` + its own `sseClients` Set, its own `broadcast('turn', turn)` wired directly to `PlayerRoster.onDidTurnChange`. This is a **shorter, Stadium-local path** — no daemon hop — for the exact same coarse `PlayerTurnEvent` shape.

**Reusable primitives found, in priority order for "borrow, don't invent":**

- The `instanceId`-keyed event shape (`{instanceId, state, turnRef, summary, at}`) is already the right shape to extend — adding a `detail`/`content`/`category` field for progress-kind events is additive, not a redesign.
- The daemon's `revision`/`epoch` guard on `ExecutionView` (Scout A territory, re-confirmed: `execution` broadcasts carry `epoch: this.ledger.epoch`) is the correct existing mechanism for "reject stale frames after a daemon restart" — a future live-console stream should reuse this epoch, not invent its own.
- SSE itself (already in daemon.ts and server.ts) is a workable transport for a scrolling console — it's the one piece of infrastructure that doesn't need to be rebuilt.
- `HostedControlEvent`/`PlayerControlHost.onEvent()` inside the Stadium is the **single point** where every Controlled provider's granular event already funnels through uniformly, regardless of provider — this is the natural tap point for a new forwarder, not something to duplicate per-provider.

## Smallest Reusable Architecture Seam

The smallest truthful seam, given everything above, is:

**Extend `PlayerRoster.handleControlEvent()` (`player-roster.ts:939`) to also forward `progress`/`command`/`tool`/`denied` kinds — not just `turn` — as a new WS notification (e.g. `player.activity`) to the daemon, keyed by the same `instanceId` it already uses for `turn` events. The daemon then re-broadcasts it over the existing SSE `broadcast()` mechanism under a new event name (e.g. `activity`), with the same `gameId`/`epoch` discipline as `execution`.**

This is explicitly **an extension of the existing turn-event pipeline**, not a new transport, not a new identity concept, and not a new provider capability — it reuses:
- the identity chain (unchanged),
- the WS RPC/notification mechanism (already bidirectional Stadium↔daemon),
- the SSE broadcast mechanism (already daemon↔browser),
- the epoch/revision discipline (already exists for `execution`).

**Tradeoffs vs. alternatives considered:**
- *A separate exact-instance activity projection class* (mirroring `execution-projection.ts`'s pure-function style) is a good idea for the **shape** of the data (bounded, Dad-neutral-if-needed, revision-stamped) but should still ride the same WS/SSE rails above — it is a data-shaping layer, not a new pipe.
- *A bounded ring buffer per instance* is necessary regardless of transport choice, for two independent reasons: (a) a reconnecting browser needs backfill, mirroring what `eventHistory` (cap 50) already does Stadium-side; (b) unbounded memory growth must be prevented on both the Stadium and the daemon if this buffer is duplicated at both hops. **This buffer already exists once** (Stadium-side, cap 50) — the smallest seam duplicates or relays it, rather than inventing a second buffering policy.
- *A wholly separate transport* (e.g., a new WebSocket purely for console streaming) was considered and rejected as unnecessary: SSE is already proven for this daemon and already fans out from one Stadium event to many browsers; a second transport would only be justified if per-client subscription scoping is required (see Security), which is a policy question, not a transport question.

## Security & Redaction Findings

This is the most important gap this scout found, and it is currently **zero-mitigated**:

- **FACT**: `ProcessRunner.spawn()` in `structured-print.ts` passes `{ ...process.env, ...options.env }` to every Controlled Claude/AntiGravity process — the full parent environment, which on a developer machine routinely includes API keys, cloud credentials, and tokens for unrelated services. This env is never inspected by Coach; it's just passed through so the provider CLI runs correctly.
- **FACT**: `ControlEvent{kind:'command'}` for Claude captures the **literal bash/powershell command line** the assistant chose to run (`structured-print.ts:198`, `parseClaudeFrame`). If a human, or the assistant itself, runs something like `curl -H "Authorization: Bearer sk-..."`, that literal string is what gets emitted — verbatim — into the event stream this scout is proposing to forward to browsers.
- **FACT**: AntiGravity's `run_command` tool events capture `CommandLine` the same way (`structured-print.ts:283`).
- **FACT**: No redaction, scrubbing, allowlisting, or secret-pattern-detection function exists anywhere in `src/` today (grepped project-wide for `redact|scrub|secret` with no relevant hits outside label strings).
- **FACT**: Assistant message text itself is unfiltered — anything the provider chooses to say (which could echo back file contents, environment values it read, or partial secrets it encountered while working) flows straight into `ControlEvent{kind:'message'}` with no inspection.
- **FACT**: The existing browser-facing transports (`daemon.ts` SSE, `server.ts` SSE) broadcast to **every connected client**, not per-subscription — so even a correctly-scoped-by-payload event still physically reaches every open browser tab, mobile or desktop, that holds an SSE connection to that daemon/server. Today this is low-risk because the payload is Dad-neutral status only; it would **not** remain low-risk if raw command/message content rides the same pipe unfiltered.
- **"Local" is not automatically "safe"**: nothing about `127.0.0.1` binding (used by the daemon) prevents another local process, browser extension, or a second person using the same machine from opening the SSE endpoint — this scout did not find any per-request authentication check on the SSE route in `daemon.ts` (the WS RPC route does have a bearer-token check per Scout B's launcher findings, but the **SSE GET route itself** was not confirmed to require the same token in the code read this pass — flag as UNKNOWN, not FACT, since the relevant handler section wasn't read in full).

**Minimum security/redaction contract an architect would need before implementation:**
1. A secret-pattern redaction pass (at minimum: common token/key shapes, `Authorization:`/`Bearer` headers, anything matching known env-var-name patterns) applied to `command`/`tool`/`message` event text **before** it leaves the Stadium process — never rely on the browser or the daemon to redact after the fact.
2. A decision on whether full command lines should ever cross the wire at all, vs. a truncated/summarized form (the existing `compact()` helper in `structured-print.ts` already truncates to 180 chars for its own internal summaries — reusable, but truncation is not redaction).
3. Confirmation (not assumption) that the SSE GET endpoint enforces the same auth boundary as the WS RPC endpoint, or an explicit decision to add one, before any content richer than today's Dad-neutral status rides it.
4. A decision on per-client subscription scoping (only stream Player X's activity to a browser that actually opened "Under the Hood" for Player X) rather than continuing today's broadcast-to-everyone model — this shrinks blast radius even if redaction has a gap.

## Mobile / Streaming Risks

- **Event frequency**: unbounded today — a busy Claude/AntiGravity Play can emit many `message`/`tool` events in quick succession (one per streamed text delta or tool call); no throttling/coalescing exists for this class of event (the `execution` broadcast *does* coalesce via `setImmediate` batching — `scheduleExecutionBroadcast` — but that pattern is not yet applied to anything content-shaped).
- **Reconnect behavior**: SSE `hello` + full `status`/`execution` resync on connect already exists (`handleSseConnection`) — the same pattern (replay a bounded backlog keyed by `instanceId` + `epoch`) is the obvious fit for activity streaming, and the Stadium-side `eventHistory` (cap 50, replayed to new listeners on `onEvent()`) is a working precedent for exactly this replay-on-subscribe pattern.
- **Backpressure**: not evaluated in code — SSE writes in `broadcast()` are fire-and-forget (`client.write(...)`, with clients removed only `catch`-on-error); a slow mobile connection accumulating unflushed writes was not specifically guarded against anywhere found.
- **Memory growth**: the existing `eventHistory` cap (50) is a real, working bound — a browser-facing equivalent must adopt a similarly explicit cap; nothing prevents unbounded growth by default in this codebase's patterns (every buffer found was manually capped, never framework-provided).
- **Ordering / stale events**: the `epoch`/`revision` pattern from `execution-projection.ts` already solves "was this daemon restarted since my last event" — a live console feed must carry the same `epoch` and, ideally, its own monotonic per-instance sequence number (not found to exist yet for anything content-shaped) so a browser can detect a gap and re-request backfill rather than silently show incomplete activity.

## Observation vs Control Boundary

- **Can it be READ-ONLY?** Yes, structurally: `PlayerControlHost.onEvent()` and `StructuredPrintControl.onEvent()`/`CodexAppServerControl.onEvent()` are pure subscription methods — subscribing a new listener (even one that forwards to the daemon) does not touch `deliver()`, `interrupt()`, or `close()` in any way. Reading a stream and issuing a Play are architecturally separate method calls on the same object today; nothing in the existing code couples them.
- **What could accidentally grant authority**: the risk is not in the event-read path itself, but in **API/route design** — if a future `/api/player/:id/activity` browser endpoint is implemented on the same router class that also holds `deliver`/`interrupt`/dispatch routes, a careless shared-auth-middleware bug could let a viewing session also gain dispatch rights. This is a **route-authorization** risk, not a data-model risk — the underlying `PlayerControl` object cleanly separates `onEvent` (observation) from `deliver`/`interrupt`/`close` (control) already.
- **First-principle check**: "observing Claude 1 must not grant new authority over Claude 1" — **holds true in the current object model** (`PlayerControl` interface, `player-control/contract.ts`) but has **not yet been tested at the HTTP/route layer**, because that layer doesn't exist yet for this purpose.

## Facts

- Exact-instance identity (`gameId`/`stadiumId`/`playerInstanceId`) is already threaded through the coarse turn-event pipeline end-to-end, Stadium to browser, in both `daemon.ts` and `server.ts`.
- Ambiguous Game↔Stadium bindings are detected and routing is explicitly blocked, not guessed (`stadium-registry.ts`).
- The rich per-turn `ControlEvent` stream (message text, tool/command lines, denied actions) is fully produced today for Claude and AntiGravity, and partially for Codex, but is consumed only inside the VS Code extension host — it never crosses the WebSocket to the daemon or the SSE to any browser.
- Two independent SSE broadcast surfaces exist (`daemon.ts`, `server.ts`); both broadcast to all connected clients with no per-subscription scoping.
- No secret-redaction mechanism exists anywhere in `src/`.
- Provider child processes (Claude/AntiGravity) inherit the full parent process environment.
- Terminal/legacy Players' raw output text is never read by Coach at all, at any layer (only exit codes).
- A working bounded-buffer + replay-on-subscribe pattern already exists Stadium-side (`eventHistory`, cap 50) and an epoch/revision staleness guard already exists daemon-side (`execution-projection.ts`) — both are reusable without modification to the pattern.

## Inferences

- The most honest, smallest V1 of "Under the Hood / Claude 1 / LIVE" is: forward `ControlEvent`s (with redaction applied at the Stadium, before they leave the process) over a new WS notification method, alongside the existing `turn` notification, keyed by the same `instanceId`; re-broadcast over SSE under a new event name; gate the browser route behind the same per-instance identity so a viewer of "Claude 1" can never silently receive "Claude 2" or another Game's frames.
- Because observation and control are already cleanly separated at the `PlayerControl` interface level, a read-only viewer route is achievable without touching `deliver`/`interrupt`/`close` at all — the risk is entirely in how the new HTTP route is authorized, not in the data model.
- Codex's activity richness is probably the weakest of the three Controlled providers today (only turn lifecycle confirmed; message/tool-call streaming not confirmed) — if "Under the Hood" ships provider-by-provider, Codex is likely to show the least detail first unless its app-server protocol is probed further.

## Unknowns

- Whether `CodexAppServerControl` currently parses/emits any `ControlEvent{kind:'progress'}` equivalent for assistant text or tool calls, or whether Codex's app-server protocol even offers a streaming notification for that (vs. only start/complete). Not confirmed either way in the code read this pass.
- Whether the SSE GET route in `control-plane/daemon.ts` enforces the same bearer-token check as the WS RPC route, or is unauthenticated on `127.0.0.1`.
- The exact relationship between `control-plane/daemon.ts` and `server.ts` — whether `server.ts` is a legacy predecessor being phased out, a still-live parallel surface for a different client, or serves a distinct purpose (e.g., single-Game direct access vs. multi-Game Control Plane access). Not resolved this pass.
- Whether AntiGravity or Codex emit any denied-action / approval-request signal analogous to Claude's `kind:'denied'` — dialect code for AntiGravity's `parseAntiGravityFrame` does not appear to parse one, and Codex's `APPROVAL_METHODS` constant exists but this scout did not confirm it is wired to a `ControlEvent`.
- Real backpressure/memory behavior of the SSE broadcast loop under sustained high-frequency events — not observable statically; would require a live provider probe with genuine tool-call-heavy activity.

## Contradictions

- The `PlayerControl` interface's very existence (`onEvent`, separate from `deliver`/`interrupt`) *implies* a design intention that observation was meant to be decoupled and forward-portable — yet no code path anywhere forwards that event stream past the Stadium boundary today. The seam was seemingly built for exactly this future use case and never finished, rather than never intended.
- The system is careful to the point of paranoia about exact-instance identity for *dispatch* (duplicate-session quarantine, PID+start-time proof, ambiguous-Game refusal) while being completely unguarded about the *content* that would ride an equally exact-instance-keyed observation channel — the identity discipline and the content discipline are at two very different maturity levels in the same codebase.

## Architect Decisions Required

1. Should redaction happen at the Stadium (before anything leaves the extension host — recommended, since that's the only point that ever sees raw provider stdout) or at the daemon, or both?
2. Should the browser-facing activity stream be scoped per-subscription (only stream what a viewer actually opened) rather than reusing today's broadcast-to-everyone SSE model — and is that worth the added complexity given today's SSE surfaces are already broadcast-only?
3. Should Codex get a deeper app-server protocol probe (live, bounded) to determine what streaming detail it can actually offer, before committing to feature parity across all three Controlled providers in the same UI?
4. Is `server.ts` (the Stadium-local legacy server) meant to carry this feature too, or should "Under the Hood" be built exclusively against the Control Plane daemon path, with `server.ts` explicitly out of scope / deprecated for this feature?
5. What is the redaction bar — pattern-based secret scrubbing, full command-line suppression by default (show only the tool name, not its arguments), or a human-configurable trust level per provider?

## Recommendation to Opus

Exact-instance identity is solved; do not re-architect it. The only structurally new thing "Under the Hood" needs is a **content-shaped extension of the pipeline that already exists** for coarse turn events — same IDs, same WS/SSE rails, same epoch discipline. The real design work is entirely in **redaction policy and route-authorization**, not in transport or identity. Treat this as a policy/security design task riding existing plumbing, not a new architecture.

## Facts/Evidence Files Read This Pass

`control-plane/execution-projection.ts`, `control-plane/daemon.ts` (partial — SSE/WS wiring, broadcast/execution-broadcast sections, WS connection handler), `control-plane/router.ts` (partial — status-update emission), `control-plane/stadium-registry.ts` (partial — gameId/stadiumId binding, ambiguity refusal), `player-roster.ts` (partial — handleControlEvent, turnChanged wiring), `server.ts` (partial — CoachServer SSE wiring, onDidTurnChange forwarding), plus re-confirmed context from Scout B's reading of `player-control/contract.ts`, `player-control/structured-print.ts`, `player-control/codex-app-server.ts`, `player-adapters.ts`, `player-instances.ts`, `terminal-player.ts`.

READY FOR OPUS SYNTHESIS
