# Remote Access v1 · Stage 1 — Final Adjacent Regression Gate

**Agent:** Claude Code (Sonnet 5, medium) · **Date:** 2026-09-23 · No source changes, no commit, no push.

## Command
`npm run compile && node --test test/remote-access-v1-stage1.test.mjs test/live-player-terminal-v02-transport.test.mjs test/live-player-console-first-down.test.mjs`

## 1. Exact counts
| Metric | Result |
| :--- | :--- |
| Compile | clean |
| Tests | 51 |
| Pass | 51 |
| Fail | 0 |
| Cancelled / skipped / todo | 0 / 0 / 0 |
| Duration | ~15.3 s |

The per-file breakdown was not captured. The Field Packet expected 50 existing tests plus the new ones, so the total is one over that figure.

## 2. Result
**PASS**

## 3. Acceptance
| Item | Status | Evidence |
| :--- | :--- | :--- |
| Compile clean | ✅ | `tsc -p ./` no errors |
| Stage 1 Remote Access suite | ✅ | RA1-1…RA1-8 incl. RA1-5b |
| Live Player Terminal transport suite | ✅ | all pass |
| Live Player Console suite | ✅ | all pass |
| No route-classification regression | ✅ | RA1-3, RA1-4 |
| No local Bearer regression | ✅ | RA1-5 |
| No cookie CSRF regression | ✅ | RA1-5 |
| No remote hard-secret redaction regression | ✅ | RA1-7 (incl. >8 KB payload) |
| Dev terminal override presentation-only | ✅ | RA1-7: override restores path detail, never hard secrets |

## 4. Stage 2 gate (Field Packet §F)
1. **CSRF gate — MET.** `remote-device` mutations without `X-Sideline-Action: 1` and an `Origin` matching `principal.expectedOrigin` return 403 (RA1-5b). Local Bearer mutations are unaffected.
2. **Redaction gate — MET.** Payloads over 8 KB keep full content and every secret is redacted regardless of position (RA1-7).
3. **Compilation & suite gate — MET.** Compile clean; adjacent suites 51/51.

**Claude's original conditional Stage 2 GO is satisfied.**

## 5. Blockers
None.
