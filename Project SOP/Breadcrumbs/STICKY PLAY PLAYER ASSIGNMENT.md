# BREADCRUMB — STICKY PLAY PLAYER ASSIGNMENT

**Created:** 2026-09-25  
**Status:** BOOKMARK / NOT YET IMPLEMENTED

## Observed behavior

A Play in MANUAL mode appeared to lose its previously selected Player after the Player was removed/re-added, and Sideline Coach automatically assigned a default Player.

## Desired invariant

**Once a Play has a Player assignment, that assignment should persist until an explicit action changes it.**

This applies to both MANUAL and AUTO.

- MANUAL: selected Player remains assigned across refresh/navigation/reopen.
- AUTO: once AUTO assigns a Player, that assignment remains stable until new routing input explicitly changes it.
- Refresh, rerender, navigation, or unrelated roster changes must not silently reassign the Play.
- If the assigned Player is removed/unavailable, preserve the assignment identity and show the Player as unavailable rather than silently falling back to another Player.
- If that same Player is restored, reconnect the Play to that Player where identity permits.

### Core rule

**Selection is an event. Refresh is not an event.**

**AUTO automatically chooses an assignment. It does not continuously recalculate that assignment.**

Investigate persistence/source-of-truth before implementation.