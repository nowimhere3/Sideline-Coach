REPORT TYPE: SCOUT REPORT
SCOUT: Codex / GPT-5.5 / Low
RECONNAISSANCE DEPTH: Standard
REPORT TIMESTAMP: 2026-09-14 18:12:29 -06:00 (America/Edmonton)

# SCOUT-A - Live Player Identity And Dev Projection

## Executive terrain map

FACT:
Sideline already separates stable Player identity, dispatch routing facts, execution state, report provenance, and Dad-mode display labels. A future Dev Mode projection can be built without mutating canonical Player identity.

FACT:
The strongest current seams are:

- stable exact instance identity: `PlayerInstanceBook` and `PlayerRoster`
- current routing/model/effort decision: `ControlPlaneRouter.dispatch()` and `RoutingDecision`
- active execution truth: `InstanceWorkLedger` to `ExecutionView`
- browser live projection: `executionStore` in `src/public/index.html`
- report execution provenance: `src/report-provenance.ts`
- current human labels: `src/player-display-labels.ts`

INFERENCE:
The smallest future Dev Mode implementation should probably project an optional display label from exact instance plus active/current Play facts, not rename Players and not alter roster identity.

ARCHITECT DECISION REQUIRED:
Future UX must decide whether active Dev Mode display prefers:

- provider/model/effort only, such as `Sonnet · Medium`;
- full identity, such as `Claude 1 · Sonnet · Medium`;
- or a toggle among Player identity / Model / Full identity.

The code already has enough seams to support any of those, but current source does not choose the product rule.

## WAS / IS / WILL BE

## WAS

FACT:
Older reports record that instance identity originally depended on seats and terminal presentation, then moved toward opaque `instanceId` routing and current-roster friendly labels. Current source has already graduated that lesson into `src/player-display-labels.ts`, `src/player-instances.ts`, and browser exact-instance rendering.

## IS

FACT:
Stable Player identity is opaque `playerInstanceId`. Dad-mode labels are presentation projections. Active execution is a revisioned `ExecutionView` keyed by exact instance. Dispatch route decisions carry provider/model/effort, and the Work Ledger preserves selected `model` and `effort` on current and recent Plays.

FACT:
Provider/model/effort truth can be known during dispatch when routing resolves it. It can also be Unknown or provider-managed. Terminal/direct-shell Players intentionally have no model or reasoning effort.

## WILL BE

INFERENCE:
A future Dev Mode projection can display active execution labels from the exact current `ExecutionView` plus matching Work Ledger/current dispatch facts. If it needs richer active provider/model display in the browser, the cleanest seam is to add optional non-Dad fields to `ExecutionView` or status projection, not to reinterpret friendly names.

## Evidence map

### Stable Player identity

FACT:
`src/player-instances.ts` creates stable opaque IDs in `PlayerInstanceBook.mintId()` and stores them in `PlayerInstanceRecord.instanceId`. See `src/player-instances.ts:41-45`, `src/player-instances.ts:60-68`, and `src/player-instances.ts:137-142`.

FACT:
Player projections contain `instanceId`, `playerType`, `seat`, `fieldLabel`, `ownership`, and `onField`. See `src/player-instances.ts:5-12` and `src/player-instances.ts:120-128`.

FACT:
Persistence for terminal/adopted process proof is in `PlayerRoster` workspace state key `sidelineCoach.playerProvenance.v1`, with `instanceId`, `playerType`, `seat`, `shellPid`, and `shellStartedAt`. See `src/player-roster.ts:1085-1127`.

FACT:
Controlled restore identity is adopted through `PlayerRoster.adoptControlledRestores()` before terminal presentation is created. Current Dad-mode display labels are resolved by `PlayerRoster.displayLabel()` through `friendlyInstanceNames()`. See `src/player-roster.ts:1000-1022` in current source and `src/player-roster.ts:1024-1038` in the same area.

FACT:
Current contiguous human labels are resolved in one helper, `friendlyInstanceNames()`, then projected into roster instances by `projectFriendlyRoster()`. See `src/player-display-labels.ts:1-52`.

FACT:
Tests assert generic current-roster contiguous labels, recompaction, Game isolation, and shared resolver use. See `test/q2-10f-3-dad-mode-projection-friendly-labels.test.mjs:23-61`.

### Provider/model/reasoning effort known during dispatch

FACT:
`PlayerRoutingCapability` includes `provider`, model catalog, optional `activeModel`, optional `activeEffort`, `activeTurn`, and `executionType`. See `src/capability-types.ts:3-39`.

FACT:
`RoutingDecision` separates `playerInstanceId`, `playerLabel`, `provider`, `model`, `modelDisplayName`, and `effort`. See `src/capability-types.ts:52-126`.

FACT:
AUTO resolves model/effort in `computeAutoRoute()` and `computeContextAwareRoute()` through provider routing policies. See `src/routing-policy.ts:31-144`, `src/routing-policy.ts:220-334`, and `src/routing-policy.ts:442-624`.

FACT:
Manual dispatch with `model: 'auto'` or `effort: 'auto'` resolves against the exact selected instance through `resolveCoachAuto()`. See `src/control-plane/router.ts:191-198` and `src/routing-policy.ts:634-669`.

FACT:
The actual dispatch path assigns `targetModel` and `targetEffort`, then emits `play-dispatched` with `model` and `effort`. See `src/control-plane/router.ts:153-198` and `src/control-plane/router.ts:297-309`.

FACT:
Terminal/direct-shell clears model and effort before dispatch. See `src/control-plane/router.ts:200-211`.

UNKNOWN:
For provider-default execution, Sideline may know the requested/default policy value but not the actual hidden underlying provider model. Current provenance deliberately records `provider-default` rather than guessing. See `src/report-provenance.ts:70-99` and `test/q2-10e-a-explicit-execution-provenance.test.mjs:99-113`.

### Survival after dispatch

FACT:
`InstanceWorkLedger.recordDispatch()` receives `model` and `effort` through `DispatchRecord`; `LedgerPlay` and `LedgerRecentPlay` both carry optional `model` and `effort`. See `src/control-plane/work-ledger.ts:20-46`, `src/control-plane/work-ledger.ts:66-78`, and `src/control-plane/work-ledger.ts:435-448`.

FACT:
`recordDelivery('received')` creates or updates `currentPlay` from the dispatch record, preserving selected `model` and `effort`. See `src/control-plane/work-ledger.ts:120-145`.

FACT:
Terminal outcomes move a current play into `recentPlays` through `recentOf()`, preserving `model` and `effort`. See `src/control-plane/work-ledger.ts:452-467`.

FACT:
Ledger serialization persists recent Plays and report links, but current active Plays serialize as Unknown recovery candidates rather than live current execution. See `src/control-plane/work-ledger.ts:256-269`.

UNKNOWN:
After Control Plane replacement while a Play remains active, model/effort survival depends on whether the recovered active turn can match a durable recovery candidate. `recoveredPlay()` can preserve `model` and `effort` from that durable candidate; if only Stadium `activeTurn` exists, recovery has exact turn/timestamp but no model/effort. See `src/control-plane/work-ledger.ts:388-406` and `src/control-plane/work-ledger.ts:419-434`.

### Work Ledger and execution projection

FACT:
`ExecutionView` currently includes `instanceId`, `state`, `revision`, `playRef`, `summary`, `executionStartedAt`, `finishedAt`, `durationMs`, `report`, `queue`, `detail`, and `executionType`. It does not include provider, model, or effort. See `src/control-plane/execution-projection.ts:17-34`.

FACT:
`projectExecution()` derives `working`, `starting`, `queued`, `needs-you`, `finished`, `unknown`, and `idle` from the Work Ledger plus queue/control inputs. It projects `summary` and `executionStartedAt`, not model/effort. See `src/control-plane/execution-projection.ts:48-126`.

FACT:
The Control Plane exposes `status.execution` with `gameId`, `epoch`, `serverNow`, and `byInstance`. It builds one `ExecutionView` for every exact roster instance in the selected Game. See `src/control-plane/daemon.ts:275-277` and `src/control-plane/daemon.ts:2006-2035`.

INFERENCE:
For Dev Mode active labels, the future architect has two small choices:

- add optional provider/model/effort to `ExecutionView`, sourced from `entry.currentPlay` and/or capabilities; or
- add a separate exact-instance Dev Mode projection next to execution.

Adding these to Dad-mode labels or roster `displayName` would violate the current identity/display split.

### TEAM / Player strip label, state, and timer

FACT:
Browser execution truth lives in `executionStore`, keyed by exact `instanceId`, with epoch/revision merge. It explicitly avoids raw turn events, roster turnState, capability busy/ready, and selected Player as execution authority. See `src/public/index.html:1092-1193`.

FACT:
TEAM header summarizes current execution store views only, with `NEEDS YOU` and `ACTIVE`, and no timer. See `src/public/index.html:1815-1849`.

FACT:
Player strips render from exact `ExecutionView` plus current roster row record. `renderPlayStrip()` uses `view.state`, `view.summary`, `view.executionStartedAt`, `view.report`, `view.queue`, `view.detail`, and `view.executionType`. See `src/public/index.html:1987-2121`.

FACT:
The elapsed timer uses canonical `executionStartedAt` plus `serverNow()` display skew correction. See `src/public/index.html:1121-1129` and `src/public/index.html:2063-2079`.

FACT:
Roster rows are keyed by exact instance and carry `data-instance-id`. See `src/public/index.html:3130-3138`.

FACT:
Browser target selector and roster names are normalized from exact instance labels through `instanceDisplayNames()` / `currentPlayerDisplayLabel()` flows, with `lastInstanceNames` as current map. See `src/public/index.html:3048-3094`.

UNKNOWN:
The Scout did not inspect every helper definition for `instanceDisplayNames()` and `currentPlayerDisplayLabel()` due reconnaissance boundary, but tests assert they use exact identity and shared label projection.

### Provenance exact-instance safety

FACT:
Report provenance parser supports `gameId`, `clientRef`, `playerInstanceId`, `playerType`, `provider`, `model`, `effort`, and `at`. See `src/report-provenance.ts:17-27`.

FACT:
Source-side provenance uses Control Plane dispatch facts and stamps `provider-default` when no explicit model is known. See `src/report-provenance.ts:70-99`.

FACT:
Router adds the provenance instruction only for controlled reasoning Plays, not Terminal/direct-shell. See `src/control-plane/router.ts:280-296`.

FACT:
Ledger report attribution prefers explicit same-Game provenance and removes stale timing attribution for the same path. See `src/control-plane/work-ledger.ts:283-326`.

FACT:
Tests prove AntiGravity provider/model separation and that previous report model evidence does not force the next route. See `test/q2-10e-a-explicit-execution-provenance.test.mjs:67-113` and `test/q2-10e-a-explicit-execution-provenance.test.mjs:159-186`.

CONTRADICTION:
`ReportProvenance` uses field `provider`, but at least one lifecycle fixture uses `executionProvider` and `timestamp` in report objects. See `test/q2-10f-2-lifecycle-e2e.test.mjs:268-274`. This appears test-local/fixture-shaped rather than the parser contract, but future architects should avoid treating fixture-only field names as canonical.

### Model or effort unavailable

FACT:
Provider capability snapshots can have empty model catalogs and freshness `unavailable`. See `src/capability-types.ts:1-15`.

FACT:
Routing refuses AUTO when live capability truth is unavailable or model catalogs are empty. See `src/routing-policy.ts:205-209`.

FACT:
Manual `auto` model/effort resolves to undefined when the exact candidate is not operable. See `src/routing-policy.ts:646-654`.

FACT:
Terminal/direct-shell explicitly has no model or reasoning. See `src/capability-types.ts:31-35`, `src/player-roster.ts:1175-1189`, and `src/control-plane/router.ts:200-211`.

INFERENCE:
A Dev Mode display must include an Unknown/provider-managed state and must not backfill a model from provider name, previous Play, roster label, or report provenance unless it is deliberately presenting prior context rather than active execution.

### Idle after completing work

FACT:
`projectExecution()` returns `finished` briefly when the latest completed Play has an unacknowledged report or is awaiting a report during the grace window. Otherwise it returns `idle`. See `src/control-plane/execution-projection.ts:113-126`.

FACT:
Dad-mode rendering suppresses stale unknown/failure history and retires finished/report display after the bounded rich window. See `src/public/index.html:2012-2027` and `src/public/index.html:2139-2165`.

FACT:
Q2.10F.3 report confirms historical terminal states remain stored but no longer present ordinary Player health warnings.

INFERENCE:
If a future Dev Mode display wants to show last-used model/effort on idle Players, that is no longer "active execution label"; it is history/diagnostics and should remain Dev Mode only.

## Exact source/test seams

FACT:
Primary implementation seams:

- `src/player-instances.ts`: stable instance records and seats.
- `src/player-roster.ts`: live roster, controlled/terminal projection, provider capability probes, `activeModel`, `activeEffort`, `activeTurn`.
- `src/capability-types.ts`: typed route/capability/decision contract.
- `src/routing-policy.ts`: provider-specific model/effort selection.
- `src/control-plane/router.ts`: actual dispatch target/model/effort, Work Ledger record, report provenance instruction, exact dispatch result identity.
- `src/control-plane/work-ledger.ts`: current/recent Play records with model/effort, executionStartedAt, reports.
- `src/control-plane/execution-projection.ts`: current execution projection without model/effort.
- `src/control-plane/daemon.ts`: `status.execution`, capabilities/work projection, current friendly roster.
- `src/public/index.html`: browser execution store, TEAM header, Player strip, outgoing exact target.
- `src/report-provenance.ts`: exact report metadata parser/formatter.
- `src/play-summary.ts`: active task reminder extraction.

FACT:
Primary tests:

- `test/q2-10e-a-explicit-execution-provenance.test.mjs`
- `test/q2-10f-2-execution-projection.test.mjs`
- `test/q2-10f-2-lifecycle-e2e.test.mjs`
- `test/q2-10f-3-dad-mode-projection-friendly-labels.test.mjs`
- `test/q2-10f-4-compact-live-player-strip.test.mjs`

## What is already implemented

FACT:
Already implemented:

- exact stable `playerInstanceId` identity;
- current-roster friendly display labels;
- exact target dispatch result identity;
- provider/model/effort routing decisions;
- controlled report provenance with provider/model/effort;
- Ledger current/recent Play `model` and `effort`;
- revisioned execution store and exact Player strips;
- canonical timer from `executionStartedAt`;
- task reminder from `promptSummary`;
- Terminal/direct-shell exclusion from model/effort truth.

## What is merely presentation work

INFERENCE:
Showing `Claude 1 · Sonnet · Medium` or `Sonnet · Medium` during active work is mostly projection/presentation if it uses existing facts. The likely missing piece is not data invention, but deciding the display policy and carrying the chosen current model/effort into the browser-side execution view cleanly.

INFERENCE:
Do not rename Players. The current label resolver should remain `Claude 1` / `Codex` / `AntiGravity 1`; a Dev Mode execution label should be a separate rendered adjunct or strip variant.

## Unknowns

UNKNOWN:
Whether `activeModel` and `activeEffort` from `controlHost.resolve(instanceId)` always represent the current turn's actual active settings, the provider's current session defaults, or last-known control state. The type names suggest active control evidence, but this Scout did not inspect provider adapter internals deeply enough to certify per-provider semantics.

UNKNOWN:
Whether Claude/AntiGravity can expose actual underlying model after a Provider Default run when the Control Plane did not explicitly select one. Current contract says Unknown/provider-default is truthful.

UNKNOWN:
Whether a Control Plane replacement during active work can always recover model/effort. Ledger recovery can preserve them only when a durable recovery candidate exists; `activeTurn` alone does not carry model/effort.

UNKNOWN:
Whether Dev Mode should display current selected route model before dispatch or actual delivered model after dispatch when those differ due final dispatch normalization. Current exact source of execution truth should be the dispatch record, not preview.

## Contradictions

CONTRADICTION:
`ExecutionView` is the browser's canonical active execution surface, but it currently omits model/effort even though the Work Ledger carries them. This is not a data contradiction; it is a projection gap for Dev Mode.

CONTRADICTION:
Capability `activeModel`/`activeEffort` and Ledger `currentPlay.model`/`effort` can potentially disagree. For active execution, the Ledger dispatch record is the best "what Coach sent" truth; capability values may be "what the provider/session currently reports." Architecture should decide precedence and vocabulary before displaying both.

CONTRADICTION:
Fixture provenance in at least one test uses `executionProvider`/`timestamp`, while parser/report contract uses `provider`/`at`. Avoid graduating fixture vocabulary.

## Architect decisions required

ARCHITECT DECISION REQUIRED:
Define Dev Mode label vocabulary:

- provider: `Claude`, `Codex`, `AntiGravity`;
- underlying model display: model id vs display name;
- effort display: raw `low|medium|high` vs Dadified `Low|Medium|High`;
- unknown model: `Provider Default`, `Unknown`, or hidden.

ARCHITECT DECISION REQUIRED:
Define source precedence for active execution display:

1. Work Ledger `currentPlay.model/effort` because it is what Sideline sent.
2. RoutingDecision/dispatchAttempt only as latest-attempt fallback before execution view arrives.
3. Capability `activeModel/activeEffort` only if explicitly defined as current provider state and not conflicting.
4. Report provenance only as completed/report context, not active run truth.

ARCHITECT DECISION REQUIRED:
Decide whether Dev Mode projection belongs inside `ExecutionView` or beside it. Adding optional fields to `ExecutionView` is smallest, but a separate `devExecution` projection may preserve Dad-mode purity.

ARCHITECT DECISION REQUIRED:
Decide idle behavior. Active labels are straightforward while `currentPlay` exists; after idle, showing last model/effort becomes history and should be intentionally Dev Mode/diagnostic, not ordinary Player identity.

## Scout limitations

Coverage was standard-depth and bounded to Player identity/projection. I did not inspect every provider adapter implementation or all browser helpers. I did not run tests because the task was read-only reconnaissance and current tests have been heavily exercised by prior implementation reports. No source files were modified.

The only filesystem write was this Scout report.

## Coverage

fully:

- stable Player identity creation and display-label projection;
- dispatch path where model/effort are chosen and recorded;
- Work Ledger and ExecutionView shape;
- browser TEAM/Player strip projection;
- report provenance parser/stamping contract;
- current tests proving identity/provenance/lifecycle.

partially:

- provider adapter internals for `activeModel` and `activeEffort`;
- all browser helper functions used by current label lookup;
- managed terminal tab naming behavior beyond current report/source evidence.

not investigated:

- live provider CLIs;
- real terminal runtime state;
- networked/mobile browser behavior;
- future Settings/Dev Mode UI.

## Recommended next route

NEEDS ARCHITECTURE

Recommended next route:

1. Architecture: define Dev Mode active execution label policy and field precedence.
2. Implementation Slice A: add optional model/effort/provider display facts to the canonical execution/status projection or adjacent Dev Mode projection, sourced from Work Ledger `currentPlay`.
3. Implementation Slice B: add browser Dev Mode presentation that renders those facts as an adjunct to the exact Player strip without renaming Players.
4. Tests: prove exact identity remains stable, Unknown/provider-default remains truthful, capability/Ledger disagreement is handled by the chosen precedence, and Dad Mode remains unchanged.

Final guidance:
Use stable `playerInstanceId` as identity, current friendly label as identity presentation, and active model/effort as execution detail. Never turn `Sonnet · Medium` into a Player name.

REPORT: SCOUT-A-Live-Player-Identity-And-Dev-Projection.md
TIMESTAMP: 2026-09-14 18:12:29 -06:00 (America/Edmonton)
