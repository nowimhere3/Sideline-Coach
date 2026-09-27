# AI Usage Alarms Stage 1A — Nervous System

Date: 2026-09-25  
Agent: Codex  
Architectural authority: `AI-Usage-Alarm-Threshold-Routing-Conserve-Architecture-Reconciliation`

## Outcome

Stage 1A is implemented. Sideline Coach now has one canonical AI-usage alarm state machine driven only by `HealthAuthority`, durable transition/reset-cycle memory, a bounded clock-horizon reconciler, structured `ai-alarm` domain events, VS Code notifications, and local in-app webview toasts.

No CONSERVE routing, Schedule Later execution, browser Notification permission, remote-phone alarm delivery, alarm history UI, telemetry acquisition, or Scoreboard redesign was added.

## Files changed for Stage 1A

- `src/control-plane/alarm-engine.ts` — new canonical evaluator, state machine, event contract, stale reconciliation, and clock horizon.
- `src/control-plane/alarm-state-store.ts` — new atomic `~/.sideline/alarm-state.json` transition/dedupe store.
- `src/alarm-notification.ts` — new thin VS Code notification adapter.
- `src/running-players.ts` — durable `AlarmPreferences`, defaults, validation, loading, and saving.
- `src/control-plane/daemon.ts` — HealthAuthority wiring, engine lifecycle, SSE event delivery, VS Code bridge, preference API validation, and bounded startup-event handoff.
- `src/stadium-client.ts` — receives authenticated `ai.alarm` JSON-RPC notifications and emits the typed local event.
- `src/extension.ts` — displays warning/information messages and dedupes event IDs in-process.
- `src/public/index.html` — consumes local `ai-alarm` SSE events as temporary non-modal toasts and renames Settings to `Routing & Alarms`.
- `test/ai-usage-alarm-engine.test.mjs` — new threshold, hysteresis, reset, stale, persistence, and preference tests.
- `test/ai-usage-alarm-delivery.test.mjs` — new daemon/SSE/Stadium/VS Code adapter/startup-delivery tests.
- `test/ai-usage-scoreboard-ui.test.mjs` — adds real-page `ai-alarm` toast/dedupe coverage while retaining the prior compact Scoreboard tests.

The worktree already contained the completed compact Scoreboard/utility work and other unrelated user changes. They were preserved. No unrelated cleanup was performed.

## Architecture implemented

The implemented path is:

`HealthAuthority snapshot / absolute resetsAt` → `AlarmEngine` → persisted transition → typed `AiAlarmEvent` → local delivery adapters.

`AlarmEngine` normalizes the canonical Claude `unifiedWindows`/legacy canonical window forms and Codex native `primary`/`secondary` windows into four rules:

- `claude:five_hour`
- `claude:weekly`
- `codex:five_hour`
- `codex:weekly`

It never scrapes Scoreboard text and does not persist percentages, provider payloads, or a shadow health snapshot. The periodic daemon callback re-reads `HealthAuthority.getSnapshot()` so canonical health remains the live source of truth.

## Deviations from the reconciliation

There is no material behavioral deviation.

- Threshold preferences are represented as percentage points (`20`, `15`, `5`) rather than fractional examples (`0.20`, `0.15`, `0.05`). This matches the repository's canonical `usedPercent`/remaining-percent presentation and the mission's stated defaults.
- `resource-policy.ts` was intentionally not created, per the Stage 1A scope refinement.
- No production debug endpoint/control was added. Deterministic tests are the safe quota-free field proof.
- `ai-alarm` SSE delivery is local-only. Remote mobile alarms remain an explicit future adapter rather than leaking into Stage 1A.

## Threshold state machine

Persistent states are exactly `NORMAL`, `LOW`, `CRITICAL`, and `UNKNOWN`.

- Enter LOW at `remaining <= configured LOW`.
- Enter CRITICAL at `remaining <= configured CRITICAL`.
- Exit LOW only above `LOW + 2 percentage points`.
- Exit CRITICAL only above `CRITICAL + 2 percentage points`; it may then settle in LOW if still below the LOW threshold.
- `RECOVERED` is emitted only as `alarm:recovered`; it is never stored as state.
- Missing, unproven, or over-age evidence evaluates to `UNKNOWN`, with one `alarm:stale` transition event rather than being treated as healthy.
- Repeated observations inside LOW or CRITICAL do not emit another entry/escalation event.
- Startup adopts the current canonical state with historical threshold emission suppressed, preventing restart spam.

Defaults:

- Claude 5H LOW: 20%
- Claude Weekly LOW: 15%
- Codex 5H LOW: 20%
- Codex Weekly LOW: 20%
- CRITICAL: 5%
- maximum stale age: 30 minutes

## Clock horizon, sleep/wake, and restart

The engine persists each rule's last canonical future `horizonResetsAt` and exact `lastProcessedResetCycle`.

- The next wake is the nearer of the closest future boundary or the heartbeat.
- The heartbeat is capped at 60 seconds; no multi-hour timer is created.
- Each heartbeat also re-evaluates freshness from the live HealthAuthority snapshot.
- A timer delayed by OS sleep compares wall clock to absolute `resetsAt` on its first resumed tick and processes the missed boundary immediately.
- Startup loads persisted horizons before evaluating current telemetry and audits any boundary crossed while the daemon was stopped.
- Reset-cycle comparison uses the same 15-minute provider jitter tolerance as HealthAuthority while persisting the canonical timestamp itself. Late telemetry for the same provider cycle therefore cannot emit a second reset.
- A processed boundary returns the rule to `NORMAL` and emits one `alarm:reset_boundary_reached` event.

The daemon keeps only a bounded, in-memory handoff (maximum eight events per local adapter) when a startup event occurs just before the first Stadium or local webview attaches. It is not persisted and is not an alarm history facility.

## Persistence contract

Location: `~/.sideline/alarm-state.json`

Schema version: `1`

Per rule, the store may contain only:

- current state
- `enteredAt`
- last event type/ID/time
- last canonical horizon timestamp
- last processed reset-cycle timestamp

There are no stored utilization, used-percent, or remaining-percent facts. Writes use the repository's atomic sibling-temporary-file then rename pattern. Malformed/unsupported files are quarantined and evaluation starts safely from empty transition state.

## Event contract

One strongly typed `AiAlarmEvent` carries:

- stable deterministic event ID
- event type
- provider and window
- user label (`5H` or `Weekly`)
- previous/current state
- severity
- remaining percent when known
- configured threshold when relevant
- canonical `resetsAt` when known
- ISO timestamp
- deterministic user-facing message

Implemented event types:

- `alarm:threshold_entered`
- `alarm:threshold_escalated`
- `alarm:reset_boundary_reached`
- `alarm:recovered`
- `alarm:stale`

## Notification delivery

- Daemon emits `ai-alarm` on the existing local SSE event stream.
- Daemon sends one `ai.alarm` JSON-RPC notification to one connected Stadium, avoiding duplicate VS Code popups across multiple workspace windows.
- StadiumClient emits the typed event to the extension.
- VS Code uses `showWarningMessage` for LOW/CRITICAL/stale and `showInformationMessage` for reset/recovery.
- The existing webview toast renders the engine's message for five seconds, remains non-blocking, and dedupes event IDs. No modal, notification center, or history was added.
- Browser notification permission is schema-only and remains disabled/unimplemented.

## Settings information architecture

The planned Settings card is now titled `Routing & Alarms`. No alarm sliders, CONSERVE controls, Schedule Later controls, or browser-permission controls were added.

## Scoreboard invariants

The compact canonical provider cards, 78px utility bay, Send to Phone tile/frame, Copy Context, Refresh, mobile behavior, pairing behavior, and `.legacy-squadron-expanded` fallback remain intact. Alarm evaluation consumes HealthAuthority and does not alter `aiScoreboardIsMobile()` or any pairing/auth path.

## Tests and results

Final focused acceptance/regression run:

- 74 tests, 74 passed, 0 failed.
- Covered AlarmEngine/store/preferences, daemon delivery, startup missed-boundary handoff, VS Code adapter, webview toast, full AI Usage Scoreboard suite, and HealthAuthority daemon integration.

Broader targeted run (AI health, Claude/Codex readers/activity, Settings hierarchy, pairing modal, Scoreboard, and alarm suites):

- 186 tests, 186 passed, 0 failed with serial test execution.
- One earlier concurrent run exposed an existing one-millisecond `Retry-After` timing flake (`899999` vs `900000`); its isolated rerun passed, and the serial broader run passed cleanly.

Acceptance coverage:

- AT-1 threshold entry: pass.
- AT-2 no-spam within LOW: pass.
- AT-3 critical escalation: pass.
- AT-4 reset without telemetry: pass.
- AT-5 sleep/wake/missed-boundary reconciliation: pass.
- AT-6 restart persistence without LOW replay: pass.
- AT-7 late same-cycle telemetry dedupe, including reset jitter: pass.
- AT-8 stale evidence becomes UNKNOWN on the periodic tick without new telemetry: pass.
- AT-9 daemon-to-Stadium-to-VS Code delivery and severity mapping: pass.
- AT-10 SSE-to-real-page temporary toast and event-ID dedupe: pass.

## Compile and static checks

- `npm run compile --silent`: pass.
- `npm run check --silent`: pass.
- `git diff --check`: pass (only repository line-ending conversion notices were printed; no whitespace errors).
- No commit and no push were performed.

## Quota-free field proof

No production trigger was exposed. The safest bounded proof is the deterministic fixture suite:

```powershell
npm run compile --silent
node --test test/ai-usage-alarm-engine.test.mjs test/ai-usage-alarm-delivery.test.mjs
```

The LOW proof feeds synthetic canonical snapshots from 22% to 19%. The reset proof advances an injected clock across a synthetic `T+5s` horizon with no new telemetry. Neither test contacts Claude/Codex nor mutates real provider usage.

For a real Extension Development Host visual smoke test without provider quota, run the same delivery tests first; no unsafe production-only injection path has been left behind. The remaining manual visual risk is limited to native VS Code notification appearance in the installed theme/host—the bridge, severity selection, message, and web toast are deterministic-test covered.

## Future breadcrumbs preserved

The single `AiAlarmEvent` output is the future seam for:

- browser Notification permission/delivery adapter
- CONSERVE routing consumption
- Schedule Later release on reset
- Copy Context alarm consumer
- authenticated remote mobile alarms

None is implemented in Stage 1A.

## Remaining risks

- Clock-boundary delivery is intentionally bounded rather than exact-to-the-millisecond; after suspend or ordinary runtime it may appear up to approximately 60 seconds after the boundary.
- Native VS Code notification chrome was not manually inspected in an Extension Development Host, although the real socket bridge and pure adapter behavior are covered.
- The transient startup handoff is intentionally memory-only and bounded; it is not a durable notification inbox.

**STAGE 1A VERDICT: GREEN**
