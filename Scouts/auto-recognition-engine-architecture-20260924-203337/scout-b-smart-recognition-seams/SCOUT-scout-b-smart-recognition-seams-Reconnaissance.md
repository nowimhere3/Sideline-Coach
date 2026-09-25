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
