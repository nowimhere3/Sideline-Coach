SCOUT FORMATION RESULT

Play: Scout-Formation__2026-09-17_093210_987_MDT

Objective:
Player Card Model + Effort Reconnaissance

Investigate the current Sideline Coach architecture for displaying the actual model and effort/reasoning level used by Controlled Players.

The human wants Player cards to eventually communicate things like:

Codex 2
GPT-5.6 Sol - Medium

or:

AntiGravity 1
Gemini 3.8 Flash - Medium

without duplicating unrelated Scoreboard information.

Scout the current architecture and determine:
1. Where model identity is currently discovered or known.
2. Where effort/reasoning level is currently discovered or known.
3. Which Controlled Player/provider adapters expose that truth.
4. Whether the information survives into Player instance / roster projections.
5. Whether the Player card UI currently receives either value.
6. What is FACT, inferred, unavailable, or UNKNOWN for each provider.
7. Whether dynamic model/capability discovery already provides most of the required plumbing.
8. The smallest truthful seam for eventually adding Model + Effort to Player cards.
9. Any contradictions between provider capability truth, controlled binding truth, and roster presentation.

Read only. Do not implement Model + Effort UI during this reconnaissance.

Scouts requested: 2
Completed: 1
Failed: 0
Blocked: 0
Interrupted: 1
Unknown: 0
Outcome: PARTIAL

AntiGravity:
COMPLETE
model: gemini-3.8-flash-medium
report: C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Scout Only\Formations\Scout-Formation__2026-09-17_093210_987_MDT\antigravity-SCOUT-REPORT.md

Big Pickle:
INTERRUPTED
model: opencode/big-pickle
report: none
failure boundary: Formation dispatch did not complete successfully.

Combined findings:
1 of 2 Scouts completed with a structurally usable report. Independent findings and any self-reported contradictions are preserved below; cross-Scout synthesis beyond this mechanical index requires human or Architect review.

Unique findings:
- AntiGravity: Dynamic model and reasoning effort discovery **already exists and operates in Sideline Coach** across all three AI providers (`Codex`, `Claude`, `AntiGravity`). Furthermore, runtime adapters (`CodexAppServerControl` and `StructuredPrintControl`) already track active models and effort levels, and the Control Plane daemon already projects them into `capabilities` and `controls` payloads.

However, this truth **does not currently reach the Player Card UI** because of a disconnection in the roster presentation pipeline:
1. `PlayerRoster.status()` projects roster instances for the UI without forwarding `control.model` or `control.effort`.
2. `PlayerRoster.handleControlEvent()` listens for turn and channel events but discards incoming `settings` events where updated model and effort are broadcas

Contradictions (self-reported, not averaged into consensus):
- AntiGravity: 1. **VS Code Pseudoterminal vs Web Player Card:**  
   [`ControlledPlayerPresentation.ready()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/controlled-player-presentation.ts#L28-L31) outputs:
   `Runtime ${control.runtimeVersion} · ${control.model ?? 'default model'} · ${control.effort ?? 'default effort'}`  
   to the terminal. But the Player Card on the Sideline web dashboard omits both values, creating an incongruity where the VS Code internal terminal is aware of model + effort, but the user-facing web roster card is not.
2. **`settings` Event Ignored by `PlayerRoster`:**  
   [`PlayerControl`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/player-control/contract.ts#L76) emits `kind: 'settings'` with `model` and `effort`, but [`PlayerRoster.handleControlEvent(

Failed / blocked Scouts:
- Big Pickle: Formation dispatch did not complete successfully.

Recommended next step: Review the preserved independent Formation reports; forward to an Architect if a repair decision is warranted.

Evidence: C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Scout Only\Formations\Scout-Formation__2026-09-17_093210_987_MDT

