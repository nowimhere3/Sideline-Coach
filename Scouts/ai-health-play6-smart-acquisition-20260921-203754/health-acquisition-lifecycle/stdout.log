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
