# Remote Access v1 · Stage 1 Security Fix — Slice 2 (Full-Payload Remote Redaction)

**Agent:** Claude Code (Sonnet 5, medium) · **Date:** 2026-09-23 · No commit, no push.

## Files changed
- `src/remote-redaction.ts`
- `test/remote-access-v1-stage1.test.mjs`

`src/player-activity.ts` was not touched by this slice (it already showed as modified in the session-start `git status`, from earlier unrelated work).

## Implementation
- Removed `const REGEX_INPUT_CAP = 8_000;`.
- `redactSecrets()` now starts from `String(text)` (no `.slice`), so every rule runs over the whole string; a secret at any offset is redacted and long reports are no longer truncated.
- Unchanged: all `REDACTION_RULES`, local-admin verbatim return, remote terminal path masking, Dev terminal override (only bypasses path masking; hard secrets always redacted first).

## Tests added (extends RA1-7)
Synthetic payload: 10,000 chars of filler + ` AKIAIOSFODNN7EXAMPLE and Authorization: Bearer abcdefghijklmnop1234567890 ` + 4,000 chars of filler, run for a remote-device principal both with default options and with `terminalActivity + allowSensitiveTerminalOutput`. Asserts:
- output length > 14,000 (not truncated);
- output still starts with the full 10 KB head and ends with the full 4 KB tail, verbatim;
- neither secret survives, including under the Dev terminal override; `[redacted]` present.

## Commands / results
`npm run compile` — clean.
`node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-7"` — the name filter again did not filter; the whole file ran: 9/9 pass (RA1-1…RA1-8 incl. RA1-5b and extended RA1-7).

## Deviations
None from the Field Packet. (Test detail: a space separates the filler from the AKIA key so the `\b` boundary in the rule applies; first draft omitted it and failed for that reason, not a code defect.)

## Verdict
**Slice 2 is GREEN.** Adjacent regression suite (Field Packet §D) not run in this play.
