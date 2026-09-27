# Dynamic Team & Resource Scorecard — Release Breadcrumb

## Problem

The current AI Usage Scorecard visually assumes a fixed two-provider Team:

`Claude | Codex`

That is Dad's current roster, not a production invariant.

Release users may have:

- Claude only
- Codex only
- AntiGravity only
- multiple supported Players
- future supported ecosystems
- no provider with measurable resource telemetry

## Release Rule

The Scorecard and alarm presentation must render dynamically from the customer's actual supported resource pools.

Examples:

- Claude + Codex → 50 / 50
- Claude only → Claude spans full width
- Codex only → Codex spans full width
- 3 supported pools → adaptive 3-way layout
- unsupported or unmeasurable resource pool → UNKNOWN, never fabricated percentages
- zero measurable pools → compact empty/unavailable state rather than hard-coded empty Claude/Codex cards

## Architecture Invariant

**UI renders discovered resource pools. It never assumes specific providers exist.**

Alerts, reset windows, percentages and scarcity states belong to a `ResourcePool`, not to hard-coded Claude/Codex UI components.

## Dependencies

- A1–A3 open resource identity
- R4 eligible roster/candidate extraction
- R7 dynamic Dev panels
- T1 Team View

## Release Follow-Up

Before public release, verify the Scorecard and alarm UI against at least:

1. Claude + Codex
2. Claude only
3. Codex only
4. AntiGravity only
5. no measurable resource pools
6. 3+ resource pools

Do not block R1 for this UI work.