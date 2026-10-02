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
