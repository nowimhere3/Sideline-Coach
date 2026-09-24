# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION FAILED · 0/2 lanes completed · 2 substitutions · elapsed 00:00:05

Play: terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048
Rerun of: terminal-ux-routing-recon-20260920-113635 (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-20T20:50:48.237Z
Finished: 2026-09-20T20:50:53.613Z
TOTAL ELAPSED TIME: 00:00:05

Scouts requested: 2
Completed: 0
Failed: 2
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 2
Total receiver attempts: 4
Substitutions: 2
Outcome: FAILED

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scout-a-settings-retention | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-20T20:50:48.269Z | 2026-09-20T20:50:51.070Z | 00:00:02 | FAILED | PROVIDER UNAVAILABLE [availability] | replaced by sideline-scout-balanced | none |
| scout-a-settings-retention | 2 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-20T20:50:51.116Z | 2026-09-20T20:50:53.496Z | 00:00:02 | FAILED | PROVIDER UNAVAILABLE [availability] | substituted for sideline-scout-quick | none |
| scout-b-discovery-routing | 1 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-20T20:50:48.446Z | 2026-09-20T20:50:51.128Z | 00:00:02 | FAILED | PROVIDER UNAVAILABLE [availability] | replaced by sideline-scout-deep | none |
| scout-b-discovery-routing | 2 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-20T20:50:51.171Z | 2026-09-20T20:50:53.608Z | 00:00:02 | FAILED | PROVIDER UNAVAILABLE [availability] | substituted for sideline-scout | none |

## SUBSTITUTION CHAIN

- Lane scout-a-settings-retention: Cohere: North Mini Code (free) (sideline-scout-quick) → NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → NO ELIGIBLE SUBSTITUTE REMAINED
    - Cohere: North Mini Code (free) (sideline-scout-quick) benched: PROVIDER UNAVAILABLE — The upstream provider or service failed. (Error: {)
    - NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) benched: PROVIDER UNAVAILABLE — The upstream provider or service failed. (Error: {)
- Lane scout-b-discovery-routing: Poolside: Laguna S 2.1 (free) (sideline-scout) → NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → NO ELIGIBLE SUBSTITUTE REMAINED
    - Poolside: Laguna S 2.1 (free) (sideline-scout) benched: PROVIDER UNAVAILABLE — The upstream provider or service failed. (Error: {)
    - NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) benched: PROVIDER UNAVAILABLE — The upstream provider or service failed. (Error: {)
- Lane scout-a-settings-retention: no eligible substitute remained after sideline-scout-balanced (PROVIDER UNAVAILABLE).
    - not used: sideline-scout-quick — Already attempted for this lane.
    - not used: sideline-scout — Already fielded on another lane in this Formation.
    - not used: sideline-scout-balanced — Already attempted for this lane.
    - not used: sideline-scout-deep — Already fielded on another lane in this Formation.
- Lane scout-b-discovery-routing: no eligible substitute remained after sideline-scout-deep (PROVIDER UNAVAILABLE).
    - not used: sideline-scout-quick — Already fielded on another lane in this Formation.
    - not used: sideline-scout — Already attempted for this lane.
    - not used: sideline-scout-balanced — Already fielded on another lane in this Formation.
    - not used: sideline-scout-deep — Already attempted for this lane.

## DISCOVERIES BY PLAYER

No Scout completed, so there are no discoveries to attribute.

## COMBINED FORMATION FINDINGS

0 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

## FAILED / BLOCKED ATTEMPTS

- Lane scout-a-settings-retention · attempt 1 · Cohere: North Mini Code (free) (sideline-scout-quick) · openrouter/cohere/north-mini-code:free: FAILED [PROVIDER UNAVAILABLE] · elapsed 00:00:02 — The upstream provider or service failed. (Error: {)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-a-settings-retention\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-a-settings-retention\stdout.log
- Lane scout-a-settings-retention · attempt 2 · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · openrouter/nvidia/nemotron-3-super-120b-a12b:free: FAILED [PROVIDER UNAVAILABLE] · elapsed 00:00:02 — The upstream provider or service failed. (Error: {)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-a-settings-retention\stderr.attempt-2.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-a-settings-retention\stdout.attempt-2.log
- Lane scout-b-discovery-routing · attempt 1 · Poolside: Laguna S 2.1 (free) (sideline-scout) · openrouter/poolside/laguna-s-2.1:free: FAILED [PROVIDER UNAVAILABLE] · elapsed 00:00:02 — The upstream provider or service failed. (Error: {)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-b-discovery-routing\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-b-discovery-routing\stdout.log
- Lane scout-b-discovery-routing · attempt 2 · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · openrouter/nvidia/nemotron-3-ultra-550b-a55b:free: FAILED [PROVIDER UNAVAILABLE] · elapsed 00:00:02 — The upstream provider or service failed. (Error: {)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-b-discovery-routing\stderr.attempt-2.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048\scout-b-discovery-routing\stdout.attempt-2.log

## CONTRADICTIONS

None reported by the surviving Scouts. (Absence of a reported contradiction is not proof there is none.)

## UNKNOWN / UNFILLED TERRITORY

These lanes returned no completed report. Absence is not success, and nothing in this report speaks for them:

- scout-a-settings-retention: FAILED. Objective: READ-ONLY RECONNAISSANCE. Repository: C:\Users\dmcal\Documents\GitHub\SidelineCoach. Do not modify source, implement, commit, push, reset, stash, clean, install, or reorganize. S48-S50 already settled and field-proved Terminal Player live output. FIELD EVIDENCE: git status works; multi-second output streams live; long output remains inspectable; very fast Plays may finish before Dad can inspect them; raw powershell/node/adoptable discoveries clutter Check Players; normal Terminal must remain recruitable. PRODUCT DIRECTION: map Dev Mode and View Player Terminal settings; Advanced Player Discovery must be Dev Mode-only, default OFF, hide developer discoveries without destroying underlying discovery truth; map configurable Terminal evidence retention including manual Collapse, Copy, next Play, report discovery, full history, and user-selected post-completion duration; Read is not dismissal and Copy is not inherently dismissal; map future AUTO routing for unambiguously terminal-only intent while reasoning prompts remain AI work; explicit human routing always wins and Terminal command safety remains authoritative. Separate FACT, FIELD EVIDENCE, INFERENCE, UNKNOWN and return exact files, symbols, seams, risks, contradictions and smallest implementation boundaries. Do not implement. LANE A: prioritize Dev Mode settings, View Player Terminal, Terminal settings grouping, consolePinnedByInstance, Expand/Collapse, completion lifecycle, fast-command disappearance, Copy All/Copy New, playRef/session changes, report visibility/dismissal, exact browser/settings/state seams, and the cleanest ownership layer for configurable retention.
- scout-b-discovery-routing: FAILED. Objective: READ-ONLY RECONNAISSANCE. Repository: C:\Users\dmcal\Documents\GitHub\SidelineCoach. Do not modify source, implement, commit, push, reset, stash, clean, install, or reorganize. S48-S50 already settled and field-proved Terminal Player live output. FIELD EVIDENCE: git status works; multi-second output streams live; long output remains inspectable; very fast Plays may finish before Dad can inspect them; raw powershell/node/adoptable discoveries clutter Check Players; normal Terminal must remain recruitable. PRODUCT DIRECTION: map Dev Mode and View Player Terminal settings; Advanced Player Discovery must be Dev Mode-only, default OFF, hide developer discoveries without destroying underlying discovery truth; map configurable Terminal evidence retention including manual Collapse, Copy, next Play, report discovery, full history, and user-selected post-completion duration; Read is not dismissal and Copy is not inherently dismissal; map future AUTO routing for unambiguously terminal-only intent while reasoning prompts remain AI work; explicit human routing always wins and Terminal command safety remains authoritative. Separate FACT, FIELD EVIDENCE, INFERENCE, UNKNOWN and return exact files, symbols, seams, risks, contradictions and smallest implementation boundaries. Do not implement. LANE B: prioritize terminal discovery source, powershell/node/adoptable Player discovery, Check Players projection/filtering, adoption path, Dad-safe visibility gate, Advanced Player Discovery seam, AUTO dispatcher, explicit-route precedence, Player eligibility, Terminal manual-only policy, command-safety boundary, dispatch/refusal path, and the smallest future change for terminal-only AUTO routing.

## CHILD REPORTS

No child report exists.

## Recommended next step

No Scout completed. Investigate the failure evidence above before retrying; every attempt is preserved.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-145048

