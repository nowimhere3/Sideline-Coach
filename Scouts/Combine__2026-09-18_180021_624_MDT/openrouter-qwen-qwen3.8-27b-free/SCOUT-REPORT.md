SIDELINE COACH SCOUT REPORT
Scout Play: Combine__2026-09-18_180021_624_MDT-openrouter-qwen-qwen3.8-27b-free
Task Class: scout-combine-tryout (bounded, read-only)

EXECUTIVE ANSWER
The Game's top-level project manifest is `package.json` (Game root: `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json`). Its declared project name is `sideline-coach` (with `displayName: "Sideline Coach"`). One concrete entry it defines: the runtime dependency `ws` at version range `^8.21.3` (line 149, under `"dependencies"`).

FACTS
- FACT: `package.json` exists at the Game root (`package.json`, Game-relative path), confirmed by glob match and full file read (151 lines).
- FACT: Declared name field: `"name": "sideline-coach"` (line 2); `"displayName": "Sideline Coach"` (line 3); `"version": "0.1.0"` (line 5); `"license": "MIT"` (line 7).
- FACT: Runtime dependency entry: `"dependencies": { "ws": "^8.21.3" }` (lines 148–150).
- FACT: Development dependency entries include `"typescript": "^5.7.2"`, `"@types/node": "^22.10.0"`, `"@types/vscode": "^1.95.0"`, `"@types/ws": "^8.18.1"`, `"@vscode/vsce": "^3.6.0"` (lines 45–51).
- FACT: Script entries defined, e.g. `"test": "node --test tools/diagnostics/test/*.test.mjs test/*.test.mjs"` (line 38) and `"compile": "tsc -p ./"` (line 39).
- FACT: Configuration entry defined: `coach.port` (number, default 49152, min 1024, max 65535) under `contributes.configuration.properties` (lines 84–90).
- FACT: The manifest declares `engines.vscode: "^1.95.0"` and `main: "./out/extension.js"` (lines 8–10, 21), consistent with a VS Code extension package.
- FACT: Companion manifest `package-lock.json` and a `tsconfig.json` exist at the Game root, corroborating an npm/TypeScript project.

INFERENCES
- INFERENCE: The project is a Node.js/TypeScript VS Code extension ("Mobile report relay and prompt dispatcher for named VS Code agent terminals", line 4) distributed via `vsce` (per `package`/`vscode:prepublish` scripts), not a Python project — no `pyproject.toml` or other `*.toml` manifest was found at the root.
- INFERENCE: The `ws` dependency supports the manifest's stated server/dispatcher behavior (WebSocket server on localhost port per `coach.port`); the dependency's presence is static evidence only of declared intent, not of runtime behavior.

UNKNOWNS
- UNKNOWN: No runtime behavior was verified; nothing was executed (per authority, read-only). It has not been confirmed that `node_modules` matches the lockfile/declared ranges.
- UNKNOWN: Whether `out/` contains a built `extension.js` was not inspected (out of bounded scope; the `main` field only declares the entry path).

CONTRADICTIONS
- None found. Root directory listing, `package.json`, `package-lock.json`, and `tsconfig.json` are mutually consistent for a single npm/TypeScript project named `sideline-coach`.

RELEVANT FILES / SYMBOLS
- `package.json` (Game root) — top-level manifest; symbols: `name`, `displayName`, `version`, `engines`, `main`, `scripts`, `devDependencies`, `dependencies`, `contributes.commands`, `contributes.configuration`
- `package-lock.json` (Game root) — lockfile companion
- `tsconfig.json` (Game root) — TypeScript compiler config referenced by the `compile`/`check` scripts

RECOMMENDED NEXT STEP
Treat `package.json` as the canonical manifest for this Game. If a later combine phase needs to map package.json entry points to source (e.g., `main: ./out/extension.js` to `src/`), run a follow-up bounded play scoped to `src/` and `out/` only.

PROVENANCE
- Read-only glob for `package.json`, `pyproject.toml`, `*.toml` in Game root; directory listing of Game root; full read of `package.json` (lines 1–151). No files modified, created, or deleted; no commands executed; no network/browser/subagent tools used.

REQUIRED STATEMENT: This report is reconnaissance, not final architectural authority.
