# Scout Reconnaissance Report: Player Card Model + Effort

**SCOUT PLAY ID:** `Scout-Formation__2026-09-17_093210_987_MDT`  
**CANONICAL PLAY HASH:** `sha256:ce481be34152a81ae4cce6b6e7319b4fd186ed1fa7322d7d10b2dbd96e96bcdf`  
**TASK CLASS:** `formation-reconnaissance`  
**GAME ROOT:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  

---

### Executive Answer

Dynamic model and reasoning effort discovery **already exists and operates in Sideline Coach** across all three AI providers (`Codex`, `Claude`, `AntiGravity`). Furthermore, runtime adapters (`CodexAppServerControl` and `StructuredPrintControl`) already track active models and effort levels, and the Control Plane daemon already projects them into `capabilities` and `controls` payloads.

However, this truth **does not currently reach the Player Card UI** because of a disconnection in the roster presentation pipeline:
1. `PlayerRoster.status()` projects roster instances for the UI without forwarding `control.model` or `control.effort`.
2. `PlayerRoster.handleControlEvent()` listens for turn and channel events but discards incoming `settings` events where updated model and effort are broadcast.
3. The front-end Player Card renderer in [src/public/index.html](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3304-L3320) constructs card text via `makePlayerText(displayName, 'On Field', playerCapability(instance))`, where `playerCapability()` strictly returns the static string `'Controlled'` (or `'Adopted'` / `'External'` / `'Terminal'`).
4. The pseudoterminal attached to the player ([src/controlled-player-presentation.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/controlled-player-presentation.ts#L28-L31)) **already displays this exact line** (`Runtime <ver> · <model> · <effort>`), proving the underlying control layer holds the necessary facts.

The smallest truthful seam to display Model + Effort on Player cards requires no new network or RPC plumbing; it only requires piping the existing `control.model` and `control.effort` through `PlayerRoster.status()` (or joining with `capabilities` in the client) and rendering them on the card.

---

### FACTS

1. **Where Model Identity is Discovered and Known:**
   - **Codex**: Discovered dynamically via JSON-RPC method `model/list` in [`CodexAppServerControl.queryCapabilities()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L506-L522), parsed into `ModelDescriptor[]` by [`normalizeCodexCapabilities()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L761-L812). Session model identity is returned by `thread/start` and `thread/resume` in `response.model` ([src/player-control/codex-app-server.ts#L280](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L280), [L420](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L420)).
   - **Claude**: Discovered via local probe `claude -p '/model' --no-session-persistence` in [`probeClaudeControls()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-roster.ts#L43-L76) and [`claudeDialect().probeCapabilities()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L181-L191), parsed by [`parseClaudeModelStatus()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L106-L120). Turn-level model identity is emitted by Claude's stdout stream-json `init` frame (`{ type: 'system', subtype: 'init', model }`), parsed by [`parseClaudeFrame()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L198-L202).
   - **AntiGravity**: Discovered via local probe `agy models` in [`probeAntiGravityControls()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-roster.ts#L90-L108) and [`antigravityDialect().probeCapabilities()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L288-L293), parsed by [`parseAntiGravityModels()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L239-L252). Turn-level model identity is emitted by AntiGravity's stream-json `init` frame (`{ event: 'init', init: { model } }`), parsed by [`parseAntiGravityFrame()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L299-L302).
   - **Terminal Player**: Shell only (`executionType: 'direct-shell'`). Has no model by design ([src/capability-types.ts#L48-L51](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/capability-types.ts#L48-L51)).

2. **Where Effort / Reasoning Level is Discovered and Known:**
   - **Codex**: Discovered via `model/list` parsing `raw.supportedReasoningEfforts` and `raw.defaultReasoningEffort` in [`normalizeCodexCapabilities()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L779-L787). Session reasoning effort is returned by `thread/start` and `thread/resume` in `response.reasoningEffort` ([src/player-control/codex-app-server.ts#L281](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L281), [L421](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L421)).
   - **Claude**: Discovered via local probe `claude -p '/effort' --no-session-persistence` parsed by [`parseClaudeEffortLevels()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L123-L127) (`low|medium|high|xhigh|max`). Current configured default effort is parsed from `/model` output (`(effort: <level>)`). Passed per-turn via `--effort <level>` in [`claudeDialect().turnArgs()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L165).
   - **AntiGravity**: Reasoning effort variants are encoded in CLI model IDs (e.g. `gemini-3.8-flash-low|medium|high`), parsed by [`parseAntiGravityModels()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L246-L249). [`antigravityModelArgs()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L389-L406) maps family + effort to the matching variant, defaulting to `medium`.

3. **Controlled Player / Provider Adapters Exposing That Truth:**
   - [`CodexAppServerControl`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L416-L428) implements `PlayerControl`: exposes `readonly model?: string` and `readonly effort?: string`.
   - [`StructuredPrintControl`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L449-L451) (used for Claude and AntiGravity) implements `PlayerControl`: exposes `model?: string` and `effort?: string`.
   - Both adapters emit `ControlEvent` of kind `'settings'`: `{ kind: 'settings', model, effort, runtimeVersion }`.

4. **Survival into Player Instance / Roster Projections:**
   - Survives into `PlayerRoutingCapability`: [`PlayerRoster.getRoutingCapabilities()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-roster.ts#L1267-L1268) populates `activeModel: control?.model` and `activeEffort: control?.effort`.
   - Survives into Control Plane status capabilities: [`daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2709-L2720) maps capabilities through [`projectInstanceControls()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L455-L473), yielding `controls.model.currentLabel` and `controls.effort.currentLabel`.
   - **DOES NOT SURVIVE** into `PlayerInstanceProjection` or `PlayerRoster.status()`:
     - [`PlayerInstanceProjection`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-instances.ts#L5-L14) has only `{ instanceId, playerType, seat, fieldLabel, ownership, onField }`.
     - [`PlayerRoster.status()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-roster.ts#L323-L332) returns `{ ...this.controlledProjection(...), controlMode: 'controlled', permissionSetting, transport, controlState, stateMessage, turnState }`, completely omitting `model` and `effort`.

5. **Player Card UI State:**
   - In [src/public/index.html](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3304-L3320), the card is created from `instances` (mapped from `status.players`), calling `makePlayerText(playerDisplayName(instance), onField ? 'On Field' : 'On Bench', playerCapability(instance))`.
   - `playerCapability()` ([src/public/index.html#L1885-L1894](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L1885-L1894)) inspects only `instance.transportLabel || instance.transport` and returns `'Controlled'`.
   - Result: Player card line 1 is `"Codex 2"`, line 2 is `"On Field · Controlled"`. Model and Effort are not rendered on the card at all.

---

### INFERENCES

1. **`PlayerRoutingLabel` in `player-instances.ts` was an abandoned early seam:**  
   [src/player-instances.ts#L4](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-instances.ts#L4) defines `interface PlayerRoutingLabel { model?: string; effort?: string; }`, and `fieldLabel()` formats `${label} · ${details.join(' · ')}`. However, `record.routing` is never written anywhere in the repository. This proves the intention existed to append model/effort to `fieldLabel`, but was never completed.
2. **Scoreboard separation is clean:**  
   The roadmap and architecture breadcrumbs ([Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md#L357](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/Docs%20ANCHOR/ARCHITECTURE-BREADCRUMBS.md#L357), [L959-L963](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/Docs%20ANCHOR/ARCHITECTURE-BREADCRUMBS.md#L959-L963)) define the Persistent Bottom Scoreboard as an awareness surface for the active Play/execution lifecycle and capacity. Player cards represent team roster membership/readiness. Adding Model + Effort to the Player card does not collide with Scoreboard state as long as it displays the configured/assigned capability of that roster player rather than execution progress.

---

### UNKNOWNS

1. **Unassigned / Idle Player Card State for Claude & AntiGravity:**  
   When a Controlled Claude or AntiGravity player is first opened before any Play is dispatched, `control.model` and `control.effort` are `undefined` until the first turn or until explicitly chosen. Static capability discovery knows the provider defaults (`defaultModelId`, `defaultEffort`), but whether the Player card should show `Provider Default` or the catalog default (e.g. `Gemini 3.8 Flash - Medium`) prior to first Play delivery requires human UX decision.
2. **Live Effort Feedback from Claude / AntiGravity CLI:**  
   Neither Claude's `init` frame nor AntiGravity's `init` frame outputs a dedicated `effort` property during turn initialization (unlike Codex's `reasoningEffort`). The adapters currently record the effort passed into `deliver()`. If Claude or AntiGravity internally falls back to a different effort level, the CLI structured stream does not explicitly confirm that fallback.

---

### CONTRADICTIONS

1. **VS Code Pseudoterminal vs Web Player Card:**  
   [`ControlledPlayerPresentation.ready()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/controlled-player-presentation.ts#L28-L31) outputs:
   `Runtime ${control.runtimeVersion} · ${control.model ?? 'default model'} · ${control.effort ?? 'default effort'}`  
   to the terminal. But the Player Card on the Sideline web dashboard omits both values, creating an incongruity where the VS Code internal terminal is aware of model + effort, but the user-facing web roster card is not.
2. **`settings` Event Ignored by `PlayerRoster`:**  
   [`PlayerControl`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/contract.ts#L76) emits `kind: 'settings'` with `model` and `effort`, but [`PlayerRoster.handleControlEvent()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-roster.ts#L951-L978) explicitly filters only for `turn` and `channel` events, discarding `settings`.
3. **`status.players` vs `status.capabilities` Payload Parity:**  
   `status.capabilities` carries full instance controls with model and effort labels for dispatching, while `status.players` (the authoritative source for roster rendering) strips this data.

---

### Relevant Files / Symbols

| File Path | Symbol(s) | Relevance |
|:---|:---|:---|
| [src/player-control/contract.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/contract.ts#L76-L84) | `PlayerControl`, `ControlEvent` | Defines `model` and `effort` properties on the live control interface and the `settings` event contract. |
| [src/player-control/codex-app-server.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/codex-app-server.ts#L280-L288) | `CodexAppServerControl`, `normalizeCodexCapabilities` | Discovers Codex models and reasoning efforts, tracks `model` and `effort` on the control instance. |
| [src/player-control/structured-print.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/structured-print.ts#L449-L451) | `StructuredPrintControl`, `claudeDialect`, `antigravityDialect` | Runs CLI commands for Claude and AntiGravity, parses `init` frames for model, sets `this.model` and `this.effort`. |
| [src/provider-control.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/provider-control.ts#L417-L473) | `controlledControlProfile`, `projectInstanceControls`, `effortLabel` | Formats raw model IDs and effort levels into Dad-mode display labels (e.g. `Gemini 3.8 Flash`, `Medium`). |
| [src/player-roster.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-roster.ts#L294-L345) | `PlayerRoster.status()`, `handleControlEvent()` | Assembles the roster snapshot for `/api/status`. Current location where model and effort are dropped. |
| [src/controlled-player-presentation.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/controlled-player-presentation.ts#L28-L31) | `ControlledPlayerPresentation.ready()` | Pseudoterminal mirror that already prints `Runtime ... · <model> · <effort>`. |
| [src/control-plane/daemon.ts](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L2704-L2720) | `getAuthoritativeStatus()` | Projects `capabilities` and `roster` for the client web interface. |
| [src/public/index.html](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3304-L3360) | `renderStatus()`, `makePlayerText()`, `playerCapability()` | Front-end card rendering logic. Receives `status` and creates the DOM elements for each Player card. |

---

### Recommended Next Step

When authorized to implement:
1. **Extend `PlayerRoster.status()`**: For each controlled instance, query `this.controlHost.resolve(instanceId)` and `this.capabilityService.get(playerType)` to attach `modelDisplayName` and `effortLabel` directly to the returned instance object.
2. **Listen to `settings` in `handleControlEvent()`**: Trigger `this.changed.fire()` when a controlled player changes or confirms its model/effort settings.
3. **Update Card DOM in `index.html`**: Update `makePlayerText` or the card rendering loop in `renderStatus` to render the secondary line as:
   `On Field · Controlled`  
   `GPT-5.6 Sol · Medium` (or `Gemini 3.8 Flash · Medium`).

---

### Provenance
- Repository Root: `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
- Execution Mode: Read-Only Reconnaissance (no files created, edited, renamed, or deleted; no shell commands executed).
- Scout Play ID: `Scout-Formation__2026-09-17_093210_987_MDT`
- Canonical Play Hash: `sha256:ce481be34152a81ae4cce6b6e7319b4fd186ed1fa7322d7d10b2dbd96e96bcdf`

**REQUIRED STATEMENT:**  
This report is reconnaissance, not final architectural authority.
