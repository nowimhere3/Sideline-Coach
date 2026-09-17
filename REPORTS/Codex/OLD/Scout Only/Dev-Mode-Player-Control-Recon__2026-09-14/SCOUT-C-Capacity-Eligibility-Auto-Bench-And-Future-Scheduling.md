REPORT TYPE: SCOUT REPORT
SCOUT: Codex / GPT-5.5 / Low
RECONNAISSANCE DEPTH: Standard

# SCOUT-C Capacity Eligibility Auto-Bench And Future Scheduling

Calgary timestamp at write: 2026-09-14 18:14 MDT
Repository: `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
Scope: Read-only reconnaissance, except this temporary Scout artifact.

## Executive terrain map

FACT:
Sideline currently separates roster membership from routing eligibility in two places:

- Roster identity lives in `PlayerInstanceBook` records with exact opaque `instanceId`, `playerType`, `seat`, `ownership`, and `onField`. Source seam: `src/player-instances.ts:4`, `src/player-instances.ts:13`, `src/player-instances.ts:83`, `src/player-instances.ts:132`.
- Routing eligibility is projected separately as `PlayerRoutingCapability` with `state: ready | busy | unavailable | needs-verification`, `transport`, `capability`, and optional `activeTurn`. Source seam: `src/capability-types.ts:23`, `src/capability-types.ts:33`, `src/capability-types.ts:34`, `src/capability-types.ts:39`.
- Benched Players are retained and returnable but omitted from `getRoutingCapabilities()`. Source seam: `src/player-roster.ts:1172`, `src/player-roster.ts:1173`.
- AUTO filters on the routing projection, not the grouped roster cards. Source seam: `src/control-plane/router.ts:166`, `src/routing-policy.ts:240`, `src/routing-policy.ts:288`, `src/routing-policy.ts:294`.

INFERENCE:
The cleanest current seam for "capacity-blocked now" is not destructive roster removal. It is either an extension of routing capability state/reason/provenance or a parallel eligibility overlay applied before immediate dispatch. The existing architecture already treats "on roster/on field" and "can accept work now" as different concepts, but the current type vocabulary lacks a provider-capacity reason and expiry.

UNKNOWN:
There is no observed durable or structured capacity model for usage limit, quota, reset time, or retry-at. Current provider capability snapshots know authentication, models, observation time, and freshness only.

ARCHITECT DECISION REQUIRED:
Decide whether provider capacity is:

- provider-wide state attached to `ProviderCapabilitySnapshot`;
- per-player-instance eligibility attached to `PlayerRoutingCapability`;
- a separate evidence ledger overlay consumed by routing/UI;
- or a combination, with provider evidence fanning out to affected instances.

Recommended label: NEEDS ARCHITECTURE.

## Current eligibility/routing state machine

FACT:
Current dispatch flow:

1. Browser posts `/api/dispatch`.
2. Control Plane router validates Game/Stadium authority.
3. AUTO reads `session.capabilities` as canonical flat `PlayerRoutingCapability[]`, refuses while roster is unsynchronized, then computes route.
4. MANUAL keeps the human-chosen `playerInstanceId`; Coach Auto model/effort resolves only for that exact instance.
5. The router may queue instead of dispatch when AUTO selected `action: queue`, or MANUAL uses `whenBusy: queue` for a busy controlled non-terminal target.
6. Otherwise it sends `dispatch.request` to the authoritative Stadium and waits for `dispatch.accepted` / `dispatch.rejected` / timeout.

Source seams: `src/control-plane/daemon.ts:1148`, `src/control-plane/router.ts:166`, `src/control-plane/router.ts:168`, `src/control-plane/router.ts:195`, `src/control-plane/router.ts:216`, `src/control-plane/router.ts:373`, `src/control-plane/router.ts:447`.

FACT:
AUTO candidate gates:

- Terminal/direct-shell is excluded from AUTO. Source: `src/routing-policy.ts:225`, `src/routing-policy.ts:229`.
- Unavailable / needs-verification do not become AUTO candidates. Source: `src/routing-policy.ts:236`, `src/routing-policy.ts:240`.
- Busy controlled Players can remain in the first candidate set so context-aware routing can queue to an owner. Source: `src/routing-policy.ts:240`, `src/routing-policy.ts:616`, `src/routing-policy.ts:622`.
- Immediate AUTO dispatch requires a ready controlled candidate with non-unavailable capability freshness and at least one model. Source: `src/routing-policy.ts:288`, `src/routing-policy.ts:294`.

INFERENCE:
There is an eligibility filter suitable in shape, but not in vocabulary. A capacity-blocked Player would fit the "not dispatch now" rule better as `unavailable` or a new eligibility status than as `busy`, because busy currently means a turn/process is working or queueable ownership context.

CONTRADICTION:
`takingPlays = ready || busy` has naming tension: busy Players are not immediate dispatch candidates, but they are route candidates for queue decisions. A future capacity-blocked state must not accidentally join this set unless it is intentionally queue/schedule-eligible.

## Current roster/bench semantics

FACT:
Bench is explicit `onField: false`; the instance is retained. Source seams:

- `PlayerInstanceProjection.onField` says false means retained and returnable, not removed: `src/player-instances.ts:10`.
- `takeOffField()` only flips `onField` false and fires change: `src/player-roster.ts:386`.
- `putInstanceOnField()` flips the exact instance back to true and shows its terminal/control presentation: `src/player-roster.ts:348`.
- Existing comment: "A benched Player returns to the field; it was never removed." Source: `src/player-roster.ts:374`.
- `removePlayer()` is separate from bench and ownership-aware. Source seam: `src/player-roster.ts:406` through removal path; ownership contract also in `src/player-adapters.ts:17`.

FACT:
Roster UI line 2 renders "On Field" or "On Bench" from `instance.onField`, then separately renders execution strips. Source seams: `src/public/index.html:1813`, `src/public/index.html:1815`, `src/public/index.html:3137`, `src/public/index.html:3148`, `src/public/index.html:3150`.

INFERENCE:
Current Bench is human/execution-lifecycle availability: "do not route this instance" while retaining identity. It is not currently modeled as a temporary machine-derived provider state. Reusing "On Bench" for provider capacity could be product-correct only if provenance/reason/expiry are shown, and only if architecture defines that machine-derived benching is distinct from human benching.

ARCHITECT DECISION REQUIRED:
Should automatic capacity benching mutate `onField`, or should it leave `onField` intact and add an eligibility overlay such as "On Field, unavailable now: limit reached"? Mutating `onField` risks blurring human intent with machine evidence.

## Capacity evidence seams

FACT:
Provider capability cache shape:

- `ProviderCapabilitySnapshot` includes provider, authenticated, account, plan, models, default model, observedAt, freshness. It does not include capacity, quota, retry/reset, provenance, or reason. Source: `src/capability-types.ts:12`.
- `CapabilityService` has freshness TTLs: live < 60s, cached < 10m, stale afterward; explicit unavailable stays unavailable. Source: `src/capability-service.ts:3`, `src/capability-service.ts:4`, `src/capability-service.ts:9`, `src/capability-service.ts:30`.

FACT:
Provider adapters:

- Player types are `claude | codex | antigravity | terminal`. Source: `src/player-adapters.ts:8`.
- Claude and AntiGravity have controlled adapters. Codex is marked controlled in adapter metadata, but this reconnaissance found structured-print dialects only for Claude and AntiGravity in `structured-print.ts`. Source seams: `src/player-adapters.ts:42`, `src/player-adapters.ts:52`, `src/player-adapters.ts:62`, `src/player-control/structured-print.ts:1`.
- AntiGravity capability probe uses `agy models`; Claude probes local `/model` and `/effort`. Source seams: `src/player-roster.ts:5`, `src/player-roster.ts:30`, `src/player-roster.ts:67`, `src/player-control/structured-print.ts:263`.

FACT:
Provider error evidence currently reaches Sideline mostly as summaries:

- Claude structured result failure becomes `Failed: <result/errors compacted>`. Source: `src/player-control/structured-print.ts:204`, `src/player-control/structured-print.ts:208`.
- AntiGravity structured result failure becomes `Failed: <result.error compacted>`. Source: `src/player-control/structured-print.ts:288`, `src/player-control/structured-print.ts:293`.
- Permission denials are classified for Claude `permission_denied` and AntiGravity `denied_actions`, but as skipped/denied counts, not provider auth/capacity state. Source: `src/player-control/structured-print.ts:186`, `src/player-control/structured-print.ts:205`, `src/player-control/structured-print.ts:290`, `src/player-control/structured-print.ts:504`.
- stderr is buffered for probes/startup/session checks and first-line surfaced on several failures. Source: `src/player-control/structured-print.ts:324`, `src/player-control/structured-print.ts:345`, `src/player-control/structured-print.ts:497`, `src/player-control/structured-print.ts:703`.
- Process exit before acceptance becomes refused/unavailable or closed/missing session; exit after acceptance without result becomes turn `unknown`. Source seams: `src/player-control/structured-print.ts:485`, `src/player-control/structured-print.ts:492`, `src/player-control/structured-print.ts:497`, `src/player-control/structured-print.ts:509`.

INFERENCE:
Usage limit, rate limit, quota exhausted, authentication failure, and permission failure can reach the UI as generic text only if the provider CLI emits them through structured result error, stderr first line, spawn error, or channel/control-open message. Sideline does not currently classify them into durable machine-readable evidence.

UNKNOWN:
Reset timestamps can only be captured structurally if a provider emits a structured field Sideline parses. Current code does not parse reset/retry timestamps from structured frames or terminal text. Inferring reset time from free text would be new capacity parsing and is out of scope.

## AntiGravity field-example implications

FACT:
An AntiGravity controlled Player can remain in roster with an exact `antigravity-xxxxxxxx` `instanceId`, preserved provider conversation ref, and on-field flag. Source seams: `src/player-instances.ts:142`, `src/player-control/host.ts:78`, `src/player-control/structured-print.ts:257`.

FACT:
If AntiGravity reports `result.status !== SUCCESS` with `result.error = "quota exceeded"` then current parser emits a failed turn summary, not capacity state. Test fixture seam: `test/fixtures/fake-print-cli.mjs:125`. Runtime parser seam: `src/player-control/structured-print.ts:288`, `src/player-control/structured-print.ts:293`.

INFERENCE:
For the field example:

```
AntiGravity 1
On Bench
Limit reached
```

current code can represent "AntiGravity 1" and "On Bench" if `onField` is false, and can preserve the session/process separately from removal. It cannot currently attach "Limit reached" as structured reason for automatic benching or disabled dispatch eligibility.

ARCHITECT DECISION REQUIRED:
Do not fabricate reset times. If the provider supplies `retry_at` / reset timestamp structurally, store it with provenance. If it appears only as terminal text, classify confidence lower and expire aggressively unless architecture blesses parsing.

## Immediate-dispatch implications

FACT:
Backend immediate dispatch protection exists at several layers:

- AUTO refuses when no eligible route can be computed. Source: `src/routing-policy.ts:241`, `src/routing-policy.ts:288`, `src/routing-policy.ts:294`.
- Router has duplicate in-flight guard per Game/exact Player. Source: `src/control-plane/router.ts:267`.
- Stadium/server resolution rejects pending/unavailable/non-live selected Players before delivery. Source: `src/server.ts:648`, `src/server.ts:652`, `src/server.ts:657`.
- Controlled delivery refuses active controls as busy and non-ready controls as unavailable. Source: `src/player-control/host.ts:118`, `src/player-control/structured-print.ts:386`, `src/player-control/structured-print.ts:387`.

FACT:
MANUAL target choices are rendered from `routingCapabilities` when present, otherwise roster instances. The code creates normal `<option>` elements and does not assign disabled or reason metadata per capacity state. Source: `src/public/index.html:3074`, `src/public/index.html:3080`, `src/public/index.html:3086`, `src/public/index.html:3098`.

INFERENCE:
A capacity-blocked Player could remain visible in Roster today, but if it remains in `routingCapabilities` as ready it would still be selectable and dispatchable. If removed from `routingCapabilities`, current MANUAL dropdown may fall back to instances only when there are no capabilities; with mixed eligible/ineligible capability lists, non-candidates disappear from MANUAL rather than appearing disabled with reason.

UNKNOWN:
Current UI has no proven disabled option reason path for MANUAL Player choices. Button disabled reasons exist via `title`/`aria-label`, but per-player option reasons are not present in the select rendering.

## Future-scheduling seam, architecture only

FACT:
Current queue is for exact instance busy/owner/collision cases, not future provider capacity windows. Routing decision actions are `dispatch | queue | handoff`. Source: `src/capability-types.ts:111`, `src/routing-policy.ts:355`, `src/control-plane/router.ts:216`.

FACT:
Work Ledger tracks active/recent work and reports; it does not track provider capacity windows. Source: `src/control-plane/work-ledger.ts:1`, `src/control-plane/work-ledger.ts:25`, `src/control-plane/work-ledger.ts:84`.

INFERENCE:
Future Scheduling should not reuse immediate queue blindly. A currently capacity-blocked Player may be "not eligible for Dispatch Now" but "eligible as a Scheduled Play target if capacity may return before execution." This suggests a separate scheduling eligibility predicate:

- roster member identity: exact instance exists;
- session/process preservation: known/unknown separately;
- now eligibility: false with reason/provenance/expiry;
- future eligibility: allowed only if architecture permits stale/expired capacity evidence to be rechecked at schedule time.

ARCHITECT DECISION REQUIRED:
Define whether Scheduled Play selection can include capacity-blocked Players as disabled-now/selectable-for-later, and what wording prevents users from reading schedule eligibility as immediate dispatchability.

## Provenance/expiry needs

Recommended evidence hierarchy, not implementation:

1. Structured provider/API status: highest confidence, can carry typed reset/retry fields and provider/account scope.
2. Structured CLI error frame: high confidence if provider schema is known; still provider/version scoped.
3. Known parser/classification over provider-specific text: medium confidence, must record parser version and matched category.
4. Terminal stdout/stderr text: low-medium confidence; preserve excerpt/detail but avoid permanent truth without expiry.
5. Process exit without semantic result: low confidence; indicates unknown/refused/failure, not capacity by itself.
6. Assistant Coach/human statement: useful annotation only; should not become machine truth without provenance and expiry.
7. Manual human override: highest priority for human UI preference, but not proof provider capacity exists.

FACT:
Existing freshness precedent is 60s live / 10m cached / stale afterward for capability snapshots. Source: `src/capability-service.ts:3`, `src/capability-service.ts:4`.

INFERENCE:
Capacity evidence should expire independently from model catalog freshness. A rate/usage-limit without reset time should decay quickly enough to avoid trapping a Player on machine bench. A reset/retry timestamp, if structurally known, can expire at or shortly after that time and trigger re-probe/reclassification.

ARCHITECT DECISION REQUIRED:
Define conflict resolution:

- human puts Player on field while machine says capacity-blocked;
- human manually dispatches despite machine warning;
- provider succeeds after prior capacity block;
- provider fails with auth/permission rather than capacity;
- stale capacity block expires while session is still preserved.

## WAS / IS / WILL BE

WAS:
Earlier architecture explicitly repaired confusion where unavailable Players could be described as "working"; AUTO must not stall the whole team on unavailable/needs-verification. Source: `src/routing-policy.ts:236`, `src/routing-policy.ts:238`.

IS:
Roster/Bench is a reversible, human-facing field participation state. Routing uses `getRoutingCapabilities()`, which excludes benched instances and maps controlled readiness from control state plus turn state. Source: `src/player-roster.ts:1172`, `src/player-roster.ts:1198`, `src/player-roster.ts:1209`.

WILL BE:
Capacity-aware dispatch needs architecture before implementation. It should preserve identity/session/roster while making immediate eligibility explicit, reasoned, and expiring. Future Scheduling should re-evaluate eligibility at execution time rather than treating current unavailability as permanent.

## FACT / INFERENCE / UNKNOWN / CONTRADICTION

FACT:
Exact `playerInstanceId` is the routing/queue/ledger atom. It appears in route constraints, routing decisions, dispatch results, queue actions, work ledger entries, and UI selection. Source seams: `src/capability-types.ts:65`, `src/capability-types.ts:76`, `src/control-plane/router.ts:216`, `src/control-plane/work-ledger.ts:29`, `src/public/index.html:3086`.

FACT:
Controlled versus adopted/external is already modeled by ownership and transport. Coach-managed removal may close what Coach created; adopted/external are detached without process destruction. Source seams: `src/player-adapters.ts:17`, `src/player-roster.ts:406`.

FACT:
Unexpected controlled channel loss triggers restore attempt and "Stopped unexpectedly. Resuming the same conversation..." message. Source: `src/player-roster.ts:939`, `src/player-roster.ts:962`, `src/player-roster.ts:1033`.

INFERENCE:
Automatic benching by mutating `onField` would violate the spirit, though not necessarily the TypeScript type contract, of current Bench semantics unless a new provenance field distinguishes machine-derived temporary bench from human bench.

UNKNOWN:
Whether product wants "On Bench / Limit reached" literally, or "On Field / Not available now / Limit reached" with immediate dispatch disabled. The field example points toward "On Bench," but the current architecture gives Bench a strong human/lifecycle meaning.

CONTRADICTION:
The desired phrase "On Bench / Limit reached" could imply machine-derived bench. Existing comments define bench as retained/not removed and "must not receive Plays," but do not define non-human causes. This is unresolved product language, not a code bug.

## Architect decisions required

1. Capacity state home: provider snapshot, player routing capability, separate evidence ledger, or layered combination.
2. Scope: provider/account-wide versus exact instance-specific versus Game/Stadium-specific.
3. State vocabulary: extend `ready | busy | unavailable | needs-verification`, add reason fields, or introduce separate `dispatchEligibility`.
4. Bench semantics: whether machine-derived temporary ineligibility may flip `onField`.
5. UI contract: show capacity-blocked Players in MANUAL as disabled options with reason, or hide from immediate dispatch choices while keeping Roster visible.
6. Evidence confidence and expiry: typed reset times, inferred text, no reset time, stale state, and re-probe behavior.
7. Human override: warning-only, blocked, schedule-only, or force-dispatch with clear outcome handling.
8. Capacity return: what clears the state: successful probe, successful dispatch, expiry, manual refresh, or provider structured signal.
9. Future Scheduling: separate "eligible later" predicate and recheck-at-run semantics.
10. Do not promote conversational claims to durable machine truth without provenance and expiry.

## Scout limitations

This Scout did not implement or run capacity parsing, scheduling, routing changes, or source modifications. It did not execute provider CLIs or live Stadium dispatches. Evidence is from static code/test seam reading. Existing worktree was dirty before this Scout; unrelated modifications were left untouched.

## Coverage

Covered:

- Roster / On Field / Bench semantics.
- Exact player instance identity.
- Provider adapter and structured-print seams.
- Work states and Work Ledger.
- Queue eligibility for busy controlled instances.
- AUTO route candidate filtering.
- MANUAL target rendering and backend acceptance seams.
- Capability cache TTL.
- Controlled/adopted ownership boundaries.
- Provider error evidence pathways.
- stdout/stderr/exit handling.
- Unexpected exit/restore attention states.
- User-facing roster/dispatch attention surfaces.

Not covered:

- Live provider behavior.
- Actual provider reset timestamp formats.
- Scheduling design beyond architecture seam.
- Capacity parser taxonomy.

## Recommended next route

NEEDS ARCHITECTURE

Recommended next route: a focused architecture pass for "Provider Capacity Evidence and Dispatch Eligibility Overlay." Keep it smaller than a full Usage Sentinel. Deliverables should be type contract, evidence hierarchy, expiry rules, UI copy contract, immediate dispatch predicate, MANUAL disabled-option contract, and future Scheduling recheck rule. Stop before implementing parsers or scheduling.

REPORT: SCOUT-C-Capacity-Eligibility-Auto-Bench-And-Future-Scheduling.md
TIMESTAMP: 2026-09-14 18:14 MDT
