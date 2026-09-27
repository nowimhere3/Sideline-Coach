# SIDELINE COACH - S57.1 INTELLIGENT ROUTING

## R0 RESEARCHED CAPABILITY PRIOR PACK

**Research cutoff:** September 26, 2026
**Scope:** Claude / OpenAI-Codex / Gemini-Antigravity
**Purpose:** Public evidence reconnaissance only
**Status:** EVIDENCE, NOT VERDICT

---

# 0. METHODOLOGY AND GUARDRAILS

This package deliberately does **not** convert benchmark scores into Sideline routing probabilities, expected first-pass success, subscription burn, five-hour usage, weekly usage, or task-duration estimates.

The task-class ratings below mean:

* **VERY STRONG**: direct and current evidence strongly supports suitability for this class, usually including model-specific or effort-specific coding/agentic evidence.
* **STRONG**: substantial positive evidence, but with less direct coverage, less independent confirmation, or meaningful tradeoffs.
* **MODERATE**: useful evidence exists, but suitability is either workload-dependent, indirect, superseded by stronger configurations, or poorly measured.
* **WEAK**: current evidence or provider guidance points away from this configuration for that workload.
* **UNKNOWN**: there is not enough defensible public evidence.

These are **qualitative evidence assessments only**.

Benchmark percentages quoted below remain benchmark percentages. They must not be read as Sideline probabilities.

A second important limitation is harness sensitivity. A model can look excellent on one software-engineering benchmark and mediocre on another because tools, context management, allowed turns, environment, prompts, and grading differ substantially.

---

# 1. CURRENT MODEL MATRIX

## 1.1 Claude

Anthropic's current recommended lineup is Fable 5.1, Opus 5.5, Sonnet 5, and Haiku 4.5. Anthropic currently tells users to begin with Opus 5.5 for most workloads, move to Fable 5.1 for demanding reasoning or long-horizon work that still exceeds Opus, use Sonnet 5 for speed plus intelligence, and Haiku 4.5 for lowest latency and price.

| Model            | Public ID                   | Lineage / role        | Status                                | Effort controls                                             | Context | Primary documented strength                                              |
| ---------------- | --------------------------- | --------------------- | ------------------------------------- | ----------------------------------------------------------- | ------: | ------------------------------------------------------------------------ |
| Claude Fable 5.1 | `claude-fable-5-1`          | Frontier Fable branch | Active, latest; released Sep 1, 2026  | low / medium / high / xhigh / max; default high             |      1M | Demanding reasoning and long-horizon agentic work                        |
| Claude Opus 5.5  | `claude-opus-5-5`           | Latest Opus branch    | Active, latest; released Sep 22, 2026 | low / medium / high / xhigh / max; default medium           |      1M | Long-running agentic coding, complex systems engineering, knowledge work |
| Claude Sonnet 5  | `claude-sonnet-5`           | Current Sonnet branch | Active                                | low / medium / high / xhigh / max; default high             |      1M | Everyday coding and agent work balancing speed and capability            |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Current Haiku branch  | Active, but near lifecycle boundary   | **No effort parameter**; optional extended thinking instead |    200K | Lowest latency, lowest Claude price, high-volume/checkable work          |

Fable 5.1 costs $10/$50 per million input/output tokens, Opus 5.5 $4/$20, Sonnet 5 $2/$10, and Haiku 4.5 $1/$5. Anthropic labels their comparative latency slower, moderate, fast, and fastest respectively. Haiku's retirement is committed only through October 15, 2026, making its lifecycle especially relevant to future routing logic.

Older Fable 5, Opus 5, Opus 4.x and Sonnet 4.x models may still be technically active, but they are not the current recommended routing frontier. Opus 5 is explicitly described as legacy on its own model page, with migration to Opus 5.5 recommended.

---

## 1.2 OpenAI / Codex

OpenAI's current flagship software-work family is GPT-6. The public model catalog recommends Astra for the highest capability, Sol for demanding reasoning/coding with a lower cost, and Luna for efficient repeatable or high-volume work.

| Model       | Public ID     | Lineage / role             | Status                         | Effort controls                                          | Context | Primary documented strength                                |
| ----------- | ------------- | -------------------------- | ------------------------------ | -------------------------------------------------------- | ------: | ---------------------------------------------------------- |
| GPT-6 Astra | `gpt-6-astra` | GPT-6 flagship             | Current flagship               | low / medium / high / xhigh / max                        |   1.05M | Hardest end-to-end reasoning, coding and computer-use work |
| GPT-6 Sol   | `gpt-6-sol`   | GPT-6 balanced/coding tier | Current; released Sep 22, 2026 | none / low / medium / high / xhigh / max; default medium |   1.05M | Complex coding and agentic workflows                       |
| GPT-6 Luna  | `gpt-6-luna`  | GPT-6 efficiency tier      | Current; released Sep 22, 2026 | none / low / medium / high / xhigh / max; default medium |   1.05M | Focused, high-volume, cost-sensitive tasks                 |

API list pricing is $10/$50 for Astra, $2/$10 for Sol, and $0.10/$0.50 for Luna per million short-context input/output tokens. Long-context pricing differs.

Sol and Luna entered **Codex and ChatGPT Work on September 22, 2026**. OpenAI states that product-level model and reasoning-effort availability varies with plan and workspace settings.

GPT-5.6 models remain accessible in some surfaces, but current OpenAI guidance is explicitly centered on GPT-6. They should therefore be treated as historical/superseded evidence when constructing new priors, unless Sideline's actual product environment still exposes them.

---

## 1.3 Gemini / Antigravity

The current Antigravity reasoning-model selector documents Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, and 3.1 Pro.

| Model            | Public ID                | Lineage / role            | Status                    | API thinking levels                           | Antigravity exposure | Primary documented strength                                       |
| ---------------- | ------------------------ | ------------------------- | ------------------------- | --------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| Gemini 3.8 Flash | `gemini-3.8-flash`       | Successor to 3.7 Flash    | GA / Stable; Sep 2, 2026  | low / medium / high; default medium           | Current              | Long-horizon SWE, autonomous agents, complex enterprise workflows |
| Gemini 3.7 Flash | `gemini-3.7-flash`       | Previous-generation Flash | Stable; Aug 13, 2026      | low / medium / high; default medium           | Current              | Complex coding, agentic workflows, multi-step execution           |
| Gemini 3.6 Flash | `gemini-3.6-flash`       | Previous-generation Flash | Stable; Jul 21, 2026      | minimal / low / medium / high; default medium | Current              | Fast agentic loops, coding iterations, everyday agent work        |
| Gemini 3.1 Pro   | `gemini-3.1-pro-preview` | Pro reasoning branch      | **Preview**; Feb 19, 2026 | low / medium / high; default high             | Current              | Complex reasoning, software engineering, precise multi-step tools |

Google's API docs explicitly document these effort levels. Antigravity's current CLI exposes `--effort low`, `medium`, or `high`; its published model-slug examples include 3.8, 3.7 and 3.6 Medium/High plus 3.1 Pro High. Thus Gemini 3.6's API `minimal` level is documented at the API layer but is **not documented as an Antigravity effort option**.

Google added per-model Low, Medium and High reasoning controls to Antigravity in version 2.12.0 on September 2, 2026.

Gemini 3.5 Flash remains a stable Gemini API model and appears in an Antigravity CLI example, but it is no longer listed among the primary reasoning-model choices on the current Antigravity Models page. Gemini 3.5 Flash-Lite is also API-stable but its selectable Antigravity status is not established by the current public model list. They are therefore **secondary inventory, not core routing candidates in this pack**.

---

# 2. TASK-CLASS EVIDENCE

## Evidence key

**C1 - Claude model-role evidence.** Anthropic explicitly positions Fable 5.1 for demanding reasoning/long-horizon agents, Opus 5.5 for complex agentic coding and systems engineering, Sonnet 5 for everyday coding/agent work, and Haiku 4.5 for high-volume/low-latency work.

**C2 - Claude effort evidence.** Low is intended for simple/speed-sensitive work; medium for balanced agent work; high for difficult coding and reasoning; xhigh for long-running coding/agent work; max for maximum capability. Sonnet 5 has model-specific guidance with high as default and xhigh for its hardest coding work.

**C3 - Claude measured effort evidence.** On Anthropic's internal SWE-bench Pro subset, Opus 5.5 medium approximately matched Fable 5.1's default while costing much less. Opus 5.5 long-horizon coding showed a meaningful effort curve: medium roughly 2.5 points below high, low roughly 8 points below high, and xhigh roughly 1.4 points above high but at much greater cost. Anthropic explicitly warns these scores are not comparable to the public leaderboard.

**C4 - Claude lower-effort efficiency evidence.** Anthropic found several research/knowledge workloads nearly flat across effort, with low substantially cheaper and faster; the same document says Haiku 4.5 falls much further behind on long coding work and is a better fit for high-volume tasks with checkable outputs.

**O1 - OpenAI model-role evidence.** Astra is the maximum-capability tier; Sol targets demanding coding/agentic work; Luna targets efficient repeatable/high-volume work.

**O2 - OpenAI effort evidence.** None is for latency-critical non-reasoning work; low for efficient execution-oriented coding; medium for agentic coding/general workloads; high for complex debugging and deep planning; xhigh for long-running challenging coding/security review; max for the hardest tasks.

**O3 - Astra effort/coding evidence.** OpenAI reports Astra as its strongest software-engineering model. Lovable tested low, medium and high and reported all materially ahead of GPT-5.6 Sol, with higher effort producing more iterations, browser verification and code execution. Astra also preserves searchable history across Codex context windows for long debugging/refactoring sessions.

**O4 - Independent Astra effort evidence.** Artificial Analysis currently reports Astra Intelligence Index values rising from 46 at low to 50 medium, 51 high, 52 xhigh and 53 max, while cost per task rises substantially.

**O5 - Independent Sol/Luna evidence.** Artificial Analysis finds Sol max improved its Coding Agent Index versus GPT-5.6 Sol while costing substantially less, but Luna max regressed slightly versus GPT-5.6 Luna. Both models show mixed gains and regressions across different evaluations.

**G1 - Gemini model-role evidence.** Google positions 3.8 for long-horizon SWE/autonomous agents, 3.7 for complex coding/agentic execution, 3.6 for rapid agentic coding loops, and 3.1 Pro for advanced reasoning and software-engineering/tool workflows.

**G2 - Gemini effort evidence.** Google documents medium as 3.8/3.7/3.6 default, high as deeper reasoning, and lower levels for latency/cost. 3.1 Pro defaults high.

**G3 - 3.8 coding evidence.** Google reports major long-horizon SWE gains for 3.8 over 3.7. DeepSWE's independently reproduced public results place 3.8 High near the frontier and Medium only moderately behind it on that specific harness.

**G4 - Current independent 3.8 effort evidence.** On Artificial Analysis v4.3, 3.8 High and Medium are very close overall, while Low loses substantially more on agentic benchmarks. High and Medium both score 20% on its Terminal-Bench 4.0 run; AutomationBench is 60% vs 61%, while Low falls to 10% Terminal-Bench and 37% AutomationBench.

**G5 - Antigravity harness evidence.** Antigravity agents can work across editor, terminal and browser surfaces, and current CLI/model controls expose model and reasoning-effort selection.

---

## 2.1 Claude task-class evidence

| Model / effort                | Architecture    | Implementation  | Quick           | Default         | Evidence basis                                                                                                            |
| ----------------------------- | --------------- | --------------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fable 5.1 low                 | STRONG          | STRONG          | MODERATE        | STRONG          | C1, C2, C4                                                                                                                |
| Fable 5.1 medium              | STRONG          | STRONG          | MODERATE        | STRONG          | C1, C2, C4                                                                                                                |
| Fable 5.1 high                | **VERY STRONG** | **VERY STRONG** | WEAK            | STRONG          | C1, C2                                                                                                                    |
| Fable 5.1 xhigh               | **VERY STRONG** | **VERY STRONG** | WEAK            | MODERATE        | C1, C2                                                                                                                    |
| Fable 5.1 max                 | **VERY STRONG** | **VERY STRONG** | WEAK            | MODERATE        | C1, C2                                                                                                                    |
| Opus 5.5 low                  | STRONG          | STRONG          | STRONG          | STRONG          | C1, C2, C3                                                                                                                |
| Opus 5.5 medium               | **VERY STRONG** | **VERY STRONG** | MODERATE        | **VERY STRONG** | C1, C3                                                                                                                    |
| Opus 5.5 high                 | **VERY STRONG** | **VERY STRONG** | WEAK            | STRONG          | C2, C3                                                                                                                    |
| Opus 5.5 xhigh                | **VERY STRONG** | **VERY STRONG** | WEAK            | MODERATE        | C2, C3                                                                                                                    |
| Opus 5.5 max                  | **VERY STRONG** | **VERY STRONG** | WEAK            | MODERATE        | C1, C2                                                                                                                    |
| Sonnet 5 low                  | MODERATE        | MODERATE        | **VERY STRONG** | STRONG          | C1, C2                                                                                                                    |
| Sonnet 5 medium               | STRONG          | STRONG          | STRONG          | **VERY STRONG** | C1, C2                                                                                                                    |
| Sonnet 5 high                 | STRONG          | **VERY STRONG** | MODERATE        | **VERY STRONG** | C1, C2                                                                                                                    |
| Sonnet 5 xhigh                | STRONG          | **VERY STRONG** | WEAK            | STRONG          | C2                                                                                                                        |
| Sonnet 5 max                  | STRONG          | **VERY STRONG** | WEAK            | STRONG          | C2                                                                                                                        |
| Haiku 4.5 standard            | WEAK            | MODERATE        | **VERY STRONG** | MODERATE        | C1, C4                                                                                                                    |
| Haiku 4.5 + extended thinking | MODERATE        | STRONG          | STRONG          | MODERATE        | Anthropic explicitly says extended thinking materially improves Haiku coding/reasoning; no named effort parameter exists. |

**Important nuance:** Fable 5.1's frontier status does not mean it automatically dominates Opus 5.5 on coding. Anthropic's own September measurements found Opus 5.5 medium matching or beating Fable configurations on multiple coding measurements at much lower cost.

---

## 2.2 OpenAI / Codex task-class evidence

| Model / effort | Architecture    | Implementation  | Quick           | Default         | Evidence basis |
| -------------- | --------------- | --------------- | --------------- | --------------- | -------------- |
| Astra low      | STRONG          | **VERY STRONG** | MODERATE        | STRONG          | O1, O3, O4     |
| Astra medium   | **VERY STRONG** | **VERY STRONG** | MODERATE        | **VERY STRONG** | O1, O2, O3     |
| Astra high     | **VERY STRONG** | **VERY STRONG** | WEAK            | **VERY STRONG** | O2, O3, O4     |
| Astra xhigh    | **VERY STRONG** | **VERY STRONG** | WEAK            | STRONG          | O2, O4         |
| Astra max      | **VERY STRONG** | **VERY STRONG** | WEAK            | STRONG          | O1, O2, O4     |
| Sol none       | WEAK            | MODERATE        | **VERY STRONG** | MODERATE        | O1, O2         |
| Sol low        | MODERATE        | STRONG          | **VERY STRONG** | STRONG          | O1, O2         |
| Sol medium     | STRONG          | **VERY STRONG** | STRONG          | **VERY STRONG** | O1, O2, O5     |
| Sol high       | STRONG          | **VERY STRONG** | MODERATE        | STRONG          | O2, O5         |
| Sol xhigh      | **VERY STRONG** | **VERY STRONG** | WEAK            | STRONG          | O2             |
| Sol max        | **VERY STRONG** | **VERY STRONG** | WEAK            | STRONG          | O2, O5         |
| Luna none      | WEAK            | MODERATE        | **VERY STRONG** | MODERATE        | O1, O2, O5     |
| Luna low       | WEAK            | MODERATE        | **VERY STRONG** | STRONG          | O1, O2         |
| Luna medium    | MODERATE        | STRONG          | **VERY STRONG** | STRONG          | O1, O2, O5     |
| Luna high      | MODERATE        | STRONG          | STRONG          | STRONG          | O2, O5         |
| Luna xhigh     | MODERATE        | STRONG          | MODERATE        | STRONG          | O2, O5         |
| Luna max       | MODERATE        | STRONG          | MODERATE        | STRONG          | O2, O5         |

The Luna ratings deliberately do not assume that enough reasoning can turn Luna into Sol or Astra. Artificial Analysis reports Luna max below Sol max on its current Coding Agent Index and slightly below its own GPT-5.6 Luna predecessor on that benchmark, despite dramatically lower cost.

---

## 2.3 Gemini / Antigravity task-class evidence

| Model / effort        | Architecture    | Implementation  | Quick           | Default         | Evidence basis                                                           |
| --------------------- | --------------- | --------------- | --------------- | --------------- | ------------------------------------------------------------------------ |
| Gemini 3.8 low        | MODERATE        | STRONG          | **VERY STRONG** | STRONG          | G1, G2, G4                                                               |
| Gemini 3.8 medium     | STRONG          | **VERY STRONG** | STRONG          | **VERY STRONG** | G1, G2, G3, G4                                                           |
| Gemini 3.8 high       | STRONG          | **VERY STRONG** | MODERATE        | STRONG          | G1, G2, G3, G4                                                           |
| Gemini 3.7 low        | MODERATE        | MODERATE        | **VERY STRONG** | STRONG          | G1, G2                                                                   |
| Gemini 3.7 medium     | MODERATE        | STRONG          | STRONG          | STRONG          | G1, G2, G3                                                               |
| Gemini 3.7 high       | STRONG          | STRONG          | MODERATE        | STRONG          | G1, G2, G3                                                               |
| Gemini 3.6 minimal    | WEAK            | MODERATE        | **VERY STRONG** | MODERATE        | API-documented only; current Antigravity exposure **UNVERIFIED**. G1, G2 |
| Gemini 3.6 low        | WEAK            | MODERATE        | **VERY STRONG** | STRONG          | G1, G2                                                                   |
| Gemini 3.6 medium     | MODERATE        | STRONG          | STRONG          | STRONG          | G1, G2                                                                   |
| Gemini 3.6 high       | MODERATE        | STRONG          | MODERATE        | STRONG          | G1, G2                                                                   |
| Gemini 3.1 Pro low    | STRONG          | MODERATE        | MODERATE        | MODERATE        | G1, G2                                                                   |
| Gemini 3.1 Pro medium | STRONG          | MODERATE        | MODERATE        | STRONG          | G1, G2                                                                   |
| Gemini 3.1 Pro high   | **VERY STRONG** | MODERATE        | WEAK            | STRONG          | G1, G2                                                                   |

The apparently conservative implementation rating for **Gemini 3.1 Pro High** is intentional. Google directly positions it for complex problem solving, advanced reasoning and software-engineering workflows, but current long-horizon coding evidence is highly conflicted. A current DeepSWE dataset reports 3.1 Pro Preview High far below newer Flash models on that particular harness. Therefore its Architecture evidence is stronger than its current repository-implementation evidence.

---

# 3. REASONING / EFFORT COMPARISON

## 3.1 Claude

Claude's current effort control is unusually explicit.

**Low** reduces thinking, output, tool calls and cost. Anthropic directly recommends it for simple, routine, high-volume and latency-sensitive work. It is not equivalent to "thinking disabled." Difficult inputs can still trigger reasoning.

**Medium** is especially significant on Opus 5.5 because it is the model's default. Anthropic's own SWE-bench Pro subset showed medium close to high but materially cheaper, while medium approximately matched Fable 5.1's default on that evaluation.

**High** is the explicit difficult-coding/complex-reasoning tier.

**Xhigh** is specifically documented for long-running agentic and coding work, especially tasks lasting more than roughly 30 minutes and using very large token budgets.

**Max** removes effort constraints and asks for maximum capability.

Most importantly, effort is **not uniformly valuable**. Anthropic found some research/knowledge tasks nearly flat from medium through default, while long-horizon coding had a much clearer effort-response curve.

Therefore, the evidence supports the statement:

> More Claude effort can materially help difficult long-horizon coding, but maximum effort is not universally justified by task difficulty alone.

---

## 3.2 OpenAI

OpenAI's current public semantics are similarly explicit.

**None:** latency-critical tasks that do not benefit from reasoning or chained tools.

**Low:** efficient reasoning for execution-oriented coding, tools, search, planning and bounded multi-step work.

**Medium:** OpenAI's balanced agentic-coding/general-work tier.

**High:** complex debugging, deep planning and hard agentic workflows.

**Xhigh:** challenging coding, security/code review and long-running asynchronous work.

**Max:** maximum reasoning for the hardest tasks.

Astra provides unusually useful direct effort evidence. Lovable reports that increasing Astra effort creates more implementation iterations, more browser verification and more actual code execution. Independent Artificial Analysis results also show progressive aggregate capability gains from low through max, accompanied by progressively greater cost.

However, one important warning emerges from DeepSWE. Astra's public DeepSWE result is not monotonically better at max: its xhigh result slightly exceeds high and max in the currently published run. That is evidence against a simplistic assumption that `max > xhigh > high` on every individual coding task.

---

## 3.3 Gemini

Gemini uses `thinking_level`, with models dynamically adapting within the selected level.

For 3.8 and 3.7:

* **Low**
* **Medium**, default
* **High**

For 3.6 API:

* **Minimal**
* **Low**
* **Medium**, default
* **High**

For 3.1 Pro Preview:

* **Low**
* **Medium**
* **High**, default

Antigravity itself publicly exposes **Low / Medium / High**, not Minimal.

Gemini 3.8 offers particularly interesting current evidence. On Artificial Analysis v4.3, Medium and High are extremely close in aggregate score and identical on its Terminal-Bench 4.0 run, while Low drops materially on Terminal-Bench and AutomationBench. Meanwhile DeepSWE shows High ahead of Medium on long-horizon repository work.

That supports a conservative statement:

> Public evidence suggests Gemini 3.8 Medium retains much of High's capability on some workloads, but High shows a clearer benefit on at least some long-horizon software-engineering evaluations. Low has a more substantial capability tradeoff.

It does **not** establish a universal Medium-to-High improvement rate.

---

# 4. MODEL FAMILY / LINEAGE MAP

```text
CLAUDE

Claude
├─ Fable branch
│  └─ Fable 5.1
│     ├─ low
│     ├─ medium
│     ├─ high [default]
│     ├─ xhigh
│     └─ max
│
├─ Opus branch
│  ├─ Opus 5 [legacy/superseded for new selection]
│  └─ Opus 5.5
│     ├─ low
│     ├─ medium [default]
│     ├─ high
│     ├─ xhigh
│     └─ max
│
├─ Sonnet branch
│  └─ Sonnet 5
│     ├─ low
│     ├─ medium
│     ├─ high [default]
│     ├─ xhigh
│     └─ max
│
└─ Haiku branch
   └─ Haiku 4.5
      ├─ standard
      └─ extended thinking
         [no public low/medium/high effort control]
```

Anthropic explicitly says effort names should not be assumed to correspond to identical amounts of reasoning across different model generations.

```text
OPENAI / CODEX

GPT-6 family
├─ Astra
│  ├─ low
│  ├─ medium
│  ├─ high
│  ├─ xhigh
│  └─ max
│
├─ Sol
│  ├─ none
│  ├─ low
│  ├─ medium [default]
│  ├─ high
│  ├─ xhigh
│  └─ max
│
└─ Luna
   ├─ none
   ├─ low
   ├─ medium [default]
   ├─ high
   ├─ xhigh
   └─ max

GPT-5.6 family
└─ still available in some surfaces, but superseded by GPT-6
   for current new-work guidance
```

OpenAI describes Sol and Luna as part of the GPT-6 family and directs current developers to choose among Astra, Sol and Luna according to capability, latency and cost.

```text
GEMINI / ANTIGRAVITY

Gemini 3
├─ Pro branch
│  └─ 3.1 Pro Preview
│     ├─ low
│     ├─ medium
│     └─ high [API default]
│
└─ Flash branch
   ├─ 3.5 Flash
   │  └─ current API, secondary/older Antigravity evidence
   │
   ├─ 3.6 Flash
   │  ├─ minimal [API only, Antigravity exposure UNVERIFIED]
   │  ├─ low
   │  ├─ medium [default]
   │  └─ high
   │
   ├─ 3.7 Flash
   │  ├─ low
   │  ├─ medium [default]
   │  └─ high
   │
   └─ 3.8 Flash
      ├─ low
      ├─ medium [default]
      └─ high
```

Google's model card explicitly states that **Gemini 3.8 Flash is based on Gemini 3.7 Flash**.

---

# 5. STRONGEST EVIDENCE FOR LATER ROUTING WORK

## Finding 1 - Model generation matters enough to invalidate old family assumptions

The frontier changed twice in September alone. Fable 5.1 arrived September 1, GPT-6 Astra in early September, and Opus 5.5 plus GPT-6 Sol/Luna arrived September 22. A routing system hard-coded around Opus 5, GPT-5.6 Sol, or Gemini 3.7 would already be operating on stale capability assumptions.

---

## Finding 2 - Opus 5.5 Medium has unusually strong evidence as a balanced coding point

Anthropic explicitly made Medium the Opus 5.5 default. On its controlled long-horizon coding measurements, Medium gave up some performance to High but used materially less resource, and on another SWE-bench Pro subset Medium approximately matched Fable 5.1's default at much lower cost.

This does not prove Sideline should choose it by default. It does give the future Architect unusually strong prior evidence to investigate.

---

## Finding 3 - High effort is genuinely useful on some hard coding work

Anthropic's controlled Opus 5.5 measurement found a real long-horizon SWE improvement from Medium to High and another improvement from High to Xhigh, albeit with rapidly increasing cost. OpenAI also documents High specifically for complex debugging and agentic coding.

---

## Finding 4 - Maximum effort is not universally superior

Astra's currently published DeepSWE xhigh result slightly exceeds Astra max. Gemini 3.8 High and Medium are nearly indistinguishable on several current Artificial Analysis evaluations. Anthropic has also measured workloads where additional effort produced little measurable benefit.

This is strong evidence against equating task difficulty with “always use maximum.”

---

## Finding 5 - Low effort can preserve substantial capability

Current Astra Low still performs strongly enough to sit on Artificial Analysis's capability/cost frontier for its measured range. Claude Fable and Opus measurements also show substantial retained capability at Low, although difficult long-horizon coding suffers more.

That provides a real empirical reason to test low-effort tiers for bounded work rather than treating them as merely degraded versions.

---

## Finding 6 - Gemini 3.8 Medium deserves separate evaluation from High

Google's default is Medium. Artificial Analysis currently finds only a one-point composite gap between 3.8 Medium and High, while DeepSWE shows a larger but still moderate difference on long-horizon SWE.

The evidence therefore supports testing both rather than collapsing Gemini into one capability point.

---

## Finding 7 - Model tier and effort are not interchangeable

Luna Max is not simply “cheap Astra.” Sonnet Max is not automatically Fable. Fable Low can compete surprisingly well with smaller models. Current provider and independent results show that architecture/model capacity and effort each affect performance differently.

---

## Finding 8 - Quick work has direct provider guidance favoring cheaper/lower-effort configurations

Anthropic says Low for simple/speed-sensitive work. OpenAI says None or Low for latency-sensitive/execution-oriented workloads. Google exposes Low for reducing reasoning cost/latency, and Antigravity exposes that setting directly.

This is stronger evidence than merely assuming smaller models should receive QUICK work.

---

## Finding 9 - Repository-scale coding must be treated as a distinct workload

DeepSWE produces materially different model ordering from Terminal-Bench 4.0 and broad reasoning composites. Models also vary in context persistence and harness behavior. Astra, for example, now has experimental Codex mechanisms for retaining/searching information across context windows during long sessions.

---

## Finding 10 - Public API cost does not tell us Sideline subscription consumption

Per-token pricing gives useful relative API resource evidence but says nothing defensible about Sideline's five-hour window or weekly subscription consumption. Product quotas, plan multipliers, internal compute accounting and effort handling are separate variables.

**Sideline consumption mapping remains UNVERIFIED.**

---

# 6. CONTRADICTIONS AND DISAGREEMENTS

## 6.1 Gemini 3.8: outstanding DeepSWE, weak Terminal-Bench 4.0 relative to frontier Claude

DeepSWE places Gemini 3.8 High essentially at the frontier, around the same region as Astra and older Opus 5. Yet current Artificial Analysis Terminal-Bench 4.0 gives Gemini 3.8 High only 20%, while Opus 5.5 reaches approximately 60% at max in the same current AA ecosystem.

**Interpretation:** software-engineering capability is not one scalar. Different harnesses reward different behaviors.

**Resolution:** none. Preserve both findings.

---

## 6.2 Gemini 3.8's Artificial Analysis score changed dramatically after benchmark revision

Artificial Analysis's September 2 launch article reported Gemini 3.8 High at 59 on the then-current Intelligence Index. Its current v4.3 release page reports 41.

Artificial Analysis substantially changed the index on September 7, including Terminal-Bench 4.0 and AutomationBench-AA.

This should **not** be interpreted as evidence that Gemini suddenly became worse.

It is evidence that cross-version benchmark numbers cannot safely be compared.

---

## 6.3 OpenAI release positioning versus independent Sol/Luna results

OpenAI describes GPT-6 Sol and Luna as bringing GPT-6 advances into cheaper models. Artificial Analysis agrees strongly on cost efficiency but finds overall capability more mixed: Sol improves on its Coding Agent Index, while Luna slightly regresses, and both show gains and regressions across individual evaluations.

Provider claim and independent evaluation are therefore directionally aligned on efficiency but not on universal capability improvement.

---

## 6.4 Anthropic frontier branding versus Opus 5.5 coding economics

Anthropic identifies Fable 5.1 as its highest widely available capability model. Yet Anthropic's own recent coding measurements show Opus 5.5 Medium matching Fable's default on one controlled SWE subset and beating Fable Medium in another internal coding test while costing much less.

This is not necessarily contradictory technically. It demonstrates that **frontier general capability does not guarantee best performance/cost on a particular coding workload**.

---

## 6.5 Gemini 3.1 Pro's architectural positioning versus current coding evidence

Google positions 3.1 Pro for complex reasoning, software engineering, precise tools and reliable multi-step execution.

Yet current DeepSWE data reports the 3.1 Pro Preview High configuration far behind 3.8/3.7 on its long-horizon repository tasks.

Possible explanations include harness specialization, model age, coding-specific weakness, or improvements in later Flash generations.

**No public evidence currently resolves this cleanly.**

---

## 6.6 Astra effort does not exhibit strict monotonicity on every benchmark

DeepSWE currently reports Astra xhigh slightly above high and max.

Artificial Analysis's broader composite, however, rises progressively from Astra Low through Max.

Thus effort produces a broad capability trend, but not a guaranteed monotonic result on every task family.

---

# 7. STALE EVIDENCE

## Definitely stale for current top-of-family comparison

**Claude Opus 5 results:** Opus 5.5 released September 22 and is now Anthropic's recommended Opus. Opus 5's own documentation directs users toward 5.5.

**GPT-5.6 results:** GPT-6 Astra, Sol and Luna are now OpenAI's current family. GPT-5.6 remains historically useful but should not define current new-work priors.

**Gemini 3.7 as Google's Flash ceiling:** 3.8 replaced it September 2 and Google now calls 3.7 previous-generation.

**Gemini 3.6 as current coding ceiling:** still stable and available, but superseded twice by 3.7 and 3.8.

---

## Current sources containing stale competitors

Google's September 2 Gemini 3.8 model card compares against Claude Opus 5 and GPT-5.6 Sol. Both were superseded by important releases on September 22. Therefore the card remains valid evidence about Gemini 3.8 itself, but its cross-provider ranking is already partially stale.

DeepSWE's current public result set contains GPT-6 Astra and Gemini 3.8, but the displayed dataset still uses Claude Opus 5 rather than 5.5 and does not yet provide equivalent GPT-6 Sol/Luna rows in the visible leaderboard. It is therefore incomplete for a September 26 frontier comparison.

---

## Benchmark-version stale evidence

Artificial Analysis's pre-September-7 Intelligence Index numbers should not be numerically compared against v4.3 values because the evaluation composition changed materially.

---

## Lifecycle caution

Claude Haiku 4.5 is still active, but Anthropic's current commitment says retirement will be **not sooner than October 15, 2026**, only weeks after this research snapshot. Any future routing prior tied specifically to Haiku 4.5 should therefore be version-aware.

---

# 8. WHAT WE STILL DO NOT KNOW

## 8.1 Real Sideline first-pass acceptance

No public benchmark measures:

> "Did the implementation satisfy Sideline's actual request, fit the existing architecture, pass local tests, respect invariants, and require no human-requested second pass?"

**UNVERIFIED**

This likely requires Routing Film.

---

## 8.2 Real Sideline task duration

Public token throughput, TTFT and benchmark runtime are not enough to estimate Sideline elapsed time because real duration includes:

* repository inspection
* tool calls
* builds
* tests
* browser work
* waiting on subprocesses
* context acquisition
* corrections
* human review
* provider queuing

**UNVERIFIED**

---

## 8.3 Five-hour usage consumption

No defensible public mapping was found between:

* task
* model
* effort
* API token usage
* Sideline's observed five-hour subscription consumption

**UNVERIFIED**

---

## 8.4 Weekly usage consumption

Same issue.

Subscription-window accounting is not equivalent to API pricing and may involve private provider resource calculations.

**UNVERIFIED**

---

## 8.5 Architecture-specific benchmark quality

Most coding benchmarks emphasize implementation, terminal interaction, bug repair, test passing or repository tasks.

There is far less rigorous public evidence for questions such as:

* selecting the right architecture before coding
* identifying long-term technical debt
* evaluating alternative system designs
* preserving project invariants
* deciding what **not** to implement

Architecture remains much less measured than implementation.

---

## 8.6 Antigravity-specific model performance

Gemini benchmark results usually test Gemini through an API harness such as mini-swe-agent, not necessarily through the current Antigravity IDE/CLI harness.

Antigravity itself contributes:

* agent orchestration
* planning
* editor integration
* browser operation
* terminal operation
* context management
* plugins
* subagents
* artifact review

Therefore:

> Gemini 3.8 API benchmark performance != demonstrated Gemini 3.8 Antigravity performance.

The relationship is plausible but **UNVERIFIED quantitatively**.

---

## 8.7 Codex-specific versus raw-model performance

The same issue applies to OpenAI. Codex adds its own harness, context handling, tools and agent behavior. Astra's context-retention capability is specifically integrated with Codex, illustrating how much the product layer can matter.

---

## 8.8 Effective long-context performance

A 1M-token window proves capacity, not perfect reasoning over one million tokens.

Claude Fable/Opus/Sonnet, GPT-6 and Gemini 3.x all advertise approximately 1M input context, but that does not establish equal:

* retrieval quality
* dependency tracking
* codebase comprehension
* resistance to lost details
* reasoning accuracy at extreme context depth

**Comparable current evidence is insufficient.**

---

## 8.9 Debugging as a distinct category

OpenAI explicitly names complex debugging in its High-effort guidance, and all three ecosystems have software-repair evidence, but there is no clean current benchmark across every model × effort configuration that isolates debugging from implementation.

**Comparative debugging priors remain incomplete.**

---

## 8.10 Model drift and aliases

Provider aliases, serving infrastructure, safety layers, context handling and agent harnesses can change without a model-name change.

Google explicitly distinguishes stable, preview, latest and experimental aliases. Antigravity also updates its agent harness independently of Gemini model releases.

Any eventual routing system needs version/date awareness.

---

# 9. SOURCE TABLE

| Source                                               | Publisher                  | Date                                        | URL                                                                                                                                                          | Supports                                                           |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Models overview                                      | Anthropic                  | Current, accessed Sep 26 2026               |                                                                                                                                                              | Current Claude lineup, IDs, pricing, context, latency, lifecycle   |
| Choosing the right model                             | Anthropic                  | Current                                     |                                                                                                                                                              | Fable/Opus/Sonnet/Haiku workload positioning                       |
| Effort                                               | Anthropic                  | Current                                     |                                                                                                                                                              | Low/medium/high/xhigh/max semantics and model support              |
| Optimizing for cost and intelligence                 | Anthropic                  | Current; includes Aug-Sep 2026 measurements | [Claude cost and intelligence research](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence?utm_source=chatgpt.com) | Measured effort tradeoffs and coding economics                     |
| Opus 5.5/Fable SWE comparison                        | Anthropic                  | Sep 2026 measurements                       | [Anthropic measured Opus 5.5 evidence](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence)                         | Opus medium/low coding and cost evidence                           |
| Sonnet 5 effort guidance                             | Anthropic                  | Current                                     | [Claude Sonnet 5 effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort?utm_source=chatgpt.com)                                       | Sonnet effort task suitability                                     |
| Haiku 4.5 migration guidance                         | Anthropic                  | Current                                     | [Claude Haiku 4.5 guidance](https://platform.claude.com/docs/en/models/haiku-4-5/migration-guide?utm_source=chatgpt.com)                                     | Haiku speed and extended-thinking coding improvement               |
| Model deprecations                                   | Anthropic                  | Current                                     | [Claude model lifecycle table](https://platform.claude.com/docs/en/about-claude/model-deprecations?utm_source=chatgpt.com)                                   | Active/retired status and lifecycle dates                          |
| GPT-6 Astra model page                               | OpenAI                     | Current                                     |                                                                                                                                                              | Astra ID, efforts, context and price                               |
| GPT-6 Sol model page                                 | OpenAI                     | Sep 2026                                    |                                                                                                                                                              | Sol ID, efforts, tools, context and price                          |
| GPT-6 Luna model page                                | OpenAI                     | Sep 2026                                    | [GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna?utm_source=chatgpt.com)                                            | Luna ID, efforts, tools, context and price                         |
| Reasoning models                                     | OpenAI                     | Current                                     |                                                                                                                                                              | Effort meanings and intended workloads                             |
| GPT-6 model guidance                                 | OpenAI                     | Current                                     | [GPT-6 model guidance](https://developers.openai.com/api/docs/guides/latest-model?utm_source=chatgpt.com)                                                    | Astra/Sol/Luna model selection and GPT-6 features                  |
| GPT-6 Astra: A new generation of intelligence        | OpenAI                     | Sep 2026                                    |                                                                                                                                                              | Coding claims, effort behavior, Codex context persistence          |
| GPT-6 Sol/Luna Codex release notes                   | OpenAI                     | Sep 22 2026                                 | [OpenAI September 22 release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes?utm_source=chatgpt.com)                                | Current Codex availability                                         |
| Benchmarking GPT-6 Astra                             | Artificial Analysis        | Sep 9 2026                                  | [Artificial Analysis Astra benchmark](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra?utm_source=chatgpt.com)                                | Independent Astra cost/capability evidence                         |
| GPT-6 Astra release comparison                       | Artificial Analysis        | Sep 2026                                    | [Astra effort comparison](https://artificialanalysis.ai/models/releases/gpt-6-astra?utm_source=chatgpt.com)                                                  | Low through max effort results                                     |
| GPT-6 Sol and Luna push the cost efficiency frontier | Artificial Analysis        | Sep 22 2026                                 | [Artificial Analysis Sol/Luna evaluation](https://artificialanalysis.ai/articles/gpt-6-sol-and-luna-push-the-cost-efficiency-frontier)                       | Independent Sol/Luna coding, cost, gains and regressions           |
| Claude Opus 5.5 takes the top spot                   | Artificial Analysis        | Sep 22 2026                                 | [Artificial Analysis Opus 5.5 evaluation](https://artificialanalysis.ai/articles/claude-opus-5-5?utm_source=chatgpt.com)                                     | Current independent Opus 5.5 evidence                              |
| Gemini 3.8 Flash                                     | Google AI for Developers   | Sep 2026                                    |                                                                                                                                                              | ID, stable status, context, tools, reasoning levels                |
| Gemini thinking                                      | Google AI for Developers   | Current                                     |                                                                                                                                                              | Thinking levels and defaults by model                              |
| Gemini models                                        | Google AI for Developers   | Current                                     | [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models?utm_source=chatgpt.com)                                                                  | Stable/preview generations and current role descriptions           |
| Gemini 3.6 Flash                                     | Google AI for Developers   | Jul 2026                                    | [Gemini 3.6 Flash documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash?utm_source=chatgpt.com)                                       | Agentic coding role and status                                     |
| Gemini 3.7 Flash                                     | Google AI for Developers   | Aug 2026                                    | [Gemini 3.7 Flash documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?utm_source=chatgpt.com)                                       | 3.7 capabilities and efforts                                       |
| Gemini 3.1 Pro Preview                               | Google AI for Developers   | Feb 2026                                    | [Gemini 3.1 Pro documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview?utm_source=chatgpt.com)                                   | Pro preview status, SWE/tool positioning                           |
| Gemini 3.8 Flash model card                          | Google DeepMind            | Sep 2 2026                                  | [Gemini 3.8 Flash model card](https://deepmind.google/models/model-cards/gemini-3-8-flash/?authuser=834768478&utm_source=chatgpt.com)                        | Lineage, long-horizon SWE evidence, official benchmark disclosures |
| Gemini 3.8 Flash overview                            | Google DeepMind            | Current                                     | [Gemini 3.8 Flash overview](https://deepmind.google/models/gemini/flash/?utm_source=chatgpt.com)                                                             | Current coding/agent positioning and benchmark context             |
| Antigravity Models                                   | Google                     | Current                                     |                                                                                                                                                              | Models currently surfaced in Antigravity                           |
| Antigravity headless mode                            | Google                     | Current                                     | [Antigravity CLI model and effort controls](https://antigravity.google/docs/cli/headless/?utm_source=chatgpt.com)                                            | Model slugs and Low/Medium/High effort                             |
| Antigravity changelog                                | Google                     | Sep 2026                                    | [Antigravity changelog](https://www.antigravity.google/changelog?utm_source=chatgpt.com)                                                                     | Addition of effort controls and evolving harness                   |
| Gemini 3.8 release comparison                        | Artificial Analysis        | Sep 2026                                    | [Gemini 3.8 effort comparison](https://artificialanalysis.ai/models/releases/gemini-3-8-flash?utm_source=chatgpt.com)                                        | Independent Low/Medium/High comparison                             |
| Gemini 3.8 High vs Medium                            | Artificial Analysis        | Current                                     | [Gemini 3.8 High versus Medium](https://artificialanalysis.ai/models/comparisons/gemini-3-8-flash-vs-gemini-3-8-flash-medium?utm_source=chatgpt.com)         | Effort-specific agentic/terminal evidence                          |
| Gemini 3.8 High vs Low                               | Artificial Analysis        | Current                                     | [Gemini 3.8 High versus Low](https://artificialanalysis.ai/models/comparisons/gemini-3-8-flash-vs-gemini-3-8-flash-low?utm_source=chatgpt.com)               | Evidence for larger Low-to-High capability delta                   |
| Artificial Analysis Intelligence Index v4.3          | Artificial Analysis        | Sep 7 2026                                  | [Artificial Analysis v4.3 methodology update](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3?utm_source=chatgpt.com)     | Explains benchmark-version break                                   |
| DeepSWE results/changelog                            | DeepSWE public data mirror | Updated Sep 2026                            | [DeepSWE current result data](https://github.com/pricci1/deepswe-changelog?utm_source=chatgpt.com)                                                           | Repository-scale coding and effort comparisons                     |
| SWE-Bench Pro V2                                     | Scale Labs                 | Sep 22 2026                                 | [Scale SWE-Bench Pro V2](https://labs.scale.com/leaderboard/swe_bench_pro_public_v2?tab=full&utm_source=chatgpt.com)                                         | Additional current agentic SWE evidence                            |

---

# 10. RESEARCH BOTTOM LINE

The public evidence does **not** support one universal ordering such as:

`Fable > Opus > Astra > Sol > Gemini`

or:

`Max > Xhigh > High > Medium > Low` for every workload.

What it does support is a more useful set of facts:

1. **Task type matters.**
2. **Model tier matters.**
3. **Effort matters.**
4. **The interaction between model tier and effort matters.**
5. **High effort has clearer value on difficult long-horizon coding than on many routine workloads.**
6. **Medium frequently preserves a surprisingly large share of capability.**
7. **Low can be genuinely capable rather than merely a crippled mode.**
8. **Maximum effort is not guaranteed to win every evaluation.**
9. **Coding benchmarks disagree strongly enough that no single benchmark should define routing.**
10. **Provider/API economics cannot be converted into Sideline subscription-window consumption without local evidence.**
11. **Architecture is substantially less benchmarked than implementation.**
12. **The ecosystem is changing too quickly for model names or priors to be treated as permanent.**

The correct next stage is therefore not to manufacture probabilities from these benchmarks.

It is to hand this evidence to the Routing Architect, combine it with **Sideline Routing Film**, and normalize provider/model/effort observations against Sideline's own task classes and actual outcomes.

# EVIDENCE, NOT VERDICT.
