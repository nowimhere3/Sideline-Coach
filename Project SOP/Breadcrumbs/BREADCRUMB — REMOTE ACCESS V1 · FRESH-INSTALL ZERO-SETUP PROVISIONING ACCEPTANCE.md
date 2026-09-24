# BREADCRUMB — REMOTE ACCESS V1 · FRESH-INSTALL ZERO-SETUP PROVISIONING ACCEPTANCE

**DATE:** 2026-09-24 MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta
**PROJECT:** Sideline Coach
**AREA:** Remote Access v1
**STATUS:** LOCKED PRODUCT ACCEPTANCE REQUIREMENT
**OWNER:** Stage 5F / Final Remote Access Field Acceptance

---

# PURPOSE

Stage 5P successfully removed Dad-facing Remote Access infrastructure configuration from normal product usage.

However, one important private-beta provisioning dependency intentionally remains outside the VSIX:

`%USERPROFILE%\.sideline\remote\beta-enrollment.json`

The Remote Access production relay URL and relay domain are safe public configuration and are now built into the product.

The reusable private-beta enrollment credential is NOT built into the extension, source, compiled JavaScript, preferences, frontend, logs, APIs, or VSIX.

This is correct.

The credential must never be shipped inside the VSIX merely to create the appearance of zero setup.

The remaining product requirement is therefore:

> Dad must receive the required private-beta enrollment credential through the intended installer / provisioning / distribution path without ever manually creating, copying, pasting, locating, editing, or understanding that credential.

This MUST be proven before Remote Access v1 receives final product-complete acceptance.

---

# CURRENT VERIFIED STATE

Stage 5P is GREEN.

Authoritative Stage 5P report:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\Remote-Access-v1-Stage-5P-Zero-Setup-Product-Bootstrap__20260924__Codex.md`

Stage 5P established:

## Production Relay Defaults

Normal product execution automatically resolves:

`wss://relay.remote.mysidelinecoach.com/tunnel/v1`

and:

`remote.mysidelinecoach.com`

Dad does NOT configure either value.

Environment variables remain development/test/operator overrides only.

---

# PRIVATE-BETA ENROLLMENT CREDENTIAL

The reusable private-beta enrollment credential is intentionally stored OUTSIDE the extension package.

Current machine-local location:

`%USERPROFILE%\.sideline\remote\beta-enrollment.json`

Current architecture:

1. A trusted private-beta provisioner / installer places this file once.
2. Sideline Coach reads it automatically.
3. Dad never enters or views the value.
4. Remote Access uses it internally when enrollment is required.
5. The secret is never projected into browser APIs, preferences, status responses, logs, reports, or Settings.
6. The secret is never packaged inside the VSIX.

This separation is intentional and security-critical.

---

# SECURITY INVARIANT

## NEVER SOLVE ZERO-SETUP BY SHIPPING THE SHARED SECRET

The following is prohibited:

* embedding the enrollment credential in source code;
* embedding it in compiled JavaScript;
* embedding it in the VSIX;
* embedding it in a packaged JSON/config asset;
* placing it in `package.json`;
* exposing it in preferences;
* exposing it in Settings;
* exposing it through an HTTP API;
* logging it;
* asking Dad to paste it manually.

A reusable private-beta secret packaged with the extension is no longer meaningfully secret.

Therefore:

> ZERO SETUP MUST BE ACHIEVED THROUGH SAFE PROVISIONING, NOT THROUGH SECRET EMBEDDING.

---

# DAD PRODUCT NORTH STAR

The final Dad experience must be:

`Install / receive Sideline Coach`
→ `Open Sideline Coach normally`
→ `Run Plays`
→ `Send to Phone`
→ `Scan QR`
→ `Connected`

Dad must NEVER encounter:

* enrollment keys;
* Fly.io;
* relay URLs;
* relay domains;
* DNS;
* TLS;
* WSS;
* environment variables;
* PowerShell provisioning;
* JSON credential files;
* hidden configuration instructions;
* manual secret copy/paste.

The backstage system may contain these concepts.

The Dad-facing product may not require knowledge of them.

---

# FRESH-INSTALL ACCEPTANCE REQUIREMENT

Stage 5F MUST include a fresh-install or clean-machine-equivalent acceptance scenario.

Do NOT perform final Stage 5 acceptance only on the existing development machine where:

* credentials already exist;
* previous Remote Access state exists;
* previous device pairing state exists;
* development environment variables may exist;
* relay configuration may already be present.

That would prove continuation, not product onboarding.

---

# REQUIRED STAGE 5F SCENARIO

Stage 5F must prove the following sequence:

## STEP 1 - CLEAN PRODUCT STATE

Begin from a machine/user environment where Sideline Coach has no prior Remote Access provisioning state.

At minimum, ensure there is no pre-existing:

* `beta-enrollment.json`;
* paired-device registry;
* Remote Access preference state;
* development relay environment override;
* manually installed secret.

Prefer an actual fresh/private-beta install path where practical.

---

## STEP 2 - NORMAL PRODUCT DISTRIBUTION / PROVISIONING

Use the intended private-beta distribution mechanism.

The provisioning mechanism must automatically place the enrollment credential into the approved machine-local location:

`%USERPROFILE%\.sideline\remote\beta-enrollment.json`

or its final equivalent if architecture legitimately changes before Stage 5F.

Dad must perform ZERO credential-specific actions.

Dad must NOT:

* create the file;
* browse to the directory;
* paste the secret;
* run a credential provisioning command;
* edit JSON;
* set an environment variable.

---

## STEP 3 - NORMAL SIDELINE LAUNCH

Launch Sideline Coach through the normal product path.

The extension / daemon startup must automatically resolve:

* production relay URL;
* production relay domain;
* provisioned private-beta credential.

No operator configuration.

No terminal setup.

No special Remote Access startup procedure.

---

## STEP 4 - REMOTE ACCESS REMAINS DEFAULT OFF

Fresh Sideline Coach must still preserve:

`remoteAccess.enabled === false`

Provisioning the credential MUST NOT silently enable Remote Access.

Remote Access activation remains an affirmative Dad action through:

`Send to Phone`

or the explicit local Settings control.

---

## STEP 5 - SEND TO PHONE

Dad uses the production UI:

`Send to Phone`

Sideline Coach automatically:

1. enables Remote Access;
2. activates/establishes the relay connection;
3. creates the ephemeral pairing;
4. generates the QR code;
5. displays the pairing experience.

No infrastructure configuration appears.

---

## STEP 6 - REAL PHONE ACCEPTANCE

Using a real Android phone:

1. scan the QR;
2. open the public Sideline origin;
3. complete pairing;
4. receive authenticated `sl_dev`;
5. enter Sideline Coach;
6. verify live remote operation.

The phone should require no awareness of private-beta enrollment.

---

## STEP 7 - PROVE SECRET NON-EXPOSURE

Final acceptance must verify the enrollment credential does NOT appear in:

* VSIX archive;
* frontend assets;
* preferences;
* Settings;
* `/api/status`;
* `/api/preferences`;
* pairing responses;
* SSE events;
* normal daemon logs;
* browser-visible state;
* reports containing runtime values.

Do not print the actual credential as acceptance evidence.

Use absence assertions / redacted checks.

---

# STAGE 5F PASS CONDITION

Remote Access v1 may be marked:

`PRODUCT-COMPLETE`

only if Dad can move from the intended private-beta installation/distribution path to:

`Send to Phone → Scan → Connected`

without manually touching infrastructure or enrollment configuration.

The required credential may exist backstage.

Dad may not be responsible for installing or understanding it.

---

# FAILURE CONDITION

Stage 5F is NOT fully GREEN if any of the following is required:

* Dad manually creates `beta-enrollment.json`;
* Dad receives a secret and copies/pastes it;
* Dad sets `SIDELINE_ENROLLMENT_KEY`;
* Dad configures relay URL/domain;
* Dad runs a provisioning PowerShell command;
* Dad must understand Fly.io / DNS / WSS / enrollment;
* the shared secret is embedded in the VSIX to avoid provisioning;
* testing succeeds only because the development machine was already provisioned.

If any of these occur:

`STAGE 5F ZERO-SETUP ACCEPTANCE = NO-GO`

until corrected.

---

# PRIVATE BETA VS BROAD DISTRIBUTION

This breadcrumb applies to the CURRENT private-beta architecture.

The current reusable enrollment credential is acceptable only as bounded private-beta infrastructure.

It is NOT the desired eventual public-distribution architecture.

Future broad distribution should replace the shared beta credential with a stronger per-installation / server-authorized enrollment model.

That future architecture is NOT required to unblock Stage 5C, 5D, or 5E.

Do not reopen broad-distribution identity architecture during Stage 5 unless a genuine blocker appears.

---

# WINDOWS REBOOT / AUTOSTART BOUNDARY

Separate issue:

Stage 5P established that V1 guarantees zero-setup Remote Access **after Sideline Coach has been launched normally**.

Current V1 does NOT promise that the daemon automatically starts at Windows login/reboot before Sideline Coach/VS Code is opened.

This remains a post-V1 breadcrumb unless separately promoted.

Do NOT confuse:

`credential provisioning`

with:

`OS-login daemon autostart`.

They are independent concerns.

---

# IMPLEMENTATION SEQUENCE IMPACT

This breadcrumb does NOT block current Stage 5 implementation.

Continue:

`5A GREEN`
→ `5B GREEN`
→ `5P GREEN`
→ `5C`
→ `5D`
→ `5E`
→ `5F`

5C, 5D, and 5E should proceed normally.

The requirement becomes a HARD acceptance gate at Stage 5F.

---

# DO NOT REPURCHASE CONTEXT

Future Players do NOT need to reread Stage 5P research to understand this requirement.

Carry forward only:

> The production URL/domain are built in. The private-beta enrollment secret stays outside the VSIX. Before Stage 5F can be PRODUCT-COMPLETE, prove a fresh/private-beta installation receives that secret invisibly through the intended provisioning path and Dad can go from normal install to Send to Phone without manually touching credentials, files, environment variables, or infrastructure.

---

# FINAL LOCKED INVARIANT

**DAD ZERO-SETUP MEANS ZERO SETUP FROM THE INSTALLATION EXPERIENCE, NOT MERELY ZERO SETUP AFTER A DEVELOPER HAS SECRETLY PRECONFIGURED THE MACHINE.**

Security remains intact:

**DO NOT SHIP THE SHARED PRIVATE-BETA ENROLLMENT SECRET INSIDE THE PRODUCT.**

Product experience remains intact:

**DAD NEVER TOUCHES THE ENROLLMENT SECRET.**

Stage 5F must prove BOTH.

---

**DATE:** 2026-09-24 MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta
