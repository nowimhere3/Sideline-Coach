# R0 Public Research — Perplexity Audit

Your reconnaissance pack is useful, but it contains a major temporal and evidence-quality issue: several claims are presented as verified facts even though the available evidence is mixed, vendor-reported, or internally inconsistent. As of September 26, 2026, the most defensible routing conclusion is that **Claude Opus 5.5, GPT-6 Astra, and Gemini 3.8 Flash are the relevant current frontier/workhorse models**, while the exact winner depends heavily on task type, harness, effort, and cost.

## Important corrections

### 1. Claude Opus 5.5 date and positioning

Your pack says Opus 5.5 launched around September 22, 2026. Anthropic’s official announcement is dated **September 22, 2026**, confirming the model ID `claude-opus-5-5`. Anthropic describes it as its new leading model and reports that it performs near Fable 5.1 on many tasks while costing 40% less than Opus 5.

Anthropic’s own coding figures are strong:

- Terminal-Bench 4.0: 66.4% at xhigh.
- FrontierCode Main: 54.4%.
- CursorBench 4.0: 57.8%.
- GDPval-AA v2.1: 1846 Elo.
- OSWorld 2.0: 81.8% partial score.

However, these figures are primarily vendor-reported, and the benchmark configurations are not necessarily identical to OpenAI’s or Google’s. Anthropic also notes that several results use adaptive thinking at maximum effort, so they should not be treated as default-effort capability.

One correction is especially important: the pack lists Claude Sonnet 5 as current, but Anthropic’s September 22 announcement says **Sonnet 5.5 and Haiku 5.5 were still forthcoming**. Therefore, Sonnet 5.5 should not be treated as already available unless a later source confirms its release.

Source: https://www.anthropic.com/claude-opus-5-5

### 2. GPT-6 Astra is real, but OpenAI’s claims need normalization

OpenAI’s official page identifies GPT-6 Astra as available through the API under `gpt-6-astra`, with standard pricing of $10 per million input tokens and $50 per million output tokens.

OpenAI reports:

- Terminal-Bench 4.0: 57.9%.
- DeepSWE v1.1: 74.1%.
- FrontierCode Main: 53.3%.
- AutomationBench: 41.4%.
- GPQA Diamond: 96.0%.
- OSWorld 2.0: 72.6%.
- Agents’ Last Exam: 59.3%.

These results support a strong classification for computer use, professional workflows, scientific reasoning, and difficult software-engineering tasks. But the coding evidence is not uniformly dominant: Claude Opus 5.5 reports 66.4% on Terminal-Bench 4.0, while Astra reports 57.9%; this is not necessarily a fair head-to-head because the effort settings and harnesses differ.

Astra should therefore be classified as:

- **Very strong:** computer use, tool-mediated professional work, science, difficult reasoning.
- **Strong:** repository-scale coding and agentic software engineering.
- **Not automatically superior:** ordinary implementation, documentation, or cost-sensitive coding.

Source: https://openai.com/index/gpt-6-astra/

### 3. GPT-6 Sol and Luna are cost tiers, not direct Astra substitutes

OpenAI officially lists GPT-6 Sol and Luna as API models `gpt-6-sol` and `gpt-6-luna`. Sol costs $2 per million input tokens and $10 per million output tokens; Luna costs $0.10 per million input tokens and $0.50 per million output tokens.

OpenAI reports that GPT-6 Sol at xhigh reaches an OSWorld 2.0 score of 60.5%, approximately matching Claude Opus 5 at medium effort at 60.3%, while costing about 80% less per task.

That supports the following routing interpretation:

- **GPT-6 Astra:** hardest tasks, maximum reliability, computer use, high-stakes agent execution.
- **GPT-6 Sol:** default OpenAI workhorse when quality matters but Astra cost is excessive.
- **GPT-6 Luna:** high-volume, low-cost, bounded tasks; do not assume it is equivalent to Astra merely because it supports high or max effort.

The pack’s “90–95% of Astra’s practical capability” characterization for Sol should be labeled as an estimate, not a verified capability measurement.

Source: https://openai.com/index/introducing-gpt-6-sol-and-luna/

## Revised routing matrix

| Task class | Preferred first choice | Alternative | Suggested effort |
| --- | --- | --- | --- |
| Small edits, syntax fixes, boilerplate | Gemini 3.8 Flash or GPT-6 Luna | Claude Haiku 4.5 / Sonnet-class fast mode | Low |
| Routine feature implementation | Claude Opus 5.5 or Gemini 3.8 Flash | GPT-6 Sol | Medium |
| Large refactor or migration | Claude Opus 5.5 | GPT-6 Astra | Medium to high |
| Ambiguous architecture across many repositories | Claude Opus 5.5 | GPT-6 Astra | High or xhigh |
| Computer-use workflow | GPT-6 Astra | Claude Opus 5.5 | High |
| Long-context repository inspection | GPT-6 Astra or Gemini Pro | Claude Opus 5.5 | Medium to high |
| High-throughput agent loops | Gemini 3.8 Flash | GPT-6 Luna | Low to medium |
| Security patching and defensive review | Gemini 3.8 Flash Cyber, where eligible | GPT-6 Astra or Claude with safeguards | High |
| Documentation, summaries, routine business automation | Gemini 3.8 Flash or GPT-6 Sol | Claude Opus 5.5 | Low to medium |
| Maximum-quality independent verification | Claude Opus 5.5 plus GPT-6 Astra cross-check | Gemini Pro | High |

Google describes Gemini 3.8 Flash as a workhorse optimized for agentic workflows, software engineering, and multi-step reasoning. Its introductory API price is $0.75 per million input tokens and $3.75 per million output tokens through December 31, 2026.

Source: https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/

## Evidence problems to fix

### Vendor benchmark contamination

The pack compares figures from:

- Anthropic’s Claude Code harness.
- OpenAI’s Codex or Responses API harness.
- Google’s Antigravity or internal agent loops.
- Independent evaluations with different prompts and tool policies.

Those numbers cannot safely be placed on a single leaderboard. For example, Google’s official model card reports Gemini 3.8 Flash at 73.7% on DeepSWE v1.1, while OpenAI reports Astra at 74.1% on the same broad benchmark name. That is close enough that harness details, time limits, tool availability, and sampling strategy could determine the apparent winner.

Sources:
- https://openai.com/index/gpt-6-astra/
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/

### Inconsistent model generations

The pack mixes:

- Claude Opus 5.5.
- Claude Fable 5.1.
- Claude Sonnet 5.
- GPT-6 Astra.
- GPT-6 Sol and Luna.
- Gemini 3.8 Flash.
- Older Claude 4.x and GPT-5.x references.

This is appropriate for a reconnaissance document, but not for a final routing policy unless each model has:

1. A confirmed API ID.
2. Confirmed availability in the target platform.
3. Current pricing.
4. A defined effort setting.
5. A benchmark measured under the same harness.
6. A fallback behavior when the model refuses, times out, or reaches quota.

### Gemini 3.8 Flash claims need separation

Google’s official announcement supports Gemini 3.8 Flash as a major improvement over 3.7 Flash and emphasizes long-horizon coding, autonomous agents, and iterative tool use. However, claims about Gemini 4 or leaked models disguised as Gemini 3.8 Flash remain unverified and should not influence routing. Search results indicate that Google had Gemini 4 in post-training, but no official Gemini 4 endpoint or benchmark was confirmed in the sources retrieved.

Sources:
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/
- https://9to5google.com/2026/09/24/google-says-gemini-4-release-is-coming-as-soon-as-possible/

## Recommended conservative routing policy

For your likely software-development workflows, I would use this initial policy:

1. **Default:** Gemini 3.8 Flash at medium effort for fast implementation, inspection, browser work, and repetitive agent loops.
2. **Escalate to Claude Opus 5.5:** multi-file refactors, architecture, unclear requirements, migrations, and tasks where minimizing rework matters more than raw latency.
3. **Escalate to GPT-6 Astra:** computer-use workflows, complex external-tool orchestration, difficult debugging with visual state, and high-consequence autonomous actions.
4. **Use GPT-6 Sol:** cost-sensitive general development when Luna is too weak and Astra is unnecessary.
5. **Use Luna or another fast model:** syntax corrections, small scripts, formatting, straightforward tests, and high-volume generation.
6. **Require cross-model verification:** database migrations, authentication, billing, security-sensitive code, destructive operations, and production deployment changes.

The biggest practical finding is not that one model wins every category. It is that **Opus 5.5 appears unusually strong for cost-efficient repository-scale coding, Astra is especially compelling for computer use and complex professional workflows, and Gemini 3.8 Flash offers the strongest cost/throughput profile for repeated agentic development**. That is a better basis for routing than a single universal capability ranking.
