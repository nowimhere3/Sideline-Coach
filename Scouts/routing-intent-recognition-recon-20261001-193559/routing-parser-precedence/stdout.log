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
