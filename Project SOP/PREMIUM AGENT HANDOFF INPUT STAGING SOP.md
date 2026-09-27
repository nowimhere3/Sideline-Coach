# PREMIUM AGENT HANDOFF INPUT STAGING SOP

## PURPOSE

Prevent premium agents from wasting scarce reasoning capacity searching for files, reports, research, or context that have not been explicitly staged and located.

This SOP applies whenever a handoff references reports, research packages, architecture documents, Scout results, audits, prior prompts, or any other external input.

---

# GOLDEN RULE

## STAGE FIRST. PROMPT SECOND.

Never write a premium-agent prompt that references an input until that input:

1. Actually exists.
2. Has been identified unambiguously.
3. Has been placed where the receiving agent can access it.
4. Has an exact file path.
5. Has been verified before launch.

A report name without a path is NOT a handoff.

A conceptual input that has not been converted into a file is NOT a handoff.

---

# REQUIRED WORKFLOW

## STEP 1: IDENTIFY THE REAL INPUTS

Before drafting the agent prompt, enumerate every artifact the agent will need.

For each artifact determine:

- exact source document
- correct version
- whether it already exists as a file
- whether multiple similarly named files exist
- whether it is current or stale

Do not use vague labels such as:

- "Scout report"
- "architecture report"
- "Claude research"
- "the prior package"
- "the six inputs"

unless each label resolves to exactly one physical file.

---

## STEP 2: FIND THE EXACT FILE

Every referenced artifact must have an exact path.

Example:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\R0-Research-Inputs\04-ChatGPT-Browser-Research.md`

NOT:

`ChatGPT browser report`

NOT:

`the GPT research`

NOT:

`look in REPORTS`

If the exact file cannot be identified confidently:

# STOP.

Do not guess.

Do not send the premium agent searching.

---

## STEP 3: COMPILE MISSING INPUTS

If an input exists only in:

- chat history
- pasted text
- browser output
- multiple fragments
- temporary uploads
- separate research responses

compile it into a real file BEFORE writing the final handoff prompt.

Give it a clear deterministic filename.

If several inputs belong together, create a dedicated staging folder or bundle.

Example:

`REPORTS\R0-Research-Inputs\`

The Human Head Coach should be told exactly where to place the bundle.

---

## STEP 4: VERIFY THE STAGED PACKAGE

Before drafting the final prompt, verify:

- every required file exists
- every path is correct
- filenames match the intended evidence
- stale or superseded files are excluded
- duplicate or similarly named reports are resolved
- the receiving agent has access to the location

If six inputs are claimed, six identifiable inputs must actually exist.

Count them.

Verify them.

Do not rely on memory.

---

## STEP 5: CREATE A MANIFEST WHEN MULTIPLE INPUTS EXIST

For multi-file handoffs, create or provide a manifest.

Example:

`MANIFEST.md`

The manifest should state:

- input number
- filename
- exact path
- purpose
- source / provenance
- current / stale status where relevant

This gives the receiving agent one authoritative map.

---

## STEP 6: WRITE THE PROMPT LAST

Only after staging and verification is complete should the premium-agent prompt be written.

At the very top of the prompt include:

# INPUTS

with the exact path of every required file.

Example:

`1. C:\...\00-Architecture.md`

`2. C:\...\01-Scout-Formation.md`

`3. C:\...\02-Claude-Research.md`

Never make the agent infer where something lives.

Never make the agent reconstruct the package from the repository.

---

# PREMIUM AGENT INPUT GATE

Every premium Architect prompt that depends on files must include this instruction:

> Before doing substantive reasoning, verify that every required input path exists and is readable.
>
> If ANY required input is missing or inaccessible, STOP immediately.
>
> Report the exact missing path.
>
> Do not recursively search the repository.
>
> Do not attempt to reconstruct the missing artifact.
>
> Do not spend premium reasoning capacity looking for substitute files.

---

# HUMAN HEAD COACH HANDOFF RULE

If ChatGPT cannot directly place the required files into the project:

1. Compile the required package.
2. Give the Human Head Coach a downloadable bundle.
3. Give the exact destination folder.
4. Give the expected final directory contents.
5. Wait until staging is confirmed.
6. Then provide the premium-agent prompt.

Do not reverse this order.

---

# PATH RULE

Whenever a prompt references a specific existing project artifact, provide:

**NAME + EXACT PATH**

not merely one or the other.

Bad:

`Read the R0 Scout Formation.`

Good:

`Read: C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\R0-Research-Inputs\01-Internal-Scout-Formation.md`

---

# VERSION RULE

When multiple similar artifacts exist, explicitly state which one to use and which ones NOT to use.

Example:

> USE:
> `Pasted text(20260926-132020).txt`
>
> DO NOT USE:
> `Pasted text(20260926-131659).txt`

The receiving agent must never have to infer which version is canonical.

---

# RESEARCH PACKAGE RULE

When research has been gathered across multiple agents or browsers:

Do not ask the Architect to rediscover it.

First consolidate:

`Scout internal evidence`
+
`browser research`
+
`cross-check / audit`
+
`canonical architecture`

Then stage that package.

Then hand the Architect exact paths.

The Architect's job is normalization and judgment, not filesystem archaeology.

---

# PREMIUM CAPACITY RULE

Premium reasoning capacity is an expensive project resource.

Do not spend it on:

- locating files
- guessing filenames
- searching entire REPORTS trees
- reconstructing prior conversations
- discovering which version is canonical
- gathering research that has already been completed

Cheap workers, Scouts, ChatGPT, scripts, or the Human Head Coach should prepare the field first.

Premium agents receive a prepared football.

---

# FAILURE CONDITION

If a handoff prompt contains phrases such as:

- "read these six inputs"
- "review the reports"
- "use the Scout findings"
- "consult the architecture"
- "normalize the research"

without immediately identifying the exact files and paths:

# THE HANDOFF IS NOT READY.

Do not launch the agent.

---

# FINAL PRE-LAUNCH CHECK

Before handing a premium agent the prompt, ChatGPT must be able to answer YES to all of the following:

- Do all referenced inputs physically exist?
- Do I know the exact correct version of each?
- Have I provided an exact path for each?
- Can the receiving agent access those paths?
- Have missing chat/browser artifacts been compiled into files?
- Have stale or incorrect alternatives been identified?
- Is the complete evidence package staged?
- Does the prompt contain a missing-input STOP gate?
- Am I asking the premium agent to reason rather than search?

If any answer is NO:

# DO NOT LAUNCH.

Fix the handoff first.

---

# CANONICAL SEQUENCE

**GATHER**

↓

**IDENTIFY**

↓

**COMPILE**

↓

**STAGE**

↓

**VERIFY**

↓

**MANIFEST**

↓

**WRITE PROMPT**

↓

**PREMIUM AGENT LAUNCH**

Never invert this sequence.

---

# OPERATING PRINCIPLE

**The receiving agent should never have to read the sender's mind.**

If the prompt says an input exists, the sender is responsible for making that input concrete, accessible, verified, and explicitly located before the agent is launched.