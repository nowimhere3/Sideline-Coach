Now I have comprehensive understanding of the routing architecture. Let me compile the final report.

---

### CURRENT ROUTE AUTHORITY MODEL

**FACT** — The system has a **three-tier precedence hierarchy** encoded in `resolveSmartRouteConstraints` (smart-route-resolver.ts:492-518):

1. **Structured fields** (`AGENT:`, `MODEL:`, `REASONING:`) — highest authority, resolved via `recognizeRouteConstraints`
2. **Scout directive** (`Scout this play...`) — explicit directive authority, intercepted before natural language
3. **Smart first-line natural intent** (`Gemini Medium`, `Claude Sonnet med`, `Opus High`...) — `trySmartNaturalRoute`
4. **Existing catalog-validated route constraints** — natural imperatives (`Use X...`) and legacy envelope parsing

**FACT** — `computeAutoRoute` (routing-policy.ts:480-625) and `computeContextAwareRoute` (routing-policy.ts:717-1059) both invoke `resolveSmartRouteConstraints` **before** any task classification or provider preference logic.

**FACT** — The `RouteConstraints` type (capability-types.ts:74-98) carries an `unresolved` array that preserves explicitly-requested-but-unresolvable dimensions. This is the **canonical ambiguity representation** — explicit unresolved values never become inferred replacements.

---

### CURRENT SOURCE OF TRUTH

**FACT** — The **live Player roster** (`PlayerRoutingCapability[]`) is the sole source of truth for:
- Which Player instances exist and their `state` (`ready`/`busy`/`unavailable`/`needs-verification`)
- Each Player's `capability.models[]` — the live catalog of model IDs, display names, supported efforts
- Provider identity (`capability.provider`)

**FACT** — `recognizeRouteConstraints` (route-constraints.ts:586-715) builds `playerAliases` from the **live candidates + ledger + names map** — never from a static synonym list.

**FACT** — Model resolution in `resolveExplicitModel` (route-constraints.ts:297-310) and `matchModelWords` (route-constraints.ts:371-387) **only matches against models in the resolved Player's actual catalog**.

---

### WHERE CONTRADICTORY ROUTES ENTER

**FACT** — Contradictions can enter at multiple layers:

| Layer | Mechanism | Current Handling |
|-------|-----------|------------------|
| **Structured fields** | `AGENT: Claude or Codex` | `isChoiceOrNegation` → `unresolved: player` (route-normalization.ts:77-79) |
| **Structured fields** | `MODEL: Sonnet and Opus` | `resolveExplicitModel` → `unresolved: model` (route-constraints.ts:297-310) |
| **Natural first-line** | `Claude Sonnet Opus` (two models) | `parseRouteCall` → `modelUnresolved` (route-constraints.ts:430) |
| **Natural first-line** | `Claude or Codex` | `isChoiceOrNegation` → returns `undefined` (smart-route-resolver.ts:172-173) |
| **Scout directive + structured** | `AGENT: Codex` + `Scout this play` | Structured Player **outranks** Scout directive (route-constraints.ts:630-639) |

**INFERENCE** — The system **stops** on contradictory explicit constraints (returns `error` via `unresolvedRouteError` in routing-policy.ts:468-478) rather than guessing. This matches the desired contract for CONTRADICTORY case.

**CONTRADICTION** — However, the **opening region** is currently **first non-blank line only** (smart-route-resolver.ts:119-132; route-constraints.ts:445-480). The mission requires "approximately the first 10 lines" recognition region.

---

### EXPLICIT-VS-INFERENCE PRECEDENCE

**FACT** — Explicit human intent **outranks** AUTO inference at every decision point:

1. **Route resolution**: `resolveSmartRouteConstraints` returns constraints **before** `classifyTask` runs (smart-route-resolver.ts:492-518)
2. **Candidate narrowing**: `constrainedSeats` filters candidates by explicit `playerType`/`playerInstanceId`/`model`/`effort` (routing-policy.ts:230-250)
3. **Model selection**: `constrainedSelection` honors explicit `model`/`effort` over policy recommendation (routing-policy.ts:660-682)
4. **Context-aware route**: Explicit Player constraint **outranks** context ownership (routing-policy.ts:869-927)

**FACT** — Test `S56.2-12` (s56-2-routing-alias-normalization.test.mjs:241-258) verifies:
- Absent model → AUTO fills for explicit Player
- Explicit+resolved model (Sonnet) **wins** over architecture preference (Opus)
- Explicit+unresolved → **stops visibly** with error message

---

### PARTIAL-CONSTRAINT STICKINESS

**FACT** — The system **preserves explicit components** that resolve confidently. Inference fills **only genuinely unspecified components**:

| Explicit Components | AUTO Fills | Evidence |
|---------------------|------------|----------|
| Player + Model | Effort | `constrainedSelection` (routing-policy.ts:660-682) |
| Player + Effort | Model (picking one supporting that effort) | `constrainedSelection` + `matchModelWords` |
| Model only | Player (inferred from model's Player) | `resolveExplicitModel` scans all candidates' models |
| Effort only | Player + Model | `trySmartNaturalRoute` returns `{effort}` only (smart-route-resolver.ts:364-372) |

**FACT** — `RouteConstraints.recognized` array tracks which dimensions were explicitly recognized: `['player']`, `['model']`, `['effort']`, `['player','model']`, etc. (capability-types.ts:97)

**FACT** — **Provider normalization**: If model is explicit (e.g., `Sonnet`) and provider is uniquely implied (Claude), the system infers `playerType: 'claude'`. This happens in `resolveExplicitModel` which scans all candidates' models, and in `trySmartNaturalRoute` which infers `matchedPlayerType` from `matchedFamily` (smart-route-resolver.ts:374-378).

**ARCHITECT DECISION REQUIRED** — The mission asks: "If model and effort are explicit but provider is uniquely implied, determine whether provider can be safely normalized." Current behavior **does normalize** (Sonnet → Claude), but this is not explicitly documented as a contract decision.

---

### AMBIGUITY REPRESENTATION

**FACT** — **Canonical ambiguity representation**: `RouteConstraints.unresolved` array (capability-types.ts:82-88):

```typescript
readonly unresolved?: readonly { 
  readonly dimension: 'player' | 'model' | 'effort'; 
  readonly rawText: string 
}[];
```

**FACT** — Ambiguity sources that produce `unresolved`:
- Structured field value contains choice/negation/near-miss → `unresolved` (route-normalization.ts:182-220)
- Structured field value resolves to **multiple** catalog identities → `unresolved` (route-constraints.ts:254-267, 297-310)
- Natural first-line names a sub-family with multiple catalog models (e.g., "AntiGravity Flash" when 3 Flash versions exist) → `modelUnresolved` (route-constraints.ts:406-417, 430)
- Natural first-line has unconsumed descriptive tokens → **not a route call** (falls to AUTO) (smart-route-resolver.ts:354-357)

**FACT** — `unresolvedRouteError` (routing-policy.ts:468-478) converts `unresolved` into a **human-readable stop message**:
> "Unrecognized model 'GPT-5.6 Sol 2' requested for Codex. Coach did not choose another model because this Play explicitly constrained the model."

**UNKNOWN** — Whether the current `unresolved` representation fully satisfies "Surface bounded Coach choices" for the AMBIGUOUS case (e.g., "Did you mean: Claude Sonnet · Medium / Codex 5.6 Sol · Medium"). Current behavior: **stops with error**, does not offer choices.

---

### CONTRADICTION REPRESENTATION

**FACT** — Contradictions are detected at parse time via `isChoiceOrNegation` (route-normalization.ts:77-79):
- Connective words: `and`, `or`, `vs`, `versus`, `either`, `both`, `plus`, `then`, `also`
- Punctuation: `&`, `+`, `|`, `/`
- Negation words: `not`, `no`, `never`, `without`, `except`, `excluding`, `exclude`, `instead`, `rather`, `avoid`, `neither`, `nor`, `dont`, `don`, `isnt`, `isn`, `doesnt`, `doesn`, `anything`, `anyone`, `other`, `else`

**FACT** — Contradiction in structured field → `unresolved` with reason `'contradictory'` (route-normalization.ts:185)
**FACT** — Contradiction in natural first-line → `trySmartNaturalRoute` returns `undefined` (falls to AUTO) (smart-route-resolver.ts:172-173)

**INFERENCE** — The system treats contradictions as **"not a route call"** for natural language, but as **explicit-unresolved** for structured fields. This asymmetry may need Architect review.

---

### ASK-COACH / STOP SEAM

**FACT** — The stop seam is `unresolvedRouteError` (routing-policy.ts:468-478) called in:
- `computeAutoRoute` line 489-490
- `computeContextAwareRoute` line 727-731

**FACT** — Error message format: "Unrecognized {dimension} '{rawText}' requested{ for {playerLabel}}. Coach did not choose another {dimension} because this Play explicitly constrained the {dimension}."

**FACT** — Additional stop seams:
- Explicit Player constraint + Player unavailable → error: "X is currently unavailable. Coach did not choose another Player because you explicitly constrained this Play." (routing-policy.ts:752-763, 883-887)
- Scout directive + Scout unavailable → error: "Scout is currently unavailable. Coach did not choose another Player because you asked for Scout." (routing-policy.ts:393-395)
- Explicit constraint + zero candidates after filtering → error (routing-policy.ts:752-763)

**ARCHITECT DECISION REQUIRED** — The mission requires "Surface bounded Coach choices" for AMBIGUOUS case. Current system **only stops**, does not offer choices. Need to decide: extend `unresolved` to carry `alternatives?: RouteConstraints[]` or add a new `ambiguous` field?

---

### FIRST-10-LINES RECOGNITION IMPLICATIONS

**FACT** — Current recognition region: **first non-blank line only** for natural shorthand/control-title (route-constraints.ts:445-480; smart-route-resolver.ts:119-132)

**FACT** — Structured fields scan **first 15 unfenced lines** (route-constraints.ts:155-162):
```typescript
function routeLines(prompt: string): string[] {
  const lines = unfencedLines(prompt);
  return lines.slice(0, 15);  // "Fifteen meaningful lines is deliberately large enough..."
}
```

**CONTRADICTION** — Mission requires "approximately the first 10 lines" for natural language recognition. Current: **1 line** for shorthand/control-title, **15 lines** for structured fields.

**INFERENCE** — The 1-line limit for natural shorthand is intentional (BREADCRUMB S56.3: "First non-blank line only; a fenced or quoted first line is never a route call. Deterministic; nothing beyond the first line is ever read for identity.") — widening this risks false positives from prose.

**ARCHITECT DECISION REQUIRED** — Whether to expand natural language recognition to ~10 lines, and if so, how to avoid false positives (e.g., "I would like this to Codex 6.1 Sol Medium" on line 3).

---

### STAGED-ROUTE CONSISTENCY INVARIANT

**FACT** — The **staged preview** and **real dispatch** share the exact same computation:

```typescript
// router.ts:260-268
computeRoute(gameId, prompt, candidates, extra) {
  return this.routeContextProvider 
    ? computeContextAwareRoute(...)
    : computeAutoRoute(...);
}
```

**FACT** — `router.dispatch()` calls `computeRoute` for both the staged preview (UI) and the actual dispatch (router.ts:370-383). The `decision` object is reused.

**FACT** — `RoutingDecision.constraints` carries the **exact `RouteConstraints`** that were honored (capability-types.ts:166). This is the **staged-route consistency invariant**: what Coach staged = what runs.

**FACT** — For MANUAL with `model: 'auto'`/`effort: 'auto'`, `resolveCoachAuto` resolves for the **exact chosen instance** (router.ts:406-413; routing-policy.ts:1072-1097).

---

### FUTURE CUSTOMIZE/EDIT HANDOFF SEAM

**FACT** — The **control/play separation seam** already exists for Scout directive:
- `RouteConstraints.directive: { kind: 'scout', matched, executionPrompt? }` (capability-types.ts:89-96)
- `recognizeScoutDirective` returns `executionPrompt` (route-constraints.ts:482-557)
- Router uses `executionPrompt` for Scout, keeps original for others (router.ts:475-478)

**FACT** — `OpeningRoute.executionPrompt` exists for shorthand/control-title (route-constraints.ts:348-352) but **only Scout uses it** today.

**INFERENCE** — The architectural handoff seam for "Customize/Edit inherits already-resolved route" is:
1. `RoutingDecision.constraints` — the resolved `RouteConstraints` 
2. `RoutingDecision.contextPreamble` — any handoff context
3. `executionPrompt` (if separated) — the clean Play content

**UNKNOWN** — Whether `RouteConstraints` needs a `resolvedAt` timestamp or `resolvedBy: 'structured' | 'shorthand' | 'control-title' | 'scout-directive'` to support "change only the wrong component" UX.

---

### REQUIRED TEST MATRIX

Based on the mission's required behaviors, these test scenarios are needed:

| Scenario | Current Coverage | Gap |
|----------|------------------|-----|
| **UNAMBIGUOUS**: `Codex 5.6 Sol Medium` → exact route | ✅ `smart-auto-recognition-resolver.test.mjs` lines 231-245 | |
| **UNAMBIGUOUS**: `Sonnet Medium` → Claude Sonnet Medium | ✅ lines 188-226 | |
| **PARTIALLY EXPLICIT**: `Codex Medium` (model absent) → Codex + default model + Medium | ✅ line 242-245 | |
| **PARTIALLY EXPLICIT**: `Medium` only → AUTO fills Player+Model | ✅ lines 250-268 | |
| **PARTIALLY EXPLICIT**: `Sonnet` only → Claude + Sonnet + default effort | ⚠️ Implicit via model scan | No explicit test |
| **AMBIGUOUS**: `Flash` (3 Flash models) → stop + offer choices | ❌ Currently stops with error, no choices offered | **ARCHITECT DECISION REQUIRED** |
| **AMBIGUOUS**: `Gemini` (Pro + Flash) → stop + offer choices | ❌ Currently picks default (Flash) | **CONTRADICTION** with mission |
| **CONTRADICTORY**: `AGENT: Claude or Codex` → stop | ✅ S56.2-7 | |
| **CONTRADICTORY**: `MODEL: Sonnet and Opus` → stop | ✅ S56.2-8 | |
| **CONTRADICTORY**: `Claude Sonnet Opus` (two models) → stop | ✅ `parseRouteCall` returns `modelUnresolved` | |
| **FIRST-10-LINES**: Routing intent on line 3 | ❌ Only line 1 recognized | **ARCHITECT DECISION REQUIRED** |
| **FULL SENTENCES**: "I would like this to Codex 6.1 Sol Medium" | ❌ Not recognized (prose veto) | **ARCHITECT DECISION REQUIRED** |
| **CASE**: `codex 5.6 sol medium` / `CODEX 5.6 SOL MEDIUM` | ✅ Case-insensitive via `normalizeRouteText` | |
| **STICKINESS**: Player+Model explicit, effort absent → keep Player+Model | ✅ `constrainedSelection` | |
| **STICKINESS**: Model+Effort explicit, Player implied → infer Player | ✅ `resolveExplicitModel` scans all candidates | |
| **SCOUT DIRECTIVE**: `Scout this play` → Scout, never substitution | ✅ S56.1 tests | |

---

### ARCHITECTURAL RISKS

| Risk | Severity | Evidence |
|------|----------|----------|
| **Ambiguous sub-family silent pick**: "Gemini" picks default (Flash) without offering Pro choice | HIGH | `trySmartNaturalRoute` lines 418-443: broad family "gemini" picks preferred without ambiguity stop |
| **First-line-only natural recognition** misses "I would like this to Codex..." on line 3 | MEDIUM | `extractFirstLine` stops at first non-blank; prose veto rejects full sentences |
| **Contradiction handling asymmetry**: structured=unresolved, natural=falls-to-AUTO | MEDIUM | `isChoiceOrNegation` returns `undefined` for natural (smart-route-resolver.ts:173) vs `unresolved` for structured |
| **No "bounded Coach choices" UI** for ambiguous models | HIGH | Mission requires "Did you mean: - Claude Sonnet · Medium - Codex 5.6 Sol · Medium" |
| **Provider normalization implicit**: "Sonnet" → Claude without explicit confirmation | LOW | `resolveExplicitModel` infers Player from model; not user-visible |
| **Version decoration collision**: "GPT-5.6 Sol 2" correctly blocked, but "Sonnet 5" allowed | LOW | `resolveRouteIdentity` versionDecoration logic (route-normalization.ts:204-209) |

---

### OPUS DECISIONS REQUIRED

1. **AMBIGUOUS CASE UX**: Should `unresolved` carry `alternatives` for "Did you mean:" choices, or a new `ambiguous` field with `candidates: RouteConstraints[]`?

2. **FIRST-10-LINES RECOGNITION**: Expand natural shorthand recognition from 1 line to ~10 lines? If yes, how to avoid false positives from prose?

3. **FULL SENTENCE RECOGNITION**: Support "I would like this to Codex 6.1 Sol Medium"? Requires NLP or extended grammar — contradicts current "closed grammar" philosophy.

4. **CONTRADICTION UNIFICATION**: Should natural language contradictions (`Claude or Codex`) produce explicit `unresolved` (like structured) instead of falling to AUTO?

5. **PROVIDER NORMALIZATION CONTRACT**: Is "Sonnet" → Claude (inferred provider) acceptable, or must Player always be explicit?

6. **PARTIAL CONSTRAINT STICKINESS**: When model+effort explicit but Player ambiguous (e.g., two Players have "Sonnet"), should it stop or infer?

---

### WORKER-READY ITEMS

1. **Extend `RouteConstraints.unresolved` items** to optionally include `alternatives: RouteConstraints[]` for ambiguous models — enables "Did you mean:" UI
2. **Add `recognizedSource` field** to `RouteConstraints`: `'structured' | 'shorthand' | 'control-title' | 'scout-directive'` — supports future Customize/Edit handoff
3. **Add test** for "Sonnet only" → Claude + Sonnet + default effort (partial constraint stickiness)
4. **Add test** for "Flash" with multiple Flash models → ambiguity stop (currently picks default)
5. **Document** the provider normalization behavior (model → inferred Player) in routing-policy.ts BREADCRUMB

---

### LIMITATIONS

- Reconnaissance only — did not execute code, only read source and tests
- Did not inspect UI layer (index.html) for how `unresolved` errors surface to Coach
- Did not trace end-to-end from UI input → `dispatch` → `RoutingDecision` → Stadium send
- `smart-auto-recognition-resolver.test.mjs` imports from `../out/` (compiled) — source may have evolved

---

**VERDICT: ARCHITECT DECISION REQUIRED**

The routing authority contract is **largely implemented and truthful** for explicit constraints (structured fields, Scout directive, confident natural shorthand). The `unresolved` mechanism correctly stops on unresolvable explicit intent. However, **three mission requirements need Architect decisions**:

1. **AMBIGUOUS case** — currently stops with error; mission requires "Surface bounded Coach choices"
2. **FIRST-10-LINES** — currently 1 line for natural language; mission requires ~10 lines
3. **FULL SENTENCES** — currently rejected by prose veto; mission requires recognition

The system has the **architectural seams** (RouteConstraints, unresolved, executionPrompt, constraints in RoutingDecision) to support these, but the policy layer needs explicit decisions.

---

**Scout Agent**: sideline-scout-deep  
**Model**: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Status**: Reconnaissance complete — not final architectural authority  
**Evidence**: All claims cited to exact repository files and line numbers above
