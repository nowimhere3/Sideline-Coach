# Sideline Coach — Free Scout Player Selection & Invocation SOP

**Status:** Active operating SOP, Crawl Phase  
**Last verified:** 2026-09-15 MDT  
**Primary stack:** OpenCode + OpenRouter + OpenCode `Explore`  
**Current report parent:** `REPORTS/Scout Only/`

---

# Purpose

This SOP answers one practical question:

> **We need a Scout. Which free Scout should we send, how do we start it, and what exactly should it return?**

The immediate goal is **not** to automate a four-Scout swarm.

The immediate goal is to make **single-Scout selection boring, repeatable, cheap, and safe**.

For now:

```text
Head Coach / Assistant Coach
        ↓
identify a Scout-sized question
        ↓
open this SOP
        ↓
choose the right Scout
        ↓
launch one read-only Scout
        ↓
Scout maps the terrain
        ↓
Scout returns a structured report
        ↓
persist report under REPORTS/Scout Only/<Play>/
        ↓
decide whether the next route is Worker / Sonnet / Opus / another Scout
```

This is the **crawl-before-walk** version of the future Scout Play automation.

---

# 1. Core Scout Doctrine

A Scout exists to reduce the cost of expensive architectural reasoning.

The Scout should:

- map what currently exists;
- find relevant files, functions, contracts, tests, reports, and ownership seams;
- distinguish **FACT** from **INFERENCE**;
- expose **UNKNOWN** and **CONTRADICTION**;
- identify what still requires an Architect;
- identify what does **not** require an Architect;
- compress evidence into a useful handoff;
- stop when the bounded reconnaissance task is complete.

A Scout does **not** own architecture.

A Scout does **not** implement.

A Scout does **not** mutate the Game merely because it noticed a likely fix.

> **Scout cheaply before escalating expensively when discovery cost is material.**

> **Do not pay the Architect to discover the problem when a cheaper Scout can map the problem first.**

---

# 2. Maturity Ladder

## CRAWL — Current Default

Use **one Scout at a time**.

The human or Assistant Coach chooses the Scout from this SOP.

The Scout gets one bounded question, performs reconnaissance, returns one report, and the Play ends.

This is the recommended operating mode until Sideline has enough real evidence about Scout quality, failure patterns, request consumption, and report usefulness.

## WALK — Later

Use two or more Scouts intentionally when the problem has clearly separable seams.

```text
Scout A → runtime topology
Scout B → Game identity
Scout C → security boundary
```

The Scouts remain independent and read-only.

## RUN — Future Automation

Sideline detects or receives a Scout Play, decomposes the Play, chooses models automatically, launches a temporary Scout formation, gathers reports into one Play folder, optionally performs cheap evidence compression, notifies the Head Coach, and retires the Scout formation.

See the existing future breadcrumb:

`Docs ANCHOR/SCOUT-SWARM-AUTOMATION-BREADCRUMB.md`

Do not wait for RUN before using CRAWL.

---

# 3. Current Star Roster

The model roster is **runtime evidence, not permanent architecture**. Free models can appear, disappear, change limits, or change performance.

Before relying on the roster after a long gap:

```powershell
opencode models --refresh
```

Current preferred free Scout room:

| Scout Role | Current Star Player | Best Use | Default? |
|---|---|---|---|
| **Default Scout** | Poolside Laguna S 2.1 Free | Normal repo reconnaissance, execution-path tracing, bounded debugging archaeology | **YES** |
| **Quick Scout** | Cohere North Mini Code Free | File finding, symbols, tests, simple call chains, inventories | No |
| **Deep Scout** | NVIDIA Nemotron 3 Ultra Free | Large-context, cross-subsystem, contradiction-heavy reconnaissance | No |
| **Balanced Reserve** | NVIDIA Nemotron 3 Super Free | Middle route when Quick is too light and Ultra is excessive | No |

### Thirty-second rule

If you cannot decide quickly:

> **Send Laguna.**

Selection itself should not cost more attention than the Scout saves.

---

# 4. Default Scout — Poolside Laguna S 2.1 Free

**Exact OpenRouter model ID**

```text
poolside/laguna-s-2.1:free
```

**OpenCode selector**

```text
openrouter/poolside/laguna-s-2.1:free
```

## Why it starts

Laguna S 2.1 is purpose-built for software engineering and agentic coding. OpenRouter currently lists a 262K free-endpoint context window and coding-agent benchmark results including 70.2% on Terminal-Bench 2.1 and 40.4% on DeepSWE.

This is the first Scout to send for normal Sideline reconnaissance.

## Use it for

```text
Figure out how Add Game actually flows through the system.
```

```text
Trace this feature from browser event to Control Plane to Stadium.
```

```text
Find the ownership boundaries involved in Player capacity and freshness.
```

```text
Read the implementation and tell us what Opus should actually need to decide.
```

## Direct launch

Current OpenCode syntax:

```powershell
opencode mini --model openrouter/poolside/laguna-s-2.1:free
```

If the installed build uses the older Mini flag form already proven on this Sideline machine:

```powershell
opencode --mini --model openrouter/poolside/laguna-s-2.1:free
```

Then invoke local repository exploration:

```text
@explore
```

**Reference:** https://openrouter.ai/poolside/laguna-s-2.1-20260720:free

---

# 5. Quick Scout — Cohere North Mini Code Free

**Exact OpenRouter model ID**

```text
cohere/north-mini-code:free
```

**OpenCode selector**

```text
openrouter/cohere/north-mini-code:free
```

## Why it exists

North Mini Code is optimized for agentic coding and terminal work and is explicitly trained to generalize across agent harnesses including OpenCode and SWE-Agent.

This is the **route-runner**.

Use it when the question is mostly discovery rather than judgment.

## Use it for

```text
Find every file that owns Game identity.
```

```text
Trace where game.pick is called.
```

```text
Locate all references to extensionBuildId and summarize their purpose.
```

```text
Find the tests protecting this route and list what they prove.
```

```text
Map this call chain. Do not redesign it.
```

## Avoid as default when

- the answer depends on historical architecture;
- contradictions are subtle;
- security boundaries are involved;
- several subsystems interact;
- the Scout needs to judge whether premium architecture is warranted.

## Direct launch

```powershell
opencode mini --model openrouter/cohere/north-mini-code:free
```

Older proven Mini flag form:

```powershell
opencode --mini --model openrouter/cohere/north-mini-code:free
```

Then:

```text
@explore
```

**Reference:** https://openrouter.ai/cohere/north-mini-code:free

---

# 6. Deep Scout — NVIDIA Nemotron 3 Ultra Free

**Exact OpenRouter model ID**

```text
nvidia/nemotron-3-ultra-550b-a55b:free
```

**OpenCode selector**

```text
openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
```

## Why it exists

Nemotron 3 Ultra is a large reasoning/orchestration model. OpenRouter currently lists a 1M-token context window and describes it as suited for coding agents, deep research, orchestration, and complex multi-step reasoning.

Use Deep Scout when the archaeology itself is genuinely difficult and you want to delay spending Sonnet/Opus until the plumbing is exposed.

## Use it for

```text
Reconstruct how this subsystem evolved across current source, tests,
North Star, breadcrumbs, and relevant recent reports. Find contradictions
and tell the Architect exactly what remains unresolved.
```

```text
Trace a cross-subsystem problem spanning Control Plane, Stadium,
browser, Player runtime, persistence, and provider contracts.
```

```text
We have several plausible seams. Map them before an Architect chooses.
```

## Tradeoff

Expect a heavier Scout. Do not use it to locate three functions.

## Direct launch

```powershell
opencode mini --model openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
```

Older proven Mini flag form:

```powershell
opencode --mini --model openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
```

Then:

```text
@explore
```

## Privacy note

NVIDIA's current free endpoint warns against uploading confidential information or personal data and describes logging for security/product-improvement purposes.

**Reference:** https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free

---

# 7. Balanced Reserve — NVIDIA Nemotron 3 Super Free

**Exact OpenRouter model ID**

```text
nvidia/nemotron-3-super-120b-a12b:free
```

**OpenCode selector**

```text
openrouter/nvidia/nemotron-3-super-120b-a12b:free
```

## Why it exists

Nemotron 3 Super is designed for complex agent applications and multi-step work while being lighter than Ultra.

Think of it as the reserve player between Quick and Deep.

## Use it when

- Quick feels too shallow;
- Ultra feels excessive;
- Laguna is temporarily unavailable or underperforming;
- the work needs broader reasoning but should still stay relatively nimble.

## Direct launch

```powershell
opencode mini --model openrouter/nvidia/nemotron-3-super-120b-a12b:free
```

Older proven Mini flag form:

```powershell
opencode --mini --model openrouter/nvidia/nemotron-3-super-120b-a12b:free
```

Then:

```text
@explore
```

**Reference:** https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free

---

# 8. Scout Selection Decision Path

```text
START
  ↓
Is this actually reconnaissance?
  ├─ NO → Do not use a Scout.
  └─ YES
       ↓
Mostly finding files, symbols, tests, or a straightforward call chain?
  ├─ YES → QUICK / North Mini Code
  └─ NO
       ↓
Normal software archaeology, ownership mapping, or execution-path tracing?
  ├─ YES → DEFAULT / Laguna S 2.1
  └─ NO
       ↓
Huge context, multiple subsystems, subtle contradictions,
historical reconciliation, security boundaries, or architecture-sensitive uncertainty?
  ├─ YES → DEEP / Nemotron 3 Ultra
  └─ NO → BALANCED / Nemotron 3 Super
```

---

# 9. When Not to Scout

Do not turn Scout into ceremony.

Usually skip Scout for:

- changing padding;
- renaming a known label;
- editing one known constant;
- fixing one obvious selector;
- adding one bounded test around a known seam;
- a Worker Play whose implementation boundary is already proven;
- a question already answered by current evidence.

> **Process size must match problem size.**

---

# 10. One-Time Setup

Install OpenCode:

```powershell
npm install -g opencode-ai
```

Verify:

```powershell
opencode --version
```

OpenRouter:

- Website: https://openrouter.ai/
- API keys: https://openrouter.ai/settings/keys

Create an OpenRouter API key.

Current OpenRouter guidance says free endpoints are rate-limited. OpenRouter currently documents 50 free-model requests/day on a free account and 1,000/day after adding at least $10 in credits, with a 20 requests/minute ceiling in either case. Treat these numbers as provider policy, not a Sideline invariant.

---

# 11. Current Sideline Windows Startup

For the current Sideline Coach machine:

```powershell
cd "C:\Users\dmcal\Documents\GitHub\SidelineCoach"
$env:OPENCODE_DB="$env:USERPROFILE\.local\share\opencode\scout.db"
```

Load the OpenRouter key for the current PowerShell process without displaying it:

```powershell
$secure = Read-Host "Paste your OpenRouter API key" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:OPENROUTER_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
```

Then launch the selected Scout using its Player Card.

Do not put the API key into prompts, reports, screenshots, commits, or source files.

---

# 12. Already Inside OpenCode?

Use:

```text
/models
```

Search for the exact model slug from the Player Card.

Then:

```text
@explore
```

OpenCode documents `Explore` as a read-only codebase exploration subagent. Its default permission policy denies normal editing and allows reading/search-oriented operations.

**References**

- https://dev.opencode.ai/docs/agents/
- https://opencode.ai/v2/docs/permissions
- https://opencode.ai/v2/docs/models

---

# 13. Universal Scout Play Template

Paste after `@explore`:

```text
SCOUT PLAY — READ-ONLY RECONNAISSANCE

You are acting as a Sideline Coach Read-Only Reconnaissance Scout.

Do not modify production code, tests, configuration, architecture documents,
breadcrumbs, git state, packages, runtime state, or unrelated files.
Do not commit, push, reset, clean, stash, or implement a fix.

QUESTION / OBJECTIVE:
<PASTE THE BOUNDED QUESTION HERE>

SCOPE:
<PASTE OPTIONAL FILE/FOLDER/PATHS HERE>

Your job is to map what exists and compress the evidence for a future
Architect or Worker. Do not silently redesign the subsystem.

Return a complete Scout Report containing:

REPORT TYPE: SCOUT REPORT
SCOUT AGENT: OpenCode
SCOUT MODEL: <STATE YOUR EXACT MODEL>
SCOUT REASONING / EFFORT: <STATE WHAT IS KNOWN OR SAY PROVIDER DEFAULT / UNKNOWN>
SCOUT ROLE: Read-Only Reconnaissance Scout
SCOUT SCOPE: <WHAT YOU ACTUALLY INVESTIGATED>
RECONNAISSANCE DEPTH: Light / Standard / Deep
SCOUT DATE / TIMESTAMP: <LOCAL PROJECT TIME IF AVAILABLE>

State explicitly:
"This report is reconnaissance, not final architectural authority."

Then include, where applicable:

# Executive Map
# Question Investigated
# Current Truth
# Evidence Map
# Relevant Files / Symbols / Ownership Seams
# Execution / Data Flow
# FACTS
# INFERENCES
# UNKNOWNS
# CONTRADICTIONS
# Architecture Decisions Still Required
# What Does NOT Need Architecture
# Risks / Boundaries
# Recommended Next Agent / Model / Effort
# What the Future Architect Should Verify
# What the Future Architect Should NOT Need to Rediscover
# WAS / IS / WILL BE
# Scout Limitations

For important claims, name the exact file, function/type, test, contract,
or current project artifact supporting the claim.

If evidence is insufficient, say UNKNOWN.
If two current sources disagree materially, say CONTRADICTION.
If the question is already bounded enough for a Worker and does not
need architecture, say so explicitly.

Stop after the bounded reconnaissance and report.
```

---

# 14. Report Contract

Every Scout Report must identify who produced the map.

Minimum metadata:

```text
REPORT TYPE: SCOUT REPORT
SCOUT AGENT:
SCOUT MODEL:
SCOUT REASONING / EFFORT:
SCOUT ROLE: Read-Only Reconnaissance Scout
SCOUT SCOPE:
RECONNAISSANCE DEPTH:
SCOUT DATE / TIMESTAMP:
```

A polished report from a fast lightweight Scout is not equivalent to a deep investigation merely because both are written confidently.

The report must distinguish:

```text
FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED
```

> **Trust the evidence according to its provenance. Re-evaluate the conclusion according to remaining uncertainty.**

---

# 15. Report Destination

Current parent:

```text
REPORTS/Scout Only/
```

Preferred Play folder:

```text
REPORTS/Scout Only/<Play-Topic__YYYY-MM-DD_HHMM_MDT>/
```

Example:

```text
REPORTS/Scout Only/Add-Game-Identity__2026-09-15_1230_MDT/
```

Preferred single-Scout report:

```text
SCOUT-<Topic>-Reconnaissance.md
```

Future multi-Scout shape:

```text
REPORTS/Scout Only/<Play>/
├── SCOUT-A-<Route>.md
├── SCOUT-B-<Route>.md
├── SCOUT-C-<Route>.md
├── SCOUT-D-<Route>.md
└── SCOUT-COMPLETE-<Topic>.md
```

## Current OpenCode Explore limitation

Built-in `Explore` is mechanically read-only, so the safest CRAWL procedure is:

1. Scout returns the complete report in its OpenCode response.
2. Human, Assistant Coach, or a trusted report writer persists it into `REPORTS/Scout Only/<Play>/`.
3. Do **not** grant unrestricted Build authority merely so the Scout can save Markdown.

Future Sideline automation can add a narrow report-only writer or a custom Scout permission scoped only to its assigned report location.

---

# 16. Architect Handoff

The Scout exists so the Architect starts here:

```text
I know what exists.
I know the important seams.
I know the strongest evidence.
I know the contradictions.
I know what remains uncertain.
Now I can reason.
```

Not here:

```text
Where am I?
What repository is this?
What owns this process?
Which of these eighty reports matters?
```

Preferred handoff:

```text
ARCHITECT HANDOFF

We sent a bounded read-only Scout ahead of you.

Scout report / Scout Play folder:
<PASTE EXACT PATH>

Read the Scout evidence first.
Treat the Scout's conclusions as reconnaissance, not final authority.
Spot-check the highest-consequence evidence and reopen only areas where
the evidence is weak, contradictory, incomplete, or architecture-sensitive.

Do not restart repository archaeology from zero unless the Scout report
proves unreliable.

Apply stronger reasoning to the uncertainty that remains and own the
architecture decision.
```

---

# 17. Escalation Route

Every Scout should recommend one next route.

### BOUNDED WORKER

Use when the seam is now clear and architecture is unnecessary.

### SONNET-CLASS ARCHITECT / MEDIUM

Use when bounded design judgment remains.

### SONNET-CLASS ARCHITECT / HIGH

Use when several meaningful choices or cross-cutting effects remain.

### OPUS-CLASS ARCHITECT

Use when uncertainty is architecture-critical, high consequence, deeply cross-system, or contains competing valid designs requiring premium synthesis.

### ANOTHER SCOUT

Use when the first Scout found a specific unresolved seam that is still reconnaissance rather than architecture.

A Scout proving that **Opus is unnecessary** is a successful Scout Play.

---

# 18. Failure / Fallback Rules

If the chosen free Scout is unavailable, rate-limited, or repeatedly fails:

1. Do not burn requests in a retry loop.
2. Try the nearest adjacent Scout class.
3. If Laguna fails, try Nemotron Super.
4. If the Play is tiny, try North Mini.
5. If the Play is genuinely difficult, try Ultra.
6. If no free Scout is trustworthy enough, deliberately use the appropriate paid/premium agent.

> **Cost optimization must never become evidence degradation disguised as efficiency.**

---

# 19. Request Economy

Current OpenRouter guidance:

```text
Free account:
50 free-model requests/day
20 requests/minute

Account with at least $10 in credits:
1,000 free-model requests/day
20 requests/minute
```

Free `:free` model variants are currently $0/token, subject to model/provider availability and rate limits.

Treat all provider quotas as live external policy.

The durable Sideline principle is:

> **Premium reasoning should be spent on synthesis, architecture, dangerous uncertainty, and high-consequence tradeoffs, not avoidable repository archaeology.**

**Reference:** https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/

---

# 20. Privacy / Data Rule

**Read-only does not mean private.**

A Scout may be forbidden from editing the Game while still sending selected source context to an external inference provider.

Before using a free endpoint:

- do not expose credentials or secrets;
- do not send restricted customer/private information to an incompatible endpoint;
- review provider data-use terms for sensitive repositories;
- prefer bounded paths and questions over indiscriminate access;
- keep the Scout Game-scoped;
- use a private/premium route when policy requires it.

Poolside currently says inputs/outputs on the free Laguna endpoint may be used to improve its models.

NVIDIA's current free Ultra endpoint warns against confidential information/personal data and describes logging/product-improvement use.

Provider policy can change.

---

# 21. Live Model Verification

Refresh OpenCode:

```powershell
opencode models --refresh
```

Inside OpenCode:

```text
/models
```

Current OpenRouter free catalog:

https://openrouter.ai/collections/free-models

If a documented free slug disappears:

- do not invent a replacement ID;
- inspect the current free catalog;
- choose the closest capability class;
- update this SOP after the new roster proves stable.

---

# 22. One-Screen Cheat Sheet

## Tiny discovery

**North Mini Code**

```powershell
opencode mini --model openrouter/cohere/north-mini-code:free
```

Then:

```text
@explore
```

## Normal Sideline reconnaissance

**Laguna S 2.1**

```powershell
opencode mini --model openrouter/poolside/laguna-s-2.1:free
```

Then:

```text
@explore
```

## Big ugly archaeology / huge context / contradictions

**Nemotron 3 Ultra**

```powershell
opencode mini --model openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
```

Then:

```text
@explore
```

## Middle route / backup

**Nemotron 3 Super**

```powershell
opencode mini --model openrouter/nvidia/nemotron-3-super-120b-a12b:free
```

Then:

```text
@explore
```

## Cannot decide?

> **Send Laguna.**

---

# 23. Current Crawl Play

Until Scout Play automation exists:

```text
1. Identify one bounded reconnaissance question.
2. Open this SOP.
3. Pick Quick / Default / Deep / Balanced.
4. Launch that exact free model in OpenCode Mini.
5. Invoke @explore.
6. Paste the Universal Scout Play Template + the real question.
7. Let the Scout investigate read-only.
8. Receive the complete Scout Report.
9. Persist it under REPORTS/Scout Only/<Play>/.
10. Read the recommendation.
11. Decide: Worker, Sonnet, Opus, another Scout, or stop.
12. End the Scout Play.
```

That is enough.

Do not wait for swarm automation before exploiting the Scout economy.

---

# Final Principle

> **The Scout carries the shovel.**  
> **The Architect chooses where to build.**  
> **The Worker builds it.**

For today's Sideline Coach:

> **Pick one Scout intelligently, keep it read-only, demand a high-quality map, and only then spend premium intelligence.**
