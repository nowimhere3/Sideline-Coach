# GitHub Connection Breadcrumb

## WILL BE — Back Pocket

Sideline Coach should eventually provide a deliberately simple, account-level GitHub connection experience rather than requiring manual PAT entry or per-Game GitHub login.

Preferred first architecture to investigate: **GitHub Device Flow + Octokit**.

Dad-facing target experience:

`GitHub · Not connected` → **Connect GitHub** → GitHub approval → `✓ Connected as <account>`

Principles:

- Prefer GitHub Device Flow so Sideline does not need to build a bespoke callback/login page or ask the human to paste a PAT.
- Treat GitHub authentication as an account-level Sideline capability reusable across Games, not a separate login for every Game.
- Keep each Game's repository URL as a separate Game coordinate; authentication and repository identity are different concerns.
- Investigate Octokit as the first implementation library rather than hand-rolling OAuth/device-flow plumbing.
- A GitHub App may later be preferable for tighter repository-scoped permissions, but do not add that machinery until the actual permission model requires it.
- Keep Dad Mode extremely small: one Connect GitHub action, browser/device approval, then a truthful connected-account state.
- No GitHub login/auth implementation is part of the current Game-bootstrap slice unless explicitly promoted to an active Play.

This is intentionally breadcrumbed for later architecture/implementation, not approved for immediate build.
