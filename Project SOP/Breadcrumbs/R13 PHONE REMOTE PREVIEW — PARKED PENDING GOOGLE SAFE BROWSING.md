# R13 PHONE REMOTE PREVIEW — CLEARED / PHONE FIELD PROVEN

**Date parked:** 2026-09-30  
**Project:** Sideline Coach  
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

---

# STATUS

**CURRENT STATUS — October 1, 2026:** Google review succeeded, the warning cleared, and Dad physically proved Remote Preview on his actual phone. S57.55A is GREEN. The Safe Browsing parking condition is resolved; the incident and historical instructions below are preserved as history.

## Historical parking status — superseded by current field truth

**R13 implementation is PARKED.**

Do NOT perform further diagnosis, redesign, rollback, remediation, or additional Remote Preview engineering until Google returns an authoritative result on the current Safe Browsing / Search Console review.

Reason:

The actual phone field test reached the production Sideline remote surface and Remote Preview worked, but Chrome presented a red **Dangerous site** warning.

Google Search Console was subsequently verified for:

`mysidelinecoach.com`

Search Console state observed on 2026-09-30:

- **Security Issues:** `Deceptive pages`
- **Manual Actions:** No issues detected
- Flagged browser host observed:
  `https://h-lz4emiu54pra6cynbrj3.remote.mysidelinecoach.com/`

## HUMAN FIELD CHRONOLOGY — PRESERVE THIS

Authoritative human field observation:

- Sideline remote access had previously been used on the phone multiple times with **zero security warning**.
- Remote Preview had also previously worked without a security warning.
- The Chrome security warning first appeared only after the phone-specific R13 Remote Preview work performed on 2026-09-30.
- Therefore the 2026-09-30 phone Remote Preview / remote-stack delta remains a legitimate causal suspect.
- Do NOT later rewrite this history merely because the warning appeared on the existing `h-` hostname.

At the same time, causation has NOT yet been proven.

Wait for Google's result before spending more engineering effort.

---

# LAST KNOWN GOOD / PRE-R13 PREVIEW BASELINE

These immediately precede the phone-specific R13 delta and are important if rollback comparison is ever required:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.42-Static-Multi-Page-Preview-Reconciliation.md`

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.43-Static-Multi-Page-Preview-Implementation.md`

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.43A-Preview-Work-Field-Proof-UX-Corrections.md`

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.43B-Preview-Tab-Preservation-And-Viewport-Fix.md`

S57.43B is the important desktop field-proven baseline immediately before the dedicated phone Remote Preview work.

---

# R13 RECONNAISSANCE

Formation:

`R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729`

Scout A — Remote Transport / Authentication:

`C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-a-remote-transport-auth-Reconnaissance.md`

Scout B — Preview / Stadium Runtime:

`C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-b-preview-stadium-runtime-Reconnaissance.md`

Scout C — Security / Browser / Relay:

`C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-c-remote-preview-security-browser-Reconnaissance.md`

---

# R13 RECONCILIATION + ARCHITECTURE

## S57.44 — AntiGravity reconciliation

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\AntiGravity\S57.44-R13-Remote-Static-Preview-Reconciliation.md`

Purpose:
Reconciled the three Scout lanes and prepared the bounded architecture problem for Opus.

## S57.45 — Opus architecture

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\S57.45-R13-Remote-Static-Preview-Architecture.md`

Purpose:
Authoritative R13 Remote Static Preview architecture.

This report owns the major security, transport, origin, grant, lifecycle, Stadium, relay and diagnostic decisions.

---

# R13 IMPLEMENTATION REPORTS

## S57.46 — S1 Binary-safe / backpressured transport

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.46-R13-S1-Binary-Safe-Backpressured-Remote-Response-Sink.md`

Status at parking: GREEN.

---

## S57.47 — S2 Device cookie migration + foreign-Origin refusal

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\S57.47-R13-S2-Device-Cookie-Migration-And-Foreign-Origin-Refusal.md`

Status at parking: GREEN.

Important production-facing delta:
migration from legacy `sl_dev` toward canonical `__Host-sl_dev`, plus app-surface Origin hardening.

---

## S57.48 — S3 Relay Preview Surface

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.48-R13-S3-Relay-Preview-Surface.md`

Status at parking: GREEN and DEPLOYED TO FLY.

Important production-facing delta:

- new `p-<hostPublicId>-<gameTag>` Preview hostname recognition
- `preview.v1` capability
- Preview surface relay framing
- Preview-specific rate limiting / queue / logging behavior

Production deployment command used:

`fly deploy --config relay/fly.toml --dockerfile relay/Dockerfile`

Fly app:

`mysidelinecoach-relay`

Deployment completed successfully on 2026-09-30.

---

## S57.49 — S4 Stadium Remote Target + Static Instance Identity

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.49-R13-S4-Stadium-Remote-Target-And-Static-Instance-Identity.md`

Status at parking: GREEN.

---

## S57.50 — S5 RemotePreviewGateway Core

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\S57.50-R13-S5-RemotePreviewGateway-Core.md`

Status at parking: implementation GREEN.

Important production-facing / security delta:

- RemotePreviewGateway
- remote Preview grant
- single-use entry ticket
- `__Host-sl_pv`
- remote Preview POST
- Preview capability advertisement
- loopback forwarding to approved StaticPreviewServer only

---

## S57.51 — Mandatory Opus Security Review

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\S57.51-R13-S5-Security-Review.md`

Verdict:

`SECURITY REVIEW: GREEN WITH REQUIRED FIXES`

Authorization boundary judged sound.

One required defect identified: MF-1 post-head abort semantics.

---

## S57.52 — MF-1 Post-Head Abort Semantics

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.52-R13-MF1-Post-Head-Abort-Semantics.md`

Status at parking: GREEN.

This satisfied the mandatory Opus security-review gate.

---

## S57.53 — S6 Phone Preview UI

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.53-R13-S6-Phone-Preview-UI.md`

Status at parking: GREEN.

Important phone-specific delta:

- remote phone Preview Work flow
- `POST /api/games/preview/remote`
- server-returned `remote.frameUrl`
- server-returned `remote.openUrl`
- Remote Preview rendered inside the existing Preview Work surface
- desktop Preview behavior preserved

This is the most directly phone-facing implementation report.

---

## S57.54 — S7 Remote Preview RM-1 Diagnostics

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\S57.54-R13-S7-Remote-Preview-RM1-Diagnostics.md`

Status at parking: GREEN.

Diagnostics only. Read-only current-truth surface.

---

# S8 FIELD PROOF — NOT CLOSED

Planned stage:

`S57.55 — R13 S8 Actual Phone Field Proof`

S8 was started manually but NOT completed as GREEN.

Actual field result:

1. Remote Sideline reached the phone.
2. Remote Preview functionality worked.
3. Chrome presented a red **Dangerous site** interstitial on:

   `https://h-lz4emiu54pra6cynbrj3.remote.mysidelinecoach.com/`

4. Google Search Console subsequently reported:

   `Security Issues → Deceptive pages`

5. Google Search Console reported:

   `Manual Actions → No issues detected`

Therefore:

**R13 functional phone proof showed working functionality, but commercial field proof is BLOCKED by Google Safe Browsing.**

Do NOT mark S8 GREEN.

---

# GOOGLE SAFE BROWSING HOLD

Search Console domain property:

`mysidelinecoach.com`

DNS ownership verification was completed through Namecheap using Google's TXT verification record.

Google public DNS (`8.8.8.8`) successfully resolved the verification TXT record.

A Google Safe Browsing / Search Console review is the current external dependency.

An automated ChatGPT watch is active to alert when Safe Browsing clears:

`mysidelinecoach.com`

or its:

`remote.mysidelinecoach.com`

surface.

---

# RESUME RULE

## IF GOOGLE CLEARS THE SECURITY ISSUE

Do NOT perform a rollback merely because this breadcrumb exists.

Resume S8 field proof first.

Test on a clean/new browser/device context if possible so a previously accepted warning does not hide the result.

If no warning appears and functionality remains correct:

→ complete S8.

---

## IF GOOGLE MAINTAINS / REJECTS THE REVIEW

Do NOT begin broad archaeology.

Start from THIS breadcrumb.

Treat the bounded 2026-09-30 R13 production-facing delta as the suspect window.

Primary evidence set:

1. S57.44
2. S57.45
3. S57.47
4. S57.48
5. S57.50
6. S57.51
7. S57.52
8. S57.53

Compare against the last-known-good S57.43B state.

Use Google's actual stated reason, if supplied, to determine the smallest rollback or remediation.

Do NOT automatically revert all R13 work unless evidence requires it.

---

# CURRENT DECISION

**PARK R13.**

Spend no additional engineering effort diagnosing the Safe Browsing issue while Google's authoritative review is pending.

Continue work on other Sideline Coach capabilities that are independent of this blocked remote-phone surface.

The Remote Preview evidence trail is preserved here so this work can be resumed without rediscovery.