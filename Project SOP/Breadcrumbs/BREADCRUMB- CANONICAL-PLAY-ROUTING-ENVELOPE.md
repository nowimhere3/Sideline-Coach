BREADCRUMB: CANONICAL-PLAY-ROUTING-ENVELOPE (graduated in S56.0)

WAS:
AUTO could detect explicit Player/model/reasoning fields, but unresolved explicit values could collapse into "missing" and be silently replaced by inference.

IS:
AUTO treats Assistant Coach routing metadata as authoritative product data. Explicit routing is resolved deterministically from a bounded opening envelope. Explicit unresolved values never silently become inferred replacements. Only absent fields may be filled by AUTO.

WHY:
A commercial routing product cannot "hopefully" interpret routing instructions. The Assistant Coach recommendation must arrive at the Player exactly as intended or fail visibly.

WILL BE:
Future Intelligent AUTO may separately choose Players/models using performance scorecards, AI Health, role, availability, reset timing, scarcity, CONSERVE, and other evidence. That policy must remain distinct from literal Assistant Coach routing.

CODE: src/control-plane/route-constraints.ts (recognizeRouteConstraints), src/routing-policy.ts (unresolvedRouteError), src/capability-types.ts (RouteConstraints.unresolved)
REPORT: REPORTS/Claude/S56.0-Canonical-Play-Routing-Envelope-Implementation.md

EXTENDED IN S56.1 (SCOUT-DIRECTIVE-INTERCEPT):
CANONICAL ROUTING ENVELOPE + SCOUT DIRECTIVE INTERCEPT = early proof of the future control-plane normalization layer (originalPrompt / routeDirective / executionPrompt). The envelope handles structured fields; the Scout directive handles one unmistakable natural opening command and is the first place a routing directive is separated from the execution prompt.
CODE: src/control-plane/route-constraints.ts (recognizeScoutDirective, BREADCRUMB SCOUT-DIRECTIVE-INTERCEPT), src/control-plane/router.ts (executionPrompt), src/routing-policy.ts (computeScoutDirectiveRoute)
REPORT: REPORTS/Claude/S56.1-Scout-Directive-Intercept-And-Control-Play-Separation.md

EXTENDED IN S56.2 (CANONICAL-ROUTING-ALIAS-NORMALIZATION):
Structured AGENT/PLAYER/MODEL/REASONING values are normalized by canonical identity extraction (roster/catalog-backed, no synonym list, no fuzzy correction) before being declared unresolved: "Claude Code", "Claude Development Stadium" -> Claude; "Claude Sonnet 5" -> sonnet. Ambiguous, negated or misspelled values stay explicit-unresolved. Envelope (S56.0) + Scout directive (S56.1) + value normalization (S56.2) are the first three slices of the future originalPrompt -> routeDirective -> canonicalRoute -> executionPrompt ingestion layer.
CODE: src/control-plane/route-normalization.ts (BREADCRUMB CANONICAL-ROUTING-ALIAS-NORMALIZATION), src/control-plane/route-constraints.ts (resolveStructuredPlayer, resolveExplicitModel)
REPORT: REPORTS/Claude/S56.2-Canonical-Routing-Alias-Normalization.md
