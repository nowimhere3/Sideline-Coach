Now I have a comprehensive understanding of the repository. Let me compile the reconnaissance report.

---

### CANONICAL ACTIVE SET

**BC-001  CANONICAL PLAY ROUTING ENVELOPE (S56.0)** — IMPLEMENTED
- **Source:** [S01] `src/control-plane/route-constraints.ts:586-715` (`recognizeRouteConstraints`), `src/control-plane/route-normalization.ts` (S56.2), `src/control-plane/router.ts:260-268` (`computeRoute`)
- **Status:** Active, field-proven. Explicit routing fields (AGENT/PLAYER, MODEL, REASONING) are resolved deterministically from a bounded opening envelope. Unresolved explicit values are preserved in `unresolved` and never silently replaced by inference.

**BC-002  SCOUT DIRECTIVE INTERCEPT (S56.1)** — IMPLEMENTED
- **Source:** [S01] `src/control-plane/route-constraints.ts:482-557` (`recognizeScoutDirective`), `src/routing-policy.ts:381-420` (`computeScoutDirectiveRoute`)
- **Status:** Active. An unmistakable opening "Scout this play" directive is control-plane routing. It becomes an explicit `scout` Player constraint before ordinary task classification. Unavailable Scout is a truthful stop, never a substitution.

**BC-003  CANONICAL ROUTING ALIAS NORMALIZATION (S56.2)** — IMPLEMENTED
- **Source:** [S01] `src/control-plane/route-normalization.ts` (entire file)
- **Status:** Active. Structured routing values pass through deterministic, roster/catalog-backed canonical normalization. "Claude Code" → claude, "Claude Sonnet 5" → sonnet. Ambiguity/choice/negation/near-miss stays unresolved.

**BC-004  HUMAN SHORTHAND + CONTROL-SHAPED TITLE INTERCEPT (S56.3)** — IMPLEMENTED
- **Source:** [S01] `src/control-plane/route-constraints.ts:340-480` (`parseRouteCall`, `recognizeOpeningRoute`)
- **Status:** Active. Two opening-line route calls intercepted before task classification: (1) Human shorthand — first non-blank line entirely `PLAYER [MODEL] [EFFORT]`; (2) Control-shaped title — ALL CAPS region + dash (e.g., `SCOUT FORMATION — OPUS SCOPE PACK`). Title's words cannot outvote the route.

**BC-005  SCOUT AUTO RECONNAISSANCE-FIRST ROUTING** — IMPLEMENTED
- **Source:** [S01] `src/routing-policy.ts:326-374` (`computeScoutAutoRoute`), `src/routing-policy.ts:497-498` (AUTO integration)
- **Status:** Active. AUTO conservatively chooses Scout when Play makes reconnaissance primary, identifies material evidence need, and Scout capability is truthfully ready.

**BC-006  SCOUT FORMATION ENGINE (V0.2)** — IMPLEMENTED
- **Source:** [S02] `src/scout-formation.ts` (entire file: `runScoutFormation`, `FormationCandidate`, substitution logic)
- **Status:** Active. Bounded 1–3 receiver Formation from one human objective. Receiver substitution on infrastructure/availability failure (BLOCKED). Working state under `Scout Intelligence/Work/`, durable evidence under `Formations/`. Combine-derived candidates refresh on every call.

**BC-007  SCOUT PLAYER AS FIRST-CLASS ROUTING TARGET** — IMPLEMENTED
- **Source:** [S02] `src/scout-formation.ts:197-228` (breadcrumb), `src/player-roster.ts:203-311` (virtual Scout membership), `src/control-plane/router.ts:431-460` (MANUAL Scout dispatch)
- **Status:** Active. Scout is a logical Player backed by a Formation. MANUAL selection and conservative AUTO converge on same Scout Player adapter. Virtual membership persisted per-Game.

**BC-008  AI HEALTH AUTHORITY (Provider-Neutral Health Substrate)** — IMPLEMENTED
- **Source:** [S03] `src/control-plane/health-authority.ts` (entire file: `HealthAuthority`, `CanonicalClaudeWindow`, `CodexProviderHealthState`)
- **Status:** Active. Single canonical health truth for Claude (OAuth reader + Stadium push) and Codex (`account/rateLimits/read`). Persisted to `~/.sideline/ai-health-state.json`. `verifiedAt` tracks freshness separate from `observedAt`. Exposes `/api/ai-health` (remote-read) and `/api/ai-health/refresh` (remote-mutate).

**BC-009  AI USAGE SCOREBOARD (Persistent Surface)** — IMPLEMENTED
- **Source:** [S04] `src/public/index.html:1257-1300` (CSS), `src/public/index.html:5945-6200` (render logic), `src/running-players.ts:86-110` (preferences)
- **Status:** Active. Persistent bottom/top card with compact/expanded states. Configurable: placement, default expanded, percent mode (left/used/both), reset mode (absolute/countdown/both), density, reset marker, mobile Live Terminal coexistence. Reads from HealthAuthority snapshot.

**BC-010  COMMERCIAL CAPABILITY CATALOGUE + GATING (S57.2)** — IMPLEMENTED (Core)
- **Source:** [S05] `src/commercial/capabilities.ts`, `src/commercial/gate.ts`, `src/commercial/grants.ts`, `src/commercial/authority.ts`
- **Status:** Active for verified gates: `games.active` (ceiling), `remote.access` (minutes), `scout.play` (count), `scout.maintenance` (count), `routines` (flag). Reserved capabilities defined but gated as `allowed: true, reason: 'reserved'`: `scout.formation.wide`, `routing.intelligent*`, `routing.schedule`, `routing.autonomous`, `alerts.advanced`, `autofill`, `wires`.

**BC-011  REMOTE ACCESS V1 — PRODUCTION RELAY + PAIRING ARCHITECTURE** — IMPLEMENTED (Stages 1–5E)
- **Source:** [S06] `src/control-plane/remote-routes.ts`, `src/control-plane/remote-preview-gateway.ts`, `src/control-plane/relay-client.ts`, `src/control-plane/remote-bootstrap.ts`, `relay/` (Fly deployment)
- **Status:** Active. Production relay URL/domain built-in (`wss://relay.remote.mysidelinecoach.com/tunnel/v1`, `remote.mysidelinecoach.com`). Private-beta enrollment credential at `%USERPROFILE%\.sideline\remote\beta-enrollment.json` (never in VSIX). Principal-aware router: `local-admin` vs `remote-device`. Cookie auth + `X-Sideline-Action` + Origin check. Remote Preview on per-Game `p-<hostPublicId>-<gameTag>` origin with `__Host-sl_pv` grant cookie.

**BC-012  REMOTE ACCESS V1 — FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE (Stage 5F)** — BLOCKED
- **Source:** [S07] `Project SOP/Breadcrumbs/BREADCRUMB — REMOTE ACCESS V1 · FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE.md`, `Project SOP/Breadcrumbs/BREADCRUMB — REMOTE ACCESS V1 · DEV HOST PROVISIONING VS PRODUCT-COMPLETE PROVISIONING.md`
- **Status:** BLOCKED. Functional stack is GREEN (Stages 5A–5E, 5P). Private-beta provisioner (5P2) not built. Dev Host can be developer-provisioned for field testing but does NOT satisfy product-complete acceptance.

**BC-013  R13 PHONE REMOTE PREVIEW — PARKED (Google Safe Browsing)** — BLOCKED
- **Source:** [S08] `Project SOP/Breadcrumbs/R13 PHONE REMOTE PREVIEW — PARKED PENDING GOOGLE SAFE BROWSING.md`
- **Status:** BLOCKED. Implementation complete through S7 (S57.46–S57.54 all GREEN). S8 field proof showed working functionality but Chrome "Dangerous site" warning on `h-<hostPublicId>.remote.mysidelinecoach.com`. Google Search Console shows "Deceptive pages" security issue. Parked pending Google review.

**BC-014  SETTINGS INFORMATION ARCHITECTURE (Disclosure Cards + Drag Reorder)** — IMPLEMENTED
- **Source:** [S09] `Project SOP/Breadcrumbs/Settings-Information-Architecture.md`, `src/public/index.html:2492-2550` (AI Usage Scoreboard card), `src/public/index.html:255-300` (settings card CSS)
- **Status:** Active. Major Settings families use disclosure cards (collapsed by default, remembered in IndexedDB). Dad can drag-reorder cards; order persisted in IndexedDB. Dev Mode card reflects Dad/Dev state dynamically.

**BC-015  TERMINAL PLAYER MULTILINE LIVE-OUTPUT GAP** — DIAGNOSED, NOT FIXED
- **Source:** [S10] `Project SOP/Breadcrumbs/Terminal Player Multiline Live-Output Gap.md`, `src/player-roster.ts:729-747` (`runTerminalCommand`)
- **Status:** Active gap. Literal newline in Play → `singleLine = false` → `terminal.sendText()` → `observed = false` → "CHANNEL Command sent · live output available". Single-line and `Start-Job`/`Wait-Job`/`Receive-Job` work. Root cause known; fix requires controlled observable execution path for multiline (e.g., temp `.ps1` via Shell Integration).

**BC-016  STICKY PLAY PLAYER ASSIGNMENT** — BOOKMARK, NOT IMPLEMENTED
- **Source:** [S11] `Project SOP/Breadcrumbs/STICKY PLAY PLAYER ASSIGNMENT.md`
- **Status:** UNKNOWN/OPEN. Desired invariant: once a Play has a Player assignment, it persists until explicit action changes it. Refresh/navigation/unrelated roster changes must not silently reassign. If assigned Player removed, preserve assignment identity as unavailable.

**BC-017  SCOUT INTENT AUTO-ROUTING** — IDENTIFIED, NOT IMPLEMENTED
- **Source:** [S12] `Project SOP/Breadcrumbs/Scout Intent Auto-Routing.md`
- **Status:** OPEN. AUTO should recognize strong Scout intent signals (`SCOUT PLAY`, `READ-ONLY RECONNAISSANCE`, `DO NOT MODIFY FILES`) and auto-route to Scout Player. Role/mode language must parse before model constraints.

**BC-018  ROUTING INTELLIGENCE CLUSTER (CONSERVE + BEST UI)** — FROZEN BREADCRUMB
- **Source:** [S13] `Project SOP/Breadcrumbs/Routing Intelligence Cluster.md`
- **Status:** FROZEN. UI/product architecture breadcrumb only. Visual grouping "Routing Intelligence" containing sibling controls CONSERVE and BEST (square actuator, light-based on/off, info icons). Separates routing posture from AUTO/MANUAL authority.

**BC-019  PLAY COMPILER + INTELLIGENT ROUTING (North Star)** — PARTIALLY IMPLEMENTED / FIELD-PROVEN
- **Source:** [S14] `Project SOP/Breadcrumbs/BREADCRUMB -- SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING.md` (lines 499-1826)
- **Status:** ACTIVE ARCHITECTURAL DIRECTION. Implemented slices: S56.0 Envelope, S56.1 Scout Directive, S56.2 Alias Normalization, S56.3 Human Shorthand/Control Title. NOT built: Session Continuity, Context Governor, Play Intent Classification, AI Health routing, CONSERVE, Team/depth-chart routing, full Play Compiler delta compilation. Field-proven failure: same-session continuation over-briefing burned premium capacity.

**BC-020  DYNAMIC TEAM & RESOURCE SCORECARD** — RELEASE BREADCRUMB
- **Source:** [S15] `Project SOP/Breadcrumbs/Dynamic Team & Resource Scorecard — Release Breadcrumb.MD`
- **Status:** OPEN. Scorecard must render dynamically from actual supported resource pools (Claude only, Codex only, AntiGravity only, 3+ pools, zero measurable). UI never assumes specific providers. Dependencies: A1–A3, R4, R7, T1.

**BC-021  CODEX COMPATIBILITY INDEPENDENT SCHEMA GUARDRAIL** — IMPLEMENTED (S54.11) + FUTURE HARDENING
- **Source:** [S16] `Project SOP/Breadcrumbs/Codex Compatibility Independent Schema Guardrail.md`
- **Status:** Active (repaired). Adaptive compatibility verification works: version is evidence, `codex app-server generate-json-schema` checked against `REQUIRED_CONTRACT`. S54.11 fixed `AccountRateLimitsUpdatedNotification` typo. Gap: fake Codex schema generated from `REQUIRED_CONTRACT` — circular test evidence. Needs independent real-schema fixture test.

**BC-022  VIEWER-AWARE PREVIEW PRESENTATION (R13/R14)** — DECIDED ARCHITECTURE
- **Source:** [S17] `Project SOP/Breadcrumbs/Viewer-Aware Preview Presentation -9-29-26.md`
- **Status:** DECIDED. Preview target = viewer device class (Phone ≤619px, Tablet 620–1023px, Desktop ≥1024px). Dad chooses target before launch. One running Game → one PreviewEndpoint → viewer-aware presentation. Remote Preview decided shape (S57.45): per-Game `p-` origin, relay `surface:'preview'`, `RemotePreviewGateway`, ephemeral `RemotePreviewGrant`, `__Host-sl_pv` cookie.

**BC-023  SCOUT CONTEXT GATE / FIELD PACKET** — BREADCRUMB ONLY
- **Source:** [S18] `Project SOP/Breadcrumbs/BREADCRUMB — SCOUT CONTEXT GATE - FIELD PACKET.md`
- **Status:** BREADCRUMB ONLY. Product invariant: KNOWN CONTEXT MUST NOT BE REPURCHASED. Scout Coverage states: GREEN (inject Field Packet), YELLOW (run missing lane), RED (recommend Scout first). Context budgets by Player class. Not implemented.

**BC-024  AUTO MODE NATURAL-LANGUAGE PLAYER/MODEL/REASONING RECOGNITION** — PARTIALLY IMPLEMENTED
- **Source:** [S19] `Project SOP/Breadcrumbs/BREADCRUMB — AUTO MODE NATURAL-LANGUAGE PLAYER.md`, `src/control-plane/route-constraints.ts` (S56.3 shorthand), `src/control-plane/route-normalization.ts`
- **Status:** PARTIAL. S56.3 implements structured shorthand (`Claude Sonnet Medium`) and control-title (`CLAUDE SONNET — ARCHITECTURE REVIEW`) on first line. Live reactivity and broader fuzzy recognition (typo tolerance, partial disclosure) remain breadcrumbed.

**BC-025  PRODUCT COMMERCIALIZATION ARCHITECTURE** — BREADCRUMB ONLY
- **Source:** [S20] `Project SOP/Breadcrumbs/PRODUCT COMMERCIALIZATION BREADCRUMBS.md`
- **Status:** BREADCRUMB ONLY. Capability/Allowance/Usage model defined. Candidate capabilities listed. Gate at choke points. Launch strategy: build full product first (Founder/Early Access unlocked), collect real usage, then package tiers from evidence. Telemetry events defined. Backend deferred.

**BC-026  AI HEALTH FACTUAL PARITY INVESTIGATION** — OPEN INVESTIGATION
- **Source:** [S21] `Project SOP/Breadcrumbs/AI-Health-Factual-Parity.md`
- **Status:** UNKNOWN. Field observation: Sideline AI Usage lagged external realtime reader (~10pp Claude capacity difference, Codex consumption not appearing promptly). Freshness/parity investigation only; no routing policy inferred.

**BC-027  SCOPED RESOURCE RECEIPTS & CONCURRENCY (R2)** — BREADCRUMB
- **Source:** [S22] `Project SOP/Breadcrumbs/R2 — SCOPED RESOURCE RECEIPTS  and CONCURRENCY BREADCRUMB.md`
- **Status:** BREADCRUMB. Principle: record receipts only for ResourcePool actually consumed. Concurrency metadata for overlap detection. Isolation grading. Not implemented.

**BC-028  SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL** — BREADCRUMB
- **Source:** [S23] `Project SOP/Breadcrumbs/BREADCRUMB — SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL.md`
- **Status:** BREADCRUMB. Desired UX: expanded Scout Player shows only lightweight Formation status (QUEUED/RUNNING lanes, receiver/model, substitutions, aggregate progress). Subscribe to structured Scout lifecycle events, NOT terminal text parsing.

**BC-029  ROSTER/WORKFLOW UI — B-TEAM & SCOUT FORMATION REPRESENTATION** — UI GAP
- **Source:** [S24] `Project SOP/Breadcrumbs/Roster-Workflow-UI-Formations.md`
- **Status:** OPEN. B-Team/worker formation and Scout formation lack explicit UI representation. Routing/eligibility concepts exist; presentation missing.

**BC-030  C10 BACKEND ACTIVATION / COMMERCIAL TRUST ARCHITECTURE** — REFERENCE ONLY
- **Source:** [S25] `Project SOP/Breadcrumbs/c10-complete later-LAUNCH.md` (points to `REPORTS/Claude/S57.6-C10-Backend-Activation-Commercial-Trust-Architecture.md`)
- **Status:** UNKNOWN. Single reference to report; not directly breadcrumbed here.

---

### BLOCKED / VERIFICATION SET

**BC-012  REMOTE ACCESS V1 — FRESH-INSTALL ZERO-SETUP PROVISIONING (Stage 5F / 5P2)** — BLOCKED
- **Evidence:** [S07] Two breadcrumbs explicitly define the blocker: trusted private-beta provisioner (5P2) not built. Dev Host provisioning ≠ product installation path. Product-complete requires BOTH real-world GREEN + fresh-install GREEN.
- **Verification needed:** Fresh/private-beta installation receives enrollment credential automatically without Dad touching it. Prove on clean machine.

**BC-013  R13 PHONE REMOTE PREVIEW — GOOGLE SAFE BROWSING HOLD** — BLOCKED
- **Evidence:** [S08] Chrome "Dangerous site" on `h-<hostPublicId>.remote.mysidelinecoach.com`. Search Console: Security Issues → Deceptive pages. Parked 2026-09-30. Resume rule: if Google clears, resume S8 field proof; if maintains, investigate bounded 2026-09-30 R13 delta vs S57.43B baseline.
- **Verification needed:** Google Safe Browsing authoritative result.

**BC-026  AI HEALTH FACTUAL PARITY** — NEEDS VERIFICATION
- **Evidence:** [S21] Single breadcrumb noting ~10pp Claude capacity difference vs external reader, Codex consumption not appearing promptly. No root cause identified.
- **Verification needed:** Compare Sideline HealthAuthority acquisition timing/delivery/observation freshness against provider-native facts.

---

### UNKNOWN SET

**BC-016  STICKY PLAY PLAYER ASSIGNMENT** — UNKNOWN
- **Evidence:** [S11] Bookmark only. No implementation. Persistence/source-of-truth needs investigation.

**BC-017  SCOUT INTENT AUTO-ROUTING** — UNKNOWN
- **Evidence:** [S12] Breadcrumbed as "Product/routing improvement identified", Priority Medium. Not in source.

**BC-023  SCOUT CONTEXT GATE / FIELD PACKET** — UNKNOWN
- **Evidence:** [S18] Explicitly "BREADCRUMB ONLY. Do not interrupt current Remote Access v1 implementation/review."

**BC-027  SCOPED RESOURCE RECEIPTS & CONCURRENCY (R2)** — UNKNOWN
- **Evidence:** [S22] Breadcrumb only. Principle defined, no implementation.

**BC-028  SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL** — UNKNOWN
- **Evidence:** [S23] Explicitly "BREADCRUMB ONLY. Do not interrupt Remote Access Stage 3/4 work."

**BC-029  ROSTER/WORKFLOW UI — B-TEAM & SCOUT FORMATION REPRESENTATION** — UNKNOWN
- **Evidence:** [S24] "Not implemented; not part of that task. Treat as UI representation gap only."

**BC-030  C10 BACKEND ACTIVATION** — UNKNOWN
- **Evidence:** [S25] Single reference to report. No breadcrumb content here.

---

### DONE / CLOSED SET

**S56.0  CANONICAL PLAY ROUTING ENVELOPE** — DONE
- Implemented in `route-constraints.ts`, `route-normalization.ts`, `router.ts`. Graduated.

**S56.1  SCOUT DIRECTIVE INTERCEPT** — DONE
- Implemented in `route-constraints.ts:recognizeScoutDirective`, `routing-policy.ts:computeScoutDirectiveRoute`. Graduated.

**S56.2  CANONICAL ROUTING ALIAS NORMALIZATION** — DONE
- Implemented in `route-normalization.ts`. Graduated.

**S56.3  HUMAN SHORTHAND + CONTROL-SHAPED TITLE INTERCEPT** — DONE
- Implemented in `route-constraints.ts:parseRouteCall`, `recognizeOpeningRoute`. Graduated.

**S57.1–S57.5  REMOTE ACCESS STAGES 1–5E** — DONE
- Stage 1: Local security foundation (browser token bootstrap, principal-aware router, cookie mutation security, SSE hardening, remote terminal policy).
- Stage 5P: Zero-setup product bootstrap (production relay URL/domain built-in, private-beta credential outside VSIX).
- Stages 5A–5E: Implementation progression to functional GREEN.

**S54.11  CODEX COMPATIBILITY REPAIR** — DONE
- Fixed `AccountRateLimitsUpdatedNotification` typo. Adaptive verification proven against real Codex 0.156.1.

**SCOUT FORMATION V0.2** — DONE
- `runScoutFormation`, substitution, Combine-derived candidates, workspace hygiene, provenance.

**AI HEALTH AUTHORITY** — DONE
- `HealthAuthority` class, dual evidence ingestion (Stadium push + OAuth reader), `verifiedAt` freshness, persistence, API endpoints.

**AI USAGE SCOREBOARD PLAY 1** — DONE
- Persistent card, compact/expanded, configurable presentation, mobile coexistence, HealthAuthority integration.

**COMMERCIAL GATING (Core Capabilities)** — DONE
- `games.active`, `remote.access`, `scout.play`, `scout.maintenance`, `routines` gated at dispatch choke points.

**SETTINGS IA (Disclosure Cards + Drag Reorder)** — DONE
- Implemented in index.html with IndexedDB persistence.

---

### SUPERSEDED SET

**HUMAN ROUTING SHORTHAND INTERCEPT** → Superseded by **BC-004 (S56.3)**
- **Evidence:** [S14] Explicitly listed under "SUPERSEDES / EXPANDS: HUMAN-ROUTING-SHORTHAND-INTERCEPT, CANONICAL-PLAY-INGESTION-AND-INTELLIGENT-ROUTING"

**CANONICAL PLAY INGESTION AND INTELLIGENT ROUTING** → Superseded/Expanded by **BC-019 (Play Compiler + Intelligent Routing)**
- **Evidence:** [S14] Same breadcrumb lists it as superseded.

**EARLY SCOUT ROUTING (MANUAL ONLY)** → Superseded by **BC-005 (Scout Auto Reconnaissance-First)**
- **Evidence:** [S01] `routing-policy.ts:306-324` breadcrumb: "WAS: Scout existed as first-class MANUAL routing target while unconstrained AUTO intentionally excluded it... IS: AUTO may conservatively choose Scout..."

**DEV BRIDGE REMOTE ACCESS (Tailscale/Cloudflare)** → Superseded by **BC-011 (Production Relay Architecture)**
- **Evidence:** [S06] `Remote-Access-Architecture.md`: "WHAT WAS: Mobile access was a dev bridge... WHAT IS: Stage 1 implemented locally... Relay: production Remote Access uses Sideline-owned outbound relay."

**GLOBAL ADMIN TOKEN IN URLs** → Superseded by **BC-011 (Principal-Aware Router + Cookie Auth)**
- **Evidence:** [S06] "WHAT WAS: One global admin token... travelled in URLs... WHAT IS: Browser admin-token bootstrap is `#token` → `POST /api/session` → httpOnly cookie..."

**SCOUT FORMATION AS BACKGROUND TELEMETRY** → Superseded by **BC-007 (Scout as First-Class Player)**
- **Evidence:** [S02] `scout-formation.ts:197-228`: "WAS: Scout Formation activity was envisioned as a persistent bottom-level Sideline status/timer... IS: Scout is one logical first-class routing target..."

**FIXED CODEX VERSION GATE** → Superseded by **BC-021 (Adaptive Compatibility Verification)**
- **Evidence:** [S16] "WAS: Controlled Codex originally used an exact provider-version gate... S54.9 replaced that brittle model with adaptive compatibility verification..."

---

### DUPLICATE / MERGE CLUSTERS

**Cluster A: Play Compiler / Intelligent Routing / Context Governance** 
- **Members:** 
  - BC-019 Play Compiler + Intelligent Routing (S56.0–S56.3 implemented slices + future)
  - BC-004 Human Shorthand + Control Title (S56.3) — implemented slice of Cluster A
  - BC-001 Canonical Envelope (S56.0) — implemented slice of Cluster A
  - BC-002 Scout Directive (S56.1) — implemented slice of Cluster A
  - BC-003 Alias Normalization (S56.2) — implemented slice of Cluster A
  - BC-023 Scout Context Gate / Field Packet — future layer of Cluster A
  - BC-024 Auto Mode Natural Language — overlaps with Cluster A's "live reactivity" + "typo tolerance"
  - BC-012 Routing Intelligence Cluster (CONSERVE + BEST) — UI layer of Cluster A
  - BC-015 Dynamic Team & Resource Scorecard — data layer for Cluster A
  - BC-027 Scoped Resource Receipts (R2) — evidence layer for Cluster A
- **Recommendation:** Compress into single master item **BC-001 PLAY COMPILER & INTELLIGENT ROUTING ECOSYSTEM** with sub-items for implemented slices (S56.0–S56.3) and future layers (Session Continuity, Context Governor, Play Intent, AI Health routing, CONSERVE, Team routing, Field Packet, full Delta Compiler).

**Cluster B: Remote Access V1 Productization**
- **Members:**
  - BC-011 Remote Access Architecture (Stages 1–5E implemented)
  - BC-012 Fresh-Install Zero-Setup Provisioning (5F/5P2 blocked)
  - BC-013 R13 Phone Remote Preview (parked)
  - BC-022 Viewer-Aware Preview Presentation (R13/R14 decided architecture)
- **Recommendation:** Compress into **BC-002 REMOTE ACCESS V1 — END-TO-END PRODUCTIZATION** with sub-items: Core Architecture (DONE), Fresh-Install Provisioning (BLOCKED 5P2), Phone Preview (BLOCKED Safe Browsing), Viewer-Aware Presentation (DECIDED).

**Cluster C: AI Health / Scoreboard / Routing Economics**
- **Members:**
  - BC-008 AI Health Authority (implemented)
  - BC-009 AI Usage Scoreboard (implemented Play 1)
  - BC-015 Dynamic Team & Resource Scorecard (release breadcrumb)
  - BC-026 AI Health Factual Parity (investigation)
  - BC-018 Routing Intelligence Cluster (CONSERVE + BEST UI)
  - BC-027 Scoped Resource Receipts (R2)
  - BC-019 Play Compiler (AI Health routing, CONSERVE)
- **Recommendation:** Compress into **BC-003 AI HEALTH & ROUTING ECONOMICS ECOSYSTEM** with sub-items: HealthAuthority (DONE), Scoreboard Play 1 (DONE), Dynamic Scorecard (OPEN), Factual Parity (UNKNOWN), CONSERVE/BEST UI (FROZEN), Resource Receipts (BREADCRUMB), Routing Economics (RESERVED).

**Cluster D: Scout Ecosystem**
- **Members:**
  - BC-005 Scout Auto Reconnaissance-First Routing (implemented)
  - BC-006 Scout Formation Engine V0.2 (implemented)
  - BC-007 Scout Player First-Class Target (implemented)
  - BC-017 Scout Intent Auto-Routing (open)
  - BC-023 Scout Context Gate / Field Packet (breadcrumb)
  - BC-028 Scout Player Live Formation Status (breadcrumb)
  - BC-029 Roster UI — Scout Formation Representation (gap)
  - BC-021 Codex Compatibility Guardrail (scout-relevant)
  - BC-025 Commercialization: Scout capabilities (scout.play, scout.formation.wide, scout.maintenance)
- **Recommendation:** Compress into **BC-004 SCOUT ECOSYSTEM** with sub-items: Formation Engine (DONE), Auto Routing (DONE), First-Class Player (DONE), Intent Auto-Routing (OPEN), Context Gate (BREADCRUMB), Live Formation Status (BREADCRUMB), Roster UI (GAP), Commercial Capabilities (DEFINED).

---

### CONTRADICTIONS

**CONTRADICTION 1: AI Health Freshness vs. Routing Dependence**
- **Sources:** [S03] `health-authority.ts` implements `verifiedAt` freshness tracking separate from `observedAt`. [S21] `AI-Health-Factual-Parity.md` reports ~10pp Claude capacity difference vs external reader, Codex consumption not appearing promptly.
- **Conflict:** HealthAuthority presents itself as canonical truth, but field observation shows material lag vs provider-native facts.
- **Apparent Authority:** HealthAuthority implementation is the current code truth. The parity breadcrumb is explicitly an "investigation only" — do not infer routing policy from it. **HealthAuthority wins as current implementation; parity investigation remains open.**

**CONTRADICTION 2: Scout Intent Auto-Routing vs. Implemented S56.3 Shorthand**
- **Sources:** [S12] `Scout Intent Auto-Routing.md` wants AUTO to recognize `SCOUT PLAY`, `READ-ONLY RECONNAISSANCE`, `DO NOT MODIFY FILES` anywhere near beginning and auto-route to Scout. [S01] `route-constraints.ts:482-557` only recognizes `scout` / `scout this` / `scout this play` / `scout needed` on FIRST non-blank line with specific grammar.
- **Conflict:** Breadcrumbed desired behavior is broader (anywhere near beginning, more signals) than implemented (first line only, strict grammar).
- **Apparent Authority:** Implementation (S56.1 directive intercept) is the current code truth. Breadcrumbed desire is explicitly "Product/routing improvement identified, Priority Medium." **Implementation wins; breadcrumb remains future work.**

**CONTRADICTION 3: Remote Access "Zero Setup" Claim vs. Private-Beta Credential Requirement**
- **Sources:** [S07] `BREADCRUMB — REMOTE ACCESS V1 · FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE.md` explicitly states: "The production relay URL and relay domain are safe public configuration and are now built into the product. The reusable private-beta enrollment credential is NOT built into the extension... This is correct." AND "Dad must receive the required private-beta enrollment credential through the intended installer/provisioning/distribution path without ever manually creating, copying, pasting, locating, editing, or understanding that credential."
- **Conflict:** "Zero setup" is defined as "zero setup FROM THE INSTALLATION EXPERIENCE" not "zero setup after developer preconfigures." The credential MUST exist backstage via provisioning.
- **Resolution:** Not a true contradiction — the breadcrumb explicitly defines the distinction. The "contradiction" is only if one reads "zero setup" colloquially. **Breadcrumb is authoritative on definition.**

**CONTRADICTION 4: Commercial Capabilities — Reserved vs. Implemented**
- **Sources:** [S05] `capabilities.ts` marks `routing.intelligent`, `routing.intelligent.*`, `scout.formation.wide`, `routing.schedule`, `routing.autonomous`, `alerts.advanced`, `autofill`, `wires` as `reserved: true`. Gate returns `allowed: true, reason: 'reserved'`. [S14] Play Compiler breadcrumb describes these as "Potential premium capability" and "Intelligent Routing may become premium."
- **Conflict:** Reserved capabilities are gated as ALLOWED (no block), but breadcrumb discusses them as premium candidates.
- **Resolution:** Gate behavior is intentional: reserved = "defined for packaging, no product code gates on it yet." **Gate implementation wins as current truth; breadcrumb describes future packaging intent.**

---

### DEPENDENCY / SEQUENCE MAP

```
FOUNDATION (Done)
├─ BC-001 Canonical Play Routing Envelope (S56.0)
├─ BC-003 Canonical Routing Alias Normalization (S56.2)
├─ BC-002 Scout Directive Intercept (S56.1)  [depends on S56.0]
├─ BC-004 Human Shorthand + Control Title (S56.3)  [depends on S56.0, S56.1, S56.2]
├─ BC-008 AI Health Authority  [independent]
├─ BC-006 Scout Formation Engine V0.2  [independent]
├─ BC-007 Scout Player First-Class Target  [depends on BC-006]
├─ BC-005 Scout Auto Reconnaissance-First Routing  [depends on BC-007, BC-008]
├─ BC-010 Commercial Gating (Core)  [independent]
├─ BC-011 Remote Access Core Architecture (Stages 1–5E)  [independent]
├─ BC-009 AI Usage Scoreboard Play 1  [depends on BC-008]
├─ BC-014 Settings IA  [independent]
├─ BC-021 Codex Compatibility Repair  [independent]

ACTIVE BLOCKERS
├─ BC-012 Remote Access Fresh-Install Provisioning (5P2)  [blocks BC-011 product-complete]
│   └─ Requires: trusted private-beta provisioner architecture decision + implementation
├─ BC-013 R13 Phone Preview (Google Safe Browsing)  [blocks BC-011 phone completeness]
│   └─ Requires: Google Safe Browsing clearance OR bounded rollback/remediation

NEAR-TERM MVP CLOSURE
├─ BC-015 Terminal Player Multiline Live-Output Fix
│   └─ Depends on: VS Code Shell Integration multiline support investigation
├─ BC-017 Scout Intent Auto-Routing
│   └─ Depends on: BC-004 (shorthand infrastructure exists), route-constraints.ts parsing enhancement
├─ BC-024 Auto Mode Natural Language Live Reactivity
│   └─ Depends on: BC-004 infrastructure, debounced live update on first line
├─ BC-026 AI Health Factual Parity Investigation
│   └─ Depends on: HealthAuthority acquisition timing audit vs provider-native
├─ BC-027 Scoped Resource Receipts (R2) — minimal viable for routing economics
├─ BC-029 Roster UI — B-Team/Scout Formation Representation

FUTURE LAYERS (Post-MVP)
├─ BC-019 Full Play Compiler (Session Continuity, Context Governor, Delta Compilation)
│   └─ Depends on: BC-023 Scout Context Gate, BC-004/BC-024 routing maturity, BC-008 HealthAuthority integration
├─ BC-023 Scout Context Gate / Field Packet
│   └─ Depends on: Scout Intelligence persistence, Formation provenance, routing integration
├─ BC-018 Routing Intelligence Cluster (CONSERVE + BEST UI wiring)
│   └─ Depends on: BC-008 HealthAuthority, BC-019 Play Intent Classification
├─ BC-015 Dynamic Team & Resource Scorecard (full dynamic rendering)
│   └─ Depends on: A1–A3, R4, R7, T1 (per breadcrumb)
├─ BC-025 Product Commercialization Backend
│   └─ Depends on: real public usage data
├─ BC-030 C10 Backend Activation
│   └─ Depends on: report review
```

---

### PROPOSED MASTER LEDGER STRUCTURE

```
MASTER BREADCRUMB LEDGER
========================

SOURCES INDEX
[S01] src/control-plane/route-constraints.ts, route-normalization.ts, router.ts
[S02] src/scout-formation.ts, scout-play-runner.ts, scout-combine*.ts, player-roster.ts
[S03] src/control-plane/health-authority.ts, claude-usage-reader.ts, codex-usage-reader.ts
[S04] src/public/index.html (AI Scoreboard + Settings), src/running-players.ts
[S05] src/commercial/capabilities.ts, gate.ts, grants.ts, authority.ts, meters.ts
[S06] src/control-plane/remote-*.ts, relay/
[S07] Project SOP/Breadcrumbs/BREADCRUMB — REMOTE ACCESS V1 · FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE.md
      Project SOP/Breadcrumbs/BREADCRUMB — REMOTE ACCESS V1 · DEV HOST PROVISIONING VS PRODUCT-COMPLETE PROVISIONING.md
[S08] Project SOP/Breadcrumbs/R13 PHONE REMOTE PREVIEW — PARKED PENDING GOOGLE SAFE BROWSING.md
[S09] Project SOP/Breadcrumbs/Settings-Information-Architecture.md, Settings UI Plumbing Pass.md
[S10] Project SOP/Breadcrumbs/Terminal Player Multiline Live-Output Gap.md
[S11] Project SOP/Breadcrumbs/STICKY PLAY PLAYER ASSIGNMENT.md
[S12] Project SOP/Breadcrumbs/Scout Intent Auto-Routing.md
[S13] Project SOP/Breadcrumbs/Routing Intelligence Cluster.md
[S14] Project SOP/Breadcrumbs/BREADCRUMB -- SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING.md
[S15] Project SOP/Breadcrumbs/Dynamic Team & Resource Scorecard — Release Breadcrumb.MD
[S16] Project SOP/Breadcrumbs/Codex Compatibility Independent Schema Guardrail.md
[S17] Project SOP/Breadcrumbs/Viewer-Aware Preview Presentation -9-29-26.md
[S18] Project SOP/Breadcrumbs/BREADCRUMB — SCOUT CONTEXT GATE - FIELD PACKET.md
[S19] Project SOP/Breadcrumbs/BREADCRUMB — AUTO MODE NATURAL-LANGUAGE PLAYER.md
[S20] Project SOP/Breadcrumbs/PRODUCT COMMERCIALIZATION BREADCRUMBS.md
[S21] Project SOP/Breadcrumbs/AI-Health-Factual-Parity.md
[S22] Project SOP/Breadcrumbs/R2 — SCOPED RESOURCE RECEIPTS and CONCURRENCY BREADCRUMB.md
[S23] Project SOP/Breadcrumbs/BREADCRUMB — SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL.md
[S24] Project SOP/Breadcrumbs/Roster-Workflow-UI-Formations.md
[S25] Project SOP/Breadcrumbs/c10-complete later-LAUNCH.md

ACTIVE / OPEN
├── BC-001  PLAY COMPILER & INTELLIGENT ROUTING ECOSYSTEM
│   ├── S56.0 Canonical Play Routing Envelope — DONE
│   ├── S56.1 Scout Directive Intercept — DONE
│   ├── S56.2 Canonical Routing Alias Normalization — DONE
│   ├── S56.3 Human Shorthand + Control-Shaped Title Intercept — DONE
│   ├── Session Continuity + Delta Compilation — OPEN (field-proven need)
│   ├── Context Governor / Field Packet — BREADCRUMB [S18]
│   ├── Play Intent Classification (Architect/Worker/Scout/Orchestration/Review) — BREADCRUMB [S14, S13]
│   ├── AI Health + CONSERVE + Reset-Aware Routing — RESERVED [S05, S14]
│   ├── Team / Depth-Chart Routing — BREADCRUMB [S14, S24]
│   └── Full Play Compiler Delta Compilation — BREADCRUMB [S14]
│
├── BC-002  REMOTE ACCESS V1 — END-TO-END PRODUCTIZATION
│   ├── Core Architecture (Stages 1–5E) — DONE [S06]
│   ├── Fresh-Install Zero-Setup Provisioning (5P2) — BLOCKED [S07]
│   ├── Phone Remote Preview (R13 S8) — BLOCKED (Google Safe Browsing) [S08]
│   └── Viewer-Aware Preview Presentation (R13/R14) — DECIDED [S17]
│
├── BC-003  AI HEALTH & ROUTING ECONOMICS ECOSYSTEM
│   ├── HealthAuthority (Provider-Neutral Substrate) — DONE [S03]
│   ├── AI Usage Scoreboard Play 1 (Persistent Surface) — DONE [S04]
│   ├── Dynamic Team & Resource Scorecard — OPEN [S15]
│   ├── AI Health Factual Parity Investigation — UNKNOWN [S21]
│   ├── Routing Intelligence Cluster (CONSERVE + BEST UI) — FROZEN [S13]
│   ├── Scoped Resource Receipts & Concurrency (R2) — BREADCRUMB [S22]
│   └── Routing Economics / Player Scorecards — RESERVED [S05, S14]
│
├── BC-004  SCOUT ECOSYSTEM
│   ├── Formation Engine V0.2 — DONE [S02]
│   ├── Scout Auto Reconnaissance-First Routing — DONE [S01]
│   ├── Scout Player as First-Class Routing Target — DONE [S02]
│   ├── Scout Intent Auto-Routing — OPEN [S12]
│   ├── Scout Context Gate / Field Packet — BREADCRUMB [S18]
│   ├── Scout Player Live Formation Status in Visual Terminal — BREADCRUMB [S23]
│   ├── Roster/Workflow UI — B-Team & Scout Formation Representation — GAP [S24]
│   └── Commercial Capabilities (scout.play, scout.formation.wide, scout.maintenance) — DEFINED [S05]
│
├── BC-005  TERMINAL PLAYER MULTILINE LIVE-OUTPUT FIX — OPEN [S10]
├── BC-006  STICKY PLAY PLAYER ASSIGNMENT — UNKNOWN [S11]
├── BC-007  AUTO MODE NATURAL-LANGUAGE RECOGNITION (Live Reactivity) — PARTIAL [S19]
├── BC-008  CODEX COMPATIBILITY INDEPENDENT SCHEMA GUARDRAIL — DONE + HARDENING NEEDED [S16]
├── BC-009  PRODUCT COMMERCIALIZATION ARCHITECTURE — BREADCRUMB ONLY [S20]

BLOCKED / NEEDS VERIFICATION
├── BLK-001  Remote Access Fresh-Install Provisioning (5P2) — BLOCKED [S07]
├── BLK-002  R13 Phone Remote Preview — BLOCKED (Google Safe Browsing) [S08]
├── BLK-003  AI Health Factual Parity — NEEDS VERIFICATION [S21]

UNKNOWN
├── UNK-001  Sticky Play Player Assignment [S11]
├── UNK-002  Scout Intent Auto-Routing [S12]
├── UNK-003  Scout Context Gate / Field Packet [S18]
├── UNK-004  Scout Player Live Formation Status [S23]
├── UNK-005  Roster UI B-Team/Scout Formation [S24]
├── UNK-006  C10 Backend Activation [S25]
├── UNK-007  Scoped Resource Receipts (R2) [S22]

DONE / CLOSED
├── DONE-001  S56.0 Canonical Play Routing Envelope
├── DONE-002  S56.1 Scout Directive Intercept
├── DONE-003  S56.2 Canonical Routing Alias Normalization
├── DONE-004  S56.3 Human Shorthand + Control-Shaped Title Intercept
├── DONE-005  Remote Access Stages 1–5E (Core Architecture)
├── DONE-006  Scout Formation Engine V0.2
├── DONE-007  Scout Player First-Class Target
├── DONE-008  Scout Auto Reconnaissance-First Routing
├── DONE-009  AI Health Authority
├── DONE-010  AI Usage Scoreboard Play 1
├── DONE-011  Commercial Gating (Core: games.active, remote.access, scout.play, scout.maintenance, routines)
├── DONE-012  Settings IA (Disclosure Cards + Drag Reorder)
├── DONE-013  Codex Compatibility Repair (S54.11)
├── DONE-014  Product Telemetry Schema + NO-OP Outbox (S57.2 C7)

SUPERSEDED
├── SUP-001  Human Routing Shorthand Intercept → BC-001 (S56.3)
├── SUP-002  Canonical Play Ingestion & Intelligent Routing → BC-001
├── SUP-003  Manual-Only Scout Routing → BC-004 (Scout Auto)
├── SUP-004  Dev Bridge Remote Access (Tailscale/Cloudflare) → BC-002
├── SUP-005  Global Admin Token in URLs → BC-002 (Cookie Auth + Principal Router)
├── SUP-006  Scout Formation as Background Telemetry → BC-004 (First-Class Player)
├── SUP-007  Fixed Codex Version Gate → BC-008 (Adaptive Compatibility)
```

---

### CONTEXT-ROUTING RULE

**DEFAULT WORKING CONTEXT (Agents read these routinely):**
```
ACTIVE / OPEN (BC-001 through BC-009, BLK-001 through BLK-003, UNK-001 through UNK-007)
```
~15–20 compact items with stable IDs, source refs, and status.

**COMPACT INDEX ONLY (Historical reference — do not load routinely):**
```
DONE / CLOSED (DONE-001 through DONE-014)
SUPERSEDED (SUP-001 through SUP-007)
```
One-line summaries with source pointers.

**DEEP STORAGE ONLY (Open only when current task needs deeper evidence):**
```
Linked historical breadcrumbs:
- BREADCRUMB -- SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING.md [S14] (~1800 lines)
- BREADCRUMB — REMOTE ACCESS V1 · FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE.md [S07] (~400 lines)
- BREADCRUMB — REMOTE ACCESS V1 · DEV HOST PROVISIONING VS PRODUCT-COMPLETE PROVISIONING.md [S07] (~270 lines)
- R13 PHONE REMOTE PREVIEW — PARKED PENDING GOOGLE SAFE BROWSING.md [S08] (~330 lines)
- PRODUCT COMMERCIALIZATION BREADCRUMBS.md [S20] (~800 lines)
- INTELLIGENT ROUTING V2 — COACH REFRESH SEMANTIC CLASSIFICATION.md [S13 related] (~200 lines)
- SCOUT CONTEXT GATE - FIELD PACKET.md [S18] (~160 lines)
- BREADCRUMB — SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL.md [S23] (~140 lines)
- Dynamic Team & Resource Scorecard — Release Breadcrumb.MD [S15] (~60 lines)
- Codex Compatibility Independent Schema Guardrail.md [S16] (~120 lines)
- Viewer-Aware Preview Presentation -9-29-26.md [S17] (~90 lines)
```
**Token-heavy material (>100 lines each) that should NOT remain in default working context:** All items above in DEEP STORAGE ONLY.

---

### PROPOSED MVP CLOSURE ORDER

**Phase 1: Unblock Product-Complete (Hard Gates)**
1. **BLK-001** Remote Access Fresh-Install Provisioning (5P2) — Build trusted private-beta provisioner. Without this, Remote Access V1 cannot be PRODUCT-COMPLETE.
2. **BLK-002** R13 Phone Preview — Wait for Google Safe Browsing result. If cleared: resume S8 field proof. If rejected: bounded rollback from 2026-09-30 delta vs S57.43B baseline.

**Phase 2: Close Known Gaps (Evidence-Supported)**
3. **BC-005** Terminal Player Multiline Live-Output Fix — Root cause known (`singleLine` guard). Smallest play: temp `.ps1` via Shell Integration observable path.
4. **BC-017** Scout Intent Auto-Routing — Extend `route-constraints.ts` parsing to recognize `READ-ONLY RECONNAISSANCE`, `DO NOT MODIFY FILES` as strong Scout signals before model detection.
5. **BC-007** Auto Mode Natural Language Live Reactivity — Add debounced live update on first-line shorthand/control-title recognition (S56.3 infrastructure exists).
6. **BC-026** AI Health Factual Parity — Audit HealthAuthority acquisition timing vs provider-native; document freshness SLA or add manual refresh affordance.

**Phase 3: Polish & Depth (Low Risk, High Value)**
7. **BC-029** Roster UI — B-Team/Scout Formation Representation — Visualize existing routing concepts.
8. **BC-027** Scoped Resource Receipts (R2) Minimal — Record pool actually consumed + concurrency metadata for future routing economics.
9. **BC-008** Codex Compatibility Independent Schema Guardrail Hardening — Add real-schema fixture test to CI.

**Phase 4: Architectural Graduation (Requires Architect)**
10. **BC-001** Session Continuity + Delta Compilation — First slice of full Play Compiler. Field-proven regression case exists.
11. **BC-001** Context Governor / Field Packet — Depends on Scout Intelligence persistence + provenance.
12. **BC-003** CONSERVE/BEST UI Wiring — Depends on HealthAuthority integration + routing policy.
13. **BC-003** Dynamic Team & Resource Scorecard Full Rendering — Depends on A1–A3, R4, R7, T1.

---

### SOURCES REQUIRING DEEP STORAGE ONLY

| Source ID | File | Lines | Reason |
|-----------|------|-------|--------|
| [S14] | `Project SOP/Breadcrumbs/BREADCRUMB -- SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING.md` | ~1826 | Full Play Compiler architecture + field-proven failures + staged roadmap |
| [S07a] | `Project SOP/Breadcrumbs/BREADCRUMB — REMOTE ACCESS V1 · FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE.md` | ~412 | Stage 5F locked acceptance criteria + security invariant |
| [S07b] | `Project SOP/Breadcrumbs/BREADCRUMB — REMOTE ACCESS V1 · DEV HOST PROVISIONING VS PRODUCT-COMPLETE PROVISIONING.md` | ~272 | Critical distinction: testing shortcut ≠ product installation |
| [S08] | `Project SOP/Breadcrumbs/R13 PHONE REMOTE PREVIEW — PARKED PENDING GOOGLE SAFE BROWSING.md` | ~334 | Full R13 evidence trail + resume/rollback rules |
| [S20] | `Project SOP/Breadcrumbs/PRODUCT COMMERCIALIZATION BREADCRUMBS.md` | ~817 | Capability/Allowance/Usage model + launch strategy + telemetry events |
| [S18] | `Project SOP/Breadcrumbs/BREADCRUMB — SCOUT CONTEXT GATE - FIELD PACKET.md` | ~164 | Context Gate + Field Packet + Premium Repurchase Rule |
| [S23] | `Project SOP/Breadcrumbs/BREADCRUMB — SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL.md` | ~141 | Formation status UX + architectural rule (no terminal parsing) |
| [S16] | `Project SOP/Breadcrumbs/Codex Compatibility Independent Schema Guardrail.md` | ~120 | Adaptive verification architecture + circular test gap + fixture design |
| [S17] | `Project SOP/Breadcrumbs/Viewer-Aware Preview Presentation -9-29-26.md` | ~88 | Viewer target rule + Preview Work workflow + R13 decided shape |
| [S15] | `Project SOP/Breadcrumbs/Dynamic Team & Resource Scorecard — Release Breadcrumb.MD` | ~57 | Dynamic rendering rule + architecture invariant + release verification matrix |

---

### STABLE COMPACT IDs ASSIGNED

| ID | Canonical Name |
|----|----------------|
| BC-001 | PLAY COMPILER & INTELLIGENT ROUTING ECOSYSTEM |
| BC-002 | REMOTE ACCESS V1 — END-TO-END PRODUCTIZATION |
| BC-003 | AI HEALTH & ROUTING ECONOMICS ECOSYSTEM |
| BC-004 | SCOUT ECOSYSTEM |
| BC-005 | TERMINAL PLAYER MULTILINE LIVE-OUTPUT FIX |
| BC-006 | STICKY PLAY PLAYER ASSIGNMENT |
| BC-007 | AUTO MODE NATURAL-LANGUAGE RECOGNITION |
| BC-008 | CODEX COMPATIBILITY INDEPENDENT SCHEMA GUARDRAIL |
| BC-009 | PRODUCT COMMERCIALIZATION ARCHITECTURE |
| BLK-001 | REMOTE ACCESS FRESH-INSTALL PROVISIONING (5P2) |
| BLK-002 | R13 PHONE REMOTE PREVIEW (GOOGLE SAFE BROWSING) |
| BLK-003 | AI HEALTH FACTUAL PARITY |
| UNK-001 | STICKY PLAY PLAYER ASSIGNMENT |
| UNK-002 | SCOUT INTENT AUTO-ROUTING |
| UNK-003 | SCOUT CONTEXT GATE / FIELD PACKET |
| UNK-004 | SCOUT PLAYER LIVE FORMATION STATUS |
| UNK-005 | ROSTER UI B-TEAM/SCOUT FORMATION |
| UNK-006 | C10 BACKEND ACTIVATION |
| UNK-007 | SCOPED RESOURCE RECEIPTS (R2) |
| DONE-001..014 | (14 implemented slices) |
| SUP-001..007 | (7 superseded items) |

---

**VERDICT: READY FOR ANTIGRAVITY RECONCILIATION**

---

### SCOUT METADATA

**Scout Agent:** sideline-scout-deep  
**Scout Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Scout Role:** Read-Only Reconnaissance Scout  
**Scout Scope:** Full breadcrumb collection (30 files) + key source files (router, routing-policy, route-constraints, route-normalization, scout-formation, health-authority, commercial capabilities/gate, telemetry, player-roster, running-players, daemon, index.html)  
**Reconnaissance Depth:** Deep  
**Scout Date/Timestamp:** 2026-10-01 (local project time)

**Statement:** This report is reconnaissance, not final architectural authority.

**Limitations:**
- Frontend implementation details primarily from `src/public/index.html` (single-file SPA); TypeScript frontend sources not separately visible.
- Some breadcrumbs reference reports not directly read (e.g., S57.6 C10, S56.0–S56.3 reports, Stage 5P report).
- Scout Combine/Scorecards implementation read but not exhaustively traced.
- Commercial backend/entitlement authority implementation read but not exercised.
- Google Safe Browsing status is external dependency; current state from breadcrumb only.
