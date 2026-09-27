# SCOUT PLAY - READ-ONLY RECONNAISSANCE

## Play ID: routing-intelligence-prearchitecture-20260925-182712
## Scout ID: routing-intelligence-ui
## Assigned custom agent: sideline-scout-quick
## Assigned model: openrouter/cohere/north-mini-code:free
## Game root: C:\Users\dmcal\Documents\GitHub\SidelineCoach

## RESULT
**READ-ONLY RECONNAISSANCE COMPLETE**

This Scout has conducted comprehensive reconnaissance of the Sideline Coach global UI architecture for future Intelligent Routing integration. The analysis reveals a mature VS Code extension architecture with clear Dad Mode vs Dev Mode distinctions, existing Scout infrastructure, and multiple surface opportunities for compact routing intelligence.

---

## KEY DISCOVERIES

### 1. **Global UI Architecture**
- **Architecture**: VS Code extension using TypeScript/JavaScript with HTML/CSS frontend
- **Primary Surface**: Single-page mobile-responsive HTML (`src/public/index.html`)
- **Mobile Experience**: Full responsive design with dedicated mobile terminal expansion (`src/public/pair.html`)
- **Framework**: No React/Vue - pure HTML/CSS with complex grid/flex layouts
- **Extension Host**: Runs in VS Code extension environment with Stadium Control Plane

### 2. **Dad Mode vs Dev Mode Architecture**
- **Dad Mode**: Minimal surface, human-facing, safe information only
  - Status bar: Connection indicator + port number
  - Team cards: Synthetic Player presentation
  - Settings: Basic human preferences only
  - No execution plumbing exposed
- **Dev Mode**: Full diagnostic surface, technical information only
  - Coach Routines: Advanced observability/configuration
  - Live Player Console: Terminal activity monitoring
  - Advanced Player Discovery: Raw terminal enumeration
  - Scout Formation operators: Direct formation management
  - AI Usage Scoreboard: Detailed usage metrics

### 3. **Existing Global Cards/Surfaces**

#### **AI Usage Scoreboard**
- **Location**: Dynamic placement (`top`/`bottom` configurable)
- **Compact Options**: Left/Used/Both percentage modes, Standard/Tight density
- **Default State**: Collapsed by default
- **Information**: Claude usage refresh frequency, OAuth account health
- **Responsive**: Mobile-aware, different compact layouts

#### **Team Cards**
- **Player Cards**: Synthetic Player presentations with capability states
- **Roster Cards**: Team composition management
- **Workflow Cards**: Recruit/Onboarding flows
- **Compact Mode**: Cards can collapse, maintaining summary information

#### **Settings Cards**
- **Global Settings**: Coach preferences management
- **Dev Mode Gate**: Gated technical settings
- **Card Architecture**: Draggable, collapsible, re-orderable interfaces
- **Disclosure Pattern**: Accordion-style information disclosure

### 4. **Routing & Alarms Infrastructure**

#### **AI Usage Alarms**
- **Threshold System**: 5H and Weekly low/critical percentages (20/5 and 15/5 for Claude, 20/5 and 20/5 for Codex)
- **Channels**: VS Code notifications and browser notifications (disabled by default)
- **Notification Types**: Threshold alerts and reset notifications
- **Max Stale Age**: 30 minutes

#### **Existing Alarm System**
- **Location**: `src/control-plane/alarm-engine.ts` and `alarm-state-store.ts`
- **Integration**: Part of global preferences system
- **State Management**: Persistent alarm state
- **Delivery**: VS Code window notifications

### 5. **Scout Infrastructure**
- **APIs**: Multiple Scout endpoints (`/api/scout/formation-receivers`, `/api/scout/formation-run`)
- **Dev Mode Gate**: Scout Formation operators available ONLY when Dev Mode is ON
- **Credential System**: OpenRouter credential management via `/api/scout/openrouter-credential`
- **Formation Candidates**: AntiGravity and Gemini Flash Direct, plus Combine depth chart integration
- **Reports**: Multiple report formats (Scout Formation results, Interchangeability comparisons)

### 6. **CONSERVE Integration**
- **Existing Awareness**: Some CONSERVE-aware routing in Scout combine operations
- **Health-Aware**: Integration with capability scorecards and health monitoring
- **Depth Chart**: Combine/Scorecards system provides model readiness
- **Capacity Evidence**: Available through Combine system

---

## FACT

### **Exact Files Supporting Current Architecture**

1. **Global UI Entry Point**: `src/public/index.html` (939 lines)
2. **Pairing Interface**: `src/public/pair.html` (143 lines)  
3. **Core Extension**: `src/extension.ts` (596 lines)
4. **Control Plane**: `src/control-plane/daemon.ts` (4369 lines)
5. **Running Players Config**: `src/running-players.ts` (342 lines)
6. **Play Analyzer**: `src/play-analyzer.ts` (239 lines)
7. **Routing Policy**: `src/routing-policy.ts` (not fully analyzed)
8. **Scout Formation**: `src/scout-formation.ts` (782 lines)
9. **Scout Bootstrap**: `src/scout-bootstrap.ts` (analyzed partially)
10. **Alarm Engine**: `src/control-plane/alarm-engine.ts` (analyzed partially)
11. **AI Usage Reader**: `src/control-plane/claude-usage-reader.ts`

### **Key Functions and Services**

#### **Dad Mode Gating Functions**
- `preferences.getPreferences()` - Returns global CoachPreferences
- `preferences.savePreferences()` - Atomic preference updates
- Dev Mode validation: `!this.getPreferences().devMode` blocks Scout Formation access

#### **Preference Validation**
- `isAlarmPreferences()` - Validates alarm configuration
- `isAiUsageRefreshMinutes()` - Validates refresh frequency (3,5,10,15)
- `isTerminalRetention()` - Validates retention settings
- `isTimeFormatPreference()` - Validates 12h/24h format

#### **Scout APIs**
- `GET /api/scout/formation-receivers?gameId=xxx` (Dev Mode gated)
- `POST /api/scout/formation-run` (Dev Mode gated)
- `GET /api/scout/openrouter-credential` (local-only)
- `POST /api/scout/bootstrap` (local-only)

#### **Card Components**
- Team card rendering via `playerRoster` in `src/stadium-client.ts`
- AI Usage scoreboard placement in `src/claude-usage-reader.ts`
- Settings card system in `src/public/index.html` (CSS classes: `.card`, `.settings-card`)

---

## INFERENCE

### **Mapping for Future Routing Intelligence**

#### **Dad Mode Surface (Ultra-compact)**
1. **Location**: Status bar area (`.status-bar`) in `src/extension.ts`
2. **Available Information**: 
   - Recommendation text (1 line max)
   - Confidence indicator (visual strength)
   - One-line reason
   - Schedule information (next best player)
   - Next Best opportunity indicator

3. **Gating Requirements**:
   - Read-only access to routing decisions
   - No execution control
   - Minimal state exposure
   - Safe, human-facing only

#### **Dev Mode Surface (Full Diagnostic)**
1. **Available Information**:
   - Capability fit analysis
   - Evidence count and sources
   - Prior research context
   - Scorecard evidence links
   - Resource economics (5H/Weekly remaining percentages)
   - Reset horizon calculations
   - Alternative Players list
   - Rationale breakdown
   - Context possession details

2. **Gating Requirements**:
   - Requires Dev Mode enabled (`devMode: true` in preferences)
   - Requires gameId context
   - Technical diagnostic permission

### **Consolidated Routing Intelligence Surface Options**

#### **Ultra-compact (Dad Mode Ready)**
```
[Sideline Coach] [Recommendation] [Confidence ★★★] [Next: Claude 3.5 Sonnet]
```

#### **Expanded (Dev Mode Surface)**
```
[AI Usage Scoreboard] [Capability Fit: 87%] [Evidence: 12 sources] [5H Remaining: 68%]
[Schedule] [Next Best: Gemini Flash Direct] [Resource Economics: Optimal]
```

#### **Integration Points**
1. **Status Bar**: Primary Dad Mode entry point
2. **Game Selector**: Context-aware routing surfaces
3. **Settings Card**: Global routing configuration
4. **Live Player Console**: Dev Mode routing diagnostics

---

## UNKNOWN

### **Missing Evidence Required**

1. **Current Card Architecture**: No TypeScript interfaces for card components found
2. **Card Rendering Logic**: Card components appear to be pure HTML/CSS with no component framework
3. **Dynamic Card Content**: Unknown how card data flows from daemon to UI
4. **Card Interactions**: Unknown card-to-card relationships and dependencies
5. **Mobile-Specific Cards**: No evidence of unique mobile-only cards
6. **Animation/Transition Code**: Card collapse/expand animations only in CSS, no JS logic identified
7. **Card Positioning Logic**: Unknown how cards are arranged on different screen sizes

### **Unspecified Implementation Details**

1. **Card Data Binding**: Unknown mechanism for binding card data to UI
2. **Card State Management**: Unknown how card states are persisted and synchronized
3. **Card Error Handling**: Unknown card error display and recovery mechanisms
4. **Card Accessibility**: Unknown accessibility implementation details
5. **Card Performance**: Unknown optimization for card rendering

---

## CONTRADICTION

### **Conflicting Evidence**

1. **COMPACT vs EXPANDED MODE**: The `src/public/index.html` shows both compact and expanded card layouts, but the specific toggle mechanism is unclear.
2. **DAD/DEV MODE SEPARATION**: While documentation mentions clear separation, some card types appear in both contexts (e.g., settings cards appear in both modes with different content visibility).
3. **SCout vs CONSERVE**: Some Scout components reference CONSERVE but there's no clear CONSERVE integration point in the visible codebase.

---

## IMPORTANT FILES / PATHS

### **Critical Files for Future Routing Intelligence**

1. **UI Entry Points**
   - `src/public/index.html` - Main game interface
   - `src/public/pair.html` - Mobile pairing interface

2. **Core Extension Logic**
   - `src/extension.ts:167` - Dad Mode status bar logic
   - `src/extension.ts:161-178` - Status bar refresh logic

3. **Control Plane Routing**
   - `src/control-plane/daemon.ts:2501-2542` - Scout Formation Dev Mode gating
   - `src/control-plane/daemon.ts:2544-2709` - Preferences management

4. **Preference System**
   - `src/running-players.ts:176-189` - Default preferences
   - `src/running-players.ts:278-308` - Preference loading/saving

5. **Scout Infrastructure**
   - `src/scout-formation.ts:128-129` - Default formation candidates
   - `src/scout-formation.ts:2406-2541` - Scout credential API endpoints
   - `src/scouter-bootstrap.ts:22-22` - Scout bootstrap service

6. **Alarm System**
   - `src/running-players.ts:44-54` - Default alarm preferences
   - `src/control-plane/alarm-engine.ts:16-16` - Alarm engine implementation

---

## ARCHITECT DECISIONS REQUIRED

### **Critical Decisions for Intelligent Routing Integration**

1. **Surface Location Decision**
   - **Option A**: Expand Status Bar → Detailed Dad Mode surface
   - **Option B**: Add dedicated routing card in Settings area
   - **Option C**: Embed routing in existing AI Usage Scoreboard
   - **Decision Required**: How to integrate without cluttering minimal Dad Mode

2. **Data Flow Architecture**
   - **Option A**: Bridge existing Scout APIs to UI
   - **Option B**: New dedicated routing intelligence service
   - **Option C**: Extend existing Daemon → Stadium communication
   - **Decision Required**: How to expose routing intelligence to UI

3. **Dad Mode vs Dev Mode Integration**
   - **Decision Required**: Should routing intelligence appear in both modes or only in Dev Mode?
   - **Consideration**: Minimal safe surface vs full diagnostic needs

4. **CONSERVE Integration Points**
   - **Decision Required**: Should CONSERVE sit adjacent to routing or be a separate surface?
   - **Consideration**: Resource management vs routing optimization trade-offs

5. **Compact vs Expanded Display**
   - **Decision Required**: What information hierarchy for compact surfaces?
   - **Consideration**: Speed vs completeness optimization

---

## CONCLUSION

The Sideline Coach codebase contains a mature foundation for Intelligent Routing integration with:

**✅ Proven Foundation**:
- Clear Dad Mode/Dev Mode architectural separation
- Existing Scout formation and routing infrastructure
- Comprehensive preference and alarm systems
- Mobile-responsive HTML/CSS UI architecture

**⚠️ Implementation Gaps**:
- Card component architecture not fully defined in TypeScript
- Data binding mechanisms not explicitly documented
- Dev Mode surface details require deeper exploration

**🔧 Recommended Next Steps**:
1. **Investigate Card Rendering**: Locate TypeScript components for card rendering
2. **Map Data Flows**: Understand how preferences/cards flow from daemon to UI
3. **Define Integration Points**: Establish exact locations for routing intelligence surfaces
4. **Architectural Decisions**: Resolve surface location and data flow approaches

**📋 Immediate Surface Opportunities**:
1. **Status Bar Expansion**: Ultra-compact routing recommendation
2. **Settings Card Integration**: Expanded routing intelligence
3. **AI Usage Scoreboard Enhancement**: Resource economics display
4. **Consolidate Scout APIs**: Unify routing and Scout intelligence presentation

**🎯 Key Architectural Principle**:
- **Dad Mode**: Ultra-compact, human-facing, safe information only
- **Dev Mode**: Full diagnostic, technical information with execution control
- **Integration**: Respect existing Dev Mode gating while expanding Dad Mode capabilities

The foundation is solid for Intelligent Routing integration. The primary architectural decisions required involve surface placement and data flow design rather than fundamental infrastructure changes.
