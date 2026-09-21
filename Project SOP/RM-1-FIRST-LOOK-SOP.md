# RM-1 FIRST-LOOK SOP

When a Sideline Coach problem may involve runtime state, build identity,
launch state, Stadium/Control Plane state, Players, reports, paths,
configuration, or “the code says X but the machine does Y”:

1. Run:
   npm run diagnostics

2. Read:
   Diagnostics/local/CURRENT.md

3. Read in this order:
   VERDICT
   IDENTITY
   LAUNCH / SERVER / CONTROL PLANE
   PLAYERS / REPORTS
   REFERENCES as needed

4. If the snapshot is STALE, regenerate it.
   UNKNOWN remains unknown. Never guess.

5. Use RM-1 to identify the first suspicious boundary.
   Only then inspect source code around that boundary.

6. Do not ask the human to gather evidence RM-1 can gather.

7. For presentation-only, copy/text, CSS, or other clearly static work,
   RM-1 may be skipped. State briefly why it is irrelevant.

8. Every forensic or runtime-adjacent implementation report must say:
   RM-1: RUN / SKIPPED / NOT APPLICABLE
   and, when run, summarize any relevant VERDICT findings.

Diagnostics observe. They never act.