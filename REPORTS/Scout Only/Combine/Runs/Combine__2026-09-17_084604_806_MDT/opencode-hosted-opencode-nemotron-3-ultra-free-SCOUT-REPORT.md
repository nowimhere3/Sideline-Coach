**Executive Answer**
The top-level project manifest is `package.json` at the Game root. It declares the project name **`sideline-coach`** and defines a runtime dependency on **`ws` (^8.21.3)**.

**FACTS**
- File: `package.json` (Game-relative path: `package.json`)
- Project name: `"sideline-coach"` (line 2)
- Runtime dependency: `"ws": "^8.21.3"` (line 143)
- Dev dependencies include: `typescript`, `@types/node`, `@types/vscode`, `@types/ws`, `@vscode/vsce` (lines 44-50)
- Scripts defined: `compile`, `watch`, `check`, `test`, `vscode:prepublish`, `package`, and multiple `scout:*` and `dev:*` scripts (lines 28-42)
- This is a VS Code extension (`"main": "./out/extension.js"`, `"engines": { "vscode": "^1.95.0" }`, `activationEvents`, `contributes`)

**INFERENCES**
- The project is a TypeScript-based VS Code extension that runs a local WebSocket server (`ws` dependency) for mobile report relay and prompt dispatch.
- The `scout:*` scripts suggest a custom scouting/combine framework is part of the development workflow.

**UNKNOWNS**
- Whether there are additional manifests in subdirectories (e.g., a nested `package.json` for a web UI). The scope was the top-level manifest only.

**CONTRADICTIONS**
- None observed.

**Relevant Files / Symbols**
- `package.json` — lines 2, 28-42, 44-50, 142-144

**Recommended Next Step**
No further action required for this bounded objective. The manifest has been identified and key fields cited.

**Provenance**
Scout ID: Combine__2026-09-17_084604_806_MDT-opencode-hosted-opencode-nemotron-3-ultra-free  
Play Hash: sha256:0c88a652a33a2d0a35bbd73024d883fb4f99b0d097316e0d71bd558812ec442d  
Tooling: read-only reconnaissance (glob, read)

---

This report is reconnaissance, not final architectural authority.
