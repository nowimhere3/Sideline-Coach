**COMPLETED:** 2026-09-24 MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 5P · Zero-Setup Product Bootstrap

# VERDICT: `GREEN FOR 5C`

Stage 5P is complete. Normal Sideline Coach extension launch now gives the daemon authoritative production relay defaults without Dad configuring environment variables, while the reusable private-beta enrollment credential remains outside source and the VSIX in a restricted machine-local Sideline store.

No Stage 5C work, UI work, deployment, commit, or push was performed. Prior Stage packets and reports were not reread.

## Files changed

- NEW `src/control-plane/remote-bootstrap.ts` — public production relay defaults and the restricted machine-local enrollment loader.
- MOD `src/control-plane/daemon.ts` — resolves complete explicit environment overrides first; otherwise uses product defaults plus the machine-local enrollment credential.
- MOD `tools/dev/audit-vsix.mjs` — requires the compiled bootstrap module and rejects any packaged `beta-enrollment.json` credential asset.
- NEW `test/remote-access-v1-stage5p-bootstrap.test.mjs` — seven bounded 5P tests.
- NEW `REPORTS/Codex/Remote-Access-v1-Stage-5P-Zero-Setup-Product-Bootstrap__20260924__Codex.md` — this report.

`src/extension.ts`, `src/public/index.html`, and `src/public/pair.html` were not changed in Stage 5P. The existing extension launcher seam already starts the detached daemon correctly, so no extension modification was necessary.

## Production-default configuration

With `SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, and `SIDELINE_ENROLLMENT_KEY` absent, the daemon entrypoint resolves:

- Relay tunnel: `wss://relay.remote.mysidelinecoach.com/tunnel/v1`
- Relay domain: `remote.mysidelinecoach.com`

These are public product configuration constants. They contain no credential.

The defaults configure where Remote Access will connect; they do not activate it. Fresh preferences remain `remoteAccess.enabled === false`.

## Environment override behavior

A complete explicit environment configuration remains the highest-priority development, test, and operator-diagnostics override. It must continue to provide all three existing values: relay URL, relay domain, and enrollment key. The existing URL/domain validation and secret-length validation remain intact.

Partial or invalid explicit overrides still fail closed. The daemon reports only symbolic variable names, never their values, and does not silently mix a partial environment override with the product credential store.

When no explicit override is present, product defaults are selected automatically.

## Enrollment credential provisioning mechanism

The previous implementation had only the `SIDELINE_ENROLLMENT_KEY` runtime input and no machine-local provisioned store. Stage 5P adds the authorized bounded V1 store at:

`<Sideline user-data directory>\remote\beta-enrollment.json`

For the normal product location this is:

`%USERPROFILE%\.sideline\remote\beta-enrollment.json`

The record is a version-1 JSON object containing the enrollment-key field. No credential value is included in source, tests as a fixed literal, this report, or any packaged asset.

Provisioning contract:

- A trusted private-beta provisioner/installer places the record once outside the extension package.
- Dad does not enter, paste, view, or configure the credential during normal use.
- The daemon reads it automatically at startup whenever no explicit development override is present.
- The `remote` directory is restricted to mode `0700` and the credential file to `0600` where the platform exposes POSIX modes; calls are best effort on Windows and the location remains inside the current user's Sideline data area.
- Symbolic links, non-regular files, oversized files, incorrect versions, malformed JSON, and invalid credential formats are rejected.
- The accepted credential is bounded to 16–512 printable ASCII characters so it cannot inject headers or logs.
- There is no browser API, preferences field, Settings surface, frontend reader, or daemon HTTP writer for the credential.
- Missing or invalid provisioning never falls back to a packaged credential. Public defaults still resolve, but the private-beta relay cannot enroll the host until the trusted machine provisioning is corrected.

This is the smallest safe V1 provisioning option and does not require a new architecture decision: the execution card explicitly permits a restricted machine-local Sideline credential location outside the VSIX.

## Normal extension → daemon startup path

The existing production path is preserved:

1. VS Code activates `src/extension.ts` normally.
2. The extension calls `ensureControlPlaneRunning()` with its packaged daemon entrypoint.
3. The launcher starts the detached daemon with the normal Sideline data directory; it does not require or synthesize Remote Access secrets.
4. The daemon entrypoint resolves an explicit complete development override if present. Otherwise it selects the built-in product URL/domain and loads the machine-local enrollment credential.
5. The daemon remains Remote Access OFF on a fresh profile.
6. Once a later user action enables Remote Access, the existing `syncRelayClient()` passes the resolved URL, domain, and optional machine credential into `RelayClient`.

RA5P-3 exercised this real launcher-to-detached-daemon path with all Remote Access environment variables absent. The daemon started, served health/preferences, remained OFF, and shut down through its owner-verified control-plane route.

## Explicit V1 reboot/autostart boundary

Stage 5 V1 guarantees zero-setup Remote Access once Sideline Coach has been launched normally. OS-login/reboot autostart without opening Sideline Coach is post-V1 unless already supported.

This slice preserves the distinction:

- Daemon startup: normal VS Code/Sideline Coach extension launch.
- Daemon liveness after launch: `remoteAccess.enabled === true` remains the authoritative lease, independent of Stadium sessions, phone traffic, or relay reachability.

No Windows service, Task Scheduler entry, startup-folder mechanism, or installer redesign was added.

## Security verification

- No shared beta enrollment credential is embedded in TypeScript, compiled JavaScript, `package.json`, public HTML, extension resources, preferences, logs, API responses, tests as a fixed value, reports, or the VSIX.
- Test credentials are generated randomly at runtime and live only in temporary user-data directories.
- The machine credential resolves into the existing daemon-to-RelayClient internal configuration seam and is never projected into status or discovery records.
- API `/api/preferences` and `/api/status` responses were checked for absence of the runtime credential.
- Normal daemon logs, both frontend assets, package inputs, and serialized preferences were checked for absence of the runtime credential.
- The package manifest does not include the machine credential filename.
- The VSIX central directory contains no `beta-enrollment.json` entry, and the archive does not contain the runtime-generated machine-only sentinel.
- The packaging audit now fails if any `beta-enrollment.json` appears anywhere in the archive.
- Environment parsing errors and machine-store errors expose symbolic names only.
- Remote Access remains default OFF and no connection is attempted merely because product defaults exist.
- Existing relay authentication and wire protocol are unchanged.

## Tests and exact counts

Final verification:

- `npm run compile`: PASS; root and relay TypeScript projects completed with 0 errors.
- Stage 5P suite: 7 total, 7 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
- Stage 4E liveness suite: 6 total, 6 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
- Focused Stage 4C bootstrap/RelayClient suite: 3 total, 3 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
- Aggregate test gate: 16 total, 16 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
- `npm run package`: PASS. Its prepublish compile also passed.
- VSIX output: `sideline-coach-0.1.0.vsix`, 438 archive entries, 1.08 MB.
- `tools/dev/audit-vsix.mjs`: PASS; required runtime assets were present, developer evidence was absent, unexpected runtime packages were absent, and no enrollment credential asset was packaged.

5A and 5B suites were not rerun because this slice did not change routes, pairing semantics, QR generation, or event behavior. The focused bootstrap and liveness seams were the affected regression surface.

## Deviations and notes

- One small dedicated production module was added, as expressly permitted for safe machine-local enrollment storage.
- `src/extension.ts` required no Stage 5P edit because its existing launcher already starts the packaged daemon through the correct normal product path.
- Private-beta provisioning remains an operator/installer responsibility outside the VSIX. This is deliberate: automatically shipping the reusable shared secret would expose it and was not done.
- The existing worktree was already dirty; unrelated changes were preserved and not reverted.

## Stop-line verification

- Production relay URL/domain require zero Dad setup: PASS.
- Normal Sideline launch supplies runtime configuration: PASS.
- Normal product use requires no Remote Access environment variables: PASS.
- Private-beta credential is consumed from a restricted machine-local store outside the VSIX: PASS.
- Credential absent from preferences, logs, APIs, frontend, source values, report values, and package: PASS.
- Remote Access default remains OFF: PASS.
- Stage 4E liveness behavior preserved: PASS.
- Compile, focused tests, packaging, and audit green: PASS.

# FINAL VERDICT: `GREEN FOR 5C`

Stage 5P stops here. Stage 5C was not started.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\Remote-Access-v1-Stage-5P-Zero-Setup-Product-Bootstrap__20260924__Codex.md
