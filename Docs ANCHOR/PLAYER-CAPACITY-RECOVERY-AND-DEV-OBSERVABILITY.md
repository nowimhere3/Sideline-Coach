# Player Capacity Recovery + Dev Observability Breadcrumb

**Status:** WILL BE — high-priority first-class product capability, promoted by live field evidence on 2026-09-19.

**Field source:** real Sideline dogfooding in a newly added Game. A Coach-controlled Claude Play was actively working, Claude hit its provider/session usage limit, and the Working card disappeared. The provider output truthfully said the session limit had been reached and supplied a reset time, but Sideline did not preserve the active Play as an actionable human state.

This is not primarily a CONSERVE feature. Provider limits are normal operating conditions in any routing mode. A product intended to become the user's daily software-building interface must expect Players to hit 5-hour, weekly, account, quota, auth, permission, rate-limit, outage, and other recoverable execution boundaries.

## Core invariant

> **A Player running out of capacity must never make the Play disappear.**

The Play, exact Player/session context, known progress, relevant output, reason for stopping, and available recovery choices remain visible until the human or routing policy resolves them.

A provider/session limit is a recoverable **Needs Attention** state, not completed work, not lost work, and not generic Player failure.

## WAS

- A controlled Player could be visibly Working and then hit a provider/session usage limit.
- The provider process terminated with useful evidence, including the reason and reset time.
- The Player's Working card could disappear instead of becoming an actionable blocked state.
- A human away from the development machine could be stranded even though Sideline had enough information to explain what happened.
- Recovery depended on provider-terminal knowledge and physical access rather than Coach-owned workflow.
- Devs could see pieces of provider/terminal plumbing in VS Code, but Sideline did not offer one exact-Player observability surface that worked regardless of transport.

## IS

- Provider capacity is already conceptually separate from work state, context ownership, model capability, and routing preference.
- Sideline already has a durable queue, exact Player identity, context handoff rules, routing precedence, controlled-provider lifecycle evidence, and an AI Usage scorecard direction.
- Controlled Claude/AntiGravity use structured subprocess transports; Codex may use app-server transport; Terminal Players use terminal transport. The human-facing recovery contract must not depend on which mechanism sits underneath.
- Human explicit routing intent remains higher authority than automatic fallback.

## WILL BE — first-class limit recovery

When an active Play encounters a trustworthy recoverable capacity boundary, Sideline preserves the Play and turns the exact Player's execution strip/card into a clear actionable state, conceptually:

```text
Claude needs attention
Usage limit reached
Available again around 5:00 PM

[ Run after reset ]
[ Give to next best Player ]
[ Choose Player ]
[ Wait ]
```

Exact wording/UI is future design work. The contract is not.

### Required behavior

1. **Preserve the Play.** Never erase the live task reminder, exact Player identity, session/thread binding, known report/context references, or relevant execution evidence merely because the provider stopped.
2. **Classify the blocker truthfully.** Examples include provider/session limit, weekly limit, rate limit, authentication required, permission required, provider outage, quota exhausted, or Unknown. Infrastructure/capacity failure must not decrement Player-quality evidence.
3. **Needs Attention means current actionable work.** Historical failed/unknown records remain quiet. The card appears because a current Play is blocked and a human choice or future condition matters.
4. **Remote-first recovery.** A human using Sideline away from the Stadium must be able to understand and resolve the situation without physically opening the provider's native terminal.
5. **No silent reroute against human intent.** If the Play explicitly constrained Claude, Sideline cannot secretly give it to Codex. It may offer to relax that constraint, or follow an already-authorized fallback policy.

## Run after reset / conditional continuation

"Run after reset" is durable Coach behavior, not a browser timer.

- Reuse/extend the existing durable Play queue rather than inventing a second scheduler.
- Store the earliest trustworthy retry time/condition, exact preferred Player where relevant, context/report references, route constraints, fallback policy, and reason.
- A reset time is an earliest retry point, not proof of availability.
- At release, revalidate Game connectivity, Player membership/eligibility, exact session/context continuity, provider capacity, model availability, collisions, human cancellation, and current routing policy.
- A small post-reset buffer may be policy/configuration. It is not architecture.
- Closing the browser must not cancel a queued retry.

The desired human promise is simple:

> **"Claude ran out. Send this when Claude is available again."**

Dad chooses the intent. Sideline carries the clock, state, and revalidation.

## Give to next best Player

This is available in normal AUTO operation, not only CONSERVE.

Coach evaluates current context ownership, handoff cost, task capability, exact Player availability, models/effort, provider capacity, and human constraints. If the human authorizes rerouting, Coach creates a safe handoff package and dispatches through the normal exact-instance routing contract.

CONSERVE later adds resource-protection preference to the same machinery. It does not own the existence of recovery itself.

## Capacity and AI Usage

Capacity remains its own routing dimension:

- 5-hour window
- weekly window
- provider/account-specific pools
- reset time when trustworthy
- paid/credit capacity only when explicitly enabled and understood
- Unknown when evidence is insufficient

The future AI Usage scorecard should feed this state so Coach can distinguish, for example, "Claude temporarily empty but weekly-rich" from "Codex immediately available but weekly-scarce."

**Today's model hierarchy is a prior, not a law. Performance means outcome quality AND resources required.**

## Dev Mode — Under the Hood / Execution Console

Dev Mode will expose an exact-Player execution view so developers can see what Sideline is actually doing without making Dad Mode noisy.

This is broader than "show a terminal." Different Players use different transports. The stable product concept is **Execution Console / Under the Hood** over a provider-neutral event/output stream.

For the selected exact `playerInstanceId`, show the relevant live evidence Sideline owns, such as:

- transport/process lifecycle;
- sanitized command/invocation shape;
- provider session/thread/conversation identity where safe;
- model/effort selected;
- structured progress events;
- terminal command/output when the Player is actually terminal-backed;
- controlled subprocess stdout/stderr;
- app-server/provider events;
- exit code / termination reason;
- provider-limit/reset evidence;
- git/push/test failures when they are part of the Player's execution.

Secrets, tokens, credentials, sensitive environment values, and other protected data remain redacted. Dev Mode reveals observability, not authority bypass.

### Exact-instance invariant

> **Claude 1's console can never show Claude 2's execution.**

The view is keyed by Game + exact `playerInstanceId` + execution/session identity, never terminal display name.

### Live and post-stop evidence

- Maintain a bounded rolling execution buffer while a Play runs.
- When a Player terminates unexpectedly or hits a limit, preserve a bounded snapshot long enough for diagnosis/recovery instead of losing the last useful evidence with the process.
- Dad Mode sees only the actionable summary. Dev Mode can open the detailed evidence.

## Copy execution output

The Execution Console should provide at least two explicit copy modes:

1. **Copy all** — copy the currently retained execution/session transcript/evidence.
2. **Copy since last copy** — copy only output/events after the user's previous copy point for that exact execution/session.

"Copy since last copy" should smart-remember its cursor per exact Player/session and make repeated debugging handoffs cheap. A new session/execution must never accidentally reuse a stale cursor from another one. The UI should make the range obvious before/after copying.

Copy is always explicit. Sideline never places terminal/provider output on the clipboard automatically because execution output may contain sensitive project information.

This supports the real developer loop: copy the first chunk to a Coach/Architect, let the Player continue, then copy only what happened since the last handoff rather than repeatedly shipping the entire console.

## Product boundary

Dad Mode remains calm:

> `Claude needs attention · usage limit reached`

Dev Mode can answer:

> What command/process/session was running? What did it output? Where did it stop? What changed since I last copied the console?

The same underlying truth feeds both surfaces. Dad Mode summarizes. Dev Mode exposes.

## Priority

This is **not implemented by this breadcrumb** and should not interrupt the current Scout / V1 sequence merely because it was discovered today.

It is, however, promoted to a **near-term first-class product capability** rather than a distant CONSERVE-only enhancement because live dogfooding proved that provider limits can otherwise strand remote users and make active work appear to vanish.

## North-star acceptance cases

1. Claude reaches a 5-hour limit during a Play. The card remains, becomes Needs Attention, explains why, and offers recovery.
2. Human chooses **Run after reset**, closes the browser, and Sideline retries only after the condition/time and full route revalidation.
3. Human chooses **Give to next best Player**, Coach preserves context and reroutes only after authorization.
4. Human is away from the Stadium and can perform either recovery from Sideline.
5. Provider capacity failure does not count as poor Player performance.
6. Dev Mode opens the exact Player's Execution Console and shows the sanitized evidence that produced the blocker.
7. Developer copies the full console once, later chooses **Copy since last copy**, and receives only new evidence from the same exact session.
8. A new Player/session never inherits another session's copy cursor or output.
9. Secret material remains redacted in both live view and copied output.
10. No routing mode, including normal AUTO, allows active work to disappear merely because a provider limit was reached.

**WAS:** provider capacity could terminate a working Player and strand the human outside Sideline.

**IS:** field evidence has promoted capacity recovery and execution observability into explicit product requirements built on the existing queue, routing, Ledger, capacity, and exact-instance seams.

**WHY:** provider limits are expected at scale, remote operation is a core product promise, and Sideline must remain the usable control surface precisely when upstream tools stop being convenient.

**WILL BE:** preserved Needs Attention execution state → truthful reason/reset evidence → Wait / durable retry / authorized reroute choices → capacity-aware AUTO/CONSERVE → exact-Player Dev Execution Console → bounded live/post-stop evidence → Copy all / Copy since last copy.
