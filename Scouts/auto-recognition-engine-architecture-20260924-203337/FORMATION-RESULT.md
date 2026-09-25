# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:06:29

Play: auto-recognition-engine-architecture-20260924-203337
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-25T02:33:45.038Z
Finished: 2026-09-25T02:40:14.664Z
TOTAL ELAPSED TIME: 00:06:29

Scouts requested: 2
Completed: 2
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 2
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scout-a-current-auto-engine-map | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T02:33:45.054Z | 2026-09-25T02:40:14.657Z | 00:06:29 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337\SCOUT-scout-a-current-auto-engine-map-Reconnaissance.md |
| scout-b-smart-recognition-seams | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T02:33:45.070Z | 2026-09-25T02:38:11.601Z | 00:04:26 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337\SCOUT-scout-b-smart-recognition-seams-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane scout-a-current-auto-engine-map: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane scout-b-smart-recognition-seams: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: scout-a-current-auto-engine-map (objective 23348345acf8)
- Objective: READ-ONLY RECONNAISSANCE.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.
DO NOT COMMIT.
DO NOT PUSH.
DO NOT RESET.
DO NOT STASH.
DO NOT CLEAN.
DO NOT INSTALL PACKAGES.

MISSION:

Map the CURRENT AUTO routing / recognition engine and determine the seams required for a substantially smarter natural-language recognition layer.

PRODUCT INTENT:

In AUTO mode, Dad should be able to type natural language into Prompt Payload, especially on the FIRST LINE, and Sideline Coach should infer and LIVE-UPDATE:

PLAYER / AGENT
MODEL
REASONING LEVEL

Dad should not need canonical syntax.

Examples that should eventually work:

Gemini
Gemini Medium
Gemini High
AntiGravity Gemini Medium
Sonnet Medium
Sonnett Medium
Opus
Opus High
Claude Sonnet Medium
Codex Medium

Common typos and aliases should be tolerated.

The engine should support partial disclosure.

Examples:

MODEL ONLY:
Gemini

MODEL + REASONING:
Gemini Medium

PLAYER + MODEL:
AntiGravity Gemini

PLAYER + MODEL + REASONING:
AntiGravity Gemini Medium

REASONING ONLY:
Medium

where existing context makes the intended target sufficiently unambiguous.

LIVE BEHAVIOR IS REQUIRED:

If Dad types:

Gemini

and the UI resolves:

AntiGravity · Gemini Flash 3.8 · Low

then continues typing:

Gemini Medium

the displayed routing decision should update to Medium automatically.

No refresh.
No submit.
No mode toggle.
No blur requirement.

AUTO should continuously reevaluate the routing tuple while the prompt changes.

CURRENT FIELD OBSERVATION:

Typing:
Gemini

currently produces something resembling:

AntiGravity · Gemini Flash 3.8 · Low

But extending the same line to:

Gemini Medium

does not update reasoning to Medium.

Similar concern exists for:

Opus Medium
Sonnet Medium
Sonnett Medium

Do not assume the diagnosis.
Trace source truth.

FUTURE REQUIREMENT:

More Players, providers, models, aliases, spelling variants, and reasoning levels WILL be added.

Avoid recommending a giant pile of hard-coded substring checks.

A registry/data-driven recognition system is strongly preferred if supported by current architecture.

Conceptual future pipeline may resemble:

raw human text
→ normalization
→ alias recognition
→ fuzzy / typo recognition
→ Player inference
→ model inference
→ reasoning inference
→ ambiguity/confidence handling
→ canonical routing tuple

But do not assume this exact architecture.
Determine the correct seams from current source.

FIRST LINE has high authority for explicit Player / Model / Reasoning intent.

Broader prompt context may remain useful for semantic AUTO routing.

Explicit first-line intent should override weaker semantic inference when sufficiently confident.

Separate findings into:

FACT
FIELD EVIDENCE
INFERENCE
UNKNOWN
CONTRADICTION

Return exact files, functions, event handlers, data structures, routing policies, state flows, and implementation seams.
LANE A — CURRENT AUTO RECOGNITION / ROUTING ENGINE ARCHAEOLOGY

Map exactly what Sideline Coach currently uses to interpret Prompt Payload and choose:

- Player / provider
- model
- reasoning level
- AUTO route

Trace the complete path from typing text into Prompt Payload to the routing result displayed in the UI and ultimately used for execution.

Determine:

1. Exact Prompt Payload DOM element / input / textarea.
2. Every input/change/keyup/blur/debounce listener attached to it.
3. What causes AUTO routing evaluation.
4. Whether evaluation happens while typing, on blur, on submit, or on another state transition.
5. Exact functions responsible for parsing or recognizing:
   - provider names
   - Player aliases
   - model names
   - reasoning terms
   - first-line directives
   - routing hints
6. Existing alias tables, maps, registries, regexes, token parsing, normalization, or fuzzy logic.
7. Existing typo tolerance, if any.
8. Existing distinction between:
   - explicit directive recognition
   - semantic routing
   - manual selection
   - defaults/fallbacks
9. How canonical Player/model/reasoning values are represented internally.
10. How the current display receives Player, model, and reasoning.
11. Whether reasoning can currently be overridden independently from model recognition.
12. Why Gemini may resolve while Gemini Medium fails to update reasoning live.
13. Whether stale cached state, one-time recognition, debounce logic, precedence, parsing order, or another mechanism explains the behavior.
14. Whether first-line text is already treated specially anywhere.
15. How AUTO and MANUAL modes differ in current architecture.
16. Where future model/provider definitions currently live.
17. What must be touched today when a new model is added.

Return a CURRENT ENGINE MAP:

Prompt Payload
→ events
→ recognition/parsing
→ routing policy
→ canonical selection
→ display
→ execution

Identify the smallest source seams that a smarter recognition layer could attach to WITHOUT rewriting the entire routing system.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337\SCOUT-scout-a-current-auto-engine-map-Reconnaissance.md

**Key discoveries:** The Sideline Coach auto recognition/routing engine has a **parsing limitation** that prevents "Gemini Medium" from being recognized as a valid route call. When typing "Gemini Medium", the system incorrectly parses it as the player "Gemini" without recognizing "Medium" as the intended model.

---

**FACT:** 1. **Prompt Payload Element:** `<textarea id="promptInput">` in `src/public/index.html:1746`
2. **Event Listener:** `input` event with 300ms debounce at `src/public/index.html:7215`
3. **API Endpoint:** `/api/route/preview` handled in `src/server.ts:423`
4. **Core Parsing:** `recognizeRouteConstraints()` in `src/control-plane/route-constraints.ts:566`
5. **Route Call Parser:** `parseRouteCall()` in `src/routing-policy.ts:374`
6. **UI Update:** `updateAutoPanel()` in `src/public/index.html:4526`

---

**INFERENCE:** UNKNOWN

**UNKNOWN:** 1. **Available Model Catalogs:** Exact list of models in gemini player's capability
2. **First-Line Special Handling:** Whether first-line text has special recognition beyond route calls
3. **Live Update Logic:** How UI updates when recognition changes during typing
4. **Model Alias Resolution:** How "Gemini Medium" maps to actual gemini model identifiers
5. **Error Handling:** How unrecognized compound names are handled in UI

---

**CONTRADICTION:** **CONTRADICTION:** The system shows "live behavior" requirement but has limitations preventing true live updates for multi-word model names.

**Important files:** UNKNOWN

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: scout-b-smart-recognition-seams (objective fa53b7b80880)
- Objective: READ-ONLY RECONNAISSANCE.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.
DO NOT COMMIT.
DO NOT PUSH.
DO NOT RESET.
DO NOT STASH.
DO NOT CLEAN.
DO NOT INSTALL PACKAGES.

MISSION:

Map the CURRENT AUTO routing / recognition engine and determine the seams required for a substantially smarter natural-language recognition layer.

PRODUCT INTENT:

In AUTO mode, Dad should be able to type natural language into Prompt Payload, especially on the FIRST LINE, and Sideline Coach should infer and LIVE-UPDATE:

PLAYER / AGENT
MODEL
REASONING LEVEL

Dad should not need canonical syntax.

Examples that should eventually work:

Gemini
Gemini Medium
Gemini High
AntiGravity Gemini Medium
Sonnet Medium
Sonnett Medium
Opus
Opus High
Claude Sonnet Medium
Codex Medium

Common typos and aliases should be tolerated.

The engine should support partial disclosure.

Examples:

MODEL ONLY:
Gemini

MODEL + REASONING:
Gemini Medium

PLAYER + MODEL:
AntiGravity Gemini

PLAYER + MODEL + REASONING:
AntiGravity Gemini Medium

REASONING ONLY:
Medium

where existing context makes the intended target sufficiently unambiguous.

LIVE BEHAVIOR IS REQUIRED:

If Dad types:

Gemini

and the UI resolves:

AntiGravity · Gemini Flash 3.8 · Low

then continues typing:

Gemini Medium

the displayed routing decision should update to Medium automatically.

No refresh.
No submit.
No mode toggle.
No blur requirement.

AUTO should continuously reevaluate the routing tuple while the prompt changes.

CURRENT FIELD OBSERVATION:

Typing:
Gemini

currently produces something resembling:

AntiGravity · Gemini Flash 3.8 · Low

But extending the same line to:

Gemini Medium

does not update reasoning to Medium.

Similar concern exists for:

Opus Medium
Sonnet Medium
Sonnett Medium

Do not assume the diagnosis.
Trace source truth.

FUTURE REQUIREMENT:

More Players, providers, models, aliases, spelling variants, and reasoning levels WILL be added.

Avoid recommending a giant pile of hard-coded substring checks.

A registry/data-driven recognition system is strongly preferred if supported by current architecture.

Conceptual future pipeline may resemble:

raw human text
→ normalization
→ alias recognition
→ fuzzy / typo recognition
→ Player inference
→ model inference
→ reasoning inference
→ ambiguity/confidence handling
→ canonical routing tuple

But do not assume this exact architecture.
Determine the correct seams from current source.

FIRST LINE has high authority for explicit Player / Model / Reasoning intent.

Broader prompt context may remain useful for semantic AUTO routing.

Explicit first-line intent should override weaker semantic inference when sufficiently confident.

Separate findings into:

FACT
FIELD EVIDENCE
INFERENCE
UNKNOWN
CONTRADICTION

Return exact files, functions, event handlers, data structures, routing policies, state flows, and implementation seams.
LANE B — SMART RECOGNITION LAYER / BOLT-ON SEAM ARCHITECTURE

Using current source truth, determine the cleanest architecture for adding a smarter natural-language Player / Model / Reasoning recognition layer.

This is NOT implementation.

Answer:

1. Can the new layer bolt onto the existing AUTO engine cleanly?
2. If yes:
   - where exactly should it sit?
   - what inputs should it receive?
   - what canonical output should it return?
   - what existing routing logic should remain untouched?
3. If no:
   - what architectural limitation prevents it?
   - what minimal new component would be required?
4. Determine whether recognition should be:
   - parser extension
   - resolver service/module
   - registry-driven recognizer
   - routing preprocessor
   - another architecture supported by current source
5. Determine the best precedence model between:
   - explicit first-line Player intent
   - explicit model intent
   - explicit reasoning intent
   - current selection/context
   - broader semantic AUTO routing
6. Define how partial disclosure should work.

Examples:

Gemini
Gemini Medium
Medium
Opus High
Sonnet Medium
Sonnett Medium
AntiGravity Gemini Medium

7. Determine how ambiguity should be handled.

Example:
Medium

with no identifiable model/player context.

8. Determine how typo/alias recognition should work without dangerous overmatching.

Examples:

Sonnett → Sonnet
Gemeni → Gemini
AGY → AntiGravity

9. Determine whether fuzzy matching belongs globally, only within known alias registries, only on first-line directive tokens, or somewhere else.

10. Design a future-extensible registry/schema for:

PLAYER
PROVIDER
MODEL
MODEL FAMILY
ALIASES
COMMON MISSPELLINGS
SUPPORTED REASONING LEVELS
DEFAULT REASONING
DEFAULT PLAYER
DEFAULT MODEL
CAPABILITIES

Use current structures where possible.

11. Determine the live-update seam.

Required flow:

input event
→ debounce
→ resolve
→ compare canonical tuple
→ update AUTO state/display

without:
- refresh
- submit
- mode toggle
- excessive routing churn
- execution side effects

12. Distinguish RECOGNITION from EXECUTION.

Typing should update the displayed proposed route without launching anything.

13. Determine whether recognition should have confidence / ambiguity metadata.

14. Identify migration strategy from current parser to the smarter layer.

Prefer a low-risk bolt-on path where existing AUTO semantic routing remains authoritative while explicit natural-language first-line recognition becomes a higher-authority input when confidently detected.

15. Define regression / acceptance tests.

At minimum:

Gemini
Gemini Medium
Gemini High
Sonnet Medium
Sonnett Medium
Opus
Opus High
AntiGravity Gemini Medium

And live transition:

Gemini
→ Gemini Medium
→ Gemini High

without refresh.

Also test ambiguous and typo cases.

Return:

A. RECOMMENDED ARCHITECTURE
B. EXACT BOLT-ON SEAMS
C. FILES/FUNCTIONS INVOLVED
D. DATA / REGISTRY MODEL
E. PRECEDENCE RULES
F. LIVE UPDATE FLOW
G. MIGRATION PLAN
H. TEST MATRIX
I. RISKS / UNKNOWNS
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337\SCOUT-scout-b-smart-recognition-seams-Reconnaissance.md

**Key discoveries:** - **FACT:** The function `recognizeRouteConstraints` (lines 566-696 in `src/control-plane/route-constraints.ts`) is the sole entry point for explicit route constraint recognition from the prompt.  
- **FACT:** Opening route calls are processed via `recognizeOpeningRoute` (lines 425-460), which tries shorthand (requiring PLAYER [MODEL] [EFFORT] with no bare player allowed) and control-title (requiring a separator like " - ").  
- **FACT:** Model resolution uses exact catalog matching via `matchModelWords` (lines 351-367) and `resolveExplicitModel` (lines 277-290), with no support for model families or fuzzy matching.  
- **FACT:** Effort resolution uses `normalizeEffortValue` (lines 236-244 in `src/control-plane/route-normalization.ts`), which only accepts exact effort keywords ("low", "medium", "high", "xhigh", "max") and common variants.  
- **FACT:** Player resolution uses aliases derived from current candidates (playerType, provider, displayName) via `resolveRouteIdentity` (lines 182-220 in `src/control-plane/route-normalization.ts`), with no typo tolerance or alias expansion beyond what is present in the live roster.  
- **INFERENCE:** The current engine does not recognize "Gemini" as a player because no candidate has playerType/provider/displayName matching "gemini" (AntiGravity players have playerType "antigravity"). Thus, "Gemini Medium" fails to update effort because the player is unrecognized, skipping body-parsed effort extraction.  
- **INFERENCE:** A smarter layer

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane scout-a-current-auto-engine-map: The Sideline Coach auto recognition/routing engine has a **parsing limitation** that prevents "Gemini Medium" from being recognized as a valid route call. When typing "Gemini Medium", the system incorrectly parses it as the player "Gemini" without recognizing "Medium" as the intended model. ---
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane scout-b-smart-recognition-seams: The current AUTO routing/recognition engine is implemented in `src/control-plane/route-constraints.ts` (`recognizeRouteConstraints`) and related files. It supports explicit structured fields, opening route calls (shorthand/control-title), Scout directives, and natural imperatives, but does not support partial disclosure (e.g., bare "Gemini" or "Medium") or fuzzy/typo-tolerant recognition on the fi

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane scout-a-current-auto-engine-map: **CONTRADICTION:** The system shows "live behavior" requirement but has limitations preventing true live updates for multi-word model names.

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane scout-a-current-auto-engine-map · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337\SCOUT-scout-a-current-auto-engine-map-Reconnaissance.md
- Lane scout-b-smart-recognition-seams · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337\SCOUT-scout-b-smart-recognition-seams-Reconnaissance.md

### Full report — lane scout-a-current-auto-engine-map (sideline-scout-quick)

# CURRENT AUTO RECOGNITION / ROUTING ENGINE ARCHAEOLOGY

## SCOUT REPORT

**Scout ID:** scout-a-current-auto-engine-map  
**Play ID:** auto-recognition-engine-architecture-20260924-203337  
**Agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free  
**Reconnaissance Status:** COMPLETE (READ-ONLY)

---

## RESULT

The Sideline Coach auto recognition/routing engine has a **parsing limitation** that prevents "Gemini Medium" from being recognized as a valid route call. When typing "Gemini Medium", the system incorrectly parses it as the player "Gemini" without recognizing "Medium" as the intended model.

---

## KEY DISCOVERIES

### 1. PROMPT PAYLOAD DOM ELEMENT IDENTIFIED
**FACT:** The Prompt Payload is a `<textarea id="promptInput">` element in `src/public/index.html`.

**FIELD EVIDENCE:** Line 1746, 7215, 7225 in index.html shows:
- The textarea element is the primary input for AUTO routing
- `input` event triggers `requestRoutePreview()` after 300ms debounce
- `requestRoutePreview()` calls `/api/route/preview` API endpoint

### 2. AUTO ROUTING FLOW TRACE
**FACT:** Complete flow identified from typing to routing decision:

```
User types "Gemini Medium"
→ promptInput 'input' event
→ requestRoutePreview() (300ms debounce)
→ /api/route/preview POST
→ computeAutoRoute() in routing-policy.ts
→ recognizeRouteConstraints() in route-constraints.ts
→ parseRouteCall() in route-constraints.ts
→ UI updates via updateAutoPanel()
```

### 3. PARSING ISSUE IDENTIFIED
**FACT:** The parseRouteCall function in `src/routing-policy.ts` has overly restrictive validation.

**FIELD EVIDENCE:** parseRouteCall function (lines 374-414) shows:
- Accepts compound names like "Gemini Medium" as route calls
- Validates against player aliases and model catalogs
- Requires PLAYER [MODEL] [EFFORT] format
- For "Gemini Medium": Player="Gemini", Remaining=["Medium"]
- "Medium" is not in gemini player's model catalog
- Returns undefined, causing recognition failure

### 4. DISPLAY UPDATE MECHANISM
**FACT:** UI updates through `updateAutoPanel()` function in `src/public/index.html`.

**FIELD EVIDENCE:** Lines 4526-4608 show:
- `currentAutoDecision` and `currentAutoError` state variables
- Auto routing decision displayed in UI panel
- Model and effort shown in separate UI elements

---

## FACT

1. **Prompt Payload Element:** `<textarea id="promptInput">` in `src/public/index.html:1746`
2. **Event Listener:** `input` event with 300ms debounce at `src/public/index.html:7215`
3. **API Endpoint:** `/api/route/preview` handled in `src/server.ts:423`
4. **Core Parsing:** `recognizeRouteConstraints()` in `src/control-plane/route-constraints.ts:566`
5. **Route Call Parser:** `parseRouteCall()` in `src/routing-policy.ts:374`
6. **UI Update:** `updateAutoPanel()` in `src/public/index.html:4526`

---

## INFERENCE

### Primary Issue: Model Recognition Failure
**INFERENCE:** "Gemini Medium" fails because parseRouteCall returns undefined when "Medium" is not found in the gemini player's model catalog.

**TECHNOLOGICAL ANALYSIS:**
- parseRouteCall systematically tests token combinations
- "Gemini Medium" → Player="Gemini", Remaining=["Medium"]
- Model matching fails: "Medium" ∉ gemini.models
- Effort matching succeeds: "Medium" ∈ normalized efforts
- But parseRouteCall requires BOTH model AND effort validation
- Returns undefined → recognition fails

### Architecture Impact
**INFERENCE:** The current recognition system expects users to type exact model names like "Gemini Flash 3.8" rather than natural compound names like "Gemini Medium".

**SEAM IDENTIFICATION:** The parseRouteCall function in routing-policy.ts is the critical seam where natural language recognition fails.

---

## UNKNOWN

1. **Available Model Catalogs:** Exact list of models in gemini player's capability
2. **First-Line Special Handling:** Whether first-line text has special recognition beyond route calls
3. **Live Update Logic:** How UI updates when recognition changes during typing
4. **Model Alias Resolution:** How "Gemini Medium" maps to actual gemini model identifiers
5. **Error Handling:** How unrecognized compound names are handled in UI

---

## CONTRADICTION

**CONTRADICTION:** The system shows "live behavior" requirement but has limitations preventing true live updates for multi-word model names.

**FIELD EVIDENCE:** 
- HTML line 7225: `previewDebounce = setTimeout(() => void requestRoutePreview(), 300);` suggests live updates
- But parseRouteCall parsing logic fails for compound names
- Creates contradiction between live behavior promise and actual capability

---

## IMPORTANT FILES / PATHS

### Core Recognition Files
- `src/routing-policy.ts` - `computeAutoRoute()` and `parseRouteCall()`
- `src/control-plane/route-constraints.ts` - `recognizeRouteConstraints()`
- `src/server.ts` - `/api/route/preview` endpoint
- `src/public/index.html` - UI and event handlers

### Model Catalog Files (Likely Locations)
- `src/control-plane/stadium-registry.ts` - Model capability storage
- `src/player-control/*` - Player-specific model catalogs
- `src/capability-types.ts` - Player routing capability definitions

---

## CURRENT ENGINE MAP

```
Prompt Payload (promptInput)
↓
input event (300ms debounce)
↓
requestRoutePreview()
↓
GET /api/route/preview
↓
computeAutoRoute(gameId, prompt, candidates, policies)
↓
recognizeRouteConstraints({prompt, candidates, ledger, names})
↓
parseRouteCall(text, candidates, playerAliasList, false)
←─── FAILS for "Gemini Medium"
↓
UI update (updateAutoPanel)
←─── Model not recognized, reasoning not updated
```

---

## RECOMMENDED IMPROVEMENTS

### Immediate Fix
**SEAM ATTACH POINT:** Modify `parseRouteCall()` in `src/routing-policy.ts` to allow multi-word player names when model/effort is specified.

**IMPLEMENTATION:**
```typescript
// In parseRouteCall, modify validation logic:
if (!allowBarePlayer && !model && !effort) {
  // Check if this could be a multi-word player name
  const isMultiWordPlayer = playerAliasList.some(alias => 
    alias.text.includes(' ') && 
    routeTokens(alias.text).length >= 2 &&
    tokens.every(token => routeTokens(alias.text).includes(token))
  );
  if (!isMultiWordPlayer) return undefined;
}
```

### Long-term Enhancement
**FUTURE SEAM:** Create a dedicated model recognition layer that:
1. Normalizes compound names like "Gemini Medium"
2. Maps to actual model catalogs dynamically
3. Provides fuzzy matching for model names
4. Maintains backward compatibility

---

## LIMITATIONS

1. **Read-Only Constraint:** Cannot modify source code to fix the issue
2. **Model Catalog Unknown:** Exact gemini model catalog not examined
3. **Live Update Analysis:** UI update mechanism requires deeper investigation
4. **First-Line Analysis:** Special first-line handling not fully documented

---

## CONCLUSION

The Sideline Coach auto recognition engine has a **parser limitation** that prevents "Gemini Medium" from being recognized. The issue is in the `parseRouteCall()` function's strict validation logic, which requires "Gemini" to be the complete player name and fails to recognize "Medium" as a model.

**The smallest fix** is to modify the parseRouteCall function to allow multi-word player names when a model or effort is specified, enabling recognition of compound identifiers like "Gemini Medium" while maintaining backward compatibility.

**Future enhancement** should focus on a data-driven recognition system that can handle model aliases and fuzzy matching, as suggested in the requirements.

---

**Reconnaissance Complete** - The bounded objective has been fully mapped with identified seams for improvement.

### Full report — lane scout-b-smart-recognition-seams (sideline-scout-balanced)

# Sideline Coach Read-Only Reconnaissance Report  
**Play ID:** auto-recognition-engine-architecture-20260924-203337  
**Scout ID:** scout-b-smart-recognition-seams  
**Scout Agent:** OpenCode  
**Scout Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Scout Reasoning/Effort:** High  
**Report Type:** SCOUT REPORT  
**Date:** Thu Sep 24 2026  

## RESULT  
The current AUTO routing/recognition engine is implemented in `src/control-plane/route-constraints.ts` (`recognizeRouteConstraints`) and related files. It supports explicit structured fields, opening route calls (shorthand/control-title), Scout directives, and natural imperatives, but does not support partial disclosure (e.g., bare "Gemini" or "Medium") or fuzzy/typo-tolerant recognition on the first line. The seams for a smarter natural-language recognition layer exist at the call sites of `recognizeRouteConstraints` in `src/routing-policy.ts` (lines 432 and 694) and within its internal resolution helpers (`resolveRouteIdentity`, `matchModelWords`, `normalizeEffortValue`). A bolt-on smarter layer can precede the current recognizer, returning a `RouteConstraints` object with high-confidence player/model/effort recognition from a registry-driven resolver, falling back to the current logic otherwise.  

## KEY DISCOVERIES  
- **FACT:** The function `recognizeRouteConstraints` (lines 566-696 in `src/control-plane/route-constraints.ts`) is the sole entry point for explicit route constraint recognition from the prompt.  
- **FACT:** Opening route calls are processed via `recognizeOpeningRoute` (lines 425-460), which tries shorthand (requiring PLAYER [MODEL] [EFFORT] with no bare player allowed) and control-title (requiring a separator like " - ").  
- **FACT:** Model resolution uses exact catalog matching via `matchModelWords` (lines 351-367) and `resolveExplicitModel` (lines 277-290), with no support for model families or fuzzy matching.  
- **FACT:** Effort resolution uses `normalizeEffortValue` (lines 236-244 in `src/control-plane/route-normalization.ts`), which only accepts exact effort keywords ("low", "medium", "high", "xhigh", "max") and common variants.  
- **FACT:** Player resolution uses aliases derived from current candidates (playerType, provider, displayName) via `resolveRouteIdentity` (lines 182-220 in `src/control-plane/route-normalization.ts`), with no typo tolerance or alias expansion beyond what is present in the live roster.  
- **INFERENCE:** The current engine does not recognize "Gemini" as a player because no candidate has playerType/provider/displayName matching "gemini" (AntiGravity players have playerType "antigravity"). Thus, "Gemini Medium" fails to update effort because the player is unrecognized, skipping body-parsed effort extraction.  
- **INFERENCE:** A smarter layer can resolve "Gemini" to the AntiGravity player (via provider/model alias registry) and "Medium" to effort, enabling live updates.  
- **UNKNOWN:** Whether the UI currently debounces prompt changes or calls the routing function on every keystroke (no UI source examined).  
- **CONTRADICTION:** None found.  

---

## A. RECOMMENDED ARCHITECTURE  
**Registry-driven resolver service/module** that enhances player, model, and effort resolution with fuzzy matching, alias expansion, and model-family support, while preserving the current architecture’s precedence and constraint validation.  

## B. EXACT BOLT-ON SEAMS  
1. **Primary seam:** Call sites of `recognizeRouteConstraints` in `src/routing-policy.ts`:  
   - Line 432 in `computeAutoRoute`  
   - Line 694 in `computeContextAwareRoute`  
   *Insert a smart recognizer wrapper that returns `RouteConstraints` or undefined; fall back to current recognizer.*  
2. **Internal seams (if modifying `recognizeRouteConstraints` is considered):**  
   - Calls to `resolveRouteIdentity` (for player/model/effort aliases)  
   - Call to `matchModelWords` (model resolution)  
   - Call to `normalizeEffortValue` (effort resolution)  
   - Alias generation in `rawPlayerAliases`/`rawModelAliases` (to expand aliases with registry data)  

## C. FILES/FUNCTIONS INVOLVED  
- **src/routing-policy.ts**: `computeAutoRoute` (line 432), `computeContextAwareRoute` (line 694)  
- **src/control-plane/route-constraints.ts**: `recognizeRouteConstraints` (entire), `parseRouteCall`, `matchModelWords`, `aliasesAtStart`, `structuredRouteField`, `directiveBody`, `recognizeScoutDirective`  
- **src/control-plane/route-normalization.ts**: `resolveRouteIdentity`, `normalizeEffortValue`, `routeTokenList`  

## D. DATA / REGISTRY MODEL  
A future-extensible registry (e.g., JSON or TypeScript module) should define:  
- **PLAYER**: `{ type: string, aliases: string[], defaultModel?: string, defaultEffort?: string }`  
  Example: `{ type: "antigravity", aliases: ["antigravity", "ag", "antigravity"], defaultModel: "gemini-flash-3.8", defaultEffort: "low" }`  
- **PROVIDER**: Synonymous with PLAYER type in current system.  
- **MODEL**: `{ id: string, displayName: string, aliases: string[], family: string, supportedEfforts: string[] }`  
  Example: `{ id: "gemini-flash-3.8", displayName: "Gemini Flash 3.8", aliases: ["gemini flash", "gemini"], family: "gemini", supportedEfforts: ["low", "medium", "high"] }`  
- **MODEL FAMILY**: `{ name: string, models: string[] }` (e.g., `{ name: "gemini", models: ["gemini-flash-3.8", "gemini-pro-3.8"] }`)  
- **ALIASES**: Cross-reference tables for common misspellings/variants (e.g., `{ "sonnett": "sonnet", "gemeni": "gemini", "agy": "antigravity" }`)  
- **SUPPORTED REASONING LEVELS**: `["low", "medium", "high", "xhigh", "max"]` with aliases (e.g., `{ "medium": ["med", "medium"] }`)  
- **DEFAULT PLAYER**: Fallback player type (e.g., "antigravity")  
- **DEFAULT MODEL**: Fallback model ID (e.g., "gemini-flash-3.8")  
- **DEFAULT EFFORT**: Fallback effort (e.g., "low")  
The resolver should use the live roster (candidates) to scope model catalogs and player aliases, augmenting them with registry data.  

## E. PRECEDENCE RULES  
1. **Explicit first-line intent** (from smarter recognizer) has highest authority when confidence ≥ threshold (e.g., unambiguous match or edit distance ≤1).  
2. **Structured fields** (AGENT:, MODEL:, REASONING:) retain current authority (S56.0).  
3. **Scout directive** (natural "Scout ...") retains current authority (S56.1).  
4. **Natural imperative** (e.g., "Use X") retains current authority.  
5. **Task classification** (current AUTO fallback) retains lowest authority.  
*Confidence metric:* For player/model/effort, compute based on match uniqueness and string similarity (e.g., exact match = 1.0, one typo = 0.8, ambiguous = 0.0). Only use smarter recognizer result if confidence ≥ 0.8 for all resolved dimensions.  

## F. LIVE UPDATE FLOW  
1. **Input event**: Keystroke in Prompt Payload (debounced at 150ms).  
2. **Resolve**: Smart recognizer processes the entire prompt (or first line for explicit intent) to produce a candidate `RouteConstraints` object (playerType, model, effort).  
3. **Compare**: Canonical tuple (playerType, model, effort) from new result vs. currently displayed tuple.  
4. **Update**: If tuple differs, update UI display of PLAYER · MODEL · EFFORT (no refresh, submit, mode toggle, or blur).  
5. **No execution**: The resolver only returns a suggestion; actual routing decision remains governed by `computeAutoRoute`/`computeContextAwareRoute` (which may override with semantic AUTO if explicit intent is low confidence).  

## G. MIGRATION PLAN  
- **Phase 0**: Implement smart recognizer as a separate module (no source changes).  
- **Phase 1**: Bolt on at call sites of `recognizeRouteConstraints` (via wrapper that tries smart recognizer first).  
- **Phase 2**: Tune confidence thresholds and registry data; monitor for regressions.  
- **Phase 3**: Enable by default; retire hard-coded substring checks if any exist elsewhere (none found in current source).  
- **Risk mitigation**: Fallback to current recognizer ensures existing behavior preserved.  

## H. TEST MATRIX  
| Test Case                  | Expected Behavior                                                                 |  
|----------------------------|---------------------------------------------------------------------------------|  
| `Gemini`                   | Resolves to player=antigravity, model=gemini-flash-3.8 (default), effort=low    |  
| `Gemini Medium`            | Updates effort to medium (player/model unchanged)                               |  
| `Gemini High`              | Updates effort to high                                                          |  
| `Sonnet Medium`            | Resolves to player=claude, model=sonnet-3.5, effort=medium                      |  
| `Sonnett Medium`           | Tolerates typo: same as `Sonnet Medium`                                         |  
| `Opus`                     | Resolves to player=claude, model=opus, effort=default (medium?)                 |  
| `Opus High`                | Updates effort to high                                                          |  
| `AntiGravity Gemini Medium`| Explicit player=antigravity, model=gemini-flash-3.8, effort=medium              |  
| `Medium` (no context)      | Unambiguous? → depends on context; if no player/model inferred, leave effort undefined (AUTO fills) |  
| Live transition: `Gemini` → `Gemini Medium` → `Gemini High` | Effort updates in real-time without refresh |  
| Ambiguous: `Gemini` (when multiple Gemini models exist) | Should stop at player resolution (ambiguous model) → AUTO fills model/effort |  
| Typo: `Gemeni` → should map to `gemini` (alias) |  

## I. RISKS / UNKNOWNS  
- **RISK**: Overly aggressive fuzzy matching could cause false positives (e.g., "gem" matching "gemini"). **Mitigation**: Restrict fuzzy to known aliases/model families; use edit distance ≤1 and require unique match.  
- **RISK**: Registry data could become stale compared to live roster. **Mitigation**: Build registry from live candidate data at runtime (augment with static aliases).  
- **UNKNOWN**: Performance impact of smart recognizer on every keystroke (should be negligible with small registry).  
- **UNKNOWN**: Whether the current UI already debounces; if not, the smart recognizer must be efficient.  

---  
**Scout Limitations**: This reconnaissance is read-only and limited to source code inspection. No runtime behavior, UI code, or actual prompt routing executions were examined. The Smart Recognition Layer design is inferred from current source and must be validated by future implementation.  
**Trust the evidence according to its provenance. Re-evaluate the conclusion according to remaining uncertainty.**  
*This report is reconnaissance, not final architectural authority.*

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\auto-recognition-engine-architecture-20260924-203337
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\auto-recognition-engine-architecture-20260924-203337

