# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:05:42

Play: ai-health-play6-smart-acquisition-20260921-203754
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-22T02:37:59.668Z
Finished: 2026-09-22T02:43:41.993Z
TOTAL ELAPSED TIME: 00:05:42

Scouts requested: 2
Completed: 2
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 2
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| health-acquisition-lifecycle | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T02:37:59.712Z | 2026-09-22T02:42:08.565Z | 00:04:08 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\SCOUT-health-acquisition-lifecycle-Reconnaissance.md |
| health-freshness-dedup-watchers | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T02:37:59.891Z | 2026-09-22T02:43:41.986Z | 00:05:42 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\SCOUT-health-freshness-dedup-watchers-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane health-acquisition-lifecycle: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane health-freshness-dedup-watchers: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: health-acquisition-lifecycle (objective f909691aa273)
- Objective: AI Health Play 6 reconnaissance only. Architecture already has ONE global HealthAuthority, Claude native health capture, Codex native account/rateLimits read + updated capture, persistence, HTTP, and SSE. Map the existing provider acquisition, lifecycle, startup/shutdown, singleton/service ownership, and event-wiring seams that Play 6 should reuse for a Smart Health Acquisition Manager. Determine where one provider/surface watcher should live globally rather than per Game. Identify exact files, symbols, lifecycle hooks, existing timers/listeners/watchers, and tests. Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION. Do not implement. Do not design routing policy, AUTO, CONSERVE, UI, model selection, or duplicate HealthAuthority/persistence/transport.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\SCOUT-health-acquisition-lifecycle-Reconnaissance.md

**Key discoveries:** - The `ControlPlaneDaemon` owns a singleton `HealthAuthority` instance (per daemon) that aggregates the latest provider evidence (Claude and Codex) from any Game.
- Provider health evidence is acquired per control instance (per Player) via `onHealthFrame` callbacks in `StructuredPrintControl` (Claude) and `CodexAppServerControl` (Codex).
- The `onHealthFrame` callback is wired in `extension.ts` only for Codex to call `StadiumClient.sendHealthEvidence`, which pushes bounded `HealthEvidence` to the daemon via `health.evidence` WebSocket notification.
- The daemon ingests evidence via `HealthAuthority.ingest()`, which updates the canonical snapshot and triggers persistence (`flush()`) and SSE broadcast on change.
- The `HealthAuthority` is flushed on daemon shutdown and via exit handlers, ensuring durability.
- No global provider/surface watcher exists; acquisition is tightly coupled to per-Player control lifecycles.

**FACT:** - `ControlPlaneDaemon.constructor` creates a `HealthAuthority` instance using `fileHealthStateStore` and options with `onChange` scheduling health save and SSE broadcast (src/control-plane/daemon.ts:216-224).
- `HealthAuthority.ingest(params)` validates and updates the canonical provider state (Claude/Codex) and invokes `onChange` with a defensive snapshot on material change (src/control-plane/health-authority.ts:115-140).
- Daemon handles `health.evidence` WebSocket notification by calling `healthAuthority.ingest(p)` after session/Game validation (src/control-plane/daemon.ts:921-929).
- `StadiumClient.sendHealthEvidence(playerInstanceId, evidence)` pushes a `health.evidence` notification to the daemon (src/stadium-client.ts:417-425).
- `extension.ts` registers `CodexAppServerFactory` with `onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)` (src/extension.ts:57-59).
- `StructuredPrintControl.startTurn` invokes `this.options.onHealthFrame?.(this.instanceId, { provider: 'claude', type: 'rate_limit_event', rate_limit_info: ... })` when a Claude `rate_limit_event` frame is parsed (src/player-control/structured-print.ts:485-491).
- `CodexAppServerControl.notification` invokes `this.onHealthFrame?.(this.instanceId, { provider: 'codex', type: 'account_rate_limits', rate_limits: merged })` on `account/rateLimits/updated` and initial read (src/player-control/codex-app-server.ts:644-649, 746).
- `ControlPlaneDaemon.stop()` calls `this.heal

**INFERENCE:** - The `HealthAuthority` serves as a global (per-daemon) sink for the latest provider evidence, decoupled from Game-specific context because its state stores only `providers: { claude?, codex? }` without Game or player identifiers (src/control-plane/health-authority.ts:39-43).
- Provider acquisition (Claude and Codex) is inherently per-control-instance because the `onHealthFrame` callback is scoped to the lifetime of each `PlayerControl` object (created via `open`/`restore` in factories).
- The `StadiumClient` is a singleton per extension activation (one instance created in `extension.ts:191` and reused), providing a global conduit for sending health evidence to the daemon.
- No evidence exists of a global watcher that polls or subscribes to provider health independently of Game/Player lifecycles; acquisition is event-driven from the provider’s stdout (Claude) or native API (Codex).
- The `HealthAuthority`’s `onChange` callback (set in daemon constructor) ensures that any material update to provider evidence triggers persistence and real-time SSE updates to consumers.

**UNKNOWN:** - Whether the `StructuredPrintControl` for Claude is ever provided with an `onHealthFrame` callback in production (i.e., if Claude health evidence is ever sent to the daemon via this path). The code shows `createClaudeControlFactory()` called without options in `extension.ts:60`, leaving `onHealthFrame` undefined, but the bounded objective asserts "Claude native health capture" is present (see CONTRADICTION below).
- Whether any other mechanism (e.g., periodic polling, alternative callbacks) exists to capture Claude health evidence for daemon ingestion.
- If the `HealthAuthority`’s global aggregation (latest evidence per provider regardless of Game) is sufficient for Play 6’s Smart Health Acquisition Manager goals, or if per-Game/per-player context is required.

**CONTRADICTION:** - **Bounded objective states**: "Architecture already has ONE global HealthAuthority, **Claude native health capture**, Codex native account/rateLimits read + updated capture, persistence, HTTP, and SSE."
- **Code shows**: Only Codex health capture is wired to the daemon via `onHealthFrame` in `extension.ts`. Claude `StructuredPrintControl` has the capability to invoke `onHealthFrame` for `rate_limit_event` frames, but no `onHealthFrame` is provided in the registered factory (`extension.ts:60`), meaning Claude health evidence is **not** sent to the daemon in the current codebase. This contradicts the objective’s claim that Claude native health capture is present and functional for daemon ingestion.

**Important files:** - `src/control-plane/health-authority.ts`: Defines `HealthAuthority` class, `ingest()` method, and snapshot structure.
- `src/control-plane/daemon.ts`: Instantiates `HealthAuthority`, handles `health.evidence` notification, and wires `onChange` to persistence/SSE.
- `src/extension.ts`: Registers `CodexAppServerFactory` with `onHealthFrame` → `stadiumClient.sendHealthEvidence`; registers Claude factory without `onHealthFrame`.
- `src/player-control/codex-app-server.ts`: Implements `onHealthFrame` for Codex (account/rateLimits/updated and initial read).
- `src/player-control/structured-print.ts`: Implements `onHealthFrame` for Claude (rate_limit_event stdout frames).
- `src/stadium-client.ts`: Implements `sendHealthEvidence` to push `health.evidence` notification to daemon.

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: health-freshness-dedup-watchers (objective 51056183cfcc)
- Objective: AI Health Play 6 reconnaissance only. Map how Sideline currently represents or can represent health freshness, last-known evidence, provider availability, acquisition source, replay suppression, and duplicate-listener/timer prevention around the existing HealthAuthority and provider controls. Verify how Claude and Codex health evidence currently arrives, what is already event-driven, what zero-inference read seams exist, and where Play 6 should avoid polling. Identify exact files, symbols, tests, and any missing abstraction needed to enforce ONE watcher per provider/surface, not per Game. Establish whether Play 6 should be one implementation slice or multiple bounded slices. FACT / INFERENCE / UNKNOWN / CONTRADICTION only. Do not implement. Do not design routing thresholds, CONSERVE, AUTO, UI, or provider-policy interpretation.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\SCOUT-health-freshness-dedup-watchers-Reconnaissance.md

**Key discoveries:** | Area | Finding |
|------|---------|
| **Authority Scope** | Single global `HealthAuthority` instance owned by the daemon (`daemon.ts:145`, `daemon.ts:216-225`). Games contribute provenance via `HealthEvidenceParams.source`; Authority never owned per Game. |
| **Evidence Ingestion** | Event-driven only. `health.evidence` notification validated at `daemon.ts:921-930` → `healthAuthority.ingest()` at `health-authority.ts:115`. **No polling, no timers, no scheduled acquisition.** |
| **Replay Suppression** | Built into `HealthAuthority.ingest()` (`health-authority.ts:131`): exact factual replay (ignoring `observedAt`) returns `false`, does not advance timestamps, does not fire `onChange`. |
| **Provider Evidence Types** | Two bounded unions: `ClaudeHealthEvidence` (`rate_limit_event`) and `CodexHealthEvidence` (`account_rate_limits`) — `protocol.ts:148-160`. |
| **Claude Evidence Path** | Structured-print stdout frame `type === 'rate_limit_event'` parsed at `structured-print.ts:485-491` → `onHealthFrame` callback → `StadiumClient.sendHealthEvidence()` (`stadium-client.ts:418`). |
| **Codex Evidence Path** | Native `account/rateLimits/updated` push + one `account/rateLimits/read` at startup (`codex-app-server.ts:644-649`, `codex-app-server.ts:741-750`) → `onHealthFrame` callback → same Stadium sender. |
| **Last-Known Evidence** | Per-Game latest raw `HealthEvidenceParams` cached in `daemon.ts:143` (`healthEvidenceByGame` Map) for Play 3 compatibility; global snapshot in Authorit

**FACT:** - **FACT:** `HealthAuthority` is a **single global instance** constructed once in `ControlPlaneDaemon` constructor (`daemon.ts:216-225`). It is not per-Game, not per-Stadium, not per-provider.
- **FACT:** Evidence ingestion is **purely event-driven**. The only entry point is the `health.evidence` WebSocket notification handled at `daemon.ts:921-930`. No `setInterval`, `setTimeout`, or cron-style acquisition exists in the codebase for health.
- **FACT:** **Replay suppression is implemented inside `HealthAuthority.ingest()`** (`health-authority.ts:131`). It compares factual content (excluding `observedAt`) and returns `false` on exact match, suppressing `onChange`, persistence scheduling, and SSE broadcast.
- **FACT:** **Claude health evidence** arrives via structured-print stdout frames (`type: 'rate_limit_event'`) parsed at `structured-print.ts:485-491`. The callback `onHealthFrame` is wired in `extension.ts:58` for the `claude` factory.
- **FACT:** **Codex health evidence** arrives via two native seams: (1) one-time `account/rateLimits/read` at open/restore (`codex-app-server.ts:741-750`), (2) push `account/rateLimits/updated` notifications (`codex-app-server.ts:644-649`). Both emit through the same `onHealthFrame` callback wired at `extension.ts:58`.
- **FACT:** The **`onHealthFrame` callback** is the **sole forwarding seam** from provider controls to Stadium. It is declared in `LaunchOptions` (`codex-app-server.ts:94`, `structured-print.ts:90`) and implemented once in `ext

**INFERENCE:** - **INFERENCE:** Play 6's "smart acquisition" should introduce **one watcher per provider/surface** (e.g., one for Claude structured-print, one for Codex app-server, one for future AntiGravity), **not per Game**. The watcher would manage the *lifecycle* of evidence acquisition (start/stop, backoff, reconnection) while emitting through the existing `onHealthFrame` → `sendHealthEvidence` → `health.evidence` → `HealthAuthority.ingest()` path.
- **INFERENCE:** The existing `onHealthFrame` callback in `LaunchOptions` is the correct **zero-inference seam** for Play 6 to hook acquisition watchers. No new protocol types or daemon ingest paths needed.
- **INFERENCE:** Duplicate-listener/timer prevention in Play 6 should be enforced at the **watcher registry level** (e.g., a `Map<providerSurface, WatcherHandle>` in the daemon or a new `HealthAcquisitionCoordinator`), keyed by provider/surface identity, not by Game.
- **INFERENCE:** The per-Game `healthEvidenceByGame` Map (`daemon.ts:143`) is a **Play 3 compatibility seam** for "last live evidence per Game" and should **not** be conflated with Authority freshness. Play 6 should not write to it; it is read-only for legacy UI.
- **INFERENCE:** Play 6 should be **one bounded slice** because: (a) the acquisition watcher logic is provider-agnostic (same lifecycle: start → emit → stop → backoff → restart), (b) the forwarding seam (`onHealthFrame`) is already unified, (c) the Authority is already multi-provider, (d) splitting into multiple sli

**UNKNOWN:** - **UNKNOWN:** Whether AntiGravity (or future providers) will use the same `onHealthFrame` seam or require a different acquisition model (e.g., CLI invocation like `agy /usage`).
- **UNKNOWN:** Exact backoff/retry policy for acquisition watchers (exponential? fixed? provider-specific?). Play 6 scope should define this.
- **UNKNOWN:** Whether `healthEvidenceByGame` (Play 3 seam) will be deprecated or retained long-term.
- **UNKNOWN:** Whether the `observedAt` timestamp in Authority should be the *ingestion time* (current) or the *provider-native timestamp* (if available in `rate_limits.resetsAt` etc.).
- **UNKNOWN:** Whether Play 6 needs to handle **provider disconnection** (controlled Player closes) by marking evidence stale or retaining last-known with a staleness marker.

---

**CONTRADICTION:** - **CONTRADICTION:** None found in current source. The architecture is internally consistent: single Authority, event-driven ingestion, replay suppression at ingest, unified forwarding seam, defensive persistence.

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/health-authority.ts` | Global Authority: ingest, replay suppression, snapshot, persistence, validation |
| `src/control-plane/daemon.ts` | Daemon owns Authority; handles `health.evidence` notification; exposes read seams |
| `src/control-plane/protocol.ts` | `HealthEvidence`, `HealthEvidenceParams`, `ClaudeHealthEvidence`, `CodexHealthEvidence` types |
| `src/player-control/structured-print.ts` | Claude structured-print parser; emits `rate_limit_event` via `onHealthFrame` |
| `src/player-control/codex-app-server.ts` | Codex app-server; native `account/rateLimits/read` + `account/rateLimits/updated` via `onHealthFrame` |
| `src/stadium-client.ts` | `sendHealthEvidence()` — forwards to daemon via `health.evidence` notification |
| `src/extension.ts` | Wires `onHealthFrame` for both factories to `stadiumClient.sendHealthEvidence()` |
| `test/health-authority.test.mjs` | Validates: missing state, ingest, replay suppression, multi-provider coexistence, persistence, quarantine |
| `test/player-control-contract.test.mjs` | Validates Codex contract methods (`account/rateLimits/read`, `account/rateLimits/updated`) |

---

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane health-acquisition-lifecycle: - The `ControlPlaneDaemon` owns a singleton `HealthAuthority` instance (per daemon) that aggregates the latest provider evidence (Claude and Codex) from any Game. - Provider health evidence is acquired per control instance (per Player) via `onHealthFrame` callbacks in `StructuredPrintControl` (Claude) and `CodexAppServerControl` (Codex). - The `onHealthFrame` callback is wired in `extension.ts` on
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane health-freshness-dedup-watchers: Reconnaissance complete. The current Sideline health architecture has a **single global `HealthAuthority`** (Sideline-scoped, not per-Game) with **event-driven** evidence ingestion from two providers (Claude via structured-print, Codex via app-server). Evidence flows through `StadiumClient.sendHealthEvidence()` → `health.evidence` notification → `HealthAuthority.ingest()`. **No polling, no per-Gam

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane health-acquisition-lifecycle: - **Bounded objective states**: "Architecture already has ONE global HealthAuthority, **Claude native health capture**, Codex native account/rateLimits read + updated capture, persistence, HTTP, and SSE." - **Code shows**: Only Codex health capture is wired to the daemon via `onHealthFrame` in `extension.ts`. Claude `StructuredPrintControl` has the capability to invoke `onHealthFrame` for `rate_limit_event` frames, but no `onHealthFrame` is provided in the registered factory (`extension.ts:60`), meaning Claude health evidence is **not** sent to the daemon in the current codebase. This contradicts the objective’s claim that Claude native health capture is present and functional for daemon ingestion.
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane health-freshness-dedup-watchers: - **CONTRADICTION:** None found in current source. The architecture is internally consistent: single Authority, event-driven ingestion, replay suppression at ingest, unified forwarding seam, defensive persistence. ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane health-acquisition-lifecycle · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\SCOUT-health-acquisition-lifecycle-Reconnaissance.md
- Lane health-freshness-dedup-watchers · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754\SCOUT-health-freshness-dedup-watchers-Reconnaissance.md

### Full report — lane health-acquisition-lifecycle (sideline-scout-balanced)

# AI Health Play 6 Reconnaissance Report

**Scout Agent**: sideline-scout-balanced  
**Model**: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Report Type**: Read-only reconnaissance (not final architectural authority)  
**Objective**: Map existing provider acquisition, lifecycle, startup/shutdown, singleton/service ownership, and event-wiring seams for reuse by a Smart Health Acquisition Manager. Determine where one provider/surface watcher should live globally rather than per Game. Distinguish FACT, INFERENCE, UNKNOWN, CONTRADICTION.

## KEY DISCOVERIES
- The `ControlPlaneDaemon` owns a singleton `HealthAuthority` instance (per daemon) that aggregates the latest provider evidence (Claude and Codex) from any Game.
- Provider health evidence is acquired per control instance (per Player) via `onHealthFrame` callbacks in `StructuredPrintControl` (Claude) and `CodexAppServerControl` (Codex).
- The `onHealthFrame` callback is wired in `extension.ts` only for Codex to call `StadiumClient.sendHealthEvidence`, which pushes bounded `HealthEvidence` to the daemon via `health.evidence` WebSocket notification.
- The daemon ingests evidence via `HealthAuthority.ingest()`, which updates the canonical snapshot and triggers persistence (`flush()`) and SSE broadcast on change.
- The `HealthAuthority` is flushed on daemon shutdown and via exit handlers, ensuring durability.
- No global provider/surface watcher exists; acquisition is tightly coupled to per-Player control lifecycles.

## FACT
- `ControlPlaneDaemon.constructor` creates a `HealthAuthority` instance using `fileHealthStateStore` and options with `onChange` scheduling health save and SSE broadcast (src/control-plane/daemon.ts:216-224).
- `HealthAuthority.ingest(params)` validates and updates the canonical provider state (Claude/Codex) and invokes `onChange` with a defensive snapshot on material change (src/control-plane/health-authority.ts:115-140).
- Daemon handles `health.evidence` WebSocket notification by calling `healthAuthority.ingest(p)` after session/Game validation (src/control-plane/daemon.ts:921-929).
- `StadiumClient.sendHealthEvidence(playerInstanceId, evidence)` pushes a `health.evidence` notification to the daemon (src/stadium-client.ts:417-425).
- `extension.ts` registers `CodexAppServerFactory` with `onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)` (src/extension.ts:57-59).
- `StructuredPrintControl.startTurn` invokes `this.options.onHealthFrame?.(this.instanceId, { provider: 'claude', type: 'rate_limit_event', rate_limit_info: ... })` when a Claude `rate_limit_event` frame is parsed (src/player-control/structured-print.ts:485-491).
- `CodexAppServerControl.notification` invokes `this.onHealthFrame?.(this.instanceId, { provider: 'codex', type: 'account_rate_limits', rate_limits: merged })` on `account/rateLimits/updated` and initial read (src/player-control/codex-app-server.ts:644-649, 746).
- `ControlPlaneDaemon.stop()` calls `this.healthAuthority.flush()` to persist state on shutdown (src/control-plane/daemon.ts:523).
- Exit handlers (`SIGINT`/`SIGTERM`) also call `this.healthAuthority.flush()` before process exit (src/control-plane/daemon.ts:682).

## INFERENCE
- The `HealthAuthority` serves as a global (per-daemon) sink for the latest provider evidence, decoupled from Game-specific context because its state stores only `providers: { claude?, codex? }` without Game or player identifiers (src/control-plane/health-authority.ts:39-43).
- Provider acquisition (Claude and Codex) is inherently per-control-instance because the `onHealthFrame` callback is scoped to the lifetime of each `PlayerControl` object (created via `open`/`restore` in factories).
- The `StadiumClient` is a singleton per extension activation (one instance created in `extension.ts:191` and reused), providing a global conduit for sending health evidence to the daemon.
- No evidence exists of a global watcher that polls or subscribes to provider health independently of Game/Player lifecycles; acquisition is event-driven from the provider’s stdout (Claude) or native API (Codex).
- The `HealthAuthority`’s `onChange` callback (set in daemon constructor) ensures that any material update to provider evidence triggers persistence and real-time SSE updates to consumers.

## UNKNOWN
- Whether the `StructuredPrintControl` for Claude is ever provided with an `onHealthFrame` callback in production (i.e., if Claude health evidence is ever sent to the daemon via this path). The code shows `createClaudeControlFactory()` called without options in `extension.ts:60`, leaving `onHealthFrame` undefined, but the bounded objective asserts "Claude native health capture" is present (see CONTRADICTION below).
- Whether any other mechanism (e.g., periodic polling, alternative callbacks) exists to capture Claude health evidence for daemon ingestion.
- If the `HealthAuthority`’s global aggregation (latest evidence per provider regardless of Game) is sufficient for Play 6’s Smart Health Acquisition Manager goals, or if per-Game/per-player context is required.

## CONTRADICTION
- **Bounded objective states**: "Architecture already has ONE global HealthAuthority, **Claude native health capture**, Codex native account/rateLimits read + updated capture, persistence, HTTP, and SSE."
- **Code shows**: Only Codex health capture is wired to the daemon via `onHealthFrame` in `extension.ts`. Claude `StructuredPrintControl` has the capability to invoke `onHealthFrame` for `rate_limit_event` frames, but no `onHealthFrame` is provided in the registered factory (`extension.ts:60`), meaning Claude health evidence is **not** sent to the daemon in the current codebase. This contradicts the objective’s claim that Claude native health capture is present and functional for daemon ingestion.

## IMPORTANT FILES / PATHS
- `src/control-plane/health-authority.ts`: Defines `HealthAuthority` class, `ingest()` method, and snapshot structure.
- `src/control-plane/daemon.ts`: Instantiates `HealthAuthority`, handles `health.evidence` notification, and wires `onChange` to persistence/SSE.
- `src/extension.ts`: Registers `CodexAppServerFactory` with `onHealthFrame` → `stadiumClient.sendHealthEvidence`; registers Claude factory without `onHealthFrame`.
- `src/player-control/codex-app-server.ts`: Implements `onHealthFrame` for Codex (account/rateLimits/updated and initial read).
- `src/player-control/structured-print.ts`: Implements `onHealthFrame` for Claude (rate_limit_event stdout frames).
- `src/stadium-client.ts`: Implements `sendHealthEvidence` to push `health.evidence` notification to daemon.

## LIMITATIONS
- Reconnaissance limited to static source code; no runtime behavior observed.
- Did not inspect Stadium or provider CLI binaries; relied on declared interfaces and callbacks.
- Did not examine historical reports or tests beyond verifying current code symbols.
- Could not confirm if Claude `onHealthFrame` is set elsewhere (e.g., via dependency injection) due to read-only constraints.

**Conclusion**: The existing seams reveal a per-control-instance provider acquisition model pushing to a global `HealthAuthority` via the `StadiumClient`. No global provider/surface watcher exists; acquisition is tied to Player control lifecycles. Play 6 should reuse the `StadiumClient.sendHealthEvidence` seam and `HealthAuthority.ingest()` method, but must address the missing Claude health capture wiring to achieve full provider coverage.  
**REPORT COMPLETE** - No files modified.  
**Scout ID**: health-acquisition-lifecycle  
**Play ID**: ai-health-play6-smart-acquisition-20260921-203754  
**Timestamp**: Mon Sep 21 2026  
**End of report**.

### Full report — lane health-freshness-dedup-watchers (sideline-scout-deep)

Now I have a comprehensive understanding. Let me check for any existing watcher/timer patterns in the health flow.
Now I have all the evidence needed. Let me compile the complete reconnaissance report.

---

# SCOUT REPORT — AI Health Play 6 Reconnaissance

**Play ID:** ai-health-play6-smart-acquisition-20260921-203754  
**Scout ID:** health-freshness-dedup-watchers  
**Scout Agent:** sideline-scout-deep (OpenCode Explore)  
**Scout Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Scout Role:** Read-Only Reconnaissance Scout  
**Reconnaissance Depth:** Deep  
**Timestamp:** 2026-09-21 (local project time)  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

> **This report is reconnaissance, not final architectural authority.**

---

## RESULT

Reconnaissance complete. The current Sideline health architecture has a **single global `HealthAuthority`** (Sideline-scoped, not per-Game) with **event-driven** evidence ingestion from two providers (Claude via structured-print, Codex via app-server). Evidence flows through `StadiumClient.sendHealthEvidence()` → `health.evidence` notification → `HealthAuthority.ingest()`. **No polling, no per-Game watchers, no duplicate timers exist today.** Play 6 should be **one bounded implementation slice** that introduces **one acquisition watcher per provider/surface** (not per Game), using the existing `onHealthFrame` callback seam and the global Authority as the sole trust boundary.

---

## KEY DISCOVERIES

| Area | Finding |
|------|---------|
| **Authority Scope** | Single global `HealthAuthority` instance owned by the daemon (`daemon.ts:145`, `daemon.ts:216-225`). Games contribute provenance via `HealthEvidenceParams.source`; Authority never owned per Game. |
| **Evidence Ingestion** | Event-driven only. `health.evidence` notification validated at `daemon.ts:921-930` → `healthAuthority.ingest()` at `health-authority.ts:115`. **No polling, no timers, no scheduled acquisition.** |
| **Replay Suppression** | Built into `HealthAuthority.ingest()` (`health-authority.ts:131`): exact factual replay (ignoring `observedAt`) returns `false`, does not advance timestamps, does not fire `onChange`. |
| **Provider Evidence Types** | Two bounded unions: `ClaudeHealthEvidence` (`rate_limit_event`) and `CodexHealthEvidence` (`account_rate_limits`) — `protocol.ts:148-160`. |
| **Claude Evidence Path** | Structured-print stdout frame `type === 'rate_limit_event'` parsed at `structured-print.ts:485-491` → `onHealthFrame` callback → `StadiumClient.sendHealthEvidence()` (`stadium-client.ts:418`). |
| **Codex Evidence Path** | Native `account/rateLimits/updated` push + one `account/rateLimits/read` at startup (`codex-app-server.ts:644-649`, `codex-app-server.ts:741-750`) → `onHealthFrame` callback → same Stadium sender. |
| **Last-Known Evidence** | Per-Game latest raw `HealthEvidenceParams` cached in `daemon.ts:143` (`healthEvidenceByGame` Map) for Play 3 compatibility; global snapshot in Authority. |
| **Freshness / ObservedAt** | Authority sets `observedAt` at ingest (`health-authority.ts:132`); snapshot has global `updatedAt` (`health-authority.ts:135`). Provider-native `resetsAt`/`windowDurationMins` preserved inside `rate_limit_info` / `rate_limits`. |
| **Acquisition Source Provenance** | `HealthEvidenceParams.source` carries `{stadiumId, instanceId, gameId, playerInstanceId}` (`protocol.ts:162-168`, `health-authority.ts:123-128`). |
| **Duplicate Listener/Timer Prevention** | **None exists today** — because there are no watchers/timers. Each controlled Player instance registers its own `onHealthFrame` callback at construction (`extension.ts:58`, `codex-app-server.ts:379`, `structured-print.ts:400`). One callback per live controlled instance. |
| **Zero-Inference Read Seams** | `HealthAuthority.getSnapshot()` (defensive copy, `health-authority.ts:143`), `GET /api/ai-health` (`daemon.ts:1020-1022`), `daemon.getHealthSnapshot()` (`daemon.ts:403-405`). |
| **Persistence** | Atomic file store at `~/.sideline/ai-health-state.json` (`health-authority.ts:57-102`). Quarantine on corruption/unsupported schema. `flush()` on shutdown (`daemon.ts:521-523`). |

---

## FACT

- **FACT:** `HealthAuthority` is a **single global instance** constructed once in `ControlPlaneDaemon` constructor (`daemon.ts:216-225`). It is not per-Game, not per-Stadium, not per-provider.
- **FACT:** Evidence ingestion is **purely event-driven**. The only entry point is the `health.evidence` WebSocket notification handled at `daemon.ts:921-930`. No `setInterval`, `setTimeout`, or cron-style acquisition exists in the codebase for health.
- **FACT:** **Replay suppression is implemented inside `HealthAuthority.ingest()`** (`health-authority.ts:131`). It compares factual content (excluding `observedAt`) and returns `false` on exact match, suppressing `onChange`, persistence scheduling, and SSE broadcast.
- **FACT:** **Claude health evidence** arrives via structured-print stdout frames (`type: 'rate_limit_event'`) parsed at `structured-print.ts:485-491`. The callback `onHealthFrame` is wired in `extension.ts:58` for the `claude` factory.
- **FACT:** **Codex health evidence** arrives via two native seams: (1) one-time `account/rateLimits/read` at open/restore (`codex-app-server.ts:741-750`), (2) push `account/rateLimits/updated` notifications (`codex-app-server.ts:644-649`). Both emit through the same `onHealthFrame` callback wired at `extension.ts:58`.
- **FACT:** The **`onHealthFrame` callback** is the **sole forwarding seam** from provider controls to Stadium. It is declared in `LaunchOptions` (`codex-app-server.ts:94`, `structured-print.ts:90`) and implemented once in `extension.ts:58` → `stadiumClient.sendHealthEvidence()`.
- **FACT:** **`HealthEvidenceParams` carries full provenance**: `stadiumId`, `instanceId`, `gameId`, `playerInstanceId` (`protocol.ts:162-168`). Authority stores this as `source` on each provider entry (`health-authority.ts:123-128`).
- **FACT:** **Per-Game latest evidence** is cached in `daemon.healthEvidenceByGame` (`daemon.ts:143`, `daemon.ts:927`) for Play 3 compatibility (last-known live evidence per Game). This is **in-memory only**, not persisted.
- **FACT:** **Zero-inference read seams** exist: `HealthAuthority.getSnapshot()` (defensive clone), `daemon.getHealthSnapshot()`, `GET /api/ai-health` HTTP endpoint. No interpretation, classification, or routing logic in any read path.
- **FACT:** **Persistence** is atomic (`health-authority.ts:84-93`), with quarantine for corrupt/unsupported schemas (`health-authority.ts:95-100`, `health-authority.ts:156-165`). `flush()` called on daemon stop (`daemon.ts:521-523`) and on `onChange` via debounced `scheduleHealthSave()` (`daemon.ts:220-222`).
- **FACT:** **No duplicate listener/timer prevention logic exists** because there are no acquisition watchers/timers today. Each controlled Player instance naturally has its own `onHealthFrame` callback (one per live instance).

---

## INFERENCE

- **INFERENCE:** Play 6's "smart acquisition" should introduce **one watcher per provider/surface** (e.g., one for Claude structured-print, one for Codex app-server, one for future AntiGravity), **not per Game**. The watcher would manage the *lifecycle* of evidence acquisition (start/stop, backoff, reconnection) while emitting through the existing `onHealthFrame` → `sendHealthEvidence` → `health.evidence` → `HealthAuthority.ingest()` path.
- **INFERENCE:** The existing `onHealthFrame` callback in `LaunchOptions` is the correct **zero-inference seam** for Play 6 to hook acquisition watchers. No new protocol types or daemon ingest paths needed.
- **INFERENCE:** Duplicate-listener/timer prevention in Play 6 should be enforced at the **watcher registry level** (e.g., a `Map<providerSurface, WatcherHandle>` in the daemon or a new `HealthAcquisitionCoordinator`), keyed by provider/surface identity, not by Game.
- **INFERENCE:** The per-Game `healthEvidenceByGame` Map (`daemon.ts:143`) is a **Play 3 compatibility seam** for "last live evidence per Game" and should **not** be conflated with Authority freshness. Play 6 should not write to it; it is read-only for legacy UI.
- **INFERENCE:** Play 6 should be **one bounded slice** because: (a) the acquisition watcher logic is provider-agnostic (same lifecycle: start → emit → stop → backoff → restart), (b) the forwarding seam (`onHealthFrame`) is already unified, (c) the Authority is already multi-provider, (d) splitting into multiple slices would duplicate the watcher registry and backoff logic.

---

## UNKNOWN

- **UNKNOWN:** Whether AntiGravity (or future providers) will use the same `onHealthFrame` seam or require a different acquisition model (e.g., CLI invocation like `agy /usage`).
- **UNKNOWN:** Exact backoff/retry policy for acquisition watchers (exponential? fixed? provider-specific?). Play 6 scope should define this.
- **UNKNOWN:** Whether `healthEvidenceByGame` (Play 3 seam) will be deprecated or retained long-term.
- **UNKNOWN:** Whether the `observedAt` timestamp in Authority should be the *ingestion time* (current) or the *provider-native timestamp* (if available in `rate_limits.resetsAt` etc.).
- **UNKNOWN:** Whether Play 6 needs to handle **provider disconnection** (controlled Player closes) by marking evidence stale or retaining last-known with a staleness marker.

---

## CONTRADICTION

- **CONTRADICTION:** None found in current source. The architecture is internally consistent: single Authority, event-driven ingestion, replay suppression at ingest, unified forwarding seam, defensive persistence.

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/health-authority.ts` | Global Authority: ingest, replay suppression, snapshot, persistence, validation |
| `src/control-plane/daemon.ts` | Daemon owns Authority; handles `health.evidence` notification; exposes read seams |
| `src/control-plane/protocol.ts` | `HealthEvidence`, `HealthEvidenceParams`, `ClaudeHealthEvidence`, `CodexHealthEvidence` types |
| `src/player-control/structured-print.ts` | Claude structured-print parser; emits `rate_limit_event` via `onHealthFrame` |
| `src/player-control/codex-app-server.ts` | Codex app-server; native `account/rateLimits/read` + `account/rateLimits/updated` via `onHealthFrame` |
| `src/stadium-client.ts` | `sendHealthEvidence()` — forwards to daemon via `health.evidence` notification |
| `src/extension.ts` | Wires `onHealthFrame` for both factories to `stadiumClient.sendHealthEvidence()` |
| `test/health-authority.test.mjs` | Validates: missing state, ingest, replay suppression, multi-provider coexistence, persistence, quarantine |
| `test/player-control-contract.test.mjs` | Validates Codex contract methods (`account/rateLimits/read`, `account/rateLimits/updated`) |

---

## PLAY 6 BOUNDARY RECOMMENDATIONS (FOR ARCHITECT)

1. **One slice** — Acquisition watcher lifecycle is provider-agnostic; unified `onHealthFrame` seam; single Authority.
2. **Watcher key = provider/surface** (e.g., `claude-structured-print`, `codex-app-server`, `antigravity-cli`), not Game.
3. **No new protocol types** — Reuse `HealthEvidence` union and `HealthEvidenceParams`.
4. **No polling** — Codex is push + one read; Claude is stdout event; future providers should be event-driven where possible.
5. **Staleness policy** — Play 6 should define TTL/staleness for last-known evidence (Authority currently has no TTL).
6. **Watcher registry** — Single `Map<string, WatcherHandle>` in daemon (or new coordinator) to enforce one watcher per provider/surface.
7. **Preserve Play 3 seam** — `healthEvidenceByGame` stays read-only for legacy UI; Play 6 does not write to it.

---

## SCOUT LIMITATIONS

- Did not inspect UI/consumer side of `GET /api/ai-health` or SSE `ai-health` broadcasts.
- Did not verify AntiGravity health acquisition path (no current implementation).
- Did not run full test suite; relied on focused test evidence in reports.
- Did not evaluate provider-policy interpretation (CONSERVE, AUTO, routing) — explicitly out of scope per Play 6 charter.

---

## ARCHITECT DECISION REQUIRED

- **Watcher ownership:** Should acquisition watchers live in `ControlPlaneDaemon` or a new `HealthAcquisitionCoordinator` class?
- **Staleness/TTL:** What TTL or staleness policy should Play 6 enforce on Authority entries?
- **Provider disconnection:** Should Authority mark evidence stale when a controlled Player closes, or retain last-known indefinitely?
- **AntiGravity seam:** Will AntiGravity use `onHealthFrame` or a CLI-invocation model? This affects watcher abstraction.

---

*End of reconnaissance.*

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play6-smart-acquisition-20260921-203754
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\ai-health-play6-smart-acquisition-20260921-203754

