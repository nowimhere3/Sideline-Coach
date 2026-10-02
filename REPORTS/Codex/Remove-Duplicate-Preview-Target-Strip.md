# Remove Duplicate Preview Target Strip

RESULT: PASS

REMOVED: Persistent visible Coach Online / Preview target / Desktop dropdown strip from the normal main page.

PRESERVED: Existing Preview surface with Desktop / Tablet / Phone, page/project selector, iframe, Open in new tab and Close. Preview and Settings buttons remain in their existing positions.

FILES CHANGED:

- `src/public/index.html`
- `REPORTS/Codex/Remove-Duplicate-Preview-Target-Strip.md`

The production correction adds only a permanent hidden wrapper and explanatory comment around the duplicate strip. The existing global `[hidden] { display: none !important; }` rule suppresses it, including when status updates change its children. Connection/status and launch-state DOM fields remain internal for their existing consumers. No visible controls were relocated or added. No Preview JavaScript, routing, connection plumbing, current-Game targeting, Settings, Recruit Players or AI Usage Scoreboard code changed.

TESTS:

- Before editing: 62/62 focused Preview tests passed.
- After editing: 117/117 Preview/R13 tests passed, covering Preview Work, phone UI, wire/discovery, static Preview, gateway, relay surface, response sink, Stadium target and diagnostics.
- Additional runtime check passed for Preview button launch, existing viewer opening, current Game targeting, Desktop/Tablet/Phone sizing, explicit Open in new tab link and Close.
- Source comparison against the pre-edit working copy confirms only the three inserted markup lines differ, ignoring line endings. Existing Preview panel, Preview/Settings buttons, and all script logic are unchanged.
- `git diff --check -- src/public/index.html` passed.

GIT:

- Branch recorded before editing: `q2.8-multigame-field-debug`.
- HEAD recorded before editing: `f5948c95be76a7d581cc0afaf0fda4d4483935ad`.
- Pre-edit status recorded at `%TEMP%\sideline-remove-preview-strip\status-before.txt`; existing intentional modified/untracked work preserved.
- Post-edit status recorded at `%TEMP%\sideline-remove-preview-strip\status-after.txt`.
- Not committed. Not pushed. No staging, reset, clean, stash or discard.

Verification used automated source/VM checks; no new physical-device field run was performed.
