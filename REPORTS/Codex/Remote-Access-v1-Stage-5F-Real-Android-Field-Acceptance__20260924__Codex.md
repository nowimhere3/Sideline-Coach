# Remote Access v1 — Stage 5F Real Android Field Acceptance

**Recorded:** 2026-09-24 12:48 MDT  
**Timezone:** America/Edmonton · Calgary, Alberta  
**Agent:** Codex  
**Role:** Field Engineer / Acceptance Recorder

## Acceptance status

Stage 5F stopped at the mandatory desktop provisioning gate. No source was changed, no credential was created, and Dad was not asked to scan a QR against a known-missing prerequisite.

## Phase 5F-A — Desktop preflight

### A1 — Daemon: PASS

- Normal Sideline/VS Code launch has produced a valid Control Plane discovery record.
- The health endpoint is responsive.
- Health PID matches the discovered daemon PID (ownership evidence).
- `remoteAccess.enabled` is currently **enabled**.
- Product-facing Remote Access state is currently **reconnecting**.

No daemon token or credential was printed or recorded.

### A2 — Product configuration: PASS

Current compiled product constants resolve to:

- `wss://relay.remote.mysidelinecoach.com/tunnel/v1`
- `remote.mysidelinecoach.com`

Safe public-network preflight:

- relay DNS resolution: PASS
- relay TCP/443 reachability: PASS

### A3 — Machine-local enrollment: BLOCKED

Expected location:

`%USERPROFILE%\.sideline\remote\beta-enrollment.json`

Sanitized result:

- exists: **no**
- readable: **not applicable**
- validity: **missing**

No enrollment value was read, printed, written, or included in this report.

### A4 — Relay state: BLOCKED

- observed product state: `reconnecting`
- public DNS: reachable
- public TCP/443: reachable
- safe Control Plane log search: no matching relay/enrollment diagnostic line
- enrollment prerequisite: missing

The evidence points to the private-beta enrollment gate, not local daemon health, DNS, or basic TCP reachability. Pairing was not attempted because the current machine lacks the credential required to enroll its host tunnel.

### A5 — Development overrides: PASS

The following were checked by **name only**, without revealing any value, at Process, User, and Machine environment scope:

- `SIDELINE_RELAY_URL`
- `SIDELINE_RELAY_DOMAIN`
- `SIDELINE_ENROLLMENT_KEY`

Active overrides: **none** at all three scopes.

## Provisioning gate

### Current-machine field acceptance: BLOCKED

The current Dev Host is not already safely provisioned. Therefore the real QR, Android, public-host, cellular, sleep/wake, persistence, revocation, and fallback-code branches cannot begin yet.

Dad was explicitly instructed **not** to click/scan at this gate. Manually creating `beta-enrollment.json`, pasting the shared enrollment secret, setting an environment variable, or running an ad hoc credential command would invalidate the zero-setup acceptance and was not done.

### Fresh-install zero-setup acceptance: BLOCKED

**5F FRESH-INSTALL PROVISIONING = BLOCKED**

Bounded source inspection of the current enrollment seams found:

- the daemon consumer for the machine-local credential;
- the machine-local credential schema/path;
- RelayClient forwarding of an already-provisioned credential;
- tests for that consumer contract.

It did **not** find an intended trusted private-beta installer/provisioner that places the credential without Dad handling it.

Exact remaining productization blocker:

> A trusted private-beta installation/distribution mechanism must provision the reusable enrollment credential outside the VSIX into Sideline's machine-local user-data area, with local-user-restricted permissions, without exposing the credential to Dad, Settings, APIs, logs, frontend assets, or package contents.

This requires a bounded productization/architecture decision about the trusted distribution channel. It must not be simulated by manual file creation.

## Physical acceptance matrix

- 5F-B Real QR pairing: **NOT RUN — blocked by missing enrollment provisioning**
- 5F-C Basic remote product use: **NOT RUN**
- 5F-D Wi-Fi → cellular: **NOT RUN**
- 5F-E1 30-second airplane interruption: **NOT RUN**
- 5F-E2 60-second/watchdog-horizon interruption: **NOT RUN**
- 5F-F Healthy idle watchdog: **NOT RUN**
- 5F-G Background/foreground: **NOT RUN**
- 5F-H Close and return: **NOT RUN**
- 5F-I Device management field check: **NOT RUN**
- 5F-J Fallback code: **NOT RUN**

No physical branch failed; it was not valid to begin one with the enrollment prerequisite absent.

## Security field status

Preflight verification:

- no credential value printed or logged by this acceptance run: PASS
- no credential file manually created: PASS
- no Remote Access development override used: PASS
- no query-string secret generated or inspected: PASS
- no source/package/deployment mutation: PASS

The remaining runtime security field checks are **NOT RUN** because Android pairing did not begin.

## Dad's next physical action

**None yet. Do not scan a QR on this machine.**

The next valid acceptance attempt begins only after the intended trusted private-beta provisioner has automatically provisioned this machine and Sideline has been launched normally. At that point the first Dad action will be:

1. open the expanded AI Usage Scorecard;
2. click `Send to Phone`;
3. confirm the QR/countdown/fallback-code modal appears;
4. scan it with the normal Android camera when instructed.

## Recommended next play

Make a bounded architecture/productization decision for the trusted private-beta provisioner and distribution channel. Implement and independently verify that provisioner, then rerun Stage 5F from A1 on a genuinely provisioned current machine and separately on a clean/fresh-install machine.

No change to pairing, relay protocol, browser recovery, or device authentication is recommended from the present evidence.

## Final verdicts

### A. Real-world Remote Access

**BLOCKED / NOT RUN** — real Android and public recovery tests have not been executed because this machine is not provisioned.

### B. Fresh-install zero-setup

**BLOCKED** — no trusted private-beta installer/provisioner is present.

## Overall verdict

**REMOTE ACCESS V1 FUNCTIONALLY GREEN — PRODUCTIZATION BLOCKER REMAINS**

---

## Authorized Dev Host enrollment rotation — 2026-09-24 13:17 MDT

Coach explicitly authorized rotation of the shared private-beta enrollment credential and developer-only provisioning of this Dev Host.

### Rotation and provisioning results

- rotation authorization: **GRANTED**
- new cryptographically secure credential generated: **YES — VALUE REDACTED / NEVER OUTPUT**
- generation source: OS/runtime cryptographic RNG (`32` random bytes, base64url encoded)
- Dev Host machine-local record: **PASS**
- schema version: **1**
- existing daemon-side loader acceptance: **PASS**
- credential file regular/non-symlink target validation: **PASS**
- Sideline remote-directory boundary validation: **PASS**
- Windows directory ACL restricted to the current local user: **PASS**
- Windows credential-file ACL restricted to the current local user: **PASS**
- persistent Remote Access environment variables created: **NO**
- source, VSIX, frontend, preferences, and API responses changed: **NO**

The credential existed only in the controlled provisioning process memory and the approved machine-local destination. The same in-memory value was streamed directly to Fly over stdin using:

`flyctl secrets import --app mysidelinecoach-relay`

The secret was never placed in a command argument, temporary bridge file, terminal output, report, source file, Git content, log, or shell history.

### Production Fly relay result

- `ENROLLMENT_KEY` rotation import: **PASS**
- Fly reports `ENROLLMENT_KEY` configured: **PASS**
- Fly Machine count: **1**
- Fly Machine state: **started**
- public HTTPS `/health`: **PASS**
- public TLS validation: **PASS**
- unrelated relay deployment/source change: **NO**

**Shared private-beta enrollment credential rotated; other previously provisioned hosts, if any, require reprovisioning.**

### Dev Host daemon reload result

The existing daemon accepted its authenticated normal shutdown, and the existing Sideline Control Plane launcher restarted it on the same port. No alternate startup path was introduced.

- shutdown accepted: **PASS**
- daemon PID rotated: **PASS**
- daemon health: **PASS**
- discovery/ownership match: **PASS**
- prior port preserved: **PASS**
- `remoteAccess.enabled`: **true**
- development Remote Access overrides active: **none**
- relay URL/domain authority: **Stage 5P product defaults**
- product-state progression: **connecting → online**
- final product Remote Access state: **online**

### Credential-exposure verification

- assistant response: no raw credential
- terminal output: no raw credential
- command arguments/history: no raw credential
- Fly child output: suppressed
- source/Git/report/VSIX/frontend/preferences/API: no raw credential
- verification method: schema/status/loader/state and derived-safe booleans only

Result: **PASS — no credential exposure observed.**

### Updated provisioning status

`DEV HOST FIELD TEST PROVISIONING = GREEN`

This is explicitly **DEVELOPER-ONLY TEST PROVISIONING**. It does not establish a product installation/distribution path.

`FRESH-INSTALL ZERO-SETUP = BLOCKED`

### Next physical action

The desktop relay is enrolled and online. Dad may now:

1. click the production `Send to Phone` tile;
2. confirm the QR/countdown/fallback-code modal appears;
3. scan the QR with the normal Android camera;
4. tap the public Sideline link;
5. report the visible Android and desktop result before the cellular/browser-return smoke tests continue.

No pairing was created and no Android action was simulated by Codex during this rotation play.

This verdict preserves the completed implementation gates while explicitly withholding real-world and product-complete acceptance. `REMOTE ACCESS V1 PRODUCT-COMPLETE — GREEN` is not awarded.

---

## Dev Host provisioning continuation — 2026-09-24

### Secure credential-source gate: BLOCKED

**DEV HOST PROVISIONING BLOCKED — ENROLLMENT CREDENTIAL NOT SAFELY RECOVERABLE**

The bounded approved-source check established:

- the authenticated Fly operator CLI is available;
- the production relay has an `ENROLLMENT_KEY` secret configured;
- Fly exposes secret presence only and does not return the secret value;
- Process, User, and Machine environment scopes contain no Remote Access enrollment override;
- the approved machine-local enrollment store is still absent;
- no other approved secure operator/configuration source was identified in the deployment seams.

Prohibited recovery channels were not inspected: no logs, shell history, reports, frontend assets, VSIX contents, or source were searched for the credential value. The credential was not printed, echoed, guessed, copied, or persisted.

### Dev Host provisioning result

**NOT RUN.** `%USERPROFILE%\.sideline\remote\beta-enrollment.json` was not created or changed.

### Relay-online result

**NOT RUN.** The daemon was not restarted because no valid credential was provisioned. Its prior safe state remains `reconnecting`.

### Real Android smoke-test continuation

- Android pairing: **NOT RUN**
- basic use: **NOT RUN**
- cellular recovery: **NOT RUN**
- browser return: **NOT RUN**

Dad should not scan yet. `READY TO SCAN` is withheld.

### Smallest safe rotation/provisioning procedure requiring approval

The existing Fly secret is write-only and cannot be recovered. The safe path is an explicit private-beta enrollment-key **rotation**, with acknowledgement that every already-provisioned Dev Host using the old shared key must be reprovisioned:

1. Obtain Dad/Coach approval for the production relay enrollment-key rotation and its blast radius.
2. Use one reviewed, non-echoing operator process to generate a new cryptographically random enrollment credential.
3. Have that process atomically write only `{ "version": 1, "enrollmentKey": "…" }` to this Dev Host's machine-local Sideline store with best-effort local-user-only ACLs.
4. In the same controlled process, stream `ENROLLMENT_KEY=<new value>` over stdin to the authenticated `flyctl secrets import --app mysidelinecoach-relay` command. The value must never appear in command arguments, terminal output, shell history, source, reports, or logs.
5. Verify the Fly secret deployment succeeds without exposing the value.
6. Restart only the Sideline daemon through normal Sideline launch so it consumes the machine-local record.
7. Confirm daemon health and product-facing relay state `online`, then resume Stage 5F and issue `READY TO SCAN`.
8. Reprovision or explicitly retire any other private-beta Dev Hosts that used the previous shared credential.

This procedure is a developer/operator field-test rotation only. It does not implement 5P2 and cannot make fresh-install zero-setup green.

### Updated two-part verdict

#### A. Real-world Remote Access

**BLOCKED / NOT RUN** — Dev Host provisioning could not be completed from an approved recoverable credential source.

#### B. Fresh-install zero-setup

**BLOCKED** — the trusted distribution provisioner remains unimplemented and untested.

### Updated overall verdict

**REMOTE ACCESS V1 FUNCTIONALLY GREEN — PRODUCTIZATION BLOCKER REMAINS**
