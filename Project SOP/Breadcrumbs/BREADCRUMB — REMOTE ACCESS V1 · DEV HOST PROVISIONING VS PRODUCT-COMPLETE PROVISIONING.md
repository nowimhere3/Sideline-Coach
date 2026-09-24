# BREADCRUMB — REMOTE ACCESS V1 · DEV HOST PROVISIONING VS PRODUCT-COMPLETE PROVISIONING

**DATE:** 2026-09-24 MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta
**PROJECT:** Sideline Coach
**AREA:** Remote Access v1
**STATUS:** LOCKED ARCHITECTURAL / ACCEPTANCE DISTINCTION

---

# CONTEXT

Stage 5F real-world Android acceptance reached the mandatory provisioning gate.

The current Dev Host is healthy and the Remote Access implementation stack is functionally green, but the machine does NOT currently contain the required private-beta enrollment credential at:

`%USERPROFILE%\.sideline\remote\beta-enrollment.json`

The daemon correctly expects that machine-local credential.

The current product does NOT yet contain a trusted private-beta installer/provisioner that places it automatically.

Therefore:

`REMOTE ACCESS V1 FUNCTIONALLY GREEN — PRODUCTIZATION BLOCKER REMAINS`

Real Android pairing has not yet been run on this machine because the trusted enrollment prerequisite is absent.

---

# CRITICAL DISTINCTION

There are now TWO separate provisioning paths that must NEVER be conflated.

## PATH A — DEVELOPER-ONLY DEV HOST PROVISIONING

Purpose:

Allow the current development machine to be provisioned explicitly so real Android / public cellular acceptance can continue.

This is permitted ONLY as:

* a developer/operator action;
* on the current Dev Host;
* for testing and field acceptance;
* with explicit acknowledgement that it is NOT the production installation experience.

This path may allow the current machine to receive the existing private-beta enrollment credential through an approved secure source.

It MUST NOT:

* print the credential;
* expose it to Dad-facing UI;
* store it in source;
* package it in the VSIX;
* place it in preferences;
* place it in frontend assets;
* log the credential;
* redefine this process as “zero setup.”

If safely provisioned, Stage 5F may continue with real Android testing.

---

# DEV HOST FIELD-TEST VERDICT RULE

After developer-only provisioning, successful field testing may legitimately establish:

`REAL-WORLD REMOTE ACCESS = GREEN`

if:

* QR pairing works;
* real Android authentication works;
* public transport works;
* Wi-Fi/cellular recovery works;
* browser return/persistence works.

However:

developer-only provisioning does NOT satisfy:

`FRESH-INSTALL ZERO-SETUP = GREEN`

and does NOT permit:

`REMOTE ACCESS V1 PRODUCT-COMPLETE — GREEN`

---

# PATH B — PRODUCT-COMPLETE PRIVATE-BETA PROVISIONING

A separate bounded productization slice is still required.

Working name:

`5P2 — Trusted Private-Beta Provisioner`

Its job is to answer:

> How does a fresh/private-beta Sideline installation receive the required enrollment credential securely and automatically, without Dad touching infrastructure or secrets?

This must be solved independently of the Dev Host testing shortcut.

---

# PRODUCT-COMPLETE REQUIREMENT

A fresh/private-beta installation must eventually support:

`Install / Receive Sideline Coach`
→ `Launch Sideline Coach normally`
→ `Send to Phone`
→ `Scan`
→ `Connected`

without Dad ever needing to:

* create `beta-enrollment.json`;
* receive or paste the shared enrollment secret;
* set `SIDELINE_ENROLLMENT_KEY`;
* set relay environment variables;
* run PowerShell provisioning;
* edit JSON;
* configure Fly.io;
* configure DNS;
* configure WSS;
* understand enrollment infrastructure.

---

# SECURITY INVARIANT

The reusable private-beta enrollment credential MUST NOT be embedded in:

* VSIX;
* source code;
* compiled JavaScript;
* extension assets;
* public installer payloads where it can simply be extracted;
* frontend HTML;
* Settings;
* preferences;
* API responses;
* reports;
* logs.

A reusable shared credential shipped with the downloadable product is effectively public.

Therefore:

**DO NOT SOLVE PRODUCT ZERO-SETUP BY HIDING THE SHARED SECRET INSIDE THE PACKAGE.**

---

# LIKELY FUTURE DIRECTION

The final architecture for private-beta provisioning is NOT yet decided.

A likely safe direction worth evaluating is:

1. installer/private-beta distribution receives a one-time or short-lived provisioning claim;
2. installation exchanges that claim with a trusted server over HTTPS;
3. server authorizes the installation;
4. machine receives the required enrollment material;
5. credential is written to Sideline's machine-local protected user-data location;
6. Dad never sees or handles the credential;
7. reusable shared secret does not live inside the downloadable VSIX/package.

This is a CANDIDATE architecture only.

Do not treat it as final until 5P2 explicitly adjudicates the distribution/provisioning model.

---

# CURRENT DEV HOST AUTHORIZATION

The current Dev Host MAY be provisioned manually/operationally for the narrow purpose of continuing Stage 5F field testing IF:

* the credential is obtained from an existing approved secure source;
* its value is never printed or echoed;
* the operation writes only to the approved machine-local Sideline credential location;
* no source/package mutation occurs;
* the action is explicitly recorded as:
  `DEVELOPER-ONLY TEST PROVISIONING`

If no approved secure source for the credential currently exists:

STOP.

Do not invent, guess, recover from logs, scrape old reports, or expose secrets.

A new credential may need to be safely rotated/provisioned through the existing relay administration path before testing continues.

---

# STAGE 5F ACCEPTANCE SPLIT

Stage 5F must now maintain TWO independent verdicts.

## A. REAL-WORLD REMOTE ACCESS

Can become:

`GREEN`

after the current Dev Host is safely developer-provisioned and real Android/public-network smoke tests pass.

## B. FRESH-INSTALL ZERO-SETUP

Remains:

`BLOCKED`

until 5P2 implements and proves a trusted private-beta provisioning/distribution mechanism.

---

# PRODUCT-COMPLETE RULE

Final product acceptance requires BOTH:

`REAL-WORLD REMOTE ACCESS = GREEN`

AND

`FRESH-INSTALL ZERO-SETUP = GREEN`

Only then may the project declare:

`REMOTE ACCESS V1 PRODUCT-COMPLETE — GREEN`

---

# DO NOT REPURCHASE CONTEXT

Future Players do NOT need to reread the full Stage 5F blocked report to understand this issue.

Carry forward this compact rule:

> Developer-only provisioning may be used to unblock real-phone field testing on the current Dev Host, but it does not count as product zero-setup. Product-complete Remote Access still requires a separate trusted private-beta provisioner that installs enrollment material automatically without shipping the reusable secret in the product or requiring Dad to handle it.

---

# NEXT VALID PLAY

Immediate next play:

`Developer-only Dev Host provisioning + resume bounded Stage 5F real Android smoke test`

Separate later play:

`5P2 — Trusted Private-Beta Provisioner`

Do NOT merge these two plays.

---

# LOCKED INVARIANT

**TESTING SHORTCUT ≠ PRODUCT INSTALLATION PATH**

and

**REAL-WORLD GREEN ≠ PRODUCT-COMPLETE GREEN**

until trusted fresh-install provisioning is proven.

---

**DATE:** 2026-09-24 MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta
