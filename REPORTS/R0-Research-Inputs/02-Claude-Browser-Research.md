# S57.1 Intelligent Routing — R0 Researched Capability Prior Pack

**Status:** Research reconnaissance only. No routing algorithm, no probabilities, no Sideline-specific mappings are proposed here — see "Very Important Limit" in the brief. Everything below is evidence for a later Architect to normalize.

**Research date:** September 26, 2026. Several models below shipped or changed status within days of this date — see §7 (Stale Evidence) and treat anything dated after this pack's completion as unverified.

**Coverage:** Claude (Anthropic), OpenAI Codex / GPT, Google Gemini + Antigravity.

---

## 1. Current Model Matrix

| Model | Lineage | Status (Sep 26, 2026) | Reasoning/Effort Levels | Primary Strength |
|---|---|---|---|---|
| **Claude Opus 5.5** | Anthropic Claude 5 family, Opus tier | Current flagship (launched ~Sep 22, 2026) | low / medium (default) / high / xhigh / max | Leads Anthropic's own benchmark table (Terminal-Bench 4.0, GDPval-AA v2.1) |
| **Claude Opus 5** | Claude 5 family | Current, GA Jul 24, 2026; superseded as top-of-line by Opus 5.5 but still offered | low / medium / high (default) / xhigh / max | 1M-token context by default; adaptive thinking on by default; long-horizon agentic work, self-verification |
| **Claude Opus 4.8** | Claude 4.x family | Current (legacy tier); provider states it retires no sooner than May 28, 2027 | Not fully documented in sources gathered; supports xhigh (confirmed) | Reference point for classic SWE-bench Verified figure (88.6%) |
| **Claude Sonnet 5** | Claude 5 family | Current; default model in Claude Code and Claude.ai Free/Pro | low / medium / high (default) / xhigh / max | Agentic coding at a fraction of Opus cost; 1M context |
| **Claude Sonnet 4.6** | Claude 4.x family | Superseded by Sonnet 5 as default; still callable by model ID | low / medium / high (default) / max (xhigh added later for some deployments) | Legacy reference point ("Sonnet 4.6 at high effort" is Anthropic's own calibration anchor for Sonnet 5's medium effort) |
| **Claude Fable 5.1** | Mythos-tier (per Anthropic; shares underlying model with Mythos 5.1, extra safeguards) | Current; highest-priced tier ($10/$50 per MTok) | low / medium / high / xhigh / max (all five confirmed) | Long-horizon agentic/reasoning; was briefly suspended Jun 12–30, 2026 under export controls, restored Jul 1 |
| **Claude Fable 5** | Predecessor to Fable 5.1 | Now "legacy" tier at same price | Same 5-level scale | SWE-bench Pro 80.3%, HLE (no tools) 59.0% at launch |
| **Claude Mythos 5.1 / Mythos Preview** | Above-Opus "Mythos" tier | Mythos Preview: not public, Project Glasswing partners only. Mythos 5.1: same weights as Fable 5.1, fewer safeguards, distribution unclear from public sources | xhigh confirmed available | Not enough public benchmark disclosure to rate independently of Fable 5.1 |
| **Claude Haiku 4.5** | Claude 4.x family | Current, fast/cheap tier | Extended thinking supported (first Haiku with it); explicit low/med/high not confirmed in sources gathered | SWE-bench Verified 73.3%; ~4–5x faster than Sonnet-class; positioned for subagents/high-volume work |
| **GPT-6 Astra** | OpenAI GPT-6 generation | Current flagship, released Sep 3, 2026 | low / medium / high / xhigh / max in API (Astra does not expose "none"); "ultra" exists only inside Codex/ChatGPT Work (max reasoning + automatic subagent delegation), no API access, no published benchmark at that level | State-of-the-art on OpenAI's internal coding evals per OpenAI; ties for #1 on Artificial Analysis's Coding Agent Index |
| **GPT-6 Sol** | OpenAI GPT-6 generation | Current, released Sep 22, 2026; named successor to GPT-5.5 in Codex | none / low / medium / high / xhigh / max | Mid-tier cost/performance; ~90–95% of Astra's practical capability at lower cost per Vellum's estimate |
| **GPT-6 Luna** | OpenAI GPT-6 generation | Current, released Sep 22, 2026; free/low-cost tier, becomes default for Free/Go plans | none / low / medium / high / xhigh / max | Cheapest; at higher effort approaches prior-flagship factuality per OpenAI |
| **GPT-5.5** | OpenAI GPT-5 generation | Being retired: leaves ChatGPT/ChatGPT Work/Codex Oct 14, 2026; **API access unaffected** | xhigh used for OpenAI's own headline evals | Terminal-Bench 2.0 82.7% (OpenAI's own number); still usable via API after Oct 14 |
| **GPT-5.4** | OpenAI GPT-5 generation | Deprecated from Codex w/ ChatGPT sign-in (Aug 31, 2026); API unaffected | Reasoning effort levels; token-efficiency improvements over 5.3-Codex claimed | Unified reasoning + coding + agentic + computer-use in one model |
| **GPT-5.3-Codex** | OpenAI Codex line | Deprecated in Codex w/ ChatGPT sign-in; API/date-pinned ID may still work | Reasoning effort incl. xhigh; configurable per-task (e.g., separate plan-mode effort) | Terminal-Bench 2.0 75.1–77.3% depending on source; optimized purely for coding/agentic |
| **GPT-5.2-Codex** | OpenAI Codex line | Deprecated in Codex w/ ChatGPT sign-in | 4 documented reasoning effort levels incl. xhigh | SWE-Bench Verified 80.0%, CVE-Bench 87%, Tau2-bench (tool-calling) 98.7% |
| **GPT-5.1-Codex-Max** | OpenAI Codex line | Legacy per third-party guide, but still in API catalog | medium (daily-driver default) / high / xhigh (new at this model) | First model natively trained for compaction across multiple context windows — 24+ hr autonomous sessions observed by OpenAI |
| **GPT-5-Codex-Mini** | OpenAI Codex line | Smaller/cheaper Codex variant | Not detailed in sources gathered | Positioned for higher usage-quota efficiency (up to 4x more usage under a ChatGPT subscription) — candidate evidence for QUICK-class routing, but capability numbers not found |
| **Gemini 3.1 Pro** | Gemini 3 family (Pro tier) | Current Pro-tier flagship (preview status per Google's own docs as of research date), released Feb 19, 2026 | low / medium (new at 3.1) / high / max | SWE-bench Verified 80.6%; ARC-AGI-2 77.1%; GPQA Diamond 94.3%; LiveCodeBench Pro 2887 Elo; 1M context |
| **Gemini 3.8 Flash** | Gemini 3 family (Flash tier) | Current, Sep 2, 2026; now the default model behind the Antigravity managed agent | LOW / MEDIUM (default) / HIGH; "minimal" not supported on this model | Terminal-Bench 2.1 90.8%; SWE-Bench Pro 61.6%; described by Google as built for longer/more complex multi-step tasks |
| **Gemini 3.7 Flash** | Gemini 3 family (Flash tier) | Superseded by 3.8 Flash as Antigravity default; still available | LOW / MEDIUM / HIGH | Terminal-Bench 2.1 81.6%; SWE-Bench Pro 60.4% |
| **Gemini 3.5 Flash** | Gemini 3 family (Flash tier) | Current GA (since May 19, 2026); behind `gemini-flash-latest` alias at time of its release | Not itemized in sources gathered | Terminal-Bench 2.1 76.2%; GDPval-AA 1656 Elo; reported by Google to beat Gemini 3.1 Pro on some agentic/coding benchmarks despite being the "fast" tier |
| **Gemini 3 Deep Think / Gemini 3.1 Deep Think** | Reasoning mode built atop Gemini 3 Pro / 3.1 Pro | Current (3.1 Deep Think is the newer of the two) | Not a discrete effort ladder — a separate "mode" using parallel/extended reasoning | Best publicly reported abstract-reasoning results (ARC-AGI-2) in the Gemini lineup; coding-specific benchmark numbers not found in sources gathered — see §8 |
| **Google Antigravity Agent** (`antigravity-preview-09-2026`) | Separate managed-agent product, not a model itself | Current, released ~Sep 2026, replacing `antigravity-preview-05-2026` (shutdown Oct 5, 2026) | N/A — orchestration layer | **Important for routing design:** Antigravity is multi-model. Public configuration references show it can run Gemini 3.1 Pro, Gemini 3 Flash variants, *and* Claude models (e.g., an "antigravity-claude-opus-4-6-thinking" option with low/max) side by side. It is not a Gemini-exclusive product. |

---

## 2. Task-Class Evidence

Ratings are **VERY STRONG / STRONG / MODERATE / WEAK / UNKNOWN**, each with the evidence it rests on. "Unknown" means no public disclosure was found, not that the model is weak.

### ARCHITECTURE (system design, multi-file reasoning, tradeoff analysis, complex debugging)

| Model (effort) | Rating | Evidence |
|---|---|---|
| Claude Opus 5.5 (high/xhigh) | STRONG | Leads Anthropic's own newer agentic/knowledge-work suite (Terminal-Bench 4.0, GDPval-AA v2.1) over Fable 5.1; positioned by Anthropic for long-horizon, self-verifying work |
| Claude Opus 5 (xhigh/max) | STRONG | Anthropic explicitly frames Opus 5's edge over Sonnet 5 as long-horizon agent work, self-verification, and open-ended "decide what the task even is" problems, not raw SWE-bench score |
| Claude Sonnet 5 (xhigh) | MODERATE | Approaches Opus 4.8 on agentic coding (63.2% vs 69.2% on one agentic-coding metric) but a third-party source states Opus is still the better choice once Sonnet 5 is pushed to xhigh, since cost converges without a capability win |
| GPT-6 Astra (xhigh/max) | STRONG | OpenAI's own launch claims a step-change vs GPT-5.6 Sol on "trading intuition" evals; independent Artificial Analysis data show Astra's advantage concentrated in Terminal-Bench v4.0 and SWE-Atlas-QnA (harder, more architecture-flavored tasks), not DeepSWE (where Sol actually scores higher) |
| GPT-5.1-Codex-Max (xhigh) | STRONG | Purpose-built via context compaction for multi-hour, project-scale refactors and migrations; OpenAI reports >24hr continuous autonomous sessions |
| Gemini 3.1 Pro (high/max) | MODERATE | Leads on abstract reasoning (ARC-AGI-2) and long-context recall (1M tokens, cross-service dependency understanding cited by one practitioner source) but multiple sources flag multi-step/chained reasoning as a relative weakness versus Claude and GPT on Terminal-Bench |
| Gemini 3.1/3.8 Deep Think | UNKNOWN | Strong on abstract/competition reasoning (ARC-AGI-2, Codeforces) but no coding-specific (SWE-bench/Terminal-Bench) figure was found in the sources gathered — see §8 |

### IMPLEMENTATION (production code, refactoring, bug fixing, adding tests, repo-scale coding)

| Model (effort) | Rating | Evidence |
|---|---|---|
| Claude Opus 4.8 (high, default) | VERY STRONG | SWE-bench Verified 88.6%, SWE-bench Pro 69.2%, Terminal-Bench 2.1 74.6% (own generation's reference figures) |
| Claude Sonnet 5 (high, default) | STRONG | SWE-bench Verified reported as 72.7% by one source and 85.2% by another for the same model — flagged as a contradiction in §6; SWE-bench Pro 63.2% is corroborated across sources |
| Claude Haiku 4.5 (default) | STRONG for cost tier | SWE-bench Verified 73.3%, "matches Sonnet 4" per Anthropic, at roughly 4–5x the speed and a third of the cost of a Sonnet-class model |
| GPT-5.2-Codex (default/high) | VERY STRONG | SWE-Bench Verified 80.0%, CVE-Bench 87% |
| GPT-5.1-Codex-Max (xhigh) | VERY STRONG | SWE-bench Verified 77.9% at xhigh vs 76.5% at lower effort on the same model, per OpenAI |
| GPT-5.3-Codex (default) | MODERATE step vs Codex-Max | SWE-Bench Pro only edges up 56.4%→56.8% vs GPT-5.2-Codex; OpenAI's own writeup frames the release as an agentic-speed story more than a raw-accuracy story |
| GPT-6 Astra (high/xhigh) | STRONG | Ties Claude Fable 5.1 at 62 on Artificial Analysis's Coding Agent Index; ahead of Opus 5 (60) and GPT-5.6 Sol (55); notably *behind* GPT-6 Sol on DeepSWE specifically (68% vs 72%) |
| Gemini 3.1 Pro (high) | STRONG | SWE-bench Verified 80.6% (near Claude Opus 4.6's 80.8%); LiveCodeBench Pro 2887 Elo is the highest single figure found across any model in this pack |
| Gemini 3.8 Flash (medium/high) | STRONG for a "Flash"-tier model | SWE-Bench Pro 61.6%, Terminal-Bench 2.1 90.8% — the Terminal-Bench figure is notably higher than several Pro/Opus-tier figures found elsewhere in this pack, though harnesses are not confirmed identical (see §6) |

### QUICK (small bounded edits, straightforward fixes, short generation, fast investigation)

| Model (effort) | Rating | Evidence |
|---|---|---|
| Claude Haiku 4.5 | STRONG | Explicitly positioned by Anthropic for "subagents, parallelized execution, and scaled deployment"; ~150 tokens/sec cited by one independent benchmark vs ~20 tokens/sec for a GPT-5-class comparison point in the same source |
| Claude Sonnet 5 / Opus (low) | STRONG | Anthropic's own effort-level guidance states "low" is explicitly recommended for "simpler tasks that need the best speed and lowest costs, such as subagents" |
| GPT-6 Sol/Luna (low/none) | MODERATE | Documented low/none levels exist, but no task-specific benchmark at low effort was found in sources gathered — capability at that rung is UNVERIFIED even though the rung itself is confirmed |
| GPT-5-Codex-Mini | UNKNOWN (capability) / STRONG (usage economics) | OpenAI markets it for up to 4x more usage within a subscription quota; no independent capability benchmark found |
| Gemini 3.5/3.7/3.8 Flash (low) | MODERATE | Flash tier is explicitly the "speed" tier of the family and documented to run several times faster than Pro-tier Gemini, but no low-effort-specific benchmark score (as opposed to model-level score) was found |

### DEFAULT (general software-development work not clearly in the other classes)

| Model (effort) | Rating | Evidence |
|---|---|---|
| Claude Sonnet 5 (high, its documented default) | STRONG | Explicitly the default model in Claude Code; Anthropic frames it as suitable for "complex reasoning, coding, and agentic tasks where quality matters more than speed or cost" at this effort |
| GPT-6 Sol (medium/high) | STRONG | Explicit successor-in-Codex to GPT-5.5, which itself is described by OpenAI as designed to take "a messy, multi-part task" and plan/verify/iterate without close supervision |
| Gemini 3.8 Flash (medium, its documented default) | STRONG | Now the default model behind the general-purpose Antigravity managed agent as of Sep 2, 2026 |

---

## 3. Reasoning / Effort Comparison

**What changes between levels, per-family:**

- **Claude effort (`low → medium → high → xhigh → max`):** Documented by Anthropic as a *behavioral* signal, not a strict token budget — the model still thinks on hard problems at "low," just less than at higher levels. Effort affects all output tokens (not just a separate "thinking" block), so it also changes tool-call frequency and terseness. Anthropic's own guidance: `medium` is an explicit cost-saving step down that is "comparable to Sonnet 4.6 at high effort" (i.e., roughly one full model-generation of headroom is given up for the step down). `xhigh` is reserved for long-running work (30+ minutes, million-token budgets) and is available on Fable 5, Mythos 5, Opus 5, Opus 4.8, Opus 4.7, and Sonnet 5 — not a single-model exclusive. `max` shows diminishing returns per Anthropic's own guidance and is described as more prone to "overthinking" on routine work. A third-party developer guide states that at `xhigh`, Sonnet 5's cost approaches Opus 4.8's while performing slightly worse on several benchmarks — i.e., there is a documented crossover point past which stepping up the cheaper model stops being worthwhile and switching models is better.

- **OpenAI reasoning effort (Codex-Max era: `medium → high → xhigh`; GPT-6 era: `none/low → medium → high → xhigh → max`, plus IDE/ChatGPT-only `ultra`):** OpenAI's own documented recommendation is `medium` as the "daily driver" for most tasks, escalating to `high`/`xhigh` specifically for the hardest problems. Quantified evidence: GPT-5.1-Codex-Max improved from 76.5%→77.9% on SWE-bench Verified moving from lower effort to `xhigh`, while separately achieving equal-or-better SWE-bench performance at `medium` alone using ~30% fewer thinking tokens than its own predecessor at the same effort level — i.e., effort-level gains and generational efficiency gains are two separate, both-documented axes. `ultra` is confirmed to exist only inside Codex/ChatGPT Work (adds automatic subagent delegation on top of max reasoning) and has **no published benchmark** at all — treat any "ultra" capability claim as unverified by definition.

- **Gemini `thinking_level` (`low → medium → high → max` for Pro; `LOW → MEDIUM → HIGH` for Flash, no `max`/`minimal` on the newest Flash):** Google states Gemini 3.1 Pro always performs some "dynamic thinking" regardless of level; `medium` was introduced only at the 3.1 revision as a new middle ground. One practitioner source characterizes `medium` as adequate for routine code review ("catching issues without over-reasoning on simple changes") and reserves `high` for complex coding/research — but this is a secondary characterization, not an official Google benchmark-per-level disclosure. **No source found in this pack gives a quantified score-per-thinking-level table for any Gemini model on a coding benchmark** — this is a specific evidence gap (see §8).

**Cross-family pattern common to all three vendors:** all now expose an intermediate/default rung explicitly marketed as "good enough for most work" (Claude `high`, OpenAI `medium`, Gemini `medium`/`MEDIUM`), with the top rung reserved for cases the vendor itself frames as long-horizon or unusually hard. Is the top rung useful only for difficult reasoning? Evidence supports yes, for all three: Anthropic explicitly says so; OpenAI explicitly says so ("we still recommend medium... for non-latency-sensitive tasks we're introducing xhigh"); Google's own framing of `high` is for "complex coding and research" specifically, per secondary sources, though no primary Google statement to that exact effect was located.

---

## 4. Model Family / Lineage Map

```
ANTHROPIC (Claude)
Claude 3.5 → Claude 4 family (Opus 4 / 4.1) → Claude 4.5 (Sonnet 4.5, Opus 4.5, Haiku 4.5)
   → Claude 4.6 family (Sonnet 4.6, Opus 4.6, Opus 4.7, Opus 4.8 [current, legacy tier])
   → Claude 5 generation:
        Fable 5 (Jun 9, 2026) → Fable 5.1 (current; Mythos-tier, extra safeguards vs Mythos 5.1)
        Mythos 5 / Mythos 5.1 / Mythos Preview (restricted; Project Glasswing)
        Sonnet 5 (Jun 30, 2026, current default) → effort: low/med/high(default)/xhigh/max
        Opus 5 (Jul 24, 2026) → Opus 5.5 (~Sep 22, 2026, current flagship)
   Haiku line runs in parallel at a fixed cost tier: Haiku 3 → Haiku 3.5 → Haiku 4.5 (current)

NOTE: "xhigh" is a level, not a model. Community-attempted levels beyond max ("ultrathink",
"ultra", "extreme") are rejected by the Claude API; "ultrathink" in Claude Code is a
prompt-matched keyword that nudges effort for one turn, not a persisted setting.

OPENAI (GPT / Codex)
GPT-5 (unified reasoning+fast router, Aug 2025)
   → GPT-5.1 (Nov 2025) [+ GPT-5.1-Codex-Max, same wave — first compaction model]
   → GPT-5.2 (Dec 11, 2025) [+ GPT-5.2-Codex, Jan 14, 2026]
   → GPT-5.3-Codex (Feb 5, 2026) [Codex-only wave — no parallel "GPT-5.3" chat model found]
   → GPT-5.4 (Mar 5, 2026) — folds Codex-line coding strength into a single general model
   → GPT-5.5 "Spud" (Apr 23, 2026) — powers Codex directly, retiring from ChatGPT/Codex
     Oct 14, 2026 (API unaffected)
   → GPT-5.6 (naming shift begins: Sol / Terra / Luna tiers introduced)
   → GPT-6 generation (current, Sep 2026): Astra (flagship) / Sol (mid) / Luna (fast/cheap)

NOTE: Aliasing risk — "GPT-5.3-Codex" and "GPT-5.3" are NOT confirmed to be the same base
model; treat generically as "the GPT-5.3 wave" only where sources explicitly say so.
"Ultra" in Codex/ChatGPT Work is an orchestration mode (max effort + auto-subagents), not a
distinct model or a documented reasoning rung.

GOOGLE (Gemini + Antigravity)
Gemini 2.5 Pro → Gemini 3 Pro (Nov 18, 2025; deprecated Mar 9, 2026)
   → Gemini 3.1 Pro (Feb 19, 2026, current Pro flagship, still labeled "preview" in Google's
     own docs as of the research date)
   → Gemini 3 Pro Deep Think (built on 3 Pro) → Gemini 3.1 Deep Think (built on 3.1 Pro, current)
Gemini 3 Flash (Dec 17, 2025) → 3.5 Flash (GA May 19, 2026) → 3.6 Flash (Jul 21, 2026)
   → 3.7 Flash (Aug 13, 2026) → 3.8 Flash (Sep 2, 2026, current Antigravity default)

Google Antigravity (product, not a model): antigravity-preview-05-2026 →
antigravity-preview-09-2026 (current). Antigravity is a multi-model agent-first IDE — public
configs show it can also run Claude models (e.g. an Opus-4.6-thinking option) alongside Gemini,
so "Antigravity" and "Gemini" are not interchangeable in a routing design; Antigravity is the
orchestration surface, Gemini is one of (at least) two model families it can drive.
```

---

## 5. Strongest Evidence for Intelligent Routing

1. **All three vendors now expose an explicit, provider-documented effort/reasoning ladder with a stated default rung "good enough for most tasks."** This is the single most directly reusable fact for routing design: a default/medium/high rung is the vendor-recommended DEFAULT-class setting, not a hypothesis Sideline needs to invent.

2. **Claude's own documentation explicitly names "subagents" as the intended use case for its lowest effort level.** This directly supports a QUICK-class-to-low-effort mapping for Claude specifically (not yet validated for OpenAI/Gemini at the same specificity).

3. **OpenAI has twice published a quantified same-model, effort-only delta on SWE-bench Verified** (Codex-Max: 76.5%→77.9% low-to-xhigh) — this is one of the only clean, single-variable (effort only, model held constant) data points found in the entire research pass. Most other comparisons conflate model generation and effort level.

4. **OpenAI has also published a same-effort, cross-generation efficiency delta independent of the accuracy delta** (Codex-Max at `medium` matches or beats its predecessor at `medium` while using ~30% fewer tokens) — evidence that "cheaper" and "weaker" are not always the same axis.

5. **Independent-benchmark evidence (Artificial Analysis) shows a top-tier model is not uniformly ahead of a mid-tier model from the same vendor at the same effort setting** — GPT-6 Sol beats GPT-6 Astra specifically on DeepSWE (72% vs 68%) despite trailing on the aggregate Coding Agent Index. This is evidence against a routing assumption that "higher tier always wins"; task-specific benchmark composition matters.

6. **Google documents that its cheaper "Flash" tier has, on at least one occasion, beaten its own "Pro" tier on agentic/coding benchmarks** (Gemini 3.5 Flash reported ahead of 3.1 Pro on Terminal-Bench 2.1 and GDPval-AA at launch) — a second, independently-sourced instance of "cheaper does not necessarily mean weaker," this time across tiers rather than across effort levels.

7. **A provider-documented crossover point exists where escalating a cheaper model's effort stops being economical versus switching to a more expensive model outright** (Sonnet 5 at `xhigh` approaches Opus 4.8's cost while trailing on several benchmarks, per a third-party developer guide synthesizing Anthropic's pricing and benchmark disclosures). This is directly relevant to any later Routing Film logic that considers "escalate effort" vs. "escalate model" as two different levers.

8. **Antigravity is confirmed multi-model, including at least one non-Gemini (Claude) option**, per a public configuration reference. Any routing design that assumes "Antigravity = Gemini" would be building on a false premise.

9. **The "ultra" effort tier in OpenAI's Codex/ChatGPT surfaces has zero published benchmarks anywhere found in this pass.** This is a hard boundary: any routing prior that assigns a capability score to `ultra` is inventing a number the provider has not published.

10. **No source found in this entire pass gives a per-thinking-level benchmark table for any Gemini model on a coding-specific benchmark** (SWE-bench, Terminal-Bench). Google's effort-ladder documentation is capability-agnostic (it describes what the levels are, not what they score) — this is the single largest cross-vendor evidence gap identified.

---

## 6. Contradictions

- **Claude Sonnet 5 SWE-bench Verified score is reported inconsistently across sources:** 85.2% (Morphllm), 72.7% (Cosmic JS, dated Sep 22, 2026, explicitly contrasted against Opus 4.8's 79.4%). These cannot both be right for the same benchmark/harness; likely explanations include different harness/scaffold configurations or one source conflating SWE-bench Verified with SWE-bench Pro (63.2%, which is separately corroborated). **Not resolved in this pass — flag for the Architect.**

- **Claude Opus 4.8's SWE-bench Verified figure also appears at two values:** 88.6% (Morphllm) and 79.4% (Cosmic JS, same-day comparison piece as above). Same caveat applies — possibly different harnesses or a Verified/Pro mix-up in one of the two secondary sources.

- **Gemini 3.1 Pro's Terminal-Bench 2.0 score is reported at two different values by two different secondary sources:** 68.5% (Medium/DataCamp-style aggregator, ALM Corp) vs 54.2% (Git AutoReview). Both cite the same nominal benchmark and model; the discrepancy is large enough (14+ points) that it cannot be rounding — likely different harness versions (the brief's own materials distinguish "Terminus-2 harness" from other configurations) or a Pro/Public dataset variant mismatch.

- **"Does Gemini lead or trail Claude on real-world coding?" is answered oppositely by different secondary sources published around the same window.** One source states Gemini 3.1 Pro leads 13 of 16 benchmarks against Claude Opus 4.6 and GPT-5.2; another states Claude Opus 4.6 narrowly leads Gemini 3.1 Pro on SWE-Bench Verified (80.8% vs 80.6%) and clearly leads on GDPval-AA (expert-task human preference). Neither source is a primary vendor disclosure for the head-to-head framing — both are third-party synthesis pieces, so this is best read as "the two vendors are close, and which one 'leads' depends on benchmark selection," not as a resolved fact.

- **Gemini 3 Deep Think's ARC-AGI-2 score appears at two very different values in sources gathered:** 45.1% at original Nov 2025 launch (DataCamp, citing Google's own announcement) vs 84.6% cited by a February 2026 secondary source (DigitalApplied) for what it also calls "Gemini 3 Deep Think." The nearly 2x gap strongly suggests these are not the same evaluation configuration (possibly conflating a later Gemini 3.1 Deep Think update, a different ARC-AGI-2 variant/harness, or a benchmark-gaming methodology difference) — **treat the 84.6% figure as UNVERIFIED** until a primary Google source is checked directly.

- **OpenAI's own benchmark chart for GPT-6 Astra changed between two Astra-related publications:** one OpenAI-sourced table shows Astra's OSWorld score at 72.6%, a separately-dated chart shows 73.5%, per a third-party source that noticed the discrepancy directly. The third-party source states the difference does not change any comparative conclusion, but it is a documented instance of a vendor's own numbers shifting slightly between disclosures.

---

## 7. Stale Evidence

- Any GPT-5.1 / GPT-5.2 / GPT-5.2-Codex / GPT-5.3-Codex / GPT-5.4 / GPT-5.4-mini benchmark is now measuring a model that OpenAI is actively removing from ChatGPT/Codex-with-ChatGPT-sign-in access (various 2026 retirement dates already passed or imminent as of the research date). These figures remain historically informative (and the API-key path may still reach some of them) but should not be used as current-generation priors without confirming continued availability.
- GPT-5.5, while still the newest fully-benchmarked OpenAI model in several third-party writeups, is scheduled to retire from ChatGPT/Codex on Oct 14, 2026 — 18 days after the research date. Its benchmark figures remain valid for the model itself (available via API) but it is not "current" in the Codex product sense much longer.
- Gemini 3 Pro (non-.1) is already deprecated (shut down Mar 9, 2026); any pre-2026 Gemini benchmark comparison using "Gemini 3 Pro" as the Google entrant is comparing against a retired model.
- The `antigravity-preview-05-2026` managed agent is superseded by `antigravity-preview-09-2026` and is scheduled for shutdown Oct 5, 2026 — any Antigravity-agent-specific benchmark or behavior note tied to the `05-2026` build should be treated as about-to-be-stale.
- Several third-party aggregator pages (BenchLM, NxCode, DataCamp-style posts) were dated within days of a given model's launch and explicitly flagged their own numbers as vendor-reported/not independently replicated at time of publication — treat any figure sourced only to a launch-week secondary aggregator, without a named independent benchmark org, as provisional.

---

## 8. What We Still Do Not Know

- **Real first-pass acceptance rates** (i.e., does a human accept the diff without edits) were not found for any model in any of the three families. All gathered benchmarks measure automated pass/fail against test suites (SWE-bench-style) or vendor-run agentic evals, not human-in-the-loop acceptance.
- **Real task duration in wall-clock terms comparable across vendors** is inconsistently reported: one Astra source gives "40 minutes per task" for OSWorld, one Gemini source gives Terminal-Bench harness differences that may explain score gaps, but no cross-vendor, same-task-definition duration table was found.
- **Subscription-window consumption** (how many "Sideline Plays" a given effort level would burn against a 5-hour or weekly cap) has no public source at all — this is entirely a Sideline-side Routing Film computation, as the brief anticipates.
- **Sideline-specific performance** (i.e., performance inside Sideline Coach's own dispatcher/harness) does not exist yet by definition — no public source could speak to it.
- **Model drift** (whether a pinned model ID's behavior changes over time without a version bump) was not directly evidenced in this pass; the closest indirect signal is Anthropic's dateless "pinned snapshot" policy from the Sonnet 4.6-and-later generation, which is a stability *policy* claim, not a drift *measurement*.
- **Per-thinking-level coding benchmark scores for Gemini** (see §5, item 10) — this is a clean, well-defined gap: Google publishes what the levels are and, separately, what a given model scores overall, but no table found ties a specific coding-benchmark score to a specific thinking level for the same Gemini model.
- **Any capability benchmark for OpenAI's `ultra` reasoning tier**, or for `GPT-5-Codex-Mini` beyond its usage-quota multiplier — both exist as documented product options with no accompanying performance number in sources gathered.
- **A resolution of the SWE-bench Verified contradictions in §6** for Claude Sonnet 5 and Opus 4.8 — the correct figures (and which harness each represents) were not determinable from the sources in this pass and would need a primary-source (Anthropic system card) check.

---

## 9. Source Table

| Source | Publisher | Date | URL | Supports |
|---|---|---|---|---|
| Claude Sonnet 5 Benchmarks Explained | Vellum | Jun 30, 2026 | https://www.vellum.ai/blog/claude-sonnet-5-benchmarks-explained | Sonnet 5 vs Opus 4.8 framing, SWE-bench Pro context |
| Claude Benchmarks (2026) | Morphllm | ~Aug 2026 | https://www.morphllm.com/claude-benchmarks | Sonnet 5 85.2%/63.2%, Opus 4.8 88.6%/69.2%, Fable 5 restoration timeline, current lineup |
| Claude Sonnet 5: Features, Benchmarks, and Pricing | DataCamp | Jun 30, 2026 | https://www.datacamp.com/blog/claude-sonnet-5 | Sonnet 5 63.2% vs Opus 4.8 69.2%, Fable 5 SWE-Bench Pro 80.3% |
| Claude Sonnet 5 vs Opus 5 | Cosmic JS | ~Sep 22, 2026 | https://www.cosmicjs.com/blog/claude-sonnet-5-vs-opus-5 | Alternate SWE-bench figures (Sonnet 5: 72.7%, Opus 4.8: 79.4%), Opus 5.5 Terminal-Bench 4.0 66.4% |
| Introducing Claude Opus 4.5 | Anthropic | 2025 | https://www.anthropic.com/news/claude-opus-4-5 | Effort-parameter methodology baseline (64K thinking budget, high effort default) |
| Effort — Claude Platform Docs | Anthropic | current | https://platform.claude.com/docs/en/build-with-claude/effort | Full effort ladder definitions (low/medium/high/xhigh/max), per-model availability |
| Prompting Claude Sonnet 5 | Anthropic | Jul 7, 2026 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 | Sonnet 5 default=high, xhigh recommended for hardest coding/agentic |
| Claude Sonnet 5 Developer Guide | Developers Digest | Jul 9, 2026 | https://www.developersdigest.tech/blog/claude-sonnet-5-developer-guide-2026 | Pricing-vs-effort crossover point (xhigh approaches Opus 4.8 cost) |
| GitHub issue #12376 (effort levels) | anthropic/claude-code (GitHub) | — | https://github.com/anthropics/claude-code/issues/12376 | Confirms effort not yet exposed in Claude Code CLI at time of filing; medium ≈ 76% fewer tokens vs baseline |
| Effort-levels reference doc | wesammustafa/Claude-Code-Everything-You-Need-to-Know (GitHub) | Jul 2026 | https://github.com/wesammustafa/Claude-Code-Everything-You-Need-to-Know/blob/main/docs/reference/effort-levels.md | xhigh availability across models; "ultrathink" is a prompt keyword, not a level |
| locode-provider effort.rs source comments | docs.rs | — | https://docs.rs/crate/locode-provider/latest/source/src/effort.rs | Confirms low/medium/high/xhigh/max accepted, "ultra"/"ultrathink"/"extreme" rejected (400) |
| Claude Haiku 4.5 announcement | Anthropic | 2025 | https://www.anthropic.com/news/claude-haiku-4-5 | SWE-bench Verified 73.3%, methodology (50 trials, 128K thinking budget) |
| Claude Haiku 4.5 product page | Anthropic | current | https://www.anthropic.com/claude/haiku | Speed/cost framing, "matches Sonnet 4" |
| We just benchmarked Claude Haiku 4.5 | Humiris AI (Substack) | Oct 16, 2025 | https://humiris.substack.com/p/we-just-benchmarked-claude-haiku | ~150 tokens/sec independent measurement |
| GPT-5.3 Codex: From Coding Assistant to General Work Agent | DataCamp | Feb 6, 2026 | https://www.datacamp.com/blog/gpt-5-3-codex | SWE-Bench Pro 56.4%→56.8%, Terminal-Bench jump 64%→75.1% |
| Introducing GPT-5.3-Codex | OpenAI | Feb 2026 | https://openai.com/index/introducing-gpt-5-3-codex/ | xhigh used for headline evals, self-improvement claim |
| GPT-5.2-Codex Complete Guide | NxCode | Mar 4, 2026 | https://www.nxcode.io/resources/news/gpt-5-2-codex-complete-guide-xhigh-reasoning-2026 | SWE-Bench Verified 80.0%, CVE-Bench 87%, Tau2-bench 98.7%, 4 effort levels |
| GPT-5.4 vs GPT-5.3 Codex | NxCode | Mar 9, 2026 | https://www.nxcode.io/resources/news/gpt-5-4-vs-gpt-5-3-codex-upgrade-comparison-2026 | Terminal-Bench 2.0 head-to-head, token-efficiency claim, GPT-5.2 retirement date |
| OpenAI's New GPT-5.5 Powers Codex on NVIDIA Infrastructure | NVIDIA Blog | Apr 23, 2026 | https://blogs.nvidia.com/blog/openai-codex-gpt-5-5-ai-agents/ | GPT-5.5 becomes Codex's backing model |
| Model Release Notes | OpenAI Help Center | ongoing | https://help.openai.com/en/articles/9624314-model-release-notes | GPT-5.1-Codex-Max intro, GPT-5-Codex-Mini intro, retirement history |
| GPT-5.5 (Wikipedia) | Wikipedia | current | https://en.wikipedia.org/wiki/GPT-5.5 | Release date, Terminal-Bench 2.0 82.7%, codename "Spud" |
| Introducing GPT-5.5 | OpenAI | Apr 23, 2026 | https://openai.com/index/introducing-gpt-5-5/ | xhigh used for evals, token-efficiency vs GPT-5.4 claim |
| OpenAI GPT Model Release Timeline | hidekazu-konishi.com | Jun 19, 2026 | https://hidekazu-konishi.com/entry/openai_gpt_model_release_timeline.html | Full lineage incl. GPT-6 Astra/Sol/Luna naming and dates |
| Models — ChatGPT Learn | OpenAI (developer docs) | current | https://learn.chatgpt.com/docs/models | GPT-5.5 retirement date (Oct 14, 2026), replacement guidance |
| What's new — ChatGPT Learn | OpenAI (developer docs) | current | https://learn.chatgpt.com/docs/whats-new | Confirms GPT-5.5 retirement, GPT-5.6 Sol replacement |
| GPT-6 Sol and Luna Benchmarks Explained | Vellum | ~Sep 2026 | https://www.vellum.ai/blog/gpt-6-sol-and-luna-benchmarks-explained | Sol/Luna cost-vs-capability framing, reasoning ladder (none→max) |
| Benchmarking GPT-6 Astra | Artificial Analysis | ~Sep 2026 | https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra | Coding Agent Index scores, DeepSWE reversal (Sol > Astra), cost-per-task |
| GPT-6 Sol and Luna: Frontier Power but Lower Cost | DataCamp | ~Sep 2026 | https://www.datacamp.com/blog/gpt-6-sol-and-luna | FrontierCode/DeepSWE positioning, reasoning ladder confirmation |
| GPT-6 Astra Benchmarks Explained | Vellum | ~Sep 2026 | https://www.vellum.ai/blog/gpt-6-astra-benchmarks-explained | AutomationBench, BenchCAD, AA Intelligence Index (Astra behind Fable 5.1/Opus 5/Fable 5) |
| GPT-6 Astra: Features, Benchmarks, and Pricing | DataCamp | ~Sep 2026 | https://www.datacamp.com/blog/gpt-6-astra | OSWorld 2.0 72.6%, Terminal-Bench 4.0 57.7%, HLE-with-tools trailing Claude |
| GPT-6 Astra: A new generation of intelligence | OpenAI | Sep 3, 2026 | https://openai.com/index/gpt-6-astra/ | Terminal-bench 57.9% vs Sol 37.3% vs Fable 5.1 55.8%; low/medium/high effort test citation |
| GPT-6 Sol and Luna: Cheaper Than Astra, Not Better | vanja.io | ~Sep 2026 | https://vanja.io/gpt-6-sol-luna/ | "ultra" clarification (Codex/ChatGPT Work only, no API, no benchmark), OSWorld figure discrepancy (72.6% vs 73.5%), Sol as GPT-5.5's named replacement |
| GPT-5.1-Codex-Max vs Claude Opus 4.5 | Medium (Barnacle Goose) | Dec 9, 2025 | https://medium.com/@leucopsis/gpt-5-1-codex-max-vs-claude-opus-4-5-ad995359231b | xhigh mechanism description, ~30% fewer thinking tokens claim |
| GPT-5.1-Codex-Max vs Gemini 3 Pro | Medium (Barnacle Goose) | Dec 6, 2025 | https://medium.com/@leucopsis/gpt-5-1-codex-max-vs-gemini-3-pro-next-generation-ai-coding-titans-877cc9054345 | SWE-bench 76.5%→77.9% xhigh delta, cross-vendor SWE-bench comparison table |
| Building more with GPT-5.1-Codex-Max | OpenAI | Nov 19, 2025 | https://openai.com/index/gpt-5-1-codex-max/ | Official medium-as-daily-driver recommendation, xhigh definition, compaction methodology |
| Gemini 3.1: Features, Benchmarks, Hands-On Tests | DataCamp | Feb 19, 2026 | https://www.datacamp.com/blog/gemini-3-1 | thinking_level 4-tier confirmation (low/medium/high/max), dynamic thinking always-on |
| Developer's guide to Gemini 3.8 Flash | Google Cloud docs | current | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash | 3.8 vs 3.7 Flash benchmark table, thinking-level support table |
| Gemini 3.1 Pro Review | Medium (Barnacle Goose) | Feb 24, 2026 | https://medium.com/@leucopsis/gemini-3-1-pro-review-1403a8aa1a96 | SWE-bench Verified 80.6%, SWE-bench Pro 54.2%, Terminal-Bench 2.0 68.5% |
| Gemini 3.1 Pro: Complete Guide | ALM Corp | Feb 25, 2026 | https://almcorp.com/blog/gemini-3-1-pro-complete-guide/ | Full benchmark list, thinking_level definitions, "leads 13 of 16" claim |
| Gemini 3.1 Pro Complete Guide 2026 | NxCode | Feb 19, 2026 | https://www.nxcode.io/resources/news/gemini-3-1-pro-complete-guide-benchmarks-pricing-api-2026 | Weaknesses list (Terminal-Bench gap vs Codex), per-vendor benchmark-leadership breakdown |
| Gemini 3.1 Pro Coding Benchmarks 2026 | Git AutoReview | ~Aug 2026 | https://gitautoreview.com/blog/gemini-3-pro-code-review | Alternate Terminal-Bench figure (54.2%), Claude Opus 5/Fable 5 leaderboard context |
| Gemini 3.1 Pro | gemini3.us | current | https://gemini3.us/gemini-3.1-pro | Three-thinking-level description (Low/Medium/High), context window specs |
| Gemini 3 for developers | Google (blog.google) | Nov 18, 2025 | https://blog.google/innovation-and-ai/technology/developers-tools/gemini-3-developers/ | Introduction of thinking level parameter, Antigravity launch context |
| Google Antigravity (product site) | Google | current | https://antigravity.google/ | Product description, recent blog post list (IDE extensions, custom agents) |
| Gemini 3 Flash in Google Antigravity | Google Antigravity Blog | Dec 17, 2025 | https://antigravity.google/blog/gemini-3-flash-in-google-antigravity | Flash positioning vs Pro for IDE responsiveness |
| Google Antigravity @ I/O 2026 | Google Antigravity Blog | May 19, 2026 | https://antigravity.google/blog/google-io-2026 | Gemini 3.5 Flash beating 3.1 Pro on Terminal-Bench 2.1/GDPval-AA/MCP Atlas |
| Introducing Google Antigravity | Google Antigravity Blog | Nov 2025 | https://antigravity.google/blog/introducing-google-antigravity | Product framing (agent-first IDE, browser control) |
| Release notes — Gemini API | Google AI for Developers | current | https://ai.google.dev/gemini-api/docs/changelog | antigravity-preview-09-2026 release, deprecation of 05-2026 build, migration notes |
| What's new in Gemini 3.8 Flash | Google AI for Developers | Sep 23, 2026 | https://ai.google.dev/gemini-api/docs/latest-model | 3.8 Flash becomes Antigravity's default backing model, pricing, migration checklist |
| Deprecations — Gemini API | Google AI for Developers | current | https://ai.google.dev/gemini-api/docs/deprecations | Full model release/shutdown date table across Gemini 3.x generation |
| Gemini 3.8 Flash in Antigravity: Complete Guide | agentpedia.codes | ~Sep 2026 | https://agentpedia.codes/blog/antigravity-gemini-3-8-flash-integration-guide | Per-run model switching mechanics, thinking-levels-as-first-class-control framing |
| Gemini 3.8 Flash Model Card | Google DeepMind | current | https://deepmind.google/models/model-cards/gemini-3-8-flash/ | Knowledge cutoff (Mar 2026), safety-framework capability-level assessment |
| Gemini 3.1 Pro Model Card | Google DeepMind | current | https://deepmind.google/models/model-cards/gemini-3-1-pro/ | Confirms 3.1 Pro is based on/not a separate architecture from 3 Pro, context specs |
| Gemini 3 Pro Model Card (PDF) | Google DeepMind | Nov 2025 | https://storage.googleapis.com/deepmind-media/Model-Cards/Gemini-3-Pro-Model-Card.pdf | Deep Think introduced as an optional mode on Gemini 3 Pro |
| opencode antigravity auth fork (GitHub) | luckdevx | current | https://github.com/luckdevx/opencode-antigravity-auth-fork | Confirms Antigravity can run Claude models (Opus 4.6 thinking, low/max) alongside Gemini |
| github.com/google-gemini/gemini-cli issue #20588 | Google (GitHub) | Feb 27, 2026 | https://github.com/google-gemini/gemini-cli/issues/20588 | Gemini 3 Pro Preview shutdown date (Mar 9, 2026), gemini-pro-latest alias switch |
| Google Gemini 3 Benchmarks (Explained) | Vellum | Dec 3, 2025 | https://www.vellum.ai/blog/google-gemini-3-benchmarks | Gemini 3 Pro/Deep Think ARC-AGI-2 (31.1%/45.1%), HLE (37.5%) |
| Gemini 3 Deep Think: Reasoning Benchmarks & Complete Guide | DigitalApplied | Feb 12, 2026 | https://www.digitalapplied.com/blog/gemini-3-deep-think-reasoning-benchmarks-guide | ARC-AGI-2 84.6% claim — flagged as contradictory/unverified in §6 |
| Gemini 3 Pro Deep Think Benchmarks | BenchLM.ai | May 7, 2026 | https://benchlm.ai/models/gemini-3-pro-deep-think | Reasoning/logic ranking, limited public benchmark coverage (1 of 186 tracked) |
| Claude Haiku 4.5 Benchmarks & Pricing (Sep 2026) | BenchLM.ai | Sep 24, 2026 | https://benchlm.ai/models/claude-haiku-4-5 | Independent-leaderboard positioning caveat, coding rank #117 on that specific leaderboard |
| Claude 4.5 Benchmarks on Hugging Face | Hugging Face (community article) | Dec 22, 2025 | https://huggingface.co/blog/Laser585/claude-4-benchmarks | Opus 4.5 SWE-bench 80.9% (first model over 80%), medium-effort 76%-fewer-tokens figure |
| GPT-5.1-Codex-Max: Long-Horizon Tasks | Codex Knowledge Base | Jul 10, 2026 | https://codex.danielvaughan.com/2026/03/29/codex-max-long-horizon-tasks/ | SWE-Lancer economic-value framing, xhigh config example |
| GPT-5.1 Codex Max | ITECS | Nov 21, 2025 | https://itecsonline.com/post/chatgpt-5-1-codex-max | 77.9% SWE-bench Verified, 24hr+ session claim |
| What are GPT-5.1-Codex-Max | CometAPI | Mar 27, 2026 | https://www.cometapi.com/what-are-gpt-5-1-codex-max-and-how-to-use-it/ | Compaction mechanism description, ~30% thinking-token reduction |
| GPT-5.1 Codex-Max: Agentic Coding Complete Guide | DigitalApplied | Dec 16, 2025 | https://www.digitalapplied.com/blog/gpt-5-1-codex-max-agentic-coding-guide | SWE-Lancer figures, xhigh recommendation for hardest tasks |
| GPT-5 Codex Model Names Explained in 2026 | Verdent Guides | May 13, 2026 | https://www.verdent.ai/guides/gpt-5-codex-model-names-explained | Context-window table across Codex generations, legacy-vs-current guidance |

---

*End of R0 pack. No routing algorithm, probability, or Sideline-specific mapping has been proposed above, per the brief's constraint — this evidence should be handed to the Architect responsible for S57.1's Routing Film normalization step.*