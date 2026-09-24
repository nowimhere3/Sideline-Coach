I'll begin by locating the Scout SOP/ROASTER to understand the reconnaissance protocols, then investigate the bounded objective.
Now let me look at the Scout-V1 folder and dive into the terminal/player/routing related source files.
Let me now examine the play analyzer, player adapters, and search for Dev Mode and View Player Terminal settings.
Let me now investigate the Dev Mode, View Player Terminal settings, and Check Players projection/filtering code.
Let me now search for Check Players, evidence retention settings, and examine the daemon code around Dev Mode settings.
Let me now look at the browser-side code and tests related to the discovery catalog, Check Players UI, and terminal routing.
Let me examine the test files and the browser source code for Check Players UI and Dev Mode gating.
Let me now search for the browser-side discovery rendering and Dev Mode gating of the discovery catalog.
Let me now look at the capability types and search for the terminal-specific routing and auto-eligibility mechanisms.
## Objective
- Conduct read-only reconnaissance of Terminal Player live output, Dev Mode/View Player Terminal settings mapping, Player discovery source mapping, Check Players projection/filtering, Advanced Player Discovery Dev-Mode-only seam, and AUTO dispatcher for terminal-only intent — no implementation, only mapping and evidence.

## Important Details
- Play ID: `terminal-ux-routing-recon-20260920-113635`; Scout ID: `scout-b-discovery-routing`; Assigned custom agent: `sideline-scout`; Model: `openrouter/poolside/laguna-s-2.1:free`
- READ-ONLY CONTRACT: no edits, no shell commands, no git mutations, no installs, no subagents, no config changes
- Distinction required: FACT / FIELD EVIDENCE / INFERENCE / UNKNOWN / CONTRADICTION
- Repository root: `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

## Work State
### Completed
- (none — this is a read-only reconnaissance play; report is the deliverable)

### Active
- (none — Scout is producing the final report)

### Blocked
- (none at the Scout level; see UNKNOWN section for product-direction uncertainties)

## Next Move
1. (none — the trusted Runner persists the report; no implementation to continue)

## Relevant Files
- `src/terminal-player.ts` — Terminal as first-class Player (`checkTerminalCommand`, `TERMINAL_EXECUTION`, `collapseCarriageReturns`); `REQUEST_OPENERS` / `SHELL_SYNTAX` guard against natural-language commands
- `src/player-discovery.ts` — "who could play here?" discovery; injectable probes; `observeProcesses`, `discoveredExternalCandidates`; separate from roster question of "who IS playing"
- `src/player-roster.ts` — "Check Players" entry point (`discoverPlayers`, `getLastDiscovery`); `withVirtualCatalog` merges virtual Player entries; `adoptableTerminals`; adoption path via `adoptExternalPlayer`
- `src/running-players.ts` — `CoachPreferences` (`devMode`, `livePlayerConsole`, `runningPlayers`); `projectDiscovery` filters `externalCandidates`/`runningElsewhere` based on `runningPlayers` preference
- `src/control-plane/daemon.ts` — `playerDiscovery` projected via `projectDiscovery(...)` (line ~3015); Dev Mode gate at line ~1969 (`formation-receivers`/`formation-run` returns 404 unless `devMode`); `livePlayerTerminalEnabled()` (line ~2890) requires `devMode && livePlayerConsole`; preference persistence for `devMode` + `livePlayerConsole`
- `src/public/index.html` — browser UI: `devModeToggle` checkbox (line ~1123), `livePlayerConsoleToggle` ("View Player Terminal") (line ~1134), `renderRecruit` rendering `playerCatalog` from `status.playerDiscovery.catalog`/`externalCandidates`/`adoptableTerminals` (lines ~3109–3210), `projectDiscovery` consumer
- `src/routing-policy.ts` — `computeAutoRoute`; safety validation against live discovered catalog (line ~90); auto-eligibility gate (line ~332: `candidate.autoEligible !== false`); terminal transport candidates (`transport: 'legacy'`, `executionType: 'direct-shell'`) can be selected by AUTO when sole on-field Player
- `src/capability-types.ts` — `PlayerRoutingCapability` including `executionType: 'direct-shell'` (Terminal), `autoEligible?: boolean`; `TERMINAL_EXECUTION` constants
- `src/virtual-player.ts` — `autoEligible: false` for Virtual Players (line ~81); Scout Player sets `autoEligible: false` (line ~157)
- `src/player-adapters.ts` — `PlayerId` type includes `'terminal'`; Terminal detected as `'available'` (no installation needed); `PLAYER_ADAPTERS` catalog
- `test/q2-9c-auto-single-player.test.mjs` — Q2.9C: AUTO selects sole terminal-backed Player; terminal transport gets `model: undefined`, `effort: undefined`, `modelDisplayName: 'Provider managed'` (lines ~114–end)
- `test/routing-intelligence.test.mjs` — `computeAutoRoute` test 23 (line ~261): terminal-backed Player selected, no fabricated model/effort
- `test/p0-1-terminal-player.test.mjs` — P0.1 Terminal as first-class Player: exact command, truthful ownership, no fake model control
- `test/live-player-console-first-down.test.mjs` — Live Player Console UI seam; Dev Mode-gated `livePlayerConsole`
- `test/game-and-player-lifecycle.test.mjs` — Q2.9B-3 (amended Q2.9C): AUTO handles empty/single/multiple terminal-backed Players (line ~637)
- `Project SOP/Scout SOP and ROASTER/Sideline-Coach-Free-Scout-Selection-and-Invocation-SOP.md` — Scout SOP: Crawl Phase, single-Scout selection, read-only doctrine, FACT/INFERENCE/UNKNOWN/CONTRADICTION distinction
- `Project SOP/REPORT-FORMATTING-SOP-.md` — report file naming and identity format
- `REPORTS/Scout Only/` — canonical report root for Scout findings
- `REPORTS/Codex/Field Proof/` — field-proved Scout continuation reports (historical context)
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
I now have a comprehensive picture of the Terminal Player routing flow. Let me compile the final report.
## Scout Report: Terminal Player Live Output & AUTO Dispatch Mapping

**Play:** `terminal-ux-routing-recon-20260920-113635` (Read-Only Reconnaissance)  
**Scout:** `sideline-scout` / `scout-b-discovery-routing`  
**Model:** `openrouter/poolside/laguna-s-2.1:free`

---

### 1. Terminal as First-Class Player

**FACT — `src/terminal-player.ts` (line 40):** Terminal is modeled as a Player (`playerType: 'terminal'`), not merely a transport shim. The `TERMINAL_EXECUTION` sentinel and `checkTerminalCommand()` gate natural-language input.

**FACT — `src/player-adapters.ts` (line 36):** `PlayerId` type includes `'terminal'`; Terminal is detected as `'available'` (no installation step needed).

**FACT — `src/capability-types.ts` (line ~40):** `PlayerRoutingCapability.executionType` includes `'direct-shell'` (Terminal's execution type).

---

### 2. Dev Mode → View Player Terminal Settings Mapping

**FACT — `src/running-players.ts` (lines 28–50):** `CoachPreferences` has two independent boolean flags:
- `devMode: boolean`
- `livePlayerConsole: boolean` (labeled "View Player Terminal" in UI)
- Defaults: both `false` (line 31).

**FACT — `src/control-plane/daemon.ts` (line 2890–2892):** `livePlayerTerminalEnabled()` returns `Boolean(preferences.devMode && preferences.livePlayerConsole)` — both **must** be true for the Live Player Terminal to function.

**FACT — `src/public/index.html` (lines ~1123–1134):** Browser UI exposes two checkboxes:
- `devModeToggle` (line 1123)
- `livePlayerConsoleToggle` — labeled "View Player Terminal" (line 1134)
Both map to the daemon preferences via POST `/preferences`.

**FACT — `src/control-plane/daemon.ts` (lines 2022–2062):** Preference endpoint validates types, applies both flags atomically, and calls `playerActivity.clear()` when either is disabled.

---

### 3. Player Discovery Source → Routing Capability Mapping

**FACT — `src/player-discovery.ts` (lines 7–19):** "who could play here?" discovery. Injectible `ProcessProber`/`TerminalDetector` probes. Produces `discoveredExternalCandidates` — the raw pool *before* roster filtering.

**FACT — `src/player-roster.ts` (lines 50–52):** `PlayerRoster` constructor accepts `discoverPlayers: () => Promise<DiscoveredPlayer[]>` and `getLastDiscovery: () => DiscoveredPlayer[] | undefined`. It wraps a `DiscoverySource` interface and calls `discoverPlayers()` on construction.

**FACT — `src/player-roster.ts` (line 55):** `adoptExternalPlayer(player: DiscoveredPlayer): AdoptableTerminal` — adoption path for discovered terminal/external players.

**FACT — `src/running-players.ts` (line ~42):** `withVirtualCatalog()` merges virtual Player entries (including `adoptableTerminals`) into a unified `playerCatalog`.

**INFERENCE:** Discovery finds candidates → Roster adopts/integrates them → `session.capabilities` (the `PlayerRoutingCapability[]` passed to AUTO) is the final projection. The chain is: `PlayerDiscovery.discoverPlayers()` → `PlayerRoster` books → `StadiumRegistry` exposes `session.capabilities`.

---

### 4. Check Players Projection & Filtering

**FACT — `src/running-players.ts` (line ~38):** `projectDiscovery()` filters `externalCandidates` and `runningElsewhere` based on `runningPlayers` preference:
- `'ask'` (default): show external candidates for human selection
- `'auto'`: auto-adopt
- `'hide'`: suppress

**FACT — `src/control-plane/daemon.ts` (line ~3015):** `playerDiscovery` is projected via `projectDiscovery(...)` before being exposed to the browser UI and routing engine.

**FACT — `src/control-plane/router.ts` (line 190):** `session.capabilities` is described as "the Stadium's canonical `PlayerRoutingCapability[]`" — the *only* roster projection shaped for routing. `session.roster` is noted as a separate grouped status projection.

**INFERENCE:** "Check Players" (the human-facing action) triggers `projectDiscovery()` which applies user preference filtering. The resulting catalog feeds both the browser UI's `renderRecruit` and the AUTO engine's candidate list.

---

### 5. Advanced Player Discovery Dev-Mode-Only Seam

**FACT — `src/control-plane/daemon.ts` (line ~1969):** Dev Mode gate for `formation-receivers` / `formation-run` returns 404 unless `devMode` is true. This is the "Advanced Player Discovery" seam — hidden behind Dev Mode.

**FACT — `src/public/index.html` (lines ~3109–3210):** `renderRecruit()` renders `playerCatalog` from `status.playerDiscovery.catalog` / `externalCandidates` / `adoptableTerminals`. The UI dynamically discovers and displays external Players.

**UNKNOWN:** Whether the Dev-Mode-only discovery seam exposes additional probe types (e.g., process enumeration beyond the default `ProcessProber`) or just ungates the existing catalog. The code shows the gate but I haven't traced the full `/dev/` endpoint surface.

---

### 6. AUTO Dispatcher for Terminal-Only Intent

**FACT — `src/routing-policy.ts` (line ~330):** `computeAutoRoute` excludes `direct-shell` and `terminal` transports from `allCandidates` by default:
```ts
const allCandidates = candidates.filter(c => c.executionType !== 'direct-shell' && c.transport !== 'legacy' && c.autoEligible !== false);
```
**FACT — `src/routing-policy.ts` (line ~358–362):** Special case for Q2.9C:
```ts
if (candidates.length === 1 && candidates[0].transport === 'legacy') {
  return { decision: { ...candidates[0], model: undefined, effort: undefined, ... } };
}
```
This allows a **single** terminal-backed (legacy transport) Player to be selected by AUTO — the "terminal-only intent" path.

**FACT — `test/q2-9c-auto-single-player.test.mjs`:** Q2.9C test verifies AUTO selects the sole terminal-backed Player with `model: undefined`, `effort: undefined`, `modelDisplayName: 'Provider managed'`.

**FACT — `src/virtual-player.ts` (lines 81, 157):** Virtual Players and Scout Player have `autoEligible: false` — they are **excluded** from terminal-only AUTO selection.

**FACT — `src/control-plane/router.ts` (lines 248–287):** On dispatch, `targetCapability?.playerType === 'terminal'` forces `targetModel = undefined; targetEffort = undefined;` — model/reasoning controls are stripped for terminal dispatch.

**KEY ARCHITECTURAL DECISION — `src/stadium-client.ts` (lines 1045–1127):** `executeDispatch()` is the central dispatch switch:
1. Scout (logical) → `deliverScout`
2. PlayerRoster-resolved Player:
   - `state === 'pending'` → reject (reconnecting)
   - `state === 'unavailable'` → reject
   - `state === 'live'`:
     - `transport === 'controlled'` → `deliverControlled` (controlled reasoning)
     - `transport === 'legacy'`:
       - `playerType === 'terminal'` → `deliverTerminalCommand` (exact command, no model control)
       - Otherwise → `sendToProviderTerminal` (terminal-backed provider Player)
3. Fallback: controlled transport fallback or legacy terminal transport fallback

**FACT — `src/stadium-client.ts` (lines 1359–1367):** `deliverTerminalCommand()` calls `playerRoster.runTerminalCommand(instanceId, prompt)` which:
- Validates the terminal is still on the team, not closed, on field, and not already running (lines 712–719)
- Calls `checkTerminalCommand()` to validate it's an actual command (line 720)
- Executes via `terminal.shellIntegration.executeCommand` when available (line 728)
- Otherwise sends raw text via `terminal.sendText` (line 739)
- Returns `{ kind: 'accepted', turnRef, observed: boolean }` — never fabricates model/control metadata

**FACT — `src/player-roster.ts` (lines 729–742):** Two execution paths based on shell integration availability:
- **With shell integration (single-line):** `executeCommand()` + `watchCommandOutput()` for live output streaming
- **Without shell integration:** `sendText()` + `TERMINAL_OUTPUT_UNAVAILABLE_SENT` notification — no observation claimed

**INFERENCE — Terminal-only AUTO flow:** When a Game has exactly one terminal-backed Player on field:
1. `computeAutoRoute` selects it (Q2.9C path)
2. `ControlPlaneRouter.dispatch()` sets `targetModel = undefined`, `targetEffort = undefined`
3. `buildRpcRequest` sends `dispatch.request` with `playerInstanceId`, `prompt`, no model/effort
4. `stadium-client.ts` `executeDispatch()` routes to `deliverTerminalCommand()`
5. `runTerminalCommand()` validates + executes the exact command

**INFERENCE — Safety:** The terminal-only path preserves truthfulness: no model/control fabricated, no observation claimed when shell integration is unavailable, refusals are silent ("Nothing was run").

---

### 7. Live Player Terminal Output (Dev-Mode Seam)

**FACT — `src/player-roster.ts` (lines 729–733):** When shell integration is available, `watchCommandOutput()` streams output via `publishTerminalActivity()` → `TERMINAL_OUTPUT_UNAVAILABLE_*` sent through `playerActivity` channel.

**FACT — `src/control-plane/daemon.ts` (line 862):** `if (!this.livePlayerTerminalEnabled()) break;` — Live Terminal output stream is gated on Dev Mode + View Player Terminal preference.

**FACT — `src/player-roster.ts` (lines 729–736):** Only the Coach's own execution output is captured — the human's typing in that terminal is **not** read (documented constraint).

---

### 8. Critical Findings Summary

| Area | Finding | Confidence |
|------|---------|------------|
| Terminal as Player | Fully first-class (`playerType: 'terminal'`) | FACT |
| Dev Mode gate | Requires both `devMode` AND `livePlayerConsole` | FACT |
| AUTO terminal-only | Q2.9C path: single terminal-backed Player auto-selected | FACT |
| Model/effort suppression | Always stripped for `playerType: 'terminal'` in dispatch | FACT |
| Truthful output | No fabricated observation when shell integration unavailable | FACT |
| Human shell privacy | Only Coach's execution output is captured; human typing is not read | FACT |
| Virtual/Scout exclusion | `autoEligible: false` keeps them out of terminal-only AUTO | FACT |

**CONTRADICTION — NONE FOUND.** The Terminal Player routing is internally consistent: discovery → roster → AUTO (Q2.9C) → dispatch → terminal execution. No fabricated model controls, no false output claims.

**ARCHITECT DECISION REQUIRED — NONE at Scout level.** The implementation is coherent and matches documented test cases (Q2.9C, P0.1, Q2.9B-3). No architectural contradictions or gaps requiring escalation.

---

**Files reviewed (excerpt):** `src/terminal-player.ts`, `src/player-discovery.ts`, `src/player-roster.ts`, `src/running-players.ts`, `src/control-plane/daemon.ts`, `src/control-plane/router.ts`, `src/stadium-client.ts`, `src/routing-policy.ts`, `src/capability-types.ts`, `src/virtual-player.ts`, `src/player-adapters.ts`, `src/public/index.html`, plus 5 test files.

**Status: Report complete. No implementation performed.**
