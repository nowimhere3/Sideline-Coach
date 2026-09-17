# Game Selector UI Breadcrumb

**Status:** FUTURE UI PASS · breadcrumb only · not implementation permission

## Why this exists

The current Game selector dropdown is functionally useful but visually noisy. Each row spends horizontal space on a full green `Connected` text badge, which makes the Game names, status badges, and `Exit` actions feel uneven and reduces the amount of Game name that can be read at a glance.

## Desired direction

For the compact Game selector dropdown, prefer a **small green connection indicator on the left side of each Game row** rather than a full `Connected` text pill in every row.

Target visual structure:

`●  Game Name                                      Exit`

Where:
- the small green indicator communicates Connected state;
- Game names begin on the same alignment line and receive substantially more horizontal room;
- `Exit` remains consistently right-aligned;
- the dropdown becomes easier to scan vertically;
- status remains truthful and accessible even when text is visually compacted (for example via accessible label/title/tooltip as appropriate).

## Product principle

The selector is for choosing a Game, not repeatedly reading the word `Connected`. When several Games share the same healthy state, compact status symbolism should preserve truth while giving the primary information, the Game identity, more visual priority.

Do not remove truthful non-Connected states. Offline, Opening, Conflicted, or other decision-changing states may still require explicit text because they materially affect what the human should understand or do.

## Field observation

Observed during the Add Game human-proof pass on 2026-09-15. The current rows show full `Connected` badges between truncated Game names and the right-side `Exit` action, producing unnecessary horizontal crowding and inconsistent visual rhythm.

This breadcrumb is intentionally a UX note for a later or immediate bounded UI pass. It does not authorize unrelated Game selector redesign.
