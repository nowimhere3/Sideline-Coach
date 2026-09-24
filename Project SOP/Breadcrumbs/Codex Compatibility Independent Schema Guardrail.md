### Codex Compatibility Independent Schema Guardrail

**WAS:**  
Controlled Codex originally used an exact provider-version gate. A routine Codex upgrade could bench the Player solely because the version string changed, even when the underlying app-server contract remained compatible.

S54.9 replaced that brittle model with adaptive compatibility verification:

- version is evidence, not authority
- unknown/new Codex versions are evaluated against the actual protocol contract Sideline requires
- `codex app-server generate-json-schema` is run through the same resolved Codex launch
- the generated schema is checked against `REQUIRED_CONTRACT`
- compatible versions may proceed
- missing, contradicted, or unprovable contracts fail closed as `needs-verification`
- the first real turn on a newly proven version remains protected by the first-turn runtime tripwire

That architecture successfully prevented Sideline from depending on a permanently hardcoded Codex version.

However, S54.10 exposed a second-order testing weakness.

A rate-limit definition had been added to `REQUIRED_CONTRACT` using the incorrect name:

`RateLimitsUpdatedNotification`

while the real Codex schema used:

`AccountRateLimitsUpdatedNotification`.

This false contract requirement caused real Codex 0.156.1 to fail adaptive compatibility verification and become benched, even though the real provider contract was otherwise compatible. :contentReference[oaicite:0]{index=0}

The defect escaped automated tests because the fake Codex app-server generated its mock schema directly from `REQUIRED_CONTRACT.fields`. The fake therefore reproduced Sideline's own misspelled definition name, allowing the test and the defect to agree with each other. :contentReference[oaicite:1]{index=1}

---

**IS:**  
S54.11 repaired the immediate compatibility seam.

The production contract key was corrected from:

`RateLimitsUpdatedNotification`

to:

`AccountRateLimitsUpdatedNotification`.

The corresponding contract assertion was updated, and Codex 0.156.1 was optionally added to `SEEDED_PROVEN_VERSIONS` while deliberately remaining absent from `TURN_PROVEN_VERSIONS`. This preserves first-turn runtime verification. :contentReference[oaicite:2]{index=2}

The repaired contract was then tested against the real installed Codex 0.156.1 schema.

Results:

- real schema generation succeeded
- `checkSchemaContract()` returned `{ ok: true }`
- a forced unseeded compatibility probe succeeded
- Controlled Codex reached `ready`
- no `turn/start` was used
- zero model turns were consumed
- the first-turn runtime tripwire remained armed :contentReference[oaicite:3]{index=3}

This proves the adaptive compatibility architecture itself is functioning correctly.

Future unfamiliar Codex versions are therefore not intended to require manual allowlisting. They should enter the adaptive probe and proceed whenever the real installed provider proves the required contract.

However, one important production-hardening gap remains:

**the fake Codex schema is not an independent source of truth.**

Because parts of the fake provider schema are generated from `REQUIRED_CONTRACT` itself, a future typo or invented definition inside Sideline's contract can still be mirrored by the fake and pass tests.

This means current automated coverage strongly tests compatibility behavior, failure handling, caching, tripwires, authority, and lifecycle logic, but it cannot independently prove that every contract definition name matches a real Codex protocol schema.

---

**WHY:**  
For a personal development tool, the adaptive runtime probe provides strong protection because real unknown Codex releases are verified before dispatch.

For a production product intended for non-technical users and potentially large deployment, the release pipeline should catch Sideline-authored contract mistakes **before** they reach a user's machine.

A test derived from the same contract it is validating is circular evidence.

The system therefore needs one independent provider-contract anchor.

The principle is:

> Sideline's declared provider contract must be tested against provider-derived evidence that does not originate from Sideline's own `REQUIRED_CONTRACT`.

This prevents the test harness from validating its own typo.

---

**WILL BE:**  
Add an independent Codex schema conformance guardrail to the build/test pipeline.

The preferred bounded design is:

1. Maintain a provider-derived Codex app-server schema fixture or normalized schema snapshot captured from a known real Codex release.
2. The fixture must NOT be generated from `REQUIRED_CONTRACT`.
3. Run `checkSchemaContract()` against that independent fixture in automated tests.
4. The test must fail when:
   - a required definition name does not exist
   - a required field disappears
   - a required RPC method disappears
   - a required notification/request disappears
   - a required enum/discriminator changes
5. Keep the existing fake app-server tests for transport, lifecycle, retry, authority, routing, tripwire, and failure behavior.
6. Do not replace the live adaptive runtime probe. The independent fixture test complements it.
7. Preferably add a release/update workflow that can regenerate or compare a fresh real Codex schema when intentionally certifying provider changes.

The desired proof stack becomes:

```text
SIDELINE REQUIRED_CONTRACT
          │
          ├── independent real-schema fixture test
          │        catches Sideline-authored naming/schema mistakes
          │
          ├── fake app-server behavioral suites
          │        prove transport/lifecycle/failure behavior
          │
          └── live adaptive runtime probe
                   proves the installed Codex before dispatch