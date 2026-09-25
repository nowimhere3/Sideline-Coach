# BREADCRUMB — AUTO MODE NATURAL-LANGUAGE PLAYER / MODEL / REASONING RECOGNITION

## PRODUCT INTENT

AUTO mode must behave like an intelligent recognition engine, not a rigid command parser.

Dad should be able to type naturally into the first line of Prompt Payload and have Sideline Coach infer, resolve, and LIVE-UPDATE:

- Player / provider
- Model
- Reasoning level

without requiring exact formatting, a refresh, or a submit action.

---

## CURRENT FAILURE EXAMPLES

Observed:

`Gemini`

correctly resolves to something like:

`AntiGravity · Gemini Flash 3.8 · Low`

But changing the same first line to:

`Gemini Medium`

does NOT automatically update the reasoning level to Medium.

Similar concern applies to:

`Opus`

`Opus Medium`

`Sonnet Medium`

`Sonnett Medium`

and other natural variants.

---

## LOCKED PRODUCT EXPECTATION

In AUTO mode, first-line recognition must continuously reevaluate the entire routing tuple:

`PLAYER → MODEL → REASONING`

as the user types.

Example:

`Gemini`
→ `AntiGravity · Gemini Flash 3.8 · Low`

then, without refresh:

`Gemini Medium`
→ `AntiGravity · Gemini Flash 3.8 · Medium`

Likewise:

`Sonnet Medium`

or even:

`Sonnett Medium`

should resolve intelligently.

---

## DAD TEST

Dad does NOT need to know:

- canonical model names
- exact punctuation
- exact capitalization
- provider syntax
- internal aliases
- routing grammar

The recognition engine should tolerate ordinary human input and common misspellings.

If Dad means:

`Sonnet Medium`

Sideline Coach should understand that intent.

---

## PARTIAL DISCLOSURE

The engine must support incomplete input.

Dad may disclose only:

### MODEL

`Gemini`

### MODEL + REASONING

`Gemini Medium`

### PLAYER + MODEL

`AntiGravity Gemini`

### PLAYER + MODEL + REASONING

`AntiGravity Gemini Medium`

### REASONING ONLY

Where surrounding/current routing context makes the intended target unambiguous:

`Medium`

The resolver should use known current context where appropriate rather than requiring the entire tuple every time.

---

## FIRST-LINE PRIORITY

The FIRST LINE of Prompt Payload is a high-authority recognition surface.

If Player / Model / Reasoning intent is detectable there, AUTO mode should react immediately.

The engine may inspect broader prompt context later, but first-line recognition should be:

- fast
- deterministic where possible
- live
- visually obvious

---

## LIVE REACTIVITY

AUTO routing must update ON THE FLY.

Typing:

`Gemini`

then continuing to:

`Gemini Medium`

must cause the displayed routing decision to update immediately.

No:

- page refresh
- mode toggle
- submit
- blur requirement
- manual recalculation

Use appropriate debounce if needed, but the experience should feel live.

---

## RECOGNITION REQUIREMENTS

The resolver should eventually understand:

### PLAYER ALIASES

Examples:

`AntiGravity`
`AGY`
`Codex`
`Claude`

### MODEL FAMILIES

Examples:

`Gemini`
`Flash`
`Opus`
`Sonnet`

### REASONING LEVELS

Examples:

`Low`
`Medium`
`High`

### TYPO / ALIAS NORMALIZATION

Examples:

`Sonnett`
→ `Sonnet`

Common human spelling variations should not break recognition.

---

## FUTURE EXTENSIBILITY

More Players, providers, models, aliases, and reasoning levels WILL be added.

Do not solve this with an ever-growing pile of one-off string checks.

The eventual recognition engine should be registry/data-driven.

Conceptually:

`raw human text`
→ normalization
→ alias / fuzzy recognition
→ Player inference
→ model inference
→ reasoning inference
→ confidence / ambiguity resolution
→ canonical routing tuple

New models should mostly be added by extending recognition data, not rewriting routing logic.

---

## IMPORTANT DISTINCTION

AUTO mode should understand HUMAN INTENT.

MANUAL mode can remain explicit and deterministic.

AUTO is the intelligence layer.

The user should not need to learn Sideline Coach syntax in order to demonstrate or use Sideline Coach intelligence.

---

## ACCEPTANCE EXAMPLES

Without refresh:

`Gemini`
→ Gemini default route

`Gemini Medium`
→ same appropriate Gemini route, reasoning Medium

`Sonnet Medium`
→ appropriate Sonnet route, reasoning Medium

`Sonnett Medium`
→ same result despite typo

`Opus High`
→ appropriate Opus route, reasoning High

The displayed routing decision must visibly change as the recognized intent changes.

---

## NORTH STAR

Dad types what he means.

Sideline Coach figures out:

**WHO should play, WHICH model that means, and HOW HARD it should think.**