# SLC Plumbing Workspace Breadcrumb

STATUS: WILL BE / BACK-POCKET PRODUCT-ENGINEERING STRUCTURE — NOT IMPLEMENTED

## North Star

Sideline Coach should eventually have one clearly bounded root-level workspace for internal orchestration plumbing, agent contracts, runtime handoffs, automation support material, and plumbing-specific reports.

Suggested root folder:

```text
Plumbing SLC/
```

This folder is not the product UX and should not become a dumping ground. It is the backstage area for Sideline-owned execution plumbing.

## Why this folder exists

Sideline is accumulating a new class of assets that are neither ordinary product source nor general project documentation:

- Scout agent definitions
- future paid/free Player packs
- Terminal Runner contracts
- Scout Runner contracts
- routing manifests
- internal handoff formats
- plumbing-only SOPs
- automation templates
- capability / provider manifests
- runtime-evidence conventions
- plumbing-specific investigations and reports

Keeping these mixed into root `REPORTS/`, `Project SOP/`, `.opencode/`, or source directories makes ownership increasingly ambiguous.

The Plumbing SLC workspace gives these assets one obvious home while keeping existing canonical project docs intact.

## Proposed shape

```text
Plumbing SLC/
├── README.md
├── Agents/
│   ├── Scouts/
│   │   ├── Free/
│   │   ├── Paid/
│   │   └── Templates/
│   └── Players/
├── SOPs/
├── Handoffs/
├── Contracts/
├── Manifests/
├── Templates/
├── Reports/
│   ├── Scout Runner/
│   ├── Terminal Runner/
│   ├── Routing/
│   └── Providers/
└── Experiments/
```

Exact names are not frozen. The important invariant is one bounded internal-plumbing workspace with explicit ownership.

## Folder semantics

### `Agents/`
Durable agent / Player definitions and source templates.

Examples:

- Sideline Scout contracts
- Quick / Default / Balanced / Deep Scout definitions
- future paid Scout definitions
- reusable Player-role templates

Project-specific runtime installations such as `.opencode/agents/*.md` may still be generated into a Game. The canonical source-of-truth templates should eventually live here rather than being hand-authored independently in each Game.

### `SOPs/`
SOPs that explain how Sideline's internal plumbing operates.

Examples:

- Scout Pack installation
- Terminal Runner operation
- provider setup
- report persistence
- capability refresh
- runner recovery

This should not replace the normal `Project SOP/` folder for user/project-wide operating procedures. The distinction is:

```text
Project SOP/
  how humans / project agents work

Plumbing SLC/SOPs/
  how Sideline's internal execution plumbing works
```

### `Handoffs/`
Machine/human handoff contracts between Sideline components.

Examples:

- Assistant Coach → Scout Runner
- Scout Runner → report sink
- Terminal Runner → Assistant Coach
- Provider adapter → Capacity / Freshness layer
- Player completion → Incoming

### `Contracts/`
Durable schemas and invariants.

Examples:

- Scout Play contract
- Terminal Play contract
- progress-event vocabulary
- execution lifecycle states
- report provenance contract
- read-only capability contract

### `Manifests/`
Machine-readable or semi-structured rosters/routing data.

Examples:

```text
Scout capability class
  QUICK
  DEFAULT
  BALANCED
  DEEP

current eligible provider/model
privacy class
context size
cost class
request capacity
freshness timestamp
```

Today’s model names should be runtime evidence, not permanently hard-coded architecture.

### `Templates/`
Reusable templates for generated files.

Examples:

- `.opencode/agents/sideline-scout.md`
- future Codex/Claude/other provider Player definitions
- Scout Report template
- Scout Play prompt template

### `Reports/`
Reports specifically about Sideline plumbing.

This is intentionally different from the repository's root `REPORTS/`, which remains the normal project-level architecture / implementation report surface.

Examples:

```text
Plumbing SLC/Reports/Scout Runner/
Plumbing SLC/Reports/Terminal Runner/
Plumbing SLC/Reports/Routing/
```

The distinction prevents plumbing investigations from polluting ordinary Game/product report history.

### `Experiments/`
Temporary prototypes and field-test artifacts that have not graduated into durable source truth yet.

Examples:

- terminal-copy checkpoint prototype
- OpenCode invocation probes
- JSON-event-stream experiments
- provider smoke-test notes

Once an experiment becomes durable, its truth should graduate into code, a Contract, SOP, Manifest, Template, test, or breadcrumb. Experiments should not become permanent geology.

## Scout Pack relationship

The Scout work makes this structure immediately useful.

A future canonical source might look like:

```text
Plumbing SLC/
└── Agents/
    └── Scouts/
        ├── Free/
        │   ├── sideline-scout-default.md
        │   ├── sideline-scout-quick.md
        │   ├── sideline-scout-balanced.md
        │   └── sideline-scout-deep.md
        ├── Paid/
        └── Templates/
```

Sideline may then install the correct provider-specific runtime files into a Game, for example:

```text
<Game>/.opencode/agents/
```

The runtime installation is generated plumbing. The canonical Player contract belongs to Sideline.

This avoids hand-building the same Scout definitions inside every Game.

## Relationship to current folders

Do NOT blindly move existing durable folders into Plumbing SLC.

Current root folders such as:

- `Docs ANCHOR/`
- `Project SOP/`
- `REPORTS/`
- `src/`
- `test/`

retain their existing purposes.

The new workspace should collect only Sideline-internal orchestration plumbing that currently lacks a clean home.

## Human UX principle

Dad Mode should almost never expose this folder directly.

Dev Mode may expose relevant plumbing when useful, such as:

- exact Scout contract
- selected routing manifest
- Terminal Runner event stream
- provider/capacity evidence
- report provenance

The existence of Plumbing SLC is primarily an engineering organization boundary, not a requirement that users understand internals.

## Possible future product mapping

The folder may eventually correspond to a product-internal module boundary:

```text
SLC Plumbing
├── Agent Registry
├── Scout Pack
├── Player Router
├── Terminal Runner
├── Report Sink
├── Progress Events
├── Provider Adapters
└── Capacity / Freshness
```

This is compatible with the existing Scout Swarm, intelligent terminal routing, Terminal incremental-copy checkpoint, and single-Scout automation breadcrumbs.

## Durable WHY

> Sideline needs a backstage.
>
> Product source, human-facing SOPs, architecture breadcrumbs, runtime reports, and orchestration plumbing are different classes of truth. A bounded `Plumbing SLC/` workspace gives internal runners, agent contracts, routing manifests, handoffs, templates, and plumbing-only reports one obvious home without forcing the human-facing product to expose the machinery.

## Not frozen yet

This breadcrumb does NOT yet decide:

- exact folder spelling (`Plumbing SLC` vs `SLC Plumbing`)
- which current files should migrate
- whether provider-specific runtime agent definitions live only as generated outputs
- exact manifest format
- exact report retention policy
- whether `Experiments/` ships or remains dev-only
- final V2 paid Scout pack layout

Those should be decided during an implementation/architecture pass rather than by ad hoc file movement.
