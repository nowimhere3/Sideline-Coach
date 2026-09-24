# BREADCRUMB — SCOUT PLAYER LIVE FORMATION STATUS IN VISUAL TERMINAL

## Observation

A live Scout Formation proved that Scout execution is already visibly observable while running.

The development terminal currently shows structured lifecycle output such as:

* `[QUEUED] stage4-production-hosting-deployment · NVIDIA: Nemotron 3 Ultra`
* `[QUEUED] stage4-dns-tls-origins · NVIDIA: Nemotron 3 Super`
* `[RUNNING] stage4-production-security-operations · Poolside: Laguna S 2.1`
* `[RUNNING] stage4-acceptance-rollback-cost · Cohere: North Mini Code`
* `SCOUTING · 4 running · 0 complete of 4 · 0 substitutions`

Therefore the previous assumption that Scout activity should remain invisible inside the expanded Scout Player / visual-terminal experience is incorrect.

The activity already exists.

It simply needs to be wired into the visual Scout Player correctly.

---

## Desired UX

When the **Scout Player** is expanded into its visual terminal view, show ONLY lightweight live Formation status.

Example:

```text
SCOUT FORMATION

QUEUED   Production Hosting        Nemotron 3 Ultra
RUNNING  DNS / TLS / Origins       Nemotron 3 Super
RUNNING  Security / Operations     Laguna S 2.1
RUNNING  Acceptance / Cost         North Mini Code

4 running · 0 complete · 0 substitutions
```

This is NOT intended to expose the Scout's full textual output.

Do NOT stream:

* Scout report prose
* prompts
* raw stdout/stderr
* internal reasoning
* reconnaissance content while it is being generated

The visual terminal should answer only:

**Which Scouts are on the field right now, and what state are they in?**

---

## Active-State Rule

The primary Scout Player terminal view should show only active lifecycle states:

* `QUEUED`
* `RUNNING`

When a lane completes, it may disappear from the active list.

A small formation-level footer may continue to show aggregate progress, for example:

`2 running · 2 complete of 4 · 0 substitutions`

When the Formation ends, replace the active list with a compact final result such as:

`FORMATION COMPLETE · 4/4 lanes completed · 0 substitutions · 06:07`

Then allow the existing report workflow to own the actual findings.

---

## Architectural Rule

**DO NOT PARSE TERMINAL TEXT TO BUILD THIS UI.**

Scout lifecycle state already exists as structured runner truth.

The Scout Player visual terminal should subscribe/render from the same structured Scout lifecycle events used by the Scout runner, such as:

* formation start
* lane queued
* attempt start
* attempt end
* substitution
* lane complete
* formation end

The development terminal is only one renderer of those events.

The Scout Player should become another renderer.

Therefore:

**Scout Runner Events → shared lifecycle state → terminal renderer + Scout Player visual renderer**

not:

**terminal text → regex/parsing → Scout Player**

---

## Product Principle

The expanded Scout Player should feel like watching the sideline, not reading the Scout's notebook.

Dad needs:

**WHO IS PLAYING**
**WHO IS WAITING**
**WHO IS RUNNING**
**HOW MANY ARE LEFT**

Dad does not need the reconnaissance transcript while the Formation is still on the field.

---

## Future Acceptance

When a Scout Formation is launched:

1. Scout Player becomes active.
2. Expanded visual terminal immediately displays queued lanes.
3. QUEUED changes to RUNNING from structured lifecycle truth.
4. Receiver name/model is visible.
5. Substitution updates the visible Player without inventing a second lane.
6. Completed lanes leave the active list.
7. Formation progress remains visible.
8. Final Formation result appears when all lanes finish.
9. No raw Scout output or reasoning is exposed.
10. No terminal-text scraping is used.

## STATUS

BREADCRUMB ONLY.

Do not interrupt Remote Access Stage 3/4 work to implement this now.
