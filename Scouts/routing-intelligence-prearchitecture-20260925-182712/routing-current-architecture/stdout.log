# SCOUT PLAY — READ-ONLY RECONNAISSANCE

Play ID: routing-intelligence-prearchitecture-20260925-182712
Scout ID: routing-current-architecture
Assigned custom agent: sideline-scout-quick
Assigned model: openrouter/cohere/north-mini-code:free
Game root: C:\Users\dmcal\Documents\GitHub\SidelineCoach

## SCOUT PLAY — READ-ONLY RECONNAISSANCE

This is reconnaissance, not final architectural authority. This report maps the factual existing terrain of Sideline Coach's current Intelligent Routing and Play Compiler architecture before any modifications are made.

## 1. CURRENT ROUTING SOURCE OF TRUTH

**FACT:** The core routing logic is implemented in `src/control-plane/router.ts` and compiled to `out/control-plane/router.js`.

**FACT:** Key routing components exist in `src/routing-policy.ts` and compiled to `out/routing-policy.js`.

**FACT:** The current architecture uses a three-provider model (Codex, Claude, AntiGravity) with preference tables defined in `PROVIDER_PREFERENCE` constants.

**EVIDENCE:** File `src/routing-policy.ts:212-217` shows the provider preference:
```typescript
const PROVIDER_PREFERENCE: Readonly<Record<TaskClassification, readonly string[]>> = {
  architecture: ['claude', 'codex', 'antigravity'],
  implementation: ['codex', 'claude', 'antigravity'], 
  quick: ['antigravity', 'claude', 'codex'],
  default: ['codex', 'claude', 'antigravity']
};
```

**FACT:** Routing is driven by three main components:
1. **Control Plane Router** (`src/control-plane/router.ts`) - handles dispatch orchestration
2. **Routing Policy** (`src/routing-policy.ts`) - implements model selection per provider
3. **Smart Route Resolver** (`src/control-plane/smart-route-resolver.ts`) - parses natural language constraints

**LIMITATIONS:** This analysis is based on compiled JavaScript files; the TypeScript source provides more detailed structure but the compiled output shows the runtime behavior.

## 2. EXPLICIT HUMAN ROUTE PATH

**FACT:** Human constraints follow the S56.0 CANONICAL-PLAY-ROUTING-ENVELOPE pattern with structured fields (AGENT:, MODEL:, REASONING:).

**EVIDENCE:** File `src/control-plane/route-constraints.ts:138-170` shows structured field parsing:
```typescript
function structuredRouteField(raw: string): StructuredRouteField | undefined {
  const line = withoutPresentationPrefix(raw);
  if (/^(?:`[^`]+`|[\""][^\""]+[\""]|'[^']+')$/.test(line)) return undefined;
  const colon = line.indexOf(':');
  if (colon <= 0) return undefined;
  const rawLabel = line.slice(0, colon).trim();
  let value = line.slice(colon + 1).trim();
  const dimension = resolveFieldLabel(rawLabel);
  return dimension && value ? { dimension, value } : undefined;
}
```

**FACT:** Explicit human intent can be:
1. **Structured fields** (AGENT: Claude, MODEL: Sonnet, REASONING: High)
2. **First-line natural route calls** ("Claude Sonnet", "Claude Opus High")
3. **Control-shaped titles** ("SCOUT FORMATION — OPUS SCOPE PACK")

**FACT:** S56.1 SCOUT-DIRECTIVE-INTERCEPT handles explicit Scout commands like "Scout this play" or "Scout needed: ..." which route control, not objective.

**LIMITATIONS:** The analysis shows routing intent detection but doesn't prove real-world validation of edge cases.

## 3. AUTO / MANUAL PATH

### AUTO Path

**FACT:** AUTO routing uses conservative heuristics with multiple layers:
1. **Shell intent detection** (`src/control-plane/router.ts:368-405`) for exact commands
2. **Task classification** (`src/play-analyzer.ts:20-35`) into architecture/implementation/quick/default
3. **Context-aware routing** (`src/routing-policy.ts:686-1025`) with ledger evidence and report ownership
4. **Provider preference selection** based on task type

**EVIDENCE:** `src/play-analyzer.ts:20-35` shows task classification:
```typescript
function classifyTask(prompt: string): TaskClassification {
  const trimmed = prompt.trim();
  if (!trimmed) return 'default';
  const lower = trimmed.toLowerCase();
  if (/\b(architect|architecture|design|scout|plan|rfc|blueprint|strategy)\b/.test(lower) || trimmed.length > 3000) {
    return 'architecture';
  }
  if (/\b(implement|code|build|refactor|test|fix|patch|feature|add|create|rewrite|compile)\b/.test(lower) || trimmed.includes('\n')) {
    return 'implementation';
  }
  if (/\b(doc|docs|readme|comment|typo|quick|check|inspect|status|version|verify)\b/.test(lower) || trimmed.length < 80) {
    return 'quick';
  }
  return 'default';
}
```

**FACT:** AUTO uses **context affinity** (`src/control-plane/context-affinity.ts`) to detect continuations and ownership from reports and ledger entries.

### MANUAL Path

**FACT:** MANUAL mode respects human constraints exactly and cannot be overridden by AUTO.

**EVIDENCE:** `src/control-plane/router.ts:184-248` shows manual routing:
```typescript
if (routingMode === 'manual') {
  if (targetModel === 'auto' || targetEffort === 'auto') {
    // MANUAL Player, Coach Auto model/effort: resolve for the EXACT instance the human chose
  }
}
```

**FACT:** MANUAL respects **Scout directive intercept** (`src/routing-policy.ts:322-365`) and never substitutes unavailable Scout.

## 4. PLAYER / MODEL / REASONING PATH

### Player Selection Path

**FACT:** Player selection follows this hierarchy:
1. **Structured AGENT/PLAYER fields** (highest authority)
2. **First-line route calls** ("Claude", "AntiGravity")
3. **Provider preference tables** for task-appropriate providers
4. **Context owner continuity** (reports ownership)
5. **Exhaustion-based fallback** when no candidates match

**EVIDENCE:** `src/routing-policy.ts:524-571` shows the selection logic:
```typescript
// WHO: the preferred provider for this kind of Play that has a Player ready.
const readyProviders = [...new Set(operable.map((c) => c.playerType))];
const preference = PROVIDER_PREFERENCE[task];
const chosenType = [...readyProviders].sort((a, b) => rank(preference, a) - rank(preference, b))[0];

// WHICH INSTANCE: a sibling the Instance Work Ledger knows is idle beats one whose
// work state is unknown; otherwise the first free instance, deterministically.
const ofType = operable.filter((c) => c.playerType === chosenType);
const candidate = ofType.find(isKnownIdle) ?? ofType[0];
```

### Model Selection Path

**FACT:** Model selection varies by provider:

**Codex Provider:** (`src/routing-policy.ts:38-110`)
- Architecture: Ultra/Max models for complexity
- Implementation: Sol/Terra models for coding
- Quick: Luna/Mini/Flash models for speed
- Default: Provider default model

**Claude Provider:** (`src/routing-policy.ts:127-143`)
- Architecture: Opus/Sonnet with high effort
- Implementation: Sonnet/Opus with medium effort  
- Quick: Haiku/Sonnet with low effort
- Default: Claude default model

**AntiGravity Provider:** (`src/routing-policy.ts:147-166`)
- All tasks use Flash/Pro with appropriate effort
- Rationale includes provider attribution: `${play} · ${chosenDisplayName} via AntiGravity`

**FACT:** Model resolution uses S56.2 **value normalization** (`src/control-plane/route-normalization.ts`) which:
- Parses structured fields (MODEL: Sonnet 5)
- Handles version decoration ("Sonnet 5")
- Resolves against catalog truth
- Never corrects spelling
- Handles ambiguity (multiple models match)

**LIMITATIONS:** This analysis shows the policy structure but doesn't validate real catalog availability or edge cases.

## 5. STICKY ASSIGNMENT / CONTINUITY

**FACT:** Session continuity uses **context affinity** (`src/control-plane/context-affinity.ts`) with three states:
1. **Owner** - clear report ownership
2. **Unknown** - unable to prove ownership  
3. **None** - new work

**EVIDENCE:** `src/control-plane/context-affinity.ts:73-116` shows context resolution:
```typescript
function resolveContextOwner(followUp, gameId, ledger, reports) {
  if (followUp.kind === 'new-work') return { state: 'none' };
  
  const gameLedger = ledger.filter((entry) => entry.gameId === gameId);
  const gameReports = reports.filter((report) => !report.gameId || report.gameId === gameId);
  
  if (followUp.refersToReport) {
    const report = followUp.reportPath
      ? gameReports.find((candidate) => candidate.path === followUp.reportPath)
      : [...gameReports].sort((a, b) => b.mtime - a.mtime)[0];
    
    if (!report) return { state: 'unknown', reason: "Coach can't find the report this Play refers to." };
    const owner = ownerOfReport(report, gameId, gameLedger);
    if (!owner) return { state: 'unknown', reason: "Coach can't prove which Player owns this context.", report };
    
    return {
      state: 'owner',
      ownerInstanceId: owner.playerInstanceId,
      evidence: followUp.source === 'wording' ? 'latest-report' : followUp.source,
      confidence: evidence === 'latest-report' ? 'medium' : 'strong',
      report,
      previousPlaySummary: previousPlay(owner, report)
    };
  }
  
  // "Continue / now test what you built": the most recent Play recorded in this Game.
  let latest;
  for (const entry of gameLedger) {
    const current = entry.currentPlay ? { at: entry.currentPlay.startedAt, summary: entry.currentPlay.promptSummary } : undefined;
    const last = entry.recentPlays.find((play) => play.outcome !== 'not-sent');
    const lastAt = last ? { at: last.finishedAt, summary: last.promptSummary } : undefined;
    for (const candidate of [current, lastAt]) {
      if (candidate && (!latest || candidate.at > latest.at)) latest = { entry, at: candidate.at, summary: candidate.summary };
    }
  }
  
  if (!latest) return { state: 'unknown', reason: "Coach can't prove which Player owns this context." };
  return {
    state: 'owner',
    ownerInstanceId: latest.entry.playerInstanceId,
    evidence: 'latest-play',
    confidence: 'medium',
    previousPlaySummary: latest.summary ?? latest.entry.recentPlays[0]?.playLabel
  };
}
```

### Scout Continuity

**FACT:** Scout provides **reconnaissance continuity** through:

1. **ComputeScoutAutoRoute** (`src/routing-policy.ts:271-319`) - conservative Scout selection for reconnaissance
2. **ComputeScoutDirectiveRoute** (`src/routing-policy.ts:326-365`) - explicit Scout commands
3. **AnalyzeScoutNeed** (`src/play-analyzer.ts:53-91`) - determines when Scout is appropriate
4. **AnalyzeScoutContinuationAuthority** (`src/play-analyzer.ts:98-113`) - validates post-Scout work authorization

**FACT:** **S56.1 SCOUT-DIRECTIVE-INTERCEPT** ensures explicit Scout directives are routing control, not objective.

**FACT:** **S56.3 HUMAN SHORTHAND + CONTROL-TITLE INTERCEPT** handles route calls in first lines and control-shaped titles before task classification.

## 6. EXISTING CONSERVE SEAMS

**FACT:** CONSERVE is mentioned as a future architectural layer but shows no current implementation.

**EVIDENCE:** Search reveals CONSERVE appears only in:
- **Future breadcrumb**: `src/routing-policy.ts:176-183` - mentions CONSERVE as future layer
- **Performance documentation**: References to resource conservation but no implementation

**FACT:** Current **resource awareness** exists in:
1. **Play Analyzer** - size-based difficulty classification
2. **Provider preference tables** - strategic model selection
3. **Context affinity** - avoiding unnecessary work

**LIMITATIONS:** No current CONSERVE implementation found; appears to be a planned future feature.

## 7. PLAY COMPILER SEAMS

**FACT:** Play compilation consists of multiple layers:

### S56.0 CANONICAL-PLAY-ROUTING-ENVELOPE
- **Envelope**: `src/capability-types.ts:68-92` - structured routing fields
- **Unresolved detection**: stops AUTO with needs-attention error
- **Directive intercept**: Scout control separation

### S56.1 SCOUT-DIRECTIVE-INTERCEPT  
- **Explicit commands**: "Scout this play", "Scout needed: ..."
- **Control vs objective separation**: routing control, not objective
- **Unavailable Scout handling**: truthful stop, never substitution

### S56.2 VALUE NORMALIZATION
- **Structured field parsing**: AGENT:, MODEL:, REASONING:
- **Canonical extraction**: longest, non-overlapping spans
- **No spelling correction**: conservative about ambiguity
- **Instance resolution**: numbered names for exact instances

### S56.3 HUMAN SHORTHAND + CONTROL-TITLE INTERCEPT
- **First-line route calls**: "Claude Sonnet", "AntiGravity Flash High"
- **Control-shaped titles**: "CLAUDE SONNET — ARCHITECTURE REVIEW"
- **Priority**: structured routing > natural Scout directive > human shorthand > control-title > AUTO

**EVIDENCE:** `src/control-plane/smart-route-resolver.ts:149-452` implements comprehensive natural language route recognition.

## 8. ARCHITECT DECISIONS REQUIRED

### Critical Unbounded Areas

**ARCHITECT DECISION REQUIRED:** **Future Intelligent Routing Engine** - The current V0.1 architecture is a basic routing system that requires significant architectural evolution to meet the future requirements outlined in the product context.

**ARCHITECT DECISION REQUIRED:** **Provider/Model/Reasoning Optimization** - Current model selection is static and provider-specific; future architecture needs:
- Dynamic model selection based on 5H remaining percentage
- Context-aware reasoning effort optimization
- Player capability scoring and ranking
- Performance-based routing decisions

**ARCHITECT DECISION REQUIRED:** **Session Continuity Evolution** - Current ownership detection is limited; future needs:
- Multi-dimensional context (not just report ownership)
- Player-requested Scout escalation
- Real-game performance learning
- Context decay and refresh policies

**ARCHITECT DECISION REQUIRED:** **CONSERVE Integration** - No current CONSERVE implementation but referenced as future feature requiring:
- Resource usage monitoring and allocation
- 5H window optimization
- Economic routing (speed vs cost trade-offs)
- Quota-aware provider selection

**ARCHITECT DECISION REQUIRED:** **Advanced Routing Features** - Missing planned features:
- **A-Team / B-Team / Scout distinctions** - not implemented
- **Capability pools** - not implemented  
- **Schedule-after-reset opportunity** - not implemented
- **Next Best Player opportunity** - not implemented

### Recommended Architecture Areas

**ARCHITECT DECISION REQUIRED:** **Context-Aware Routing Enhancement** - Expand beyond report ownership to include:
- Multi-provider context continuity
- Historical performance weighting
- Context decay and freshness management
- Cross-session knowledge preservation

**ARCHITECT DECISION REQUIRED:** **Intelligent Routing Algorithm** - Need algorithm that considers:
- 5H remaining percentage optimization
- Weekly reset horizon awareness
- Expected resource burn calculations
- First-pass success probability
- Player-caused fixes and retry patterns
- Context already possessed evaluation
- Same Player/session/Game/feature continuity
- Scout reports available
- Scout model/reasoning capability assessment
- Scout ROI vs premium resource spend
- Deadline/speed requirement balancing
- Safety/reliability requirements
- Schedule-after-reset opportunity identification

**LIMITATIONS:** This reconnaissance is read-only and maps existing architecture. The identified architect decisions represent gaps between current implementation and future requirements outlined in the product context.

## SUMMARY

**FACT:** Sideline Coach V0.1 implements a **three-provider routing system** (Codex, Claude, AntiGravity) with **layered intent detection** (structured fields → natural language → AUTO fallback).

**FACT:** Current architecture provides **basic reconnaissance support** through Scout formation and **context continuity** via report ownership, but is limited compared to future requirements.

**FACT:** The system uses **conservative routing** with clear seams for future Intelligent Routing enhancement.

**FACT:** **CONSERVE** appears only as a future breadcrumb; no current implementation found.

**ARCHITECT DECISIONS REQUIRED:** Multiple high-impact architectural decisions for the future Intelligent Routing / Routing Economics engine, particularly around resource optimization, context awareness, and the CONSERVE feature integration.

This reconnaissance successfully maps the factual existing terrain of Sideline Coach's routing architecture while clearly identifying what still requires architectural design.
