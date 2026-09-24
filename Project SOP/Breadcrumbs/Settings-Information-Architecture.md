# Settings Information Architecture

## WHAT WAS

Settings grew as a long collection of increasingly large cards in a fixed vertical order. Mobile Live Player Terminal and AI Usage Scorecard had already established their coexistence and ownership boundaries, but the normal Settings page exposed most large families at full height.

## WHAT IS

Major Settings families now share one disclosure-card grammar. The header remains visible and keyboard-operable while the existing controls appear only when expanded.

- Game Setup uses disclosure and defaults open on first use.
- Player Terminal, Scout Intelligence, Coach Routines, Players & Providers, Time Format, and AI Usage Scorecard use disclosure and default collapsed on first use.
- Routing remains unchanged.
- Dev Mode is still the one authoritative existing boolean. The card title and explanatory copy reflect the current Dad Mode / Dev Mode state; the switch has dynamic accessible action text without a redundant visible state label.
- Player Terminal owns the Dev-only **Show sensitive terminal output on paired devices** preference. It defaults off and changes only authenticated paired-device terminal/activity presentation; it cannot relax protected-file, credential, provider-secret, Git/SSH, or local-admin boundaries.
- Each recognized family's expanded/collapsed state is remembered in frontend IndexedDB and restored when Settings is revisited. This is UI memory, distinct from product preferences and their existing persistence contracts.
- Dad can reorder every top-level Settings card using its dedicated pointer/touch drag handle. The validated full card order is separate IndexedDB UI memory; hidden Dev-only cards retain their remembered positions and return there when visible again. Newly introduced cards missing from an older saved order are preserved. Reordering uses a lifted visual drag surface (the real card, carried by the pointer) over a same-size layout placeholder; the final order is still persisted through the same IndexedDB Settings UI-memory record.
- Mobile Live Player Terminal remains the normal Player Activity / execution pipeline. AI Usage Scorecard retains its existing visibility, placement, mobile coexistence, telemetry, and refresh semantics.

## WHAT WILL BE

Preserve these questions for a future Design Council pass:

- final Settings ordering
- whether a future public product should pin some cards or restore a canonical order
- deeper grouping
- second-level disclosure for very large families
- whether Routing / Coach Routines become major expandable families
- mobile-specific Settings IA
- further cleanup as Settings continues growing
- later Remote Access product surfaces: a Dad-facing main-page action (likely **Use on Phone**) and a full **Remote Access** Settings family for pairing, devices, and revocation

## DEFINITION OF DONE BREADCRUMB

When future work materially changes one of these ownership seams:

- update the local source breadcrumb
- update this durable breadcrumb when product/architecture direction changes

Reports should not be the only source of architectural intent.
