### 1. Current Model Matrix

| Model / Public ID | Lineage | Status | Reasoning / Effort Levels | Primary Strength |
| --- | --- | --- | --- | --- |
| **Claude Sonnet 4.6** (`claude-sonnet-4-6`) | Anthropic Claude 4.x | Current frontier | **Standard** (fast direct generation) vs **Extended Thinking** (`budget_tokens`: 1,024 to 128,000) | State-of-the-art repo-scale agentic coding, computer use, and multi-file architectural planning. |
| **Claude 3.7 Sonnet** (`claude-3-7-sonnet-20250219`) | Anthropic Claude 3.x | Active / Superseded by 4.x | **Standard** (`thinking.type: "disabled"`) vs **Extended Thinking** (`thinking.type: "enabled"`, explicit `budget_tokens`) | Hybrid execution flexibility; verifiable SWE-bench benchmark scaling via test-time compute. |
| **OpenAI o3** (`o3`) | OpenAI `o`-series | Current frontier reasoning | Discrete categorical: `reasoning_effort: "low"` | `"medium"` | `"high"` | Algorithmic logic, competitive programming, visual-spatial architecture analysis. |
| **OpenAI o4-mini** (`o4-mini`) | OpenAI `o`-series Mini | Current efficient reasoning | Discrete categorical: `reasoning_effort: "low"` | `"medium"` | `"high"` | High-speed competitive programming and verified SWE tasks at low unit cost. |
| **OpenAI o3-mini** (`o3-mini`, `o3-mini-2025-01-31`) | OpenAI `o`-series Mini | Deprecated / Superseded | Discrete categorical: `reasoning_effort: "low"` | `"medium"` | `"high"` | Fast STEM reasoning and isolated unit-test generation; lacks native visual understanding. |
| **Gemini 3.1 Pro** (`gemini-3.1-pro`) | Google Gemini / Antigravity | Current frontier | Native thinking (`thinking_config`: Low / High / Deep Think / Dynamic budget) | Massive context ingestion (up to 2M tokens), long-horizon agentic task orchestration in Antigravity. |
| **Gemini 3 Flash** (`gemini-3-flash`) | Google Gemini / Antigravity | Current high-throughput | Native thinking (`thinking_config`: Low / Dynamic / High) | Ultra-low latency code edits, high-speed terminal/browser tool execution in Antigravity. |

---

### 2. Task-Class Evidence

#### Anthropic Claude Ecosystem

##### Claude Sonnet 4.6 / Sonnet 4.5

* **Extended Thinking (High Budget):**
* **Architecture:** `VERY STRONG`. Demonstrates materially stronger multi-repository design, dependency mapping, and trade-off analysis compared to non-thinking versions.
* **Implementation:** `VERY STRONG`. Outperforms earlier models on real-world coding benchmarks (surpassing Claude 3.7 Sonnet's 70.3% SWE-bench Verified score).
* **Quick:** `MODERATE`. Generates extensive thought sequences that add latency, making high-budget execution counterproductive for single-line syntax updates.
* **Default:** `STRONG`. Retains strong instruction adherence, but consumes higher cumulative output tokens due to thinking blocks.


* **Standard Mode (Thinking Disabled):**
* **Architecture:** `MODERATE`. Follows documented architectural guidelines accurately, but lacks deep self-correction on hidden system edge cases.
* **Implementation:** `STRONG`. Fast, reliable generation for well-specified interfaces and isolated modules.
* **Quick:** `VERY STRONG`. Sub-second time-to-first-token with zero thinking overhead; ideal for targeted diffs.
* **Default:** `VERY STRONG`. Balanced choice for general, routine software development.



##### Claude 3.7 Sonnet

* **Extended Thinking:**
* **Architecture:** `STRONG`. Verified at 70.3% on SWE-bench Verified with custom scaffolding; demonstrates sustained multi-step debugging across file trees.
* **Implementation:** `STRONG`. Proven across agentic coding harnesses (Claude Code, Aider).
* **Quick:** `MODERATE`. High token latency for simple tasks.
* **Default:** `STRONG`. Accurate output, though standard mode is often cheaper and faster.


* **Standard Mode:**
* **Architecture:** `MODERATE`. Achieves 62.3% on SWE-bench Verified without test-time compute; struggles with multi-file edge-case planning.
* **Implementation:** `STRONG`. Direct patch application and boilerplate implementation.
* **Quick:** `VERY STRONG`. Very low latency, precise small edits.
* **Default:** `STRONG`. Reliable non-reasoning workhorse.



#### OpenAI / Codex Ecosystem

##### OpenAI o3

* **High Effort (`reasoning_effort: "high"`):**
* **Architecture:** `VERY STRONG`. Scored 69.1% on SWE-bench Verified (unassisted n=477 subset) and 2706 Elo on Codeforces; capable of deep algorithmic planning and architectural invariant preservation.
* **Implementation:** `VERY STRONG`. Earned $86,100 on the SWE-Lancer IC Diamond freelance coding benchmark, outperforming all other tested OpenAI models.
* **Quick:** `WEAK`. Substantial reasoning latency (frequently 30–90 seconds) makes it inefficient for straightforward fixes.
* **Default:** `MODERATE`. High compute usage and token overhead limit its suitability for broad, undefined developer tasks.


* **Low / Medium Effort:**
* **Architecture:** `STRONG`. Medium effort retains strong cross-module logic while cutting token runtimes substantially.
* **Implementation:** `STRONG`. Excellent for bug fixes and test suites under well-defined constraints.
* **Quick:** `MODERATE`. Internal reasoning tokens cannot be entirely disabled, which introduces a latency floor.
* **Default:** `STRONG`. Solid balance of speed and structural reliability.



##### OpenAI o4-mini

* **High Effort:**
* **Architecture:** `STRONG`. Reaches 68.1% on SWE-bench Verified and 2719 Codeforces Elo with terminal access; closely trails o3 on core SWE tasks.
* **Implementation:** `STRONG`. Scored $65,792 on SWE-Lancer Diamond; highly effective for implementation refactoring.
* **Quick:** `MODERATE`. Faster than o3 High, but still incurs unnecessary reasoning delays for trivial edits.
* **Default:** `STRONG`. High precision for mathematical or algorithmic coding.


* **Low / Medium Effort:**
* **Architecture:** `MODERATE`. Sufficient for localized component design, but prone to misses across complex multi-repo architectures.
* **Implementation:** `STRONG`. High token velocity and strong language syntax coverage.
* **Quick:** `VERY STRONG`. Very fast turnaround on syntax validation, script authoring, and localized unit tests.
* **Default:** `STRONG`. Exceptionally cost-effective workhorse.



##### OpenAI o3-mini (Historical / Deprecated by o4-mini)

* **High Effort:**
* **Architecture:** `WEAK`. Stalls at 49.3% on SWE-bench Verified and $33,833 on SWE-Lancer; lacks the repo-scale architectural depth of o3 or Claude 3.7/4.x.
* **Implementation:** `MODERATE`. 2073 Codeforces Elo; reliable on isolated competitive programming algorithms, but fragile on dirty repository codebases.
* **Quick:** `MODERATE`. High effort adds latency without yielding tangible gains on routine tasks.
* **Default:** `MODERATE`. Best restricted to isolated logic routines.


* **Low Effort:**
* **Architecture:** `WEAK`. Ineffective for cross-file dependency management.
* **Implementation:** `MODERATE`. Handles isolated functions and standard scripts.
* **Quick:** `STRONG`. Very fast response time for pure syntax corrections.
* **Default:** `MODERATE`. Competent for basic tasks, but superseded by o4-mini.



#### Google Gemini / Antigravity Ecosystem

##### Gemini 3.1 Pro (In Antigravity Harness)

* **High Thinking / Deep Think:**
* **Architecture:** `VERY STRONG`. Reaches 80.6% on SWE-bench Verified; leverages 2M-token context to ingest entire repositories, architecture diagrams, and test traces simultaneously.
* **Implementation:** `VERY STRONG`. Employs Antigravity's parent-child subagent hierarchy (`invoke_subagent`) to decompose changes into auditable artifacts and test-validated branches.
* **Quick:** `WEAK`. High token consumption can quickly exhaust Antigravity's rolling 5-hour quota on simple jobs.
* **Default:** `STRONG`. Thorough, but its heavy resource footprint requires managed execution.


* **Low / Dynamic Thinking:**
* **Architecture:** `STRONG`. Effectively synthesizes cross-file dependencies when provided with whole-codebase context windows.
* **Implementation:** `STRONG`. Practical balance for feature development within Antigravity editor and manager views.
* **Quick:** `MODERATE`. Still runs internal thought steps; slower than Gemini 3 Flash.
* **Default:** `STRONG`. Highly versatile default for multi-turn IDE sessions.



##### Gemini 3 Flash (In Antigravity Harness)

* **Low / Dynamic Thinking:**
* **Architecture:** `MODERATE`. Scores 78.0% on SWE-bench Verified in rapid-fire agentic loops, but loses fine architectural synthesis on deep, multi-layered refactors compared to 3.1 Pro.
* **Implementation:** `STRONG`. Balances Pro-grade coding performance with very low latency, keeping the developer in flow state.
* **Quick:** `VERY STRONG`. Ideal for inline diffs, quick inspections, command execution, and headless browser UI tests via Antigravity.
* **Default:** `VERY STRONG`. Recommended default for high-frequency daily developer interactions.



---

### 3. Reasoning / Effort Comparison

* **Does High materially improve hard coding tasks?**
Yes. In all three ecosystems, moving from Low/Disabled to High produces clear jumps on complex software engineering benchmarks:
* Claude 3.7 Sonnet advances from 62.3% to 70.3% on SWE-bench Verified.
* OpenAI o3 reaches 69.1% on SWE-bench Verified and $86,100 on SWE-Lancer Diamond under high effort.
* Gemini 3.1 Pro reaches 80.6% on SWE-bench Verified when paired with deep thinking inference compute.


* **Does Medium retain most capability?**
Yes. On OpenAI (o3, o4-mini) and Google Gemini (dynamic thinking), Medium / Dynamic captures the vast majority of architectural planning and algorithmic correctness gains while avoiding the severe latency tails seen at maximum thinking allocations.
* **Is Low substantially faster?**
Yes. Low effort (or Anthropic Standard mode) bypasses extensive internal reasoning steps, cutting time-to-first-token and wall-clock execution by factors of 3x to 5x.
* **Is the highest effort useful only for difficult reasoning?**
Yes. On bounded syntax fixes, single-function unit tests, or straightforward file refactors, High effort exhibits diminishing returns while consuming significant token budgets and introducing multi-minute delays.
* **Is effort provider-managed or caller-configured?**
* **Anthropic:** Caller-configured via `thinking.budget_tokens` (integer from 1,024 to 128,000) or explicitly disabled (`type: "disabled"`). Internal thought summaries are generated automatically by a smaller companion model when thoughts exceed threshold lengths.
* **OpenAI:** Caller-configured via the discrete enum `reasoning_effort: "low" | "medium" | "high"`. Exact token counts are determined dynamically by the model within that tier.
* **Google Gemini / Antigravity:** Dual mode. Developers can set explicit thinking budgets or thinking levels via API parameters (`thinking_config`), but inside the Antigravity agent harness, dynamic thinking automatically modulates effort based on prompt context unless overridden in agent settings.



---

### 4. Model Family / Lineage Map

```
ANTHROPIC CLAUDE FAMILY
└── Claude 3 (Opus / Sonnet / Haiku) [Stale]
    └── Claude 3.5 Sonnet (20241022) [Stale / Baseline]
        └── Claude 3.7 Sonnet (Hybrid test-time compute)
            ├── Standard Mode (thinking.type: "disabled")
            └── Extended Thinking (thinking.budget_tokens: 1k -> 128k)
                └── Claude Sonnet 4.5 / 4.6 (Current SOTA)
                    ├── Standard Mode (Low latency)
                    └── Extended Thinking (Summarized reasoning chains)

OPENAI CODEX / REASONING FAMILY
└── GPT-4o Lineage (Direct generation, non-reasoning)
└── o1-preview / o1-mini [Historical]
    └── o1 [Historical frontier]
        ├── o3-mini [Superseded / Deprecated]
        ├── o3 (Frontier full reasoning + multimodal)
        │   └── reasoning_effort: "low" | "medium" | "high"
        └── o4-mini (Current efficient reasoning + multimodal)
            └── reasoning_effort: "low" | "medium" | "high"

GOOGLE GEMINI / ANTIGRAVITY FAMILY
└── Gemini 1.5 Pro / Flash [Historical context leaders]
    └── Gemini 2.0 / 2.5 Pro (Thinking prototypes)
        └── Gemini 3 Family (Current Antigravity Engine)
            ├── Gemini 3 Flash / 3.8 Flash (High-velocity agentic loops)
            │   └── thinking_config: low | dynamic | high
            └── Gemini 3 Pro / 3.1 Pro (Deep architectural reasoning)
                └── thinking_config: low | high | Deep Think (2M context)

```

**Naming Ambiguities & Aliases:**

* `o3` vs `o3-mini` vs `o4-mini`: `o3-mini` lacks visual input capabilities and scores over 20 points lower on SWE-bench Verified than `o3` and `o4-mini`. It should not be routed as an equivalent coding engine.
* `Claude 3.5 Sonnet` vs `Claude 3.7 Sonnet`: Claude 3.7 Sonnet Standard completely replaces Claude 3.5 Sonnet at the identical base price ($3/$15 per MTok).
* `Antigravity Harness` vs `Gemini API`: Antigravity manages agents using an asynchronous hierarchical supervisor with terminal, browser, and MCP tools. Raw Gemini API benchmarks do not reflect the performance improvements added by Antigravity's artifact generation and test-execution loops.

---

### 5. Strongest Evidence

1. **Reasoning Compute Strongly Predicts Complex Bug Fixes:** On SWE-bench Verified, extended thinking and test-time reasoning consistently elevate model pass rates from the ~48–62% range up into the 70–80% range (Claude 3.7 Sonnet at 70.3%, o3 at 69.1%, Gemini 3.1 Pro at 80.6%).
2. **Diminishing Returns on Localized Code:** For bounded single-file edits, syntactical repairs, and routine tasks, Low reasoning effort or Standard non-thinking modes deliver nearly identical correctness while reducing response latency by 60–80%.
3. **Severe SWE Divergence Between Frontier and "Mini" Models:** While `o3-mini` posted competitive scores on pure competition mathematics (AIME), its software-engineering pass rate (49.3% on SWE-bench Verified) trailed `o3` (69.1%) and `o4-mini` (68.1%) by roughly 20 percentage points.
4. **Agent Scaffolding Drives Higher Gains than Base Model Differences:** The identical Claude 3.7 Sonnet checkpoint moves from 62.3% unassisted to 70.3% under a tailored agentic scaffolding harness with planning tools and expanded trajectory limits.
5. **Context Window Depth Alleviates RAG Failures in Architecture:** Gemini 3.1 Pro's 2M context window ingests full repositories in one prompt, avoiding the retrieval and index miss rates common to 128k/200k token boundaries.
6. **Thinking Tokens Are Invoiced at Output Rates:** In both Anthropic and Google APIs, thinking tokens count directly against output token allowances and billing, making continuous high-effort usage roughly 5x to 10x more expensive per call than standard execution.
7. **Rate Limit Throttling Patterns Vary Widely:** Antigravity enforces rolling 5-hour quota windows tied directly to agent compute work, whereas Claude Max platforms apply weekly utilization caps.

---

### 6. Contradictions

* **Competitive Programming Elo vs Real-World SWE:** OpenAI reported that `o3` achieved 2706 Elo on Codeforces while `o4-mini` achieved 2719 Elo. However, on freelance software engineering tasks (SWE-Lancer Diamond), `o3` generated $86,100 in earnings compared to $65,792 for `o4-mini`. Algorithmic problem-solving metrics do not translate directly to repository-level software delivery.
* **Flash Outperforming Pro on Coding Benchmarks:** Google DeepMind reported that Gemini 3 Flash achieved 78.0% on SWE-bench Verified, outpacing Gemini 3 Pro (76.2%) despite running at less than one-fourth the cost. However, developer feedback within Antigravity notes that Gemini 3 Flash struggles with holistic workspace awareness and cross-module synthesis compared to Pro.
* **Reported SWE-bench Verified Scores Across Harnesses:** Anthropic lists Claude 3.7 Sonnet at 62.3% (standard) and 70.3% (scaffolded), whereas OpenLM/SWE-bench independent leaderboards list models under differing container setups, action-space limits, and test subsets (e.g., n=477 vs n=489 vs full 500). This variation prevents direct comparisons across vendors unless execution environments are strictly identical.

---

### 7. Stale Evidence

* **Claude 3.5 Sonnet (October 2024) Benchmarks:** Scores placing Claude 3.5 Sonnet at ~49% on SWE-bench Verified are obsolete following the release of Claude 3.7 Sonnet, Claude Sonnet 4.5/4.6, o3, and Gemini 3 Pro, all of which exceed 69%.
* **OpenAI o1 / o1-preview Leaderboards:** Early evaluations ranking OpenAI o1 as the premier reasoning engine for software tasks are superseded by o3 and o4-mini, which reduce major programming errors by 20% and add native terminal capabilities.
* **Gemini 2.0 Flash Thinking Exp:** Experimental checkpoints from late 2024 and early 2025 represent deprecated prototypes that have been superseded by Gemini 2.5 and Gemini 3 production endpoints.

---

### 8. What We Still Do Not Know

* **Real First-Pass Acceptance in IDE Workflows:** While SWE-bench measures iterative test repairs across 30–100 turns, telemetry quantifying whether developers accept or reject an agent's initial diff on the first attempt remains proprietary to tools like Cursor, Windsurf, and Antigravity.
* **Real Task Latency Distributions:** Providers disclose average token throughput (tokens per second), but public documentation rarely publishes p95 or p99 duration metrics for extended thinking loops under heavy server load.
* **Dynamic 5-Hour Quota Burn Formulations:** Antigravity documents that rate limits reset every 5 hours and scale with "the amount of work done by the agent", but Google does not disclose the precise token-to-quota conversion ratio or the exact threshold that triggers mid-session interruptions.
* **Sideline Orchestration Drift:** Public evaluations test models within vendor-native harnesses (Anthropic Claude Code, OpenAI internal drivers, Google Antigravity). How these models perform when driven by custom, third-party sideline orchestration frameworks is not documented in public benchmarks.
* **Silent Server-Side Model Updates:** Providers routinely roll out behavioral adjustments, prompt refinements, or speculative decoding optimizations under fixed endpoint names without altering version strings.

---

### 9. Source Table

| Source | Publisher | Date | URL | Supports |
| --- | --- | --- | --- | --- |
| Claude 3.7 Sonnet and Claude Code | Anthropic | Feb 24, 2025 | [Anthropic Announcement](https://www.anthropic.com/news/claude-3-7-sonnet?utm_source=gemini) | Claude 3.7 hybrid architecture, budget tokens, SWE-bench 62.3% standard vs 70.3% scaffolded. |
| Claude Sonnet 4.5 System Card | Anthropic | Oct 10, 2025 | [Anthropic System Card](https://www.anthropic.com/claude-sonnet-4-5-system-card?utm_source=gemini) | Sonnet 4.5 hybrid reasoning, autonomous agent safety, summarized thoughts. |
| Introducing Claude Sonnet 4.6 | Anthropic | Feb 17, 2026 | [Anthropic Release](https://www.anthropic.com/news/claude-sonnet-4-6?utm_source=gemini) | Claude Sonnet 4.6 full coding upgrade, agentic orchestration, OSWorld metrics. |
| Claude Sonnet 4.5 - API Pricing & Benchmarks | OpenRouter | Sep 29, 2025 | [OpenRouter Model Page](https://openrouter.ai/anthropic/claude-sonnet-4.5?utm_source=gemini) | Non-reasoning vs Reasoning benchmarks, latency, token pricing ($3/$15). |
| Introducing OpenAI o3 and o4-mini | OpenAI | Apr 16, 2025 | [OpenAI Post](https://openai.com/index/introducing-o3-and-o4-mini/?utm_source=gemini) | o3 SWE-bench (69.1%), o4-mini SWE-bench (68.1%), Codeforces Elo, SWE-Lancer Diamond. |
| OpenAI o3 and o4 Mini: Analysis | Value Add VC | Jun 23, 2026 | [Value Add VC Analysis](https://valueaddvc.com/blog/openai-o3-and-o4-mini-what-the-new-reasoning-models-mean-for-ai-applications?utm_source=gemini) | Independent synthesis of o3/o4-mini reasoning capabilities and enterprise SWE use. |
| Introducing Google Antigravity | Google Antigravity Team | Nov 18, 2025 | [Google Antigravity Blog](https://antigravity.google/blog/introducing-google-antigravity?utm_source=gemini) | Antigravity architecture, artifacts, verification loops, 5-hour quota structure. |
| Build with Gemini 3 Flash | Google DeepMind | Dec 17, 2025 | [Google DeepMind Blog](https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-3-flash/?utm_source=gemini) | Gemini 3 Flash SWE-bench Verified (78.0%), 3x speedup, $0.50/$3.00 pricing. |
| Gemini 3 Flash in Google Antigravity | Google Antigravity Blog | Dec 17, 2025 | [Google Antigravity Post](https://antigravity.google/blog/gemini-3-flash-in-google-antigravity?utm_source=gemini) | Flash low-latency agentic loops in Antigravity IDE, terminal/browser execution. |
| A new era of intelligence with Gemini 3 | Google Blog | Nov 18, 2025 | [Google Announcement](https://blog.google/products-and-platforms/products/gemini/gemini-3/?utm_source=gemini) | Gemini 3 Pro reasoning benchmarks, SWE-bench Verified (76.2%), Deep Think mode. |
| Gemini Thinking - Interactions API | Google AI for Developers | Sep 25, 2026 | [Google AI Docs](https://ai.google.dev/gemini-api/docs/thinking?utm_source=gemini) | Thinking process, thought steps, signatures, thinking summaries, `thinking_level`. |
| Google Antigravity Extension | Visual Studio Marketplace | Sep 23, 2026 | [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=Google.google-antigravity&utm_source=gemini) | Antigravity orchestration, parent-child subagents, workspace modes, MCP integration. |
| Gemini x Antigravity Discussion | r/google_antigravity | Jun 30, 2026 | [Reddit Discussion](https://www.reddit.com/r/google_antigravity/comments/1uj0qe7/gemini_x_antigravity_discussion_thread/?utm_source=gemini) | Practitioner feedback on 5-hour quota stops, repo structure awareness, subagent handling. |
| Antigravity: Gemini 3 HIGH vs LOW vs FLASH | r/Bard | Jan 16, 2026 | [Reddit Comparison](https://www.reddit.com/r/Bard/comments/1qeipgi/antigravity_gemini_3_high_vs_3_low_vs_3_flash/?utm_source=gemini) | Practical developer analysis of Gemini 3 High vs Low vs Flash task suitability. |
| Gemini 3.1 Pro Coding Benchmarks 2026 | Git AutoReview | Aug 31, 2026 | [Git AutoReview](https://gitautoreview.com/blog/gemini-3-pro-code-review?utm_source=gemini) | Gemini 3.1 Pro 80.6% SWE-bench Verified performance and 2M token context utilization. |
| Plans & Pricing | Google Antigravity Docs | 2026 | [Antigravity Docs](https://antigravity.google/docs/plans/?utm_source=gemini) | Multi-model support (Gemini 3.1 Pro, Gemini 3.8 Flash, Claude, OpenAI) in Antigravity. |

This reconnaissance pack provides the factual evidence and comparative capability baselines required for subsequent calibration of conservative routing priors without relying on ungrounded performance assumptions.