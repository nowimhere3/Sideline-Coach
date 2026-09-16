# SCOUT D — AUTO ROUTING + PLAY/REPORT METADATA CONTRACT

## 1. VERDICT

Sideline now has a meaningful explicit-intent path, but it is bounded and strict rather than a general Play-header schema. `AGENT`, `MODEL`, and effort labels are recognized by `src/control-plane/route-constraints.ts` only when they resolve against the live Game catalog. AUTO then fills omitted dimensions. However, `Low-Medium` is not a recognized effort value: the parser accepts only `low|medium|high|xhigh|max`, while Codex capability discovery can expose `ultra`. Therefore the reported Low-Medium → Ultra behavior is not proven as a direct parser conversion. The most likely source-only explanation is that the effort was ignored as unsupported and AUTO then selected the architecture policy's strongest available model/effort; a runtime probe is required to prove the exact UI path.

The code already keeps provider/Player, model, and effort as separate fields and stamps execution provenance into reports. The remaining contract gap is vocabulary and precedence coverage: explicit values outside the strict supported set become unspecified, allowing policy inference to fill them.

## 2. AUTO END-TO-END FLOW

1. Outgoing preview calls `POST /api/route/preview` from `src/public/index.html:requestRoutePreview()` (around lines 2683+), sending the typed prompt and optional Incoming context.
2. `src/control-plane/daemon.ts` handles the route-preview endpoint (around `1346`), obtains the selected Game, authoritative Stadium, roster capabilities, and calls `buildRouting()`.
3. `buildRouting()` is the shared status/preview projection (`src/control-plane/daemon.ts` around `2134+`); `ControlPlaneRouter.computeRoute()` calls `computeAutoRoute()` or `computeContextAwareRoute()`.
4. `src/routing-policy.ts:computeAutoRoute()` filters non-reasoning/terminal Players, requires live ready capabilities, classifies the prompt with `analyzePlay()`/`classifyTask()`, chooses provider by `PROVIDER_PREFERENCE`, picks an instance using work-ledger evidence, then calls the provider policy (`CodexRoutingPolicy`, `ClaudeRoutingPolicy`, or `AntiGravityRoutingPolicy`).
5. `recognizeRouteConstraints()` in `src/control-plane/route-constraints.ts` narrows the route when explicit Player/model/effort intent is recognized. `computeContextAwareRoute()` applies those constraints while resolving context ownership and queue/handoff decisions.
6. The browser renders `RoutingDecision` in the AUTO panel. Preview and actual dispatch deliberately share `computeRoute()`.
7. `POST /api/dispatch` in `src/control-plane/daemon.ts:1166+` forwards prompt, mode, exact instance, model, effort, and route choice to `ControlPlaneRouter.dispatch()`.
8. `src/control-plane/router.ts:dispatch()` uses AUTO's decision, or for MANUAL resolves `auto` model/effort against the exact selected instance via `resolveCoachAuto()`. It strips model/effort for terminal Players, queues if required, and sends an exact dispatch frame to Stadium.
9. Controlled providers receive per-Play model/effort flags in `src/player-control/codex-app-server.ts` and `src/player-control/structured-print.ts`; report provenance is added by the router before the Player receives the prompt.

## 3. CURRENT PLAYER / MODEL / EFFORT VOCABULARIES

- Player/provider types are live values such as `codex`, `claude`, `antigravity`, and `terminal`; `PlayerRoutingCapability.playerType` is the routing identity.
- Model descriptors are provider catalog IDs/display names with `supportedEfforts`, `defaultEffort`, and `isDefault` (`src/capability-types.ts:ModelDescriptor`).
- Canonical provider effort values currently observed in code are `low`, `medium`, `high`, `xhigh`, `max`; AntiGravity capability parsing also exposes `low|medium|high`; Codex tests explicitly expose `ultra` as supported.
- UI labels include `Extra High` for `xhigh`; provider `auto` is deliberately excluded from Coach effort options. `default` means Provider Default, not a reasoning level.
- `play-analyzer.ts` has an independent difficulty enum: `easy|medium|hard`, with default recommendations `low|medium|high` for Claude.
- `GPT-5.6 Ultra` is not a single canonical effort enum in the source. `ultra` is a provider/catalog effort value (and Codex architecture policy preference); a display such as “GPT-5.6 Ultra” is therefore a model-plus-effort/catalog presentation, not proof that Ultra means task difficulty.

## 4. LOW-MEDIUM → ULTRA FAILURE PATH

Source proves:

- `route-constraints.ts` normalizes explicit effort with `/^(low|medium|high|xhigh|max)$/i`; `Low-Medium` does not match.
- Recognized effort must also exist in the selected live model's `supportedEfforts` set.
- When no explicit effort is recognized, provider policy supplies one. Codex architecture selection prefers models supporting `ultra` or `max`, and then chooses `ultra` before `high` (`src/routing-policy.ts:CodexRoutingPolicy`).

Thus an explicit `Low-Medium` line can be treated as unspecified, after which an architecture-classified prompt can produce an Ultra recommendation. The exact UI display path is UNKNOWN without a runtime request containing the reported prompt and live capability catalog; a small probe should compare `/api/route/preview` decision, `constraints`, `rationale`, and the rendered label. Other possible contributors are a UI model label that combines model and effort, or a prompt whose `MODEL` line does not exactly match the live catalog. No source evidence shows an alias converting `low-medium` directly to `ultra`.

## 5. EXPLICIT INTENT PRECEDENCE

The intended precedence is partially implemented. `recognizeRouteConstraints()` extracts only explicit, known dimensions; `computeContextAwareRoute()` and `resolveCoachAuto()` preserve recognized dimensions while filling omissions. Tests in `test/q2-10e-b-explicit-human-intent.test.mjs` cover independent Player/model/effort constraints, malformed/unknown values, structured aliases, preview/dispatch parity, and explicit low effort.

This is not yet a general precedence system for every human wording. Unknown or unsupported explicit values are dropped, so inference can fill them. MANUAL UI selections are authoritative for the exact instance, with `auto` only resolving dimensions the human left automatic. A future contract should make the precedence explicit: validated prompt field > validated UI selection (or define UI as higher when it conflicts) > structured context > policy default; invalid/conflicting explicit values must remain visible as Unknown/error rather than silently becoming defaults.

## 6. CURRENT PLAY HEADER CONTRACT

There is a semi-formal routing header, not a complete schema. `route-constraints.ts` recognizes labels/aliases for Player (`AGENT`, `PLAYER`, etc.), `MODEL`, and effort (`EFFORT`, `REASONING / EFFORT`, `THINKING`, etc.) within the first 15 meaningful, unfenced lines. Values must match live aliases. `ROLE`, `TASK TYPE`, `DIFFICULTY`, `GAME`, `STAGE`, and `TIMESTAMP` are not parsed as execution constraints. `play-analyzer.ts` derives task type/difficulty heuristically from prose.

Minimum execution contract: Player/provider, model, and effort. Task type/difficulty are routing hints; role/stage/game/timestamp are descriptive or provenance fields unless a future schema assigns behavior. Authority and report destination should remain dispatch metadata, not free-form prompt authority.

## 7. CURRENT REPORT METADATA CONTRACT

`src/report-provenance.ts` provides a compact invisible HTML comment: `gameId`, `clientRef`, `playerInstanceId`, `playerType`, `provider`, `model`, `effort`, and ISO `at`. `parseReportProvenance()` reads only the first 4096 bytes, drops malformed/oversized/invalid instance data, and treats absent/partial data as Unknown. `buildReportProvenanceInstruction()` gives the controlled Player an exact line to copy or replace. `src/server.ts` parses it and `work-ledger.ts` uses it for conservative attribution.

This is machine-readable and human-invisible, but reports currently do not have a canonical machine header for role, task type, difficulty, stage, or report destination. A future small frontmatter/comment block is appropriate; it should not replace the execution marker or make human reports noisy.

## 8. NORMALIZATION / ALIAS FINDINGS

Label aliases are broad and typo-tolerant only for labels; values are intentionally strict. Provider-native values must remain provider-specific. Recommended V1 canonical effort set is the intersection actually supported by each live catalog (`low`, `medium`, `high`, plus `xhigh`, `max`, or `ultra` only where the provider exposes them). Human aliases such as `extra high` → `xhigh` may be bounded; `quick`, `conservative`, `strongest`, `architecture`, and `worker` are hints, not effort values. `Low-Medium` should either be preserved as an explicit range/Unknown or mapped by an explicitly documented rule; it must never silently become Ultra. Unknown and ambiguous aliases remain Unknown.

## 9. PLAYER VS MODEL VS EFFORT

These are separate throughout `PlayerRoutingCapability`, `RoutingDecision`, dispatch protocol, provider controls, and report provenance. `playerInstanceId` identifies the exact seat; `playerType/provider` identifies the provider; `model` is a provider catalog ID; `effort` is a provider-supported per-Play setting. Dangerous coupling exists in user-facing labels (`fieldLabel` may combine Player, model, and effort) and in Codex architecture policy, where strongest model preference and `ultra` effort are selected together. Those are presentation/policy choices, not a reason to collapse dimensions in the contract.

## 10. DIFFICULTY VS EFFORT

They are distinct in source. `analyzePlay()` derives `easy|medium|hard` from task words, size, and risk; provider policies map that classification to model/effort recommendations. A Play can legitimately be `medium` difficulty with `low` effort, or hard with a provider that lacks high effort. Current code can still make them appear coupled because policy defaults are selected from difficulty and route rationale says “high for a hard Play.” The machine contract should retain both fields independently.

## 11. AUTO RESPONSIBILITY

- Fully explicit, valid dimensions: preserve them; infer only missing dimensions.
- Partially explicit: constrain exact known Player/model/effort independently, then policy-fill omissions within the constrained catalog.
- Absent: classify and select by provider preference/policy.

Current architecture supports this for recognized values, but unsupported explicit values are indistinguishable from absent values. That is the primary contract gap.

## 12. MANUAL MODE PRECEDENCE

MANUAL and AUTO share `DispatchOptions`, `RoutingDecision`, provider catalogs, and `resolveCoachAuto()`. Manual Player selection is exact; `model:'auto'`/`effort:'auto'` resolve only for that instance. Explicit model/effort selections remain intact. Terminal is a direct-shell exception with no model/effort. This is a good shared foundation; the missing piece is a common validated metadata object rather than separate prose parsing and UI selection paths.

## 13. REPORT DESTINATION INTERFACE

The future GameFilesystemContract should supply the dispatch layer with a canonical Game-relative reports root and provider lane. Dispatch should pass the exact destination/lane and required provenance as machine metadata/instruction, rather than asking a Player to rediscover `Reports`, `Docs REPORT`, or `Reports-SLC`. The existing provenance marker already carries Game, instance, provider, model, effort, and timestamp; the destination path is currently inferred by filesystem scanning and should be added only through the canonical bootstrap interface.

## 14. SOP VS MACHINE CONTRACT

Free-form SOP prose must not be the sole parser source. Keep a code-owned schema/normalization module for execution fields and generate a concise SOP section/documentation from it, or validate a checked-in JSON schema used by both code and docs. Human guidance can explain role/task/difficulty, but recognized Play/report fields and allowed effort values need one machine source of truth.

## 15. UNKNOWN / ERROR BEHAVIOR

Unknown model/provider/effort, ambiguous aliases, conflicting fields, unavailable explicit targets, and missing required report metadata should remain visibly Unknown or produce a clear route error. Do not silently upgrade/downgrade explicit intent. If an explicit model is unavailable, offer Manual/catalog correction or require the human to revise the Play; only a documented fallback policy may substitute.

## 16. TEST COVERAGE / MISSING REGRESSIONS

Existing coverage includes:

- `test/q2-10e-b-explicit-human-intent.test.mjs`: structured fields, aliases, strict values, explicit constraints, preview/dispatch parity.
- `test/q2-10a-provider-control.test.mjs`, `test/q2-10b-routing-and-roster.test.mjs`, `test/q2-10c-controlled-print.test.mjs`: provider catalogs, model/effort controls, per-Play flags, defaults, terminal behavior.
- `test/q2-10e-a-explicit-execution-provenance.test.mjs` and `test/q2-10d-context-aware-auto.test.mjs`: report provenance and attribution.
- `test/q2-10c-work-ledger.test.mjs`, `test/q2-9c-auto-single-player.test.mjs`: AUTO route decisions and ledger evidence.

Missing regression: an exact Play beginning `AGENT: Codex`, `MODEL: GPT-5.6 Sol`, `REASONING / EFFORT: Low-Medium` against a catalog that offers GPT-5.6 Sol with low/medium/ultra must either preserve a documented Low-Medium range/normalization or return explicit Unknown; it must not surface Ultra merely because the value was dropped. Add tests for conflicting prompt/UI fields, unsupported explicit model, and UI rendering that separates model from effort.

## 17. PROPOSED V1 MACHINE CONTRACT

Fields: `playerType`/`playerInstanceId`, `model`, `effort`, optional `taskType`, `difficulty`, `role`, `stage`, and report provenance (`gameId`, client/turn, timestamp). Canonical effort values are provider catalog IDs; aliases are bounded and provider-validated. Precedence is validated explicit intent, then structured context, then AUTO policy/default. AUTO fills only unspecified dimensions. MANUAL selections are authoritative for the chosen instance. Reports carry the invisible execution provenance marker and optionally a small human-safe descriptive header. Invalid values remain Unknown/error.

## 18. QUESTIONS OPUS MUST DECIDE

1. Is `Low-Medium` a permitted range, and if so does it map to low, medium, or a separate value?
2. Is `ultra` a provider effort, a UI tier, or both; how should combined labels be displayed?
3. When prompt metadata conflicts with UI Manual selections, which explicit source wins?
4. Should reports add role/task/difficulty/stage, or keep only execution provenance?
5. Should report destination be stamped into the provenance marker or supplied as separate dispatch metadata?
6. Should the machine contract live in TypeScript plus generated SOP, JSON schema, or another synchronized source?

## 19. EXACT SOURCE FILES / FUNCTIONS OPUS SHOULD READ

- `src/control-plane/route-constraints.ts`: field aliases, first-15-line parsing, strict effort regex, recognized constraints.
- `src/routing-policy.ts`: `computeAutoRoute`, provider policies, `resolveCoachAuto`, context-aware route.
- `src/play-analyzer.ts`: task classification, difficulty/risk, default provider settings.
- `src/capability-types.ts`: capability, RouteConstraints, RoutingDecision contracts.
- `src/control-plane/router.ts`: preview/dispatch parity, Manual resolution, terminal stripping, provenance injection.
- `src/control-plane/daemon.ts`: `/api/route/preview`, `/api/dispatch`, `buildRouting`.
- `src/report-provenance.ts`, `src/server.ts`, `src/control-plane/work-ledger.ts`: report marker parsing and attribution.
- `src/player-control/codex-app-server.ts`, `src/player-control/structured-print.ts`, `src/provider-control.ts`: provider-native model/effort vocabulary and flags.
- `src/public/index.html`: route preview/rendering and dispatch payload assembly.

## 20. FINAL SCOUT VERDICT

The routing stack is already close to a safe explicit-intent contract: dimensions are separate, preview and dispatch share decisions, and reports carry truthful execution provenance. The concrete weakness exposed by the field report is bounded vocabulary loss—`Low-Medium` is not accepted—followed by policy fallback that can select Codex’s strongest architecture effort. Standardize validated fields and aliases, preserve Unknown, and add the exact regression before changing routing behavior.
