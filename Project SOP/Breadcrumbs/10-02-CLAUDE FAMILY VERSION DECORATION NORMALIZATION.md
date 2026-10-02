# BREADCRUMB — CLAUDE FAMILY VERSION DECORATION NORMALIZATION

## STATUS

Parked for **S57.57 AUTO Routing Truth Recognition — Slice 5**.

This was discovered through live field use of the Play Dispatcher.

---

# FIELD OBSERVATION

The Play began with:

`CLAUDE SONNET 5.5 — MEDIUM`

Sideline recognized the explicit Claude routing intent but stopped with:

> Unrecognized model `sonnet 5.5` requested for Claude.

The current Claude MANUAL model catalogue exposes the model as:

`Sonnet`

rather than:

`Sonnet 5.5`

Changing the instruction to simply:

`Sonnet`

allowed routing to proceed.

---

# PRODUCT INTENT

Human operators may naturally include a version number when naming a Claude model family, even when the Claude Player itself exposes only the current family name.

Examples:

`CLAUDE SONNET 5.5 — MEDIUM`

`CLAUDE SONNET 6.0 MEDIUM`

`SONNET 5.5 MEDIUM`

These should not become permanently invalid merely because Claude's live catalogue exposes the current model as:

`Sonnet`

instead of a versioned model ID.

---

# DESIRED RULE

For the **Claude Player**:

> If the Coach names a live Claude model/family plus version decoration, and Claude's current live catalogue exposes a unique matching family without that version decoration, the version decoration may be ignored and the live catalogue family should resolve.

Example:

```text
CLAUDE SONNET 5.5 — MEDIUM
```

Live Claude catalogue:

```text
Sonnet
```

Expected:

```text
Claude · Sonnet · Medium
```

---

# IMPORTANT: DO NOT HARDCODE 5.5

Do NOT implement:

`5.5 = Sonnet`

Do NOT create permanent version aliases for today's Claude versions.

This must remain future-proof.

Capability truth remains the live catalogue.

The rule is about **version decoration**, not about teaching Sideline specific historical Claude versions.

---

# LIVE-CATALOGUE SAFETY RULE

Version decoration may be ignored only when the live catalogue makes the intended family uniquely resolvable.

If Claude later exposes multiple distinct live Sonnet variants or versions simultaneously, Sideline must NOT blindly strip the version and guess.

In that case:

- use the live catalogue to resolve the specific version where possible;
- otherwise surface ambiguity / unavailable truthfully.

Unknown is preferable to an invented route.

---

# PROVIDER / PLAYER SCOPE

Do NOT globally strip Claude-looking version numbers across every Player.

The same text can mean different things under different Players.

Example:

## Claude Player

If Claude exposes only:

`Sonnet`

then:

`Sonnet 5.5`

may normalize to:

`Sonnet`

when uniquely resolvable.

## AntiGravity Player

If AntiGravity's live catalogue exposes a distinct model such as:

`Claude Sonnet 5.5`

then that exact versioned identity may be meaningful and should resolve according to AntiGravity's own live catalogue.

Therefore:

> Version-decoration normalization is scoped by the selected / inferred Player and its live catalogue.

---

# ARCHITECTURE LAW

Preserve the S57.57 principle:

> Lexical normalization may understand human decoration. Capability truth comes from the live catalogue.

No static model/version table should become authoritative.

---

# SLICE PLACEMENT

Best fit:

**Slice 5 — spoken versions + typo / human-input normalization**

Do NOT interrupt Slice 3 or Slice 4 for this.

This should be handled alongside other human-input normalization such as:

- spoken version forms;
- punctuation variants;
- human-written version decoration;
- bounded typo tolerance.

---

# PERMANENT FIELD FIXTURES TO ADD

## Fixture A

Input:

`CLAUDE SONNET 5.5 — MEDIUM`

Live Claude catalogue:

`Sonnet`

Expected:

`Claude · Sonnet · Medium`

---

## Fixture B

Input:

`SONNET 5.5 MEDIUM`

Structured:

`AGENT: Claude`

Live Claude catalogue:

`Sonnet`

Expected:

`Claude · Sonnet · Medium`

---

## Fixture C — FUTURE VERSION DECORATION

Input:

`CLAUDE SONNET 7.2 MEDIUM`

Live Claude catalogue:

`Sonnet`

Expected:

`Claude · Sonnet · Medium`

The purpose is to prove the implementation is not hardcoded specifically to `5.5`.

---

## Fixture D — DO NOT STRIP WHEN VERSION IS MEANINGFUL

Provide a catalogue containing multiple live Sonnet variants / version-distinct candidates.

A versioned request must resolve through catalogue truth or become ambiguous/unavailable.

It must NOT silently collapse to an arbitrary generic Sonnet.

---

## Fixture E — PLAYER-SCOPED DISTINCTION

Claude catalogue:

`Sonnet`

AntiGravity catalogue:

versioned Claude model entry

Prove the same human version decoration is resolved according to the target Player's own live catalogue rather than through one global normalization rule.

---

# ACCEPTANCE

This breadcrumb is closed when:

- Claude family version decoration can normalize safely;
- `5.5` is not hardcoded;
- future version decoration behaves generically;
- live catalogue remains authoritative;
- multiple live version candidates do not get silently collapsed;
- AntiGravity retains its own catalogue semantics;
- ambiguity remains truthful;
- existing exact model/version resolution is not weakened.

---

# ORIGIN

Field-discovered during AUTO Routing Truth implementation after Slice 2.

Observed Play opening:

`CLAUDE SONNET 5.5 — MEDIUM`

Observed failure:

Sideline treated `sonnet 5.5` as a literal Claude model identity even though MANUAL Claude exposed the current model simply as `Sonnet`.

This breadcrumb preserves that field evidence for Slice 5 implementation.