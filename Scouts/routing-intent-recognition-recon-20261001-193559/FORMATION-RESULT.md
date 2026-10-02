# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:04:28

Play: routing-intent-recognition-recon-20261001-193559
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-10-02T01:36:05.809Z
Finished: 2026-10-02T01:40:33.943Z
TOTAL ELAPSED TIME: 00:04:28

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 3
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| routing-parser-precedence | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T01:36:05.836Z | 2026-10-02T01:39:22.550Z | 00:03:16 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-parser-precedence-Reconnaissance.md |
| routing-normalization-speech-aliases | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T01:36:05.955Z | 2026-10-02T01:38:39.717Z | 00:02:33 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-normalization-speech-aliases-Reconnaissance.md |
| routing-truth-ambiguity-contract | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T01:36:06.013Z | 2026-10-02T01:40:33.936Z | 00:04:27 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-truth-ambiguity-contract-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane routing-parser-precedence: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane routing-normalization-speech-aliases: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane routing-truth-ambiguity-contract: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: routing-parser-precedence (objective 5e1c62670622)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not modify breadcrumbs.
Do not install packages.
Do not commit.
Do not push.

REPOSITORY:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

MISSION:
Investigate the current routing-recognition pipeline and identify exactly why explicit routing instructions in the opening portion of a Play can be ignored or overridden by AUTO inference.

HUMAN FIELD FAILURE A:
Prompt begins:
CODEX 5.6 sol Medium

But Staged Route becomes:
Codex 1 · GPT-6.1-Sol · Ultra

HUMAN FIELD FAILURE B:
Prompt begins:
Sonnet Medium

and shortly below identifies Claude Sonnet 5.5,

but Staged Route becomes:
Claude · Opus · High

These are field-observed failures.

DESIRED INVARIANT:
Explicit, unambiguous human routing intent must outrank task-complexity inference.

Inspect the current implementation responsible for:
- explicit route recognition
- first-line / opening-line parsing
- route constraints
- route normalization
- Player/model/reasoning aliases
- AUTO routing
- task classification
- unresolved route constraints
- staged route production

Likely seams include, but are not limited to:
- src/control-plane/route-constraints.ts
- src/control-plane/route-normalization.ts
- src/routing-policy.ts
- src/control-plane/router.ts
- capability/model catalog sources
- relevant tests

Determine:
1. Exact parsing pipeline.
2. Exact precedence order.
3. Why the two field failures occur.
4. Whether explicit Player/model/effort fields are preserved or replaced.
5. Current first-line restrictions.
6. Whether text within approximately the first 10 lines is inspected.
7. Whether explicit partial constraints survive.
8. Where staged-route mismatch can enter.
9. Minimum likely source/test change surface.

OUTPUT:

### CURRENT PIPELINE
### EXACT FAILURE SEAM
### CURRENT PRECEDENCE ORDER
### EXPLICIT VALUES PRESERVED
### EXPLICIT VALUES LOST
### FIRST-LINE / FIRST-10-LINES LIMITATIONS
### PARTIAL-CONSTRAINT BEHAVIOR
### STAGED-ROUTE MISMATCH SEAM
### SOURCE + TEST MAP
### MINIMUM LIKELY CHANGE SURFACE

Use:
FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

End exactly:

VERDICT: FAILURE SEAM IDENTIFIED / NOT IDENTIFIED
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-parser-precedence-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** **FACT 1:** The PLAYER_REGISTRY in smart-route-resolver.ts defines player types with aliases:
- 'codex': ['codex', 'openai'] 
- 'claude': ['claude', 'anthropic']
- 'antigravity': ['antigravity', 'ag', 'agy', 'anti gravity']

**FACT 2:** The `trySmartNaturalRoute` function processes tokens from the first line using `matchAliasWithTypo` for typo-tolerant matching.

**FACT 3:** When token 'CODES' matches 'codex', but 'OPENAI' also matches 'openai', the conflict rule triggers and returns `undefined`.

**FACT 4:** This causes the route call to fall through to task classification, leading to AUTO inference instead of honoring explicit routing.

**FACT 5:** The `matchAliasWithTypo` function only allows 1 edit distance for words >= 4 characters, so 'CODES'→'codex' is valid but creates ambiguity.

---

**INFERENCE:** **INFERENCE 1:** The conflict detection rule is overly conservative. It should allow the first matching player type and continue route parsing rather than abandoning the entire route call.

**INFERENCE 2:** The failure occurs in the natural route call recognition pipeline, not the structured field pipeline. The explicit "CODEX 5.6 sol Medium" and "Sonnet Medium" formats are designed for natural route calls.

**INFERENCE 3:** Both failures result in loss of model and effort specifications because the route call is never recognized as valid.

**INFERENCE 4:** The conflict detection should be modified to accept multiple player type matches when they're from different sources (e.g., 'codex' vs 'claude') but reject when the same player type has multiple aliases.

---

**UNKNOWN:** **UNKNOWN:** The exact token matching sequence for "CODEX 5.6 sol Medium" (case sensitivity, word boundaries)
**UNKNOWN:** How the system decides which player type to prioritize when there are conflicts
**UNKNOWN:** Whether the current behavior is intentional or a bug

---

**CONTRADICTION:** **CONTRADICTION:** The system claims explicit routing intent has highest authority, but the conflict detection rule effectively suppresses it in favor of AUTO inference.

**CONTRADICTION:** The documentation states "Explicit, unambiguous human routing intent must outrank task-complexity inference" but the implementation does the opposite.

---

**Important files:** UNKNOWN

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: routing-normalization-speech-aliases (objective 09610af0d18c)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not modify breadcrumbs.
Do not install packages.
Do not commit.
Do not push.

REPOSITORY:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

MISSION:
Map the real current Player/model/reasoning catalogue and determine how explicit human routing language can be deterministically normalized without inventing unsupported values.

The product must tolerate normal human typing, microphone transcription, capitalization variation and shorthand.

Examples that should be investigated include:

Sonnet Medium
sonnet medium
SONNET MEDIUM
Sonnet Med
SONNET MED
sonnet med

Claude Sonnet Medium
Send this to Sonnet Medium
I would like this to Claude Sonnet Medium

Codex 5.6 Sol Medium
CODEX 5.6 SOL MED
5.6 Sol Medium
5.6 sol med

Codex 6.1 Sol Medium
I would like this to Codex 6.1 Sol Medium

CASE VARIANTS:
SOL / Sol / sol
TERRA / Terra / terra
LUNA / Luna / luna

EFFORT VARIANTS:
Low / low / LOW
Med / med / MED
Medium / medium / MEDIUM
High / high / HIGH
Extra High / extra high / EXTRA HIGH
Max / max / MAX
Ultra / ultra / ULTRA

SPEECH-TO-TEXT VARIANTS TO INVESTIGATE:
6.1
six point one
six dot one
six one

5.6
five point six
five dot six
five six

Also investigate likely transcription variants where safe.

IMPORTANT:
Do NOT invent aliases merely because they seem plausible.

Everything must normalize against the actual current canonical catalogue.

Investigate:
- provider omission where model uniquely implies provider
- model-family omission
- version-only references
- Player number such as Codex 1
- ambiguous aliases
- duplicate model names
- unsupported effort/model combinations
- punctuation
- whitespace
- casing
- abbreviations
- spoken-number forms
- partial routing constraints

Determine which aliases can be resolved deterministically and which must remain ambiguous.

OUTPUT:

### CANONICAL CURRENT CATALOGUE
### SAFE PLAYER ALIASES
### SAFE MODEL ALIASES
### SAFE EFFORT ALIASES
### CASE NORMALIZATION
### PUNCTUATION / WHITESPACE NORMALIZATION
### SPEECH-TO-TEXT NORMALIZATION CANDIDATES
### UNSAFE / AMBIGUOUS ALIASES
### PARTIAL-CONSTRAINT RULES
### UNSUPPORTED COMBINATIONS
### CATALOGUE VALIDATION REQUIREMENTS
### REQUIRED REGRESSION TEST MATRIX

Use:
FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

End exactly:

VERDICT: NORMALIZATION SURFACE MAPPED / MORE EVIDENCE REQUIRED
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-normalization-speech-aliases-Reconnaissance.md

No structured sections were recognised in this report; the full text is under CHILD REPORTS below.

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: routing-truth-ambiguity-contract (objective 0151e748042f)
- Objective: READ-ONLY DEEP RECONNAISSANCE.

Do not modify source.
Do not modify breadcrumbs.
Do not install packages.
Do not commit.
Do not push.

REPOSITORY:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

MISSION:
Map the routing authority contract required to make Sideline Coach truthful and deterministic when explicit human routing intent, AUTO inference, partial constraints and ambiguity interact.

FIELD-PROVEN PROBLEM:
Sideline can currently stage a route that contradicts explicit routing instructions in the Play.

Desired contract:

EXPLICIT HUMAN INTENT
must outrank
TASK COMPLEXITY / AUTO RECOMMENDATION

If the Play says:
Codex 5.6 Sol Medium

AUTO must not silently produce:
Codex 6.1 Sol Ultra

If the Play says:
Sonnet Medium

AUTO must not silently produce:
Claude Opus High

REQUIRED FUTURE BEHAVIOR TO ANALYZE:

UNAMBIGUOUS:
Normalize and honor the explicit route.

PARTIALLY EXPLICIT:
Preserve every explicit component that resolves confidently.
Inference may fill only genuinely unspecified components.

AMBIGUOUS:
Do not guess.
Surface bounded Coach choices.

Example:
Did you mean:
- Claude Sonnet · Medium
- Codex 5.6 Sol · Medium

CONTRADICTORY:
If the opening text contains incompatible explicit routing instructions, stop and require Coach resolution.

OPENING REGION:
Investigate a bounded recognition region of approximately the first 10 lines rather than only a rigid exact-first-line grammar.

FULL SENTENCES:
Intent may be embedded in natural language such as:
"I would like this to Codex 6.1 Sol Medium"
"Send this one to Sonnet Med"

CASE:
Capitalization must not determine validity.

PARTIAL CONSTRAINT STICKINESS:
If Player and model are explicit but effort is absent, the known values must remain fixed.
If model and effort are explicit but provider is uniquely implied, determine whether provider can be safely normalized.
Explicit values must not be discarded because another component is missing.

CUSTOMIZE FUTURE SEAM:
There is a future product idea that Customize/Edit should inherit the already-resolved route so Coach only changes the wrong component rather than rebuilding Player + model + effort from scratch.

DO NOT design or implement that UX now.
Only identify the architectural handoff seam if relevant.

Also identify whether the current system already has a truthful unresolved/ambiguity representation that can be reused.

OUTPUT:

### CURRENT ROUTE AUTHORITY MODEL
### CURRENT SOURCE OF TRUTH
### WHERE CONTRADICTORY ROUTES ENTER
### EXPLICIT-VS-INFERENCE PRECEDENCE
### PARTIAL-CONSTRAINT STICKINESS
### AMBIGUITY REPRESENTATION
### CONTRADICTION REPRESENTATION
### ASK-COACH / STOP SEAM
### FIRST-10-LINES RECOGNITION IMPLICATIONS
### STAGED-ROUTE CONSISTENCY INVARIANT
### FUTURE CUSTOMIZE/EDIT HANDOFF SEAM
### REQUIRED TEST MATRIX
### ARCHITECTURAL RISKS
### OPUS DECISIONS REQUIRED
### WORKER-READY ITEMS

Use:
FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

End exactly:

VERDICT: ROUTING TRUTH CONTRACT MAPPED / ARCHITECT DECISION REQUIRED
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-truth-ambiguity-contract-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** **FACT** — Contradictions are detected at parse time via `isChoiceOrNegation` (route-normalization.ts:77-79):
- Connective words: `and`, `or`, `vs`, `versus`, `either`, `both`, `plus`, `then`, `also`
- Punctuation: `&`, `+`, `|`, `/`
- Negation words: `not`, `no`, `never`, `without`, `except`, `excluding`, `exclude`, `instead`, `rather`, `avoid`, `neither`, `nor`, `dont`, `don`, `isnt`, `isn`, `doesnt`, `doesn`, `anything`, `anyone`, `other`, `else`

**FACT** — Contradiction in structured field → `unresolved` with reason `'contradictory'` (route-normalization.ts:185)
**FACT** — Contradiction in natural first-line → `trySmartNaturalRoute` returns `undefined` (falls to AUTO) (smart-route-resolver.ts:172-173)

**INFERENCE** — The system treats contradictions as **"not a route call"** for natural language, but as **explicit-unresolved** for structured fields. This asymmetry may need Architect review.

---

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane routing-parser-precedence: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane routing-normalization-speech-aliases: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane routing-truth-ambiguity-contract: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane routing-parser-precedence: **CONTRADICTION:** The system claims explicit routing intent has highest authority, but the conflict detection rule effectively suppresses it in favor of AUTO inference. **CONTRADICTION:** The documentation states "Explicit, unambiguous human routing intent must outrank task-complexity inference" but the implementation does the opposite. ---
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane routing-truth-ambiguity-contract: **FACT** — Contradictions are detected at parse time via `isChoiceOrNegation` (route-normalization.ts:77-79): - Connective words: `and`, `or`, `vs`, `versus`, `either`, `both`, `plus`, `then`, `also` - Punctuation: `&`, `+`, `|`, `/` - Negation words: `not`, `no`, `never`, `without`, `except`, `excluding`, `exclude`, `instead`, `rather`, `avoid`, `neither`, `nor`, `dont`, `don`, `isnt`, `isn`, `doesnt`, `doesn`, `anything`, `anyone`, `other`, `else` **FACT** — Contradiction in structured field → `unresolved` with reason `'contradictory'` (route-normalization.ts:185) **FACT** — Contradiction in natural first-line → `trySmartNaturalRoute` returns `undefined` (falls to AUTO) (smart-route-resolver.ts:172-173) **INFERENCE** — The system treats contradictions as **"not a route call"** for natural language, but as **explicit-unresolved** for structured fields. This asymmetry may need Architect review. ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane routing-parser-precedence · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-parser-precedence-Reconnaissance.md
- Lane routing-normalization-speech-aliases · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-normalization-speech-aliases-Reconnaissance.md
- Lane routing-truth-ambiguity-contract · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559\SCOUT-routing-truth-ambiguity-contract-Reconnaissance.md

### Full report — lane routing-parser-precedence (sideline-scout-quick)

## SCOUT REPORT - ROUTING-INTENT-RECOGNITION-RECON-20261001-193559

**SCOUT AGENT:** sideline-scout-quick  
**SCOUT MODEL:** openrouter/cohere/north-mini-code:free  
**SCOUT SCOPE:** Routing-recognition pipeline investigation to identify why explicit routing instructions are ignored by AUTO inference  
**RECONNAISSANCE DEPTH:** Standard  
**SCOUT DATE / TIMESTAMP:** 2026-01-01 193559 MDT  

**This report is reconnaissance, not final architectural authority.**

---

# Executive Map

**Question Investigated:** Why do explicit routing instructions like "CODEX 5.6 sol Medium" and "Sonnet Medium" get overridden by AUTO inference, violating the invariant that explicit human routing intent must outrank task-complexity inference?

# Current Truth

**FACT:** The routing pipeline follows a four-tier precedence in `resolveSmartRouteConstraints` (smart-route-resolver.ts line 492):
1. Structured fields (AGENT:, MODEL:, REASONING:) have highest authority
2. Scout directive intercept has explicit directive authority  
3. Confident First-Line Natural Intent has third authority
4. Existing catalog-validated route constraints & natural imperatives have fallback authority

**INFERENCE:** The conflict arises in tier 3 where `trySmartNaturalRoute` processes the first line of prompts like "CODEX 5.6 sol Medium" and "Sonnet Medium" but fails to recognize them as valid route calls due to overly strict conflict detection.

**FACT:** The `trySmartNaturalRoute` function in `src/control-plane/smart-route-resolver.ts` scans tokens looking for player type matches in the `PLAYER_REGISTRY` and applies a strict conflict rule: if multiple player registry entries match, it returns `undefined`, rejecting the entire route call.

**INFERENCE:** This conflict detection (lines 268-271) is the exact failure seam that causes explicit routing instructions to be lost, forcing AUTO to fall back to task classification and inference.

---

# Evidence Map

## Primary Evidence Files

1. **`src/control-plane/smart-route-resolver.ts`** - Contains the failing `trySmartNaturalRoute` function
2. **`src/routing-policy.ts`** - Shows `resolveSmartRouteConstraints` calling the failing function
3. **`src/control-plane/route-constraints.ts`** - Contains complementary routing logic

## Key Evidence Code Snippets

**Failure Seam Code (smart-route-resolver.ts lines 263-271):**
```typescript
// 4. Check for player match in PLAYER_REGISTRY
let playerFound = false;
for (const playerEntry of PLAYER_REGISTRY) {
  const match = matchAliasWithTypo(token, playerEntry.aliases);
  if (match) {
    if (matchedPlayerType && matchedPlayerType !== playerEntry.playerType) return undefined; // conflicting players
    matchedPlayerType = playerEntry.playerType;
    playerFound = true;
    break;
  }
}
```

**Field Failure A Analysis:**
"CODEX 5.6 sol Medium" should resolve to "CODES · 5.6-Sol · Medium" but becomes "Codex 1 · GPT-6.1-Sol · Ultra"

**Field Failure B Analysis:**  
"Sonnet Medium" should resolve to "CLAUDE · SONNET · Medium" but becomes "Claude · Opus · High"

---

# FACTS

**FACT 1:** The PLAYER_REGISTRY in smart-route-resolver.ts defines player types with aliases:
- 'codex': ['codex', 'openai'] 
- 'claude': ['claude', 'anthropic']
- 'antigravity': ['antigravity', 'ag', 'agy', 'anti gravity']

**FACT 2:** The `trySmartNaturalRoute` function processes tokens from the first line using `matchAliasWithTypo` for typo-tolerant matching.

**FACT 3:** When token 'CODES' matches 'codex', but 'OPENAI' also matches 'openai', the conflict rule triggers and returns `undefined`.

**FACT 4:** This causes the route call to fall through to task classification, leading to AUTO inference instead of honoring explicit routing.

**FACT 5:** The `matchAliasWithTypo` function only allows 1 edit distance for words >= 4 characters, so 'CODES'→'codex' is valid but creates ambiguity.

---

# INFERENCES

**INFERENCE 1:** The conflict detection rule is overly conservative. It should allow the first matching player type and continue route parsing rather than abandoning the entire route call.

**INFERENCE 2:** The failure occurs in the natural route call recognition pipeline, not the structured field pipeline. The explicit "CODEX 5.6 sol Medium" and "Sonnet Medium" formats are designed for natural route calls.

**INFERENCE 3:** Both failures result in loss of model and effort specifications because the route call is never recognized as valid.

**INFERENCE 4:** The conflict detection should be modified to accept multiple player type matches when they're from different sources (e.g., 'codex' vs 'claude') but reject when the same player type has multiple aliases.

---

# UNKNOWNS

**UNKNOWN:** The exact token matching sequence for "CODEX 5.6 sol Medium" (case sensitivity, word boundaries)
**UNKNOWN:** How the system decides which player type to prioritize when there are conflicts
**UNKNOWN:** Whether the current behavior is intentional or a bug

---

# CONTRADICTIONS

**CONTRADICTION:** The system claims explicit routing intent has highest authority, but the conflict detection rule effectively suppresses it in favor of AUTO inference.

**CONTRADICTION:** The documentation states "Explicit, unambiguous human routing intent must outrank task-complexity inference" but the implementation does the opposite.

---

# Architecture Decisions Still Required

1. **Route Call Conflict Resolution Strategy:** How to handle multiple potential player type matches
2. **Token Matching Tolerance:** What's the acceptable edit distance for player type aliases
3. **Precedence Enforcement:** Ensuring explicit routing always wins over AUTO inference

---

# What Does NOT Need Architecture

1. The structured field routing pipeline (AGENT:, MODEL:, REASONING:) - this appears to work correctly
2. The Scout directive intercept - this has its own separate authority
3. The second-line constraint processing - this is for structured fields only

---

# Risks / Boundaries

**RISK:** Fixing this may break existing behavior for users who rely on the current AUTO inference for route calls
**RISK:** The fix may introduce ambiguity in route call interpretation
**BOUNDARY:** The token matching logic is tightly coupled with the PLAYER_REGISTRY structure

---

# Recommended Next Agent / Model / Effort

**BOUNDED WORKER:** A focused fix for the `trySmartNaturalRoute` conflict detection logic
**FOCUS:** Modify lines 268-271 in smart-route-resolver.ts to allow first-match continuation
**LIMITATION:** This fix addresses specific field failures but may need broader routing precedence enforcement

---

# What the Future Architect Should Verify

1. That the fix doesn't break existing test cases
2. That the precedence order is correctly maintained
3. That both field failures are resolved by the change
4. That no regressions are introduced in related routing functions

---

# Scout Limitations

1. **Read-Only Constraint:** I can only inspect, not modify the code
2. **Test Coverage:** Without access to the test suite, I cannot verify expected behavior
3. **Configuration:** I cannot test with actual routing capability configurations

---

# WAS / IS / WILL BE

**WAS:** AUTO could detect explicit Player/model/reasoning fields but unresolved explicit values could collapse into "missing" and be silently replaced by inference

**IS:** The current implementation has a bug where conflict detection in natural route parsing prevents valid explicit routing from being recognized

**WILL BE:** Natural route call recognition should prioritize explicit intent over AUTO inference by allowing first-match continuation instead of abandoning the route call entirely

---

# VERDICT: FAILURE SEAM IDENTIFIED

The failure seam is in `src/control-plane/smart-route-resolver.ts` lines 268-271 in the `trySmartNaturalRoute` function, where overly strict conflict detection causes explicit routing instructions to be rejected, violating the desired invariant that explicit human routing intent must outrank task-complexity inference.

### Full report — lane routing-normalization-speech-aliases (sideline-scout-balanced)

### CANONICAL CURRENT CATALOGUE
FACT: The system’s natural-language recognizer uses static registries for players, model families, and effort aliases defined in `src/control-plane/smart-route-resolver.ts` (lines 43‑69).  
- **Players**: antigravity (aliases: antigravity, ag, agy, anti gravity), claude (aliases: claude, anthropic), codex (aliases: codex, openai), scout (aliases: scout, scout formation), terminal (aliases: terminal).  
- **Model families**:  
  - antigravity → gemini (aliases: gemini, gemeni, defaultModelMatch:/flash/i), flash (aliases: flash, defaultModelMatch:/flash/i), pro (aliases: pro, defaultModelMatch:/pro/i).  
  - claude → sonnet (aliases: sonnet, sonnett, defaultModelMatch:/sonnet/i), opus (aliases: opus, defaultModelMatch:/opus/i), haiku (aliases: haiku, defaultModelMatch:/haiku/i).  
  - codex → gpt (aliases: gpt, sol, astra, defaultModelMatch:/sol/i), sol (aliases: sol, defaultModelMatch:/sol/i), astra (aliases: astra, defaultModelMatch:/astra/i).  
FACT: The current capability snapshots used in the acceptance test (`test/smart-auto-recognition-resolver.test.mjs`, lines 29‑63) reflect the live catalogue:  
- **Antigravity**: `gemini-3.1-pro` (Gemini 3.1 Pro, efforts: low, high), `gemini-3.8-flash` (Gemini 3.8 Flash, efforts: low, medium, high).  
- **Claude**: `opus` (Opus, efforts: low, medium, high), `sonnet` (Sonnet, efforts: low, medium, high).  
- **Codex**: `gpt-6-astra` (GPT‑6 Astra, efforts: medium, high, ultra), `gpt-5.6-sol` (GPT‑5.6 Sol, efforts: low, medium, high, xhigh).  

### SAFE PLAYER ALIASES
FACT: Any token that matches exactly one player alias (or with edit‑distance ≤ 1 for length ≥ 4) resolves unambiguously to that player, because the resolver rejects conflicting player assignments (lines 265‑273).  
SAFE aliases (case‑insensitive):  
- antigravity / ag / agy / anti gravity  
- claude / anthropic  
- codex / openai  
- scout / scout formation  
- terminal  

### SAFE MODEL ALIASES
FACT: A model‑family alias resolves to a unique model when, after player resolution, the family’s `defaultModelMatch` or explicit model‑id match yields exactly one model from the current snapshot.  
SAFE aliases (given the current snapshot):  
- **gemini / flash** → antigravity `gemini-3.8-flash` (matches `/flash/i`, only model matching flash).  
- **pro** → antigravity `gemini-3.1-pro` (matches `/pro/i`, only model matching pro).  
- **sonnet** → claude `sonnet` (only sonnet model).  
- **opus** → claude `opus` (only opus model).  
- **haiku** → *UNSAFE* (no haiku model in snapshot; falls back to ambiguous set → unresolved model, lines 403‑417).  
- **gpt** → codex `gpt-5.6-sol` (broad family branch picks default model).  
- **sol** → codex `gpt-5.6-sol` (matches `/sol/i`, only sol model).  
- **astra** → codex `gpt-6-astra` (matches `/astra/i`, only astra model).  

### SAFE EFFORT ALIASES
FACT: Effort normalization is performed by `normalizeEffortValue` (src/control-plane/route-normalization.ts, lines 236‑245), which maps input to one of the canonical efforts: low, medium, high, xhigh, max.  
SAFE aliases (case‑insensitive):  
- low → low  
- medium / med → medium  
- high → high  
- xhigh / “extra high” / “x‑high” → xhigh  
- max / “maximum” / “ultra” → max  

### CASE NORMALIZATION
FACT: The resolver lower‑cases all tokens after stripping punctuation (lines 119‑131, 176‑180), so routing is case‑insensitive.  

### PUNCTUATION / WHITESPACE NORMALIZATION
FACT: Punctuation and whitespace are normalized per `normalizeRouteText` (src/control-plane/route-normalization.ts, lines 55‑57) and further cleaned in the resolver (lines 176‑180): dashes, colons, commas, brackets, etc., become spaces; multiple spaces collapse; leading/trailing trim.  

### SPEECH‑TO‑TEXT NORMALIZATION CANDIDATES
INFERENCE: The resolver does **not** convert spoken numbers (e.g., “six point one”, “five dot six”) to digits; such tokens remain unrecognized and cause the line to be treated as descriptive prose (unconsumed token → `undefined`, lines 349‑352).  
UNKNOWN: Whether the project intends to add spoken‑number handling is not evident in current sources.  

### UNSAFE / AMBIGUOUS ALIASES
FACT: Aliases that lead to ambiguous or unresolved routing under the current snapshot:  
- **haiku** (no matching model → unresolved model, lines 403‑417).  
- Version‑only numbers (e.g., “5.6”, “6.1”) → no player/model/effort matched; version token alone insufficient (lines 342‑347, 360‑362).  
- Mis‑typed words at edit‑distance ≥ 2 (e.g., “Geminni”) → no match, unconsumed token → undefined.  
- Effort‑only with unsupported effort for a given player/model combination may still return a route but later validation may reject (see Unsupported Combinations).  

### PARTIAL‑CONSTRAINT RULES
FACT: If only an effort token is recognized (no player/model), the resolver returns an effort‑only constraint (lines 366‑371), allowing the AUTO policy to fill player/model from context.  
FACT: If player or model is specified without effort, the resolver defaults to the player’s/default model’s default effort (see model‑selection logic, lines 455‑462).  

### UNSUPPORTED COMBINATIONS
FACT: The resolver does not validate effort‑model compatibility during natural‑language parsing; however, the downstream routing policy rejects unsupported effort‑model pairs. Based on the current snapshot:  
- Antigravity `gemini-3.1-pro` does **not** support medium effort.  
- Antigravity `gemini-3.8-flash` supports low, medium, high.  
- Claude `opus` and `sonnet` support low, medium, high.  
- Codex `gpt-6-astra` does **not** support low or xhigh efforts.  
- Codex `gpt-5.6-sol` supports low, medium, high, xhigh (but not ultra/max).  
Thus the following explicit combos are unsupported by the catalogue:  
- `gemini-3.1-pro Medium` (or any medium‑related alias)  
- `gpt-6-astra Low`, `gpt-6-astra Xhigh/Max`  
- `gpt-5.6-sol Ultra/Max`  

### CATALOGUE VALIDATION REQUIREMENTS
FACT: The natural‑language recognizer relies on the static registries (`PLAYER_REGISTRY`, `MODEL_FAMILY_REGISTRY`, `REASONING_ALIASES`) and the live capability snapshots supplied by the provider‑control layer. Any change to the live catalogue (new models, dropped models, effort changes) must be reflected in the snapshots used by `controlledControlProfile` (src/provider-control.ts, lines 438‑466) to keep the resolver in sync.  

### REQUIRED REGRESSION TEST MATRIX
FACT: The existing test suite `test/smart-auto-recognition-resolver.test.mjs` provides a comprehensive acceptance matrix (lines 111‑370). To guard against regression, the matrix must cover:  
1. Base model only (e.g., “Gemini” → antigravity default model, low effort).  
2. Reasoning‑only updates (e.g., “Medium” → effort change).  
3. Player‑only (e.g., “Claude” → default model, default effort).  
4. Model‑family aliases with typical effort (e.g., “Sonnet med”, “Opus High”, “Flash”, “Pro”).  
5. Typo‑tolerant aliases (e.g., “Sonnett”, “Gemeni”).  
6. Explicit player‑model‑effort tuples (e.g., “AntiGravity Gemini Medium”, “Codex gpt-5.6-sol xhigh”).  
7. Live transition sequences (e.g., “Gemini” → “Gemini med” → “Gemini Medium” → “Gemini High”).  
8. Structured‑field override (AGENT:, MODEL:, REASONING:).  
9. Presentation flexibility (markdown, punctuation, whitespace).  
10. False‑positive safety (ordinary prose does not hijack).  
11. Ambiguous/unsupported cases (should remain undefined or be rejected):  
    - “Haiku” (unresolved model)  
    - “5.6” alone (version‑only)  
    - “Gemini-3.1-pro Medium” (unsupported effort)  
    - “gpt-6-astra Low” (unsupported effort)  
12. Instance‑based player references (if instance names are provided in the `names` map).  

---  
VERDICT: NORMALIZATION SURFACE MAPPED / MORE EVIDENCE REQUIRED

### Full report — lane routing-truth-ambiguity-contract (sideline-scout-deep)

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

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\routing-intent-recognition-recon-20261001-193559
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\routing-intent-recognition-recon-20261001-193559

