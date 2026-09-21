Executive answer: The top-level manifest is package.json at the game root. Project name: "sideline-coach". Real dependency entry: "ws": "^8.21.3" in dependencies. Real script entry: "compile": "tsc -p ./". Real config entry: "coach.port" default 49152.

FACTS:
- Manifest file exists: C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json
- Declared "name": "sideline-coach"
- Contains "dependencies": {"ws": "^8.21.3"}
- Contains "scripts" with "compile": "tsc -p ./"
- Contains "contributes.configuration.properties.coach.port" with default 49152

INFERENCES:
- This is a VS Code extension project (main: ./out/extension.js implied by manifest structure, activationEvents present).

UNKNOWNS:
- None relevant to bounded objective.

CONTRADICTIONS:
- None found.

Relevant files / symbols:
- package.json (name, dependencies.ws, scripts.compile, contributes.configuration.coach.port)

Recommended next step:
- If deeper manifest audit needed, inspect tsconfig.json for build config.

Provenance:
- Direct read of package.json in workspace root.

This report is reconnaissance, not final architectural authority.
