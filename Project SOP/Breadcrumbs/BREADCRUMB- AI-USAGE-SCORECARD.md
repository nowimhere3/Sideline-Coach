BREADCRUMB: AI-USAGE-SCORECARD-PERSISTENT-SIDELINE-SURFACE

WHY:
AI Usage - Real Time is not an isolated product surface. Its provider-neutral health, capacity, quota, reset, freshness, confidence, and routing-relevant telemetry is intended to matriculate into Sideline Coach and remain available anywhere the Sideline Coach extension is running.

TARGET PRODUCT BEHAVIOR:

1. Sideline Coach exposes a persistent AI Usage / AI Health Scorecard near the bottom of the main interface.

2. The collapsed/default surface shows a small set of high-value statistics at a glance.

3. Clicking/tapping the Scorecard expands or pops open a richer AI health/usage view.

4. The detailed view can expose configurable statistics such as:

   * current health
   * available capacity
   * quota remaining
   * quota/reset windows
   * rate-limit state
   * freshness
   * confidence
   * provider/model availability
   * other routing-relevant telemetry

5. Settings contains an AI Usage Scorecard section where Dad can choose:

   * which statistics appear in the compact surface
   * which statistics appear in the expanded surface
   * which Players/models/providers are considered A-Team
   * which Players/models/providers are eligible as B-Team / backup depth

6. Scout intelligence should participate in the same health/capacity substrate rather than becoming a disconnected parallel system.

7. The Team / routing system may eventually use this data to understand:

   * who is healthy
   * who has capacity
   * who is nearing quota exhaustion
   * who resets soon
   * who belongs on A-Team
   * who is eligible as B-Team
   * when Scout or another substitute should enter the depth chart

ARCHITECTURAL INVARIANT:

AI Health / Usage is shared routing infrastructure.

The underlying telemetry must remain provider-neutral and reusable across Games and extension instances.

Presentation may vary by Game or user preference, but health/capacity truth should not be re-invented independently by each extension surface.

IMPLEMENTATION PRINCIPLE:

AI Usage - Real Time develops and proves the substrate.

Sideline Coach consumes that substrate as a persistent native surface.

Do not build two independent health systems.

FUTURE CODE-LOCAL BREADCRUMBS:

When implementation begins, place code-local breadcrumbs beside:

* Sideline bottom/status surface
* AI Usage Scorecard expansion/popover
* CoachPreferences / Settings configuration
* routing health/capacity ingestion
* Team depth-chart / A-Team / B-Team eligibility logic

REMOVE / GRADUATE:
Graduate this breadcrumb once the provider-neutral AI Health substrate is consumed by Sideline Coach and the persistent Scorecard surface plus configuration seam are field-proven.
