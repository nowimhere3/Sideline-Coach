# Settings UI Plumbing Pass — Release Breadcrumb

## Problem

The Settings surface now contains useful product plumbing, but too much of it is permanently expanded.

Examples:

- Access
- Product Usage Telemetry
- Dev Mode
- Coach Routines
- View Player Terminal
- AI Usage Scoreboard
- future routing / alarm / team controls

These features should remain available without dominating the Settings page.

## Release Direction

Convert major Settings modules into:

**collapsed + expandable + draggable + order-persistent cards**

Reuse the existing Sideline drag-and-drop card pattern rather than introducing a second sorting system.

## Default Presentation

Cards should generally open collapsed.

Example:

`Product Usage Telemetry · OFF ▸`

Expand to reveal:

- explanation
- ON/OFF control
- telemetry preview
- refresh
- diagnostics

Likewise:

`Access · 5 capabilities ▸`

instead of permanently displaying every capability row.

## Ordering

Dad can drag Settings cards into the order that matters to him.

The chosen order persists.

No feature is removed merely because Dad moves it lower on the page.

## Access Status

Investigate current `Unknown` values.

`Unknown` must represent genuinely unresolved capability/entitlement evidence.

It must NOT mean:

- feature has never been used
- no recent Scout Play exists
- no history exists

A capability such as Scout Plays should resolve from product/runtime capability truth, not usage history.

## North Star

**Keep the plumbing available without making Dad stare at the pipes.**

Machine complexity stays underneath.
The human surface stays small.