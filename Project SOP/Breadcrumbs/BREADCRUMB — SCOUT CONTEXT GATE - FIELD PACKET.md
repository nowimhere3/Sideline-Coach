# BREADCRUMB — SCOUT CONTEXT GATE / FIELD PACKET

## Product Problem

Sideline may already have paid Scouts to inspect a Game, source seams, reports, or architecture.

A later premium Player must not automatically repurchase that same reconnaissance by broadly rereading the repository.

Scout Intelligence only creates value if Sideline actively routes it into subsequent Plays.

## Product Invariant

**KNOWN CONTEXT MUST NOT BE REPURCHASED.**

Before launching a Player, Sideline should determine whether relevant Scout Intelligence already exists for the requested Play.

This preflight should be deterministic wherever practical and should not itself require a premium AI call.

## Scout Coverage States

### GREEN

Existing Scout Intelligence sufficiently covers the requested Play.

Action:

* automatically build and inject a compact Field Packet;
* do not rerun Scouts;
* premium Player reads source only to verify unresolved seams or contradictions.

### YELLOW

Useful scouting exists but is stale or incomplete.

Action:

* identify the missing lane;
* offer or automatically run only the missing Scout work;
* preserve already-valid intelligence.

### RED

No adequate Scout Intelligence exists.

For expensive, architectural, security-sensitive, or high-reasoning Plays:

* recommend Scout reconnaissance before premium execution;
* human may override and launch directly.

## Field Packet

Sideline should transform existing Scout Intelligence into a compact launch packet containing only:

* current Play objective;
* decisions already made;
* verified source seams;
* exact relevant report/breadcrumb paths;
* freshness/provenance;
* unresolved questions;
* explicit DO NOT REPURCHASE boundaries.

Premium Players should receive the Field Packet instead of being instructed to broadly reread report folders or the repository.

## Resource-Aware Routing

The Scout Context Gate should consider:

* selected Player/model;
* reasoning level;
* task difficulty/type;
* current AI Usage Health;
* Scout coverage;
* freshness of existing intelligence.

Higher-cost Players should receive tighter context budgets.

Scouts may read broadly.

Architects should adjudicate existing intelligence.

Workers should receive decisions, not research history.

## Context Budget

Sideline should eventually support launch-context budgets by Player class.

Example policy:

* Scout: broad reconnaissance permitted.
* Premium Architect: compact Field Packet; narrow source verification only.
* Worker: accepted decisions + exact implementation seams only.

Broad rereading by an expensive Player should require a discovered contradiction, missing evidence, or explicit human override.

## Human Override

Dad/head coach retains final authority:

* Use Existing Scouting
* Refresh Missing Scout Lane
* Run Scouts
* Launch Player Anyway

## Future UX

Before an expensive Player launches, Sideline may surface:

`Scout Coverage: GREEN / YELLOW / RED`

and explain what existing intelligence will be injected.

Long-term goal:

**Sideline itself remembers what the team already knows and prevents expensive Players from paying to learn it again.**

## STATUS

BREADCRUMB ONLY.

Do not interrupt the current Remote Access v1 implementation/review.

# PREMIUM REPURCHASE RULE

**KNOWN CONTEXT MUST NOT BE REPURCHASED AT PREMIUM COST.**

"Repurchase" is an economic concept, not a prohibition on repeated reading.

Cheap/free Scouts MAY deliberately reacquire, independently verify, or overlap already-known context when doing so reduces the amount of reconnaissance, repository reading, orientation, or reasoning that must be performed by scarce premium Players.

The optimization target is NOT:

* fewest total reads;
* fewest total agents;
* shortest possible elapsed scouting time.

The optimization target IS:

**maximum productive premium work per scarce model window.**

Therefore:

* Scout duplication can be acceptable.
* Independent Scout verification can be valuable.
* Premium duplication is the primary waste to prevent.
* Scouts may read broadly when their output will become a compressed Field Packet.
* Anti-Gravity may reconcile multiple Scout lanes into an architecture-aware handoff.
* Premium architects should receive reconciled field intelligence and verify only necessary seams.
* Premium workers should receive exact decisions, patch coordinates, hazards, tests, and stop conditions rather than being asked to rediscover the field.

Preferred flow for expensive/high-risk work:

FREE / CHEAP SCOUT FORMATION
? independent reconnaissance lanes
? ANTI-GRAVITY reconciliation where warranted
? compact FIELD PACKET
? PREMIUM ARCHITECT / WORKER
? narrow verification and execution

The same known context MAY therefore be reread cheaply if that rereading is intentionally purchasing premium-context compression.

**Scout duplication is acceptable. Premium duplication is the enemy.**

STATUS: PRODUCT BREADCRUMB.
Do not interrupt active work solely to implement this orchestration feature.
