Here is the bounded reconnaissance report.

---

**SIDELINE COACH SCOUT PLAY REPORT**

**Scout Play ID:** Combine__2026-09-17_084604_806_MDT-opencode-hosted-opencode-big-pickle
**Canonical Play Hash:** sha256:46362ec4a1a08886af2a4a65bd83c933aca92cf673546190722ea661a9597efb

---

### Executive Answer

The Game's top-level project manifest is **`package.json`** at the workspace root. Its declared project name is **`sideline-coach`** (display name: "Sideline Coach"). One concrete real dependency it defines is **`ws`** version `^8.21.3` (listed under `dependencies`).

---

### FACTS

1. **Manifest file exists:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` is present at the Game root (line-by-line verified, 145 lines).
2. **Declared project name:** `"name": "sideline-coach"` (package.json line 2).
3. **Display name:** `"displayName": "Sideline Coach"` (package.json line 3).
4. **Version:** `"version": "0.1.0"` (package.json line 5).
5. **License:** MIT (package.json line 7).
6. **Engine target:** VS Code `^1.95.0` (package.json line 9) — this is a VS Code extension.
7. **Main entry point:** `"main": "./out/extension.js"` (package.json line 21).
8. **Runtime dependency cited:** `"ws": "^8.21.3"` (package.json line 143) — a WebSocket library.
9. **Dev dependencies include:** `typescript ^5.7.2`, `@types/vscode ^1.95.0`, `@types/node ^22.10.0`, `@types/ws ^8.18.1`, `@vscode/vsce ^3.6.0` (package.json lines 44–49).
10. **Scripts defined include:** `compile` (`tsc -p ./`), `watch` (`tsc -watch -p ./`), `test` (`node --test ...`), `scout:play`, `scout:formation`, `scout:combine`, `vscode:prepublish`, `package` (package.json lines 28–42).
11. **VS Code contributions:** Four commands (`coach.startServer`, `coach.stopServer`, `coach.copyLatestReport`, `coach.copyMobileUrl`) and a configuration block with 8 properties (package.json lines 51–140).

---

### INFERENCES

1. The `node_modules/` directory presence and `package-lock.json` file confirm this project has been `npm install`-ed at some prior point.
2. The `tsconfig.json` at root combined with the `compile` script (`tsc -p ./`) confirms this is a TypeScript project that compiles to `out/`.
3. The project is a **VS Code extension** (evidenced by `engines.vscode`, `activationEvents`, `contributes.commands`, and `contributes.configuration`).
4. The sole runtime dependency (`ws`) is used for the WebSocket-based "dispatcher server" referenced in the extension's activation events and commands.

---

### UNKNOWNS

- Whether `npm install` has been run in the current environment's `node_modules` is inferred from directory presence but not verified at runtime.
- No other manifest types (`pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) exist at the root — `package.json` is the sole project manifest.

---

### CONTRADICTIONS

None. All evidence is internally consistent.

---

### Relevant Files / Symbols

| File | Key Symbols / Entries |
|---|---|
| `package.json` (root) | `"name": "sideline-coach"`, `"dependencies": {"ws": "^8.21.3"}`, `scripts.compile`, `contributes.commands`, `contributes.configuration` |
| `tsconfig.json` (root) | TypeScript compiler configuration (referenced by `compile` script) |
| `package-lock.json` (root) | Lockfile confirming dependency resolution |

---

### Recommended Next Step

The manifest is located and its contents are fully catalogued. No further bounded reconnaissance is needed for this objective. If deeper dependency-tree or runtime-behavior analysis is required, a separate authorization scope would be needed.

---

### Provenance

- **Source:** Direct read of `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` via approved read-only reconnaissance tools.
- **Tools used:** `read` (directory listing + file content).
- **Environment:** Win32, working directory `C:\Users\dmcal\Documents\GitHub\SidelineCoach`.

---

**This report is reconnaissance, not final architectural authority.** The bounded Scout Play objective has been completed.
