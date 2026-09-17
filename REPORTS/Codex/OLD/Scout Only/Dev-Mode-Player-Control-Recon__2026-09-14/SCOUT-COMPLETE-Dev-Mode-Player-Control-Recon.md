REPORT TYPE: CONSOLIDATED SCOUT REPORT
SOURCE REPORTS:
- SCOUT-A-Live-Player-Identity-And-Dev-Projection.md
- SCOUT-B-Pause-Checkpoint-Resume-And-Session-Preservation.md
- SCOUT-C-Capacity-Eligibility-Auto-Bench-And-Future-Scheduling.md
CONSOLIDATED BY: Codex
REPORT TIMESTAMP: 2026-09-14 18:17:34 -06:00 (America/Edmonton)

# Dev Mode Player Control Recon - Complete Scout Synthesis

## Executive Terrain Map

Sideline already has the important internal boundaries needed for a future Dev Mode Player-control surface:

- stable Player identity is exact and opaque: `playerInstanceId`;
- human Player names are mutable presentation;
- active execution truth is canonical and exact-instance keyed;
- dispatch routing already knows provider/model/effort when Sideline can truthfully know them;
- controlled session preservation is provider-specific and already safer than the UI currently exposes;
- capacity/eligibility is partly modeled, but provider quota/capacity is not yet a first-class evidence type.

The combined Scout conclusion is:

NEEDS ARCHITECTURE

Reason: the source has enough seams to implement Dev Mode projection, checkpoint/resume verbs, and capacity-aware eligibility, but the product vocabulary and precedence rules are not yet frozen. Implementing directly would risk exposing machinery, overpromising provider control, or confusing Player identity with active execution detail.

## One-Page Synthesis

FACT:
Sideline must keep two truths separate:

- `Claude 1`, `Codex`, `AntiGravity 1`: stable human-facing Player identity for a current roster.
- `Sonnet · Medium`, `Opus · High`, `Codex · GPT-5.5 · Low`: active execution detail for a current or recent Play.

INFERENCE:
The clean future shape is not to rename Players. It is to project optional Dev Mode execution detail beside or inside the live Player strip, sourced from canonical execution/dispatch truth.

FACT:
There is no universal "Pause" capability today. Claude and AntiGravity can be interrupted only by hard process kill of the current per-Play child process. Codex has no implemented `interrupt()` at all. Terminal Players have no reasoning/provider protocol and no pause/checkpoint semantics.

FACT:
Sideline separates roster presence from dispatch eligibility. Benching is reversible and exact-instance based, but provider capacity/quota is not yet modeled. Current `ready | busy | unavailable | needs-verification` does not have enough vocabulary for "limit reached until reset time."

ARCHITECT DECISION REQUIRED:
The next architecture pass should define one Dev Mode control model across three areas:

1. execution identity display;
2. checkpoint / stop / resume semantics;
3. capacity / eligibility / scheduling semantics.

## WAS / IS / WILL BE

## WAS

Stable identity, live execution, provider routing, terminal ownership, reports, queueing, and Dad-mode projection were built across many slices. Earlier stages proved that names cannot be identity, Unknown must stay Unknown, and human-facing state must not mirror every internal machine fact.

Older implementation left several future questions open:

- Should live UI show Player identity, model identity, or both?
- Can Coach pause a Player?
- What does "session preserved" actually mean?
- Should a capacity-limited Player be hidden, benched, disabled, queued, or scheduled?

## IS

Stable Player identity is strong:

- `PlayerInstanceBook` creates and tracks exact opaque instance records.
- `PlayerRoster` owns live roster state and controlled/terminal bindings.
- `friendlyInstanceNames()` projects current contiguous human labels without mutating identity.
- Browser roster rows, dispatch attempts, execution views, queue records, and report acknowledgements key by exact instance.

Execution truth is strong:

- `InstanceWorkLedger` records current and recent Play metadata.
- `ExecutionView` projects exact-instance active state, summary, timer origin, queue state, report link, and execution type.
- Browser `executionStore` merges status snapshots and execution SSE through epoch/revision rules.

Routing truth is partially enough for Dev Mode:

- `RoutingDecision` separates provider, model, display name, and effort.
- `ControlPlaneRouter.dispatch()` records selected `model` and `effort` into the Work Ledger.
- Controlled report provenance records provider/model/effort when known, or `provider-default` when not.

Provider control truth is mixed:

- Claude and AntiGravity use one child process per Play and support hard interrupt.
- Codex uses a long-lived app-server/thread model and has no current interrupt implementation.
- Terminal uses VS Code terminal/shell command observation and captures exit code, not output text.

Capacity truth is not first-class:

- Capability snapshots know auth/model/freshness, not quota/reset/capacity.
- Provider errors can surface as text, failed turns, refused delivery, or Unknown, but not typed provider-capacity evidence.

## WILL BE

Future Dev Mode can expose more observability without changing Dad Mode:

- active execution label modes: Player identity / Model / Full identity;
- exact Player session controls: checkpoint, stop, resume, preserve session, where truthful per provider;
- capacity/eligibility overlays with provenance and expiry;
- future scheduling that rechecks eligibility at execution time.

These should remain advanced/Dev Mode by default. Dad Mode should continue to ask simple human questions and hide plumbing unless the human decision genuinely depends on it.

## Combined Evidence Map

## A. Live Player Identity + Dev Mode Execution Projection

FACT:
Stable identity lives in `src/player-instances.ts` and `src/player-roster.ts`.

Key seams:

- `PlayerInstanceRecord.instanceId`
- `PlayerInstanceProjection.instanceId`
- `PlayerRoster` workspace provenance for terminal/adopted process proof
- `PlayerRoster.displayLabel()`
- `friendlyInstanceNames()` in `src/player-display-labels.ts`

FACT:
Provider/model/effort are known at dispatch when routing resolves them.

Key seams:

- `PlayerRoutingCapability.activeModel`
- `PlayerRoutingCapability.activeEffort`
- `RoutingDecision.provider`
- `RoutingDecision.model`
- `RoutingDecision.modelDisplayName`
- `RoutingDecision.effort`
- `ControlPlaneRouter.dispatch()`
- `InstanceWorkLedger.recordDispatch()`

FACT:
The Work Ledger already carries `model` and `effort` on:

- `LedgerPlay`
- `LedgerRecentPlay`
- `DispatchRecord`

FACT:
`ExecutionView` does not currently include provider/model/effort. It includes:

- `instanceId`
- `state`
- `revision`
- `playRef`
- `summary`
- `executionStartedAt`
- `finishedAt`
- `durationMs`
- `report`
- `queue`
- `detail`
- `executionType`

INFERENCE:
The smallest implementation seam for active Dev Mode label projection is optional provider/model/effort fields in `ExecutionView`, sourced from `entry.currentPlay`, or a parallel `devExecution` projection keyed by exact instance.

CONTRADICTION:
The Work Ledger carries active/current model/effort, but `ExecutionView` omits them. This is a projection gap, not a canonical-data gap.

UNKNOWN:
`activeModel` and `activeEffort` from provider controls may mean "current provider control state," not necessarily "the actual model that executed this Play." Work Ledger dispatch facts are stronger for "what Sideline sent."

ARCHITECT DECISION REQUIRED:
Define active execution display precedence:

1. Work Ledger current Play model/effort as "what Coach sent."
2. RoutingDecision/dispatchAttempt only as pending/latest-attempt bridge.
3. Capability `activeModel/activeEffort` only if defined as live provider state and not conflicting.
4. Report provenance only as completed/report context, not active execution truth.

## B. Pause, Checkpoint, Resume, Session Preservation

FACT:
There are three structurally different control transports:

- Codex: long-lived `codex app-server`, JSON-RPC over stdio, persistent thread.
- Claude / AntiGravity Controlled: one child process per Play, stream JSON over stdin/stdout.
- Terminal: VS Code terminal/shell object, not a reasoning provider.

FACT:
There is no OS-level pause/resume anywhere in the current implementation.

FACT:
Claude and AntiGravity `interrupt()` means hard process-tree termination of the current child process. It is not a cooperative safe-stop.

FACT:
Codex does not implement `interrupt()` in the current control path. Stopping Codex today means closing/killing the app-server process, which has broader blast radius than interrupting a single Claude/AntiGravity Play.

FACT:
Terminal cannot be checkpointed or paused as a reasoning Player. Coach can send shell text and, with shell integration, observe command end/exit code. It does not read arbitrary terminal output text.

FACT:
Controlled provider session identity is persisted:

- Claude session id / AntiGravity conversation id / Codex thread id
- `ControlledBindingRecord`
- VS Code `workspaceState`
- `historyExpected`
- restore planning with present/missing/unknown semantics

FACT:
On-screen event history is not durable. Event history is capped/in-memory and can disappear on Stadium restart even if provider conversation/session is preserved.

INFERENCE:
A future "Checkpoint" action can be built as a reserved Play delivered through the normal `deliver()` path, asking the Player to write a checkpoint/report. That is not currently a distinct protocol verb.

CONTRADICTION:
"Session preserved" is true for provider conversation identity but false for guaranteed visible transcript continuity. Product language must distinguish those.

ARCHITECT DECISION REQUIRED:
Do not expose one uniform "Pause" button unless its provider-specific meaning is clear. Today:

- Claude/AntiGravity: hard stop current Play, partial changes possible.
- Codex: no current per-turn interrupt.
- Terminal: not applicable, except terminal close/removal.

ARCHITECT DECISION REQUIRED:
Decide whether checkpoint output can be generated automatically from provider event/progress streams. Controlled event streams can include command/tool summaries; there is no broad redaction layer identified in Scout B.

## C. Capacity, Eligibility, Auto-Bench, Future Scheduling

FACT:
Roster membership and routing eligibility are already separate.

Roster identity:

- exact instance records;
- `onField`;
- ownership;
- bench/remove distinction.

Routing eligibility:

- `PlayerRoutingCapability.state`;
- `transport`;
- provider capability snapshot;
- active turn evidence;
- execution type.

FACT:
Benched Players are retained and returnable but omitted from `getRoutingCapabilities()`.

FACT:
AUTO filters routing candidates:

- Terminal/direct-shell excluded;
- unavailable/needs-verification excluded;
- busy can remain in the candidate set for queue/context owner decisions;
- immediate dispatch needs ready controlled candidate with usable model capability.

FACT:
Provider capability snapshots currently include:

- provider;
- authenticated;
- account/plan where available;
- model catalog;
- observedAt;
- freshness.

They do not include quota, reset time, retry time, rate limit, or capacity-block reason.

INFERENCE:
Capacity-blocked is not the same as busy. Busy means current work or queue-for-owner context. Capacity-blocked means "cannot start now due provider/account state." It needs a separate reason and expiry.

CONTRADICTION:
The field phrase "On Bench / Limit reached" implies machine-derived benching, while current Bench semantics are human/reversible field participation. Mutating `onField` for provider capacity would blur human intent with machine observation unless architecture explicitly introduces machine-derived temporary benching.

ARCHITECT DECISION REQUIRED:
Decide the home for capacity evidence:

- provider snapshot;
- per-instance routing capability;
- separate evidence ledger overlay;
- or combined provider-wide evidence fanned out to affected Players.

ARCHITECT DECISION REQUIRED:
Define whether capacity-blocked Players stay On Field but unavailable, or move to a machine-derived bench state. The North Star favors preserving human intent and making the machine carry the nuance.

ARCHITECT DECISION REQUIRED:
Future Scheduling needs a separate "eligible later" rule. Current unavailability must be rechecked at execution time and must not become permanent truth.

## Existing Implementation Inventory

Already implemented:

- exact opaque Player instance identity;
- current-roster contiguous labels;
- exact target dispatch result identity;
- provider/model/effort routing decisions;
- Work Ledger current/recent Play model/effort;
- exact active execution view and timer;
- controlled report provenance;
- session restore/preservation for controlled providers;
- queue-for-owner and exact instance queue;
- Dad-mode suppression of historical execution scars;
- terminal direct-shell distinction;
- bench versus remove semantics.

Not implemented:

- Dev Mode execution label mode;
- model/effort fields in active `ExecutionView`;
- universal pause;
- cooperative pause-after-step;
- Codex per-turn interrupt;
- first-class checkpoint verb;
- durable visible transcript preservation;
- typed provider capacity evidence;
- quota/reset/retry parsing;
- auto-bench due capacity;
- scheduling eligibility recheck rules.

## Presentation Work vs Architecture Work

Mostly presentation work once architecture decides:

- rendering `Claude 1 · Sonnet · Medium`;
- rendering `Sonnet · Medium`;
- showing active model/effort in a Dev Mode strip variant;
- adding toggle labels such as Player identity / Model / Full identity.

Architecture required before implementation:

- field precedence when Ledger, capability, dispatchAttempt, and provenance disagree;
- vocabulary for provider-default/unknown;
- pause/checkpoint/stop verbs per provider;
- capacity evidence type, confidence, expiry, and UI impact;
- whether machine capacity can alter On Field/Bench state.

## Unknowns

UNKNOWN:
Provider adapters were not fully probed live. Current source shows the available seams, but not every provider's real behavior under capacity, interruption, or default-model execution.

UNKNOWN:
Whether provider CLIs expose actual model after a provider-default run.

UNKNOWN:
Whether interrupted Claude/AntiGravity sessions are always safe to resume immediately at the provider level.

UNKNOWN:
Whether Codex app-server has a cancel/interrupt RPC that Coach does not currently use.

UNKNOWN:
Whether future report/checkpoint persistence should store provider event streams, and if so what redaction is required.

UNKNOWN:
What precise product wording the human wants for a capacity-limited but otherwise healthy Player.

## Contradictions

CONTRADICTION:
`ExecutionView` is canonical for browser live execution, but omits model/effort. Work Ledger has them. Future Dev Mode needs a projection correction.

CONTRADICTION:
Capability `activeModel/activeEffort` and Work Ledger `currentPlay.model/effort` could disagree. The source currently does not define display precedence.

CONTRADICTION:
`PlayerControl.interrupt?()` exists as an optional contract, but provider support is uneven: hard-kill for Claude/AntiGravity, absent for Codex, inapplicable for Terminal.

CONTRADICTION:
"Session preserved" can mean provider conversation preserved while visible transcript is not preserved.

CONTRADICTION:
"On Bench / Limit reached" sounds simple, but current Bench semantics are human field participation, not machine capacity evidence.

## Architect Decisions Required

1. Dev Mode active label policy:
   Player identity, Model, Full identity, or selectable modes.

2. Dev Mode field precedence:
   Work Ledger vs capability vs dispatch attempt vs report provenance.

3. Unknown/default vocabulary:
   Provider Default, Unknown, hidden, or provider-managed.

4. Execution projection location:
   optional fields in `ExecutionView` vs separate `devExecution` projection.

5. Pause vocabulary:
   Stop current Play, interrupt, checkpoint, preserve session, close Player, and queue pause must be distinct.

6. Codex interrupt:
   find/implement a provider-native cancel if available, or state clearly that Codex cannot stop one turn without closing broader control.

7. Checkpoint contract:
   ordinary Play convention vs first-class verb with its own lifecycle/report expectation.

8. Event/progress persistence:
   whether provider event streams may become durable, and what redaction/approval is required.

9. Capacity evidence model:
   provider-wide, exact-instance, separate ledger, or overlay.

10. Capacity UX:
   disabled target, on-field unavailable, auto-bench, schedule-only, or warning/override.

11. Scheduling:
   current eligibility versus future eligibility and recheck-at-run semantics.

## Recommended Architecture Route

Recommended route:

1. Architecture: "Dev Mode Player Control Projection."
   Define exact UI vocabulary and source precedence for active provider/model/effort display.

2. Architecture: "Provider Control Verbs."
   Define truthful verbs per provider:
   - Checkpoint
   - Stop current Play
   - Resume same session
   - Preserve visible history
   - Close Player

3. Architecture: "Capacity Evidence and Dispatch Eligibility Overlay."
   Define capacity evidence, expiry, UI state, manual override, and future scheduling recheck.

4. Implementation Slice A:
   Add optional Dev Mode execution projection fields keyed by exact instance.

5. Implementation Slice B:
   Add Dev Mode presentation without changing Dad Mode labels or routing.

6. Implementation Slice C:
   Add capacity evidence model only after architecture freezes the provider/state vocabulary.

## Scout Limitations

This synthesis combines three temporary Scout reports. It does not rerun provider probes, compile, or test. It preserves the original Scout files untouched.

The source Scouts had different depths:

- Scout A: standard depth, focused on identity/projection.
- Scout B: deep provider-control reconnaissance.
- Scout C: standard depth, focused on capacity/eligibility.

This document is a synthesis, not a substitute for exact implementation design.

## Coverage

Fully covered:

- stable Player identity;
- display label projection;
- dispatch model/effort recording;
- execution projection shape;
- current browser strip rendering;
- provider transport differences;
- session preservation concepts;
- roster/bench eligibility split.

Partially covered:

- provider adapter internals;
- Codex app-server full protocol;
- durable transcript/report storage implications;
- detailed browser helper internals;
- real provider capacity behavior.

Not investigated:

- live provider CLI behavior;
- external Codex protocol references;
- live AntiGravity quota behavior;
- future Settings/Dev Mode UI implementation;
- actual scheduling implementation.

## Final Recommendation

NEEDS ARCHITECTURE

The system already has the right bones. The next mistake to avoid is exposing those bones as UI. Architecture should define the few customer-facing meanings first, then implementation can project existing truth cleanly.

Stable identity remains:

`playerInstanceId`

Human identity remains:

`Claude 1`, `Codex`, `AntiGravity 1`

Active Dev Mode execution detail may become:

`Sonnet · Medium`, `Opus · High`, `Codex · GPT-5.5 · Low`

But that detail must never become the Player's identity.

REPORT: SCOUT-COMPLETE-Dev-Mode-Player-Control-Recon.md
TIMESTAMP: 2026-09-14 18:17:34 -06:00 (America/Edmonton)
