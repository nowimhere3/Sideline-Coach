Treat the attached **RUNTIME MEMORY (RM-1)** architecture as the governing cross-project diagnostic standard.

Adopt the CONTRACT and principles, not CURATION ENGIINE-specific implementation details.

First:

1. Read the full RM-1 architecture.  
2. Map its concepts onto this project's actual runtime, persistence, identity, and failure boundaries.  
3. Identify the smallest immediately useful **Tier 2 current-truth snapshot** for this project.  
4. Reuse the RM-1 envelope, vocabulary, privacy rules, freshness rules, and `Diagnostics/` reader-front-door pattern where applicable.  
5. Implement natively for this project's environment.  
6. Do NOT implement Journal, Incidents, Last-Known-Good, or additional instrumentation unless separately approved.  
7. Do NOT invent new diagnostic fields/events merely because they might someday be useful.  
8. Any addition must be justified by a real defect or investigation it would materially shorten.

Diagnostics observe. They never act.

Unknown is a valid result.

Runtime evidence is never committed.

The goal is:

**problem observed → read current diagnostics → identify likely broken boundary → inspect source only where necessary.**

Return a project-specific adoption/readiness plan before implementation.

&nbsp;