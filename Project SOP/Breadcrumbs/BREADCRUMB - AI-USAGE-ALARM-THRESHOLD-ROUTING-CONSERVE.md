BREADCRUMB: AI-USAGE-ALARM-THRESHOLD-ROUTING-CONSERVE

WHY:
AI Usage telemetry from HealthAuthority must graduate from passive observation into a proactive resource-awareness nervous system. Sideline Coach needs to warn Dad when quotas run low, alert when reset horizons are reached, conserve scarce providers during AUTO routing, and schedule blocked Plays to run after resets.

TARGET PRODUCT BEHAVIOR:

1. Canonical Pipeline:
   Canonical Telemetry (HealthAuthority) or Clock Horizon (now >= resetsAt)
   → Rule Evaluation (AlarmEngine)
   → State Transition (NORMAL, LOW, CRITICAL, UNKNOWN)
   → Domain Event (AiUsageAlarmEvent)
   → Multi-Consumer Dispatch (VS Code notifications, Webview toast, CONSERVE routing, PlayQueue Schedule Later).

2. Two Decoupled Trigger Classes:
   - Class A (Telemetry-Driven): Triggered reactively by HealthAuthority.ingest*. Evaluates remaining % against Dad's thresholds. Transitions NORMAL -> LOW -> CRITICAL. Deduplicated (fires once per state change).
   - Class B (Clock-Driven Reset Horizon): Triggered by an absolute timestamp boundary (now >= resetsAt) evaluated by a daemon-level Clock Horizon Watcher. Does NOT wait for provider telemetry to arrive. Fires immediately when reset passes (resilient across computer sleep and daemon restart).

3. Settings Information Architecture:
   - Settings card "Routing" is renamed "Routing & Alarms".
   - Telemetry remains observational in the Scoreboard.
   - Behavioral / prescriptive policies (Thresholds, Reset Alarms, Notification Channels, CONSERVE, AUTO Routing, Schedule Later) live in "Routing & Alarms".

4. CONSERVE Integration:
   - CONSERVE is routing policy, not raw health telemetry.
   - AlarmEngine derives ProviderResourcePolicy (isConserveActive, activeResetsAt).
   - computeAutoRoute() reads canonical policy to deprioritize conserved providers and explain rationale to Dad. Zero Scoreboard scraping.

5. Schedule Later Integration:
   - "Wait until Claude resets, then run this Play."
   - Leverages durable PlayQueue with deferredUntilReset token in queue.json.
   - Activated automatically when Clock Horizon Engine emits alarm:reset_boundary_reached.

6. Phase 1 Slice:
   - AlarmEngine (telemetry evaluation + 60s clamped clock horizon loop)
   - AlarmStateStore (atomic alarm-state.json for transition memory and cycle dedupe)
   - VS Code notification channel (vscode.window.showWarningMessage / showInformationMessage)
   - Webview in-app toast channel via SSE ai-alarm.

ARCHITECTURAL INVARIANTS:
1. No rendered-Scoreboard scraping.
2. No duplicate canonical telemetry store.
3. No duplicate countdown timers merely for alarms (use absolute resetsAt).
4. No notification-specific business logic inside HealthAuthority.
5. Absolute resetsAt timestamps remain authoritative for reset horizons.
6. Unknown/stale telemetry must never be silently treated as healthy.
7. One transition produces one logical event, not repeated notification spam.

RECONCILIATION REFERENCE:
REPORTS/AntiGravity/AI-Usage-Alarm-Threshold-Routing-Conserve-Architecture-Reconciliation__20260925__AntiGravity.md
