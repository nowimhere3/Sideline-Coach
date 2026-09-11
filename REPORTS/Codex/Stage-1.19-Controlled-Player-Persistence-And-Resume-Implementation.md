# Stage 1.19 — Controlled Player Persistence and Safe Resume Implementation

REPORT NAME: Stage-1.19-Controlled-Player-Persistence-And-Resume-Implementation.md  
STAGE: Stage 1.19  
WHAT IT IS: Controlled Player Persistence + Safe Resume Implementation  
TIMESTAMP: 2026-09-11 08:30:26 MDT

## Verdict

**PASS WITH CONSTRAINTS — IMPLEMENTATION COMPLETE / AUTOMATED PROOF PASSED.**

The accepted Stage 1.18 architecture is implemented and the complete repository suite passes. The controlled Codex SEND route remains Stage 1.17 field-proven. Persistence, reload restoration, and post-reload same-thread context are not yet field-proven; only the human's prescribed two-Player reload test can establish that result.

No commit or push was performed.

## Starting state

Stage 1.17 had a field-proven semantic Codex route over private `codex app-server` stdio: one large multiline Play became one provider turn with no Enter, and a second Play retained thread context. The Sideline `instanceId` to provider `threadId` binding existed only in activation memory, so extension reload lost the controlled Player even though Codex persisted the conversation.

The worktree already contained substantial uncommitted work from Stages 1.4–1.18. It was preserved. No reset, revert, legacy transport rewrite, report-watcher change, port change, or unrelated cleanup was performed.

## Files changed for Stage 1.19

- `src/player-control/bindings.ts` — VS Code-free binding record, validation, cloning, duplicate detection, and deterministic restore planning.
- `src/player-control/contract.ts` — provider-neutral restore outcome, reconciliation outcome, adapter identity, host-supplied `clientRef`, and seat-aware open request.
- `src/player-control/host.ts` — binding-table ownership, ordered persistence, write-ahead SEND, restore registry/concurrency, definitive-outcome clearing, exact leave, and runtime binding defenses.
- `src/player-control/codex-app-server.ts` — ChatGPT account gate, read/resume validation, writer-lock retry, history reconciliation, and expanded exact method allowlist.
- `src/workspace-state-binding-store.ts` — thin VS Code `workspaceState` implementation for `sidelineCoach.playerSessions.v1`.
- `src/player-instances.ts` — controlled identity adoption and collision-safe monotonic seat allocation.
- `src/player-roster.ts` — synchronous controlled identity adoption, restoring/unavailable states, asynchronous independent restore, exact User-close semantics, and one crash recovery attempt.
- `src/controlled-player-presentation.ts` — read-only Resuming, same-conversation Ready, previous-Play outcome, and guidance output.
- `src/extension.ts` — storage/host/adapter/roster activation order.
- `src/server.ts` — HTTP 409 for restoring and unavailable controlled Players.
- `test/fixtures/fake-codex-app-server.mjs` — deterministic account/read, read, resume, history, writer-lock, version, authority, and cwd modes.
- `test/player-control-contract.test.mjs` — updated Stage 1.17 contract calls plus deterministic owned-child cleanup.
- `test/player-control-persistence.test.mjs` — Stage 1.18 P1–P28 conformance suite.
- `Diagnostics/CONTRACT.md` — binding-table and restore-truth ownership statement.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — implemented persistence/restore truth without claiming field proof.
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md` — Stage 1.19 automated completion and pending human proof.
- `REPORTS/Codex/Stage-1.19-Controlled-Player-Persistence-And-Resume-Implementation.md` — this report.

## WAS / IS / WILL BE

### WAS

The controlled Player's Sideline-to-provider binding was memory-only. Reload destroyed the association even though provider conversation history survived.

### IS

Per-Game `sidelineCoach.playerSessions.v1` records restore controlled identity at activation. Controlled bindings remain separate from legacy provenance. The VS Code-free Player Control Host owns the table through a storage port, reconstructs exact Sideline identity before provider I/O, and re-proves the provider capability through a fresh adapter channel before dispatch becomes available. Pending Plays are reconciled only from exact provider evidence and otherwise remain Unknown.

### WILL BE

The prescribed human test must prove two controlled instances retain exact seats, selection, and same-thread context through Developer: Reload Window, and that explicit User-close alone removes a binding. Only then may Stage 1.19 be marked FIELD-PROVEN. Certified non-Codex adapters remain future work.

## Persistent record and ownership

The host persists only:

```json
{
  "instanceId": "codex-7f3a91c2",
  "playerType": "codex",
  "seat": 2,
  "adapter": "codex-app-server",
  "sessionRef": "provider-thread-id",
  "historyExpected": true,
  "pendingPlay": {
    "clientRef": "host-minted-uuid",
    "turnRef": "optional-provider-turn-id"
  }
}
```

`pendingPlay` is `null` when no unresolved Play exists. The record contains no Play text, transcript, report content, tokens, credentials, auth material, model, effort, runtime version, label, PID, process/terminal handle, authority, or Game root.

`WorkspaceStateBindingStore` is the only VS Code-specific storage implementation. The host is the single writer and serializes awaited snapshot writes. Structural validation is per record; a malformed sibling is dropped independently. A non-array top level becomes an empty table. Duplicate instance or `(adapter, sessionRef)` claims are all quarantined before provider contact. Unregistered or type-incompatible adapters become Needs verification.

## Activation and restore lifecycle

Activation constructs the workspace store, host, and registered Codex adapter before constructing `PlayerRoster`. The roster first loads legacy provenance, then synchronously adopts every valid controlled Sideline identity and stored seat from `host.planRestores()`. It creates fresh transient read-only presentations in Resuming state without focusing them. CoachServer is constructed afterward.

Provider restores then run asynchronously and independently, with at most three concurrent restores. Each Ready/Needs-* result fires the existing roster change event, so the existing SSE/canonical-refresh route updates the open browser without browser-local restore state or manual refresh. Exact `instanceId` remains in the status projection while restoring, preserving exact browser selection.

Seat conflicts preserve identity and move only the later deterministic record to the next high-water seat. Restoring seats 1 and 3 makes the next new Codex seat 4.

## Codex resume implementation

Each restore creates one fresh owned `codex app-server` child over private stdio. It uses normal command discovery, removes `CODEX_API_KEY` from the child environment, reads no auth file, opens no port, and uses no terminal/PTY input.

The adapter performs:

1. `initialize` without experimental capabilities and an exact 0.154.0 certification gate.
2. `account/read { refreshToken: false }`.
3. Metadata-only `thread/read { threadId }` to verify exact session identity, non-ephemeral history, and captured Game cwd.
4. `thread/resume` with exact session ID, Game root, `approvalPolicy: "never"`, `sandbox: "danger-full-access"`, and `excludeTurns: true`.
5. Response validation of session ID, captured/effective cwd, authority, sandbox, and healthy thread status.
6. Pending-Play reconciliation through bounded `thread/turns/list` history pages.

The allowed provider requests are exactly `initialize`, `thread/start`, `turn/start`, `account/read`, `thread/read`, `thread/resume`, and `thread/turns/list`. No browser or host caller can supply arbitrary provider method names.

The installed runtime was reconfirmed as `codex-cli 0.154.0`, and its locally generated stable schema matched the Stage 1.18 evidence. Stage 1.18's live probe observed existing ChatGPT subscription authentication. This implementation rechecks that condition on every open and restore. Automated tests use only the fake provider; this stage performed no real provider turn and consumed no model usage.

## Auth gating

- `chatgpt` continues.
- no account becomes Needs sign-in before any thread request.
- `apiKey` or another non-ChatGPT account becomes Needs decision before any thread request.
- The binding is retained, and there is no fallback to legacy transport or silent API billing change.

## Missing conversation behavior

If Codex reports no rollout and `historyExpected` is false, the adapter opens a fresh controlled thread, the host atomically replaces `sessionRef`, and presentation explains that no Plays had been sent and Coach opened a new conversation. If `historyExpected` is true, the Player stays present as Needs decision and the original binding remains unchanged. No fresh thread is silently substituted.

## Write-ahead and exactly-once behavior

Before every controlled SEND, the host mints the correlation UUID and awaits persistence of `historyExpected: true` plus `pendingPlay.clientRef`. Only then may the adapter invoke one semantic `turn/start`. A failed write refuses with “Coach couldn't record this Play safely,” and zero provider turns occur.

Provider acknowledgement adds `turnRef`. Completed, failed, or interrupted lifecycle evidence clears `pendingPlay`. A channel/pipe failure after possible ingress returns Unknown and retains the marker. Restore and reconciliation contain no `turn/start`; no old Play is resent. The existing single bounded retry remains restricted to provider `-32001`, which proves ingress rejection.

## Outcome reconciliation

Reconciliation searches only the stored exact `turnRef`, or—when absent—a user message whose `clientId` exactly equals the stored `clientRef`. Completed, failed, and interrupted outcomes clear the marker. In-progress, absent, or insufficient evidence produces Unknown and retains it. It never guesses from newest turn, recency, text, elapsed time, or successful resume. Pagination is bounded to three ten-turn pages; evidence outside that bound safely remains Unknown.

## Busy, crash, and failure behavior

A currently active control refuses a new SEND as busy; nothing is queued or steered. A resumed thread reporting active remains internally busy. Contradictory cwd, session, authority, sandbox, version, or ownership vetoes Ready and sends zero Plays.

An unexpected owned provider-channel exit keeps the Sideline binding and presentation, changes it to Resuming, and makes one automatic channel/session restore attempt. Failure becomes Needs decision; there is no respawn loop, Play retry, sibling redirect, fresh-thread substitution, or legacy fallback. Restore-time persistence failures close the newly spawned owned child.

## Leave Field semantics

Only `terminal.exitStatus?.reason === vscode.TerminalExitReason.User` enters controlled Leave Field. The roster marks the binding as leaving, closes only its owned provider channel, awaits binding removal, then retires the Sideline identity and fires roster change. Shutdown, Extension, Unknown, deactivation, provider crash, and ordinary VS Code close preserve the record. Provider history is never deleted; `thread/delete` is not allowed.

## Presentation and browser behavior

The restored Pseudoterminal is transient, read-only, and presentation-only. It announces the controlled identity, Resuming state, same-conversation Ready state, runtime/model/effort observations, and one reconciled previous-Play outcome where applicable. It does not replay transcripts and is not focused automatically. Typing continues to instruct the human to send Plays through Coach.

Controlled runtime projections expose `controlState` and `stateMessage`. Restoring and Needs-* Players stay in the canonical roster with their exact IDs; dispatch returns HTTP 409 until Ready. Roster changes continue through PlayerRoster → CoachServer SSE → canonical browser refresh. No browser-local identity or restore logic was added.

## Legacy path preservation

The legacy Player provenance key, terminal adoption funnel, instance route, unique terminal-name compatibility route, and `Terminal.sendText()` implementation remain present. Controlled/legacy routing still comes from authoritative roster/control binding state, never labels or terminal names. Reports, Incoming, report watchers, ports, and browser reconnection architecture were not changed.

## P1–P28 automated result table

```text
ID   RESULT  PROOF
P1   PASS    Successful open writes one exact minimal binding.
P2   PASS    Explicit Leave Field removes one binding.
P3   PASS    Host disposal preserves it; source contract admits only User exit.
P4   PASS    Restore plan/adoption retains exact instanceId.
P5   PASS    Exact stored sessionRef is sent to thread/read and thread/resume.
P6   PASS    Restore spawns a fresh fake provider process/control.
P7   PASS    Existing history uses thread/resume and zero thread/start.
P8   PASS    Cwd/authority contradictions veto and send zero Plays.
P9   PASS    Missing-thread historyExpected false/true branches match the contract.
P10  PASS    Duplicate identity/session claimants are quarantined before contact.
P11  PASS    Three controlled Players restore independently.
P12  PASS    One failed restore leaves both healthy siblings Ready.
P13  PASS    Stored seats restore; only a later collision moves.
P14  PASS    Restored seats 1 + 3 allocate the next Codex at seat 4.
P15  PASS    Restoring and unavailable resolution maps to HTTP 409/no delivery.
P16  PASS    Canonical state and events cover Resuming → Ready; crash uses one restore.
P17  PASS    Restore/reconciliation logs contain zero turn/start.
P18  PASS    Acknowledgement loss persists Unknown and performs no resend.
P19  PASS    Reconciliation matches exact turnRef/clientRef, never text/recency.
P20  PASS    clientRef write precedes turn/start; turnRef follows; definite outcome clears.
P21  PASS    Failed write-ahead produces zero provider deliveries.
P22  PASS    Writer-busy retry is bounded, then becomes Needs decision.
P23  PASS    Uncertified version stops before thread calls and retains the binding.
P24  PASS    ChatGPT/API-key/logged-out gates apply on both open and restore.
P25  PASS    Malformed records are dropped individually; healthy siblings remain.
P26  PASS    Request allowlist is exactly the seven required stable methods.
P27  PASS    Host, binding planner/store port, and Codex adapter import no vscode.
P28  PASS    Every fake provider child owned by the persistence suite exited.
```

## Automated verification

```text
npm run check       PASS
npm run compile     PASS
npm test            PASS — 56 passed, 0 failed
git diff --check    PASS (line-ending notices only; no whitespace errors)
npm run diagnostics COMPLETED — build current
```

Diagnostics retained the two pre-existing unrelated conditions: A6 reports configured port 49152 in the OS ephemeral range, and A5 reports a duplicate repository copy under the parent directory. No diagnostic collector or corrective action was added.

## Diagnostic Impact

YES, contract-only. `Diagnostics/CONTRACT.md` now records that Player Control Host owns the per-Game controlled-binding table and controlled transport/restore truth. Diagnostics may observe that truth but never restore, resend, repair, delete, or mutate it. External preflight cannot inspect VS Code `workspaceState`, so that evidence remains externally Unknown.

## Breadcrumb Impact

YES. Architecture and master-roadmap breadcrumbs now move persistence/resume implementation and P1–P28 automated proof into IS, preserve memory-only binding in WAS, and keep the two-Player reload/context check in WILL BE. They do not claim human field proof.

## Deviations from Stage 1.18

None material. Restore-history pagination is explicitly bounded to three pages (30 turns); failure to find exact evidence within that bound becomes Unknown, preserving the required safety invariant.

## Remaining known unknowns

- No live Developer: Reload Window field test was performed in this implementation environment.
- Same-thread Codex context after actual extension reload remains human-verification pending.
- Actual controlled-tab exit reason during the prescribed Developer Reload sequence remains part of that field proof; implementation accepts only `TerminalExitReason.User` as Leave Field.
- The current external diagnostic preflight cannot see the workspaceState binding table by design.
- Provider evidence beyond the bounded 30-turn reconciliation window remains Unknown rather than guessed.

## Human field-test readiness

No human field test was performed or requested during implementation. The implementation is ready for the exact approved sequence:

1. Put two controlled Codex Players on field.
2. Send the `MARIGOLD-17` memory Play to Codex 2 and let it complete.
3. Run Developer: Reload Window without refreshing the browser.
4. Confirm both exact seats return, Codex 2 stays selected, and Codex 2 recalls the code word.
5. Manually close controlled seat 1, reload again, and confirm seat 1 stays gone while Codex 2 returns.

## Recommended next Play

Review this report, then run only the approved two-controlled-Codex reload/context/Leave-Field field test; if it passes, record Stage 1.19 as FIELD-PROVEN before Stage 1 closure.

REPORT NAME: Stage-1.19-Controlled-Player-Persistence-And-Resume-Implementation.md  
STAGE: Stage 1.19  
WHAT IT IS: Controlled Player Persistence + Safe Resume Implementation  
TIMESTAMP: 2026-09-11 08:30:26 MDT
