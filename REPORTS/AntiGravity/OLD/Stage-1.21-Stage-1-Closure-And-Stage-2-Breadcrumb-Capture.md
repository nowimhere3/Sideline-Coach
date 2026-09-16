REPORT FILE:
Stage-1.21-Stage-1-Closure-And-Stage-2-Breadcrumb-Capture.md

REPORT TIMESTAMP:
2026-09-11 10:45 MDT



# SIDELINE COACH — STAGE 1.21: FORMAL STAGE 1 CLOSURE & STAGE 2 BREADCRUMB CAPTURE

**Agent / model:** AntiGravity / Gemini 3.8 Flash (High)  
**Role:** Bounded Documentation / Release-State Worker  
**Project:** Sideline Coach  
**Dev Stadium Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`  
**Pre-Milestone Pushed Commit:** `317c3bf` (*Field-prove controlled player persistence and safe resume*)  
**Verdict:** `PASS — STAGE 1 FORMALLY CLOSED / STAGE 2 BREADCRUMBS CAPTURED`  

---

## 1. VERDICT & EXECUTIVE SUMMARY

### VERDICT: PASS — STAGE 1 FORMALLY CLOSED / STAGE 2 BREADCRUMBS CAPTURED

Stage 1 is complete and field-proven. 

Authoritative human field evidence has established that:
1. **Stage 1.19 Controlled Player Persistence / Safe Resume is FIELD-PROVEN:** Two controlled Codex instances on field survived extension/window reload without browser refresh, retained exact seats and targeting, preserved provider context (`MARIGOLD-17`), executed safe Leave Field on explicit close, and did not resurrect closed siblings.
2. **Stage 1.8 Legacy Reload / Re-Adoption Safety is FIELD-PROVEN:** Surviving same-process legacy Codex 2 terminal was safely re-adopted via provenance after window reload with exact seat and target retained; dispatch landed in the surviving terminal; full VS Code restart failed safe to Ready on Bench / No Player on field without authorizing stale terminals by name.
3. **Stage 1 / Stage 2 Boundary:** The Stage 1 milestone requirement ("first complete real multi-agent Play loop / touchdown") is formally interpreted as **multi-instance controlled Player proof** on field. Certified **multi-provider** orchestration belongs strictly to Stage 2.
4. **Stage 2 Breadcrumbs Captured:** Six key UX and routing observations from field testing are captured as durable Stage 2 backlog items without modifying any runtime behavior or code.
5. **Zero Runtime / Source Changes:** No files in `src/`, `test/`, `tools/`, or configuration were modified.

---

## 2. AUTHORITATIVE HUMAN FIELD EVIDENCE RECORDED

### A. Stage 1.19 — Controlled Player Persistence / Resume

Human field test executed in `[Extension Development Host] GS3` using two controlled Codex Players.

**Observed Sequence:**
1. `Codex · Controlled` and `Codex 2 · Controlled` were both on field.
2. Target Player was explicitly `Codex 2 · Controlled`.
3. Human sent:
   ```text
   Remember this code word: MARIGOLD-17. Reply only with "Stored."
   ```
4. Codex 2 responded:
   ```text
   Stored.
   ```
5. Human ran `Developer: Reload Window` inside `[Extension Development Host] GS3`.
6. Without browser refresh:
   - both controlled Players returned;
   - exact seats were preserved;
   - browser still targeted Codex 2;
   - Coach reconnected automatically.
7. Human then sent to Codex 2:
   ```text
   What did I ask you before the reload?
   ```
8. Codex 2 correctly recalled:
   ```text
   MARIGOLD-17
   ```
   and the original instruction.
9. Human manually closed controlled seat 1 (`Codex · Controlled`).
10. Human reloaded the GS3 Extension Development Host again.
11. Seat 1 stayed gone.
12. Codex 2 returned.

#### Field Verdict: Stage 1.19 is FIELD-PROVEN
- Exact controlled Sideline identity survives reload;
- Seat survives reload;
- Browser target survives reload;
- Same provider conversation survives reload;
- Provider context survives reload;
- Reload is not Leave Field;
- Explicit human close is Leave Field;
- Closed sibling does not resurrect.

---

### B. Stage 1.8 — Legacy Reload / Re-Adoption Safety

Human field test executed in `[Extension Development Host] GS3` with plain legacy Codex terminals (controlled Players removed first).

**Observed Sequence:**
1. Human used plain legacy `Put on Field` for Codex.
2. Human used `Add another`, creating:
   ```text
   Codex
   Codex 2
   ```
3. Human closed legacy `Codex`, leaving only `Codex 2`.
4. Coach correctly still reported Codex On Field.
5. Human selected `Target Player = Codex 2`.
6. Human clicked another VS Code terminal tab such as PowerShell.
7. Coach continued targeting Codex 2.
8. Human ran `Developer: Reload Window` inside `[Extension Development Host] GS3`.
9. Without browser refresh:
   - legacy Codex 2 survived;
   - Coach re-adopted it;
   - same seat remained;
   - Target Player remained Codex 2.
10. Human dispatched:
    ```text
    Reply only: LEGACY PASS
    ```
11. The text landed in the exact surviving legacy Codex 2 TUI.
    *(It did NOT automatically submit / press Enter. That is expected legacy behavior and is NOT a failure; legacy `Terminal.sendText()` remains an uncertified compatibility route).*
12. Human then fully exited all VS Code windows.
13. Human reopened VS Code, opened SidelineCoach, and used `Run → Start Debugging` to launch a fresh `[Extension Development Host] GS3`.
14. Coach showed:
    ```text
    Codex = Ready on Bench
    Target Player = No Player on field
    ```
    The old legacy terminal had zero Player authority.

#### Field Verdict: Stage 1.8 Legacy Reload/Re-Adoption Safety is FIELD-PROVEN
- Surviving same-process legacy Codex 2 can be safely re-adopted after extension/window reload using provenance;
- Selection remains exact;
- Routing lands in the correct legacy terminal;
- Full VS Code restart does NOT authorize a stale/revived terminal merely from its name;
- Terminal names never constitute dispatch authority;
- Legacy path fails safe.

---

## 3. FORMAL STAGE 1 CLOSURE STATEMENT

# STAGE 1 — COMPLETE / FIELD-PROVEN

Stage 1 now has durable automated and human field evidence for:
1. **Coach runtime established**;
2. **Player discovery** (dynamic Stadium capability detection);
3. **Put on Field** (launch through normal shell preserving user configuration);
4. **Multiple same-type Player instances** (concurrent siblings on field);
5. **Exact Player targeting** (instance-level routing);
6. **Safe instance identity** (provenance-backed correlation; names never authorize);
7. **Report discovery / Incoming** (filesystem scan surfaces reports to Coach);
8. **Live browser convergence without manual refresh** (SSE reconnection + canonical state refresh);
9. **Controlled Codex semantic SEND** (`turn/start` RPC dispatch);
10. **One SEND → one provider turn** (atomic multiline payload);
11. **No Enter / paste / terminal-interaction requirement on certified controlled route**;
12. **Same-thread controlled continuity** (turns accumulate on verified thread);
13. **Controlled reload persistence and context resume** (synchronous session reconstruction + async provider re-verification);
14. **Controlled Leave Field behavior** (explicit close de-authorizes session; siblings do not resurrect);
15. **Legacy reload re-adoption safety** (provenance matches surviving shell PID + start time);
16. **Legacy stale-terminal fail-safe behavior** (full restart strips dispatch authority);
17. **Full Coach → Player → work → report → Incoming → next Play loop**.

---

## 4. MULTI-INSTANCE VS. MULTI-PROVIDER STAGE BOUNDARY

The Stage 1 roadmap item historically termed "first complete real multi-agent Play loop / touchdown" has been authoritatively interpreted by the product owner as **multi-instance controlled Player proof** on field. That milestone has been completely satisfied.

Certified **multi-provider** orchestration remains Stage 2 work. Claude, AntiGravity (AGY), and ACP adapters are deliberately not pulled backward into Stage 1.

---

## 5. STAGE 2 UX / PRODUCT BREADCRUMBS CAPTURED

The following observations discovered during the Stage 1 field test are recorded as Stage 2 backlog items:

### 1. Outgoing Dispatcher Status Runner
- **WAS:** `Dispatch Play` behaves mainly as a static submit button without persistent feedback on the same surface.
- **WILL BE:** The primary Dispatch button itself becomes the visible Play lifecycle runner:
  ```text
  Dispatch Play → Sending… → Received → Working… → Completed
  ```
  Alongside canonical failure states: `Failed`, `Interrupted`, `Unknown`.
- **Core Principle:** *The human should never wonder whether Coach actually sent the Play.* Status derives from canonical Coach runtime truth, NOT a browser-only animation.

### 2. Prompt Composer Auto-Clear
- **WAS:** After successful send, the sent Play remains in the Prompt Payload box, leading to accidental duplicate dispatches.
- **WILL BE:** Once canonical provider acceptance (`Received`) is established, **clear the composer**, because the composer represents the **NEXT Play**, not Play history.
- **Safety Rules:** Never clear merely on click; pre-ingress failures preserve the text; `Unknown` delivery must not silently destroy recoverable human text; duplicate SEND is guarded while current SEND state is unresolved.

### 3. Routing Modes: AUTO and MANUAL
- **AUTO (Default):** Coach stages Player, Model, and Effort/reasoning level using available context (current Play, previous report, task type, human policy/priorities, active Players, live provider capabilities, capacity/cost signals). Human inspects decision without forced configuration.
  - *Principle:* **AUTO hides configuration, not intelligence.** Coach communicates what it chose (e.g. `Codex 2 · GPT-5.6 Sol · High`).
- **MANUAL:** Human chooses a Player → Coach exposes only models actually available to that Player → Selecting a model exposes only valid effort levels.
  - *Strict dependency:* `Player → available models → valid effort levels` (not three independent stale dropdowns; invalid combinations impossible to select).

### 4. Live Capability Discovery
- Model choices derive dynamically from the selected Player's actual capabilities via provider adapters translating live discovery into a common Sideline capability shape. Avoids permanently hardcoded model catalogs that drift from provider truth.

### 5. Persistent Bottom Scoreboard / Toolbar
- Future Sideline UI should feature a compact persistent awareness surface:
  ```text
  Game | Current Play | Player | Model | Effort | Execution Status
  ```
  (and eventually capacity, connection, and Stadium info).
- *Principle:* **Dispatcher = decision surface. Bottom bar = awareness surface.** Both render the SAME canonical runtime truth without independent state owners.

### 6. Duplicate Controlled Presentation Label Cleanup
- Controlled presentation displayed duplicate suffix wording (e.g. `CODEX 2 · CONTROLLED · CONTROLLED`). Minor Stage 2 UI cleanup.

### 7. Product Principles Preserved
- Human simplicity is the primary design constraint.
- Machine carries the mechanical burden.
- Hide plumbing by default. Reveal plumbing only when it changes a human decision.
- Unknown is valid.
- Observation and policy remain separate.
- Avoidable friction is a defect.
- Everything goes through Coach.

---

## 6. SCOPE FENCE & RUNTIME IMMUNITY

**EXPLICIT STATEMENT:**
**ZERO runtime or source code was modified.**

- `src/**` — **UNTOUCHED**
- `test/**` — **UNTOUCHED**
- `tools/**` — **UNTOUCHED**
- `package.json` & `package-lock.json` — **UNTOUCHED**
- `.vscode/**` — **UNTOUCHED**
- `Diagnostics/**` — **UNTOUCHED**

No dependencies were installed, no runtime builds were performed, no live provider turns were run, and no API quota was consumed.

---

## 7. DOCUMENTATION DIFF & VERIFICATION

### Files Changed:
1. `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`
2. `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
3. `REPORTS/AntiGravity/Stage-1.21-Stage-1-Closure-And-Stage-2-Breadcrumb-Capture.md`

### Verification Results:
- `git diff --check` executed: PASSED (zero errors).
- Clean separation maintained between proven runtime truth and future Stage 2 breadcrumbs.

---

## 8. WAS / IS / WILL BE SUMMARY

| Dimension | WAS | IS | WILL BE (Stage 2) |
| :--- | :--- | :--- | :--- |
| **Stage 1 Status** | In progress; awaiting human reload & re-adoption field proof; ambiguous "multi-agent" wording. | **STAGE 1 COMPLETE & FIELD-PROVEN.** Controlled multi-instance execution proven on field. | Stage 2 active drive: certified multi-provider orchestration (Claude, AGY, ACP). |
| **Controlled Persistence (1.19)** | Session schema & resume implemented; automated proof P1–P28 passed; human proof pending. | **FIELD-PROVEN.** Identity, seat, browser target, provider conversation, and context recall survive reload. Explicit close leaves field. | Extended to all certified provider adapters. |
| **Legacy Re-Adoption (1.8)** | Provenance re-adoption implemented; human smoke test pending. | **FIELD-PROVEN.** Surviving same-process legacy Player safely re-adopted; target stable; full restart fails safe. | Retained as uncertified compatibility route. |
| **Dispatcher UX** | Static submit button; human uncertain if Play sent; composer retains sent text. | Known field friction point; breadcrumb captured. | Lifecycle runner (`Sending…` → `Received` → `Working…` → `Completed`); composer auto-clears on `Received`. |
| **Routing** | Stale prototype dropdowns with mismatched models. | Known field friction point; breadcrumb captured. | AUTO default stages Player/Model/Effort from context; MANUAL enforces strict dependency chain. |
| **Provider Capabilities** | Hardcoded prototype model catalog. | Known drift risk; breadcrumb captured. | Live provider capability discovery via adapters. |
| **Awareness Surface** | Dispersed status across DOM. | Identified architectural pattern; breadcrumb captured. | Persistent bottom scoreboard toolbar (`Dispatcher = decision, Bottom bar = awareness`). |

---

## 9. RECOMMENDED NEXT STAGE 2 PLAY

**Play 2.1:** Stage 2 Kickoff & Dispatcher Reliability UX
- Implement Outgoing Dispatcher Status Runner and Prompt Composer Auto-Clear to eliminate immediate field friction.
- Begin design of live capability discovery and adapter expansion for Claude / AntiGravity (AGY).

---

## 10. COMMIT & PUSH MILESTONE

- **Commit Message:** `Close Stage 1 and capture Stage 2 product breadcrumbs`
- **Branch:** `main`
- **Staged Files:**
  - `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`
  - `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
  - `REPORTS/AntiGravity/Stage-1.21-Stage-1-Closure-And-Stage-2-Breadcrumb-Capture.md`
