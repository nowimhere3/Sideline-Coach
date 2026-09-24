I have the manifest. Let me verify the package-lock.json exists at root to cross-confirm and confirm this is the active manifest (it does, already seen in glob results). I have sufficient evidence. Stopping reconnaissance here.

This report is reconnaissance, not final architectural authority.

## Executive answer
The Game's top-level project manifest file is `package.json`, located at the workspace root. Its declared project name is **`sideline-coach`**. One real dependency it defines is **`ws`** (version `^8.21.3`).

## FACTS
- A file `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` exists at the Game root (151 lines).
- A file `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package-lock.json` also exists at the root (confirmed via glob), corroborating that `package.json` is the resolved manifest.
- `package.json` declares the field `"name": "sideline-coach"` (line 2).
- `package.json` declares a `"dependencies"` object containing a real dependency `"ws": "^8.21.3"` (lines 148-149).
- `package.json` additionally declares a `"devDependencies"` object with entries including `"@types/node"`, `"@types/vscode"`, `"@vscode/vsce"`, and `"typescript"` (lines 45-51), and a `"scripts"` object with entries such as `"scout:combine"`, `"compile"`, `"test"`, and `"package"` (lines 28-44).
- No `*.toml`, `*.cfg`, or `*.lock` (excluding package-lock.json) or root-level `*.yml`/`*.yaml` manifest-style files were present at the Game root (package-lock.json is the only lock file found).
- `tsconfig.json` exists at root but is a TypeScript compiler configuration, not the project manifest; it is consumed by the manifest's `"compile"` script (`tsc -p ./`).

## INFERENCES
- Because `package.json` declares a VS Code `"engines"` constraint (`"vscode": "^1.95.0"`), `"main": "./out/extension.js"`, `"contributes"` (commands + configuration), and a `"vscode:prepublish"`/`"package"` script using `vsce package`, this Game is a VS Code extension project.
- The presence of `package-lock.json` alongside the `"version": "0.1.0"` field indicates a Node.js/npm-managed project using lockfile v3-style dependency resolution.

## UNKNOWNS
- The exact lockfile version of `package-lock.json` was not read (not needed to satisfy the objective).
- Runtime values, install state of `node_modules`, and execution behavior are not proven by static evidence and are intentionally not claimed.
- I did not inspect `src/` source files or confirm whether `ws` is actually imported at runtime; that is out of scope for the manifest objective.

## CONTRADICTIONS
- None observed. `package.json` is internally consistent: the `"main"` entry points to `./out/extension.js` (compiled output), consistent with the `"compile"` script (`tsc -p ./`) and the presence of `tsconfig.json`.

## Relevant files / symbols
- `package.json` — root manifest. Fields of interest: `name` (`sideline-coach`), `version` (`0.1.0`), `main` (`./out/extension.js`), `scripts` (e.g., `scout:combine`, `compile`, `test`, `package`), `dependencies` (`ws` ^8.21.3), `devDependencies` (`@types/node`, `@types/vscode`, `@vscode/vsce`, `typescript`).
- `package-lock.json` — corroborating npm lockfile at root.

## Recommended next step
No further action required for this bounded objective. If a future task needs deeper analysis, consider reading `package-lock.json` for resolved transitive `ws` sub-dependencies, or inspecting `src/**/*.ts` to confirm runtime usage of `ws`.

## Provenance
- Tool calls: `glob` for `*.json`, `*.toml`, `*.cfg`, `*.lock`, `*.yml`, `*.yaml` at the Game root; `read` of `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json`.
- Scout Play ID: `Combine__2026-09-18_152139_086_MDT-openrouter-poolside-laguna-s-2.1-free`.
- Model: `openrouter/poolside/laguna-s-2.1:free`.
- Today: Fri Sep 18 2026.
