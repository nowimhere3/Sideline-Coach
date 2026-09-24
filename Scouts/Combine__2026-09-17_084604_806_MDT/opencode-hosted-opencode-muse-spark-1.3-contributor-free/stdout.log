Scouting your project manifest — read-only check in progress.
Found the top-level manifest — now pulling its declared details.
Executive answer
Top-level project manifest is `package.json` with declared project name `sideline-coach`. It defines real dependency `ws: ^8.21.3`, scripts including `compile: tsc -p ./`, and VS Code extension configuration.

FACTS
- FACT: Game-relative path `package.json` exists at workspace root `C:\Users\dmcal\Documents\GitHub\SidelineCoach`.
- FACT: `package.json` line 2 declares `"name": "sideline-coach"` with `"displayName": "Sideline Coach"` on line 3, `"version": "0.1.0"` on line 5.
- FACT: `package.json` lines 142-144 define `"dependencies": { "ws": "^8.21.3" }`.
- FACT: `package.json` lines 28-43 define `"scripts"` including `"compile": "tsc -p ./"` (line 38), `"scout:combine": "npm run compile --silent && node tools/scouts/run-scout-combine.mjs"` (line 34), and `"test": "node --test tools/diagnostics/test/*.test.mjs test/*.test.mjs"` (line 37).
- FACT: `package.json` lines 44-50 define `"devDependencies"` including `"typescript": "^5.7.2"`, `"@types/vscode": "^1.95.0"`.
- FACT: `package.json` lines 8-10 define `"engines": { "vscode": "^1.95.0" }` and line 21 defines `"main": "./out/extension.js"`.
- FACT: `package.json` lines 51-141 define `"contributes"` with `"commands"` e.g. `"coach.startServer"` and `"configuration"` properties e.g. `"coach.port"` default 49152.
- FACT: No `pyproject.toml` found at top level via glob search; `tsconfig.json` also exists at root but is TypeScript config, not primary project manifest.
- FACT: Supporting lockfile `package-lock.json` exists at root, corroborating npm-based Node project.

INFERENCES
- INFERENCE: This is a VS Code extension (Node/TypeScript) project, based on `publisher`, `categories`, `activationEvents`, `contributes.commands/configuration`, and `engines.vscode` entries — not a Python project.
- INFERENCE: Primary build is TypeScript via `tsc -p ./` as defined in `compile` / `check` / `watch` scripts.

UNKNOWNS
- UNKNOWN: Runtime behavior (whether extension activates, server starts, scripts succeed) — static manifest evidence cannot prove execution without running commands, which is out of scope.
- UNKNOWN: Completeness of dependency install state (`node_modules/` present but not inspected for version match) — not required by bounded objective.

CONTRADICTIONS
- None observed for this objective. Manifest name, dependencies, and scripts are internally consistent.

Relevant files / symbols
- `package.json` : `name=sideline-coach`, `dependencies.ws`, `scripts.compile`, `scripts.scout:combine`, `contributes.configuration.coach.port`, `main=./out/extension.js`
- `package-lock.json` — corroborating npm lockfile at root
- `tsconfig.json` — TypeScript compiler config at root (not manifest, but relevant)
- `src/` , `out/` , `tools/` — directories referenced by manifest `files` and `scripts`

Recommended next step
- No further reconnaissance needed for this objective; if expanded authority granted, validate `package.json` against `package-lock.json` and `tsconfig.json` for build consistency.

Provenance
- Game root listed via directory read: `C:\Users\dmcal\Documents\GitHub\SidelineCoach` showing `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `out/`, etc.
- Glob `package.json` returned `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json`.
- Glob `pyproject.toml` returned no files; glob `*.toml` returned no files.
- Full file read of `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` (145 lines) provided all cited entries.
- Scout Play ID: Combine__2026-09-17_084604_806_MDT-opencode-hosted-opencode-muse-spark-1.3-contributor-free

This report is reconnaissance, not final architectural authority.
