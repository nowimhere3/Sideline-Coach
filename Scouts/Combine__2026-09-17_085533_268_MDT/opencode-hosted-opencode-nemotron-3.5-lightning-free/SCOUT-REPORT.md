# Sideline Coach Scout Play Report

**SCOUT PLAY ID:** Combine__2026-09-17_085533_268_MDT-opencode-hosted-opencode-nemotron-3.5-lightning-free  
**CANONICAL PLAY HASH:** sha256:76cf87ae67aec141ed3ab8451964e81f0e0b1dbf501a14a897085c2292a2d787  
**TASK CLASS:** scout-combine-tryout  
**GAME ROOT:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

---

## Executive Answer

The top-level project manifest file is **`package.json`**. The declared project name is **"sideline-coach"**. One real dependency defined is **`ws` ^8.21.3**.

---

## FACTS

- **Manifest file found:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` (line 1)
- **Declared project name:** `"sideline-coach"` (line 2 of package.json)
- **Production dependency:** `"ws": "^8.21.3"` (line 143 of package.json)
- **DevDependencies:** `@types/node`, `@types/vscode`, `@types/ws`, `@vscode/vsce`, `typescript`
- **Scripts defined:** `diagnostics`, `dev:games`, `dev:verify`, `scout:play`, `scout:formation`, `scout:combine`, `scout:interchangeability`, `scout:verify`, `test`, `compile`, `watch`, `check`, `vscode:prepublish`, `package`
- **Categories:** "Other"
- **Engines:** `"vscode": "^1.95.0"`
- **Contributes:** commands (`coach.startServer`, `coach.stopServer`, `coach.copyLatestReport`, `coach.copyMobileUrl`) and configuration properties

## INFERENCES

- This is a VS Code extension project (per `engines.vscode` and `contributes.commands`).
- The `ws` dependency indicates WebSocket-based communication is used for the dispatcher server functionality.
- The `scout:*` scripts map to the scout combiné tryout system.

## UNKNOWNS

- Runtime behavior of the `ws` module (static manifest evidence cannot prove runtime execution).
- Exact resolution of version ranges (e.g., `^8.21.3` → actual installed version).

## CONTRADICTIONS

- None identified.

---

## Relevant Files / Symbols

- `package.json` — top-level project manifest
- `package-lock.json` — lockfile locking dependency versions

---

## Recommended Next Step

No action required; reconnaissance is complete. The manifest has been identified, the project name and a real dependency have been cited, and all evidence is documented.

---

**Provenance:** All data extracted from `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` via read-only reconnaissance.

*This report is reconnaissance, not final architectural authority.*
