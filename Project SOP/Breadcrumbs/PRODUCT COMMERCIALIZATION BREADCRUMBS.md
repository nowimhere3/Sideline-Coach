# SIDELINE COACH — PRODUCT COMMERCIALIZATION BREADCRUMBS

## STATUS

**PRODUCT / ARCHITECTURE BREADCRUMBS**

These are intentional future seams.

They are NOT authorization to delay launch for:

- billing infrastructure
- subscription plumbing
- licensing servers
- analytics platforms
- pricing experiments
- major refactors

Current priority remains:

# SHIP SIDELINE COACH

Target launch horizon remains approximately 1–2 weeks.

---

# BREADCRUMB 1 — SCOUT OPTIONALITY / PREMIUM CAPABILITY

## PRINCIPLE

**Scout is an optional Play in the playbook, not a different playbook.**

Sideline must have ONE Intelligent Routing architecture.

Do NOT create:

- Free routing engine
- Premium routing engine
- Scout routing engine

Instead, Routing Intelligence receives the capabilities currently available to the installation/account.

Conceptually:

```text
PLAY
  ↓
ROUTING INTELLIGENCE
  ↓
AVAILABLE CAPABILITIES
  ↓
SEND
NEXT BEST
WAIT
SCOUT FIRST
A-TEAM SCOUT
```

Unavailable capabilities simply do not enter candidate generation.

---

## KEEP THREE STATES SEPARATE

### ENTITLED

Is this account/install permitted to use the capability?

### AVAILABLE

Can the runtime actually provide the capability right now?

### RECOMMENDED

Does Sideline believe using the capability is the best economic move?

Examples:

```text
Scout entitled: YES
Scout available: YES
Scout recommended: NO
```

or:

```text
Scout entitled: NO
Scout available: irrelevant
Scout recommendation candidate: absent
```

These states must never be conflated.

---

## SCOUT TIERS MAY EVENTUALLY BE COMMERCIALIZED INDEPENDENTLY

Possible future capabilities:

- Scout
- Scout Formation
- Strong Scout
- A-Team Scout Reconciliation

Commercial packaging is NOT decided yet.

They may be:

- Free with limits
- Premium only
- Included in Founder access
- Included in higher tiers
- Metered independently

Routing must understand capabilities, NOT pricing-plan names.

---

## EXISTING INTELLIGENCE

Entitlement to launch NEW Scout work is separate from possession of EXISTING Scout intelligence.

Therefore distinguish:

```text
scoutExecutionAllowed
```

from:

```text
existingScoutIntelAvailable
```

If legitimate Scout intelligence already belongs to the Game, Routing Intelligence may still use it as mapped terrain even if another Scout cannot currently be launched.

---

## GRACEFUL DEGRADATION

With Scout capability:

```text
SEND
NEXT BEST
WAIT
SCOUT FIRST
```

Without Scout capability:

```text
SEND
NEXT BEST
WAIT
```

Everything else remains intact.

No forked routing brain.

No second algorithm.

---

# BREADCRUMB 2 — COMMERCIALIZATION / FEATURE ENTITLEMENTS

## NORTH STAR

# BUILD CAPABILITIES ONCE. PACKAGE THEM LATER.

Sideline should not know whether somebody purchased:

- Free
- Pro
- Premium
- Ultra
- Founder
- Lifetime
- Developer

through feature-specific business logic scattered throughout the codebase.

Commercial plans should eventually map onto a small capability system.

---

# THREE CORE COMMERCIAL CONCEPTS

## 1. CAPABILITY

Can the installation/account use this feature at all?

## 2. ALLOWANCE

How much use is included?

## 3. USAGE

How much of that allowance has been consumed?

Conceptually:

```text
Capability
  enabled
  allowance
  used
  remaining
  resetAt
  unlimited
```

Not every capability needs every field.

---

# CANDIDATE COMMERCIAL CAPABILITIES

Potential capability IDs include:

```text
games
mobile_remote
intelligent_routing
routing_economics
scout
scout_formation
strong_scout
a_team_scout
coach_refresh
autofill
wires
schedule_after_reset
advanced_alerts
autonomous_routing
```

This list is deliberately provisional.

A capability being listed here does NOT mean it must become paid.

---

# MOBILE / REMOTE

Mobile Remote is a first-class commercial candidate.

It is also one of Sideline Coach's major product experiences:

# SCAN QR → PHONE → GO

No Tailscale setup.

No networking ceremony.

No duplicate mobile product.

The same Remote implementation should serve every entitlement level.

Only authorization/allowance differs.

Possible future packaging could resemble:

```text
FREE
20 trial minutes

PRO
X hours / month

HIGHER TIER
Unlimited

FOUNDER / DEVELOPER
Unlimited
```

These numbers are NOT decisions.

Real usage data should inform them.

Gate Remote at narrow seams such as:

- session creation
- session authorization
- allowance renewal/check

Do NOT put subscription logic throughout Remote itself.

---

# GAMES

Game count is another natural scale boundary.

Possible future examples:

```text
FREE
1 Game

PRO
3 Games

HIGHER TIER
Unlimited Games
```

Again, numbers are placeholders.

Gate:

# CREATE NEW GAME

Do not degrade normal behavior inside an existing Game.

---

# INTELLIGENT ROUTING

Possible eventual packaging:

### Basic Routing

Available broadly.

Examples:

- manual Player selection
- basic AUTO
- reports
- normal context handoff

### Intelligent Routing

Potential premium capability.

Examples:

- Player/model/reasoning optimization
- Routing Economics
- field possession valuation
- Player Scorecards
- Routing Film
- Next Best
- Scout economics
- reset-aware recommendations
- recommendation confidence
- routing posture

If Intelligent Routing is unavailable, Sideline should gracefully use the existing basic routing path.

No separate routing implementation.

---

# RATE-LIMITED TASTE OF PREMIUM

A Free version may intentionally allow users to EXPERIENCE valuable Premium capabilities.

Examples:

```text
20 minutes Mobile
3 Scout Plays
1 Scout Formation
10 Intelligent Routing recommendations
limited Coach Refresh
limited Autofill
```

Exact limits must be determined later.

The strategic principle is:

> Let users experience the magic before asking them to pay for sustained access to it.

---

# GATE AT CHOKE POINTS

Do NOT scatter commercial conditionals throughout the codebase.

Gate capabilities at narrow entry points.

Examples:

```text
Mobile Remote
→ session start / renewal

Games
→ Game creation

Scout
→ Scout launch

Scout Formation
→ Formation launch

Intelligent Routing
→ advanced recommendation invocation

Schedule After Reset
→ Deferred Play creation

Coach Refresh
→ refresh invocation

Autofill
→ Autofill invocation

Wires
→ Wire activation
```

Once access is granted, the feature itself behaves normally.

---

# DEVELOPER / FOUNDER ACCESS

Developer builds must be capable of receiving an entitlement envelope equivalent to:

```text
ALL CAPABILITIES ENABLED
ALL ALLOWANCES UNLIMITED
```

Early Founder / Lifetime products may initially use essentially the same broad entitlement envelope.

That lets Sideline launch FIRST and commercial packaging mature afterward.

---

# LAUNCH STRATEGY

The likely safest launch strategy is:

## BUILD FULL PRODUCT FIRST

Launch a broadly unlocked:

- Founder
- Early Access
- annual
- lifetime

offering.

Collect real usage.

Observe:

- what people actually use
- what produces retention
- what creates the strongest "holy shit" moment
- what costs resources
- what users repeatedly return to
- where limits would feel natural

Then design Free / Pro / higher tiers from evidence.

Do NOT spend the launch window predicting a perfect pricing matrix.

---

# BREADCRUMB 3 — PUBLIC PRODUCT TELEMETRY / COMMERCIAL INTELLIGENCE

## TRIGGER

When Sideline Coach begins acquiring real public users, build a lightweight backend product-intelligence system.

Its purpose is to answer:

> How is Sideline actually being used?

This should eventually guide:

- pricing
- plan limits
- feature packaging
- roadmap priority
- onboarding
- retention
- Premium allowances
- infrastructure planning

---

# PRINCIPLE

# TELEMETRY TELLS US WHAT.
# USERS CAN TELL US WHY.

Do not rely primarily on user surveys asking:

> How often do you use Mobile?

> Would you pay for Scouts?

> How many Games do you need?

People are imperfect historians of their own product behavior.

Instrument actual product behavior where appropriate.

Use optional surveys/interviews later to explain motivations behind that behavior.

---

# WHAT TO MEASURE

Prefer product events and aggregate counters.

Potential examples:

## CORE PRODUCT

```text
app_started
game_created
game_opened
play_sent
play_completed
report_delivered
```

## MOBILE REMOTE

```text
remote_session_started
remote_session_ended
remote_session_duration
remote_reconnected
remote_allowance_exhausted
```

Important future metrics:

- sessions per user
- median session duration
- P75/P90 duration
- sessions per week
- repeat usage

This tells us whether:

`20 free minutes`

is generous, useless, or excessive.

---

## SCOUTS

```text
scout_started
scout_completed
scout_failed
formation_started
formation_completed
formation_lane_count
a_team_reconciliation_used
```

Potential derived metrics:

- Scouts per active user
- Scouts per Game
- Scout → Premium Play rate
- Scout Formation frequency
- repeat Scout users
- Scout ROI where Routing Film can support it

---

## INTELLIGENT ROUTING

```text
recommendation_generated
recommendation_accepted
recommendation_overridden
next_best_selected
scout_first_selected
schedule_after_reset_selected
```

Possible aggregate metrics:

- recommendation acceptance rate
- override rate
- feature repeat usage
- which routing actions users actually value

---

## COACH REFRESH / AUTOFILL / WIRES

Track invocation and repeat usage.

Examples:

```text
coach_refresh_used
autofill_used
wire_created
wire_activated
```

We do not need huge telemetry payloads.

For commercialization, simple usage counts may answer most questions.

---

# FEATURE-GATE ANALYTICS

When commercial gating eventually exists, also record aggregate events such as:

```text
feature_gate_encountered
allowance_low
allowance_exhausted
upgrade_surface_shown
upgrade_started
upgrade_completed
```

This lets us determine whether a limit is:

- naturally placed
- too aggressive
- too generous
- attached to a feature nobody values

---

# PRIVACY BOUNDARY

Product analytics should NOT require collecting customer source code, Play prompts, reports, terminal output, credentials, or proprietary project contents.

Default telemetry should favor:

- event type
- feature identifier
- timestamps
- duration
- counters
- coarse outcome state
- capability/allowance state
- anonymous/pseudonymous install/account identifier where appropriate
- Sideline version

Avoid collecting customer content merely because it is technically accessible.

---

# LOCAL VS BACKEND OWNERSHIP

Operational Game truth stays local unless a product feature explicitly requires otherwise.

The future analytics backend should receive product-usage EVENTS, not become the authority for:

- Games
- Plays
- reports
- routing truth
- Scout intelligence
- customer source code

Commercial entitlement/account state may eventually require backend authority.

Product analytics remains a separate concern.

---

# FUTURE COMMERCIAL BACKEND

A mature public Sideline product may eventually have a backend responsible for things such as:

```text
Account
Entitlements
Allowances
Usage counters
Allowance reset cycles
License / Founder status
Plan mapping
Product analytics
Aggregate metrics
Feature experiments
```

This backend should expose a simple entitlement snapshot to Sideline.

Conceptually:

```text
ACCOUNT / PLAN
      ↓
ENTITLEMENT SERVICE
      ↓
Capability + Allowance Snapshot
      ↓
SIDELINE
```

Sideline features should not need to understand billing providers.

---

# OFFLINE / FAILURE BEHAVIOR

Future entitlement architecture must define safe behavior when the commercial backend cannot be reached.

Do NOT allow a temporary network failure to make Sideline unusable.

Potential future mechanisms include:

- cached signed entitlement
- grace period
- last-known-good entitlement
- explicit offline allowance behavior

Exact policy is a future architecture decision.

---

# PRODUCT-INTELLIGENCE QUESTIONS WE SHOULD EVENTUALLY ANSWER

Once enough users exist:

### MOBILE

How long is a normal Remote session?

How often do people return to Mobile?

### GAMES

How many Games does an active user actually maintain?

### SCOUTS

How often are Scouts used?

Do Scout users retain better?

Does Scout-first appear to preserve Premium resources?

### INTELLIGENT ROUTING

Do people accept recommendations?

Which recommendation types matter?

### AUTOFILL / COACH REFRESH / WIRES

Are these daily workflow features or occasional conveniences?

### COMMERCIALIZATION

Which capabilities correlate with:

- activation
- retention
- repeated weekly use
- conversion
- upgrade
- long-term value?

Those answers should shape the eventual pricing tiers.

---

# DO NOT BUILD THIS NOW UNLESS REQUIRED FOR LAUNCH

Do not interrupt the current launch push to build:

- analytics warehouse
- customer dashboards
- experimentation platform
- subscription microservices
- large remote telemetry pipeline

For now:

1. preserve clean feature choke points;
2. keep capabilities independently identifiable;
3. optionally add inexpensive local counters/events where already touching the code;
4. launch;
5. build the backend when public usage makes it valuable.

---

# FINAL PRODUCT ARCHITECTURE PRINCIPLE

## ONE SIDELINE.

## ONE CODEBASE.

## ONE FEATURE IMPLEMENTATION.

Commercial products grant different:

- capabilities
- allowances
- usage envelopes

The product should be capable of moving features between tiers without rewiring the underlying feature.

And when public usage arrives:

# OBSERVE REAL BEHAVIOR FIRST.
# PACKAGE FROM EVIDENCE SECOND.