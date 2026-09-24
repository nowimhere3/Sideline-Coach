# Remote Access v1 · Stage 1 Security Fix — Slice 1 (Remote CSRF / Origin)

**Agent:** Claude Code (Sonnet 5, medium) · **Date:** 2026-09-23 · No commit, no push.

## Files changed
- `src/control-plane/request-security.ts`
- `src/control-plane/daemon.ts`
- `test/remote-access-v1-stage1.test.mjs`

## Implementation (exactly per Field Packet)
- `Principal` `remote-device` variant gains `expectedOrigin?: string`; new exported `requestOriginMatchesExpected(origin, expectedOrigin)` (false if either is missing/unparseable; compares `URL.origin`).
- `daemon.ts` CSRF block in `handleHttpRequest` now applies to `cookie` OR `remote-device` on non-GET/HEAD. Remote-device compares `req.headers.origin` to `principal.expectedOrigin` (Host is never consulted); cookie path still uses `requestOriginMatchesHost`. Both require `X-Sideline-Action: 1`. Failure → 403 fail-closed.
- Untouched: `resolvePrincipal()` (remote-device still not constructible from headers/cookies/query), Bearer exemption, GET/HEAD.

## Tests added
`RA1-5b` — helper unit asserts, plus `handleHttpRequest` driven with an injected `remote-device` principal on `POST /api/queue/work-1/cancel` (spoofed Host header):
- missing action header → 403
- foreign Origin → 403
- missing `expectedOrigin` → 403 (even with Origin == spoofed Host)
- correct header + matching Origin → not 403 (proceeds past guard)

## Commands / results
`npm run compile` — clean.
`node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-5"` — 9/9 pass (RA1-1…RA1-8 incl. RA1-5 and RA1-5b; the pattern did not filter under this Node version, so the whole file ran).

## Deviations
None from the Field Packet. Test drives the private `handleHttpRequest` directly from JS with a `Readable`-based request stub (needed so the body reader doesn't hang).

## Verdict
**Slice 1 is GREEN for continuation to Slice 2.**
