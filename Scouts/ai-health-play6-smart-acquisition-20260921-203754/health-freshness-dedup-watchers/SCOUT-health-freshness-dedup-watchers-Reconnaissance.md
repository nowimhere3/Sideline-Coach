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
