CALGARY TIMESTAMP: <actual Calgary local timestamp at execution>
America/Edmonton

# AGENT

Claude Code
Claude Opus
High reasoning

# PRIMARY IMPLEMENTATION REPOSITORY

`C:\Users\dmcal\Documents\GitHub\SidelineCoach`

Branch:

`q2.8-multigame-field-debug`

# MISSION

Perform a BOUNDED, LOCAL-ONLY differential forensic investigation.

We have:

1. one locally known-good Game;
2. one locally failing Game.

Use the working Game as the control specimen.

Do NOT broadly re-scout Sideline Coach.

Do NOT inspect a third Game unless the evidence absolutely requires it.

Do NOT access GitHub or any remote copy of these repositories.

The local working copies are authoritative for this investigation because they may contain unpublished/dirty state.

---

# LOCAL-ONLY RULE

For this Play, use ONLY local filesystem/runtime evidence.

Do not:

* fetch GitHub;
* compare against GitHub;
* pull;
* push;
* inspect remote branches;
* assume remote state reflects local state.

The relevant Game folders are:

## KNOWN-GOOD CONTROL

`C:\Users\dmcal\Documents\GitHub\Trend and Tap Assist`

Human field evidence:

Settings
→ Coach Refresh
→ Edit
→ Add references

WORKS correctly in this Game.

This is the control specimen.

---

## KNOWN-FAILING SPECIMEN

`C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest`

Human field evidence:

Coach Source browsing / Add references FAILS here.

This repository also contains historical SidelineCoach source, which may be relevant evidence.

Do not "modernize" or repair this Game repository merely to make the test pass.

Its historical contents are useful as a failure specimen.

---

# PREVIOUS REPORT

Read first:

`REPORTS/Claude/Dev-Harness-Canonical-SidelineCoach-Source-For-Every-Game.md`

Treat it as EVIDENCE, not as a proven conclusion.

Important current status:

* Sonnet implemented `extensionBuildId` verification.
* Automated tests passed.
* Human field testing subsequently contradicted the claimed runtime closure.
* Therefore the multi-Game source-browsing defect remains OPEN.
* Remaining cause is UNKNOWN.

Do not assume the prior repair solved the actual problem.

---

# TOKEN CONSERVATION

Be surgical.

Do NOT recursively read either Game repository.

Start with only the highest-value evidence.

Likely useful areas include:

* `.vscode/`
* workspace settings/configuration
* package / extension metadata
* Sideline-related local configuration
* generated/compiled extension artifacts if relevant
* Game identity metadata
* runtime diagnostics
* exact Stadium session serving each Game
* exact extension build identity
* actual `routine.sources.browse` request/response path

Expand beyond those only when direct evidence points somewhere specific.

The purpose of having a known-good control is to avoid scanning everything.

---

# DIFFERENTIAL QUESTION

Answer:

> What material difference between local Trend and local GameTest causes Trend to receive the current Coach Source browsing behavior while GameTest does not?

Do not settle for:

> "GameTest is stale."

That is a symptom.

We need:

> WHY is GameTest allowed to execute differently from Trend when Sideline's supported development/runtime contract is supposed to make the Coach implementation common across Games?

---

# TRACE BOTH GAMES

For Trend and GameTest independently establish, using machine-observable evidence:

```text
Game workspace
↓
gameId
↓
authoritative Stadium/session
↓
actual extension implementation serving that session
↓
extensionBuildId
↓
routine.sources.browse dispatch
↓
filesystem root supplied to browse
↓
result
```

Do not infer one link merely because another looks correct.

Compare the two chains side-by-side.

---

# HIGH-VALUE CONTRADICTION

Especially investigate whether this state exists:

```text
TREND
canonical/current extension identity
+
routine.sources.browse implemented
+
browse succeeds

GAMETEST
apparently same canonical/current extension identity
+
routine.sources.browse unavailable
+
browse fails
```

If so, the previous `extensionBuildId` proof is incomplete or measuring the wrong thing.

Find exactly why.

---

# LOCAL COMPARISON

You are explicitly authorized to READ:

`C:\Users\dmcal\Documents\GitHub\Trend and Tap Assist`

and:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest`

Do not modify either Game repository.

The primary implementation repository remains:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach`

If a proper fix is narrow and belongs in SidelineCoach, you may modify SidelineCoach.

If evidence suggests Trend or GameTest themselves would need modification, STOP first and explain why.

---

# DO NOT ASK THE HUMAN TO DIAGNOSE

Do not ask the human to:

* inspect launch paths;
* compare windows;
* find PIDs;
* identify ports;
* check extension versions;
* inspect configs;
* reload random windows;
* manually determine which Stadium owns which Game.

Use runtime/local evidence yourself.

Machine exhausts its options before involving the human.

---

# DO NOT USE RELOAD AS THE EXPLANATION

The human has already performed repeated:

* Developer: Reload Window;
* Debug launches;
* browser refresh;
* browser close/reopen.

"Reload it again" is not an acceptable root cause or repair.

---

# HYPOTHESIS DISCIPLINE

Classify meaningful findings:

FACT
INFERENCE
UNKNOWN
CONTRADICTION

Possible explanations are hypotheses only.

Do not assume:

* stale compiled output;
* wrong Extension Development Host;
* duplicate Stadium;
* Game identity collision;
* wrong workspace root;
* stale browser state;
* incorrect build hashing;
* wrong RPC registration;
* old self-hosted launch config;

unless local/live evidence proves it.

Let the known-good Trend state guide the search.

---

# PREVIOUS WORK — DO NOT REDO WITHOUT REASON

Do not spend Opus usage merely reproving that:

* current canonical SidelineCoach source contains `routine.sources.browse`;
* GameTest contains historical SidelineCoach source;
* the existing host launch planner intends to use canonical `extensionDevelopmentPath`;
* the daemon Freshness Guard exists;
* an extension build ID can be transmitted.

Those facts already have evidence.

Investigate the GAP between those facts and the failed human runtime.

---

# REPAIR RULE

If you find a NARROW and PROVEN root cause:

implement the smallest correct fix in:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach`

Then add a regression test specifically recreating the discovered divergence.

Do not build another parallel freshness system unless the existing mechanism is demonstrably insufficient.

If the required fix is architecturally large:

STOP.

Do not consume the Opus window implementing a redesign.

Report:

* exact known-good state;
* exact known-bad state;
* exact causal divergence;
* exact seam requiring architecture;
* smallest recommended next Play.

---

# SUCCESS STANDARD

The investigation should ideally end with one sentence of this shape:

> Trend works because ______. GameTest fails because ______. Sideline allowed them to diverge because ______.

If repaired:

> We changed ______ so that divergence cannot occur under the supported workflow, and test ______ reproduces the former failure.

Anything weaker remains OPEN.

---

# HUMAN PROOF

Only if a repair is genuinely supported by the evidence:

1. launch using the single supported Sideline development workflow;
2. Trend and Tap Assist → Add references succeeds;
3. SidelineCoach-GameTest → Add references succeeds;
4. no per-Game repair, reinstall, or special refresh occurs between them.

Do not request additional Games in this Play.

---

# OUT OF SCOPE

Do NOT work on:

* GS3;
* GitHub repositories/remotes;
* Add Game UX;
* Remove Game;
* Game bootstrap;
* GitHub login;
* Usage Sentinel;
* Player terminals;
* Q3 architecture;
* Coach-source sync;
* unrelated UI work.

One control.

One failure specimen.

One question.

---

# VERSION CONTROL

No commit.
No push.
No pull.
No fetch.
No reset.
No clean.
No stash.

Preserve all unrelated dirty work.

---

# REPORT

Write:

`REPORTS/Claude/Opus-Local-Differential-Trend-vs-GameTest.md`

Include:

* Trend known-good observations;
* GameTest failing observations;
* concise differential table;
* exact runtime chain for both;
* what the previous Sonnet report got right;
* what remained unproven;
* causal divergence if found;
* root cause;
* implementation if any;
* regression test if any;
* smallest human proof;
* WAS / IS / WILL BE.

Final status MUST be exactly one of:

`FIXED + AUTOMATED PROOF — HUMAN PROOF PENDING`

`OPEN — ROOT CAUSE PROVEN, REPAIR DEFERRED`

`OPEN — ROOT CAUSE STILL UNKNOWN`

Never use stronger language than the evidence supports.

Final two lines exactly:

REPORT: Opus-Local-Differential-Trend-vs-GameTest.md
TIMESTAMP: <actual Calgary local timestamp, America/Edmonton>
