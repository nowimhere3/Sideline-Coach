# Terminal / Scout / AI Health Breadcrumbs — 2026-09-20

These are durable product breadcrumbs captured from field use and design discussion. They are not implementation claims unless explicitly marked FIELD-PROVEN.

## 1. Terminal Player live output is field-proven

WAS: Terminal Player could execute direct-shell work, but the human could not see its real output inside Sideline.

IS: Human field proof showed real Terminal Player output in the Sideline browser, including `git status`, one-second streaming ticks, and a longer file-reading command. Live output streamed while the native VS Code Terminal executed the command.

WHY: the human needs to see a Player's guts without leaving Sideline.

WILL BE: retain this live-output substrate while refining evidence retention and Dad-safe presentation.

## 2. Terminal settings belong together

WAS: Terminal-related behavior is spread across Dev Mode, View Player Terminal, roster discovery, and runtime state.

IS: the product needs one understandable Terminal settings family.

WHY: Terminal is an advanced capability, but its controls should not scatter implementation plumbing across Settings.

WILL BE: keep Terminal-related options together under the existing Terminal / View Player Terminal capability where practical, while preserving independent underlying truths.

## 3. Advanced Player Discovery

WAS: Check Players can expose many raw local discoveries such as `powershell`, `node`, and other adoptable terminals.

IS: those discoveries are valuable to developers but confusing in Dad mode. The normal Terminal Player itself remains understandable enough to stay recruitable.

WHY: Dad should see Players he understands, not a plumbing closet.

WILL BE: add a Dev Mode-only visibility setting, working name `Advanced Player Discovery`, default OFF. When OFF, hide raw developer-facing local discoveries from the normal recruitment UI without destroying their underlying discovery state. The ordinary Terminal Player remains recruitable.

## 4. Terminal evidence retention

WAS: fast terminal-native Plays can finish before the human reaches the expanded Terminal view. A fast failure visibly blipped and disappeared before inspection, while longer-running commands stayed useful.

IS: completion state alone is not a sufficient evidence-retention policy.

WHY: short commands such as `git status`, package queries, filesystem checks, process checks, and quick PowerShell work may complete almost instantly, yet their evidence is still valuable.

WILL BE: configurable post-completion retention. Candidate policies captured from field use include:

- Until manual Collapse
- Until successful Copy All
- Until next Play
- Until report discovery / acknowledgement
- Keep full history while View Player Terminal is enabled
- Keep for a user-selected duration after completion

Useful retention should be ON by default. Exact default duration/policy remains an implementation decision.

## 5. Evidence is not dismissal

WAS: UI lifecycle can conflate opening, reading, copying, completion, and release.

IS: those are separate human intents.

WHY: inspection should not accidentally destroy useful game film.

WILL BE: `Read is not dismissal.` `Copy is not inherently dismissal.` Opening evidence is not permission to destroy it. Terminal activity and report visibility may use separate mechanisms if their ownership seams differ.

## 6. Report visibility / retention

WAS: discovered reports can become less visible after interaction depending on current lifecycle behavior.

IS: the user wants report evidence to remain available after reading/copying unless an explicit policy or acknowledgement says otherwise.

WHY: reports are useful post-Play evidence, especially during development and debugging.

WILL BE: preserve report visibility according to explicit acknowledgement/retention semantics rather than treating read/copy as automatic disposal. Potential Settings treatment may be separate from Terminal retention.

## 7. AUTO terminal-only routing

WAS: Terminal Player has been a manual route while AUTO routes through AI Players.

IS: some Plays are unambiguously terminal-native and do not need an AI Player merely to become a command.

WHY: obvious execution work should not consume premium reasoning or add unnecessary hops.

WILL BE: AUTO may gain a terminal-only intent detector and route directly to an eligible Terminal Player when intent is unambiguous.

Examples that may be terminal-only:

- `git status`
- package installation commands
- filesystem listings
- process queries
- environment queries
- explicit server start/stop commands

Counterexample:

- `figure out why npm install is failing`

That remains reasoning work first.

Invariants:

- explicit human routing wins;
- ambiguous intent stays with an AI Player;
- Terminal command-safety remains authoritative;
- a mention of terminal vocabulary is not sufficient by itself.

## 8. Extension Development Host self-hosting constraint

WAS: attempts to use the Sideline Coach source repository as the active Game while simultaneously developing/running Sideline through its Extension Development Host created restart/self-hosting friction.

IS: during current development-mode field testing, use another Game such as `AI Usage - Real Time` or `Sideline Coach Game Test` rather than making Sideline Coach its own Game.

WHY: the extension host and the product-under-test should not fight over the same development lifecycle.

WILL BE: revisit self-hosting after packaged/installed extension behavior is available and field-proven. Do not assume development-mode self-hosting works today.

## 9. Scout self-health tryout

WAS: Scout tryouts primarily evaluate reconnaissance capability and route readiness.

IS: a Scout candidate is also an ideal agent to investigate its own health/status observability.

WHY: the receiver is well-positioned to answer: what limits govern me, what status can be observed, how can it be queried safely, and how can that evidence reach Sideline/OpenCode/OpenRouter without inference work?

WILL BE: add self-health reconnaissance as an additional tryout lane/evidence section, not as a mandatory pass condition for primary Scout competency.

Acceptable verdicts:

- KNOWN
- PARTIAL
- UNKNOWN

The Scout should investigate, where possible:

- capacity / quota structure
- remaining capacity
- reset timing
- safe status query surface
- whether the query consumes inference
- provider / OpenCode / OpenRouter transport path
- how evidence can feed AI Health

UNKNOWN is legitimate and should be recorded rather than guessed.

## 10. AI Health supported-provider registry

WAS: early AI Usage presentation centered mainly on direct Claude and Codex health.

IS: future Sideline AI Health needs to accommodate multiple execution surfaces and providers without fossilizing today's hierarchy.

WHY: the same model family can have different capacity depending on access surface. Example principle: Claude through Claude Code and Claude through AntiGravity can have different batteries.

WILL BE: maintain a supported-provider / supported-surface registry where these dimensions remain separate:

- provider / access surface
- Player/model identity
- subscription / entitlement when observable
- health evidence availability
- freshness / observedAt
- capacity windows / reset evidence
- display grouping
- routing eligibility
- CONSERVE relevance
- visibility
- copy/status inclusion

## 11. A-Team / B-Team / Scout health presentation

WAS: one flat scorecard risks becoming noisy as more health sources are added.

IS: the desired presentation concept is a simple A-Team / B-Team / Scouts hierarchy, with premium features potentially unlocking richer surfaces.

WHY: Dad needs a small mental model while developers/premium users may want deeper health evidence.

WILL BE: A-Team can remain mostly visible; B-Team and Scout health can be expandable/collapsible or separately selectable. This is a presentation/default policy, not eternal model truth. Today's model hierarchy is a prior, not a law.

Potential entitlement concepts may include additional API keys, providers, or premium Scout-health surfaces, but entitlement must remain separate from underlying health truth.

## 12. Visual hiding must not erase health evidence

WAS: UI visibility and health acquisition can be conflated.

IS: the user may want a Settings option to visually hide health cards while still allowing copy/status/routing/CONSERVE logic to consume health evidence.

WHY: presentation preference should not corrupt operational truth.

WILL BE: display visibility and underlying observation remain separate dimensions.

## 13. Scout receiver substitution / injured list

WAS: a development Formation can lose a receiver and continue with fewer completed lanes. Existing game film already preserves PARTIAL formations rather than discarding successful Scout intelligence.

IS: during the 2026-09-20 development run, one Scout receiver failed while another continued running. The user expects the broader Scout bench/depth chart to be usable rather than cancelling the Play because one receiver went down.

WHY: Formation size comes from the Play, not from loyalty to the originally selected receiver. Provider availability, rate limits, quota, or infrastructure failure should not force Dad to become the substitution manager.

WILL BE: future Formation orchestration may support receiver substitution for infrastructure/availability failure:

1. preserve the failed attempt as truthful evidence;
2. mark/update receiver availability truthfully;
3. if that reconnaissance lane still matters, select the next eligible READY receiver from the Scout depth chart;
4. continue the Formation without rewriting the failed attempt;
5. do not automatically substitute after substantive task-quality failure unless explicit policy allows it.

This behavior is a breadcrumb, not a claim that the current development `scout:play` runner already performs mid-Formation substitution.

## 14. Development Scout Launch SOP is canonical for current manual development

WAS: repeated ad hoc launch commands caused paste failures, continuation prompts, misleading wrapper output, and wasted human attention.

IS: the field-observed development path is now documented in `Docs ANCHOR/DEVELOPMENT-SCOUT-LAUNCH-SOP.md`.

WHY: launching Scouts should be a repeatable operation, not a recurring debugging project.

WILL BE: use the SOP whenever manually launching development Scouts until a newer path is field-proven and deliberately replaces it.
