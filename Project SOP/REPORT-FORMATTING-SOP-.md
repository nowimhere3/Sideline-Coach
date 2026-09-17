# UNIVERSAL REPORT OUTPUT & FINDABILITY SOP

## PURPOSE

A finished report should be easy to identify, easy to sort, and easy to open.

The human should never have to hunt through folders to figure out:
- which report was created;
- who created it;
- where it lives.

Keep this simple and consistent.

==================================================
1. SAVE THE REPORT IN THE CORRECT PLACE
==================================================

Save every formal report under the project's canonical Reports root.

Use the folder belonging to the agent that ACTUALLY performed the work.

Examples:

REPORTS/Claude/
REPORTS/Codex/
REPORTS/AntiGravity/
REPORTS/Scout Only/

Do not file a Claude report under Codex merely because the original prompt
was written for Codex.

==================================================
2. NAME THE FILE FOR HUMAN FINDABILITY
==================================================

The filename begins with the project-global report number, followed by a
short readable title.

FORMAT:

<NUMBER>-<REPORT-NAME>.md

Examples:

1.2-Reports-SLC-Bootstrap-And-Roster-Provider-Lanes.md
1.3-Canonical-Controlled-Play-Report-Destination-Wiring.md
2.4-Game-Setup-Folder-Controls.md

A human looking at the folder should immediately see the sequence and subject.

==================================================
3. STANDARD REPORT IDENTITY
==================================================

At the TOP of every formal report include:

REPORT TIMESTAMP:
<Calgary local timestamp>

REPORT NAME:
<human-readable report name>

REPORT NUMBER:
<project-global number>

REPORT FILE:
<exact filename>

REPORT TYPE:
<Architecture / Implementation / Forensic / Scout / Verification>

AGENT:
<actual agent/provider that produced the report>

MODEL:
<actual model, if known>

ROLE:
<Architect / Worker / Scout / Reviewer / etc.>

LOCAL SLICE / STAGE:
<stage if applicable>

Use Calgary local time:
America/Edmonton

Use MDT or MST correctly for the date.

These fields should describe what ACTUALLY happened, not merely what the
original prompt requested.

==================================================
4. KEEP THE REPORT USEFUL
==================================================

Reports are handoffs, not novels.

Include what another human or agent needs to continue:

what changed;
why;
important files;
proof/tests;
remaining problems;
human proof still needed;
next approved step.

Do not bury the result under unnecessary ceremony.

==================================================
5. REPORT FOOTER
==================================================

The ABSOLUTE LAST TWO LINES inside the Markdown report are:

REPORT NAME: <exact report name>
REPORT TIMESTAMP: <exact same Calgary timestamp used at the top>

Nothing appears after the timestamp.

==================================================
6. TERMINAL HANDOFF — REQUIRED
==================================================

After the report has been saved, the agent's terminal-facing final response
must be SHORT.

State:

RESULT:
PASS / FAIL / BLOCKED

REPORT NUMBER:
<number>

REPORT NAME:
<name>

AGENT:
<actual agent>

MODEL:
<actual model>

REPORT FILE:
<Game-relative report path>

Then, at the VERY END, print the report's exact absolute filesystem path.

The final terminal line must contain ONLY that path.

Example:

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\1.3-Canonical-Controlled-Play-Report-Destination-Wiring.md:1

When the terminal/IDE supports file links, make this path clickable.

The `:1` means open the report at line 1.

Do not put summaries, next steps, human tests, decorations, or other text
after the report path.

THE HUMAN SHOULD FINISH THE PLAY BY CLICKING THE REPORT, NOT SEARCHING FOR IT.

==================================================
7. FUTURE SIDELINE FINDABILITY
==================================================

Keep the identity fields above consistent.

Sideline Coach may later use them to search/filter reports by:

report number;
report name;
Game;
agent;
model;
report type;
stage;
timestamp.

Do not invent alternate labels for these fields from report to report.

==================================================
ONE-SENTENCE RULE
==================================================

WRITE IT → IDENTIFY IT → FILE IT CORRECTLY → END WITH A CLICKABLE PATH TO IT.