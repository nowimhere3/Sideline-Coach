Sideline Coach Combine recon — hunting the top-level manifest to name the project and verify a dependency.
SIDELINE COACH SCOUT PLAY — RECONNAISSANCE REPORT

SCOUT PLAY ID: Combine__2026-09-17_084604_806_MDT-opencode-hosted-opencode-muse-spark-1.2-contributor-free
CANONICAL PLAY HASH: sha256:4d3c738b1a46b3046877674fa9877585c7aa6073e204e54ace805cabdb0729aa
GAME ROOT: C:\Users\dmcal\Documents\GitHub\SidelineCoach

EXECUTIVE ANSWER
FACT: The Game's top-level project manifest exists. It is `package.json` at the workspace root. Declared project name is `sideline-coach` (field `"name": "sideline-coach"`). This is a VS Code extension (displayName "Sideline Coach"). One verified dependency/script/configuration entry is documented below.

FACTS
- FACT — Manifest existence and location: `package.json` exists at `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` (Game-relative: `package.json`). Directory listing of Game root shows 23 entries including `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `out/`, `README.md`. [evidence: directory read of Game root]
- FACT — Declared project name: `package.json` line 2: `"name": "sideline-coach"`; line 3: `"displayName": "Sideline Coach"`; line 5: `"version": "0.1.0"`; line 6: `"publisher": "local"` [evidence: `package.json:2-6`]
- FACT — One real dependency entry: `"dependencies": { "ws": "^8.21.3" }` at `package.json:142-144`
- FACT — Additional dependency examples (devDependencies): `"typescript": "^5.7.2"` at `package.json:49`, `"@types/node": "^22.10.0"` at `package.json:45`, `"@types/vscode": "^1.95.0"` at `package.json:46`, `"@vscode/vsce": "^3.6.0"` at `package.json:48` [evidence: `package.json:44-50`]
- FACT — One real script entry: `"compile": "tsc -p ./"` at `package.json:38`; other scripts include `"test": "node --test tools/diagnostics/test/*.test.mjs test/*.test.mjs"` at `package.json:37`, `"scout:combine": "npm run compile --silent && node tools/scouts/run-scout-combine.mjs"` at `package.json:34` [evidence: `package.json:28-43`]
- FACT — One real configuration entry: `contributes.commands` defines `"command": "coach.startServer"` with title `"Coach: Start Dispatcher Server"` at `package.json:52-55`; `contributes.configuration` defines `coach.port` default 49152 at `package.json:78-84`, `coach.autoStart` default true at `package.json:73-77` [evidence: `package.json:51-141`]
- FACT — No alternative top-level manifest found at root: glob for `pyproject.toml` → No files found; glob for `Cargo.toml` → No files found; glob for `go.mod` → No files found. Root listing contains no `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, etc. [evidence: globs + directory read]
- FACT — Companion file `package-lock.json` exists at `package-lock.json`; `tsconfig.json` exists at `tsconfig.json` [evidence: globs for `*.json` and directory listing]

INFERENCES
- INFERENCE — Project type is a VS Code extension published under MIT license with engine requirement `vscode ^1.95.0`, main entry `./out/extension.js`, categories `["Other"]` — inferred from manifest fields `engines`, `main`, `categories`, `license` in `package.json:7-21`.
- INFERENCE — `tsconfig.json` is a TypeScript configuration, not a project manifest defining name/dependencies, so `package.json` remains the canonical top-level manifest.
- INFERENCE — Absence of Python/Rust/Go manifests at root suggests Node/npm is the sole package manager for this Game; `package-lock.json` corroborates npm usage.

UNKNOWNS
- UNKNOWN — Runtime behavior (e.g., whether `npm run compile` succeeds, whether `ws` is actually installed in `node_modules/` beyond the directory entry name) — static evidence shows `node_modules/` exists but does not prove install integrity without execution, which is denied.
- UNKNOWN — Whether a hidden or non-standard manifest exists outside the searched patterns (e.g., `setup.py`, `poetry.lock`) — not enumerated by the glob set, though root directory listing did not show them.
- UNKNOWN — Semantic intent behind `publisher: "local"` and future publish target — not defined in manifest comments.

CONTRADICTIONS
- None observed. Manifest consistently declares `sideline-coach` across `name` and `displayName` fields; no conflicting second manifest at root contradicts the identification.

Relevant files / symbols
- `package.json` — TOP-LEVEL MANIFEST — defines `name: sideline-coach`, `dependencies.ws`, `scripts.compile`, `contributes.commands` [primary evidence]
- `package-lock.json` — lockfile companion, not manifest for name [secondary]
- `tsconfig.json` — TypeScript project config [secondary]
- Symbols: `name`, `displayName`, `version`, `dependencies.ws`, `devDependencies.typescript`, `scripts.compile`, `scripts.scout:combine`, `contributes.commands[coach.startServer]`, `contributes.configuration.properties.coach.port`

Recommended next step
No manifest creation or repair needed. For Combine eligibility verification, optionally read `tsconfig.json` and `README.md` to confirm build target and extension description align with `package.json:4` description "Mobile report relay and prompt dispatcher for named VS Code agent terminals." No write or execution authorized.

Provenance
- Scout model: muse-spark-1.2-contributor-free (opencode/muse-spark-1.2-contributor-free)
- Scout Play ID: Combine__2026-09-17_084604_806_MDT-opencode-hosted-opencode-muse-spark-1.2-contributor-free
- Canonical Play Hash: sha256:4d3c738b1a46b3046877674fa9877585c7aa6073e204e54ace805cabdb0729aa
- Evidence sources: read-only directory read of `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, file read of `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` (145 lines), globs for `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.json`
- Timestamp: 2026-09-17 UTC (Combine tryout bounded reconnaissance)
- Authority: read-only-reconnaissance

This report is reconnaissance, not final architectural authority.
