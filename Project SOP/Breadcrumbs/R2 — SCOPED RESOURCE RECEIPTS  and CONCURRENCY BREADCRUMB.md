# R2 — SCOPED RESOURCE RECEIPTS & CONCURRENCY BREADCRUMB

## Principle

A Play should record resource receipts only for the **ResourcePool actually consumed by the chosen seat**.

Do not snapshot every provider merely because it exists on the Team.

Examples:

- Codex Play → capture Codex resource windows
- direct Claude Play → capture Claude resource windows
- AntiGravity Play → capture AntiGravity pool only if canonical resource truth exists; otherwise UNKNOWN

## Concurrency

Burn attribution must account for concurrent work using the **same ResourcePool**.

At dispatch and completion, record enough ledger-derived metadata to determine:

- whether another Play used the same pool
- which seat/clientRef overlapped
- task class / role if useful
- overlap duration
- resulting isolation grade

Different resource pools may be recorded as lightweight operational context but do not contaminate each other's burn measurements.

## Isolation

No same-pool overlap + fresh bracketing receipts → strongest isolation.

Same-pool concurrent work → downgrade isolation and never attribute the full resource delta to one Play as exact causality.

## Privacy / Scope

Do not store:

- prompt text
- report bodies
- credentials
- unrelated provider resource snapshots

Store only the minimum metadata required to interpret resource consumption honestly.

## Invariant

**Measure the pool that was actually used. Record enough concurrency to know how trustworthy the measurement is. Never pretend shared burn belongs entirely to one Play.**