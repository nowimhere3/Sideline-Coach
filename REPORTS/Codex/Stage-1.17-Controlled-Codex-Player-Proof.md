# Sideline Coach — Stage 1.17 Controlled Codex Player Proof

## Result

PASS WITH CONSTRAINTS. The first Player Control Contract implementation, controlled Codex adapter, exact-instance routing branch, and read-only presentation are implemented and pass the deterministic C1–C15 certification suite. The installed app-server launcher, existing ChatGPT authentication, version gate, thread creation, authority, working directory, model/effort observation, and clean shutdown passed a real zero-turn smoke check. The required real-Play touchdown and continuity field test remains outstanding, so this implementation is not yet FIELD-PROVEN.

## Starting state

Stage 1.15 established that VS Code `Terminal.sendText()` cannot certify an atomic multiline Play plus one reliable submit. Stage 1.16 selected the Player Control Contract and a Tier S Codex adapter over private app-server stdio. The legacy TUI route, instance-ID targeting, name compatibility route, Player reload provenance, live browser state, Roster, and Incoming reports were already present and had to survive unchanged.

## Architecture implemented

The implemented route is:

```text
CoachServer
→ PlayerRoster (Sideline identity and transport binding)
→ PlayerControlHost (instanceId → adapter ownership and transport truth)
→ Codex app-server adapter
→ one private stdio child and one provider thread
```

The contract and host contain no VS Code imports. Provider protocol details stop inside the adapter. VS Code integration is limited to Roster lifecycle, HTTP routing, and the presentation-only Pseudoterminal.

## Exact files changed

- `src/player-control/contract.ts`
- `src/player-control/host.ts`
- `src/player-control/codex-app-server.ts`
- `src/controlled-player-presentation.ts`
- `src/player-roster.ts`
- `src/server.ts`
- `src/extension.ts`
- `src/public/index.html`
- `test/fixtures/fake-codex-app-server.mjs`
- `test/player-control-contract.test.mjs`
- `Diagnostics/CONTRACT.md`
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
- `REPORTS/Codex/Stage-1.17-Controlled-Codex-Player-Proof.md`

No dependency was added. No commit or push was performed.

## Player Control Contract implementation

The provider-neutral surface implements the bounded Stage 1.17 operations: open, deliver, and close. Delivery returns one of:

- `Accepted(turnRef)`;
- `Refused(reason)` for busy, closed, invalid, unavailable, or needs-verification;
- `Unknown(reason)` when the request may have crossed the provider boundary without authoritative acknowledgement.

The host registers provider factories, owns adapter lifetimes, binds only exact opaque `instanceId` values, and emits normalized observations. It has no sibling/type/name fallback and exposes no raw provider-method entry point.

## Codex app-server implementation

On Windows, the adapter resolves `codex` through `Get-Command`, derives the installed package entry point, and spawns it through the discovered Node executable. No user-specific npm path is hard-coded. It uses private stdin/stdout, never opens a socket, never uses remote-control or a daemon, and keeps stderr separate from protocol frames.

The bounded newline-delimited JSON-RPC client correlates request IDs, handles responses, notifications, and server requests, rejects malformed or closed streams honestly, and settles outstanding operations when the child exits. Its outbound request allowlist is exactly:

- `initialize`
- `thread/start`
- `turn/start`

`initialize` identifies `sideline_coach`, sends `capabilities: null`, and does not opt into `experimentalApi`.

## Authentication and observed provider state

`codex login status` reported `Logged in using ChatGPT`. The adapter does not read `auth.json`, request or copy tokens, or provide an API key; it explicitly removes `CODEX_API_KEY` from the child environment. The real zero-turn handshake and thread start succeeded with that existing login.

Observed during the implementation smoke check:

- app-server version: `0.154.0`
- model: `gpt-5.6-sol`
- reasoning effort: `high`
- control state after open: `ready`
- provider thread binding: created

The exact proof-stage version gate certifies `0.154.0`. Any other reported version becomes NeedsVerification; there is no silent legacy fallback.

## Thread creation and runtime binding

Opening a controlled Player spawns one child, initializes it, and sends one `thread/start` with:

- `cwd`: the current Game root;
- `approvalPolicy`: `never`;
- `sandbox`: `danger-full-access`.

The response must echo the same resolved Game root, `never`, and sandbox `{type: "dangerFullAccess"}`. Any contradiction vetoes the Player. The provider `threadId` is privately bound to the Sideline `instanceId` in memory. No `sidelineCoach.playerSessions.v1` state or other session-binding persistence was added. The provider may maintain its own normal session store; Sideline does not persist the pointer yet.

## Atomic Play and exactly-once behavior

Coach retains the existing validation order: empty Plays are refused, `coach.maxPromptChars` is enforced, and NUL characters are stripped. A controlled delivery then sends one request:

```text
turn/start {
  threadId,
  input: [{ type: "text", text: <entire Play>, text_elements: [] }],
  clientUserMessageId
}
```

Internal LF/CRLF newlines, blank lines, indentation, tabs, Markdown, command-like prefixes, Unicode, emoji, and a trailing newline remain content in the one JSON string. There is no terminal paste, `sendText`, Enter, PTY, focus, keyboard automation, or settling delay. The semantic `turn/start` request is submission.

A fresh `clientUserMessageId` is minted per SEND. Normal delivery invokes `turn/start` once. Only explicit error `-32001`, which proves ingress rejection, receives one 25 ms backed-off retry using the same correlation value. No other response error, timeout, pipe loss, or process death retries. A channel loss after the write but before acknowledgement returns Unknown.

## Lifecycle, busy, and failures

The adapter normalizes ready, accepted, started/active, agent-message progress, command/tool summaries, completed, failed, interrupted, Unknown, lost, and exited observations. From delivery start through `turn/completed`, a second ordinary SEND is `Refused(busy)`; it is never queued or steered.

Unexpected command/file approval requests are declined, input requests receive an empty cancellation-equivalent answer, and MCP elicitation is declined. The occurrence is surfaced rather than allowed to hang. No permission UI was added.

Closing the presentation closes only its exact owned binding. The adapter first ends stdin and allows a bounded grace period; on Windows it uses `taskkill /PID <owned pid> /T /F` only if that exact owned child remains. A channel or process loss retires that controlled Player. It never redirects, respawns a fresh thread, retries a Play, adopts by process name, or falls back to a TUI.

## Presentation and Roster behavior

Codex now has a small additive `Put Controlled on Field` Roster action. Controlled and legacy instances may coexist and use normal seat allocation. Controlled status labels include `· Controlled`, so the proof route is distinguishable in the Roster target list.

Every controlled instance gets one `isTransient: true` Pseudoterminal. It is read-only, has no shell or authoritative PID, and is never registered through legacy terminal provenance. It displays readiness, observed version/model/effort, Play character and line counts, Working, agent text, short command/tool summaries, and completion/failure. Typed input is discarded and displays `Send Plays through Sideline Coach.`

## Legacy path preservation

`CoachServer.dispatch()` branches on authoritative `PlayerRoster` transport state. Controlled instances use the contract. Legacy instances retain the existing `terminal.sendText(modelSwitch, true)` and `terminal.sendText(prompt, true)` behavior. The terminal-name compatibility route and unique-name safety checks remain. A non-empty terminal-era `modelSwitch` sent to a controlled instance is refused and is never injected into the Play.

## C1–C15 conformance results

| Test | Result | Evidence |
|---|---|---|
| C1 exact target | PASS | Two host bindings; only addressed fake received `turn/start` |
| C2 payload fidelity | PASS | >10,000-character mixed payload was byte-identical in one text item |
| C3 atomicity | PASS | One JSON `turn/start`; no raw Play frame |
| C4 one turn | PASS | Fake started exactly one provider turn |
| C5 continuity | PASS | Two Plays reused one `threadId`; one `thread/start` |
| C6 order/busy | PASS | Completed Plays preserved order; active Player refused second SEND |
| C7 closed safety | PASS | Closed binding refused; sibling received nothing |
| C8 acknowledgement loss | PASS | Post-ingress crash returned Unknown; request count stayed one |
| C9 retry rule | PASS | Only `-32001` retried once; other error count stayed one |
| C10 death mid-turn | PASS | Unknown lifecycle, lost state, later refusal |
| C11 Game cwd | PASS | Exact root and authority sent; contradictory echo vetoed open |
| C12 unexpected approval | PASS | Request was declined and surfaced without hanging |
| C13 allowlist/version/auth boundary | PASS | No raw invoke surface; `capabilities: null`; API-key env removed; untested version vetoed before thread start |
| C14 VS Code-free | PASS | Contract host and adapter import no `vscode` module |
| C15 regression | PASS | Controlled route/presentation present; legacy instance and name routes retained |

The fake app-server is the only provider used by automated turn tests; automation consumed no live model usage.

## Automated verification

```text
npm run check       # passed
npm run compile     # passed
npm test            # passed: 40 tests, 0 failed
git diff --check    # passed (line-ending warnings only)
npm run diagnostics # completed
```

Diagnostics continued to report the pre-existing unrelated conditions:

- ERROR A6: configured port 49152 is inside the Windows ephemeral range;
- WARN A5: two Sideline Coach copies exist under the parent directory.

The real zero-turn smoke check also passed using the exact default Windows command-resolution, initialize, thread/start, version/authority/cwd verification, and close path. No `turn/start` was sent and no model usage was consumed.

## Human verification required

Required, not completed in this implementation environment:

1. Start one CONTROLLED Codex Player from Coach and select that exact Player.
2. Put one deliberately huge multiline Play (roughly 10,000+ characters, dozens of lines, blank lines, lists, and optional code blocks) into Coach.
3. Click SEND exactly once and do nothing else—no Enter, terminal interaction, or refresh.
4. After it completes, send: `What was the primary goal of the Play I just sent?`

PASS requires Accepted, one sensible Play count, automatic work with one turn and no line-by-line execution, then a context-aware answer from the same controlled Player.

## Breadcrumb Impact

YES.

### WAS

Legacy terminal transport was the only runtime dispatch path and could not certify atomic multiline submission.

### IS

A first Player Control Contract implementation exists for controlled Codex alongside the untouched legacy path. Its host and adapter are VS Code-free, exact-instance semantic delivery passes C1–C15, and field verification is still pending.

### WILL BE

Every certified Player will implement the same contract through an appropriate Tier S, H, or T adapter. No other Player adapter, legacy retirement, or broader control UX was authorized here.

The architecture breadcrumb and master roadmap working board were updated accordingly.

## Diagnostic Impact

YES, contract only. `Diagnostics/CONTRACT.md` now states that the Player Control Host owns controlled-transport truth and that diagnostics may observe but never resend, retry, cancel, or repair. No collector, telemetry store, or diagnostic action was added.

## Remaining known unknowns

- The real large-Play and same-thread context proof is pending the human test.
- Whether the provider persists or de-duplicates `clientUserMessageId` remains unobserved because no live turn was burned during automation.
- Sideline's `instanceId ↔ threadId` binding is memory-only; extension reload loses controlled Players until Stage 1.18.
- Versions other than `0.154.0` are intentionally unverified.
- Rich working/permission/activity UI, cancellation, structured model selection, and usage telemetry remain out of scope.

## Recommended next Play

Run the one controlled-Codex touchdown and continuity sequence; only after it passes should Stage 1.18 persist and resume the provider-session binding.

REPORT NAME: Stage-1.17-Controlled-Codex-Player-Proof.md
STAGE: Stage 1.17
WHAT IT IS: Controlled Codex Player Proof
