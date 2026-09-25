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
