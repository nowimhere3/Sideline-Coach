# RESULT

**SCOUT PLAY — READ-ONLY RECONNAISSANCE**

**Scout ID:** claude-live-tap  
**Assigned custom agent:** sideline-scout-quick  
**Assigned model:** openrouter/cohere/north-mini-code:free  
**Game root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Play ID:** ai-health-play3-field-map-20260921-190521

**This report is reconnaissance, not final architectural authority.**

# QUESTION INVESTIGATED

Inspect the current Claude structured-print seam around `src/player-control/structured-print.ts`, `StructuredPrintControl`, `startTurn`, `onTurnProcess`, Claude JSON frame handling, and PrintSignal/dialect handling to determine the exact current file paths, symbols, tests, fixtures, and safest insertion point for a bounded optional `onHealthFrame-style callback` when `frame.type === rate_limit_event`. Verify whether `rate_limit_info` can be forwarded without uuid, session_id, raw stdout, or unrelated frame data.

# EVIDENCE MAP

The evidence search reveals that **no `rate_limit_event`, `rate_limit_info`, or `onHealthFrame` symbols exist** in the current codebase. The requested functionality appears to be a new addition rather than an existing implementation. The current structured-print system handles standard Claude and AntiGravity frame types (`system`, `assistant`, `result`, `init`, `step_update`, `message`, `command`, `tool`, `denied`) but has no rate limiting frame handling.

# IMPORTANT FILES / PATHS

**Primary Investigation Files:**
- `src/player-control/structured-print.ts` - Main structured print implementation
- `src/player-control/contract.ts` - Control contracts and interfaces
- `src/player-control/bindings.ts` - Binding records
- `src/player-control/host.ts` - Host controls
- `src/player-control/codex-contract.ts` - Codex contracts
- `src/player-control/codex-app-server.ts` - Codex app server
- `src/player-control/bindings.ts` - Controlled binding records

**Test Files:**
- `test/player-control-contract.test.mjs`
- `test/player-control-persistence.test.mjs`

**Supporting Infrastructure:**
- `src/capability-types.ts` - Capability snapshots
- `src/provider-control.ts` - Provider control capabilities
- `src/scout-substitution.ts` - Infrastructure limit detection (contains rate limit regex)

# CURRENT TRUTH

**FACT:** The current codebase contains **no rate_limit_event, rate_limit_info, or onHealthFrame symbols** anywhere in the TypeScript source files.

**FACT:** The frame parsing logic in `structured-print.ts` handles these specific types:
- Claude frames: `system`, `assistant`, `result`
- AntiGravity frames: `event` values: `init`, `step_update`, `result`

**FACT:** The `PrintSignal` type currently supports: `init`, `message`, `command`, `tool`, `denied`, `result`

**FACT:** The `ParseSignal` parsing occurs in `parseClaudeFrame()` (lines 198-227) and `parseAntiGravityFrame()` (lines 299-321) with no rate limiting detection.

# INFERENCES

**INFERENCE:** Based on the existing infrastructure in `scout-substitution.ts`, the system already detects rate limiting through regex patterns (`RATE_LIMIT = /rate.?limit|too many requests|\b429\b/i`) but this detection operates at a higher level, not at the structured-print frame level.

**INFERENCE:** The absence of `rate_limit_event` suggests that rate limiting is not currently captured at the Claude/AntiGravity frame parsing level, which means any callback for such events would need to be implemented from scratch.

# UNKNOWNS

**UNKNOWN:** What the actual `rate_limit_event` frame structure looks like in Claude/AntiGravity provider outputs
**UNKNOWN:** Whether `rate_limit_info` should contain fields like uuid, session_id, or raw stdout
**UNKNOWN:** The appropriate signature for an `onHealthFrame-style callback` that would be backward compatible

# WHAT DOES NOT NEED ARCHITECTURE

The addition of an optional callback for rate_limit_event handling appears to be a **bounded implementation task** rather than an architectural redesign. The existing structured-print system already provides clear patterns for frame processing and callback integration through the `onTurnProcess` option.

# RECOMMENDED NEXT AGENT / MODEL / EFFORT

**BOUNDED WORKER:** The implementation of an `onHealthFrame-style callback` should be done by a Worker with:
- Strong understanding of TypeScript interfaces
- Experience with the existing structured-print patterns
- Familiarity with the `PrintSignal` and `PrintTurnProcessEvent` types

**ARCHITECTURAL DECISION REQUIRED:** None - this is an implementation extension, not a redesign.

# LIMITATIONS

This reconnaissance is **read-only** and cannot:
- Modify the codebase to add new frame handling
- Implement the requested `onHealthFrame-style callback`
- Test the new functionality
- Verify integration points

The investigation confirms that the requested functionality does not currently exist and would require implementation by a Worker following the established patterns in `structured-print.ts`.

# WHAT THE FUTURE ARCHITECT SHOULD VERIFY

1. Whether the `rate_limit_event` exists in Claude/AntiGravity provider frame streams
2. The expected structure and content of such frames
3. Integration points for a health callback that don't break existing functionality
4. Whether existing infrastructure detection (like in `scout-substitution.ts`) should be extended to structured-print frame parsing

**The current structured-print system shows no evidence of rate limiting frame handling, suggesting this would be a new feature implementation rather than an existing seam to exploit.**
