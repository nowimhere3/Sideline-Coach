Now I have all the evidence needed. Let me compile the complete reconnaissance report.
Now I have complete evidence. Let me produce the final reconnaissance report.

---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** ai-health-play5-codex-map-20260921-200405  
**Scout ID:** codex-to-health-authority-seam  
**Scout Agent:** sideline-scout-deep (openrouter/nvidia/nemotron-3-ultra-550b-a55b:free)  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Date:** 2026-09-21  

> **This is reconnaissance, not final architectural authority.** Findings are labeled FACT / INFERENCE / UNKNOWN / CONTRADICTION per SOP. Exact coordinates cited.

---

## RESULT

**No existing path exists for Codex app-server health evidence into the global HealthAuthority.** The current architecture is explicitly single-provider (Claude only). The shortest bounded path requires protocol/type extensions to the existing `health.evidence` notification seam — there is no daemon-local adapter, no alternate transport, and no Codex health emission today.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | HealthAuthority schema hardcodes `provider: 'claude'` only | `src/control-plane/health-authority.ts:9,151-160,158` |
| 2 | Protocol defines only `ClaudeHealthEvidence`; no Codex type | `src/control-plane/protocol.ts:148-160` |
| 3 | Daemon validator `isClaudeHealthEvidence` rejects non-Claude | `src/control-plane/daemon.ts:3651-3670, 926` |
| 4 | Codex app-server protocol has **no** health/rate-limit notification | `src/player-control/codex-contract.ts:45` (serverNotifications list) |
| 5 | Codex app-server only checks conversation `status !== 'idle' && !== 'active'` | `src/player-control/codex-app-server.ts:744` |
| 6 | Play 4 handoff seam explicitly names "Play 5 provider acquisition" as next step | `REPORTS/Codex/AI-Health-Play4-2-Daemon-Integration-And-Distribution__20260921-195654__Codex.md:40-42` |

---

## FACT

| Coordinate | Detail |
|------------|--------|
| `health-authority.ts:9` | `AI_HEALTH_SCHEMA_VERSION = 1` |
| `health-authority.ts:22-26` | `HealthAuthoritySnapshot.providers` is `Partial<Record<'claude', ProviderHealthState>>` — only `'claude'` key permitted |
| `health-authority.ts:151-160` | `validSnapshot()` rejects any provider key ≠ `'claude'` |
| `health-authority.ts:163-169` | `validProviderState()` requires `provider === 'claude'` and `evidenceType === 'rate_limit_event'` |
| `protocol.ts:148-152` | `ClaudeHealthEvidence` interface: `{ provider: 'claude', type: 'rate_limit_event', rate_limit_info: Record<string,unknown> }` |
| `protocol.ts:154-160` | `HealthEvidenceParams.evidence` is strictly `ClaudeHealthEvidence` (no union) |
| `daemon.ts:3651-3670` | `isClaudeHealthEvidence()` validates exact shape: provider='claude', type='rate_limit_event', no extra keys |
| `daemon.ts:921-929` | `case 'health.evidence':` guard: `session.features?.includes('health.evidence.v1')` + `isClaudeHealthEvidence(p.evidence)` |
| `codex-contract.ts:43-47` | `REQUIRED_CONTRACT.serverNotifications` = `['turn/started','turn/completed','item/agentMessage/delta','item/started','item/completed']` — **no health/rate-limit notification** |
| `codex-app-server.ts:631-661` | `notification()` handler only processes the 5 serverNotifications above |
| `structured-print.ts:485-490` | **Only** Claude structured-print path emits health evidence: `frame.type === 'rate_limit_event'` → `onHealthFrame(instanceId, {provider:'claude',type:'rate_limit_event',rate_limit_info})` |
| `stadium-client.ts:418-425` | `sendHealthEvidence(playerInstanceId, evidence: ClaudeHealthEvidence)` — typed for Claude only |
| `health-authority.test.mjs:9-12` | Test evidence factory hardcodes `provider: 'claude', type: 'rate_limit_event'` |
| `health-authority-daemon.test.mjs:58-59` | Daemon test sends only Claude evidence via `client.sendHealthEvidence()` |

---

## INFERENCE

| Inference | Basis |
|-----------|-------|
| Codex app-server cannot emit health evidence today without protocol change | Codex protocol (codex-contract.ts) defines no health notification; Codex RPC server sends none |
| HealthAuthority must be extended to accept `provider: 'codex'` to support Play 5 | Current `validSnapshot()`/`validProviderState()` reject any non-'claude' key (health-authority.ts:158,164) |
| The existing `health.evidence` notification is the **only** bounded path into HealthAuthority | Daemon ingests only via `case 'health.evidence':` (daemon.ts:921); no other ingestion path exists |
| Stadium → daemon `health.evidence.v1` feature gate is the transport seam | `session.features?.includes('health.evidence.v1')` required (daemon.ts:925); Stadium declares it in hello (stadium-client.ts:520) |
| A Codex health evidence type would need: new protocol interface, union in `HealthEvidenceParams`, validator, Authority schema extension | All four layers are currently Claude-exclusive |

---

## UNKNOWN

| Unknown | Why |
|---------|-----|
| What health/rate-limit signals Codex app-server **actually emits** (if any) at the RPC level | Codex protocol schema not inspected beyond REQUIRED_CONTRACT; unknown if Codex has undocumented rate-limit notifications |
| Whether Codex CLI has a `--print`/structured mode analogous to Claude that exposes rate-limit frames | Codex app-server uses persistent app-server protocol, not per-turn print mode |
| Whether a daemon-local adapter could synthesize health evidence from Codex `turn/completed` status or errors | No evidence in source that Codex surfaces rate-limit info; would be speculation |

---

## CONTRADICTION

| Contradiction | Location | Detail |
|---------------|----------|--------|
| **"ONE Authority only" vs. single-provider schema** | `health-authority.ts:158` + Play 5 objective | HealthAuthority validates `keys.some(key => key !== 'claude')` → false. Adding Codex **requires** schema change to allow `'codex'` key, or violates "ONE Authority" by needing a second authority. |
| **Play 4 handoff claims "Play 5 can enter through existing validated daemon ingest path"** | `REPORTS/Codex/AI-Health-Play4-2...md:40-42` | The existing path **only accepts Claude evidence** (protocol + validator + Authority). Codex cannot use it without protocol/Authority changes. |
| **No provider-policy interpretation** vs. **provider-specific evidence shape** | `health-authority.ts:171-176` | `validClaudeEvidence()` enforces exact Claude shape (3 keys only). A Codex evidence type would need its own validator — this *is* provider-specific interpretation at the boundary. |

---

## IMPORTANT FILES / PATHS

| File | Role in Current Path | Play 5 Impact |
|------|---------------------|---------------|
| `src/control-plane/health-authority.ts` | Global Authority core — **Claude-only schema** | **Must extend**: schema version, provider keys, validator, snapshot type |
| `src/control-plane/protocol.ts` | Wire protocol — **ClaudeHealthEvidence only** | **Must extend**: `CodexHealthEvidence` interface, `HealthEvidenceParams.evidence` as union |
| `src/control-plane/daemon.ts:3651-3670,921-929` | Ingest validator + handler | **Must extend**: `isCodexHealthEvidence()`, union guard in `case 'health.evidence':` |
| `src/player-control/codex-app-server.ts:631-661` | Codex notification handler | **Must extend**: detect Codex health signals (if any), call `onHealthFrame?` equivalent |
| `src/player-control/structured-print.ts:88-90,485-490` | Reference pattern: `onHealthFrame` callback → `sendHealthEvidence` | **Pattern to replicate** for Codex control |
| `src/stadium-client.ts:418-425,520` | Stadium sender + feature declaration | **Must extend**: `sendHealthEvidence` to accept union; feature gate unchanged |
| `test/health-authority.test.mjs` | Authority unit tests | **Must extend**: Codex evidence fixtures, multi-provider snapshot tests |
| `test/health-authority-daemon.test.mjs` | Daemon integration test | **Must extend**: Codex evidence ingestion test |

---

## BOUNDED PATH OPTIONS (per Objective)

| Option | Feasibility | Required Changes |
|--------|-------------|------------------|
| **Reuse Stadium → daemon `health.evidence` notification** | **Only viable path** — but requires protocol/Authority extension | 1. Protocol: add `CodexHealthEvidence`, widen `HealthEvidenceParams.evidence`<br>2. Authority: allow `'codex'` provider key, add validator<br>3. Daemon: add `isCodexHealthEvidence()` guard<br>4. Codex control: emit health evidence via callback<br>5. Stadium: widen `sendHealthEvidence` type |
| **Daemon-local adapter** | **Not feasible** — no Codex health signal exists to adapt | Codex app-server receives no rate-limit/health notifications (codex-contract.ts:45) |
| **Alternate transport (HTTP, direct call, etc.)** | **Violates "already-existing bounded path" constraint** | Would bypass the validated `health.evidence.v1` feature gate and Authority ingest seam |

---

## LIMITATIONS

- Did not inspect Codex upstream protocol schema (generated JSON) for undocumented health notifications — only the adapter's REQUIRED_CONTRACT.
- Did not evaluate whether Codex CLI has rate-limit headers/frames outside app-server protocol.
- Historical reports (Play 4 validation, etc.) cited as evidence of intent, not current source truth — current source is authoritative.
- No implementation, no Play 6 design, no UI, no AUTO/CONSERVE explored per contract.

---

## SCOUT SIGNATURE

```
Scout: sideline-scout-deep
Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
Play: ai-health-play5-codex-map-20260921-200405
Status: RECONNAISSANCE COMPLETE — OBJECTIVE BOUNDED
```
